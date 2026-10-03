"""scripts/page_rules.py: the static contrast and tools rules page-axi prints beside its browser checks."""
import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout

from helpers import Layout, metadata

from page_rules import main, page_rules

LOW = '<style>:root{--bg:#ffffff;--fg:#cccccc}</style>'


class PageRulesTest(unittest.TestCase):
    def test_contrast_and_tools_follow_check_py_with_the_allow_list(self):
        with Layout() as layout:
            folder = layout.visual("low")
            (folder / "index.html").write_text(LOW + (folder / "index.html").read_text(encoding="utf-8"), encoding="utf-8")
            problems = [f"{theme}: --fg on --bg is 1.61:1, below 4.5:1 for text" for theme in ("light", "dark")]
            self.assertEqual(page_rules(folder), {"contrast": problems, "tools": []})
            (folder / "visual.json").write_text(json.dumps(metadata(allow={"contrast": problems}, webmcp_tools=["get_data"])), encoding="utf-8")
            result = page_rules(folder)
            self.assertEqual(result["contrast"], [])
            self.assertEqual(len(result["tools"]), 1)

    def test_a_folder_without_visual_json_or_another_entry_has_no_tools_rule(self):
        with Layout() as layout:
            folder = layout.visual("bare", data=False)
            self.assertEqual(page_rules(folder), {"contrast": [], "tools": None})
            (folder / "other.html").write_text(LOW, encoding="utf-8")
            self.assertEqual(len(page_rules(folder, "other.html")["contrast"]), 2)

    def test_main_prints_json_and_exits_2_for_a_missing_page(self):
        with Layout() as layout:
            folder = layout.visual("ok")
            out = io.StringIO()
            with redirect_stdout(out):
                main([str(folder)])
            self.assertEqual(json.loads(out.getvalue()), {"contrast": [], "tools": []})
            for argv in ([str(folder), "missing.html"], [], ["a", "b", "c"]):
                with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
                    main(argv)
                self.assertEqual(raised.exception.code, 2, argv)


if __name__ == "__main__":
    unittest.main()
