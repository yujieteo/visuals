#!/usr/bin/env python3
"""Copy the NASA F-117 model curves and their provenance from viz/stealth-rcs/raw.json into data/evidence.json.

The radar network visualiser keeps these curves in a separate evidence panel. They are magnitude in dB with
the reference not stated, from one aluminum model; they are never converted to dBsm or m² and never enter a
power calculation. This script runs by hand when stealth-rcs changes (its checks never read another visual's
folder): it records the source file's SHA-256 and dataset version so the copy stays traceable.

Usage: python3 tools/import_evidence.py [path/to/stealth-rcs/raw.json]
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
DEFAULT = HERE.parent / "stealth-rcs" / "raw.json"
SERIES_KEYS = ["id", "figure", "figure_id", "caption", "locator", "trace_role", "role_label", "source_style", "units", "units_source", "reference", "conditions_id", "frequency_ghz", "sample_format", "segments", "gaps", "bounds"]
EXTRACTION_KEYS = ["method", "status", "error_median_db", "error_max_db", "experimental_uncertainty", "note"]


def main(argv):
    src = Path(argv[0]) if argv else DEFAULT
    raw = src.read_bytes()
    d = json.loads(raw)
    ds = next(x for x in d["datasets"] if x["id"] == "NASA-F117-MODEL")
    series = []
    for s in d["series"]:
        if s["dataset_id"] != ds["id"]:
            continue
        row = {k: s[k] for k in SERIES_KEYS}
        row["extraction"] = {k: s["extraction"][k] for k in EXTRACTION_KEYS}
        row["extraction"]["error_budget_method"] = s["extraction"]["error_budget"]["method"]
        series.append(row)
    try:
        commit = subprocess.run(["git", "log", "-1", "--format=%H", "--", src.name], cwd=src.parent, capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        commit = None
    out = {
        "note": "Separate evidence: magnitude in dB with the reference not stated, extracted from printed NASA figures of one aluminum F-117 model. Never converted to dBsm or m² and never used in an absolute power calculation. Written by tools/import_evidence.py.",
        "provenance": {
            "copied_from": "viz/stealth-rcs/raw.json in yujieteo/visuals",
            "source_sha256": hashlib.sha256(raw).hexdigest(),
            "source_commit": commit,
            "dataset_version": d["dataset_version"],
            "assessment_date": d["assessment_date"],
            "verification_limit": "The supplied page's local source was inspected because the live URL was unavailable during the specification task.",
        },
        "dataset": {k: ds[k] for k in ["id", "title", "units", "reference", "data_method", "angle_convention", "figures", "default_figure", "transfer_limit"]},
        "source": next(x for x in d["sources"] if x["id"] == ds["source_id"]),
        "test_article": next(x for x in d["test_articles"] if x["id"] == ds["article_id"]),
        "conditions": [c for c in d["conditions"] if c["id"] in {s["conditions_id"] for s in series}],
        "series": series,
        "limits": [
            "The magnitude reference is not stated, so the curves are not absolute RCS.",
            "The curves cover azimuth 175° to 185° only, with gaps where the line was not read.",
            "They describe one aluminum model in one test record, not a service aircraft.",
            "Extraction error describes how well the printed line is read; experimental uncertainty is not stated.",
            "Do not convert these values to dBsm or m², and do not use them for absolute power or range.",
        ],
    }
    (HERE / "data" / "evidence.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote data/evidence.json: {len(series)} series from {src.name} ({out['provenance']['source_sha256'][:12]})")


if __name__ == "__main__":
    main(sys.argv[1:])
