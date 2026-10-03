"""refresh.py offline: which days a refresh reads and what it refuses, from recorded data.gov.sg answers.

fixtures/refresh/answers.json holds the PSI and PM2.5 answers for 2026-10-02 to 2026-10-04 as retrieved on
2026-10-04, cut down to their first hours.
"""
import copy
import json
import shutil
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE.parents[1] / "scripts"))
sys.path.insert(0, str(HERE))  # after scripts/, so this folder's refresh.py is found before scripts/refresh.py

import refresh  # noqa: E402
from refresh_kit import SGT, Failed, Replay  # noqa: E402

ANSWERS = json.loads((HERE / "tests" / "fixtures" / "refresh" / "answers.json").read_text(encoding="utf-8"))
NOW = datetime(2026, 10, 4, 9, 0, tzinfo=SGT)


def url(endpoint, day):
    return refresh.url(endpoint, day)


class Refresh(unittest.TestCase):
    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.folder)
        # Stored: 2026-10-02 with its first hour only, as a refresh during that day would have left it.
        stored = {endpoint: {"2026-10-02": copy.deepcopy(ANSWERS[url(endpoint, "2026-10-02")])} for endpoint in refresh.ENDPOINTS}
        for endpoint in stored:
            stored[endpoint]["2026-10-02"]["data"]["items"] = stored[endpoint]["2026-10-02"]["data"]["items"][:1]
        self.stored = stored
        (self.folder / "raw.json").write_text(json.dumps(stored, separators=(",", ":")) + "\n", encoding="utf-8")

    def refresh(self, answers=None):
        source = Replay({key: json.dumps(value) for key, value in (ANSWERS if answers is None else answers).items()}, now=NOW)
        return refresh.refresh(source, self.folder, None), source

    def test_the_newest_stored_day_is_read_again_through_today(self):
        update, source = self.refresh()
        self.assertEqual(source.asked, [url(e, d) for e in ("psi", "pm25") for d in ("2026-10-02", "2026-10-03", "2026-10-04")])
        raw = json.loads(update.files["raw.json"])
        self.assertEqual({e: list(raw[e]) for e in raw}, {e: ["2026-10-02", "2026-10-03", "2026-10-04"] for e in ("psi", "pm25")})
        self.assertEqual(raw["psi"]["2026-10-03"], ANSWERS[url("psi", "2026-10-03")], "each answer is kept as served")
        self.assertEqual(update.changes[:3], [{"kind": "updated", "item": "psi 2026-10-02", "detail": "1 -> 2 hours"},
                                              {"kind": "added", "item": "psi 2026-10-03", "detail": "0 -> 2 hours"},
                                              {"kind": "added", "item": "psi 2026-10-04", "detail": "0 -> 1 hours"}])
        self.assertEqual(update.fetched, "2026-10-04")

    def test_complete_past_days_are_kept_and_nothing_new_is_no_change(self):
        stored = {e: {d: ANSWERS[url(e, d)] for d in ("2026-10-02", "2026-10-03", "2026-10-04")} for e in refresh.ENDPOINTS}
        stored["psi"]["2026-04-01"] = {"kept": "as it is"}
        (self.folder / "raw.json").write_text(json.dumps(stored, separators=(",", ":")) + "\n", encoding="utf-8")
        update, source = self.refresh()
        self.assertEqual(source.asked, [url("psi", "2026-10-04"), url("pm25", "2026-10-04")])
        self.assertEqual(update.changes, [])
        self.assertEqual(list(json.loads(update.files["raw.json"])["psi"])[0], "2026-04-01")

    def test_today_without_an_hour_is_left_out_but_a_past_day_without_one_fails(self):
        answers = copy.deepcopy(ANSWERS)
        for endpoint in refresh.ENDPOINTS:
            answers[url(endpoint, "2026-10-04")]["data"]["items"] = []
        update, _ = self.refresh(answers)
        self.assertNotIn("2026-10-04", json.loads(update.files["raw.json"])["psi"])
        self.assertIn("psi 2026-10-04 has no hour yet, so it is left out", update.notes)
        answers[url("psi", "2026-10-03")]["data"]["items"] = []
        with self.assertRaisesRegex(Failed, "no hourly reading for a past day"):
            self.refresh(answers)

    def test_an_answer_build_py_cannot_read_fails(self):
        def broken(change):
            answers = copy.deepcopy(ANSWERS)
            change(answers[url("pm25", "2026-10-03")])
            return answers
        cases = {
            "answered code 1": lambda body: body.update(code=1),
            "no data.items list": lambda body: body["data"].pop("items"),
            "regions": lambda body: body["data"]["regionMetadata"].pop(),
            "has no pm25_one_hourly readings": lambda body: body["data"]["items"][0]["readings"].clear(),
            "not an hour of 2026-10-03": lambda body: body["data"]["items"][0].update(timestamp="2026-10-02T23:00:00+08:00"),
        }
        for reason, change in cases.items():
            with self.subTest(reason=reason), self.assertRaisesRegex(Failed, reason):
                self.refresh(broken(change))

    def test_a_day_the_source_does_not_answer_fails(self):
        answers = dict(ANSWERS)
        del answers[url("psi", "2026-10-03")]
        with self.assertRaisesRegex(Failed, "no recorded answer"):
            self.refresh(answers)


if __name__ == "__main__":
    unittest.main()
