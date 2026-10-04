"""Named-result discovery (te-names/1): which records carry a recognised name, and from which source.

A named result is a mathematical result that one of these declared naming sources names:

  wikidata    an item of mathlib4's docs/1000.yaml (the 1000+ theorems project, keyed by Wikidata Q-id), with
              its title and its decl / decls when mathlib formalises it
  freek100    an item of docs/100.yaml (Freek Wiedijk's "Formalizing 100 Theorems" list)
  overview    a leaf of docs/overview.yaml or docs/undergrad.yaml whose declaration is a kept theorem
  docstring   a bold phrase (**...**) in a kept theorem's doc comment that ends in a result word (NAME_WORDS)
  nlab        an nLab page whose title ends in a result word (pipeline/nlab.py applies the same words)

Names are matched after normalize(): lower case, typographic dashes and quotes made plain, a leading "the"
and trailing punctuation removed, and "'s" kept. Names that normalise to the same text join one candidate.
"""
import re
import unicodedata

from common import WORK

NAME_WORDS = ("theorem", "theorems", "lemma", "inequality", "inequalities", "principle", "formula", "identity",
              "criterion", "law", "conjecture", "bound", "test", "duality", "correspondence", "reciprocity",
              "paradox", "equation", "rule", "estimate", "trick", "argument", "decomposition", "construction",
              "classification", "hypothesis", "property", "expansion", "transform", "representation")
_WORDS = re.compile(r"(?i)\b(?:" + "|".join(NAME_WORDS) + r")\b")
_BOLD = re.compile(r"\*\*([^*\n]{3,90})\*\*")


def normalize(name):
    s = unicodedata.normalize("NFKC", name).strip().lower()
    s = re.sub(r"[‐-―−]", "-", s)
    s = re.sub(r"[‘’ʼ`´]", "'", s)
    s = re.sub(r"\$|\\", "", s)
    s = re.sub(r"\s*-\s*", "-", s)
    s = re.sub(r"--+", "-", s)
    s = re.sub(r"^the\s+", "", s)
    s = re.sub(r"[\s.:;,!]+$", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def has_name_word(text):
    return bool(_WORDS.search(text))


def bold_names(doc):
    """The bold phrases of a doc comment that name a result."""
    out = []
    for m in _BOLD.finditer(doc or ""):
        s = m[1].strip().rstrip(".:,")
        if has_name_word(s) and not s.startswith("`") and len(s.split()) <= 12:
            out.append(s)
    return out


def read_list_yaml(path):
    """The items of mathlib's 100.yaml / 1000.yaml: {key: {field: value or list}}. Fields: title, decl, decls,
    authors (or author), date, url, comment, statement, links, note."""
    items, key, field = {}, None, None
    for raw in path.read_text(encoding="utf-8").split("\n"):
        line = raw.split(" #")[0].rstrip() if not raw.lstrip().startswith("#") else ""
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        text = line.strip()
        if indent == 0 and text.endswith(":"):
            key = text[:-1].strip().strip('"')
            items[key] = {}
            field = None
        elif key is None:
            continue
        elif text.startswith("- ") and field:
            items[key].setdefault(field, [])
            if isinstance(items[key][field], list):
                items[key][field].append(text[2:].strip().strip("'\""))
        elif indent <= 3 and ":" in text:
            name, _, value = text.partition(":")
            field = name.strip()
            value = value.strip().strip("'\"")
            items[key][field] = value if value else []
        elif ":" in text and field:
            name, _, value = text.partition(":")
            if isinstance(items[key].get(field), list):
                items[key][field] = {}
            if isinstance(items[key].get(field), dict):
                items[key][field][name.strip()] = value.strip()
    for item in items.values():
        if "author" in item and "authors" not in item:
            item["authors"] = item.pop("author")
        for k in ("decl", "statement"):
            if isinstance(item.get(k), list) and not item[k]:
                del item[k]
    return items


def read_overview_yaml(path):
    """(path of headings, leaf name, target) for every leaf "name: 'Target'" of overview.yaml / undergrad.yaml."""
    out, stack = [], []
    for raw in path.read_text(encoding="utf-8").split("\n"):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        text = raw.strip()
        name, sep, value = text.rpartition(":") if text.endswith(":") else text.partition(": ")
        if text.endswith(":"):
            name, value = text[:-1], ""
        name = name.strip().strip("'\"")
        while stack and stack[-1][0] >= indent:
            stack.pop()
        if value.strip():
            out.append(([s[1] for s in stack], name, value.strip().strip("'\"")))
        else:
            stack.append((indent, name))
    return out


def mathlib_lists(mathlib_root=None):
    root = (mathlib_root or WORK / "mathlib4") / "docs"
    return {
        "wikidata": read_list_yaml(root / "1000.yaml"),
        "freek100": read_list_yaml(root / "100.yaml"),
        "overview": read_overview_yaml(root / "overview.yaml"),
        "undergrad": read_overview_yaml(root / "undergrad.yaml"),
    }


def decls_of(item):
    out = []
    for k in ("decl", "decls"):
        v = item.get(k)
        if isinstance(v, str) and v:
            out.append(v)
        elif isinstance(v, list):
            out.extend(x for x in v if x)
    return out
