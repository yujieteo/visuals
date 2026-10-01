#!/usr/bin/env python3
"""Count how often each TOTO ball was drawn and embed the result in index.html.

Inputs, checked in next to this file:
  draws.csv       one row per draw from Singapore Pools (written by fetch.py)
  beamdswitch.js  the site's standard beamdswitch report template, unchanged
  report.js       the page's numbers as a beamdswitch report

Outputs:
  raw.json    the dataset (published as data.json)
  index.html  its <script id="dataset">, <script id="beamdswitch"> and <script id="report"> blocks are rewritten in place

    python build.py            # regenerate raw.json and index.html
    python build.py --verify   # check both are fresh without writing
"""
import argparse
import csv
import json
import re
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
BALLS = range(1, 50)
PICKS = 6
LIST_URL = "https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output/toto_result_draw_list_en.html"
RESULTS_PAGE = "https://www.singaporepools.com.sg/en/product/sr/Pages/toto_results.aspx"
WINDOWS = [("3m", "3 months", 3), ("6m", "6 months", 6), ("1y", "1 year", 12)]
# "More than 3, 5 or 10 wins" from the request, as four bands of a ball's count.
BANDS = [
    {"id": "b0", "label": "3 or fewer", "min": 0, "max": 3},
    {"id": "b1", "label": "More than 3", "min": 4, "max": 5},
    {"id": "b2", "label": "More than 5", "min": 6, "max": 10},
    {"id": "b3", "label": "More than 10", "min": 11, "max": None},
]
METHOD = [
    "Each row is one TOTO draw as Singapore Pools publishes it: the draw list names every draw and its date, and each draw's own results page gives the six winning numbers and the additional number. fetch.py read those pages on the retrieval date; no draw was typed by hand.",
    "A window counts back from the latest draw in the data: 3 months, 6 months or 1 year means every draw dated after the same calendar day that many months earlier, up to and including the latest draw.",
    "A ball's count is the number of draws in the window whose six winning numbers include it. The additional number is drawn after them and is excluded from that count.",
    "Colour bands follow the counts asked for: 3 or fewer, more than 3 (4 or 5), more than 5 (6 to 10) and more than 10 (11 or more).",
    "The average is what every ball would get if the six winning numbers were spread evenly: 6 × draws ÷ 49. It is a reference line, not a prediction.",
]
RANDOM_NOTE = (
    "Every TOTO draw is a fresh random draw of 6 balls from 49, whatever happened before. "
    "Past counts do not predict future draws. Here “best balls” only means the balls drawn most often in the window you pick."
)


def fail(message):
    sys.exit(f"build.py: {message}")


def months_before(day, months):
    year, month = divmod(day.year * 12 + day.month - 1 - months, 12)
    month += 1
    for d in (day.day, 30, 29, 28):
        try:
            return date(year, month, d)
        except ValueError:
            continue
    fail(f"cannot step {months} months back from {day}")


def read_draws():
    with open(HERE / "draws.csv", newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    draws = []
    for row in rows:
        winning = [int(row[f"n{i}"]) for i in range(1, 7)]
        additional = int(row["additional"])
        if len(set(winning + [additional])) != 7 or not all(n in BALLS for n in winning + [additional]):
            fail(f"draw {row['draw_no']}: bad numbers")
        if not row["source_url"].startswith(RESULTS_PAGE):
            fail(f"draw {row['draw_no']}: source is not a Singapore Pools results page")
        draws.append({
            "draw_no": int(row["draw_no"]),
            "date": row["date"],
            "winning": winning,
            "additional": additional,
            "source_url": row["source_url"],
            "retrieved": row["retrieved"],
        })
    draws.sort(key=lambda d: d["draw_no"], reverse=True)
    numbers = [d["draw_no"] for d in draws]
    if numbers != list(range(numbers[0], numbers[0] - len(numbers), -1)):
        fail("draw numbers have a gap; run fetch.py again")
    if [d["date"] for d in draws] != sorted((d["date"] for d in draws), reverse=True):
        fail("draw dates are out of order")
    return draws


def band_of(count):
    return next(b["id"] for b in BANDS if count >= b["min"] and (b["max"] is None or count <= b["max"]))


def build():
    draws = read_draws()
    latest = date.fromisoformat(draws[0]["date"])
    windows = []
    for wid, label, months in WINDOWS:
        after = months_before(latest, months)
        inside = [d for d in draws if date.fromisoformat(d["date"]) > after]
        if date.fromisoformat(draws[-1]["date"]) > after:
            fail(f"draws.csv does not reach back {label}; run fetch.py again")
        windows.append({
            "id": wid,
            "label": label,
            "after": after.isoformat(),
            "first_draw": {"draw_no": inside[-1]["draw_no"], "date": inside[-1]["date"]},
            "draws": len(inside),
            "average_per_ball": round(PICKS * len(inside) / len(BALLS), 2),
        })
    longest = windows[-1]["after"]
    kept = [d for d in draws if d["date"] > longest]

    balls = []
    for n in BALLS:
        ball = {"number": n, "counts": {}, "bands": {}, "last_drawn": None}
        for w in windows:
            inside = [d for d in kept if d["date"] > w["after"]]
            count = sum(n in d["winning"] for d in inside)
            ball["counts"][w["id"]] = count
            ball["bands"][w["id"]] = band_of(count)
        hit = next((d for d in kept if n in d["winning"]), None)
        if hit:
            ball["last_drawn"] = {"draw_no": hit["draw_no"], "date": hit["date"]}
        balls.append(ball)
    for w in windows:
        total = sum(b["counts"][w["id"]] for b in balls)
        if total != PICKS * w["draws"]:
            fail(f"{w['id']}: counts add to {total}, expected {PICKS * w['draws']}")

    retrieved = max(d["retrieved"] for d in kept)
    return {
        "title": "TOTO ball frequency",
        "as_of": retrieved,
        "latest_draw": {"draw_no": draws[0]["draw_no"], "date": draws[0]["date"]},
        "random_note": RANDOM_NOTE,
        "method": METHOD,
        "bands": BANDS,
        "windows": windows,
        "balls": balls,
        "draws": kept,
        "sources": [
            {"id": "draw-list", "publisher": "Singapore Pools", "title": "TOTO results: list of draws", "url": LIST_URL, "retrieved": retrieved},
            {"id": "draw-pages", "publisher": "Singapore Pools", "title": f"TOTO results pages, one per draw ({len(kept)} draws, linked in the draw table)", "url": RESULTS_PAGE, "retrieved": retrieved},
        ],
    }


def render(dataset):
    raw = json.dumps(dataset, ensure_ascii=False, indent=1) + "\n"
    page = (HERE / "index.html").read_text(encoding="utf-8")
    block = json.dumps(dataset, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    page, found = re.subn(
        r'(<script id="dataset" type="application/json">).*?(</script>)',
        lambda m: m.group(1) + block + m.group(2), page, count=1, flags=re.S,
    )
    if not found:
        fail('index.html has no <script id="dataset" type="application/json"> block')
    for block_id, name in (("beamdswitch", "beamdswitch.js"), ("report", "report.js")):
        script = (HERE / name).read_text(encoding="utf-8")
        if "</script" in script:
            fail(f"{name} must not contain </script")
        page, found = re.subn(
            rf'(<script id="{block_id}">).*?(</script>)',
            lambda m: m.group(1) + "\n" + script + m.group(2), page, count=1, flags=re.S,
        )
        if not found:
            fail(f'index.html has no <script id="{block_id}"> block')
    return raw, page


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--verify", action="store_true", help="check raw.json and index.html are fresh")
    args = parser.parse_args()
    raw, page = render(build())
    targets = {HERE / "raw.json": raw, HERE / "index.html": page}
    if args.verify:
        stale = [p.name for p, text in targets.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            fail(f"stale: {', '.join(stale)}; run python build.py")
        print("raw.json and index.html are fresh")
        return
    for path, text in targets.items():
        path.write_text(text, encoding="utf-8")
    print("wrote raw.json and index.html")


if __name__ == "__main__":
    main()
