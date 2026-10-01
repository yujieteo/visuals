#!/usr/bin/env python3
"""Builder and verifier for the ooda-orientation visualization.

Orient is a Boyd-inspired OODA planner in which orientation is the central activity. Its built-in
material (operation catalogue, guided rules, random jolts, creation prompts, diagnostics, the three
worked examples as replayable command scripts, the short cards, methodology and sources) lives in
data/ooda-orientation/raw.json. The page is assembled from scripts/templates/ooda-orientation.css,
ooda-orientation-logic.js (pure state machine, also run by tests/ooda-orientation.test.mjs) and
ooda-orientation.js (interface). viz/ooda-orientation/beamdswitch.js (the site's shared report
template, unchanged) and viz/ooda-orientation/report.js (the situation as a report) are inlined as
they are. The no-JavaScript worksheet and the worked examples are rendered here from the same data.
--verify re-runs every check and compares the committed page and gallery without writing.

    python3 scripts/build_ooda_orientation.py
    python3 scripts/build_ooda_orientation.py --verify
"""
import argparse
import json
import re
from html import escape
from pathlib import Path

from gallery import render_gallery

ROOT = Path(__file__).resolve().parents[1]
SLUG = "ooda-orientation"
DATA = ROOT / "data" / SLUG
VIZ = ROOT / "viz" / SLUG / "index.html"
GALLERY = ROOT / "index.html"
TOKENS = ROOT / "design-tokens.json"
CSS_TEMPLATE = ROOT / "scripts" / "templates" / "ooda-orientation.css"
JS_TEMPLATE = ROOT / "scripts" / "templates" / "ooda-orientation.js"
LOGIC_TEMPLATE = ROOT / "scripts" / "templates" / "ooda-orientation-logic.js"
DECK_TEMPLATE = ROOT / "viz" / SLUG / "beamdswitch.js"
DECK_REPORT = ROOT / "viz" / SLUG / "report.js"
BEAMDSWITCH_URL = "https://teoyujie.org/visuals/beamdswitch/"

TITLE = "Orient: destroy the wrong model, act from the better one — Yu Jie Teo"
OG_TITLE = "Orient: destroy the wrong model, act from the better one"
DESCRIPTION = ("Build an orientation from reality, attack its assumptions, compare alternatives, "
               "then choose an action that tests the model.")
CANONICAL = "https://teoyujie.org/visuals/ooda-orientation"
SIZE_TARGET = 150_000
SIZE_LIMIT = 250_000

# Page-scoped dark palette; the light palette comes from design-tokens.json.
DARK = {"background": "#161617", "foreground": "#f5f5f7", "secondary": "#a1a1a6", "surface": "#232326",
        "border": "#48484c", "mark": "#3d9bff", "selected": "#ff7b6b"}
SOFT = {"light": {"mark_soft": "#e8f1fc", "red_soft": "#fbeceb", "card": "#ffffff", "on_mark": "#ffffff"},
        "dark": {"mark_soft": "#14263b", "red_soft": "#3a1d1a", "card": "#1c1c1f", "on_mark": "#0b0b0c"}}

COMMANDS = {"new", "situation", "intent", "tempo", "mode", "stage", "item", "contradiction", "edit", "qualify", "promote",
            "withdraw", "resolve", "orient", "reorient", "wsmode", "jolt", "move", "unmove", "candidate", "drop", "adopt",
            "retain", "keep", "action", "editAction", "prediction", "editPrediction", "start", "outcome", "interpret"}
FAMILIES = {"assumptions", "goals", "boundaries", "categories", "actors", "objects", "constraints", "causal", "information", "tempo"}
DIAGNOSTICS = {"rewording", "boundary-lock", "untestable", "tempo-substitution", "untested-constraint", "low-information",
               "collapse", "prediction-drift", "untraced-action"}
STAGES = ["reality", "model", "destroy", "create", "compare", "act", "observe"]
CARDS = ["Nakatomi Space", "Monster Chess", "Reality Signal", "Map and Territory", "Boundary Definition", "Object Function",
         "Overprepared Adversary", "Deep Memory", "Perception Reorientation", "Tempo vs Orientation"]


def load():
    raw = json.loads((DATA / "raw.json").read_text(encoding="utf-8"))
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    return raw, meta


def validate(raw, meta):
    types = {t["id"] for t in raw["itemTypes"]}
    assert {t["ledger"] for t in raw["itemTypes"]} == {"observed", "inferred", "unknown"}
    assert {f["id"] for f in raw["families"]} == FAMILIES, "every destruction family from the spec"
    ops = {}
    for op in raw["operations"]:
        assert op["id"] not in ops, op["id"]
        assert op["family"] in FAMILIES and op["creates"] in types and set(op["targets"]) <= types, op["id"]
        assert op["challenge"].strip() and op["label"].strip(), op["id"]
        ops[op["id"]] = op
    for fam in FAMILIES:
        assert sum(o["family"] == fam for o in raw["operations"]) >= 3, f"family {fam} needs at least three operations"
    assert all(o.get("deep") for o in raw["operations"] if o["family"] == "goals"), "goal destruction belongs to a deep reset"
    for g in raw["guided"]:
        assert all(o in ops for o in g["ops"]), g["when"]
    assert raw["guided"][-1]["when"] == "always"
    assert len(raw["jolts"]) >= 6 and all(j["op"] in ops for j in raw["jolts"])
    assert {d["id"] for d in raw["diagnostics"]} == DIAGNOSTICS
    assert [s["id"] for s in raw["stages"]] == STAGES
    assert len(raw["worksheet"]) == 9
    assert {d["id"] for d in raw["dimensions"]} == {"explained", "contradictions", "assumptions", "predictions", "moves", "reversibility", "cost", "speed"}
    assert {a["id"] for a in raw["actionTypes"]} == {"probe", "maneuver", "commitment", "wait"}
    assert set(raw["provenance"]) == {"boyd", "rao", "teo", "page"}
    sources = {s["id"]: s for s in raw["sources"]}
    for s in raw["sources"]:
        assert s["class"] in ("boyd", "rao", "teo"), s["id"]
        if s["class"] == "boyd":
            assert "url" not in s, "Boyd's papers are cited by title only"
        if s["class"] in ("rao", "teo"):
            assert s.get("url", "https://").startswith("https://"), s["id"]
    for n in raw["methodology"]["rao"]:
        assert n["sources"] and all(sources[x]["class"] in ("rao", "boyd") for x in n["sources"]), n["id"]
        assert re.search(r"\binterpretation\b", n["basis"], re.I), f"{n['id']} must be labelled as an interpretation"
    for m in raw["methodology"]["why"]:
        assert m["source"] in raw["provenance"], m["id"]
    assert [c["title"] for c in raw["cards"]] == CARDS
    for c in raw["cards"]:
        assert c["op"] in ops and c["seed"] and c["lesson"], c["id"]
    assert [e["id"] for e in raw["examples"]] == ["stalled-project", "southwest", "snowmobile"], "stalled project is the default"
    for e in raw["examples"]:
        assert e["provenance"] in raw["provenance"]
        aliases = set()
        for st in e["steps"]:
            assert st["do"] in COMMANDS, (e["id"], st["do"])
            if st["do"] == "move":
                assert st["op"] in ops and st["replacement"]["text"].strip(), (e["id"], st)
            for key in ("targets", "refs", "items", "from", "evidence", "weakened", "strengthened"):
                for ref in st.get(key, []):
                    assert ref in aliases, (e["id"], st["do"], ref)
            if "as" in st:
                assert st["as"] not in aliases, (e["id"], st["as"])
                aliases.add(st["as"])
    # Teo provenance stays with the notes; Boyd is never quoted.
    blob = json.dumps(raw, ensure_ascii=False)
    assert "“" not in json.dumps(raw["methodology"], ensure_ascii=False).replace("“{a}”", "").replace("“{b}”", ""), "no quotation marks in methodology: paraphrase only"
    assert "Boyd said" not in blob and "Boyd wrote" not in blob
    assert meta["slug"] == SLUG and re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["fetched"]) and meta["key_file_used"] is False
    return {"operations": len(ops), "examples": len(raw["examples"]), "cards": len(raw["cards"]), "sources": len(sources)}


def luminance(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def palettes(tokens):
    light = dict(tokens["colors"])
    light.update(SOFT["light"])
    dark = dict(DARK)
    dark.update(SOFT["dark"])
    return {"light": light, "dark": dark}


def check_contrast(tokens):
    rows = []
    for mode, p in palettes(tokens).items():
        for fg, bg, minimum in [("foreground", "background", 7), ("secondary", "background", 4.5), ("secondary", "surface", 4.5),
                                ("secondary", "card", 4.5), ("mark", "background", 4.5), ("mark", "card", 4.5),
                                ("selected", "background", 4.5), ("selected", "red_soft", 4.5), ("foreground", "mark_soft", 7),
                                ("foreground", "red_soft", 7), ("on_mark", "mark", 4.5), ("foreground", "card", 7)]:
            ratio = contrast(p[fg], p[bg])
            assert ratio >= minimum, f"{mode}: {fg} on {bg} is {ratio:.2f}, below {minimum}"
            rows.append((mode, fg, bg, round(ratio, 2)))
    return rows


def compact(js):
    """Drops whole-line comments, blank lines and indentation. The sources use no template literals or
    line continuations, so every statement is unchanged; tests run the compacted code the page ships."""
    out = re.sub(r"^[ \t]*/\*[\s\S]*?\*/[ \t]*\n", "", js, flags=re.M)
    lines = [ln.strip() for ln in out.split("\n")]
    out = "\n".join(ln for ln in lines if ln and not ln.startswith("//"))
    assert "`" not in out and not re.search(r"\\$", out, re.M), "compact() cannot handle template literals or continuations"
    return out


def css(tokens):
    text = CSS_TEMPLATE.read_text(encoding="utf-8")
    rep = {"font_sans": tokens["font_sans"], "font_mono": tokens["font_mono"], "radius": tokens["radius"], "content_width": tokens["content_width"]}
    for i, step in enumerate(tokens["spacing_rem"]):
        rep[f"s{i}"] = f"{step}rem"
    for mode, p in palettes(tokens).items():
        for k, v in p.items():
            rep[k if mode == "light" else f"dark_{k}"] = v
    for key, value in rep.items():
        text = text.replace(f"%%{key}%%", value)
    assert "%%" not in text, "unreplaced CSS token"
    return text


def example_text(e):
    """The worked example as plain facts read from its own command script, for the no-JavaScript page."""
    names, moves, cands = {}, [], {}
    out = {"title": e["title"], "purpose": e["purpose"], "note": e["note"], "signals": [], "inferred": [], "unknown": [], "contradictions": []}
    ops = {}
    for st in e["steps"]:
        do = st["do"]
        if do == "new":
            out["situation"] = st["title"]
        elif do == "intent":
            out["intent"] = st["text"]
        elif do in ("item", "contradiction"):
            names[st.get("as")] = st["text"]
            kind = "contradictions" if do == "contradiction" else "signals" if st["type"] == "signal" else "unknown" if st["type"] == "unknown" else "inferred"
            out[kind].append(st["text"])
        elif do == "orient":
            out["model"] = st["inside"]
            out["boundary"] = st.get("boundary", "")
            out["model_move"] = st["move"]
        elif do == "move":
            names[st["as"]] = st["replacement"]["text"]
            moves.append((st["op"], [names[t] for t in st["targets"]], st["replacement"]["text"]))
        elif do == "candidate":
            cands[st["as"]] = st
        elif do == "adopt":
            out["adopted"] = cands[st["id"]]
            out["rejected"] = [c for k, c in cands.items() if k != st["id"]]
        elif do == "action":
            out["action"] = st
        elif do == "outcome":
            out["outcome"] = st
    out["moves"] = moves
    return out


def render_example(e, ops):
    x = example_text(e)
    li = lambda xs: "".join(f"<li>{escape(t)}</li>" for t in xs)
    rows = [("Situation", escape(x["situation"])), ("Observed", f"<ul>{li(x['signals'])}</ul>")]
    if x["inferred"]:
        rows.append(("Inferred", f"<ul>{li(x['inferred'])}</ul>"))
    rows.append(("Original model", escape(x["model"])))
    if x["unknown"]:
        rows.append(("Unknown", f"<ul>{li(x['unknown'])}</ul>"))
    if x["contradictions"]:
        rows.append(("Contradiction", f"<ul>{li(x['contradictions'])}</ul>"))
    rows.append(("Destroyed", "<ul>" + "".join(
        f"<li>{escape(ops[op]['label'])}: <s>{escape('; '.join(t))}</s> → <strong>{escape(r)}</strong></li>" if t else
        f"<li>{escape(ops[op]['label'])} → <strong>{escape(r)}</strong></li>" for op, t, r in x["moves"]) + "</ul>"))
    a = x["adopted"]
    rows.append(("New orientation", f"We are actually in {escape(a['inside'])}. What matters now is {escape(a['matters'])}."))
    for r in x["rejected"]:
        same = r.get("boundary") and r.get("boundary") == x["boundary"]
        rows.append(("Rejected candidate", escape(r["inside"]) + (" (it keeps the original boundary, assumptions and move: a rewording, not a new orientation)" if same else "")))
    act = x["action"]
    rows += [("Action", f"{escape(act['text'])} ({escape(act['type'])})"), ("Expected signal", escape(act["expected"])), ("Reconsider if", escape(act["reconsider"]))]
    if "outcome" in x:
        rows.append(("Observed result", escape(x["outcome"]["observed"])))
    body = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in rows)
    return (f'<article class="case" id="static-{e["id"]}"><h3>{escape(x["title"])}</h3><p class="hint">{escape(x["purpose"])} {escape(x["note"])}</p>'
            f"<dl>{body}</dl></article>")


def diagram():
    return ('<svg class="diagram" viewBox="0 0 300 196" role="img" aria-labelledby="dg-t dg-d"><title id="dg-t">Orientation at the centre of the loop</title>'
            '<desc id="dg-d">Reality feeds orientation. Orientation guides decision and action; action changes reality, and its consequences feed back into orientation, which can be revised.</desc>'
            '<g><rect x="95" y="6" width="110" height="34" rx="6"/><text x="150" y="28" text-anchor="middle">Reality</text></g>'
            '<g class="o"><rect x="20" y="64" width="230" height="62" rx="8"/><text x="135" y="89" text-anchor="middle">Orientation</text>'
            '<text x="135" y="110" text-anchor="middle">model · assumptions · boundary</text></g>'
            '<g><rect x="45" y="150" width="80" height="34" rx="6"/><text x="85" y="172" text-anchor="middle">Decide</text></g>'
            '<g><rect x="145" y="150" width="80" height="34" rx="6"/><text x="185" y="172" text-anchor="middle">Act</text></g>'
            '<path d="M150 40v22M85 126v22M125 167h18M225 167h50V23h-68M265 95h-13"/></svg>'
            '<p class="hint" style="text-align:center">Action produces new reality; orientation is revised when it fails.</p>')


def method_html(raw):
    m, srcs = raw["methodology"], {s["id"]: s for s in raw["sources"]}
    prov = raw["provenance"]
    why = "".join(f'<dt id="{x["id"]}">{escape(x["title"])} <span class="prov">({escape(prov[x["source"]]["label"])})</span></dt><dd>{escape(x["text"])}</dd>' for x in m["why"])
    rao = "".join(f'<details id="{n["id"]}"><summary>{escape(n["title"])}</summary><p>{escape(n["text"])}</p><p class="prov">{escape(n["basis"])}</p></details>' for n in m["rao"])

    def src(s):
        t = escape(s["title"])
        link = f'<a href="{escape(s["url"])}">{t}</a>' if s.get("url") else t
        return f"<li>{link}{('. ' + escape(s['note'])) if s.get('note') else ''}</li>"
    groups = "".join(f"<h4>{escape(prov[c]['label'])}</h4><p class=\"prov\">{escape(prov[c]['about'])}</p><ul class=\"srcs\">{''.join(src(s) for s in raw['sources'] if s['class'] == c)}</ul>"
                     for c in ("boyd", "rao", "teo"))
    fams = {f["id"]: f["label"] for f in raw["families"]}
    oplist = "".join(f'<li id="op-{o["id"]}"><b>{escape(o["label"])}</b> <span class="prov">({escape(fams[o["family"]])}{", deep reset" if o.get("deep") else ""})</span> — {escape(o["challenge"])}</li>' for o in raw["operations"])
    how = "<ol>" + "".join(f"<li>{escape(s)}</li>" for s in m["how"]) + "</ol>"
    return (f'<section class="method" id="method" aria-labelledby="h-method"><h2 id="h-method">Why this works this way</h2>'
            f'<div id="how-src"><p>{escape(raw["tagline"])}</p>{diagram()}<p class="hint">An explanation, not the interface: orientation is the work, the other steps feed and test it.</p>{how}</div>'
            f"<dl>{why}</dl><h3>Teaching notes</h3>{rao}"
            f'<details><summary>The destruction operations</summary><ul class="oplist">{oplist}</ul></details>'
            f'<h3 id="sources">Examples and sources</h3>{groups}<p>{escape(raw["principle"])}</p></section>')


def static_html(raw):
    ops = {o["id"]: o for o in raw["operations"]}
    sheet = "".join(f"<li>{escape(q)}</li>" for q in raw["worksheet"])
    cards = "".join(f"<li><b>{escape(c['title'])}</b>: {escape(c['lesson'])} {escape(c['text'])}</li>" for c in raw["cards"])
    return (f'<div id="static" class="static"><p class="nojs">The interactive planner requires JavaScript. The worksheet and worked examples below work without it.</p>'
            f'<section aria-labelledby="h-sheet"><h2 id="h-sheet">Orient a situation</h2><ol>{sheet}</ol>'
            f'<p class="hint">You are ready to act when you have a provisional orientation, a next action, an expected observation and a condition for reconsidering.</p></section>'
            f'<section aria-labelledby="h-cases"><h2 id="h-cases">Three worked examples</h2>{"".join(render_example(e, ops) for e in raw["examples"])}</section>'
            f'<section aria-labelledby="h-cards"><h2 id="h-cards">Short cards</h2><p class="hint">Applications and interpretations from Yu Jie Teo\'s OODA notes, not quotations from Boyd.</p><ul>{cards}</ul></section></div>')


def render(raw, meta, tokens):
    payload = json.dumps(raw, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="icon" href="data:,">
<title>{escape(TITLE)}</title>
<meta name="description" content="{escape(DESCRIPTION)}">
<link rel="canonical" href="{CANONICAL}">
<meta property="og:type" content="website">
<meta property="og:title" content="{escape(OG_TITLE)}">
<meta property="og:description" content="{escape(DESCRIPTION)}">
<meta property="og:url" content="{CANONICAL}">
<style>{css(tokens)}</style></head>
<body><a class="skip" href="#main">Skip to the planner</a>
<header class="top"><p class="back"><a href="/visuals">← Visuals</a></p><h1>Orient</h1><p class="sub">Destroy the wrong model, act from the better one. {escape(raw["tagline"])}</p></header>
<main id="main" tabindex="-1">
{static_html(raw)}
<div id="app" class="app" hidden></div>
<div id="deck" class="deck" hidden><div class="deck-row"><button type="button" id="save-beamdswitch" class="small" title="Save this situation as a narrated Markdown talk, to open in beamdswitch">beamdswitch</button><button type="button" id="copy-beamdswitch" class="small" title="Copy this situation's narrated Markdown talk, to paste into beamdswitch">Copy deck</button><span id="deck-status" class="deck-status" role="status"></span></div>
<p class="hint">The beamdswitch button saves this situation as a narrated talk: a Markdown deck that walks from the situation and its reality ledger through the destruction, the candidates and the adopted orientation to the action, its prediction and what happened, with a spoken narration on every slide. Open it in <a href="{BEAMDSWITCH_URL}">beamdswitch</a> to get slides, a handout, narration and a video. Copy deck puts the same deck on the clipboard, to paste into beamdswitch if the download does not arrive.</p></div>
{method_html(raw)}
</main>
<footer class="foot"><p>Boyd's ideas are paraphrased, not quoted. Rao material is marked as interpretation. Examples labelled as applications come from Yu Jie Teo's notes, <cite>OODA, Orientation, and Slouching</cite>. Material checked on {escape(meta["fetched"])}.</p><p><a href="/visuals">Back to all visuals</a></p></footer>
<p id="announce" class="sr" role="status" aria-live="polite"></p>
<dialog id="palette" aria-labelledby="pal-label"><div class="pal"><div class="row" style="margin:0;justify-content:space-between"><label id="pal-label" for="pal-input" style="margin:0">Search the situation, or run a command</label><button type="button" id="pal-close" class="small">Close</button></div>
<input id="pal-input" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" autocomplete="off" spellcheck="false">
<p id="pal-count" class="sr" role="status" aria-live="polite"></p><ul id="pal-list" role="listbox" aria-label="Results"></ul></div></dialog>
<dialog id="dlg" aria-labelledby="dlg-title"><div class="dlg"><div class="row" style="margin:0;justify-content:space-between"><h2 id="dlg-title" style="margin:0"></h2><button type="button" id="dlg-close" class="small">Close</button></div><div id="dlg-body"></div></div></dialog>
<script type="application/json" id="oo-data">{payload}</script>
<script id="oo-logic">{compact(LOGIC_TEMPLATE.read_text(encoding="utf-8"))}</script>
<script id="beamdswitch">\n{DECK_TEMPLATE.read_text(encoding="utf-8")}</script>
<script id="report">\n{DECK_REPORT.read_text(encoding="utf-8")}</script>
<script id="oo-ui">{compact(JS_TEMPLATE.read_text(encoding="utf-8"))}</script>
</body></html>
'''


def verify_page(html, raw):
    stripped = re.sub(r'<script type="application/json"[\s\S]*?</script>', "", html)
    allowed = [CANONICAL, BEAMDSWITCH_URL] + [s["url"] for s in raw["sources"] if s.get("url")]
    links = stripped
    for url in allowed:
        links = links.replace(f'href="{escape(url)}"', "")
    assert not re.search(r"""(?:src|href|action)=["'](?:https?:)?//""", links), "external reference"
    assert not re.search(r"@import|url\(\s*['\"]?(?:https?:)?//|@font-face", stripped), "external CSS or font"
    assert not re.search(r"\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon|serviceWorker)\b", stripped), "network API in page script"
    assert not re.search(r"Math\.random|Date\.now|new Date\(", stripped), "hidden randomness or time dependence"
    assert "<script src" not in html and '<link rel="stylesheet"' not in html and "window.open" not in html and "window.top" not in html
    assert html.count("<title>") == 1 and f"<title>{escape(TITLE)}</title>" in html
    assert f'<meta name="description" content="{escape(DESCRIPTION)}">' in html
    assert f'<meta property="og:title" content="{escape(OG_TITLE)}">' in html and f'<meta property="og:description" content="{escape(DESCRIPTION)}">' in html
    assert '<meta property="og:type" content="website">' in html and f'<meta property="og:url" content="{CANONICAL}">' in html
    assert f'<link rel="canonical" href="{CANONICAL}">' in html and "viewport-fit=cover" in html
    assert 'href="/visuals"' in html
    assert "The interactive planner requires JavaScript." in html and all(escape(q) in html for q in raw["worksheet"])
    assert all(f'id="static-{e["id"]}"' in html for e in raw["examples"])
    assert "@media (prefers-reduced-motion:reduce)" in html and "@media (prefers-color-scheme:dark)" in html
    assert f'<script id="beamdswitch">\n{DECK_TEMPLATE.read_text(encoding="utf-8")}</script>' in html
    assert f'<script id="report">\n{DECK_REPORT.read_text(encoding="utf-8")}</script>' in html
    assert 'id="save-beamdswitch"' in html and 'id="copy-beamdswitch"' in html
    assert html.count("mc?.registerTool") == 3 and len(re.findall(r"readOnlyHint:\s*true", html)) == 3
    data = json.loads(re.search(r'<script type="application/json" id="oo-data">([\s\S]*?)</script>', html).group(1).replace("<\\/", "</"))
    assert data == raw, "embedded data differs from raw.json"
    size = len(html.encode("utf-8"))
    assert size < SIZE_LIMIT, f"page is {size} bytes, above the {SIZE_LIMIT}-byte limit"
    return size


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    raw, meta = load()
    tokens = json.loads(TOKENS.read_text(encoding="utf-8"))
    summary = validate(raw, meta)
    pairs = check_contrast(tokens)
    html = render(raw, meta, tokens)
    assert html == render(*load(), tokens), "render is not deterministic"
    if not args.verify:
        VIZ.parent.mkdir(parents=True, exist_ok=True)
        VIZ.write_text(html, encoding="utf-8")
        GALLERY.write_text(render_gallery(ROOT), encoding="utf-8")
    else:
        assert VIZ.read_text(encoding="utf-8") == html, "viz/ooda-orientation/index.html is stale: rerun the builder"
        assert GALLERY.read_text(encoding="utf-8") == render_gallery(ROOT), "index.html gallery is stale"
    size = verify_page(VIZ.read_text(encoding="utf-8"), raw)
    print(f"verified: {summary['operations']} destruction operations, {summary['examples']} worked examples, {summary['cards']} cards, "
          f"{summary['sources']} sources, {len(pairs)} contrast pairs, {size / 1000:.0f} kB "
          f"({'within' if size < SIZE_TARGET else 'above'} the {SIZE_TARGET // 1000} kB target), zero external requests")


if __name__ == "__main__":
    main()
