"""The shared, versioned parts every generated visual is built from: the kit (scripts/kit/), the beamdswitch report
template (scripts/templates/) and the vendored MathJax with its Fira font (scripts/vendor/mathjax/).

scripts/visual_build.py inlines these into a visual's index.html, scripts/new_visual.py writes the files a visual
keeps beside them, and scripts/rules.py checks that a page's vendored block and the vendored files are unchanged.
Every function returns exactly the text a page or file ships, so two runs give the same bytes.
"""
import hashlib
import html
import json
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
KIT = SCRIPTS / "kit"
TEMPLATES = SCRIPTS / "templates"
VENDOR = SCRIPTS / "vendor" / "mathjax"
# The kit's version: scripts/new_visual.py records it in a visual's generated.json. Raise it when a change to the
# kit changes what a generated visual must hold beyond what --update rewrites.
KIT_VERSION = 1
MATHJAX = "mathjax-4.1.3"
# The vendored files in the order the bundle concatenates them. They run as one script, so the font is in place
# before MathJax's startup, which resolves in a later microtask, chooses one.
MATHJAX_FILES = ("mathjax/tex-svg-nofont.js", "mathjax/a11y/assistive-mml.js", "mathjax-fira-font/svg.js")
# The beamdswitch report template a generated visual copies.
BEAMDSWITCH = TEMPLATES / "beamdswitch.js"


def sha256(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode("utf-8")).hexdigest()


def read(path):
    return Path(path).read_text(encoding="utf-8")


def theme_script():
    """The site's own theme line, first in <head>, as the style guide gives it."""
    from style_guide import THEME_SCRIPT
    return THEME_SCRIPT


# MathJax's configuration, the first lines of the bundle: TeX in, SVG out in the Fira font, no menu, no speech
# worker and no request. Every dynamic font range is in the bundle, so each one's load resolves at once, and
# assistive MathML gives screen readers the formula.
MATHJAX_CONFIG = """window.MathJax = {
  loader: { load: [], versionWarnings: false },
  output: { font: "[mathjax-fira]" },
  options: { enableMenu: false, menuOptions: { settings: { enrich: false, speech: false, braille: false, collapsible: false, assistiveMml: true } } },
  startup: {
    ready() {
      const font = MathJax._.output.fonts["mathjax-fira"].svg_ts.MathJaxFiraFont;
      for (const file of Object.values(font.dynamicFiles)) file.promise = Promise.resolve();
      MathJax.startup.defaultReady();
    },
  },
};
"""
MATHJAX_PRELOADED = "MathJax.loader.preLoaded(\"a11y/assistive-mml\", \"[mathjax-fira]/svg\");\n"


def mathjax_files(vendor=VENDOR):
    """The vendored files the bundle holds, in order: MathJax, assistive MathML, the font, its dynamic ranges."""
    dynamic = sorted((vendor / "mathjax-fira-font" / "svg" / "dynamic").glob("*.js"))
    return [vendor / name for name in MATHJAX_FILES] + dynamic


def mathjax_bundle(vendor=VENDOR):
    """The text of the page's <script data-vendor="mathjax-4.1.3"> block: the configuration, then every vendored
    file unchanged, one per line, with the one line that marks the font and assistive MathML as loaded."""
    files = [read(path).rstrip("\n") + "\n" for path in mathjax_files(vendor)]
    return MATHJAX_CONFIG + "".join(files[:3]) + MATHJAX_PRELOADED + "".join(files[3:])


def licences_html(vendor=VENDOR):
    """The licences of the embedded MathJax and Fira Math, shown in the page so the single file carries them."""
    sources = json.loads(read(vendor / "SOURCES.json"))
    parts = ['<details class="licences">', "<summary>Licences of the embedded MathJax 4.1.3 and Fira Math</summary>"]
    for package in sources["packages"]:
        version = f" {package['version']}" if "version" in package else ""
        parts.append(f"<p>{html.escape(package['name'])}{version}: {html.escape(package['license'])}.</p>")
    for name in ("mathjax/LICENSE", "mathjax-fira-font/FiraMath-LICENSE.txt"):
        parts.append(f"<pre>{html.escape(read(vendor / name).strip())}</pre>")
    parts.append("</details>")
    return "\n".join(parts)


def vendor_problems(vendor=VENDOR):
    """Vendored files that differ from, or are missing in, the sha256 list of scripts/vendor/mathjax/SOURCES.json."""
    recorded = json.loads(read(vendor / "SOURCES.json"))["sha256"]
    problems = []
    for name, digest in sorted(recorded.items()):
        path = vendor / name
        if not path.is_file():
            problems.append(f"scripts/vendor/mathjax/{name}: missing; SOURCES.json lists it")
        elif sha256(path.read_bytes()) != digest:
            problems.append(f"scripts/vendor/mathjax/{name}: differs from its sha256 in SOURCES.json; vendored files are never edited")
    listed = {vendor / name for name in recorded} | {vendor / "SOURCES.json", vendor / "README.md"}
    problems += [f"scripts/vendor/mathjax/{p.relative_to(vendor).as_posix()}: not listed in SOURCES.json"
                 for p in sorted(vendor.rglob("*")) if p.is_file() and p not in listed]
    return problems


def beamdswitch_template():
    """The beamdswitch report template, scripts/templates/beamdswitch.js."""
    return read(BEAMDSWITCH)
