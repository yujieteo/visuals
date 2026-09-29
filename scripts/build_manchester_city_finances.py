#!/usr/bin/env python3
import argparse
import csv
import json
from html import escape
from pathlib import Path
from gallery import render_gallery

ROOT = Path(__file__).resolve().parents[1]
SLUG = "manchester-city-finances"
RAW = ROOT / "data" / SLUG / "raw.csv"
META = ROOT / "data" / SLUG / "meta.json"
VIZ = ROOT / "viz" / SLUG / "index.html"
GALLERY = ROOT / "index.html"


def render(rows, meta, tokens):
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    colors = tokens["colors"]
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><meta name="description" content="An evidence-first timeline that separates Manchester City's Premier League allegations, the distinct CAS UEFA case, and the newest filed accounts."><title>What Manchester City’s charges and accounts do and do not show</title><style>
:root{{--bg:{colors['background']};--fg:{colors['foreground']};--muted:{colors['secondary']};--surface:{colors['surface']};--border:{colors['border']};--focus:{colors['focus']};--accent:{colors['selected']};--sans:{tokens['font_sans']};--mono:{tokens['font_mono']};color-scheme:light}}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 var(--sans)}}main,footer{{width:min(100% - 2rem,{tokens['content_width']});margin:auto}}main{{padding:clamp(2rem,6vw,4rem) 0 1.5rem}}h1{{max-width:22ch;margin:0 0 .8rem;font-size:clamp(2rem,6vw,4rem);line-height:1.04;letter-spacing:-.045em}}p{{max-width:68ch}}.method,footer{{color:var(--muted)}}.controls{{display:flex;gap:.5rem;flex-wrap:wrap;margin:1.5rem 0 1rem}}button{{font:inherit;cursor:pointer;border:1px solid var(--border);border-radius:.45rem;background:var(--bg);color:var(--fg);padding:.5rem .7rem}}button[aria-pressed="true"],button:hover{{background:var(--surface);border-color:var(--accent)}}button:focus-visible{{outline:3px solid var(--focus);outline-offset:2px}}.chart{{border-top:1px solid var(--border);padding-top:1rem}}svg{{display:block;width:100%;height:auto}}.axis,.lane{{fill:var(--muted);font:14px var(--mono)}}.lane-h,.item{{fill:var(--fg);font:600 14px var(--mono)}}.item{{font-weight:400}}.grid{{stroke:var(--border)}}.bar{{fill:var(--accent);fill-opacity:.68;cursor:pointer}}.bar{{stroke:transparent;stroke-width:16px}}.bar:hover,.bar:focus,.bar.sel{{fill-opacity:1;stroke:var(--fg);stroke-width:2}}.point{{fill:var(--fg);stroke:var(--accent);stroke-width:3;cursor:pointer}}.detail{{min-height:5.5rem;margin-top:1rem;padding:1rem;border:1px solid var(--border);border-radius:.5rem}}.detail h2{{margin:0 0 .25rem;font-size:1.1rem}}.detail p{{margin:.25rem 0}}.detail a{{color:inherit;text-underline-offset:.18em}}footer{{padding:1.5rem 0 2.5rem;border-top:1px solid var(--border);font-size:.875rem}}@media(max-width:700px){{button{{min-height:2.75rem}}.detail a{{display:inline-block;padding:.5rem 0}}}}
</style></head><body><main><h1>The charges concern historical allegations. The newest accounts are a separate, current snapshot.</h1><p class="method">Select a lane. The timeline keeps the Premier League referral, the 2020 CAS decision in a separate UEFA case, and filed financial results distinct. No final Premier League award is shown because none was located on the League’s official site as of 28 September 2026.</p><div id="controls" class="controls" aria-label="Timeline filters"></div><section class="chart" aria-label="Manchester City charges and accounts timeline"><svg id="chart" viewBox="0 0 960 530" role="img"><title>Manchester City allegations, CAS decision, and financial accounts</title><desc>Bars show the alleged Premier League periods. A point marks the separate 2020 CAS UEFA decision. Two financial points show revenue and net result for 2024 and 2025.</desc></svg></section><article id="detail" class="detail" aria-live="polite"><h2>Select an item</h2><p>Each item opens its precise scope and primary source.</p></article></main><footer>Sources: Premier League referral, CAS media release, and Manchester City financial reports. Fetched {escape(meta['fetched'])}.</footer><script>
const rows={payload},svg=document.querySelector('#chart'),detail=document.querySelector('#detail'),lanes=[...new Set(rows.map(r=>r.lane))],NS='http://www.w3.org/2000/svg',start=Date.parse('2009-07-01'),end=Date.parse('2026-01-01');let selected=null,active='All';
const add=(n,a,p=svg)=>{{const e=document.createElementNS(NS,n);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));p.append(e);return e}},text=(v,x,y,c='axis',a='start')=>{{const e=add('text',{{x,y,class:c,'text-anchor':a}});e.textContent=v;return e}},x=d=>M.l+(Date.parse(d)-start)/(end-start)*(W-M.l-M.r),y=lane=>M.t+lanes.indexOf(lane)*100+40;let W,H,M,narrow;
function show(r){{selected=r.id;detail.replaceChildren();const h=document.createElement('h2');h.textContent=r.label;const p=document.createElement('p');p.textContent=r.detail;const q=document.createElement('p');q.textContent=r.revenue_gbp_m?`Revenue £${{r.revenue_gbp_m}}m. Net result £${{r.profit_gbp_m}}m.`:'';const a=document.createElement('a');a.href=r.source_url;a.textContent='Open primary source';a.rel='noopener noreferrer';a.target='_blank';detail.append(h,p,q,a);render();if(narrow)detail.scrollIntoView({{block:'nearest',behavior:'smooth'}})}}
function render(){{svg.replaceChildren();W=Math.max(300,Math.round(svg.getBoundingClientRect().width));narrow=W<700;M=narrow?{{t:38,r:16,b:44,l:16}}:{{t:30,r:34,b:55,l:220}};const items=rows.filter(r=>active==='All'||r.lane===active),pos={{}},heads={{}};H=530;if(narrow){{let cy=M.t;lanes.forEach(l=>{{const its=items.filter(r=>r.lane===l);if(!its.length)return;heads[l]=cy;cy+=30;its.forEach(r=>{{pos[r.id]=cy;cy+=62}});cy+=8}});H=cy+M.b-8}}svg.setAttribute('viewBox',`0 0 ${{W}} ${{H}}`);const step=narrow?4:2;for(let year=2010;year<=2025;year+=step){{const px=x(`${{year}}-07-01`);add('line',{{x1:px,x2:px,y1:M.t-10,y2:H-M.b,class:'grid'}});text(year,px,H-M.b+25,'axis','middle');if(narrow)text(year,px,M.t-16,'axis','middle')}}if(narrow)lanes.forEach(l=>{{if(l in heads)text(l,M.l,heads[l]+16,'lane-h')}});else lanes.forEach(l=>{{const py=y(l);text(l,M.l-14,py+5,'lane','end');add('line',{{x1:M.l,x2:W-M.r,y1:py+16,y2:py+16,class:'grid'}})}});items.forEach(r=>{{const single=r.start===r.end,acct=r.lane==='Filed accounts',py=narrow?pos[r.id]+40:y(r.lane),cls=(single&&acct?'point':'bar')+(r.id===selected?' sel':'');let e;if(single){{e=add('circle',{{cx:x(r.start),cy:py,r:narrow?11:8,class:cls,tabindex:0,role:'button','aria-label':r.label}})}}else{{e=add('rect',{{x:x(r.start),y:py-(narrow?13:12),width:Math.max(narrow?24:6,x(r.end)-x(r.start)),height:narrow?26:24,rx:4,class:cls,tabindex:0,role:'button','aria-label':r.label}})}}e.addEventListener('click',()=>show(r));e.addEventListener('keydown',event=>{{if(event.key==='Enter'||event.key===' '){{event.preventDefault();show(r)}}}});const money=`£${{r.revenue_gbp_m}}m / £${{r.profit_gbp_m}}m`;if(narrow){{text(r.label,M.l,pos[r.id]+14,'item');if(acct)text(money,W-M.r,pos[r.id]+14,'axis','end')}}else if(acct)text(money,x(r.start),py-18,'axis','middle')}})}}
const controls=document.querySelector('#controls');for(const lane of ['All',...lanes]){{const b=document.createElement('button');b.type='button';b.textContent=lane;b.setAttribute('aria-pressed',lane===active);b.addEventListener('click',()=>{{active=lane;[...controls.children].forEach(n=>n.setAttribute('aria-pressed',String(n===b)));render()}});controls.append(b)}}addEventListener('resize',()=>{{if(Math.abs(svg.getBoundingClientRect().width-W)>1)render()}});render();
const result=value=>({{content:[{{type:'text',text:JSON.stringify(value)}}]}}),mc=(typeof document!=='undefined'&&document.modelContext)||(typeof navigator!=='undefined'&&navigator.modelContext);mc?.registerTool({{name:'get_data',description:'Return the full timeline dataset.',inputSchema:{{type:'object',properties:{{}}}},annotations:{{readOnlyHint:true}},async execute(){{return result({{total:rows.length,rows,truncated:false,next_steps:['Use query to filter one lane.']}})}}}});mc?.registerTool({{name:'get_metadata',description:'Return the claim, sources, and status caveat.',inputSchema:{{type:'object',properties:{{}}}},annotations:{{readOnlyHint:true}},async execute(){{return result({{title:document.title,claim:'The charges concern historical allegations. The newest accounts are a separate, current snapshot.',status:'No final Premier League award located on its official site as of 2026-09-28.',lanes,truncated:false}})}}}});mc?.registerTool({{name:'query',description:'Filter timeline items by lane.',inputSchema:{{type:'object',properties:{{lane:{{type:'string'}}}}}},annotations:{{readOnlyHint:true}},async execute(input={{}}){{const matches=rows.filter(r=>!input.lane||r.lane===input.lane);return result({{total:matches.length,rows:matches,truncated:false,next_steps:matches.length?['All matching items returned.']:['Use one of the lanes from get_metadata.']}})}}}});
</script></body></html>\n'''


def verify(rows):
    assert len(rows) == 9 and {row['id'] for row in rows} >= {'cas-2020', 'fy2024', 'fy2025'}
    assert rows[-2]['revenue_gbp_m'] == '715.0' and rows[-1]['profit_gbp_m'] == '-9.9'
    html = VIZ.read_text(encoding='utf-8')
    assert html.count('<h1>') == 1 and html.count('<svg') == 1 and '<script src=' not in html
    assert html.count('mc?.registerTool') == 3 and 'alleged' in html.lower() and 'not a decision on the Premier League allegations' in html
    assert f'href="viz/{SLUG}/index.html"' in GALLERY.read_text(encoding='utf-8')
    print('verified: 9 timeline records, 6 alleged periods, separate CAS event, 2 filed-account points, 3 read-only tools')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    with RAW.open(encoding='utf-8', newline='') as handle:
        rows = list(csv.DictReader(handle))
    if not args.verify:
        VIZ.parent.mkdir(parents=True, exist_ok=True)
        VIZ.write_text(render(rows, json.loads(META.read_text()), json.loads((ROOT / 'design-tokens.json').read_text())), encoding='utf-8')
        GALLERY.write_text(render_gallery(), encoding='utf-8')
    verify(rows)


if __name__ == '__main__':
    main()
