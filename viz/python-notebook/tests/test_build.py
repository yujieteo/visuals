"""build.py: what an HTML parser reads from index.html is exactly the source text, whatever that text holds.

The tests parse the page the way a browser tokenizes it (a <script> element ends at the first "</script"), so
an escaping fault shows as a block that ends early, an extra element or a text that differs from its file.
"""
import html.parser
import json
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import build  # noqa: E402

HOSTILE = "</script><script>alert(1)</script><!-- </SCRIPT\t> <ScRiPt"


class Scripts(html.parser.HTMLParser):
    """Every <script> element with its attributes and its text, as the HTML tokenizer splits them."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.scripts, self.current, self.comments = [], None, 0

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self.current = [dict(attrs), ""]

    def handle_data(self, data):
        if self.current is not None:
            self.current[1] += data

    def handle_endtag(self, tag):
        if tag == "script" and self.current is not None:
            self.scripts.append(tuple(self.current))
            self.current = None

    def handle_comment(self, data):
        self.comments += 1


def scripts_of(text):
    parser = Scripts()
    parser.feed(text)
    parser.close()
    return parser


def node(code, module=False):
    return subprocess.run(["node", "--input-type=" + ("module" if module else "commonjs"), "-e", code],
                          capture_output=True, text=True, check=True).stdout


class Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = build.page(check_scripts=False)
        cls.parsed = scripts_of(cls.page)

    def test_every_block_reads_back_as_its_source(self):
        by_id = {attrs.get("id"): text for attrs, text in self.parsed.scripts if attrs.get("id")}
        self.assertEqual(by_id["pynb-body"], (HERE / "src/body.html").read_text(encoding="utf-8"))
        for block_id, path in build.TEXT_BLOCKS:
            self.assertEqual(by_id[block_id], (HERE / path).read_text(encoding="utf-8"), block_id)
        raw = json.loads((HERE / "raw.json").read_text(encoding="utf-8"))
        self.assertEqual(json.loads(by_id["pynb-example"]), raw["example"])
        runtime = json.loads(by_id["pynb-runtime"])
        downloads = json.loads((HERE / "downloads.json").read_text(encoding="utf-8"))
        self.assertEqual(runtime["downloads"], downloads["downloads"])
        self.assertEqual(runtime["portable_csp"], build.PORTABLE_CSP)
        self.assertNotIn("'self'", runtime["portable_csp"], "a portable file may load nothing from beside it")
        self.assertEqual(self.parsed.comments, 0)

    def test_executed_scripts_are_the_sources_in_order(self):
        executed = [(a, t) for a, t in self.parsed.scripts if a.get("type") in (None, "module") and a.get("id") != "site-theme"]
        names = ["src/runtime-patches.js", "vendor/runtime.js", *[f"src/{m}" for m in build.MODULES], "src/app.js"]
        self.assertEqual(len(executed), len(names))
        for (attrs, text), name in zip(executed, names):
            self.assertEqual(text, build.script_text(name, (HERE / name).read_text(encoding="utf-8")), name)
            self.assertEqual(attrs.get("type"), "module" if name.startswith("vendor/") else None, name)
            self.assertIn("data-pynb-part", attrs, f"{name} goes into a portable copy")

    def test_escaped_script_keeps_its_meaning(self):
        source = ("const s = '%s'; const t = `%s`; const r = /<\\/script>|<!--/i; // %s\n"
                  "process.stdout.write(JSON.stringify([s, t, r.test('</script>'), r.test('<!--')]))") % (HOSTILE, HOSTILE, HOSTILE)
        escaped = build.script_text("x.js", source)
        doc = scripts_of(f"<script>{escaped}</script><p>after</p>")
        self.assertEqual(len(doc.scripts), 1, "the element ends only at its own end tag")
        self.assertEqual(doc.scripts[0][1], escaped)
        self.assertEqual(json.loads(node(escaped)), [HOSTILE, HOSTILE, True, True])

    def test_text_blocks_refuse_hazards_and_json_blocks_escape_them(self):
        for bad in ("a</script>b", "a<!--b", "<SCRIPT>"):
            with self.assertRaises(SystemExit):
                build.text_block("x", bad)
        block = build.json_block("x", {"k": HOSTILE})
        doc = scripts_of(block)
        self.assertEqual(len(doc.scripts), 1)
        self.assertEqual(json.loads(doc.scripts[0][1]), {"k": HOSTILE})

    def test_index_html_is_current(self):
        self.assertEqual((HERE / "index.html").read_text(encoding="utf-8"), self.page, "run python3 build.py")


if __name__ == "__main__":
    unittest.main()
