#!/usr/bin/env python3
"""Build the Singapore haze map from committed data.gov.sg PSI/PM2.5 responses.

Run scripts/fetch_haze.py first to refresh data/haze-singapore/raw.json. This
builder reads that file plus the URA planning-area boundary GeoJSON, then
writes viz/haze-singapore/index.html, the root gallery and the README row.
"""
import argparse
import json
import math
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = "haze-singapore"
RAW = ROOT / "data" / SLUG / "raw.json"
BOUNDARY = ROOT / "data" / SLUG / "boundary.geojson"
META = ROOT / "data" / SLUG / "meta.json"
TOKENS = ROOT / "design-tokens.json"
VIZ = ROOT / "viz" / SLUG / "index.html"
GALLERY = ROOT / "index.html"
README = ROOT / "README.md"
TITLE = "Singapore haze, region by region"
PSI_URL = "https://api-open.data.gov.sg/v2/real-time/api/psi"
PM25_URL = "https://api-open.data.gov.sg/v2/real-time/api/pm25"
BOUNDARY_URL = "https://data.gov.sg/datasets/d_4765db0e87b9c86336792efe8a1f7a66/view"
REGIONS = ["north", "west", "central", "east", "south"]
# PSI bands (NEA): upper bound, label. PM2.5 1-hour bands (NEA): upper bound, label.
PSI_BANDS = [(50, "Good"), (100, "Moderate"), (200, "Unhealthy"), (300, "Very unhealthy"), (None, "Hazardous")]
PM_BANDS = [(55, "Normal"), (150, "Elevated"), (250, "High"), (None, "Very high")]
BAND_COLORS = ["#2f9e6f", "#f0c93a", "#e9832b", "#c43d2f", "#5b1a4a"]
BAND_INK = ["#ffffff", "#1d1d1f", "#1d1d1f", "#ffffff", "#ffffff"]
PM_COLOR_IDX = [0, 2, 3, 4]
MAP_W = 1000


# ---------------------------------------------------------------- data ----

def load_series(raw):
    """Return hourly timestamps and per-metric, per-region value lists (None = missing)."""
    stamps = set()
    tables = {"psi": {}, "pm24": {}, "pm1": {}}
    for endpoint, fields in (("psi", (("psi", "psi_twenty_four_hourly"), ("pm24", "pm25_twenty_four_hourly"))),
                             ("pm25", (("pm1", "pm25_one_hourly"),))):
        for day in sorted(raw[endpoint]):
            for item in raw[endpoint][day]["data"]["items"]:
                stamp = item["timestamp"]
                assert stamp.endswith(":00:00+08:00"), stamp
                stamps.add(stamp)
                for key, field in fields:
                    tables[key][stamp] = item["readings"].get(field)
    order = sorted(stamps)
    for a, b in zip(order, order[1:]):
        assert hours_between(a, b) == 1, (a, b)
    series = {key: {r: [(tables[key].get(s) or {}).get(r) for s in order] for r in REGIONS} for key in tables}
    return order, series


def hours_between(a, b):
    def to_hours(stamp):
        from datetime import datetime
        return datetime.fromisoformat(stamp).timestamp() / 3600
    return round(to_hours(b) - to_hours(a))


def region_labels(raw):
    labels = {}
    for day in raw["psi"].values():
        for meta in day["data"]["regionMetadata"]:
            point = (meta["labelLocation"]["latitude"], meta["labelLocation"]["longitude"])
            assert labels.setdefault(meta["name"], point) == point
    assert set(labels) == set(REGIONS)
    return labels


def band_index(bands, value):
    for i, (upper, _) in enumerate(bands):
        if upper is None or value <= upper:
            return i


def story(order, series):
    psi = series["psi"]
    hourly_max = [max((psi[r][i] for r in REGIONS if psi[r][i] is not None), default=None) for i in range(len(order))]
    peak_i = max(range(len(order)), key=lambda i: (hourly_max[i] or -1, i))
    peak_region = max(REGIONS, key=lambda r: psi[r][peak_i] or -1)
    unhealthy = [i for i, v in enumerate(hourly_max) if v is not None and v > 100]
    days = sorted({order[i][:10] for i in unhealthy})
    return {
        "hours": len(order), "first": order[0], "last": order[-1],
        "peak_psi": hourly_max[peak_i], "peak_region": peak_region, "peak_stamp": order[peak_i], "peak_index": peak_i,
        "unhealthy_hours": len(unhealthy), "unhealthy_days": days,
        "first_unhealthy": order[unhealthy[0]] if unhealthy else None,
        "hazard_free_days": len({s[:10] for s in order}) - len(days),
        "days": len({s[:10] for s in order}),
    }


# ------------------------------------------------------------ geometry ----

def rings_of(geometry):
    return [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]


def centroid(feature):
    area = cx = cy = 0.0
    for polygon in rings_of(feature["geometry"]):
        ring = polygon[0]
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            cross = x0 * y1 - x1 * y0
            area += cross
            cx += (x0 + x1) * cross
            cy += (y0 + y1) * cross
    return cx / (3 * area), cy / (3 * area)


def simplify(points, tolerance):
    """Douglas-Peucker on an open polyline (iterative)."""
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        lo, hi = stack.pop()
        (x0, y0), (x1, y1) = points[lo], points[hi]
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1e-12
        far, far_d = None, tolerance
        for i in range(lo + 1, hi):
            d = abs(dy * (points[i][0] - x0) - dx * (points[i][1] - y0)) / length
            if d > far_d:
                far, far_d = i, d
        if far is not None:
            keep[far] = True
            stack += [(lo, far), (far, hi)]
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring, tolerance):
    """Simplify a closed ring by splitting it at the point farthest from its start."""
    far = max(range(1, len(ring) - 1), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    return simplify(ring[:far + 1], tolerance)[:-1] + simplify(ring[far:], tolerance)


def region_of(feature, labels):
    lon, lat = centroid(feature)
    return min(REGIONS, key=lambda r: (labels[r][0] - lat) ** 2 + (labels[r][1] - lon) ** 2)


def build_map(boundary, labels):
    """Group planning areas into the five PSI regions and return projected SVG paths."""
    assignment = {}
    grouped = {r: [] for r in REGIONS}
    for feature in boundary["features"]:
        region = region_of(feature, labels)
        assignment[feature["properties"]["PLN_AREA_N"].title()] = region
        grouped[region].append(feature)
    coords = [p for f in boundary["features"] for poly in rings_of(f["geometry"]) for ring in poly for p in ring]
    lon0, lon1 = min(p[0] for p in coords), max(p[0] for p in coords)
    lat0, lat1 = min(p[1] for p in coords), max(p[1] for p in coords)
    pad = 0.012
    lon0, lon1, lat0, lat1 = lon0 - pad, lon1 + pad, lat0 - pad, lat1 + pad
    # Equirectangular; at 1.35 N a degree of longitude is 99.97% of a degree of latitude.
    scale = MAP_W / ((lon1 - lon0) * math.cos(math.radians(1.35)))
    height = round((lat1 - lat0) * scale)

    def project(lon, lat):
        return ((lon - lon0) * math.cos(math.radians(1.35)) * scale, (lat1 - lat) * scale)

    paths = {}
    for region, features in grouped.items():
        parts = []
        for feature in features:
            for polygon in rings_of(feature["geometry"]):
                for ring in polygon:
                    points = simplify_ring([project(*p) for p in ring], 0.35)
                    xs = [p[0] for p in points]
                    ys = [p[1] for p in points]
                    if len(points) < 4 or (max(xs) - min(xs) < 1.5 and max(ys) - min(ys) < 1.5):
                        continue
                    parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in points[:-1]) + "Z")
        paths[region] = "".join(parts)
    # Place each region's readout at the area-weighted centre of its larger land parts, so the text sits inside the region.
    label_xy = {}
    for region, features in grouped.items():
        area = cx = cy = 0.0
        for feature in features:
            for polygon in rings_of(feature["geometry"]):
                ring = polygon[0]
                a = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:])) / 2
                if abs(a) < 4e-4:
                    continue
                gx, gy = centroid({"geometry": {"type": "Polygon", "coordinates": [ring]}})
                area, cx, cy = area + abs(a), cx + gx * abs(a), cy + gy * abs(a)
        label_xy[region] = [round(v, 1) for v in project(cx / area, cy / area)]
    km = 10 / 111.32 * math.cos(math.radians(1.35)) * scale / math.cos(math.radians(1.35))
    return {"width": MAP_W, "height": height, "paths": paths, "labels": label_xy, "scale_10km": round(km, 1),
            "assignment": assignment}


# ------------------------------------------------------------- render ----

CSS = """
:root{--bg:__background__;--fg:__foreground__;--muted:__secondary__;--surface:__surface__;--border:__border__;--focus:__focus__;--mark:__mark__;--selected:__selected__;--radius:__radius__;--sans:__font_sans__;--mono:__font_mono__;color-scheme:light}
*{box-sizing:border-box}html{font-family:var(--sans);line-height:1.5}body{margin:0;background:var(--bg);color:var(--fg)}
a{color:inherit;text-underline-offset:.18em}button,input,select{font:inherit;color:inherit}button{cursor:pointer}
:focus-visible{outline:.125rem solid var(--focus);outline-offset:.125rem}
.skip{position:fixed;left:1rem;top:1rem;transform:translateY(-250%);z-index:10;background:var(--fg);color:var(--bg);padding:.5rem .75rem;border-radius:var(--radius)}.skip:focus{transform:none}
header,main,footer{width:min(calc(100% - 2rem),__content_width__);margin:auto}
header{padding:clamp(1.5rem,5vw,2.75rem) 0 1rem}
h1{max-width:26ch;margin:0 0 .6rem;font-size:clamp(1.85rem,5.4vw,3.5rem);line-height:1.06;letter-spacing:-.04em}
.lede{max-width:56rem;margin:0;color:var(--muted)}
.controls{display:flex;flex-wrap:wrap;gap:.6rem 1.25rem;align-items:center;padding:.9rem 0;border-top:1px solid var(--border)}
.seg{display:inline-flex;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.seg button{min-height:2.5rem;padding:.35rem .8rem;border:0;background:var(--bg);font-size:.9rem}
.seg button+button{border-left:1px solid var(--border)}.seg button[aria-pressed=true]{background:var(--fg);color:var(--bg)}
.btn{min-height:2.5rem;padding:.35rem .9rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);font-size:.9rem}.btn:hover{background:var(--surface)}
.btn.play{min-width:6.5rem;background:var(--fg);color:var(--bg);border-color:var(--fg);font-weight:600}
.spacer{flex:1}
.layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(16rem,1fr);gap:1.5rem;align-items:start}
.stage{position:relative;min-width:0}
.mapwrap{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);overflow:hidden}
svg#map{display:block;width:100%;height:auto;touch-action:manipulation}
.sea{fill:var(--surface)}.reg{stroke:none;transition:fill .12s linear}.seam{fill:none;stroke:#fff;stroke-opacity:.55;stroke-width:.6;pointer-events:none}
.hit{fill:transparent;cursor:pointer;outline:none}
.hl{pointer-events:none;opacity:0}.on .hl{opacity:1}
.rname,.rval,.rband{paint-order:stroke;stroke-linejoin:round}.rname{font:600 15px var(--sans);letter-spacing:.06em;text-transform:uppercase;pointer-events:none;stroke-width:4px}
.rval{font:700 34px var(--sans);letter-spacing:-.02em;pointer-events:none;stroke-width:6px}
.rband{font:600 13px var(--sans);pointer-events:none;stroke-width:4px}
.scale line{stroke:var(--fg);stroke-width:2}.scale text{fill:var(--muted);font:12px var(--mono)}
.tip{position:absolute;z-index:3;width:17.5rem;max-width:calc(100% - .5rem);padding:.7rem .8rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);box-shadow:0 .4rem 1.4rem #0002;pointer-events:none;font-size:.85rem}
.tip strong{display:block;font-size:.95rem}.tip dl{margin:.4rem 0 0;display:grid;grid-template-columns:1fr auto;gap:.15rem .75rem}.tip dt{color:var(--muted)}.tip dd{margin:0;font:600 .85rem var(--mono);text-align:right}
.panel{min-width:0}
.now{margin:0;font-size:clamp(1.3rem,3vw,1.75rem);font-weight:700;letter-spacing:-.02em}.nowsub{margin:.1rem 0 .9rem;color:var(--muted);font:12px var(--mono)}
.rows{list-style:none;margin:0;padding:0;border-top:1px solid var(--border)}
.rows li{border-bottom:1px solid var(--border)}
.row{display:grid;grid-template-columns:.9rem 1fr auto;gap:.2rem .7rem;align-items:center;width:100%;padding:.55rem .35rem;border:0;background:none;text-align:left}
.row:hover,.row[aria-pressed=true]{background:var(--surface)}
.sw{width:.9rem;height:.9rem;border-radius:50%;border:1px solid #0003}.rn{font-weight:600}.rv{font:700 1.15rem var(--mono);text-align:right}.rb{grid-column:2/4;color:var(--muted);font-size:.8rem;margin-top:-.25rem}
.legend{display:flex;flex-wrap:wrap;gap:.35rem 1rem;margin:1rem 0 0;padding:0;list-style:none;font-size:.82rem}
.legend li{display:flex;gap:.4rem;align-items:center}.legend i{width:.9rem;height:.9rem;border-radius:.2rem;border:1px solid #0003;flex:none}.legend span{color:var(--muted);font-family:var(--mono);font-size:.75rem}
.timeline{margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border)}
.tl{display:grid;grid-template-columns:4.2rem minmax(0,1fr);column-gap:.5rem;align-items:center}
.months{grid-column:2;position:relative;height:1.2rem;font:11px var(--mono);color:var(--muted)}.months span{position:absolute;top:0;white-space:nowrap}
.rl{font:11px var(--mono);color:var(--muted);text-align:right;line-height:.8rem}
.rowlabels{display:grid;grid-template-rows:repeat(5,.8rem);gap:1px}
.stripwrap{position:relative;cursor:ew-resize;touch-action:none;border-radius:.25rem;overflow:hidden;border:1px solid var(--border)}
svg#strip{display:block;width:100%;height:calc(5*.8rem + 4px)}
.cursor{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--fg);pointer-events:none;box-shadow:0 0 0 1px #fff}
.slider{grid-column:2;width:100%;margin:.4rem 0 0;accent-color:var(--fg);height:2rem}
.tlnote{grid-column:2;margin:0;font-size:.78rem;color:var(--muted)}
.method{margin:1.5rem 0 0;padding:1rem 0 0;border-top:1px solid var(--border);color:var(--muted);font-size:.88rem;max-width:62rem}.method p{margin:.4rem 0}
details{margin:1rem 0 0}summary{cursor:pointer;font-weight:600;font-size:.9rem}
.tablewrap{max-height:24rem;overflow:auto;margin-top:.6rem;border:1px solid var(--border);border-radius:var(--radius)}
table{width:100%;border-collapse:collapse;font:12px var(--mono)}th,td{padding:.3rem .6rem;text-align:right;border-bottom:1px solid var(--border)}th:first-child,td:first-child{text-align:left}thead th{position:sticky;top:0;background:var(--surface)}
footer{padding:1.25rem 0 2.5rem;margin-top:1.5rem;border-top:1px solid var(--border);color:var(--muted);font-size:.8rem}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(max-width:820px){.tip{position:static;width:auto;max-width:none;margin-top:.5rem;box-shadow:none}.layout{grid-template-columns:minmax(0,1fr)}.rname{font-size:17px}.rval{font-size:40px}.rband{font-size:15px}.tl{grid-template-columns:3.2rem minmax(0,1fr)}.rl{font-size:10px}}
@media(prefers-reduced-motion:reduce){.reg{transition:none}}
"""

JS = r"""
const D=__DATA__,MAP=__MAP__,BANDS=__BANDS__;
const NS="http://www.w3.org/2000/svg",R=D.regions,N=D.n,T0=Date.parse(D.start);
const $=s=>document.querySelector(s),el=(n,a={},p)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);if(p)p.append(e);return e};
const cap=s=>s[0].toUpperCase()+s.slice(1);
const METRICS={psi:{name:"PSI (24-hour)",key:"psi",bands:BANDS.psi,unit:""},pm1:{name:"PM2.5 (1-hour)",key:"pm1",bands:BANDS.pm,unit:" µg/m³"}};
let metric="psi",t=D.peak,sel=null,timer=null,speed=96,last=0;
const val=(m,r,i)=>D.m[m][r][i];
function bandOf(m,v){if(v==null)return null;const b=METRICS[m].bands;for(let i=0;i<b.length;i++)if(b[i].max==null||v<=b[i].max)return i;}
const bandColor=(m,i)=>i==null?"#d2d2d7":METRICS[m].bands[i].color, bandInk=(m,i)=>i==null?"#1d1d1f":METRICS[m].bands[i].ink;
const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function sgt(i){const d=new Date(T0+i*36e5+8*36e5);return{dow:DAYS[d.getUTCDay()],d:d.getUTCDate(),mon:MON[d.getUTCMonth()],y:d.getUTCFullYear(),h:String(d.getUTCHours()).padStart(2,"0"),iso:d.toISOString().slice(0,10)}}
const fmt=i=>{const s=sgt(i);return `${s.dow} ${s.d} ${s.mon} ${s.y}, ${s.h}:00`};
const fmtDay=i=>{const s=sgt(i);return `${s.d} ${s.mon}`};

/* map */
const svg=$("#map"),defs=svg.querySelector("defs"),gReg=el("g",{},svg),gSeam=el("g",{},svg),gEdge=el("g",{},svg),gHl=el("g",{},svg),gTxt=el("g",{},svg),gHit=el("g",{},svg);
const regEl={},txt={},hlEl={},hitEl={};
R.forEach(r=>{
  const id="p-"+r;el("path",{id,d:MAP.paths[r],"fill-rule":"evenodd"},defs);
  regEl[r]=el("use",{href:"#"+id,class:"reg"},gReg);
  el("use",{href:"#"+id,class:"seam"},gSeam);
  el("use",{href:"#"+id,filter:"url(#edge)"},gEdge);
  hlEl[r]=el("g",{},gHl);el("use",{href:"#"+id,class:"hl",filter:"url(#hledge)"},hlEl[r]);
  const [x,y]=MAP.labels[r],g=el("g",{},gTxt);
  txt[r]={name:el("text",{x,y:y-22,"text-anchor":"middle",class:"rname"},g),val:el("text",{x,y:y+12,"text-anchor":"middle",class:"rval"},g),band:el("text",{x,y:y+34,"text-anchor":"middle",class:"rband"},g)};
  txt[r].name.textContent=r;
  hitEl[r]=el("use",{href:"#"+id,class:"hit",tabindex:"0",role:"button"},gHit);
  hitEl[r].addEventListener("pointerenter",e=>{if(e.pointerType==="mouse")showTip(r,e)});
  hitEl[r].addEventListener("pointermove",e=>{if(e.pointerType==="mouse")showTip(r,e)});
  hitEl[r].addEventListener("pointerleave",e=>{if(e.pointerType==="mouse"&&sel!==r)hideTip()});
  hitEl[r].addEventListener("focus",()=>showTip(r));
  hitEl[r].addEventListener("blur",()=>{if(sel!==r)hideTip()});
  hitEl[r].addEventListener("click",e=>{select(sel===r?null:r,e)});
  hitEl[r].addEventListener("keydown",e=>{if(e.key==="Escape"){select(null);hideTip()}});
});
const sc=el("g",{class:"scale",transform:`translate(30,${MAP.height-28})`},svg);
el("line",{x1:0,x2:MAP.scale_10km,y1:0,y2:0},sc);el("line",{x1:0,x2:0,y1:-5,y2:5},sc);el("line",{x1:MAP.scale_10km,x2:MAP.scale_10km,y1:-5,y2:5},sc);
const st=el("text",{x:MAP.scale_10km/2,y:-10,"text-anchor":"middle"},sc);st.textContent="10 km";

/* readout */
const rows=$("#rows"),rowEl={};
R.forEach(r=>{const li=document.createElement("li"),b=document.createElement("button");b.className="row";b.type="button";
  b.innerHTML='<i class="sw"></i><span class="rn"></span><span class="rv"></span><span class="rb"></span>';
  b.addEventListener("click",e=>select(sel===r?null:r,e));li.append(b);rows.append(li);rowEl[r]=b});
const tip=$("#tip"),stage=$(".stage");
function tipHtml(r){const i=t,pv=val("psi",r,i),p1=val("pm1",r,i),p24=val("pm24",r,i),bp=bandOf("psi",pv);
  return `<strong>${cap(r)} · ${fmt(i)}</strong><dl><dt>PSI (24-hour)</dt><dd>${pv==null?"–":pv+" "+BANDS.psi[bp].label}</dd><dt>PM2.5 (1-hour)</dt><dd>${p1==null?"–":p1+" µg/m³"}</dd><dt>PM2.5 (24-hour)</dt><dd>${p24==null?"–":p24+" µg/m³"}</dd></dl>`}
function showTip(r,e){tip.innerHTML=tipHtml(r);tip.hidden=false;tip.dataset.r=r;placeTip(r,e)}
function placeTip(r,e){const s=stage.getBoundingClientRect(),m=$("#map").getBoundingClientRect(),[lx,ly]=MAP.labels[r];
  let x,y;if(e&&e.clientX!=null&&e.pointerType==="mouse"){x=e.clientX-s.left+14;y=e.clientY-s.top+14}else{x=m.left-s.left+lx/MAP.width*m.width+14;y=m.top-s.top+ly/MAP.height*m.height+30}
  x=Math.max(2,Math.min(x,s.width-tip.offsetWidth-2));y=Math.max(2,Math.min(y,s.height-tip.offsetHeight-2));tip.style.left=x+"px";tip.style.top=y+"px"}
function hideTip(){tip.hidden=true;delete tip.dataset.r}
function select(r,e){sel=r;R.forEach(x=>{hlEl[x].classList.toggle("on",x===r);rowEl[x].setAttribute("aria-pressed",x===r)});if(r)showTip(r,e&&e.pointerType==="mouse"?e:undefined);else hideTip()}

function render(){
  const m=metric,M=METRICS[m],s=sgt(t);
  $("#now").textContent=fmt(t);
  $("#nowsub").textContent=`${M.name} · hour ${t+1} of ${N}`;
  R.forEach(r=>{const v=val(m,r,t),b=bandOf(m,v),c=bandColor(m,b),ink=bandInk(m,b);
    regEl[r].style.fill=c;
    for(const k of ["name","val","band"]){txt[r][k].style.fill=ink;txt[r][k].style.stroke=c}
    txt[r].val.textContent=v==null?"–":v;txt[r].band.textContent=b==null?"no data":M.bands[b].label;
    const row=rowEl[r];row.querySelector(".sw").style.background=c;row.querySelector(".rn").textContent=cap(r);
    row.querySelector(".rv").textContent=v==null?"–":v+M.unit;row.querySelector(".rb").textContent=b==null?"No reading":M.bands[b].label+" · "+M.bands[b].range;
    hitEl[r].setAttribute("aria-label",`${cap(r)}: ${M.name} ${v==null?"no reading":v+" "+M.bands[b].label}, ${fmt(t)}`);
  });
  const slider=$("#slider");slider.value=t;slider.setAttribute("aria-valuetext",fmt(t));
  $("#cursor").style.left=((t+.5)/N*100)+"%";
  if(!tip.hidden)tip.innerHTML=tipHtml(tip.dataset.r);
}

/* legend */
function drawLegend(){$("#legend").innerHTML=METRICS[metric].bands.map(b=>`<li><i style="background:${b.color}"></i>${b.label} <span>${b.range}</span></li>`).join("")+'<li><i style="background:#d2d2d7"></i>No reading</li>'}

/* strip: daily peak per region */
const dayStart=[];for(let i=0;i<N;i++)if(i===0||sgt(i).iso!==sgt(i-1).iso)dayStart.push(i);
const strip=$("#strip");
function drawStrip(){strip.replaceChildren();const nd=dayStart.length,w=100/nd;
  R.forEach((r,ri)=>{dayStart.forEach((d0,di)=>{const d1=di+1<nd?dayStart[di+1]:N;let mx=null;for(let i=d0;i<d1;i++){const v=val(metric,r,i);if(v!=null&&(mx==null||v>mx))mx=v}
    el("rect",{x:(di*w)+"%",y:ri*(.8*16)+"px",width:(w+.05)+"%",height:(.8*16-1)+"px",fill:bandColor(metric,bandOf(metric,mx))},strip)})});
  const months=$("#months");months.replaceChildren();dayStart.forEach((d0,di)=>{const s=sgt(d0);if(s.d===1||di===0){const sp=document.createElement("span");sp.style.left=(di/nd*100)+"%";sp.textContent=s.mon+(s.mon==="Jan"?" "+s.y:"");months.append(sp)}})}
const rl=$("#rowlabels");R.forEach(r=>{const d=document.createElement("div");d.className="rl";d.textContent=r;rl.append(d)});

/* transport */
function setT(i,stop){t=Math.max(0,Math.min(N-1,Math.round(i)));if(stop)pause();render()}
const slider=$("#slider");slider.max=N-1;slider.addEventListener("input",()=>setT(+slider.value,true));
const sw=$(".stripwrap");let drag=false;
const fromX=e=>{const b=sw.getBoundingClientRect();return Math.min(N-1,Math.max(0,(e.clientX-b.left)/b.width*N))};
sw.addEventListener("pointerdown",e=>{drag=true;sw.setPointerCapture(e.pointerId);setT(fromX(e),true)});
sw.addEventListener("pointermove",e=>{if(drag)setT(fromX(e),true)});
sw.addEventListener("pointerup",()=>drag=false);sw.addEventListener("pointercancel",()=>drag=false);
const play=$("#play");
function pause(){if(timer){cancelAnimationFrame(timer);timer=null}play.textContent="▶ Play";play.setAttribute("aria-pressed","false")}
function tick(now){const dt=Math.min(now-last,100)/1000;last=now;acc+=dt*speed;const step=Math.floor(acc);acc-=step;if(step){t=Math.min(N-1,t+step);render()}if(t>=N-1){pause();return}timer=requestAnimationFrame(tick)}
let acc=0;
play.addEventListener("click",()=>{if(timer){pause();return}if(t>=N-1)t=0;play.textContent="❚❚ Pause";play.setAttribute("aria-pressed","true");last=performance.now();acc=0;timer=requestAnimationFrame(tick)});
document.querySelectorAll("[data-speed]").forEach(b=>b.addEventListener("click",()=>{speed=+b.dataset.speed;document.querySelectorAll("[data-speed]").forEach(x=>x.setAttribute("aria-pressed",x===b))}));
document.querySelectorAll("[data-metric]").forEach(b=>b.addEventListener("click",()=>{metric=b.dataset.metric;document.querySelectorAll("[data-metric]").forEach(x=>x.setAttribute("aria-pressed",x===b));drawLegend();drawStrip();render()}));
$("#peak").addEventListener("click",()=>setT(D.peak,true));
$("#start").addEventListener("click",()=>setT(0,true));
document.addEventListener("keydown",e=>{if(e.target.matches("input,select,textarea"))return;if(e.key===" "&&e.target.matches("body")){e.preventDefault();play.click()}});

/* table alternative */
(function(){const tb=$("#tbody");dayStart.forEach((d0,di)=>{const d1=di+1<dayStart.length?dayStart[di+1]:N;const tr=document.createElement("tr");const s=sgt(d0);tr.innerHTML=`<td>${s.dow} ${s.d} ${s.mon}</td>`+R.map(r=>{let mx=null;for(let i=d0;i<d1;i++){const v=val("psi",r,i);if(v!=null&&(mx==null||v>mx))mx=v}return `<td>${mx==null?"–":mx}</td>`}).join("");tb.append(tr)})})();

drawLegend();drawStrip();select(null);render();

/* agent tools */
const result=v=>({content:[{type:"text",text:JSON.stringify(v)}]}),mc=(typeof document!=="undefined"&&document.modelContext)||(typeof navigator!=="undefined"&&navigator.modelContext);
const cols=["timestamp",...R.map(r=>"psi_"+r),...R.map(r=>"pm25_1h_"+r)];
const rowAt=i=>[new Date(T0+i*36e5).toISOString(),...R.map(r=>val("psi",r,i)),...R.map(r=>val("pm1",r,i))];
mc?.registerTool({name:"get_data",description:"Return hourly 24-hour PSI and 1-hour PM2.5 for the five NEA regions. Optional start and end are ISO dates (SGT); at most 500 rows are returned.",inputSchema:{type:"object",properties:{start:{type:"string"},end:{type:"string"}},additionalProperties:false},annotations:{readOnlyHint:true},async execute(a={}){const out=[];for(let i=0;i<N&&out.length<500;i++){const d=sgt(i).iso;if((a.start&&d<a.start)||(a.end&&d>a.end))continue;out.push(rowAt(i))}return result({columns:cols,rows:out,total:out.length,truncated:out.length>=500,next_steps:["Narrow start/end to page through the six months."]})}});
mc?.registerTool({name:"get_metadata",description:"Return the headline, sources, method and caveats.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},async execute(){return result(__META__)}});
mc?.registerTool({name:"query",description:"Return readings for one region, optionally limited to hours at or above a PSI threshold.",inputSchema:{type:"object",properties:{filter:{type:"object",properties:{region:{type:"string",enum:R},min_psi:{type:"number"}},additionalProperties:false}},additionalProperties:false},annotations:{readOnlyHint:true},async execute(a={}){const f=a.filter||{},rs=f.region?[f.region]:R,out=[];for(let i=0;i<N&&out.length<500;i++)for(const r of rs){const v=val("psi",r,i);if(v!=null&&(f.min_psi==null||v>=f.min_psi))out.push([new Date(T0+i*36e5).toISOString(),r,v,val("pm1",r,i),val("pm24",r,i)])}return result({columns:["timestamp","region","psi_24h","pm25_1h","pm25_24h"],rows:out,total:out.length,truncated:out.length>=500,next_steps:["Raise min_psi or pick one region to narrow the result."]})}});
"""

BODY = """<a class="skip" href="#map">Skip to map</a>
<header><h1>__HEADLINE__</h1><p class="lede">__LEDE__</p></header>
<main id="main">
<div class="controls" role="group" aria-label="Map controls">
<div class="seg" role="group" aria-label="Measure"><button type="button" data-metric="psi" aria-pressed="true">PSI (24-hour)</button><button type="button" data-metric="pm1" aria-pressed="false">PM2.5 (1-hour)</button></div>
<button class="btn play" id="play" type="button" aria-pressed="false">▶ Play</button>
<div class="seg" role="group" aria-label="Playback speed"><button type="button" data-speed="24" aria-pressed="false">1 day/s</button><button type="button" data-speed="96" aria-pressed="true">4 days/s</button><button type="button" data-speed="240" aria-pressed="false">10 days/s</button></div>
<span class="spacer"></span>
<button class="btn" id="start" type="button">First hour</button><button class="btn" id="peak" type="button">Jump to peak</button>
</div>
<section class="layout" aria-label="Haze map of Singapore">
<div class="stage"><div class="mapwrap"><svg id="map" viewBox="0 0 __W__ __H__" role="group" aria-label="Map of Singapore in five PSI regions coloured by haze level"><title>Singapore PSI regions coloured by haze level</title><defs><filter id="edge" filterUnits="userSpaceOnUse" x="0" y="0" width="__W__" height="__H__"><feMorphology in="SourceAlpha" operator="dilate" radius="1.4" result="d"/><feComposite in="d" in2="SourceAlpha" operator="out" result="o"/><feFlood flood-color="#ffffff" result="w"/><feComposite in="w" in2="o" operator="in"/></filter><filter id="hledge" filterUnits="userSpaceOnUse" x="0" y="0" width="__W__" height="__H__"><feMorphology in="SourceAlpha" operator="dilate" radius="3" result="d"/><feComposite in="d" in2="SourceAlpha" operator="out" result="o"/><feFlood flood-color="#1d1d1f" result="w"/><feComposite in="w" in2="o" operator="in"/></filter></defs></svg></div>
<div id="tip" class="tip" hidden></div></div>
<aside class="panel" aria-label="Readings at the selected hour"><p class="now" id="now" aria-live="polite"></p><p class="nowsub" id="nowsub"></p><ul class="rows" id="rows"></ul><ul class="legend" id="legend" aria-label="Legend"></ul></aside>
</section>
<section class="timeline" aria-label="Timeline">
<div class="tl"><div class="months" id="months" aria-hidden="true"></div>
<div class="rowlabels" id="rowlabels" aria-hidden="true"></div>
<div class="stripwrap" title="Drag or tap to move through time"><svg id="strip" aria-hidden="true"></svg><div class="cursor" id="cursor"></div></div>
<input class="slider" id="slider" type="range" min="0" max="1" step="1" value="0" aria-label="Hour of the day range shown on the map">
<p class="tlnote">Each column is one day; each row is a region, coloured by its highest reading that day. Drag the strip or the slider, or press Play.</p></div>
</section>
<details><summary>Daily peak PSI as a table</summary><div class="tablewrap"><table><caption class="vh">Highest 24-hour PSI per region each day</caption><thead><tr><th scope="col">Day</th>__TH__</tr></thead><tbody id="tbody"></tbody></table></div></details>
<div class="method">__METHOD__</div>
</main>
<footer>__FOOTER__</footer>"""


def format_band_range(bands, i):
    lo = 0 if i == 0 else bands[i - 1][0] + 1
    hi = bands[i][0]
    return f"{lo}+" if hi is None else f"{lo}–{hi}"


def band_payload():
    psi = [{"max": upper, "label": label, "color": BAND_COLORS[i], "ink": BAND_INK[i], "range": format_band_range(PSI_BANDS, i)}
           for i, (upper, label) in enumerate(PSI_BANDS)]
    pm = [{"max": upper, "label": label, "color": BAND_COLORS[PM_COLOR_IDX[i]], "ink": BAND_INK[PM_COLOR_IDX[i]],
           "range": format_band_range(PM_BANDS, i)} for i, (upper, label) in enumerate(PM_BANDS)]
    return {"psi": psi, "pm": pm}


def long_date(stamp):
    from datetime import date
    d = date.fromisoformat(stamp[:10])
    return f"{d.day} {d.strftime('%B %Y')}"


def render(model, meta, tokens):
    s, series, geo = model["story"], model["series"], model["map"]
    colors = tokens["colors"]
    css = CSS
    for key, value in {**colors, "radius": tokens["radius"], "font_sans": tokens["font_sans"],
                       "font_mono": tokens["font_mono"], "content_width": tokens["content_width"]}.items():
        css = css.replace(f"__{key}__", value)
    data = {"start": s["first"], "n": s["hours"], "regions": REGIONS, "peak": s["peak_index"],
            "m": {key: {r: series[key][r] for r in REGIONS} for key in series}}
    map_json = {k: geo[k] for k in ("width", "height", "paths", "labels", "scale_10km")}
    headline, lede = s["headline"], s["lede"]
    th = "".join(f'<th scope="col">{r.title()}</th>' for r in REGIONS)
    footer = (f'Sources: <a href="{PSI_URL}">NEA PSI</a> and <a href="{PM25_URL}">PM2.5</a> real-time readings via data.gov.sg; '
              f'<a href="{BOUNDARY_URL}">URA Master Plan 2019 planning-area boundary</a> (Singapore Open Data Licence). '
              f'Retrieved {meta["fetched"]}.')
    body = (BODY.replace("__HEADLINE__", escape(headline)).replace("__LEDE__", escape(lede))
            .replace("__W__", str(geo["width"])).replace("__H__", str(geo["height"]))
            .replace("__TH__", th).replace("__METHOD__", s["method_html"]).replace("__FOOTER__", footer))
    js = (JS.replace("__DATA__", json.dumps(data, separators=(",", ":")))
          .replace("__MAP__", json.dumps(map_json, separators=(",", ":")))
          .replace("__BANDS__", json.dumps(band_payload(), separators=(",", ":")))
          .replace("__META__", json.dumps({"title": TITLE, "claim": headline, "sources": meta["sources"], "method": s["method_text"],
                                          "fetched": meta["fetched"], "coverage": meta["coverage"], "caveat": s["caveat"]},
                                         ensure_ascii=False)))
    js = js.replace("</", "<\\/")
    return (f'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<link rel="icon" href="data:,"><meta name="description" content="{escape(s["description"])}"><title>{escape(TITLE)}</title>'
            f'<style>{css}</style></head><body>{body}<script>{js}</script></body></html>\n')


def render_gallery():
    cards = []
    for page in sorted((ROOT / "viz").glob("*/index.html")):
        html = page.read_text()
        title = re.search(r"<title>(.*?)</title>", html, re.S)
        summary = re.search(r'<meta name="description" content="(.*?)">', html, re.S)
        if not title or not summary:
            continue
        slug = page.parent.name
        meta = json.loads((ROOT / "data" / slug / "meta.json").read_text())
        cards.append(f'<article><h2><a href="viz/{slug}/index.html">{title.group(1)}</a></h2><p>{summary.group(1)}</p><small>Source date: {escape(meta["fetched"])}</small></article>')
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Visuals</title><style>body{{max-width:45rem;margin:3rem auto;padding:0 1rem;font:16px/1.6 system-ui;color:#1d1d1f}}a{{color:inherit;text-underline-offset:.18em}}article{{padding:1.5rem 0;border-top:1px solid #d2d2d7}}h1,h2{{line-height:1.2}}</style></head><body><main><h1>Visuals</h1><p>Standalone, source-backed data visualizations.</p>{''.join(cards)}</main></body></html>\n'''


README_ROW = f"| `{SLUG}` | `scripts/build_haze_singapore.py` | TITLE_PLACEHOLDER |"


def render_readme(current):
    row = README_ROW.replace("TITLE_PLACEHOLDER", "Where and when Singapore's air turned hazy")
    lines = [ln for ln in current.splitlines() if not ln.startswith(f"| `{SLUG}` |")]
    start = next(i for i, ln in enumerate(lines) if ln.startswith("| Slug | Builder | Story |")) + 2
    end = start
    while end < len(lines) and lines[end].startswith("| `"):
        end += 1
    rows = sorted(lines[start:end] + [row], key=lambda ln: ln.split("`")[1])
    return "\n".join(lines[:start] + rows + lines[end:]) + "\n"


# --------------------------------------------------------------- main ----

def build_model(raw, boundary):
    order, series = load_series(raw)
    labels = region_labels(raw)
    model = {"order": order, "series": series, "story": story(order, series), "map": build_map(boundary, labels), "labels": labels}
    model["story"].update(compose(model))
    return model


def compose(model):
    """Editorial text derived from the numbers, so a refresh rewrites the claim."""
    s = model["story"]
    series, order = model["series"], model["order"]
    psi = series["psi"]
    assert s["first_unhealthy"], "no hour above PSI 100: the headline template needs rewriting"
    hours = {r: sum(1 for v in psi[r] if v is not None and v > 100) for r in REGIONS}
    worst = max(REGIONS, key=lambda r: hours[r])
    least = min(REGIONS, key=lambda r: hours[r])
    first_i = order.index(s["first_unhealthy"])
    before = max(v for r in REGIONS for v in psi[r][:first_i] if v is not None)
    first_day = long_date(s["first_unhealthy"]).rsplit(" ", 1)[0]
    month = long_date(s["first_unhealthy"]).split(" ")[1]
    n_days = len(s["unhealthy_days"])
    peak_region = s["peak_region"].title()
    peak_when = f"{s['peak_stamp'][11:16]} on {long_date(s['peak_stamp']).rsplit(' ', 1)[0]}"
    headline = f"Haze hit Singapore in {month}: {n_days} days above PSI 100, peaking at {s['peak_psi']} in {peak_region}"
    lede = (f"From {long_date(order[0])} to {first_day}, no region’s 24-hour PSI passed 100 (the highest was {before}). Since then at least one region has been Unhealthy "
            f"(above 100) in {s['unhealthy_hours']} of {s['hours']:,} hours. {worst.title()} was Unhealthy for {hours[worst]} of them, {least.title()} for only {hours[least]}. "
            f"The peak, PSI {s['peak_psi']} in {peak_region} at {peak_when}, is "
            f"{'the latest reading in the data' if s['peak_index'] == s['hours'] - 1 else 'shown when you open the page'}.")
    return {
        "headline": headline, "lede": lede,
        "description": (f"Hourly PSI and PM2.5 for Singapore’s five regions from {long_date(order[0])} to {long_date(order[-1])}: "
                        f"no PSI above 100 until {first_day}, then {n_days} Unhealthy days and a peak of {s['peak_psi']} in {peak_region}."),
        "method_html": ('<p><strong>How to read.</strong> Colours are the NEA PSI bands for the 24-hour PSI, or the NEA bands for 1-hour PM2.5. Each number is the official reading for that region at that hour. '
                        'Hover, tap or focus a region for all three readings.</p>'
                        '<p><strong>Limits.</strong> NEA publishes one reading per region, not a surface, so a whole region coloured one band does not mean every street reads the same. '
                        'The published data carries no region polygons: each URA planning area is assigned to the NEA region whose label point is nearest its centroid, so the region shapes are an approximation, not NEA’s. '
                        'The 24-hour PSI lags conditions because it averages the previous 24 hours; the 1-hour PM2.5 view reacts faster.</p>'),
        "method_text": "Hourly 24-hour PSI, 24-hour PM2.5 and 1-hour PM2.5 for five NEA regions; URA planning areas grouped by nearest NEA region label point.",
        "caveat": "Regional readings, not a spatial surface; region shapes approximate NEA's; the 24-hour PSI lags conditions.",
        "regions_unhealthy_hours": hours,
    }


def build_meta(model):
    s = model["story"]
    return {
        "slug": SLUG,
        "source_url": PSI_URL,
        "sources": [PSI_URL, PM25_URL, BOUNDARY_URL],
        "fetched": s["last"][:10],
        "key_file_used": False,
        "coverage": {"first_hour": s["first"], "last_hour": s["last"], "hours": s["hours"], "days": s["days"]},
    }


def verify(model, meta, raw, boundary):
    s = model["story"]
    order, series = model["order"], model["series"]
    assert s["hours"] == len(order) >= 24 * 150, "expected at least ~5 months of hourly data"
    assert all(len(series[k][r]) == len(order) for k in series for r in REGIONS)
    missing = sum(v is None for k in series for r in REGIONS for v in series[k][r])
    assert missing <= 0.01 * len(order) * len(REGIONS) * 3, f"too many missing readings: {missing}"
    assert s["peak_psi"] == max(v for r in REGIONS for v in series["psi"][r] if v is not None)
    assert len(boundary["features"]) == 55 and set(model["map"]["paths"]) == set(REGIONS)
    assert all(model["map"]["paths"][r].startswith("M") for r in REGIONS)
    assert meta == build_meta(model), "meta.json out of date"
    html = VIZ.read_text()
    assert html == render(model, meta, json.loads(TOKENS.read_text())), "viz/haze-singapore/index.html is out of date; run the builder"
    assert html.count("<h1>") == 1 and html.count('id="map"') == 1 and html.count("<script") == 1
    assert not re.search(r'''(?:src|href)=["']https?://''', re.sub(r'<footer>.*</footer>', "", html, flags=re.S)), "external asset"
    assert not re.search(r"/(?:Users|home)/", html), "local path leaked"
    assert "fetch(" not in html and "XMLHttpRequest" not in html
    assert html.count("mc?.registerTool") == 3 and html.count("readOnlyHint:true") == 3
    assert 'type="range"' in html and 'id="play"' in html and 'id="legend"' in html
    assert f'href="viz/{SLUG}/index.html"' in GALLERY.read_text()
    assert f"| `{SLUG}` |" in README.read_text() and README.read_text() == render_readme(README.read_text())
    print(f"verified: {s['hours']:,} hourly readings x 5 regions x 3 measures, peak PSI {s['peak_psi']} ({s['peak_region']}, {s['peak_stamp'][:16]}), "
          f"{len(boundary['features'])} planning areas in 5 regions, 3 read-only tools, zero external assets")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    raw = json.loads(RAW.read_text())
    boundary = json.loads(BOUNDARY.read_text())
    model = build_model(raw, boundary)
    if args.verify:
        verify(model, json.loads(META.read_text()), raw, boundary)
        return
    meta = build_meta(model)
    META.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n")
    VIZ.parent.mkdir(parents=True, exist_ok=True)
    VIZ.write_text(render(model, meta, json.loads(TOKENS.read_text())))
    GALLERY.write_text(render_gallery())
    README.write_text(render_readme(README.read_text()))
    verify(model, meta, raw, boundary)


if __name__ == "__main__":
    main()
