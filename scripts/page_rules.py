#!/usr/bin/env python3
"""Print the static rules page-axi reports beside its browser checks, as one JSON object on stdout.

For one page's folder: "contrast" is scripts/rules.py's contrast problems with visual.json "allow" applied,
the same list scripts/check.py's contrast step fails on, and "tools" is check.py's WebMCP tools problems
(null when the page registers no tool literally). e2e/bin/page-axi.js runs it, so the agent's page check and
CI share one rule set.

Usage: scripts/page_rules.py FOLDER [ENTRY]

ENTRY is the page's file name in FOLDER (default index.html). Exit 2 when FOLDER holds no such page.
"""
import json
import sys
from pathlib import Path

import rules
from check import tools_problems
from visuals import metadata


def page_rules(folder, entry="index.html"):
    """The contrast and tools problems of the page ``folder``/``entry``, as a dict."""
    html = (folder / entry).read_text(encoding="utf-8")
    data = metadata(folder) or {}
    left, stale = rules.allowed(rules.contrast_problems(html), data.get("allow", {}).get("contrast"))
    contrast = left + [f'visual.json allow.contrast lists "{item}", which no longer occurs; remove it' for item in stale]
    tools = tools_problems(folder, data) if data and entry == "index.html" else None
    return {"contrast": contrast, "tools": tools}


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if not 1 <= len(args) <= 2:
        print(__doc__.split("\n\n")[2], file=sys.stderr)
        sys.exit(2)
    folder = Path(args[0])
    entry = args[1] if len(args) == 2 else "index.html"
    if not (folder / entry).is_file():
        print(f"no page {entry} in {folder}", file=sys.stderr)
        sys.exit(2)
    print(json.dumps(page_rules(folder, entry)))


if __name__ == "__main__":
    main()
