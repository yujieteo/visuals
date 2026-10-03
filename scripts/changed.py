#!/usr/bin/env python3
"""Which visuals a change touches, so CI and the gate run only their checks.

A path in viz/<slug>/ selects that visual. A shared file that visuals list in "uses" in their visual.json
selects those visuals only. Documentation selects none. Any other path is shared tooling (scripts, schema,
tests of the tooling, package.json, CI) and selects every visual.

Usage: scripts/changed.py [--base REF] [--github-output]

Without --base every visual is selected. With it, the change is everything since the merge base of REF and
HEAD, plus uncommitted and untracked files. --github-output also writes `slugs=<JSON list>` to
$GITHUB_OUTPUT for a CI matrix.
"""
import argparse
import json
import os
import subprocess
import sys

from visuals import ROOT, VIZ, folders, visuals

# Paths that change no visual's behaviour: the repository-wide job still checks them.
DOCS_FILES = {"LICENSE", ".gitignore", ".gitattributes", ".github/pull_request_template.md"}
DOCS_DIRS = ("docs/", ".agents/")


def is_docs(path):
    return path in DOCS_FILES or path.startswith(DOCS_DIRS) or ("/" not in path and path.endswith(".md"))


def uses_index(by_slug):
    """Map each shared path a visual lists in "uses" to the slugs that list it."""
    index = {}
    for slug, data in by_slug.items():
        for used in data.get("uses", []):
            index.setdefault(used.rstrip("/"), set()).add(slug)
    return index


def select(paths, root=ROOT):
    """Return (sorted slugs, reason) for a change to ``paths``."""
    existing = {folder.name for folder in folders(root)}
    by_slug = visuals(root)
    used = uses_index(by_slug)
    selected, shared = set(), []
    for path in paths:
        parts = path.split("/")
        if parts[0] == VIZ and len(parts) > 2:
            if parts[1] in existing:
                selected.add(parts[1])
            continue
        users = {slug for prefix, slugs in used.items() if path == prefix or path.startswith(prefix + "/") for slug in slugs}
        if users:
            selected |= users
        elif not is_docs(path):
            shared.append(path)
    if shared:
        return sorted(existing), f"shared tooling changed ({', '.join(sorted(shared)[:3])}{', ...' if len(shared) > 3 else ''})"
    return sorted(selected), ("changed visuals" if selected else "no visual changed")


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def changed_paths(base):
    """Paths changed since the merge base of ``base`` and HEAD, including uncommitted and untracked ones."""
    merge_base = git("merge-base", base, "HEAD").strip()
    paths = git("diff", "-z", "--name-only", "--no-renames", merge_base).split("\0")
    paths += git("ls-files", "-z", "--others", "--exclude-standard").split("\0")
    return sorted({path for path in paths if path})


def selection(base):
    """Return (slugs, reason) for the change against ``base``; every visual when it cannot be listed."""
    if base is None:
        return [folder.name for folder in folders()], "every visual (no base)"
    try:
        paths = changed_paths(base)
    except (OSError, subprocess.CalledProcessError) as error:
        detail = (getattr(error, "stderr", "") or str(error)).strip()
        return [folder.name for folder in folders()], f"every visual (cannot list changes against {base}: {detail})"
    return select(paths)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base", help="git ref to compare against; omit to select every visual")
    parser.add_argument("--github-output", action="store_true", help="also write slugs=<JSON> to $GITHUB_OUTPUT")
    args = parser.parse_args(argv)
    slugs, reason = selection(args.base)
    print(f"{len(slugs)} visual(s): {reason}", file=sys.stderr)
    print(json.dumps(slugs))
    if args.github_output:
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
            out.write(f"slugs={json.dumps(slugs)}\n")


if __name__ == "__main__":
    main()
