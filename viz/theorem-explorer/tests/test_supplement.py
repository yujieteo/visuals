"""The local result-pack queue rejects incomplete records and answers before publication."""
import copy
import sys
import tempfile
import unittest
from pathlib import Path

VIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(VIZ / "pipeline"))
import common
import judge
import supplement

DATA = VIZ / "data"


class ArithmeticTests(unittest.TestCase):
    def test_exact_arithmetic(self):
        self.assertEqual(supplement.arithmetic("2**10 - 1"), 1023)
        self.assertEqual(supplement.arithmetic("1/3 + 1/6"), supplement.arithmetic("1/2"))

    def test_rejects_code_and_large_input(self):
        for bad in ("__import__('os')", "2**100", "x + 1", "1/0", "1" * 600):
            with self.assertRaises(ValueError):
                supplement.arithmetic(bad)


class PackTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data = Path(self.tmp.name)
        self.records = common.read_json(DATA / "methods-results.json")["results"]

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, records, pack="methods"):
        common.write_json(self.data / f"{pack}-results.json", {"results": records})

    def test_packs_are_discovered(self):
        self.write(self.records)
        self.write(self.records[:0], "other")
        self.assertEqual(supplement.pack_names(self.data), ["methods", "other"])

    def test_committed_pack_is_valid(self):
        self.write(self.records)
        packs, _, _, _ = supplement.inputs(data=self.data)
        self.assertEqual(len(packs["methods"]), len(self.records))

    def rejects(self, mutate, text):
        records = copy.deepcopy(self.records)
        target = next(r for r in records if r["id"] == "nm:mathlib-nat-multichoose-eq")
        mutate(target)
        self.write(records)
        with self.assertRaisesRegex(ValueError, text):
            supplement.inputs(data=self.data)

    def test_rejects_unknown_prerequisite(self):
        self.rejects(lambda r: r["prerequisites"].append({"id": "nm:missing", "reason": "x" * 30}), "prerequisite")

    def test_rejects_wrong_calculation(self):
        def wrong(r):
            step = next(s for a in r["applications"] for s in a["steps"] if "expression" in s)
            step["expected"] = "12345"
        self.rejects(wrong, "calculation")

    def test_rejects_core_without_application(self):
        self.rejects(lambda r: r.update(applications=[]), "worked application")

    def test_rejects_changed_excerpt(self):
        self.rejects(lambda r: r["source"].update(excerpt="theorem changed"), "excerpt")

    def test_rejects_unknown_category(self):
        self.rejects(lambda r: r.update(cats=["math.XX"]), "taxonomy")

    def test_rejects_duplicate_name(self):
        self.rejects(lambda r: r.update(name="Fundamental theorem of algebra"), "duplicate name")

    def test_t2_worked_application_is_normalized(self):
        r = copy.deepcopy(next(x for x in self.records if x["applications"]))
        r["worked_application"] = r.pop("applications")[0]
        self.assertEqual(supplement.normalize(r)["applications"][0]["title"], r["worked_application"]["title"])


class ValidateTests(unittest.TestCase):
    def test_answer_rows_are_checked_against_ids(self):
        checker = judge.Checker({"nm:a"})
        row = {k: "3" for k in judge.COMPONENTS}
        row.update(id="nm:a", type="theorem", cats="math.CO", acats="", level="undergrad", effort="1/2/3", pre="",
                   rel="", conf="high", why="A specific explanation of the judgment.")
        text = common.to_toon({"answers": [row]})
        self.assertEqual(judge.validate_batch(text, ["nm:a"], checker)[0]["id"], "nm:a")
        with self.assertRaises(ValueError):
            judge.validate_batch(text, ["nm:b"], checker)
        row["cats"] = "math.XX"
        with self.assertRaises(ValueError):
            judge.validate_batch(common.to_toon({"answers": [row]}), ["nm:a"], checker)


if __name__ == "__main__":
    unittest.main()
