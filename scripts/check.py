#!/usr/bin/env python3
"""Run one or more visuals' checks, each from its own folder and independent of every other visual.

For each viz/<slug>/, in order:
  build    python3 build.py --verify, when the folder has a builder
  node     node --test over tests/*.test.mjs and tests/*.test.cjs, when there are any
  python   python3 -m unittest discover over tests/test_*.py, when there are any
  types    scripts/typecheck.mjs, when the folder has a tsconfig.json
  tools    visual.json's webmcp_tools and SKILLS.md's WebMCP tools table name exactly the tools the page
           registers or defines (at least them, and agree with each other, when some are registered in a loop)
  template every copy of the site's beamdswitch template matches scripts/templates/beamdswitch.sha256
  requests the page requests only the files the site publishes beside it, never notes.md
  contrast the page's colour tokens meet WCAG contrast in both themes
  pydead   unused imports and locals, and definitions made twice, in the folder's Python
  deadcode unused locals and imports, unreachable code and duplicate declarations in the page's inline
           scripts and its test modules (scripts/deadcode.mjs, with the type checker)
  sourcetests  tests that only search the page's source text; reported, never failed
"checks" in visual.json replaces build, node and python with its own commands, run from the folder; the
steps after them always run. scripts/rules.py says what each rule checks, and visual.json "allow" lists the
findings a visual keeps on purpose.

Usage: scripts/check.py SLUG... | --all | --changed [BASE] [--require-typecheck]

--changed selects the visuals scripts/changed.py finds changed against BASE (default origin/main, else
main). The type check and the dead-code check need `npm ci` at the repository root; without it they are
skipped unless --require-typecheck (CI) makes that a failure. A failing visual never stops the others.
"""
import argparse
import os
import re
import shlex
import subprocess
import sys
import time

import changed
import rules
from visuals import ROOT, VIZ, metadata

REGISTERED = re.compile(r"registerTool\(\{\s*name:\s*['\"](\w+)['\"]")
# Tools registered another way: tool objects in a list ({ name: "x", description: ... }), or a helper whose
# first parameter is the name it registers (const tool = (name, description, ...) => mc.registerTool({ name, ...).
DEFINED = re.compile(r"\bname:\s*['\"](\w+)['\"]\s*,\s*description\s*:")
HELPER = re.compile(r"\b(?:const|let|var)\s+(\w+)\s*=\s*\(\s*name\b[^)]*\)\s*=>[^;]{0,200}?registerTool\(\{\s*name\b")
DOCUMENTED = re.compile(r"^\| `(\w+)` \|", re.M)
TSC = ROOT / "node_modules" / "typescript" / "package.json"


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
    for name, key, problems in (
        ("requests", "requests", rules.request_problems(html, data)),
        ("contrast", "contrast", rules.contrast_problems(html)),
        ("pydead", "python", rules.python_folder_problems(folder)),
    ):
        left, stale = rules.allowed(problems, allow.get(key))
        steps.append((name, left + [f'visual.json allow.{key} lists "{entry}", which no longer occurs; remove it' for entry in stale]))
    return steps


def run(name, argv, folder, log):
    start = time.monotonic()
    env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
    shell = isinstance(argv, str)
    result = subprocess.run(argv, cwd=folder, env=env, shell=shell)
    log.append((name, "ok" if result.returncode == 0 else "FAIL", time.monotonic() - start))
    return result.returncode == 0


def check(slug, require_typecheck=False):
    """Run one visual's checks; return [(step, status, seconds)]."""
    folder = ROOT / VIZ / slug
    log = []
    data = metadata(folder) if folder.is_dir() else None
    if data is None:
        print(f"[{slug}] no viz/{slug}/visual.json", file=sys.stderr)
        return [("visual.json", "FAIL", 0.0)]
    steps = [(f"check {i + 1}", command) for i, command in enumerate(data["checks"])] if "checks" in data else default_checks(folder)
    for name, argv in steps:
        shown = argv if isinstance(argv, str) else shlex.join(["python3" if arg == sys.executable else arg for arg in argv])
        print(f"[{slug}] {name}: {shown}", flush=True)
        run(name, argv, folder, log)
    if (folder / "tsconfig.json").is_file():
        if TSC.is_file():
            print(f"[{slug}] types: scripts/typecheck.mjs {slug}", flush=True)
            run("types", ["node", str(ROOT / "scripts" / "typecheck.mjs"), slug], ROOT, log)
        elif require_typecheck:
            print(f"[{slug}] types: typescript is not installed; run npm ci", file=sys.stderr)
            log.append(("types", "FAIL", 0.0))
        else:
            log.append(("types", "skipped (npm ci)", 0.0))
    for name, problems in rule_steps(folder, data):
        for problem in problems:
            print(f"[{slug}] {name}: {problem}", file=sys.stderr)
        log.append((name, "FAIL" if problems else "ok", 0.0))
    if TSC.is_file():
        print(f"[{slug}] deadcode: scripts/deadcode.mjs {slug}", flush=True)
        run("deadcode", ["node", str(ROOT / "scripts" / "deadcode.mjs"), slug], ROOT, log)
    elif require_typecheck:
        print(f"[{slug}] deadcode: typescript is not installed; run npm ci", file=sys.stderr)
        log.append(("deadcode", "FAIL", 0.0))
    else:
        log.append(("deadcode", "skipped (npm ci)", 0.0))
    weak = rules.source_tests_problems(folder)
    for problem in weak:
        print(f"[{slug}] sourcetests (report only): {problem}", file=sys.stderr)
    log.append(("sourcetests", f"report ({len(weak)})" if weak else "ok", 0.0))
    problems = tools_problems(folder, data)
    if problems is None:
        log.append(("tools", "skipped (none registered literally)", 0.0))
    else:
        for problem in problems:
            print(f"[{slug}] tools: {problem}", file=sys.stderr)
        log.append(("tools", "FAIL" if problems else "ok", 0.0))
    return log


def default_base():
    for ref in ("origin/main", "main"):
        if subprocess.run(["git", "rev-parse", "--verify", "--quiet", ref], cwd=ROOT, capture_output=True).returncode == 0:
            return ref
    return None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("slugs", nargs="*")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--all", action="store_true", help="every visual")
    group.add_argument("--changed", nargs="?", const="", metavar="BASE", help="the visuals changed against BASE")
    parser.add_argument("--require-typecheck", action="store_true", help="fail, not skip, when typescript is missing")
    args = parser.parse_args(argv)
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
    failed = sorted(slug for slug, log in results.items() if any(status == "FAIL" for _, status, _ in log))
    print("\nvisual | step | result | seconds")
    for slug, log in results.items():
        for name, status, seconds in log:
            print(f"{slug} | {name} | {status} | {seconds:.1f}")
    if failed:
        print(f"\nfailed: {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)
    print(f"\nall {len(slugs)} visual(s) passed")


if __name__ == "__main__":
    main()
