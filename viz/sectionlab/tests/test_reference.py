"""The Python references against closed forms, and the stored reference files against a rebuild."""

import json
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REF = HERE.parent / "reference"
sys.path.insert(0, str(REF))

import build_reference  # noqa: E402
import cases as C  # noqa: E402
import sectionref as R  # noqa: E402

class ReferenceTest(unittest.TestCase):
    def test_fixture_and_reference_files_are_current(self):
        self.assertEqual(build_reference.main(["--check"]), 0)

    def test_check_ignores_rounding_noise_but_not_real_changes(self):
        stored = json.loads(build_reference.REFERENCE.read_text(encoding="utf-8"))

        def edited(cid, change):
            copy = json.loads(json.dumps(stored))
            change(copy["cases"][cid])
            return copy

        # M at κ = 0 under N for 'mixed' is ~1e-3 N·mm of rounding noise; numpy 2.1 and 2.5 disagree on it.
        noise = edited("mixed", lambda c: c["plastic"]["points"][0].update(M=0.000759874854592224))
        self.assertTrue(build_reference.close(stored, noise))
        self.assertTrue(build_reference.close(stored, edited("circle", lambda c: c["properties"].update(Ixy=1e-9))))
        self.assertFalse(build_reference.close(stored, edited("mixed", lambda c: c["plastic"]["points"][4].update(M=c["plastic"]["points"][4]["M"] * (1 + 1e-7)))))
        self.assertFalse(build_reference.close(stored, edited("circle", lambda c: c["properties"].update(Ixy=100.0))))
        self.assertFalse(build_reference.close(stored, edited("rect", lambda c: c["plastic"].update(Mp=c["plastic"]["Mp"] * (1 + 1e-7)))))

    def test_area_reference_matches_closed_forms(self):
        checked = 0
        for case in C.CASES:
            p = R.properties(case["model"])
            for e in case["expect"]:
                q = e["quantity"]
                if q not in build_reference.DIM:
                    continue
                scale = max(abs(e["value"]), abs(p[q]), math.sqrt(p["A"]) ** build_reference.DIM[q])
                self.assertLessEqual(abs(p[q] - e["value"]), 1e-9 * scale, f"{case['id']} {q} = {e['formula']}")
                checked += 1
        self.assertGreaterEqual(checked, 25)

    def test_clipped_moments_are_exact(self):
        # Half a disk, a quarter of a disk and a disk cut by a chord, from the disk ∩ half-plane routine.
        r = 3.0
        half = R.disk_convex_moments((0.0, 0.0), r, [(0.0, 1.0, 0.0)])
        self.assertAlmostEqual(half[0], math.pi * r * r / 2, delta=1e-12)
        self.assertAlmostEqual(half[2] / half[0], 4 * r / (3 * math.pi), delta=1e-12)
        quarter = R.disk_convex_moments((0.0, 0.0), r, [(0.0, 1.0, 0.0), (1.0, 0.0, 0.0)])
        self.assertAlmostEqual(quarter[0], math.pi * r * r / 4, delta=1e-12)
        h = 1.0
        cap = R.disk_convex_moments((0.0, 0.0), r, [(0.0, 1.0, r - h)])
        self.assertAlmostEqual(cap[0], r * r * math.acos((r - h) / r) - (r - h) * math.sqrt(2 * r * h - h * h), delta=1e-12)

    def test_plastic_reference_matches_closed_forms(self):
        import plasticref as P
        for case in C.CASES:
            if not case["plastic"]:
                continue
            m = case["model"]
            S = P.Section(m, P.axis_angle(m, m["plastic"]["axis"]))
            mp = S.plastic_moment(0.0)["M"]
            for e in case["expect"]:
                if e["quantity"] == "Zp":
                    self.assertAlmostEqual(mp / m["materials"][0]["sigma02"], e["value"], delta=1e-7 * e["value"], msg=case["id"])
                if e["quantity"] == "Mp":
                    self.assertAlmostEqual(mp, e["value"], delta=1e-7 * e["value"], msg=case["id"])
                if e["quantity"] == "MpN":
                    mpn = S.plastic_moment(m["plastic"]["N"])["M"]
                    self.assertAlmostEqual(mpn, e["value"], delta=1e-7 * e["value"], msg=case["id"])

    def test_plastic_reference_is_linear_elastic_at_small_curvature(self):
        import plasticref as P
        m = next(c for c in C.CASES if c["id"] == "composite")["model"]
        S = P.Section(m, 0.0)
        p = R.properties(m)
        k = 1e-9
        _, M = S.resultants(S.solve_e0(k, 0.0), k)
        self.assertAlmostEqual(M, m["E_base"] * p["Ix"] * k, delta=1e-6 * abs(M))


if __name__ == "__main__":
    unittest.main()
