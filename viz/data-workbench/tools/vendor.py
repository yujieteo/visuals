#!/usr/bin/env python3
"""Copy the page's third-party files into vendor/, byte for byte, and record them in vendor/manifest.json.

The page inlines four files that run on its main thread: the Apache Arrow JavaScript bundle (Arrow.esnext.min.js,
which reads DuckDB's results), the DuckDB-WASM client (duckdb-browser.cjs, which talks to the engine's worker),
pdf-lib (pdf-lib.min.js, which writes the PDF figures) and its fontkit (fontkit.umd.min.js, which reads and
subsets the fonts the PDFs embed). The fonts themselves, Liberation Sans Regular and Bold, are published beside
the page and read only when a figure is written; they come from the TrueType archive of their 2.1.5 release.
The worker and the engine (downloads.json) are fetched by the site instead, because they are too large for Git.
This is the only code of the visual, with runtime_files.py and tools/fetch_examples.py, that uses the network.
Change the engine's versions only together with downloads.json and a run of the folder's checks.

    python3 tools/vendor.py            # download every file, check nothing else changed, write vendor/manifest.json
    python3 tools/vendor.py --check    # verify vendor/ against the manifest; download nothing
"""
import argparse
import hashlib
import io
import json
import sys
import tarfile
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
    {"name": "pdf-lib", "npm": "pdf-lib", "version": "1.17.1", "license": "MIT", "dir": "pdf-lib",
     "files": [f"{CDN}pdf-lib@1.17.1/{name}" for name in ("dist/pdf-lib.min.js", "LICENSE.md")]},
    # The fontkit fork pdf-lib uses carries no licence file (neither does upstream fontkit): its package.json and
    # README state the MIT licence, so both are kept unchanged.
    {"name": "fontkit for pdf-lib", "npm": "@pdf-lib/fontkit", "version": "1.1.1", "license": "MIT", "dir": "fontkit",
     "files": [f"{CDN}@pdf-lib/fontkit@1.1.1/{name}" for name in ("dist/fontkit.umd.min.js", "package.json", "README.md")]},
]
# Liberation Sans, an Arial-metric font under the SIL Open Font License 1.1: members of the release's TrueType
# archive, which is pinned by its own SHA-256.
FONTS = {"name": "Liberation Sans", "npm": None, "version": "2.1.5", "license": "OFL-1.1", "dir": "liberation-fonts",
         "archive": "https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz",
         "archive_sha256": "7191c669bf38899f73a2094ed00f7b800553364f90e2637010a69c0e268f25d0",
         "members": ["LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf", "LICENSE", "AUTHORS"]}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def manifest():
    files = []
    for package in PACKAGES:
        for url in package["files"]:
            path = VENDOR / package["dir"] / url.rsplit("/", 1)[1]
            data = path.read_bytes()
            files.append({"path": f"{package['dir']}/{path.name}", "url": url, "sha256": sha256(data), "bytes": len(data)})
    for member in FONTS["members"]:
        data = (VENDOR / FONTS["dir"] / member).read_bytes()
        files.append({"path": f"{FONTS['dir']}/{member}", "url": FONTS["archive"], "archive_sha256": FONTS["archive_sha256"],
                      "member": f"liberation-fonts-ttf-2.1.5/{member}", "sha256": sha256(data), "bytes": len(data)})
    packages = [{k: p[k] for k in ("name", "npm", "version", "license", "dir")} for p in [*PACKAGES, FONTS]]
    return {"about": "Files copied unchanged from npm through jsDelivr, and the fonts from their release archive, by tools/vendor.py; build.py checks each one.",
            "packages": packages, "files": files}


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "yujieteo-visuals-vendor"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def download():
    for package in PACKAGES:
        for url in package["files"]:
            data = get(url)
            target = VENDOR / package["dir"] / url.rsplit("/", 1)[1]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            print(f"vendored {target.relative_to(HERE)} ({len(data):,} bytes)")
    archive = get(FONTS["archive"])
    if sha256(archive) != FONTS["archive_sha256"]:
        sys.exit(f"vendor.py: {FONTS['archive']} is not the pinned archive (SHA-256 {sha256(archive)})")
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        for member in FONTS["members"]:
            data = tar.extractfile(f"liberation-fonts-ttf-2.1.5/{member}").read()
            target = VENDOR / FONTS["dir"] / member
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
