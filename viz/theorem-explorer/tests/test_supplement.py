"""The local queue rejects incomplete proofs and answers before publication."""
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

VIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(VIZ / "pipeline"))
import common
import judge
import run
import supplement

IDENTITY = {"id": "judge/test", "model": "test-model", "provider": "test", "session": "test", "access": "local fixture"}


class SupplementTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.visual = self.root / "visual"
        self.visual.mkdir()
        self.records = common.read_json(VIZ / "data" / "supplement-results.json")["results"][:6]
        self.saved = common.read_json(VIZ / "data" / "supplement-judgments.json")
        base = subprocess.check_output(["git", "show", "HEAD:viz/theorem-explorer/raw.json"], cwd=VIZ)
        self.base = json.loads(base)
        # This fixture always starts with only the historical rows.
        core = supplement.unpack(self.base, "core")
        if any(r.get("supplement") for r in core["rows"]):
            core["rows"] = [r for r in core["rows"] if not r.get("supplement")]
            core["relations"] = [r for r in core["relations"] if not r.get("supplement")]
            import assemble
            self.base["packs"]["core"] = assemble.pack(core)
            self.base["packs"]["detail"] = assemble.pack(supplement.unpack(self.base, "detail")[:len(core["rows"])])
        common.write_json(self.visual / "raw.json", self.base)
        self.data = self.root / "data"
        common.write_json(self.data / "rubric.json", common.read_json(VIZ / "data" / "rubric.json"))
        common.write_json(self.data / "sources" / "manifest.json", common.read_json(VIZ / "data" / "sources" / "manifest.json"))
        self.paths = patch.multiple(supplement, VISUAL=self.visual, DATA=self.data, RESULTS=self.data / "results.json",
                                    JUDGMENTS=self.data / "judgments.json", QUEUE=self.root / "queue")
        self.paths.start()
        self.run_paths = patch.multiple(run, OUT=self.root / "out", SNAPSHOTS=self.root / "snapshots")
        self.run_paths.start()
        common.write_json(supplement.RESULTS, {"results": self.records})
        supplement.prepare(batch_size=6)
        self.entry = common.read_json(supplement.QUEUE / "index.json")[0]
        self.answer = self.root / "answer.toon"
        ids = self.entry["ids"]
        self.tables = {"answers": [self.saved[i]["answer"] for i in ids], "reviews": [self.saved[i]["review"] for i in ids],
                       "steps": [s for i in ids for s in self.saved[i]["step_reviews"]]}
        self.write_answer()

    def tearDown(self):
        self.run_paths.stop()
        self.paths.stop()
        self.tmp.cleanup()

    def write_answer(self, tables=None):
        self.answer.write_text(common.to_toon(tables or self.tables) + "\
")

    def test_bounded_prompt_preserves_complete_statements_conditions_and_proofs(self):
        text = (supplement.QUEUE / (self.entry["batch"] + ".toon")).read_text()
        self.assertLessEqual(len(text), 48000)
        for r in self.records:
            self.assertIn(json.dumps(r["statement"], ensure_ascii=False)[1:-1], text)
            for s in r["proof"]["steps"]:
                self.assertIn(json.dumps(s["text"], ensure_ascii=False)[1:-1], text)
        with self.assertRaisesRegex(ValueError, "exceed"):
            supplement.prepare(max_chars=1000)

    def test_complete_queue_accept_build_and_idempotent_resume(self):
        supplement.accept(self.entry["batch"], self.answer, IDENTITY)
        with patch.object(run, "publish") as publish:
            first = supplement.build()
        publish.assert_called_once()
        self.assertEqual(first["catalog"]["after"], len(supplement.unpack(self.base, "core")["rows"]) + 6)
        built = common.read_json(run.OUT / "raw.json")
        self.assertEqual(built["snapshot"]["judge"], self.base["snapshot"]["judge"])
        old = supplement.unpack(self.base, "core")["rows"]
        self.assertEqual(supplement.unpack(built, "core")["rows"][:len(old)], old)
        details = supplement.unpack(built, "detail")
        self.assertTrue(all(d["proof"]["steps"] and d["assessment"]["judge"] == IDENTITY for d in details[len(old):]))
        common.write_json(self.visual / "raw.json", built)
        with patch.object(run, "publish"):
            supplement.build()
        self.assertEqual(common.read_json(run.OUT / "raw.json"), built)
        self.assertEqual(supplement.prepare()["queue"]["unresolved"], 0)

    def test_bad_batches_make_no_judgment_file(self):
        for field, value in (("eff", 5), ("cats", "math.XX"), ("pre", "nm:missing"), ("why", "short"), ("type", "invalid")):
            tables = copy.deepcopy(self.tables)
            tables["answers"][0][field] = value
            self.write_answer(tables)
            with self.subTest(field=field), self.assertRaises(ValueError):
                supplement.accept(self.entry["batch"], self.answer, IDENTITY)
            self.assertFalse(supplement.JUDGMENTS.exists())
        for key in ("answers", "reviews", "steps"):
            tables = copy.deepcopy(self.tables)
            tables[key].pop()
            self.write_answer(tables)
            with self.subTest(key=key), self.assertRaises(ValueError):
                supplement.accept(self.entry["batch"], self.answer, IDENTITY)
        tables = copy.deepcopy(self.tables)
        tables["answers"][-1] = tables["answers"][0]
        self.write_answer(tables)
        with self.assertRaises(ValueError):
            supplement.accept(self.entry["batch"], self.answer, IDENTITY)

    def test_unknown_identity_changed_packet_and_incomplete_record_stop_acceptance(self):
        with self.assertRaises(ValueError):
            supplement.accept(self.entry["batch"], self.answer, judge.JUDGE)
        packet = supplement.QUEUE / (self.entry["batch"] + ".toon")
        packet.write_text(packet.read_text() + "changed")
        with self.assertRaisesRegex(ValueError, "queue input changed"):
            supplement.accept(self.entry["batch"], self.answer, IDENTITY)
        self.records[0]["hypotheses"] = []
        common.write_json(supplement.RESULTS, {"results": self.records})
        with self.assertRaisesRegex(ValueError, "hypotheses"):
            supplement.prepare()

    def test_incomplete_queue_blocks_publish_and_corrupt_cache_blocks_build(self):
        with patch.object(run, "publish") as publish, self.assertRaisesRegex(ValueError, "unresolved"):
            supplement.build()
        publish.assert_not_called()
        supplement.accept(self.entry["batch"], self.answer, IDENTITY)
        saved = common.read_json(supplement.JUDGMENTS)
        saved[self.records[0]["id"]]["scores"]["eff"] = 9
        common.write_json(supplement.JUDGMENTS, saved)
        with patch.object(run, "publish") as publish, self.assertRaisesRegex(ValueError, "differs"):
            supplement.build()
        publish.assert_not_called()

    def test_toon_rejects_duplicate_fields_keys_and_invalid_indentation(self):
        for text in ("x: 1\
x: 2", "answers[1]{id,id}:\
  a,a", "x:\
   a: 1", "x[1]{a}:\
1"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                common.from_toon(text)

    def test_publish_restores_both_artifacts_after_a_builder_failure(self):
        common.write_json(run.OUT / "raw.json", {"new": True})
        (self.visual / "index.html").write_text("old html")
        before = (self.visual / "raw.json").read_bytes()
        with patch.object(run, "VISUAL", self.visual), patch.object(run, "run", side_effect=run.StepFailed("builder failed")):
            with self.assertRaises(run.StepFailed):
                run.publish(self.root / "publish.log", apply_supplement=False)
        self.assertEqual((self.visual / "raw.json").read_bytes(), before)
        self.assertEqual((self.visual / "index.html").read_text(), "old html")


if __name__ == "__main__":
    unittest.main()