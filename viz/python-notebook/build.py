#!/usr/bin/env python3
"""Build index.html, the website form of the Python Notebook, from src/, vendor/, raw.json and downloads.json.

The page holds everything except the runtime files (Pyodide and the wheels in downloads.json): the website
fetches those from runtime/ beside the page, and Save HTML copy embeds them in a portable file. The parts a
portable file copies are marked data-pynb-part; src/portable.js writes the rest.

    head      viewport, title, description, the site's theme script and one <style> (house tokens, KaTeX, page)
    body      <div id="app">, a <noscript>, then text blocks: the UI markup, the runtime list (#pynb-runtime),
              the example notebook, the licences, the worker boot code, the Pyodide shim and kernel.py
    scripts   src/runtime-patches.js (classic, before the bundle), vendor/runtime.js (module), the UMD modules
              of src/ and src/app.js

A text block is read with textContent, so its text must hold no "<!--", "<script" or "</script" (the build
stops if it does). JSON blocks escape every "<". Executed scripts have each "<" of those three sequences
written as \\x3C, which means the same character in every place a script can hold it (string, template,
regular expression, comment), and every script is checked with node --check after the change.

    python3 build.py            # write index.html
    python3 build.py --verify   # check index.html is current without writing it
"""
import argparse
import hashlib
import html
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
from style_guide import THEME_SCRIPT  # noqa: E402

MODULES = ("model.js", "portable.js", "render.js", "runtime.js", "store.js", "offline.js")
TEXT_BLOCKS = (("pynb-worker-boot", "src/worker-boot.js"), ("pynb-shim", "src/pyodide-shim.mjs"), ("pynb-kernel", "src/kernel.py"))
HAZARD = re.compile(r"<(!--|/?script)", re.I)
# The page's own policy. The portable form has no 'self': a file:// page can then load nothing from beside it.
CSP = ("default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data:; "
       "connect-src {self}blob: data:; img-src blob: data:; style-src 'unsafe-inline'; font-src data:; "
       "worker-src {self}blob: data:; base-uri 'none'; form-action 'none'")
SITE_CSP = CSP.format(self="'self' ")
PORTABLE_CSP = CSP.format(self="")
TITLE = "Python Notebook"
DESCRIPTION = ("Python notebooks in the browser with numpy, pandas, Matplotlib, seaborn, SciPy, SymPy, scikit-learn, "
               "Pillow, openpyxl, pyarrow and statsmodels. Code and data stay on this device. Save HTML copy makes "
               "one file that runs offline from file://.")


def read(name):
    return (HERE / name).read_text(encoding="utf-8")


def text_block(block_id, text, kind="text/plain"):
    """A <script> block that the page reads with textContent; the text is stored as it is."""
    if HAZARD.search(text):
        raise SystemExit(f"{block_id}: the text holds {HAZARD.search(text).group(0)!r}, which an HTML script block cannot hold")
    return f'<script type="{kind}" id="{block_id}" data-pynb-part>{text}</script>'


def json_block(block_id, value):
    text = json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    return f'<script type="application/json" id="{block_id}" data-pynb-part>{text}</script>'


def script_text(name, text):
    """Executed script text with the three HTML hazards escaped; node --check proves it still parses."""
    return HAZARD.sub(lambda m: "\\x3C" + m.group(1), text)


def node_check(scripts):
    """node --check every executed script after escaping: a hazard in a place that \\x3C cannot go fails here."""
    with tempfile.TemporaryDirectory() as tmp:
        for name, text, module in scripts:
            path = Path(tmp) / (Path(name).stem + (".mjs" if module else ".cjs"))
            path.write_text(text, encoding="utf-8")
            result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
            if result.returncode:
                raise SystemExit(f"{name}: does not parse after escaping:\n{result.stderr}")


def vendor_problems():
    manifest = json.loads(read("vendor/manifest.json"))
    problems = []
    for entry in manifest["files"]:
        data = (HERE / "vendor" / entry["path"]).read_bytes()
        if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
            problems.append(f"vendor/{entry['path']} differs from vendor/manifest.json; run tools/vendor_js.mjs")
    return manifest, problems


def page(check_scripts=True):
    meta = json.loads(read("visual.json"))
    vendor, problems = vendor_problems()
    if problems:
        raise SystemExit("\n".join(problems))
    downloads = json.loads(read("downloads.json"))
    raw = json.loads(read(meta["data"]))
    if raw["packages"] != downloads["packages"]:
        raise SystemExit(f"{meta['data']} packages {raw['packages']} != downloads.json packages {downloads['packages']}")
    executed = [("src/runtime-patches.js", read("src/runtime-patches.js"), False),
                ("vendor/runtime.js", read("vendor/runtime.js"), True)]
    executed += [(f"src/{name}", read(f"src/{name}"), False) for name in MODULES + ("app.js",)]
    executed = [(name, script_text(name, text), module) for name, text, module in executed]
    if check_scripts:
        node_check(executed)
    blocks = [text_block("pynb-body", read("src/body.html"))]
    blocks += [text_block(block_id, read(path)) for block_id, path in TEXT_BLOCKS]
    licences = "\n\n".join(f"{p['name']} {p['version']} ({p['license']})\n\n" + read(f"vendor/{p['licence_file']}").strip()
                           for p in vendor["packages"])
    blocks.append(text_block("pynb-licences", licences))
    blocks.append(json_block("pynb-example", raw["example"]))
    # The build id names this exact page and runtime: Prepare offline compares it with the copy it holds.
    build = hashlib.sha256("\n".join([*(text for _, text, _ in executed), *blocks, json.dumps(downloads, sort_keys=True)]).encode()).hexdigest()[:16]
    runtime = {"build": build, "portable_csp": PORTABLE_CSP, "pyodide": downloads["pyodide"], "lock_info": downloads["lock_info"],
               "packages": downloads["packages"], "downloads": downloads["downloads"]}
    blocks.insert(1, json_block("pynb-runtime", runtime))
    style = "\n".join([(SCRIPTS / "kit" / "style-tokens.css").read_text(encoding="utf-8").rstrip("\n"),
                       read("vendor/katex.css").rstrip("\n"), read("src/style.css").rstrip("\n")])
    if HAZARD.search(style) or "</style" in style.lower():
        raise SystemExit("the style text holds a sequence that ends or changes the <style> element")
    url = f"https://teoyujie.org/visuals/{HERE.name}/"
    theme = THEME_SCRIPT.replace('<script id="site-theme">', '<script id="site-theme" data-pynb-part>', 1)
    scripts = [f'<script data-pynb-part>{executed[0][1]}</script>', f'<script type="module" data-pynb-part>{executed[1][1]}</script>']
    scripts += [f'<script data-pynb-part>{text}</script>' for _, text, _ in executed[2:]]
    out = [
        "<!doctype html>",
        '<html lang="en" data-pynb-form="site">',
        "<head>",
        '<meta charset="utf-8">',
        f'<meta http-equiv="Content-Security-Policy" content="{SITE_CSP}">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" data-pynb-part>',
        '<link rel="icon" href="data:," data-pynb-part>',
        f"<title data-pynb-part>{html.escape(TITLE)}</title>",
        f'<meta name="description" content="{html.escape(DESCRIPTION)}" data-pynb-part>',
        f'<link rel="canonical" href="{url}">',
        f'<meta property="og:title" content="{html.escape(meta["title"])}">',
        f'<meta property="og:description" content="{html.escape(meta["summary"])}">',
        '<meta property="og:type" content="website">',
        f'<meta property="og:url" content="{url}">',
        theme,
        f"<style data-pynb-part>\n{style}\n</style>",
        "</head>",
        "<body>",
        '<div id="app"></div>',
        '<noscript data-pynb-part><p class="callout">The Python Notebook needs JavaScript: Python runs in this page.</p></noscript>',
        *blocks,
        *scripts,
        "</body>",
        "</html>",
        "",
    ]
    return "\n".join(out)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build index.html from src/, vendor/, raw.json and downloads.json.")
    parser.add_argument("--verify", action="store_true", help="check index.html is current; write nothing")
    args = parser.parse_args(argv)
    text = page()
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
