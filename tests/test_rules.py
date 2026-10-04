"""scripts/rules.py: the deterministic checks that replace review by reading, each on a small case it must
catch and one it must pass. The failing cases follow past review findings in this repository."""
import tempfile
import unittest
from pathlib import Path

from helpers import Layout

import rules

THEMES = (
    ":root{--bg:#ffffff;--fg:#1d1d1f;--muted:#6e6e73;--surface:#f5f5f7;--border:#d2d2d7;--control:#86868b;--focus:#0071e3;--on-focus:#ffffff;--warn:#9a6700}"
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1d1d1f;--fg:#f5f5f7;--muted:#a1a1a6;--surface:#2c2c2e;--border:#48484a;--control:#8e8e93;--focus:#2997ff;--on-focus:#1d1d1f;--warn:#e3b341}}'
    ':root[data-theme="dark"]{--bg:#1d1d1f;--fg:#f5f5f7;--muted:#a1a1a6;--surface:#2c2c2e;--border:#48484a;--control:#8e8e93;--focus:#2997ff;--on-focus:#1d1d1f;--warn:#e3b341}'
)


def page(css="", body=""):
    return f"<!doctype html><style>{THEMES}{css}</style><body>{body}</body>"


class AllowedTest(unittest.TestCase):
    def test_an_allowed_problem_is_dropped_and_an_entry_matching_none_is_returned(self):
        self.assertEqual(rules.allowed(["a", "b"], ["b", "gone"]), (["a"], ["gone"]))
        self.assertEqual(rules.allowed(["a"], None), (["a"], []))

    def test_an_entry_names_no_line_and_allows_one_problem(self):
        problems = ["build.py:3: import os is unused", "build.py:40: import os is unused"]
        self.assertEqual(rules.allowed(problems, ["build.py: import os is unused"]), (["build.py:40: import os is unused"], []))
        self.assertEqual(rules.allowed(problems, ["build.py: import os is unused"] * 2), ([], []))
        self.assertEqual(rules.allowed(problems[:1], ["build.py: import os is unused"] * 2), ([], ["build.py: import os is unused"]))
        self.assertEqual(rules.allowed(problems, ["build.py:3: import os is unused"]), (problems, ["build.py:3: import os is unused"]))
        contrast = "light: .row outlines a control in --border, 1.51:1 on --bg, below 3.0:1; use --control"
        self.assertEqual(rules.allowed([contrast, contrast], [contrast]), ([contrast], []))


class TemplateTest(unittest.TestCase):
    def test_every_copy_must_match_the_recorded_template_and_the_page_must_inline_it(self):
        with Layout() as layout:
            folder = layout.visual("narrated")
            template = "(function () { return 1; })();\n"
            for name in ("beamdswitch.js", "tests/fixtures/beamdswitch/template.js"):
                (folder / name).parent.mkdir(parents=True, exist_ok=True)
                (folder / name).write_text(template, encoding="utf-8")
            (folder / "index.html").write_text(f"<script id=\"beamdswitch\">\n{template}</script>", encoding="utf-8")
            expected = rules.sha256(template)
            self.assertEqual(rules.template_problems(folder, expected), [])
            (folder / "tests/fixtures/beamdswitch/template.js").write_text(template + "// edited by hand\n", encoding="utf-8")
            (folder / "index.html").write_text("<script id=\"beamdswitch\">(function () { return 2; })();</script>", encoding="utf-8")
            problems = rules.template_problems(folder, expected)
            self.assertEqual(len(problems), 2)
            self.assertIn("tests/fixtures/beamdswitch/template.js differs", problems[0])
            self.assertIn("does not inline beamdswitch.js", problems[1])

    def test_a_page_without_a_builder_must_inline_its_report_unchanged(self):
        with Layout() as layout:
            folder = layout.visual("narrated")
            template, report = "(function () { return 1; })();\n", "self.Report = { deck() {} };\n"
            (folder / "beamdswitch.js").write_text(template, encoding="utf-8")
            (folder / "report.js").write_text(report, encoding="utf-8")
            (folder / "index.html").write_text(f"<script>{template}</script><script>{report}</script>", encoding="utf-8")
            self.assertEqual(rules.template_problems(folder, rules.sha256(template)), [])
            (folder / "index.html").write_text(f"<script>{template}</script><script>self.Report = {{}};</script>", encoding="utf-8")
            self.assertEqual(rules.template_problems(folder, rules.sha256(template)), ["index.html does not inline report.js unchanged"])
            (folder / "build.py").write_text("", encoding="utf-8")
            self.assertEqual(rules.template_problems(folder, rules.sha256(template)), [])

    def test_a_folder_without_the_template_is_not_checked(self):
        with Layout() as layout:
            self.assertEqual(rules.template_problems(layout.visual("plain"), "0" * 64), [])

    def test_the_recorded_hash_is_a_sha256(self):
        self.assertRegex(rules.TEMPLATE_HASH.read_text(encoding="utf-8"), r"^[0-9a-f]{64}  ")


class RequestsTest(unittest.TestCase):
    def test_a_page_may_request_only_its_published_files(self):
        html = ('<link rel="icon" href="data:,"><img src="data.json"><script src="./chart.js"></script>'
                '<a href="https://example.org/">a link is not a request</a>'
                '<script>fetch("data.json"); /** @type {import("./beamdswitch.js").Report} */</script>')
        self.assertEqual(rules.request_problems(html, {"assets": ["chart.js"]}), [])

    def test_private_notes_absolute_parent_and_unpublished_paths_are_named(self):
        html = ('<script>fetch("notes.md"); fetch(`deck/${slug}.md`); new Worker("../worker.js");</script>'
                '<link rel="stylesheet" href="https://cdn.example.org/x.css"><img src="/visuals/x.png"><img src="raw.json">')
        problems = rules.request_problems(html, {})
        self.assertEqual(len(problems), 6)
        self.assertTrue(any("notes.md is private" in p for p in problems))
        self.assertTrue(any("https://cdn.example.org/x.css: a page makes no request outside its folder" in p for p in problems))
        self.assertTrue(any("../worker.js: a path outside" in p for p in problems))
        self.assertTrue(any("/visuals/x.png: a path outside" in p for p in problems))
        self.assertTrue(any("raw.json: not a published file" in p for p in problems))

    def test_css_imports_and_urls_are_requests_too(self):
        html = ('<style>@import url("https://fonts.example.org/f.css");.a{background:url(bg.png)}'
                '.b{background:url("data:image/png;base64,AA")}</style><div style="background:url(\'//cdn.example.org/x.png\')"></div>')
        self.assertEqual(rules.request_problems(html, {}), [
            "index.html requests //cdn.example.org/x.png: a page makes no request outside its folder",
            "index.html requests bg.png: not a published file (index.html, data.json or visual.json assets)",
            "index.html requests https://fonts.example.org/f.css: a page makes no request outside its folder",
        ])
        self.assertEqual(rules.request_problems("<script>el.style.url(e)</script>", {}), [])

    def test_network_apis_and_computed_fetch_urls_are_named(self):
        html = ('<script>new XMLHttpRequest(); new WebSocket(u); navigator.sendBeacon(u); new EventSource(u);'
                'fetch(base + "x.json");\n// fetch(url) in a comment is not a call\n</script>')
        self.assertEqual(rules.request_problems(html, {}), [
            "index.html uses EventSource: a page makes no request outside its folder, and reads its own files with fetch",
            "index.html uses WebSocket: a page makes no request outside its folder, and reads its own files with fetch",
            "index.html uses XMLHttpRequest: a page makes no request outside its folder, and reads its own files with fetch",
            "index.html uses sendBeacon: a page makes no request outside its folder, and reads its own files with fetch",
            'index.html calls fetch(base + "x.json"): a computed URL the rule cannot check, so use a literal path',
        ])

    def test_computed_urls_in_fetch_imports_and_workers_are_named(self):
        cases = {
            "fetch(`https://api.example.org/${q}`)": "fetch(`https://api.example.org/${q}`)",
            'fetch("data.json" + q)': 'fetch("data.json" + q)',
            "import(url)": "import(url)",
            "new Worker(src)": "new Worker(src)",
            "new SharedWorker(src)": "new SharedWorker(src)",
            "importScripts('${u}')": "importScripts('${u}')",
        }
        for call, shown in cases.items():
            with self.subTest(call=call):
                self.assertEqual(rules.request_problems(f"<script>{call};</script>", {}), [
                    f"index.html calls {shown}: a computed URL the rule cannot check, so use a literal path"])

    def test_literal_urls_comments_and_prose_are_not_computed_calls(self):
        html = ('<p>Paste to import (JSON or a report)</p><script>fetch(`data.json`); import("./x.js");'
                '\n// import(url) in a comment\n</script>')
        self.assertEqual(rules.request_problems(html, {"assets": ["x.js"]}), [])

    def test_absolute_urls_set_from_script_are_named(self):
        cases = ['img.src = "https://cdn.example.org/a.png"', 'new Audio("https://cdn.example.org/a.mp3")',
                 "el.setAttribute('srcset', 'https://cdn.example.org/b.png')"]
        for code in cases:
            with self.subTest(code=code):
                url = code.split("https://")[1].rstrip("\"')")
                self.assertEqual(rules.request_problems(f"<script>{code};</script>", {}), [
                    f"index.html sets https://{url} from script: a page makes no request outside its folder"])

    def test_the_site_and_w3_namespaces_may_appear_in_script(self):
        html = ('<script>img.src = "https://teoyujie.org/visuals/a.png";'
                'document.createElementNS("http://www.w3.org/2000/svg", "svg");'
                'el.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#a");'
                'a.href = "https://example.org/";\n// img.src = "https://cdn.example.org/x.png"\n</script>')
        self.assertEqual(rules.request_problems(html, {}), [])


class ContrastTest(unittest.TestCase):
    def test_the_style_guide_tokens_pass_in_both_themes(self):
        self.assertEqual(rules.contrast_problems(page(".btn{border:1px solid var(--control)}")), [])

    def test_a_control_outlined_in_the_border_token_fails_in_both_themes(self):
        # Before the theme-choice fixes, every page outlined its buttons in --border (1.5:1).
        problems = rules.contrast_problems(page(".btn{border:1px solid var(--border)}"))
        self.assertEqual([p.split(":")[0] for p in problems], ["light", "dark"])
        self.assertIn(".btn outlines a control in --border, 1.51:1", problems[0])

    def test_a_class_counts_as_a_control_only_when_the_markup_puts_it_on_buttons_alone(self):
        css = ".chip{border:1px solid var(--border)}button:disabled{border-color:var(--border)}"
        self.assertEqual(rules.contrast_problems(page(css, '<span class="chip">tag</span><button class="chip">x</button>')), [])
        self.assertEqual(len(rules.contrast_problems(page(css, '<button class="chip">x</button>'))), 2)

    def test_text_tokens_below_4_5_to_1_are_named_with_their_ratio(self):
        html = page().replace("--warn:#9a6700", "--warn:#b26b00")
        self.assertEqual(rules.contrast_problems(html), ["light: --warn on --bg is 4.20:1, below 4.5:1 for text"])

    def test_the_two_dark_blocks_must_agree(self):
        html = page().replace(':root[data-theme="dark"]{--bg:#1d1d1f', ':root[data-theme="dark"]{--bg:#000000')
        self.assertIn('dark: --bg is #1d1d1f under prefers-color-scheme but #000000 under [data-theme="dark"]', rules.contrast_problems(html))

    def test_colours_resolve_through_var_and_skip_translucent_values(self):
        tokens = {"a": "var(--b)", "b": "#fff", "c": "rgba(0,0,0,.5)"}
        self.assertEqual(rules.rgb("var(--a)", tokens), (255, 255, 255))
        self.assertIsNone(rules.rgb("var(--c)", tokens))
        self.assertAlmostEqual(rules.ratio((0, 0, 0), (255, 255, 255)), 21.0)


class ThemeTest(unittest.TestCase):
    LIGHT = ':root[data-theme="light"]{color-scheme:light}'

    def themed(self, head=None, css=""):
        head = rules.THEME_SCRIPT if head is None else head
        return f"<!doctype html><head>{head}<style>{THEMES}{self.LIGHT}{css}</style></head>".replace(
            ':root[data-theme="dark"]{', ':root[data-theme="dark"]{color-scheme:dark;')

    def test_the_site_theme_script_before_the_first_style_passes(self):
        self.assertEqual(rules.theme_problems(self.themed()), [])

    def test_a_missing_changed_or_late_theme_script_is_named(self):
        self.assertEqual(rules.theme_problems(self.themed("")),
                         ["index.html has no site-theme script (style_guide.THEME_SCRIPT), so it ignores the reader's theme choice"])
        changed = rules.THEME_SCRIPT.replace('t === "dark"', 't === "night"')
        self.assertEqual(rules.theme_problems(self.themed(changed)), ["index.html site-theme script is not style_guide.THEME_SCRIPT unchanged"])
        late = self.themed("").replace("</style>", "</style>" + rules.THEME_SCRIPT)
        self.assertEqual(rules.theme_problems(late),
                         ["index.html site-theme script comes after the first <style>, so the page first paints in the wrong theme"])

    def test_a_theme_block_must_set_its_own_color_scheme(self):
        html = self.themed().replace("color-scheme:dark;", "").replace("color-scheme:light", "color-scheme:dark")
        self.assertEqual(rules.theme_problems(html), [
            'index.html [data-theme="dark"] sets color-scheme nowhere, not dark',
            "index.html [data-theme=\"light\"] sets color-scheme ['dark'], not light",
        ])


class PythonTest(unittest.TestCase):
    def check(self, source):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "build.py"
            path.write_text(source, encoding="utf-8")
            return rules.python_problems(path)

    def test_unused_imports_locals_and_second_definitions_are_named(self):
        problems = self.check(
            "import json\nimport sys\nimport pandas as pd\n\n\n"
            "def load(path):\n    text = open(path).read()\n    unused = 1\n    return json.loads(text)\n\n\n"
            "def load(path):\n    return sys.argv\n"
        )
        self.assertEqual(problems, [
            "build.py:3: import pd is unused",
            "build.py:12: load is defined again in the same scope",
            "build.py:8: local unused is assigned but never read",
        ])

    def test_names_read_in_closures_annotations_and_all_are_used(self):
        self.assertEqual(self.check(
            "from typing import Optional\nimport os\n__all__ = ['os']\n\n\n"
            "def outer():\n    count = 0\n    def inner() -> 'Optional[int]':\n        return count\n    return inner\n\n\n"
            "def tuple_targets():\n    a, b = 1, 2\n    _ignored = 3\n    return a\n"
        ), [])


class SourceTestsTest(unittest.TestCase):
    def check(self, name, source):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / name
            path.write_text(source, encoding="utf-8")
            return rules.source_test_problems(path)

    def test_a_test_that_only_checks_regular_expression_matches_on_the_page_is_reported(self):
        # The stealth-rcs review: a test read the tools out of the page with a regular expression.
        problems = self.check("page.test.mjs", (
            'const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");\n'
            'const visual = JSON.parse(readFileSync(new URL("../visual.json", import.meta.url), "utf8"));\n'
            'test("the page registers the tools", () => {\n'
            '  const registered = [...html.matchAll(/registerTool\\(\\{\\s*name:\\s*"(\\w+)"/g)].map((m) => m[1]);\n'
            '  assert.deepEqual(registered.sort(), visual.webmcp_tools);\n'
            '  assert.match(html, /readOnlyHint/);\n'
            '});\n'
        ))
        self.assertEqual(problems, ['page.test.mjs: test "the page registers the tools" only checks source text; run the code and assert on what it does'])

    def test_a_test_that_runs_the_page_code_is_not_reported(self):
        self.assertEqual(self.check("page.test.mjs", (
            'const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");\n'
            'const script = (id) => new RegExp(`<script id="${id}">([\\\\s\\\\S]*?)</script>`).exec(html)[1];\n'
            'const D = JSON.parse(script("data"));\n'
            'test("the engine sums", () => {\n'
            '  const ctx = vm.createContext({});\n'
            '  vm.runInContext(script("engine"), ctx);\n'
            '  assert.equal(ctx.Engine.sum([1, 2]), 3);\n'
            '  assert.equal(D.rows.length, 2);\n'
            '});\n'
            'test("the output is rendered, not the source", () => {\n'
            '  const html = ctx.Engine.render();\n'
            '  assert.match(html, /<h1>/);\n'
            '});\n'
        )), [])

    def test_python_assertions_on_the_page_text_are_reported(self):
        problems = self.check("test_page.py", (
            "PAGE = (ROOT / 'index.html').read_text()\n\n"
            "class PageTest(unittest.TestCase):\n"
            "    def test_title(self):\n        self.assertIn('<title>', PAGE)\n\n"
            "    def test_model(self):\n        self.assertEqual(model.total([1]), 1)\n"
        ))
        self.assertEqual(problems, ['test_page.py: test "test_title" only checks source text; run the code and assert on what it does'])


class ArtifactsTest(unittest.TestCase):
    def test_tracked_caches_and_os_files_are_named_and_gitignore_must_hold_the_patterns(self):
        tracked = ["scripts/__pycache__/build.cpython-314.pyc", "viz/a/.DS_Store", "viz/a/._index.html", "viz/a/old.pyc",
                   "viz/a/index.html", "viz/a/._/ok.txt"]
        problems = rules.artifact_problems(tracked, "__pycache__/\n*.pyc\n")
        self.assertEqual([p.split(":")[0] for p in problems],
                         ["scripts/__pycache__/build.cpython-314.pyc", "viz/a/.DS_Store", "viz/a/._index.html", "viz/a/old.pyc",
                          ".gitignore", ".gitignore"])
        self.assertEqual(rules.artifact_problems(["viz/a/index.html"], "\n".join(rules.IGNORED)), [])


class FolderTest(unittest.TestCase):
    def test_python_files_leave_out_caches_and_installed_packages(self):
        with Layout() as layout:
            folder = layout.visual("alpha", files=("index.html", "raw.json", "build.py", "__pycache__/x.py", "node_modules/y.py"))
            (folder / "build.py").write_text("import os\n", encoding="utf-8")
            self.assertEqual(rules.python_folder_problems(folder, "viz/alpha/"), ["viz/alpha/build.py:1: import os is unused"])


if __name__ == "__main__":
    unittest.main()
