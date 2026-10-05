#!/usr/bin/env python3
"""Build index.html, the one self-contained page, from src/, raw.json, beamdswitch.js and the shared style tokens.

    python3 build.py            # write index.html
    python3 build.py --verify   # check index.html is current without writing it

The page is src/page.html with, in order: the site's theme script (scripts/style_guide.py), the style guide's
tokens (scripts/kit/style-tokens.css) then src/style.css, src/body.html, raw.json as
<script id="dataset" type="application/json">, and beamdswitch.js, src/model.js, src/formats.js and src/view.js,
each unchanged in a <script id> of its own. Everything is inlined, so the page requests nothing; the same sources
always give the same bytes.
"""
import argparse
import html
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from style_guide import THEME_SCRIPT  # noqa: E402


def read(path):
    return Path(path).read_text(encoding="utf-8")


def script(block_id, text, kind=None):
    """One inline <script> block. A script's text may not close the element early."""
    if "</script" in text.lower():
        raise SystemExit(f"{block_id}: the text holds </script, which would end the inline block early")
    attrs = f' id="{block_id}"' + (f' type="{kind}"' if kind else "")
    return f"<script{attrs}>\n{text.rstrip(chr(10))}\n</script>"


def page():
    """The text of index.html."""
    meta = json.loads(read(HERE / "visual.json"))
    data = json.loads(read(HERE / meta["data"]))
    dataset = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    blocks = [
        script("dataset", dataset, "application/json"),
        script("beamdswitch", read(HERE / "beamdswitch.js")),
        script("model", read(HERE / "src" / "model.js")),
        script("formats", read(HERE / "src" / "formats.js")),
        script("view", read(HERE / "src" / "view.js")),
    ]
    parts = {
        "TITLE": html.escape(meta["title"]),
        "DESCRIPTION": html.escape(meta["summary"]),
        "SLUG": HERE.name,
        "THEME_SCRIPT": THEME_SCRIPT,
        "STYLE_TOKENS": read(SCRIPTS / "kit" / "style-tokens.css").rstrip("\n"),
        "STYLE": read(HERE / "src" / "style.css").rstrip("\n"),
        "BODY": read(HERE / "src" / "body.html").rstrip("\n"),
        "SCRIPTS": "\n".join(blocks),
    }
    out = read(HERE / "src" / "page.html")
    for name, value in parts.items():
        out = out.replace(f"@@{name}@@", value)
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build index.html from src/, raw.json, beamdswitch.js and the style tokens.")
    parser.add_argument("--verify", action="store_true", help="check index.html is current; write nothing")
    args = parser.parse_args(argv)
    text = page()
    target = HERE / "index.html"
    if args.verify:
        if not target.is_file() or target.read_text(encoding="utf-8") != text:
            sys.exit(f"{HERE.name}/index.html is not what build.py writes; run python3 build.py")
        print(f"{HERE.name}/index.html is current")
        return
    target.write_text(text, encoding="utf-8")
    print(f"wrote {HERE.name}/index.html ({len(text.encode('utf-8'))} bytes)")


if __name__ == "__main__":
    main()
