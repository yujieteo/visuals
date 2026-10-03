"""scripts/check.py: the steps a folder calls for, the WebMCP tools check and the allow list of the rule steps."""
import sys
import unittest

from helpers import Layout, metadata

from check import default_checks, rule_steps, tools_problems

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


if __name__ == "__main__":
    unittest.main()
