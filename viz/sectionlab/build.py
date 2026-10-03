"""Assemble index.html, the single-file Sectionlab page.

Inputs, all in this folder:
  template.html                    page markup and styles, with five markers
  raw.json                         presets, materials, method text (/*@DATA@*/)
  reference/torsion-accuracy.json  measured torsion accuracy (/*@ACCURACY@*/)
  src/*.js                         engine modules (handcalc.js included) in ENGINE order (/*@ENGINE@*/) and src/ui.js (/*@UI@*/)
  beamdswitch.js                   the standard beamdswitch report template (/*@BEAMDSWITCH@*/)

Output:
  index.html

    python build.py            write index.html
    python build.py --check    fail if index.html is out of date
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENGINE = ["geometry.js", "shapes.js", "section.js", "torsion.js", "plastic.js", "yaml.js", "report.js", "handcalc.js", "engine.js"]


def inline_json(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def script(name, folder="src"):
    text = (HERE / folder / name).read_text(encoding="utf-8")
    if "</script" in text.lower():
        raise SystemExit(f"{folder}/{name} must not contain </script")
    return text


def render():
    html = (HERE / "template.html").read_text(encoding="utf-8")
    parts = {
        "/*@DATA@*/": inline_json(HERE / "raw.json"),
        "/*@ACCURACY@*/": inline_json(HERE / "reference" / "torsion-accuracy.json"),
        "/*@ENGINE@*/": "\n".join(script(n) for n in ENGINE),
        "/*@BEAMDSWITCH@*/": script("beamdswitch.js", "."),
        "/*@UI@*/": script("ui.js"),
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
