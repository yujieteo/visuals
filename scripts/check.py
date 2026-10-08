#!/usr/bin/env python3
"""Run one or more visuals' checks, each from its own folder and independent of every other visual.

For each viz/<slug>/, in order:
  build    python3 build.py --verify, when the folder has a builder; it fails too when the step changes a file
  node     node --test over tests/*.test.mjs and tests/*.test.cjs, when there are any
  python   python3 -m unittest discover over tests/test_*.py, when there are any
  types    scripts/typecheck.mjs, when the folder has a tsconfig.json
  tools    visual.json's webmcp_tools and SKILLS.md's WebMCP tools table name exactly the tools the page
           registers or defines (at least them, and agree with each other, when some are registered in a loop)
  template every copy of the site's beamdswitch template matches scripts/templates/beamdswitch.sha256
  requests the page requests only the files the site publishes beside it, never notes.md, and its scripts
           name no computed URL to fetch, import or a worker and set no absolute URL as a source
  contrast the page's colour tokens meet WCAG contrast in both themes
  theme    the page carries the site's theme script unchanged, and each [data-theme] block sets its color-scheme
  pydead   unused imports and locals, and definitions made twice, in the folder's Python
  sourcetests  tests whose every assertion checks the page's source text instead of running its code
  deadcode unused locals and imports, unreachable code and duplicate declarations in the page's inline
           scripts and its test modules (scripts/deadcode.mjs, with the type checker)
  vendor   every vendored block of the page (data-vendor) is the bundle built from scripts/vendor/, unchanged
  generated  a visual scripts/new_visual.py generated holds its current mechanical files (new_visual.py --check)
"checks" in visual.json replaces build, node and python with its own commands, run from the folder; the
steps after them always run. scripts/rules.py says what each rule checks, and visual.json "allow" lists the
findings a visual keeps on purpose.

Usage: scripts/check.py SLUG... | --all | --changed [BASE] [--require-typecheck]
       scripts/check.py --toon [SLUG... | --changed [BASE]] [--require-typecheck]

--changed selects the visuals scripts/changed.py finds changed against BASE (default origin/main, else
main). The type check and the dead-code check need `npm ci` at the repository root; without it they are
skipped unless --require-typecheck (CI) makes that a failure. A failing visual never stops the others.

--toon prints one TOON verdict and nothing else: the failing steps first, each with its visual, evidence
and first file:line, then counts and next steps; every step's full output goes to a log in build/logs/ that
the verdict names. Without a selection it checks every visual. With SLUGs or --changed the verdict covers
the selected visuals only, and the verdict line and the scope row say how many of the total that is and
how many were not checked. Exit 0 pass, 1 fail, 2 usage or environment error: an unknown visual, an
unknown BASE, a --changed that selects no visual, or --require-typecheck without typescript installed.
"""
import argparse
import contextlib
import datetime
import json
import os
import re
import shlex
import subprocess
import sys
import time

import changed
import new_visual
import rules
from visuals import ROOT, VIZ, folders, metadata

REGISTERED = re.compile(r"registerTool\(\{\s*name:\s*['\"](\w+)['\"]")
# Tools registered another way: tool objects in a list ({ name: "x", description: ... }), or a helper whose
# first parameter is the name it registers (const tool = (name, description, ...) => mc.registerTool({ name, ...).
DEFINED = re.compile(r"\bname:\s*['\"](\w+)['\"]\s*,\s*description\s*:")
HELPER = re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*\(\s*name\b[^)]*\)\s*=>[^;]{0,200}?registerTool\(\{\s*name\b")
DOCUMENTED = re.compile(r"^\| `(\w+)` \|", re.M)
TSC = ROOT / "node_modules" / "typescript" / "package.json"
# A place in a step's output: tests/x.test.mjs:12:5, x.mjs(12,5) from tsc, or File "x.py", line 3.
PLACE = re.compile(r'([\w./-]+\.(?:mjs|cjs|js|py|html|json|ts|md))(?::|\()(\d+)|File "([^"]+)", line (\d+)')
# A line that reports a failure: the evidence, and its place is preferred over one only a stack frame names.
FAILURE = re.compile(r"error|✖|not ok|\bfail", re.I)


def default_checks(folder):
    """The build, node and python steps the folder's files call for, as (name, argv) pairs."""
    steps = []
    if (folder / "build.py").is_file():
        steps.append(("build", [sys.executable, "build.py", "--verify"]))
    node_tests = sorted(p.relative_to(folder).as_posix() for pattern in ("*.test.mjs", "*.test.cjs") for p in (folder / "tests").glob(pattern))
    if node_tests:
        steps.append(("node", ["node", "--test", *node_tests]))
    if any((folder / "tests").glob("test_*.py")):
        steps.append(("python", [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"]))
    return steps


def tools_problems(folder, data):
    """Where visual.json or SKILLS.md disagrees with the tools the page registers.

    A page that registers every tool literally (registerTool({name: ...})) must declare exactly those. When
    it also registers others another way, such as from a list in a loop, the literal ones are only a lower
    bound: visual.json and SKILLS.md must then name them and agree with each other. A page that registers
    none literally must declare exactly the tools it defines, as { name, description } objects or through
    a helper that takes the name first.
    """
    html = (folder / "index.html").read_text(encoding="utf-8")
    literal = REGISTERED.findall(html)
    registered = set(literal)
    complete = len(literal) == html.count("registerTool(")
    if not registered and "registerTool(" in html:
        registered = set(DEFINED.findall(html))
        for helper in HELPER.findall(html):
            registered |= set(re.findall(rf"\b{helper}\(\s*['\"](\w+)['\"]", html))
        complete = True
    if not registered:
        return None
    declared = set(data.get("webmcp_tools", []))
    problems = []
    if complete and declared != registered:
        problems.append(f"visual.json webmcp_tools {sorted(declared)} != registered {sorted(registered)}")
    elif not complete and not registered <= declared:
        problems.append(f"visual.json webmcp_tools {sorted(declared)} lacks registered {sorted(registered - declared)}")
    skills = folder / "SKILLS.md"
    if skills.is_file() and "## WebMCP tools" in (text := skills.read_text(encoding="utf-8")):
        section = re.split(r"^## ", text.split("## WebMCP tools", 1)[1], maxsplit=1, flags=re.M)[0]
        documented = set(DOCUMENTED.findall(section))
        if complete and documented != registered:
            problems.append(f"SKILLS.md documents {sorted(documented)} != registered {sorted(registered)}")
        elif not complete and documented != declared:
            problems.append(f"SKILLS.md documents {sorted(documented)} != visual.json webmcp_tools {sorted(declared)}")
    return problems


def rule_steps(folder, data):
    """(name, problems) for each static rule that applies to the folder, its allowed findings removed."""
    html = (folder / "index.html").read_text(encoding="utf-8")
    allow = data.get("allow", {})
    steps = []
    if (folder / "beamdswitch.js").is_file():
        steps.append(("template", rules.template_problems(folder)))
    if "data-vendor=" in html:
        steps.append(("vendor", rules.vendor_problems(html)))
    if (folder / "generated.json").is_file():
        steps.append(("generated", new_visual.drift(folder, page=False)))
    for name, key, problems in (
        ("requests", "requests", rules.request_problems(html, data)),
        ("contrast", "contrast", rules.contrast_problems(html)),
        ("theme", "theme", rules.theme_problems(html)),
        ("pydead", "python", rules.python_folder_problems(folder)),
        ("sourcetests", "sourcetests", rules.source_tests_problems(folder)),
    ):
        left, stale = rules.allowed(problems, allow.get(key))
        steps.append((name, left + [f'visual.json allow.{key} lists "{entry}", which no longer occurs; remove it' for entry in stale]))
    return steps


def offset():
    """Where the next output lands in stdout, when stdout is a file (the --toon log); None otherwise."""
    sys.stdout.flush()
    sys.stderr.flush()
    try:
        return os.lseek(1, 0, os.SEEK_CUR)
    except OSError:
        return None


def run(name, argv, folder, log):
    start, begin = time.monotonic(), offset()
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    shell = isinstance(argv, str)
    result = subprocess.run(argv, cwd=folder, env=env, shell=shell)
    log.append((name, "ok" if result.returncode == 0 else "FAIL", time.monotonic() - start, (begin, offset())))
    return result.returncode == 0


def snapshot(folder):
    """Every file of the folder, by path and bytes, apart from Python's caches."""
    return {p: p.read_bytes() for p in sorted(folder.rglob("*")) if p.is_file() and "__pycache__" not in p.parts}


def restore(folder, before):
    """Put the folder back as ``before`` was; return the names of the files the step had added, changed or removed."""
    after = snapshot(folder)
    for path in after.keys() - before.keys():
        path.unlink()
    for path, data in before.items():
        if after.get(path) != data:
            path.write_bytes(data)
    return sorted({p.relative_to(folder).as_posix() for p in after.keys() ^ before.keys()} | {p.relative_to(folder).as_posix() for p in before.keys() & after.keys() if before[p] != after[p]})


def check(slug, require_typecheck=False):
    """Run one visual's checks; return [(step, status, seconds)]."""
    folder = ROOT / VIZ / slug
    log = []
    data = metadata(folder) if folder.is_dir() else None
    if data is None:
        print(f"[{slug}] no viz/{slug}/visual.json", file=sys.stderr)
        return [("visual.json", "FAIL", 0.0, [f"no viz/{slug}/visual.json"])]
    steps = [(f"check {i + 1}", command) for i, command in enumerate(data["checks"])] if "checks" in data else default_checks(folder)
    for name, argv in steps:
        shown = argv if isinstance(argv, str) else shlex.join(["python3" if arg == sys.executable else arg for arg in argv])
        print(f"[{slug}] {name}: {shown}", flush=True)
        before = snapshot(folder) if name == "build" else None
        run(name, argv, folder, log)
        if before is not None:
            changed = restore(folder, before)
            if changed:
                problems = [f"build.py --verify wrote {', '.join(changed)}: it must only check, so the committed output is stale or the builder ignores --verify (the files are restored)"]
                print(f"[{slug}] build: {problems[0]}", file=sys.stderr)
                log.append(("build writes nothing", "FAIL", 0.0, problems))
    if (folder / "tsconfig.json").is_file():
        if TSC.is_file():
            print(f"[{slug}] types: scripts/typecheck.mjs {slug}", flush=True)
            run("types", ["node", str(ROOT / "scripts" / "typecheck.mjs"), slug], ROOT, log)
        elif require_typecheck:
            print(f"[{slug}] types: typescript is not installed; run npm ci", file=sys.stderr)
            log.append(("types", "FAIL", 0.0, ["typescript is not installed; run npm ci"]))
        else:
            log.append(("types", "skipped (npm ci)", 0.0, None))
    for name, problems in rule_steps(folder, data):
        for problem in problems:
            print(f"[{slug}] {name}: {problem}", file=sys.stderr)
        log.append((name, "FAIL" if problems else "ok", 0.0, problems))
    if TSC.is_file():
        print(f"[{slug}] deadcode: scripts/deadcode.mjs {slug}", flush=True)
        run("deadcode", ["node", str(ROOT / "scripts" / "deadcode.mjs"), slug], ROOT, log)
    elif require_typecheck:
        print(f"[{slug}] deadcode: typescript is not installed; run npm ci", file=sys.stderr)
        log.append(("deadcode", "FAIL", 0.0, ["typescript is not installed; run npm ci"]))
    else:
        log.append(("deadcode", "skipped (npm ci)", 0.0, None))
    problems = tools_problems(folder, data)
    if problems is None:
        log.append(("tools", "skipped (none registered literally)", 0.0, None))
    else:
        for problem in problems:
            print(f"[{slug}] tools: {problem}", file=sys.stderr)
        log.append(("tools", "FAIL" if problems else "ok", 0.0, problems))
    return log


def default_base():
    for ref in ("origin/main", "main"):
        if subprocess.run(["git", "rev-parse", "--verify", "--quiet", ref], cwd=ROOT, capture_output=True).returncode == 0:
            return ref
    return None


def cell(value):
    """One TOON value, quoted when it holds a separator, a quote, a colon or space at its ends."""
    text = str(value)
    return json.dumps(text) if not text or re.search(r'[,"\n:]|^\s|\s$', text) else text


def table(name, fields, rows):
    return "\n".join([f"{name}[{len(rows)}]{{{','.join(fields)}}}:", *("  " + ",".join(cell(v) for v in row) for row in rows)])


def evidence(slug, detail, text):
    """(first line of evidence, file:line) for a failed step: its first problem, or its output's first line
    that names a place (or else its last line)."""
    if isinstance(detail, list):
        first = detail[0] if detail else ""
        match = PLACE.search(first)
        place = f"viz/{slug}/{match.group(1)}:{match.group(2)}" if match and match.group(1) else ""
        return first, place
    begin, end = detail if detail else (None, None)
    segment = text[begin:end].decode("utf-8", "replace") if begin is not None and end is not None else ""
    lines = [line.strip().replace("file://", "").replace(f"{ROOT.as_posix()}/", "") for line in segment.splitlines() if line.strip()]
    places = [(line, match) for line in lines if (match := PLACE.search(line)) and "node_modules" not in line and "node:" not in match.group(0)]
    failing = [line for line in lines if FAILURE.search(line) if not line.startswith(("ℹ", "✖ failing tests"))]
    first = (failing or lines or ["no output; read the log"])[0][:200]
    for line, match in sorted(places, key=lambda pair: not FAILURE.search(pair[0])):
        path, number = (match.group(1), match.group(2)) if match.group(1) else (match.group(3), match.group(4))
        if not path.startswith(("/", "viz/", "scripts/")):
            path = f"viz/{slug}/{path}"
        return first, f"{path}:{number}"
    return first, ""


def toon(results, slugs, total, reason, log_path):
    """The --toon verdict and exit code."""
    text = log_path.read_bytes()
    failures, counts = [], {"ok": 0, "FAIL": 0, "skipped": 0}
    for slug, log in results.items():
        for name, status, _, detail in log:
            counts["skipped" if status.startswith("skipped") else status] += 1
            if status == "FAIL":
                first, place = evidence(slug, detail, text)
                failures.append([slug, name, place, first])
    failed = sorted({row[0] for row in failures})
    outside = total - len(slugs)
    fail = bool(failures)
    relative = log_path.relative_to(ROOT).as_posix()
    lines = [
        f"verdict: {'fail' if fail else 'pass'}" + (f" (on {len(slugs)} of {total} visuals; {outside} not checked)" if outside else ""),
        table("failures", ["visual", "step", "file_line", "evidence"], failures),
        "scope{selected,checked,total,not_checked,reason}:",
        "  " + ",".join(cell(v) for v in (len(slugs), len(results), total, outside, reason)),
        "visuals{pass,fail}:",
        f"  {len(results) - len(failed)},{len(failed)}",
        "steps{ok,fail,skipped}:",
        f"  {counts['ok']},{counts['FAIL']},{counts['skipped']}",
        f"log: {relative}",
    ]
    help = []
    if failed:
        help.append(f"Fix the first failure, then run `python3 scripts/check.py --toon {failed[0]}` to check that visual again")
        help.append(f"Read {relative} for each step's full output; search it with `rg -n '^\\[{failed[0]}\\]' {relative}`")
    if any(row[1] == "types" for row in failures):
        help.append(f"Run `npm run typecheck -- --summary {next(row[0] for row in failures if row[1] == 'types')}` for the type errors by code and file")
    if outside:
        help.append(f"{outside} visual(s) were not checked; run `python3 scripts/check.py --toon` for every visual")
    if counts["skipped"] and not failures:
        help.append("Some steps were skipped; run `npm ci` once so the type and dead-code checks run")
    if not fail:
        help.append("All counted checks passed; the browser checks are in e2e/ (see e2e/README.md)")
    lines.append(table("help", ["next"], [[h] for h in help]))
    print("\n".join(lines))
    return 1 if fail else 0


def toon_main(args):
    every = [folder.name for folder in folders(ROOT)]
    if args.changed is not None:
        base = args.changed or default_base()
        if base is None or subprocess.run(["git", "rev-parse", "--verify", "--quiet", f"{base}^{{commit}}"], cwd=ROOT, capture_output=True).returncode != 0:
            return usage(f"--changed: {base or 'origin/main or main'} is not a known ref")
        slugs, reason = changed.selection(base)
        reason = reason or f"changed since {base}"
        if not slugs:
            return usage(f"--changed {base}: the change selects no visual, so the filter matches nothing")
    elif args.slugs:
        unknown = [slug for slug in args.slugs if slug not in every]
        if unknown:
            return usage(f"unknown visual(s): {', '.join(unknown)}; a visual is a viz/<slug>/ folder with visual.json")
        slugs, reason = list(dict.fromkeys(args.slugs)), "named"
    else:
        slugs, reason = every, "every visual"
    if args.require_typecheck and not TSC.is_file():
        return usage("--require-typecheck: typescript is not installed", "Run `npm ci` at the repository root, then run this command again")
    logs = ROOT / "build" / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    log_path = logs / f"check-{datetime.datetime.now().strftime('%Y%m%dT%H%M%S%f')}.log"
    sys.stdout.flush()
    saved = os.dup(1), os.dup(2)
    with open(log_path, "w", encoding="utf-8") as log:
        os.dup2(log.fileno(), 1)
        os.dup2(log.fileno(), 2)
        try:
            with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
                print(f"checking {len(slugs)} visual(s): {reason}", flush=True)
                results = {slug: check(slug, args.require_typecheck) for slug in slugs}
        finally:
            sys.stdout.flush()
            sys.stderr.flush()
            os.dup2(saved[0], 1)
            os.dup2(saved[1], 2)
            for fd in saved:
                os.close(fd)
    return toon(results, slugs, len(every), reason, log_path)


def usage(message, next="Run `python3 scripts/check.py --toon` for every visual, or name a folder in viz/"):
    print(f"verdict: error\nerror: {message}")
    print(table("help", ["next"], [[next]]))
    return 2


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("slugs", nargs="*")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--all", action="store_true", help="every visual")
    group.add_argument("--changed", nargs="?", const="", metavar="BASE", help="the visuals changed against BASE")
    parser.add_argument("--require-typecheck", action="store_true", help="fail, not skip, when typescript is missing")
    parser.add_argument("--toon", action="store_true", help="print one TOON verdict; full output goes to build/logs/")
    args = parser.parse_args(argv)
    if args.toon:
        sys.exit(toon_main(args))
    if args.all:
        slugs, reason = changed.selection(None)
    elif args.changed is not None:
        slugs, reason = changed.selection(args.changed or default_base())
    elif args.slugs:
        slugs, reason = args.slugs, "named"
    else:
        parser.error("name visuals, or pass --all or --changed")
    print(f"checking {len(slugs)} visual(s): {reason}", flush=True)
    results = {slug: check(slug, args.require_typecheck) for slug in slugs}
    failed = sorted(slug for slug, log in results.items() if any(status == "FAIL" for _, status, _, _ in log))
    print("\nvisual | step | result | seconds")
    for slug, log in results.items():
        for name, status, seconds, _ in log:
            print(f"{slug} | {name} | {status} | {seconds:.1f}")
    if failed:
        print(f"\nfailed: {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)
    print(f"\nall {len(slugs)} visual(s) passed")


if __name__ == "__main__":
    main()
