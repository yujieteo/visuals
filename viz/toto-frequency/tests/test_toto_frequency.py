import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIZ = ROOT
RESULTS_PAGE = "https://www.singaporepools.com.sg/en/product/sr/Pages/toto_results.aspx?sppl="
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def raw():
    return json.loads((VIZ / "raw.json").read_text(encoding="utf-8"))


def draws_csv():
    with open(VIZ / "draws.csv", newline="", encoding="utf-8") as handle:
        return {int(r["draw_no"]): r for r in csv.DictReader(handle)}


class TotoFrequencyTest(unittest.TestCase):
    def test_build_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / "toto-frequency"
            shutil.copytree(VIZ, copy, ignore=shutil.ignore_patterns("__pycache__", ".git", ".github", "tests"))
            subprocess.run([sys.executable, str(copy / "build.py")], check=True, capture_output=True)
            for name in ("raw.json", "index.html"):
                self.assertEqual((copy / name).read_text(encoding="utf-8"), (VIZ / name).read_text(encoding="utf-8"), name)

    def test_builder_verifies_the_committed_page(self):
        result = subprocess.run([sys.executable, str(VIZ / "build.py"), "--verify"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        shutil.rmtree(VIZ / "__pycache__", ignore_errors=True)

    def test_every_draw_is_a_sourced_singapore_pools_result(self):
        rows = draws_csv()
        for d in raw()["draws"]:
            row = rows[d["draw_no"]]
            self.assertEqual(d["winning"], [int(row[f"n{i}"]) for i in range(1, 7)], d["draw_no"])
            self.assertEqual(d["winning"], sorted(d["winning"]), d["draw_no"])
            self.assertEqual(d["additional"], int(row["additional"]), d["draw_no"])
            self.assertEqual(len(set(d["winning"] + [d["additional"]])), 7, d["draw_no"])
            self.assertTrue(all(1 <= n <= 49 for n in d["winning"] + [d["additional"]]), d["draw_no"])
            self.assertTrue(d["source_url"].startswith(RESULTS_PAGE), d["draw_no"])
            self.assertRegex(d["retrieved"], DATE)
        for source in raw()["sources"]:
            self.assertTrue(source["url"].startswith("https://www.singaporepools.com.sg/"), source["id"])
            self.assertRegex(source["retrieved"], DATE)

    def test_windows_count_back_from_the_latest_draw(self):
        data = raw()
        latest = date.fromisoformat(data["latest_draw"]["date"])
        self.assertEqual(data["draws"][0]["draw_no"], data["latest_draw"]["draw_no"])
        months = {"3m": 3, "6m": 6, "1y": 12}
        for w in data["windows"]:
            after = date.fromisoformat(w["after"])
            self.assertEqual((latest.year - after.year) * 12 + latest.month - after.month, months[w["id"]], w["id"])
            inside = [d for d in data["draws"] if d["date"] > w["after"]]
            self.assertEqual(len(inside), w["draws"], w["id"])
            self.assertEqual(inside[-1]["draw_no"], w["first_draw"]["draw_no"], w["id"])
            self.assertAlmostEqual(w["average_per_ball"], 6 * w["draws"] / 49, places=2)
        # The last year of draws is kept and nothing older.
        self.assertEqual(len(data["draws"]), data["windows"][-1]["draws"])

    def test_counts_and_bands_match_the_draws(self):
        data = raw()
        bands = data["bands"]
        self.assertEqual([(b["min"], b["max"]) for b in bands], [(0, 3), (4, 5), (6, 10), (11, None)])
        self.assertEqual([b["number"] for b in data["balls"]], list(range(1, 50)))
        for w in data["windows"]:
            inside = [d for d in data["draws"] if d["date"] > w["after"]]
            for b in data["balls"]:
                n = b["number"]
                count = sum(n in d["winning"] for d in inside)
                self.assertEqual(b["counts"][w["id"]], count, (w["id"], n))
                band = next(x for x in bands if count >= x["min"] and (x["max"] is None or count <= x["max"]))
                self.assertEqual(b["bands"][w["id"]], band["id"], (w["id"], n))

    def test_page_states_that_draws_are_random(self):
        self.assertIn("do not predict future draws", raw()["random_note"])


if __name__ == "__main__":
    unittest.main()
