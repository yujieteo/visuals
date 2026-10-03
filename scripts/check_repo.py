#!/usr/bin/env python3
"""The fast repository-wide check, run on every change whatever it touches.

Every viz/<slug>/ has a visual.json that matches schema/visual.schema.json and names files that exist; no
file in the working tree, including ignored ones such as .claude/settings.local.json, holds an absolute
user-home path; Git tracks no build or OS artifact (__pycache__, *.pyc, .DS_Store, AppleDouble ._*) and
.gitignore keeps them out; and the shared tooling's Python (scripts/, tests/) has no unused import or local
and no definition made twice. Each visual's own checks are scripts/check.py's; the rules are scripts/rules.py.

Usage: scripts/check_repo.py
"""
import re
import subprocess
import sys

import rules
from build_catalogue import load
from visuals import ROOT

HOME_PATH = re.compile(r"/(?:Users|home)/[^/\s]+/")
# Generated, cached or installed, never written by hand: build/ and .typecheck/ come from tracked files, and
# .cache/ holds the browser checks' site clone.
SKIPPED = {".git", "__pycache__", ".ruff_cache", "node_modules", ".typecheck", "build", ".cache"}


def home_paths(root=ROOT):
    """Files under ``root`` that contain an absolute user-home path."""
    found = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and not SKIPPED & set(path.relative_to(root).parts):
            if HOME_PATH.search(path.read_text(encoding="utf-8", errors="ignore")):
                found.append(path.relative_to(root).as_posix())
    return found


def tracked(root=ROOT):
    """Every path Git tracks under ``root``."""
    out = subprocess.run(["git", "ls-files", "-z"], cwd=root, check=True, capture_output=True, text=True).stdout
    return [path for path in out.split("\0") if path]


def tooling_problems(root=ROOT):
    """Unused or duplicated Python in the shared tooling and its tests."""
    return [problem for folder in ("scripts", "tests") for problem in rules.python_folder_problems(root / folder, f"{folder}/")]


def main():
    by_slug, errors = load()
    errors += [f"{path}: holds an absolute user-home path" for path in home_paths()]
    errors += rules.artifact_problems(tracked(), (ROOT / ".gitignore").read_text(encoding="utf-8"))
    errors += tooling_problems()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    print(f"verified: {len(by_slug)} visual folder(s), every visual.json valid, no absolute user-home paths, "
          "no tracked build or OS artifacts, no unused or duplicated tooling Python")


if __name__ == "__main__":
    main()
