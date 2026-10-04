"""Snapshot assembly (spec sections 4, 5, 9, 10, 11.3, 13 step 6 and 14): every stage's output -> the viewer's data.

Inputs: <work>/stage/ (evidence, consolidated, mathlib, uses, restatements, theoremgraph, ts-papers), the judge's
answers (judge.collect, both assessments), and the committed data/ (rubric, taxonomy, cases, sources).

Output: <work>/out/raw.json, which run.py copies to viz/theorem-explorer/raw.json, and <work>/out/corpus.json.gz,
the pack of every kept mathlib theorem that fullbuild.py adds for the full-corpus file. raw.json holds the small
metadata as plain JSON and the catalog as gzip+base64 packs that the page decodes when it needs them:

  core     every named record: identity, type, scores (both assessments), categories, level, effort bands,
           measurements, prerequisite and relation indices, use records for the histories, search text
  detail   per record: aliases, explanations, statements, evidence records, concepts; decoded on first use

Measurement rules (te-measure/1 and te-text-tokens/1):
  statement length  the Lean statement tokens of the primary declaration (te-lean-tokens/1); without one, the
                    te-text-tokens/1 count of the first restatement in a TheoremSearch paper; without one, of the
                    source passage that states the result (Wikipedia lead or nLab Idea paragraph). The basis is kept.
  proof length      the Lean proof tokens of the primary declaration; otherwise unknown, with the reason.
  te-text-tokens/1  each word (letters, digits, apostrophes), each TeX command, and each other non-space symbol.
"""
import base64
import gzip
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date

from common import (DATA, EXTRACT_VERSION, MEASURE_VERSION, NAME_RULE_VERSION, PROMPT_VERSION, RUBRIC_VERSION,
                    SCHEMA_VERSION, STAGE, USE_RULE_VERSION, WORK, pins, read_json, read_jsonl, sha256_bytes, write_json)
from judge import COMPONENTS, JUDGE, collect
from names import normalize

OUT = WORK / "out"
TEXT_TOKENS = re.compile(r"\\[A-Za-z]+|[\w']+|[^\w\s]")
COMMIT = None  # set from data/sources/mathlib.json
LEVELS = ["school", "undergrad", "graduate", "research"]
REL_TYPES = {"special-case-of": "special-case", "generalizes": "generalization", "consequence-of": "consequence",
             "equivalent": "equivalent", "similar": "similar-problem", "influenced": "research-influence"}
OBSERVED = pins()["observed"]


def text_tokens(text):
    return len(TEXT_TOKENS.findall(text or ""))


def pack(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
    gz = gzip.compress(raw, compresslevel=9, mtime=0)
    return {"bytes": len(raw), "gz_bytes": len(gz), "sha256": sha256_bytes(raw), "gz": base64.b64encode(gz).decode()}


def score_text(scores):
    return "".join("n" if v == "na" else str(v) for v in (scores[k] for k in COMPONENTS))


def balanced(scores):
    w = [25, 25, 20, 15, 5, 5, 5]
    return sum(wi * int(c) / 4 for wi, c in zip(w, scores)) if all(c.isdigit() for c in scores) else None


def lean_url(module, rng):
    path = module.replace(".", "/") + ".lean"
    line = f"#L{rng[0]}-L{rng[2]}" if rng else ""
    return f"https://github.com/leanprover-community/mathlib4/blob/{COMMIT}/{path}{line}"


def mathlib_pass(primary_decls):
    """One pass over the measured records: the primary declarations' rows, direct dependents, and the corpus pack."""
    rows, dependents = {}, Counter()
    corpus = {"modules": [], "rows": []}
    mod_index = {}
    kinds = Counter()
    for r in read_jsonl(STAGE / "mathlib.jsonl.gz"):
        kinds[r["k"]] += 1
        for d in set(r.get("tdeps", [])) | set(r.get("vdeps", [])):
            dependents[d] += 1
        if r["n"] in primary_decls:
            rows[r["n"]] = r
        if r["k"] == "theorem":
            m = mod_index.setdefault(r["m"], len(mod_index))
            ax = [a for a in r.get("ax", []) if a not in ("propext", "Quot.sound", "Classical.choice")]
            corpus["rows"].append([r["n"], m, r.get("st"), r.get("sp"), r.get("pu"), len(r.get("hyps", [])),
                                   r.get("nd", 0), r.get("ncl", 0), 1 if "sorryAx" in ax else 0])
    corpus["modules"] = list(mod_index)
    return rows, dependents, corpus, kinds


def nearest(start, graph, stop, limit=4000):
    seen, out, queue = {start}, [], list(graph.get(start, ()))
    i = 0
    while i < len(queue) and len(seen) < limit:
        d = queue[i]
        i += 1
        if d in seen:
            continue
        seen.add(d)
        if d in stop:
            out.append(d)
            continue
        queue.extend(graph.get(d, ()))
    return out


def formal_links(results, decl_of):
    """Proof dependencies (first hop in the proof references) and signature references (first hop in the type), each
    to the nearest other named results. Graph: every kept record's references (te-measure/1 tdeps and vdeps)."""
    graph, tdeps, vdeps = {}, {}, {}
    need = {r["primary"] for r in results if r["primary"]}
    for row in read_jsonl(STAGE / "mathlib.jsonl.gz"):
        graph[row["n"]] = list(dict.fromkeys(row.get("tdeps", []) + row.get("vdeps", [])))
        if row["n"] in need:
            tdeps[row["n"]], vdeps[row["n"]] = row.get("tdeps", []), row.get("vdeps", [])
    named = set(decl_of)
    out = {}
    for r in results:
        p = r["primary"]
        if not p or p not in tdeps:
            continue
        found = {}
        for kind, first in (("proof", vdeps[p]), ("signature", tdeps[p])):
            hits = []
            for d in first:
                if d in named:
                    hits.append(d)
                else:
                    hits.extend(nearest(d, graph, named, limit=1500))
            for h in hits:
                rid = decl_of[h]
                if rid != r["id"] and rid not in found:
                    found[rid] = (kind, h)
        out[r["id"]] = found
    return out


def tarjan(n, edges):
    """Strongly connected components of a directed graph with nodes 0..n-1 (iterative Tarjan)."""
    index, low, on, stack, comps = [None] * n, [0] * n, [False] * n, [], []
    counter = 0
    for root in range(n):
        if index[root] is not None:
            continue
        work = [(root, 0)]
        while work:
            v, i = work.pop()
            if i == 0:
                index[v] = low[v] = counter
                counter += 1
                stack.append(v)
                on[v] = True
            recurse = False
            for j in range(i, len(edges[v])):
                w = edges[v][j]
                if index[w] is None:
                    work.append((v, j + 1))
                    work.append((w, 0))
                    recurse = True
                    break
                if on[w]:
                    low[v] = min(low[v], index[w])
            if recurse:
                continue
            if low[v] == index[v]:
                comp = []
                while True:
                    w = stack.pop()
                    on[w] = False
                    comp.append(w)
                    if w == v:
                        break
                comps.append(comp)
            if work:
                u = work[-1][0]
                low[u] = min(low[u], low[v])
    return comps


def build():
    global COMMIT
    mathlib = read_json(DATA / "sources" / "mathlib.json")
    COMMIT = mathlib["commit"]
    tax = read_json(DATA / "arxiv-taxonomy.json")
    rubric = read_json(DATA / "rubric.json")
    cases = read_json(DATA / "cases.json")
    manifest = read_json(DATA / "sources" / "manifest.json")
    sources = {name: read_json(DATA / "sources" / f"{name}.json") for name in manifest["sources"]}
    consolidated = read_json(STAGE / "consolidated.json")
    results = consolidated["results"]
    evidence = {e["id"]: e for e in json.loads((STAGE / "evidence.json").read_text(encoding="utf-8"))}
    first, problems1 = collect("answers")
    second, problems2 = collect("answers-2")
    if problems1 or problems2:
        raise SystemExit(f"judge answers have problems: {(problems1 + problems2)[:5]}")

    ids = [r["id"] for r in results]
    idx = {rid: i for i, rid in enumerate(ids)}
    cat_ids = [c["id"] for c in tax["categories"]]
    cat_idx = {c: i for i, c in enumerate(cat_ids)}
    decl_of = {}
    for r in results:
        for d in r["decls"]:
            decl_of.setdefault(d["decl"], r["id"])

    primary = {r["primary"] for r in results if r["primary"]}
    mrows, dependents, corpus, kinds = mathlib_pass(primary)
    links = formal_links(results, decl_of)
    for row in corpus["rows"]:
        row.append(idx[decl_of[row[0]]] if row[0] in decl_of else -1)

    # Use records, restatements, TheoremGraph links, papers.
    uses = list(read_jsonl(STAGE / "uses.jsonl.gz"))
    restate = defaultdict(list)
    for s in read_jsonl(STAGE / "restatements.jsonl.gz"):
        restate[s["result"]].append(s)
    tg = defaultdict(list)
    tgdata = read_json(STAGE / "theoremgraph.json")
    for link in tgdata["links"]:
        tg[link["result"]].append(link)
    want = {u["paper"] for u in uses} | {s["paper"] for v in restate.values() for s in v[:3]}
    papers = {}
    for p in read_jsonl(STAGE / "ts-papers.jsonl.gz"):
        pid = re.sub(r"v\d+$", "", p["paper_id"])
        if pid in want or p["paper_id"] in want:
            papers[pid] = {"title": p["title"], "license": p["license"], "cats": p["categories"]}

    # nLab documentation links between catalog pages.
    nlab_name = {}
    for r in results:
        if r.get("nlab"):
            nlab_name.setdefault(normalize(r["nlab"]["name"]), r["id"])

    relations = []

    def relate(kind, a, b, status, ev, note=None):
        rel = {"id": f"rel:{len(relations)}", "type": kind, "source": idx[a], "target": idx[b], "status": status,
               "evidence": ev}
        if note:
            rel["note"] = note
        relations.append(rel)

    # Formal references (extracted): proof dependency and signature reference, kept separate (spec 4.3).
    for rid, found in links.items():
        for target, (kind, decl) in found.items():
            relate("proof-dependency" if kind == "proof" else "signature-reference", rid, target,
                   "extracted: formal reference in the pinned mathlib", [f"ev:lean:{rid}"],
                   f"{evidence[rid]['primary']['decl']} reaches {decl}")
    # Judged prerequisites and relations (inference).
    for rid, j in first.items():
        for p in j["pre"]:
            relate("prerequisite", rid, p, "judged: inference by the judge", [f"as:{rid}:1"])
        for rel in j["rel"]:
            if rel["target"] != rid:
                relate(REL_TYPES[rel["type"]], rid, rel["target"], "judged: inference by the judge", [f"as:{rid}:1"])
    # Shared application: two results applied in the same paper (source co-occurrence).
    by_paper = defaultdict(set)
    for u in uses:
        if u["type"] == "application":
            by_paper[u["paper"]].add(u["result"])
    shared = defaultdict(list)
    for paper, rs in by_paper.items():
        rs = sorted(rs)
        for i in range(len(rs)):
            for k in range(i + 1, len(rs)):
                shared[(rs[i], rs[k])].append(paper)
    for (a, b), ps in sorted(shared.items()):
        relate("shared-application", a, b, "source co-occurrence: both applied in the same paper",
               [f"ev:use:{a}:{p}" for p in ps[:3]], f"{len(ps)} paper(s)")
    # Documentation links (nLab [[links]]), never proof dependencies.
    for r in results:
        if r.get("nlab"):
            seen = set()
            for name in r["nlab"].get("links", []):
                t = nlab_name.get(normalize(name))
                if t and t != r["id"] and t not in seen:
                    seen.add(t)
                    relate("documentation-link", r["id"], t, "source link: nLab page link", [f"ev:nl:{r['id']}"])
    # Uncertain identities (consolidation refused a join).
    for c in consolidated["candidate_links"]:
        if c["a"] in idx and c["b"] in idx:
            relate("candidate-identity", c["a"], c["b"], "uncertain: candidate identity, not merged", [], c["why"])

    # Learning graph: judged prerequisites; cycles through Tarjan.
    pre_edges = [[] for _ in ids]
    for rid, j in first.items():
        pre_edges[idx[rid]] = sorted({idx[p] for p in j["pre"] if p != rid})
    cycles = [sorted(c) for c in tarjan(len(ids), pre_edges) if len(c) > 1]
    in_cycle = {v: ci for ci, c in enumerate(cycles) for v in c}

    core_rows, detail_rows = [], []
    coverage = Counter()
    use_rows = []
    for u in uses:
        use_rows.append([idx[u["result"]], u["year"], 0 if u["type"] == "application" else 1,
                         [cat_idx[c] for c in dict.fromkeys(u["paper_cats"]) if c in cat_idx]])
    use_by_result = defaultdict(list)
    for u in uses:
        use_by_result[u["result"]].append(u)

    for i, r in enumerate(results):
        rid = r["id"]
        ev = evidence[rid]
        j = first[rid]
        j2 = second.get(rid)
        pr = mrows.get(r["primary"]) if r["primary"] else None
        rs = restate.get(rid, [])
        # Statement and proof length with their basis.
        if pr and pr.get("st") is not None:
            st, st_basis = pr["st"], "lean"
        elif rs:
            st, st_basis = text_tokens(rs[0]["body"]), "restatement"
        elif ev.get("wp") or (ev.get("nlab") or {}).get("passage"):
            st, st_basis = text_tokens((ev.get("wp") or {}).get("passage") or ev["nlab"]["passage"]), "passage"
        else:
            st, st_basis = None, "none"
        if pr and pr.get("sp") is not None:
            sp, sp_basis = pr["sp"], "lean"
        elif pr:
            sp, sp_basis = None, "no-proof-text"
        else:
            sp, sp_basis = None, "no-formal-proof"
        wd_year = None
        for t in (ev.get("wd") or {}).get("P575") or []:
            m = re.match(r"[+-](\d{4})", t.get("time", ""))
            if m:
                wd_year = int(m[1])
                break
        app = [u for u in use_by_result.get(rid, []) if u["type"] == "application"]
        inf = [u for u in use_by_result.get(rid, []) if u["type"] == "influence"]
        kinds_present = [k for k, ok in (("formal", bool(pr)), ("wikipedia", bool(ev.get("wp"))),
                                         ("nlab", bool(ev.get("nlab"))), ("uses", bool(app or inf)),
                                         ("restatement", bool(rs)), ("theoremgraph", bool(tg.get(rid)))) if ok]
        completeness = "broad" if len(kinds_present) >= 3 else "partial" if len(kinds_present) == 2 else "thin"
        search = " ".join([r["name"], *r["aliases"], (pr or {}).get("n", "") if pr else "",
                           " ".join(j["concepts"]), (ev.get("wd_description") or "")]).lower()
        core_rows.append({
            "id": rid, "n": r["name"], "t": j["type"], "s": score_text(j["scores"]), "c": j["conf"],
            "s2": score_text(j2["scores"]) if j2 else None, "c2": j2["conf"] if j2 else None,
            "cat": [cat_idx[c] for c in j["cats"]], "acat": [cat_idx[c] for c in j["acats"]],
            "lv": LEVELS.index(j["level"]), "ef": [j["effort"][d] for d in ("understand", "apply", "prove")],
            "src": r["sources"], "f": 1 if pr else 0, "decl": r["primary"] if pr else None,
            "st": st, "stb": st_basis, "sp": sp, "spb": sp_basis, "pu": (pr or {}).get("pu"),
            "hy": len(pr["hyps"]) if pr else None, "nd": pr.get("nd") if pr else None,
            "ncl": pr.get("ncl") if pr else None, "dep": dependents.get(r["primary"], 0) if pr else None,
            "ax": [a for a in (pr or {}).get("ax", []) if a not in ("propext", "Quot.sound", "Classical.choice")],
            "pre": pre_edges[i], "cyc": in_cycle.get(i), "ua": len(app), "ui": len(inf), "rs": len(rs),
            "tg": len(tg.get(rid, [])), "yr": wd_year, "ev": completeness, "evk": kinds_present, "q": search,
        })
        coverage[(j["type"].split(":")[0], "scored" if all(c.isdigit() for c in score_text(j["scores"])) else "partial")] += 1

        # Evidence records (spec 3.3).
        evs = []
        if ev.get("wp"):
            wp = ev["wp"]
            evs.append({"id": f"ev:wp:{rid}", "kind": "source statement", "explicit": True,
                        "url": f"https://en.wikipedia.org/w/index.php?title={wp['title'].replace(' ', '_')}&oldid={wp['revision']}",
                        "revision": wp["revision"], "location": "lead section, sentences 1-2", "claim": wp["passage"],
                        "dates": {"revision": wp["timestamp"], "observed": OBSERVED}, "method": "wiki lead_passage (wiki.py)",
                        "reuse": "CC BY-SA 4.0"})
        if ev.get("wd"):
            wd = ev["wd"]
            evs.append({"id": f"ev:wd:{rid}", "kind": "source classification", "explicit": True,
                        "url": f"https://www.wikidata.org/w/index.php?title={wd['qid']}&oldid={wd['revision']}",
                        "revision": wd["revision"], "location": "item description and claims P31, P138, P575, P61",
                        "claim": ev.get("wd_description") or "", "dates": {"revision": wd["modified"], "observed": OBSERVED,
                                                                         **({"mathematical": str(wd_year)} if wd_year else {})},
                        "method": "wbgetentities (wiki.py)", "reuse": "CC0"})
        if ev.get("nlab"):
            nl = ev["nlab"]
            evs.append({"id": f"ev:nl:{rid}", "kind": "source statement", "explicit": True,
                        "url": "https://ncatlab.org/nlab/show/" + nl["name"].replace(" ", "+"),
                        "revision": sources["nlab"]["commit"], "location": f"page {nl['page']}, Idea section, first paragraph",
                        "claim": nl.get("passage") or "", "dates": {"revision": sources["nlab"]["date"], "observed": OBSERVED},
                        "method": "nlab-rule/1 (nlab.py)", "reuse": "nLab: free with acknowledgement"})
        if pr:
            evs.append({"id": f"ev:lean:{rid}", "kind": "formal declaration", "explicit": True,
                        "url": lean_url(pr["m"], pr.get("rng")), "revision": COMMIT,
                        "location": f"{pr['m']}" + (f", lines {pr['rng'][0]}-{pr['rng'][2]}" if pr.get("rng") else ""),
                        "claim": pr["sig"], "dates": {"revision": "mathlib commit " + COMMIT[:12], "observed": OBSERVED,
                                                      "formalization": "unknown: one snapshot"},
                        "method": f"{EXTRACT_VERSION}, {MEASURE_VERSION}; validation: imported-build", "reuse": "Apache-2.0"})
        for u in use_by_result.get(rid, []):
            pid = u["paper"]
            evs.append({"id": f"ev:use:{rid}:{pid}", "kind": f"use record ({u['type']})", "explicit": True,
                        "url": f"https://arxiv.org/abs/{pid}", "revision": sources["theoremsearch"]["revision"],
                        "location": f"TheoremSearch statement {u['theorem_id']}", "claim": u["passage"],
                        "paper": (papers.get(pid) or {}).get("title"), "dates": {"publication": str(u["year"]), "observed": OBSERVED},
                        "method": USE_RULE_VERSION, "reuse": "CC BY 4.0; paper: " + str((papers.get(pid) or {}).get("license") or "unknown")})
        for s in rs[:3]:
            pid = re.sub(r"v\d+$", "", s["paper"])
            evs.append({"id": f"ev:rs:{rid}:{s['theorem_id']}", "kind": "restatement in a paper", "explicit": True,
                        "url": f"https://arxiv.org/abs/{pid}", "revision": sources["theoremsearch"]["revision"],
                        "location": f"{s['label']} (TheoremSearch statement {s['theorem_id']})", "claim": s["body"].strip(),
                        "paper": (papers.get(pid) or {}).get("title"), "dates": {"observed": OBSERVED},
                        "method": f"{USE_RULE_VERSION} step 4 (candidate restatement)", "reuse": "CC BY 4.0"})
        for link in tg.get(rid, [])[:5]:
            evs.append({"id": f"ev:tg:{rid}:{link['paper']}:{link['ref']}", "kind": "TheoremGraph match", "explicit": True,
                        "url": f"https://arxiv.org/abs/{link['paper']}", "revision": tgdata["matching"]["revision"],
                        "location": f"{link['title']}, statement {link['ref']}", "claim": f"matched to {link['decl']} ({', '.join(link['labels'])}; similarity {link['sim']})",
                        "dates": {"observed": OBSERVED}, "method": tgdata["rule"], "reuse": "CC BY-SA 4.0"})
        detail_rows.append({
            "al": r["aliases"], "why": j["why"], "why2": j2["why"] if j2 else None, "cn": j["concepts"],
            "wd": ev.get("wd_description"), "sig": (pr or {}).get("sig"), "concl": (pr or {}).get("concl"),
            "hyps": (pr or {}).get("hyps"), "cls": (pr or {}).get("cls"), "mod": (pr or {}).get("m"),
            "decls": [d["decl"] for d in r["decls"]][:12], "ndecls": len(r["decls"]), "evs": evs,
            "rs": [{"label": s["label"], "body": s["body"].strip(), "paper": re.sub(r"v\d+$", "", s["paper"])} for s in rs[:1]],
            "list": (ev.get("list") or {}).get("statement"),
        })

    taxonomy = {"version": tax["version"], "source": tax["source"], "retrieved": tax["retrieved"],
                "categories": [[c["id"], c["name"], c["archive"], c["group"]] for c in tax["categories"]],
                "archives": [[a["id"], a["name"], a["group"]] for a in tax["archives"]],
                "groups": [[g["id"], g["name"]] for g in tax["groups"]], "aliases": tax["aliases"]}
    usum = read_json(STAGE / "uses-summary.json")
    activity = {y: {cat_idx[c]: v for c, v in cs.items() if c in cat_idx} for y, cs in usum["activity"].items()}
    unknown_cat_activity = sum(v for cs in usum["activity"].values() for c, v in cs.items() if c not in cat_idx)
    by_type = Counter(row["t"] for row in core_rows)
    linked_theorems = sum(1 for row in corpus["rows"] if row[-1] >= 0)
    cov = {
        "named": {"records": len(core_rows), "scored": sum(1 for r in core_rows if r["s"].isdigit()),
                  "unscored": sum(1 for r in core_rows if not r["s"].isdigit()),
                  "by_type": [{"type": t, "records": n, "scored": sum(1 for r in core_rows if r["t"] == t and r["s"].isdigit())}
                              for t, n in by_type.most_common()],
                  "second_assessment": len(second)},
        "formal": {"theorems": kinds["theorem"], "linked_to_named": linked_theorems,
                   "unnamed_unscored": kinds["theorem"] - linked_theorems, "kept_by_kind": dict(kinds),
                   "constants": mathlib["constants"], "exclusions": mathlib["exclusions"],
                   "unmeasured_source": mathlib["unmeasured_source"], "sorry": mathlib["sorry"]},
        "statement_length": Counter(r["stb"] for r in core_rows), "proof_length": Counter(r["spb"] for r in core_rows),
        "evidence": Counter(r["ev"] for r in core_rows),
        "uses": usum["counts"], "activity_unknown_category": round(unknown_cat_activity, 4),
        "candidates": consolidated["candidates"], "candidates_by_source": consolidated["by_source"],
        "candidate_links": len(consolidated["candidate_links"]), "relations": Counter(r["type"] for r in relations),
        "prerequisite_cycles": len(cycles),
    }
    cov["statement_length"] = dict(cov["statement_length"])
    cov["proof_length"] = dict(cov["proof_length"])
    cov["evidence"] = dict(cov["evidence"])
    cov["relations"] = dict(cov["relations"])

    core = {"rows": core_rows, "uses": use_rows, "activity": activity, "relations": relations, "cycles": cycles}
    packs = {"core": pack(core), "detail": pack(detail_rows)}
    body = json.dumps([packs["core"]["sha256"], packs["detail"]["sha256"]]).encode()
    snapshot = {"id": "te-" + OBSERVED[:7] + "-" + sha256_bytes(body)[:8], "generated_at": OBSERVED,
                "evidence_cutoff": OBSERVED, "schema_version": SCHEMA_VERSION, "rubric_version": RUBRIC_VERSION,
                "prompt_version": PROMPT_VERSION, "taxonomy_version": tax["version"],
                "taxonomy_source": tax["source"], "source_manifest": manifest["id"],
                "coverage_report": "coverage/" + sha256_bytes(json.dumps(cov, sort_keys=True).encode())[:12],
                "judge": JUDGE, "rules": [NAME_RULE_VERSION, consolidated["rule"], USE_RULE_VERSION, EXTRACT_VERSION,
                                          MEASURE_VERSION, "te-text-tokens/1", cases["rule"], tgdata["rule"]],
                "identity_map": [], "previous": None}
    raw = {"schema": SCHEMA_VERSION, "snapshot": snapshot, "rubric": rubric, "taxonomy": taxonomy,
           "cases": cases, "sources": sources, "coverage": cov, "packs": packs}
    OUT.mkdir(parents=True, exist_ok=True)
    write_json(OUT / "raw.json", raw, indent=None)
    (OUT / "corpus.json").write_bytes(json.dumps(corpus, ensure_ascii=False, separators=(",", ":")).encode())
    return raw


if __name__ == "__main__":
    raw = build()
    p = raw["packs"]
    print(raw["snapshot"]["id"], {k: (v["bytes"], v["gz_bytes"]) for k, v in p.items()}, file=sys.stderr)
    print(json.dumps(raw["coverage"], indent=1)[:3000], file=sys.stderr)
