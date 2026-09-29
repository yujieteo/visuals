#!/usr/bin/env python3
"""Build four compact, source-backed stock fundamentals visualizations."""
import argparse
import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEC = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
CASES = {
    "panw": {
        "title": "Palo Alto Networks cash conversion", "ticker": "PANW", "cik": 1327567,
        "headline": "Palo Alto Networks’ cash generation has stayed above 39% of revenue as its security platform scales.",
        "competitors": "CrowdStrike, Fortinet, Cisco and Zscaler compete across endpoint, network and cloud security.",
        "macro": "Enterprise security budgets, cloud adoption and breach risk support demand. IT-budget pauses and vendor consolidation are counterweights.",
        "swot": "Strength: platform breadth. Weakness: execution across many products. Opportunity: AI security. Threat: intense platform competition.",
    },
    "marvell": {
        "title": "Marvell cash conversion", "ticker": "MRVL", "cik": 1835632,
        "headline": "Marvell’s revenue rebounded in fiscal 2026, while operating cash flow remained a smaller share of sales than at the prior peak.",
        "competitors": "Broadcom, Nvidia, AMD, Intel and custom-silicon suppliers compete in data-center and networking semiconductors.",
        "macro": "AI data-center capex and networking upgrades can lift demand. Semiconductor inventory cycles and concentrated customers add volatility.",
        "swot": "Strength: data-infrastructure portfolio. Weakness: cyclicality. Opportunity: custom AI silicon. Threat: pricing and execution pressure from larger rivals.",
    },
    "airbnb": {
        "title": "Airbnb cash conversion", "ticker": "ABNB", "cik": 1559720,
        "headline": "Airbnb’s revenue has grown while operating cash flow has remained above one-third of sales in each of the latest four years.",
        "competitors": "Booking Holdings, Expedia, hotels and local vacation-rental platforms compete for guests, hosts and marketing traffic.",
        "macro": "Disposable income, cross-border travel and currency movements shape bookings. Regulation and a softer travel cycle can constrain supply and demand.",
        "swot": "Strength: global host network. Weakness: regulatory exposure. Opportunity: underpenetrated international travel. Threat: hotel and OTA competition.",
    },
    "arm": {
        "title": "Arm cash conversion", "ticker": "ARM", "cik": 1973239,
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


def render(slug, case, raw, rows, fetched):
    payload = json.dumps(rows, separators=(",", ":")).replace("</", "<\\/")
    source = SEC.format(cik=case["cik"])
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="{escape(case['headline'])}"><title>{escape(case['title'])}</title><style>
:root{{--bg:#fff;--ink:#1d1d1f;--muted:#6e6e73;--line:#d2d2d7;--blue:#0071e3;--red:#c43d2f}}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}}main,footer{{width:min(72rem,calc(100% - 2rem));margin:auto}}main{{padding:3rem 0 1.5rem}}h1{{max-width:25ch;margin:0 0 1rem;font-size:clamp(2rem,6vw,4rem);line-height:1.05;letter-spacing:-.04em}}p{{max-width:76ch}}.muted,footer{{color:var(--muted)}}.chart{{border-top:1px solid var(--line);margin-top:2rem;padding-top:1rem}}button{{border:1px solid var(--line);border-radius:.35rem;background:#fff;padding:.45rem .7rem;color:var(--ink);font:inherit;cursor:pointer}}button[aria-pressed=true]{{background:var(--ink);color:#fff}}svg{{display:block;width:100%;height:auto;margin-top:.8rem}}.grid{{stroke:var(--line)}}.bar{{fill:var(--blue)}}.axis{{fill:var(--muted);font:14px ui-monospace,monospace}}.value{{fill:var(--ink);font:600 14px ui-monospace,monospace}}.contexts{{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1rem;margin-top:2rem}}.contexts article{{border-top:1px solid var(--line)}}.contexts h2{{font-size:1rem}}footer{{padding:1.5rem 0 3rem;border-top:1px solid var(--line);font-size:.875rem}}a{{color:inherit}}@media(max-width:600px){{main{{padding-top:2rem}}button{{min-height:2.75rem;padding:.45rem .9rem}}footer a{{display:inline-block;padding:.7rem 0}}}}
</style></head><body><main><h1>{escape(case['headline'])}</h1><p class="muted">Audited annual revenue and operating cash flow from SEC Company Facts. Select a measure. This is descriptive information, not investment advice.</p><section class="chart" aria-label="Annual fundamentals chart"><div><button type="button" data-metric="revenue" aria-pressed="true">Revenue</button> <button type="button" data-metric="cash_margin" aria-pressed="false">Operating cash margin</button></div><svg id="chart" viewBox="0 0 960 380" role="img"><title>Annual revenue or operating cash-flow margin</title><desc>Choose revenue or operating cash margin.</desc></svg></section><section class="contexts" aria-label="Company context"><article><h2>Competitors</h2><p>{escape(case['competitors'])}</p></article><article><h2>Macro</h2><p>{escape(case['macro'])}</p></article><article><h2>SWOT</h2><p>{escape(case['swot'])}</p></article></section></main><footer>Source: <a href="{source}">SEC Company Facts for {escape(raw['entityName'])}</a>. Fetched {fetched}. Fiscal years end on the dates in the source data.</footer><script>
const rows={payload},svg=document.querySelector('#chart'),buttons=[...document.querySelectorAll('button[data-metric]')],NS='http://www.w3.org/2000/svg';let metric='revenue';const add=(tag,a)=>{{const n=document.createElementNS(NS,tag);Object.entries(a).forEach(([k,v])=>n.setAttribute(k,v));svg.append(n);return n}},label=(t,x,y,c='axis',a='middle')=>{{const n=add('text',{{x,y,class:c,'text-anchor':a}});n.textContent=t;return n}};const money=v=>'$'+(v/1e9).toFixed(2)+'B',format=v=>metric==='revenue'?money(v):v.toFixed(1)+'%';function draw(){{svg.replaceChildren();const W=Math.max(300,Math.round(svg.getBoundingClientRect().width)),H=W<560?360:380,M={{t:34,r:W<560?14:35,b:55,l:W<560?70:72}};svg.setAttribute('viewBox',`0 0 ${{W}} ${{H}}`);const values=rows.map(r=>r[metric]),max=metric==='revenue'?Math.ceil(Math.max(...values)/1e9)*1e9:Math.ceil(Math.max(...values)/5)*5,base=metric==='revenue'?0:Math.min(0,Math.floor(Math.min(...values)/5)*5),x=i=>M.l+i*(W-M.l-M.r)/rows.length,y=v=>M.t+(max-v)*(H-M.t-M.b)/(max-base);for(let i=0;i<5;i++){{const v=base+(max-base)*i/4,yy=y(v);add('line',{{x1:M.l,x2:W-M.r,y1:yy,y2:yy,class:'grid'}});label(format(v),M.l-10,yy+4,'axis','end')}}rows.forEach((r,i)=>{{const cx=x(i)+((W-M.l-M.r)/rows.length)/2,w=Math.min(120,(W-M.l-M.r)/rows.length*.56),top=y(r[metric]),bottom=y(base);add('rect',{{x:cx-w/2,y:Math.min(top,bottom),width:w,height:Math.abs(bottom-top),class:'bar'}});label(r.fy,cx,H-M.b+25);label(format(r[metric]),cx,top-9,'value')}});label(metric==='revenue'?'Annual revenue':'Operating cash flow / revenue',M.l,M.t-12,'axis','start')}}buttons.forEach(b=>b.addEventListener('click',()=>{{metric=b.dataset.metric;buttons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw()}}));addEventListener('resize',draw);draw();
const result=text=>({{content:[{{type:'text',text}}]}}),mc=(document.modelContext||navigator.modelContext),data=()=>`{toon(rows)}`;mc?.registerTool({{name:'get_data',description:'Return audited annual fundamentals in compact TOON rows.',inputSchema:{{type:'object',properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return result(data()+`\\ntotal|${{rows.length}}\\nnext|query a fiscal year`)}}}});mc?.registerTool({{name:'get_metadata',description:'Return source and concise company context.',inputSchema:{{type:'object',properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return result(`ticker|{case['ticker']}\\nsource|{source}\\nfetched|{fetched}\\nnext|get_data for all annual rows`)}}}});mc?.registerTool({{name:'query',description:'Return one fiscal year, or all rows when fy is absent.',inputSchema:{{type:'object',properties:{{fy:{{type:'string'}}}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(input={{}}){{const found=input.fy?rows.filter(r=>r.fy===input.fy):rows;return result(toon(found)+`\\ntotal|${{found.length}}\\nnext|${{found.length?'compare revenue and cash margin':'use a fiscal year from get_data'}}`)}}}});
</script></body></html>\n'''


def gallery():
    cards = []
    for slug, case in CASES.items():
        cards.append(f'<article><h2><a href="viz/{slug}/index.html">{escape(case["title"])}</a></h2><p>{escape(case["headline"])}</p></article>')
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Visuals</title><style>body{max-width:45rem;margin:3rem auto;padding:0 1rem;font:16px/1.6 system-ui;color:#1d1d1f}article{border-top:1px solid #d2d2d7;padding:1rem 0}a{color:inherit}h2 a{display:inline-block;padding:.5rem 0}</style><main><h1>Visuals</h1>' + ''.join(cards) + '</main></html>\n'


def write(fetched):
    for slug, case in CASES.items():
        raw, rows = rows_for(slug, case)
        path = ROOT / "viz" / slug / "index.html"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(render(slug, case, raw, rows, fetched))
        (ROOT / "data" / slug / "meta.json").write_text(json.dumps({"slug": slug, "source_url": SEC.format(cik=case["cik"]), "fetched": fetched, "key_file_used": False}, indent=2) + "\n")
    (ROOT / "index.html").write_text(gallery())


def verify():
    for slug, case in CASES.items():
        raw, rows = rows_for(slug, case)
        assert raw["cik"] == case["cik"] or str(raw["cik"]).lstrip("0") == str(case["cik"])
        assert len(rows) == 4 and all(r["revenue"] > 0 for r in rows)
        assert all(r["cash_margin"] == round(100 * r["operating_cash_flow"] / r["revenue"], 1) for r in rows)
        html = (ROOT / "viz" / slug / "index.html").read_text()
        assert html.count("<h1>") == 1 and html.count("<svg") == 1 and html.count("<script") == 1
        assert "<script src=" not in html and html.count("mc?.registerTool") == 3 and html.count("readOnlyHint:true") == 3
        assert all(f'name:\'{tool}\'' in html for tool in ("get_data", "get_metadata", "query"))
        assert "data-metric" in html and "SWOT" in html and "not investment advice" in html
    assert all(f'viz/{slug}/index.html' in (ROOT / "index.html").read_text() for slug in CASES)
    print("verified: 4 cases, 4 audited annual rows each, 1 interactive SVG and 3 read-only tools per page")


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
