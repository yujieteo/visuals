"""Local source and proof queue. No download, model API, or scheduled refresh.

Use run.py --supplement prepare, accept, status, or build. The committed snapshot
supplies the catalog. Source excerpts and complete authored proofs stay in data/.
"""
import argparse
import copy
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from common import DATA, RUBRIC_VERSION, VISUAL, WORK, from_toon, read_json, sha256_bytes, to_toon, write_json
from judge import Checker, COMPONENTS, FIELDS, provenance, validate_batch
from packets import PROMPT, packet_row

RESULTS = DATA / "supplement-results.json"
JUDGMENTS = DATA / "supplement-judgments.json"
QUEUE = WORK / "supplement"
REVIEW_FIELDS = {"id", "decision", "conditions", "prerequisites", "alignment", "why"}
STEP_FIELDS = {"id", "step", "verdict", "why"}
REVIEW_PROMPT = """
Proof review is separate from rubric scores and from formal verification.
Assess every condition, quantifier, domain, exception, proof inference and prerequisite.
Reject a proof if a step is unjustified, circular, incomplete, or outside the statement scope.
Return exactly these 3 TOON tables, with no other text:
answers[N]{id,type,eff,res,pra,rea,hyp,pro,app,cats,acats,level,effort,pre,rel,conf,why}:
reviews[N]{id,decision,conditions,prerequisites,alignment,why}:
steps[M]{id,step,verdict,why}:
Decision and verdict are accept or defer. Give a specific explanation in every review cell.
Give 1 steps row for every numbered proof step. Explain why that inference is valid or incomplete.
The pre cell lists every prerequisite result ID in the record. Concepts stay in their separate list.
Use u for influence or application scores when no evidence supports a score.
A source proof does not certify the authored translation. No local Lean check exists for these additions.
"""


def unpack(raw, key):
    import base64
    import gzip
    return json.loads(gzip.decompress(base64.b64decode(raw["packs"][key]["gz"])))


def digest(value):
    return sha256_bytes(json.dumps(value, sort_keys=True, ensure_ascii=False).encode())


def inputs():
    records = read_json(RESULTS)["results"]
    raw = read_json(VISUAL / "raw.json")
    core, detail = unpack(raw, "core"), unpack(raw, "detail")
    existing = {r["id"]: (r, d) for r, d in zip(core["rows"], detail)}
    concepts = {r["id"] for r in unpack(raw, "concepts")["rows"]}
    ids = set(existing) | {r["id"] for r in records}
    checker = Checker(ids)
    seen, names = set(), {}
    for rid, (r, d) in existing.items():
        for name in [r["n"], *d["al"]]:
            names.setdefault(name.casefold(), set()).add(rid)
    for r in records:
        rid = r["id"]
        if rid in seen or not rid.startswith("nm:"):
            raise ValueError(f"duplicate or invalid record ID: {rid}")
        seen.add(rid)
        for key in ("name", "statement", "proof_status", "authored"):
            if not isinstance(r.get(key), str) or not r[key].strip():
                raise ValueError(f"{rid}: missing {key}")
        if r.get("status") not in {"candidate", "deferred"}:
            raise ValueError(f"{rid}: invalid status")
        if r["status"] == "deferred" and not r.get("deferred_reason"):
            raise ValueError(f"{rid}: missing deferral reason")
        if not r.get("hypotheses") or any(not h.strip() for h in r["hypotheses"]):
            raise ValueError(f"{rid}: missing hypotheses")
        proof = r["proof"]
        if proof["kind"] not in {"authored", "source-derived"} or not proof["scope"] or not proof["verification"]:
            raise ValueError(f"{rid}: missing proof scope or status")
        if not proof["steps"] or len({s["id"] for s in proof["steps"]}) != len(proof["steps"]):
            raise ValueError(f"{rid}: empty proof or duplicate step IDs")
        pre = [p["id"] for p in r["prerequisites"]]
        if len(pre) != len(set(pre)) or rid in pre or any(p not in ids for p in pre):
            raise ValueError(f"{rid}: invalid prerequisite IDs")
        if any(len(p["reason"]) < 20 for p in r["prerequisites"]):
            raise ValueError(f"{rid}: missing prerequisite evidence")
        if not r["concept_prerequisites"] or any(c not in concepts for c in r["concept_prerequisites"]):
            raise ValueError(f"{rid}: unknown concept prerequisite")
        for step in proof["steps"]:
            if len(step["text"]) < 30 or any(p not in pre for p in step["uses"]):
                raise ValueError(f"{rid}: incomplete proof step or unknown dependency")
        source = r["source"]
        if not source["url"].startswith("https://github.com/leanprover-community/mathlib4/blob/"):
            raise ValueError(f"{rid}: unsupported source URL")
        if source["excerpt_sha256"] != sha256_bytes(source["excerpt"].encode()):
            raise ValueError(f"{rid}: changed source excerpt")
        for key in ("revision", "module", "declaration", "module_sha256", "alignment", "attribution", "reuse"):
            if not source.get(key):
                raise ValueError(f"{rid}: source requires {key}")
        checker.cats(";".join(r["cats"]), [])
        checker.cats(";".join(r["application_cats"]), [])
        for name in [r["name"], *r["aliases"]]:
            conflicts = names.get(name.casefold(), set()) - {rid}
            if conflicts:
                raise ValueError(f"{rid}: duplicate name or alias {name}: {sorted(conflicts)}")
            names.setdefault(name.casefold(), set()).add(rid)
        if rid in existing and existing[rid][0].get("supplement") != "te-supplement/1":
            raise ValueError(f"{rid}: refuses to replace an existing catalog record")
    # A proof cannot publish while one of its new prerequisites stays deferred.
    by_id = {r["id"]: r for r in records}
    for r in records:
        if r["status"] == "candidate" and any(by_id.get(p["id"], {}).get("status") == "deferred" for p in r["prerequisites"]):
            raise ValueError(f"{r['id']}: prerequisite is deferred")
    return records, raw, core, detail, checker


def fingerprint(r, existing):
    # The full linked catalog evidence is part of the review input, not only its ID.
    refs = {p["id"]: existing.get(p["id"]) for p in r["prerequisites"]}
    return digest([r, refs, PROMPT, REVIEW_PROMPT, read_json(DATA / "rubric.json")])


def accepted(records, core, detail):
    saved = read_json(JUDGMENTS) if JUDGMENTS.is_file() else {}
    existing = {r["id"]: (r, d) for r, d in zip(core["rows"], detail) if not r.get("supplement")}
    current = {}
    for r in records:
        j = saved.get(r["id"])
        if j and j["input_sha256"] == fingerprint(r, existing):
            current[r["id"]] = j
    return current, existing


def prepare(batch_size=6, max_chars=24000):
    records, raw, core, detail, _ = inputs()
    current, existing = accepted(records, core, detail)
    pending = [r for r in records if r["status"] == "candidate" and r["id"] not in current]
    QUEUE.mkdir(parents=True, exist_ok=True)
    prompt = PROMPT + REVIEW_PROMPT + "\
Rubric:\
" + to_toon({"rubric_json": json.dumps(raw["rubric"])})
    write_json(QUEUE / "records.json", records)
    (QUEUE / "prompt.toon").write_text(prompt + "\
")
    batches, ids, blocks = [], [], []

    def flush():
        if not ids:
            return
        name = f"batch-{len(batches):03d}"
        text = prompt + "\
\
" + "\
\
".join(blocks) + "\
"
        (QUEUE / f"{name}.toon").write_text(text)
        batches.append({"batch": name, "ids": list(ids), "sha256": sha256_bytes(text.encode()), "chars": len(text)})
        ids.clear()
        blocks.clear()

    for r in pending:
        ev = {"id": r["id"], "name": r["name"], "aliases": r["aliases"], "sources": ["supplement"],
              "uses": {"application": 0, "influence": 0}, "restatements": 0, "tg_matches": 0}
        row = packet_row(ev, {})
        row.update({"statement": r["statement"], "hypotheses": r["hypotheses"],
                    "source": r["source"], "proof": r["proof"],
                    "prerequisite_evidence_json": json.dumps(r["prerequisites"], ensure_ascii=False),
                    "concept_prerequisites": r["concept_prerequisites"]})
        # Complete statements and proofs are never truncated to meet the bound.
        refs = {p["id"]: existing[p["id"]] if p["id"] in existing else
                next(x for x in records if x["id"] == p["id"]) for p in r["prerequisites"]}
        block = to_toon({"result": row, "linked_evidence_json": json.dumps(refs, ensure_ascii=False)})
        if len(prompt) + len(block) + 4 > max_chars:
            raise ValueError(f"{r['id']}: full proof and linked evidence exceed {max_chars} characters; increase --max-chars")
        if len(ids) >= batch_size or len(prompt) + sum(map(len, blocks)) + len(block) + 2 * len(ids) + 4 > max_chars:
            flush()
        ids.append(r["id"])
        blocks.append(block)
    flush()
    write_json(QUEUE / "index.json", batches)
    return status(records, current, batches)


def check_answer(text, entry, records, checker):
    data = from_toon(text)
    if set(data) != {"answers", "reviews", "steps"}:
        raise ValueError("answer requires exactly answers, reviews and steps tables")
    judgments = validate_batch(to_toon({"answers": data["answers"]}), entry["ids"], checker)
    reviews = data["reviews"]
    if not isinstance(reviews, list) or len(reviews) != len(entry["ids"]) or {r["id"] for r in reviews} != set(entry["ids"]):
        raise ValueError("reviews must match every batch ID exactly once")
    by_id = {r["id"]: r for r in records}
    expected_steps = {(rid, s["id"]) for rid in entry["ids"] for s in by_id[rid]["proof"]["steps"]}
    steps = data["steps"]
    if not isinstance(steps, list) or len(steps) != len(expected_steps) or {(s["id"], s["step"]) for s in steps} != expected_steps:
        raise ValueError("step reviews must cover every proof step exactly once")
    for review in reviews:
        if set(review) != REVIEW_FIELDS or review["decision"] not in {"accept", "defer"}:
            raise ValueError("invalid review fields or decision")
        if any(not isinstance(review[k], str) or len(review[k].strip()) < 30
               for k in ("conditions", "prerequisites", "alignment", "why")):
            raise ValueError("each proof review needs specific explanations")
    for step in steps:
        if set(step) != STEP_FIELDS or step["verdict"] not in {"accept", "defer"} or not isinstance(step["why"], str) or len(step["why"].strip()) < 30:
            raise ValueError("each inference needs a verdict and explanation")
    for j in judgments:
        r = by_id[j["id"]]
        if set(j["pre"]) != {p["id"] for p in r["prerequisites"]} or j["concepts"]:
            raise ValueError(f"{j['id']}: answer does not cover the named prerequisite results")
        if j["type"] != r["type"] or j["cats"] != r["cats"]:
            raise ValueError(f"{j['id']}: type or categories disagree with the source record")
        review = next(v for v in reviews if v["id"] == j["id"])
        st = [s for s in steps if s["id"] == j["id"]]
        if review["decision"] == "accept" and any(s["verdict"] != "accept" for s in st):
            raise ValueError("an accepted proof contains a deferred inference")
        j.update({"review": review, "step_reviews": st})
    return judgments


def accept(batch, answer, config):
    records, _, core, detail, checker = inputs()
    index = read_json(QUEUE / "index.json")
    entry = next((b for b in index if b["batch"] == batch), None)
    if entry is None:
        raise ValueError("unknown batch")
    packet = (QUEUE / f"{batch}.toon").read_bytes()
    if sha256_bytes(packet) != entry["sha256"] or read_json(QUEUE / "records.json") != records:
        raise ValueError("queue input changed; prepare it again")
    if any(config[k] == "unspecified" for k in ("id", "model", "provider", "session")):
        raise ValueError("new answers require actual judge identity")
    judged = check_answer(Path(answer).read_text(), entry, records, checker)
    _, existing = accepted(records, core, detail)
    saved = read_json(JUDGMENTS) if JUDGMENTS.is_file() else {}
    for j in judged:
        record = next(r for r in records if r["id"] == j["id"])
        j.update({"judge": config, "input_sha256": fingerprint(record, existing),
                  "packet_sha256": entry["sha256"], "answer_sha256": sha256_bytes(Path(answer).read_bytes()),
                  "rubric_version": RUBRIC_VERSION, "reviewed_at": datetime.now(timezone.utc).isoformat()})
        saved[j["id"]] = j
    # No file changes occur before the whole batch passes all checks.
    write_json(JUDGMENTS, saved)
    current, _ = accepted(records, core, detail)
    return status(records, current, index)


def status(records, current, batches=()):
    pending = [r["id"] for r in records if r["status"] == "candidate" and r["id"] not in current]
    good = [r for r in records if r["status"] == "candidate" and current.get(r["id"], {}).get("review", {}).get("decision") == "accept"]
    deferred = [{"id": r["id"], "reason": r.get("deferred_reason") or current[r["id"]]["review"]["why"]}
                for r in records if r["status"] == "deferred" or current.get(r["id"], {}).get("review", {}).get("decision") == "defer"]
    return {"queue": {"candidates": len(records), "accepted": len(good), "deferred": len(deferred),
                      "unresolved": len(pending), "batches": len(batches)},
            "coverage": [{"topic": c, "accepted": n} for c, n in sorted(Counter(c for r in good for c in r["cats"]).items())],
            "deferred": deferred, "pending": pending[:8],
            "next": "run.py --supplement accept --batch batch-NNN --answer ANSWER --identity IDENTITY" if pending else
                    "run.py --supplement build"}


def build():
    import assemble
    import run
    records, raw, core, detail, checker = inputs()
    current, _ = accepted(records, core, detail)
    report = status(records, current)
    if report["queue"]["unresolved"]:
        raise ValueError("unresolved judgments prevent publication; run prepare and accept")
    add = [r for r in records if r["status"] == "candidate" and current[r["id"]]["review"]["decision"] == "accept"]
    before = copy.deepcopy(raw)
    # Supplements append rows. Old result and concept indices never move.
    owned = [i for i, r in enumerate(core["rows"]) if r.get("supplement") == "te-supplement/1"]
    start = min(owned) if owned else len(core["rows"])
    if owned != list(range(start, len(core["rows"]))):
        raise ValueError("supplement rows are not an append-only suffix")
    core["rows"] = core["rows"][:start]
    detail = detail[:start]
    core["relations"] = [r for r in core["relations"] if not r.get("supplement")]
    if any(r["source"] >= start or r["target"] >= start for r in core["relations"]):
        raise ValueError("existing relations refer to removed supplement rows")
    idx = {r["id"]: i for i, r in enumerate(core["rows"])}
    idx.update({r["id"]: start + i for i, r in enumerate(add)})
    cat_idx = {c[0]: i for i, c in enumerate(raw["taxonomy"]["categories"])}
    concept_pack = unpack(raw, "concepts")
    concept_idx = {r["id"]: i for i, r in enumerate(concept_pack["rows"])}
    concept_pack["rc"] = concept_pack["rc"][:start]
    for c in concept_pack["rows"]:
        c["rx"] = [i for i in c["rx"] if i < start]
    for r in add:
        j = current[r["id"]]
        # Recheck committed answers rather than trust mutable cache fields.
        checker.row({k: (";".join(j[k]) if k in ("cats", "acats", "pre") else j[k]) for k in []}, set()) if False else None
        pre = [idx[p["id"]] for p in r["prerequisites"]]
        template = {k: None for k in core["rows"][0]}
        template.update({"id": r["id"], "n": r["name"], "t": j["type"], "s": assemble.score_text(j["scores"]),
                         "c": j["conf"], "cat": [cat_idx[c] for c in j["cats"]], "acat": [cat_idx[c] for c in j["acats"]],
                         "lv": assemble.LEVELS.index(j["level"]), "ef": [j["effort"][k] for k in ("understand", "apply", "prove")],
                         "src": ["supplement"], "f": 0, "st": assemble.text_tokens(r["statement"]), "stb": "authored",
                         "spb": "no-local-formal-check", "ax": [], "pre": pre, "ua": 0, "ui": 0, "rs": 0, "tg": 0,
                         "ev": "thin", "evk": ["source-proof", "authored-proof"],
                         "q": " ".join([r["name"], *r["aliases"], r["statement"], *r["concepts"]]).lower(),
                         "supplement": "te-supplement/1"})
        core["rows"].append(template)
        source = r["source"]
        ev = {"id": f"ev:supplement:{r['id']}", "kind": "formal declaration", "explicit": True,
              "url": source["url"], "revision": source["revision"], "location": source["declaration"],
              "claim": source["excerpt"], "dates": {"observed": r["authored"]},
              "method": "source text inspected; no local Lean check", "reuse": source["reuse"]}
        detail.append({"al": r["aliases"], "why": j["why"], "why2": None, "cn": r["concepts"],
                       "wd": None, "sig": None, "concl": None, "hyps": None, "cls": None, "mod": source["module"],
                       "decls": [source["declaration"]], "ndecls": 1, "evs": [ev], "rs": [], "list": r["statement"],
                       "authored_statement": r["statement"], "authored_hypotheses": r["hypotheses"],
                       "proof": {**r["proof"], "verification": "agent inference review accepted; no local Lean check"},
                       "prerequisite_evidence": r["prerequisites"], "concept_prerequisites": r["concept_prerequisites"],
                       "assessment": j})
        for p in r["prerequisites"]:
            core["relations"].append({"id": f"rel:supplement:{r['id']}:{p['id']}", "type": "prerequisite",
                                      "source": idx[r["id"]], "target": idx[p["id"]], "status": "judged: authored proof dependency",
                                      "evidence": [ev["id"]], "note": p["reason"], "supplement": "te-supplement/1"})
        ci = [concept_idx[c] for c in r["concept_prerequisites"]]
        concept_pack["rc"].append(ci)
        for k in ci:
            concept_pack["rows"][k]["rx"].append(idx[r["id"]])
    cycles = [sorted(c) for c in assemble.tarjan(len(core["rows"]), [r["pre"] for r in core["rows"]]) if len(c) > 1]
    if any(any(i >= start for i in c) for c in cycles):
        raise ValueError("new prerequisite cycle prevents publication")
    core["cycles"] = cycles
    for i, r in enumerate(core["rows"]):
        if i >= start:
            r["cyc"] = None
    cov = raw["coverage"]
    rows = core["rows"]
    cov["named"].update({"records": len(rows), "scored": sum(r["s"].isdigit() for r in rows),
                         "unscored": sum(not r["s"].isdigit() for r in rows),
                         "by_type": [{"type": t, "records": n, "scored": sum(r["t"] == t and r["s"].isdigit() for r in rows)}
                                     for t, n in Counter(r["t"] for r in rows).most_common()]})
    for key, field in (("statement_length", "stb"), ("proof_length", "spb"), ("evidence", "ev")):
        cov[key] = dict(Counter(r[field] for r in rows))
    cov["relations"] = dict(Counter(r["type"] for r in core["relations"]))
    cov["supplement"] = report["queue"]
    cov["concepts"]["result_concept_links"] = sum(map(len, concept_pack["rc"]))
    cov["concepts"]["results_with_concepts"] = sum(bool(x) for x in concept_pack["rc"])
    raw["packs"].update({"core": assemble.pack(core), "detail": assemble.pack(detail), "concepts": assemble.pack(concept_pack)})
    raw["sources"]["supplement"] = {"id": "te-supplement/1", "records_sha256": digest(records), "judgments_sha256": digest(current),
                                    "source": "pinned mathlib source excerpts", "reuse": "Apache-2.0; authored proofs and statements for this catalog",
                                    "accepted": len(add), "deferred": report["queue"]["deferred"], "formal_checks": 0}
    write_json(DATA / "sources" / "supplement.json", raw["sources"]["supplement"])
    source_id = "manifest/" + digest(raw["sources"])[:16]
    snapshot = raw["snapshot"]
    new_id = "te-2026-10-" + digest([raw["packs"]["core"]["sha256"], raw["packs"]["detail"]["sha256"]])[:8]
    if new_id != snapshot["id"]:
        run.keep(before)
        snapshot["previous"] = snapshot["id"]
    snapshot.update({"id": new_id, "source_manifest": source_id, "coverage_report": "coverage/" + digest(cov)[:12]})
    # The historical judge and source dates remain intact. Each new assessment has its own provenance.
    snapshot["supplement_judges"] = list({digest(j["judge"]): j["judge"] for j in current.values()}.values())
    if "te-supplement/1" not in snapshot["rules"]:
        snapshot["rules"].append("te-supplement/1")
    write_json(QUEUE / "coverage.toon.json", report)
    run.OUT.mkdir(parents=True, exist_ok=True)
    write_json(run.OUT / "raw.json", raw, indent=None)
    write_json(run.OUT / "change-report.json", run.change_report(before, raw, snapshot["identity_map"]))
    run.keep(raw)
    log = QUEUE / "publish.log"
    run.publish(log)
    return {**report, "catalog": {"before": len(unpack(before, "core")["rows"]), "after": len(rows)},
            "next": "python3 scripts/check.py theorem-explorer"}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="command", required=True)
    p = sub.add_parser("prepare")
    p.add_argument("--batch-size", type=int, default=6)
    p.add_argument("--max-chars", type=int, default=24000)
    a = sub.add_parser("accept")
    a.add_argument("--batch", required=True)
    a.add_argument("--answer", type=Path, required=True)
    a.add_argument("--identity", type=Path, required=True)
    sub.add_parser("status")
    sub.add_parser("build")
    args = ap.parse_args(argv)
    try:
        if args.command == "prepare":
            if args.batch_size < 1 or args.max_chars < 1000:
                raise ValueError("prompt bounds must be positive and at least 1000 characters")
            result = prepare(args.batch_size, args.max_chars)
        elif args.command == "accept":
            result = accept(args.batch, args.answer, provenance(args.identity))
        elif args.command == "build":
            result = build()
        else:
            records, _, core, detail, _ = inputs()
            current, _ = accepted(records, core, detail)
            result = status(records, current)
        print(to_toon(result))
        return 0
    except (ValueError, KeyError, TypeError, OSError) as e:
        print(to_toon({"error": str(e), "next": "Correct the input. Then repeat the command."}))
        return 1


if __name__ == "__main__":
    sys.exit(main())