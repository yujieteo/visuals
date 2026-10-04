"""Assemble the Theorem Learner's raw.json (te-learning/1) from the source catalog and the authored learning data.

Inputs:
  viz/theorem-explorer/raw.json   the refreshed source catalog: results, statements, evidence, relations, scores and
                                  the concept catalog (theorem-explorer's pipeline writes it; this script never does)
  data/learning/                  the authored learning data (learning.py): mechanisms, theorems with their proofs,
                                  concepts with reminders, examples and generality links. A source refresh never
                                  writes here, so reviewed proof explanations survive a refresh.
  <te-work>/mathlib4              the pinned mathlib, for the file and lines of a Lean declaration that a proof names
                                  as its source when the catalog does not already locate it

Every authored file must pass learning.check_files(); a failing file stops the run. Authored text becomes explicit
segments (learning.parse): a segment is a plain string, or [text, concept index] for a marked concept word.

Output raw.json:
  schema, snapshot (its own id, the source snapshot id, the rules), sources, rubric, concept_rubric, taxonomy,
  coverage (catalog and learning counts) and packs.core (gzip+base64) with:
    theorems   every scored catalog result: identity, scores, level, categories, the statement (authored segments, or
               the quoted source statement with its basis), hypotheses, conclusion, proof indices, formal declaration
               (decl, commit, file, lines, signature, difference), judged prerequisites, relations, key concepts,
               evidence indices, the explorer's note and the unknown reason
    proofs     proof objects: public id proof:<theorem id>:<slug>, theorem, name, slogan, scope, roles (hypothesis,
               why, steps, unused), steps (id, slogan, detail, concepts, lemmas), edges (enables), conclusion step,
               concept roles (why here), mechanisms, evidence, verification
    mechanisms the reusable proof moves and the proofs they occur in
    evidence   source statements, formal declarations (commit, declaration, file, line range) and proof sources, each
               with its status: formal declaration, source statement, proof source
    concepts   every catalog concept (identity, kind, level, scores, catalog prerequisites, definition text and basis)
               with the authored reminder, definition, examples, requires and links where they exist, and the
               concepts that theorem files add
    links      concept generality links: from, to, type, steps, why

Run: python3 pipeline/assemble.py [--explorer PATH] [--out raw.json]
"""
import argparse
import base64
import gzip
import hashlib
import json
import os
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import learning

HERE = Path(__file__).resolve().parent
VISUAL = HERE.parent
ROOT = VISUAL.parents[1]
EXPLORER = ROOT / "viz" / "theorem-explorer" / "raw.json"
WORK = Path(os.environ.get("TE_WORK", ROOT / "build" / "te-work"))
RESULT_TYPES = {"theorem", "lemma", "inequality", "identity", "principle", "formula", "criterion", "conjecture-proved",
                "construction", "classification", "other-result"}
RULE = "tl-assemble/1"
_URL = re.compile(r"/blob/([0-9a-f]{40})/(.+?\.lean)#L(\d+)-L(\d+)$")
_DECL = re.compile(r"^(?:@\[[^\]]*\]\s*)?(?:(?:protected|private|nonrec|noncomputable)\s+)*(theorem|lemma|def|instance)\s+([^\s:({\[]+)", re.M)
_NS = re.compile(r"^(namespace|section|end)\b\s*([\w.]*)", re.M)


def unpack(raw, name):
    return json.loads(gzip.decompress(base64.b64decode(raw["packs"][name]["gz"])))


def pack(value):
    data = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
    gz = gzip.compress(data, compresslevel=9, mtime=0)
    return {"bytes": len(data), "gz_bytes": len(gz), "sha256": hashlib.sha256(data).hexdigest(), "gz": base64.b64encode(gz).decode()}


def lean_locations(names, mathlib):
    """name -> {file, lines} for theorem, lemma and def declarations of the pinned mathlib (namespaces resolved)."""
    want, found = set(names), {}
    if not want or not (mathlib / "Mathlib").is_dir():
        return found
    for path in sorted((mathlib / "Mathlib").rglob("*.lean")):
        text = path.read_text(encoding="utf-8")
        events = sorted([(m.start(), "ns", m) for m in _NS.finditer(text)] + [(m.start(), "d", m) for m in _DECL.finditer(text)], key=lambda e: e[0])
        stack = []
        for pos, kind, m in events:
            if kind == "ns":
                if m[1] in ("namespace", "section"):
                    stack.append((m[1], m[2]))
                elif stack:
                    stack.pop()
                continue
            ns = ".".join(a for w, a in stack if w == "namespace" and a)
            full = f"{ns}.{m[2]}" if ns and not m[2].startswith("_root_.") else m[2].replace("_root_.", "")
            if full in want and full not in found:
                line = text.count("\n", 0, pos) + 1
                found[full] = {"file": str(path.relative_to(mathlib)), "lines": [line, line]}
        if len(found) == len(want):
            break
    return found


def build(explorer_path, out_path):
    raw = json.loads(Path(explorer_path).read_text(encoding="utf-8"))
    core, det, cpack = unpack(raw, "core"), unpack(raw, "detail"), unpack(raw, "concepts")
    rows, crows, ctexts = core["rows"], cpack["rows"], cpack["text"]
    commit = raw["sources"]["mathlib"]["commit"]

    # ---- authored data, checked first ----
    files = sorted((learning.LEARNING / "theorems").glob("*.json"))
    cfiles = sorted((learning.LEARNING / "concepts").glob("*.json"))
    n, problems = learning.check_files(files + cfiles)
    if problems:
        sys.exit("authored learning data has problems:\n" + "\n".join(problems[:60]))
    authored = {}
    for f in files:
        for t in json.loads(f.read_text(encoding="utf-8")):
            authored.setdefault(t["id"], t)
    cauthored = {}
    for f in cfiles:
        for c in json.loads(f.read_text(encoding="utf-8")):
            cauthored.setdefault(c["id"], c)
    mechs = json.loads((learning.LEARNING / "mechanisms.json").read_text(encoding="utf-8"))["mechanisms"]

    # ---- concepts: the catalog, then the concepts that theorem files add ----
    concepts = []
    for c, t in zip(crows, ctexts):
        concepts.append({"id": c["id"], "n": c["n"], "k": c["k"], "lv": c["lv"], "s": c["s"], "c": c["c"], "j": c["j"],
                         "cat": c["cat"], "pre": c["pre"], "nl": c["nl"], "decl": c["decl"], "ap": c["ap"], "rx": c["rx"],
                         "al": t.get("al") or [], "def": t.get("def"), "defb": t.get("defb")})
    cidx = {c["id"]: i for i, c in enumerate(concepts)}
    for t in authored.values():
        for nc in t.get("new_concepts") or []:
            if nc["id"] not in cidx:
                cidx[nc["id"]] = len(concepts)
                concepts.append({"id": nc["id"], "n": nc["name"], "k": "other", "lv": None, "s": "uuuuuuu", "c": "low", "j": 0,
                                 "cat": [], "pre": [], "nl": None, "decl": None, "ap": None, "rx": [], "al": [],
                                 "def": None, "defb": None, "new": True, "_new": nc})

    def seg(text):
        out = []
        for s, c in learning.parse(text or ""):
            out.append(s if c is None else [s, cidx[c]])
        return out

    links = []
    for c in concepts:
        a = cauthored.get(c["id"]) or (c.get("_new") and {"reminder": c["_new"]["reminder"], "definition": c["_new"]["definition"],
                                                         "examples": [], "requires": c["_new"].get("requires") or [], "links": []})
        c.pop("_new", None)
        if not a:
            continue
        c["rem"] = seg(a["reminder"])
        c["adef"] = seg(a["definition"])
        c["ex"] = [seg(e) for e in a.get("examples") or []]
        c["rq"] = [cidx[r] for r in a.get("requires") or [] if r in cidx]
        c["ln"] = []
        for ln in a.get("links") or []:
            if ln["to"] not in cidx:
                continue
            c["ln"].append(len(links))
            links.append({"id": f"link:{c['id']}:{ln['to']}", "from": cidx[c["id"]], "to": cidx[ln["to"]], "type": ln["type"],
                          "steps": [seg(s) for s in ln["steps"]], "why": seg(ln.get("why"))})

    # ---- evidence: source statements and formal declarations from the catalog ----
    evidence, ev_index = [], {}

    def add_ev(rec):
        if rec["id"] in ev_index:
            return ev_index[rec["id"]]
        ev_index[rec["id"]] = len(evidence)
        evidence.append(rec)
        return ev_index[rec["id"]]

    # ---- theorems ----
    order = [i for i, r in enumerate(rows) if r["t"] in RESULT_TYPES]
    tidx = {rows[i]["id"]: k for k, i in enumerate(order)}
    theorems, proofs = [], []
    mid = {m["id"]: k for k, m in enumerate(mechs)}
    mech_proofs = [[] for _ in mechs]
    rel_by = {}
    for rel in core["relations"]:
        if rel["type"] in ("special-case", "generalization", "consequence", "equivalent"):
            a, b = rows[rel["source"]]["id"], rows[rel["target"]]["id"]
            if a in tidx and b in tidx:
                rel_by.setdefault(tidx[a], []).append([rel["type"], tidx[b], "out"])
                rel_by.setdefault(tidx[b], []).append([rel["type"], tidx[a], "in"])
    lean_wanted = set()
    for t in authored.values():
        for q in t["proofs"]:
            if q["source"]["kind"] == "lean":
                lean_wanted.add(q["source"]["decl"])
        if (t.get("formal") or {}).get("decl"):
            lean_wanted.add(t["formal"]["decl"])
    catalog_locs = {}
    for i in order:
        f = next((e for e in det[i]["evs"] if e["kind"] == "formal declaration"), None)
        m = _URL.search(f["url"]) if f else None
        if m and rows[i]["decl"]:
            catalog_locs[rows[i]["decl"]] = {"file": m[2], "lines": [int(m[3]), int(m[4])]}
    locs = dict(catalog_locs)
    locs.update(lean_locations(lean_wanted - set(catalog_locs), WORK / "mathlib4"))

    for k, i in enumerate(order):
        r, x = rows[i], det[i]
        evs = []
        for e in x["evs"]:
            if e["kind"] == "source statement":
                evs.append(add_ev({"id": e["id"], "kind": "source statement", "status": "source statement", "source": e["method"].split(" ")[0],
                                   "url": e["url"], "revision": str(e["revision"]), "location": e["location"], "claim": e["claim"], "reuse": e.get("reuse")}))
        formal = None
        if r["decl"]:
            loc = catalog_locs.get(r["decl"])
            fe = add_ev({"id": f"ev:lean:{r['decl']}", "kind": "formal declaration", "status": "formal declaration", "source": "mathlib",
                         "decl": r["decl"], "revision": commit, "file": loc["file"] if loc else None, "lines": loc["lines"] if loc else None,
                         "url": f"https://github.com/leanprover-community/mathlib4/blob/{commit}/{loc['file']}#L{loc['lines'][0]}-L{loc['lines'][1]}" if loc else None,
                         "claim": x["sig"] or r["decl"], "reuse": "Apache-2.0"})
            evs.append(fe)
            formal = {"decl": r["decl"], "ev": fe, "sig": x["sig"], "concl": x["concl"], "hyps": x["hyps"], "difference": None}
        a = authored.get(r["id"])
        src = next((e for e in x["evs"] if e["kind"] == "source statement"), None)
        th = {"id": r["id"], "n": r["n"], "t": r["t"], "lv": r["lv"], "cat": r["cat"], "s": r["s"], "c": r["c"], "ef": r["ef"],
              "al": x["al"], "kc": [cidx[crows[j]["id"]] for j in cpack["rc"][i]],
              "pre": [tidx[rows[j]["id"]] for j in sorted(set(r["pre"])) if rows[j]["id"] in tidx and j != i],
              "rel": rel_by.get(k, []), "ev": evs, "why": x["why"], "formal": formal, "pf": [], "unk": None,
              "q": " ".join([r["q"], r["id"].lower(), (r["decl"] or "").lower(), " ".join(x["decls"] or []).lower(), (x["mod"] or "").lower()])}
        if a:
            th["st"], th["stb"] = seg(a["statement"]), "authored"
            th["hy"] = [{"id": h["id"], "seg": seg(h["text"]), "c": cidx.get(h.get("concept")) if h.get("concept") else None} for h in a["hypotheses"]]
            th["cn"] = seg(a["conclusion"])
            if formal and a.get("formal"):
                formal["difference"] = a["formal"].get("difference")
            elif not formal and (a.get("formal") or {}).get("decl") in locs:
                # The catalog links no declaration, but the author found one in the pinned mathlib.
                decl, loc = a["formal"]["decl"], locs[a["formal"]["decl"]]
                fe = add_ev({"id": f"ev:lean:{decl}", "kind": "formal declaration", "status": "formal declaration", "source": "mathlib",
                             "decl": decl, "revision": commit, "file": loc["file"], "lines": loc["lines"],
                             "url": f"https://github.com/leanprover-community/mathlib4/blob/{commit}/{loc['file']}#L{loc['lines'][0]}-L{loc['lines'][1]}",
                             "claim": decl, "reuse": "Apache-2.0"})
                th["ev"].append(fe)
                th["formal"] = formal = {"decl": decl, "ev": fe, "sig": None, "concl": None, "hyps": None,
                                         "difference": a["formal"].get("difference")}
                th["q"] += " " + decl.lower()
            th["unk"] = a.get("unknown")
            th["q"] += " " + learning.plain(a["statement"]).lower()
            for q in a["proofs"]:
                pid = len(proofs)
                th["pf"].append(pid)
                sids = [s["id"] for s in q["steps"]]
                sk = {s: j for j, s in enumerate(sids)}
                pev = []
                srcq = q["source"]
                if srcq["kind"] == "lean":
                    decl = srcq["decl"]
                    loc = locs.get(decl)
                    pev.append(add_ev({"id": f"ev:lean:{decl}", "kind": "formal declaration", "status": "formal declaration", "source": "mathlib",
                                       "decl": decl, "revision": commit, "file": loc["file"] if loc else None, "lines": loc["lines"] if loc else None,
                                       "url": f"https://github.com/leanprover-community/mathlib4/blob/{commit}/{loc['file']}#L{loc['lines'][0]}-L{loc['lines'][1]}" if loc else None,
                                       "claim": decl, "reuse": "Apache-2.0"}))
                elif srcq["kind"] == "cited":
                    pev.append(add_ev({"id": "ev:cite:" + hashlib.sha256(srcq["ref"].encode()).hexdigest()[:12], "kind": "proof source", "status": "cited proof",
                                       "source": "citation", "url": srcq.get("url"), "revision": None, "location": None, "claim": srcq["ref"], "note": srcq.get("note")}))
                elif srcq["kind"] == "web":
                    pev.append(add_ev({"id": "ev:web:" + hashlib.sha256(srcq["url"].encode()).hexdigest()[:12], "kind": "proof source", "status": "proof source",
                                       "source": "web", "url": srcq["url"], "revision": None, "location": None, "claim": srcq.get("note") or ""}))
                for m in q.get("mechanisms") or []:
                    mech_proofs[mid[m]].append(pid)
                proofs.append({
                    "id": f"proof:{r['id']}:{q['id']}", "th": k, "n": q["name"], "sl": seg(q["slogan"]), "sc": seg(q["scope"]),
                    "ro": [{"h": ro["h"], "why": seg(ro["why"]), "st": [sk[s] for s in ro.get("steps") or []], "un": bool(ro.get("unused"))} for ro in q["roles"]],
                    "stp": [{"id": s["id"], "sl": seg(s["slogan"]), "dt": seg(s["detail"]),
                             "cs": sorted({cidx[c] for c in learning.marks(s["slogan"]) + learning.marks(s["detail"])}),
                             "lm": [tidx[u] for u in s.get("uses") or [] if u in tidx]} for s in q["steps"]],
                    "ed": [[sk[e[0]], sk[e[1]]] for e in q["edges"]], "cl": sk[q["conclusion"]],
                    "cw": {str(cidx[c]): seg(w) for c, w in q["concepts"].items()},
                    "me": [mid[m] for m in q.get("mechanisms") or []], "ev": pev,
                    "src": {"kind": srcq["kind"], "decl": srcq.get("decl"), "follows": srcq.get("follows"), "url": srcq.get("url"), "ref": srcq.get("ref"), "note": srcq.get("note")},
                    "vf": {"authored": True, "checked": False, "lean": False},
                })
        else:
            text = (src or {}).get("claim") or ""
            th["st"], th["stb"] = [text], f"quoted source statement: {src['location']}" if src else "none"
            th["hy"], th["cn"] = [], None
        theorems.append(th)

    mechanisms = [{"id": m["id"], "n": m["name"], "sl": m["slogan"], "d": m["description"], "pf": mech_proofs[k]} for k, m in enumerate(mechs)]
    with_proofs = sum(1 for t in theorems if t["pf"])
    cov = {
        "catalog": {"theorems": len(theorems), "concepts": len(crows)},
        "learning": {
            "theorems_with_proofs": with_proofs, "theorems_unknown": sum(1 for t in theorems if t["unk"]),
            "theorems_without_proofs": len(theorems) - with_proofs,
            "proofs": len(proofs), "steps": sum(len(p["stp"]) for p in proofs),
            "proofs_by_source": dict(Counter(p["src"]["kind"] for p in proofs)),
            "proofs_following_lean": sum(1 for p in proofs if p["src"]["kind"] == "lean" and p["src"]["follows"]),
            "theorems_with_alternatives": sum(1 for t in theorems if len(t["pf"]) > 1),
            "mechanisms": len(mechanisms), "mechanisms_used": sum(1 for m in mechanisms if m["pf"]),
            "concepts_with_reminders": sum(1 for c in concepts if "rem" in c), "concepts_added": sum(1 for c in concepts if c.get("new")),
            "links": len(links), "evidence": len(evidence),
            "formal_declarations": sum(1 for e in evidence if e["kind"] == "formal declaration"),
            "verification": {"authored": len(proofs), "checked_correspondence": 0, "lean_checked": 0},
        },
    }
    body = {"theorems": theorems, "proofs": proofs, "mechanisms": mechanisms, "evidence": evidence, "concepts": concepts, "links": links}
    packed = pack(body)
    snap = raw["snapshot"]
    out = {
        "schema": learning.SCHEMA,
        "snapshot": {"id": "tl-" + snap["generated_at"][:7] + "-" + packed["sha256"][:8], "generated_at": date.today().isoformat(),
                     "source_snapshot": snap["id"], "evidence_cutoff": snap["evidence_cutoff"], "judge": snap["judge"],
                     "rules": [learning.SCHEMA, learning.MARKUP_RULE, RULE, "tl-proof-prompt/1", "tl-concept-prompt/1", *snap["rules"]]},
        "sources": {k: raw["sources"][k] for k in ("mathlib", "nlab", "wikidata", "wikipedia", "theoremsearch", "taxonomy", "concepts") if k in raw["sources"]},
        "rubric": raw["rubric"], "concept_rubric": raw["concept_rubric"], "taxonomy": raw["taxonomy"], "coverage": cov,
        "packs": {"core": packed},
    }
    Path(out_path).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return cov, packed["gz_bytes"]


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--explorer", type=Path, default=EXPLORER)
    ap.add_argument("--out", type=Path, default=VISUAL / "raw.json")
    a = ap.parse_args()
    cov, gz = build(a.explorer, a.out)
    print(json.dumps(cov, indent=1), "core gz", gz)
