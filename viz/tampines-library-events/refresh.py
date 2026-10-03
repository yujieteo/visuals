#!/usr/bin/env python3
"""Regenerate data.json: cooking, maker-lab and other hands-on classes in Tampines, then rebuild the page.

Two public sources, read one request at a time with no login:

NLB, Tampines Regional Library (this file):
1. POST the National Library Board's public events search, /main/api/Event/EventFilter (the JSON the
   nlb.gov.sg "What's On" events page reads), for branch TRL (NLB's "Tampines Library", Tampines Regional
   Library at Our Tampines Hub), paging until every listed event is in.
2. Keep cooking, maker-lab and other hands-on classes (categorise() says how); list the rest by title.
3. For each kept event, read its published GoLibrary page (the listing's own link, nlb.libcal.com) for the
   registration notice and seats, waiting the 10 s that site's robots.txt asks between requests.

onePA, the Tampines community clubs (onepa.py says how): the People's Association's cooking and baking
courses and events at every Tampines CC, with each class's published onePA page as its booking link.

Then write data.json and run build.py, which inlines it into index.html. Nothing is invented: a field a
source does not publish is left out, and every booking link is one the source publishes, never a
constructed URL.

Usage: python3 refresh.py [--no-pages] [--now ISO8601] [--cache DIR]
"""
import argparse
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import onepa

HERE = Path(__file__).resolve().parent
SGT = timezone(timedelta(hours=8))
LISTING_URL = "https://www.nlb.gov.sg/main/whats-on/events"
API_URL = "https://www.nlb.gov.sg/main/api/Event/EventFilter"
BRANCH = "TRL"
PAGE_SIZE = 50
API_DELAY = 3  # seconds between listing pages
PAGE_DELAY = 10  # nlb.libcal.com robots.txt: Crawl-delay 10
USER_AGENT = "tampines-library-events-refresh/1 (+https://teoyujie.org/visuals/tampines-library-events/)"
ONEPA_DELAY = 5  # seconds between onePA page requests
ONEPA_SEARCH_DELAY = 10  # seconds between onePA searches, which its bot protection limits
BOOKING_HOSTS = ("nlb.libcal.com", "www.nlb.gov.sg", "go.gov.sg", "www.onepa.gov.sg")
LIBRARY = "Tampines Regional Library"

HANDS_ON_TYPES = {"Workshop", "Experience"}
MAKER = re.compile(r"\b(makeit|makers?|makerspace|3d|laser|sewing|discovertech|robot\w*|electronics?|circuits?|boson|micro:?bit|soldering|tinker\w*|coding|makedo|arduino)\b", re.I)
COOK_TITLE = re.compile(r"\b(cook\w*|culinary|chefs?|bak(?:e|es|ing)|recipes?|kitchen)\b", re.I)
COOK_TEXT = re.compile(r"\b(cooking|cook-along|baking|recipes?|meal demonstrations?|food demonstrations?|culinary (?:class|workshop|demonstration)s?)\b", re.I)
CRAFT_TITLE = re.compile(r"\b(hands-on|craft\w*|diy|calligraphy|painting|drawing|pottery|origami|gardening|cyanotype)\b", re.I)
CATEGORIES = [
    {"id": "cooking", "label": "Cooking & food",
     "rule": "At the library, a workshop whose title names cooking, baking, recipes or a kitchen, or whose description describes cooking, baking, recipes or a meal or food demonstration. " + onepa.RULE},
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
        "source": "nlb",
        "organiser": "NLB",
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
        "venue_group": LIBRARY,
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


class Blocked(RuntimeError):
    """A source answered with a bot check instead of its page: stop, never try to get past it."""


CACHE = None  # a folder of saved responses (--cache), so a rerun while developing repeats no request


def request(url, body=None, tries=1):
    """One GET, or a JSON POST when ``body`` is given; up to ``tries`` attempts a minute apart on a server error.
    With --cache, a response saved by an earlier run is read back instead of asking again."""
    if CACHE is not None:
        key = hashlib.sha256(json.dumps([url, body], sort_keys=True).encode()).hexdigest()[:24]
        saved = CACHE / f"{key}.txt"
        if saved.is_file():
            return saved.read_text(encoding="utf-8")
        text = request_live(url, body, tries)
        saved.write_text(text, encoding="utf-8")
        return text
    return request_live(url, body, tries)


def request_live(url, body=None, tries=1):
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json" if body is not None else "text/html, application/xml"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=120) as response:
                text = response.read().decode("utf-8")
            if re.search(r"_Incapsula_Resource|x-amzn-waf|<title>[^<]*(?:Just a moment|Attention Required)", text[:2000]):
                raise Blocked(f"{url} answered with a bot check instead of its content; try again later")
            return text
        except (urllib.error.HTTPError, TimeoutError) as error:
            if attempt + 1 == tries or (isinstance(error, urllib.error.HTTPError) and error.code < 500):
                raise
            time.sleep(60)
    raise AssertionError("unreachable")


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


def build_nlb(listing, pages):
    """(classes, source entry) from NLB's raw listing and {event id: registration} read from the event pages."""
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
    excluded.sort(key=lambda item: (item.get("start") or "", item["id"]))
    source = {
        "id": "nlb", "organiser": "NLB", "name": "National Library Board", "venue": LIBRARY, "nlb_name": "Tampines Library", "branch_code": BRANCH,
        "address": next((raw["location"]["address"] for raw in listing if (raw.get("location") or {}).get("address")), None),
        "listing_url": LISTING_URL, "api_url": API_URL, "api_query": query(0),
        "registration": "Each kept event's GoLibrary page, the listing's own link (nlb.libcal.com), read for its registration notice.",
        "listed": len(listing), "kept": len(kept),
        "excluded": [{key: value for key, value in item.items() if value is not None} for item in excluded],
    }
    return kept, {key: value for key, value in source.items() if value is not None}


def build_onepa(clubs, courses, events, urls, details, vacancies):
    """(classes, source entry) from onePA's open cooking and baking courses (island-wide; those at a Tampines club
    are kept), the Tampines clubs' current events, the sitemaps' {code: URL}, {code: page details} and
    {class id: (places left, class size)}."""
    names = {club["name"] for club in clubs}
    counts = {name: {"events_listed": 0, "kept": 0} for name in names}
    kept, seen, at_clubs = [], set(), 0
    for item in courses + events:
        code = onepa.code_of(item)
        club = item.get("outlet_name") or ""
        if code in seen or club not in names:
            continue
        seen.add(code)
        if item.get("type") == "Event":
            counts[club]["events_listed"] += 1
        else:
            at_clubs += 1
        if not onepa.food(item)[0]:
            continue
        class_id = str(((item.get("xp") or {}).get("Class") or {}).get("Id") or "").upper()
        url = urls.get(code)
        made = onepa.event(item, url if url and booking_ok(url) else None, details.get(code, {}), vacancies.get(class_id), short_description)
        if made.get("start"):
            kept.append(made)
            counts[club]["kept"] += 1
    source = {
        "id": "onepa", "organiser": "onePA", "name": "People's Association (onePA)", "listing_url": onepa.LISTING_URL,
        "api_url": f"{onepa.API}/search/query", "categories": list(onepa.FOOD_CATEGORIES),
        "registration": "Places left from onePA's course vacancy service and event tickets; each booking link is the class's page as onePA's sitemaps publish it.",
        "rule": onepa.RULE,
        "courses_open": len({onepa.code_of(item) for item in courses}), "courses_at_clubs": at_clubs,
        "clubs": [{**club, **counts[club["name"]]} for club in clubs],
        "kept": len(kept),
    }
    return kept, source


def build(nlb, onepa_part, now):
    """data.json's content: both sources' classes in start order, and what each source listed and kept."""
    events = sorted(nlb[0] + onepa_part[0], key=lambda item: (item.get("start") or "", item["id"]))
    return {"schema_version": 2, "retrieved": now.isoformat(timespec="seconds"), "categories": CATEGORIES,
            "sources": [nlb[1], onepa_part[1]], "events": events}


def booking_ok(url):
    return bool(re.match(r"https://(?:%s)/" % "|".join(re.escape(host) for host in BOOKING_HOSTS), url))


def fetch_nlb(read_pages):
    listing = fetch_listing()
    pages = {}
    if read_pages:
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
    return build_nlb(listing, pages)


def search_all(body_for):
    """Every result of one onePA search, page by page, ONEPA_SEARCH_DELAY apart."""
    out, skip = [], 0
    while True:
        time.sleep(ONEPA_SEARCH_DELAY)
        widget = (json.loads(request(f"{onepa.API}/search/query", body_for(skip))).get("widgets") or [{}])[0]
        content = widget.get("content") or []
        out += content
        skip += len(content)
        if not content or skip >= (widget.get("total_item") or 0):
            return out


def fetch_onepa(today, read_pages):
    clubs = onepa.tampines_clubs(json.loads(request(f"{onepa.API}/search/outlets", tries=3)))
    courses = [item for category in onepa.FOOD_CATEGORIES for item in search_all(lambda skip, c=category: onepa.course_search(c, today, skip))]
    events = [item for club in clubs for item in search_all(lambda skip, c=club["name"]: onepa.event_search(c, today, skip))
              if item.get("outlet_name") == club["name"]]
    names = {club["name"] for club in clubs}
    kept = [item for item in courses + events if item.get("outlet_name") in names and onepa.food(item)[0]]
    urls = {}
    for name in onepa.SITEMAPS:
        time.sleep(ONEPA_DELAY)
        urls.update(onepa.sitemap_urls(request(f"{onepa.BASE}/sitemap/sitemap-{name}.xml", tries=3)))
    details, class_ids, seen = {}, [], set()
    for item in kept:
        code = onepa.code_of(item)
        if code in seen:
            continue
        seen.add(code)
        if (class_id := ((item.get("xp") or {}).get("Class") or {}).get("Id")):
            class_ids.append(class_id)
        if read_pages and urls.get(code):
            time.sleep(ONEPA_DELAY)
            try:
                details[code] = onepa.page_details(request(urls[code]), code)
            except OSError as error:
                print(f"{urls[code]}: {error}; sessions left out", file=sys.stderr)
    vacancies = {}
    for at in range(0, len(class_ids), 20):
        time.sleep(ONEPA_DELAY)
        answer = json.loads(request(f"{onepa.API}/Products/GetCourseVacancy", class_ids[at:at + 20]))
        for row in (answer.get("response") or {}).get("classVacancyList") or []:
            vacancies[str(row["classId"]).upper()] = (row["vacancy"], row["maxVacancy"])
    return build_onepa(clubs, courses, events, urls, details, vacancies)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--no-pages", action="store_true", help="skip reading each class's own page (no seats or sessions)")
    parser.add_argument("--now", help="the retrieval time to record, ISO 8601 (default: now)")
    parser.add_argument("--cache", metavar="DIR", help="save every response in DIR and reuse saved ones (for development; never commit it)")
    args = parser.parse_args(argv)
    global CACHE
    if args.cache:
        CACHE = Path(args.cache)
        CACHE.mkdir(parents=True, exist_ok=True)
    now = datetime.fromisoformat(args.now) if args.now else datetime.now(SGT).replace(microsecond=0)
    nlb = fetch_nlb(not args.no_pages)
    pa = fetch_onepa(now.astimezone(SGT).date().isoformat(), not args.no_pages)
    data = build(nlb, pa, now)
    (HERE / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"data.json: {len(nlb[0])} NLB classes of {nlb[1]['listed']} listed, {len(pa[0])} onePA classes at the Tampines clubs, retrieved {data['retrieved']}")
    import build as page_builder
    page_builder.main([])


if __name__ == "__main__":
    main()
