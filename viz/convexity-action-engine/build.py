#!/usr/bin/env python3
"""Builder and verifier for the convexity-action-engine visualization.

A searchable decision engine for everyday actions: press Cmd/Ctrl+K, type what
you are considering, and see that action in your current Singapore context,
screened for ruin first and then compared on payoff shape (reliable harvest vs
bounded-downside right tail) against opportunity-cost alternatives.

Every fact is an ordinal author judgement from raw.json, written by author.py
(both next to this file); the page labels each number as
JUDGEMENT, MODEL or PERSONAL. No empirical dataset was attached in this build,
and the page says so. This builder also writes the auditable spreadsheet views
(actions.csv, aliases.csv, sources.csv) next to raw.json. --verify re-checks
the data, the CSVs and the page without writing.

    python build.py            # regenerate index.html and the CSVs
    python build.py --verify   # check they are fresh
"""
import argparse
import csv
import io
import json
import re
import sys
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import author  # noqa: E402

SLUG = "convexity-action-engine"
DATA = HERE
RAW = HERE / "raw.json"
META = HERE / "meta.json"
TOKENS = HERE / "design-tokens.json"
VIZ = HERE / "index.html"

TITLE = "Convexity Action Engine"
H1 = "What are you considering doing?"
LEDE = (
    "Ruin first, then payoff shape: every action is screened for extreme downside, "
    "then compared with the alternatives you actually have right now."
)
PLACEHOLDER = "Try “swim”, “I have 30 minutes” or “what should I avoid tonight?”"
EXAMPLES = ("swim", "I have 30 minutes", "what should I avoid tonight?", "tired and want to relax")
KEYS = (
    ("<kbd>Ctrl/⌘ K</kbd> <kbd>/</kbd>", "search"), ("<kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd>", "choose a result"),
    ("<kbd>Esc</kbd>", "close search or a panel"), ("<kbd>C</kbd>", "compare alternatives"),
    ("<kbd>V</kbd>", "jump to the chart"), ("<kbd>A</kbd>", "jump to alternatives"),
    ("<kbd>E</kbd>", "open deep mode (evidence)"), ("<kbd>N</kbd>", "back to now"), ("<kbd>?</kbd>", "these shortcuts"),
)
DESCRIPTION = (
    "Search any everyday action, screen it for ruin, then compare its payoff shape, "
    "timing and opportunity cost against real alternatives in your Singapore context. "
    "Ordinal author judgements, labelled as such."
)

CSV_FIELDS = [
    ("action_id", "id"), ("canonical_name", "name"), ("kind", None), ("category", "cat"), ("goals", "goals"),
    ("dur_min", None), ("dur_typical", None), ("dur_max", None), ("setup_min", "setup"),
    ("money_cost", "money"), ("activation", "act"), ("physical_energy", "phys"), ("cognitive_energy", "cog"),
    ("health", "hea"), ("work_research", "car"), ("learning", "lrn"), ("relationships", "soc"),
    ("enjoyment", "joy"), ("recovery", "rec"), ("maintenance", "hom"), ("money_benefit", "fin"), ("long_term", "lt"),
    ("uncertainty", "unc"), ("reversibility", "rev"), ("opportunity_decay", "decay"), ("option_value", "opt"),
    ("information_value", "info"), ("regret_if_skipped", "reg"), ("interruption_cost", "intr"),
    ("ordinary_downside", "dn"), ("right_tail_upside", "tail"), ("novelty", "nov"), ("frequency", "freq"),
    ("literature_grade", "ev"), ("typical_time", None), ("judged_optimum", None), ("optimum_grade", "evt"),
    ("outdoor", "out"), ("daylight_dependent", "day"), ("sg_opening_hours", None),
    ("ruin_kind", None), ("ruin_probability", None), ("ruin_severity", None), ("ruin_irreversibility", None),
    ("ruin_repeated", None), ("ruin_trigger", None), ("avoid_related", None), ("avoid_safer", None),
    ("singapore_specific", "sg"), ("atus_code", "atus"), ("atus_link", None), ("atus_label", None), ("atus_participation_rate", None),
    ("atus_minutes_when_performed", None), ("drm_row", "drm"), ("drm_positive_affect", None), ("drm_negative_affect", None),
    ("cited_studies", None), ("action_specific_fields", None), ("evidence_type", None), ("confidence", None), ("source_ids", None),
]

CSS = """
:root{--bg:%%background%%;--fg:%%foreground%%;--muted:%%secondary%%;--surface:%%surface%%;--border:%%border%%;--control:#86868b;--focus:%%focus%%;--pos:%%mark%%;--danger:%%selected%%;--warn:#8a5a00;--warnbg:#fff6e0;--dangerbg:#fdeceb;--posbg:#eaf3fe;--avoid-muted:#5c5c61;--sans:%%font_sans%%;--mono:%%font_mono%%;--r:%%radius%%;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1d1d1f;--fg:#f5f5f7;--muted:#a1a1a6;--surface:#2c2c2e;--border:#48484a;--control:#8e8e93;--focus:#2997ff;--pos:#2997ff;--danger:#ff6961;--warn:#e3b341;--warnbg:#3a2c05;--dangerbg:#3d1614;--posbg:#0f2a46;--avoid-muted:#b8b8bd}}
:root[data-theme="dark"]{--bg:#1d1d1f;--fg:#f5f5f7;--muted:#a1a1a6;--surface:#2c2c2e;--border:#48484a;--control:#8e8e93;--focus:#2997ff;--pos:#2997ff;--danger:#ff6961;--warn:#e3b341;--warnbg:#3a2c05;--dangerbg:#3d1614;--posbg:#0f2a46;--avoid-muted:#b8b8bd;color-scheme:dark}
:root[data-theme="light"]{color-scheme:light}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 var(--sans)}
main,footer,.bar{width:min(100% - 2rem,%%content_width%%);margin:auto}
main{padding:0 0 1.5rem}
h1{margin:0;font-size:clamp(1.6rem,5vw,2.4rem);line-height:1.1;letter-spacing:-.03em}
h2{margin:1.1rem 0 .4rem;font-size:1.15rem;line-height:1.25}
h3{margin:.9rem 0 .3rem;font:600 .72rem/1.3 var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
p{margin:.3rem 0}
a{color:inherit;text-underline-offset:.18em}
button,select,input{font:inherit;color:inherit}
button{cursor:pointer;border:1px solid var(--control);border-radius:var(--r);background:var(--bg);padding:.3rem .6rem;min-height:2.25rem}
button:hover{background:var(--surface)}
select{border:1px solid var(--control);border-radius:var(--r);background:var(--bg);padding:.25rem .5rem;min-height:2.25rem;max-width:100%;min-width:0}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
button[aria-pressed=true]{border-color:var(--fg);background:var(--fg);color:var(--bg)}
.skip{position:absolute;left:1rem;top:-4rem;z-index:40;background:var(--fg);color:var(--bg);border-color:var(--fg)}
.skip:focus{top:.5rem}
.top{border-bottom:1px solid var(--border);background:var(--bg);position:sticky;top:0;z-index:5}
.bar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:.5rem 1rem;align-items:center;padding:.5rem 0}
.brand{font:600 .78rem var(--mono);letter-spacing:.05em;text-transform:uppercase;text-decoration:none;white-space:nowrap}
.searchbtn{display:flex;gap:.5rem;align-items:center;text-align:left;color:var(--muted);min-height:2.5rem;padding:.35rem .7rem;background:var(--surface);min-width:0;max-width:34rem}
.searchbtn span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.searchbtn svg,.bigsearch svg{flex:none}
kbd{font:.72rem var(--mono);border:1px solid var(--border);border-bottom-width:2px;border-radius:4px;padding:0 .3rem;background:var(--bg);color:var(--muted);white-space:nowrap}
nav.tabs{display:flex;gap:.25rem;overflow-x:auto;scrollbar-width:none}
nav.tabs a{padding:.35rem .6rem;border-radius:var(--r);text-decoration:none;font:600 .75rem var(--mono);letter-spacing:.04em;min-height:2.25rem;display:inline-flex;align-items:center;white-space:nowrap}
nav.tabs a:hover{background:var(--surface)}
nav.tabs a[aria-current=page]{background:var(--fg);color:var(--bg)}
@media(max-width:760px){.bar{grid-template-columns:minmax(0,1fr);gap:.35rem}.brand{display:none}.searchbtn{max-width:none}}
.hero{padding:1.5rem 0 .25rem}
.lede{color:var(--muted);max-width:62ch;margin:.5rem 0 .9rem;font-size:1rem}
.bigsearch{display:flex;gap:.6rem;align-items:center;width:min(100%,40rem);min-height:3.1rem;padding:.5rem .9rem;font-size:1.05rem;color:var(--muted);text-align:left;border-color:var(--fg);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.bigsearch span{flex:1}
.examples{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center;margin:.7rem 0 0;font-size:.85rem;color:var(--muted)}
.examples button{font-size:.85rem;min-height:2rem;border-radius:1rem;padding:.1rem .7rem}
.examples .how{border:0;text-decoration:underline;text-underline-offset:.2em;color:var(--fg);margin-left:.4rem;padding:.1rem .3rem}
.hero.off{padding:0}
.hero.off>:not(h1){display:none}
.hero.off h1,.visually-hidden{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.lbl{font:600 .72rem var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.ctx{border:1px solid var(--border);border-radius:var(--r);background:var(--surface);margin:.9rem 0 .6rem;padding:.55rem .7rem}
.ctxbar{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;align-items:center}
.seg{display:flex;flex-wrap:wrap;gap:.3rem;align-items:center}
.seg .lbl{margin-right:.2rem}
.lensl{display:flex;gap:.45rem;align-items:center;min-width:0;max-width:100%}
.lensl select{max-width:16rem}
.adjust{margin-left:auto;display:inline-flex;gap:.4rem;align-items:center;font-weight:600}
.adjust::after{content:"▾";font-size:.8em;color:var(--muted)}
.adjust[aria-expanded=true]::after{content:"▴"}
.count{background:var(--fg);color:var(--bg);border-radius:1rem;padding:0 .45rem;font:600 .7rem/1.6 var(--mono)}
.count[hidden]{display:none}
.ctxsum{font-size:.82rem;color:var(--muted);margin:.45rem 0 0}
.ctxpanel{display:grid;gap:1rem 1.5rem;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));margin-top:.6rem;padding-top:.7rem;border-top:1px solid var(--border)}
.ctxpanel[hidden]{display:none}
fieldset{border:0;margin:0;padding:0;min-width:0;display:grid;gap:.55rem;align-content:start}
legend{font:600 .72rem var(--mono);letter-spacing:.06em;text-transform:uppercase;padding:0;margin-bottom:.4rem}
label.rng{display:grid;grid-template-columns:1fr auto;gap:0 .4rem;font-size:.85rem;color:var(--muted);align-items:center}
label.rng b{color:var(--fg);font:600 .78rem var(--mono)}
label.rng input{grid-column:1/-1;width:100%;accent-color:var(--fg);min-height:1.6rem;margin:0}
label.check{display:flex;gap:.45rem;align-items:center;font-size:.85rem;min-height:2rem}
label.check input{width:1.1rem;height:1.1rem;accent-color:var(--fg)}
.btnrow{display:flex;flex-wrap:wrap;gap:.3rem}
.wgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr));gap:.4rem 1rem;margin:.3rem 0}
.ctxpanel .disc,.ctxfoot{grid-column:1/-1}
.ctxpanel .disc{margin:0}
.ctxfoot{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
.ctxfoot button[hidden]{display:none}
.chip{font:.75rem var(--mono);border:1px solid var(--control);border-radius:1rem;padding:.1rem .6rem;min-height:2rem;background:var(--bg);display:inline-flex;align-items:center;justify-content:center}
.chip[hidden]{display:none}
.chip.on,.chip.cur,.chip[aria-pressed=true]{background:var(--fg);color:var(--bg);border-color:var(--fg);box-shadow:none}
.act{border:0;background:none;padding:0;min-height:0;text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:.2em;text-align:left;font-weight:600;cursor:pointer;border-radius:3px}
.act:hover{text-decoration-color:var(--fg);background:none}
.act.danger{color:var(--danger)}
.act.muted{color:var(--muted);font-weight:400}
.rowbtn{border:0;background:none;padding:0;min-height:0;text-align:left;color:inherit;font:inherit;text-decoration:underline dotted;text-decoration-color:var(--border);text-underline-offset:.22em;border-radius:3px}
.rowbtn:hover{background:none;color:var(--fg);text-decoration-color:var(--fg)}
@media(pointer:coarse){.rowbtn{min-height:1.75rem}}
.grid{display:grid;gap:.6rem}
@media(min-width:760px){.g2{grid-template-columns:1fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}}
.card{border:1px solid var(--border);border-radius:var(--r);padding:.6rem .75rem;min-width:0;overflow-wrap:anywhere}
.card h3{margin-top:0}
.nowcls{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))}
.act.lead{font-size:1.08rem}
.also{display:flex;flex-wrap:wrap;gap:.15rem .75rem;align-items:baseline;margin:.4rem 0 0;font-size:.85rem}
.also .lbl{margin-right:-.2rem}
.also .act{min-height:1.5rem}
.card.avoid{border-color:var(--danger);background:var(--dangerbg);--muted:var(--avoid-muted)}
.card.warnc{border-color:var(--warn);background:var(--warnbg)}
.head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.25rem 1rem;align-items:baseline;margin-top:1rem}
.head .name{font-size:clamp(1.45rem,4.5vw,2.1rem);font-weight:700;letter-spacing:-.02em;margin:0;line-height:1.15}
.badges{display:flex;flex-wrap:wrap;gap:.3rem}
.sub{color:var(--muted);font:.78rem var(--mono)}
.badge{display:inline-block;font:600 .7rem/1.6 var(--mono);padding:0 .5rem;border-radius:1rem;border:1px solid var(--border);white-space:nowrap}
.badge.clear{border-color:var(--pos);color:var(--pos)}
.badge.noted{color:var(--muted)}
.badge.warning{border-color:var(--warn);background:var(--warnbg);color:var(--warn)}
.badge.danger{border-color:var(--danger);background:var(--danger);color:var(--bg)}
.quick{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.4rem 1rem;margin:.3rem 0 .6rem}
.quick div{border-top:1px solid var(--border);padding-top:.25rem;min-width:0}
.quick dt{font:.68rem var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.quick dd{margin:0;font-weight:600;overflow-wrap:anywhere}
.btns{display:flex;flex-wrap:wrap;gap:.4rem;margin:.6rem 0}
.btns button{font:600 .75rem var(--mono);letter-spacing:.05em}
.btns .do{background:var(--fg);color:var(--bg);border-color:var(--fg);padding-inline:1rem}
.btns .keyhint{margin-left:.3rem}
.pagenav{display:flex;flex-wrap:wrap;gap:.3rem;align-items:center;margin:.3rem 0 .6rem}
.pagenav .lbl{margin-right:.2rem}
section>h2{border-top:1px solid var(--border);padding-top:1rem;margin-top:1.6rem}
.spec{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))}
.kv{width:100%;border-collapse:collapse;font-size:.85rem}
.kv td,.kv th{padding:.22rem .3rem;border-bottom:1px solid var(--surface);text-align:left;vertical-align:top}
.kv th{font-weight:400;color:var(--muted)}
.kv tr.click{cursor:pointer}
.kv tr.click:hover td,.kv tr.click:hover th{background:var(--surface)}
.bar5{display:inline-block;width:5.5rem;height:.6rem;background:var(--surface);border-radius:2px;vertical-align:middle;position:relative}
.bar5 i{position:absolute;left:0;top:0;bottom:0;background:var(--fg);border-radius:2px}
.bar5.pos i{background:var(--pos)}.bar5.dg i{background:var(--danger)}
.dots{font-family:var(--mono);letter-spacing:-.05em;white-space:nowrap}
.dots .off{color:var(--border)}
.unk{font:600 .75rem var(--mono);color:var(--warn)}
.pv{display:inline-block;font:600 .62rem/1.5 var(--mono);letter-spacing:.05em;padding:0 .3rem;border-radius:3px;vertical-align:middle;white-space:nowrap}
.pv-OBSERVED{border:1px solid var(--fg)}
.pv-EMPIRICAL{background:var(--fg);color:var(--bg)}
.pv-INFERRED{border:1px dotted var(--fg)}
.pv-MODEL{border:1px solid var(--pos);color:var(--pos)}
.pv-JUDGEMENT{border:1px dashed var(--muted);color:var(--muted);font-style:italic}
.pv-PERSONAL{background:var(--posbg);color:var(--fg);border:1px dotted var(--pos)}
.pv-SINGAPORE{border:1px dashed var(--warn);color:var(--warn)}
.tablewrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--r);max-width:100%}
table.sheet{border-collapse:collapse;font-size:.82rem;min-width:100%}
table.sheet th,table.sheet td{padding:.25rem .45rem;border-bottom:1px solid var(--surface);text-align:left;white-space:nowrap}
table.sheet thead th{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--border);vertical-align:bottom}
table.sheet tbody th{position:sticky;left:0;background:var(--bg);font-weight:400;color:var(--muted);z-index:1}
table.sheet tbody th:hover{color:var(--fg)}
table.sheet tr.grp th{font:600 .68rem var(--mono);letter-spacing:.07em;color:var(--fg);background:var(--surface);cursor:default}
table.sheet tr.grp td{background:var(--surface)}
table.sheet td.dom,table.sheet th.dom{color:var(--muted);font-style:italic}
table.sheet .best{font-weight:700}
table.sheet .colx{border:0;background:none;min-height:0;padding:0 .2rem;color:var(--muted)}
@media(max-width:560px){table.sheet tbody th,table.sheet thead th:first-child{white-space:normal;min-width:6.5rem;max-width:8rem}}
.cls{display:inline-block;font:.68rem var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.alts{display:grid;gap:.55rem 1.25rem;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));margin:.4rem 0}
.alts>div{min-width:0}
.alts .cls{display:block}
.alts .note{margin-left:.35rem}
.alts .badge{margin-right:.35rem}
.cmplist{list-style:none;padding:0;margin:.5rem 0;display:flex;flex-wrap:wrap;gap:.35rem}
.cmplist li{display:inline-flex;align-items:center;gap:.35rem;border:1px solid var(--border);border-radius:1rem;padding:.05rem .15rem .05rem .7rem}
.cmplist li.top{border-color:var(--pos)}
.cmplist li.top .cls{color:var(--pos)}
.cmplist .x{border:0;border-radius:1rem;min-height:2rem;min-width:2rem;padding:0;color:var(--muted);font-size:1.1rem;line-height:1}
.viewbar{display:flex;flex-wrap:wrap;gap:.4rem .5rem;align-items:center;margin:.4rem 0 .7rem}
.viewbar select{font-weight:600;max-width:min(100%,20rem)}
.stepper{display:inline-flex;gap:.2rem}
.stepper .chip{min-width:2.25rem;min-height:2.25rem;font-size:1rem;padding:0}
.panel{border:1px solid var(--fg);border-radius:var(--r);padding:.6rem .75rem;margin:.6rem 0;background:var(--bg)}
.panel.why{border-color:var(--pos)}
.panel .x{float:right;min-width:2.25rem}
.note{font-size:.84rem;color:var(--muted)}
.deckrow{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:1.5rem 0 .3rem}
.warnbox{border:1px solid var(--warn);background:var(--warnbg);border-radius:var(--r);padding:.45rem .65rem;margin:.45rem 0}
.dangerbox{border:2px solid var(--danger);background:var(--dangerbg);border-radius:var(--r);padding:.5rem .7rem;margin:.45rem 0}
.dangerbox b,.dangerbox strong{color:var(--danger)}
.views{display:flex;flex-wrap:wrap;gap:.25rem;margin:.3rem 0}
.views button{font:.72rem var(--mono);min-height:2rem;padding:.15rem .5rem}
svg.ch{width:100%;height:auto;display:block;font-family:var(--sans);overflow:visible}
.chwrap{overflow-x:auto;max-width:52rem;margin:.3rem 0}
@media(max-width:560px){.chwrap svg.ch{min-width:600px}}
svg.ch text{font-size:11px;fill:var(--fg)}
svg.ch .mut{fill:var(--muted)}
svg.ch .ax{stroke:var(--border)}
svg.ch .pt{cursor:pointer}
svg.ch .pt:hover circle,svg.ch .pt:focus circle{stroke:var(--focus);stroke-width:3}
svg.ch .pt:focus{outline:none}
svg.ch .lab{font-size:10.5px}
details{border-top:1px solid var(--border);margin:.6rem 0;padding-top:.3rem}
summary{cursor:pointer;min-height:2.4rem;display:flex;gap:.45rem;align-items:center;font-weight:600;list-style:none}
summary::-webkit-details-marker{display:none}
summary::before{content:"";flex:none;width:.45rem;height:.45rem;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);margin:0 .2rem 0 .1rem}
details[open]>summary::before{transform:rotate(45deg);margin-top:-.2rem}
summary:hover{text-decoration:underline;text-underline-offset:.2em}
.method{max-width:90ch;font-size:.9rem}
.yaml{font:.72rem/1.45 var(--mono);white-space:pre-wrap;background:var(--surface);padding:.5rem;border-radius:var(--r);max-height:28rem;overflow:auto}
.yaml .miss{color:var(--warn)}
.pal{position:fixed;inset:0;background:rgba(29,29,31,.35);z-index:20;display:flex;justify-content:center;align-items:flex-start;padding:6vh 1rem 1rem}
.pal[hidden]{display:none}
.palbox{width:min(100%,58rem);background:var(--bg);border-radius:calc(var(--r)*1.5);box-shadow:0 20px 60px rgba(0,0,0,.25);display:flex;flex-direction:column;max-height:86vh;overflow:hidden}
.palin{display:flex;align-items:center;gap:.5rem;border-bottom:1px solid var(--border);padding:.5rem .75rem}
.palin input{flex:1;border:0;font-size:1.15rem;padding:.4rem 0;background:none;min-width:0}
.palin input:focus{outline:none}
.palin:focus-within{box-shadow:inset 0 -2px 0 var(--focus)}
.palmode{font:.7rem var(--mono);color:var(--muted)}
.palchips{display:flex;flex-wrap:wrap;gap:.3rem;padding:.35rem .75rem;border-bottom:1px solid var(--surface);font:.7rem var(--mono);color:var(--muted)}
.palchips:empty{display:none}
.palbody{display:grid;grid-template-columns:1fr;overflow:hidden;min-height:0;flex:1}
@media(min-width:760px){.palbody{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr)}}
.palres{overflow:auto;padding:.25rem 0;margin:0;list-style:none}
.palres li{padding:.45rem .75rem;cursor:pointer;display:flex;justify-content:space-between;gap:.5rem;align-items:baseline;border-left:3px solid transparent}
.palres li[aria-selected=true]{background:var(--surface);border-left-color:var(--fg)}
.palres li .why{font:.68rem var(--mono);color:var(--muted);white-space:nowrap}
.palres .sec{font:600 .65rem var(--mono);letter-spacing:.07em;color:var(--muted);cursor:default;padding-top:.6rem;text-transform:uppercase}
.palprev{border-left:1px solid var(--surface);overflow:auto;padding:.5rem .8rem;display:none}
@media(min-width:760px){.palprev{display:block}}
.palfoot{font:.7rem var(--mono);color:var(--muted);padding:.4rem .75rem;border-top:1px solid var(--surface);display:flex;gap:.8rem;flex-wrap:wrap}
@media(hover:none){.palfoot .keys,.searchbtn kbd,.bigsearch kbd,.keyhint{display:none}}
.toast{position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);background:var(--fg);color:var(--bg);padding:.5rem .9rem;border-radius:var(--r);z-index:30;font-size:.85rem;max-width:calc(100% - 2rem)}
.toast[hidden]{display:none}
.hist td,.hist th{white-space:normal}
.legend{display:flex;flex-wrap:wrap;gap:.35rem .8rem;font-size:.75rem;color:var(--muted);align-items:center;margin:.3rem 0}
.sw{display:inline-block;width:1.4rem;height:0;border-top:2px solid var(--fg);vertical-align:middle;margin-right:.25rem}
footer{padding:1.25rem 0 2.5rem;border-top:1px solid var(--border);color:var(--muted);font-size:.84rem}
footer ul{padding-left:1.1rem;margin:.4rem 0}
dl.keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:.3rem 1.2rem;margin:.4rem 0}
dl.keys div{display:flex;gap:.6rem;align-items:baseline}
dl.keys dt{min-width:5.5rem}
dl.keys dd{margin:0}
@media(max-width:560px){.pal{padding:0}.palbox{max-height:100vh;height:100%;border-radius:0}.ctxbar{gap:.5rem .8rem}.adjust{margin-left:0}.hero{padding-top:1rem}.bigsearch{display:none}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
"""

JS_PATH = HERE / "engine.js"
BEAMDSWITCH_PATH = HERE / "beamdswitch.js"  # the site's standard beamdswitch report template, unchanged


def load():
    return json.loads(RAW.read_text(encoding="utf-8")), json.loads(META.read_text(encoding="utf-8"))


def fmt_hours(windows):
    return ";".join(f"{h:g}±{sd:g}" for h, sd in windows) if windows else ""


def csv_text(rows, header):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    w.writerows(rows)
    return buf.getvalue()


def spreadsheets(raw):
    rows = []
    for a in raw["actions"]:
        r = a.get("ruin") or {}
        av = a.get("avoid") or {}
        row = []
        for col, key in CSV_FIELDS:
            if key:
                v = a.get(key, "")
                v = ",".join(v) if isinstance(v, list) else v
            elif col == "kind":
                v = "avoid" if av else "canonical"
            elif col.startswith("dur_"):
                v = a["dur"][{"dur_min": 0, "dur_typical": 1, "dur_max": 2}[col]]
            elif col == "typical_time":
                v = fmt_hours(a.get("typ"))
            elif col == "judged_optimum":
                v = fmt_hours(a.get("best"))
            elif col == "sg_opening_hours":
                v = "-".join(f"{x:g}" for x in a["open"]) if "open" in a else ""
            elif col.startswith("ruin_"):
                v = {"ruin_kind": r.get("kind", ""), "ruin_probability": r.get("p", ""), "ruin_severity": r.get("sev", ""),
                     "ruin_irreversibility": r.get("irrev", ""), "ruin_repeated": ("yes" if r.get("rep") else "no") if r else "",
                     "ruin_trigger": r.get("trig", "")}[col]
            elif col == "avoid_related":
                v = ",".join(av.get("rel", []))
            elif col == "avoid_safer":
                v = av.get("safer", "")
            elif col == "action_specific_fields":
                v = ",".join(a["own"])
            elif col.startswith("atus_") and col != "atus_code":
                ob = raw["observed"].get(a.get("atus")) if a.get("atus") else None
                v = "" if not ob else {"atus_link": "action" if "atus" in a["own"] else "category", "atus_label": ob["label"],
                                       "atus_participation_rate": ob["rate"], "atus_minutes_when_performed": ob["min"]}[col]
            elif col.startswith("drm_") and col != "drm_row":
                d = raw["drm"].get(a.get("drm")) if a.get("drm") else None
                v = "" if not d else d[col[4:]]
            elif col == "cited_studies":
                v = ";".join(f'{c["id"]}:{c["rel"]}' for c in a.get("cites", []))
            elif col == "evidence_type":
                v = ";".join(["heuristic"] + (["observational"] if a.get("atus") else []) + (["experiments"] if a.get("cites") else []))
            elif col == "confidence":
                v = "medium (social reception, direct experiment); low elsewhere" if any(c["rel"] == "direct" for c in a.get("cites", [])) else "low"
            elif col == "source_ids":
                v = ";".join(["judgement"] + (["singapore"] if ("open" in a or a.get("out") or a.get("sg")) else [])
                             + (["atus2014_2016"] if a.get("atus") else []) + (["kahneman2004"] if a.get("drm") else [])
                             + [c["id"] for c in a.get("cites", [])])
            row.append(v if v is not None else "")
        rows.append(row)
    actions = csv_text(rows, [c for c, _ in CSV_FIELDS])
    aliases = csv_text(sorted({(al.lower(), a["id"]) for a in raw["actions"] for al in [a["name"], *a["aliases"]]}), ["alias", "action_id"])
    study_rows = [[k, v["citation"], v["kind"], "used: " + v["finding"], v["url"], v["verification"]] for k, v in raw["studies"].items()]
    sources = csv_text([[s["id"], s["title"], s["type"], s["status"], s["url"], s["notes"]] for s in raw["sources"]] + study_rows,
                       ["source_id", "title", "type", "status", "url", "notes"])
    return {"actions.csv": actions, "aliases.csv": aliases, "sources.csv": sources}


def instance_count(raw):
    mods = raw["modifiers"]["manner"]
    times = len(raw["modifiers"]["time"])
    total = 0
    for a in raw["actions"]:
        if a["cat"] == "avoid":
            continue
        manner = 1 + sum(1 for m in mods.values() if m.get("flag") and m["flag"] in a["flags"]) + len(a["places"])
        total += manner * times
    return total


def page_data(raw, meta):
    return {
        "sources": raw["sources"], "modifiers": raw["modifiers"],
        "categories": {k: {"label": v["label"], "prior": v["prior"]} for k, v in raw["categories"].items()},
        "actions": raw["actions"], "fetched": meta["fetched"], "assumptions": meta["assumptions"],
        "observed": raw["observed"], "drm": raw["drm"], "studies": raw["studies"],
        "instances": instance_count(raw),
    }


def render(raw, meta, tokens):
    css = CSS
    for key, val in {**tokens["colors"], "font_sans": tokens["font_sans"], "font_mono": tokens["font_mono"],
                     "radius": tokens["radius"], "content_width": tokens["content_width"]}.items():
        css = css.replace(f"%%{key}%%", val)
    data = json.dumps(page_data(raw, meta), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    js = JS_PATH.read_text(encoding="utf-8").replace("%%DATA%%", data)
    beamdswitch = BEAMDSWITCH_PATH.read_text(encoding="utf-8")
    assert "</script" not in beamdswitch, "beamdswitch.js must not contain </script"
    n_canon = sum(1 for a in raw["actions"] if a["cat"] != "avoid")
    n_avoid = len(raw["actions"]) - n_canon
    n_inst = instance_count(raw)
    n_obs = sum(1 for a in raw["actions"] if a["cat"] != "avoid" and a.get("atus"))
    n_cite = sum(1 for a in raw["actions"] if a.get("cites"))
    assumptions = "".join(f"<li>{escape(a)}</li>" for a in meta["assumptions"])
    noscript = "".join(
        f"<li>{escape(a['name'])}: {escape(a['avoid']['why'])}</li>" for a in raw["actions"] if a.get("avoid")
    )
    icon = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
    examples = "".join(f'<button type="button" data-q="{escape(q)}">{escape(q)}</button>' for q in EXAMPLES)
    keys = "".join(f"<div><dt>{k}</dt><dd>{escape(v)}</dd></div>" for k, v in KEYS)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><meta name="description" content="{escape(DESCRIPTION)}"><title>{escape(TITLE)}</title><script id="site-theme">try {{ var t = localStorage.getItem("theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; }} catch (e) {{}}</script><style>{css}</style></head><body>
<button type="button" class="skip" id="skip">Skip to content</button>
<header class="top"><div class="bar"><a class="brand" href="#/now">{escape(TITLE)}</a><button type="button" class="searchbtn" id="open-search" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K /">{icon}<span>Search actions or situations</span><kbd id="kbd">Ctrl K</kbd></button><nav class="tabs" aria-label="Views"><a href="#/now">NOW</a><a href="#/avoid">AVOID</a><a href="#/compare">COMPARE</a><a href="#/history">HISTORY</a><a href="#/data">DATA</a></nav></div></header>
<main>
<section class="hero" id="hero"><h1>{escape(H1)}</h1><p class="lede">{escape(LEDE)}</p><button type="button" class="bigsearch" id="hero-search" aria-haspopup="dialog">{icon}<span>Search an action or describe your situation</span><kbd>/</kbd></button><div class="examples"><span>Try</span>{examples}<button type="button" class="how" id="how">How it works</button></div></section>
<section id="ctx" aria-label="Your context"></section>
<div id="app"></div>
<div class="deckrow"><button type="button" id="save-beamdswitch" title="Save a narrated Markdown talk about this page, to open in beamdswitch">beamdswitch</button><button type="button" id="copy-beamdswitch" title="Copy the narrated Markdown talk, to paste into beamdswitch">Copy deck</button><span id="deck-status" class="note" role="status"></span></div>
<p class="note">The beamdswitch button saves this page in your current context as a narrated talk: a Markdown deck with your context, the method and lens, the ruin screen, the options compared and the confidence checks (on NOW, the class leaders and what to avoid), every value as shown here, and a spoken narration on every slide. Open it in <a href="../beamdswitch/">beamdswitch</a> to get slides, a handout, narration and a video. Copy deck puts the same deck on the clipboard, to paste into beamdswitch if the download does not arrive.</p>
<noscript><p>This page needs JavaScript. Actions to avoid, and why:</p><ul>{noscript}</ul></noscript>
<details id="method"><summary>How it works: method, evidence labels, assumptions and what is not here</summary><p class="method"><strong>Ruin first, then payoff shape.</strong> Each action is screened for extreme, irreversible downside, then compared on reliable upside (harvest), right-tail upside (optionality), timing and opportunity cost against alternatives available now. <strong>Benefits, tails and timing are author judgement</strong> on ordinal 0–4 scales, labelled JUDGEMENT. <strong>How common an activity is</strong> comes from American Time Use Survey microdata ({n_obs:,} actions linked, OBSERVED); experienced affect from one published table and {n_cite} actions from published experiments (EMPIRICAL). {n_canon:,} canonical actions and {n_avoid} actions to avoid expand to {n_inst:,} contextual instances (action × manner × timing). That is <strong>short of a 10,000-action canonical ontology</strong>. Select any row name to see where its number came from.</p><ul class="note">{assumptions}</ul></details>
</main>
<footer><p>Ontology written {escape(meta["fetched"])}. Spreadsheet views (actions.csv, aliases.csv, sources.csv) are on the DATA tab and next to raw.json in the site repository; ATUS figures are recomputed by derive_atus.py.</p><details id="keys"><summary>Keyboard shortcuts</summary><dl class="keys">{keys}</dl></details></footer>
<div class="pal" id="pal" hidden role="dialog" aria-modal="true" aria-label="Action search"><div class="palbox"><div class="palin"><label class="visually-hidden" for="q">What are you considering?</label><input id="q" type="search" autocomplete="off" spellcheck="false" placeholder="{escape(PLACEHOLDER)}" role="combobox" aria-expanded="true" aria-controls="res" aria-autocomplete="list"><span class="palmode" id="palmode"></span><button type="button" id="palclose">Close</button></div><div class="palchips" id="palchips" aria-label="What your words set"></div><div class="palbody"><ul class="palres" id="res" role="listbox" aria-label="Results"></ul><div class="palprev" id="prev" aria-live="polite"></div></div><div class="palfoot"><span class="keys">↑ ↓ move</span><span class="keys">Esc close</span><span id="palhint"></span></div></div></div>
<div class="toast" id="toast" hidden role="status"></div>
<div class="visually-hidden" id="announce" role="status" aria-live="polite"></div>
<script id="beamdswitch">\n{beamdswitch}</script>
<script>{js}</script></body></html>
'''


EXPECTED_FETCHED = "2026-09-29"


def verify(raw, meta, html):
    assert raw == author.main(), "raw.json is stale: rerun author.py"
    acts = raw["actions"]
    ids = [a["id"] for a in acts]
    assert len(ids) == len(set(ids)), "duplicate ids"
    by = {a["id"]: a for a in acts}
    canon = [a for a in acts if a["cat"] != "avoid"]
    avoid = [a for a in acts if a["cat"] == "avoid"]
    assert len(canon) >= 1300 and len(avoid) >= 25, (len(canon), len(avoid))
    assert sum(1 for a in canon if a.get("atus")) >= 1200, "ATUS crosswalk coverage fell"
    for a in canon:
        if a.get("atus"):
            assert a["atus"] in raw["observed"], (a["id"], a["atus"])
        if a.get("drm"):
            assert a["drm"] in raw["drm"], (a["id"], a["drm"])
        for c in a.get("cites", []):
            assert c["id"] in raw["studies"] and c["rel"] in ("direct", "related"), (a["id"], c)
    for code, ob in raw["observed"].items():
        assert 0 <= ob["rate"] <= 1 and ob["min"] > 0 and ob["n"] > 0 and ob["years"] == "2014-2016", code
    assert abs(raw["observed"]["120303"]["rate"] - 0.7961) < 1e-4 and abs(raw["observed"]["0101"]["min"] - 528.9) < 0.05
    names = {}
    for a in acts:
        names.setdefault(a["name"].lower(), a["id"])
    for a in acts:
        for al in a["aliases"]:
            assert names.get(al.lower(), a["id"]) == a["id"], ("alias equals another action's name", a["id"], al)
    names = [a["name"].lower() for a in acts]
    assert len(names) == len(set(names)), "duplicate names"
    alias_owner = {}
    for a in acts:
        for al in a["aliases"]:
            assert al.strip() == al and al, (a["id"], al)
    for a in acts:
        assert a["cat"] in raw["categories"], a["id"]
        lo, typ, hi = a["dur"]
        assert 0 < lo <= typ <= hi, (a["id"], a["dur"])
        for k in ("money", "act", "phys", "cog", "hea", "soc", "lrn", "joy", "car", "rec", "hom", "fin", "lt",
                  "unc", "rev", "decay", "opt", "info", "reg", "intr", "dn", "tail", "nov", "freq", "ev"):
            assert 0 <= a[k] <= 4, (a["id"], k, a[k])
        for k in ("comp", "opp", "subs"):
            assert all(x in by for x in a.get(k, [])), (a["id"], k)
        if "best" in a:
            assert "evt" in a, a["id"]
        if "open" in a:
            assert 0 <= a["open"][0] < a["open"][1] <= 30, (a["id"], a["open"])
        if "ruin" in a:
            r = a["ruin"]
            assert r["kind"] and r["trig"] and 0 <= r["sev"] <= 4 and 0 <= r["irrev"] <= 4, a["id"]
            assert not re.search(r"\d", r["p"]), ("probability must be a word label, not a number", a["id"], r["p"])
        if a["cat"] == "avoid":
            assert "ruin" in a and a["avoid"]["why"] and a["avoid"]["safer"] in by and by[a["avoid"]["safer"]]["cat"] != "avoid", a["id"]
            assert all(by[x]["cat"] != "avoid" for x in a["avoid"]["rel"]), a["id"]
        for m in a["places"]:
            assert raw["modifiers"]["manner"][m].get("place"), (a["id"], m)
    # Spot checks on nonsensical variants the ontology must not produce.
    assert by["swim"]["places"] == [] and by["go-to-a-museum"]["places"] == [] and "s" not in by["skip-this-meal"]["flags"]
    assert by["swim"]["ruin"]["p"].startswith("very low") and by["drive-after-drinking"]["ruin"]["sev"] == 4
    n_inst = instance_count(raw)
    assert n_inst >= 10000, n_inst
    for s in raw["sources"]:
        assert s["status"] and s["type"] in ("heuristic", "model", "personal", "observational", "survey", "review")
        if s["status"].startswith("used") and s["type"] == "observational":
            assert s["url"].startswith("https://"), s["id"]
        if s["status"].startswith("planned"):
            assert s["url"] == "", "a source that was not retrieved must not carry a link"
    assert meta["slug"] == SLUG and meta["fetched"] == EXPECTED_FETCHED and meta["key_file_used"] is False
    assert len(meta["assumptions"]) >= 5
    blurb = " ".join(meta["assumptions"])
    assert f"{len(canon):,} canonical actions and {len(avoid)} actions to avoid" in blurb, "meta.json counts are stale"
    assert f"{sum(1 for a in canon if a.get('cites'))} actions link to published experiments" in blurb, "meta.json experiment count is stale"

    for name, text in spreadsheets(raw).items():
        assert (DATA / name).read_text(encoding="utf-8") == text, f"{name} is stale: rerun the builder"

    assert html.count("<h1>") == 1 and html.count("<script") == 3
    assert f'<script id="beamdswitch">\n{BEAMDSWITCH_PATH.read_text(encoding="utf-8")}</script>' in html, "beamdswitch.js is inlined unchanged"
    assert "<script src=" not in html and '<link rel="stylesheet"' not in html
    assert not re.search(r'''(?:src|href)=["']https?://''', html), "external asset"
    assert html.count("mc?.registerTool") == 4 and html.count("readOnlyHint:true") == 4
    for name in ("get_metadata", "search_actions", "get_action", "compare_actions"):
        assert f'name:"{name}"' in html, name
    for needle in ("OBSERVED", "EMPIRICAL", "American Time Use Survey", "short of a 10,000-action canonical ontology", "not retrieved", "JUDGEMENT", "MODEL", "PERSONAL",
                   "prefers-reduced-motion", "Asia/Singapore", "localStorage", "Compared with what?", "WHAT AM I GIVING UP?"):
        assert needle in html, needle
    assert "<title>" + escape(TITLE) + "</title>" in html
    print(f"verified: {len(canon)} canonical actions ({sum(1 for a in canon if a.get('atus'))} ATUS-linked, {sum(1 for a in canon if a.get('cites'))} with experiments), {len(avoid)} avoid actions, {n_inst:,} contextual instances, "
          f"{sum(1 for a in acts if 'ruin' in a)} ruin-screened, 3 CSVs fresh, 4 read-only tools, zero external assets")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    raw, meta = load()
    tokens = json.loads(TOKENS.read_text(encoding="utf-8"))
    expected = render(raw, meta, tokens)
    if not args.verify:
        VIZ.write_text(expected, encoding="utf-8")
        for name, text in spreadsheets(raw).items():
            (DATA / name).write_text(text, encoding="utf-8")
    else:
        assert VIZ.read_text(encoding="utf-8") == expected, "viz page is stale: rerun the builder"
    verify(raw, meta, VIZ.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
