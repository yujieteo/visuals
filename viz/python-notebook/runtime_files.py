#!/usr/bin/env python3
"""Fetch the pinned runtime files of downloads.json, and stage the notebook as the site publishes it.

The site does the same fetch at build time (yujieteo/site scripts/visual_sources.py): one file per SHA-256 in
a cache, kept only when its byte count and SHA-256 match the pin. The cache here is the repository's ignored
build/ folder, so a checkout of this folder alone can still run the browser checks.

Usage:
    python3 runtime_files.py fetch            # download every pinned file that the cache does not hold
    python3 runtime_files.py stage DIR        # DIR/index.html, its assets and runtime/, as the site publishes them
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
DEFAULT_CACHE = Path(os.environ.get("PYNB_RUNTIME_CACHE") or HERE.parent.parent / "build" / "python-notebook-runtime")


def cached_path(cache, sha256):
    return Path(cache) / sha256


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while chunk := handle.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


def pins():
    return json.loads((HERE / "downloads.json").read_text(encoding="utf-8"))["downloads"]


def fetch(cache=DEFAULT_CACHE, quiet=False):
    """Return {published path: cached file} for every pin, downloading a file only when the cache lacks it."""
    files = {}
    for entry in pins():
        path = cached_path(cache, entry["sha256"])
        if not (path.is_file() and path.stat().st_size == entry["bytes"] and sha256_of(path) == entry["sha256"]):
            path.parent.mkdir(parents=True, exist_ok=True)
            request = urllib.request.Request(entry["url"], headers={"User-Agent": "yujieteo-visuals-runtime"})
            with urllib.request.urlopen(request, timeout=120) as response:
                data = response.read()
            if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
                sys.exit(f"runtime_files.py: {entry['url']} does not match its pin")
            partial = path.with_suffix(".part")
            partial.write_bytes(data)
            partial.replace(path)
            if not quiet:
                print(f"fetched {entry['path']} ({len(data):,} bytes)")
        files[entry["path"]] = path
    return files


def stage(out, cache=DEFAULT_CACHE):
    """Write the folder the site publishes at /visuals/python-notebook/: the page, its assets and runtime/."""
    meta = json.loads((HERE / "visual.json").read_text(encoding="utf-8"))
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(HERE / "index.html", out / "index.html")
    shutil.copyfile(HERE / meta["data"], out / "data.json")
    for asset in meta.get("assets", []):
        (out / asset).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(HERE / asset, out / asset)
    for published, source in fetch(cache, quiet=True).items():
        target = out / published
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            target.unlink()
        try:
            os.link(source, target)
        except OSError:
            shutil.copyfile(source, target)
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("fetch")
    stage_parser = sub.add_parser("stage")
    stage_parser.add_argument("dir", type=Path)
    args = parser.parse_args(argv)
    if args.command == "fetch":
        files = fetch()
        print(f"runtime_files.py: {len(files)} pinned files in {DEFAULT_CACHE}")
    else:
        print(f"runtime_files.py: staged {stage(args.dir)}")


if __name__ == "__main__":
    main()
