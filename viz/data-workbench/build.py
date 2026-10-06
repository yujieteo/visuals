#!/usr/bin/env python3
"""Build index.html, the Universal Data Workbench, from src/, vendor/, the shared kit, raw.json, examples/ and
downloads.json. Never edit index.html by hand.

The page holds everything except the engine (downloads.json): DuckDB-WASM's worker and engine file and DuckDB's
Parquet extension, which the site fetches by SHA-256 and publishes in runtime/ beside the page. In order:

    head      metadata, the site's theme script unchanged, a content security policy, one <style>: the style
              guide's tokens (scripts/kit/style-tokens.css), the kit's layout (scripts/kit/kit.css), src/style.css
    body      src/body.html with the steps still to come, the example buttons and the licences filled in, then the
              command palette
    scripts   the data block (#dw-data: examples with their files, engine versions, the steps to come), Apache
              Arrow and the DuckDB-WASM client from vendor/ (each checked against vendor/manifest.json), the kit
              (scripts/kit/kit.js), the beamdswitch template, pdf-lib and its fontkit from vendor/ (checked the same
              way), then src/: sql, infer, preflight, sha256, stats, examples, profile, engine, report, grammar,
              chartspec, chartsql, render, charts, statsql, family, rank, figure, fonts, pdf, png, publish, gallery,
              findings, zip, package, project, exporter, sqlcheck, algebra, transform, query and app, each in a <script id> of its own. The fonts in vendor/liberation-fonts/ are assets
              beside the page, read when a figure is written.

    python3 build.py            # write index.html
    python3 build.py --verify   # check index.html is current without writing it
"""
import argparse
import hashlib
import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
from style_guide import THEME_SCRIPT  # noqa: E402

MODULES = ("sql", "infer", "preflight", "sha256", "stats", "examples", "profile", "engine", "report", "grammar", "chartspec", "chartsql", "render",
           "charts", "statsql", "family", "rank", "figure", "fonts", "pdf", "png", "publish", "gallery", "findings", "zip", "package", "project",
           "exporter", "sqlcheck", "algebra", "transform", "query", "measure", "limits", "app")
# The page reads nothing from the network itself; the engine's worker, started from runtime/, reads the engine and
# the Parquet extension from the same folder. Inline scripts and styles are the page's own.
CSP = ("default-src 'none'; script-src 'unsafe-inline'; worker-src 'self'; connect-src 'self'; img-src data: blob:; "
       "style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'")
DESCRIPTION = ("Import CSV and Parquet tables and inspect every column on this device: types and roles with their "
               "uncertainty, missing values, parse failures, unusual values and corrections that wait for approval; "
               "then every valid chart of a documented grammar, each accounted for, tested and ranked in two lists.")


def read(path):
    return (HERE / path).read_text(encoding="utf-8")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def fail(message):
    raise SystemExit(f"build.py: {message}")


def vendor():
    """The vendored files, each checked against vendor/manifest.json."""
    manifest = json.loads(read("vendor/manifest.json"))
    for entry in manifest["files"]:
        data = (HERE / "vendor" / entry["path"]).read_bytes()
        if len(data) != entry["bytes"] or sha256(data) != entry["sha256"]:
            fail(f"vendor/{entry['path']} differs from vendor/manifest.json; run python3 tools/vendor.py")
    return manifest


def unmapped(text):
    """A vendored file's text without its trailing source-map comment, which names a map file the page does not publish."""
    return re.sub(r"\n//# sourceMappingURL=\S+\s*$", "\n", text)


def script(block_id, text, kind=None):
    """One inline <script> block; its text may not end the element early or open an HTML comment, which would let a
    later "<script" change where the element ends."""
    if "</script" in text.lower() or "<!--" in text:
        fail(f"{block_id}: the text holds </script or <!--, which an inline script cannot hold")
    attrs = f' id="{block_id}"' + (f' type="{kind}"' if kind else "")
    return f"<script{attrs}>\n{text.rstrip(chr(10))}\n</script>"


# The page's own SHA-256 goes into its data block: the hash of the page with this value in its place.
UNSET = "0" * 64


def data_block(raw, downloads):
    """What the page reads at start: the examples with their embedded files, the engine versions, the steps to come."""
    files = {}
    for example in raw["examples"]:
        if example["kind"] != "file":
            continue
        data = (HERE / example["file"]).read_bytes()
        if len(data) != example["bytes"] or sha256(data) != example["sha256"]:
            fail(f"{example['file']} differs from its size or SHA-256 in raw.json")
        files[example["id"]] = data.decode("utf-8")
    examples = [{k: e[k] for k in ("id", "title", "table", "kind", "about", "licence") if k in e}
                | {k: e[k] for k in ("source_url", "fetched", "publisher", "sha256", "bytes") if k in e} for e in raw["examples"]]
    pieces = [p for p in raw["preview"]["pieces"] if p["n"] > raw["preview"]["piece"]]
    tested = json.loads(read("tests/beamdswitch.json"))
    beam = {"repository": tested["repository"], "commit": tested["commit"],
            "parser": {"file": "src/deck.js", "sha256": tested["downloads"][1]["sha256"]},
            "renderer": {"file": "beamdswitch.html", "sha256": tested["downloads"][0]["sha256"]}}
    data = {"examples": examples, "files": files, "pieces": pieces, "step": raw["preview"]["piece"],
            "engine": {"duckdb": downloads["duckdb"], "duckdbWasm": downloads["duckdb_wasm"], "platform": downloads["platform"]},
            "limits": json.loads(read("limits.json")), "beamdswitch": beam, "build": {"page_sha256": UNSET, "rule": "SHA-256 of index.html with this value written as 64 zeros"}}
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def pieces_html(raw):
    """The steps still to come, for a preview's callout; the last step has none."""
    preview = raw["preview"]
    if preview["piece"] >= preview["of"]:
        return ""
    items = [f'<li><strong>{html.escape(p["title"])}.</strong> {html.escape(p["what"])}</li>'
             for p in preview["pieces"] if p["n"] > preview["piece"]]
    return f'<ol start="{preview["piece"] + 1}">\n' + "\n".join(items) + "\n</ol>"


def examples_html(raw):
    return "\n".join(f'<button type="button" data-field="example" data-example-open value="{html.escape(e["id"])}">{html.escape(e["title"])}</button>'
                     for e in raw["examples"])


def licences_html(manifest, raw):
    sources = [e for e in raw["examples"] if e.get("source_url")]
    parts = ['<details class="licences">', "<summary>Sources and licences</summary>", "<ul>"]
    for e in sources:
        parts.append(f'<li>{html.escape(e["title"])}: <a href="{html.escape(e["source_url"])}">{html.escape(e["publisher"])}</a>, '
                     f'fetched {html.escape(e["fetched"])}. {html.escape(e["licence"])}</li>')
    links = {}
    for entry in manifest["files"]:
        if not entry["path"].endswith((".js", ".cjs", ".ttf")):
            links.setdefault(entry["path"].split("/")[0], []).append(entry["path"])
    for package in manifest["packages"]:
        files = ", ".join(f'<a href="vendor/{html.escape(p)}">{html.escape(Path(p).name)}</a>' for p in links.get(package["dir"], []))
        parts.append(f'<li>{html.escape(package["name"])} {html.escape(package["version"])}: {html.escape(package["license"])} ({files}).</li>')
    parts += ["</ul>", "</details>"]
    return "\n".join(parts)


def page():
    meta = json.loads(read("visual.json"))
    raw = json.loads(read("raw.json"))
    downloads = json.loads(read("downloads.json"))
    manifest = vendor()
    for path in (p for p in meta.get("assets", []) if not (HERE / p).is_file()):
        fail(f"visual.json lists the asset {path}, which is not in the folder")
    body = read("src/body.html")
    for name, value in {"PIECES": pieces_html(raw), "EXAMPLES": examples_html(raw), "LICENCES": licences_html(manifest, raw),
                        "DUCKDB": html.escape(downloads["duckdb"]), "DUCKDB_WASM": html.escape(downloads["duckdb_wasm"])}.items():
        if f"@@{name}@@" not in body and not (name == "PIECES" and not value):
            fail(f"src/body.html has no @@{name}@@")
        body = body.replace(f"@@{name}@@", value)
    client = ("/* DuckDB-WASM's browser client, vendor/duckdb-wasm/duckdb-browser.cjs unchanged, run as a CommonJS module whose one\n"
              "   dependency, Apache Arrow, is the bundle above. It puts the client on globalThis.duckdb. */\n"
              "(function () {\n  var module = { exports: {} };\n"
              "  function require(name) {\n    if (name === \"apache-arrow\") return globalThis.Arrow;\n"
              "    throw new Error(\"not in this page: \" + name);\n  }\n"
              f"{unmapped(read('vendor/duckdb-wasm/duckdb-browser.cjs')).rstrip()}\n  globalThis.duckdb = module.exports;\n}})();")
    blocks = [script("dw-data", data_block(raw, downloads), "application/json"),
              script("vendor-arrow", unmapped(read("vendor/apache-arrow/Arrow.esnext.min.js"))),
              script("vendor-duckdb", client),
              script("kit", (SCRIPTS / "kit" / "kit.js").read_text(encoding="utf-8")),
              script("beamdswitch", read("beamdswitch.js")),
              script("vendor-pdf-lib", unmapped(read("vendor/pdf-lib/pdf-lib.min.js"))),
              script("vendor-fontkit", unmapped(read("vendor/fontkit/fontkit.umd.min.js")))]
    blocks += [script(name, read(f"src/{name}.js")) for name in MODULES]
    style = "\n".join([(SCRIPTS / "kit" / "style-tokens.css").read_text(encoding="utf-8").rstrip("\n"),
                       (SCRIPTS / "kit" / "kit.css").read_text(encoding="utf-8").rstrip("\n"), read("src/style.css").rstrip("\n")])
    url = f"https://teoyujie.org/visuals/{HERE.name}/"
    out = [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        f'<meta http-equiv="Content-Security-Policy" content="{CSP}">',
        '<link rel="icon" href="data:,">',
        f"<title>{html.escape(meta['title'])}</title>",
        f'<meta name="description" content="{html.escape(DESCRIPTION)}">',
        f'<link rel="canonical" href="{url}">',
        f'<meta property="og:title" content="{html.escape(meta["title"])}">',
        f'<meta property="og:description" content="{html.escape(meta["summary"])}">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:url" content="{url}">',
        THEME_SCRIPT,
        f"<style>\n{style}\n</style>",
        "</head>",
        "<body>",
        "<main>",
        body.rstrip("\n"),
        "</main>",
        '<dialog id="palette" aria-label="Commands">',
        '<label class="label" for="palette-input">Command</label>',
        '<input id="palette-input" type="text" role="combobox" aria-controls="palette-list" aria-expanded="true" autocomplete="off">',
        '<ul id="palette-list" role="listbox" aria-label="Matching commands"></ul>',
        "</dialog>",
        *blocks,
        "</body>",
        "</html>",
        "",
    ]
    return "\n".join(out)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build index.html from src/, vendor/, the kit, raw.json, examples/ and downloads.json.")
    parser.add_argument("--verify", action="store_true", help="check index.html is current; write nothing")
    args = parser.parse_args(argv)
    text = page()
    if text.count(UNSET) != 1:
        fail("the page holds 64 zeros elsewhere, so its own SHA-256 cannot take their place")
    text = text.replace(UNSET, sha256(text.encode("utf-8")), 1)
    target = HERE / "index.html"
    if args.verify:
        if not target.is_file() or target.read_text(encoding="utf-8") != text:
            sys.exit(f"{HERE.name}/index.html is not what build.py writes; run python3 build.py")
        print(f"{HERE.name}/index.html is current")
        return
    target.write_text(text, encoding="utf-8")
    print(f"wrote {HERE.name}/index.html ({len(text.encode('utf-8')):,} bytes)")


if __name__ == "__main__":
    main()
