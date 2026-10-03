"""Torsion formulas against the numerical Prandtl reference."""

import json
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REF = HERE.parent / "reference"
sys.path.insert(0, str(REF))

import prandtl  # noqa: E402
import torsion_accuracy  # noqa: E402


class TorsionTest(unittest.TestCase):
    def test_prandtl_reference_reproduces_exact_solutions(self):
        exact = {
            ("circle", (("d", 80.0),)): math.pi * 80 ** 4 / 32,
            ("chs", (("d", 80.0), ("t", 10.0))): math.pi * (80 ** 4 - 60 ** 4) / 32,
            ("semicircle", (("d", 80.0),)): (math.pi / 2 - 4 / math.pi) * 40 ** 4,
        }
        for (shape, dims), J in exact.items():
            res = prandtl.shape_torsion(shape, dict(dims), [])
            self.assertLess(abs(res["J"] / J - 1), 1e-5, shape)
            self.assertLess(res["error"] / J, 1e-4, f"{shape} error estimate")

    def test_hollow_sections_use_the_circulation_condition(self):
        # Without the shared hole unknown the tube would be solved as a solid with a φ = 0 hole: far too stiff a drop.
        res = prandtl.shape_torsion("chs", {"d": 100.0, "t": 5.0}, [])
        J = math.pi * (100 ** 4 - 90 ** 4) / 32
        self.assertLess(abs(res["J"] / J - 1), 1e-5)

    def test_accuracy_table_is_current_and_every_formula_passes(self):
        self.assertEqual(torsion_accuracy.main(["--check"]), 0)
        data = json.loads((REF / "torsion-accuracy.json").read_text(encoding="utf-8"))
        for fid, entry in data["formulas"].items():
            self.assertTrue(entry["pass"], f"{fid} measured {entry['measured']} > stated {entry['stated']}")
            self.assertEqual(entry["measured"], float(f"{max(abs(c['rel_error']) for c in entry['checks']):.3g}"))

    def test_the_page_inlines_the_same_table(self):
        html = (HERE.parent / "index.html").read_text(encoding="utf-8")
        data = json.loads((REF / "torsion-accuracy.json").read_text(encoding="utf-8"))
        self.assertIn(json.dumps(data, ensure_ascii=False, separators=(",", ":")), html)


if __name__ == "__main__":
    unittest.main()
