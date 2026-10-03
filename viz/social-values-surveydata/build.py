#!/usr/bin/env python3
import argparse
import csv
import json
import re
import sys
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from page_parts import deck_buttons_js  # noqa: E402
from style_guide import THEME_SCRIPT, root_css  # noqa: E402

SLUG = "social-values-surveydata"
RAW = HERE / "raw.csv"
META = HERE / "meta.json"
TOKENS = ROOT / "design-tokens.json"
VIZ = HERE / "index.html"
TEMPLATE = HERE / "beamdswitch.js"
REPORT = HERE / "report.js"
SOURCE_URL = "https://data.gov.sg/datasets/d_05fffefe9045d234eb140d7db0acdeb9/view"
AGE_ORDER = ["16-19", "20-24", "25-34", "35-44", "45-54", "55-64", "65-75"]
COLUMNS = [
    "age_group", "weighted_n", "connection_mean", "future_mean",
    "connection_share_8_10", "future_share_8_10",
]

DECK_HTML = '<div class="deck-row"><button type="button" id="save-beamdswitch" title="Save a narrated Markdown talk about these scores, to open in beamdswitch">beamdswitch</button><button type="button" id="copy-beamdswitch" title="Copy the narrated Markdown talk, to paste into beamdswitch">Copy deck</button><span id="deck-status" class="deck-status" role="status"></span></div><p class="deck-hint">The beamdswitch button saves this chart as a narrated talk: a Markdown deck with the data, method, results and checks, every number as shown here, and a spoken narration on every slide. Open it in <a href="https://teoyujie.org/visuals/beamdswitch/">beamdswitch</a> to get slides, a handout, narration and a video. Copy deck puts the same deck on the clipboard, to paste into beamdswitch if the download does not arrive.</p>'
# The deck is built from the chart's rows: SocialValuesReport (report.js) fills the shared template (beamdswitch.js).
DECK_JS = """/* beamdswitch deck: the report template is beamdswitch.js; report.js fills it from the chart's rows. */
const deckStatus=document.querySelector("#deck-status"),deck=()=>Beamdswitch.deck(SocialValuesReport.report({rows,source_url:__SOURCE__,fetched:__FETCHED__}));
""" + deck_buttons_js(SLUG)


def score(value):
    return float(value.split(" ", 1)[0])


def aggregate(source_rows):
    rows = []
    for age in AGE_ORDER:
        group = [row for row in source_rows if row["age_2"].startswith(age)]
        weights = [float(row["weight"]) for row in group]
        weighted_n = sum(weights)
        values = []
        for field in ("outcome_connection", "outcome_future"):
            scores = [score(row[field]) for row in group]
            values.extend([
                sum(value * weight for value, weight in zip(scores, weights)) / weighted_n,
                sum(weight for value, weight in zip(scores, weights) if value >= 8) / weighted_n,
            ])
        rows.append([
            age, round(weighted_n, 3), round(values[0], 3), round(values[2], 3),
            round(values[1], 4), round(values[3], 4),
        ])
    return rows


def render(rows, meta, tokens):
    payload = json.dumps(rows, separators=(",", ":")).replace("</", "<\\/")
    deck_js = DECK_JS.replace("__SOURCE__", json.dumps(meta["source_url"])).replace("__FETCHED__", json.dumps(meta["fetched"]))
    template, report = TEMPLATE.read_text(), REPORT.read_text()
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><meta name="description" content="Older Singapore residents report stronger connection to the country but less interest in shaping its future, widening the gap from 0.09 to 1.07 points."><title>Connection rises as appetite to shape the future falls</title>{THEME_SCRIPT}<style>
{root_css(tokens, "--connection:var(--hl);--future:var(--c1)")}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 var(--sans);letter-spacing:-.011em;-webkit-font-smoothing:antialiased}}a{{color:var(--focus)}}main,footer{{width:min(100% - 2rem,{tokens['content_width']});margin:auto}}main{{padding:clamp(1.25rem,5vw,3rem) 0 1.5rem}}h1{{max-width:20ch;margin:.35rem 0 .8rem;font-size:clamp(2rem,6vw,3.25rem);font-weight:700;line-height:1.04;letter-spacing:-.045em}}.method,.caveat{{max-width:72ch;color:var(--muted)}}.chart{{position:relative;margin-top:1.75rem;border-top:1px solid var(--border);padding-top:1rem}}svg{{display:block;width:100%;height:auto;overflow:visible}}.grid{{stroke:var(--grid)}}.link{{stroke:var(--border);stroke-width:5;stroke-linecap:round}}.connection{{fill:var(--connection)}}.future{{fill:var(--future)}}.mark{{cursor:pointer;stroke:var(--bg);stroke-width:3}}.mark:focus{{outline:none;stroke:var(--focus);stroke-width:5}}.axis,.label,.value{{fill:var(--muted);font:14px var(--mono);font-variant-numeric:tabular-nums}}.label{{fill:var(--fg);font-weight:600}}.value{{font-size:13px}}.legend{{display:flex;gap:1.25rem;flex-wrap:wrap;color:var(--muted);font:14px var(--mono)}}.legend i{{display:inline-block;width:.7rem;height:.7rem;margin-right:.35rem;border-radius:50%;background:var(--connection)}}.legend .future-key{{background:var(--future)}}.tip{{position:absolute;z-index:2;max-width:min(20rem,100%);padding:.7rem .8rem;border:1px solid var(--border);border-radius:{tokens['radius']};background:var(--surface);box-shadow:0 8px 24px rgb(0 0 0 / .16);pointer-events:none;font-size:.875rem}}.tip strong,.tip span{{display:block}}.tip span{{color:var(--muted)}}.caveat{{margin-top:1.5rem;font-size:.875rem}}.deck-row{{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-top:1rem}}.deck-row button{{min-height:2.75rem;padding:.25rem .9rem;border:1px solid var(--control);border-radius:999px;background:var(--bg);color:var(--fg);font:inherit;font-size:.875rem;cursor:pointer}}.deck-row button:hover{{background:var(--surface)}}.deck-row button:focus-visible,.deck-hint a:focus-visible{{outline:2px solid var(--focus);outline-offset:2px}}.deck-status,.deck-hint{{color:var(--muted);font-size:.875rem}}.deck-hint{{max-width:72ch;margin:.5rem 0 0}}footer{{padding:1.5rem 0 2.5rem;border-top:1px solid var(--border);color:var(--muted);font-size:.875rem}}footer a{{display:inline-block;padding:.7rem 0}}
</style></head><body><main><h1>Older residents feel more connected, but less interested in shaping Singapore’s future.</h1><p class="method">Weighted mean scores on two 0–10 questions. The gap grows from 0.09 points among ages 16–19 to 1.07 among ages 65–75. Hover, tap, or focus a point for its mean, weighted sample, and share scoring 8–10.</p>{DECK_HTML}<section class="chart" aria-label="Connection and future-shaping scores by age group"><svg id="chart" viewBox="0 0 960 520" role="img"><title>Connection and desire to shape Singapore's future by age group</title><desc>Seven dumbbells compare weighted mean connection with weighted mean desire to shape the future. The gap is widest for ages 65 to 75.</desc></svg><div class="legend" aria-hidden="true"><span><i></i>Connection to Singapore</span><span><i class="future-key"></i>Desire to shape its future</span></div><div id="tip" class="tip" hidden></div></section><p class="caveat"><strong>Read as association, not cause.</strong> This cross-sectional survey cannot separate age from cohort, retirement, income, or questionnaire effects.</p></main><footer>Source: <a href="{escape(meta['source_url'])}">Singapore Social Values Survey</a>. Retrieved {meta['fetched']}.</footer><script id="beamdswitch">
{template}</script><script id="report">
{report}</script><script>
const columns={json.dumps(COLUMNS)},rows={payload},svg=document.querySelector("#chart"),tip=document.querySelector("#tip"),NS="http://www.w3.org/2000/svg",lo=6.5,hi=8.5,add=(name,attrs,parent=svg)=>{{const node=document.createElementNS(NS,name);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);parent.append(node);return node}},text=(value,xv,yv,klass,anchor="middle")=>{{const node=add("text",{{x:xv,y:yv,class:klass,"text-anchor":anchor}});node.textContent=value;return node}};
let W,H,M,x,y,narrow;
function line(tag,value){{const node=document.createElement(tag);node.textContent=value;tip.append(node)}}function show(target,row,kind){{tip.replaceChildren();line("strong",`${{row[0]}} · ${{kind}}`);const mean=kind==="Connection"?row[2]:row[3],share=kind==="Connection"?row[4]:row[5];line("span",`${{mean.toFixed(2)}} mean · ${{(share*100).toFixed(1)}}% scored 8–10`);line("span",`${{row[1].toFixed(1)}} weighted respondents`);tip.hidden=false;const box=document.querySelector(".chart").getBoundingClientRect(),point=target.getBoundingClientRect();tip.style.left=`${{Math.min(Math.max(0,point.left-box.left+14),box.width-tip.offsetWidth)}}px`;tip.style.top=`${{Math.max(0,point.top-box.top-tip.offsetHeight-8)}}px`}}function hide(){{tip.hidden=true}}
function draw(){{svg.replaceChildren();hide();W=Math.max(300,Math.round(svg.getBoundingClientRect().width));narrow=W<560;H=narrow?440:520;M=narrow?{{t:44,r:20,b:50,l:70}}:{{t:48,r:70,b:50,l:105}};svg.setAttribute("viewBox",`0 0 ${{W}} ${{H}}`);x=v=>M.l+(v-lo)/(hi-lo)*(W-M.l-M.r);y=i=>M.t+i*(H-M.t-M.b)/(rows.length-1);
for(let value=lo;value<=hi;value+=.5){{add("line",{{x1:x(value),x2:x(value),y1:M.t-20,y2:H-M.b+12,class:"grid"}});text(value.toFixed(1),x(value),H-M.b+34,"axis")}}text("Weighted mean score",M.l,M.t-29,"axis","start");
rows.forEach((row,index)=>{{const yy=y(index);text(row[0],M.l-(narrow?12:18),yy+5,"label","end");add("line",{{x1:x(row[3]),x2:x(row[2]),y1:yy,y2:yy,class:"link"}});[[2,"Connection","connection"],[3,"Future shaping","future"]].forEach(([field,kind,klass])=>{{const node=add("circle",{{cx:x(row[field]),cy:yy,r:narrow?12:9,class:`mark ${{klass}}`,tabindex:"0",role:"button","aria-label":`${{row[0]}}, ${{kind}}, mean ${{row[field].toFixed(2)}}`}});node.addEventListener("pointerenter",event=>{{if(event.pointerType==="mouse")show(node,row,kind)}});node.addEventListener("pointerleave",event=>{{if(event.pointerType==="mouse")hide()}});node.addEventListener("focus",()=>show(node,row,kind));node.addEventListener("blur",hide);node.addEventListener("click",()=>show(node,row,kind))}});if(!narrow){{text(`${{row[3].toFixed(2)}}`,x(row[3])-14,yy-14,"value","end");text(`${{row[2].toFixed(2)}}`,x(row[2])+14,yy-14,"value","start")}}}});}}
svg.addEventListener("click",event=>{{if(!event.target.classList.contains("mark"))hide()}});addEventListener("resize",()=>{{if(Math.abs(svg.getBoundingClientRect().width-W)>1)draw()}});draw();
{deck_js}
const result=value=>({{content:[{{type:"text",text:JSON.stringify(value)}}]}}),mc=(typeof document!=="undefined"&&document.modelContext)||(typeof navigator!=="undefined"&&navigator.modelContext);mc?.registerTool({{name:"get_data",description:"Return the seven weighted age-group aggregates shown in the chart.",inputSchema:{{type:"object",properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return result({{columns,rows,total:rows.length,truncated:false,next_steps:["Use query with an age_group to retrieve one row."]}})}}}});mc?.registerTool({{name:"get_metadata",description:"Return the chart claim, source, method, fields, and caveat.",inputSchema:{{type:"object",properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return result({{title:"Connection rises as appetite to shape the future falls",claim:"Older Singapore residents feel more connected to the country, but less interested in shaping its future.",source:{json.dumps(meta['source_url'])},fetched:{json.dumps(meta['fetched'])},method:"Weighted age-group means and weighted shares scoring 8–10 on two 0–10 outcomes.",columns,caveat:"Cross-sectional association cannot separate age, cohort, retirement, income, or questionnaire effects.",total:rows.length,truncated:false,next_steps:["Use get_data for all aggregates or query for one age group."]}})}}}});mc?.registerTool({{name:"query",description:"Return the aggregate for one age group, or all groups when no filter is supplied.",inputSchema:{{type:"object",properties:{{filter:{{type:"object",properties:{{age_group:{{type:"string",enum:{json.dumps(AGE_ORDER)}}}}},additionalProperties:false}}}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(input={{}}){{const age=input.filter?.age_group,matches=age?rows.filter(row=>row[0]===age):rows;return result({{columns,rows:matches,total:matches.length,truncated:false,next_steps:matches.length?["All matching age aggregates returned."]:["Use one of the seven age_group labels from get_data."]}})}}}});
</script></body></html>\n'''


def verify(source_rows, rows, meta):
    assert len(source_rows) == 3076 and len(source_rows[0]) == 120
    assert set(AGE_ORDER) == {row["age_2"].split(" years", 1)[0] for row in source_rows}
    assert all(row["outcome_connection"] and row["outcome_future"] and row["weight"] for row in source_rows)
    assert len(rows) == 7 and all(len(row) == len(COLUMNS) for row in rows)
    assert round(rows[0][2] - rows[0][3], 2) == 0.09
    assert round(rows[-1][2] - rows[-1][3], 2) == 1.07
    assert rows[-1][2] > rows[0][2] and rows[-1][3] < rows[0][3]
    assert meta == {"slug": SLUG, "source_url": SOURCE_URL, "fetched": "2026-09-27", "key_file_used": False}
    html = VIZ.read_text()
    assert html.count("<h1>") == 1 and html.count("<svg") == 1 and html.count("<section") == 1
    assert html == render(rows, meta, json.loads(TOKENS.read_text())), "the page is out of date; run the builder"
    assert html.count("<script") == 4 and THEME_SCRIPT in html and "<script src=" not in html
    assert f'<script id="beamdswitch">\n{TEMPLATE.read_text()}</script>' in html and f'<script id="report">\n{REPORT.read_text()}</script>' in html
    assert 'id="save-beamdswitch"' in html and 'id="copy-beamdswitch"' in html
    assert not re.search(r'''(?:src|href)=["']https?://''', html.replace(f'href="{SOURCE_URL}"', "").replace('href="https://teoyujie.org/visuals/beamdswitch/"', ""))
    assert html.count("mc?.registerTool") == 3 and html.count("readOnlyHint:true") == 3
    assert all(f'name:"{name}"' in html for name in ("get_data", "get_metadata", "query"))
    assert "pointerenter" in html and 'addEventListener("focus"' in html and 'addEventListener("click"' in html
    assert "cross-sectional survey cannot separate age from cohort, retirement, income, or questionnaire effects" in html
    print("verified: 3,076 source rows, 7 weighted age aggregates, gaps 0.09 and 1.07, one inline SVG, 3 read-only tools, a narrated beamdswitch deck, zero external assets")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    with RAW.open(newline="", encoding="utf-8-sig") as source:
        source_rows = list(csv.DictReader(source))
    meta = json.loads(META.read_text())
    rows = aggregate(source_rows)
    if not args.verify:
        VIZ.parent.mkdir(parents=True, exist_ok=True)
        VIZ.write_text(render(rows, meta, json.loads(TOKENS.read_text())))
    verify(source_rows, rows, meta)


if __name__ == "__main__":
    main()
