#!/usr/bin/env python3
"""Fetch the pinned engine files of downloads.json, stage the workbench as the site publishes it, and lay out
the same engine for the folder's Node checks.

The site does the same fetch at build time (yujieteo/site scripts/visual_sources.py): one file per SHA-256 in a
cache, kept only when its byte count and SHA-256 match the pin. The cache here is the repository's ignored
build/ folder (or DW_RUNTIME_CACHE), so a checkout of this folder alone can still run the engine checks.

Usage:
    python3 runtime_files.py fetch            # download every pinned file that the cache does not hold
    python3 runtime_files.py stage DIR        # DIR/index.html, data.json, its assets and runtime/, as the site publishes them
    python3 runtime_files.py node             # the engine for node --test, as JSON paths (tests/engine.mjs reads it)
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_CACHE = Path(os.environ.get("DW_RUNTIME_CACHE") or HERE.parent.parent / "build" / "data-workbench-runtime")
# The extension repository the Node checks name: its last path segment is where DuckDB's Node build looks under
# $HOME/.duckdb/extensions/ before it would fetch anything (see tests/engine.mjs).
NODE_REPOSITORY = "https://data-workbench.invalid/runtime/extensions"


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while True:
            chunk = handle.read(1 << 20)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def pins(name="downloads.json"):
    return json.loads((HERE / name).read_text(encoding="utf-8"))["downloads"]


def fetch(cache=DEFAULT_CACHE, quiet=False, entries=None):
    """Return {published path: cached file} for every pin, downloading a file only when the cache lacks it."""
    files = {}
    for entry in entries if entries is not None else pins():
        path = Path(cache) / entry["sha256"]
        if not (path.is_file() and path.stat().st_size == entry["bytes"] and sha256_of(path) == entry["sha256"]):
            path.parent.mkdir(parents=True, exist_ok=True)
            request = urllib.request.Request(entry["url"], headers={"User-Agent": "yujieteo-visuals-runtime"})
            with urllib.request.urlopen(request, timeout=300) as response:
                data = response.read()
            if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
                sys.exit(f"runtime_files.py: {entry['url']} does not match its pin")
            partial = path.with_suffix(".part")
            partial.write_bytes(data)
            partial.replace(path)
            if not quiet:
                print(f"fetched {entry['path']} ({len(data):,} bytes)", file=sys.stderr)
        files[entry["path"]] = path
    return files


def place(source, target):
    """Hard-link (or copy) one cached file to its published place."""
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.unlink()
    try:
        os.link(source, target)
    except OSError:
        shutil.copyfile(source, target)


def stage(out, cache=DEFAULT_CACHE):
    """Write the folder the site publishes at /visuals/data-workbench/: the page, data.json, its assets and runtime/."""
    meta = json.loads((HERE / "visual.json").read_text(encoding="utf-8"))
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(HERE / "index.html", out / "index.html")
    shutil.copyfile(HERE / meta["data"], out / "data.json")
    for asset in meta.get("assets", []):
        (out / asset).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(HERE / asset, out / asset)
    for published, source in fetch(cache, quiet=True).items():
        place(source, out / published)
    return out


def node(cache=DEFAULT_CACHE):
    """Lay out the engine for node --test under cache/node/ and return its paths.

    duckdb-node-blocking.cjs requires "apache-arrow", which resolves to the page's own vendored Arrow bundle, so
    the checks decode results with the same bytes as the page. The Parquet extension sits where DuckDB's Node
    build reads a cached extension for NODE_REPOSITORY, under the home folder the checks give it.
    """
    root = Path(cache) / "node"
    files = fetch(cache, quiet=True)
    files.update(fetch(cache, quiet=True, entries=pins("tests/node-engine.json")))
    place(files["node/duckdb-node-blocking.cjs"], root / "dist" / "duckdb-node-blocking.cjs")
    place(files["runtime/duckdb-eh.wasm"], root / "dist" / "duckdb-eh.wasm")
    arrow = root / "node_modules" / "apache-arrow"
    arrow.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(HERE / "vendor" / "apache-arrow" / "Arrow.esnext.min.js", arrow / "Arrow.esnext.min.js")
    (arrow / "package.json").write_text('{"name": "apache-arrow", "version": "17.0.0", "main": "Arrow.esnext.min.js"}\n', encoding="utf-8")
    extension = "runtime/extensions/v1.5.4/wasm_eh/parquet.duckdb_extension.wasm"
    home = root / "home"
    place(files[extension], home / ".duckdb" / "extensions" / NODE_REPOSITORY.rsplit("/", 1)[1] / "v1.5.4" / "wasm_eh" / Path(extension).name)
    return {"blocking": str(root / "dist" / "duckdb-node-blocking.cjs"), "wasm": str(root / "dist" / "duckdb-eh.wasm"),
            "home": str(home), "repository": NODE_REPOSITORY}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("fetch")
    stage_parser = sub.add_parser("stage")
    stage_parser.add_argument("dir", type=Path)
    sub.add_parser("node")
    args = parser.parse_args(argv)
    if args.command == "fetch":
        files = fetch()
        print(f"runtime_files.py: {len(files)} pinned files in {DEFAULT_CACHE}")
    elif args.command == "stage":
        print(f"runtime_files.py: staged {stage(args.dir)}")
    else:
        print(json.dumps(node()))


if __name__ == "__main__":
    main()
