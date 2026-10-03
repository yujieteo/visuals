#!/usr/bin/env python3
"""Build four compact, source-backed stock fundamentals visualizations."""
import argparse
import json
from html import escape
from pathlib import Path

from gallery import write_gallery
from page_parts import strip_types
from style_guide import THEME_SCRIPT, root_css

ROOT = Path(__file__).resolve().parents[1]
# The narrated report: the site's standard beamdswitch template, copied unchanged into each page's
# folder, and the stock report that fills it from the page's rows. Both are inlined verbatim.
REPORT_JS = ROOT / "scripts" / "templates" / "stock-cases-report.js"
TOKENS = json.loads((ROOT / "design-tokens.json").read_text())
DECK_HINT = ("The beamdswitch button saves the measure you pick below as a narrated talk: a Markdown deck with the data, "
             "method, results and checks, every number as shown here, and a spoken narration on every slide. Open it in "
             '<a href="https://teoyujie.org/visuals/beamdswitch/">beamdswitch</a> to get slides, a handout, narration and a video. '
             "Copy deck puts the same deck on the clipboard, to paste into beamdswitch.")
SEC = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
CASES = {
    "panw": {
        "name": "Palo Alto Networks", "title": "Palo Alto Networks cash conversion", "ticker": "PANW", "cik": 1327567,
        "headline": "Palo Alto Networks’ cash generation has stayed above 39% of revenue as its security platform scales.",
        "competitors": "CrowdStrike, Fortinet, Cisco and Zscaler compete across endpoint, network and cloud security.",
        "macro": "Enterprise security budgets, cloud adoption and breach risk support demand. IT-budget pauses and vendor consolidation are counterweights.",
        "swot": "Strength: platform breadth. Weakness: execution across many products. Opportunity: AI security. Threat: intense platform competition.",
    },
    "marvell": {
        "name": "Marvell", "title": "Marvell cash conversion", "ticker": "MRVL", "cik": 1835632,
        "headline": "Marvell’s revenue rebounded in fiscal 2026, while operating cash flow remained a smaller share of sales than at the prior peak.",
        "competitors": "Broadcom, Nvidia, AMD, Intel and custom-silicon suppliers compete in data-center and networking semiconductors.",
        "macro": "AI data-center capex and networking upgrades can lift demand. Semiconductor inventory cycles and concentrated customers add volatility.",
        "swot": "Strength: data-infrastructure portfolio. Weakness: cyclicality. Opportunity: custom AI silicon. Threat: pricing and execution pressure from larger rivals.",
    },
    "airbnb": {
        "name": "Airbnb", "title": "Airbnb cash conversion", "ticker": "ABNB", "cik": 1559720,
        "headline": "Airbnb’s revenue has grown while operating cash flow has remained above one-third of sales in each of the latest four years.",
        "competitors": "Booking Holdings, Expedia, hotels and local vacation-rental platforms compete for guests, hosts and marketing traffic.",
        "macro": "Disposable income, cross-border travel and currency movements shape bookings. Regulation and a softer travel cycle can constrain supply and demand.",
        "swot": "Strength: global host network. Weakness: regulatory exposure. Opportunity: underpenetrated international travel. Threat: hotel and OTA competition.",
    },
    "arm": {
        "name": "Arm", "title": "Arm cash conversion", "ticker": "ARM", "cik": 1973239,
        "headline": "Arm’s fiscal 2026 revenue reached $4.92B and operating cash flow margin rose to 31.0% after a fiscal 2025 dip.",
        "competitors": "RISC-V ecosystems, Intel, AMD and architecture-license alternatives compete for computing design wins.",
        "macro": "Smartphone replacement, cloud capex and AI inference broaden chip-design demand. Royalty timing and customer concentration can move results sharply.",
        "swot": "Strength: pervasive instruction-set ecosystem. Weakness: licensing concentration. Opportunity: data-center CPUs and edge AI. Threat: RISC-V adoption.",
    },
}
REVENUE = "RevenueFromContractWithCustomerExcludingAssessedTax"
CASH = "NetCashProvidedByUsedInOperatingActivities"


def annual_facts(raw, tag):
    """Choose the newest annual filing for each fiscal-year end."""
    units = raw["facts"]["us-gaap"][tag]["units"]["USD"]
    annual = [x for x in units if x.get("fp") == "FY" and x.get("form") in {"10-K", "20-F"} and x.get("start")]
    by_end = {}
    for fact in annual:
        old = by_end.get(fact["end"])
        if old is None or fact.get("filed", "") > old.get("filed", ""):
            by_end[fact["end"]] = fact
    return by_end


def rows_for(slug, case):
    raw = json.loads((ROOT / "data" / slug / "raw.json").read_text())
    revenue, cash = annual_facts(raw, REVENUE), annual_facts(raw, CASH)
    ends = sorted(set(revenue) & set(cash))[-4:]
    assert len(ends) == 4, f"{slug}: expected four annual revenue and cash-flow pairs"
    rows = []
    for end in ends:
        rev, ocf = revenue[end], cash[end]
        rows.append({"fy": end[:4], "end": end, "revenue": rev["val"], "operating_cash_flow": ocf["val"],
                     "cash_margin": round(100 * ocf["val"] / rev["val"], 1), "filed": max(rev["filed"], ocf["filed"])})
    return raw, rows


def toon(rows):
    return "fy|revenue_usd|operating_cash_flow_usd|cash_margin_pct\\n" + "\\n".join(
        f"{r['fy']}|{r['revenue']}|{r['operating_cash_flow']}|{r['cash_margin']}" for r in rows)


def deck_case(case, raw, rows, fetched):
    """The page's own words and rows, as the stock report reads them."""
    keys = ("name", "title", "ticker", "headline", "competitors", "macro", "swot")
    return {**{k: case[k] for k in keys}, "entity": raw["entityName"], "source": SEC.format(cik=case["cik"]),
            "fetched": fetched, "rows": rows}


def render(slug, case, raw, rows, fetched):
    payload = json.dumps(rows, separators=(",", ":")).replace("</", "<\\/")
    case_json = json.dumps(deck_case(case, raw, rows, fetched), separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
    source = SEC.format(cik=case["cik"])
    template = (ROOT / "viz" / slug / "beamdswitch.js").read_text()
    report_js = strip_types(REPORT_JS.read_text())
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="{escape(case['headline'])}"><title>{escape(case['title'])}</title>{THEME_SCRIPT}<style>
{root_css(TOKENS)}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 var(--sans);letter-spacing:-.011em;-webkit-font-smoothing:antialiased}}main,footer{{width:min(72rem,calc(100% - 2rem));margin:auto}}main{{padding:clamp(1.25rem,5vw,3rem) 0 1.5rem}}h1{{max-width:20ch;margin:.35rem 0 .8rem;font-size:clamp(2rem,6vw,3.25rem);font-weight:700;line-height:1.04;letter-spacing:-.045em}}p{{max-width:76ch}}.muted,footer{{color:var(--muted)}}.chart{{border-top:1px solid var(--border);margin-top:2rem;padding-top:1rem}}button{{border:1px solid var(--control);border-radius:999px;background:var(--bg);padding:.25rem .8rem;min-height:2.25rem;color:var(--fg);font:inherit;font-size:.875rem;cursor:pointer}}button:hover{{background:var(--surface)}}button:focus-visible{{outline:2px solid var(--focus);outline-offset:2px}}button[aria-pressed=true]{{border-color:var(--fg);background:var(--fg);color:var(--bg)}}svg{{display:block;width:100%;height:auto;margin-top:.8rem}}.grid{{stroke:var(--grid)}}.bar{{fill:var(--c1)}}.axis{{fill:var(--muted);font:14px var(--mono);font-variant-numeric:tabular-nums}}.value{{fill:var(--fg);font:600 14px var(--mono);font-variant-numeric:tabular-nums}}.contexts{{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem;margin-top:2rem}}.contexts article{{border-top:1px solid var(--border)}}.contexts h2{{font-size:1.125rem;font-weight:600;letter-spacing:-.015em}}footer{{padding:1.5rem 0 3rem;border-top:1px solid var(--border);font-size:.875rem}}a{{color:inherit}}@media(max-width:600px){{button{{min-height:2.75rem;padding:.25rem .9rem}}footer a{{display:inline-block;padding:.7rem 0}}}}.deck-row{{display:flex;flex-wrap:wrap;gap:.35rem .5rem;align-items:center;margin:1rem 0 0}}.deck-hint{{margin:.4rem 0 0;font-size:.875rem}}
</style></head><body><main><h1>{escape(case['headline'])}</h1><p class="muted">Audited annual revenue and operating cash flow from SEC Company Facts. Select a measure. This is descriptive information, not investment advice.</p><div class="deck-row"><button type="button" id="save-beamdswitch" title="Save a narrated Markdown talk about these figures, to open in beamdswitch">beamdswitch</button> <button type="button" id="copy-beamdswitch" title="Copy the narrated Markdown talk, to paste into beamdswitch">Copy deck</button> <span id="deck-status" class="muted" role="status"></span></div><p class="muted deck-hint">{DECK_HINT}</p><section class="chart" aria-label="Annual fundamentals chart"><div><button type="button" data-metric="revenue" aria-pressed="true">Revenue</button> <button type="button" data-metric="cash_margin" aria-pressed="false">Operating cash margin</button></div><svg id="chart" viewBox="0 0 960 380" role="img"><title>Annual revenue or operating cash-flow margin</title><desc>Choose revenue or operating cash margin.</desc></svg></section><section class="contexts" aria-label="Company context"><article><h2>Competitors</h2><p>{escape(case['competitors'])}</p></article><article><h2>Macro</h2><p>{escape(case['macro'])}</p></article><article><h2>SWOT</h2><p>{escape(case['swot'])}</p></article></section></main><footer>Source: <a href="{source}">SEC Company Facts for {escape(raw['entityName'])}</a>. Fetched {fetched}. Fiscal years end on the dates in the source data.</footer><script id="beamdswitch">
{template}</script><script id="report">
{report_js}</script><script>
const rows={payload},CASE={case_json},svg=document.querySelector('#chart'),buttons=[...document.querySelectorAll('button[data-metric]')],NS='http://www.w3.org/2000/svg';let metric='revenue';const add=(tag,a)=>{{const n=document.createElementNS(NS,tag);Object.entries(a).forEach(([k,v])=>n.setAttribute(k,v));svg.append(n);return n}},label=(t,x,y,c='axis',a='middle')=>{{const n=add('text',{{x,y,class:c,'text-anchor':a}});n.textContent=t;return n}};const {{money}}=StockReport,format=v=>metric==='revenue'?money(v):v.toFixed(1)+'%';function draw(){{svg.replaceChildren();const W=Math.max(300,Math.round(svg.getBoundingClientRect().width)),H=W<560?360:380,M={{t:34,r:W<560?14:35,b:55,l:W<560?70:72}};svg.setAttribute('viewBox',`0 0 ${{W}} ${{H}}`);const values=rows.map(r=>r[metric]),max=metric==='revenue'?Math.ceil(Math.max(...values)/1e9)*1e9:Math.ceil(Math.max(...values)/5)*5,base=metric==='revenue'?0:Math.min(0,Math.floor(Math.min(...values)/5)*5),x=i=>M.l+i*(W-M.l-M.r)/rows.length,y=v=>M.t+(max-v)*(H-M.t-M.b)/(max-base);for(let i=0;i<5;i++){{const v=base+(max-base)*i/4,yy=y(v);add('line',{{x1:M.l,x2:W-M.r,y1:yy,y2:yy,class:'grid'}});label(format(v),M.l-10,yy+4,'axis','end')}}rows.forEach((r,i)=>{{const cx=x(i)+((W-M.l-M.r)/rows.length)/2,w=Math.min(120,(W-M.l-M.r)/rows.length*.56),top=y(r[metric]),bottom=y(base);add('rect',{{x:cx-w/2,y:Math.min(top,bottom),width:w,height:Math.abs(bottom-top),class:'bar'}});label(r.fy,cx,H-M.b+25);label(format(r[metric]),cx,top-9,'value')}});label(metric==='revenue'?'Annual revenue':'Operating cash flow / revenue',M.l,M.t-12,'axis','start')}}buttons.forEach(b=>b.addEventListener('click',()=>{{metric=b.dataset.metric;buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw()}}));addEventListener('resize',draw);draw();
/* The beamdswitch deck of the measure shown: beamdswitch.js is the site's report template, report.js fills it. */
const deck=()=>Beamdswitch.deck(StockReport.report(CASE,{{metric}})),status=document.querySelector('#deck-status');function save(blob,name){{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}}
document.querySelector('#save-beamdswitch').addEventListener('click',()=>{{const name='{slug}-beamdswitch.md';try{{save(new Blob([deck()],{{type:'text/markdown'}}),name);status.textContent=`Saved ${{name}}: open it in beamdswitch.`}}catch{{status.textContent='Could not save the beamdswitch deck here: use Copy deck to paste it into beamdswitch.'}}}});
document.querySelector('#copy-beamdswitch').addEventListener('click',async()=>{{try{{await navigator.clipboard.writeText(deck());status.textContent='Copied the beamdswitch deck: paste it into beamdswitch.'}}catch{{status.textContent='Could not copy the beamdswitch deck here: use the beamdswitch button to save it.'}}}});
const result=text=>({{content:[{{type:'text',text}}]}}),mc=(document.modelContext||navigator.modelContext),data=()=>`{toon(rows)}`;mc?.registerTool({{name:'get_data',description:'Return audited annual fundamentals in compact TOON rows.',inputSchema:{{type:'object',properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return result(data()+`\\ntotal|${{rows.length}}\\nnext|query a fiscal year`)}}}});mc?.registerTool({{name:'get_metadata',description:'Return source and concise company context.',inputSchema:{{type:'object',properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return result(`ticker|{case['ticker']}\\nsource|{source}\\nfetched|{fetched}\\nnext|get_data for all annual rows`)}}}});mc?.registerTool({{name:'query',description:'Return one fiscal year, or all rows when fy is absent.',inputSchema:{{type:'object',properties:{{fy:{{type:'string'}}}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(input={{}}){{const [head,...lines]=data().split('\\n'),found=input.fy?lines.filter(l=>l.split('|')[0]===input.fy):lines;return result([head,...found].join('\\n')+`\\ntotal|${{found.length}}\\nnext|${{found.length?'compare revenue and cash margin':`unknown fiscal year; use one of ${{rows.map(r=>r.fy).join(', ')}}`}}`)}}}});
</script></body></html>\n'''


def write(fetched):
    for slug, case in CASES.items():
        raw, rows = rows_for(slug, case)
        path = ROOT / "viz" / slug / "index.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(render(slug, case, raw, rows, fetched))
        (ROOT / "data" / slug / "meta.json").write_text(json.dumps({"slug": slug, "source_url": SEC.format(cik=case["cik"]), "fetched": fetched, "key_file_used": False}, indent=2) + "\n")
    write_gallery()


def verify():
    for slug, case in CASES.items():
        raw, rows = rows_for(slug, case)
        assert raw["cik"] == case["cik"] or str(raw["cik"]).lstrip("0") == str(case["cik"])
        assert len(rows) == 4 and all(r["revenue"] > 0 for r in rows)
        assert all(r["cash_margin"] == round(100 * r["operating_cash_flow"] / r["revenue"], 1) for r in rows)
        html = (ROOT / "viz" / slug / "index.html").read_text()
        assert html.count("<h1>") == 1 and html.count("<svg") == 1 and html.count("<script") == 4 and THEME_SCRIPT in html
        assert f'<script id="beamdswitch">\n{(ROOT / "viz" / slug / "beamdswitch.js").read_text()}</script>' in html
        assert f'<script id="report">\n{strip_types(REPORT_JS.read_text())}</script>' in html
        assert 'id="save-beamdswitch"' in html and 'id="copy-beamdswitch"' in html
        assert html == render(slug, case, raw, rows, json.loads((ROOT / "data" / slug / "meta.json").read_text())["fetched"])
        assert "<script src=" not in html and "toon(" not in html and html.count("mc?.registerTool") == 3 and html.count("readOnlyHint:true") == 3
        assert all(f'name:\'{tool}\'' in html for tool in ("get_data", "get_metadata", "query"))
        assert "data-metric" in html and "SWOT" in html and "not investment advice" in html
    index = (ROOT / "index.html").read_text()
    assert all(f'viz/{page.parent.name}/index.html' in index for page in (ROOT / "viz").glob("*/index.html"))
    print("verified: 4 cases, 4 audited annual rows each, 1 interactive SVG and 3 read-only tools and a beamdswitch deck per page")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--fetched", default="2026-09-28")
    args = parser.parse_args()
    if not args.verify:
        write(args.fetched)
    verify()


if __name__ == "__main__":
    main()
