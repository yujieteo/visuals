#!/usr/bin/env python3
"""Run a visual's check with a headless Chrome listening for DevTools, as its browser tests expect.

In CI (CI is set), start the runner's google-chrome headless on a free port, wait until it answers,
run the command with VAR set to its http://127.0.0.1:<port> address, then stop Chrome. Anywhere else,
run the command unchanged: those tests skip without VAR, so a local gate never drives a browser.

Usage (in a visual.json check, run from the folder): python3 ../../scripts/with_chrome.py VAR command...
"""
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def main(argv):
    if len(argv) < 2:
        sys.exit("usage: with_chrome.py VAR command...")
    var, command = argv[0], argv[1:]
    chrome = shutil.which("google-chrome")
    if not os.environ.get("CI") or not chrome:
        if os.environ.get("CI"):
            sys.exit("with_chrome.py: CI has no google-chrome")
        sys.exit(subprocess.run(command).returncode)
    port = free_port()
    url = f"http://127.0.0.1:{port}"
    profile = tempfile.mkdtemp()
    try:
        browser = subprocess.Popen([chrome, "--headless=new", f"--remote-debugging-port={port}", "--remote-allow-origins=*",
                                    "--no-sandbox", "--disable-gpu", f"--user-data-dir={profile}", "about:blank"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(60):
                try:
                    urllib.request.urlopen(f"{url}/json/version", timeout=1).close()
                    break
                except OSError:
                    time.sleep(0.5)
            else:
                sys.exit(f"with_chrome.py: Chrome did not answer on {url}")
            sys.exit(subprocess.run(command, env={**os.environ, var: url}).returncode)
        finally:
            browser.terminate()
            try:
                browser.wait(timeout=10)
            except subprocess.TimeoutExpired:
                browser.kill()
                browser.wait()
    finally:
        # Chrome's helper processes can still be writing into the profile as the browser exits, so a cleanup
        # error must not replace the command's own exit status. (Not TemporaryDirectory(ignore_cleanup_errors=True):
        # that needs Python 3.10, and the tooling runs on the Python 3.9 macOS ships as python3.)
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main(sys.argv[1:])
