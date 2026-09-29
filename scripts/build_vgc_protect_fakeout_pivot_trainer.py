#!/usr/bin/env python3
"""Builder and verifier for the vgc-protect-fakeout-pivot-trainer visualization.

An interactive turn trainer for Protect, Fake Out and pivot moves (Parting Shot)
using a Delphox + Blastoise team like Justin Tang's, in Pokemon Champions
Regulation Set M-C. Every mechanic, team detail and rule is recorded with its
source in data/<slug>/raw.json and meta.json; the hand-authored scenarios live
in data/<slug>/scenarios.json. Opponent plans are hypothetical and scripted, and
the page says so. --verify re-checks priorities, type matchups, movesets and
the page itself against that data.
"""
import argparse
import json
import re
from html import escape
from pathlib import Path

from gallery import render_gallery

ROOT = Path(__file__).resolve().parents[1]
SLUG = "vgc-protect-fakeout-pivot-trainer"
RAW = ROOT / "data" / SLUG / "raw.json"
SCEN = ROOT / "data" / SLUG / "scenarios.json"
META = ROOT / "data" / SLUG / "meta.json"
TOKENS = ROOT / "design-tokens.json"
VIZ = ROOT / "viz" / SLUG / "index.html"
GALLERY = ROOT / "index.html"

TITLE = "Win the turn: Protect, Fake Out and pivots"
H1 = "Win the turn before the moves land: Protect, Fake Out and pivots"
DESCRIPTION = (
    "Seven turn-by-turn drills with a Delphox + Blastoise team from Justin Tang, "
    "in Regulation M-C: Protect beats Fake Out at +4 to +3, Quick Guard ties it, "
    "and a Parting Shot pivot only works when it connects."
)
RULE_LABEL = {
    "fake-out": "Fake Out", "priority": "Priority", "flinch": "Flinch",
    "ghost-immunity": "Ghost immunity", "first-turn-only": "First turn only",
    "protect": "Protect", "protect-chain": "Protect chain", "quick-guard": "Quick Guard",
    "sucker-punch": "Sucker Punch", "scouting": "Scouting", "trick-room": "Trick Room",
    "switching": "Switching", "parting-shot": "Parting Shot", "pivot": "Pivot",
    "intimidate": "Intimidate", "defiant": "Defiant",
}
FEATURED = ["Protect", "Fake Out", "Quick Guard", "Parting Shot"]

CSS = """
:root{--bg:%%background%%;--fg:%%foreground%%;--muted:%%secondary%%;--surface:%%surface%%;--border:%%border%%;--focus:%%focus%%;--you:%%mark%%;--opp:%%selected%%;--sans:%%font_sans%%;--mono:%%font_mono%%;--r:%%radius%%;color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 var(--sans)}
main,footer{width:min(100% - 2rem,%%content_width%%);margin:auto}
main{padding:clamp(1.5rem,5vw,3.5rem) 0 1.5rem}
h1{max-width:24ch;margin:0 0 .8rem;font-size:clamp(1.9rem,6vw,3.6rem);line-height:1.05;letter-spacing:-.04em}
h2{margin:0 0 .25rem;font-size:1.25rem;line-height:1.25}
h3{margin:1.25rem 0 .35rem;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:600}
p{margin:.35rem 0}
.method{max-width:72ch;color:var(--muted)}
.method strong{color:var(--fg)}
button{font:inherit;cursor:pointer;border:1px solid var(--border);border-radius:var(--r);background:var(--bg);color:var(--fg);padding:.55rem .8rem;min-height:2.75rem;text-align:left}
button:hover{background:var(--surface)}
button:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
button[aria-pressed=true]{border-color:var(--fg);box-shadow:inset 0 0 0 1px var(--fg)}
button[aria-disabled=true]{color:var(--muted);background:var(--surface);border-style:dashed}
.tabs{display:flex;flex-wrap:wrap;gap:.4rem;margin:1.25rem 0 1rem;padding:0;list-style:none}
.tabs button{padding:.45rem .7rem;font-size:.9rem;text-align:center}
.trainer{border-top:1px solid var(--border);padding-top:1rem}
.lesson{max-width:70ch}
.assume{color:var(--muted);font-size:.875rem;max-width:70ch}
.tags{display:flex;flex-wrap:wrap;gap:.35rem;margin:.5rem 0 0;padding:0;list-style:none}
.tags li,.ty,.tag{display:inline-block;border:1px solid var(--border);border-radius:1rem;padding:0 .5rem;font:.75rem/1.5 var(--mono);color:var(--muted);white-space:nowrap}
.turnhead{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;margin-top:1.25rem;flex-wrap:wrap}
.turnhead .n{font:.8rem var(--mono);color:var(--muted)}
.board{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;margin:.75rem 0}
.side-label{grid-column:1/-1;margin:.25rem 0 0;font:.75rem var(--mono);letter-spacing:.06em;text-transform:uppercase}
.side-label.you{color:var(--you)}
.side-label.opp{color:var(--opp)}
.mon{min-width:0;border:1px solid var(--border);border-left-width:4px;border-radius:var(--r);padding:.5rem .6rem;background:var(--surface)}
.mon.you{border-left-color:var(--you)}
.mon.opp{border-left-color:var(--opp)}
.mon b{display:block;overflow-wrap:anywhere}
.mon .row{display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.25rem}
.field,.bench{color:var(--muted);font-size:.875rem;margin:.25rem 0}
.plan{margin:.5rem 0;padding:.5rem .75rem;border:1px dashed var(--border);border-radius:var(--r);font-size:.9rem;color:var(--muted)}
.plan.shown{color:var(--fg)}
.opts{list-style:none;margin:.75rem 0;padding:0;display:grid;gap:.5rem}
.opts button{width:100%;display:block}
.opts .u{display:block;font-size:.8rem;color:var(--muted)}
.result{margin-top:1rem;min-height:4rem}
.badge{display:inline-block;padding:.1rem .6rem;border-radius:1rem;font:600 .8rem var(--mono);border:1px solid var(--border)}
.badge.best{background:var(--you);border-color:var(--you);color:#fff}
.badge.ok{background:var(--surface)}
.badge.bad{background:var(--opp);border-color:var(--opp);color:#fff}
.ladder{width:100%;height:auto;display:block;margin:.5rem 0}
.ladder text{font-family:var(--sans)}
.ladder .cap,.ladder .res,.ladder .pill{font-family:var(--mono)}
.ladder .cap{font-size:11px;fill:var(--muted)}
.ladder .mv{font-size:13px;font-weight:600;fill:var(--fg)}
.ladder .nt{font-size:12px;fill:var(--muted)}
.ladder .res{font-size:11px;font-weight:700;fill:var(--fg)}
.ladder .res.bad{fill:var(--opp)}
.ladder .pill{font-size:11px;font-weight:700;fill:var(--fg);text-anchor:middle}
.ladder .dead{text-decoration:line-through}
.ladder .rule{stroke:var(--border)}
ul.plain{margin:.25rem 0;padding-left:1.1rem}
ul.plain li{margin:.2rem 0}
.math{font:.85rem var(--mono);color:var(--muted)}
.actions{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0}
.actions button{text-align:center}
.take{margin-top:1rem;padding:1rem;border:1px solid var(--fg);border-radius:var(--r)}
details{margin:1.25rem 0;border-top:1px solid var(--border);padding-top:.5rem}
summary{cursor:pointer;min-height:2.75rem;display:flex;align-items:center;font-weight:600}
summary:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.team{display:grid;gap:.5rem;padding:0;list-style:none;margin:.5rem 0}
.team li{border:1px solid var(--border);border-radius:var(--r);padding:.5rem .75rem;font-size:.9rem}
.rules{display:grid;gap:.5rem;padding:0;list-style:none;margin:.5rem 0}
.rules li{border:1px solid var(--border);border-radius:var(--r);padding:.6rem .75rem;font-size:.9rem}
.rules b{font-family:var(--mono)}
footer{padding:1.5rem 0 2.5rem;border-top:1px solid var(--border);color:var(--muted);font-size:.875rem}
footer ul{list-style:none;padding:0;margin:.5rem 0}
footer a{display:inline-block;padding:.5rem 0;color:inherit;text-underline-offset:.18em;overflow-wrap:anywhere}
@media(min-width:760px){.board{grid-template-columns:repeat(4,minmax(0,1fr))}.side-label{grid-column:span 2}.opts{grid-template-columns:repeat(2,minmax(0,1fr))}.team{grid-template-columns:repeat(2,minmax(0,1fr))}.rules{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
"""

JS = r"""
const D=%%DATA%%,mv=D.moves,sp=D.species,RL=%%RULES%%,NS="http://www.w3.org/2000/svg",reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
const $=s=>document.querySelector(s);
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e};
const svgEl=(t,a,p)=>{const e=document.createElementNS(NS,t);for(const[k,v]of Object.entries(a||{}))e.setAttribute(k,v);if(p)p.append(e);return e};
const ctx=document.createElement("canvas").getContext("2d");
const measure=(s,f)=>{ctx.font=f;return ctx.measureText(s).width};
let si=0,ti=0,oi=null,current=null;const done=new Set();
const sc=()=>D.scenarios[si],turn=()=>sc().turns[ti],last=()=>ti===sc().turns.length-1;
const prio=n=>n==="switch"?6:mv[n].priority;
const plabel=n=>n==="switch"?"sw":(prio(n)>0?"+"+prio(n):String(prio(n)));
const RESW={lands:"lands",blocked:"blocked",immune:"no effect",fails:"fails",flinched:"flinched"};
const VERD={best:"Best line",ok:"Works, but costly",bad:"Backfires"};
function wrap(text,maxW,font){const words=text.split(" "),lines=[];let cur="";for(const w of words){const t=cur?cur+" "+w:w;if(measure(t,font)<=maxW||!cur)cur=t;else{lines.push(cur);cur=w}}if(cur)lines.push(cur);return lines}
function ladder(order,host){
  const W=Math.max(280,Math.round(host.getBoundingClientRect().width)||320),tx=52,availW=W-tx-4,pad=10;
  const svg=svgEl("svg",{class:"ladder",role:"img","aria-label":"Resolution order, first to last: "+order.map(a=>plabel(a.move)+" "+a.who+" "+a.move+" "+RESW[a.result]).join("; ")});
  svgEl("title",{},svg).textContent="Resolution order of the turn";
  const cap=svgEl("text",{x:0,y:12,class:"cap"},svg);cap.textContent="Turn order, first at the top. Blue bar: yours. Red bar: theirs.";
  const rows=[];let y=26;
  order.forEach((a,i)=>{
    const dead=a.result!=="lands",who=(a.side==="opp"?"Opp. ":"")+a.who,l1=a.move==="switch"?who+" switches to "+a.target:who+" · "+a.move,f1="600 13px system-ui,sans-serif",f2="12px system-ui,sans-serif",fr="700 11px ui-monospace,monospace";
    const resw=measure(RESW[a.result].toUpperCase(),fr),fits=measure(l1,f1)+resw+14<=availW;
    const tgt=a.move==="switch"?a.note:"→ "+a.target+" · "+a.note,nl=wrap(tgt,availW,f2);
    const h=pad+18+(fits?0:16)+nl.length*16+pad;
    rows.push({a,y,h,dead,l1,fits,nl});y+=h;
  });
  svgEl("line",{x1:20,x2:20,y1:26,y2:y-pad,stroke:"var(--border)","stroke-width":2},svg);
  rows.forEach((r,i)=>{
    const{a,y:y0,h,dead,l1,fits,nl}=r;
    if(i>0)svgEl("line",{x1:tx,x2:W,y1:y0,y2:y0,class:"rule"},svg);
    svgEl("rect",{x:0,y:y0+pad-2,width:40,height:20,rx:10,fill:"var(--bg)",stroke:"var(--border)"},svg);
    svgEl("text",{x:20,y:y0+pad+12,class:"pill"},svg).textContent=plabel(a.move);
    svgEl("rect",{x:44,y:y0+pad-2,width:3,height:h-2*pad+4,fill:a.side==="opp"?"var(--opp)":"var(--you)"},svg);
    const t1=svgEl("text",{x:tx,y:y0+pad+12,class:"mv"+(dead?" dead":"")},svg);t1.textContent=l1;
    let ly=y0+pad+12;
    const res=svgEl("text",{class:"res"+(dead?" bad":"")},svg);res.textContent=(dead?"✕ ":"✓ ")+RESW[a.result].toUpperCase();
    if(fits){res.setAttribute("x",W);res.setAttribute("y",ly);res.setAttribute("text-anchor","end")}else{ly+=16;res.setAttribute("x",tx);res.setAttribute("y",ly)}
    nl.forEach(s=>{ly+=16;svgEl("text",{x:tx,y:ly,class:"nt"},svg).textContent=s});
  });
  svg.setAttribute("viewBox","0 0 "+W+" "+y);svg.setAttribute("height",y);host.append(svg);
}
function monCard(m,side){const c=el("div","mon "+side);c.append(el("b",null,m.name));const r=el("div","row");for(const t of(sp[m.name]||{types:[]}).types)r.append(el("span","ty",t));for(const g of m.tags)r.append(el("span","tag",g));c.append(r);return c}
function renderTabs(){const box=$("#tabs");box.replaceChildren();D.scenarios.forEach((s,i)=>{const li=el("li"),b=el("button",null,(i+1)+" "+s.short+(done.has(i)?" ✓":""));b.type="button";b.setAttribute("aria-pressed",i===si);b.setAttribute("aria-label","Scenario "+(i+1)+": "+s.title+(done.has(i)?", completed":""));b.addEventListener("click",()=>{si=i;ti=0;oi=null;render()});li.append(b);box.append(li)})}
function render(){
  renderTabs();const s=sc(),t=turn(),root=$("#trainer");root.replaceChildren();
  root.append(el("h2",null,s.title),el("p","lesson",s.lesson));
  const tg=el("ul","tags");for(const r of s.rules)tg.append(el("li",null,RL[r]));root.append(tg);
  root.append(el("p","assume","Assumption: "+s.assumption));
  const th=el("div","turnhead");th.append(el("h3",null,t.title),el("span","n","Turn "+(ti+1)+" of "+s.turns.length));root.append(th);
  root.append(el("p",null,t.prompt));
  const bd=el("div","board");bd.append(el("p","side-label opp","Opponent"),el("p","side-label you","You"));
  const ob=[...t.opp.map(m=>monCard(m,"opp")),...t.you.map(m=>monCard(m,"you"))];
  const wide=matchMedia("(min-width:760px)").matches;
  if(wide){bd.replaceChildren(el("p","side-label opp","Opponent"),el("p","side-label you","You"),...ob)}else{bd.replaceChildren(el("p","side-label opp","Opponent"),ob[0],ob[1],el("p","side-label you","You"),ob[2],ob[3])}
  root.append(bd,el("p","field",t.field),el("p","bench","Your bench: "+t.bench.join(", ")+"."));
  const plan=el("p","plan"+(oi!==null?" shown":""),oi!==null?"Their plan: "+t.opp_plan:"Their plan is hidden until you act.");plan.id="plan";root.append(plan);
  root.append(el("h3",null,"Your move"));
  const ol=el("ol","opts");t.options.forEach((o,i)=>{const li=el("li"),b=el("button");b.type="button";b.setAttribute("aria-pressed",i===oi);if(o.disabled)b.setAttribute("aria-disabled","true");b.append(document.createTextNode(o.label));if(o.disabled)b.append(el("span","u","Unavailable: tap to see why"));b.addEventListener("click",()=>{oi=i;render();const r=$("#result");if(r&&!reduced)r.scrollIntoView({block:"nearest",behavior:"smooth"})});li.append(b);ol.append(li)});root.append(ol);
  const res=el("div","result");res.id="result";res.setAttribute("aria-live","polite");root.append(res);
  if(oi!==null)renderResult(res,t.options[oi]);else res.append(el("p","assume","Pick a line to see the order the turn resolves in, and why."));
  const reset=el("button",null,"Restart scenario");reset.type="button";reset.addEventListener("click",()=>{ti=0;oi=null;render()});const acts=el("div","actions");acts.append(reset);root.append(acts);
}
function renderResult(res,o){
  res.append(el("span","badge "+(o.disabled?"ok":o.verdict),o.disabled?"Unavailable":VERD[o.verdict]));
  if(o.disabled){res.append(el("p",null,o.disabled));return}
  current=o;const host=el("div");res.append(host);ladder(o.order,host);
  res.append(el("h3",null,"What happens"));const u=el("ul","plain");for(const x of o.happens)u.append(el("li",null,x));res.append(u);
  if(o.branches)for(const b of o.branches){const p=el("p",null);const s=el("strong",null,b.p+": ");p.append(s,document.createTextNode(b.text));res.append(p)}
  res.append(el("h3",null,"Why"));const w=el("ul","plain");for(const x of o.why)w.append(el("li",null,x));res.append(w);
  if(o.checks.length){res.append(el("h3",null,"Type math"));const m=el("ul","plain math");for(const c of o.checks)m.append(el("li",null,c.move+" → "+c.def.join("/")+": ×"+c.x+(c.x===0?" (no effect)":"")));res.append(m)}
  const acts=el("div","actions");
  if(o.verdict==="best"){
    if(!last()){const n=el("button",null,"Next turn →");n.type="button";n.addEventListener("click",()=>{ti++;oi=null;render();$("#trainer").scrollIntoView({block:"start",behavior:reduced?"auto":"smooth"})});acts.append(n)}
    else{done.add(si);renderTabs();const tk=el("div","take");tk.append(el("strong",null,"Takeaway. "),document.createTextNode(sc().takeaway));res.append(tk);const n=el("button",null,si<D.scenarios.length-1?"Next scenario →":"Back to scenario 1");n.type="button";n.addEventListener("click",()=>{si=(si+1)%D.scenarios.length;ti=0;oi=null;render();$("#trainer").scrollIntoView({block:"start",behavior:reduced?"auto":"smooth"})});acts.append(n)}
  }else{const b=el("button",null,"Show the best line");b.type="button";b.addEventListener("click",()=>{oi=turn().options.findIndex(x=>x.verdict==="best");render()});acts.append(b)}
  res.append(acts);
}
render();
let lastW=0;addEventListener("resize",()=>{const w=innerWidth;if(Math.abs(w-lastW)>1){lastW=w;render()}});lastW=innerWidth;
const result=v=>({content:[{type:"text",text:JSON.stringify(v)}]}),mc=(typeof document!=="undefined"&&document.modelContext)||(typeof navigator!=="undefined"&&navigator.modelContext);
mc?.registerTool({name:"get_data",description:"Return the team, species, move table and all practice scenarios behind the trainer.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},async execute(){return result({team:D.team,species:sp,moves:mv,scenarios:D.scenarios,truncated:false,next_steps:["Use query to filter options by scenario, verdict or move."]})}});
mc?.registerTool({name:"get_metadata",description:"Return the claim, regulation, team source, sources, assumptions and caveats.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true},async execute(){return result({title:document.title,claim:%%CLAIM%%,regulation:D.regulation,team_source:D.team_source,sources:D.sources,fetched:D.fetched,assumptions:D.assumptions,caveat:"Opponent plans are hypothetical and scripted; speed order is stated per scenario and no damage is simulated.",truncated:false})}});
mc?.registerTool({name:"query",description:"Filter practice options by scenario id, verdict (best, ok, bad) or move name.",inputSchema:{type:"object",properties:{scenario:{type:"string"},verdict:{type:"string",enum:["best","ok","bad"]},move:{type:"string"}},additionalProperties:false},annotations:{readOnlyHint:true},async execute(input={}){const rows=[];for(const s of D.scenarios){if(input.scenario&&s.id!==input.scenario)continue;s.turns.forEach((t,ti)=>t.options.forEach(o=>{if(input.verdict&&o.verdict!==input.verdict)return;if(input.move&&!o.order.some(a=>a.move.toLowerCase()===input.move.toLowerCase())&&!o.label.toLowerCase().includes(input.move.toLowerCase()))return;rows.push({scenario:s.id,turn:ti+1,label:o.label,verdict:o.verdict,disabled:o.disabled||null,happens:o.happens,why:o.why})}))}return result({rows,total:rows.length,truncated:false,next_steps:rows.length?["All matching options returned."]:["Try scenario ids: "+D.scenarios.map(s=>s.id).join(", ")]})}});
"""


def load():
    return (
        json.loads(RAW.read_text(encoding="utf-8")),
        json.loads(SCEN.read_text(encoding="utf-8")),
        json.loads(META.read_text(encoding="utf-8")),
    )


def page_data(raw, scen, meta):
    used = {
        m["name"]
        for sc in scen["scenarios"]
        for t in sc["turns"]
        for side in ("you", "opp")
        for m in t[side]
    }
    species = {n: {"types": raw["species"][n]["types"]} for n in sorted(used)}
    return {
        "team": raw["team"]["members"],
        "team_source": {k: raw["team"][k] for k in ("player", "event", "placement", "record", "regulation_played", "sources")},
        "regulation": raw["regulation"],
        "species": species,
        "moves": raw["moves"],
        "scenarios": scen["scenarios"],
        "sources": raw["sources"],
        "assumptions": meta["assumptions"],
        "fetched": meta["fetched"],
    }


def render(raw, scen, meta, tokens):
    colors = tokens["colors"]
    css = CSS
    for key, val in {**colors, "font_sans": tokens["font_sans"], "font_mono": tokens["font_mono"],
                     "radius": tokens["radius"], "content_width": tokens["content_width"]}.items():
        css = css.replace(f"%%{key}%%", val)
    data = json.dumps(page_data(raw, scen, meta), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    claim = json.dumps("Priority decides the turn: Protect (+4) beats Fake Out (+3), Quick Guard ties Fake Out, and a pivot only works when it connects.")
    js = JS.replace("%%DATA%%", data).replace("%%RULES%%", json.dumps(RULE_LABEL)).replace("%%CLAIM%%", claim)

    team_items = "".join(
        f'<li><strong>{escape(m["species"])}</strong> ({escape("/".join(m["types"]))}) · {escape(m["item"])} · {escape(m["ability"])} · {escape(m["nature"])}<br>{escape(", ".join(m["moves"]))}</li>'
        for m in raw["team"]["members"]
    )
    rule_items = "".join(
        f'<li><b>{escape(n)}</b> · {escape(raw["moves"][n]["type"])} · priority {raw["moves"][n]["priority"]:+d} · {raw["moves"][n]["pp_champions"]} PP in Champions<br>{escape(raw["moves"][n]["effect"])} '
        f'<a href="{escape(next(s["url"] for s in raw["sources"] if s["id"] == raw["moves"][n]["source"]))}" rel="noopener noreferrer">Source</a></li>'
        for n in FEATURED
    )
    assumption_items = "".join(f"<li>{escape(a)}</li>" for a in meta["assumptions"])
    source_links = "".join(
        f'<li><a href="{escape(s["url"])}" rel="noopener noreferrer">{escape(s["label"])}</a></li>' for s in raw["sources"]
    )
    noscript = "".join(
        f'<li><strong>{escape(s["title"])}.</strong> {escape(s["lesson"])} {escape(s["takeaway"])}</li>'
        for s in scen["scenarios"]
    )
    reg = raw["regulation"]
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><meta name="description" content="{escape(DESCRIPTION)}"><title>{escape(TITLE)}</title><style>{css}</style></head><body><main><h1>{escape(H1)}</h1><p class="method">Seven drills for <strong>Regulation Set M-C</strong> doubles (register six, bring four, level 50, one Mega Evolution per battle). You play <strong>Justin Tang's Worlds 2026 team</strong>, with its Delphox and Blastoise, against a scripted opponent. Pick a line each turn and see the order the turn resolves in, and why. <strong>Not verified:</strong> Tang played this team under Regulation M-B; M-C legality comes from a third-party list. The opponent's plans, and who is faster, are stated assumptions, not simulated.</p><ul class="tabs" id="tabs" aria-label="Scenarios"></ul><section class="trainer" id="trainer" aria-label="Turn trainer"></section><noscript><ol>{noscript}</ol></noscript><details><summary>Justin Tang's six ({escape(raw["team"]["placement"])} at Worlds 2026, {escape(raw["team"]["record"])})</summary><ul class="team">{team_items}</ul><p class="assume">Source: Limitless VGC team list. {escape(raw["team"]["regulation_played"])}.</p></details><details><summary>Rule sheet: the four moves this page teaches</summary><ul class="rules">{rule_items}</ul></details><details open><summary>What is sourced and what is assumed</summary><ul class="plain">{assumption_items}</ul></details></main><footer>Regulation window (Pokémon.com): {escape(reg["official_window"])}. Retrieved {escape(meta["fetched"])}.<ul>{source_links}</ul></footer><script>{js}</script></body></html>
'''


EXPECTED_SOURCE = "https://limitlessvgc.com/tournaments/437/teams"
TEAM_SPECIES = {"Sneasler", "Sinistcha", "Kingambit", "Blastoise", "Delphox", "Incineroar"}


def effectiveness(chart, move_type, defenders):
    x = 1.0
    for d in defenders:
        x *= chart.get(move_type, {}).get(d, 1)
    return x


def verify(raw, scen, meta):
    source_ids = {s["id"]: s["url"] for s in raw["sources"]}
    assert len(source_ids) == len(raw["sources"]) == 20
    assert meta["slug"] == SLUG and meta["source_url"] == EXPECTED_SOURCE
    assert meta["sources"] == [s["url"] for s in raw["sources"]]
    assert meta["fetched"] == "2026-09-29" and meta["key_file_used"] is False
    assert len(meta["assumptions"]) == 5
    assert all(u.startswith("https://") for u in meta["sources"])
    for n in ("regulation", "team"):
        assert all(s in source_ids for s in raw[n]["sources"]), n

    # Team: six members, Delphox and Blastoise both carry Protect and a Mega Stone.
    members = {m["species"]: m for m in raw["team"]["members"]}
    assert set(members) == TEAM_SPECIES and len(raw["team"]["members"]) == 6
    assert "Protect" in members["Delphox"]["moves"] and members["Delphox"]["item"] == "Delphoxite"
    assert "Protect" in members["Blastoise"]["moves"] and members["Blastoise"]["item"] == "Blastoisinite"
    assert "Fake Out" in members["Incineroar"]["moves"] and "Parting Shot" in members["Incineroar"]["moves"]
    assert "Fake Out" in members["Sneasler"]["moves"] and "Quick Guard" in members["Sneasler"]["moves"]
    assert "Protect" not in members["Incineroar"]["moves"] and "Protect" not in members["Sneasler"]["moves"]
    items = [m["item"] for m in raw["team"]["members"]]
    assert len(set(items)) == 6, "item clause"
    assert raw["team"]["regulation_played"].startswith("Regulation Set M-B")
    legal = raw["regulation"]["legality_of_team_in_mc"]
    assert all(legal["species"][s] for s in TEAM_SPECIES) and all(legal["items"][i] for i in items)
    assert set(raw["practice_four"]) <= TEAM_SPECIES and len(raw["practice_four"]) == 4

    # Move facts the page teaches.
    m = raw["moves"]
    assert (m["Protect"]["priority"], m["Fake Out"]["priority"], m["Quick Guard"]["priority"]) == (4, 3, 3)
    assert m["Sucker Punch"]["priority"] == 1 and m["Trick Room"]["priority"] == -7
    assert m["Protect"]["pp_champions"] == 8 and m["Fake Out"]["pp_champions"] == 12
    assert m["Parting Shot"]["category"] == "Status" and m["Parting Shot"]["type"] == "Dark"
    assert raw["protect_chain"][:3] == [1, 0.3333, 0.1111]
    for name in FEATURED:
        assert m[name]["source"] in source_ids

    # Scenarios: structure, priorities, movesets and type math.
    chart = raw["type_chart"]
    opp_moves = {
        "Rillaboom": {"Fake Out", "Protect", "Wood Hammer"},
        "Kingambit": {"Sucker Punch", "Kowtow Cleave", "Protect"},
        "Sinistcha": {"Trick Room", "Matcha Gotcha"},
        "Sneasler": {"Close Combat", "Protect"},
    }
    scs = scen["scenarios"]
    assert [s["id"] for s in scs] == [
        "fake-out-free-turn", "protect-beats-fake-out", "quick-guard-both", "protect-scout",
        "protect-stall", "parting-shot-reposition", "pivot-pitfalls",
    ]
    options = 0
    for sc in scs:
        assert sc["turns"] and sc["takeaway"] and sc["lesson"] and sc["assumption"] and sc["short"]
        assert all(r in RULE_LABEL for r in sc["rules"])
        for t in sc["turns"]:
            assert len(t["you"]) == 2 and len(t["opp"]) == 2
            assert all(n["name"] in raw["species"] for side in ("you", "opp") for n in t[side])
            assert all(n["name"] in TEAM_SPECIES for n in t["you"]), "your side must be from the team"
            assert all(b in TEAM_SPECIES for b in t["bench"])
            assert t["opp_plan"] and t["prompt"] and t["field"]
            assert [o["verdict"] for o in t["options"]].count("best") == 1, (sc["id"], t["title"])
            for o in t["options"]:
                options += 1
                assert o["verdict"] in ("best", "ok", "bad") and o["label"]
                if o.get("disabled"):
                    assert not o["order"] and o["verdict"] != "best"
                    continue
                assert o["order"] and o["happens"] and o["why"]
                last = 99
                for a in o["order"]:
                    assert a["result"] in ("lands", "blocked", "immune", "fails", "flinched")
                    assert a["side"] in ("you", "opp")
                    if a["move"] == "switch":
                        p = 6
                    else:
                        assert a["move"] in m, a
                        p = m[a["move"]]["priority"]
                        if a["side"] == "you":
                            assert a["move"] in members[a["who"]]["moves"], (sc["id"], a)
                            assert a["who"] in [x["name"] for x in t["you"]]
                        else:
                            assert a["move"] in opp_moves[a["who"]], (sc["id"], a)
                    assert p <= last, (sc["id"], t["title"], o["label"], "order breaks priority")
                    last = p
                    if a["move"] == "Fake Out" and a["result"] == "immune":
                        assert "Ghost" in a["note"]
                for c in o["checks"]:
                    assert effectiveness(chart, c["move"], c["def"]) == c["x"], (sc["id"], c)
    assert options == 49

    # Specific teaching claims.
    s1 = scs[0]["turns"][0]["options"][1]
    assert s1["order"][0]["result"] == "immune" and s1["checks"][0] == {"move": "Normal", "def": ["Grass", "Ghost"], "x": 0}
    assert effectiveness(chart, "Fighting", ["Dark", "Steel"]) == 4
    assert effectiveness(chart, "Dark", ["Fire", "Psychic"]) == 2 and effectiveness(chart, "Grass", ["Water"]) == 2

    html = VIZ.read_text(encoding="utf-8")
    assert html.count("<h1>") == 1 and html.count("<script") == 1
    assert "<script src=" not in html and '<link rel="stylesheet"' not in html
    assert html.count("mc?.registerTool") == 3 and html.count("readOnlyHint:true") == 3
    for name in ("get_data", "get_metadata", "query"):
        assert f'name:"{name}"' in html
    for needle in ("Regulation Set M-C", "Not verified", "Regulation M-B", "hypothetical", "matchMedia", "prefers-reduced-motion"):
        assert needle in html, needle
    assert "<title>" + escape(TITLE) + "</title>" in html
    stripped = html
    for url in meta["sources"]:
        stripped = stripped.replace(url, "")
    assert not re.search(r'''(?:src|href)=["']https?://''', stripped), "external asset"
    assert re.search(r'href="viz/' + SLUG + '/index.html"', GALLERY.read_text(encoding="utf-8"))
    print(f"verified: {len(scs)} scenarios, {options} options (priority order, movesets and type math checked), 6-member team, 3 read-only tools, zero external assets")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    raw, scen, meta = load()
    if not args.verify:
        VIZ.parent.mkdir(parents=True, exist_ok=True)
        VIZ.write_text(render(raw, scen, meta, json.loads(TOKENS.read_text(encoding="utf-8"))), encoding="utf-8")
        GALLERY.write_text(render_gallery(), encoding="utf-8")
    else:
        expected = render(raw, scen, meta, json.loads(TOKENS.read_text(encoding="utf-8")))
        assert VIZ.read_text(encoding="utf-8") == expected, "viz page is stale: rerun the builder"
        assert GALLERY.read_text(encoding="utf-8") == render_gallery(), "gallery is stale: rerun the builder"
    verify(raw, scen, meta)


if __name__ == "__main__":
    main()
