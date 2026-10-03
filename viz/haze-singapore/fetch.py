#!/usr/bin/env python3
"""Fetch daily PSI and PM2.5 responses from the public data.gov.sg real-time API.

Writes raw.json beside it with each daily response unchanged, keyed
by endpoint and date. No API key is needed; the script paces requests and
retries when the public rate limit answers 429.
"""
import argparse
import json
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

RAW = Path(__file__).resolve().parent / "raw.json"
BASE = "https://api-open.data.gov.sg/v2/real-time/api/"
ENDPOINTS = ("psi", "pm25")


def get(endpoint, day):
    request = urllib.request.Request(f"{BASE}{endpoint}?date={day}", headers={"User-Agent": "visuals-haze-fetch"})
    for attempt in range(12):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = json.load(response)
            if body.get("code") == 0:
                return body
        except urllib.error.HTTPError as error:
            if error.code != 429:
                raise
        time.sleep(4 + attempt * 3)
    raise SystemExit(f"giving up on {endpoint} {day}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2026-04-01")
    parser.add_argument("--end", default=str(date.today()))
    args = parser.parse_args()
    raw = json.loads(RAW.read_text()) if RAW.exists() else {e: {} for e in ENDPOINTS}
    day, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    while day <= end:
        for endpoint in ENDPOINTS:
            # today's partial day is always refreshed; complete past days are kept.
            if str(day) not in raw[endpoint] or day == end:
                raw[endpoint][str(day)] = get(endpoint, day)
                time.sleep(1.2)
        RAW.write_text(json.dumps(raw, separators=(",", ":")) + "\n")
        print(day, flush=True)
        day += timedelta(days=1)


if __name__ == "__main__":
    main()
