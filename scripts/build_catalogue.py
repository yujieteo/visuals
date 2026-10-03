#!/usr/bin/env python3
"""Generate the catalogue and the gallery from every viz/<slug>/visual.json; neither is committed.

Writes build/catalogue.json (every published visual, newest first, with repository-relative html_path and
data_path, the fields the site's catalogue reads) and build/index.html (a gallery to browse locally).
--verify validates every visual.json against schema/visual.schema.json and the folder rules, renders both
in memory and writes nothing.

Usage: scripts/build_catalogue.py [--verify] [--out DIR]
"""
import argparse
import json
import re
import sys
from html import escape
from pathlib import Path

from visuals import ROOT, SLUG, VIZ, folders, metadata

SCHEMA = ROOT / "schema" / "visual.schema.json"
TYPES = {"object": dict, "array": list, "string": str, "boolean": bool}


def schema_errors(value, schema, where):
    """The draft-07 subset schema/visual.schema.json uses, checked with the standard library only."""
    expected = schema.get("type")
    if expected and not isinstance(value, TYPES[expected]):
        return [f"{where}: expected {expected}"]
    errors = []
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{where}: must be one of {schema['enum']}")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{where}: is empty")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{where}: {value!r} does not match {schema['pattern']}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{where}: needs at least {schema['minItems']} item(s)")
        if schema.get("uniqueItems") and len({json.dumps(item, sort_keys=True) for item in value}) != len(value):
            errors.append(f"{where}: has duplicate items")
        for index, item in enumerate(value):
            errors += schema_errors(item, schema.get("items", {}), f"{where}[{index}]")
    if isinstance(value, dict):
        properties = schema.get("properties", {})
        errors += [f"{where}: missing {key}" for key in schema.get("required", []) if key not in value]
        if schema.get("additionalProperties") is False:
            errors += [f"{where}: unknown field {key}" for key in value if key not in properties]
        for key, item in value.items():
            if key in properties:
                errors += schema_errors(item, properties[key], f"{where}.{key}")
    return errors


def folder_errors(folder, data, root=ROOT):
    """Rules the schema cannot state: the files visual.json names exist where it says."""
    slug = folder.name
    errors = [] if SLUG.fullmatch(slug) else [f"{slug}: the folder name is not a lowercase hyphenated slug"]
    if not (folder / "index.html").is_file():
        errors.append(f"{slug}: index.html is missing")
    for key in ("data", "downloads"):
        if isinstance(data.get(key), str) and not (folder / data[key]).is_file():
            errors.append(f"{slug}: {key} names a missing file: {data[key]}")
    for path in data.get("assets", []):
        if isinstance(path, str) and not (folder / path).is_file():
            errors.append(f"{slug}: asset is missing: {path}")
    for path in data.get("uses", []):
        if isinstance(path, str) and not (root / path).exists():
            errors.append(f"{slug}: uses names a missing path: {path}")
    return errors


def load(root=ROOT):
    """Return ({slug: metadata}, errors) for every folder under viz/, each checked against the schema."""
    schema = json.loads((root / "schema" / "visual.schema.json").read_text(encoding="utf-8"))
    by_slug, errors = {}, []
    for folder in folders(root):
        try:
            data = metadata(folder)
        except json.JSONDecodeError as error:
            errors.append(f"{folder.name}: visual.json is not JSON: {error}")
            continue
        if data is None:
            errors.append(f"{folder.name}: visual.json is missing")
            continue
        problems = schema_errors(data, schema, f"{folder.name}/visual.json") + folder_errors(folder, data, root)
        errors += problems
        if not problems:
            by_slug[folder.name] = data
    return by_slug, errors


CATALOGUE_FIELDS = ("title", "summary", "source_url", "fetched", "webmcp_tools", "tags", "category", "links")


def entry(slug, data):
    """One catalogue entry: the visual's fields, with paths relative to the repository root."""
    item = {"slug": slug, **{key: data[key] for key in CATALOGUE_FIELDS if key in data}}
    item["html_path"] = f"{VIZ}/{slug}/index.html"
    item["data_path"] = f"{VIZ}/{slug}/{data['data']}"
    if "assets" in data:
        item["assets"] = [f"{VIZ}/{slug}/{path}" for path in data["assets"]]
    if "downloads" in data:
        item["downloads"] = f"{VIZ}/{slug}/{data['downloads']}"
    return item


def catalogue(by_slug):
    """Every published visual, newest fetched first and same-day visuals in slug order."""
    items = [entry(slug, data) for slug, data in sorted(by_slug.items()) if data.get("published", True)]
    return sorted(items, key=lambda item: item["fetched"], reverse=True)


PAGE = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">'
    "<title>Visuals</title><style>body{max-width:45rem;margin:3rem auto;padding:0 1rem;"
    "font:16px/1.6 system-ui;color:#1d1d1f}a{color:inherit;text-underline-offset:.18em}"
    "article{padding:1.5rem 0;border-top:1px solid #d2d2d7}h1,h2{line-height:1.2}"
    "small{font-size:.875rem}h2 a{display:inline-block;padding:.5rem 0}</style></head><body>"
    "<main><h1>Visuals</h1><p>Standalone, source-backed visualizations, generated from each folder's visual.json.</p>"
    "%s</main></body></html>\n"
)


def gallery(items):
    """A local gallery page in build/, linking each visual's page in viz/."""
    cards = "".join(
        f'<article><h2><a href="../{escape(item["html_path"])}">{escape(item["title"])}</a></h2>'
        f"<p>{escape(item['summary'])}</p><small>{escape(item['fetched'])} · {escape(', '.join(item['tags']))}</small></article>"
        for item in items
    )
    return PAGE % cards


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--verify", action="store_true", help="validate and render in memory; write nothing")
    parser.add_argument("--out", type=Path, default=ROOT / "build", help="where to write (default build/)")
    args = parser.parse_args(argv)
    by_slug, errors = load()
    if errors:
        print("\n".join(errors), file=sys.stderr)
        sys.exit(1)
    items = catalogue(by_slug)
    text, page = json.dumps(items, indent=2, ensure_ascii=False) + "\n", gallery(items)
    if not args.verify:
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "catalogue.json").write_text(text, encoding="utf-8")
        (args.out / "index.html").write_text(page, encoding="utf-8")
    unpublished = len(by_slug) - len(items)
    print(f"{'verified' if args.verify else 'wrote'}: {len(items)} published visual(s)"
          f"{f', {unpublished} unpublished' if unpublished else ''}, every visual.json valid")


if __name__ == "__main__":
    main()
