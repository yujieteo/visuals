"""scripts/refresh_kit.py and the SEC refresh of scripts/stock_cases.py, offline: recorded answers, never the network."""
import argparse
import io
import json
import os
import unittest
import urllib.error
from datetime import datetime
from pathlib import Path
from unittest import mock

from helpers import Layout, metadata

import refresh_kit
import stock_cases
from refresh_kit import SGT, Failed, Replay

FIXTURES = Path(__file__).resolve().parent / "fixtures"
URL = "https://example.org/data.json"
# A visual's refresh.py: raw.json from URL, checked for a "rows" list; --empty-ok is a flag of its own.
HOOK = '''import json
import refresh_kit


def add_arguments(parser):
    parser.add_argument("--empty-ok", action="store_true")


def refresh(source, folder, args):
    data = source.json("https://example.org/data.json")
    refresh_kit.require(isinstance(data.get("rows"), list), "no rows list")
    refresh_kit.require(data["rows"] or getattr(args, "empty_ok", False), "no row")
    return refresh_kit.Update(files={"raw.json": json.dumps(data) + "\\n"}, fetched=refresh_kit.today(source),
                              changes=[{"kind": "rows", "item": "all", "detail": str(len(data["rows"]))}], source="https://example.org/")
'''
# Its builder: index.html from raw.json, failing on a row "bad" after it has written the page.
BUILD = '''import json
from pathlib import Path
rows = json.loads(Path("raw.json").read_text())["rows"]
Path("index.html").write_text("rows: " + ",".join(rows))
Path("meta.json").write_text("{}")
raise SystemExit("bad row" if "bad" in rows else 0)
'''


class Toon(unittest.TestCase):
    def test_scalars_are_bare_unless_they_could_be_misread(self):
        self.assertEqual([refresh_kit.scalar(v) for v in ("raw.json", "a, b", "12", "true", "", " x", "a: b", 3, None, True)],
                         ["raw.json", '"a, b"', '"12"', '"true"', '""', '" x"', '"a: b"', "3", "null", "true"])

    def test_rows_become_a_table_and_text_a_list(self):
        self.assertEqual(refresh_kit.toon({"slug": "x", "files": [{"path": "raw.json", "status": "changed"}], "notes": ["read it"], "changes": []}),
                         "slug: x\nfiles[1]{path,status}:\n  raw.json,changed\nnotes[1]:\n  - read it\nchanges[0]:")


class Answers(unittest.TestCase):
    def test_a_missing_empty_or_bot_check_answer_fails(self):
        source = Replay({URL: "  \n", "https://example.org/w": "<html><title>Just a moment...</title>", "https://example.org/x": "{"})
        for url, reason in ((URL, "empty response"), ("https://example.org/w", "bot check"), ("https://example.org/gone", "no recorded answer"),
                            ("https://example.org/x", "not JSON")):
            with self.subTest(url=url), self.assertRaisesRegex(Failed, reason):
                source.json(url)

    def test_the_network_source_fails_on_an_http_error_and_retries_a_rate_limit(self):
        source = refresh_kit.Source()
        limited = urllib.error.HTTPError(URL, 429, "slow down", {}, None)
        ok = mock.MagicMock()
        ok.__enter__.return_value.read.return_value = b'{"rows": []}'
        with mock.patch.object(refresh_kit.urllib.request, "urlopen", side_effect=[limited, ok]) as opened, mock.patch.object(refresh_kit.time, "sleep"):
            self.assertEqual(source.json(URL, tries=2), {"rows": []})
        self.assertEqual(opened.call_count, 2)
        with mock.patch.object(refresh_kit.urllib.request, "urlopen", side_effect=urllib.error.HTTPError(URL, 404, "gone", {}, None)), \
                self.assertRaisesRegex(Failed, "HTTP 404"):
            source.text(URL, tries=3)

    def test_fetched_is_the_singapore_date_and_nothing_else_changes(self):
        self.assertEqual(refresh_kit.today(Replay({}, now=datetime.fromisoformat("2026-10-04T20:00:00+00:00"))), "2026-10-05")
        self.assertEqual(refresh_kit.set_fetched('{\n  "fetched":"2026-01-01",\n  "x": 1\n}\n', "2026-10-05"), '{\n  "fetched":"2026-10-05",\n  "x": 1\n}\n')
        with self.assertRaises(Failed):
            refresh_kit.set_fetched("{}", "2026-10-05")


class Run(unittest.TestCase):
    NOW = datetime(2026, 10, 4, 9, 0, tzinfo=SGT)

    def setUp(self):
        self.layout = Layout().__enter__()
        self.addCleanup(self.layout.__exit__)
        self.folder = self.layout.visual("demo", metadata(fetched="2026-09-01"))
        (self.folder / "raw.json").write_text('{"rows": ["a"]}\n', encoding="utf-8")
        (self.folder / "refresh.py").write_text(HOOK, encoding="utf-8")
        (self.folder / "build.py").write_text(BUILD, encoding="utf-8")

    def files(self):
        return {path.name: path.read_bytes() for path in self.folder.iterdir() if path.is_file()}

    def run_refresh(self, answer, dry_run=False, **flags):
        out = io.StringIO()
        code = refresh_kit.run("demo", dry_run, argparse.Namespace(**flags), Replay({URL: answer} if answer is not None else {}, now=self.NOW),
                               root=self.layout.root, out=out)
        return code, out.getvalue()

    def test_a_dry_run_prints_the_changes_and_writes_nothing(self):
        before = self.files()
        code, out = self.run_refresh('{"rows": ["a", "b"]}', dry_run=True)
        self.assertEqual(code, 0)
        self.assertEqual(self.files(), before)
        self.assertIn("result: changes\n", out)
        self.assertIn("  raw.json,changed,16,21\n", out)
        self.assertIn("  visual.json,changed,", out)
        self.assertIn("  rows,all,\"2\"\n", out)
        self.assertIn("next: python3 scripts/refresh.py demo\n", out)

    def test_up_to_date_data_writes_nothing_and_keeps_fetched(self):
        before = self.files()
        code, out = self.run_refresh('{"rows": ["a"]}')
        self.assertEqual(code, 0)
        self.assertIn("result: up-to-date\n", out)
        self.assertNotIn("visual.json", out)
        self.assertEqual(self.files(), before)

    def test_a_refresh_writes_the_files_and_fetched_then_runs_the_builder(self):
        code, out = self.run_refresh('{"rows": ["a", "b"]}')
        self.assertEqual(code, 0, out)
        self.assertEqual((self.folder / "raw.json").read_text(), '{"rows": ["a", "b"]}\n')
        self.assertEqual(json.loads((self.folder / "visual.json").read_text())["fetched"], "2026-10-04")
        self.assertEqual((self.folder / "index.html").read_text(), "rows: a,b")
        self.assertNotIn(".raw.json.refresh", self.files())

    def test_no_source_an_empty_answer_or_a_schema_mismatch_exits_2_and_writes_nothing(self):
        before = self.files()
        for answer, reason in ((None, "no recorded answer"), ("", "empty response"), ('{"cols": []}', "no rows list"), ('{"rows": []}', "no row")):
            with self.subTest(answer=answer):
                code, out = self.run_refresh(answer)
                self.assertEqual(code, refresh_kit.FAILED)
                self.assertIn("result: failed\n", out)
                self.assertIn(reason, out)
                self.assertIn("written: nothing", out)
                self.assertEqual(self.files(), before)
        self.assertEqual(self.run_refresh('{"rows": []}', empty_ok=True)[0], 0, "the visual's own flag reaches its refresh")

    def test_an_unexpected_error_in_a_refresh_exits_2_and_writes_nothing(self):
        before = self.files()
        code, out = self.run_refresh('["rows"]')
        self.assertEqual(code, refresh_kit.FAILED)
        self.assertIn("result: failed\n", out)
        self.assertIn("AttributeError", out)
        self.assertIn("written: nothing", out)
        self.assertEqual(self.files(), before)

    def test_a_refresh_py_that_fails_to_import_exits_2_from_the_command_line(self):
        (self.folder / "refresh.py").write_text("import a_module_that_does_not_exist\n", encoding="utf-8")
        before = self.files()
        out = io.StringIO()
        with mock.patch.object(refresh_kit, "ROOT", self.layout.root), mock.patch("sys.stdout", out):
            code = refresh_kit.main(["demo"])
        self.assertEqual(code, refresh_kit.FAILED)
        self.assertIn("result: failed\n", out.getvalue())
        self.assertIn("ModuleNotFoundError", out.getvalue())
        self.assertIn("written: nothing", out.getvalue())
        self.assertEqual(self.files(), before)

    def test_a_builder_that_fails_puts_every_file_back(self):
        before = self.files()
        code, out = self.run_refresh('{"rows": ["a", "bad"]}')
        self.assertEqual(code, refresh_kit.FAILED)
        self.assertIn("bad row", out)
        self.assertEqual(self.files(), before, "raw.json, visual.json and what the builder wrote are all put back")

    def test_a_visual_without_a_refresh_py_fails(self):
        self.layout.visual("plain")
        out = io.StringIO()
        self.assertEqual(refresh_kit.run("plain", source=Replay({}), root=self.layout.root, out=out), refresh_kit.FAILED)
        self.assertIn("refresh.py with a refresh() does not exist", out.getvalue())


class StockCases(unittest.TestCase):
    """The SEC refresh of the stock pages, from company facts recorded on 2026-09-28 and cut down to the two tags read."""

    CASE = {"name": "Airbnb", "cik": 1559720}
    SEC = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001559720.json"

    def setUp(self):
        self.layout = Layout().__enter__()
        self.addCleanup(self.layout.__exit__)
        self.folder = self.layout.visual("airbnb")
        self.recorded = (FIXTURES / "sec-companyfacts-airbnb.json").read_text(encoding="utf-8")
        self.facts = json.loads(self.recorded)
        contact = mock.patch.dict(os.environ, {stock_cases.CONTACT: "Jane Tan jane@example.com"})
        contact.start()
        self.addCleanup(contact.stop)

    def refresh(self, answer):
        return stock_cases.refresh(Replay({self.SEC: answer}), self.folder, self.CASE)

    def test_the_answer_is_kept_as_served_and_the_builder_gets_the_date(self):
        (self.folder / "raw.json").write_text(self.recorded, encoding="utf-8")
        update = self.refresh(self.recorded)
        self.assertEqual(update.files, {"raw.json": self.recorded})
        self.assertEqual((update.changes, update.fetched, update.build), ([], "2026-10-04", ["build.py", "--fetched", "2026-10-04"]))

    def test_a_new_fiscal_year_is_a_change_with_a_note_to_check_the_fixed_text(self):
        older = json.loads(self.recorded)
        for tag in older["facts"]["us-gaap"].values():
            tag["units"]["USD"] = [fact for fact in tag["units"]["USD"] if fact["end"] < "2025"]
        (self.folder / "raw.json").write_text(json.dumps(older), encoding="utf-8")
        update = self.refresh(self.recorded)
        self.assertEqual([(c["kind"], c["item"]) for c in update.changes], [("added", "FY2025"), ("removed", "FY2021")])
        self.assertIn("fixed text", update.notes[0])

    def test_sec_is_sent_the_contact_and_without_one_nothing_is_asked(self):
        source = Replay({self.SEC: self.recorded})
        with mock.patch.object(source, "text", wraps=source.text) as text:
            stock_cases.refresh(source, self.folder, self.CASE)
        self.assertEqual(text.call_args.kwargs["headers"], {"User-Agent": "Jane Tan jane@example.com"})
        source = Replay({self.SEC: self.recorded})
        with mock.patch.dict(os.environ, {stock_cases.CONTACT: " "}), self.assertRaisesRegex(Failed, "SEC_CONTACT is not set"):
            stock_cases.refresh(source, self.folder, self.CASE)
        self.assertEqual(source.asked, [])

    def test_another_company_or_missing_tags_fail(self):
        with self.assertRaisesRegex(Failed, "not the company facts of CIK 1559720"):
            self.refresh(json.dumps({**self.facts, "cik": 1}))
        del self.facts["facts"]["us-gaap"][stock_cases.CASH]
        with self.assertRaisesRegex(Failed, "no four annual"):
            self.refresh(json.dumps(self.facts))


if __name__ == "__main__":
    unittest.main()
