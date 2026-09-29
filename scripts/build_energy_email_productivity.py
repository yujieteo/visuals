#!/usr/bin/env python3
"""Builder and verifier for the energy-email-productivity visualization.

The page pairs a stylised circadian alertness curve (clearly labelled as a
summary of published chronobiology findings, not one dataset) with measured
email-interruption numbers from workplace studies. Every measured number is
grounded in a cited source recorded in data/<slug>/raw.json and meta.json.
"""
import argparse
import json
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = "energy-email-productivity"
RAW = ROOT / "data" / SLUG / "raw.json"
META = ROOT / "data" / SLUG / "meta.json"
TOKENS = ROOT / "design-tokens.json"
VIZ = ROOT / "viz" / SLUG / "index.html"
GALLERY = ROOT / "index.html"

# Stylised alertness anchors (hour, relative alertness 0-100), summarising the
# cited circadian pattern: a daytime rise, an early-to-mid afternoon dip, a
# late-afternoon peak, and an evening decline. Not a single measured dataset.
CURVE = [
    [8.0, 48], [9.0, 62], [10.0, 74], [11.0, 82], [12.0, 86],
    [13.0, 80], [14.0, 62], [15.0, 70], [16.0, 84], [17.0, 88], [18.0, 76],
]
DIP_START = 13.0
DIP_END = 15.0

# Marker anchors: energy markers sit on the curve (need an alertness value),
# email markers sit just above the email auto-check strip.
MARKER_POS = {
    "email-react-6s": {"h": 9.5, "channel": "email"},
    "email-recovery-64s": {"h": 11.0, "channel": "email"},
    "interrupt-stress": {"h": 13.5, "channel": "email"},
    "post-lunch-dip": {"h": 14.0, "a": 62, "channel": "energy"},
    "batch-3x": {"h": 15.5, "channel": "email"},
    "alertness-rhythm": {"h": 16.5, "a": 86, "channel": "energy"},
}
ORDER = [
    "email-react-6s", "email-recovery-64s", "interrupt-stress",
    "post-lunch-dip", "batch-3x", "alertness-rhythm",
]


def render(records, meta, tokens):
    colors = tokens["colors"]
    payload = json.dumps(records, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    curve_json = json.dumps(CURVE)
    pos_json = json.dumps(MARKER_POS)
    order_json = json.dumps(ORDER)

    seen = {}
    for r in records:
        seen.setdefault(r["source_url"], r["study"])
    source_links = "".join(
        f'<li><a href="{escape(url)}">{escape(study)}</a></li>'
        for url, study in seen.items()
    )
    noscript = "".join(
        f'<li><strong>{escape(r["label"])}</strong> — {escape(r["finding"])} '
        f'{escape(r["study"])} — {escape(r["venue"])}</li>'
        for r in records
    )

    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><meta name="description" content="A workday timeline pairs the circadian post-lunch dip with the measured reflex of email: 70% answered within 6 seconds, 64 seconds to refocus each time, and less stress when checks drop to three a day."><title>Your energy dips mid-afternoon. Your inbox doesn't.</title><style>
:root{{--bg:{colors['background']};--fg:{colors['foreground']};--muted:{colors['secondary']};--surface:{colors['surface']};--border:{colors['border']};--focus:{colors['focus']};--energy:{colors['selected']};--email:{colors['mark']};--sans:{tokens['font_sans']};--mono:{tokens['font_mono']};color-scheme:light}}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 var(--sans)}}main,footer{{width:min(100% - 2rem,{tokens['content_width']});margin:auto}}main{{padding:clamp(2rem,6vw,4rem) 0 1.5rem}}h1{{max-width:20ch;margin:0 0 .8rem;font-size:clamp(2rem,6vw,4rem);line-height:1.04;letter-spacing:-.045em}}.method{{max-width:70ch;color:var(--muted)}}.controls{{display:flex;align-items:center;gap:.75rem;margin:1.5rem 0 1rem;flex-wrap:wrap}}button{{font:inherit;cursor:pointer;border:1px solid var(--border);border-radius:.45rem;background:var(--bg);color:var(--fg);padding:.6rem .8rem;min-height:2.75rem}}button:hover{{background:var(--surface)}}button:focus-visible{{outline:3px solid var(--focus);outline-offset:2px}}.hint{{color:var(--muted);font-size:.9rem}}.chart{{border-top:1px solid var(--border);padding-top:1rem}}svg{{display:block;width:100%;height:auto}}.curve{{fill:none;stroke:var(--energy);stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}}.dip-band{{fill:var(--energy);opacity:.08}}.dip-label{{fill:var(--muted);font:600 12px var(--mono)}}.curve-label,.axis,.strip-label{{fill:var(--muted);font:12px var(--mono)}}.strip-line{{stroke:var(--border)}}.tick{{stroke:var(--email);opacity:.4}}.mark{{cursor:pointer;stroke:var(--bg);stroke-width:2}}.mark.energy{{fill:var(--energy)}}.mark.email{{fill:var(--email)}}.mark:focus{{outline:none;stroke:var(--focus);stroke-width:5}}.mark.sel{{stroke:var(--fg);stroke-width:3}}.mark-num{{fill:#fff;font:700 11px var(--mono);text-anchor:middle;pointer-events:none}}.hit{{cursor:pointer}}.detail{{min-height:6rem;margin-top:1rem;padding:1rem;border:1px solid var(--border);border-radius:.5rem}}.detail h2{{margin:0 0 .25rem;font-size:1.15rem}}.detail p{{margin:.35rem 0}}.detail a{{display:inline-block;padding:.5rem 0;color:inherit;text-underline-offset:.18em}}footer{{padding:1.5rem 0 2.5rem;border-top:1px solid var(--border);color:var(--muted);font-size:.875rem}}footer ul{{list-style:none;padding:0;margin:.5rem 0}}footer a{{display:inline-block;padding:.6rem 0;color:inherit;text-underline-offset:.18em}}@media(max-width:700px){{.detail a{{padding:.5rem 0}}footer a{{padding:.7rem 0}}}}@media(prefers-reduced-motion:reduce){{*{{scroll-behavior:auto!important;transition:none!important;animation:none!important}}}}
</style></head><body><main><h1>Your energy dips mid-afternoon. Your inbox doesn't.</h1><p class="method">The red curve is a <strong>stylised summary</strong> of published circadian findings, not one dataset: alertness rises through the morning, dips in the early-to-mid afternoon, and peaks again in the late afternoon. The blue strip is the measured email reflex from a workplace study: inboxes left to auto-check roughly every five minutes. Chronotype shifts this timing earlier or later by person. Select a numbered point to read the measured number and its source.</p><div class="controls"><button id="reset" type="button">Reset view</button><span class="hint">Tab or tap a numbered point.</span></div><section class="chart" aria-label="Workday alertness curve with email interruption strip"><svg id="chart" viewBox="0 0 960 560" role="img"><title>Stylised alertness across a workday, with email auto-checks every five minutes</title><desc>A red curve rises through the morning, dips in the early afternoon, and peaks in the late afternoon. A blue strip marks email checks every five minutes. Six numbered points open measured findings and citations.</desc></svg></section><article id="detail" class="detail" aria-live="polite"><h2>Two pitfalls, one fix</h2><p>Pitfall one: your energy follows a circadian rhythm with a mid-afternoon dip. Pitfall two: email keeps interrupting on its own schedule — most of it answered within seconds, each one costing about a minute to recover. The fix in the studies: check email a few fixed times a day instead of reacting all day.</p><p>Select a numbered point to see the measured number and its source.</p></article><noscript><ol>{noscript}</ol></noscript></main><footer>Sources: the energy curve is a stylised summary; the email numbers are measured in the cited studies.<ul>{source_links}</ul>Retrieved {escape(meta['fetched'])}.</footer><script>
const data={payload},curve={curve_json},pos={pos_json},order={order_json},svg=document.querySelector("#chart"),detail=document.querySelector("#detail"),resetBtn=document.querySelector("#reset"),NS="http://www.w3.org/2000/svg",START=8,END=18,reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
const add=(n,a,p=svg)=>{{const e=document.createElementNS(NS,n);for(const [k,v] of Object.entries(a))e.setAttribute(k,v);p.append(e);return e}};
const text=(v,x,y,c="axis",an="start")=>{{const e=add("text",{{x:x,y:y,class:c,"text-anchor":an}});e.textContent=v;return e}};
const byId=Object.fromEntries(data.map(r=>[r.id,r]));
let W,H,M,plotTop,plotBottom,tickTop,narrow,selected=null,marks={{}};
const xh=h=>M.l+(h-START)/(END-START)*(W-M.l-M.r);
const yv=a=>plotTop+(100-a)/100*(plotBottom-plotTop);
function smoothPath(pts){{if(pts.length<2)return "";let d="M "+pts[0].x+" "+pts[0].y;for(let i=0;i<pts.length-1;i++){{const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];const c1x=p1.x+(p2.x-p0.x)/6,c1y=p1.y+(p2.y-p0.y)/6,c2x=p2.x-(p3.x-p1.x)/6,c2y=p2.y-(p3.y-p1.y)/6;d+=" C "+c1x+" "+c1y+", "+c2x+" "+c2y+", "+p2.x+" "+p2.y}}return d}}
function defaultDetail(){{detail.replaceChildren();const h=document.createElement("h2");h.textContent="Two pitfalls, one fix";const p1=document.createElement("p");p1.textContent="Pitfall one: your energy follows a circadian rhythm with a mid-afternoon dip. Pitfall two: email keeps interrupting on its own schedule — most of it answered within seconds, each one costing about a minute to recover. The fix in the studies: check email a few fixed times a day instead of reacting all day.";const p2=document.createElement("p");p2.textContent="Select a numbered point to see the measured number and its source.";detail.append(h,p1,p2)}}
function show(r){{selected=r.id;for(const [id,m] of Object.entries(marks))m.classList.toggle("sel",id===r.id);detail.replaceChildren();const h=document.createElement("h2");h.textContent=(order.indexOf(r.id)+1)+" · "+r.label;const f=document.createElement("p");f.textContent=r.finding;const s=document.createElement("p");s.textContent=r.study+" "+r.venue;detail.append(h,f);if(r.value){{const v=document.createElement("p");const b=document.createElement("strong");b.textContent=r.value;v.append(b);detail.append(v)}}detail.append(s);const a=document.createElement("a");a.href=r.source_url;a.rel="noopener noreferrer";a.target="_blank";a.textContent="Open source";detail.append(a);if(narrow&&!reduced)detail.scrollIntoView({{block:"nearest",behavior:"smooth"}})}}
function reset(){{selected=null;for(const m of Object.values(marks))m.classList.remove("sel");defaultDetail()}}
function draw(){{svg.replaceChildren();W=Math.max(300,Math.round(svg.getBoundingClientRect().width));narrow=W<700;M=narrow?{{t:50,r:14,b:56,l:14}}:{{t:44,r:36,b:58,l:36}};const bandH=44,gap=20;H=560;plotTop=M.t+24;tickTop=H-M.b-bandH;plotBottom=tickTop-gap;svg.setAttribute("viewBox","0 0 "+W+" "+H);marks={{}};
add("rect",{{x:xh(13),y:plotTop,width:xh(15)-xh(13),height:plotBottom-plotTop,class:"dip-band"}});
const pts=curve.map(p=>({{x:xh(p[0]),y:yv(p[1])}}));add("path",{{d:smoothPath(pts),class:"curve"}});
text("alertness (stylised)",M.l,plotTop-4,"axis","start");
text("rises through the morning",xh(10),plotTop+14,"curve-label","middle");
text("post-lunch dip",xh(14),plotTop+32,"dip-label","middle");
text("late-afternoon peak",xh(16.9),yv(95)-4,"curve-label","middle");
add("line",{{x1:M.l,x2:W-M.r,y1:tickTop,y2:tickTop,class:"strip-line"}});
for(let h=START;h<=END;h+=5/60)add("line",{{x1:xh(h),x2:xh(h),y1:tickTop,y2:tickTop+10,class:"tick"}});
text("inbox auto-check ≈ every 5 min",W-M.r,tickTop+bandH-6,"strip-label","end");
for(let h=START;h<=END;h+=2)text(h+":00",xh(h),H-18,"axis","middle");
order.forEach((id,idx)=>{{const r=byId[id],p=pos[id],cy=p.channel==="energy"?yv(p.a):tickTop-6;const hit=add("circle",{{cx:xh(p.h),cy:cy,r:22,class:"hit",fill:"transparent"}});const m=add("circle",{{cx:xh(p.h),cy:cy,r:11,class:"mark "+(p.channel==="energy"?"energy":"email"),tabindex:"0",role:"button","aria-label":(idx+1)+" · "+r.label}});add("text",{{x:xh(p.h),y:cy+4,class:"mark-num"}}).textContent=idx+1;marks[r.id]=m;hit.addEventListener("click",()=>show(r));m.addEventListener("click",()=>show(r));m.addEventListener("focus",()=>show(r));m.addEventListener("keydown",e=>{{if(e.key==="Enter"||e.key===" "){{e.preventDefault();show(r)}}if(e.key==="Escape")reset()}})}});
if(selected&&marks[selected])marks[selected].classList.add("sel")}}
resetBtn.addEventListener("click",reset);document.addEventListener("keydown",e=>{{if(e.key==="Escape")reset()}});addEventListener("resize",()=>{{if(Math.abs(svg.getBoundingClientRect().width-W)>1)draw()}});
defaultDetail();draw();
const result=value=>({{content:[{{type:"text",text:JSON.stringify(value)}}]}}),mc=(typeof document!=="undefined"&&document.modelContext)||(typeof navigator!=="undefined"&&navigator.modelContext);
mc?.registerTool({{name:"get_data",description:"Return the six evidence records backing the chart.",inputSchema:{{type:"object",properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return result({{rows:data,total:data.length,truncated:false,next_steps:["Use query with kind energy or email."]}})}}}});
mc?.registerTool({{name:"get_metadata",description:"Return the claim, method, sources, and caveat.",inputSchema:{{type:"object",properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return result({{title:document.title,claim:"Your energy dips mid-afternoon. Your inbox doesn't.",method:"Stylised circadian alertness curve alongside measured email-interruption numbers.",sources:{json.dumps(meta['sources'])},fetched:{json.dumps(meta['fetched'])},caveat:"The curve is a stylised summary of published circadian findings, not one dataset; chronotype shifts its timing by person.",truncated:false}})}}}});
mc?.registerTool({{name:"query",description:"Filter evidence records by kind (energy or email).",inputSchema:{{type:"object",properties:{{kind:{{type:"string",enum:["energy","email"]}}}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(input={{}}){{const matches=input.kind?data.filter(r=>r.kind===input.kind):data;return result({{rows:matches,total:matches.length,truncated:false,next_steps:matches.length?["All matching records returned."]:["Use kind energy or email."]}})}}}});
</script></body></html>\n'''


def render_gallery():
    cards = []
    for page in sorted((ROOT / "viz").glob("*/index.html")):
        html = page.read_text(encoding="utf-8")
        title = re.search(r"<title>(.*?)</title>", html, re.S)
        summary = re.search(r'<meta name="description" content="(.*?)">', html, re.S)
        if not title or not summary:
            continue
        slug = page.parent.name
        meta = json.loads((ROOT / "data" / slug / "meta.json").read_text(encoding="utf-8"))
        cards.append(f'<article><h2><a href="viz/{slug}/index.html">{escape(title.group(1))}</a></h2><p>{escape(summary.group(1))}</p><small>Source date: {escape(meta["fetched"])}</small></article>')
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Visuals</title><style>body{{max-width:45rem;margin:3rem auto;padding:0 1rem;font:16px/1.6 system-ui;color:#1d1d1f}}a{{color:inherit;text-underline-offset:.18em}}article{{padding:1.5rem 0;border-top:1px solid #d2d2d7}}h1,h2{{line-height:1.2}}small{{font-size:.875rem}}h2 a{{display:inline-block;padding:.5rem 0}}</style></head><body><main><h1>Visuals</h1><p>Standalone, source-backed data visualizations.</p>{''.join(cards)}</main></body></html>\n'''


EXPECTED_META = {
    "slug": SLUG,
    "source_url": "https://www.interruptions.net/literature/Jackson-JOSIT-01.pdf",
    "sources": [
        "https://pubmed.ncbi.nlm.nih.gov/15892914/",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC10683050/",
        "https://www.interruptions.net/literature/Jackson-JOSIT-01.pdf",
        "https://dl.acm.org/doi/10.1145/1357054.1357072",
        "https://www.sciencedirect.com/science/article/pii/S0747563214005810",
    ],
    "fetched": "2026-09-29",
    "key_file_used": False,
}


def verify(records, meta):
    ids = {r["id"] for r in records}
    assert ids == {"post-lunch-dip", "alertness-rhythm", "email-react-6s", "email-recovery-64s", "interrupt-stress", "batch-3x"}
    assert len(records) == 6
    assert [r for r in records if r["role"] == "measured"] and len([r for r in records if r["role"] == "measured"]) == 4
    assert [r for r in records if r["role"] == "curve"] and len([r for r in records if r["role"] == "curve"]) == 2
    assert meta == EXPECTED_META
    joined = " ".join(f'{r["finding"]} {r["value"]}'.lower() for r in records)
    for needle in ("6 seconds", "64 seconds", "three times", "post-lunch dip", "90-minute"):
        assert needle in joined, needle

    html = VIZ.read_text(encoding="utf-8")
    assert html.count("<h1>") == 1 and html.count("<svg") == 1 and html.count("<script") == 1
    assert "<script src=" not in html and "<link rel=\"stylesheet\"" not in html
    assert html.count("mc?.registerTool") == 3 and html.count("readOnlyHint:true") == 3
    for name in ("get_data", "get_metadata", "query"):
        assert f'name:"{name}"' in html
    assert "stylised" in html.lower() and "post-lunch dip" in html.lower()
    assert "70%" in html and "64 seconds" in html and "three times" in html
    assert "matchMedia" in html and "prefers-reduced-motion" in html
    stripped = html
    for url in meta["sources"]:
        stripped = stripped.replace(url, "")
    assert not re.search(r'''(?:src|href)=["']https?://''', stripped)
    assert f'href="viz/{SLUG}/index.html"' in GALLERY.read_text(encoding="utf-8")
    print("verified: 6 evidence records (4 measured, 2 curve sources), one inline SVG, one stylised curve, 3 read-only tools, zero external assets")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    records = json.loads(RAW.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    if not args.verify:
        VIZ.parent.mkdir(parents=True, exist_ok=True)
        VIZ.write_text(render(records, meta, json.loads(TOKENS.read_text(encoding="utf-8"))), encoding="utf-8")
        GALLERY.write_text(render_gallery(), encoding="utf-8")
    verify(records, meta)


if __name__ == "__main__":
    main()
