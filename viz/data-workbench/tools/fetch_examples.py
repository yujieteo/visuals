#!/usr/bin/env python3
"""Fetch the two public-domain example datasets into examples/ and record each source, date, size and SHA-256 in
raw.json. Both cover a closed period (the year 2024), so a later fetch gives the same events and days, though a
publisher may revise a value; run this only to replace an example, then python3 build.py.

    python3 tools/fetch_examples.py           # fetch both and update raw.json
"""
import datetime
import hashlib
import json
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SOURCES = {
    "quakes": ("examples/usgs-earthquakes-2024-m5.5.csv",
               "https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=2024-01-01&endtime=2025-01-01&minmagnitude=5.5&orderby=time-asc"),
    "weather": ("examples/noaa-central-park-2024.csv",
                "https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&stations=USW00094728"
                "&startDate=2024-01-01&endDate=2024-12-31&format=csv&units=metric&includeAttributes=true"
                "&includeStationName=true&dataTypes=PRCP,SNOW,SNWD,TMAX,TMIN,AWND,WSF2,WDF2"),
}


def main():
    raw = json.loads((HERE / "raw.json").read_text(encoding="utf-8"))
    today = datetime.date.today().isoformat()
    for example in raw["examples"]:
        if example["id"] not in SOURCES:
            continue
        path, url = SOURCES[example["id"]]
        request = urllib.request.Request(url, headers={"User-Agent": "yujieteo-visuals-examples"})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
        (HERE / path).write_bytes(data)
        example.update({"file": path, "source_url": url, "fetched": today, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        print(f"{path}: {len(data):,} bytes")
    (HERE / "raw.json").write_text(json.dumps(raw, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
