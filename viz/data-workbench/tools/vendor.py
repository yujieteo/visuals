#!/usr/bin/env python3
"""Copy the engine's client files into vendor/, byte for byte, and record them in vendor/manifest.json.

The page inlines two files that run on its main thread: the Apache Arrow JavaScript bundle (Arrow.esnext.min.js,
which reads DuckDB's results) and the DuckDB-WASM client (duckdb-browser.cjs, which talks to the engine's worker).
The worker and the engine (downloads.json) are fetched by the site instead, because they are too large for Git.
This is the only code of the visual, with runtime_files.py and tools/fetch_examples.py, that uses the network.
Change a version only together with downloads.json and a run of the folder's checks.

    python3 tools/vendor.py            # download every file, check nothing else changed, write vendor/manifest.json
    python3 tools/vendor.py --check    # verify vendor/ against the manifest; download nothing
"""
import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
VENDOR = HERE / "vendor"
CDN = "https://cdn.jsdelivr.net/npm/"
# The npm package of DuckDB-WASM carries no licence file, so its MIT text comes from the tagged repositories: the
# client's (duckdb-wasm v1.33.0, the last tag before this build) and the engine's (duckdb v1.5.4, which the engine
# file and its Parquet add-on are built from).
PACKAGES = [
    {"name": "Apache Arrow", "npm": "apache-arrow", "version": "17.0.0", "license": "Apache-2.0", "dir": "apache-arrow",
     "files": [f"{CDN}apache-arrow@17.0.0/{name}" for name in ("Arrow.esnext.min.js", "LICENSE.txt", "NOTICE.txt")]},
    {"name": "DuckDB-WASM", "npm": "@duckdb/duckdb-wasm", "version": "1.33.1-dev57.0", "license": "MIT", "dir": "duckdb-wasm",
     "files": [f"{CDN}@duckdb/duckdb-wasm@1.33.1-dev57.0/dist/duckdb-browser.cjs",
               "https://cdn.jsdelivr.net/gh/duckdb/duckdb-wasm@v1.33.0/LICENSE"]},
    {"name": "DuckDB", "npm": None, "version": "1.5.4", "license": "MIT", "dir": "duckdb",
     "files": ["https://cdn.jsdelivr.net/gh/duckdb/duckdb@v1.5.4/LICENSE"]},
]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def manifest():
    files = []
    for package in PACKAGES:
        for url in package["files"]:
            path = VENDOR / package["dir"] / url.rsplit("/", 1)[1]
            data = path.read_bytes()
            files.append({"path": f"{package['dir']}/{path.name}", "url": url, "sha256": sha256(data), "bytes": len(data)})
    packages = [{k: p[k] for k in ("name", "npm", "version", "license", "dir")} for p in PACKAGES]
    return {"about": "Files copied unchanged from npm through jsDelivr by tools/vendor.py; build.py checks each one.",
            "packages": packages, "files": files}


def download():
    for package in PACKAGES:
        for url in package["files"]:
            request = urllib.request.Request(url, headers={"User-Agent": "yujieteo-visuals-vendor"})
            with urllib.request.urlopen(request, timeout=120) as response:
                data = response.read()
            target = VENDOR / package["dir"] / url.rsplit("/", 1)[1]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            print(f"vendored {target.relative_to(HERE)} ({len(data):,} bytes)")
    text = json.dumps(manifest(), indent=2) + "\n"
    (VENDOR / "manifest.json").write_text(text, encoding="utf-8")


def problems():
    recorded = json.loads((VENDOR / "manifest.json").read_text(encoding="utf-8"))
    out = []
    for entry in recorded["files"]:
        path = VENDOR / entry["path"]
        data = path.read_bytes() if path.is_file() else b""
        if len(data) != entry["bytes"] or sha256(data) != entry["sha256"]:
            out.append(f"vendor/{entry['path']} differs from vendor/manifest.json; run python3 tools/vendor.py")
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true", help="verify vendor/ against the manifest; download nothing")
    args = parser.parse_args(argv)
    if args.check:
        found = problems()
        print("\n".join(found) or "vendor/ matches vendor/manifest.json")
        sys.exit(1 if found else 0)
    download()


if __name__ == "__main__":
    main()
