"""Assemble index.html for the Generating Functions Lab.

Inputs, all checked in next to this file:
  raw.json        metadata: levels, problems, conventions and spec corrections (published as data.json)
  engine.js       the pure mathematical core (exact series, rationals, cyclotomic DFT, enumerators)
  lessons.js      the curriculum, problem ladder, verification engine and beamdswitch reports
  beamdswitch.js  the site's standard beamdswitch report template (Markdown deck writer)
  ui.js           the page: views, visuals, palette, presentation, export and WebMCP tools
  template.html   markup, styles and the no-JavaScript fallback

Output:
  index.html      template with every input inlined, so the page is one file

    python build.py
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = (
    ("/*@ENGINE@*/", "engine.js"),
    ("/*@LESSONS@*/", "lessons.js"),
    ("/*@BEAMDSWITCH@*/", "beamdswitch.js"),
    ("/*@UI@*/", "ui.js"),
)


def main():
    data = json.loads((HERE / "raw.json").read_text(encoding="utf-8"))
    dataset = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = (HERE / "template.html").read_text(encoding="utf-8")
    for marker in ("/*@DATA@*/", *(m for m, _ in SCRIPTS)):
        if html.count(marker) != 1:
            raise SystemExit(f"template.html must contain {marker} exactly once")
    html = html.replace("/*@DATA@*/", dataset)
    for marker, name in SCRIPTS:
        script = (HERE / name).read_text(encoding="utf-8")
        if "</script" in script:
            raise SystemExit(f"{name} must not contain </script")
        html = html.replace(marker, script.rstrip("\n"))
    (HERE / "index.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
