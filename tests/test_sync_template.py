"""scripts/sync_template.py: the site's beamdswitch template copied into every visual that carries it."""
import contextlib
import io
import unittest

from helpers import Layout

from sync_template import main, sha256, stale, sync

OLD = "(function () {\n  return { deck: () => 'old' };\n})();\n"
NEW = "(function () {\n  return { deck: () => 'new' };\n})();\n"


class SyncTemplateTest(unittest.TestCase):
    def setUp(self):
        self.layout = Layout().__enter__()
        self.addCleanup(self.layout.__exit__)
        root = self.layout.root
        self.narrated = self.layout.visual("narrated", files=("raw.json",))
        for name in ("beamdswitch.js", "tests/fixtures/beamdswitch/beamdswitch.js"):
            (self.narrated / name).parent.mkdir(parents=True, exist_ok=True)
            (self.narrated / name).write_text(OLD, encoding="utf-8")
        (self.narrated / "index.html").write_text(f"<script id=\"beamdswitch\">\n{OLD}</script>\n<p>old</p>", encoding="utf-8")
        (self.narrated / "tests" / "copy.test.mjs").write_text(f'const SHA = "{sha256(OLD)}";\n', encoding="utf-8")
        self.current = self.layout.visual("current")
        (self.current / "beamdswitch.js").write_text(NEW, encoding="utf-8")
        self.plain = self.layout.visual("plain")
        (self.plain / "notes.txt").write_text(OLD, encoding="utf-8")
        self.template = root / "beamdswitch.js"
        self.template.write_text(NEW, encoding="utf-8")

    def run_main(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                main([str(self.template), *args], root=self.layout.root)
                code = 0
            except SystemExit as exit:
                code = exit.code
        return code, out.getvalue(), err.getvalue()

    def test_only_visuals_carrying_another_template_are_stale(self):
        self.assertEqual(stale(NEW, self.layout.root), {"narrated": OLD})

    def test_every_copy_and_its_sha256_in_a_stale_folder_take_the_new_template(self):
        self.assertEqual(sync(NEW, self.layout.root), {"narrated": [
            "beamdswitch.js", "index.html", "tests/copy.test.mjs", "tests/fixtures/beamdswitch/beamdswitch.js"]})
        self.assertEqual((self.narrated / "beamdswitch.js").read_text(encoding="utf-8"), NEW)
        self.assertEqual((self.narrated / "tests/fixtures/beamdswitch/beamdswitch.js").read_text(encoding="utf-8"), NEW)
        self.assertEqual((self.narrated / "index.html").read_text(encoding="utf-8"), f"<script id=\"beamdswitch\">\n{NEW}</script>\n<p>old</p>")
        self.assertEqual((self.narrated / "tests/copy.test.mjs").read_text(encoding="utf-8"), f'const SHA = "{sha256(NEW)}";\n')
        self.assertEqual(stale(NEW, self.layout.root), {})
        self.assertEqual(sync(NEW, self.layout.root), {})

    def test_a_folder_without_its_own_copy_is_left_alone_even_when_a_file_holds_the_old_text(self):
        sync(NEW, self.layout.root)
        self.assertEqual((self.plain / "notes.txt").read_text(encoding="utf-8"), OLD)

    def test_check_fails_naming_the_stale_visuals_and_writes_nothing(self):
        code, _, err = self.run_main("--check")
        self.assertEqual(code, 1)
        self.assertIn("1 visual(s) carry another beamdswitch template: narrated", err)
        self.assertEqual((self.narrated / "beamdswitch.js").read_text(encoding="utf-8"), OLD)
        self.assertEqual(self.run_main()[0], 0)
        self.assertEqual(self.run_main("--check")[:2], (0, "every visual carries this beamdswitch template\n"))


if __name__ == "__main__":
    unittest.main()
