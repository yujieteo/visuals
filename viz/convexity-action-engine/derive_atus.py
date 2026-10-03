"""Derive observed ATUS participation and duration for the action crosswalk.

Input: the BLS ATUS 2003-2016 activity summary and respondent files as
redistributed (with BLS permission) in the CRAN package `atus` 0.2,
https://github.com/cran/atus commit 1049d1d6f3857f221d3907f73df909cab20de5bb
(data/atusact.rda, data/atusresp.rda). Same input, years and weighting as
visuals/everyday-actions/derive_atus.py: ATUS final weight TUFNWGTP divided by
the number of pooled years.

Labels follow the BLS ATUS 2003-2016 activity lexicon. They were written from
the lexicon's published structure because bls.gov was unreachable; the
alphabetical tier-3 sports codes (1301xx) were checked against their observed
durations (fishing 256 min, golf 204, hunting 293, running 48, walking 54 min
when done). Only codes whose labels could be stated with confidence are listed.

Output: atus_observed.csv next to this file, one row per code or code group.

    pip install pandas rdata
    python derive_atus.py /path/to/cran-atus-checkout
"""

import csv
import sys
from pathlib import Path

import rdata

YEARS = (2014, 2015, 2016)
HERE = Path(__file__).resolve().parent

# code (tier-2 = 4 digits, tier-3 = 6 digits) -> lexicon label
CODES = {
    "0101": "Sleeping",
    "0102": "Grooming",
    "0103": "Health-related self care",
    "0201": "Housework",
    "020101": "Interior cleaning",
    "020102": "Laundry",
    "020103": "Sewing, repairing and maintaining textiles",
    "020104": "Storing interior household items, including food",
    "020201": "Food and drink preparation",
    "020203": "Kitchen and food clean-up",
    "020301": "Interior arrangement, decoration and repairs",
    "020302": "Building and repairing furniture",
    "0203": "Interior maintenance, repair and decoration",
    "0204": "Exterior maintenance, repair and decoration",
    "0205": "Lawn, garden and houseplants",
    "020501": "Lawn, garden and houseplant care",
    "0206": "Animals and pets",
    "0207": "Vehicles (maintenance and repair by self)",
    "0209": "Household management",
    "020901": "Financial management",
    "020902": "Household and personal organisation and planning",
    "020903": "Household and personal mail and messages (except e-mail)",
    "020904": "Household and personal e-mail and messages",
    "020905": "Home security",
    "0301": "Caring for and helping household children",
    "030102": "Reading to or with household children",
    "030103": "Playing with household children, not sports",
    "030112": "Picking up or dropping off household children",
    "0302": "Activities related to household children's education",
    "0304": "Caring for household adults",
    "0305": "Helping household adults",
    "0404": "Caring for non-household adults",
    "0401": "Caring for and helping non-household children",
    "0405": "Helping non-household adults",
    "0501": "Working",
    "0504": "Job search and interviewing",
    "0601": "Taking class",
    "0603": "Research and homework",
    "0701": "Shopping (store, telephone, internet)",
    "070101": "Grocery shopping",
    "070102": "Purchasing gas",
    "070103": "Purchasing food (not groceries)",
    "070104": "Shopping, except groceries, food and gas",
    "0802": "Financial services and banking",
    "0804": "Medical and care services",
    "0805": "Personal care services",
    "0901": "Household services (not done by self)",
    "0902": "Home maintenance, repair, decoration and construction (not done by self)",
    "0905": "Vehicle maintenance and repair services (not done by self)",
    "1101": "Eating and drinking",
    "1201": "Socializing and communicating",
    "1202": "Attending or hosting social events",
    "1203": "Relaxing and leisure",
    "120301": "Relaxing, thinking",
    "120303": "Television and movies (not religious)",
    "120305": "Listening to the radio",
    "120306": "Listening to or playing music (not radio)",
    "120307": "Playing games",
    "120308": "Computer use for leisure (excluding games)",
    "120309": "Arts and crafts as a hobby",
    "120312": "Reading for personal interest",
    "120313": "Writing for personal interest",
    "1204": "Arts and entertainment (other than sports)",
    "120401": "Attending performing arts",
    "120402": "Attending museums",
    "120403": "Attending movies or film",
    "1301": "Participating in sports, exercise or recreation",
    "130101": "Doing aerobics",
    "130103": "Playing basketball",
    "130104": "Biking",
    "130106": "Boating",
    "130108": "Climbing, spelunking and caving",
    "130107": "Bowling",
    "130109": "Dancing",
    "130112": "Fishing",
    "130113": "Playing football",
    "130114": "Golfing",
    "130116": "Hiking",
    "130119": "Martial arts",
    "130120": "Playing racquet sports",
    "130122": "Rollerblading",
    "130124": "Running",
    "130126": "Playing soccer",
    "130128": "Using cardiovascular equipment",
    "130130": "Playing volleyball",
    "130131": "Walking",
    "130132": "Participating in water sports",
    "130133": "Weightlifting or strength training",
    "130134": "Working out, unspecified",
    "130136": "Doing yoga",
    "1302": "Attending sporting or recreational events",
    "1401": "Religious and spiritual practices",
    "140101": "Attending religious services",
    "140102": "Participation in religious practices",
    "15": "Volunteer activities",
    "1601": "Telephone calls",
    "160101": "Telephone calls to or from family members",
    "160102": "Telephone calls to or from friends, neighbours or acquaintances",
    "18": "Traveling (all purposes)",
    "1805": "Travel related to work",
}


def load(root, name):
    return list(rdata.conversion.convert(rdata.parser.parse_file(root / f"data/{name}.rda")).values())[0]


def main():
    root = Path(sys.argv[1])
    act, resp = load(root, "atusact"), load(root, "atusresp")
    resp = resp[resp.tuyear.isin(YEARS)].copy()
    resp["wt"] = resp["wt"] / len(YEARS)
    act = act[act.tucaseid.isin(resp.tucaseid)].copy()
    act["text"] = act.tiercode.map(lambda c: f"{int(c):06d}")
    weights = resp.set_index("tucaseid").wt
    total = weights.sum()
    rows = []
    for code, label in CODES.items():
        did = act[act.text.str.startswith(code)].groupby("tucaseid").dur.sum()
        w = weights.reindex(did.index)
        rows.append([code, label, "2014-2016", len(resp), len(did),
                     f"{w.sum() / total:.4f}", f"{(w * did).sum() / w.sum():.1f}"])
    with open(HERE / "atus_observed.csv", "w", newline="", encoding="utf-8") as handle:
        out = csv.writer(handle, lineterminator="\n")
        out.writerow(["atus_code", "label", "years", "n_respondents", "n_doing",
                      "participation_rate", "minutes_when_performed"])
        out.writerows(rows)


if __name__ == "__main__":
    main()
