"""TheoremGraph evidence (spec sections 3.4 and 17): formal-to-informal statement matches.

Source: the Hugging Face dataset uw-math-ai/theorem-matching at a pinned revision (CC-BY-SA-4.0), from the
TheoremGraph project of the TheoremSearch group. Each row pairs a mathlib declaration with an arXiv statement,
with labels from two model judges (gpt54_label, deepseek_label: exact, inexact, wrong, unjudgeable).

Rule (theoremgraph-rule/1): a row is classification evidence for a consolidated result when
  - its formal_decl is one of the result's declarations, and
  - both model labels are "exact" or "inexact" (the two judges agree that the paper states the result).
The arXiv paper's own categories (from the TheoremSearch paper table) then count as source-assigned paper tags
next to the result's inferred categories; they never replace the inferred theorem categories (spec 3.4).

The larger uw-math-ai/math-graph dependency dataset is cited as the reference dependency-graph visualisation
(prerequisite evidence, spec inbox 003); the pipeline uses mathlib's own dependency graph for formal edges.
"""
import csv
from collections import defaultdict

from common import STAGE, WORK, pins, read_json, read_jsonl, sha256_file

RULE = "theoremgraph-rule/1"
MATCHING = {"repo": "uw-math-ai/theorem-matching", "revision": pins()["theoremgraph"]["revision"],
            "file": "theorem_matching.csv", "license": "CC-BY-SA-4.0",
            "url": "https://huggingface.co/datasets/uw-math-ai/theorem-matching"}
GRAPH = {"repo": "uw-math-ai/math-graph", "revision": "ced4ca9de1bd9e5b67aa09d1d515e270e438fa1e",
         "license": "CC-BY-4.0", "url": "https://huggingface.co/datasets/uw-math-ai/math-graph",
         "viewer": "https://www.theoremsearch.com/theorem-graph", "use": "cited prerequisite visualisation; not downloaded"}
GOOD = {"exact", "inexact"}


def build():
    path = WORK / "theoremgraph" / MATCHING["file"]
    owner = defaultdict(set)
    for r in read_json(STAGE / "consolidated.json")["results"]:
        for d in r["decls"]:
            owner[d["decl"]].add(r["id"])
    papers = {p["paper_id"].rsplit("v", 1)[0]: p for p in read_jsonl(STAGE / "ts-papers.jsonl.gz")}
    csv.field_size_limit(1 << 30)
    rows, seen, total = [], set(), 0
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            total += 1
            if row["formal_decl"] not in owner:
                continue
            if row["gpt54_label"] not in GOOD or row["deepseek_label"] not in GOOD:
                continue
            for rid in owner[row["formal_decl"]]:
                key = (rid, row["arxiv_id"])
                if key in seen:
                    continue
                seen.add(key)
                p = papers.get(row["arxiv_id"], {})
                rows.append({"result": rid, "decl": row["formal_decl"], "paper": row["arxiv_id"],
                             "title": row["paper_title"], "ref": row["informal_ref"], "labels":
                             [row["gpt54_label"], row["deepseek_label"]], "sim": float(row["sim"]),
                             "cats": p.get("categories", []), "primary": p.get("primary_category")})
    return {"rule": RULE, "matching": {**MATCHING, "sha256": sha256_file(path), "rows": total},
            "graph": GRAPH, "links": rows}


if __name__ == "__main__":
    out = build()
    print(len(out["links"]), len({r["result"] for r in out["links"]}))
