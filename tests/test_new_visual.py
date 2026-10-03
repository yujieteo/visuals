"""scripts/new_visual.py: a generated visual is complete, deterministic and passes the checks; --check reports drift
in mechanical parts only, and --update rewrites them without touching domain code."""
import contextlib
import io
import json
import shutil
import subprocess
import unittest

from helpers import ROOT, Layout

import check
import new_visual
import rules
import visual_build
import visual_kit
from build_catalogue import load

ARGS = ["--title", "Tide clock: a test", "--summary", "A test visual. Works offline.", "--fetched", "2026-10-04", "--tags", "test"]
EXAMPLE = "visual-skeleton"


def generated(root, slug="tide-clock", *extra):
    """Generate ``slug`` under ``root`` and return its folder."""
    return new_visual.generate(new_visual.parse([slug, *ARGS, *extra]), root)


def files(folder):
    """Every file of a folder by relative path, without the type checker's ignored output."""
    return {p.relative_to(folder).as_posix(): p.read_bytes() for p in sorted(folder.rglob("*"))
            if p.is_file() and ".typecheck" not in p.relative_to(folder).parts}


class GeneratorLayout(Layout):
    """A temporary root with schema/ and viz/ (Layout) and the real scripts/, which generated pages and tests use."""

    def __enter__(self):
        super().__enter__()
        (self.root / "scripts").symlink_to(ROOT / "scripts", target_is_directory=True)
        return self


class RenderTest(unittest.TestCase):
    def test_sections_are_kept_or_dropped_by_their_flag_and_placeholders_replaced(self):
        text = "a {{slug}}\n{{#mathjax}}\nmath\n{{/mathjax}}\n{{^mathjax}}\nplain\n{{/mathjax}}\nend\n"
        self.assertEqual(new_visual.render(text, {"slug": "x"}, {"mathjax": True}), "a x\nmath\nend\n")
        self.assertEqual(new_visual.render(text, {"slug": "x"}, {}), "a x\nplain\nend\n")

    def test_a_placeholder_left_over_fails_but_jsdoc_braces_do_not(self):
        self.assertEqual(new_visual.render("/** @type {{ a: 1 }} */\n", {}, {}), "/** @type {{ a: 1 }} */\n")
        with self.assertRaises(SystemExit):
            new_visual.render("{{title}}\n", {}, {})


class GenerateTest(unittest.TestCase):
    def setUp(self):
        self.layout = GeneratorLayout().__enter__()
        self.addCleanup(self.layout.__exit__)
        self.root = self.layout.root

    def test_the_same_arguments_give_the_same_bytes(self):
        first = generated(self.root, "tide-clock", "--3d")
        with GeneratorLayout() as other:
            second = generated(other.root, "tide-clock", "--3d")
            self.assertEqual(files(first), files(second))

    def test_a_generated_visual_is_valid_passes_its_own_tests_and_every_static_rule(self):
        folder = generated(self.root)
        by_slug, errors = load(self.root)
        self.assertEqual(errors, [])
        self.assertEqual(by_slug["tide-clock"]["webmcp_tools"], ["get_metadata", "get_state", "get_markdown", "get_example"])
        html = (folder / "index.html").read_text(encoding="utf-8")
        self.assertEqual(html, visual_build.page(folder))
        data = by_slug["tide-clock"]
        for name, problems in check.rule_steps(folder, data):
            self.assertEqual(problems, [], name)
        self.assertEqual(check.tools_problems(folder, data), [])
        self.assertNotIn("data-vendor", html)
        tests = sorted(p.name for p in (folder / "tests").glob("*.test.mjs"))
        self.assertEqual(tests, ["tide-clock-kit.test.mjs", "tide-clock-model.test.mjs"])
        run = subprocess.run(["node", "--test", *(f"tests/{name}" for name in tests)], cwd=folder, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout[-2000:] + run.stderr[-2000:])

    def test_mathjax_embeds_the_vendored_bundle_and_its_licences(self):
        folder = generated(self.root, "tide-clock", "--mathjax")
        html = (folder / "index.html").read_text(encoding="utf-8")
        self.assertIn(f'<script id="mathjax" data-vendor="{visual_kit.MATHJAX}">\n{visual_kit.mathjax_bundle().rstrip()}\n</script>', html)
        self.assertEqual(rules.vendor_problems(html), [])
        self.assertIn("SIL OPEN FONT LICENSE Version 1.1", html)
        self.assertIn("Apache License", html)
        self.assertIn("scripts/vendor/mathjax", json.loads((folder / "visual.json").read_text(encoding="utf-8"))["uses"])
        tampered = html.replace("window.MathJax = {", "window.MathJax = { tampered: 1,", 1)
        self.assertEqual(len(rules.vendor_problems(tampered)), 1)

    def test_an_existing_folder_or_an_unsafe_title_is_refused(self):
        generated(self.root)
        with self.assertRaises(SystemExit):
            generated(self.root)
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            new_visual.parse(["other", "--title", 'Say "hi"', "--summary", "s"])

    def test_the_beamdswitch_copy_is_the_recorded_template_with_its_source_and_sha256(self):
        folder = generated(self.root)
        template = (ROOT / "scripts" / "templates" / "beamdswitch.js").read_text(encoding="utf-8")
        self.assertEqual((folder / "beamdswitch.js").read_text(encoding="utf-8"), template)
        record = json.loads((folder / "generated.json").read_text(encoding="utf-8"))["beamdswitch"]
        self.assertEqual(record, {"source": "yujieteo/site templates/beamdswitch.js", "copy": "beamdswitch.js", "sha256": visual_kit.sha256(template)})


class DriftTest(unittest.TestCase):
    def setUp(self):
        self.layout = GeneratorLayout().__enter__()
        self.addCleanup(self.layout.__exit__)
        self.folder = generated(self.layout.root)

    def test_a_fresh_visual_has_no_drift(self):
        self.assertEqual(new_visual.drift(self.folder), [])

    def test_drift_names_each_changed_mechanical_part_and_update_restores_them_keeping_domain_edits(self):
        kit_test = self.folder / "tests" / "tide-clock-kit.test.mjs"
        kit_test.write_text(kit_test.read_text(encoding="utf-8") + "// edited\n", encoding="utf-8")
        (self.folder / "beamdswitch.js").write_text("old template\n", encoding="utf-8")
        meta = json.loads((self.folder / "visual.json").read_text(encoding="utf-8"))
        meta["uses"] = ["scripts/kit"]
        (self.folder / "visual.json").write_text(json.dumps(meta), encoding="utf-8")
        model = self.folder / "src" / "model.js"
        domain = model.read_text(encoding="utf-8").replace("Light damping", "Some damping")
        model.write_text(domain, encoding="utf-8")
        problems = new_visual.drift(self.folder)
        self.assertEqual([p.split(":")[0] for p in problems], ["tests/tide-clock-kit.test.mjs", "beamdswitch.js", "visual.json", "index.html"])
        with contextlib.redirect_stdout(io.StringIO()):
            new_visual.update("tide-clock", self.layout.root)
        self.assertEqual(new_visual.drift(self.folder), [])
        self.assertEqual(model.read_text(encoding="utf-8"), domain)
        self.assertIn("Some damping", (self.folder / "index.html").read_text(encoding="utf-8"))

    def test_update_refuses_a_visual_the_generator_did_not_write(self):
        self.layout.visual("hand-made")
        with self.assertRaises(SystemExit):
            new_visual.update("hand-made", self.layout.root)

    def test_a_hand_made_visual_is_reported_by_the_parts_it_lacks(self):
        problems = new_visual.hand_made(self.layout.visual("hand-made"))
        self.assertEqual([p.split(":")[0] for p in problems], ["beamdswitch.js", "theme", "tokens", "tokens", "state", "tests", "e2e", "e2e"])


class ExampleTest(unittest.TestCase):
    def test_the_committed_example_is_exactly_what_the_generator_writes(self):
        folder = ROOT / "viz" / EXAMPLE
        meta = json.loads((folder / "visual.json").read_text(encoding="utf-8"))
        options = json.loads((folder / "generated.json").read_text(encoding="utf-8"))["options"]
        args = [EXAMPLE, "--title", meta["title"], "--summary", meta["summary"], "--subject", options["subject"],
                "--tags", ",".join(meta["tags"]), "--fetched", meta["fetched"], "--mathjax", "--3d", "--unpublished"]
        with GeneratorLayout() as layout:
            fresh = new_visual.generate(new_visual.parse(args), layout.root)
            self.assertEqual(sorted(files(folder)), sorted(files(fresh)))
            for name, data in files(fresh).items():
                self.assertEqual(files(folder)[name], data, f"viz/{EXAMPLE}/{name} is not the generator's output")

    def test_the_vendored_files_match_their_recorded_sha256(self):
        self.assertEqual(visual_kit.vendor_problems(), [])
        with Layout() as layout:
            copy = layout.root / "mathjax"
            shutil.copytree(visual_kit.VENDOR, copy)
            (copy / "mathjax-fira-font" / "svg.js").write_text("changed", encoding="utf-8")
            (copy / "extra.js").write_text("", encoding="utf-8")
            self.assertEqual(len(visual_kit.vendor_problems(copy)), 2)


if __name__ == "__main__":
    unittest.main()
