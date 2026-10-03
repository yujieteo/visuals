"""The People's Association's cooking and baking classes at the Tampines community clubs, from onePA.

onePA (www.onepa.gov.sg) is public without a login. Its pages read a JSON API through the site's own /-api
proxy; this module uses the same calls, one at a time:

1. GET  /-api/search/outlets: every PA outlet. The Tampines community clubs are the outlets of type CC whose
   name holds "Tampines".
2. POST /-api/search/query, the search onePA's listings run: every open course (registration not yet closed)
   in its Culinary and Pastry & Baking categories, kept when it is at a Tampines club, and each Tampines club's
   current events. That is about nine searches: onePA's bot protection stops a client that searches much more.
3. GET  the sitemaps onePA publishes for crawlers (/sitemap/sitemap-course.xml, -event.xml, -ig.xml): each
   class's published page URL, matched by its code. A class without a published URL gets no booking link.
4. GET  each kept class's own page: its sessions, rooms and audience (courses) or tickets (events).
5. POST /-api/Products/GetCourseVacancy: the places a course has left, as its page shows them.

onePA's timestamps carry "+00:00" but hold Singapore wall-clock times: a class at "2026-11-16T17:00:00+00:00"
is listed on its page as a session from 17:00, in the evening time band. They are read as Singapore times.
"""
import json
import re
from datetime import datetime

BASE = "https://www.onepa.gov.sg"
API = f"{BASE}/-api"
LISTING_URL = f"{BASE}/courses/lifestyle-leisure/culinary"
SITEMAPS = ("course", "event", "ig")

FOOD_CATEGORIES = ("Culinary", "Pastry & Baking")
FOOD_TITLE = re.compile(r"\b(cook\w*|culinary|chefs?|bak(?:e|es|ing)|bread\w*|cakes?|cookies?|pastr(?:y|ies)|kueh|dumplings?|desserts?|recipes?|kitchen)\b", re.I)
CLAUSES = re.compile(r"[,;!?\n•]|\.(?!\d)")
AGE = re.compile(r"[^(]*\([^()]*\b\d+\s*(?:yrs?|years?)\b[^()]*\)|.*\b\d+\s*(?:yrs?|years?)\b.*", re.I)
FEE = re.compile(r".*\b(?:ingredients?|materials?)\b.*\bfees?\b.*|.*\bfees?\b.*\b(?:ingredients?|materials?)\b.*", re.I)
RULE = ("A course in onePA's Culinary or Pastry & Baking category at a Tampines community club, or an event there whose "
        "title names cooking, baking, bread, cakes, cookies, pastry, kueh, dumplings, desserts or recipes.")


def remark(remarks, pattern):
    """The first clause of the remarks that ``pattern`` finds, only as far as it reaches, without the punctuation around it."""
    for part in CLAUSES.split(remarks):
        if (match := pattern.search(part)):
            return match.group(0).strip(" \t\r*•-:,.") or None
    return None


def tampines_clubs(outlets):
    """The Tampines community clubs in onePA's outlet list, as {name, url, address}, by name."""
    clubs = [{"name": o["title"], "url": BASE + o["url"] if str(o.get("url", "")).startswith("/") else None, "address": o.get("address")}
             for o in outlets.get("data", []) if o.get("type") == "CC" and "tampines" in o.get("title", "").lower()]
    return sorted(({k: v for k, v in club.items() if v} for club in clubs), key=lambda club: club["name"])


def course_search(category, today, skip=0, take=100):
    """The search onePA's course listings run: every open course in one category, island-wide."""
    filters = [{"name": "type", "type": "eq", "value": "Course"}, {"name": "registration_closing_date", "type": "gte", "value": today},
               {"name": "active", "type": "eq", "value": True}, {"name": "categories_level_2", "type": "eq", "value": category}]
    return {"searchKeyword": "", "pagination": {"skip": skip, "take": take}, "filter": {"type": "and", "filters": filters}}


def event_search(club, today, skip=0, take=100):
    """The search onePA's event listings run: one club's events whose tickets are still on sale."""
    filters = [{"name": "type", "type": "eq", "value": "Event"}, {"name": "outlet_name", "type": "eq", "value": club},
               {"name": "ticket_end_date", "type": "gte", "value": today}]
    return {"searchKeyword": "", "pagination": {"skip": skip, "take": take}, "filter": {"type": "and", "filters": filters}}


def code_of(item):
    """The code onePA's page URLs end with: a course's class code, or an event's reference code."""
    return str(item.get("product_code") or item.get("event_product_ref_code") or item.get("id", "").rsplit("-", 1)[-1]).lower()


def food(item):
    """(category, the words or category that decided it) for a cooking or baking class, else (None, reason)."""
    if item.get("type") == "Course" and item.get("categories_level_2") in FOOD_CATEGORIES:
        return "cooking", item["categories_level_2"]
    if (found := FOOD_TITLE.findall(item.get("name") or "")):
        return "cooking", ", ".join(dict.fromkeys(found))
    return None, f"{item.get('type', 'listing')} in {item.get('categories_level_2') or ', '.join(item.get('categories_level_1') or []) or 'another category'}"


def sitemap_urls(xml):
    """{code: published URL} from one onePA sitemap; a page URL ends with "-<code>"."""
    return {url.rsplit("-", 1)[-1].lower(): url for url in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)}


def wall(value):
    """onePA's timestamp (Singapore wall-clock time, whatever offset it carries) as "YYYY-MM-DDTHH:MM:SS+08:00"."""
    if not value:
        return None
    return datetime.fromisoformat(re.sub(r"(?:Z|[+-]\d{2}:\d{2})$", "", value)).isoformat() + "+08:00"


def next_data(page):
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
    return json.loads(match.group(1)) if match else {}


def find(value, key):
    """Every value stored under ``key`` anywhere in a parsed page."""
    if isinstance(value, dict):
        for k, v in value.items():
            if k == key:
                yield v
            yield from find(v, key)
    elif isinstance(value, list):
        for v in value:
            yield from find(v, key)


def page_details(page, code):
    """What a class's own onePA page adds: its sessions and rooms, audience and language (courses), or its
    tickets and address (events). Empty when the page is not that class's."""
    data = next_data(page)
    props = (data.get("props") or {}).get("pageProps") or {}
    if str(props.get("productId", "")).lower() != code:
        return {}
    out = {}
    for raw in find(props, "ClassSessions"):
        try:
            sessions = json.loads(raw["value"] if isinstance(raw, dict) else raw)
        except (TypeError, ValueError, KeyError):
            continue
        out["sessions"] = sorted(({"start": wall(s.get("startTime")), "end": wall(s.get("endTime")),
                                   "room": (s.get("internalVenue") or s.get("externalVenue") or "").strip()} for s in sessions if s.get("startTime")),
                                 key=lambda s: s["start"])
        break
    for key, name in (("TargetCustomerSegments", "audiences"), ("Language", "language"), ("TotalSessions", "session_count"),
                      ("RequirementsAndRemarks", "remarks"), ("CanRegisterOnline", "online"), ("OnlineRegistrationClosingDate", "closes")):
        value = next(find(props, key), None)
        if value not in (None, "", []):
            out[name] = value
    tickets = next((t for t in find(props, "Tickets") if isinstance(t, list) and t), None)
    if tickets:
        out["tickets"] = [{"label": t.get("Name"), "amount": t.get("Price"), "available": t.get("AvailableQty"), "capacity": t.get("Qty")} for t in tickets]
    address = next((a for a in find(props, "Address") if isinstance(a, str) and a.strip()), None)
    if address:
        out["address"] = address.strip()
    return out


def money(amount):
    value = float(amount)
    return int(value) if value.is_integer() else round(value, 2)


def event(item, url, details, vacancy, short_description):
    """One kept onePA class in data.json's shape; what onePA does not publish is left out."""
    category, matched = food(item)
    xp = item.get("xp") or {}
    sessions = details.get("sessions") or []
    # The class's own start and end; a session's times only when there are several, since onePA's single
    # session can disagree with its class (10:00-10:30 against 10:00-12:45) and the class is what it lists.
    start, last = wall(item.get("start_date")), wall(item.get("end_date"))
    if len(sessions) > 1:
        start, end = sessions[0]["start"], sessions[0]["end"]
        last = sessions[-1]["end"]
    else:
        end = last
    outlet = (item.get("outlet_name") or "").strip()
    rooms = sorted({s["room"] for s in sessions if s.get("room") and s["room"].lower() != outlet.lower()})
    remarks = details.get("remarks") or (xp.get("Class") or {}).get("RequirementsAndRemarks") or ""
    fees = [{"label": f.get("ClassFeeName"), "amount": money(f["ClassFeeAmount"])} for f in xp.get("ClassFees") or [] if f.get("ClassFeeAmount") is not None]
    if not fees and details.get("tickets"):
        fees = [{"label": t["label"], "amount": money(t["amount"])} for t in details["tickets"] if t.get("amount") is not None]
    prices = [f["amount"] for f in fees] or [p for p in (item.get("min_price"), item.get("max_price")) if isinstance(p, (int, float))]
    minutes = None
    if start and end and start[:10] == end[:10]:
        minutes = int((datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds() // 60)
    out = {
        "id": f"onepa-{code_of(item)}",
        "source": "onepa",
        "organiser": "onePA",
        "title": (item.get("name") or "").strip(),
        "category": category,
        "matched": matched,
        "start": start,
        "end": last,
        "duration_minutes": minutes if minutes and minutes > 0 else None,
        "session_count": details.get("session_count") or (len(sessions) or None),
        "sessions": [{"start": s["start"], "end": s["end"]} for s in sessions] if len(sessions) > 1 else None,
        "time_label": f"{start[11:16]} - {end[11:16]}" if start and end and start[:10] == end[:10] else None,
        "event_type": {"InterestGroup": "Interest group"}.get(item.get("type"), item.get("type")),
        "subjects": [s for s in (item.get("categories_level_2"), item.get("categories_level_3")) if s] or list(item.get("categories_level_1") or []),
        "audiences": details.get("audiences") or [],
        "age_note": remark(remarks, AGE),
        "free": (max(prices) == 0) if prices else None,
        "fees": fees,
        "fee_note": remark(remarks, FEE),
        "language": str(details["language"]).title() if details.get("language") else None,
        "venue": f"{outlet} - {', '.join(rooms)}" if rooms else (details.get("address") or outlet),
        "venue_group": item.get("outlet_name"),
        "description": short_description(item.get("description") or ""),
        "booking_url": url,
    }
    registration = {}
    if vacancy:
        left, capacity = vacancy
        registration = {"status": "open" if left > 0 else "full", "seats_left": left, "capacity": capacity,
                        "note": f"{left} of {capacity} places available on onePA."}
    elif details.get("tickets"):
        left = sum(t.get("available") or 0 for t in details["tickets"])
        capacity = sum(t.get("capacity") or 0 for t in details["tickets"])
        registration = {"status": "open" if left > 0 else "full", "seats_left": left, "note": f"{left} tickets available on onePA."}
        if capacity:
            registration["capacity"] = capacity
    if details.get("online") is False:
        registration["note"] = (registration.get("note", "") + " Register at the community club; onePA does not take online registration for this class.").strip()
    if details.get("closes"):
        registration["closes"] = wall(details["closes"])
    if registration:
        out["registration"] = registration
    return {key: value for key, value in out.items() if value not in (None, "", [])}
