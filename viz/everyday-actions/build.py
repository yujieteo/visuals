"""Assemble data.csv and sources.json, and embed them in index.html.

Inputs, all checked in next to this file:
  drm_table1.csv       transcription of Kahneman et al. (2004), Science 306:1777, Table 1
  atus_estimates.csv   output of derive_atus.py (ATUS 2014-2016 microdata)
  crosswalk.csv        normalized activity <-> DRM row <-> ATUS tier codes
  decisions.csv        100 actions with authored ordinal codes (not measurements)
  evidence.json        studies cited by decisions.csv and the reconsideration section
  beamdswitch.js       the site's standard beamdswitch report template, unchanged
  report.js            the page's axes and its current view as a beamdswitch report

Outputs:
  data.csv             one row per normalized activity; missing values stay empty
  sources.json         citations plus one record per number shown in the graph
  index.html           the <script id="dataset">, <script id="beamdswitch"> and <script id="report">
                       blocks are rewritten in place

    python build.py
"""

import csv
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

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


ATUS_METRICS = (
    ("participation", "Share engaging on an average day", "proportion 0-1"),
    ("minutes_when_performed", "Minutes per day among those engaging", "minutes"),
)


def drm_measurement(key, label, metric_id, name, value, unit, column, **extra):
    """One DRM number with its provenance: Table 1 of Kahneman et al. (2004)."""
    return {
        "id": f"drm:{key}:{metric_id}", "activity_id": key, "metric": name,
        "value": value, "unit": unit, **extra,
        "population": DRM_POPULATION, "n": 909, "year": 2004,
        "source": DRM_SOURCE, "source_category": label,
        "location": DRM_LOCATION.format(label=label, column=column),
    }


def add_drm(row, key, label, source_row, measurements):
    """Copy one activity's DRM affect values into its row, with net affect derived as the paper defines it."""
    for metric, (name, unit, column) in DRM_METRICS.items():
        row[f"drm_{metric}"] = source_row[metric]
        measurements.append(drm_measurement(key, label, metric, name, float(source_row[metric]), unit, column, kind="measured (as published)"))
    net = round(float(source_row["positive_affect"]) - float(source_row["negative_affect"]), 2)
    row["drm_net_affect"] = f"{net:.2f}"
    measurements.append(drm_measurement(
        key, label, "net_affect", "Net affect", net, "positive minus negative affect, both 0-6", "Positive, Negative",
        kind="transformation", formula="drm_positive_affect - drm_negative_affect (the paper's own definition of net affect)",
    ))
    row["source_affect"] = DRM_SOURCE


def add_atus(row, key, item, atus, measurements):
    """Copy one activity's ATUS participation and minutes for every population into its row."""
    for population_id, suffix in ATUS_POPULATIONS.items():
        estimate = atus[(key, population_id)]
        for metric, name, unit in ATUS_METRICS:
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


def activity_rows(crosswalk, drm, atus):
    """One data.csv row per crosswalk activity, and one measurement record per number in it."""
    measurements, rows = [], []
    for item in crosswalk:
        key = item["activity_id"]
        row = {column: "" for column in DATA_COLUMNS}
        row.update(activity_id=key, activity=item["activity"], crosswalk_match=item["match"])
        if item["drm_label"]:
            add_drm(row, key, item["drm_label"], drm[item["drm_label"]], measurements)
        if item["atus_codes"]:
            add_atus(row, key, item, atus, measurements)
        rows.append(row)
    return rows, measurements


def parse_decisions(decisions):
    """The authored ordinal codes as integers and the evidence ids as a list."""
    for decision in decisions:
        for field in ("reversibility", "time_sensitivity", "downside", "upside", "information"):
            decision[field] = int(decision[field])
        decision["evidence"] = [e for e in decision["evidence"].split(";") if e]
    return decisions


def replace_block(html, block_id, content, opening=None):
    """Replace the body of the page's one <script id=block_id> block."""
    opening = opening or f'<script id="{block_id}">'
    html, count = re.subn(
        rf"({re.escape(opening)}).*?(</script>)",
        lambda match: match.group(1) + content + match.group(2),
        html,
        flags=re.S,
    )
    if count != 1:
        raise SystemExit(f'index.html needs exactly one <script id="{block_id}"> block')
    return html


def main():
    crosswalk = read_csv("crosswalk.csv")
    drm = {row["drm_label"]: row for row in read_csv("drm_table1.csv")}
    atus = {(row["activity_id"], row["population_id"]): row for row in read_csv("atus_estimates.csv")}
    evidence = json.loads((HERE / "evidence.json").read_text(encoding="utf-8"))
    decisions = parse_decisions(read_csv("decisions.csv"))
    rows, measurements = activity_rows(crosswalk, drm, atus)

    with open(HERE / "data.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=DATA_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    sources = {
        "note": "Generated by build.py. Every number plotted in the first chart has one record in `measurements`.",
        "sources": evidence["sources"],
        "measurements": measurements,
    }
    (HERE / "sources.json").write_text(json.dumps(sources, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    payload = {
        "activities": rows,
        "crosswalk": crosswalk,
        "measurements": measurements,
        "sources": evidence["sources"],
        "decisions": decisions,
        "reconsider_examples": evidence["reconsider_examples"],
    }
    html_path = HERE / "index.html"
    html = html_path.read_text(encoding="utf-8")
    dataset = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = replace_block(html, "dataset", dataset, opening='<script type="application/json" id="dataset">')
    for block_id, name in (("beamdswitch", "beamdswitch.js"), ("report", "report.js")):
        script = (HERE / name).read_text(encoding="utf-8")
        if "</script" in script:
            raise SystemExit(f"{name} must not contain </script")
        html = replace_block(html, block_id, "\n" + script)
    html_path.write_text(html, encoding="utf-8")
    print(f"{len(rows)} activities, {len(measurements)} measurements, {len(decisions)} decisions")


if __name__ == "__main__":
    main()
