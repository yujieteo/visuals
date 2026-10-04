"""Authoring packets (tl-packets/1): what a proof author reads for each theorem, Lean first.

Inputs: viz/theorem-explorer/raw.json (the source catalog: results, statements, evidence, key concepts, relations
and the concept catalog) and the pinned mathlib4 checkout at <work>/mathlib4 (the theorem-explorer pipeline's work
directory, build/te-work by default; TE_WORK moves it).

For each scored result (a named theorem, lemma, inequality, identity, principle, formula, criterion, proved
conjecture, construction, classification or other result) the packet holds:
  id, name, type, aliases, reader level, arXiv categories
  sources     at most two quoted source statements (Wikipedia lead, nLab Idea paragraph or a mathlib list entry)
  lean        the formal declaration (name, signature, conclusion, explicit hypotheses, typeclasses, module, file and
              line range at the pinned commit) and the declaration's text from that file, at most 120 lines: the Lean
              proof the author reads first
  concepts    the key concepts the result names, each with its catalog concept id when the catalog has one
  prereqs     the judged prerequisite results; related: special cases, generalizations, consequences, equivalents
  explanation the explorer's judge note on the result

Outputs in <out> (default build/tl-work): packets/batch-NN.json (N per batch, in the explorer's default score
order, so the most useful results come first), concept-index.tsv (every catalog concept: id, name, kind, level,
aliases; authors search it for concept ids) and result-index.tsv (every catalog record: id, name, type; authors
search it for the lemmas a step uses).

Concept packets (--concepts FILE: one concept id per line) go to concept-packets/batch-NN.json, 120 per batch:
id, name, kind, level, aliases, the catalog's definition text and its basis, the catalog prerequisites, the concepts
that need it and the results that name it, for the concept author (concept-author-prompt.md).

--marked writes concept packets for every catalog concept that the authored theorem files mark ([word](c:id)),
most used first, leaving out concepts already answered in data/learning/concepts/ and the theorem files' own
new_concepts.

Run: python3 pipeline/packets.py [--per 30] [--out build/tl-work] [--concepts ids.txt | --marked]
"""
import argparse
import base64
import gzip
import json
import os
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
VISUAL = HERE.parent
ROOT = VISUAL.parents[1]
EXPLORER = ROOT / "viz" / "theorem-explorer" / "raw.json"
WORK = Path(os.environ.get("TE_WORK", ROOT / "build" / "te-work"))
RESULT_TYPES = {"theorem", "lemma", "inequality", "identity", "principle", "formula", "criterion", "conjecture-proved",
                "construction", "classification", "other-result"}
LEVELS = ["school", "undergrad", "graduate", "research"]
_URL = re.compile(r"/blob/([0-9a-f]{40})/(.+?\.lean)#L(\d+)-L(\d+)$")
PRESET = [25, 25, 20, 15, 5, 5, 5]


def unpack(raw, name):
    return json.loads(gzip.decompress(base64.b64decode(raw["packs"][name]["gz"])))


def balanced(s):
    """The explorer's balanced aggregate, or None when a component is unknown (te-rubric/1)."""
    if not all(c.isdigit() for c in s):
        return None
    return sum(w * int(c) / 4 for w, c in zip(PRESET, s))


def lean_text(url, mathlib):
    """The declaration's lines at the pinned commit, from a formal-declaration evidence URL."""
    m = _URL.search(url or "")
    if not m:
        return None, None
    path = mathlib / m[2]
    if not path.is_file():
        return {"file": m[2], "lines": [int(m[3]), int(m[4])], "commit": m[1]}, None
    lines = path.read_text(encoding="utf-8").split("\n")
    a, b = int(m[3]), int(m[4])
    # The recorded range can end at the statement; read on to the next blank line that closes the proof.
    end = b
    while end < len(lines) and end - a < 120 and lines[end].strip() != "":
        end += 1
    text = "\n".join(lines[a - 1:end])
    return {"file": m[2], "lines": [a, b], "commit": m[1]}, text


def build(per, out):
    raw = json.loads(EXPLORER.read_text(encoding="utf-8"))
    core, det, cpack = unpack(raw, "core"), unpack(raw, "detail"), unpack(raw, "concepts")
    rows = core["rows"]
    tax = raw["taxonomy"]["categories"]
    crows = cpack["rows"]
    rc = cpack["rc"]
    rel_by = {}
    for rel in core["relations"]:
        if rel["type"] in ("special-case", "generalization", "consequence", "equivalent", "prerequisite"):
            rel_by.setdefault(rel["source"], []).append((rel["type"], "out", rel["target"]))
            rel_by.setdefault(rel["target"], []).append((rel["type"], "in", rel["source"]))
    mathlib = WORK / "mathlib4"
    order = [i for i, r in enumerate(rows) if r["t"] in RESULT_TYPES]
    order.sort(key=lambda i: (-(balanced(rows[i]["s"]) or -1), rows[i]["n"].lower(), i))
    packets = []
    for i in order:
        r, x = rows[i], det[i]
        srcs = [e for e in x["evs"] if e["kind"] == "source statement"][:2]
        formal = next((e for e in x["evs"] if e["kind"] == "formal declaration"), None)
        lean = None
        if formal and r["decl"]:
            where, text = lean_text(formal["url"], mathlib)
            lean = {"decl": r["decl"], "signature": x["sig"], "conclusion": x["concl"], "hypotheses": x["hyps"],
                    "typeclasses": sorted(set(x["cls"] or [])), "module": x["mod"], **(where or {}), "text": text,
                    "related_decls": x["decls"][:8]}
        rels = []
        for typ, direction, j in rel_by.get(i, []):
            if typ == "prerequisite":
                continue
            phrase = {("special-case", "out"): "is a special case of", ("special-case", "in"): "has as a special case",
                      ("generalization", "out"): "generalizes", ("generalization", "in"): "is generalized by",
                      ("consequence", "out"): "is a consequence of", ("consequence", "in"): "has as a consequence",
                      ("equivalent", "out"): "is equivalent to", ("equivalent", "in"): "is equivalent to"}[(typ, direction)]
            rels.append({"relation": phrase, "id": rows[j]["id"], "name": rows[j]["n"]})
        packets.append({
            "id": r["id"], "name": r["n"], "type": r["t"], "aliases": x["al"], "level": LEVELS[r["lv"]],
            "categories": [tax[k][0] for k in r["cat"]],
            "sources": [{"text": e["claim"][:700], "where": e["location"], "url": e["url"]} for e in srcs],
            "lean": lean,
            "concepts": [{"name": c, "id": next((crows[j]["id"] for j in rc[i] if crows[j]["n"].lower() == c.lower()), None)}
                         for c in (x["cn"] or [])],
            "concept_ids": [crows[j]["id"] for j in rc[i]],
            "prereqs": [{"id": rows[j]["id"], "name": rows[j]["n"]} for j in sorted(set(r["pre"])) if j != i],
            "related": rels[:12],
            "explanation": x["why"],
        })
    out.mkdir(parents=True, exist_ok=True)
    (out / "packets").mkdir(exist_ok=True)
    n = 0
    for k in range(0, len(packets), per):
        (out / "packets" / f"batch-{k // per:02d}.json").write_text(json.dumps(packets[k:k + per], ensure_ascii=False, indent=1), encoding="utf-8")
        n += 1
    with open(out / "concept-index.tsv", "w", encoding="utf-8") as f:
        f.write("id\tname\tkind\tlevel\taliases\n")
        for c, t in zip(crows, cpack["text"]):
            lv = LEVELS[c["lv"]] if c["lv"] is not None else ""
            f.write(f"{c['id']}\t{c['n']}\t{c['k']}\t{lv}\t{'; '.join(t.get('al') or [])}\n")
    with open(out / "result-index.tsv", "w", encoding="utf-8") as f:
        f.write("id\tname\ttype\n")
        for r in rows:
            f.write(f"{r['id']}\t{r['n']}\t{r['t']}\n")
    return {"packets": len(packets), "batches": n, "with_lean_text": sum(1 for p in packets if p["lean"] and p["lean"]["text"])}


def concept_packets(ids, out, per=120):
    raw = json.loads(EXPLORER.read_text(encoding="utf-8"))
    core, cpack = unpack(raw, "core"), unpack(raw, "concepts")
    rows, crows, texts = core["rows"], cpack["rows"], cpack["text"]
    by = {c["id"]: i for i, c in enumerate(crows)}
    needs = {}
    for i, c in enumerate(crows):
        for j in c["pre"]:
            needs.setdefault(j, []).append(i)
    packets = []
    for cid in ids:
        i = by.get(cid)
        if i is None:
            continue
        c, t = crows[i], texts[i]
        packets.append({
            "id": cid, "name": c["n"], "kind": c["k"], "level": LEVELS[c["lv"]] if c["lv"] is not None else None,
            "aliases": t.get("al") or [], "catalog_definition": t.get("def"), "definition_basis": t.get("defb"),
            "catalog_prerequisites": [{"id": crows[j]["id"], "name": crows[j]["n"]} for j in c["pre"]],
            "needed_by": [{"id": crows[j]["id"], "name": crows[j]["n"]} for j in needs.get(i, [])[:10]],
            "named_by_results": [rows[j]["n"] for j in c["rx"][:5]],
            "nlab_page": c["nl"], "mathlib": c["decl"],
        })
    (out / "concept-packets").mkdir(parents=True, exist_ok=True)
    for k in range(0, len(packets), per):
        (out / "concept-packets" / f"batch-{k // per:02d}.json").write_text(json.dumps(packets[k:k + per], ensure_ascii=False, indent=1), encoding="utf-8")
    return {"concept_packets": len(packets), "batches": (len(packets) + per - 1) // per}


def marked_concepts():
    """Catalog concept ids marked in the authored theorem files, most used first, without answered ones."""
    learning = VISUAL / "data" / "learning"
    count, new = {}, set()
    for f in sorted((learning / "theorems").glob("*.json")):
        text = f.read_text(encoding="utf-8")
        for cid in re.findall(r"\]\((c:[^)\s]+)\)", text):
            count[cid] = count.get(cid, 0) + 1
        data = json.loads(text)
        for t in data["theorems"] if isinstance(data, dict) else data:
            new.update(c.get("id") for c in t.get("new_concepts") or [])
    done = set()
    for f in sorted((learning / "concepts").glob("*.json")) if (learning / "concepts").exists() else []:
        data = json.loads(f.read_text(encoding="utf-8"))
        done.update(c.get("id") for c in (data["concepts"] if isinstance(data, dict) else data))
    return sorted((c for c in count if c not in new and c not in done), key=lambda c: (-count[c], c))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--per", type=int, default=30)
    ap.add_argument("--out", type=Path, default=ROOT / "build" / "tl-work")
    ap.add_argument("--concepts", type=Path, help="write concept packets for the ids in this file instead")
    ap.add_argument("--marked", action="store_true", help="write concept packets for the concepts the proofs mark")
    a = ap.parse_args()
    if a.marked:
        print(concept_packets(marked_concepts(), a.out))
    elif a.concepts:
        print(concept_packets([x.strip() for x in a.concepts.read_text().split() if x.strip()], a.out))
    else:
        print(build(a.per, a.out))
