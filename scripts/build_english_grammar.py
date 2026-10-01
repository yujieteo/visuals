#!/usr/bin/env python3
"""Builder and verifier for the english-grammar visualization.

An offline grammar laboratory following the analysis in The Cambridge Grammar
of the English Language (Huddleston & Pullum et al., 2002). Every sentence,
analysis and explanation is authored in data/english-grammar/:

  raw.json       verified chapter and section outline of the book
  concepts.json  concepts, beginner route and Common confusions
  examples.json  examples (bracketed trees) and side-by-side contrasts
  meta.json      source pages, check date and assumptions

The builder expands each bracketed tree into hierarchical JSON with token spans,
validates the whole corpus, and renders viz/english-grammar/index.html from
scripts/templates/english-grammar.css, english-grammar-logic.js (pure logic, also
run by tests/english-grammar.test.mjs) and english-grammar.js (interface). --verify re-runs every check,
including the Solarized contrast pairs, and compares the committed page.

    python3 scripts/build_english_grammar.py
    python3 scripts/build_english_grammar.py --verify
"""
import argparse
import json
import re
from html import escape
from pathlib import Path

from gallery import render_gallery

ROOT = Path(__file__).resolve().parents[1]
SLUG = "english-grammar"
DATA = ROOT / "data" / SLUG
VIZ = ROOT / "viz" / SLUG / "index.html"
GALLERY = ROOT / "index.html"
TOKENS = ROOT / "design-tokens.json"
CSS_TEMPLATE = ROOT / "scripts" / "templates" / "english-grammar.css"
JS_TEMPLATE = ROOT / "scripts" / "templates" / "english-grammar.js"
LOGIC_TEMPLATE = ROOT / "scripts" / "templates" / "english-grammar-logic.js"

DISPLAY_TITLE = "How English Grammar Works"
TITLE = "How English Grammar Works — an interactive CGEL explorer"
SUBTITLE = "An interactive guide to the analysis in <cite>The Cambridge Grammar of the English Language</cite>"
DESCRIPTION = (
    "Explore English grammar through interactive sentence analyses, constituent trees, contrasts, "
    "and examples based on the framework of The Cambridge Grammar of the English Language."
)
KEY_MESSAGE = (
    "Grammatical category and syntactic function are different: inspect what an expression is, "
    "what role it has, and how it fits into a larger structure."
)
CANONICAL = "https://teoyujie.org/visuals/english-grammar"
START_EXAMPLE = "kim-laughed"
CONCEPT_RANGE = (40, 60)
EXAMPLE_RANGE = (100, 150)
ROUTE_RANGE = (10, 12)
SIZE_BUDGET = 1_000_000

# Function labels: tree label -> name shown in the inspector.
FUNCTIONS = {
    "Subject": "Subject", "Predicate": "Predicate", "Predicator": "Predicator",
    "Object": "Object", "Od": "Direct object", "Oi": "Indirect object",
    "PredComp": "Predicative complement", "Comp": "Complement", "Adjunct": "Adjunct",
    "Head": "Head", "Det": "Determiner", "Mod": "Modifier", "Marker": "Marker",
    "Coord": "Coordinate", "Supplement": "Supplement", "Prenucleus": "Prenucleus",
    "Nucleus": "Nucleus", "ExtSubj": "Extraposed subject",
    "Head+Prenucleus": "Head fused with prenucleus", "Det+Head": "Fused determiner-head",
    "Mod+Head": "Fused modifier-head",
}
HEAD_FUNCTIONS = {"Head", "Predicate", "Predicator", "Head+Prenucleus", "Det+Head", "Mod+Head"}
FUSED_FUNCTIONS = {"Head+Prenucleus", "Det+Head", "Mod+Head"}
WORD_CATEGORIES = {
    "N": "Noun", "V": "Verb", "Adj": "Adjective", "Adv": "Adverb", "Prep": "Preposition",
    "D": "Determinative", "Sbr": "Subordinator", "Crd": "Coordinator",
}
PHRASE_CATEGORIES = {
    "Clause": "Clause", "NP": "Noun phrase", "Nom": "Nominal", "VP": "Verb phrase",
    "AdjP": "Adjective phrase", "AdvP": "Adverb phrase", "PP": "Preposition phrase",
    "DP": "Determinative phrase", "Coordination": "Coordination",
}
# Which categories may head which phrases (fused heads included).
HEADS = {
    "Clause": {"VP", "Clause"}, "NP": {"N", "Nom", "D", "Adj", "NP"}, "Nom": {"N", "Nom"},
    "VP": {"V", "VP"}, "AdjP": {"Adj", "AdjP"}, "AdvP": {"Adv"}, "PP": {"Prep"}, "DP": {"D"},
}
# Functions allowed inside each containing category.
ALLOWED = {
    "Clause": {"Subject", "Predicate", "Adjunct", "Marker", "Head", "Prenucleus", "Nucleus", "Supplement"},
    "VP": {"Predicator", "Object", "Od", "Oi", "PredComp", "Comp", "Adjunct", "ExtSubj", "Marker", "Head"},
    "NP": {"Det", "Head", "Det+Head", "Mod+Head", "Head+Prenucleus", "Mod", "Comp", "Marker"},
    "Nom": {"Head", "Mod", "Comp"},
    "AdjP": {"Head", "Mod", "Comp", "Marker"}, "AdvP": {"Head", "Mod", "Comp"},
    "PP": {"Head", "Comp", "Mod"}, "DP": {"Head", "Mod"},
    "Coordination": {"Coord"},
}
SPECIAL_NOTATION = {
    "gap": "A gap (__) marks the position of an element that is understood but not pronounced there; it is linked to the expression that supplies its interpretation.",
    "fusion": "A function written with + is a fusion: one expression has two functions at once, for example Head+Prenucleus in a fused relative.",
    "supplement": "A supplement is attached loosely and records its anchor, the expression it relates to; it is not a dependent of that anchor.",
}

# Page-scoped Solarized palette. Pairs below are checked by --verify.
SOLARIZED = {
    "light": {"bg": "#fdf6e3", "surface": "#eee8d5", "fg": "#073642", "muted": "#586e75",
              "line": "#657b83", "focus": "#6c71c4", "sel": "#d33682", "hair": "#93a1a1"},
    "dark": {"bg": "#002b36", "surface": "#073642", "fg": "#eee8d5", "muted": "#93a1a1",
             "line": "#839496", "focus": "#b58900", "sel": "#2aa198", "hair": "#586e75"},
}
CONTRAST_PAIRS = [  # (foreground, background, minimum, what)
    ("fg", "bg", 4.5, "body text"), ("fg", "surface", 4.5, "text on panels"),
    ("muted", "bg", 4.5, "secondary text"), ("line", "bg", 3.0, "control borders and tree lines"),
    ("line", "surface", 3.0, "control borders on panels"), ("focus", "bg", 3.0, "focus indicator"),
    ("focus", "surface", 3.0, "focus indicator on panels"), ("sel", "bg", 3.0, "selection outline"),
    ("sel", "surface", 3.0, "selection outline on panels"),
]

TOKEN_RE = re.compile(r"[A-Za-z]+(?:['’-][A-Za-z]+)*|\d+|[^\sA-Za-z\d]")
LABEL_RE = re.compile(r"^(?:(?P<fn>[A-Za-z+]+):)?(?P<cat>[A-Za-z]+)(?:#(?P<id>[a-z0-9-]+))?(?:\{(?P<attrs>[^{}]*)\})?$")


def load():
    read = lambda name: json.loads((DATA / name).read_text(encoding="utf-8"))
    return read("raw.json"), read("concepts.json"), read("examples.json"), read("meta.json")


def tokenize(text):
    tokens = []
    for m in TOKEN_RE.finditer(text):
        word = m.group()[0].isalnum()
        tokens.append({"t": m.group(), "k": "w" if word else "p"})
    return tokens


def lex(tree):
    """Split a bracketed tree into '[', ']' and atoms; braces keep their spaces."""
    out, i = [], 0
    while i < len(tree):
        c = tree[i]
        if c.isspace():
            i += 1
        elif c in "[]":
            out.append(c)
            i += 1
        else:
            j, depth = i, 0
            while j < len(tree) and (depth or not (tree[j].isspace() or tree[j] in "[]")):
                depth += {"{": 1, "}": -1}.get(tree[j], 0)
                j += 1
            out.append(tree[i:j])
            i = j
    return out


def parse_tree(ex):
    """Expand one example's bracketed tree into nested node dicts with token spans."""
    tokens = ex["tokens"]
    words = [i for i, t in enumerate(tokens) if t["k"] == "w"]
    atoms, pos, cursor, counter = lex(ex["tree"]), [0], [0], [0]
    where = f"example {ex['id']}"

    def node():
        assert atoms[pos[0]] == "[", f"{where}: expected '[' at atom {pos[0]}"
        pos[0] += 1
        m = LABEL_RE.match(atoms[pos[0]])
        assert m, f"{where}: bad label {atoms[pos[0]]!r}"
        pos[0] += 1
        n = {"id": m.group("id") or f"n{counter[0]}", "cat": m.group("cat")}
        counter[0] += 1
        if m.group("fn"):
            n["fn"] = m.group("fn")
        for item in (m.group("attrs") or "").split("|"):
            if item:
                key, _, value = item.partition("=")
                assert key in ("form", "cx", "anchor") and value, f"{where}: bad attribute {item!r}"
                n[key] = value.strip()
        kids = []
        while atoms[pos[0]] != "]":
            a = atoms[pos[0]]
            if a == "[":
                kids.append(node())
                continue
            pos[0] += 1
            if a.startswith("~"):
                assert not kids and atoms[pos[0]] == "]", f"{where}: a gap must be a node's only child"
                n["gap"], n["at"] = a[1:], (words[cursor[0] - 1] + 1 if cursor[0] else 0)
            else:
                assert cursor[0] < len(words), f"{where}: tree has extra word {a!r}"
                index = words[cursor[0]]
                assert tokens[index]["t"] == a, f"{where}: tree word {a!r} does not match {tokens[index]['t']!r}"
                assert not kids and atoms[pos[0]] == "]", f"{where}: word {a!r} must be a node's only child"
                n["word"] = index
                cursor[0] += 1
        pos[0] += 1
        if kids:
            n["children"] = kids
        return n

    root = node()
    assert pos[0] == len(atoms), f"{where}: trailing material after the root"
    assert cursor[0] == len(words), f"{where}: words not in the tree: {[tokens[i]['t'] for i in words[cursor[0]:]]}"
    annotate(root, tokens, where)
    return root


def annotate(root, tokens, where):
    """Add spans and head references, and validate structure."""
    ids = set()

    def walk(n, parent):
        assert n["id"] not in ids, f"{where}: duplicate node id {n['id']}"
        ids.add(n["id"])
        cat, fn = n["cat"], n.get("fn")
        if parent is None:
            assert fn is None, f"{where}: the root must not have a function"
        else:
            assert fn in FUNCTIONS, f"{where}: unknown function {fn!r} on {n['id']}"
            assert fn in ALLOWED[parent["cat"]], f"{where}: {fn} is not a function inside {parent['cat']} ({n['id']})"
        if "word" in n:
            assert cat in WORD_CATEGORIES, f"{where}: word node {n['id']} needs a word category, not {cat}"
            n["span"] = [n["word"], n["word"] + 1]
        elif "gap" in n:
            assert cat in PHRASE_CATEGORIES, f"{where}: gap {n['id']} needs a phrase category"
            n["span"] = None
        else:
            assert cat in PHRASE_CATEGORIES, f"{where}: phrase node {n['id']} needs a phrase category, not {cat}"
            kids = n.get("children")
            assert kids, f"{where}: phrase node {n['id']} has no children"
            for k in kids:
                walk(k, n)
            spans = [k["span"] for k in kids if k["span"]]
            assert spans, f"{where}: {n['id']} covers no words"
            for a, b in zip(spans, spans[1:]):
                assert a[1] <= b[0], f"{where}: children of {n['id']} overlap or are out of order"
                assert all(tokens[i]["k"] == "p" for i in range(a[1], b[0])), f"{where}: {n['id']} is not contiguous"
            n["span"] = [spans[0][0], spans[-1][1]]
            heads = [k for k in kids if k.get("fn") in HEAD_FUNCTIONS]
            assert len(heads) <= 1, f"{where}: {n['id']} has more than one head"
            if heads:
                head = heads[0]
                assert head["cat"] in HEADS.get(cat, set()), f"{where}: a {head['cat']} cannot head {cat} ({n['id']})"
                n["head"] = head["id"]
            elif cat not in ("Coordination", "Clause"):
                raise AssertionError(f"{where}: {cat} {n['id']} has no head")
            elif cat == "Coordination":
                assert len(kids) >= 2 and all(k["fn"] == "Coord" for k in kids), f"{where}: coordination needs two or more coordinates"
            else:
                assert any(k["fn"] == "Nucleus" for k in kids), f"{where}: clause {n['id']} has neither a head nor a nucleus"
        if fn == "Det":
            assert parent["cat"] == "NP", f"{where}: determiner outside an NP"
        if fn == "Marker":
            assert cat in ("Sbr", "Crd"), f"{where}: marker {n['id']} must be a subordinator or coordinator"
        if fn == "Supplement":
            assert "anchor" in n, f"{where}: supplement {n['id']} needs an anchor"

    walk(root, None)
    nodes = {}

    def index(n, parent):
        nodes[n["id"]] = (n, parent)
        for k in n.get("children", []):
            index(k, n)

    index(root, None)
    for nid, (n, parent) in nodes.items():
        if "gap" in n:
            assert n["gap"] in nodes and n["gap"] != nid, f"{where}: gap {nid} links to unknown node {n['gap']}"
        if "anchor" in n:
            assert n["anchor"] in nodes and n["anchor"] != nid, f"{where}: anchor of {nid} is unknown"
            assert n["fn"] == "Supplement", f"{where}: only supplements carry anchors"
        if n.get("fn") == "Nucleus":
            # The prenucleus is a sister of the nucleus, or (in a fused relative) fused with the head
            # of the NP that contains the relative clause.
            grand = nodes[parent["id"]][1]
            sisters = parent.get("children", []) + (grand.get("children", []) if grand else [])
            assert any(k.get("fn") in ("Prenucleus", "Head+Prenucleus") for k in sisters), f"{where}: nucleus {nid} without a prenucleus"
        if n.get("fn") in ("Prenucleus", "Head+Prenucleus"):
            gaps = [g for g, _ in nodes.values() if g.get("gap") == nid]
            assert len(gaps) == 1, f"{where}: prenucleus {nid} must be linked to exactly one gap"
    return nodes


def flatten(root):
    out = {}

    def walk(n, parent):
        out[n["id"]] = (n, parent)
        for k in n.get("children", []):
            walk(k, n)

    walk(root, None)
    return out


def text_of(ex, n):
    if n.get("span") is None:
        return "__"
    a, b = n["span"]
    return detokenize(ex["tokens"][a:b])


def detokenize(tokens):
    out = ""
    for t in tokens:
        if out and not (t["k"] == "p" and t["t"] in ".,!?;:"):
            out += " "
        out += t["t"]
    return out


def ref_label(chapters, ref):
    ch = chapters[ref[0]]
    if ref[1] is None:
        return {"chapter": ch["n"], "label": f"Ch. {ch['n']} {ch['title']}"}
    sec = next(s for s in ch["sections"] if s["id"] == ref[1])
    return {"chapter": ch["n"], "section": sec["id"], "label": f"Ch. {ch['n']} §{sec['id']} {sec['title']}", "page": sec["page"]}


def build_model(raw, concepts, examples, meta):
    chapters = {c["n"]: c for c in raw["chapters"]}
    exs = []
    for ex in examples["examples"]:
        ex = dict(ex)
        ex["tokens"] = tokenize(ex["text"])
        ex["tree"] = parse_tree(ex)
        exs.append(ex)
    by_ex = {e["id"]: e for e in exs}
    out_concepts = []
    for c in concepts["concepts"]:
        c = dict(c)
        c["location"] = ref_label(chapters, c["loc"])
        c["references"] = [c["location"]] + [ref_label(chapters, r) for r in c.get("refs", [])]
        c["items"] = [{"ex": e.split("@")[0], "node": e.split("@")[1]} for e in c["examples"]]
        for item in c["items"]:
            by_ex[item["ex"]].setdefault("concepts", [])
            if c["id"] not in by_ex[item["ex"]]["concepts"]:
                by_ex[item["ex"]]["concepts"].append(c["id"])
        out_concepts.append(c)
    concept_examples = {c["id"]: {i["ex"] for i in c["items"]} for c in out_concepts}
    contrasts = []
    for k in examples["contrasts"]:
        k = dict(k)
        k["concepts"] = [c for c, exset in concept_examples.items() if k["a"]["ex"] in exset or k["b"]["ex"] in exset]
        contrasts.append(k)
    return {"chapters": raw["chapters"], "concepts": out_concepts, "examples": exs, "contrasts": contrasts,
            "route": concepts["route"], "confusions": concepts["confusions"]}


def validate(model, raw, meta):
    """Integrity checks over the whole corpus. Returns a summary of counts."""
    chapters = model["chapters"]
    assert [c["n"] for c in chapters] == list(range(1, 21)), "chapters must be numbered 1-20"
    for a, b in zip(chapters, chapters[1:]):
        assert a["pages"][1] + 1 == b["pages"][0], f"chapter page ranges must be contiguous ({a['n']}, {b['n']})"
    for c in chapters:
        assert c["title"] and c["authors"], f"chapter {c['n']} needs a title and authors"
        ids = [s["id"] for s in c["sections"]]
        assert len(ids) == len(set(ids)), f"duplicate section in chapter {c['n']}"
        assert ids == sorted(ids, key=lambda s: [int(x) for x in s.split(".")]), f"sections out of order in chapter {c['n']}"
        pages = [s["page"] for s in c["sections"]]
        assert pages == sorted(pages), f"section pages out of order in chapter {c['n']}"
        assert all(c["pages"][0] <= p <= c["pages"][1] for p in pages), f"section page outside chapter {c['n']}"

    concepts, examples = model["concepts"], model["examples"]
    cids = [c["id"] for c in concepts]
    assert len(cids) == len(set(cids)), "duplicate concept id"
    eids = [e["id"] for e in examples]
    assert len(eids) == len(set(eids)), "duplicate example id"
    assert CONCEPT_RANGE[0] <= len(concepts) <= CONCEPT_RANGE[1], f"{len(concepts)} concepts, outside {CONCEPT_RANGE}"
    assert EXAMPLE_RANGE[0] <= len(examples) <= EXAMPLE_RANGE[1], f"{len(examples)} examples, outside {EXAMPLE_RANGE}"
    names = {c["name"].lower() for c in concepts}
    assert len(names) == len(concepts), "concept names must be unique"
    by_ex = {e["id"]: e for e in examples}
    nodes = {e["id"]: flatten(e["tree"]) for e in examples}
    used = set()
    seen_alias = {}
    for c in concepts:
        assert re.fullmatch(r"[a-z]+(?:-[a-z]+)*", c["id"]), f"bad concept id {c['id']}"
        assert c["orientation"] and c["name"], c["id"]
        assert c["items"], f"concept {c['id']} has no examples"
        assert len({i["ex"] for i in c["items"]}) == len(c["items"]), f"concept {c['id']} lists an example twice"
        for item in c["items"]:
            assert item["ex"] in by_ex, f"concept {c['id']} cites unknown example {item['ex']}"
            assert item["node"] in nodes[item["ex"]], f"concept {c['id']} cites unknown node {item['ex']}@{item['node']}"
            used.add(item["ex"])
        for r in c["related"]:
            assert r in cids and r != c["id"], f"concept {c['id']} has a bad related link {r}"
        for a in c.get("aliases", []):
            assert a.lower() not in names, f"alias {a!r} of {c['id']} collides with a canonical concept name"
            seen_alias.setdefault(a.lower(), []).append(c["id"])
    unused = set(eids) - used
    assert not unused, f"examples not used by any concept: {sorted(unused)}"
    for e in examples:
        assert e["explanation"].strip(), f"example {e['id']} needs an explanation"
        assert re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", e["id"]), f"bad example id {e['id']}"
        assert e["focus"] in nodes[e["id"]], f"example {e['id']} focus is not a node"
        if "predict" in e:
            assert e["predict"]["node"] in nodes[e["id"]], f"example {e['id']} prediction node is unknown"
        covered = sorted(n["word"] for n, _ in nodes[e["id"]].values() if "word" in n)
        assert covered == [i for i, t in enumerate(e["tokens"]) if t["k"] == "w"], f"example {e['id']}: leaves do not cover every word once"
        assert e["tree"]["span"][0] == 0 or all(t["k"] == "p" for t in e["tokens"][: e["tree"]["span"][0]]), e["id"]
    texts = {}
    for e in examples:
        texts.setdefault(e["text"], []).append(e["id"])
    for text, ids in texts.items():
        if len(ids) > 1:  # identical text is allowed only for a declared structural ambiguity (a contrast)
            assert any({k["a"]["ex"], k["b"]["ex"]} == set(ids) for k in model["contrasts"]), f"duplicate example text {text!r} without a contrast"
    kids = [k["id"] for k in model["contrasts"]]
    assert len(kids) == len(set(kids)), "duplicate contrast id"
    for k in model["contrasts"]:
        for side in ("a", "b"):
            assert k[side]["ex"] in by_ex and k[side]["node"] in nodes[k[side]["ex"]], f"contrast {k['id']} has a bad target"
        assert k["a"]["ex"] != k["b"]["ex"], f"contrast {k['id']} compares an example with itself"
        assert k["concepts"], f"contrast {k['id']} is not reachable from any concept"
        assert k["explanation"].strip()
    route = [r["concept"] for r in model["route"]]
    assert ROUTE_RANGE[0] <= len(route) <= ROUTE_RANGE[1], "beginner route must have 10-12 stops"
    assert len(set(route)) == len(route) and all(r in cids for r in route), "route stops must be unique concepts"
    for f in model["confusions"]:
        assert f["concept"] in cids, f"confusion {f['label']} points to unknown concept"
        concept = next(c for c in concepts if c["id"] == f["concept"])
        assert f["example"] in {i["ex"] for i in concept["items"]}, f"confusion {f['label']} example is not in its concept"
    assert set(meta) >= {"slug", "source_url", "fetched", "key_file_used", "assumptions"}
    assert meta["slug"] == SLUG and re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["fetched"])
    covered_chapters = {c["location"]["chapter"] for c in concepts}
    return {"concepts": len(concepts), "examples": len(examples), "contrasts": len(model["contrasts"]),
            "chapters": len(covered_chapters), "nodes": sum(len(v) for v in nodes.values()), "aliases": len(seen_alias)}


def luminance(hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    rgb = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def contrast(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def check_contrast():
    rows = []
    for mode, pal in SOLARIZED.items():
        for fg, bg, minimum, what in CONTRAST_PAIRS:
            ratio = contrast(pal[fg], pal[bg])
            assert ratio >= minimum, f"{mode} {what}: {pal[fg]} on {pal[bg]} is {ratio:.2f}:1, below {minimum}:1"
            rows.append((mode, what, round(ratio, 2)))
    return rows


# ---------------------------------------------------------------- rendering

def page_data(model, raw, meta):
    labels = {"functions": FUNCTIONS, "categories": {**WORD_CATEGORIES, **PHRASE_CATEGORIES}, "notation": SPECIAL_NOTATION}
    examples = []
    for e in model["examples"]:
        item = {k: e[k] for k in ("id", "text", "tokens", "tree", "focus", "concepts", "explanation")}
        for k in ("context", "usage", "predict"):
            if k in e:
                item[k] = e[k]
        examples.append(item)
    concepts = []
    for c in model["concepts"]:
        item = {k: c[k] for k in ("id", "name", "orientation", "items", "related", "references")}
        for k in ("aliases", "abbr", "note"):
            if c.get(k):
                item[k] = c[k]
        concepts.append(item)
    return {
        "title": DISPLAY_TITLE, "key": KEY_MESSAGE, "start": START_EXAMPLE,
        "book": raw["book"], "verification": raw["verification"],
        "chapters": [{"n": c["n"], "title": c["title"], "authors": c["authors"], "pages": c["pages"],
                      "sections": c["sections"]} for c in model["chapters"]],
        "concepts": concepts, "examples": examples, "contrasts": model["contrasts"],
        "route": model["route"], "confusions": model["confusions"], "labels": labels,
        "checked": meta["fetched"], "assumptions": meta["assumptions"],
    }


def tree_lines(ex, n, depth=0):
    """Static nested list for the no-JavaScript fallback."""
    fn = f"{FUNCTIONS[n['fn']]}: " if n.get("fn") else ""
    cat = {**WORD_CATEGORIES, **PHRASE_CATEGORIES}[n["cat"]]
    body = f"<span class=\"lbl\">{escape(fn + cat)}</span> <q>{escape(text_of(ex, n))}</q>"
    kids = "".join(tree_lines(ex, k, depth + 1) for k in n.get("children", []))
    return f"<li>{body}{'<ul>' + kids + '</ul>' if kids else ''}</li>"


def static_index(model):
    chapters = {}
    for c in model["concepts"]:
        chapters.setdefault(c["location"]["chapter"], []).append(c)
    rows = []
    for ch in model["chapters"]:
        concepts = chapters.get(ch["n"])
        head = f"Chapter {ch['n']}. {escape(ch['title'])} <small>pp. {ch['pages'][0]}–{ch['pages'][1]}</small>"
        if not concepts:
            rows.append(f"<li class=\"muted\">{head} <small>— not yet expanded</small></li>")
            continue
        items = "".join(
            f"<li><strong>{escape(c['name'])}</strong> <small>{escape(c['location']['label'])}</small><br>{escape(c['orientation'])}</li>"
            for c in concepts)
        rows.append(f"<li>{head}<ul>{items}</ul></li>")
    return "".join(rows)


def render(model, raw, meta, tokens):
    data = page_data(model, raw, meta)
    css = CSS_TEMPLATE.read_text(encoding="utf-8")
    replacements = {"font_sans": tokens["font_sans"], "font_mono": tokens["font_mono"], "radius": tokens["radius"],
                    "content_width": tokens["content_width"]}
    for i, step in enumerate(tokens["spacing_rem"]):
        replacements[f"s{i}"] = f"{step}rem"
    for mode, pal in SOLARIZED.items():
        for k, v in pal.items():
            replacements[f"{mode}_{k}"] = v
    for key, val in replacements.items():
        css = css.replace(f"%%{key}%%", val)
    assert "%%" not in css, "unreplaced CSS token"
    js = JS_TEMPLATE.read_text(encoding="utf-8")
    logic = LOGIC_TEMPLATE.read_text(encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=False, indent=1).replace("</", "<\\/")
    start = next(e for e in model["examples"] if e["id"] == START_EXAMPLE)
    book = raw["book"]
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">
<title>{escape(TITLE)}</title>
<meta name="description" content="{escape(DESCRIPTION)}">
<link rel="canonical" href="{CANONICAL}">
<meta property="og:title" content="{escape(TITLE)}">
<meta property="og:description" content="{escape(DESCRIPTION)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{CANONICAL}">
<style>{css}</style></head>
<body><a class="skip" href="#content">Skip to the content</a>
<header class="top"><p class="back"><a href="/visuals">← Visuals</a></p><h1>{escape(DISPLAY_TITLE)}</h1><p class="sub">{SUBTITLE}</p><p class="key" id="key-message">{escape(KEY_MESSAGE)}</p></header>
<div id="content" tabindex="-1">
<div id="static" class="static">
<p class="nojs">You are seeing the static version. Selecting words and phrases, unfolding structure, trees, contrasts, search and shareable links need JavaScript; everything below is readable without it.</p>
<section aria-labelledby="static-start"><h2 id="static-start">Start here: {escape(start['text'])}</h2>
<p>{escape(start['explanation'])}</p>
<ul class="static-tree">{tree_lines(start, start['tree'])}</ul></section>
<section aria-labelledby="static-index"><h2 id="static-index">Chapters and concepts</h2>
<p>Chapter titles follow the book. Chapters without concepts in this version are marked as not yet expanded.</p>
<ol class="static-index">{static_index(model)}</ol></section>
</div>
<div id="app" class="app" hidden></div>
</div>
<footer class="foot"><p><strong>Source.</strong> Terminology and analytical framework follow <cite>{escape(book['title'])}</cite> by {escape(book['authors'])} ({escape(book['publisher'])}, {book['year']}). Teaching examples and explanations are original illustrative examples written for this page; they are not taken from the book. Analyses follow the book's framework as known to the author and have not yet been checked against the book's text. Chapter and section references were checked against the publisher's contents pages on {escape(meta['fetched'])}.</p><p><a href="/visuals">Back to all visuals</a></p></footer>
<script type="application/json" id="eg-data">{payload}</script>
<script id="eg-logic">{logic}</script>
<script id="eg-ui">{js}</script>
</body></html>
'''


def verify_page(html, model):
    stripped = re.sub(r"<script type=\"application/json\"[\s\S]*?</script>", "", html)
    assert not re.search(r"""(?:src|href)=["'](?:https?:)?//""", stripped.replace(f'href="{CANONICAL}"', "")), "external asset reference"
    assert not re.search(r"@import|url\(\s*['\"]?(?:https?:)?//", stripped), "external CSS import"
    assert not re.search(r"\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|sendBeacon)\s*\(", stripped), "network API in page script"
    assert not re.search(r"\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b", stripped), "page must not rely on storage or cookies"
    assert "<script src" not in html and "<link rel=\"stylesheet\"" not in html
    assert html.count("<title>") == 1 and f"<title>{escape(TITLE)}</title>" in html
    assert f'<meta name="description" content="{escape(DESCRIPTION)}">' in html
    for prop in ("og:title", "og:description", "og:type", "og:url"):
        assert f'property="{prop}"' in html, prop
    assert "og:image" not in html and f'<link rel="canonical" href="{CANONICAL}">' in html
    assert 'href="/visuals"' in html and escape(KEY_MESSAGE) in html
    assert len(html.encode("utf-8")) < SIZE_BUDGET, "page exceeds the 1 MB budget"
    assert html.count("mc?.registerTool") == 3 and len(re.findall(r"readOnlyHint:\s*true", html)) == 3
    data = json.loads(re.search(r'<script type="application/json" id="eg-data">([\s\S]*?)</script>', html).group(1).replace("<\\/", "</"))
    assert [e["id"] for e in data["examples"]] == [e["id"] for e in model["examples"]]
    for e in data["examples"]:
        assert e["tokens"] == tokenize(e["text"]), f"token boundaries changed for {e['id']}"
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    raw, concepts, examples, meta = load()
    tokens = json.loads(TOKENS.read_text(encoding="utf-8"))
    model = build_model(raw, concepts, examples, meta)
    summary = validate(model, raw, meta)
    rows = check_contrast()
    html = render(model, raw, meta, tokens)
    assert html == render(build_model(raw, concepts, examples, meta), raw, meta, tokens), "render is not deterministic"
    if not args.verify:
        VIZ.parent.mkdir(parents=True, exist_ok=True)
        VIZ.write_text(html, encoding="utf-8")
        GALLERY.write_text(render_gallery(ROOT), encoding="utf-8")
    else:
        assert VIZ.read_text(encoding="utf-8") == html, "viz/english-grammar/index.html is stale: rerun the builder"
        assert GALLERY.read_text(encoding="utf-8") == render_gallery(ROOT), "index.html gallery is stale"
    verify_page(VIZ.read_text(encoding="utf-8"), model)
    size = len(html.encode("utf-8"))
    print(f"verified: {summary['concepts']} concepts across {summary['chapters']} chapters, {summary['examples']} examples "
          f"({summary['nodes']} analysis nodes), {summary['contrasts']} contrasts, {len(rows)} contrast pairs, "
          f"{size / 1000:.0f} kB, zero external requests")


if __name__ == "__main__":
    main()
