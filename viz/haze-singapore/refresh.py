#!/usr/bin/env python3
"""Refresh raw.json with the daily PSI and PM2.5 responses of the public data.gov.sg real-time API.

raw.json keeps each daily response unchanged, keyed by endpoint and date, from START. A refresh reads every
day after the newest one stored, and that newest day again, because it was stored before the day was over;
complete past days are kept as they are. Today is read too, and left out while it has no hour yet. No API key
is needed; requests are paced and retried when the public rate limit answers 429.

Run python3 refresh.py [--dry-run], or python3 ../../scripts/refresh.py haze-singapore [--dry-run].
It writes raw.json and visual.json's "fetched", then build.py writes meta.json and index.html.
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "scripts"))
import refresh_kit  # noqa: E402
from refresh_kit import require  # noqa: E402

BASE = "https://api-open.data.gov.sg/v2/real-time/api/"
# The fields build.py reads from each endpoint's hourly readings.
ENDPOINTS = {"psi": ("psi_twenty_four_hourly", "pm25_twenty_four_hourly"), "pm25": ("pm25_one_hourly",)}
REGIONS = {"north", "south", "east", "west", "central"}
START = "2026-04-01"
PAUSE = 1.2  # seconds between requests


def url(endpoint, day):
    return f"{BASE}{endpoint}?date={day}"


def checked(endpoint, day, body):
    """One day's response, if it has the shape build.py reads; Failed otherwise. Returns its hours."""
    where = url(endpoint, day)
    require(isinstance(body, dict) and body.get("code") == 0, f"{where}: answered code {body.get('code') if isinstance(body, dict) else body!r}")
    data = body.get("data")
    require(isinstance(data, dict) and isinstance(data.get("items"), list), f"{where}: no data.items list")
    names = {meta.get("name") for meta in data.get("regionMetadata") or [] if isinstance(meta, dict) and isinstance(meta.get("labelLocation"), dict)}
    require(names == REGIONS, f"{where}: regions {sorted(n for n in names if n)} are not {sorted(REGIONS)}")
    hours = []
    for item in data["items"]:
        stamp = item.get("timestamp", "") if isinstance(item, dict) else ""
        require(stamp.startswith(day) and stamp.endswith(":00:00+08:00"), f"{where}: an item has timestamp {stamp!r}, not an hour of {day}")
        for name in ENDPOINTS[endpoint]:
            require(isinstance((item.get("readings") or {}).get(name), dict), f"{where}: {stamp} has no {name} readings")
        hours.append(stamp)
    return hours


def days_to_read(stored, today):
    """The days a refresh reads: from the newest stored day (or START) through today."""
    first = date.fromisoformat(max(stored, default=START))
    return [str(first + timedelta(days=n)) for n in range((date.fromisoformat(today) - first).days + 1)]


def refresh(source, folder, args):
    text = refresh_kit.read(folder, "raw.json")
    raw = json.loads(text) if text else {endpoint: {} for endpoint in ENDPOINTS}
    today = refresh_kit.today(source)
    new = {endpoint: dict(days) for endpoint, days in raw.items()}
    changes, notes = [], []
    for endpoint in ENDPOINTS:
        for day in days_to_read(raw[endpoint], today):
            body = source.json(url(endpoint, day), tries=12, retry=(429,), pause=3)
            hours = checked(endpoint, day, body)
            if not hours:
                require(day == today, f"{url(endpoint, day)}: no hourly reading for a past day")
                notes.append(f"{endpoint} {day} has no hour yet, so it is left out")
                continue
            old = raw[endpoint].get(day)
            before = len(old["data"]["items"]) if old else 0
            if old != body:
                changes.append({"kind": "updated" if old else "added", "item": f"{endpoint} {day}", "detail": f"{before} -> {len(hours)} hours"})
            new[endpoint][day] = body
            source.wait(PAUSE)
        new[endpoint] = dict(sorted(new[endpoint].items()))
    if changes:
        notes.append("build.py derives the headline, peak and unhealthy days from the numbers: read the page's diff.")
    return refresh_kit.Update(files={"raw.json": json.dumps(new, separators=(",", ":")) + "\n"}, fetched=today, changes=changes,
                              notes=notes, source=BASE + "psi")


if __name__ == "__main__":
    sys.exit(refresh_kit.main(slug=HERE.name))
