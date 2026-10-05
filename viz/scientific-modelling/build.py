#!/usr/bin/env python3
"""Build the Scientific Modelling page: one offline index.html and its raw.json.

Reads data/ (examples, quantities, familiar groups, sources, the build roadmap and the SymPy references), src/
(the engine modules, the views, body.html and style.css), beamdswitch.js (the site's template, unchanged) and the
shared kit of scripts/ (the shell, the state and export runtime, the style tokens and the vendored MathJax 4.1.3
with its Fira font), and writes:

  raw.json     the data the page embeds, published beside it as data.json
  index.html   the kit's shell with every script, style, datum and font inlined; no runtime request

The engine modules are classic scripts that the tests load with require(), in this order: rational, linalg,
units, expr, sym, record, check, finder, nondim, model, report; then view.js, which runs only in the browser.

Usage:
    python3 build.py            # write raw.json and index.html
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

DATA = ["examples", "quantities", "groups", "sources", "roadmap", "references"]
MODULES = ["rational", "linalg", "units", "expr", "sym", "record", "check", "finder", "nondim", "model", "report", "view"]
SUBJECT = "Engineering modelling"


def read(path):
    return path.read_text(encoding="utf-8")


def raw_json():
    """The page's data: every file of data/, in a fixed order."""
    data = {name: json.loads(read(HERE / "data" / f"{name}.json")) for name in DATA}
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def page(raw):
    meta = json.loads(read(HERE / "visual.json"))
    dataset = json.dumps(json.loads(raw), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    blocks = [script("dataset", dataset, "application/json"), script("kit", kit.read(kit.KIT / "kit.js")),
              script("beamdswitch", read(HERE / "beamdswitch.js"))]
    blocks += [script(name, read(HERE / "src" / f"{name}.js")) for name in MODULES]
    blocks.append(script("mathjax", kit.mathjax_bundle(), vendor=kit.MATHJAX))
    parts = {
        "TITLE": html.escape(meta["title"]),
        "DESCRIPTION": html.escape(meta["summary"]),
        "SLUG": HERE.name,
        "SUBJECT": html.escape(SUBJECT),
        "THEME_SCRIPT": kit.theme_script(),
        "STYLE_TOKENS": kit.read(kit.KIT / "style-tokens.css").rstrip("\n"),
        "KIT_CSS": kit.read(kit.KIT / "kit.css").rstrip("\n"),
        "STYLE": read(HERE / "src" / "style.css").rstrip("\n"),
        "BODY": read(HERE / "src" / "body.html").rstrip("\n"),
        "LICENCES": kit.licences_html(),
        "SCRIPTS": "\n".join(blocks),
    }
    out = kit.read(kit.KIT / "shell.html")
    for name, value in parts.items():
        out = out.replace(f"@@{name}@@", value)
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build index.html and raw.json from data/, src/ and the shared kit.")
    parser.add_argument("--verify", action="store_true", help="check index.html and raw.json are current; write nothing")
    args = parser.parse_args(argv)
    raw = raw_json()
    text = page(raw)
    targets = {HERE / "raw.json": raw, HERE / "index.html": text}
    if args.verify:
        stale = [p.name for p, body in targets.items() if not p.is_file() or read(p) != body]
        if stale:
            sys.exit(f"{HERE.name}/{', '.join(stale)} not what build.py writes; run python3 build.py")
        print(f"{HERE.name}/index.html and raw.json are current")
        return
    for p, body in targets.items():
        p.write_text(body, encoding="utf-8")
    print(f"wrote {HERE.name}/index.html ({len(text.encode('utf-8'))} bytes) and raw.json ({len(raw.encode('utf-8'))} bytes)")


if __name__ == "__main__":
    main()
