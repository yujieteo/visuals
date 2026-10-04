"""The refresh pipeline's own rules (spec section 13), on small synthetic snapshots in a temporary work directory.

Covered: the TOON round trip of judge answers, the judge's validation, answer reuse by cache key (a changed packet
needs a new assessment, an unchanged one keeps its answer), the identity map across snapshots and the change report
that keeps source, measurement, judge, rubric and identity changes apart.
"""
import base64
import contextlib
import gzip
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

VIZ = Path(__file__).resolve().parents[1]
WORKDIR = tempfile.TemporaryDirectory()
os.environ["TE_WORK"] = WORKDIR.name
sys.path.insert(0, str(VIZ / "pipeline"))

import common  # noqa: E402
import judge  # noqa: E402
import run  # noqa: E402

WORK = Path(WORKDIR.name)
ANSWER = {"id": "wd:Q1", "type": "theorem", "eff": 3, "res": 2, "pra": 4, "rea": 1, "hyp": 2, "pro": 3, "app": "na",
          "cats": "math.PR; math.CO", "acats": "cs.DS", "level": "undergrad", "effort": "2/3/x", "pre": "wd:Q2; measure",
          "rel": "generalizes>wd:Q2", "conf": "medium", "why": "A short explanation with enough words to pass."}


def snapshot(sid, rows, sources=None, rubric=None):
    """A minimal raw.json: the parts the change report reads."""
    core = {"rows": rows}
    gz = base64.b64encode(gzip.compress(json.dumps(core).encode())).decode()
    return {"snapshot": {"id": sid, "rubric_version": "te-rubric/1", "prompt_version": "p/1", "schema_version": "s/1",
                         "taxonomy_version": "t/1", "identity_map": []},
            "sources": sources or {"mathlib": {"version": "a"}}, "rubric": rubric or {"weights": [25, 25, 20, 15, 5, 5, 5]},
            "taxonomy": {"categories": [["math.PR"], ["math.CO"]]}, "packs": {"core": {"gz": gz}}}


def row(rid, **kw):
    base = {"id": rid, "n": rid.upper(), "src": ["wd"], "t": "theorem", "s": "3333333", "c": "m", "cat": [0], "acat": [],
            "pre": [], "decl": None, "st": 10, "yr": 1900}
    return {**base, **kw}


def setup_judge(packets):
    """Write a prompt, an index with one batch and the packet blocks for each id."""
    j = WORK / "judge"
    (j / "packets").mkdir(parents=True, exist_ok=True)
    (j / "answers").mkdir(exist_ok=True)
    (j / "answers-2").mkdir(exist_ok=True)
    (j / "prompt.txt").write_text("PROMPT", encoding="utf-8")
    (j / "index.json").write_text(json.dumps([{"batch": "b000", "ids": list(packets)}]), encoding="utf-8")
    blocks = [f"result:\n  id: \"{rid}\"\n  name: {text}" for rid, text in packets.items()]
    (j / "packets" / "b000.toon").write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


class PipelineTests(unittest.TestCase):
    def test_toon_round_trip_of_an_answer_table(self):
        rows = [ANSWER, {**ANSWER, "id": "wd:Q2", "why": "Commas, colons: and \"quotes\" stay intact here.", "app": 0}]
        text = common.to_toon({"answers": rows})
        self.assertEqual(common.from_toon(text)["answers"], rows)

    def test_judge_rejects_bad_rows_and_accepts_a_good_one(self):
        STAGE = WORK / "stage"
        STAGE.mkdir(parents=True, exist_ok=True)
        (STAGE / "evidence.json").write_text(json.dumps([{"id": "wd:Q1"}, {"id": "wd:Q2"}]), encoding="utf-8")
        checker = judge.Checker()
        ok = checker.row(dict(ANSWER), {"wd:Q1"})
        self.assertEqual(ok["scores"]["app"], "na")
        self.assertEqual(ok["pre"], ["wd:Q2"])
        self.assertEqual(ok["concepts"], ["measure"])
        self.assertEqual(ok["effort"], {"understand": "2", "apply": "3", "prove": "x"})
        for bad in ({"eff": 5}, {"level": "phd"}, {"effort": "2/3"}, {"cats": "math.XX"}, {"pre": "wd:Q9"},
                    {"rel": "cousin>wd:Q2"}, {"conf": "sure"}, {"why": "short"}, {"type": "lemmaish"}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                checker.row({**ANSWER, **bad}, {"wd:Q1"})
        with self.assertRaises(ValueError):
            checker.row(dict(ANSWER), {"wd:Q2"})

    def test_answers_carry_over_only_when_the_cache_key_holds(self):
        setup_judge({"wd:Q1": "Alpha", "wd:Q2": "Beta", "wd:Q3": "Gamma"})
        answers = [ANSWER, {**ANSWER, "id": "wd:Q2", "rel": ""}]
        (WORK / "judge" / "answers" / "b000.toon").write_text(common.to_toon({"answers": answers}) + "\n", encoding="utf-8")
        keys = {"answers": {}}
        todo = run.carry_answers(keys)
        self.assertEqual(todo["answers"], ["wd:Q3"])  # never assessed
        self.assertEqual(todo["answers-2"], [])
        # record the keys, then change the evidence of wd:Q2 only
        packets = (WORK / "judge" / "packets" / "b000.toon").read_text(encoding="utf-8")
        rows = judge.packet_rows(packets)
        config = json.dumps(judge.JUDGE, sort_keys=True)
        key = lambda rid: common.sha256_bytes("\n".join([rows[rid], "PROMPT", judge.RUBRIC_VERSION, config]).encode())  # noqa: E731
        keys = {"answers": {"wd:Q1": key("wd:Q1"), "wd:Q2": key("wd:Q2")}}
        (WORK / "judge" / "packets" / "b000.toon").write_text(packets.replace("Beta", "Beta, new evidence"), encoding="utf-8")
        todo = run.carry_answers(keys)
        self.assertEqual(sorted(todo["answers"]), ["wd:Q2", "wd:Q3"])
        kept = common.from_toon((WORK / "judge" / "answers" / "b000.toon").read_text(encoding="utf-8"))["answers"]
        self.assertEqual([r["id"] for r in kept], ["wd:Q1"])

    def test_a_new_answer_for_a_changed_packet_survives_the_run_from_judge(self):
        setup_judge({"wd:Q1": "Alpha", "wd:Q2": "Beta"})
        (WORK / "judge" / "keys.json").unlink(missing_ok=True)
        (WORK / "stage").mkdir(parents=True, exist_ok=True)
        (WORK / "stage" / "evidence.json").write_text(json.dumps([{"id": "wd:Q1"}, {"id": "wd:Q2"}]), encoding="utf-8")
        log = WORK / "judge.log"
        second = {**ANSWER, "id": "wd:Q2", "pre": "measure", "rel": ""}
        answers = WORK / "judge" / "answers" / "b000.toon"
        answers.write_text(common.to_toon({"answers": [ANSWER, second]}) + "\n", encoding="utf-8")
        run.judge_step(log)
        packets = WORK / "judge" / "packets" / "b000.toon"
        packets.write_text(packets.read_text(encoding="utf-8").replace("Beta", "Beta, new evidence"), encoding="utf-8")
        with self.assertRaises(run.StepFailed):
            run.judge_step(log)
        self.assertEqual(common.from_toon(answers.read_text(encoding="utf-8"))["answers"], [ANSWER])
        answers.write_text(common.to_toon({"answers": [ANSWER, {**second, "why": "A new explanation for the new evidence here."}]}) + "\n", encoding="utf-8")
        self.assertEqual(run.judge_step(log), {"reused": 2})
        kept = common.from_toon(answers.read_text(encoding="utf-8"))["answers"]
        self.assertEqual([r["id"] for r in kept], ["wd:Q1", "wd:Q2"])

    def test_the_refresh_runs_to_its_exit_code_with_the_work_directory_outside_the_repository(self):
        self.assertFalse(WORK.resolve().is_relative_to(common.ROOT))
        setup_judge({"wd:Q1": "Alpha", "wd:Q2": "Beta"})
        (WORK / "judge" / "keys.json").unlink(missing_ok=True)
        (WORK / "judge" / "answers" / "b000.toon").write_text(common.to_toon({"answers": [ANSWER]}) + "\n", encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()) as out:
            code = run.main(["--offline", "--from", "judge", "--to", "judge"])
        self.assertEqual(code, 3)
        self.assertIn(str(WORK / "refresh" / "report.json"), out.getvalue())
        report = json.loads((WORK / "refresh" / "report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["failure"]["step"], "judge")

    def test_identity_map_follows_the_declaration_and_chains(self):
        prev = {"wd:Q1": {"decl": "Foo.bar"}, "wd:Q5": {"decl": "Baz"}, "wd:Q6": {"decl": "Same"}}
        new = {"nm:foo": {"decl": "Foo.bar"}, "wd:Q5": {"decl": "Baz"}, "nm:a": {"decl": "Same"}, "nm:b": {"decl": "Same"}}
        moves = run.identity_map(prev, new, [{"from": "old:0", "to": "wd:Q1"}])
        self.assertIn({"from": "wd:Q1", "to": "nm:foo"}, moves)
        self.assertIn({"from": "old:0", "to": "nm:foo"}, moves)  # an older id reaches the current id in one step
        self.assertNotIn("wd:Q6", [m["from"] for m in moves])  # two candidates: no guess

    def test_change_report_keeps_the_five_kinds_apart(self):
        prev = snapshot("te-a", [row("wd:Q1"), row("wd:Q2"), row("wd:Q3", decl="X.y")])
        new = snapshot("te-b", [row("wd:Q1", st=12), row("wd:Q2", s="4333333", cat=[1]), row("nm:x", decl="X.y"), row("wd:Q4")],
                       sources={"mathlib": {"version": "b"}}, rubric={"weights": [30, 20, 20, 15, 5, 5, 5]})
        moves = run.identity_map(run.named_rows(prev), run.named_rows(new), [])
        rep = run.change_report(prev, new, moves)
        self.assertEqual(rep["source_changes"]["sources"], ["mathlib"])
        self.assertEqual(rep["measurement_changes"]["fields"], {"st": 1})
        self.assertEqual(rep["judge_changes"]["fields"], {"s": 1, "cat": 1})
        self.assertEqual(rep["rubric_changes"], ["rubric"])
        self.assertEqual(rep["identity_changes"]["moved"], 1)
        self.assertEqual(rep["identity_changes"]["added_ids"], ["wd:Q4"])
        self.assertEqual(rep["identity_changes"]["removed"], 0)
        # the moved record is compared under its new id, so its name change counts as a source change
        self.assertEqual(rep["source_changes"]["records"], {"n": 1})


if __name__ == "__main__":
    unittest.main()
