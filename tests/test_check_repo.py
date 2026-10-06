"""The repository check parses every tracked .py, including the VISU-22 f-string regression."""
import shutil
import subprocess
import sys
import unittest

from helpers import ROOT, Layout

import rules

# The multi-armed-bandit builder's pre-VISU-22 expression: legal only on Python 3.12+.
NEW_FSTRING = '''def table_head(n):
    return f'<th scope="col"{" class=\\"n\\"" if n else ""}>'
'''


class TrackedPythonTest(unittest.TestCase):
    def setUp(self):
        self.layout = Layout().__enter__()
        self.addCleanup(self.layout.__exit__)
        self.root = self.layout.root
        shutil.copytree(ROOT / "scripts", self.root / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        (self.root / ".gitignore").write_text("\n".join(rules.IGNORED), encoding="utf-8")
        subprocess.run(["git", "init", "--quiet", str(self.root)], check=True, capture_output=True)

    def write(self, name, source, tracked=True):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(source)
        if tracked:
            subprocess.run(["git", "add", "--", name], cwd=self.root, check=True, capture_output=True)
        return path

    def check(self):
        return subprocess.run([sys.executable, str(self.root / "scripts" / "check_repo.py")],
                              cwd=self.root, capture_output=True, text=True)

    def test_tracked_paths_with_spaces_and_encoding_cookies_parse_without_execution(self):
        self.write("viz/encoded helper.py", b"# coding: latin-1\nlabel = 'caf\xe9'\nraise RuntimeError(label)\n")
        self.write("other/deep/helper\nname.py", b"raise RuntimeError('must not run')\n")
        self.write("untracked.py", b"def broken(\n", tracked=False)
        self.write("ignored.txt", b"def broken(\n")
        result = self.check()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("2 tracked Python file(s) parse", result.stdout)
        self.assertEqual(list((self.root / "viz").rglob("*.pyc")), [])

    def test_all_syntax_failures_are_reported_with_path_and_line(self):
        self.write("other/deep/broken.py", b"value = 1\ndef broken(\n")
        self.write("viz/second broken.py", b"def broken(\n")
        result = self.check()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("other/deep/broken.py:2: does not parse:", result.stderr)
        self.assertIn("viz/second broken.py:1: does not parse:", result.stderr)

    def test_visu_22_f_string_is_rejected_before_python_312(self):
        self.layout.visual("multi-armed-bandit")
        self.write("viz/multi-armed-bandit/build.py", NEW_FSTRING.encode())
        result = self.check()
        if sys.version_info < (3, 12):
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertIn("viz/multi-armed-bandit/build.py:2: does not parse:", result.stderr)
        else:
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("1 tracked Python file(s) parse", result.stdout)

    def test_a_missing_tracked_file_fails_instead_of_reducing_coverage(self):
        self.write("missing.py", b"value = 1\n").unlink()
        result = self.check()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("missing.py: cannot read tracked Python file:", result.stderr)


if __name__ == "__main__":
    unittest.main()
