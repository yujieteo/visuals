"""The extraction's second check (extract/review.py) and its provenance records."""
import json
import sys
import unittest
from pathlib import Path

EXTRACT = Path(__file__).resolve().parent.parent / "extract"
sys.path.insert(0, str(EXTRACT))

import review  # noqa: E402


class ExtractionReview(unittest.TestCase):
    def test_representative_points_agree_with_an_independent_reading(self):
        results = review.check()
        self.assertGreaterEqual(len(results), 18)
        failed = [r for r in results if not r["pass"]]
        self.assertEqual(failed, [], failed)

    def test_units_and_conventions_match_the_figures(self):
        figures = json.loads((EXTRACT / "figures" / "figures.json").read_text(encoding="utf-8"))
        conv = json.loads((EXTRACT / "review.json").read_text(encoding="utf-8"))["units_and_conventions"]
        for f in figures["figures"]:
            self.assertIn(f"at {f['frequency_ghz']} GHz", f["caption"])
            self.assertEqual(conv["frequencies"][f["id"]], f["frequency_ghz"])
            self.assertIn("reconstructed (solid line) and original (dotted line)", f["caption"])
        self.assertEqual(figures["source"]["pdf_sha256"], "ba90dc215c62d56a248207a0bd92e9529f76f3924d15442776292801a268332c")

    def test_every_extraction_keeps_its_provenance(self):
        traces = json.loads((EXTRACT / "traces.json").read_text(encoding="utf-8"))
        for key in ("name", "version", "operator", "date"):
            self.assertTrue(traces["tool"][key])
        for f in traces["figures"]:
            cal = f["calibration"]
            self.assertEqual(len(cal["anchors"]), 4)
            self.assertEqual(cal["axis_scale"], {"x": "linear", "y": "linear"})
            self.assertTrue(all(abs(g["offset_px"]) <= 3 for g in cal["gridline_check"]["x"] + cal["gridline_check"]["y"]))
            budget = f["error_budget"]
            for key in ("image_resolution", "line_width", "anchor_placement", "repeat_extraction"):
                self.assertIn(key, budget)
            self.assertIn("not the uncertainty of the measurement", budget["method"])
            for t in f["traces"]:
                self.assertTrue((EXTRACT / t["review_overlay"]).is_file())
                self.assertTrue(t["gaps"] is not None)


if __name__ == "__main__":
    unittest.main()
