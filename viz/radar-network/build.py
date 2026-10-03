#!/usr/bin/env python3
"""Build the radar network visualiser: one offline index.html and its raw.json.

Reads src/ (template, CSS, the classic-script modules), data/ (preset, examples, reference cases, evidence,
sources), beamdswitch.js (the site's template, unchanged) and vendor/ (MathJax 4.1.3 and the Fira Math font
from npm, each file checked against vendor/manifest.json), and writes:

  index.html   every script, style, datum, font and licence inlined; no runtime request
  raw.json     the data the page embeds, published beside it as data.json

The no-JavaScript table of the initial 36 links comes from the model itself (node tools/static_rows.js), so
the static page and the interactive page show the same numbers.

Usage:
    python3 build.py            # write index.html and raw.json
    python3 build.py --verify   # check both are fresh and every embedded file matches its checksum; write nothing
"""
import argparse
import base64
import hashlib
import html
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC, DATA, VENDOR = HERE / "src", HERE / "data", HERE / "vendor"
MODULES = ["numerics", "detector", "model", "state", "signal", "calc", "checks", "report", "scene3d"]
BROWSER = ["ui", "views", "app"]


def fail(message):
    print(f"build.py: {message}", file=sys.stderr)
    sys.exit(1)


def read(path):
    return path.read_text(encoding="utf-8")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def load_json(name):
    return json.loads(read(DATA / name))


def check_vendor():
    """Every vendored file matches the manifest; returns {path: bytes}."""
    manifest = json.loads(read(VENDOR / "manifest.json"))
    files = {}
    for pkg in manifest["packages"]:
        for f in pkg["files"]:
            data = (VENDOR / f["path"]).read_bytes()
            if sha256(data) != f["sha256"] or len(data) != f["bytes"]:
                fail(f"vendor/{f['path']} does not match vendor/manifest.json")
            files[f["path"]] = data
    for lic in manifest["licenses"]:
        data = (VENDOR / lic["path"]).read_bytes()
        if sha256(data) != lic["sha256"]:
            fail(f"vendor/{lic['path']} does not match vendor/manifest.json")
        files[lic["path"]] = data
    return manifest, files


def script_safe(text):
    """Text that cannot end its <script> element early."""
    if "</script" in text.lower():
        text = text.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")
    return text


def inline(id_, text, kind=None):
    attr = f' type="{kind}"' if kind else ""
    return f'<script id="{id_}"{attr}>\n{script_safe(text)}</script>'


def mathjax_block(manifest, files):
    """MathJax config, the embedded component and font files, the woff2 fonts as data URLs, and the core."""
    js = {p: files[p].decode("utf-8") for p in sorted(files) if p.endswith(".js") and p != "mathjax/tex-chtml-nofont.js"}
    table = ",\n".join(f"{json.dumps(p)}: function () {{\n{src}\n}}" for p, src in js.items())
    woff = {Path(p).name: "data:font/woff2;base64," + base64.b64encode(files[p]).decode("ascii") for p in sorted(files) if p.endswith(".woff2")}
    config = r"""window.MathJax = {
  loader: {
    paths: { mathjax: "embedded:mathjax", fonts: "embedded:fonts", "mathjax-fira": "embedded:mathjax-fira" },
    // Every MathJax file comes from this page: an unknown file is an error, never a network request.
    require: function (url) {
      var key = String(url).replace(/^embedded:/, "");
      var f = window.MathJaxEmbedded && window.MathJaxEmbedded[key];
      if (!f) throw new Error("not embedded in this page: " + url);
      f();
    }
  },
  tex: { inlineMath: [["\\(", "\\)"]], displayMath: [["\\[", "\\]"]], processEscapes: false },
  options: {
    skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code", "input"],
    menuOptions: { settings: { enrich: false, speech: false, braille: false, collapsible: false, assistiveMml: true } }
  },
  output: { font: "mathjax-fira" },
  chtml: { scale: 1.06 },
  startup: {
    typeset: false,
    ready: function () {
      // Fonts from data URLs; the two faces the package declares without files get a local() name only.
      var woff = JSON.parse(document.getElementById("mathjax-woff2").textContent);
      var C = MathJax._.output.chtml.FontData.ChtmlFontData;
      C.addFontURLs = function (styles, fonts) {
        for (var name of Object.keys(fonts)) {
          var font = Object.assign({}, fonts[name]);
          font.src = String(font.src).replace(/url\("%%URL%%\/([^"]+)"\) format\("woff2"\)/, function (m, f) {
            return woff[f] ? 'url("' + woff[f] + '") format("woff2")' : 'local("' + f.replace(/\.woff2$/, "") + '-not-embedded")';
          });
          styles[name] = font;
        }
      };
      // Speech, Braille and enrichment need a web worker from a server: keep them off, whatever the site saved.
      MathJax._.ui.menu.Menu.Menu.prototype.mergeUserSettings = function () {};
      MathJax.startup.defaultReady();
    }
  }
};"""
    return "\n".join([
        inline("mathjax-config", config),
        f'<script type="application/json" id="mathjax-woff2">{json.dumps(woff)}</script>',
        inline("mathjax-files", f"window.MathJaxEmbedded = {{\n{table}\n}};\n"),
        inline("mathjax-core", files["mathjax/tex-chtml-nofont.js"].decode("utf-8")),
    ])


def static_rows(sources):
    out = subprocess.run(["node", str(HERE / "tools" / "static_rows.js")], input=json.dumps(sources), capture_output=True, text=True, check=True).stdout
    snap = json.loads(out)
    rows = []
    for r in snap["rows"]:
        cells = "".join(f'<td class="num">{html.escape(r[k])}</td>' for k in ["pr", "rho", "margin", "pd", "delay", "doppler"])
        rows.append(f'<tr class="link-row" data-link="{html.escape(r["id"])}"><td>{html.escape(r["id"])}</td><td>{html.escape(r["type"])}</td>{cells}<td>{html.escape(r["status"])}</td></tr>')
    return "\n".join(rows), snap


def about(sources, manifest, files):
    lic_mj = html.escape(files["mathjax/LICENSE"].decode("utf-8"))
    lic_fira = html.escape(files["LICENSE-fira-math-OFL.txt"].decode("utf-8"))
    pk = {p["name"]: p for p in manifest["packages"]}
    refs = [
        ("Radar equation and noise conventions", "https://www.mathworks.com/help/radar/ug/radar-equation.html"),
        ("Bistatic constant-SNR contours", "https://www.mathworks.com/help/radar/ref/bistaticconstantsnr.html"),
        ("Bistatic delay and Doppler example", "https://www.mathworks.com/help/phased/ug/simulating-a-bistatic-radar-with-two-targets.html"),
        ("Waveform ambiguity", "https://www.mathworks.com/help/phased/ug/waveform-analysis-using-the-ambiguity-function.html"),
        ("Matched-filter gain", "https://www.mathworks.com/help/radar/ref/matchinggain.html"),
        ("Pulse integration", "https://www.mathworks.com/help/phased/ref/pulsint.html"),
        ("Integration and fluctuation losses", "https://www.mathworks.com/help/radar/ug/introduction-to-integration-and-fluctuation-losses-in-radar.html"),
        ("Target fluctuation models", "https://www.mathworks.com/help/phased/ug/radar-target.html"),
        ("Constant-gamma clutter assumptions", "https://www.mathworks.com/help/radar/ref/constantgammaclutter-system-object.html"),
        ("Cooperative bistatic processing and direct-path interference", "https://www.mathworks.com/help/radar/ug/cooperative-bistatic-radar-IQ-simulation-processing.html"),
        ("MathJax local installation", "https://docs.mathjax.org/en/latest/web/hosting.html"),
        ("MathJax font resources", "https://docs.mathjax.org/en/latest/output/fonts.html"),
    ]
    items = "".join(f'<li><a href="{u}">{html.escape(t)}</a></li>' for t, u in refs)
    bd = sources["beamdswitch"]
    return f"""<div class="grid2">
<div><h3>What the model does</h3>
<p>Each link (transmitter, receiver, target) uses the bistatic radar equation with linear units inside products, the single-pulse matched-filter SNR ρ₁ = P<sub>r</sub>τ/(kT<sub>s</sub>L<sub>MF</sub>), and a thermal-noise square-law detector after ideal coherent (or noncoherent) integration. Positions come from state and time: p(t) = p₀ + vt or piecewise-linear waypoints. Right-handed frame: x east, y north, z up; SI units inside. Positive Doppler means approach.</p>
<p>Sampled processing uses synthetic complex baseband: a band-limited fractional-delay filter, per-sample carrier phase from the linear path-length model, a unit-energy matched filter and a windowed slow-time DFT. Analytic thermal-noise probabilities do not establish P<sub>fa</sub> or P<sub>d</sub> in clutter or interference; the page shows sampled estimates separately.</p>
<h3>Model references</h3><ul>{items}</ul></div>
<div><h3>Embedded resources</h3>
<ul><li>MathJax {pk["mathjax"]["version"]} (tex-chtml-nofont, assistive MathML), npm integrity <code>{pk["mathjax"]["integrity"][:24]}…</code>, Apache-2.0.</li>
<li>@mathjax/mathjax-fira-font {pk["@mathjax/mathjax-fira-font"]["version"]}: CommonHTML font data and {sum(1 for f in pk["@mathjax/mathjax-fira-font"]["files"] if f["path"].endswith(".woff2"))} woff2 files as data URLs; glyphs from Fira Math, SIL Open Font License 1.1.</li>
<li>beamdswitch report template from {bd["repository"]} <code>{bd["path"]}</code> at commit <code>{bd["commit"][:12]}</code>, SHA-256 <code>{bd["sha256"]}</code>, unchanged.</li>
<li>NASA F-117 model curves copied from the stealth-rcs visual (separate evidence only).</li></ul>
<details><summary>MathJax licence (Apache-2.0)</summary><pre style="white-space:pre-wrap;font-size:0.7rem">{lic_mj}</pre></details>
<details><summary>Fira Math licence (SIL OFL 1.1)</summary><pre style="white-space:pre-wrap;font-size:0.7rem">{lic_fira}</pre></details>
</div></div>"""


def build():
    manifest, files = check_vendor()
    sources = load_json("sources.json")
    template_js = read(HERE / "beamdswitch.js")
    if sha256(template_js.encode("utf-8")) != sources["beamdswitch"]["sha256"]:
        fail("beamdswitch.js does not match the SHA-256 recorded in data/sources.json")
    data = {
        "preset": load_json("preset.json"),
        "examples": load_json("examples.json"),
        "references": load_json("reference-cases.json"),
        "evidence": load_json("evidence.json"),
        "sources": {
            "MathJax": "4.1.3 (npm mathjax)",
            "Fira font": "4.1.3 (npm @mathjax/mathjax-fira-font)",
            "beamdswitch": f"yujieteo/site {sources['beamdswitch']['commit'][:12]} sha256 {sources['beamdswitch']['sha256'][:16]}",
            "evidence": f"stealth-rcs {load_json('evidence.json')['provenance']['dataset_version']}",
        },
    }
    rows, snap = static_rows(data["sources"])
    style = read(SRC / "style-tokens.css") + "\n" + read(SRC / "page.css")
    scripts = [inline(f"src-{m}", read(SRC / f"{m}.js")) for m in MODULES]
    scripts.append(inline("beamdswitch", template_js))
    scripts.append(inline("worker-glue", read(SRC / "worker.js"), "text/plain"))
    scripts += [inline(f"src-{m}", read(SRC / f"{m}.js")) for m in BROWSER]
    page = read(SRC / "template.html")
    tm = template_js.encode("utf-8")
    replacements = {
        "{{STYLE}}": style,
        "{{STATIC_ROWS}}": rows,
        "{{BUILD_NOTE}}": f"Static table: initial scene at t = 0 s, model digest {snap['digest']}.",
        "{{STATIC_ABOUT}}": about(sources, manifest, files),
        "{{MODEL_VERSION}}": snap["modelVersion"],
        "{{SCHEMA_VERSION}}": str(snap["schemaVersion"]),
        "{{MATHJAX_VERSION}}": "4.1.3",
        "{{TEMPLATE_SHA}}": f"SHA-256 {sha256(tm)[:16]}…",
        "{{DATA}}": json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"),
        "{{SCRIPTS}}": "\n".join(scripts),
        "{{MATHJAX}}": mathjax_block(manifest, files),
    }
    for key in replacements:
        if key not in page:
            fail(f"template has no {key}")
    # One pass, so text inserted for one placeholder is never scanned for another.
    page = re.sub(r"\{\{[A-Z_]+\}\}", lambda m: replacements[m.group(0)], page)
    raw = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
    return page, raw


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--verify", action="store_true", help="check index.html and raw.json are fresh; write nothing")
    args = parser.parse_args()
    page, raw = build()
    targets = {HERE / "index.html": page, HERE / "raw.json": raw}
    if args.verify:
        stale = [p.name for p, text in targets.items() if not p.is_file() or read(p) != text]
        if stale:
            fail(f"stale: {', '.join(stale)}; run python3 build.py")
        print(f"verified: index.html ({len(page.encode('utf-8'))} bytes) and raw.json are fresh; vendored files match their checksums")
        return
    for path, text in targets.items():
        path.write_text(text, encoding="utf-8")
    print(f"wrote index.html ({len(page.encode('utf-8'))} bytes) and raw.json")


if __name__ == "__main__":
    main()
