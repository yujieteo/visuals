#!/usr/bin/env python3
"""Rank Tampines food outlets and embed the result in index.html.

Inputs, all checked in next to this file:
  sources.json     food guides, official mall directories and nutrition sources
  outlets.csv      every outlet two or more publishers recommend, with the guides
                   that name it, one signature dish and that dish's nutrition reference
  directories.csv  Food & Beverage listings of the three malls with an official directory
  yeo2021.csv      Yeo et al. (2021) Tables 1-6, transcribed
  fndds.csv        the FNDDS rows outlets.csv uses (written by extract_fndds.py)
  map.json         attributed, projected OSM geometry from the Visuals map
  beamdswitch.js   the site's standard beamdswitch report template, unchanged
  report.js        the page's numbers as a beamdswitch report

Outputs:
  raw.json         the dataset (published as data.json)
  index.html       its <script id="dataset">, <script id="beamdswitch"> and <script id="report">
                   blocks are rewritten in place

    python build.py            # regenerate raw.json and index.html
    python build.py --verify   # check both are fresh without writing
"""
import argparse
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOP = 50
MIN_PUBLISHERS = 2
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
MALLS = [
    ("tampines-mall", "Tampines Mall", "dir-tampinesmall"),
    ("tampines-1", "Tampines 1", "dir-tampines1"),
    ("century-square", "Century Square", "dir-centurysquare"),
    ("our-tampines-hub", "Our Tampines Hub", None),
]
# Yeo et al. (2021) spellings shown with the usual one; yeo2021.csv keeps them verbatim.
PRINTED_AS = {"Laska": "Laksa", "Nasi Ambang": "Nasi ambeng"}
STATUSES = {"open", "closed", "not yet open"}
MATCHES = {"same dish", "similar dish", "generic equivalent"}

# One paragraph per mall. {placeholders} are filled from the ranked data so the
# counts in the prose cannot drift from the list.
MALL_SUMMARIES = {
    "tampines-mall": (
        "Lola's Cafe, a brunch café by the entrance, is the most-recommended outlet in this list. "
        "Around it are chain restaurants (Genki Sushi, Nando's, Swensen's, So Pho, Seoul Garden), "
        "Hong Kong, Korean and Taiwanese spots in the basement, and a level-4 Kopitiam food court "
        "where Hjh Maimunah Mini serves Malay food."
    ),
    "tampines-1": (
        "The level-5 Hawkers' Street food hall supplies {hawkers_street} of this list's entries, "
        "among them Tai Wah Pork Noodle, Tiong Bahru Hainanese Boneless Chicken Rice and Nikmat Nasi Lemak. "
        "The basement mixes bakes and sweets (fieldnotes, Mister Donut) with Haruyama Udon; grilled fish, "
        "steak and shabu-shabu are upstairs."
    ),
    "century-square": (
        "Smaller and restaurant-led: dim sum at Swee Choon, Lanzhou beef noodles, HaiDiLao hotpot, "
        "Japanese pork rice bowls and snow-ice desserts. {closed_count} places the guides recommended here "
        "have since closed ({closed_names}), so older guides list places that are gone."
    ),
    "our-tampines-hub": (
        "The ground-floor hawker centre is the draw, with {hawker_centre} of this list's entries: Cantonese porridge, "
        "lor mee, laksa, nasi ambeng, fried carrot cake and prawn noodles. The mall around it adds ramen, "
        "mala and Penang food."
    ),
}

METHOD = [
    "Candidates are outlets in the four malls that food guides recommend by name. Each guide listed under Sources was read on the retrieval date; an outlet counts once per guide.",
    "An outlet needs at least two different publishers to be a candidate. Rank is by the number of distinct publishers, then the number of guides, then the most recent guide date, then name.",
    "Outlets were checked against the official Tampines Mall, Tampines 1 and Century Square directories on the retrieval date. Places a guide recommends but the directory no longer lists are left out and listed separately. Our Tampines Hub has no directory that could be found, so its outlets rely on the guides' dates.",
    "Google ratings and review counts could not be retrieved, so they play no part. The ranking measures how often independent writers recommend a place, not how it tastes, and favours outlets that food media cover.",
]

CALORIE_METHOD = [
    "Each figure is an estimate for a reference dish, not a measurement of the outlet's own dish. Where Yeo et al. (2021) measured the same or a comparable Singapore hawker meal, its portion and nutrient values are used. Otherwise the closest U.S. survey recipe from FoodData Central (FNDDS) is used, with a stated portion.",
    "A dish matched to the measured dish or a close variant is labelled an estimate; a dish matched to a generic equivalent (lor mee as noodles with gravy, udon as cooked noodles, a pork rice bowl as pork with rice) is labelled approximate and names its equivalent and source.",
    "Bars split energy into carbohydrate, protein and fat using 4, 4 and 9 kcal per gram. That split can differ by a few kilocalories from the stated total energy, which comes from the source.",
    "Buffets and shared or build-your-own plates have no fixed per-person portion and are marked not estimable rather than guessed.",
]


def read_csv(name):
    with open(HERE / name, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def fail(message):
    raise SystemExit(f"build.py: {message}")


def nutrition_for(row, yeo, fndds):
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
        per100 = {k: float(ref[f"{k}_g_per_100g"]) for k in ATWATER}
        name, table = ref["dish_as_published"], f"Table {ref['table']}, {ref['group']}"
        reference = (f"{PRINTED_AS[name]} (printed as {name}; {table})" if name in PRINTED_AS
                     else f"{name} ({table})")
        portion = f"{grams:g} g, the portion Yeo et al. bought"
    elif source == "fndds2024":
        key = (row["nutrition_ref"], row["portion"])
        ref = fndds.get(key) or fail(f"{row['id']}: fndds.csv has no row for {key}")
        count = float(row["portion_count"])
        grams = float(ref["portion_g"]) * count
        energy = float(ref["energy_kcal_per_100g"]) * grams / 100
        per100 = {k: float(ref[f"{k}_g_per_100g"]) for k in ATWATER}
        reference = f"{ref['description']} (FDC {ref['fdc_id']})"
        portion = f"{count:g} × {ref['portion_description']} = {grams:g} g"
    else:
        fail(f"{row['id']}: unknown nutrition source {source!r}")
    grams_of = {k: round(v * grams / 100, 1) for k, v in per100.items()}
    return {
        "status": "approximate" if row["match"] == "generic equivalent" else "estimate",
        "source": source,
        "reference": reference,
        "reference_key": row["nutrition_ref"],
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


def check_outlet(row, guides, listings, mall_by_name):
    """Fail on any row that names an unknown cuisine, mall, status or guide, or disagrees with its mall's directory."""
    oid = row["id"]
    if row["cuisine"] not in dict(CUISINES):
        fail(f"{oid}: unknown cuisine {row['cuisine']!r}")
    if row["mall"] not in mall_by_name:
        fail(f"{oid}: unknown mall {row['mall']!r}")
    if row["status"] not in STATUSES:
        fail(f"{oid}: unknown status {row['status']!r}")
    mentions = row["mentions"].split(";")
    for guide in mentions + [row["dish_named_by"]]:
        if guide not in guides:
            fail(f"{oid}: unknown guide {guide!r}")
    if row["dish_named_by"] not in mentions:
        fail(f"{oid}: dish_named_by must be one of its mentions")
    if len(set(mentions)) != len(mentions):
        fail(f"{oid}: a guide is listed twice")
    _, directory = mall_by_name[row["mall"]]
    if row["status"] == "open" and directory:
        listed = [l for l in listings if l["mall"] == row["mall"]
                  and l["name"] == row["directory_name"] and l["status"] != "opening soon"]
        if len(listed) != 1:
            fail(f"{oid}: {row['directory_name']!r} is not listed once in the {row['mall']} directory")
        if listed[0]["unit"] != row["unit"]:
            fail(f"{oid}: unit {row['unit']} differs from the directory's {listed[0]['unit']}")


def outlet_record(row, guides, mall_id):
    mentions = row["mentions"].split(";")
    dated = sorted(mentions, key=lambda g: guides[g]["published"], reverse=True)
    return {
        "id": row["id"], "name": row["name"], "mall": mall_id, "venue": row["venue"], "unit": row["unit"],
        "cuisine": row["cuisine"], "dish": row["dish"], "dish_named_by": row["dish_named_by"],
        "publishers": len({guides[g]["publisher"] for g in mentions}), "guides": len(mentions),
        "latest_mention": guides[dated[0]]["published"], "mentions": dated,
    }


def mall_record(mall_id, name, directory, top, excluded, listings):
    here = [o for o in top if o["mall"] == mall_id]
    gone = [o["name"] for o in excluded if o["mall"] == mall_id and o["status"] == "closed"]
    counts = {
        "hawkers_street": sum(o["venue"] == "Hawkers' Street" for o in here),
        "hawker_centre": sum(o["venue"].startswith("Hawker Centre") for o in here),
        "closed_count": _number_word(len(gone)),
        "closed_names": _join(gone),
    }
    cuisine_counts = Counter(o["cuisine"] for o in here)
    return {
        "id": mall_id, "name": name,
        "directory": directory,
        "fnb_listings": sum(l["mall"] == name and l["status"] != "opening soon" for l in listings) if directory else None,
        "in_top": len(here),
        "cuisines": sorted(cuisine_counts.items(), key=lambda kv: (-kv[1], kv[0])),
        "summary": MALL_SUMMARIES[mall_id].format(**counts),
    }


def build():
    sources = json.loads((HERE / "sources.json").read_text(encoding="utf-8"))
    guides = {g["id"]: g for g in sources["guides"]}
    directories = {d["id"]: d for d in sources["directories"]}
    listings = read_csv("directories.csv")
    yeo = {r["dish_as_published"]: r for r in read_csv("yeo2021.csv")}
    fndds = {(r["fdc_id"], r["portion_description"]): r for r in read_csv("fndds.csv")}
    mall_by_name = {name: (mall_id, directory) for mall_id, name, directory in MALLS}

    candidates, excluded = [], []
    for row in read_csv("outlets.csv"):
        check_outlet(row, guides, listings, mall_by_name)
        mall_id, directory = mall_by_name[row["mall"]]
        outlet = outlet_record(row, guides, mall_id)
        if row["status"] != "open":
            outlet["reason"] = row["nutrition_note"]
            outlet["status"] = row["status"]
            excluded.append(outlet)
            continue
        if outlet["publishers"] < MIN_PUBLISHERS:
            fail(f"{row['id']}: fewer than {MIN_PUBLISHERS} publishers")
        outlet["presence"] = (
            {"checked_by": directory, "listed_as": row["directory_name"], "as_of": directories[directory]["retrieved"]}
            if directory else {"checked_by": "guides", "latest_mention": outlet["latest_mention"]}
        )
        candidates.append((outlet, row))

    candidates.sort(key=lambda c: (-c[0]["publishers"], -c[0]["guides"], _neg_date(c[0]["latest_mention"]), c[0]["name"].lower()))
    for rank, (outlet, _) in enumerate(candidates, 1):
        outlet["rank"] = rank
    if len(candidates) < TOP:
        fail(f"only {len(candidates)} open candidates; need {TOP}")
    for outlet, row in candidates[:TOP]:
        outlet["nutrition"] = nutrition_for(row, yeo, fndds)
    top, rest = [o for o, _ in candidates[:TOP]], [o for o, _ in candidates[TOP:]]

    used = {g for o in top for g in o["mentions"]}
    return {
        "title": "Good food in Tampines",
        "as_of": sources["as_of"],
        "method": METHOD,
        "calorie_method": CALORIE_METHOD,
        "map": json.loads((HERE / "map.json").read_text(encoding="utf-8")),
        "cuisines": [{"id": c, "label": label} for c, label in CUISINES],
        "malls": [mall_record(mall_id, name, directory, top, excluded, listings) for mall_id, name, directory in MALLS],
        "outlets": top,
        "next_in_line": [{k: o[k] for k in ("rank", "name", "mall", "publishers", "guides", "latest_mention")} for o in rest],
        "excluded": excluded,
        "sources": {
            "guides": [dict(g, used_in_top=g["id"] in used) for g in sources["guides"]],
            "directories": sources["directories"],
            "nutrition": sources["nutrition"],
            "not_retrieved": sources["not_retrieved"],
        },
    }


def _neg_date(date):
    # Sort newer first inside an ascending sort.
    return -int(date.replace("-", ""))


def _number_word(n):
    return ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"][n] if n < 10 else str(n)


def _join(names):
    if len(names) < 2:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def replace_block(page, opening, content):
    """Replace the body of the one script block that starts with `opening`."""
    new_page, count = re.subn(rf"({re.escape(opening)}).*?(</script>)",
                              lambda m: m.group(1) + content + m.group(2), page, count=1, flags=re.S)
    if count != 1:
        fail(f"index.html has no {opening} block")
    return new_page


def render(dataset):
    raw = json.dumps(dataset, ensure_ascii=False, indent=1) + "\n"
    page = (HERE / "index.html").read_text(encoding="utf-8")
    block = json.dumps(dataset, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    page = replace_block(page, '<script id="dataset" type="application/json">', block)
    for block_id, name in (("beamdswitch", "beamdswitch.js"), ("report", "report.js")):
        script = (HERE / name).read_text(encoding="utf-8")
        if "</script" in script:
            fail(f"{name} must not contain </script")
        page = replace_block(page, f'<script id="{block_id}">', "\n" + script)
    return raw, page


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--verify", action="store_true", help="check raw.json and index.html are fresh")
    args = parser.parse_args()
    raw, page = render(build())
    targets = {HERE / "raw.json": raw, HERE / "index.html": page}
    if args.verify:
        stale = [p.name for p, text in targets.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        if stale:
            print("stale: " + ", ".join(stale) + " (run python build.py)", file=sys.stderr)
            sys.exit(1)
        print("raw.json and index.html are fresh")
        return
    for path, text in targets.items():
        path.write_text(text, encoding="utf-8")
    print(f"wrote raw.json and index.html ({TOP} outlets)")


if __name__ == "__main__":
    main()
