#!/usr/bin/env python3
"""Which visuals a change touches, so CI and the gate run only their checks.

A path in viz/<slug>/ selects that visual. A shared file that visuals list in "uses" in their visual.json
selects those visuals only. Documentation selects none. Any other path is shared tooling (scripts, schema,
tests of the tooling, package.json, CI) and selects every visual.

The browser checks are chosen apart: a selected visual runs its own, and a path in e2e/site/<slug>/ runs
the browser checks of that visual the site keeps itself. The browser harness (the rest of e2e/) and CI run
every visual's browser checks, every visual the site keeps included; the harness selects no visual's other
checks, while CI, like the rest of the shared tooling, selects them all. The rest of the shared tooling,
which the harness does not use, runs no browser checks.

Usage: scripts/changed.py [--base REF] [--github-output]

Without --base every visual is selected, and the browser checks also cover every visual the site keeps. With
it, the change is everything since the merge base of REF and HEAD, plus uncommitted and untracked files.
--github-output also writes `slugs=<JSON list>` and `browser=<JSON list of browser jobs>` to $GITHUB_OUTPUT
for the CI matrices.
"""
import argparse
import json
import os
import subprocess
import sys

from visuals import ROOT, VIZ, folders, visuals

# Paths that change no visual's behaviour: the repository-wide job still checks them.
DOCS_FILES = {"LICENSE", "e2e/LICENSE", ".gitignore", ".gitattributes", ".github/pull_request_template.md"}
DOCS_DIRS = ("docs/", ".agents/")
E2E, E2E_SITE = "e2e/", "e2e/site/"
# Shared paths the browser checks depend on: the harness and CI.
BROWSER_TOOLING = (E2E, ".github/")
# Up to this many browser targets each get their own job per browser; more are split into SHARDS jobs.
MAX_BROWSER_JOBS = 40
SHARDS = 8


def is_docs(path):
    return path in DOCS_FILES or path.startswith(DOCS_DIRS) or (path.endswith(".md") and ("/" not in path or path.startswith(E2E)))


def uses_index(by_slug):
    """Map each shared path a visual lists in "uses" to the slugs that list it."""
    index = {}
    for slug, data in by_slug.items():
        for used in data.get("uses", []):
            index.setdefault(used.rstrip("/"), set()).add(slug)
    return index


def scan(paths, root):
    """Sort a change's paths into (every slug, the visuals it touches, the site visuals whose browser checks it
    touches, the shared paths it touches)."""
    existing = {folder.name for folder in folders(root)}
    used = uses_index(visuals(root))
    selected, site, shared = set(), set(), []
    for path in paths:
        parts = path.split("/")
        if parts[0] == VIZ and len(parts) > 2:
            if parts[1] in existing:
                selected.add(parts[1])
            continue
        users = {slug for prefix, slugs in used.items() if path == prefix or path.startswith(prefix + "/") for slug in slugs}
        if users:
            selected |= users
        elif is_docs(path):
            continue
        elif path.startswith(E2E_SITE) and len(parts) > 3:
            site.add(parts[2])
        else:
            shared.append(path)
    return existing, selected, site, shared


def shared_reason(shared):
    return f"shared tooling changed ({', '.join(sorted(shared)[:3])}{', ...' if len(shared) > 3 else ''})"


def select(paths, root=ROOT):
    """Return (sorted slugs, reason) for a change to ``paths``: the visuals whose own checks run."""
    existing, selected, _, shared = scan(paths, root)
    shared = [path for path in shared if not path.startswith(E2E)]
    if shared:
        return sorted(existing), shared_reason(shared)
    return sorted(selected), ("changed visuals" if selected else "no visual changed")


def browser_jobs(slugs, site=(), every_site_visual=False):
    """The browser jobs for these visuals, those the site keeps, and every one it keeps when asked.

    Each job is {"name", "only": E2E_ONLY's comma-separated slugs, empty for every site visual, "site": whether
    it needs a clone of yujieteo/site}.
    """
    jobs = [{"name": slug, "only": slug, "site": True} for slug in sorted(site)]
    slugs = sorted(slugs)
    if len(jobs) + len(slugs) <= MAX_BROWSER_JOBS:
        jobs += [{"name": slug, "only": slug, "site": False} for slug in slugs]
    else:
        jobs += [{"name": f"shard {i + 1} of {SHARDS}", "only": ",".join(slugs[i::SHARDS]), "site": False} for i in range(SHARDS)]
    if every_site_visual:
        jobs.append({"name": "every site visual", "only": "", "site": True})
    return jobs


def browser(paths, root=ROOT):
    """Return (browser jobs, reason) for a change to ``paths``."""
    existing, selected, site, shared = scan(paths, root)
    tooling = [path for path in shared if path.startswith(BROWSER_TOOLING)]
    if tooling:
        return browser_jobs(existing, every_site_visual=True), shared_reason(tooling)
    return browser_jobs(selected, site), ("changed visuals" if selected or site else "no visual changed")


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def changed_paths(base):
    """Paths changed since the merge base of ``base`` and HEAD, including uncommitted and untracked ones."""
    merge_base = git("merge-base", base, "HEAD").strip()
    paths = git("diff", "-z", "--name-only", "--no-renames", merge_base).split("\0")
    paths += git("ls-files", "-z", "--others", "--exclude-standard").split("\0")
    return sorted({path for path in paths if path})


def change(base):
    """Return (paths, None) for the change against ``base``, or (None, reason) when every visual runs."""
    if base is None:
        return None, "every visual (no base)"
    try:
        return changed_paths(base), None
    except (OSError, subprocess.CalledProcessError) as error:
        detail = (getattr(error, "stderr", "") or str(error)).strip()
        return None, f"every visual (cannot list changes against {base}: {detail})"


def selection(base):
    """Return (slugs, reason) for the change against ``base``; every visual when it cannot be listed."""
    paths, reason = change(base)
    return select(paths) if paths is not None else ([folder.name for folder in folders()], reason)


def browser_selection(base):
    """Return (browser jobs, reason) for the change against ``base``; every visual, the site's too, when it
    cannot be listed."""
    paths, reason = change(base)
    if paths is not None:
        return browser(paths)
    return browser_jobs([folder.name for folder in folders()], every_site_visual=True), reason


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base", help="git ref to compare against; omit to select every visual")
    parser.add_argument("--github-output", action="store_true", help="also write slugs=<JSON> to $GITHUB_OUTPUT")
    args = parser.parse_args(argv)
    slugs, reason = selection(args.base)
    jobs, browser_reason = browser_selection(args.base)
    print(f"{len(slugs)} visual(s): {reason}", file=sys.stderr)
    print(f"{len(jobs)} browser job(s): {', '.join(job['name'] for job in jobs) or 'none'}; {browser_reason}", file=sys.stderr)
    print(json.dumps(slugs))
    if args.github_output:
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
            out.write(f"slugs={json.dumps(slugs)}\nbrowser={json.dumps(jobs)}\n")


if __name__ == "__main__":
    main()
