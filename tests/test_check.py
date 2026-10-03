"""scripts/check.py: the steps a folder calls for, the WebMCP tools check and the allow list of the rule steps."""
import contextlib
import io
import subprocess
import sys
import unittest
from unittest import mock

from helpers import Layout, metadata

import check
from check import default_checks, evidence, main, rule_steps, tools_problems

SKILLS = "# A visual\n\n## WebMCP tools\n\n| Tool | Input | Returns |\n| --- | --- | --- |\n{rows}\n## Exports\n\n| `not_a_tool` | x | y |\n"


def skills(*tools):
    return SKILLS.format(rows="".join(f"| `{tool}` | none | rows |\n" for tool in tools))


class DefaultChecksTest(unittest.TestCase):
    def test_steps_follow_the_folder_files(self):
        with Layout() as layout:
            bare = layout.visual("bare")
            self.assertEqual(default_checks(bare), [])
            full = layout.visual("full", files=("index.html", "raw.json", "build.py", "tests/b.test.mjs", "tests/a.test.cjs", "tests/test_model.py", "tests/helper.mjs"))
            self.assertEqual(default_checks(full), [
                ("build", [sys.executable, "build.py", "--verify"]),
                ("node", ["node", "--test", "tests/a.test.cjs", "tests/b.test.mjs"]),
                ("python", [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"]),
            ])


class ToolsTest(unittest.TestCase):
    def test_metadata_and_skills_must_name_the_registered_tools(self):
        with Layout() as layout:
            folder = layout.visual("alpha")
            self.assertEqual(tools_problems(folder, metadata()), [])
            self.assertEqual(len(tools_problems(folder, metadata(webmcp_tools=["get_data", "get_metadata", "lookup"]))), 1)
            (folder / "SKILLS.md").write_text(skills("get_data", "get_metadata", "query"), encoding="utf-8")
            self.assertEqual(tools_problems(folder, metadata()), [])
            (folder / "SKILLS.md").write_text(skills("get_data", "query"), encoding="utf-8")
            self.assertIn("SKILLS.md documents", tools_problems(folder, metadata())[0])

    def test_tools_registered_in_a_loop_make_the_literal_ones_a_lower_bound(self):
        with Layout() as layout:
            folder = layout.visual("alpha")
            (folder / "index.html").write_text(
                '<script>for (const t of TOOLS) mc.registerTool(t);mc.registerTool({name:"get_data"})</script>', encoding="utf-8")
            declared = metadata(webmcp_tools=["get_data", "get_metadata", "query"])
            self.assertEqual(tools_problems(folder, declared), [])
            self.assertIn("lacks registered ['get_data']", tools_problems(folder, metadata(webmcp_tools=["a", "b", "c"]))[0])
            (folder / "SKILLS.md").write_text(skills("get_data", "query"), encoding="utf-8")
            self.assertIn("!= visual.json webmcp_tools", tools_problems(folder, declared)[0])

    def test_a_page_registering_no_literal_tools_is_not_checked(self):
        with Layout() as layout:
            folder = layout.visual("alpha")
            (folder / "index.html").write_text("<script>for (const t of TOOLS) mc.registerTool(t)</script>", encoding="utf-8")
            self.assertIsNone(tools_problems(folder, metadata()))

    def test_tools_defined_in_a_list_or_through_a_helper_must_be_declared_exactly(self):
        with Layout() as layout:
            listed = layout.visual("listed")
            (listed / "index.html").write_text(
                '<script>const TOOLS = [{ name: "get_data", description: "rows" }, { name: "get_metadata", description: "meta" },'
                ' { name: "query", description: "filter" }]; for (const t of TOOLS) mc.registerTool(t);</script>', encoding="utf-8")
            self.assertEqual(tools_problems(listed, metadata()), [])
            self.assertIn("!= registered", tools_problems(listed, metadata(webmcp_tools=["get_data", "get_metadata", "lookup"]))[0])
            helper = layout.visual("helper")
            (helper / "index.html").write_text(
                "<script>const tool = (name, description, execute) => mc?.registerTool({ name, description, execute });"
                ' tool("get_data", "rows", f); tool("get_metadata", "meta", f);</script>', encoding="utf-8")
            self.assertIn("!= registered ['get_data', 'get_metadata']", tools_problems(helper, metadata())[0])


class RuleStepsTest(unittest.TestCase):
    def test_allowed_findings_pass_and_an_allow_entry_matching_nothing_fails(self):
        with Layout() as layout:
            folder = layout.visual("alpha", files=("index.html", "raw.json", "build.py"))
            (folder / "build.py").write_text("import os\n", encoding="utf-8")
            steps = dict(rule_steps(folder, metadata()))
            self.assertEqual(steps["pydead"], ["build.py:1: import os is unused"])
            self.assertEqual(steps["requests"], [])
            steps = dict(rule_steps(folder, metadata(allow={"python": ["build.py: import os is unused"], "contrast": ["light: gone"]})))
            self.assertEqual(steps["pydead"], [])
            self.assertEqual(steps["contrast"], ['visual.json allow.contrast lists "light: gone", which no longer occurs; remove it'])

    def test_a_test_that_only_reads_the_page_source_fails_unless_allowed(self):
        with Layout() as layout:
            folder = layout.visual("alpha", files=("index.html",))
            (folder / "tests").mkdir(exist_ok=True)
            (folder / "tests" / "page.test.mjs").write_text(
                'import { readFileSync } from "node:fs";\nimport assert from "node:assert/strict";\nimport test from "node:test";\n'
                'const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");\n'
                'test("the page has a title", () => { assert.match(html, /<title>/); });\n', encoding="utf-8")
            problem = 'tests/page.test.mjs: test "the page has a title" only checks source text; run the code and assert on what it does'
            self.assertEqual(dict(rule_steps(folder, metadata()))["sourcetests"], [problem])
            self.assertEqual(dict(rule_steps(folder, metadata(allow={"sourcetests": [problem]})))["sourcetests"], [])


def toon(layout, *args):
    """Run check.py --toon on ``layout``'s visuals; return (stdout, exit code)."""
    out = io.StringIO()
    with mock.patch.object(check, "ROOT", layout.root), mock.patch.object(check, "TSC", layout.root / "none"), \
            contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
        with self_exit() as code:
            main(["--toon", *args])
    return out.getvalue(), code[0]


@contextlib.contextmanager
def self_exit():
    code = [0]
    try:
        yield code
    except SystemExit as exit:
        code[0] = exit.code


class ToonTest(unittest.TestCase):
    """--toon never passes what it did not check: every filter reports its count and the total."""

    def layout(self):
        layout = Layout().__enter__()
        self.addCleanup(layout.__exit__)
        layout.visual("alpha")
        layout.visual("beta")
        return layout

    def test_every_visual_passing_passes_and_the_output_names_the_log(self):
        layout = self.layout()
        out, code = toon(layout)
        self.assertEqual(code, 0)
        self.assertTrue(out.startswith("verdict: pass\nfailures[0]"))
        self.assertIn("  2,2,2,0,every visual", out)
        log = out.split("log: ", 1)[1].split("\n", 1)[0]
        self.assertIn("checking 2 visual(s)", (layout.root / log).read_text(encoding="utf-8"))

    def test_a_named_visual_alone_does_not_pass_without_scoped(self):
        layout = self.layout()
        out, code = toon(layout, "alpha")
        self.assertEqual(code, 1)
        self.assertIn("verdict: fail\n", out)
        self.assertIn("  1,1,2,1,named", out)
        self.assertIn("1 visual(s) were not checked, so this is not a pass", out)

    def test_scoped_passes_on_the_selection_and_says_what_lies_outside(self):
        out, code = toon(self.layout(), "alpha", "--scoped")
        self.assertEqual(code, 0)
        self.assertIn("verdict: pass (scoped: 1 of 2 visuals; 1 outside the scope are not counted)", out)

    def test_a_failing_step_comes_first_with_its_place_and_fails_even_when_scoped(self):
        layout = self.layout()
        (layout.root / "viz" / "alpha" / "build.py").write_text("import os\nraise SystemExit('stale: index.html:3 differs')\n", encoding="utf-8")
        out, code = toon(layout, "alpha", "--scoped")
        self.assertEqual(code, 1)
        self.assertIn('failures[2]{visual,step,file_line,evidence}:\n  alpha,build,"viz/alpha/index.html:3","stale: index.html:3 differs"\n', out)
        self.assertIn('alpha,pydead,"viz/alpha/build.py:1","build.py:1: import os is unused"', out)

    def test_an_unknown_visual_an_unknown_ref_and_a_change_selecting_nothing_exit_2(self):
        layout = self.layout()
        out, code = toon(layout, "alpha", "gamma")
        self.assertEqual((code, out.splitlines()[:2]), (2, ["verdict: error", "error: unknown visual(s): gamma; a visual is a viz/<slug>/ folder with visual.json"]))
        out, code = toon(layout, "--changed", "no-such-ref-anywhere")
        self.assertEqual((code, out.splitlines()[1]), (2, "error: --changed: no-such-ref-anywhere is not a known ref"))
        git = ["git", "-c", "user.name=t", "-c", "user.email=t@example.org", "-c", "commit.gpgsign=false"]
        subprocess.run(["git", "init", "-q"], cwd=layout.root, check=True)
        subprocess.run([*git, "commit", "-q", "--allow-empty", "-m", "base"], cwd=layout.root, check=True)
        with mock.patch.object(check.changed, "selection", return_value=([], None)):
            out, code = toon(layout, "--changed", "HEAD")
        self.assertEqual((code, out.splitlines()[1]), (2, "error: --changed HEAD: the change selects no visual, so the filter matches nothing"))

    def test_scoped_needs_toon(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
            main(["alpha", "--scoped"])
        self.assertEqual(raised.exception.code, 2)


class EvidenceTest(unittest.TestCase):
    def test_a_rule_problem_gives_its_own_place(self):
        self.assertEqual(evidence("a", ["build.py:3: import os is unused"], b""), ("build.py:3: import os is unused", "viz/a/build.py:3"))

    def test_a_command_gives_its_failure_line_and_the_place_a_failure_names_over_a_stack_frame(self):
        output = (f"ok 1\n    at file://{check.ROOT.as_posix()}/viz/a/tests/x.test.mjs:9:3\n"
                  "SyntaxError: Identifier 'test' has already been declared\n"
                  "viz/a/tests/y.mjs(4,2): error TS2300: Duplicate identifier 'test'.\n").encode()
        self.assertEqual(evidence("a", (0, len(output)), output),
                         ("SyntaxError: Identifier 'test' has already been declared", "viz/a/tests/y.mjs:4"))

    def test_output_without_a_place_gives_its_first_failure_line_or_its_first_line(self):
        self.assertEqual(evidence("a", (0, 22), b"one\nTraceback: failed\n"), ("Traceback: failed", ""))
        self.assertEqual(evidence("a", (0, 0), b""), ("no output; read the log", ""))


if __name__ == "__main__":
    unittest.main()
