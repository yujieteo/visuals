#!/usr/bin/env python3
"""Rank the food places around Ubi, Hougang, Woodleigh, Paya Lebar and Eunos, and write raw.json.

Inputs, all checked in next to this file:
  sources.json     food guides, mall directories, closure notices, geography and nutrition sources
  outlets.csv      every place two or more publishers recommend within 1 km of the six stations, with the
                   guides that name it, how its presence was checked and, for the top 100, one signature dish
                   and that dish's nutrition reference
  directories.csv  the food and drink listings of the five malls' directories
  yeo2021.csv      Yeo et al. (2021) Tables 1-6, transcribed
  fndds.csv        the FNDDS rows outlets.csv uses (written by extract_fndds.py)
  map.json         attributed, projected OpenStreetMap geometry: one overview and one view per area

Output:
  raw.json         the dataset; build.py inlines it in index.html and the site publishes it as data.json

    python3 dataset.py            # write raw.json
    python3 dataset.py --verify   # check raw.json is current without writing it
"""
import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOP = 100
MIN_PUBLISHERS = 2
# A place outside a mall directory counts as open when a guide names it on or after this date.
RECENT = "2022-01-01"
KJ_PER_KCAL = 4.184
# Atwater general factors, kcal per gram.
ATWATER = {"carbohydrate": 4, "protein": 4, "fat": 9}

CUISINES = [
    ("chinese", "Chinese"),
    ("malay", "Malay, Indonesian & Peranakan"),
    ("indian", "Indian"),
    ("japanese", "Japanese"),
    ("korean", "Korean"),
    ("southeast-asian", "Thai, Vietnamese & Penang"),
    ("western", "Western"),
    ("cafe-bakery", "Café & bakery"),
    ("dessert", "Dessert"),
]
# Area id, label and the MRT stations whose exits define it (LTA exits, 1,000 m).
AREAS = [
    ("ubi", "Ubi", ["Ubi"]),
    ("hougang", "Hougang & Kovan", ["Hougang", "Kovan"]),
    ("woodleigh", "Woodleigh", ["Woodleigh"]),
    ("paya-lebar", "Paya Lebar", ["Paya Lebar"]),
    ("eunos", "Eunos", ["Eunos"]),
]
STATUSES = {"open", "closed", "unverified"}
MATCHES = {"same dish", "similar dish", "generic equivalent"}

METHOD = [
    "Candidates are places within 1,000 m of an exit of Ubi, Hougang, Kovan, Woodleigh, Paya Lebar or Eunos MRT station "
    "that food guides recommend by name. Each guide listed under Sources was read on the retrieval date; a place counts once per guide.",
    "A place needs at least two different publishers to be a candidate. Rank is by the number of distinct publishers, "
    "then the number of guides, then the most recent guide date, then name. The top 100 open places are listed.",
    "Mall places were checked against the directories of PLQ Mall, SingPost Centre, KINEX, The Woodleigh Mall and Paya Lebar Square "
    "on the retrieval date; a place the directory no longer lists is left out as closed. Hawker centres, coffee shops and shophouses "
    "have no directory, so a place there counts as open only when a guide from 2022 or later names it; older ones are left out as unverified.",
    "Google ratings and review counts could not be retrieved, so they play no part. The ranking measures how often independent "
    "writers recommend a place, not how it tastes, and it favours places that food media cover.",
]

CALORIE_METHOD = [
    "Each figure is an estimate for a reference dish, not a measurement of the place's own dish. Where Yeo et al. (2021) measured "
    "the same or a comparable Singapore hawker meal, its portion and nutrient values are used. Otherwise the closest U.S. survey "
    "recipe from FoodData Central (FNDDS) is used, with a stated portion.",
    "A dish matched to the measured dish or a close variant is labelled an estimate. A dish matched to a generic equivalent is "
    "labelled approximate and names its equivalent and source.",
    "Bars split energy into carbohydrate, protein and fat at 4, 4 and 9 kcal per gram. That split can differ by a few kilocalories "
    "from the stated total energy, which comes from the source.",
    "Buffets, shared plates and drinks with no fixed portion are marked not estimable rather than guessed.",
]


def read_csv(name):
    with open(HERE / name, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def fail(message):
    raise SystemExit(f"dataset.py: {message}")


def nutrition_for(row, yeo, fndds):
    """The sourced energy and macronutrients of a row's signature dish, or why it is not estimable."""
    source = row["nutrition_source"]
    if not source:
        if not row["nutrition_note"]:
            fail(f"{row['id']}: a not-estimable dish needs a reason in nutrition_note")
        return {"status": "not_estimable", "reason": row["nutrition_note"]}
    if row["match"] not in MATCHES:
        fail(f"{row['id']}: match must be one of {sorted(MATCHES)}")
    if source == "yeo2021":
        ref = yeo.get(row["nutrition_ref"]) or fail(f"{row['id']}: no Yeo et al. dish {row['nutrition_ref']!r}")
        grams = float(ref["portion_g"])
        energy = float(ref["energy_kj_per_100g"]) * grams / 100 / KJ_PER_KCAL
        reference = f"{ref['dish_as_published']} (Table {ref['table']}, {ref['group']})"
        portion = f"{grams:g} g, the portion Yeo et al. bought"
    elif source == "fndds2024":
        key = (row["nutrition_ref"], row["portion"])
        ref = fndds.get(key) or fail(f"{row['id']}: fndds.csv has no row for {key}")
        count = float(row["portion_count"])
        grams = float(ref["portion_g"]) * count
        energy = float(ref["energy_kcal_per_100g"]) * grams / 100
        reference = f"{ref['description']} (FDC {ref['fdc_id']})"
        portion = f"{count:g} × {ref['portion_description']} = {grams:g} g"
    else:
        fail(f"{row['id']}: unknown nutrition source {source!r}")
    grams_of = {k: round(float(ref[f"{k}_g_per_100g"]) * grams / 100, 1) for k in ATWATER}
    return {
        "status": "approximate" if row["match"] == "generic equivalent" else "estimate",
        "source": source,
        "reference": reference,
        "match": row["match"],
        "portion": portion,
        "grams": round(grams),
        "energy_kcal": round(energy),
        "carbohydrate_g": grams_of["carbohydrate"],
        "protein_g": grams_of["protein"],
        "fat_g": grams_of["fat"],
        "kcal_from": {k: round(grams_of[k] * ATWATER[k]) for k in ATWATER},
        "note": row["nutrition_note"],
    }


def check_row(row, guides, notices, listings, directory_of):
    """Fail on any row that names an unknown cuisine, area, status, guide or notice, or disagrees with its directory."""
    oid = row["id"]
    stations = {s for _, _, names in AREAS for s in names}
    # Only the top 100 carry a cuisine and a dish; the rest leave both empty.
    if row["cuisine"] not in dict(CUISINES) and (row["dish"] or row["cuisine"]):
        fail(f"{oid}: unknown cuisine {row['cuisine']!r}")
    if row["area"] not in {a for a, _, _ in AREAS} or row["station"] not in stations:
        fail(f"{oid}: unknown area {row['area']!r} or station {row['station']!r}")
    if row["station"] not in dict((a, n) for a, _, n in AREAS)[row["area"]]:
        fail(f"{oid}: station {row['station']} is not in area {row['area']}")
    if not 0 <= int(row["station_m"]) <= 1000:
        fail(f"{oid}: {row['station_m']} m from the nearest exit is outside the 1,000 m area")
    if row["status"] not in STATUSES:
        fail(f"{oid}: unknown status {row['status']!r}")
    mentions = row["mentions"].split(";")
    if len(set(mentions)) != len(mentions):
        fail(f"{oid}: a guide is listed twice")
    for guide in mentions + ([row["dish_named_by"]] if row["dish_named_by"] else []):
        if guide not in guides:
            fail(f"{oid}: unknown guide {guide!r}")
    if row["dish_named_by"] and row["dish_named_by"] not in mentions:
        fail(f"{oid}: dish_named_by must be one of its mentions")
    source = row["status_source"]
    if source.startswith("notice-"):
        if source not in notices:
            fail(f"{oid}: unknown notice {source!r}")
    elif source == "directory":
        directory = directory_of.get(row["venue"]) or fail(f"{oid}: {row['venue']!r} has no directory")
        listed = [l for l in listings if l["mall"] == row["venue"] and l["name"] == row["directory_name"]]
        if row["status"] == "open":
            if len(listed) != 1:
                fail(f"{oid}: {row['directory_name']!r} is not listed once in the {row['venue']} directory ({directory})")
            # Some listings give no unit; the address the guides give supplies it then.
            if listed[0]["unit"] and listed[0]["unit"] != row["unit"]:
                fail(f"{oid}: unit {row['unit']!r} differs from the directory's {listed[0]['unit']!r}")
        elif row["status"] == "closed" and listed:
            fail(f"{oid}: closed, but the {row['venue']} directory still lists it")
    elif source == "guides":
        latest = max(guides[g]["published"] for g in mentions)
        expected = "open" if latest >= RECENT else "unverified"
        if row["status"] != expected:
            fail(f"{oid}: its latest guide is {latest}, so its status is {expected}, not {row['status']}")
    else:
        fail(f"{oid}: unknown status source {source!r}")


def place_record(row, guides):
    mentions = sorted(row["mentions"].split(";"), key=lambda g: (guides[g]["published"], g), reverse=True)
    return {
        "id": row["id"], "name": row["name"], "area": row["area"], "station": row["station"],
        "station_m": int(row["station_m"]), "venue": row["venue"], "unit": row["unit"], "address": row["address"],
        "lat": float(row["lat"]), "lon": float(row["lon"]), "cuisine": row["cuisine"],
        "publishers": len({guides[g]["publisher"] for g in mentions}), "guides": len(mentions),
        "latest_mention": guides[mentions[0]]["published"], "mentions": mentions,
    }


def presence(row, place, directory_of, directories, notices):
    """How the place's presence was checked, and when."""
    if row["status_source"] == "directory":
        directory = directory_of[row["venue"]]
        return {"checked_by": directory, "listed_as": row["directory_name"], "as_of": directories[directory]["retrieved"]}
    out = {"checked_by": "guides", "latest_mention": place["latest_mention"]}
    if row["status_source"].startswith("notice-"):
        out["notice"] = row["status_source"]
        out["note"] = row["note"]
        out["as_of"] = notices[row["status_source"]]["published"]
    return out


def area_summary(label, here, gone, unverified):
    """One paragraph about an area, made only from the ranked data, so its counts and names cannot drift."""
    venues = Counter(o["venue"] for o in here)
    parts = [f"{n} at {v}" for v, n in sorted(venues.items(), key=lambda kv: (-kv[1], kv[0])) if v]
    if venues[""]:
        parts.append(f"{venues['']} at {'another address' if venues[''] == 1 else 'other addresses'}")
    if len(here) == 1:
        out = [f"1 of the top {TOP} is in {label}: {here[0]['name']} (rank {here[0]['rank']}), for its {here[0]['dish']}."]
    else:
        out = [f"{len(here)} of the top {TOP} are in {label}: {_join(parts)}.",
               "The most recommended are " + _join([f"{o['name']} ({o['dish']})" for o in here[:3]]) + "."]
    if gone:
        out.append(f"{_plural(len(gone), 'recommended place has', 'recommended places have')} closed and {'is' if len(gone) == 1 else 'are'} left out: {_join(gone)}.")
    if unverified:
        out.append(f"{_plural(unverified, 'place is', 'places are')} left out as unverified, because no guide has named {'it' if unverified == 1 else 'them'} since {RECENT[:4]}.")
    return " ".join(out)


def area_record(area_id, label, stations, top, excluded, listings, directory_of):
    here = [o for o in top if o["area"] == area_id]
    gone = [o["name"] for o in excluded if o["area"] == area_id and o["status"] == "closed"]
    unverified = sum(o["area"] == area_id and o["status"] == "unverified" for o in excluded)
    venues = Counter(o["venue"] for o in here)
    malls = sorted(m for m in directory_of if venues[m])
    return {
        "id": area_id, "label": label, "stations": stations,
        "in_top": len(here),
        "closed": len(gone),
        "unverified": unverified,
        "malls": [{"name": m, "directory": directory_of[m], "in_top": venues[m],
                   "fnb_listings": sum(l["mall"] == m for l in listings)} for m in malls],
        "cuisines": [list(kv) for kv in sorted(Counter(o["cuisine"] for o in here).items(), key=lambda kv: (-kv[1], kv[0]))],
        "summary": area_summary(label, here, gone, unverified),
    }


def build():
    sources = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    guides = {g["id"]: g for g in sources["guides"]}
    notices = {n["id"]: n for n in sources["notices"]}
    directories = {d["id"]: d for d in sources["directories"]}
    directory_of = {d["mall"]: d["id"] for d in sources["directories"]}
    listings = read_csv("directories.csv")
    yeo = {r["dish_as_published"]: r for r in read_csv("yeo2021.csv")}
    fndds = {(r["fdc_id"], r["portion_description"]): r for r in read_csv("fndds.csv")}

    candidates, excluded = [], []
    for row in read_csv("outlets.csv"):
        check_row(row, guides, notices, listings, directory_of)
        place = place_record(row, guides)
        if place["publishers"] < MIN_PUBLISHERS:
            fail(f"{row['id']}: fewer than {MIN_PUBLISHERS} publishers")
        if row["status"] != "open":
            place["status"] = row["status"]
            place["checked_by"] = row["status_source"] if row["status_source"] != "directory" else directory_of[row["venue"]]
            excluded.append(place)
            continue
        place["presence"] = presence(row, place, directory_of, directories, notices)
        candidates.append((place, row))

    candidates.sort(key=lambda c: (-c[0]["publishers"], -c[0]["guides"], _neg_date(c[0]["latest_mention"]), c[0]["name"].lower()))
    if len(candidates) < TOP:
        fail(f"only {len(candidates)} open candidates; need {TOP}")
    for rank, (place, row) in enumerate(candidates, 1):
        place["rank"] = rank
        has_dish = bool(row["dish"])
        if has_dish != (rank <= TOP) or bool(row["cuisine"]) != has_dish:
            fail(f"{row['id']}: rank {rank}, so it {'needs' if rank <= TOP else 'must not have'} a signature dish")
    for place, row in candidates[:TOP]:
        place["dish"] = row["dish"]
        place["dish_named_by"] = row["dish_named_by"]
        place["nutrition"] = nutrition_for(row, yeo, fndds)
    top, rest = [p for p, _ in candidates[:TOP]], [p for p, _ in candidates[TOP:]]
    excluded.sort(key=lambda p: (p["status"], p["area"], p["name"].lower()))

    used = {g for p in top for g in p["mentions"]}
    return {
        "title": "Good food in Ubi, Hougang, Woodleigh, Paya Lebar and Eunos",
        "as_of": sources["as_of"],
        "top": TOP,
        "recent": RECENT,
        "method": METHOD,
        "calorie_method": CALORIE_METHOD,
        "map": json.loads((HERE / "map.json").read_text(encoding="utf-8")),
        "cuisines": [{"id": c, "label": label} for c, label in CUISINES],
        "areas": [area_record(a, label, stations, top, excluded, listings, directory_of) for a, label, stations in AREAS],
        "outlets": top,
        "next_in_line": [{k: p[k] for k in ("rank", "id", "name", "area", "venue", "publishers", "guides", "latest_mention")} for p in rest],
        "excluded": excluded,
        "sources": {
            "guides": [dict(g, used_in_top=g["id"] in used) for g in sources["guides"]],
            "directories": sources["directories"],
            "notices": sources["notices"],
            "geography": sources["geography"],
            "nutrition": sources["nutrition"],
            "not_retrieved": sources["not_retrieved"],
        },
    }


def _neg_date(date):
    # Sort newer first inside an ascending sort.
    return -int(date.replace("-", ""))


def _plural(n, one, many):
    return f"{n} {one if n == 1 else many}"


def _join(names):
    if len(names) < 2:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def text(dataset):
    return json.dumps(dataset, ensure_ascii=False, indent=1) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--verify", action="store_true", help="check raw.json is current; write nothing")
    args = parser.parse_args(argv)
    out = text(build())
    target = HERE / "raw.json"
    if args.verify:
        if not target.is_file() or target.read_text(encoding="utf-8") != out:
            sys.exit("raw.json is not what dataset.py writes; run python3 dataset.py")
        print("raw.json is current")
        return
    target.write_text(out, encoding="utf-8")
    print(f"wrote raw.json ({TOP} places)")


if __name__ == "__main__":
    main()
