"""The folder is a complete, self-contained project and its built page is current."""

import importlib.util
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Loaded under its own name so it cannot clash with another module called "build".
_spec = importlib.util.spec_from_file_location("sectionlab_build", ROOT / "build.py")
build = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build)


class BuildTest(unittest.TestCase):
    def test_index_html_is_current(self):
        self.assertEqual(build.main(["--check"]), 0)

    def test_skills_router_links_resolve(self):
        text = (ROOT / "SKILLS.md").read_text(encoding="utf-8")
        links = re.findall(r"\]\(([^)#]+)\)", text)
        self.assertGreaterEqual(len(links), 5)
        for link in links:
            if link.startswith("http"):
                continue
            self.assertTrue((ROOT / link).is_file(), link)

    def test_folder_builds_on_its_own(self):
        # Mirrored as a standalone repository: a copy of the folder alone must build and reproduce its reference.
        with tempfile.TemporaryDirectory() as tmp:
            copy = Path(tmp) / "sectionlab"
            shutil.copytree(ROOT, copy, ignore=shutil.ignore_patterns("__pycache__", "node_modules"))
            for args in (["build.py", "--check"], ["reference/build_reference.py", "--check"]):
                run = subprocess.run([sys.executable, *args], cwd=copy, capture_output=True, text=True)
                self.assertEqual(run.returncode, 0, f"{' '.join(args)}: {run.stderr}")

    def test_page_is_not_labelled_as_a_code_check(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("Verify independently", html)
        self.assertNotRegex(html.lower(), r"design[- ]code compliant|code[- ]compliant results")


if __name__ == "__main__":
    unittest.main()
