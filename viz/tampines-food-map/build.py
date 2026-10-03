#!/usr/bin/env python3
"""Build the Tampines hub food map from committed research data.

Inputs in this folder:
  raw.json      guide-featured places with Google Maps ratings, guide quotes,
                review summaries and the dishes mapped to HPB SGFoodID items
  sgfoodid.json unchanged HPB SGFoodID food-detail API responses
  osm.json      unchanged OpenStreetMap Overpass response for the hub

Ranking: eligible places (guide-featured, sells mains, open on Google Maps and
inside one of the three malls) sorted by Google Maps rating, then by the number
of guides that feature them, then by name. The top 20 are shown.
Writes index.html and meta.json.
"""
import argparse
import json
import math
import re
import statistics
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SLUG = "tampines-food-map"
DATA = HERE
RAW = DATA / "raw.json"
SGFOODID = DATA / "sgfoodid.json"
OSM = DATA / "osm.json"
META = DATA / "meta.json"
TOKENS = ROOT / "design-tokens.json"
VIZ = HERE / "index.html"
TITLE = "Where to eat in Tampines hub"
TOP_N = 20
MALLS = {"Tampines Mall": 166194030, "Century Square": 166194031, "Tampines 1": 166194476}
STATION_WAY = 173221554
SGFOODID_URL = "https://pphtpc.hpb.gov.sg/web/sgfoodid/tools/food-search"
SGFOODID_API = "https://pphtpc.hpb.gov.sg/bff/v1/food-portal/foods/details/"
OSM_URL = "https://www.openstreetmap.org/copyright"
REFERENCE_KCAL = 2000
# Map window (degrees) and projection width in SVG units.
LAT0, LAT1, LON0, LON1 = 1.3507, 1.3559, 103.9418, 103.9476
MAP_W = 1000
# Categorical slots 1-3 of the dataviz reference palette (validated all-pairs).
MACRO_COLORS = {"protein": "#2a78d6", "carbs": "#eb6834", "fat": "#1baf7a"}
ROAD_WIDTH = {"primary": 7, "primary_link": 4, "secondary": 5, "secondary_link": 3, "tertiary": 4,
              "residential": 2.5, "unclassified": 2.5, "pedestrian": 2.5, "service": 1.4}


# ---------------------------------------------------------------- data ----

def nutrient(value):
    """SGFoodID uses -1 for trace or no data; count it as zero."""
    return 0.0 if value is None or value < 0 else float(value)


def dish_model(dish, sg):
    total = {"kcal": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
    parts = []
    for part in dish["sgfoodid"]:
        item = sg[part["crId"]]
        n = item["calculatedFoodNutrients"]
        q = part["servings"]
        total["kcal"] += nutrient(n["energy"]) * q
        total["protein"] += nutrient(n["protein"]) * q
        total["carbs"] += nutrient(n["carbohydrate"]) * q
        total["fat"] += nutrient(n["fat"]) * q
        parts.append({"crId": part["crId"], "name": item["name"], "servings": q, "portion": item["defaultPortion"],
                      "basis": f'{item["sourceOfData"]}, {item["yearOfData"]}'})
    energy = {"protein": total["protein"] * 4, "carbs": total["carbs"] * 4, "fat": total["fat"] * 9}
    macro_kcal = sum(energy.values())
    shares = {k: v / macro_kcal * 100 for k, v in energy.items()}
    pct = {k: math.floor(v) for k, v in shares.items()}
    # Largest-remainder rounding so the three shares always sum to 100.
    for k in sorted(shares, key=lambda k: shares[k] - math.floor(shares[k]), reverse=True)[:100 - sum(pct.values())]:
        pct[k] += 1
    return {"name": dish["name"], "price": dish["price"], "match": dish["match"], "note": dish["note"],
            "kcal": round(total["kcal"]), "protein_g": round(total["protein"], 1), "carbs_g": round(total["carbs"], 1),
            "fat_g": round(total["fat"], 1), "pct": pct, "sgfoodid": parts}


def floor_of(unit):
    m = re.match(r"#?\s*(B?)(\d+)", unit)
    return -int(m.group(2)) if m.group(1) else int(m.group(2))


def build_model(raw, sg):
    guides = {g["id"]: g for g in raw["guides"]}
    eligible = [p for p in raw["places"] if p["status"] == "open" and p["rating"] is not None]
    ranked = sorted(eligible, key=lambda p: (-p["rating"], -len(p["guides"]), p["name"]))
    top = []
    for rank, p in enumerate(ranked[:TOP_N], 1):
        assert p.get("dishes") and p.get("summary"), f"{p['id']} needs dishes and a summary"
        top.append({
            "rank": rank, "id": p["id"], "name": p["name"], "mall": p["mall"], "unit": p["unit"], "floor": floor_of(p["unit"]),
            "cuisine": p["cuisine"], "group": p["group"], "rating": p["rating"], "guide_count": len(p["guides"]),
            "summary": p["summary"], "maps_url": p["maps_url"],
            "guides": [{"publisher": guides[g]["publisher"], "url": guides[g]["url"], "date": guides[g]["date"],
                        "quote": p["quotes"].get(g)} for g in p["guides"]],
            "dishes": [dish_model(d, sg) for d in p["dishes"]],
        })
    kcals = [d["kcal"] for p in top for d in p["dishes"]]
    story = {
        "places": len(top), "dishes": len(kcals), "median_kcal": round(statistics.median(kcals)),
        "over_600": sum(k >= 600 for k in kcals), "min_kcal": min(kcals), "max_kcal": max(kcals),
        "cutoff_rating": top[-1]["rating"], "eligible": len(ranked),
        "by_mall": {m: sum(p["mall"] == m for p in top) for m in MALLS},
        "excluded": [{"name": p["name"], "mall": p["mall"], "status": p["status"]} for p in raw["places"] if p["status"] != "open"],
    }
    return {"top": top, "story": story, "map": build_map(json.loads(OSM.read_text(encoding="utf-8")))}


# ------------------------------------------------------------ geometry ----

KX = math.cos(math.radians((LAT0 + LAT1) / 2))
SCALE = MAP_W / ((LON1 - LON0) * KX)
MAP_H = round((LAT1 - LAT0) * SCALE)


def project(lon, lat):
    return ((lon - LON0) * KX * SCALE, (LAT1 - lat) * SCALE)


def simplify(points, tolerance):
    """Douglas-Peucker on an open polyline (iterative)."""
    if len(points) < 3:
        return points
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


def path_of(geometry, closed):
    pts = [project(g["lon"], g["lat"]) for g in geometry]
    if closed and len(pts) > 3:
        # Split the ring at the point farthest from its start so both halves have a real chord.
        far = max(range(1, len(pts) - 1), key=lambda i: math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]))
        pts = simplify(pts[:far + 1], 0.8)[:-1] + simplify(pts[far:], 0.8)
    else:
        pts = simplify(pts, 0.8)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    if max(xs) < -50 or min(xs) > MAP_W + 50 or max(ys) < -50 or min(ys) > MAP_H + 50:
        return ""
    d = "M" + "L".join(f"{x:.0f},{y:.0f}" for x, y in pts)
    return d + "Z" if closed else d


def centroid(geometry):
    pts = [project(g["lon"], g["lat"]) for g in geometry]
    area = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    return [round(cx / (3 * area), 1), round(cy / (3 * area), 1)]


def build_map(osm):
    ways = {e["id"]: e for e in osm["elements"] if e["type"] == "way"}
    buildings, parks, rail = [], [], []
    roads = {}
    labels = {}
    for e in ways.values():
        tags = e.get("tags", {})
        if e["id"] in MALLS.values() or e["id"] == STATION_WAY:
            continue
        if "building" in tags:
            buildings.append(path_of(e["geometry"], True))
        elif tags.get("leisure") == "park":
            parks.append(path_of(e["geometry"], True))
        elif tags.get("railway") == "subway" and tags.get("tunnel") != "yes":
            rail.append(path_of(e["geometry"], False))
        elif tags.get("highway") in ROAD_WIDTH:
            d = path_of(e["geometry"], False)
            roads.setdefault(tags["highway"], []).append(d)
            name = tags.get("name")
            if name and tags["highway"] in ("primary", "secondary") and d:
                pts = [project(g["lon"], g["lat"]) for g in e["geometry"]]
                length = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
                if length > labels.get(name, (0,))[0]:
                    labels[name] = (length, pts)
    malls = {}
    for mall, way_id in MALLS.items():
        g = ways[way_id]["geometry"]
        malls[mall] = {"d": path_of(g, True), "c": centroid(g)}
    ring = [project(g["lon"], g["lat"]) for way_id in MALLS.values() for g in ways[way_id]["geometry"]]
    extent = [round(min(x for x, _ in ring)), round(min(y for _, y in ring)), round(max(x for x, _ in ring)), round(max(y for _, y in ring))]
    station = ways[STATION_WAY]["geometry"]
    road_labels = []
    for name in ("Tampines Central 1", "Tampines Avenue 5", "Tampines Avenue 4", "Tampines Central 5"):
        if name not in labels:
            continue
        _, pts = labels[name]
        mid = len(pts) // 2
        (x0, y0), (x1, y1) = pts[max(0, mid - 1)], pts[min(len(pts) - 1, mid + 1)]
        angle = math.degrees(math.atan2(y1 - y0, x1 - x0))
        if angle > 90:
            angle -= 180
        elif angle < -90:
            angle += 180
        x, y = pts[mid]
        if 40 < x < MAP_W - 40 and 40 < y < MAP_H - 40:
            road_labels.append({"t": name, "x": round(x), "y": round(y), "a": round(angle)})
    return {
        "w": MAP_W, "h": MAP_H,
        "buildings": "".join(b for b in buildings if b), "parks": "".join(p for p in parks if p),
        "rail": "".join(r for r in rail if r),
        "roads": {k: "".join(v) for k, v in sorted(roads.items())},
        "malls": malls, "extent": extent, "station": {"d": path_of(station, True), "c": centroid(station)},
        "road_labels": road_labels, "m100": round(100 * SCALE / 111320, 1),
        "osm_base": osm["osm3s"]["timestamp_osm_base"],
    }


# -------------------------------------------------------------- render ----

def portion(text):
    """'1 bowl(s) = 555g' -> '1 bowl, 555 g'."""
    m = re.match(r"(\d+) (\w+)(?:\(s\))? = (\d+)g", text)
    return f"{m.group(1)} {m.group(2)}, {m.group(3)} g" if m else text


def kcal_text(k):
    return f"{k:,} kcal"


def card(p):
    dishes = []
    for d in p["dishes"]:
        pct = d["pct"]
        segs = "".join(f'<i class="{k}" style="width:{pct[k]}%"></i>' for k in ("protein", "carbs", "fat"))
        basis = " + ".join((f'{s["servings"]} × ' if s["servings"] != 1 else "") + f'{s["name"]} ({portion(s["portion"])})'
                           for s in d["sgfoodid"])
        kind = "HPB match" if d["match"] == "direct" else "closest HPB dish"
        note = f' {escape(d["note"])}' if d["note"] else ""
        price = f' <span class="price">{escape(d["price"])}</span>' if d["price"] else ""
        dishes.append(
            f'<div class="dish"><div class="dn"><span>{escape(d["name"])}{price}</span><strong>{kcal_text(d["kcal"])}</strong></div>'
            f'<div class="bar" role="img" aria-label="Energy from protein {pct["protein"]}%, carbohydrate {pct["carbs"]}%, fat {pct["fat"]}%">{segs}</div>'
            f'<p class="macro"><span>Protein {d["protein_g"]:g} g</span> · <span>Carbs {d["carbs_g"]:g} g</span> · <span>Fat {d["fat_g"]:g} g</span></p>'
            f'<p class="est">Estimate, {kind}: {escape(basis)}.{note}</p></div>'
        )
    sources = ", ".join(f'<a href="{escape(g["url"])}" rel="noopener">{escape(g["publisher"])}</a>' for g in p["guides"])
    floor = f'B{-p["floor"]}' if p["floor"] < 0 else f'Level {p["floor"]}'
    return (
        f'<article class="card" id="p-{p["id"]}" data-id="{p["id"]}" data-mall="{escape(p["mall"])}" tabindex="-1">'
        f'<header><span class="rank">{p["rank"]}</span><h3>{escape(p["name"])}</h3>'
        f'<span class="rating" aria-label="Google Maps rating {p["rating"]} out of 5">★ {p["rating"]:.1f}</span></header>'
        f'<p class="where">{escape(p["mall"])} · {escape(p["unit"])} ({floor}) · <span class="cuisine">{escape(p["cuisine"])}</span></p>'
        f'<p class="sum">{escape(p["summary"])}</p>{"".join(dishes)}'
        f'<p class="src">Reviews: {sources} · <a href="{escape(p["maps_url"])}" rel="noopener">Google Maps</a></p></article>'
    )


def render(model, meta, tokens):
    c = tokens["colors"]
    s = model["story"]
    top = model["top"]
    share = round(s["median_kcal"] / REFERENCE_KCAL * 100)
    headline = (f'The typical main at Tampines hub\'s 20 best-rated food places is about {s["median_kcal"]:,} kcal, '
                f'{share}% of a {REFERENCE_KCAL:,} kcal day.')
    description = (f'Map of the 20 best-rated places to eat across Tampines Mall, Century Square and Tampines 1, ranked by Google Maps '
                   f'rating among food-guide picks, with review summaries and HPB-based calorie and macro estimates for their mains.')
    guides = {}
    for p in top:
        for g in p["guides"]:
            guides[g["url"]] = g
    for p in json.loads(RAW.read_text(encoding="utf-8"))["guides"]:
        guides.setdefault(p["url"], {"publisher": p["publisher"], "url": p["url"], "date": p["date"]})
    guide_items = "".join(f'<li><a href="{escape(g["url"])}" rel="noopener">{escape(g["publisher"])}</a>, {escape(g["date"])}</li>'
                          for g in sorted(guides.values(), key=lambda g: (g["publisher"], g["date"])))
    excluded = "; ".join(f'{escape(e["name"])} ({escape(e["mall"])}): {escape(e["status"])}' for e in s["excluded"])
    mall_counts = ", ".join(f'{m} {n}' for m, n in s["by_mall"].items())
    chips = '<button type="button" class="chip" aria-pressed="true" data-mall="">All malls</button>' + "".join(
        f'<button type="button" class="chip" aria-pressed="false" data-mall="{escape(m)}">{escape(m)} ({n})</button>'
        for m, n in s["by_mall"].items())
    data = {"places": [{k: p[k] for k in ("rank", "id", "name", "mall", "unit", "floor", "cuisine", "group", "rating", "guide_count",
                                            "summary", "maps_url")} | {"dishes": [{k: d[k] for k in ("name", "price", "kcal", "protein_g", "carbs_g", "fat_g", "pct", "match")}
                                                                                   for d in p["dishes"]]} for p in top],
            "map": model["map"]}
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    meta_payload = json.dumps({
        "title": TITLE, "claim": headline, "ranking_method": meta["ranking_method"], "calorie_method": meta["calorie_method"],
        "sources": meta["sources"], "fetched": meta["fetched"], "limitations": meta["limitations"]}, ensure_ascii=False).replace("</", "<\\/")
    css = f""":root{{--bg:{c['background']};--fg:{c['foreground']};--muted:{c['secondary']};--surface:{c['surface']};--border:{c['border']};--focus:{c['focus']};--mark:{c['mark']};--sel:{c['selected']};--p:{MACRO_COLORS['protein']};--c:{MACRO_COLORS['carbs']};--f:{MACRO_COLORS['fat']};--r:{tokens['radius']};--sans:{tokens['font_sans']};--mono:{tokens['font_mono']};color-scheme:light}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 var(--sans)}}main,footer{{width:min(100% - 2rem,{tokens['content_width']});margin:auto}}main{{padding:clamp(1.5rem,5vw,3.5rem) 0 1rem}}
.kicker{{margin:0 0 .5rem;color:var(--muted);font:600 .8rem/1.3 var(--mono);text-transform:uppercase;letter-spacing:.06em}}h1{{max-width:22ch;margin:0 0 .75rem;font-size:clamp(1.8rem,5.5vw,3.4rem);line-height:1.06;letter-spacing:-.04em}}
.lede{{max-width:66ch;margin:0 0 1rem;color:var(--muted)}}.controls{{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0}}
button{{font:inherit;cursor:pointer;color:var(--fg);background:var(--bg);border:1px solid var(--border);border-radius:999px;padding:.5rem .9rem;min-height:2.75rem}}button:hover{{background:var(--surface)}}button:focus-visible,a:focus-visible,.card:focus-visible{{outline:3px solid var(--focus);outline-offset:2px}}.dot:focus{{outline:none}}.dot:focus-visible circle.v{{stroke:var(--focus);stroke-width:4}}
.chip[aria-pressed=true]{{background:var(--fg);color:var(--bg);border-color:var(--fg)}}
.mapwrap{{position:relative;border:1px solid var(--border);border-radius:var(--r);overflow:hidden;background:var(--surface)}}#map{{display:block;width:100%;height:auto;touch-action:manipulation}}
.bld{{fill:#e4e4e8;stroke:#d8d8dd;stroke-width:.6}}.park{{fill:#dcebdc}}.road{{fill:none;stroke:#fff;stroke-linecap:round;stroke-linejoin:round}}.roadcase{{fill:none;stroke:#d9d9de;stroke-linecap:round;stroke-linejoin:round}}.rail{{fill:none;stroke:#9a9aa0;stroke-width:2;stroke-dasharray:6 4}}
.mall{{fill:#fff;stroke:var(--fg);stroke-width:1.5}}.mall.on{{fill:#fff4ec;stroke:var(--sel);stroke-width:2.5}}.stn{{fill:#cfd8e6;stroke:#9aa6ba;stroke-width:1}}
.rl{{fill:#8a8a90;font:500 10px var(--sans);letter-spacing:.02em}}.ml{{fill:var(--fg);font:700 12px var(--sans)}}.sl{{fill:#5a6478;font:600 10px var(--sans)}}
.box{{fill:var(--bg);stroke:var(--border)}}.lead{{stroke:var(--fg);stroke-width:1;fill:none}}.fl{{fill:var(--muted);font:600 10px var(--mono)}}.bt{{fill:var(--fg);font:700 12px var(--sans)}}
.dot{{cursor:pointer}}.dot circle.v{{fill:var(--fg);stroke:var(--bg);stroke-width:2}}.dot text{{fill:var(--bg);font:700 11px var(--mono);text-anchor:middle;pointer-events:none}}.dot.sel circle.v{{fill:var(--sel)}}.dot:hover circle.v{{fill:var(--mark)}}.dot.dim{{opacity:.25}}
.scale{{fill:none;stroke:var(--muted);stroke-width:1.5}}.st{{fill:var(--muted);font:10px var(--mono)}}
.tip{{position:absolute;z-index:2;width:min(22rem,calc(100% - 1rem));max-height:calc(100% - 1rem);overflow:auto;background:var(--bg);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 8px 28px rgba(0,0,0,.14);padding:.75rem .9rem}}.tip[hidden]{{display:none}}
.close{{position:absolute;top:.1rem;right:.1rem;z-index:1;min-height:2.75rem;min-width:2.75rem;padding:0;border:0;background:none;font-size:1.3rem;line-height:1}}
.dock{{margin-top:.75rem}}.dock:empty{{display:none}}
.legend{{display:flex;flex-wrap:wrap;gap:.35rem 1rem;align-items:center;margin:.75rem 0;color:var(--muted);font-size:.875rem}}.legend i{{display:inline-block;width:.8rem;height:.8rem;border-radius:2px;margin-right:.35rem;vertical-align:-.1rem}}
.list{{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,21rem),1fr));gap:1rem;margin:1rem 0 0;padding:0}}.card{{min-width:0;border:1px solid var(--border);border-radius:var(--r);padding:.85rem 1rem;background:var(--bg)}}.card.sel{{border-color:var(--sel);box-shadow:0 0 0 1px var(--sel)}}.card[hidden]{{display:none}}
.card header{{display:flex;align-items:baseline;gap:.55rem}}.card h3{{flex:1;min-width:0;margin:0;font-size:1.05rem;line-height:1.25;cursor:pointer}}.rank{{flex:none;display:inline-grid;place-items:center;width:1.6rem;height:1.6rem;border-radius:50%;background:var(--fg);color:var(--bg);font:700 .75rem var(--mono)}}.rating{{flex:none;font:600 .9rem var(--mono)}}
.where{{margin:.3rem 0 .4rem;color:var(--muted);font-size:.875rem}}.sum{{margin:.4rem 0 .6rem;font-size:.95rem}}
.dish{{margin:.55rem 0;padding-top:.5rem;border-top:1px solid var(--surface)}}.dn{{display:flex;justify-content:space-between;gap:.75rem;font-size:.92rem}}.dn span{{min-width:0}}.dn strong{{flex:none;font-family:var(--mono)}}.price{{color:var(--muted);font-size:.8rem}}
.bar{{display:flex;gap:2px;height:.6rem;margin:.35rem 0 .25rem;background:var(--bg)}}.bar i{{display:block;height:100%}}.bar i:first-child{{border-radius:4px 0 0 4px}}.bar i:last-child{{border-radius:0 4px 4px 0}}.bar .protein{{background:var(--p)}}.bar .carbs{{background:var(--c)}}.bar .fat{{background:var(--f)}}
.macro{{margin:0;font:.78rem/1.4 var(--mono);color:var(--fg)}}.macro span{{white-space:nowrap}}.card.pinned header{{padding-right:2.25rem}}.est{{margin:.15rem 0 0;font-size:.75rem;color:var(--muted)}}.src{{margin:.6rem 0 0;font-size:.8rem;color:var(--muted)}}.src a,.card a{{color:inherit;text-underline-offset:.18em;display:inline-block;padding:.35rem 0}}
h2{{margin:2rem 0 .25rem;font-size:1.3rem;letter-spacing:-.02em}}.note{{max-width:70ch;color:var(--muted);font-size:.9rem}}
footer{{padding:1.5rem 0 2.5rem;margin-top:2rem;border-top:1px solid var(--border);color:var(--muted);font-size:.875rem}}footer ul{{padding-left:1.1rem;margin:.4rem 0 1rem}}footer a{{color:inherit;text-underline-offset:.18em;display:inline-block;padding:.35rem 0}}footer h2{{font-size:1rem;color:var(--fg);margin:1rem 0 .25rem}}
@media(prefers-reduced-motion:reduce){{*{{scroll-behavior:auto!important;transition:none!important}}}}"""
    js = r"""
const D=__DATA__,META=__META__,NS="http://www.w3.org/2000/svg",svg=document.querySelector("#map"),wrap=document.querySelector(".mapwrap"),tip=document.querySelector("#tip"),dock=document.querySelector("#dock"),reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
const byId=Object.fromEntries(D.places.map(p=>[p.id,p]));let mall="",selected=null,dots={},W=0;
const add=(n,a,p=svg)=>{const e=document.createElementNS(NS,n);for(const k in a)e.setAttribute(k,a[k]);p.append(e);return e};
const txt=(s,a,p)=>{const e=add("text",a,p);e.textContent=s;return e};
const floorLabel=f=>f<0?"B"+(-f):"L"+f;
// Corner for each mall's floor-directory box: T1 lies north, Century Square west, Tampines Mall east.
const CORNER={"Tampines 1":"tl","Century Square":"bl","Tampines Mall":"br"};
function draw(){
 svg.replaceChildren();W=Math.max(300,Math.round(wrap.getBoundingClientRect().width));const narrow=W<560,m=D.map,pad=10,dr=narrow?13:12,step=dr*2+6;
 const boxes={};for(const name of Object.keys(m.malls)){const ps=D.places.filter(p=>p.mall===name),floors=[...new Set(ps.map(p=>p.floor))].sort((a,b)=>b-a),cols=Math.max(...floors.map(f=>ps.filter(p=>p.floor===f).length));boxes[name]={ps:ps,floors:floors,bw:36+cols*step+pad,bh:26+floors.length*step+pad/2}}
 // Narrow screens: directory boxes sit in bands above and below the map so they never cover a mall.
 const top=narrow?boxes["Tampines 1"].bh+24:0,bottom=narrow?Math.max(boxes["Century Square"].bh,boxes["Tampines Mall"].bh)+24:0,geoH=narrow?Math.round(W*.95):Math.round(Math.min(W*.72,640)),H=top+geoH+bottom;
 // Zoom so the three malls fill the middle of the map, leaving the corners for the directory boxes.
 const [x0,y0,x1,y1]=m.extent,s=Math.min(W*(narrow?.62:.42)/(x1-x0),geoH*(narrow?.8:.72)/(y1-y0)),ox=W/2-(x0+x1)/2*s,oy=top+geoH/2-(y0+y1)/2*s;
 svg.setAttribute("viewBox","0 0 "+W+" "+H);svg.setAttribute("height",H);
 const g=add("g",{transform:"translate("+ox.toFixed(1)+","+oy.toFixed(1)+") scale("+s.toFixed(4)+")"});
 add("path",{d:m.parks,class:"park"},g);add("path",{d:m.buildings,class:"bld"},g);
 const order=["service","residential","unclassified","pedestrian","tertiary","secondary_link","secondary","primary_link","primary"],wd={primary:7,primary_link:4,secondary:5,secondary_link:3,tertiary:4,residential:2.5,unclassified:2.5,pedestrian:2.5,service:1.4};
 for(const k of order)if(m.roads[k])add("path",{d:m.roads[k],class:"roadcase","stroke-width":(wd[k]+1.6)/Math.sqrt(s)},g);
 for(const k of order)if(m.roads[k])add("path",{d:m.roads[k],class:"road","stroke-width":wd[k]/Math.sqrt(s)},g);
 add("path",{d:m.rail,class:"rail","stroke-width":2/s},g);
 add("path",{d:m.station.d,class:"stn"},g);
 const P=([x,y])=>[ox+x*s,oy+y*s];
 for(const r of m.road_labels){const [x,y]=P([r.x,r.y]);if(x<20||x>W-20||y<20||y>H-20)continue;txt(r.t,{x:x,y:y-4,class:"rl","text-anchor":"middle",transform:"rotate("+r.a+" "+x+" "+y+")"})}
 const [sx,sy]=P(m.station.c);txt("Tampines MRT",{x:sx,y:sy+3,class:"sl","text-anchor":"middle"});
 const selMall=selected?byId[selected].mall:mall;
 for(const [name,v] of Object.entries(m.malls))add("path",{d:v.d,class:"mall"+(selMall===name?" on":""),transform:g.getAttribute("transform")});
 dots={};
 for(const [name,v] of Object.entries(m.malls)){
  const {ps,floors,bw,bh}=boxes[name];
  const c=CORNER[name],bx=c.endsWith("l")?12:W-12-bw,by=c.startsWith("t")?12:H-12-bh,[cx,cy]=P(v.c);
  const ax=Math.min(Math.max(cx,bx),bx+bw),ay=Math.min(Math.max(cy,by),by+bh);
  add("line",{x1:ax,y1:ay,x2:cx,y2:cy,class:"lead"});add("circle",{cx:cx,cy:cy,r:3,fill:"var(--fg)"});
  add("rect",{x:bx,y:by,width:bw,height:bh,rx:8,class:"box"});txt(name,{x:bx+pad,y:by+18,class:"bt"});
  floors.forEach((f,i)=>{const y=by+26+i*step+step/2;txt(floorLabel(f),{x:bx+pad,y:y+4,class:"fl"});
   ps.filter(p=>p.floor===f).sort((a,b)=>a.rank-b.rank).forEach((p,j)=>{const x=bx+36+j*step+dr;const d=add("g",{class:"dot"+(mall&&mall!==p.mall?" dim":"")+(selected===p.id?" sel":""),tabindex:"0",role:"button","aria-label":"#"+p.rank+" "+p.name+", "+p.mall+" "+p.unit+", rated "+p.rating});
    add("circle",{cx:x,cy:y,r:Math.max(dr+5,22),fill:"transparent"},d);add("circle",{cx:x,cy:y,r:dr,class:"v"},d);txt(p.rank,{x:x,y:y+4},d);dots[p.id]=d;
    d.addEventListener("click",e=>{e.stopPropagation();select(p.id,true)});d.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();select(p.id,true)}});
    d.addEventListener("focus",()=>{if(selected!==p.id)show(p.id,false)});d.addEventListener("mouseenter",()=>{if(selected!==p.id&&matchMedia("(hover:hover)").matches)show(p.id,false)});d.addEventListener("mouseleave",()=>{if(selected)show(selected,true);else hide()})})});
 }
 const km=m.m100*s;add("path",{d:"M"+(W-12-km)+",24v5h"+km+"v-5",class:"scale"});txt("100 m",{x:W-12-km/2,y:21,class:"st","text-anchor":"middle"});
 if(selected)show(selected,true);
}
function cardFor(id){return document.getElementById("p-"+id)}
function show(id,pinned){const c=cardFor(id);if(!c)return;const clone=c.cloneNode(true);clone.removeAttribute("id");clone.classList.remove("sel");clone.hidden=false;clone.removeAttribute("tabindex");
 const narrow=W<560,host=narrow?dock:tip;(narrow?tip:dock).replaceChildren();tip.hidden=narrow;host.replaceChildren(clone);
 if(pinned){const b=document.createElement("button");b.type="button";b.className="close";b.setAttribute("aria-label","Close details");b.textContent="×";b.addEventListener("click",clear);clone.style.position="relative";clone.classList.add("pinned");clone.prepend(b)}
 if(!narrow){tip.hidden=false;const d=dots[id].querySelector("circle.v"),r=d.getBoundingClientRect(),w=wrap.getBoundingClientRect(),tw=tip.offsetWidth,th=tip.offsetHeight;let x=r.left-w.left+r.width+10,y=r.top-w.top-20;if(x+tw>w.width-8)x=r.left-w.left-tw-10;x=Math.max(8,Math.min(x,w.width-tw-8));y=Math.max(8,Math.min(y,w.height-th-8));tip.style.left=x+"px";tip.style.top=y+"px"}}
function hide(){tip.hidden=true;tip.replaceChildren();if(!selected)dock.replaceChildren()}
function select(id,fromMap){selected=id;draw();if(fromMap&&dots[id])dots[id].focus({preventScroll:true});document.querySelectorAll(".card").forEach(c=>c.classList.toggle("sel",c.dataset.id===id));show(id,true);if(!fromMap&&dots[id]){wrap.scrollIntoView({block:"nearest",behavior:reduced?"auto":"smooth"})}else if(W<560)dock.scrollIntoView({block:"nearest",behavior:reduced?"auto":"smooth"})}
function clear(){selected=null;draw();document.querySelectorAll(".card").forEach(c=>c.classList.remove("sel"));tip.hidden=true;tip.replaceChildren();dock.replaceChildren()}
function setMall(m){mall=m;document.querySelectorAll(".chip").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mall===m)));document.querySelectorAll(".card").forEach(c=>c.hidden=!!m&&c.dataset.mall!==m);if(selected&&m&&byId[selected].mall!==m)clear();draw()}
document.querySelectorAll(".chip").forEach(b=>b.addEventListener("click",()=>setMall(b.dataset.mall)));
document.querySelectorAll(".card h3").forEach(h=>{h.addEventListener("click",()=>select(h.closest(".card").dataset.id,false))});
document.addEventListener("keydown",e=>{if(e.key==="Escape")clear()});svg.addEventListener("click",()=>{if(selected)clear()});
addEventListener("resize",()=>{if(Math.abs(wrap.getBoundingClientRect().width-W)>1)draw()});
document.querySelector("#mapfallback").hidden=true;wrap.hidden=false;draw();
const result=v=>({content:[{type:"text",text:JSON.stringify(v)}]}),mc=(typeof document!=="undefined"&&document.modelContext)||(typeof navigator!=="undefined"&&navigator.modelContext);
mc?.registerTool({name:"get_data",description:"Return the 20 ranked food places with mall, unit, cuisine, Google Maps rating, review summary and estimated kcal and macros per main.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},async execute(){return result({rows:D.places,total:D.places.length,truncated:false,next_steps:["Use query to filter by mall, cuisine group or maximum kcal."]})}});
mc?.registerTool({name:"get_metadata",description:"Return the headline, ranking method, calorie method, sources and limitations.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},async execute(){return result(META)}});
mc?.registerTool({name:"query",description:"Filter the ranked places by mall, cuisine group, and a maximum kcal for at least one main.",inputSchema:{type:"object",properties:{mall:{type:"string",enum:["Tampines Mall","Century Square","Tampines 1"]},group:{type:"string",enum:["Chinese","Japanese","Korean","Local","Western"]},max_kcal:{type:"number"}},additionalProperties:false},annotations:{readOnlyHint:true},async execute(a={}){const rows=D.places.filter(p=>(!a.mall||p.mall===a.mall)&&(!a.group||p.group===a.group)&&(a.max_kcal==null||p.dishes.some(d=>d.kcal<=a.max_kcal)));return result({rows:rows,total:rows.length,truncated:false,next_steps:rows.length?["All matches returned."]:["Relax max_kcal or drop a filter."]})}});
""".replace("__DATA__", payload).replace("__META__", meta_payload)
    cards = "".join(card(p) for p in top)
    return (
        f'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<link rel="icon" href="data:,"><meta name="description" content="{escape(description)}"><title>{TITLE}</title><style>\n{css}\n</style></head><body><main>'
        f'<p class="kicker">Tampines Mall · Century Square · Tampines 1</p><h1>{TITLE}</h1>'
        f'<p class="lede"><strong>{escape(headline)}</strong> {s["over_600"]} of the {s["dishes"]} mains estimated here pass 600 kcal. '
        f'Places are ranked by Google Maps rating among outlets that 2025–26 food guides recommend; tap a numbered dot for the review summary and a calorie breakdown of the mains.</p>'
        f'<div class="controls" role="group" aria-label="Filter by mall">{chips}</div>'
        f'<div class="mapwrap" hidden><svg id="map" role="img" aria-label="Map of the Tampines hub: three malls around Tampines MRT, each with a floor directory of numbered top-20 food places"></svg>'
        f'<div id="tip" class="tip" hidden aria-live="polite"></div></div>'
        f'<p id="mapfallback" class="note">The interactive map needs JavaScript; the full ranked list is below.</p><div id="dock" class="dock" aria-live="polite"></div>'
        f'<div class="legend"><span>Bar = share of each main\'s energy from</span><span><i style="background:var(--p)"></i>Protein</span>'
        f'<span><i style="background:var(--c)"></i>Carbohydrate</span><span><i style="background:var(--f)"></i>Fat</span></div>'
        f'<h2>The ranked list</h2><p class="note">Split by mall: {escape(mall_counts)}. Ratings run from {top[0]["rating"]:.1f} down to {s["cutoff_rating"]:.1f}. '
        f'Select a name to find it on the map.</p><div class="list">{cards}</div>'
        f'</main><footer><h2>How this was made</h2><p>{escape(meta["ranking_method"])}</p><p>{escape(meta["calorie_method"])}</p>'
        f'<p>Limitations: {escape(" ".join(meta["limitations"]))}</p><p>Guide picks left out: {excluded}.</p>'
        f'<h2>Sources</h2><ul>{guide_items}<li><a href="{SGFOODID_URL}" rel="noopener">HPB Singapore Food Insights Database (SGFoodID)</a></li>'
        f'<li>Ratings: Google Maps place pages (linked on each card)</li>'
        f'<li>Map: © <a href="{OSM_URL}" rel="noopener">OpenStreetMap contributors</a> (ODbL), data as of {escape(model["map"]["osm_base"][:10])}</li></ul>'
        f'<p>Collected {escape(meta["fetched"])}.</p></footer><script>{js}</script></body></html>\n'
    )


# -------------------------------------------------------------- verify ----

def build_meta(model, raw):
    s = model["story"]
    return {
        "slug": SLUG,
        "source_url": SGFOODID_URL,
        "sources": [g["url"] for g in raw["guides"]] + [SGFOODID_URL, SGFOODID_API, "https://www.google.com/maps", OSM_URL],
        "fetched": raw["collected"],
        "key_file_used": False,
        "ranking_method": (
            f"Candidates are outlets featured in at least one of {len(raw['guides'])} food guides published or updated in 2025-26 "
            f"that sell mains, are listed on Google Maps inside Tampines Mall, Century Square or Tampines 1, and are not marked closed "
            f"({s['eligible']} qualified). They are ranked by Google Maps star rating, then by how many guides feature them, then by name; "
            f"the top {TOP_N} are shown. Requiring a guide pick keeps unreviewed listings with a handful of 5-star ratings out of the ranking."
        ),
        "calorie_method": (
            "Each main is matched to a dish in HPB's Singapore Food Insights Database (SGFoodID, formerly FOCOS), which gives lab-analysed or "
            "derived energy, protein, carbohydrate and fat for one default serving. Figures are estimates for that typical serving, not the "
            "outlet's own recipe; 'closest HPB dish' marks a substitute where SGFoodID has no exact dish. The bar shows the share of energy "
            "from protein and carbohydrate (4 kcal/g) and fat (9 kcal/g). Trace values count as zero."
        ),
        "limitations": [
            "Google Maps showed star ratings but withheld review counts in the logged-out view, so the ranking cannot weight by review volume.",
            "Review summaries paraphrase the cited guides, not Google reviews.",
            "Calorie figures are estimates from standard HPB servings; shared dishes (TANYU's fish, Haidilao's hot pot) are shown per person.",
            "The map places each mall's picks in a floor directory beside the mall; dots are not exact shop positions.",
        ],
        "coverage": {"places": s["places"], "dishes": s["dishes"], "median_kcal": s["median_kcal"], "by_mall": s["by_mall"]},
    }


def verify(model, meta, raw, sg):
    top, s = model["top"], model["story"]
    assert len(top) == TOP_N and [p["rank"] for p in top] == list(range(1, TOP_N + 1))
    keys = [(-p["rating"], -p["guide_count"], p["name"]) for p in top]
    assert keys == sorted(keys), "ranking order broken"
    assert {p["mall"] for p in top} == set(MALLS) and sum(s["by_mall"].values()) == TOP_N
    assert all(1 <= p["floor"] <= 6 or -2 <= p["floor"] <= -1 for p in top)
    assert all(p["guides"] and p["maps_url"].startswith("https://www.google.com/maps?cid=") for p in top)
    assert all(p["summary"] and len(p["summary"]) <= 320 for p in top)
    for p in top:
        for d in p["dishes"]:
            assert 50 <= d["kcal"] <= 2000 and sum(d["pct"].values()) == 100, (p["id"], d)
            assert d["match"] in ("direct", "proxy")
            for part in d["sgfoodid"]:
                assert part["crId"] in sg
    assert set(sg) == {x["crId"] for p in raw["places"] for d in p.get("dishes", []) for x in d["sgfoodid"]}, "sgfoodid.json has unused or missing items"
    closed = [p for p in raw["places"] if p["status"] != "open"]
    assert closed and not {p["id"] for p in closed} & {p["id"] for p in top}
    assert all(model["map"]["malls"][m]["d"].startswith("M") for m in MALLS) and model["map"]["buildings"]
    assert meta == build_meta(model, raw), "meta.json out of date; run the builder"
    html = VIZ.read_text(encoding="utf-8")
    assert html == render(model, meta, json.loads(TOKENS.read_text(encoding="utf-8"))), f"viz/{SLUG}/index.html is out of date; run the builder"
    assert html.count("<h1>") == 1 and html.count('id="map"') == 1 and html.count("<script") == 1
    assert not re.search(r"""<(?:script|img|iframe|link)[^>]+(?:src|href)=["']https?://""", html), "external asset"
    assert "<link rel=\"stylesheet\"" not in html and "fetch(" not in html and "XMLHttpRequest" not in html
    assert not re.search(r"/(?:Users|home)/", html), "local path leaked"
    assert html.count("mc?.registerTool") == 3 and html.count("readOnlyHint:true") == 3
    for name in ("get_data", "get_metadata", "query"):
        assert f'name:"{name}"' in html
    assert html.count('class="card"') == TOP_N and "Estimate, " in html and "OpenStreetMap" in html
    print(f"verified: {TOP_N} ranked places ({', '.join(f'{m} {n}' for m, n in s['by_mall'].items())}), "
          f"{s['dishes']} mains with HPB estimates (median {s['median_kcal']} kcal), {len(closed)} guide picks excluded, "
          "inline OSM map, 3 read-only tools, zero external assets")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    sg = json.loads(SGFOODID.read_text(encoding="utf-8"))
    model = build_model(raw, sg)
    if not args.verify:
        meta = build_meta(model, raw)
        META.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        VIZ.parent.mkdir(parents=True, exist_ok=True)
        VIZ.write_text(render(model, meta, json.loads(TOKENS.read_text(encoding="utf-8"))), encoding="utf-8")
    verify(model, json.loads(META.read_text(encoding="utf-8")), raw, sg)


if __name__ == "__main__":
    main()
