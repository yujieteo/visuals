"""Assemble index.html for the fastener edge margin and pitch visualiser.

Inputs, all checked in next to this file:
  raw.json       checks, assumptions, scope, sources and the placeholder example (published as data)
  engine.js      the pure calculation core and the joint's beamdswitch report (also run by the tests)
  beamdswitch.js the standard beamdswitch report template (a copy of templates/beamdswitch.js)
  template.html  page markup, styles and UI code

Output:
  index.html     template with raw.json, engine.js and beamdswitch.js inlined, so the page is one file

    python build.py
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    data = json.loads((HERE / "raw.json").read_text(encoding="utf-8"))
    dataset = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    scripts = {}
    for marker, name in (("/*@ENGINE@*/", "engine.js"), ("/*@BEAMDSWITCH@*/", "beamdswitch.js")):
        scripts[marker] = (HERE / name).read_text(encoding="utf-8")
        if "</script" in scripts[marker]:
            raise SystemExit(f"{name} must not contain </script")
    html = (HERE / "template.html").read_text(encoding="utf-8")
    for marker in ("/*@DATA@*/", *scripts):
        if html.count(marker) != 1:
            raise SystemExit(f"template.html must contain {marker} exactly once")
    html = html.replace("/*@DATA@*/", dataset)
    for marker, script in scripts.items():
        html = html.replace(marker, script)
    (HERE / "index.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
