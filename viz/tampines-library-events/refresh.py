#!/usr/bin/env python3
"""Regenerate data.json: the hands-on classes NLB lists at Tampines Regional Library, then rebuild the page.

1. POST the National Library Board's public events search, /main/api/Event/EventFilter (the JSON the
   nlb.gov.sg "What's On" events page reads), for branch TRL (NLB's "Tampines Library", Tampines Regional
   Library at Our Tampines Hub), paging until every listed event is in.
2. Keep cooking, maker-lab and other hands-on classes (categorise() says how) and list the rest as
   excluded by title only.
3. For each kept event, read its published GoLibrary page (the listing's own link, nlb.libcal.com) for the
   registration notice and seats, waiting the 10 s that site's robots.txt asks between requests.
4. Write data.json and run build.py, which inlines it into index.html.

Nothing is invented: a field the source does not publish is left out, and every booking link is the
listing's own "link" value, never a constructed URL. Public pages only, no login, one request at a time.

Usage: python3 refresh.py [--offline LISTING.json] [--no-pages] [--now ISO8601]
"""
import argparse
import html
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SGT = timezone(timedelta(hours=8))
LISTING_URL = "https://www.nlb.gov.sg/main/whats-on/events"
API_URL = "https://www.nlb.gov.sg/main/api/Event/EventFilter"
BRANCH = "TRL"
PAGE_SIZE = 50
API_DELAY = 3  # seconds between listing pages
PAGE_DELAY = 10  # nlb.libcal.com robots.txt: Crawl-delay 10
USER_AGENT = "tampines-library-events-refresh/1 (+https://teoyujie.org/visuals/tampines-library-events/)"
BOOKING_HOSTS = ("nlb.libcal.com", "www.nlb.gov.sg", "go.gov.sg")

HANDS_ON_TYPES = {"Workshop", "Experience"}
MAKER = re.compile(r"\b(makeit|makers?|makerspace|3d|laser|sewing|discovertech|robot\w*|electronics?|circuits?|boson|micro:?bit|soldering|tinker\w*|coding|makedo|arduino)\b", re.I)
COOK_TITLE = re.compile(r"\b(cook\w*|culinary|chefs?|bak(?:e|es|ing)|recipes?|kitchen)\b", re.I)
COOK_TEXT = re.compile(r"\b(cooking|cook-along|baking|recipes?|meal demonstrations?|food demonstrations?|culinary (?:class|workshop|demonstration)s?)\b", re.I)
CRAFT_TITLE = re.compile(r"\b(hands-on|craft\w*|diy|calligraphy|painting|drawing|pottery|origami|gardening|cyanotype)\b", re.I)
CATEGORIES = [
    {"id": "cooking", "label": "Cooking & food",
     "rule": "A workshop whose title names cooking, baking, recipes or a kitchen, or whose description describes cooking, baking, recipes or a meal or food demonstration."},
    {"id": "maker", "label": "Maker lab",
     "rule": "A workshop whose title names MakeIT, makers, 3D printing, laser cutting, sewing, electronics, robotics, coding or DiscoverTech."},
    {"id": "hands-on", "label": "Other hands-on",
     "rule": "Any other workshop in NLB's Art & Creativity subject, or whose title names a craft such as calligraphy or cyanotype."},
]
# Where the useful part of an NLB description ends: the logistics and biography sections that follow it.
DESCRIPTION_STOPS = re.compile(r"^\s*(registration and attendance|photography and videography|about the (?:facilitator|speaker|trainer|instructor)|speaker'?s profile|please note|disclaimer|terms and conditions)\b", re.I | re.M)
AGE = re.compile(r"[^.\n]*\b(?:suitable for|age requirement|aged|years old)\b[^.\n]*\.?", re.I)
# What makes such a sentence about age rather than, say, experience ("suitable for beginners").
AGE_CUE = re.compile(r"\d|\b(?:seniors?|children|kids|teens?|teenagers|adults?|families|parents|toddlers|preschoolers|youths?)\b", re.I)


def plain(markup):
    """NLB's description HTML as plain text, one paragraph or list item per line."""
    text = re.sub(r"<br\s*/?>|</p>|</li>|</div>|</h\d>", "\n", markup or "", flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", "", text)).replace("\xa0", " ")
    lines = (re.sub(r"[ \t\r\f\v]+", " ", line).strip() for line in text.split("\n"))
    return "\n".join(line for line in lines if line)


def short_description(text, limit=420):
    """The opening of the description, without its "About the Event" heading or logistics, at a sentence end."""
    body = DESCRIPTION_STOPS.split(text, maxsplit=1)[0]
    lines = [line for line in body.split("\n") if not re.fullmatch(r"about the (?:event|programme|program|workshop)", line, re.I)]
    out = ""
    for line in lines:
        out = f"{out} {line}".strip()
        if len(out) >= 200:
            break
    if len(out) <= limit:
        return out
    cut = out[:limit]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[:end + 1] if end > 120 else cut.rsplit(" ", 1)[0] + "…"


def age_note(text):
    """The description's own sentence on who the programme suits, such as "suitable for participants aged 13 and above"."""
    return next((match.group(0).strip() for match in AGE.finditer(text) if AGE_CUE.search(match.group(0))), None)


def names(items):
    return [item["name"] for item in items or [] if item.get("name")]


def categorise(raw, text):
    """(category id, the words that decided it) for a hands-on class, or (None, reason) for anything else."""
    kind = (raw.get("nlbEventType") or {}).get("name")
    if kind not in HANDS_ON_TYPES:
        return None, f"event type {kind or 'unknown'}"
    if raw.get("isOnline"):
        return None, "online"
    title = raw.get("title", "")
    if (found := MAKER.findall(title)):
        return "maker", ", ".join(dict.fromkeys(found))
    if (found := COOK_TITLE.findall(title) or COOK_TEXT.findall(text)):
        return "cooking", ", ".join(dict.fromkeys(found))
    if "Art & Creativity" in names(raw.get("nlbSubjects")):
        return "hands-on", "Art & Creativity"
    if (found := CRAFT_TITLE.findall(title)):
        return "hands-on", ", ".join(dict.fromkeys(found))
    return None, "not a cooking, maker or craft class"


def local(value):
    """NLB's SGT wall-clock time, "2026-10-04T15:00:00", as an aware datetime."""
    return datetime.fromisoformat(value).replace(tzinfo=SGT) if value else None


def event(raw, category, matched):
    """One kept event in data.json's shape; fields the listing leaves empty are left out."""
    text = plain(raw.get("description"))
    dates = raw.get("eventDate") or {}
    start, end = local(dates.get("startDateTime")), local(dates.get("endDateTime"))
    out = {
        "id": str(raw["eventId"]),
        "title": raw["title"].strip(),
        "category": category,
        "matched": matched,
        "start": start.isoformat() if start else None,
        "end": end.isoformat() if end else None,
        "duration_minutes": int((end - start).total_seconds() // 60) if start and end else None,
        "date_label": raw.get("stringEventStartDate"),
        "end_date_label": raw.get("stringEventEndDate") if raw.get("stringEventEndDate") != raw.get("stringEventStartDate") else None,
        "time_label": raw.get("stringEventTimeRange"),
        "event_type": (raw.get("nlbEventType") or {}).get("name"),
        "subjects": names(raw.get("nlbSubjects")),
        "audiences": names(raw.get("nlbTargetAudiences")),
        "age_note": age_note(text),
        "free": raw.get("isFree") if isinstance(raw.get("isFree"), bool) else None,
        "language": (raw.get("nlbLanguage") or {}).get("name") if isinstance(raw.get("nlbLanguage"), dict) else None,
        "venue": (raw.get("location") or {}).get("venue"),
        "description": short_description(text),
        "booking_url": raw.get("link"),
    }
    return {key: value for key, value in out.items() if value not in (None, "", [])}


def registration(page):
    """The registration notice a GoLibrary (LibCal) event page publishes, as {status, note, seats_left}."""
    found = {}
    match = (re.search(r'<p class="s-lc-event-registration-required">(.*?)</p>', page, re.S)
             or re.search(r'id="s-lc-event-reg[\w-]*"[^>]*>\s*<div[^>]*\bs-lc-event-txt\b[^>]*>(.*?)</div>', page, re.S)
             or re.search(r'<div class="alert alert-info">\s*(Registrations?\b[^<]*)</div>', page))
    note = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", match.group(1)))).strip() if match else ""
    note = re.split(r"\s*Before registering\b", note)[0].strip()
    ld = re.search(r'<script type="application/ld\+json">(.*?)</script>', page, re.S)
    status = json.loads(ld.group(1)).get("eventStatus", "") if ld else ""
    if status.endswith(("EventCancelled", "EventPostponed")):
        found["status"] = "cancelled" if status.endswith("Cancelled") else "postponed"
    elif re.search(r"no seats available but a waiting list", note, re.I):
        found["status"] = "waitlist"
    elif re.search(r"no seats available|fully booked|is full", note, re.I):
        found["status"] = "full"
    elif (seats := re.search(r"\b(\d+) seats? (?:available|left|remaining)", note, re.I)):
        found["status"], found["seats_left"] = "open", int(seats.group(1))
    elif re.search(r"registration (?:has |is )?closed|registration period has ended", note, re.I):
        found["status"] = "closed"
    elif re.search(r"registrations? (?:opens?|will open)\b|registration is not (?:yet )?open|not yet open", note, re.I):
        found["status"] = "not-open"
    elif re.search(r"registration is required", note, re.I):
        found["status"] = "open"
    elif re.search(r"walk[- ]in|no registration", note, re.I):
        found["status"] = "walk-in"
    if note:
        found["note"] = note
    return found


def request(url, body=None):
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json" if body else "text/html"}
    if body is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(body).encode()
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=60) as response:
        return response.read().decode("utf-8")


def query(offset):
    return {"offset": offset, "pageSize": PAGE_SIZE, "ascending": True, "isOnline": False,
            "filter": {"SearchString": "", "FromDate": "", "ToDate": "", "Persona": "", "Language": [], "EventType": [],
                       "EventSubject": [], "Location": [BRANCH], "EducationLevel": []}}


def fetch_listing():
    """Every event the search lists for the branch, in its order, without duplicates."""
    seen, out, offset = set(), [], 0
    while True:
        page = json.loads(request(API_URL, query(offset)))
        results = page.get("Results") or []
        for raw in results:
            if raw["eventId"] not in seen and raw.get("branchCode") == BRANCH:
                seen.add(raw["eventId"])
                out.append(raw)
        offset += len(results)
        if not results or not page.get("hasNextPage") or offset >= (page.get("Total") or 0):
            return out
        time.sleep(API_DELAY)


def build(listing, pages, now):
    """data.json's content from the raw listing and {event id: registration} read from the event pages."""
    kept, excluded = [], []
    for raw in listing:
        category, why = categorise(raw, plain(raw.get("description")))
        if category:
            item = event(raw, category, why)
            if item.get("booking_url") and not booking_ok(item["booking_url"]):
                del item["booking_url"]
            if pages.get(item["id"]):
                item["registration"] = pages[item["id"]]
            kept.append(item)
        else:
            dates = raw.get("eventDate") or {}
            excluded.append({"id": str(raw["eventId"]), "title": raw["title"].strip(),
                             "event_type": (raw.get("nlbEventType") or {}).get("name"),
                             "start": local(dates.get("startDateTime")).isoformat() if dates.get("startDateTime") else None,
                             "reason": why})
    kept.sort(key=lambda item: (item.get("start") or "", item["id"]))
    excluded.sort(key=lambda item: (item.get("start") or "", item["id"]))
    return {
        "schema_version": 1,
        "library": {"name": "Tampines Regional Library", "nlb_name": "Tampines Library", "branch_code": BRANCH,
                    "address": next((raw["location"]["address"] for raw in listing if (raw.get("location") or {}).get("address")), None)},
        "retrieved": now.isoformat(timespec="seconds"),
        "source": {"listing_url": LISTING_URL, "api_url": API_URL, "api_query": query(0),
                   "registration": "Each kept event's GoLibrary page, the listing's own link (nlb.libcal.com), read for its registration notice."},
        "categories": CATEGORIES,
        "listed": len(listing),
        "events": kept,
        "excluded": [{key: value for key, value in item.items() if value is not None} for item in excluded],
    }


def booking_ok(url):
    return bool(re.match(r"https://(?:%s)/" % "|".join(re.escape(host) for host in BOOKING_HOSTS), url))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--offline", metavar="LISTING.json", help="read the raw listing from a file instead of the API")
    parser.add_argument("--no-pages", action="store_true", help="skip reading the event pages (no registration status)")
    parser.add_argument("--now", help="the retrieval time to record, ISO 8601 (default: now)")
    args = parser.parse_args(argv)
    now = datetime.fromisoformat(args.now) if args.now else datetime.now(SGT).replace(microsecond=0)
    listing = json.loads(Path(args.offline).read_text(encoding="utf-8")) if args.offline else fetch_listing()
    pages = {}
    if not args.no_pages:
        for raw in listing:
            category, _ = categorise(raw, plain(raw.get("description")))
            url = raw.get("link")
            if category and url and booking_ok(url) and "libcal.com/event/" in url:
                if pages:
                    time.sleep(PAGE_DELAY)
                try:
                    pages[str(raw["eventId"])] = registration(request(url))
                except OSError as error:
                    print(f"{url}: {error}; registration left out", file=sys.stderr)
    data = build(listing, pages, now)
    (HERE / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"data.json: {len(data['events'])} of {data['listed']} listed events kept, retrieved {data['retrieved']}")
    import build as page_builder
    page_builder.main([])


if __name__ == "__main__":
    main()
