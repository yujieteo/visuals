#!/usr/bin/env python3
"""Copy yujieteo/site's beamdswitch report template into every visual that carries it, in one command.

A narrated visual carries the template unchanged: viz/<slug>/beamdswitch.js, the copy its tests read in
tests/fixtures/beamdswitch/, the block its index.html inlines, and in some tests the template's SHA-256. When
the site changes templates/beamdswitch.js, all of those change the same way, so this script takes each
visual whose beamdswitch.js differs from the new template and replaces that old text, and its SHA-256, with
the new ones in every file of the visual's folder. Visuals without a beamdswitch.js are left alone.

Usage: scripts/sync_template.py TEMPLATE [--check]

TEMPLATE is the site's templates/beamdswitch.js (a path, such as ../site/templates/beamdswitch.js).
--check writes nothing and fails, naming the visuals that carry another template, when there are any.
The "Sync beamdswitch template" workflow runs it in CI and pushes the result to a branch.
"""
import argparse
import hashlib
import sys
from pathlib import Path

from visuals import ROOT, folders

COPY = "beamdswitch.js"
SKIPPED = {"node_modules", ".typecheck"}


def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def stale(template, root=ROOT):
    """Map each visual whose beamdswitch.js is not ``template`` to the text it holds instead."""
    out = {}
    for folder in folders(root):
        copy = folder / COPY
        if copy.is_file() and (text := copy.read_text(encoding="utf-8")) != template:
            out[folder.name] = text
    return out


def sync(template, root=ROOT):
    """Replace each stale visual's old template text and its SHA-256 with the new ones, in every file of its folder.

    Returns {slug: [changed files, relative to the folder]}.
    """
    changed = {}
    for slug, old in stale(template, root).items():
        folder = root / "viz" / slug
        pairs = [(old, template), (sha256(old), sha256(template))]
        for path in sorted(folder.rglob("*")):
            if not path.is_file() or SKIPPED.intersection(path.relative_to(folder).parts):
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            new = text
            for before, after in pairs:
                new = new.replace(before, after)
            if new != text:
                path.write_text(new, encoding="utf-8")
                changed.setdefault(slug, []).append(path.relative_to(folder).as_posix())
    return changed


def main(argv=None, root=ROOT):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("template", type=Path, help="the site's templates/beamdswitch.js")
    parser.add_argument("--check", action="store_true", help="fail, naming the visuals that differ, instead of writing")
    args = parser.parse_args(argv)
    template = args.template.read_text(encoding="utf-8")
    if args.check:
        behind = sorted(stale(template, root))
        if behind:
            print(f"{len(behind)} visual(s) carry another beamdswitch template: {', '.join(behind)}\n"
                  f"run: python3 scripts/sync_template.py {args.template}", file=sys.stderr)
            sys.exit(1)
        print("every visual carries this beamdswitch template")
        return
    changed = sync(template, root)
    for slug, files in changed.items():
        print(f"{slug}: {', '.join(files)}")
    print(f"updated {len(changed)} visual(s); check them with python3 scripts/check.py --changed")


if __name__ == "__main__":
    main()
