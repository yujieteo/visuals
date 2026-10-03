#!/usr/bin/env python3
"""Builder and verifier for the multi-armed-bandit visualization.

A practitioner tool for choosing the next trial among variants with uncertain binary success rates:
Thompson Sampling (one shared Beta prior) and UCB1 recommendations from the user's own evidence, and
a seeded simulation comparing them with equal allocation. The authored material (templates with
fictional counts, assumptions, method references) lives in data/multi-armed-bandit/raw.json. The page
is assembled from scripts/templates/multi-armed-bandit.css, multi-armed-bandit-logic.js (pure numerics,
state and simulation, also run by yujieteo/multi-armed-bandit's tests/multi-armed-bandit.test.mjs) and multi-armed-bandit.js
(interface). viz/multi-armed-bandit/beamdswitch.js (the site's shared report template, unchanged) and
viz/multi-armed-bandit/report.js (the experiment as a report) are inlined as they are, so the page
makes no request at runtime. --verify re-runs every check and compares the committed page and
gallery without writing.

    python3 scripts/build_multi_armed_bandit.py
    python3 scripts/build_multi_armed_bandit.py --verify
"""
import argparse
import json
import re
from html import escape
from pathlib import Path

from gallery import render_gallery
from page_parts import compact
from style_guide import contrast

ROOT = Path(__file__).resolve().parents[1]
SLUG = "multi-armed-bandit"
DATA = ROOT / "data" / SLUG
VIZ = ROOT / "viz" / SLUG / "index.html"
GALLERY = ROOT / "index.html"
TOKENS = ROOT / "design-tokens.json"
TEMPLATES = ROOT / "scripts" / "templates"
CSS_TEMPLATE = TEMPLATES / "multi-armed-bandit.css"
LOGIC_TEMPLATE = TEMPLATES / "multi-armed-bandit-logic.js"
JS_TEMPLATE = TEMPLATES / "multi-armed-bandit.js"
DECK_TEMPLATE = ROOT / "viz" / SLUG / "beamdswitch.js"
DECK_REPORT = ROOT / "viz" / SLUG / "report.js"
BEAMDSWITCH_URL = "https://teoyujie.org/visuals/beamdswitch/"
GALLERY_URL = "https://teoyujie.org/visuals/"

TITLE = "Multi-armed Bandit: Thompson Sampling and UCB"
DESCRIPTION = ("Choose the next trial among variants with uncertain success rates: Thompson Sampling and UCB1 "
               "recommendations from your own success/failure counts, with a seeded simulation of how they explore.")
CANONICAL = "https://teoyujie.org/visuals/multi-armed-bandit/"
SIZE_LIMIT = 100 * 1024

# Page-scoped additions to design-tokens.json: control borders that reach 3:1, and the dark palette.
LIGHT_EXTRA = {"mark_text": "#0062c4", "control": "#86868b", "eq": "#6e6e73", "on_mark": "#ffffff", "mark_soft": "#eef5fd"}
DARK = {"background": "#161617", "foreground": "#f5f5f7", "secondary": "#a1a1a6", "surface": "#232326", "border": "#48484c",
        "control": "#8e8e93", "focus": "#3d9bff", "mark": "#3d9bff", "mark_text": "#3d9bff", "selected": "#ff7b6b", "eq": "#a1a1a6", "on_mark": "#0b0b0c",
        "mark_soft": "#14263b"}
FICTIONAL = {"website": [("Page A", 8, 100), ("Page B", 12, 100), ("Page C", 3, 20)]}


def load():
    raw = json.loads((DATA / "raw.json").read_text(encoding="utf-8"))
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
    return raw, meta


def validate(raw, meta):
    ids = [t["id"] for t in raw["templates"]]
    assert ids == ["website", "email", "study", "outreach", "custom"], ids
    counts = [(v["successes"], v["trials"]) for v in raw["templates"][0]["variants"]]
    assert [(v["name"], v["successes"], v["trials"]) for v in raw["templates"][0]["variants"]] == FICTIONAL["website"]
    for t in raw["templates"]:
        names = [v["name"].strip().lower() for v in t["variants"]]
        assert 2 <= len(names) <= 10 and len(set(names)) == len(names) and all(0 < len(n) <= 80 for n in names), t["id"]
        assert len(t["title"]) <= 120 and len(t["success"]) <= 300 and len(t["unit"]) <= 120, t["id"]
        if t["fictional"]:
            assert [(v["successes"], v["trials"]) for v in t["variants"]] == counts, f"{t['id']} reuses the agreed fictional counts"
            assert "Fictional" in t["note"] and t["success"] and t["unit"], t["id"]
        else:
            assert t["id"] == "custom" and len(t["variants"]) == 3 and all(v["trials"] == 0 for v in t["variants"])
    assert "assessment horizon" in raw["templates"][2]["success"] and "response horizon" in raw["templates"][3]["success"]
    assert len(raw["assumptions"]) >= 4 and len(raw["references"]) == 3
    assert meta["slug"] == SLUG and re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["fetched"]) and meta["key_file_used"] is False
    return {"templates": len(ids)}


def palettes(tokens):
    light = dict(tokens["colors"])
    light.update(LIGHT_EXTRA)
    return {"light": light, "dark": dict(DARK)}


def check_contrast(tokens):
    """WCAG AA: 4.5:1 for text, 3:1 for control boundaries and chart marks."""
    rows = []
    pairs = [("foreground", "background", 4.5), ("foreground", "surface", 4.5), ("foreground", "mark_soft", 4.5),
             ("secondary", "background", 4.5), ("secondary", "surface", 4.5), ("secondary", "mark_soft", 4.5),
             ("mark_text", "background", 4.5), ("mark_text", "surface", 4.5), ("mark_text", "mark_soft", 4.5), ("mark", "background", 3),
             ("selected", "background", 4.5), ("selected", "surface", 4.5), ("selected", "mark_soft", 4.5), ("on_mark", "mark", 4.5), ("focus", "background", 3),
             ("control", "background", 3), ("eq", "background", 3), ("eq", "surface", 3)]
    for mode, p in palettes(tokens).items():
        for fg, bg, minimum in pairs:
            ratio = contrast(p[fg], p[bg])
            assert ratio >= minimum, f"{mode}: {fg} on {bg} is {ratio:.2f}, below {minimum}"
            rows.append((mode, fg, bg, round(ratio, 2)))
    return rows


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
    text = re.sub(r"\n", "", text)
    return text


def refs_html(raw):
    def ref(r):
        t = escape(r["title"])
        return f'<li><a href="{escape(r["url"])}">{t}</a></li>' if r.get("url") else f"<li>{t}</li>"
    return "".join(ref(r) for r in raw["references"])


def about_html(raw, suffix):
    """Assumptions, references and next steps: in the experiment tab and in the no-JavaScript page."""
    items = "".join(f"<li>{escape(a)}</li>" for a in raw["assumptions"])
    return (f'<section aria-labelledby="h-about{suffix}"><h2 id="h-about{suffix}">Assumptions, references and next steps</h2><ul>{items}</ul>'
            '<p class="note">If the success definition, the audience or the environment changes, start a new experiment instead of adding to this one.</p>'
            '<p class="note">Next steps: follow either recommendation for one trial, record the outcome once it is resolved, and look again. '
            'Neither method declares an experiment finished or a variant conclusively best.</p>'
            f'<h3>Method references</h3><ul class="refs">{refs_html(raw)}</ul></section>')


FORMULAS = ('<p>For a variant with <i>s</i> successes and <i>f</i> failures, and one shared prior Beta(<i>a</i>, <i>b</i>):</p>'
            '<p class="formula">posterior = Beta(a + s, b + f)\nposterior mean = (a + s) / (a + b + s + f)\n'
            '95% credible interval = posterior quantiles at 0.025 and 0.975\nThompson score = one draw from the posterior; recommend the largest\n'
            'UCB1 score = s/n + √(2 ln T / n),  n = s + f,  T = trials across all variants</p>'
            '<p class="note">UCB1 recommends the first untried variant before comparing scores, so ln 0 never occurs. Ties go to the first variant in display order. '
            'A UCB1 score is not a probability and is never capped at 1. Intervals are computed numerically from the regularised incomplete beta function, not by a normal approximation.</p>')


def nojs_html(raw):
    return (f'<div id="nojs" class="nojs"><p><strong>The interactive tool needs JavaScript.</strong> Without it, here is how the calculations work.</p>{FORMULAS}'
            '<p><strong>Worked Beta update.</strong> 8 successes in 100 trials (92 failures) with the prior Beta(1, 1) gives the posterior Beta(9, 93), '
            'whose mean is 9/102 ≈ 8.82%.</p>' + about_html(raw, "-static") + "</div>")


def experiment_html(raw):
    options = "".join(f'<option value="{escape(t["id"])}">{escape(t["label"])}{" (fictional counts)" if t["fictional"] else ""}</option>' for t in raw["templates"])
    head = "".join(f'<th scope="col"{" class=\"n\"" if n else ""}>{escape(h)}</th>' for h, n in [
        ("Select", 0), ("Name", 0), ("Successes", 0), ("Trials", 0), ("Failures", 1), ("Observed rate", 1), ("Posterior mean", 1),
        ("95% credible interval", 1), ("Thompson sample", 1), ("UCB1 score", 1), ("", 0)])
    field = lambda fid, key, label, tag="input": (
        f'<div class="field"><label for="{fid}">{label}</label>'
        + (f'<textarea id="{fid}" aria-describedby="e-{key}"></textarea>' if tag == "textarea" else f'<input type="text" id="{fid}" autocomplete="off" aria-describedby="e-{key}">')
        + f'<p class="err" id="e-{key}"></p></div>')
    return f'''<section role="tabpanel" id="panel-exp" aria-labelledby="tab-exp">
<section aria-labelledby="h-def"><h2 id="h-def">1. Experiment</h2>
<div class="field"><label for="template">Template</label><select id="template">{options}</select></div>
<div id="confirm" class="confirm" hidden role="alertdialog" aria-labelledby="confirm-text"><p id="confirm-text"></p><div class="row"><button type="button" id="confirm-yes" class="primary">Replace</button><button type="button" id="confirm-no">Keep current</button></div></div>
<p><span id="basis" class="badge"></span> <span id="template-note" class="note"></span></p>
{field("f-title", "title", "Experiment title (required, up to 120 characters)")}
{field("f-success", "success", "Success definition, with a fixed outcome horizon (required, up to 300 characters)", "textarea")}
{field("f-unit", "unit", "Trial unit (required, up to 120 characters)")}
</section>
<section aria-labelledby="h-ev"><h2 id="h-ev">2. Variants and evidence</h2>
<p class="note">Enter resolved outcomes only. Edit successes and trials; failures are derived. Counts are whole numbers up to 1,000,000; names are unique, up to 80 characters.</p>
<div class="tw"><table id="vt"><caption class="sr">Variants, their evidence, posterior summaries and scores</caption><thead><tr>{head}</tr></thead><tbody id="vt-body"></tbody></table></div>
<div class="row"><button type="button" id="add-variant">Add variant</button><span id="vt-count" class="note"></span></div>
<p id="vt-status" class="status" role="status"></p>
<h3>Credible intervals</h3><div id="ci-plot"></div>
<p class="note">Line: 95% credible interval. Circle: posterior mean. Diamond: current Thompson sample. ★ marks the Thompson pick and ▲ the UCB1 pick.</p>
</section>
<section aria-labelledby="h-rec"><h2 id="h-rec">3. Recommendations</h2>
<div class="recs"><div class="rec ts"><h3>Thompson Sampling</h3><p class="pick" id="ts-pick"></p><p id="ts-why"></p><button type="button" id="ts-select">Select</button></div>
<div class="rec ucb"><h3>UCB1</h3><p class="pick" id="ucb-pick"></p><p id="ucb-why"></p><button type="button" id="ucb-select">Select</button></div></div>
<p id="disagree" class="callout"></p>
</section>
<section aria-labelledby="h-out"><h2 id="h-out">4. Record an outcome</h2>
<p id="sel-text"></p>
<div class="row"><button type="button" id="btn-success" class="primary">Success</button><button type="button" id="btn-failure">Failure</button><button type="button" id="btn-undo">Undo last outcome</button><button type="button" id="btn-resample">Resample Thompson</button></div>
<p id="record-why" class="note"></p><p id="record-status" class="status" role="status"></p>
<h3>Next step</h3><ul id="hints" class="hints"></ul>
</section>
<details id="method"><summary>5. Method details</summary>{FORMULAS}
<h3>Shared prior</h3><p class="note">One Beta(a, b) prior is applied independently to every variant. Beta(1, 1) is uniform. Both parameters are numbers from 0.1 to 100.</p>
<div class="pair"><div class="field"><label for="prior-a">Prior a</label><input type="text" inputmode="decimal" id="prior-a" autocomplete="off" aria-describedby="e-prior"></div>
<div class="field"><label for="prior-b">Prior b</label><input type="text" inputmode="decimal" id="prior-b" autocomplete="off" aria-describedby="e-prior"></div></div>
<p class="err" id="e-prior"></p><p id="prior-text" class="note" role="status"></p>
<p class="note">The page uses the xoshiro128** generator, seeded by splitmix32 and saved with your work, for Thompson draws; the simulation has its own streams. It is not cryptographic.</p>
</details>
<section aria-labelledby="h-save"><h2 id="h-save">6. Save, export and import</h2>
<p class="note">Your experiment autosaves in this browser when storage is available. JSON files hold the experiment, samples, generator state and simulation settings, but not undo history. Nothing is uploaded.</p>
<div class="row"><button type="button" id="export-json">Export JSON</button><label class="filebtn">Import JSON<input type="file" id="import-json" accept="application/json,.json"></label><button type="button" id="reset">Reset</button></div>
<p id="store-status" class="status" role="status"></p>
<h3>Presentation</h3>
<div class="row deck-row"><button type="button" id="save-beamdswitch" title="Save this experiment as a narrated Markdown deck, to open in beamdswitch">Save deck</button><button type="button" id="copy-beamdswitch" title="Copy the narrated Markdown deck, to paste into beamdswitch">Copy deck</button></div>
<p id="deck-status" class="status" role="status"></p>
<p class="note">Save deck writes {SLUG}-beamdswitch.md: a narrated Markdown talk with the set-up, method, results (including the simulation once it has run) and checks, using the numbers shown here. Open it in <a href="{BEAMDSWITCH_URL}">beamdswitch</a> for slides, narration and video. Copy deck puts the same Markdown on the clipboard.</p>
<details id="fallback"><summary>Export as text</summary><label for="export-text" id="export-label">Last export</label><textarea id="export-text" readonly placeholder="Use Save deck, Copy deck or Export JSON; the text appears here to select and copy."></textarea></details>
</section>
{about_html(raw, "")}
</section>'''


def simulation_html():
    return '''<section role="tabpanel" id="panel-sim" aria-labelledby="tab-sim" hidden>
<h2>Simulation</h2>
<p class="note">The simulation reuses your variant names and the shared prior, but ignores your recorded evidence and never changes your experiment. You choose the true success probabilities; Thompson Sampling, UCB1 and equal allocation each get the same number of pulls and their own evidence. The kth pull of a variant receives that variant's kth reward under every method.</p>
<h3>Settings</h3>
<div id="sim-probs" class="simset"></div>
<div class="pair"><div class="field"><label for="sim-budget">Pulls per method (variants to 2,000)</label><input type="text" inputmode="numeric" id="sim-budget" autocomplete="off" aria-describedby="e-sim"></div>
<div class="field"><label for="sim-seed">Seed (0 to 4,294,967,295)</label><input type="text" inputmode="numeric" id="sim-seed" autocomplete="off" aria-describedby="e-sim"></div></div>
<p class="err" id="e-sim"></p>
<div class="row"><button type="button" id="sim-step">Step</button><button type="button" id="sim-run" class="primary">Run</button><button type="button" id="sim-pause">Pause</button><button type="button" id="sim-reset">Reset</button></div>
<p id="sim-progress"></p><p id="sim-status" class="status" role="status"></p>
<h3>Cumulative successes</h3><div id="sim-chart"></div>
<ul class="legend" aria-hidden="true"><li><svg viewBox="0 0 32 8"><path class="line m-ts" d="M0 4h32"/></svg>Thompson Sampling (solid)</li><li><svg viewBox="0 0 32 8"><path class="line m-ucb" d="M0 4h32"/></svg>UCB1 (dashed)</li><li><svg viewBox="0 0 32 8"><path class="line m-eq" d="M0 4h32"/></svg>Equal allocation (dotted)</li></ul>
<h3>Results</h3>
<div class="tw"><table><caption class="sr">Simulation results by method</caption><thead><tr><th scope="col">Method</th><th scope="col" class="n">Pulls</th><th scope="col" class="n">Successes</th><th scope="col" class="n">Success rate</th><th scope="col" class="n">Expected regret</th></tr></thead><tbody id="sim-body"></tbody></table></div>
<h3>Allocation per variant</h3>
<div class="tw"><table><caption class="sr">Pulls allocated to each variant, by method</caption><thead id="alloc-head"></thead><tbody id="alloc-body"></tbody></table></div>
<p class="note"><strong>Expected regret</strong> adds up, over the pulls, the best known probability minus the known probability of the variant chosen. It uses the probabilities you set, not observed reward differences. Equal probabilities give zero expected regret; a probability of 0% always fails and 100% always succeeds. One seeded run does not establish that one method is better than another.</p>
</section>'''


def render(raw, meta, tokens):
    payload = json.dumps(raw, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">
<title>{escape(TITLE)}</title>
<meta name="description" content="{escape(DESCRIPTION)}">
<link rel="canonical" href="{CANONICAL}">
<meta property="og:type" content="website">
<meta property="og:title" content="{escape(TITLE)}">
<meta property="og:description" content="{escape(DESCRIPTION)}">
<meta property="og:url" content="{CANONICAL}">
<style>{css(tokens)}</style></head>
<body><a class="skip" href="#main">Skip to the tool</a>
<main id="main" tabindex="-1">
<p class="back"><a href="{GALLERY_URL}">← All visuals</a></p>
<h1>Multi-armed Bandit</h1>
<p class="lede">Choose the next trial among variants with uncertain success rates. Enter comparable success/failure evidence, compare what Thompson Sampling and UCB1 recommend, record each resolved outcome, and use the seeded simulation to see how the methods explore.</p>
{nojs_html(raw)}
<div id="app" hidden>
<div role="tablist" aria-label="Views"><button type="button" role="tab" id="tab-exp" aria-controls="panel-exp" aria-selected="true">My experiment</button><button type="button" role="tab" id="tab-sim" aria-controls="panel-sim" aria-selected="false" tabindex="-1">Simulation</button></div>
{experiment_html(raw)}
{simulation_html()}
</div>
</main>
<footer><p>Templates use fictional counts for illustration. Everything runs in this page; nothing is uploaded. Content checked on {escape(meta["fetched"])}.</p><p><a href="{GALLERY_URL}">All visuals</a></p></footer>
<p id="announce" class="sr" role="status" aria-live="polite"></p>
<script type="application/json" id="mab-data">{payload}</script>
<script id="mab-logic">{compact(LOGIC_TEMPLATE.read_text(encoding="utf-8"))}</script>
<script id="beamdswitch">\n{DECK_TEMPLATE.read_text(encoding="utf-8")}</script>
<script id="report">\n{DECK_REPORT.read_text(encoding="utf-8")}</script>
<script id="mab-ui">{compact(JS_TEMPLATE.read_text(encoding="utf-8"))}</script>
</body></html>
'''


def verify_page(html, raw):
    stripped = re.sub(r'<script type="application/json"[\s\S]*?</script>', "", html)
    allowed = [CANONICAL, BEAMDSWITCH_URL, GALLERY_URL] + [r["url"] for r in raw["references"] if r.get("url")]
    links = stripped
    for url in allowed:
        links = links.replace(f'href="{escape(url)}"', "")
    assert not re.search(r"""(?:src|href|action)=["'](?:https?:)?//""", links), "external reference"
    assert not re.search(r"@import|url\(|@font-face", stripped), "external CSS or font"
    assert not re.search(r"\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon|serviceWorker|Worker)\b", stripped), "network API in page script"
    assert "Math.random" not in stripped, "randomness must come from the seeded generator"
    assert "<script src" not in html and '<link rel="stylesheet"' not in html and "window.open" not in html and "window.top" not in html and "target=" not in html
    assert html.count("<title>") == 1 and f"<title>{escape(TITLE)}</title>" in html
    assert f'<meta name="description" content="{escape(DESCRIPTION)}">' in html
    assert f'<meta property="og:title" content="{escape(TITLE)}">' in html and f'<meta property="og:description" content="{escape(DESCRIPTION)}">' in html
    assert '<meta property="og:type" content="website">' in html and f'<meta property="og:url" content="{CANONICAL}">' in html
    assert f'<link rel="canonical" href="{CANONICAL}">' in html and 'name="viewport"' in html
    assert html.count("<main") == 1 and f'<a href="{GALLERY_URL}">← All visuals</a>' in html
    assert ">My experiment</button>" in html and ">Simulation</button>" in html
    assert "Beta(9, 93)" in html and "9/102" in html, "no-JavaScript worked example"
    assert "@media (prefers-reduced-motion:reduce)" in html and "@media (prefers-color-scheme:dark)" in html
    assert f'<script id="beamdswitch">\n{DECK_TEMPLATE.read_text(encoding="utf-8")}</script>' in html
    assert f'<script id="report">\n{DECK_REPORT.read_text(encoding="utf-8")}</script>' in html
    assert ">Save deck</button>" in html and ">Copy deck</button>" in html
    assert len(re.findall(r"mc\.registerTool\(\{ name: ", html)) == 3 and len(re.findall(r"readOnlyHint: true", html)) == 3
    data = json.loads(re.search(r'<script type="application/json" id="mab-data">([\s\S]*?)</script>', html).group(1).replace("<\\/", "</"))
    assert data == raw, "embedded data differs from raw.json"
    size = len(html.encode("utf-8"))
    assert size <= SIZE_LIMIT, f"page is {size} bytes, above the {SIZE_LIMIT}-byte (100 KiB) budget"
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
        assert VIZ.read_text(encoding="utf-8") == html, "viz/multi-armed-bandit/index.html is stale: rerun the builder"
        assert GALLERY.read_text(encoding="utf-8") == render_gallery(ROOT), "index.html gallery is stale"
    size = verify_page(VIZ.read_text(encoding="utf-8"), raw)
    print(f"verified: {summary['templates']} templates, {len(pairs)} contrast pairs, {size} bytes "
          f"(budget {SIZE_LIMIT}), zero external requests")


if __name__ == "__main__":
    main()
