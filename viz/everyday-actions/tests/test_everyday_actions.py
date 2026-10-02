import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIZ = ROOT


def read_csv(name):
    with open(VIZ / name, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


class EverydayActionsTest(unittest.TestCase):
    def test_build_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / "everyday-actions"
            shutil.copytree(VIZ, copy, ignore=shutil.ignore_patterns("__pycache__", ".git", ".github", "tests"))
            subprocess.run([sys.executable, str(copy / "build.py")], check=True, capture_output=True)
            for name in ("data.csv", "sources.json", "index.html"):
                self.assertEqual((copy / name).read_text(encoding="utf-8"), (VIZ / name).read_text(encoding="utf-8"), name)

    def test_every_plotted_value_has_a_source_measurement(self):
        measurements = {m["id"]: m for m in json.loads((VIZ / "sources.json").read_text())["measurements"]}
        populations = {"all": "all", "weekday": "weekday", "weekend": "weekend", "drm_like": "drm-like"}
        checked = 0
        for row in read_csv("data.csv"):
            key = row["activity_id"]
            for column, value in row.items():
                if not value or column in ("activity_id", "activity", "crosswalk_match", "source_frequency", "source_affect"):
                    continue
                if column.startswith("drm_"):
                    measurement_id = f"drm:{key}:{column[4:]}"
                else:
                    match = re.fullmatch(r"atus_(participation|minutes_when_performed)_(all|weekday|weekend|drm_like)", column)
                    self.assertIsNotNone(match, column)
                    measurement_id = f"atus:{key}:{match.group(1)}:{populations[match.group(2)]}"
                self.assertIn(measurement_id, measurements)
                self.assertAlmostEqual(measurements[measurement_id]["value"], float(value), places=4)
                self.assertTrue(measurements[measurement_id]["location"])
                checked += 1
        self.assertGreater(checked, 250)

    def test_drm_values_match_the_transcribed_table_and_missing_stays_missing(self):
        table = {row["drm_label"]: row for row in read_csv("drm_table1.csv")}
        crosswalk = {row["activity_id"]: row for row in read_csv("crosswalk.csv")}
        for row in read_csv("data.csv"):
            label = crosswalk[row["activity_id"]]["drm_label"]
            if not label:
                self.assertEqual(row["drm_positive_affect"], "", row["activity_id"])
                continue
            self.assertEqual(row["drm_positive_affect"], table[label]["positive_affect"])
            self.assertEqual(row["drm_proportion_reporting"], table[label]["proportion_reporting"])

    def test_decision_codes_are_bounded_and_evidence_is_cited(self):
        sources = json.loads((VIZ / "evidence.json").read_text())["sources"]
        activities = {row["activity_id"] for row in read_csv("crosswalk.csv")}
        decisions = read_csv("decisions.csv")
        self.assertEqual(len(decisions), 100)
        self.assertEqual(len({d["id"] for d in decisions}), 100)
        for decision in decisions:
            for field in ("reversibility", "time_sensitivity", "downside", "upside", "information"):
                self.assertIn(int(decision[field]), range(1, 6), decision["id"])
            for key in filter(None, decision["evidence"].split(";")):
                self.assertIn(key, sources)
            if decision["atus_parent"]:
                self.assertIn(decision["atus_parent"], activities)


if __name__ == "__main__":
    unittest.main()


sys.path.insert(0, str(ROOT))
import build  # noqa: E402


class BuildStagesTest(unittest.TestCase):
    def test_activity_rows_leave_missing_sources_empty(self):
        crosswalk = [
            {"activity_id": "both", "activity": "Both", "match": "close", "drm_label": "Eating", "atus_codes": "11", "atus_label": "Eating"},
            {"activity_id": "none", "activity": "Neither", "match": "none", "drm_label": "", "atus_codes": "", "atus_label": ""},
        ]
        drm = {"Eating": {m: "1.5" for m in build.DRM_METRICS} | {"positive_affect": "4.10", "negative_affect": "0.55"}}
        atus = {("both", p): {"participation_rate": "0.9", "minutes_when_performed": "60", "population": p, "n_respondents": "10",
                              "years": "2014-2016", "atus_codes": "11"} for p in build.ATUS_POPULATIONS}
        rows, measurements = build.activity_rows(crosswalk, drm, atus)
        self.assertEqual(rows[0]["drm_net_affect"], "3.55")
        self.assertEqual(rows[0]["atus_participation_drm_like"], "0.9")
        self.assertEqual((rows[0]["source_affect"], rows[0]["source_frequency"]), (build.DRM_SOURCE, build.ATUS_SOURCE))
        self.assertTrue(all(v == "" for k, v in rows[1].items() if k not in ("activity_id", "activity", "crosswalk_match")))
        # Seven DRM metrics plus net affect, and two ATUS metrics for each of four populations.
        self.assertEqual(len(measurements), len(build.DRM_METRICS) + 1 + 2 * len(build.ATUS_POPULATIONS))
        net = next(m for m in measurements if m["id"] == "drm:both:net_affect")
        self.assertEqual((net["kind"], net["value"]), ("transformation", 3.55))

    def test_replace_block_needs_exactly_one_block(self):
        html = '<script id="report">old</script>'
        self.assertEqual(build.replace_block(html, "report", "new"), '<script id="report">new</script>')
        with self.assertRaises(SystemExit):
            build.replace_block(html + html, "report", "new")
        with self.assertRaises(SystemExit):
            build.replace_block("<p></p>", "report", "new")
