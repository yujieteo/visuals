#!/usr/bin/env python3
"""Refresh draws.csv with the TOTO draw results Singapore Pools publishes.

Singapore Pools publishes the list of every draw at LIST_URL and one results page per draw at RESULT_URL.
A refresh reads the list, keeps the draws dated within the last year (plus a month of margin) of the latest
draw and reads the page of each draw draws.csv does not have yet, writing one row per draw:

  draw_no, date, n1..n6 (winning numbers, ascending), additional, source_url,
  retrieved (the date the refresh read the draw's page)

Draws the list marks as cancelled are skipped. Rows already in draws.csv are kept as they are.

Run python3 refresh.py [--dry-run], or python3 ../../scripts/refresh.py toto-frequency [--dry-run].
It writes draws.csv and visual.json's "fetched", then build.py writes raw.json and index.html.
"""
import csv
import io
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "scripts"))
import refresh_kit  # noqa: E402
from refresh_kit import require  # noqa: E402

LIST_URL = "https://www.singaporepools.com.sg/DataFileArchive/Lottery/Output/toto_result_draw_list_en.html"
RESULT_URL = "https://www.singaporepools.com.sg/en/product/sr/Pages/toto_results.aspx?{query}"
USER_AGENT = "Mozilla/5.0 (research; yujieteo/site)"
KEEP_DAYS = 366 + 31
PAUSE = 0.5  # seconds between draw pages
FIELDS = ["draw_no", "date", "n1", "n2", "n3", "n4", "n5", "n6", "additional", "source_url", "retrieved"]
OPTION = re.compile(
    r"<option queryString='(?P<query>[^']*)' value='(?P<no>\d+)'[^>]*isCancelled='(?P<cancelled>[^']*)'>(?P<date>[^<]+)<"
)


def draw_list(page):
    """The draws the list names, each with its query, number, date and whether it was cancelled; Failed when none."""
    options = [match.groupdict() for match in OPTION.finditer(page)]
    require(options, f"{LIST_URL}: the draw list is empty or its format changed")
    for option in options:
        try:
            option["day"] = datetime.strptime(option["date"].strip(), "%a, %d %b %Y").date()
        except ValueError as error:
            raise refresh_kit.Failed(f"{LIST_URL}: draw {option['no']} has date {option['date']!r}") from error
    return options


def parse_draw(page, draw_no, day):
    """The six winning numbers, ascending, and the additional number from a draw's results page; Failed when it is not that draw."""
    single = page[page.find("divSingleResult"):]
    require(f"Draw No. {draw_no}<" in single and day.strftime("%d %b %Y") in single[:2000], f"draw {draw_no}: the page does not show that draw")
    found = [re.search(rf"class='win{i}'>(\d+)<", single) for i in range(1, 7)] + [re.search(r"class='additional'>(\d+)<", single)]
    require(all(found), f"draw {draw_no}: the page has no six winning numbers and an additional number")
    numbers = [int(match.group(1)) for match in found]
    winning, additional = numbers[:6], numbers[6]
    require(sorted(winning) == winning and len(set(numbers)) == 7 and all(1 <= n <= 49 for n in numbers), f"draw {draw_no}: unexpected numbers {numbers}")
    return winning, additional


def csv_text(rows):
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    for key in sorted(rows, key=int, reverse=True):
        writer.writerow(rows[key])
    return out.getvalue()


def refresh(source, folder, args):
    text = refresh_kit.read(folder, "draws.csv")
    have = {row["draw_no"]: row for row in csv.DictReader(io.StringIO(text))} if text else {}
    options = draw_list(source.text(LIST_URL, headers={"User-Agent": USER_AGENT}))
    latest = max(option["day"] for option in options)
    rows, changes, today = dict(have), [], refresh_kit.today(source)
    for option in options:
        if option["cancelled"] or option["day"] < latest - timedelta(days=KEEP_DAYS) or option["no"] in have:
            continue
        if len(rows) > len(have):
            source.wait(PAUSE)
        page_url = RESULT_URL.format(query=option["query"])
        winning, additional = parse_draw(source.text(page_url, headers={"User-Agent": USER_AGENT}), option["no"], option["day"])
        rows[option["no"]] = dict(zip(FIELDS, [option["no"], option["day"].isoformat(), *winning, additional, page_url, today]))
        changes.append({"kind": "added", "item": f"draw {option['no']}", "detail": f"{option['day']}: {' '.join(map(str, winning))} + {additional}"})
    notes = ["build.py recounts every window from draws.csv: read the page's diff."] if changes else []
    return refresh_kit.Update(files={"draws.csv": csv_text(rows)}, fetched=today, changes=changes, notes=notes, source=LIST_URL)


if __name__ == "__main__":
    sys.exit(refresh_kit.main(slug=HERE.name))
