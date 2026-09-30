"""Assemble index.html for the beam diagram creator.

Inputs, all checked in next to this file:
  raw.json       presets, materials, conventions, NASTRAN notes and sources (published as data)
  engine.js      the stiffness solver and NASTRAN exporter (also run by the tests)
  template.html  page markup, styles and UI code

Output:
  index.html     template with raw.json and engine.js inlined, so the page is one file

    python build.py
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    data = json.loads((HERE / "raw.json").read_text(encoding="utf-8"))
    dataset = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    engine = (HERE / "engine.js").read_text(encoding="utf-8")
    if "</script" in engine:
        raise SystemExit("engine.js must not contain </script")
    html = (HERE / "template.html").read_text(encoding="utf-8")
    for marker in ("/*@DATA@*/", "/*@ENGINE@*/"):
        if html.count(marker) != 1:
            raise SystemExit(f"template.html must contain {marker} exactly once")
    html = html.replace("/*@DATA@*/", dataset).replace("/*@ENGINE@*/", engine)
    (HERE / "index.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
