"""Deterministic checks that replace review by reading, for one visual's folder or the shared tooling.

Each check takes what it reads and returns a list of problems, one line each; scripts/check.py runs the
per-visual ones from a visual's folder (it needs only that folder and scripts/, as on CI's sparse checkout),
and scripts/check_repo.py the repository-wide ones. No check reads the network.

  template      every copy of the site's beamdswitch template in the folder matches the SHA-256 that
                scripts/sync_template.py records in scripts/templates/beamdswitch.sha256, and a page without
                a builder inlines beamdswitch.js and report.js unchanged
  requests      the page requests nothing outside the files the site publishes beside it (index.html,
                data.json and visual.json "assets"): no absolute or parent paths, no notes.md, also from CSS
                @import and url(); no XMLHttpRequest, WebSocket, EventSource or sendBeacon at all; and in a
                script that is not a vendored block, no fetch, import(), importScripts, Worker or SharedWorker
                of a computed URL (a template literal with ${}, a literal joined with +, or a name), and no
                absolute http(s) URL set as a src, srcset or poster or passed to new Audio (teoyujie.org and
                the w3.org namespaces aside)
  contrast      the page's colour tokens meet WCAG contrast in both themes (text 4.5:1 on --bg, controls
                and series 3:1), no control is outlined in a token below 3:1 (such as --border), and its two
                dark-theme blocks agree
  theme         the page carries the site's theme script (style_guide.THEME_SCRIPT) unchanged, before its first
                <style>, so the reader's Light or Dark choice applies, and each [data-theme] block sets the
                matching color-scheme so form controls and scroll bars follow it
  python        unused imports, unused local variables and definitions made twice in the visual's Python
  source-tests  tests whose every assertion checks the page's source text, or a value read out of it, instead
                of running the code
  vendor        every vendored block of the page (<script data-vendor>, such as MathJax 4.1.3 with its Fira font)
                is the bundle scripts/visual_kit.py builds from scripts/vendor/, unchanged
  artifacts     no tracked __pycache__, *.pyc, .DS_Store or AppleDouble ._* file, and .gitignore keeps them out

A finding a visual keeps on purpose is listed, with its reason in the pull request, in visual.json
"allow": {"<check>": ["<the problem line>", ...]}, without the line number after the file name, so an edit
elsewhere in the file does not break it. Each entry allows one problem: list it twice to allow two identical
problems. An entry that matches no problem fails, so it cannot go stale.
"""
import ast
import hashlib
import re
from collections import Counter
from pathlib import Path

from style_guide import THEME_SCRIPT

TEMPLATE_HASH = Path(__file__).resolve().parent / "templates" / "beamdswitch.sha256"
TEMPLATE_COPIES = ("beamdswitch.js", "tests/fixtures/beamdswitch/beamdswitch.js", "tests/fixtures/beamdswitch/template.js")
SKIPPED_DIRS = {"__pycache__", "node_modules", ".typecheck", ".git", ".venv"}


LINE = re.compile(r"^([^\s:]+):\d+(?=: )")


def allowed(problems, allow):
    """Split ``problems`` by the visual's allow list: (problems not allowed, allow entries that match none).

    An entry is a problem without the line number after its file name, and allows one problem only."""
    unused = Counter(allow or [])
    left = []
    for problem in problems:
        key = LINE.sub(r"\1", problem, count=1)
        if unused[key]:
            unused[key] -= 1
        else:
            left.append(problem)
    return left, list(unused.elements())


# template ---------------------------------------------------------------------------------------------------

def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def template_problems(folder, expected=None):
    """Copies of the beamdswitch template in ``folder`` that differ from the recorded site template, and a
    hand-edited page whose inlined report.js differs from the file."""
    expected = expected or TEMPLATE_HASH.read_text(encoding="utf-8").split()[0]
    copy = folder / "beamdswitch.js"
    if not copy.is_file():
        return []
    problems = []
    for name in TEMPLATE_COPIES:
        path = folder / name
        if path.is_file() and sha256(path.read_text(encoding="utf-8")) != expected:
            problems.append(f"{name} differs from the site's templates/beamdswitch.js (sha256 {expected[:12]}); "
                            "run scripts/sync_template.py, never edit a copy by hand")
    page = folder / "index.html"
    html = page.read_text(encoding="utf-8") if page.is_file() else ""
    if copy.read_text(encoding="utf-8").strip() not in html:
        problems.append("index.html does not inline beamdswitch.js unchanged")
    # A page without a builder carries its report.js by hand; a builder's --verify checks its own copy.
    report = folder / "report.js"
    builder = any((folder / name).is_file() for name in ("build.py", "build.mjs"))
    if report.is_file() and not builder and report.read_text(encoding="utf-8").strip() not in html:
        problems.append("index.html does not inline report.js unchanged")
    return problems


# vendor -----------------------------------------------------------------------------------------------------

VENDOR_BLOCK = re.compile(r'<script\b[^>]*\bdata-vendor="([^"]*)"[^>]*>\n(.*?)\n</script>', re.S)


def vendor_problems(html):
    """Vendored blocks of the page that are not the bundle scripts/visual_kit.py builds from scripts/vendor/."""
    import visual_kit
    bundles = {visual_kit.MATHJAX: visual_kit.mathjax_bundle}
    blocks = VENDOR_BLOCK.findall(html)
    problems = []
    if len(blocks) != len(re.findall(r"<script\b[^>]*\bdata-vendor=", html)):
        problems.append("index.html: a <script data-vendor> block is not in the form scripts/visual_build.py writes; rebuild the page")
    for name, body in blocks:
        if name not in bundles:
            problems.append(f'index.html: <script data-vendor="{name}"> names no bundle in scripts/visual_kit.py ({", ".join(bundles)})')
        elif body != bundles[name]().rstrip("\n"):
            problems.append(f'index.html: <script data-vendor="{name}"> differs from the vendored files; rebuild the page, never edit the block')
    return problems


# requests ---------------------------------------------------------------------------------------------------

REQUEST_TAG = re.compile(r"<(script|img|iframe|source|video|audio|link|embed|object|track)\b([^>]*)>", re.I)
REQUEST_ATTR = re.compile(r"\b(src|href|data)\s*=\s*([\"'])([^\"']*)\2", re.I)
LINK_REQUEST = re.compile(r"\brel\s*=\s*[\"']?[^\"'>]*\b(?:stylesheet|preload|modulepreload|icon|manifest|prefetch)\b", re.I)
REQUEST_CALL = re.compile(r"\b(fetch|new\s+Worker|new\s+SharedWorker|import|importScripts)\s*\(\s*([`\"'])([^`\"']*)\2")
STYLE_TEXT = re.compile(r"<style\b[^>]*>(.*?)</style>|\bstyle\s*=\s*\"([^\"]*)\"", re.I | re.S)
CSS_REQUEST = re.compile(r"@import\s+(?:url\(\s*)?([\"']?)([^\"')\s;]+)\1|\burl\(\s*([\"']?)([^\"')]+?)\3\s*\)", re.I)
NETWORK_API = re.compile(r"\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b")
COMPUTED_CALL = re.compile(r"(?<![\w$])(fetch|new\s+Worker|new\s+SharedWorker|import|importScripts)\s*\(\s*"
                           r"(`[^`]*`|\"[^\"\n]*\"|'[^'\n]*'|[^`\"'\s)][^,)]*)(\s*\+[^,)]*)?")
SCRIPT_URL = re.compile(r"(?:\.(?:src|srcset|poster)\s*=\s*|setAttribute\(\s*([\"'])(?:src|srcset|poster)\1\s*,\s*|"
                        r"\bnew\s+Audio\s*\(\s*)([`\"'])(https?://[^`\"'\s]*)\2", re.I)
SCRIPT_TEXT = re.compile(r"<script\b(?![^>]*\bdata-vendor=)[^>]*>(.*?)</script>", re.I | re.S)
SCRIPT_URL_HOSTS = re.compile(r"^https?://(?:[\w-]+\.)*(?:teoyujie\.org|w3\.org)(?:[/:?#]|$)", re.I)
FREE_SCHEMES = ("data:", "blob:", "#", "about:")


def page_requests(html):
    """The URLs the page asks the browser to load: tag sources, linked stylesheets and icons, CSS @import and
    url(), fetch, workers and dynamic imports. JSDoc ``import("./x.js")`` types and template-literal URLs are
    not requests."""
    found = []
    for m in STYLE_TEXT.finditer(html):
        found += [c.group(2) or c.group(4) for c in CSS_REQUEST.finditer(m.group(1) or m.group(2) or "")]
    for m in REQUEST_TAG.finditer(html):
        tag, attrs = m.group(1).lower(), m.group(2)
        if tag == "link" and not LINK_REQUEST.search(attrs):
            continue
        found += [a.group(3) for a in REQUEST_ATTR.finditer(attrs) if not (tag != "object" and a.group(1).lower() == "data")]
    for m in REQUEST_CALL.finditer(html):
        line = html[html.rfind("\n", 0, m.start()) + 1:m.start()]
        if "@" in line or "typeof" in line[-8:] or _in_comment(html, m.start()):
            continue
        found.append(m.group(3))
    return [url for url in found if url and "${" not in url and not url.startswith(FREE_SCHEMES)]


def _in_comment(html, at):
    """True when the line that holds ``at`` is a comment line up to that point."""
    return html[html.rfind("\n", 0, at) + 1:at].lstrip().startswith(("*", "//", "/*"))


def request_problems(html, data):
    """Requests the published page would make outside its own published files."""
    published = {"index.html", "data.json", "./", ""} | set(data.get("assets", []))
    problems = []
    for api in sorted({m.group(1) for m in NETWORK_API.finditer(html) if not _in_comment(html, m.start())}):
        problems.append(f"index.html uses {api}: a page makes no request outside its folder, and reads its own files with fetch")
    computed, script_urls = set(), set()
    for start, end in (m.span(1) for m in SCRIPT_TEXT.finditer(html)):
        for m in COMPUTED_CALL.finditer(html, start, end):
            arg, joined = m.group(2).strip(), m.group(3)
            literal = arg[0] in "\"'" or (arg[0] == "`" and "${" not in arg)
            if not (literal and not joined) and not _in_comment(html, m.start()):
                computed.add(f"{' '.join(m.group(1).split())}({arg}{(joined or '').rstrip()})")
        script_urls |= {m.group(3) for m in SCRIPT_URL.finditer(html, start, end)
                        if not SCRIPT_URL_HOSTS.match(m.group(3)) and not _in_comment(html, m.start())}
    for call in sorted(computed):
        problems.append(f"index.html calls {call}: a computed URL the rule cannot check, so use a literal path")
    for url in sorted(script_urls):
        problems.append(f"index.html sets {url} from script: a page makes no request outside its folder")
    for url in sorted(set(page_requests(html))):
        path = url.split("#")[0].split("?")[0].removeprefix("./")
        if re.match(r"^(?:[a-z][a-z0-9+.-]*:)?//", url, re.I):
            problems.append(f"index.html requests {url}: a page makes no request outside its folder")
        elif url.startswith("/") or ".." in path.split("/"):
            problems.append(f"index.html requests {url}: a path outside the visual's published folder")
        elif path.rsplit("/", 1)[-1] == "notes.md":
            problems.append(f"index.html requests {url}: notes.md is private and never published")
        elif path not in published:
            problems.append(f"index.html requests {url}: not a published file (index.html, data.json or visual.json assets)")
    return problems


# contrast ---------------------------------------------------------------------------------------------------

ROOT_BLOCK = re.compile(r"(@media[^{]*\{\s*)?:root((?:\[[^\]]*\]|:not\(\[[^\]]*\]\))*)\s*\{([^{}]*)\}")
TOKEN = re.compile(r"--([\w-]+)\s*:\s*([^;]+)")
VAR = re.compile(r"^var\(--([\w-]+)\)$")
# The style guide's names, and the older names one page still uses for them.
ALIASES = {"background": "bg", "foreground": "fg"}
TEXT = ("fg", "muted", "focus", "hl", "ok", "warn", "bad")
SERIES = ("c1", "c2", "c3", "c4")
TEXT_RATIO, GRAPHIC_RATIO = 4.5, 3.0


def themes(html):
    """The page's colour tokens as {"light": {...}, "dark": {...}}, and its dark blocks as raw dicts.

    Light is every plain :root block plus :root[data-theme="light"]; dark is light overridden by the
    prefers-color-scheme: dark block and the :root[data-theme="dark"] block, the two ways the site's theme
    choice reaches a page.
    """
    light, media_dark, forced_dark = {}, {}, {}
    for m in ROOT_BLOCK.finditer(html):
        media, selector, body = m.group(1) or "", m.group(2), m.group(3)
        tokens = {ALIASES.get(name, name): value.strip() for name, value in TOKEN.findall(body)}
        if "dark" in media:
            media_dark.update(tokens)
        elif 'data-theme="dark"' in selector or "data-theme='dark'" in selector or "data-theme=dark" in selector:
            forced_dark.update(tokens)
        elif not media:
            light.update(tokens)
    return {"light": light, "dark": {**light, **forced_dark, **media_dark}}, media_dark, forced_dark


def rgb(value, tokens, depth=0):
    """A token's value as (r, g, b) in 0-255, or None when it is not an opaque colour."""
    value = value.strip().lower()
    if (m := VAR.match(value)) and depth < 8:
        return rgb(tokens[m.group(1)], tokens, depth + 1) if m.group(1) in tokens else None
    if m := re.fullmatch(r"#([0-9a-f]{3}|[0-9a-f]{6})", value):
        h = m.group(1)
        h = "".join(c * 2 for c in h) if len(h) == 3 else h
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    if m := re.fullmatch(r"rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)", value):
        alpha = m.group(4)
        if alpha and (float(alpha.rstrip("%")) / (100 if alpha.endswith("%") else 1)) < 1:
            return None
        return tuple(int(m.group(i)) for i in (1, 2, 3))
    return None


def luminance(colour):
    channels = [c / 255 for c in colour]
    r, g, b = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def pairs():
    """(foreground token, background token, minimum ratio, what it is) for every pair the style guide sets."""
    out = [(name, "bg", TEXT_RATIO, "text") for name in TEXT]
    out += [("control", "bg", GRAPHIC_RATIO, "control outline"), ("control", "surface", GRAPHIC_RATIO, "control outline")]
    out += [("on-focus", "focus", TEXT_RATIO, "text on a focus-coloured button")]
    out += [(name, "bg", GRAPHIC_RATIO, "series mark") for name in SERIES]
    return out


CSS_RULE = re.compile(r"([^{};]+)\{([^{}]*)\}")
NATIVE_CONTROL = re.compile(r"(?:^|[\s,>+~(])(?:input|select|textarea|button)\b")
TAG_CLASSES = re.compile(r"<(\w+)\b[^>]*?\bclass=[\"']([^\"']+)[\"']")
CLASS = re.compile(r"\.([\w-]+)")
INACTIVE = re.compile(r":disabled|\[disabled|\[aria-disabled")
OUTLINE = re.compile(r"(?:^|;)\s*border(?:-color)?\s*:[^;]*?var\(--([\w-]+)\)")


def outline_tokens(html):
    """The colour tokens that outline an active control, with the first selector that uses each: the border or
    border-color of an input, select, textarea or button rule, or of a class the page's markup puts only on
    <button> elements (and .btn). A disabled control needs no contrast (WCAG 1.4.11)."""
    on = {}
    for tag, value in TAG_CLASSES.findall(html):
        for name in value.split():
            on.setdefault(name, set()).add(tag.lower())
    classes = {"btn"} | {name for name, tags in on.items() if tags == {"button"}}
    found = {}
    for selector, body in CSS_RULE.findall(html):
        selector = selector.strip()
        if selector.startswith(("@", ":root")) or INACTIVE.search(selector):
            continue
        if not NATIVE_CONTROL.search(selector) and not classes & set(CLASS.findall(selector)):
            continue
        for token in OUTLINE.findall(body):
            found.setdefault(ALIASES.get(token, token), selector)
    return found


def contrast_problems(html):
    """Token pairs below their WCAG ratio in either theme, controls outlined in a token below 3:1 on --bg,
    and dark-theme blocks that disagree."""
    by_theme, media_dark, forced_dark = themes(html)
    problems = []
    outlines = outline_tokens(html)
    for theme, tokens in by_theme.items():
        for fg, bg, minimum, what in pairs():
            if fg not in tokens or bg not in tokens:
                continue
            a, b = rgb(tokens[fg], tokens), rgb(tokens[bg], tokens)
            if a is None or b is None:
                continue
            if (r := ratio(a, b)) < minimum:
                problems.append(f"{theme}: --{fg} on --{bg} is {r:.2f}:1, below {minimum}:1 for {what}")
        for token, selector in sorted(outlines.items()):
            a, b = (rgb(tokens[name], tokens) if name in tokens else None for name in (token, "bg"))
            if a is not None and b is not None and token not in ("control", "bg") and (r := ratio(a, b)) < GRAPHIC_RATIO:
                problems.append(f"{theme}: {selector} outlines a control in --{token}, {r:.2f}:1 on --bg, "
                                f"below {GRAPHIC_RATIO}:1; use --control")
    if media_dark and forced_dark:
        for name in sorted(set(media_dark) | set(forced_dark)):
            if media_dark.get(name) != forced_dark.get(name):
                problems.append(f"dark: --{name} is {media_dark.get(name)} under prefers-color-scheme but "
                                f"{forced_dark.get(name)} under [data-theme=\"dark\"]")
    return problems


# theme ------------------------------------------------------------------------------------------------------

SITE_THEME = re.compile(r"<script\b[^>]*\bid\s*=\s*[\"']?site-theme\b[^>]*>.*?</script>", re.I | re.S)
THEME_BLOCK = re.compile(r"(?:(?<=[{};\s])|^)(?::root|html)?\[data-theme=[\"']?(dark|light)[\"']?\](?::not\([^)]*\))*\s*\{([^{}]*)\}", re.M)
COLOR_SCHEME = re.compile(r"(?<![\w-])color-scheme\s*:\s*([\w ]+?)\s*(?:;|!|$)")


def theme_problems(html):
    """Where the page does not follow the site's Light or Dark choice."""
    problems = []
    scripts = SITE_THEME.findall(html)
    style = html.find("<style")
    if not scripts:
        problems.append("index.html has no site-theme script (style_guide.THEME_SCRIPT), so it ignores the reader's theme choice")
    elif scripts != [THEME_SCRIPT]:
        problems.append("index.html site-theme script is not style_guide.THEME_SCRIPT unchanged")
    elif style != -1 and html.find(THEME_SCRIPT) > style:
        problems.append("index.html site-theme script comes after the first <style>, so the page first paints in the wrong theme")
    schemes = {}
    for theme, body in THEME_BLOCK.findall(html):
        schemes.setdefault(theme, set()).update(COLOR_SCHEME.findall(body))
    for theme, found in sorted(schemes.items()):
        if found != {theme}:
            problems.append(f'index.html [data-theme="{theme}"] sets color-scheme {sorted(found) or "nowhere"}, not {theme}')
    return problems


# python -----------------------------------------------------------------------------------------------------

class _Names(ast.NodeVisitor):
    """Every name a tree reads, including attribute bases, strings in __all__ and names in string annotations."""

    def __init__(self):
        self.loaded = set()

    def visit_Name(self, node):
        if not isinstance(node.ctx, ast.Store):
            self.loaded.add(node.id)

    def visit_Constant(self, node):
        if isinstance(node.value, str) and re.fullmatch(r"[\w.\[\], |]+", node.value):
            self.loaded.update(re.findall(r"[A-Za-z_]\w*", node.value))


def _loaded(tree):
    names = _Names()
    names.visit(tree)
    return names.loaded


def _body_duplicates(body, where):
    """Functions or classes defined twice in one body, the first never used before the second replaces it."""
    problems, seen = [], {}
    for node in body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if node.name in seen and not node.decorator_list and not seen[node.name].decorator_list:
                problems.append(f"{where}:{node.lineno}: {node.name} is defined again in the same scope")
            seen[node.name] = node
        if isinstance(node, ast.ClassDef):
            problems += _body_duplicates(node.body, where)
    return problems


def _own_nodes(func):
    """Every node of ``func``'s own scope: its body, not the bodies of functions, lambdas or classes inside it."""
    stack = list(func.body)
    while stack:
        node = stack.pop()
        yield node
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
            stack.extend(ast.iter_child_nodes(node))


def _unused_locals(tree, where):
    """Names a function assigns with a plain `name = ...` and never reads, as pyflakes' F841 does."""
    problems = []
    for func in ast.walk(tree):
        if not isinstance(func, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        declared = {n for node in ast.walk(func) if isinstance(node, (ast.Global, ast.Nonlocal)) for n in node.names}
        loaded = set()
        for node in func.body:
            loaded |= _loaded(node)
        if any(isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {"locals", "vars", "eval", "exec"}
               for node in ast.walk(func)):
            continue
        for node in _own_nodes(func):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, (ast.AnnAssign, ast.NamedExpr)) and getattr(node, "value", None) is not None else []
            for target in targets:
                if isinstance(target, ast.Name) and target.id not in loaded and target.id not in declared and not target.id.startswith("_"):
                    problems.append(f"{where}:{target.lineno}: local {target.id} is assigned but never read")
    return problems


def python_problems(path, label=None):
    """Unused imports, unused locals and duplicated definitions in one Python file."""
    where = label or path.name
    source = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError as error:
        return [f"{where}:{error.lineno}: does not parse: {error.msg}"]
    lines = source.splitlines()
    problems = []
    if path.name != "__init__.py":
        loaded = _loaded(tree)
        for node in tree.body:
            if not isinstance(node, (ast.Import, ast.ImportFrom)) or (isinstance(node, ast.ImportFrom) and node.module == "__future__"):
                continue
            if "noqa" in lines[node.lineno - 1]:
                continue
            for alias in node.names:
                name = (alias.asname or alias.name).split(".")[0]
                if alias.name != "*" and name not in loaded:
                    problems.append(f"{where}:{node.lineno}: import {alias.asname or alias.name} is unused")
    problems += _body_duplicates(tree.body, where)
    problems += _unused_locals(tree, where)
    return problems


def python_files(folder):
    """The folder's own Python files, not caches or installed packages, sorted."""
    return sorted(p for p in folder.rglob("*.py") if not SKIPPED_DIRS & set(p.relative_to(folder).parts))


def python_folder_problems(folder, prefix=""):
    problems = []
    for path in python_files(folder):
        problems += python_problems(path, prefix + path.relative_to(folder).as_posix())
    return problems


# source-tests -----------------------------------------------------------------------------------------------

SOURCE_FILE = r"[\w./-]*\.(?:html|m?js|cjs|css|py)\b"
JS_SOURCE = re.compile(r"(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?[^;\n]*?(?:readFileSync|readFile)\([^;\n]*?" + SOURCE_FILE)
PY_SOURCE = re.compile(r"^\s*(?:self\.)?(\w+)\s*=\s*[^\n]*?" + SOURCE_FILE + r"[^\n]*?(?:read_text|\.read)\(", re.M)
JS_TEST = re.compile(r"^\s*(?:test|it)(?:\.\w+)?\(\s*([`\"'])(.*?)\1", re.M)
PY_TEST = re.compile(r"^\s*def (test_\w+)\(", re.M)
JS_ASSERT = re.compile(r"\bassert(?:\.\w+)?\s*\(|\bexpect\s*\(")
# The value each assertion checks: its first argument's leading name (the haystack for assertIn and the
# string a regular expression literal tests).
JS_SUBJECT = re.compile(r"\bassert(?:\.\w+)?\(\s*!?\s*(?:/(?:\\.|[^/\n])+/\w*\.test\(\s*)?(\w+)|\bexpect\(\s*(\w+)")
PY_ASSERT = re.compile(r"\bself\.assert\w+\(|^\s*assert\b", re.M)
PY_SUBJECT = re.compile(r"\bself\.assert(?:In|NotIn)\([^,\n]+,\s*(?:self\.)?(\w+)|\bself\.assert\w+\(\s*(?:self\.)?(\w+)|^\s*assert\s+(?:not\s+)?(?:self\.)?(\w+)", re.M)


def _blocks(text, start):
    """(name, body) for each test in ``text``: from one test's start to the next's."""
    marks = list(start.finditer(text))
    return [(m.group(m.lastindex), text[m.start():marks[i + 1].start() if i + 1 < len(marks) else len(text)]) for i, m in enumerate(marks)]


# An assignment that does not carry source text on: a function (it runs code, which is behaviour) or
# parsed data (JSON.parse, json.loads: what the page embeds, not how it is written).
NOT_TEXT = re.compile(r"^\s*(?:async\b|function\b|\([^)]*\)\s*=>|\w+\s*=>|lambda\b)|\bJSON\.parse\(|\bjson\.loads?\(")


def _carries(expression, names):
    """Whether an assignment from ``expression`` holds source text when ``names`` do."""
    return bool(names) and not NOT_TEXT.search(expression) and bool(re.search(r"\b(?:" + "|".join(map(re.escape, names)) + r")\b", expression))


def _derived(text, names, assignment):
    """``names`` plus every name assigned source text taken from one of them, to a fixed point."""
    names = set(names)
    while True:
        more = {m.group(1) for m in assignment.finditer(text) if m.group(1) not in names and _carries(m.group(2), names)}
        if not more:
            return names
        names |= more


JS_ASSIGN = re.compile(r"(?:const|let|var)\s+(\w+)\s*=\s*([^;\n]+)")
TOP_JS_ASSIGN = re.compile(r"^(?:const|let|var)\s+(\w+)\s*=\s*([^;\n]+)", re.M)
PY_ASSIGN = re.compile(r"^\s*(?:self\.)?(\w+)\s*=\s*([^\n]+)", re.M)


def source_test_problems(path, label=None):
    """Tests in one file whose every assertion checks source text read from a page or script file, or a value
    taken out of that text, such as a regular expression's matches, instead of what the code does."""
    where = label or path.name
    text = path.read_text(encoding="utf-8")
    python = path.suffix == ".py"
    sources = {m.group(1) for m in (PY_SOURCE if python else JS_SOURCE).finditer(text)}
    if not sources:
        return []
    sources = _derived(text, sources, PY_ASSIGN if python else TOP_JS_ASSIGN)
    problems = []
    assignment = PY_ASSIGN if python else JS_ASSIGN
    for name, body in _blocks(text, PY_TEST if python else JS_TEST):
        asserts = len((PY_ASSERT if python else JS_ASSERT).findall(body))
        subjects = [next(g for g in m.groups() if g) for m in (PY_SUBJECT if python else JS_SUBJECT).finditer(body)]
        if not asserts or len(subjects) < asserts:
            continue
        # In the test, a name holds source text when it is assigned from source text, and stops when it is
        # assigned from anything else, such as the output of the code it runs.
        local = set(sources)
        for m in assignment.finditer(body):
            if _carries(m.group(2), local):
                local.add(m.group(1))
            else:
                local.discard(m.group(1))
        if all(subject in local for subject in subjects):
            problems.append(f"{where}: test \"{name}\" only checks source text; run the code and assert on what it does")
    return problems


def test_files(folder):
    tests = folder / "tests"
    if not tests.is_dir():
        return []
    return sorted(p for pattern in ("*.test.mjs", "*.test.cjs", "test_*.py") for p in tests.glob(pattern))


def source_tests_problems(folder):
    problems = []
    for path in test_files(folder):
        problems += source_test_problems(path, path.relative_to(folder).as_posix())
    return problems


# artifacts --------------------------------------------------------------------------------------------------

ARTIFACT = re.compile(r"(?:^|/)(?:__pycache__/|\.DS_Store$|\._[^/]*$)|\.py[co]$")
IGNORED = ("__pycache__/", "*.pyc", ".DS_Store", "._*")


def artifact_problems(tracked, gitignore):
    """Tracked build or OS artifacts, and the patterns .gitignore must hold so new ones never get added."""
    problems = [f"{path}: a build or OS artifact is tracked; git rm --cached it" for path in tracked if ARTIFACT.search(path)]
    lines = {line.strip() for line in gitignore.splitlines()}
    problems += [f".gitignore: does not ignore {pattern}" for pattern in IGNORED if pattern not in lines]
    return problems
