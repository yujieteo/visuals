#!/usr/bin/env python3
"""Generate a new visual's folder with every mechanical part of the interactive visual specification, check an
existing visual's mechanical parts for drift, or rewrite them, without touching its domain code.

A generated viz/<slug>/ passes scripts/check.py, CI and its browser checks as written. It holds two kinds of file:

  mechanical  the generator owns them and --update rewrites them: build.py, beamdswitch.js (the site's template,
              byte for byte), tsconfig.json, types/globals.d.ts, tests/<slug>-kit.test.mjs, .gitattributes, the
              "uses" and "typecheck" keys of visual.json, generated.json and index.html (built by build.py)
  domain      written once from a starter, then the visual's own, never rewritten: src/model.js, src/view.js,
              src/body.html, src/style.css, report.js, raw.json, tests/<slug>-model.test.mjs, e2e/manifest.json,
              e2e/full.test.mjs, SKILLS.md, AGENTS.md and the catalogue fields of visual.json

The page's shared code is not copied into the folder: build.py inlines the kit (scripts/kit/), the style guide's
tokens and, with --mathjax, MathJax 4.1.3 with its Fira font and their licences (scripts/vendor/mathjax/) from
scripts/, and the folder lists those paths in "uses". generated.json records the options, the kit's version and
the beamdswitch template's source and SHA-256. The output depends only on the arguments: run it twice and the
bytes are the same.

Usage:
  scripts/new_visual.py SLUG --title TITLE --summary SUMMARY [--mathjax] [--3d] [options]
  scripts/new_visual.py --check [SLUG... | --all]    report drift in mechanical parts; exit 1 when there is any
  scripts/new_visual.py --update SLUG...             rewrite a generated visual's mechanical parts and rebuild it
"""
import argparse
import datetime
import json
import re
import sys

import rules
import visual_build
import visual_kit as kit
from visuals import ROOT, SLUG, VIZ, folders

GENERATOR = "scripts/new_visual.py"
STARTER = kit.KIT / "starter"
MECHANICAL_TEMPLATES = kit.KIT / "mechanical"
# The tools every generated page registers through the kit; a visual's own tools follow them.
KIT_TOOLS = ["get_metadata", "get_state", "get_markdown"]
TITLE = re.compile(r"[^\"`\\$<>&*_#|{}\n]{1,120}")
TAG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
DEFAULT_PURPOSE = ("explore the view, read its state and the values derived from it, and keep it as JSON, a "
                   "Markdown record or a narrated beamdswitch deck.")


def render(text, values, flags):
    """A starter or mechanical template with its {{#flag}} ... {{/flag}} and {{^flag}} ... {{/flag}} lines kept or
    dropped and every {{name}} replaced. A placeholder left over is an error, so a template cannot ship a placeholder."""
    def section(match):
        keep = flags.get(match.group(2), False) == (match.group(1) == "#")
        return match.group(3) if keep else ""
    text = re.sub(r"^\{\{([#^])(\w+)\}\}\n(.*?)^\{\{/\2\}\}\n", section, text, flags=re.M | re.S)
    for name, value in values.items():
        text = text.replace(f"{{{{{name}}}}}", value)
    if left := re.search(r"\{\{[#^/]?\w+\}\}", text):
        raise SystemExit(f"a template holds an unknown placeholder: {left.group(0)}")
    return text


def json_text(value):
    return json.dumps(value, indent=2, ensure_ascii=False) + "\n"


def uses(options):
    """The shared paths outside viz/ a generated visual depends on, so a change to one runs its checks."""
    out = ["scripts/kit", "scripts/templates/beamdswitch", "scripts/templates/beamdswitch.js",
           "scripts/visual_build.py", "scripts/visual_kit.py"]
    if options.get("mathjax"):
        out.append("scripts/vendor/mathjax")
    return out


def typecheck(options):
    """The inline blocks scripts/typecheck.mjs leaves out: each is a file tsconfig.json checks directly."""
    return {"skip": ["kit", *(["view3d"] if options.get("three_d") else []), "beamdswitch", "model", "report", "view"]}


def record(options):
    """generated.json: what the generator wrote the folder from."""
    template = kit.beamdswitch_template()
    return {
        "generator": GENERATOR,
        "kit": kit.KIT_VERSION,
        "options": options,
        "beamdswitch": {"source": "yujieteo/site templates/beamdswitch.js", "copy": "beamdswitch.js", "sha256": kit.sha256(template)},
        "domain": sorted(starter_files(options["slug"])),
    }


def mechanical_files(options):
    """{path: text} of every mechanical file but index.html, for a visual generated with ``options``."""
    slug = options["slug"]
    values = {"slug": slug, "title": options["title"]}
    flags = {"mathjax": options.get("mathjax", False), "three_d": options.get("three_d", False)}
    out = {}
    for source, target in (("build.py", "build.py"), ("tsconfig.json", "tsconfig.json"),
                           ("types/globals.d.ts", "types/globals.d.ts"), ("kit.test.mjs", f"tests/{slug}-kit.test.mjs")):
        out[target] = render(kit.read(MECHANICAL_TEMPLATES / source), values, flags)
    out["beamdswitch.js"] = kit.beamdswitch_template()
    out[".gitattributes"] = "# index.html is built by build.py from src/, report.js, raw.json and the shared kit; never edit it by hand.\nindex.html linguist-generated=true\n"
    out["generated.json"] = json_text(record(options))
    return out


def starter_files(slug):
    """The domain files a generated visual starts with, by their path in the folder."""
    return {"src/model.js": "model.js", "src/view.js": "view.js", "src/body.html": "body.html", "src/style.css": "style.css",
            "report.js": "report.js", "raw.json": "raw.json", f"tests/{slug}-model.test.mjs": "model.test.mjs",
            "e2e/manifest.json": "manifest.json", "e2e/full.test.mjs": "full.test.mjs", "SKILLS.md": "SKILLS.md", "AGENTS.md": "AGENTS.md"}


def visual_json(args, options):
    data = {
        "title": args.title,
        "summary": args.summary,
        "source_url": args.source_url or f"https://github.com/yujieteo/visuals/tree/main/viz/{args.slug}",
        "fetched": args.fetched,
        "data": "raw.json",
        "webmcp_tools": [*KIT_TOOLS, "get_example"],
        "tags": args.tags,
        "category": args.category,
    }
    if args.unpublished:
        data["published"] = False
    data["uses"] = uses(options)
    data["typecheck"] = typecheck(options)
    return data


def write(folder, files):
    for name, text in files.items():
        path = folder / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def generate(args, root=ROOT):
    """Write viz/<slug>/ and build its page; refuse a folder that exists."""
    folder = root / VIZ / args.slug
    if folder.exists():
        raise SystemExit(f"viz/{args.slug} exists; --check or --update an existing visual instead")
    options = {"slug": args.slug, "title": args.title, "subject": args.subject, "mathjax": args.mathjax, "three_d": args.three_d}
    values = {"slug": args.slug, "title": args.title, "lede": args.lede or args.summary, "purpose": args.purpose}
    flags = {"mathjax": args.mathjax, "three_d": args.three_d}
    files = {target: render(kit.read(STARTER / source), values, flags) for target, source in starter_files(args.slug).items()}
    files.update(mechanical_files(options))
    files["visual.json"] = json_text(visual_json(args, options))
    write(folder, files)
    (folder / "index.html").write_text(visual_build.page(folder), encoding="utf-8")
    return folder


# drift --------------------------------------------------------------------------------------------------------

def drift(folder, page=True):
    """Where a generated visual's mechanical parts differ from what the generator writes now, one line each.
    page=False leaves index.html to the caller (scripts/check.py runs build.py --verify)."""
    recorded = json.loads((folder / "generated.json").read_text(encoding="utf-8"))
    options = recorded["options"]
    problems = []
    if options.get("slug") != folder.name:
        problems.append(f"generated.json: options.slug is {options.get('slug')!r}, not the folder name {folder.name!r}")
        return problems
    for name, text in mechanical_files(options).items():
        path = folder / name
        if not path.is_file():
            problems.append(f"{name}: missing; run scripts/new_visual.py --update {folder.name}")
        elif path.read_text(encoding="utf-8") != text:
            problems.append(f"{name}: differs from the generator's; run scripts/new_visual.py --update {folder.name}")
    meta = json.loads((folder / "visual.json").read_text(encoding="utf-8"))
    for key, value in (("uses", uses(options)), ("typecheck", typecheck(options))):
        if meta.get(key) != value:
            problems.append(f"visual.json: {key} is not the generator's {json.dumps(value)}; run scripts/new_visual.py --update {folder.name}")
    missing = [tool for tool in KIT_TOOLS if tool not in meta.get("webmcp_tools", [])]
    if missing:
        problems.append(f"visual.json: webmcp_tools lacks the kit's {', '.join(missing)}")
    if not page:
        return problems
    try:
        built = visual_build.page(folder)
    except (OSError, KeyError, ValueError, SystemExit) as error:
        problems.append(f"index.html: cannot be built: {error}")
    else:
        if not (folder / "index.html").is_file() or (folder / "index.html").read_text(encoding="utf-8") != built:
            problems.append(f"index.html: not what build.py writes from the current kit; run python3 build.py in viz/{folder.name}")
    return problems


def hand_made(folder):
    """The mechanical parts a visual that the generator did not write lacks or holds differently, one line each."""
    from style_guide import THEME_SCRIPT
    problems = []
    page = folder / "index.html"
    html = page.read_text(encoding="utf-8") if page.is_file() else ""
    head = html.split("</head>", 1)[0]
    copy = folder / "beamdswitch.js"
    if not copy.is_file():
        problems.append("beamdswitch.js: no copy of the site's template, so no deck(report) export")
    elif copy.read_text(encoding="utf-8") != kit.beamdswitch_template():
        problems.append("beamdswitch.js: differs from the site's template")
    if THEME_SCRIPT not in head:
        problems.append("theme: the site's theme script is not in <head>")
    guide = json.loads((ROOT / "design-tokens.json").read_text(encoding="utf-8"))["style_guide"]
    by_theme, _, _ = rules.themes(html)
    for theme in ("light", "dark"):
        off = sorted(name for name, value in guide[theme].items() if by_theme[theme].get(name, "").lower() != value.lower())
        if off:
            problems.append(f"tokens: {theme} theme lacks or differs from the style guide in --{', --'.join(off[:6])}{' ...' if len(off) > 6 else ''}")
    if f"<script id=\"kit\">\n{kit.read(kit.KIT / 'kit.js').rstrip(chr(10))}\n</script>" not in html:
        problems.append("state: does not inline the shared kit (versioned state, URL and JSON import and export, palette, WebMCP)")
    tests = folder / "tests"
    if not tests.is_dir() or not rules.test_files(folder):
        problems.append("tests: no tests/*.test.mjs, *.test.cjs or test_*.py")
    for name in ("e2e/manifest.json", "e2e/full.test.mjs"):
        if not (folder / name).is_file():
            problems.append(f"e2e: no {name}")
    return problems


def check(slugs, root=ROOT):
    """Print each visual's drift; return the number of visuals with any."""
    flagged = 0
    for slug in slugs:
        folder = root / VIZ / slug
        if not (folder / "visual.json").is_file():
            print(f"{slug}: no viz/{slug}/visual.json", file=sys.stderr)
            flagged += 1
            continue
        generated = (folder / "generated.json").is_file()
        problems = drift(folder) if generated else hand_made(folder)
        kind = "generated" if generated else "not generated"
        if problems:
            flagged += 1
            print(f"{slug} ({kind}): {len(problems)} mechanical part(s) drift")
            for problem in problems:
                print(f"  {problem}")
        else:
            print(f"{slug} ({kind}): no drift")
    return flagged


def update(slug, root=ROOT):
    """Rewrite a generated visual's mechanical files and visual.json's mechanical keys, then rebuild its page.
    Domain files are never read for writing."""
    folder = root / VIZ / slug
    if not (folder / "generated.json").is_file():
        raise SystemExit(f"viz/{slug} was not generated by {GENERATOR}; --update rewrites only generated visuals")
    options = json.loads((folder / "generated.json").read_text(encoding="utf-8"))["options"]
    write(folder, mechanical_files(options))
    meta = json.loads((folder / "visual.json").read_text(encoding="utf-8"))
    meta["uses"], meta["typecheck"] = uses(options), typecheck(options)
    for tool in reversed(KIT_TOOLS):
        if tool not in meta["webmcp_tools"]:
            meta["webmcp_tools"].insert(0, tool)
    (folder / "visual.json").write_text(json_text(meta), encoding="utf-8")
    (folder / "index.html").write_text(visual_build.page(folder), encoding="utf-8")
    print(f"updated viz/{slug}: mechanical files, visual.json uses and typecheck, index.html")


def parse(argv):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter,
                                     epilog=__doc__.split("Usage:", 1)[1])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="report drift in the named visuals' mechanical parts")
    mode.add_argument("--update", action="store_true", help="rewrite the named generated visuals' mechanical parts")
    parser.add_argument("slugs", nargs="*", metavar="SLUG")
    parser.add_argument("--all", action="store_true", help="with --check: every visual")
    parser.add_argument("--title", help="the page title (no quotes, backticks, $, <, >, &, *, _, #, |, braces)")
    parser.add_argument("--summary", help="the catalogue summary, also the meta description")
    parser.add_argument("--lede", help="the paragraph under the title (default: the summary)")
    parser.add_argument("--purpose", default=DEFAULT_PURPOSE, help="SKILLS.md: what an agent uses the visual to do")
    parser.add_argument("--subject", default="Interactive", help="the eyebrow's subject label")
    parser.add_argument("--category", default="data visualization")
    parser.add_argument("--tags", default="interactive", help="comma-separated lowercase hyphenated tags")
    parser.add_argument("--source-url", help="where the data or model comes from (default: the visual's folder on GitHub)")
    parser.add_argument("--fetched", default=datetime.date.today().isoformat(), help="the data's date, YYYY-MM-DD (default: today)")
    parser.add_argument("--mathjax", action="store_true", help="embed MathJax 4.1.3 with its Fira font and licences")
    parser.add_argument("--3d", dest="three_d", action="store_true", help="add the kit's 3D view (orbit camera in the state)")
    parser.add_argument("--unpublished", action="store_true", help='write "published": false')
    args = parser.parse_args(argv)
    if args.check or args.update:
        if args.all and args.update:
            parser.error("--update takes the slugs to rewrite")
        if not args.slugs and not args.all:
            parser.error("name the visuals, or pass --all with --check")
        return args
    if len(args.slugs) != 1:
        parser.error("name one new visual's slug")
    args.slug = args.slugs[0]
    if not SLUG.fullmatch(args.slug):
        parser.error(f"{args.slug!r} is not a lowercase hyphenated slug")
    if not args.title or not TITLE.fullmatch(args.title):
        parser.error("--title is required: 1 to 120 characters, none of \" ` \\ $ < > & * _ # | { } or a line break")
    if not args.summary or "\n" in args.summary:
        parser.error("--summary is required, on one line")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.fetched):
        parser.error("--fetched is a date, YYYY-MM-DD")
    args.tags = [tag.strip() for tag in args.tags.split(",") if tag.strip()]
    if not args.tags or not all(TAG.fullmatch(tag) for tag in args.tags):
        parser.error("--tags are lowercase hyphenated words, separated by commas")
    return args


def main(argv=None, root=ROOT):
    args = parse(argv)
    if args.check:
        slugs = [folder.name for folder in folders(root)] if args.all else args.slugs
        flagged = check(slugs, root)
        print(f"\n{flagged} of {len(slugs)} visual(s) drift from the generator")
        sys.exit(1 if flagged else 0)
    if args.update:
        for slug in args.slugs:
            update(slug, root)
        return
    folder = generate(args, root)
    print(f"wrote {folder.relative_to(root).as_posix()}/: edit src/, report.js and raw.json, then python3 build.py; "
          f"check it with python3 scripts/check.py {args.slug}")


if __name__ == "__main__":
    main()
