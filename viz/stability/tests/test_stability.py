import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE_FILES = ("build.py", "engine.js", "beamdswitch.js", "raw.json", "template.html", "index.html")


class StabilityTests(unittest.TestCase):
    def test_build_is_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / "stability"
            copy.mkdir()
            for name in PAGE_FILES:
                shutil.copy2(ROOT / name, copy / name)
            subprocess.run([sys.executable, str(copy / "build.py")], check=True, capture_output=True)
            self.assertEqual((copy / "index.html").read_text(encoding="utf-8"), (ROOT / "index.html").read_text(encoding="utf-8"))

    def test_engine_self_tests_pass_under_node(self):
        script = 'const t = require(process.argv[1]).selfTests(); process.stdout.write(JSON.stringify(t));'
        run = subprocess.run([shutil.which("node") or "node", "-e", script, str(ROOT / "engine.js")], check=True, capture_output=True, text=True)
        results = json.loads(run.stdout)
        self.assertGreaterEqual(len(results), 40)
        self.assertEqual([r["name"] for r in results if not r["pass"]], [])


if __name__ == "__main__":
    unittest.main()
