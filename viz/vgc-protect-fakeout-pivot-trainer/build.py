"""Assemble index.html for the Justin Tang turn lab.

Inputs, all checked in next to this file:
  raw.json       team sheets, species, moves, positions, sources (published as data)
  sprites.json   16x16 pixel sprites drawn for this page, one per species
  engine.js      the turn engine and matrix-game solver (also run by the Node test)
  template.html  page markup, styles and UI code

Output:
  index.html     template with the dataset (raw.json + sprites) and engine inlined

    python build.py
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    data = json.loads((HERE / "raw.json").read_text(encoding="utf-8"))
    data["sprites"] = json.loads((HERE / "sprites.json").read_text(encoding="utf-8"))
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
