"""scripts/with_chrome.py: outside CI it runs the check unchanged; in CI it needs the runner's Chrome."""
import os
import subprocess
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "with_chrome.py"
# Exits 0 only when BROWSER_URL is unset, so the exit status shows what the command saw.
PROBE = [sys.executable, "-c", "import os, sys; sys.exit(0 if 'BROWSER_URL' not in os.environ else 3)"]


def run(env):
    return subprocess.run([sys.executable, str(SCRIPT), "BROWSER_URL", *PROBE], env=env, capture_output=True, text=True)


class WithChromeTest(unittest.TestCase):
    def test_outside_ci_the_command_runs_without_a_browser_and_keeps_its_status(self):
        env = {k: v for k, v in os.environ.items() if k != "CI"}
        self.assertEqual(run(env).returncode, 0)
        failing = subprocess.run([sys.executable, str(SCRIPT), "BROWSER_URL", sys.executable, "-c", "raise SystemExit(5)"],
                                 env=env, capture_output=True)
        self.assertEqual(failing.returncode, 5)

    def test_in_ci_without_chrome_it_fails_instead_of_skipping_the_browser_tests(self):
        result = run({"CI": "true", "PATH": "/nonexistent"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no google-chrome", result.stderr)


if __name__ == "__main__":
    unittest.main()
