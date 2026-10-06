#!/usr/bin/env python3
"""Build the Monte Carlo Probability Workbench: one offline index.html and its raw.json.

Reads data/ (the catalogue: laws, models, methods, theory, glossary, datasets, groups and the measured limits),
src/ (the page body, its CSS and the classic-script modules) and beamdswitch.js (the site's template, unchanged),
and the shared kit through scripts/visual_kit.py and scripts/visual_build.py: the kit's shell, state runtime and
layout, the style guide's tokens, the site's theme script and the vendored MathJax 4.1.3 with Fira Math. Writes:

  raw.json     the catalogue, published beside the page as data.json
  index.html   every script, style, datum, font and licence inlined; no runtime request

The engine modules (rng, special, expr, continuous, laws, engine) are inlined once; the page starts its workers from their
text and src/worker.js through a Blob URL.

    python3 build.py            # write index.html and raw.json
    python3 build.py --verify   # check both are current; write nothing
"""
import argparse
import html
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "scripts"))

import visual_kit as kit  # noqa: E402
from visual_build import script  # noqa: E402

SLUG = HERE.name
DATA = ["laws", "models", "methods", "theory", "glossary", "datasets", "groups", "limits"]
ENGINE = ["rng", "special", "expr", "continuous", "tails", "laws", "custom", "constructed", "engine", "dsl"]
PAGE = ["plots", "model", "report", "pool", "view"]


def read(path):
    return path.read_text(encoding="utf-8")


def catalogue():
    out = {"format": "monte-carlo-workbench/catalogue", "version": 1}
    for name in DATA:
        out[name] = json.loads(read(HERE / "data" / f"{name}.json"))
    return out


def static_parts(cat):
    """The parts of the page a reader sees without JavaScript: the groups, the glossary, the catalogue of this group,
    the datasets and the measured limits."""
    e = html.escape
    groups = "<ol>" + "".join(f"<li><strong>{e(g['title'])}</strong> ({e(g['status'])}): {e(g['content'])}</li>" for g in cat["groups"]) + "</ol>"
    glossary = '<dl id="glossary">' + "".join(f"<dt>{e(t['term'])}</dt><dd>{e(t['definition'])}</dd>" for t in cat["glossary"]) + "</dl>"
    rows = []
    for law in cat["laws"]:
        models = [m for m in cat["models"] if m["law"] == law["id"]]
        items = "".join(f"<li>{'Behaviour experiment' if m['kind'] == 'experiment' else e(m['domain'])}: {e(m['title'])}</li>" for m in models)
        rows.append(f"<li><strong>{e(law['name'])}</strong>: {e(law['convention'])}<ul>{items}</ul></li>")
    inputs = [m for m in cat["models"] if m["kind"] == "input"]
    if inputs:
        items = "".join(f"<li>{e(m['title'])}</li>" for m in inputs)
        rows.append("<li><strong>Custom law inputs</strong>: a line of the model text defines a law by a PDF, a log-PDF, an unnormalised density, a PMF, "
                    f"a finite table, a CDF, a quantile function, an MGF or a characteristic function, and the page checks it.<ul>{items}</ul></li>")
    listing = f'<details><summary>{len(cat["laws"])} laws, {sum(m["kind"] == "experiment" for m in cat["models"])} behaviour experiments, {sum(m["kind"] == "workflow" for m in cat["models"])} workflows and {len(inputs)} examples of custom inputs</summary><ul>{"".join(rows)}</ul></details>'
    datasets = "<ul>" + "".join(f"<li>{e(d['title'])}: {e(d['source'])} {e(d['licence'])}</li>" for d in cat["datasets"]) + "</ul>"
    lim = cat["limits"].get("measured")
    if lim:
        limits = (f"<p>Published limits: n ≤ 2^{lim['maxSize']} = {2 ** lim['maxSize']:,} replicates for each alternative, at most "
                  f"{lim['alternatives']} alternatives, {lim['repeatDraws']:,} draws in one replicate, and {lim['seconds']} s for one run. "
                  f"{e(lim['how'])}</p>")
    else:
        limits = "<p>The limits are not measured yet.</p>"
    here = [g for g in cat["groups"] if g["status"] == "here"]
    titles = [g["title"][0].lower() + g["title"][1:] for g in here]
    span = lambda gs: f"{gs[0]['piece']}" if len(gs) == 1 else f"{gs[0]['piece']} to {gs[-1]['piece']}"
    later = [g for g in cat["groups"] if g["status"] != "here"]
    summary = (f"This page holds group{'s' if len(here) > 1 else ''} {span(here)} of {len(cat['groups'])}: "
               f"{', '.join(titles[:-1]) + ', and ' + titles[-1] if len(titles) > 1 else titles[0]}."
               + (f" Group{'s' if len(later) > 1 else ''} {span(later)} {'are' if len(later) > 1 else 'is'} not yet available." if later else ""))
    return {"GROUPS_SUMMARY": e(summary), "GROUPS": groups, "GLOSSARY": glossary, "CATALOGUE": listing, "DATASETS": datasets, "LIMITS": limits}


def build():
    cat = catalogue()
    meta = json.loads(read(HERE / "visual.json"))
    body = read(HERE / "src" / "body.html")
    for key, value in static_parts(cat).items():
        if f"@@{key}@@" not in body:
            sys.exit(f"src/body.html has no @@{key}@@")
        body = body.replace(f"@@{key}@@", value)
    dataset = json.dumps(cat, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    blocks = [script("dataset", dataset, "application/json"), script("kit", kit.read(kit.KIT / "kit.js")),
              script("beamdswitch", read(HERE / "beamdswitch.js"))]
    blocks += [script(f"src-{m}", read(HERE / "src" / f"{m}.js")) for m in ENGINE]
    blocks.append(script("src-worker", read(HERE / "src" / "worker.js"), "text/plain"))
    blocks += [script(f"src-{m}", read(HERE / "src" / f"{m}.js")) for m in PAGE]
    blocks.append(script("mathjax", kit.mathjax_bundle(), vendor=kit.MATHJAX))
    parts = {
        "TITLE": html.escape(meta["title"]),
        "DESCRIPTION": html.escape(meta["summary"]),
        "SLUG": SLUG,
        "SUBJECT": "Probability and simulation",
        "THEME_SCRIPT": kit.theme_script(),
        "STYLE_TOKENS": kit.read(kit.KIT / "style-tokens.css").rstrip("\n"),
        "KIT_CSS": kit.read(kit.KIT / "kit.css").rstrip("\n"),
        "STYLE": read(HERE / "src" / "style.css").rstrip("\n"),
        "BODY": body.rstrip("\n"),
        "LICENCES": kit.licences_html(),
        "SCRIPTS": "\n".join(blocks),
    }
    page = kit.read(kit.KIT / "shell.html")
    for name, value in parts.items():
        page = page.replace(f"@@{name}@@", value)
    page = page.replace("\n\n</main>", "\n</main>")
    raw = json.dumps(cat, ensure_ascii=False, indent=1) + "\n"
    return page, raw


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--verify", action="store_true", help="check index.html and raw.json are current; write nothing")
    args = parser.parse_args()
    page, raw = build()
    targets = {HERE / "index.html": page, HERE / "raw.json": raw}
    if args.verify:
        stale = [p.name for p, text in targets.items() if not p.is_file() or read(p) != text]
        if stale:
            sys.exit(f"{SLUG}: stale {', '.join(stale)}; run python3 build.py")
        print(f"{SLUG}/index.html ({len(page.encode('utf-8'))} bytes) and raw.json are current")
        return
    for path, text in targets.items():
        path.write_text(text, encoding="utf-8")
    print(f"wrote {SLUG}/index.html ({len(page.encode('utf-8'))} bytes) and raw.json")


if __name__ == "__main__":
    main()
