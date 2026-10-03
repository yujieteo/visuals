"""Derive ATUS participation and duration for the everyday-actions crosswalk.

Input: the BLS ATUS 2003-2016 multi-year activity summary, respondent and
ATUS-CPS files as redistributed (with BLS permission) in the CRAN package
`atus` 0.2, https://github.com/cran/atus commit
1049d1d6f3857f221d3907f73df909cab20de5bb (data/atusact.rda, atusresp.rda,
atuscps.rda). Tier codes follow the BLS ATUS 2003-2016 activity lexicon.

Every estimate uses the ATUS final weight (TUFNWGTP, column `wt`). For a
pooled set of years each respondent's weight is divided by the number of
years, the BLS convention for multi-year averages; proportions are unchanged
by that scaling.

Output (stdout): CSV rows, one per activity x population.

    python derive_atus.py /path/to/atus > atus_estimates.csv
"""

import csv
import datetime
import sys
from pathlib import Path

import pandas as pd
import rdata

YEARS = (2014, 2015, 2016)

# normalized id -> (ATUS tier codes or 2/4-digit prefixes, BLS lexicon label)
ACTIVITIES = {
    "sleeping": (["0101"], "0101 Sleeping"),
    "eating": (["1101"], "1101 Eating and drinking"),
    "preparing-food": (["020201"], "020201 Food and drink preparation"),
    "housework": (["0201"], "0201 Housework"),
    "lawn-garden": (["0205"], "0205 Lawn, garden, and houseplants"),
    "shopping": (["0701"], "0701 Shopping (store, telephone, internet)"),
    "childcare": (["0301", "0302", "0303"], "0301-0303 Caring for and helping household children"),
    "adult-care": (["0304", "0305"], "0304-0305 Caring for and helping household adults"),
    "working": (["0501"], "0501 Working"),
    "commuting": (["180501"], "180501 Travel related to working"),
    "attending-class": (["0601"], "0601 Taking class"),
    "homework": (["0603"], "0603 Research/homework"),
    "socializing": (["1201", "1202"], "1201 Socializing and communicating; 1202 Attending or hosting social events"),
    "relaxing": (["120301"], "120301 Relaxing, thinking"),
    "watching-tv": (["120303", "120304"], "120303 Television and movies (not religious); 120304 Television (religious)"),
    "gaming": (["120307"], "120307 Playing games"),
    "computer": (["120308"], "120308 Computer use for leisure (excluding games)"),
    "reading": (["120312"], "120312 Reading for personal interest"),
    "exercising": (["1301"], "1301 Participating in sports, exercise, or recreation"),
    "religious": (["14"], "14 Religious and spiritual activities"),
    "volunteering": (["15"], "15 Volunteer activities"),
    "phone": (["16"], "16 Telephone calls"),
}


def load(root, name):
    return list(rdata.conversion.convert(rdata.parser.parse_file(root / f"data/{name}.rda")).values())[0]


def matches(code, prefixes):
    text = f"{int(code):06d}"
    return any(text.startswith(p) for p in prefixes)


def main():
    root = Path(sys.argv[1])
    act, resp, cps = load(root, "atusact"), load(root, "atusresp"), load(root, "atuscps")
    resp = resp.merge(cps[["tucaseid", "sex", "age"]], on="tucaseid")
    resp = resp[resp.tuyear.isin(YEARS)].copy()
    resp["wt"] = resp["wt"] / len(YEARS)
    resp["weekday"] = [
        datetime.date(int(y), int(m), int(d)).weekday() < 5
        for y, m, d in zip(resp.tuyear, resp.diary_mo, resp.diary_day)
    ]
    act = act[act.tucaseid.isin(resp.tucaseid)]
    minutes = {}
    for key, (prefixes, _) in ACTIVITIES.items():
        mask = act.tiercode.map(lambda c: matches(c, prefixes))
        minutes[key] = act[mask].groupby("tucaseid").dur.sum()
    worked = minutes["working"].reindex(resp.tucaseid).fillna(0).to_numpy() > 0

    populations = {
        "all": ("Civilian noninstitutional population age 15+, all days", resp.index == resp.index),
        "weekday": ("Age 15+, Monday-Friday diary days", resp.weekday.to_numpy()),
        "weekend": ("Age 15+, Saturday-Sunday diary days", ~resp.weekday.to_numpy()),
        "drm-like": (
            "Employed women age 18+ who worked on a Monday-Friday diary day (mirrors the Kahneman et al. 2004 sample definition, not its location)",
            (resp.sex.astype(str) == "female").to_numpy()
            & (resp.age.astype(float) >= 18).to_numpy()
            & resp.labor_status.astype(str).str.startswith("employed").to_numpy()
            & resp.weekday.to_numpy()
            & worked,
        ),
    }
    out = csv.writer(sys.stdout, lineterminator="\n")
    out.writerow(["activity_id", "population_id", "population", "years", "n_respondents",
                  "participation_rate", "minutes_when_performed", "minutes_per_day_all", "atus_codes"])
    for pop_id, (label, mask) in populations.items():
        sub = resp[mask]
        w = sub.wt.to_numpy()
        for key, (_, codes) in ACTIVITIES.items():
            dur = minutes[key].reindex(sub.tucaseid).fillna(0).to_numpy()
            did = dur > 0
            rate = w[did].sum() / w.sum()
            when = (w[did] * dur[did]).sum() / w[did].sum() if did.any() else float("nan")
            avg = (w * dur).sum() / w.sum()
            out.writerow([key, pop_id, label, "2014-2016", len(sub),
                          f"{rate:.4f}", f"{when:.1f}", f"{avg:.1f}", codes])


if __name__ == "__main__":
    main()
