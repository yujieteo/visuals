#!/usr/bin/env python3
import argparse
import csv
import json
import math
import re
import statistics
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = "graduate-employment-survey"
RAW = ROOT / "data" / SLUG / "raw.csv"
META = ROOT / "data" / SLUG / "meta.json"
TOKENS = ROOT / "design-tokens.json"
VIZ = ROOT / "viz" / SLUG / "index.html"
GALLERY = ROOT / "index.html"
FIELDS = [
    "year", "university", "school", "degree", "employment_rate_overall",
    "employment_rate_ft_perm", "basic_monthly_mean", "basic_monthly_median",
    "gross_monthly_mean", "gross_monthly_median", "gross_mthly_25_percentile",
    "gross_mthly_75_percentile",
]


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def median(values):
    return statistics.median(values)


def prepare(rows):
    years = sorted({int(row["year"]) for row in rows})
    baselines = {
        year: median([
            value for row in rows if int(row["year"]) == year
            if (value := number(row["gross_monthly_median"])) is not None
        ])
        for year in years
    }
    points = []
    for row in rows:
        gross = number(row["gross_monthly_median"])
        if gross is None:
            continue
        year = int(row["year"])
        computing = "computing" in row["degree"].casefold()
        points.append([
            year, row["university"], row["degree"], gross,
            round((gross / baselines[year] - 1) * 100, 4), computing,
        ])
    computing_medians = []
    for year in years:
        premiums = [point[4] for point in points if point[0] == year and point[5]]
        if premiums:
            computing_medians.append([year, round(median(premiums), 4)])
    return points, computing_medians, baselines


def render(points, computing_medians, meta, tokens):
    colors = tokens["colors"]
    payload = json.dumps(points, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    medians = json.dumps(computing_medians, separators=(",", ":"))
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><meta name="description" content="Computing-titled degrees shifted from just below the yearly median salary in 2013 to more than a third above it in 2024."><title>The computing salary premium widened</title><style>
:root{{--bg:{colors['background']};--fg:{colors['foreground']};--muted:{colors['secondary']};--surface:{colors['surface']};--border:{colors['border']};--focus:{colors['focus']};--accent:{colors['selected']};--sans:{tokens['font_sans']};--mono:{tokens['font_mono']};color-scheme:light}}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 var(--sans)}}main,footer{{width:min(100% - 2rem,{tokens['content_width']});margin:auto}}main{{padding:clamp(2rem,6vw,4rem) 0 1.5rem}}h1{{max-width:18ch;margin:0 0 .75rem;font-size:clamp(2rem,7vw,4.5rem);line-height:1.02;letter-spacing:-.045em}}.method{{max-width:65ch;margin:0 0 1.5rem;color:var(--muted)}}.chart{{position:relative;border-top:1px solid var(--border);padding-top:1rem}}svg{{display:block;width:100%;height:auto;overflow:visible}}.grid{{stroke:var(--border);stroke-width:1}}.zero{{stroke:var(--muted);stroke-width:1.5}}.axis{{fill:var(--muted);font:14px var(--mono)}}.all{{fill:var(--muted);fill-opacity:.18}}.computing{{fill:var(--accent);fill-opacity:.72;stroke:var(--bg);stroke-width:1}}.trend{{fill:none;stroke:var(--accent);stroke-width:3}}.median{{fill:var(--bg);stroke:var(--accent);stroke-width:3}}circle:focus{{outline:none;stroke:var(--focus);stroke-width:3}}.legend{{display:flex;gap:1rem;flex-wrap:wrap;color:var(--muted);font:14px var(--mono)}}.legend i{{display:inline-block;width:.65rem;height:.65rem;margin-right:.35rem;border-radius:50%;background:var(--muted);opacity:.25}}.legend .c{{background:var(--accent);opacity:.75}}.tip{{position:absolute;z-index:2;max-width:min(22rem,100%);padding:.65rem .75rem;border:1px solid var(--border);border-radius:{tokens['radius']};background:var(--bg);box-shadow:0 .4rem 1.4rem #0002;pointer-events:none;font-size:.875rem}}.tip strong,.tip span{{display:block}}.tip span{{color:var(--muted)}}footer{{padding:1.5rem 0 2.5rem;border-top:1px solid var(--border);color:var(--muted);font-size:.875rem}}
</style></head><body><main><h1>A computing title moved from -0.6% in 2013 to +36.4% in 2024.</h1><p class="method">Each dot is a degree's gross monthly median salary relative to the median for its survey year. "Computing title" means the degree name contains the word "computing". Hover, tap, or focus a dot for its source value.</p><section class="chart" aria-label="Gross monthly median salary premium by survey year"><svg id="chart" viewBox="0 0 960 560" role="img"><title>Salary premium for all degrees and computing-titled degrees from 2013 to 2024</title><desc>Muted dots show all degrees. Highlighted dots show degrees with computing in the title. A line connects the annual median of highlighted dots.</desc></svg><div class="legend" aria-hidden="true"><span><i></i>All degrees</span><span><i class="c"></i>Computing title</span><span>Line is annual computing median</span></div><div id="tip" class="tip" hidden></div></section></main><footer>Source: {escape(meta['source'])}. Retrieved {meta['fetched']}.</footer><script>
const rows={payload},medians={medians},svg=document.querySelector("#chart"),tip=document.querySelector("#tip"),NS="http://www.w3.org/2000/svg",years=[...new Set(rows.map(d=>d[0]))].sort((a,b)=>a-b),premiums=rows.map(d=>d[4]),lo=Math.floor(Math.min(-10,...premiums)/10)*10,hi=Math.ceil(Math.max(50,...premiums)/10)*10,add=(name,attrs,parent=svg)=>{{const node=document.createElementNS(NS,name);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);parent.append(node);return node}},text=(value,xv,yv,anchor="middle")=>{{const node=add("text",{{x:xv,y:yv,class:"axis","text-anchor":anchor}});node.textContent=value;return node}};let W,H,M,x,y,pointNodes,activePoint;
function draw(){{svg.replaceChildren();hide();W=Math.max(300,Math.round(svg.getBoundingClientRect().width));const narrow=W<560;H=narrow?440:560;M={{t:24,r:narrow?14:28,b:54,l:narrow?54:72}};svg.setAttribute("viewBox",`0 0 ${{W}} ${{H}}`);x=v=>M.l+(v-years[0])/(years.at(-1)-years[0])*(W-M.l-M.r);y=p=>M.t+(hi-p)/(hi-lo)*(H-M.t-M.b);
for(let value=lo;value<=hi;value+=20){{add("line",{{x1:M.l,x2:W-M.r,y1:y(value),y2:y(value),class:value===0?"zero":"grid"}});text(`${{value>0?"+":""}}${{value}}%`,M.l-10,y(value)+4,"end")}}const step=narrow?2:1;for(const year of years){{add("line",{{x1:x(year),x2:x(year),y1:H-M.b,y2:H-M.b+5,class:"grid"}});if((year-years[0])%step===0)text(year,x(year),H-M.b+24)}}text(narrow?"Premium vs. yearly median":"Premium versus each year's dataset median",M.l,M.t-7,"start");
const path=medians.map((d,i)=>`${{i?"L":"M"}}${{x(d[0])}},${{y(d[1])}}`).join(" ");add("path",{{d:path,class:"trend"}});for(const d of medians)add("circle",{{cx:x(d[0]),cy:y(d[1]),r:6,class:"median"}});
pointNodes=[];activePoint=undefined;for(const [index,d] of rows.entries()){{const jitter=((d[2].split("").reduce((n,c)=>n+c.charCodeAt(0),0)%101)-50)/100*15,node=add("circle",{{cx:x(d[0])+jitter,cy:y(d[4]),r:d[5]?4.5:2.4,class:d[5]?"computing":"all",tabindex:index===0?"0":"-1","aria-label":`${{d[2]}}, ${{d[0]}}, ${{d[4]>=0?"plus ":""}}${{d[4].toFixed(1)}} percent`}});node.datum=d;pointNodes.push(node);node.addEventListener("pointerenter",e=>{{if(e.pointerType==="mouse")show(node,d)}});node.addEventListener("pointerleave",e=>{{if(e.pointerType==="mouse")hide()}});node.addEventListener("focus",()=>{{if(activePoint&&activePoint!==node)activePoint.tabIndex=-1;node.tabIndex=0;activePoint=node;show(node,d)}});node.addEventListener("blur",hide);node.addEventListener("keydown",event=>{{const moves={{ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}},move=moves[event.key];let next=move===undefined?null:(index+move+pointNodes.length)%pointNodes.length;if(event.key==="Home")next=0;if(event.key==="End")next=pointNodes.length-1;if(next===null)return;event.preventDefault();pointNodes[next].focus()}})}}activePoint=pointNodes[0]}}
function tipLine(tag,value){{const node=document.createElement(tag);node.textContent=value;tip.append(node)}}function show(node,d){{tip.replaceChildren();tipLine("strong",d[2]);tipLine("span",`${{d[1]}} · ${{d[0]}}`);tipLine("span",`$${{Math.round(d[3]).toLocaleString()}} gross monthly median · ${{d[4]>=0?"+":""}}${{d[4].toFixed(1)}}%`);tip.hidden=false;const box=document.querySelector(".chart").getBoundingClientRect(),point=node.getBoundingClientRect();tip.style.left=`${{Math.max(0,Math.min(point.left-box.left+12,box.width-tip.offsetWidth))}}px`;tip.style.top=`${{Math.max(0,point.top-box.top-tip.offsetHeight-8)}}px`}}function hide(){{tip.hidden=true}}
svg.addEventListener("click",event=>{{const box=svg.getBoundingClientRect(),scale=W/box.width,px=(event.clientX-box.left)*scale,py=(event.clientY-box.top)*scale;let best,gap=(event.pointerType==="mouse"?8:22)*scale;for(const node of pointNodes){{const dist=Math.hypot(node.cx.baseVal.value-px,node.cy.baseVal.value-py)-node.r.baseVal.value;if(dist<gap){{gap=dist;best=node}}}}if(best)show(best,best.datum);else hide()}});
addEventListener("resize",()=>{{if(Math.abs(svg.getBoundingClientRect().width-W)>1)draw()}});draw();
const result=value=>({{content:[{{type:"text",text:JSON.stringify(value)}}]}}),mc=(typeof document!=="undefined"&&document.modelContext)||(typeof navigator!=="undefined"&&navigator.modelContext);mc?.registerTool({{name:"get_data",description:"Return the plotted salary-premium rows.",inputSchema:{{type:"object",properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return result({{columns:["year","university","degree","gross_monthly_median","year_premium_percent","computing_title"],rows,total:rows.length,truncated:false}})}}}});mc?.registerTool({{name:"get_metadata",description:"Return the chart claim, method, and annual computing medians.",inputSchema:{{type:"object",properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return result({{claim:"A computing title moved from -0.6% in 2013 to +36.4% in 2024.",measure:"gross monthly median relative to each survey year's dataset median",computing_title_rule:"degree contains computing, case-insensitive",medians,truncated:false}})}}}});mc?.registerTool({{name:"query",description:"Filter plotted rows by year or computing-title membership.",inputSchema:{{type:"object",properties:{{year:{{type:"integer"}},computing_title:{{type:"boolean"}}}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(input={{}}){{const matches=rows.filter(d=>(input.year===undefined||d[0]===input.year)&&(input.computing_title===undefined||d[5]===input.computing_title));return result({{columns:["year","university","degree","gross_monthly_median","year_premium_percent","computing_title"],rows:matches,total:matches.length,truncated:false}})}}}});
</script></body></html>\n'''


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
        cards.append(f'<article><h2><a href="viz/{slug}/index.html">{escape(title.group(1))}</a></h2><p>{escape(summary.group(1))}</p><small>Source date: {escape(meta["fetched"])}</small></article>')
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Visuals</title><style>body{{max-width:45rem;margin:3rem auto;padding:0 1rem;font:16px/1.6 system-ui;color:#1d1d1f}}a{{color:inherit;text-underline-offset:.18em}}article{{padding:1.5rem 0;border-top:1px solid #d2d2d7}}h1,h2{{line-height:1.2}}small{{font-size:.875rem}}h2 a{{display:inline-block;padding:.5rem 0}}</style></head><body><main><h1>Visuals</h1><p>Standalone, source-backed data visualizations.</p>{''.join(cards)}</main></body></html>\n'''


def verify(rows, points, computing_medians, meta):
    assert len(rows) == 1550 and list(rows[0]) == FIELDS
    assert all(set(row) == set(FIELDS) for row in rows)
    assert len(points) == sum(number(row["gross_monthly_median"]) is not None for row in rows)
    endpoint = {year: premium for year, premium in computing_medians}
    assert round(endpoint[2013], 1) == -0.6 and round(endpoint[2024], 1) == 36.4
    assert all(point[5] == ("computing" in point[2].casefold()) for point in points)
    html = VIZ.read_text()
    assert html.count("<h1>") == 1 and html.count("<svg") == 1
    assert html.count("<script") == 1 and "<script src=" not in html
    assert not re.search(r'''(?:src|href)=["']https?://''', html)
    assert "d3" not in html.casefold() and "cdn" not in html.casefold()
    assert "pointerenter" in html and 'addEventListener("focus"' in html
    assert 'tabindex:index===0?"0":"-1"' in html and 'event.key==="Home"' in html
    assert ".innerHTML" not in html and "node.textContent=value" in html
    assert html.count("mc?.registerTool") == 3 and html.count("readOnlyHint:true") == 3
    assert f'href="viz/{SLUG}/index.html"' in GALLERY.read_text()
    assert meta == {"slug": SLUG, "source": "Singapore Graduate Employment Survey", "fetched": "2026-09-27", "key_file_used": False}
    poison = points[0].copy()
    poison[1] = '<img src=x onerror="alert(1)">'
    poison[2] = '</script><img src=x onerror="alert(2)">'
    adversarial = render([poison], [[poison[0], poison[4]]], meta, json.loads(TOKENS.read_text()))
    assert adversarial.count("</script>") == 1
    assert '<\\/script><img src=x onerror=\\"alert(2)\\">' in adversarial
    assert ".innerHTML" not in adversarial and "node.textContent=value" in adversarial
    print(f"verified: {len(rows)} source rows, {len(points)} salary points, 2013 -0.6%, 2024 +36.4%, one inline SVG, zero external assets")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    with RAW.open(newline="", encoding="utf-8-sig") as source:
        rows = list(csv.DictReader(source))
    meta = json.loads(META.read_text())
    tokens = json.loads(TOKENS.read_text())
    points, computing_medians, _ = prepare(rows)
    if not args.verify:
        VIZ.parent.mkdir(parents=True, exist_ok=True)
        VIZ.write_text(render(points, computing_medians, meta, tokens))
        GALLERY.write_text(render_gallery())
    verify(rows, points, computing_medians, meta)


if __name__ == "__main__":
    main()
