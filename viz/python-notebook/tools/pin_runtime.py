#!/usr/bin/env python3
"""Pin the Python runtime of the notebook: write downloads.json from Pyodide's lock file and PyPI.

This is one of the two scripts that use the network (tools/vendor_js.mjs is the other). It reads the
lock file of one Pyodide release, takes the closure of the required packages, adds the pure-Python wheels
that Pyodide does not build (from PyPI, by exact version), downloads every file once to read its byte count,
SHA-256 and licence, and writes downloads.json. The site fetches each file at build time and checks it
against its pin (yujieteo/site scripts/visual_sources.py); build.py makes the in-memory lock file from the
"lock" record of each wheel.

Change PYODIDE, PACKAGES or PYPI only together with a new run of the gate (tests/gate/).

Usage:
    python3 tools/pin_runtime.py [--cache DIR]   # write downloads.json; files go to DIR (default build cache)
"""
import argparse
import email.parser
import hashlib
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
from runtime_files import DEFAULT_CACHE, cached_path  # noqa: E402

PYODIDE = "314.0.5"
CDN = f"https://cdn.jsdelivr.net/pyodide/v{PYODIDE}/full/"
CORE = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip"]
# Spec section 5, and the captain's addition of openpyxl, pyarrow and statsmodels (gate report, 2026-10-04).
PACKAGES = ["numpy", "pandas", "matplotlib", "seaborn", "scipy", "sympy", "scikit-learn", "pillow",
            "openpyxl", "pyarrow", "statsmodels"]
# Pure-Python wheels that the Pyodide lock does not hold: (name, version, import names, dependencies).
PYPI = [
    ("seaborn", "0.13.2", ["seaborn"], ["numpy", "pandas", "matplotlib"]),
    ("openpyxl", "3.1.5", ["openpyxl"], ["et-xmlfile"]),
    ("et-xmlfile", "2.0.0", ["et_xmlfile"], []),
]
CORE_LICENCE = {"name": "Pyodide", "version": PYODIDE, "license": "MPL-2.0"}
STDLIB_LICENCE = {"name": "CPython standard library", "license": "PSF-2.0"}


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "yujieteo-visuals-pin-runtime"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def fetch(url, sha256, cache):
    """Return the bytes of url, from the cache when its SHA-256 is known and matches."""
    if sha256:
        path = cached_path(cache, sha256)
        if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == sha256:
            return path.read_bytes()
    data = get(url)
    digest = hashlib.sha256(data).hexdigest()
    if sha256 and digest != sha256:
        sys.exit(f"pin_runtime.py: {url} has SHA-256 {digest}, the index says {sha256}")
    path = cached_path(cache, digest)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


def licence(wheel_bytes, name):
    """The licence a wheel declares: License-Expression, else License, else its licence classifiers."""
    with zipfile.ZipFile(__import__("io").BytesIO(wheel_bytes)) as wheel:
        metadata = next(n for n in wheel.namelist() if n.endswith(".dist-info/METADATA"))
        message = email.parser.Parser().parsestr(wheel.read(metadata).decode("utf-8"))
    value = message.get("License-Expression") or ""
    if not value:
        text = (message.get("License") or "").strip()
        value = text if text and "\n" not in text and len(text) < 60 else ""
    if not value:
        classifiers = [c.split(" :: ")[-1] for c in message.get_all("Classifier") or [] if c.startswith("License ::")]
        value = " OR ".join(classifiers)
    if not value:
        sys.exit(f"pin_runtime.py: {name} declares no licence")
    return value


def closure(packages, roots):
    """Every package that the roots need, by name, in sorted order."""
    seen, todo = set(), list(roots)
    while todo:
        name = todo.pop()
        if name not in seen:
            seen.add(name)
            todo += packages[name]["depends"]
    return sorted(seen)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    args = parser.parse_args(argv)
    lock = json.loads(get(CDN + "pyodide-lock.json"))
    packages = dict(lock["packages"])
    for name, version, imports, depends in PYPI:
        release = json.loads(get(f"https://pypi.org/pypi/{name}/{version}/json"))
        wheel = next(u for u in release["urls"] if u["packagetype"] == "bdist_wheel" and u["filename"].endswith("-none-any.whl"))
        packages[name] = {"name": name, "version": version, "file_name": wheel["filename"], "install_dir": "site",
                          "sha256": wheel["digests"]["sha256"], "package_type": "package", "imports": imports,
                          "depends": depends, "url": wheel["url"]}
    entries = []
    for name in CORE:
        data = fetch(CDN + name, None, args.cache)
        owner = STDLIB_LICENCE | {"version": lock["info"]["python"]} if name == "python_stdlib.zip" else CORE_LICENCE
        entries.append({"path": f"runtime/{name}", "url": CDN + name, "sha256": hashlib.sha256(data).hexdigest(),
                        "bytes": len(data), "kind": "core", **owner})
    for name in closure(packages, PACKAGES):
        record = packages[name]
        url = record.get("url") or CDN + record["file_name"]
        data = fetch(url, record["sha256"], args.cache)
        entries.append({
            "path": f"runtime/{record['file_name']}", "url": url, "sha256": record["sha256"], "bytes": len(data),
            "kind": "wheel", "name": name, "version": record["version"], "license": licence(data, name),
            "required": name in PACKAGES,
            "lock": {key: record[key] for key in ("name", "version", "file_name", "install_dir", "sha256",
                                                  "package_type", "imports", "depends")},
        })
    out = {
        "about": "Pinned runtime of the Python Notebook: Pyodide core files and every wheel of the package closure. "
                 "Written by tools/pin_runtime.py; the site fetches each file and checks its bytes and SHA-256.",
        "pyodide": PYODIDE,
        "lock_info": lock["info"],
        "packages": PACKAGES,
        "downloads": entries,
    }
    (HERE / "downloads.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    total = sum(e["bytes"] for e in entries)
    print(f"pin_runtime.py: {len(entries)} files, {total:,} bytes, Python {lock['info']['python']}")


if __name__ == "__main__":
    main()
