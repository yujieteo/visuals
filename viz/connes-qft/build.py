"""Assemble index.html, the single-file Connes QFT laboratory.

Inputs, all in this folder:
  template.html     page markup and styles, with four markers
  raw.json          references, concept graph, presentation, commands and text (/*@DATA@*/)
  src/*.js          engine modules in ENGINE order (/*@ENGINE@*/)
  src/ui/*.js       page modules in UI order, wrapped in one function scope (/*@UI@*/)
  beamdswitch.js    the standard beamdswitch report template, unchanged (/*@BEAMDSWITCH@*/)

Output:
  index.html

    python build.py            write index.html
    python build.py --check    fail if index.html is out of date
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE = ["core.js", "linalg.js", "laurent.js", "tex.js", "qed.js", "graphs.js", "hopf.js", "spectral.js", "aqft.js", "report.js", "engine.js"]
UI = ["base.js", "draw.js", "scenes-fields.js", "scenes-loops.js", "scenes-ck.js", "scenes-ncg.js", "scenes-aqft.js", "scenes-synthesis.js", "app.js"]


def inline_json(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def script(path):
    text = path.read_text(encoding="utf-8")
    if "</script" in text.lower():
        raise SystemExit(f"{path.relative_to(HERE)} must not contain </script")
    return text


def render():
    html = (HERE / "template.html").read_text(encoding="utf-8")
    ui = "\n".join(f"/* ---------- src/ui/{name} ---------- */\n{script(HERE / 'src' / 'ui' / name)}" for name in UI)
    parts = {
        "/*@DATA@*/": inline_json(HERE / "raw.json"),
        "/*@ENGINE@*/": "\n".join(script(HERE / "src" / name) for name in ENGINE),
        "/*@BEAMDSWITCH@*/": script(HERE / "beamdswitch.js"),
        "/*@UI@*/": '(function () {\n"use strict";\n' + ui + "\n})();",
    }
    for marker, text in parts.items():
        if html.count(marker) != 1:
            raise SystemExit(f"template.html must contain {marker} exactly once")
        html = html.replace(marker, text)
    return html


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    html = render()
    out = HERE / "index.html"
    if "--check" in argv:
        if not out.exists() or out.read_text(encoding="utf-8") != html:
            print("index.html is out of date; run python build.py", file=sys.stderr)
            return 1
        return 0
    out.write_text(html, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
