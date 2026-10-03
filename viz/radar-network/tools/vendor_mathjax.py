#!/usr/bin/env python3
"""Copy MathJax 4.1.3 and its Fira Math font from the official npm packages into vendor/, with their licences.

This is the only code of this visual that uses the network. It downloads the two package tarballs from the
npm registry, checks each against its pinned sha512 integrity, extracts the files the page embeds and writes
vendor/manifest.json with the version, tarball, integrity, and the SHA-256 and size of every file. build.py
reads only vendor/ and checks each file against that manifest, so the page builds offline.

Usage: python3 tools/vendor_mathjax.py
"""
import base64
import hashlib
import io
import json
import shutil
import tarfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
VENDOR = HERE / "vendor"

PACKAGES = [
    {
        "name": "mathjax",
        "version": "4.1.3",
        "tarball": "https://registry.npmjs.org/mathjax/-/mathjax-4.1.3.tgz",
        "integrity": "sha512-BN/8Pkgn7G1pIDYJqd9md+JHsE/jydSYbyOZnSdSA0WziuVO8mRxdYiWFumkVVly/8U+hm9DpIIoWuvySverzw==",
        "license": "Apache-2.0",
        "dest": "mathjax",
        "files": ["tex-chtml-nofont.js", "a11y/assistive-mml.js", "LICENSE"],
    },
    {
        "name": "@mathjax/mathjax-fira-font",
        "version": "4.1.3",
        "tarball": "https://registry.npmjs.org/@mathjax/mathjax-fira-font/-/mathjax-fira-font-4.1.3.tgz",
        "integrity": "sha512-dv+CVEEWNMe15YOKz2hzRXVii1qa1I0Jldtk6JltxazLxT926+RtIcEoa4wCUEi4qiL3Po0JkOFjKiH23kwAOQ==",
        "license": "Apache-2.0 (MathJax font code); the glyphs come from Fira Math, SIL Open Font License 1.1",
        "dest": "mathjax-fira",
        "files": ["chtml.js", "chtml/dynamic/*.js", "chtml/woff2/*.woff2"],
    },
]

# The npm font package carries no licence file. Its glyphs are Fira Math, whose licence is the OFL 1.1.
FIRA_LICENSE = {
    "name": "Fira Math",
    "url": "https://raw.githubusercontent.com/firamath/firamath/f45db84c23fe513e136ecdcbf84918fb9732dcbe/LICENSE",
    "repository": "https://github.com/firamath/firamath",
    "commit": "f45db84c23fe513e136ecdcbf84918fb9732dcbe",
    "license": "OFL-1.1",
    "dest": "LICENSE-fira-math-OFL.txt",
}


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def matches(name, pattern):
    if "*" not in pattern:
        return name == pattern
    folder, glob = pattern.rsplit("/", 1)
    prefix, suffix = glob.split("*")
    return name.startswith(folder + "/" + prefix) and name.endswith(suffix) and "/" not in name[len(folder) + 1:]


def main():
    if VENDOR.exists():
        shutil.rmtree(VENDOR)
    VENDOR.mkdir()
    manifest = {"note": "Written by tools/vendor_mathjax.py. build.py checks every file against this list.", "packages": [], "licenses": []}
    for pkg in PACKAGES:
        data = fetch(pkg["tarball"])
        algo, expected = pkg["integrity"].split("-", 1)
        actual = base64.b64encode(hashlib.new(algo, data).digest()).decode()
        if actual != expected:
            raise SystemExit(f"{pkg['name']}: integrity mismatch")
        files = []
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
            for member in sorted(tar.getmembers(), key=lambda m: m.name):
                if not member.isfile():
                    continue
                name = member.name.split("/", 1)[1]
                if not any(matches(name, p) for p in pkg["files"]):
                    continue
                content = tar.extractfile(member).read()
                out = VENDOR / pkg["dest"] / name
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(content)
                files.append({"path": f"{pkg['dest']}/{name}", "bytes": len(content), "sha256": sha256(content)})
        entry = {k: pkg[k] for k in ("name", "version", "tarball", "integrity", "license")}
        entry["files"] = files
        manifest["packages"].append(entry)
    text = fetch(FIRA_LICENSE["url"])
    (VENDOR / FIRA_LICENSE["dest"]).write_bytes(text)
    manifest["licenses"].append({**FIRA_LICENSE, "path": FIRA_LICENSE["dest"], "sha256": sha256(text), "bytes": len(text)})
    (VENDOR / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    print(f"vendored {sum(len(p['files']) for p in manifest['packages'])} files")


if __name__ == "__main__":
    main()
