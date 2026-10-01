#!/usr/bin/env python3
"""Download TOTO draw results from Singapore Pools into draws.csv.

Singapore Pools publishes the list of every draw at LIST_URL and one results
page per draw at RESULT_URL. This script reads the list, keeps the draws dated
within the last year (plus a month of margin) of the latest draw, reads each
draw's own page and writes one row per draw:

  draw_no, date, n1..n6 (winning numbers, ascending), additional, source_url,
  retrieved (the date this script read the draw's page)

Draws the list marks as cancelled are skipped. Rows already in draws.csv are
kept as they are, so re-running only fetches draws that are new.

    python fetch.py
"""
import csv
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIST_URL = "https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output/toto_result_draw_list_en.html"
RESULT_URL = "https://www.singaporepools.com.sg/en/product/sr/Pages/toto_results.aspx?{query}"
KEEP_DAYS = 366 + 31
FIELDS = ["draw_no", "date", "n1", "n2", "n3", "n4", "n5", "n6", "additional", "source_url", "retrieved"]
OPTION = re.compile(
    r"<option queryString='(?P<query>[^']*)' value='(?P<no>\d+)'[^>]*isCancelled='(?P<cancelled>[^']*)'>(?P<date>[^<]+)<"
)


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (research; yujieteo/site)"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def parse_draw(page, draw_no, day):
    single = page[page.find("divSingleResult"):]
    if f"Draw No. {draw_no}<" not in single or day.strftime("%d %b %Y") not in single[:2000]:
        sys.exit(f"draw {draw_no}: page does not show that draw")
    winning = [int(re.search(rf"class='win{i}'>(\d+)<", single).group(1)) for i in range(1, 7)]
    additional = int(re.search(r"class='additional'>(\d+)<", single).group(1))
    numbers = winning + [additional]
    if sorted(winning) != winning or len(set(numbers)) != 7 or not all(1 <= n <= 49 for n in numbers):
        sys.exit(f"draw {draw_no}: unexpected numbers {numbers}")
    return winning, additional


def main():
    path = HERE / "draws.csv"
    have = {}
    if path.exists():
        with path.open(newline="", encoding="utf-8") as f:
            have = {row["draw_no"]: row for row in csv.DictReader(f)}
    options = [m.groupdict() for m in OPTION.finditer(get(LIST_URL))]
    if not options:
        sys.exit("draw list is empty or its format changed")
    for o in options:
        o["day"] = datetime.strptime(o["date"].strip(), "%a, %d %b %Y").date()
    latest = max(o["day"] for o in options)
    rows = dict(have)
    for o in options:
        if o["cancelled"] or o["day"] < latest - timedelta(days=KEEP_DAYS) or o["no"] in have:
            continue
        url = RESULT_URL.format(query=o["query"])
        winning, additional = parse_draw(get(url), o["no"], o["day"])
        rows[o["no"]] = dict(zip(FIELDS, [o["no"], o["day"].isoformat(), *winning, additional, url, date.today().isoformat()]))
        print(f"draw {o['no']} {o['day']}: {winning} + {additional}")
        time.sleep(0.5)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        for key in sorted(rows, key=int, reverse=True):
            writer.writerow(rows[key])
    print(f"draws.csv: {len(rows)} draws, latest {latest}, retrieved {date.today()}")


if __name__ == "__main__":
    main()
