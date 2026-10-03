"""The builders' shared helpers in scripts/page_parts.py and scripts/style_guide.py.

Each builder's --verify checks its own committed page, so these tests read no visual's folder.
"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.dont_write_bytecode = True
from page_parts import compact, deck_buttons_js, strip_types  # noqa: E402
from style_guide import contrast  # noqa: E402

class PagePartsTest(unittest.TestCase):
    def test_deck_handlers_name_the_slugs_deck_and_look_up_by_id_or_selector(self):
        by_selector, by_id = deck_buttons_js("some-visual"), deck_buttons_js("some-visual", by_id=True)
        for js in (by_selector, by_id):
            self.assertIn('"some-visual-beamdswitch.md"', js)
        self.assertIn('document.querySelector("#save-beamdswitch")', by_selector)
        self.assertIn('document.getElementById("copy-beamdswitch")', by_id)
        self.assertNotIn("getElementById", by_selector)

    def test_contrast_is_the_wcag_ratio(self):
        self.assertAlmostEqual(contrast("#000000", "#ffffff"), 21)
        self.assertEqual(contrast("#777777", "#777777"), 1)
        self.assertEqual(contrast("#1d1d1f", "#ffffff"), contrast("#ffffff", "#1d1d1f"))
        self.assertAlmostEqual(contrast("#767676", "#ffffff"), 4.54, places=2)

    def test_compact_drops_comments_blank_lines_and_indentation(self):
        src = "/* header\n   block */\nconst a = 1; // kept: not a whole line\n\n  // whole-line comment\n  if (a) {\n    f(a);\n  }\n"
        self.assertEqual(compact(src), "const a = 1; // kept: not a whole line\nif (a) {\nf(a);\n}")

    def test_strip_types_removes_only_the_annotations(self):
        src = (
            "/**\n * @typedef {{ a: number }} T\n */\n(function () {\n"
            "  /** @param {number} x @returns {number} */\n  const f = (x) => x + 1;\n"
            "  let /** @type {T | null} */ t = null, /** @type {string[]} */ list = [];\n"
            "  // @ts-expect-error t is set before this line runs\n  t.a = f(1);\n"
            "  /* an ordinary comment stays */ list.push(`${t.a}`); // so does this one\n})();\n"
        )
        self.assertEqual(strip_types(src), (
            "(function () {\n  const f = (x) => x + 1;\n  let t = null, list = [];\n  t.a = f(1);\n"
            "  /* an ordinary comment stays */ list.push(`${t.a}`); // so does this one\n})();\n"
        ))

    def test_a_leading_jsdoc_with_code_after_it_keeps_the_code(self):
        src = "  /** @type {number} */ let a = 1;\n  go(a);\n  /** @param {string} s */\n  function f(s) {}\n"
        self.assertEqual(strip_types(src), "  let a = 1;\n  go(a);\n  function f(s) {}\n")
        src = "/* note */ let a = 1;\ngo(a);\n/* block */\nf(a);\n"
        self.assertEqual(compact(src), "/* note */ let a = 1;\ngo(a);\nf(a);")

    def test_compact_drops_type_annotations_too(self):
        src = "/** @param {number} a */\nconst f = (a) => {\n  let /** @type {number} */ b = a;\n  return b;\n};\n"
        self.assertEqual(compact(src), "const f = (a) => {\nlet b = a;\nreturn b;\n};")

    def test_compact_refuses_template_literals(self):
        with self.assertRaises(AssertionError):
            compact("const s = `x`;\n")


if __name__ == "__main__":
    unittest.main()
