#!/usr/bin/env python3
import argparse
import csv
import io
import json
import math
import re
import statistics
from collections import Counter, defaultdict
from html import escape, unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = "tourist-attractions"
RAW = ROOT / "data" / SLUG / "raw.json"
META = ROOT / "data" / SLUG / "meta.json"
TOKENS = ROOT / "design-tokens.json"
VIZ = ROOT / "viz" / SLUG / "index.html"
GALLERY = ROOT / "index.html"
EXPECTED_COUNT = 109
EXPECTED_DESCRIBED = 106
TERM_LIMIT = 40
FIELDS = ["id", "title", "address", "overview", "hours", "url", "longitude", "latitude", "offset_x", "offset_y", "region", "marketing_terms"]
TERM_FIELDS = ["term", "documents", "nw", "ne", "sw", "se"]
TOKEN_RE = re.compile(r"[a-z]+(?:'[a-z]+)?")
TAG_RE = re.compile(r"<[^>]*>")
STOPWORDS_VERSION = "en-function-words-and-domain-v1"
STOPWORDS_V1 = (
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "may", "me", "might", "more", "most", "must", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shall", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "will", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves", "singapore", "attraction", "attractions", "place", "places", "site", "sites",
)
STOPWORDS = frozenset(STOPWORDS_V1)


def repair_text(value):
    if value is None:
        return ""
    text = str(value).strip()
    for _ in range(2):
        if not any(mark in text for mark in ("Â", "â", "ð", "Ã")):
            break
        try:
            repaired = text.encode("cp1252").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            break
        if repaired == text:
            break
        text = repaired
    return text


def overview_terms(value):
    text = TAG_RE.sub(" ", unescape(repair_text(value))).casefold()
    return {term for term in TOKEN_RE.findall(text) if len(term) >= 3 and term not in STOPWORDS}


def load_inputs():
    return json.loads(RAW.read_text()), json.loads(META.read_text()), json.loads(TOKENS.read_text())


def region_for(lon, lat, median_lon, median_lat):
    return ("N" if lat >= median_lat else "S") + ("W" if lon < median_lon else "E")


def prepare_data(raw):
    features = raw["features"]
    median_lon = statistics.median(f["geometry"]["coordinates"][0] for f in features)
    median_lat = statistics.median(f["geometry"]["coordinates"][1] for f in features)
    document_terms = {}
    document_frequency = Counter()
    for feature in features:
        object_id = feature["properties"]["OBJECTID_1"]
        terms = overview_terms(feature["properties"].get("OVERVIEW"))
        document_terms[object_id] = terms
        document_frequency.update(terms)
    top_terms = [term for term, count in sorted(document_frequency.items(), key=lambda item: (-item[1], item[0])) if count >= 2][:TERM_LIMIT]
    groups = defaultdict(list)
    for feature in features:
        groups[tuple(feature["geometry"]["coordinates"])].append(feature["properties"]["OBJECTID_1"])
    ranks = {object_id: (rank, len(ids)) for ids in groups.values() for rank, object_id in enumerate(sorted(ids))}
    rows = []
    for feature in sorted(features, key=lambda item: item["properties"]["OBJECTID_1"]):
        props = feature["properties"]
        object_id = props["OBJECTID_1"]
        lon, lat = feature["geometry"]["coordinates"]
        rank, group_size = ranks[object_id]
        angle = 2 * math.pi * rank / group_size if group_size > 1 else 0
        radius = 7 if group_size > 1 else 0
        link = repair_text(props.get("EXTERNAL_LINK"))
        rows.append({
            "id": str(object_id), "title": repair_text(props.get("PAGETITLE")), "address": repair_text(props.get("ADDRESS")), "overview": repair_text(props.get("OVERVIEW")), "hours": repair_text(props.get("OPENING_HOURS")), "url": link if re.match(r"^https?://", link) else "", "longitude": repr(float(lon)), "latitude": repr(float(lat)), "offset_x": f"{radius * math.cos(angle):.3f}", "offset_y": f"{radius * math.sin(angle):.3f}", "region": region_for(lon, lat, median_lon, median_lat), "marketing_terms": "|".join(term for term in top_terms if term in document_terms[object_id]),
        })
    term_rows = []
    for term in top_terms:
        counts = Counter(row["region"].lower() for row in rows if term in document_terms[int(row["id"])])
        term_rows.append({"term": term, "documents": str(document_frequency[term]), "nw": str(counts["nw"]), "ne": str(counts["ne"]), "sw": str(counts["sw"]), "se": str(counts["se"])})
    return rows, term_rows, median_lon, median_lat


def csv_text(rows, fields):
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def js_template(text):
    return text.replace("</script", "<\\/script").replace("`", "\\`").replace("${", "\\${")


def render_viz(rows, term_rows, median_lon, median_lat, meta, tokens):
    data = js_template(csv_text(rows, FIELDS))
    term_data = js_template(csv_text(term_rows, TERM_FIELDS))
    colors = tokens["colors"]
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><meta name="description" content="See which words recur in {EXPECTED_DESCRIBED} descriptions of Singapore tourist attractions and where the described places are located."><title>How Singapore attractions are marketed</title>
<style>
:root{{--background:{colors['background']};--foreground:{colors['foreground']};--secondary:{colors['secondary']};--surface:{colors['surface']};--border:{colors['border']};--focus:{colors['focus']};--mark:{colors['mark']};--selected:{colors['selected']};--radius:{tokens['radius']};--sans:{tokens['font_sans']};--mono:{tokens['font_mono']};color-scheme:light}}*{{box-sizing:border-box}}html{{font-family:var(--sans);line-height:1.5}}body{{margin:0;background:var(--background);color:var(--foreground)}}a{{color:inherit;text-underline-offset:.18em}}button,input{{font:inherit}}button{{cursor:pointer}}:focus-visible{{outline:.125rem solid var(--focus);outline-offset:.125rem}}.skip{{position:fixed;left:1rem;top:1rem;transform:translateY(-250%);z-index:10;background:var(--foreground);color:var(--background);padding:.5rem .75rem;border-radius:var(--radius)}}.skip:focus{{transform:none}}header,main,footer{{width:min(calc(100% - 2rem),{tokens['content_width']});margin:auto}}header{{padding:2.5rem 0 1.25rem;border-bottom:1px solid var(--border)}}h1{{margin:0;font-size:clamp(1.75rem,5vw,2.5rem);line-height:1.15;letter-spacing:-.035em}}header p,.method{{max-width:54rem;color:var(--secondary)}}.cloud-section{{padding:1.25rem 0;border-bottom:1px solid var(--border)}}.cloud-section h2,.map-panel h2{{margin:.25rem 0 .5rem}}.cloud{{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem .65rem;padding:.75rem 0}}.term{{min-height:2.25rem;padding:.2rem .35rem;border:0;border-radius:.25rem;background:transparent;line-height:1}}.term:hover,.term[aria-pressed="true"]{{background:var(--surface);color:var(--selected)}}.marketing-summary,.result-count{{margin:.5rem 0;color:var(--secondary);font:14px var(--mono)}}details{{margin-top:.75rem}}.controls{{display:flex;flex-wrap:wrap;gap:.5rem;padding:1rem 0}}label{{flex:1 1 18rem}}input{{width:100%;min-height:2.75rem;padding:.5rem .75rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--background);color:var(--foreground)}}.controls>button{{min-height:2.75rem;padding:.5rem .8rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--background);color:var(--foreground)}}.controls>button:hover{{background:var(--surface)}}.layout{{display:grid;grid-template-columns:minmax(0,2fr) minmax(17rem,1fr);gap:1.5rem}}.map-panel,.side-panel{{min-width:0}}.map-wrap{{position:relative;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--surface)}}svg{{display:block;width:100%;height:auto;touch-action:pan-y}}.zoom-ctl{{position:absolute;top:.5rem;right:.5rem;z-index:1;display:flex;flex-direction:column;gap:.25rem}}.zoom-ctl button{{width:2.75rem;height:2.75rem;padding:0;border:1px solid var(--border);border-radius:var(--radius);background:var(--background);color:var(--foreground);font-size:1.4rem;line-height:1}}.zoom-ctl button:hover{{background:var(--surface)}}.axis text{{fill:var(--secondary);font:14px var(--mono)}}.axis path,.axis line{{stroke:var(--border)}}.divider{{stroke:var(--secondary);stroke-dasharray:4 4;stroke-width:1}}.region-label{{fill:var(--secondary);font:14px var(--mono);paint-order:stroke;stroke:var(--surface);stroke-width:4px}}.point{{fill:var(--mark);fill-opacity:.62;stroke:var(--background);stroke-width:1;cursor:pointer}}.point:hover,.point:focus{{fill-opacity:1;stroke:var(--foreground);stroke-width:2}}.point.term-match{{fill:var(--selected);fill-opacity:.9;stroke:var(--foreground);stroke-width:2}}.point.selected{{fill:var(--foreground);fill-opacity:1;stroke:var(--selected);stroke-width:3}}.results{{list-style:none;padding:0;margin:0;max-height:29rem;overflow:auto;border-top:1px solid var(--border)}}.results li{{border-bottom:1px solid var(--border)}}.results button{{width:100%;height:auto;padding:.7rem 0;text-align:left;border:0;border-radius:0;background:transparent}}.results button:hover{{background:var(--surface)}}.results strong,.results span{{display:block}}.results span{{font-size:.875rem;color:var(--secondary)}}.details{{margin-top:1rem;padding:1rem;border:1px solid var(--border);border-radius:var(--radius)}}.details h2{{margin:0 0 .5rem;font-size:1.1rem}}.details p{{margin:.5rem 0}}.details dt{{margin-top:.65rem;color:var(--secondary);font:14px var(--mono)}}.details dd{{margin:.1rem 0 0}}.empty{{color:var(--secondary)}}footer{{padding:2rem 0;color:var(--secondary);font-size:.875rem}}@media(max-width:760px){{.layout{{grid-template-columns:minmax(0,1fr)}}.results{{max-height:18rem}}.term{{min-height:2.75rem;padding:.2rem .5rem}}.cloud{{gap:.25rem .4rem}}summary{{padding:.6rem 0}}.details a{{display:inline-block;padding:.6rem 0}}}}@media(prefers-reduced-motion:reduce){{*,*::before,*::after{{scroll-behavior:auto!important;transition:none!important;animation:none!important}}}}
</style></head><body><a class="skip" href="#main">Skip to visualization</a><header><h1>How Singapore attractions are marketed</h1><p>Repeated words in official overview text connect to the locations they describe. Choose a word to see its geographic pattern.</p></header><main id="main" tabindex="-1">
<section class="cloud-section" aria-labelledby="cloud-heading"><h2 id="cloud-heading">Frequent marketing words</h2><div id="cloud" class="cloud"></div><p id="marketing-summary" class="marketing-summary" aria-live="polite"></p><details><summary>Method</summary><p class="method">The source has {EXPECTED_DESCRIBED} descriptions for {EXPECTED_COUNT} attractions. Counts are document frequency, so a word counts once per description. The chart shows the 40 highest-frequency words found in at least two descriptions after HTML removal, Unicode case folding, and a versioned stopword list. Words are not stemmed. The location plot splits source coordinates at median longitude {median_lon:.6f} and median latitude {median_lat:.6f} into NW, NE, SW, and SE quadrants.</p></details></section>
<section class="controls" aria-label="Visualization controls"><label><span>Search attractions</span><input id="search" type="search" autocomplete="off" placeholder="Name, address, overview, or hours"></label><button id="reset" type="button">Reset all</button><button id="show-all" type="button">Show all results</button></section><div class="layout"><section class="map-panel" aria-labelledby="map-heading"><h2 id="map-heading">Where the language appears</h2><div class="map-wrap"><div class="zoom-ctl"><button id="zoom-in" type="button" aria-label="Zoom in">+</button><button id="zoom-out" type="button" aria-label="Zoom out">&minus;</button></div><svg id="map" viewBox="0 0 800 560" role="img"><title>Marketing language and attraction locations</title><desc>{len(rows)} points plotted by longitude and latitude with median quadrant lines. Word and search filters update the points, result list, and region counts.</desc></svg></div></section><aside class="side-panel" aria-label="Attraction results"><p id="count" class="result-count" aria-live="polite"></p><ol id="results" class="results"></ol><article id="details" class="details" aria-live="polite"><h2>Choose an attraction</h2><p class="empty">Select a point or result to view its full source overview.</p></article></aside></div></main><footer>Source: {escape(meta['source'])}. Fetched {meta['fetched']}.</footer>
<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script><script>
const csvData=`{data}`;const termCsvData=`{term_data}`;
const rows=d3.csvParse(csvData,d=>({{...d,longitude:+d.longitude,latitude:+d.latitude,offset_x:+d.offset_x,offset_y:+d.offset_y,marketing_terms:d.marketing_terms?d.marketing_terms.split("|"):[]}}));const terms=d3.csvParse(termCsvData,d=>({{...d,documents:+d.documents,nw:+d.nw,ne:+d.ne,sw:+d.sw,se:+d.se}}));
const state={{query:"",term:null,selection:null,visibleLimit:24,zoom:d3.zoomIdentity}};const byId=new Map(rows.map(d=>[d.id,d]));const medianLon={median_lon!r},medianLat={median_lat!r};
const svg=d3.select("#map");let width=800,height=560,margin,innerW,innerH,narrow=false;function dims(){{width=Math.max(300,Math.round(svg.node().getBoundingClientRect().width));narrow=width<560;height=narrow?440:560;margin=narrow?{{top:20,right:16,bottom:46,left:56}}:{{top:24,right:30,bottom:48,left:68}};innerW=width-margin.left-margin.right;innerH=height-margin.top-margin.bottom;svg.attr("viewBox",`0 0 ${{width}} ${{height}}`)}}dims();const x=d3.scaleLinear().domain(d3.extent(rows,d=>d.longitude)).nice().range([0,innerW]),y=d3.scaleLinear().domain(d3.extent(rows,d=>d.latitude)).nice().range([innerH,0]);const root=svg.append("g").attr("transform",`translate(${{margin.left}},${{margin.top}})`),xAxis=root.append("g").attr("class","axis").attr("transform",`translate(0,${{innerH}})`),yAxis=root.append("g").attr("class","axis");xAxis.append("text").attr("class","axis-title").attr("x",innerW/2).attr("y",40).attr("fill","currentColor").attr("text-anchor","middle").text("Longitude (°E)");yAxis.append("text").attr("class","axis-title").attr("transform","rotate(-90)").attr("x",-innerH/2).attr("y",-48).attr("fill","currentColor").attr("text-anchor","middle").text("Latitude (°N)");const clip=svg.append("defs").append("clipPath").attr("id","plot-clip").append("rect").attr("width",innerW).attr("height",innerH),plot=root.append("g").attr("clip-path","url(#plot-clip)"),regionLayer=root.append("g").attr("aria-hidden","true");regionLayer.selectAll("line").data(["vertical","horizontal"]).join("line").attr("class","divider");regionLayer.selectAll("text").data(["NW","NE","SW","SE"]).join("text").attr("class","region-label").attr("text-anchor","middle");const safe=s=>String(s||"").replace(/[&<>"']/g,c=>({{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}}[c]));
function filteredRows(filter={{}}){{const text=(filter.text??state.query).toString().trim().toLocaleLowerCase(),marketingTerm=(filter.marketing_term??state.term??"").toString().toLocaleLowerCase(),bbox=Array.isArray(filter.bbox)&&filter.bbox.length===4?filter.bbox.map(Number):null,hasHours=typeof filter.has_hours==="boolean"?filter.has_hours:null;return rows.filter(d=>{{const haystack=`${{d.title}} ${{d.address}} ${{d.overview}} ${{d.hours}}`.toLocaleLowerCase();return(!text||haystack.includes(text))&&(!marketingTerm||d.marketing_terms.includes(marketingTerm))&&(!bbox||(d.longitude>=bbox[0]&&d.latitude>=bbox[1]&&d.longitude<=bbox[2]&&d.latitude<=bbox[3]))&&(hasHours===null||Boolean(d.hours)===hasHours)}})}}
function regionalCounts(items){{const counts={{NW:0,NE:0,SW:0,SE:0}};items.forEach(d=>counts[d.region]++);return counts}}function selectTerm(term){{state.term=state.term===term?null:term;state.selection=null;state.visibleLimit=24;render()}}function selectRow(id){{state.selection=id;render();if(matchMedia("(max-width:760px)").matches)document.getElementById("details").scrollIntoView({{block:"nearest",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}})}}function detailsHtml(d){{if(!d)return'<h2>Choose an attraction</h2><p class="empty">Select a point or result to view its full source overview.</p>';return`<h2>${{safe(d.title)}}</h2>${{d.overview?`<p>${{safe(d.overview)}}</p>`:'<p class="empty">No overview provided.</p>'}}<dl><dt>Address</dt><dd>${{safe(d.address)||"Not provided"}}</dd><dt>Opening hours</dt><dd>${{safe(d.hours)||"Not provided"}}</dd><dt>Region</dt><dd>${{d.region}}</dd><dt>Coordinates</dt><dd>${{d.latitude.toFixed(6)}}, ${{d.longitude.toFixed(6)}}</dd></dl>${{d.url?`<p><a href="${{safe(d.url)}}" rel="noopener noreferrer">Visit attraction website</a></p>`:""}}`}}
function renderRegions(tx,ty,counts){{const mx=tx(medianLon),my=ty(medianLat);regionLayer.selectAll("line").attr("x1",d=>d==="vertical"?mx:0).attr("x2",d=>d==="vertical"?mx:innerW).attr("y1",d=>d==="horizontal"?my:0).attr("y2",d=>d==="horizontal"?my:innerH);const positions={{NW:[mx/2,my/2],NE:[(mx+innerW)/2,my/2],SW:[mx/2,(my+innerH)/2],SE:[(mx+innerW)/2,(my+innerH)/2]}};regionLayer.selectAll("text").attr("x",d=>positions[d][0]).attr("y",d=>positions[d][1]).text(d=>`${{d}} · ${{counts[d]}}`)}}
function render(){{const visible=filteredRows(),counts=regionalCounts(visible),tx=state.zoom.rescaleX(x),ty=state.zoom.rescaleY(y);if(state.selection&&!visible.some(d=>d.id===state.selection))state.selection=null;svg.style("touch-action",state.zoom.k>1?"none":"pan-y");xAxis.call(d3.axisBottom(tx).ticks(narrow?4:6));yAxis.call(d3.axisLeft(ty).ticks(narrow?5:6));xAxis.select(".axis-title").attr("x",innerW/2).attr("y",narrow?38:40);yAxis.select(".axis-title").attr("x",-innerH/2).attr("y",narrow?-44:-48);renderRegions(tx,ty,counts);plot.selectAll("circle").data(visible,d=>d.id).join("circle").attr("class",d=>`point${{state.term?" term-match":""}}${{d.id===state.selection?" selected":""}}`).attr("r",narrow?(state.term?8:6):(state.term?7:5)).attr("cx",d=>tx(d.longitude)+d.offset_x).attr("cy",d=>ty(d.latitude)+d.offset_y).attr("tabindex",0).attr("role","button").attr("aria-label",d=>d.title).on("click",(_,d)=>selectRow(d.id)).on("keydown",(event,d)=>{{if(event.key==="Enter"||event.key===" "){{event.preventDefault();selectRow(d.id)}}}});document.querySelectorAll(".term").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.term===state.term)));const regionText=`NW ${{counts.NW}}, NE ${{counts.NE}}, SW ${{counts.SW}}, SE ${{counts.SE}}`;document.getElementById("marketing-summary").textContent=state.term?`${{state.term}} appears in ${{visible.length}} matching descriptions. ${{regionText}}.`:`Choose a word. The full map shows ${{visible.length}} attractions. ${{regionText}}.`;document.getElementById("count").textContent=`${{visible.length}} of ${{rows.length}} attractions shown${{state.term?` for “${{state.term}}”`:""}}`;document.getElementById("results").innerHTML=visible.slice(0,state.visibleLimit).map(d=>`<li><button type="button" data-id="${{d.id}}"><strong>${{safe(d.title)}}</strong><span>${{safe(d.address)||"Address not provided"}}</span></button></li>`).join("")||'<li class="empty">No attractions match.</li>';document.querySelectorAll("#results button").forEach(button=>button.addEventListener("click",()=>selectRow(button.dataset.id)));document.getElementById("details").innerHTML=detailsHtml(byId.get(state.selection));document.getElementById("show-all").hidden=visible.length<=state.visibleLimit}}
const sizes=d3.scaleSqrt().domain(d3.extent(terms,d=>d.documents)).range([14,34]);d3.select("#cloud").selectAll("button").data(terms).join("button").attr("type","button").attr("class","term").attr("data-term",d=>d.term).attr("aria-pressed","false").attr("aria-label",d=>`${{d.term}}, ${{d.documents}} descriptions`).attr("title",d=>`${{d.documents}} descriptions · NW ${{d.nw}}, NE ${{d.ne}}, SW ${{d.sw}}, SE ${{d.se}}`).style("font-size",d=>`${{sizes(d.documents)}}px`).text(d=>d.term).on("click",(_,d)=>selectTerm(d.term));const zoom=d3.zoom().scaleExtent([1,14]).translateExtent([[0,0],[width,height]]).filter(event=>(!event.ctrlKey||event.type==="wheel")&&!event.button&&(event.type!=="touchstart"||event.touches.length>1||state.zoom.k>1)).on("zoom",event=>{{state.zoom=event.transform;render()}});svg.call(zoom);const zoomBy=k=>svg.transition().duration(matchMedia("(prefers-reduced-motion: reduce)").matches?0:200).call(zoom.scaleBy,k);document.getElementById("zoom-in").addEventListener("click",()=>zoomBy(1.6));document.getElementById("zoom-out").addEventListener("click",()=>zoomBy(1/1.6));addEventListener("resize",()=>{{if(Math.abs(svg.node().getBoundingClientRect().width-width)<=1)return;dims();x.range([0,innerW]);y.range([innerH,0]);root.attr("transform",`translate(${{margin.left}},${{margin.top}})`);xAxis.attr("transform",`translate(0,${{innerH}})`);clip.attr("width",innerW).attr("height",innerH);zoom.translateExtent([[0,0],[width,height]]);state.zoom=d3.zoomIdentity;svg.property("__zoom",d3.zoomIdentity);render()}});document.getElementById("search").addEventListener("input",event=>{{state.query=event.target.value;state.selection=null;state.visibleLimit=24;render()}});document.getElementById("reset").addEventListener("click",()=>{{state.query="";state.term=null;state.selection=null;state.visibleLimit=24;document.getElementById("search").value="";svg.transition().duration(matchMedia("(prefers-reduced-motion: reduce)").matches?0:250).call(zoom.transform,d3.zoomIdentity)}});document.getElementById("show-all").addEventListener("click",()=>{{state.visibleLimit=Infinity;render()}});render();
function toolResult(value){{return{{content:[{{type:"text",text:JSON.stringify(value)}}]}}}}function clientCsv(items){{return d3.csvFormat(items,["id","title","address","overview","hours","url","longitude","latitude","region","marketing_terms"])}}const mc=(typeof document!=="undefined"&&document.modelContext)||(typeof navigator!=="undefined"&&navigator.modelContext);
mc?.registerTool({{name:"get_data",description:"Return compact attraction and marketing-term CSV datasets.",inputSchema:{{type:"object",properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return toolResult({{count:rows.length,described:{EXPECTED_DESCRIBED},term_count:terms.length,format:"csv",attractions_csv:csvData,terms_csv:termCsvData,truncated:false,next_steps:["Use query to filter attractions or get_marketing_terms to limit the term table."]}})}}}});
mc?.registerTool({{name:"get_metadata",description:"Return source, method, coordinate bounds, and field descriptions.",inputSchema:{{type:"object",properties:{{}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(){{return toolResult({{title:"How Singapore attractions are marketed",source:{json.dumps(meta['source'])},fetched:{json.dumps(meta['fetched'])},count:rows.length,described:{EXPECTED_DESCRIBED},term_count:terms.length,stopwords_version:{json.dumps(STOPWORDS_VERSION)},measure:"document frequency per OVERVIEW",median:{{longitude:medianLon,latitude:medianLat}},bounds:{{west:d3.min(rows,d=>d.longitude),south:d3.min(rows,d=>d.latitude),east:d3.max(rows,d=>d.longitude),north:d3.max(rows,d=>d.latitude)}},truncated:false,next_steps:["Use get_data for both compact CSV tables or query for filtered rows and regional aggregates."]}})}}}});
mc?.registerTool({{name:"query",description:"Filter attractions by text, bounding box, hours, marketing term, and limit.",inputSchema:{{type:"object",properties:{{filter:{{type:"object",properties:{{text:{{type:"string"}},bbox:{{type:"array",items:{{type:"number"}},minItems:4,maxItems:4}},has_hours:{{type:"boolean"}},marketing_term:{{type:"string"}},limit:{{type:"integer",minimum:1,maximum:{len(rows)}}}}},additionalProperties:false}}}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(input={{}}){{const filter=input.filter||input,matches=filteredRows(filter),limit=Math.min(Math.max(Number(filter.limit)||25,1),rows.length),result=matches.slice(0,limit),regions=regionalCounts(matches);return toolResult({{total:matches.length,returned:result.length,truncated:matches.length>result.length,regions,csv:clientCsv(result),next_steps:matches.length>result.length?[`Increase limit up to ${{rows.length}} or narrow text, bbox, has_hours, or marketing_term.`]:["All matching rows returned."]}})}}}});
mc?.registerTool({{name:"get_marketing_terms",description:"Return the ranked marketing terms with document and regional counts.",inputSchema:{{type:"object",properties:{{limit:{{type:"integer",minimum:1,maximum:{TERM_LIMIT}}}}},additionalProperties:false}},annotations:{{readOnlyHint:true}},async execute(input={{}}){{const limit=Math.min(Math.max(Number(input.limit)||{TERM_LIMIT},1),{TERM_LIMIT}),result=terms.slice(0,limit);return toolResult({{total:terms.length,returned:result.length,truncated:terms.length>result.length,csv:d3.csvFormat(result,{json.dumps(TERM_FIELDS)}),next_steps:terms.length>result.length?[`Increase limit up to ${{terms.length}} for more terms.`]:["All ranked terms returned."]}})}}}});
</script></body></html>
'''


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


def verify(raw, meta, rows, term_rows, median_lon, median_lat):
    features = raw.get("features", [])
    assert raw.get("type") == "FeatureCollection" and len(features) == EXPECTED_COUNT
    assert all(f.get("geometry", {}).get("type") == "Point" for f in features)
    ids = [f["properties"]["OBJECTID_1"] for f in features]
    assert len(ids) == len(set(ids))
    assert sum(bool(repair_text(f["properties"].get("OVERVIEW"))) for f in features) == EXPECTED_DESCRIBED
    assert len(term_rows) == TERM_LIMIT and len({row["term"] for row in term_rows}) == TERM_LIMIT
    assert term_rows == sorted(term_rows, key=lambda row: (-int(row["documents"]), row["term"]))
    assert not any(row["term"] in STOPWORDS or int(row["documents"]) < 2 for row in term_rows)
    term_names = [row["term"] for row in term_rows]
    source_by_id = {f["properties"]["OBJECTID_1"]: f for f in features}
    for row in rows:
        feature = source_by_id[int(row["id"])]
        lon, lat = feature["geometry"]["coordinates"]
        assert float(row["longitude"]) == lon and float(row["latitude"]) == lat
        assert math.isclose(lon, float(feature["properties"]["LONGTITUDE"]), abs_tol=1e-6) and math.isclose(lat, float(feature["properties"]["LATITUDE"]), abs_tol=1e-6)
        assert row["marketing_terms"] == "|".join(term for term in term_names if term in overview_terms(feature["properties"].get("OVERVIEW")))
        assert row["region"] == region_for(lon, lat, median_lon, median_lat)
    for term_row in term_rows:
        assert sum(int(term_row[region]) for region in ("nw", "ne", "sw", "se")) == int(term_row["documents"])
    by_term = {row["term"]: row for row in term_rows}
    assert by_term["museum"] == {"term": "museum", "documents": "14", "nw": "5", "ne": "6", "sw": "2", "se": "1"}
    assert by_term["heritage"]["documents"] == "12"
    html = VIZ.read_text()
    gallery = GALLERY.read_text()
    embedded_rows = re.search(r"const csvData=`(.*?)`;", html, re.S)
    embedded_terms = re.search(r"const termCsvData=`(.*?)`;", html, re.S)
    assert embedded_rows and len(list(csv.DictReader(io.StringIO(embedded_rows.group(1))))) == EXPECTED_COUNT
    assert embedded_terms and len(list(csv.DictReader(io.StringIO(embedded_terms.group(1))))) == TERM_LIMIT
    assert html.count("<script src=") == 1 and "d3@7.9.0" in html
    for name in ("get_data", "get_metadata", "query", "get_marketing_terms"):
        assert f'name:"{name}"' in html
    assert html.count("annotations:{readOnlyHint:true}") == 4
    assert 'id="cloud"' in html and 'id="marketing-summary"' in html and '.attr("class","term")' in html and '.attr("class","region-label")' in html
    assert "mc?.registerTool" in html and f'href="viz/{SLUG}/index.html"' in gallery
    assert meta["key_file_used"] is None and re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["fetched"])
    tracked_text = "\n".join(path.read_text(errors="ignore") for path in ROOT.rglob("*") if path.is_file() and ".git" not in path.parts)
    assert not re.search(r"/(?:Users|home)/[^/\s]+/", tracked_text)
    assert Counter((row["longitude"], row["latitude"]) for row in rows).most_common(1)[0][1] > 1 and any(float(row["offset_x"]) or float(row["offset_y"]) for row in rows)
    print("verified: 109 points, 106 descriptions, 40 ranked terms, exact coordinates and term sets, museum 14 (5/6/2/1), heritage 12, 2 compact CSVs, 4 read-only tools")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    raw, meta, tokens = load_inputs()
    rows, term_rows, median_lon, median_lat = prepare_data(raw)
    if not args.verify:
        VIZ.parent.mkdir(parents=True, exist_ok=True)
        VIZ.write_text(render_viz(rows, term_rows, median_lon, median_lat, meta, tokens))
        GALLERY.write_text(render_gallery())
    verify(raw, meta, rows, term_rows, median_lon, median_lat)


if __name__ == "__main__":
    main()
