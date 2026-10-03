"""Build a generated visual's index.html from its own sources and the shared kit, the same bytes on every run.

A visual that scripts/new_visual.py generated has a two-line build.py that calls main() here. The page is the
kit's shell (scripts/kit/shell.html) with, in order:

  head      the title, description, canonical URL and Open Graph tags from visual.json, and the site's theme script
  style     the style guide's tokens (kit/style-tokens.css), the kit's layout (kit/kit.css), then src/style.css
  body      the eyebrow and title, the toolbar of exports, src/body.html, and the licences when MathJax is embedded
  scripts   raw.json as <script id="dataset" type="application/json">, then kit/kit.js, kit/view3d.js (--3d),
            beamdswitch.js, src/model.js, report.js and src/view.js, each unchanged in a <script id> of its own,
            then the MathJax bundle in <script id="mathjax" data-vendor="mathjax-4.1.3"> (--mathjax)

generated.json says which options the visual was generated with. Everything is inlined: the page requests nothing.

    python3 build.py            # write index.html
    python3 build.py --verify   # check index.html is current without writing it
"""
import argparse
import html
import json
import sys
from pathlib import Path

import visual_kit as kit


def read(folder, name):
    return (folder / name).read_text(encoding="utf-8")


def script(block_id, text, kind=None, vendor=None):
    """One inline <script> block. A script's text may not close the element early."""
    if "</script" in text.lower():
        raise SystemExit(f"{block_id}: the text holds </script, which would end the inline block early")
    attrs = f' id="{block_id}"' + (f' type="{kind}"' if kind else "") + (f' data-vendor="{vendor}"' if vendor else "")
    return f"<script{attrs}>\n{text.rstrip(chr(10))}\n</script>"


def options(folder):
    """The generator options recorded in generated.json."""
    return json.loads(read(folder, "generated.json"))["options"]


def page(folder):
    """The text of the visual's index.html."""
    folder = Path(folder)
    meta = json.loads(read(folder, "visual.json"))
    opts = options(folder)
    data = json.loads(read(folder, meta["data"]))
    dataset = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    blocks = [script("dataset", dataset, "application/json"), script("kit", kit.read(kit.KIT / "kit.js"))]
    if opts.get("three_d"):
        blocks.append(script("view3d", kit.read(kit.KIT / "view3d.js")))
    blocks += [script("beamdswitch", read(folder, "beamdswitch.js")), script("model", read(folder, "src/model.js")),
               script("report", read(folder, "report.js")), script("view", read(folder, "src/view.js"))]
    if opts.get("mathjax"):
        blocks.append(script("mathjax", kit.mathjax_bundle(), vendor=kit.MATHJAX))
    parts = {
        "TITLE": html.escape(meta["title"]),
        "DESCRIPTION": html.escape(meta["summary"]),
        "SLUG": folder.name,
        "SUBJECT": html.escape(opts["subject"]),
        "THEME_SCRIPT": kit.theme_script(),
        "STYLE_TOKENS": kit.read(kit.KIT / "style-tokens.css").rstrip("\n"),
        "KIT_CSS": kit.read(kit.KIT / "kit.css").rstrip("\n"),
        "STYLE": read(folder, "src/style.css").rstrip("\n"),
        "BODY": read(folder, "src/body.html").rstrip("\n"),
        "LICENCES": kit.licences_html() if opts.get("mathjax") else "",
        "SCRIPTS": "\n".join(blocks),
    }
    out = kit.read(kit.KIT / "shell.html")
    for name, value in parts.items():
        out = out.replace(f"@@{name}@@", value)
    return out.replace("\n\n</main>", "\n</main>")


def main(folder, argv=None):
    parser = argparse.ArgumentParser(description="Build index.html from src/, report.js, raw.json and the shared kit.")
    parser.add_argument("--verify", action="store_true", help="check index.html is current; write nothing")
    args = parser.parse_args(argv)
    folder = Path(folder)
    text = page(folder)
    target = folder / "index.html"
    if args.verify:
        if not target.is_file() or target.read_text(encoding="utf-8") != text:
            sys.exit(f"{folder.name}/index.html is not what build.py writes; run python3 build.py")
        print(f"{folder.name}/index.html is current")
        return
    target.write_text(text, encoding="utf-8")
    print(f"wrote {folder.name}/index.html ({len(text.encode('utf-8'))} bytes)")
