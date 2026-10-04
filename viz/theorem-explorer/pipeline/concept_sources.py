"""Concept sources (tc-sources/1): the candidate mathematical concepts and their source records.

A concept is a mathematical notion that results are stated about: a definition, a structure or an object
(Hilbert space, martingale, sheaf), not a result. The Theorem Explorer already lists, for each judged result, its
key concepts (the detail pack's `cn`); this stage gathers those names with three more public sources, all at the
pins of data/sources/pins.json:

  results     the key concepts of the catalog results in the committed raw.json: how many results name each one
  undergrad   a leaf of mathlib's docs/undergrad.yaml whose target is a mathlib definition, class, structure,
              abbreviation or inductive type (not a theorem): a concept with its formal declaration
  overview    the same for docs/overview.yaml
  nlab        every nLab page (not only result pages): its name, the first paragraph of its Idea section, and
              how many other pages link to it (backlinks, a measure of how central the page is in the nLab)

The mathlib declaration index is textual (tc-decl-text/1): each `def`, `class`, `structure`, `abbrev` and
`inductive` line in Mathlib/, with the namespaces open at that line, its module, its line and the first sentence
of its doc comment. `files` counts the Mathlib files that contain the last component of the name as a whole
identifier: a textual measure of use, not the Lean dependency count of the result catalog.

Output: <work>/stage/concept-candidates.json (the candidate names with their counts and links),
<work>/stage/mathlib-decls.json.gz (the declaration index) and <work>/stage/nlab-pages.json.gz.
"""
import base64
import gzip
import json
import os
import re
from collections import Counter, defaultdict

from common import STAGE, VISUAL, WORK
from names import normalize, read_overview_yaml

RULE = "tc-sources/1"
DECL_RULE = "tc-decl-text/1"
_DECL = re.compile(r"^(?:@\[[^\]]*\]\s*)?(?:(?:noncomputable|protected|private|partial|unsafe)\s+)*"
                   r"(def|class|structure|abbrev|inductive)\s+([A-Za-z_][\w.'₀-₉]*)", re.M)
_NS = re.compile(r"^(namespace|section|end)\b\s*([\w.]*)", re.M)
_DOC = re.compile(r"/--\s*(.*?)-/", re.S)
_IDENT = re.compile(r"[A-Za-z_][\w'₀-₉]*")
_LINK = re.compile(r"\[\[(?!!)([^\]|]+)(?:\|[^\]]*)?\]\]")


def first_sentence(doc):
    doc = re.sub(r"\s+", " ", doc or "").strip()
    m = re.match(r"(.{20,400}?[.!?])(\s|$)", doc)
    return (m[1] if m else doc[:300]).strip()


def mathlib_decls(root):
    """name -> {k, mod, line, doc} for every concept-like declaration, and the identifier file counts."""
    decls, files = {}, Counter()
    base = root / "Mathlib"
    for dirpath, _, names in os.walk(base):
        for fn in names:
            if not fn.endswith(".lean"):
                continue
            path = os.path.join(dirpath, fn)
            text = open(path, encoding="utf-8").read()
            mod = os.path.relpath(path, root)[:-5].replace(os.sep, ".")
            files.update(set(_IDENT.findall(text)))
            events = sorted([(m.start(), "ns", m) for m in _NS.finditer(text)] +
                            [(m.start(), "decl", m) for m in _DECL.finditer(text)], key=lambda e: e[0])
            stack = []
            for pos, kind, m in events:
                if kind == "ns":
                    word, arg = m[1], m[2]
                    if word in ("namespace", "section"):
                        stack.append((word, arg))
                    elif stack:
                        stack.pop()
                    continue
                name = m[2]
                if name.startswith("_") or name.split(".")[-1].startswith("_"):
                    continue
                ns = ".".join(a for w, a in stack if w == "namespace" and a)
                full = f"{ns}.{name}" if ns and not name.startswith("_root_.") else name.replace("_root_.", "")
                before = text[max(0, pos - 2000):pos]
                d = list(_DOC.finditer(before))
                # The doc comment just above the declaration (attributes may sit between them).
                doc = d[-1][1] if d and len(before[d[-1].end():].strip()) < 200 else ""
                if full not in decls:
                    decls[full] = {"k": m[1], "mod": mod, "line": text.count("\n", 0, pos) + 1,
                                   "doc": first_sentence(doc)}
    for full, d in decls.items():
        d["files"] = files.get(full.split(".")[-1], 0)
    return decls


def nlab_pages(root):
    pages, links = {}, Counter()
    for dirpath, _, names in os.walk(root / "pages"):
        if "name" not in names or "content.md" not in names:
            continue
        pid = int(os.path.basename(dirpath))
        name = open(os.path.join(dirpath, "name"), encoding="utf-8").read().strip()
        content = open(os.path.join(dirpath, "content.md"), encoding="utf-8").read()
        out = {normalize(l.strip()) for l in _LINK.findall(content)}
        links.update(out)
        cats = [c.strip() for line in re.findall(r"^category:\s*(.*)$", content, re.M) for c in line.split(",")]
        pages[pid] = {"name": name, "cats": cats, "content": content}
    from nlab import idea_passage
    rows = {}
    for pid, p in pages.items():
        key = normalize(p["name"])
        if key in rows and rows[key]["bytes"] >= len(p["content"]):
            continue
        rows[key] = {"page": pid, "name": p["name"], "cats": p["cats"], "bytes": len(p["content"]),
                     "backlinks": links.get(key, 0), "idea": idea_passage(p["content"])[:600]}
    return rows


def result_concepts(raw):
    packs = raw["packs"]
    core = json.loads(gzip.decompress(base64.b64decode(packs["core"]["gz"])))
    det = json.loads(gzip.decompress(base64.b64decode(packs["detail"]["gz"])))
    by = defaultdict(list)
    for r, x in zip(core["rows"], det):
        if r["t"].startswith("not-a-result"):
            continue
        for c in x.get("cn") or []:
            by[normalize(c)].append(r["id"])
    return by


def build():
    mroot, nroot = WORK / "mathlib4", WORK / "nlab-content"
    raw = json.loads((VISUAL / "raw.json").read_text(encoding="utf-8"))
    decls = mathlib_decls(mroot)
    nlab = nlab_pages(nroot)
    res = result_concepts(raw)
    cands = defaultdict(lambda: {"names": set(), "results": [], "mathlib": [], "lists": []})
    for key, ids in res.items():
        cands[key]["results"] = sorted(set(ids))
    for lst in ("undergrad", "overview"):
        for path, name, target in read_overview_yaml(mroot / "docs" / f"{lst}.yaml"):
            if target in decls:
                key = normalize(re.sub(r"\$[^$]*\$", "", name))
                if not key:
                    continue
                c = cands[key]
                c["names"].add(name)
                c["lists"].append({"list": lst, "path": path})
                if target not in c["mathlib"]:
                    c["mathlib"].append(target)
    out = []
    for key, c in cands.items():
        n = nlab.get(key)
        out.append({"key": key, "results": c["results"], "mathlib": c["mathlib"],
                    "lists": c["lists"], "nlab": n["page"] if n else None, "nlab_backlinks": n["backlinks"] if n else 0})
    out.sort(key=lambda c: (-len(c["results"]) - 3 * bool(c["mathlib"]) - (c["nlab_backlinks"] > 50), c["key"]))
    STAGE.mkdir(parents=True, exist_ok=True)
    (STAGE / "concept-candidates.json").write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    with gzip.open(STAGE / "mathlib-decls.json.gz", "wt", encoding="utf-8") as f:
        json.dump(decls, f, ensure_ascii=False, separators=(",", ":"))
    with gzip.open(STAGE / "nlab-pages.json.gz", "wt", encoding="utf-8") as f:
        json.dump(nlab, f, ensure_ascii=False, separators=(",", ":"))
    return {"rule": RULE, "decl_rule": DECL_RULE, "candidates": len(out), "decls": len(decls), "nlab_pages": len(nlab)}


if __name__ == "__main__":
    print(build())
