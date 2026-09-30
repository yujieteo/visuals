"""Assemble data.csv and sources.json, and embed them in index.html.

Inputs, all checked in under data/everyday-actions:
  drm_table1.csv       transcription of Kahneman et al. (2004), Science 306:1777, Table 1
  atus_estimates.csv   output of derive_atus.py (ATUS 2014-2016 microdata)
  crosswalk.csv        normalized activity <-> DRM row <-> ATUS tier codes
  decisions.csv        100 actions with authored ordinal codes (not measurements)
  evidence.json        studies cited by decisions.csv and the reconsideration section

Outputs:
  data.csv             one row per normalized activity; missing values stay empty
  sources.json         citations plus one record per number shown in the graph
  viz/everyday-actions/index.html   rendered from scripts/templates/everyday-actions.html

    python3 scripts/build_everyday_actions.py
    python3 scripts/build_everyday_actions.py --verify
"""

import argparse
import csv
import io
import json
import re
from pathlib import Path

from gallery import render_gallery

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / "data" / "everyday-actions"
VIZ = ROOT / "viz" / "everyday-actions" / "index.html"
TEMPLATE = ROOT / "scripts" / "templates" / "everyday-actions.html"

DRM_SOURCE = "kahneman2004"
ATUS_SOURCE = "atus2014_2016"
DRM_POPULATION = (
    "909 employed women (convenience sample) who worked on the reconstructed day; "
    "mean age 38; 49% white non-Hispanic, 24% African American, 22% Hispanic"
)
DRM_LOCATION = "Science 306:1777, Table 1 'Mean affect by situation', row '{label}', column '{column}'"
DRM_SCALE = "0 (not at all) to 6 (very much), mean over episodes"
DRM_METRICS = {
    "positive_affect": ("Positive affect", DRM_SCALE + "; average of happy, warm/friendly, enjoying myself", "Positive"),
    "negative_affect": ("Negative affect", DRM_SCALE + "; average of six negative descriptors", "Negative"),
    "competent": ("Competent", DRM_SCALE, "Competent"),
    "impatient": ("Impatient", DRM_SCALE, "Impatient"),
    "tired": ("Tired", DRM_SCALE, "Tired"),
    "mean_hours_per_day": ("Mean hours per day, all respondents", "hours per day", "Mean hours/day"),
    "proportion_reporting": ("Proportion of sample reporting at least one episode", "proportion 0-1", "Proportion of sample reporting"),
}
ATUS_POPULATIONS = {"all": "all", "weekday": "weekday", "weekend": "weekend", "drm-like": "drm_like"}

DATA_COLUMNS = [
    "activity_id", "activity", "crosswalk_match",
    "drm_proportion_reporting", "drm_mean_hours_per_day", "drm_positive_affect",
    "drm_negative_affect", "drm_net_affect", "drm_competent", "drm_impatient", "drm_tired",
] + [
    f"atus_{metric}_{suffix}"
    for suffix in ATUS_POPULATIONS.values()
    for metric in ("participation", "minutes_when_performed")
] + ["source_frequency", "source_affect"]


def read_csv(name):
    with open(HERE / name, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def build():
    crosswalk = read_csv("crosswalk.csv")
    drm = {row["drm_label"]: row for row in read_csv("drm_table1.csv")}
    atus = {(row["activity_id"], row["population_id"]): row for row in read_csv("atus_estimates.csv")}
    evidence = json.loads((HERE / "evidence.json").read_text(encoding="utf-8"))
    decisions = read_csv("decisions.csv")

    measurements, rows = [], []
    for item in crosswalk:
        key = item["activity_id"]
        row = {column: "" for column in DATA_COLUMNS}
        row.update(activity_id=key, activity=item["activity"], crosswalk_match=item["match"])
        label = item["drm_label"]
        if label:
            source_row = drm[label]
            for metric, (name, unit, column) in DRM_METRICS.items():
                value = float(source_row[metric])
                row[f"drm_{metric}"] = source_row[metric]
                measurements.append({
                    "id": f"drm:{key}:{metric}", "activity_id": key, "metric": name,
                    "value": value, "unit": unit, "kind": "measured (as published)",
                    "population": DRM_POPULATION, "n": 909, "year": 2004,
                    "source": DRM_SOURCE, "source_category": label,
                    "location": DRM_LOCATION.format(label=label, column=column),
                })
            net = round(float(source_row["positive_affect"]) - float(source_row["negative_affect"]), 2)
            row["drm_net_affect"] = f"{net:.2f}"
            measurements.append({
                "id": f"drm:{key}:net_affect", "activity_id": key, "metric": "Net affect",
                "value": net, "unit": "positive minus negative affect, both 0-6", "kind": "transformation",
                "formula": "drm_positive_affect - drm_negative_affect (the paper's own definition of net affect)",
                "population": DRM_POPULATION, "n": 909, "year": 2004,
                "source": DRM_SOURCE, "source_category": label,
                "location": DRM_LOCATION.format(label=label, column="Positive, Negative"),
            })
            row["source_affect"] = DRM_SOURCE
        if item["atus_codes"]:
            for population_id, suffix in ATUS_POPULATIONS.items():
                estimate = atus[(key, population_id)]
                for metric, name, unit in (
                    ("participation", "Share engaging on an average day", "proportion 0-1"),
                    ("minutes_when_performed", "Minutes per day among those engaging", "minutes"),
                ):
                    value = estimate["participation_rate" if metric == "participation" else metric]
                    row[f"atus_{metric}_{suffix}"] = value
                    measurements.append({
                        "id": f"atus:{key}:{metric}:{population_id}", "activity_id": key, "metric": name,
                        "value": float(value), "unit": unit, "kind": "estimate computed from public microdata",
                        "population": estimate["population"], "population_id": population_id,
                        "n": int(estimate["n_respondents"]), "year": estimate["years"],
                        "source": ATUS_SOURCE, "source_category": item["atus_label"],
                        "location": f"ATUS activity tier codes {estimate['atus_codes']}; weight TUFNWGTP; see derive_atus.py",
                    })
            row["source_frequency"] = ATUS_SOURCE
        rows.append(row)

    handle = io.StringIO(newline="")
    writer = csv.DictWriter(handle, fieldnames=DATA_COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    outputs = {HERE / "data.csv": handle.getvalue()}

    sources = {
        "note": "Generated by build.py. Every number plotted in the first chart has one record in `measurements`.",
        "sources": evidence["sources"],
        "measurements": measurements,
    }
    outputs[HERE / "sources.json"] = json.dumps(sources, indent=2, ensure_ascii=False) + "\n"

    for decision in decisions:
        for field in ("reversibility", "time_sensitivity", "downside", "upside", "information"):
            decision[field] = int(decision[field])
        decision["evidence"] = [e for e in decision["evidence"].split(";") if e]
    payload = {
        "activities": rows,
        "crosswalk": crosswalk,
        "measurements": measurements,
        "sources": evidence["sources"],
        "decisions": decisions,
        "reconsider_examples": evidence["reconsider_examples"],
    }
    html = TEMPLATE.read_text(encoding="utf-8")
    block = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html, count = re.subn(
        r'(<script type="application/json" id="dataset">).*?(</script>)',
        lambda match: match.group(1) + block + match.group(2),
        html,
        flags=re.S,
    )
    if count != 1:
        raise SystemExit("index.html needs exactly one <script id=\"dataset\"> block")
    outputs[VIZ] = html
    assert len(decisions) == 100 and len({d["id"] for d in decisions}) == 100
    for decision in decisions:
        assert all(1 <= decision[field] <= 5 for field in ("reversibility", "time_sensitivity", "downside", "upside", "information"))
        assert all(key in evidence["sources"] for key in decision["evidence"])
    assert len(measurements) > 250 and len({m["id"] for m in measurements}) == len(measurements)
    assert '<script src=' not in html and '<link rel="stylesheet"' not in html
    assert not re.search(r'''src=["']https?://''', html), "external asset"
    print(f"{len(rows)} activities, {len(measurements)} measurements, {len(decisions)} decisions")
    return outputs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    outputs = build()
    meta = json.loads((HERE / "meta.json").read_text(encoding="utf-8"))
    assert meta["slug"] == "everyday-actions" and meta["key_file_used"] is False
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["fetched"])
    for path, text in outputs.items():
        if args.verify:
            assert path.read_text(encoding="utf-8") == text, f"{path.relative_to(ROOT)} is stale"
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
    gallery = render_gallery(ROOT)
    if args.verify:
        assert (ROOT / "index.html").read_text(encoding="utf-8") == gallery, "gallery is stale"
    else:
        (ROOT / "index.html").write_text(gallery, encoding="utf-8")


if __name__ == "__main__":
    main()
