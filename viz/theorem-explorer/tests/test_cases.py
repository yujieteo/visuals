"""The comparison cases (spec section 6), recalculated here apart from src/model.js.

The browser calculates each guarantee in floating point from CASE_FORMULAS. This test works every case again from
data/cases.json with exact rationals where the formula allows it (math.comb, Fraction) and checks the value, the
threshold verdict, the rank order and the excluded entries that the viewer shows.
"""
import json
import math
import subprocess
import unittest
from fractions import Fraction
from pathlib import Path

VIZ = Path(__file__).resolve().parents[1]
CASES = json.loads((VIZ / "data" / "cases.json").read_text(encoding="utf-8"))

NODE = r"""
const Model = require(process.argv[1] + "/src/model.js");
const D = require(process.argv[1] + "/raw.json");
const ix = Model.index(D);
const out = {};
for (const c of D.cases.cases) out[c.id] = Model.comparison(D, ix, c.id, Model.PRESETS.balanced);
process.stdout.write(JSON.stringify(out));
"""


def kl(a, p):
    return a * math.log(a / p) + (1 - a) * math.log((1 - a) / (1 - p))


def exact(formula, v):
    """The value of a named formula, by its textbook statement."""
    if formula == "markov":
        return Fraction(v["n"]) * Fraction(v["p"]) / (Fraction(v["n"]) * Fraction(v["p"]) + v["t"])
    if formula == "chebyshev":
        p = Fraction(v["p"])
        return v["n"] * p * (1 - p) / Fraction(v["t"]) ** 2
    if formula == "chernoff_kl":
        return math.exp(-v["n"] * kl(v["p"] + v["t"] / v["n"], v["p"]))
    if formula == "hoeffding":
        return math.exp(-2 * v["t"] ** 2 / v["n"])
    if formula == "azuma":  # bounded differences c_i = max(p, 1 - p)
        c = max(v["p"], 1 - v["p"])
        return math.exp(-v["t"] ** 2 / (2 * v["n"] * c * c))
    if formula == "binomial_tail":
        p = Fraction(v["p"])
        lo = math.ceil(Fraction(v["n"]) * p + v["t"])
        return sum(math.comb(v["n"], k) * p ** k * (1 - p) ** (v["n"] - k) for k in range(lo, v["n"] + 1))
    if formula == "union_condition":
        return Fraction(v["m"], 2 ** v["k"])
    if formula == "lll_symmetric":
        return math.e * (v["d"] + 1) / 2 ** v["k"]
    if formula == "union_sum3":
        return sum(Fraction(str(v[x])) for x in "abc")
    if formula == "inclusion_exclusion3":
        f = {x: Fraction(str(v[x])) for x in v}
        return f["a"] + f["b"] + f["c"] - f["ab"] - f["ac"] - f["bc"] + f["abc"]
    if formula == "gauss_bonnet":  # chi = (1 / 2 pi) * integral of K dA, with constant K and area given in units of pi
        return Fraction(v["K"]) * Fraction(v["area_over_pi"]) / 2
    raise KeyError(formula)


THRESHOLD = {"union_condition": (lambda x: x < 1), "lll_symmetric": (lambda x: x <= 1)}


class CaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        out = subprocess.run(["node", "-e", NODE, str(VIZ)], capture_output=True, text=True, check=True)
        cls.view = json.loads(out.stdout)

    def test_every_case_has_the_section_6_parts(self):
        for case in CASES["cases"]:
            with self.subTest(case=case["id"]):
                for key in ("goal", "inputs", "hypotheses", "target", "metric"):
                    self.assertTrue(case.get(key), key)
                self.assertIn(case["metric"]["direction"], {"lower", "higher", "none"})
                for e in case["entries"]:
                    self.assertTrue(e.get("formula") or e.get("excluded"), e["result"])

    def test_values_match_an_exact_recalculation(self):
        for case in CASES["cases"]:
            shown = {e["result"]: e for e in self.view[case["id"]]["entries"]}
            for e in case["entries"]:
                with self.subTest(case=case["id"], result=e["result"]):
                    got = shown[e["result"]]
                    if e.get("excluded"):
                        self.assertIsNone(got["value"])
                        self.assertEqual(got["excluded"], e["excluded"])
                        continue
                    want = float(exact(e["formula"], case["inputs"]))
                    self.assertAlmostEqual(got["value"], want, delta=1e-9 * max(1, abs(want)))
                    if e["formula"] in THRESHOLD:
                        self.assertEqual(got["meets"], THRESHOLD[e["formula"]](want))

    def test_known_values(self):
        tail = {e["formula"]: float(exact(e["formula"], CASES["cases"][0]["inputs"])) for e in CASES["cases"][0]["entries"] if e.get("formula")}
        self.assertEqual(tail["markov"], 50 / 60)
        self.assertEqual(tail["chebyshev"], 0.25)
        self.assertAlmostEqual(tail["hoeffding"], math.exp(-2), places=15)
        # exact binomial check value: P(S >= 60) for S ~ Bin(100, 1/2)
        self.assertAlmostEqual(float(exact("binomial_tail", {"n": 100, "p": 0.5, "t": 10})), 0.02844396682049, places=12)
        self.assertFalse(THRESHOLD["union_condition"](exact("union_condition", {"k": 10, "m": 10000})))
        self.assertTrue(THRESHOLD["lll_symmetric"](exact("lll_symmetric", {"k": 10, "d": 300})))
        self.assertEqual(exact("gauss_bonnet", {"K": -1, "area_over_pi": 4}), -2)

    def test_every_bound_is_valid_against_the_exact_tail(self):
        case = next(c for c in CASES["cases"] if c["id"] == "tail-binomial")
        truth = float(exact("binomial_tail", case["inputs"]))
        for e in case["entries"]:
            if e.get("formula"):
                with self.subTest(result=e["result"]):
                    self.assertGreaterEqual(float(exact(e["formula"], case["inputs"])), truth)

    def test_rank_follows_the_metric_direction(self):
        for case in CASES["cases"]:
            view = self.view[case["id"]]
            ranked = sorted((e for e in view["entries"] if e["value"] is not None), key=lambda e: e.get("rank") or 0)
            with self.subTest(case=case["id"]):
                if case["metric"]["direction"] == "none":
                    self.assertIsNone(view["best"])
                    self.assertTrue(all("rank" not in e or e["rank"] is None for e in view["entries"]))
                    continue
                values = [e["value"] for e in ranked]
                self.assertEqual(values, sorted(values, reverse=case["metric"]["direction"] == "higher"))
                self.assertEqual(view["best"], ranked[0]["result"])


if __name__ == "__main__":
    unittest.main()
