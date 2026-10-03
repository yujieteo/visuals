#!/usr/bin/env python3
"""Inline data.json into index.html: the page's events data block and its no-JavaScript list of classes.

Only those two regions of index.html are generated; the rest of the page is edited by hand. Running it twice
leaves no diff. --verify checks that index.html already holds data.json and writes nothing.

Usage: python3 build.py [--verify]
"""
import json
import re
import sys
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA_BLOCK = re.compile(r'(<script id="events-data" type="application/json">)(.*?)(</script>)', re.S)
NOSCRIPT = re.compile(r"(<!-- noscript-list:start -->)(.*?)(<!-- noscript-list:end -->)", re.S)


def data_text(data):
    """data.json as one line of JSON that cannot end its <script> element early."""
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def noscript_list(data):
    """Every class in the snapshot as a static list, with its booking link, for a browser without JavaScript."""
    labels = {category["id"]: category["label"] for category in data["categories"]}
    items = []
    for event in data["events"]:
        when = " ".join(part for part in (event.get("date_label"), event.get("time_label")) if part)
        book = f' <a href="{escape(event["booking_url"])}">Book on NLB</a>' if event.get("booking_url") else ""
        items.append(f"<li><strong>{escape(event['title'])}</strong> ({escape(labels.get(event['category'], event['category']))}), "
                     f"{escape(when)}.{book}</li>")
    return "\n<ul>\n" + "\n".join(items) + "\n</ul>\n"


def render(page, data):
    """index.html with its two generated regions rewritten from data."""
    for pattern, text in ((DATA_BLOCK, data_text(data)), (NOSCRIPT, noscript_list(data))):
        if len(pattern.findall(page)) != 1:
            raise SystemExit(f"index.html must hold exactly one {pattern.pattern[:40]}... region")
        page = pattern.sub(lambda match: match.group(1) + text + match.group(3), page)
    return page


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    data = json.loads((HERE / "data.json").read_text(encoding="utf-8"))
    path = HERE / "index.html"
    page = path.read_text(encoding="utf-8")
    built = render(page, data)
    if "--verify" in argv:
        if built != page:
            sys.exit("index.html does not hold data.json: run python3 build.py")
        print("index.html holds data.json")
        return
    if built != page:
        path.write_text(built, encoding="utf-8")
    print(f"index.html: {len(data['events'])} classes inlined")


if __name__ == "__main__":
    main()
