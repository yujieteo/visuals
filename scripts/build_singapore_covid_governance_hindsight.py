#!/usr/bin/env python3
import argparse
import csv
import json
from pathlib import Path
from gallery import render_gallery
from style_guide import THEME_SCRIPT, root_css

ROOT = Path(__file__).resolve().parents[1]
SLUG = "singapore-covid-governance-hindsight"
RAW = ROOT / "data" / SLUG / "raw.csv"
META = ROOT / "data" / SLUG / "meta.json"
TOKENS = ROOT / "design-tokens.json"
VIZ = ROOT / "viz" / SLUG / "index.html"
TEMPLATE = ROOT / "viz" / SLUG / "beamdswitch.js"
REPORT = ROOT / "viz" / SLUG / "report.js"
GALLERY = ROOT / "index.html"
FIELDS = ["id", "analyst", "published", "kind", "statement", "source_url", "later_record", "outcome_date", "outcome_source_url", "evidence_class", "evidence_basis", "limitation"]

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><meta name="description" content="Four dated 2020 Singapore analyses paired with later public records. One is a direct conditional forecast outcome. The others show policy overlap, a related event, or a consistent trend."><title>What did 2020 Singapore analyses say?</title>__THEME_SCRIPT__<style>
__ROOT_CSS__*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 var(--sans);letter-spacing:-.011em;-webkit-font-smoothing:antialiased}a{color:var(--focus)}main,footer{width:min(100% - 2rem,72rem);margin:auto}main{padding:clamp(1.25rem,5vw,3rem) 0 1.5rem}h1{max-width:20ch;margin:.35rem 0 .8rem;font-size:clamp(2rem,6vw,3.25rem);font-weight:700;line-height:1.04;letter-spacing:-.045em}.chart{margin-top:2rem;border-top:1px solid var(--border)}.controls{display:flex;gap:.5rem;flex-wrap:wrap;padding:1rem 0}button{min-height:2.75rem;padding:.25rem .9rem;border:1px solid var(--control);border-radius:999px;background:var(--bg);color:var(--fg);font:inherit;font-size:.875rem;cursor:pointer}button:hover{background:var(--surface)}button[aria-pressed="true"]{border-color:var(--fg);background:var(--fg);color:var(--bg)}button:focus-visible,a:focus-visible{outline:2px solid var(--focus);outline-offset:2px}.count,.byline,.detail p,.method{color:var(--muted)}.count,.byline{font:14px var(--mono);font-variant-numeric:tabular-nums}.byline{display:block}.rows{display:grid;gap:.65rem}.row{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(13rem,1.8fr) auto;gap:.8rem;align-items:center;width:100%;min-height:5.6rem;padding:1rem;border-color:var(--border);border-radius:.5rem;font-size:1rem;text-align:left}.row:hover,.row[aria-current="true"]{background:var(--surface)}.marker{width:.85rem;height:.85rem;border-radius:50%;background:var(--related)}.marker.direct{background:var(--direct)}.detail{margin-top:1rem;padding:1rem;border:1px solid var(--border);border-radius:.5rem}.detail h2{margin:0 0 .7rem;font-size:1.125rem;font-weight:600;letter-spacing:-.015em}.detail p{margin:.6rem 0}.detail a{color:var(--fg);display:inline-block;padding:.75rem 0}.method{margin-top:1rem;font-size:.875rem}.deck-row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-top:1.25rem}.deck-status,.deck-hint{color:var(--muted);font-size:.875rem}.deck-hint{max-width:65ch;margin:.5rem 0 0}footer{padding:1.5rem 0 2.5rem;border-top:1px solid var(--border);color:var(--muted);font-size:.875rem}@media(max-width:650px){.row{grid-template-columns:1fr auto}.statement{grid-column:1/-1}.byline{display:block}}</style></head><body><main><h1>One conditional 2020 forecast has a direct later outcome. Three policy analyses map to later policy records.</h1>__DECK__<section class="chart" aria-label="Interactive evidence map of four 2020 analyses"><div class="controls" id="controls"><button type="button" data-filter="all" aria-pressed="true">All four</button><button type="button" data-filter="direct later outcome" aria-pressed="false">Direct outcome</button><button type="button" data-filter="policy overlap" aria-pressed="false">Policy overlap</button><button type="button" data-filter="related policy event" aria-pressed="false">Related event</button><button type="button" data-filter="consistent trend" aria-pressed="false">Consistent trend</button></div><p id="count" class="count" aria-live="polite"></p><div id="rows" class="rows"></div><article id="detail" class="detail" aria-live="polite"></article></section><p class="method">The classes state the evidence relationship, not an overall foresight score. A direct outcome documents a stated forecast condition. The other classes link later records to a policy proposal or concern and retain their limits.</p></main><footer>The data file holds the full source list and was fetched 2026-09-28.</footer><script id="beamdswitch">
__TEMPLATE__</script><script id="report">
__REPORT__</script><script>
const rows=__DATA__,state={filter:"all",selectedId:rows[0].id},byId=new Map(rows.map(row=>[row.id,row])),safe=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function shown(){return rows.filter(row=>state.filter==="all"||row.evidence_class===state.filter)}
function render(){const visible=shown();if(!visible.some(row=>row.id===state.selectedId))state.selectedId=visible[0]?.id||null;document.querySelectorAll("#controls button").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.filter===state.filter)));document.querySelector("#count").textContent=visible.length+" of "+rows.length+" analyses shown";document.querySelector("#rows").innerHTML=visible.map(row=>'<button class="row" type="button" data-id="'+row.id+'" aria-current="'+(row.id===state.selectedId)+'"><span><strong>'+safe(row.analyst)+'</strong><span class="byline">'+row.published+' · '+safe(row.kind)+'</span></span><span class="statement">'+safe(row.statement)+'</span><i class="marker '+(row.evidence_class==="direct later outcome"?"direct":"")+'" title="'+safe(row.evidence_class)+'"></i></button>').join("");document.querySelectorAll(".row").forEach(button=>button.addEventListener("click",()=>{state.selectedId=button.dataset.id;render()}));const row=byId.get(state.selectedId);document.querySelector("#detail").innerHTML=row?'<h2>'+safe(row.evidence_class)+'</h2><p><a href="'+safe(row.source_url)+'">Read the 2020 analysis</a></p><p>'+safe(row.later_record)+'</p><p><a href="'+safe(row.outcome_source_url)+'">Read the later record</a> · '+row.outcome_date+'</p><p>'+safe(row.evidence_basis)+'</p><p>'+safe(row.limitation)+'</p>':"<p>No analyses match this filter.</p>"}
document.querySelectorAll("#controls button").forEach(button=>button.addEventListener("click",()=>{state.filter=button.dataset.filter;render()}));render();
__DECK_JS__
const result=value=>({content:[{type:"text",text:JSON.stringify(value)}]}),mc=(typeof document!=="undefined"&&document.modelContext)||(typeof navigator!=="undefined"&&navigator.modelContext);mc?.registerTool({name:"get_data",description:"Return all four dated analysis-to-record pairs.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},async execute(){return result({total:rows.length,rows,truncated:false,next_steps:["Use query with an evidence class to filter the source pairs."]})}});mc?.registerTool({name:"get_metadata",description:"Return the scope, evidence rubric, and field meanings.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},async execute(){return result({title:"What did 2020 Singapore analyses say?",scope:"A four-item source pair sample, not an overall foresight ranking.",rubric:"Direct outcome documents forecast conditions. Other labels document policy overlap, a related event, or a consistent trend.",fields:Object.keys(rows[0]),truncated:false,next_steps:["Use get_data for all records or query for one evidence class."]})}});mc?.registerTool({name:"query",description:"Filter source pairs by evidence class.",inputSchema:{type:"object",properties:{filter:{type:"object",properties:{evidence_class:{type:"string",enum:["direct later outcome","policy overlap","related policy event","consistent trend"]}},additionalProperties:false}},additionalProperties:false},annotations:{readOnlyHint:true},async execute(input={}){const kind=input.filter?.evidence_class,matches=kind?rows.filter(row=>row.evidence_class===kind):rows;return result({total:matches.length,rows:matches,truncated:false,next_steps:matches.length?["All matching records returned."]:["Use an evidence class from get_metadata."]})}});
</script></body></html>
"""

DECK_HTML = '<div class="deck-row"><button type="button" id="save-beamdswitch" title="Save a narrated Markdown talk about these analyses, to open in beamdswitch">beamdswitch</button><button type="button" id="copy-beamdswitch" title="Copy the narrated Markdown talk, to paste into beamdswitch">Copy deck</button><span id="deck-status" class="deck-status" role="status"></span></div><p class="deck-hint">The beamdswitch button saves the analyses shown, with the filter and analysis you pick below, as a narrated talk: a Markdown deck with the data, method, results and checks, every statement and date as shown here, and a spoken narration on every slide. Open it in <a href="https://teoyujie.org/visuals/beamdswitch/">beamdswitch</a> to get slides, a handout, narration and a video. Copy deck puts the same deck on the clipboard, to paste into beamdswitch if the download does not arrive.</p>'
# The deck is built from the page as shown: CovidReport (report.js) fills the shared template (beamdswitch.js).
DECK_JS = """/* beamdswitch deck: the report template is beamdswitch.js; report.js fills it from the filter and analysis shown. */
const deckStatus=document.querySelector("#deck-status"),deck=()=>Beamdswitch.deck(CovidReport.report({rows,fetched:__FETCHED__},state));
function saveDeck(text,name){const url=URL.createObjectURL(new Blob([text],{type:"text/markdown"})),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
document.querySelector("#save-beamdswitch").addEventListener("click",()=>{const name="singapore-covid-governance-hindsight-beamdswitch.md";try{saveDeck(deck(),name);deckStatus.textContent=`Saved ${name}: open it in beamdswitch.`}catch{deckStatus.textContent="Could not save the beamdswitch deck here: use Copy deck instead."}});
document.querySelector("#copy-beamdswitch").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(deck());deckStatus.textContent="Copied the beamdswitch deck: paste it into beamdswitch."}catch{deckStatus.textContent="Could not copy the beamdswitch deck here: use the beamdswitch button to save it."}});"""

def load_rows():
    with RAW.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))

def render(rows, tokens, meta):
    page = PAGE.replace("__DECK_JS__", DECK_JS.replace("__FETCHED__", json.dumps(meta["fetched"]))).replace("__DECK__", DECK_HTML)
    page = page.replace("__TEMPLATE__", TEMPLATE.read_text(encoding="utf-8")).replace("__REPORT__", REPORT.read_text(encoding="utf-8"))
    page = page.replace("__DATA__", json.dumps(rows, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"))
    page = page.replace("__THEME_SCRIPT__", THEME_SCRIPT).replace("__ROOT_CSS__", root_css(tokens, "--direct:var(--hl);--related:var(--c1)"))
    return page

def verify(rows, meta):
    assert len(rows) == 4 and list(rows[0]) == FIELDS
    assert sum(row["evidence_class"] == "direct later outcome" for row in rows) == 1
    assert meta["slug"] == SLUG and meta["fetched"] == "2026-09-28" and meta["key_file_used"] is False
    document = VIZ.read_text(encoding="utf-8")
    assert document == render(rows, json.loads(TOKENS.read_text(encoding="utf-8")), meta), "the page is out of date; run the builder"
    assert document.count("<h1>") == 1 and document.count("<section") == 1 and document.count("<script") == 4 and THEME_SCRIPT in document
    assert f'<script id="beamdswitch">\n{TEMPLATE.read_text(encoding="utf-8")}</script>' in document
    assert f'<script id="report">\n{REPORT.read_text(encoding="utf-8")}</script>' in document
    assert 'id="save-beamdswitch"' in document and 'id="copy-beamdswitch"' in document
    assert "<script src=" not in document and document.count("mc?.registerTool") == 3
    assert all(f'name:"{name}"' in document for name in ("get_data", "get_metadata", "query"))
    assert f'href="viz/{SLUG}/index.html"' in GALLERY.read_text(encoding="utf-8")
    print("verified: 4 source pairs, 1 direct outcome, 3 related policy records, one interactive matrix, 3 read-only tools, a narrated beamdswitch deck, no external assets")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    rows = load_rows()
    meta = json.loads(META.read_text(encoding="utf-8"))
    if not args.verify:
        VIZ.parent.mkdir(parents=True, exist_ok=True)
        VIZ.write_text(render(rows, json.loads(TOKENS.read_text(encoding="utf-8")), meta), encoding="utf-8")
        GALLERY.write_text(render_gallery(), encoding="utf-8")
    verify(rows, meta)

if __name__ == "__main__":
    main()

