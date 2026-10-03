"""The shared builder helpers emit exactly what the committed pages ship."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.dont_write_bytecode = True
from page_parts import compact, deck_buttons_js  # noqa: E402
from style_guide import contrast  # noqa: E402

# Pages whose builder emits the shared deck handlers, and whether they look elements up by id.
DECK_PAGES = {
    "graduate-employment-survey": False, "haze-singapore": True, "singapore-covid-governance-hindsight": False,
    "social-values-surveydata": False, "tourist-attractions": True,
}


class PagePartsTest(unittest.TestCase):
    def test_deck_handlers_match_each_committed_page(self):
        for slug, by_id in DECK_PAGES.items():
            html = (ROOT / "viz" / slug / "index.html").read_text(encoding="utf-8")
            js = deck_buttons_js(slug, by_id)
            self.assertEqual(html.count(js), 1, slug)
            self.assertIn(f'"{slug}-beamdswitch.md"', js)

    def test_contrast_is_the_wcag_ratio(self):
        self.assertAlmostEqual(contrast("#000000", "#ffffff"), 21)
        self.assertEqual(contrast("#777777", "#777777"), 1)
        self.assertEqual(contrast("#1d1d1f", "#ffffff"), contrast("#ffffff", "#1d1d1f"))
        self.assertAlmostEqual(contrast("#767676", "#ffffff"), 4.54, places=2)

    def test_compact_drops_comments_blank_lines_and_indentation(self):
        src = "/* header\n   block */\nconst a = 1; // kept: not a whole line\n\n  // whole-line comment\n  if (a) {\n    f(a);\n  }\n"
        self.assertEqual(compact(src), "const a = 1; // kept: not a whole line\nif (a) {\nf(a);\n}")

    def test_compact_refuses_template_literals(self):
        with self.assertRaises(AssertionError):
            compact("const s = `x`;\n")


if __name__ == "__main__":
    unittest.main()
