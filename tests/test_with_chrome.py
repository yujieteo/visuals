"""scripts/with_chrome.py: outside CI it runs the check unchanged; in CI it needs the runner's Chrome."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "with_chrome.py"
# Exits 0 only when BROWSER_URL is unset, so the exit status shows what the command saw.
PROBE = [sys.executable, "-c", "import os, sys; sys.exit(0 if 'BROWSER_URL' not in os.environ else 3)"]
# A stand-in google-chrome that answers DevTools' /json/version on its port and ignores SIGTERM.
FAKE_CHROME = f"""#!{sys.executable}
import http.server, signal, sys
signal.signal(signal.SIGTERM, signal.SIG_IGN)
port = int(next(a for a in sys.argv if a.startswith("--remote-debugging-port=")).split("=")[1])
class Version(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"{{}}")
    def log_message(self, *args):
        pass
http.server.HTTPServer(("127.0.0.1", port), Version).serve_forever()
"""

# A stand-in google-chrome with a helper process that, like Chrome's, keeps writing into the profile for a
# moment after the browser itself has exited on SIGTERM.
LINGERING_CHROME = f"""#!{sys.executable}
import http.server, os, signal, subprocess, sys
port = int(next(a for a in sys.argv if a.startswith("--remote-debugging-port=")).split("=")[1])
profile = next(a for a in sys.argv if a.startswith("--user-data-dir=")).split("=", 1)[1]
WRITER = "import os, sys, time\\nfor i in range(600):\\n    os.makedirs(os.path.join(sys.argv[1], 'Default'), exist_ok=True)\\n    open(os.path.join(sys.argv[1], 'Default', str(i)), 'w').close()\\n    time.sleep(0.005)"
subprocess.Popen([sys.executable, "-c", WRITER, profile])
signal.signal(signal.SIGTERM, lambda *_: os._exit(0))
class Version(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"{{}}")
    def log_message(self, *args):
        pass
http.server.HTTPServer(("127.0.0.1", port), Version).serve_forever()
"""

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

    def test_in_ci_a_chrome_that_ignores_sigterm_is_killed_and_the_command_keeps_its_status(self):
        with tempfile.TemporaryDirectory() as bin_dir:
            chrome = Path(bin_dir) / "google-chrome"
            chrome.write_text(FAKE_CHROME)
            chrome.chmod(0o755)
            result = subprocess.run([sys.executable, str(SCRIPT), "BROWSER_URL", sys.executable, "-c", "raise SystemExit(7)"],
                                    env={**os.environ, "CI": "true", "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"},
                                    capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 7, result.stderr)

    def test_in_ci_a_profile_chrome_still_writes_to_does_not_replace_the_command_status(self):
        with tempfile.TemporaryDirectory() as bin_dir:
            chrome = Path(bin_dir) / "google-chrome"
            chrome.write_text(LINGERING_CHROME)
            chrome.chmod(0o755)
            for status in (0, 7):
                with self.subTest(status=status):
                    result = subprocess.run([sys.executable, str(SCRIPT), "BROWSER_URL", sys.executable, "-c", f"raise SystemExit({status})"],
                                            env={**os.environ, "CI": "true", "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"},
                                            capture_output=True, text=True, timeout=60)
                    self.assertEqual(result.returncode, status, result.stderr)


if __name__ == "__main__":
    unittest.main()
