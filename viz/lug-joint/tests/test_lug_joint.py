import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIZ = ROOT


class LugJointTests(unittest.TestCase):
    def test_build_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / "lug-joint"
            shutil.copytree(VIZ, copy, ignore=shutil.ignore_patterns("__pycache__", ".git", ".github", "tests"))
            subprocess.run([sys.executable, str(copy / "build.py")], check=True, capture_output=True)
            self.assertEqual((copy / "index.html").read_text(encoding="utf-8"), (VIZ / "index.html").read_text(encoding="utf-8"))

    def test_engine_self_tests_pass_under_node(self):
        script = 'const t = require(process.argv[1]).selfTests(); process.stdout.write(JSON.stringify(t));'
        run = subprocess.run([shutil.which("node") or "node", "-e", script, str(VIZ / "engine.js")], check=True, capture_output=True, text=True)
        results = json.loads(run.stdout)
        self.assertGreaterEqual(len(results), 10)
        self.assertEqual([r["name"] for r in results if not r["pass"]], [])


if __name__ == "__main__":
    unittest.main()
