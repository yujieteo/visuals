#!/usr/bin/env python3
"""The fast repository-wide check, run on every change whatever it touches.

Every viz/<slug>/ has a visual.json that matches schema/visual.schema.json and names files that exist, and
no file in the working tree, including ignored ones such as .claude/settings.local.json, holds an absolute
user-home path. Each visual's own checks are scripts/check.py's.

Usage: scripts/check_repo.py
"""
import re
import sys

from build_catalogue import load
from visuals import ROOT

HOME_PATH = re.compile(r"/(?:Users|home)/[^/\s]+/")
# Generated, cached or installed, never written by hand: build/ and .typecheck/ come from tracked files.
SKIPPED = {".git", "__pycache__", ".ruff_cache", "node_modules", ".typecheck", "build"}


def home_paths(root=ROOT):
    """Files under ``root`` that contain an absolute user-home path."""
    found = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and not SKIPPED & set(path.relative_to(root).parts):
            if HOME_PATH.search(path.read_text(encoding="utf-8", errors="ignore")):
                found.append(path.relative_to(root).as_posix())
    return found


def main():
    by_slug, errors = load()
    errors += [f"{path}: holds an absolute user-home path" for path in home_paths()]
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    print(f"verified: {len(by_slug)} visual folder(s), every visual.json valid, no absolute user-home paths")


if __name__ == "__main__":
    main()
