"""refresh.py offline: which draws a refresh adds and what it refuses, from recorded Singapore Pools pages.

fixtures/refresh/draw-list.html is the draw list as retrieved on 2026-10-04, cut down to its newest three draws,
and draw-4222.html the results block of draw 4222's page from the same day.
"""
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

FIXTURES = HERE / "tests" / "fixtures" / "refresh"
LIST = (FIXTURES / "draw-list.html").read_text(encoding="utf-8")
DRAW_4222 = (FIXTURES / "draw-4222.html").read_text(encoding="utf-8")
PAGE_4222 = refresh.RESULT_URL.format(query="sppl=RHJhd051bWJlcj00MjIy")
NOW = datetime(2026, 10, 4, 9, 0, tzinfo=SGT)


class Refresh(unittest.TestCase):
    def setUp(self):
        self.folder = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.folder)
        rows = (HERE / "draws.csv").read_text(encoding="utf-8").splitlines(keepends=True)
        # draws.csv as it was before draw 4222, whatever later refreshes added
        self.draws = rows[0] + "".join(row for row in rows[1:] if int(row.split(",")[0]) < 4222)
        (self.folder / "draws.csv").write_text(self.draws, encoding="utf-8")

    def refresh(self, answers=None):
        source = Replay({refresh.LIST_URL: LIST, PAGE_4222: DRAW_4222} if answers is None else answers, now=NOW)
        return refresh.refresh(source, self.folder, None), source

    def test_the_committed_draws_csv_is_what_a_refresh_writes(self):
        text = self.draws
        before_4222 = LIST.replace(LIST[LIST.index("<option"):LIST.index("</option>") + len("</option>")], "")  # the list before draw 4222
        update, source = self.refresh({refresh.LIST_URL: before_4222})
        self.assertEqual(update.files["draws.csv"], text)
        self.assertEqual(source.asked, [refresh.LIST_URL], "a draw draws.csv has is not read again")

    def test_a_new_draw_is_read_from_its_own_page_and_added_on_top(self):
        update, source = self.refresh()
        self.assertEqual(source.asked, [refresh.LIST_URL, PAGE_4222])
        first = update.files["draws.csv"].splitlines()[1]
        self.assertEqual(first, f"4222,2026-10-01,5,8,11,24,26,43,20,{PAGE_4222},2026-10-04")
        self.assertTrue(update.files["draws.csv"].endswith(self.draws.split("\n", 1)[1]), "older rows stay as they are")
        self.assertEqual(update.changes, [{"kind": "added", "item": "draw 4222", "detail": "2026-10-01: 5 8 11 24 26 43 + 20"}])
        self.assertEqual(update.fetched, "2026-10-04")

    def test_a_cancelled_draw_is_skipped(self):
        cancelled = LIST.replace("value='4222' winningSharesUploaded='True' isCancelled=''", "value='4222' winningSharesUploaded='True' isCancelled='True'")
        update, source = self.refresh({refresh.LIST_URL: cancelled})
        self.assertEqual((update.changes, source.asked), ([], [refresh.LIST_URL]))

    def test_an_empty_list_a_wrong_page_or_bad_numbers_fail(self):
        with self.assertRaisesRegex(Failed, "the draw list is empty or its format changed"):
            self.refresh({refresh.LIST_URL: "<select class='form-control selectDrawList'></select>"})
        with self.assertRaisesRegex(Failed, "the page does not show that draw"):
            self.refresh({refresh.LIST_URL: LIST, PAGE_4222: DRAW_4222.replace("Draw No. 4222", "Draw No. 4221")})
        with self.assertRaisesRegex(Failed, "unexpected numbers"):
            self.refresh({refresh.LIST_URL: LIST, PAGE_4222: DRAW_4222.replace("class='win6'>43<", "class='win6'>50<")})
        with self.assertRaisesRegex(Failed, "no six winning numbers"):
            self.refresh({refresh.LIST_URL: LIST, PAGE_4222: DRAW_4222.replace("class='additional'", "class='bonus'")})
        with self.assertRaisesRegex(Failed, "no recorded answer"):
            self.refresh({refresh.LIST_URL: LIST})


if __name__ == "__main__":
    unittest.main()
