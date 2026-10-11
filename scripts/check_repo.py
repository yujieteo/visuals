#!/usr/bin/env python3
"""The fast repository-wide check, run on every change whatever it touches.

Every viz/<slug>/ has a visual.json that matches schema/visual.schema.json and names files that exist; no
file in the working tree, including ignored ones such as .claude/settings.local.json, holds an absolute
user-home path; every tracked Python file parses on this interpreter (CI runs Python 3.9 and 3.12);
Git tracks no build or OS artifact (__pycache__, *.pyc, .DS_Store, AppleDouble ._*) and .gitignore keeps them
out; and the shared tooling's Python (scripts/, tests/) has no unused import or local
and no definition made twice; the vendored MathJax files match the SHA-256 list in scripts/vendor/mathjax/SOURCES.json;
and the kit's copied files match scripts/kit/SOURCES.json. Each visual's own checks are scripts/check.py's; the
rules are scripts/rules.py.

Usage: scripts/check_repo.py
"""
import json
import re
import subprocess
import sys

import rules
import visual_kit
from build_catalogue import load
from visuals import ROOT

HOME_PATH = re.compile(r"/(?:Users|home)/[^/\s]+/")
# Generated, cached or installed, never written by hand: build/, .typecheck/ and target/ (cargo) come from tracked
# files.
SKIPPED = {".git", "__pycache__", ".ruff_cache", "node_modules", ".typecheck", "build", "target"}


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


def shared_copy_problems(root=ROOT):
    """Vendored files and copied kit files that changed."""
    problems = visual_kit.vendor_problems(root / "scripts" / "vendor" / "mathjax")
    kit = root / "scripts" / "kit"
    for name, source in json.loads((kit / "SOURCES.json").read_text(encoding="utf-8"))["files"].items():
        if visual_kit.sha256((kit / name).read_bytes()) != source["sha256"]:
            problems.append(f"scripts/kit/{name}: differs from {source['source']} at {source['commit'][:12]} (scripts/kit/SOURCES.json); "
                            "copy the new file and record its sha256, never edit it here")
    return problems


def main():
    by_slug, errors = load()
    errors += [f"{path}: holds an absolute user-home path" for path in home_paths()]
    paths = tracked()
    python_paths = [path for path in paths if path.endswith(".py")]
    errors += rules.python_syntax_problems(ROOT, python_paths)
    errors += rules.artifact_problems(paths, (ROOT / ".gitignore").read_text(encoding="utf-8"))
    errors += tooling_problems()
    errors += shared_copy_problems()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    print(f"verified: {len(by_slug)} visual folder(s), every visual.json valid, "
          f"{len(python_paths)} tracked Python file(s) parse on Python {sys.version_info.major}.{sys.version_info.minor}, "
          "no absolute user-home paths, no tracked build or OS artifacts, no unused or duplicated tooling Python, "
          "vendored and copied kit files unchanged")


if __name__ == "__main__":
    main()
