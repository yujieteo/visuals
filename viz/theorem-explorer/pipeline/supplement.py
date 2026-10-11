"""Local result packs: source, proof and judgment queue. No download, model API or scheduled refresh.

A pack is a pair of committed files in data/: <pack>-results.json and <pack>-judgments.json. Every worker owns
one pack. The commands below act on one pack (--pack) or, for status and build, on all packs.

  run.py --supplement status                       coverage, counts, unresolved judgments, next commands
  run.py --supplement --pack P check               validate the records of pack P
  run.py --supplement --pack P prepare             write bounded prompts and evidence packets
  run.py --supplement --pack P accept ...          validate and store one agent answer
  run.py --supplement build                        append the accepted results of all packs to raw.json and rebuild
"""
import argparse
import ast
import base64
import copy
import gzip
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path
from urllib.parse import urlparse

from common import DATA, RUBRIC_VERSION, VISUAL, WORK, from_toon, read_json, sha256_bytes, to_toon, write_json
from judge import Checker, provenance, validate_batch
from packets import PROMPT, packet_row

SCHEMA = "te-supplement/1"
DEFAULT_PACK = "methods"
QUEUE = WORK / "supplement"
REVIEW_FIELDS = {"id", "decision", "conditions", "prerequisites", "alignment", "why"}
STEP_FIELDS = {"id", "step", "verdict", "why"}
COMPUTATION_FIELDS = {"id", "application", "step", "verdict", "why"}
MIN_CORE_PROOF = 350
REVIEW_PROMPT = """
Proof review is separate from rubric scores and from formal verification.
Assess every condition, quantifier, domain, exception, proof inference and prerequisite.
Reject a proof if a step is unjustified, circular, incomplete, or outside the statement scope.
Return the answers, reviews and steps TOON tables, with no other text:
answers[N]{id,type,eff,res,pra,rea,hyp,pro,app,cats,acats,level,effort,pre,rel,conf,why}:
reviews[N]{id,decision,conditions,prerequisites,alignment,why}:
steps[M]{id,step,verdict,why}:
If the packet contains worked applications, also return:
computations[K]{id,application,step,verdict,why}:
Give 1 computation verdict for each application step. Check its inputs, hypotheses, calculation and conclusion.
Decision and verdict are accept or defer. Give a specific explanation in every review cell.
Give 1 steps row for every numbered proof step. Explain why that inference is valid or incomplete.
The pre cell lists every prerequisite result ID in the record. Concepts stay in their separate list.
Score every component 0-4 from the rubric anchors. The catalog accepts no u: when no use evidence exists, judge influence and application from the mathematics, and say so in why.
The effort cell uses / between 3 bands, like 2/2/3. The pre cell lists the record prerequisite result IDs, and may also list its concept IDs, separated by ;.
A source proof does not certify the authored translation. No local Lean check exists for these additions.
"""


def unpack(raw, key):
    return json.loads(gzip.decompress(base64.b64decode(raw["packs"][key]["gz"])))


def digest(value):
    return sha256_bytes(json.dumps(value, sort_keys=True, ensure_ascii=False).encode())


def pack_paths(pack, data=None):
    data = data or DATA
    return data / f"{pack}-results.json", data / f"{pack}-judgments.json"


def pack_names(data=None):
    data = data or DATA
    return sorted(p.name[:-len("-results.json")] for p in data.glob("*-results.json"))


def arithmetic(text):
    """Exact bounded scalar arithmetic. It is never Python eval and never a model call."""
    if not isinstance(text, str) or len(text) > 500:
        raise ValueError("arithmetic expressions require at most 500 characters")

    def value(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return Fraction(str(node.value))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            v = value(node.operand)
            return -v if isinstance(node.op, ast.USub) else v
        if not isinstance(node, ast.BinOp):
            raise ValueError("arithmetic permits only numeric constants and arithmetic operators")
        left, right = value(node.left), value(node.right)
        if isinstance(node.op, ast.Add):
            out = left + right
        elif isinstance(node.op, ast.Sub):
            out = left - right
        elif isinstance(node.op, ast.Mult):
            out = left * right
        elif isinstance(node.op, ast.Div):
            out = left / right
        elif isinstance(node.op, ast.Pow) and right.denominator == 1 and abs(right) <= 12:
            out = left ** int(right)
        else:
            raise ValueError("unsupported arithmetic operator or exponent")
        if out.numerator.bit_length() > 2048 or out.denominator.bit_length() > 2048:
            raise ValueError("arithmetic exceeds the size bound")
        return out

    try:
        return value(ast.parse(text, mode="eval").body)
    except (SyntaxError, ZeroDivisionError, OverflowError, RecursionError) as e:
        raise ValueError(f"invalid arithmetic: {e}") from e


def normalize(r):
    """Bring the optional field names of one worker's record to the shared schema."""
    r = copy.deepcopy(r)
    w = r.pop("worked_application", None)
    if w is not None and "applications" not in r:
        w = w if isinstance(w, list) else [w]
        r["applications"] = [{"id": a.get("id", f"worked-{i + 1}"), "title": a["title"],
                              "inputs": a.get("inputs", a.get("goal")), "hypotheses": a.get("hypotheses_text") or
                              (a["why_theorem_applies"] if "why_theorem_applies" in a else a["hypotheses"]),
                              "steps": a["steps"], "conclusion": a.get("conclusion", a.get("result"))}
                             for i, a in enumerate(w)]
    r.setdefault("applications", [])
    r.setdefault("selection", "core")
    r.setdefault("aliases", [])
    r.setdefault("definitions", [])
    r.setdefault("source_references", [])
    return r


def load(pack, data=None):
    results, _ = pack_paths(pack, data)
    if not results.is_file():
        raise ValueError(f"unknown pack {pack}: {results.name} does not exist")
    return [normalize(r) for r in read_json(results)["results"]]


def check_source(rid, source):
    kind = source.get("kind", "mathlib")
    if kind not in {"mathlib", "literature"}:
        raise ValueError(f"{rid}: unsupported source kind {kind}")
    fields = ("url", "revision", "module", "declaration", "alignment", "attribution", "reuse", "excerpt")
    fields += ("citation", "page") if kind == "literature" else ("module_sha256",)
    for key in fields:
        if not isinstance(source.get(key), str) or not source[key].strip():
            raise ValueError(f"{rid}: source requires {key}")
    if urlparse(source["url"]).scheme != "https" or not urlparse(source["url"]).netloc:
        raise ValueError(f"{rid}: unsupported source URL")
    if source["excerpt_sha256"] != sha256_bytes(source["excerpt"].encode()):
        raise ValueError(f"{rid}: changed source excerpt")


def check_record(r, ids, concepts, checker, existing, names):
    rid = r["id"]
    if not rid.startswith("nm:"):
        raise ValueError(f"duplicate or invalid record ID: {rid}")
    for key in ("name", "statement", "proof_status", "authored"):
        if not isinstance(r.get(key), str) or not r[key].strip():
            raise ValueError(f"{rid}: missing {key}")
    if r.get("status") not in {"candidate", "deferred"}:
        raise ValueError(f"{rid}: invalid status")
    if r["status"] == "deferred":
        # A deferred record stays outside the catalog; it needs only a reason and a unique name.
        if not r.get("deferred_reason"):
            raise ValueError(f"{rid}: missing deferral reason")
        if rid in existing:
            raise ValueError(f"{rid}: refuses to replace an existing catalog record")
        return
    if r["selection"] not in {"core", "support"}:
        raise ValueError(f"{rid}: selection must be core or support")
    if not r.get("hypotheses") or any(not h.strip() for h in r["hypotheses"]):
        raise ValueError(f"{rid}: missing hypotheses")
    proof = r["proof"]
    if proof["kind"] not in {"authored", "source-derived", "outline"} or not proof["scope"] or not proof["verification"]:
        raise ValueError(f"{rid}: missing proof scope or status")
    if proof["kind"] == "outline":
        cited = proof.get("source", {})
        if ("outline" not in proof["scope"].lower() or cited.get("kind") != "cited"
                or not cited.get("ref") or not cited.get("url")):
            raise ValueError(f"{rid}: an outline requires an explicit scope and a published proof reference")
        if urlparse(cited["url"]).scheme != "https" or not urlparse(cited["url"]).netloc:
            raise ValueError(f"{rid}: unsupported published proof URL")
    if not proof["steps"] or len({s["id"] for s in proof["steps"]}) != len(proof["steps"]):
        raise ValueError(f"{rid}: empty proof or duplicate step IDs")
    pre = [p["id"] for p in r["prerequisites"]]
    if len(pre) != len(set(pre)) or rid in pre or any(p not in ids for p in pre):
        raise ValueError(f"{rid}: invalid prerequisite IDs")
    if any(len(p["reason"]) < 20 for p in r["prerequisites"]):
        raise ValueError(f"{rid}: missing prerequisite evidence")
    if not pre and r["selection"] == "core" and len(r.get("empty_prerequisites_reason", "")) < 30:
        raise ValueError(f"{rid}: no prerequisite result needs empty_prerequisites_reason")
    if not r["concept_prerequisites"] or any(c not in concepts for c in r["concept_prerequisites"]):
        raise ValueError(f"{rid}: unknown concept prerequisite")
    for step in proof["steps"]:
        if len(step["text"]) < 30 or any(p not in pre for p in step["uses"]):
            raise ValueError(f"{rid}: incomplete proof step or unknown dependency")
    if r["selection"] == "core":
        if sum(len(s["text"]) for s in proof["steps"]) < MIN_CORE_PROOF or proof["kind"] not in {"authored", "outline"}:
            raise ValueError(f"{rid}: a counted result needs an authored proof or cited outline of at least {MIN_CORE_PROOF} characters")
        if not r["applications"]:
            raise ValueError(f"{rid}: a counted result needs a worked application")
    apps = r["applications"]
    if len({a["id"] for a in apps}) != len(apps):
        raise ValueError(f"{rid}: duplicate application IDs")
    for app in apps:
        for key in ("title", "inputs", "hypotheses", "conclusion"):
            if not isinstance(app.get(key), str) or len(app[key].strip()) < 20:
                raise ValueError(f"{rid}: application requires {key}")
        if not app.get("steps") or len({s["id"] for s in app["steps"]}) != len(app["steps"]):
            raise ValueError(f"{rid}: incomplete application steps")
        for step in app["steps"]:
            if len(step["text"]) < 30:
                raise ValueError(f"{rid}: incomplete application explanation")
            if ("expression" in step) != ("expected" in step):
                raise ValueError(f"{rid}: calculation requires expression and expected")
            if "expression" in step and arithmetic(step["expression"]) != arithmetic(step["expected"]):
                raise ValueError(f"{rid}: worked calculation is incorrect")
    check_source(rid, r["source"])
    for ref in r["source_references"]:
        check_source(rid, ref)
    checker.cats(";".join(r["cats"]), [])
    checker.cats(";".join(r["application_cats"]), [])
    for name in [r["name"], *r["aliases"]]:
        conflicts = names.get(name.casefold(), set()) - {rid}
        if conflicts:
            raise ValueError(f"{rid}: duplicate name or alias {name}: {sorted(conflicts)}")
        names.setdefault(name.casefold(), set()).add(rid)
    if rid in existing:
        raise ValueError(f"{rid}: refuses to replace an existing catalog record")


def catalog(raw):
    core, detail = unpack(raw, "core"), unpack(raw, "detail")
    keep = [i for i, r in enumerate(core["rows"]) if not r.get("supplement")]
    if keep != list(range(len(keep))):
        raise ValueError("supplement rows are not an append-only suffix")
    return core, detail, len(keep)


def inputs(only=None, data=None):
    """All packs, validated together. Returns the records of every pack and the historical catalog."""
    raw = read_json(VISUAL / "raw.json")
    core, detail, n = catalog(raw)
    existing = {r["id"]: (r, d) for r, d in zip(core["rows"][:n], detail[:n])}
    concepts = {r["id"] for r in unpack(raw, "concepts")["rows"]}
    packs = {p: load(p, data) for p in pack_names(data)}
    owner = {r["id"]: p for p, rs in packs.items() for r in rs}
    ids = set(existing) | set(owner)
    checker = Checker(ids)
    names = {}
    for rid, (r, d) in existing.items():
        for name in [r["n"], *d["al"]]:
            names.setdefault(name.casefold(), set()).add(rid)
    seen = set()
    for p, rs in packs.items():
        for r in rs:
            if r["id"] in seen:
                raise ValueError(f"duplicate record ID across packs: {r['id']}")
            seen.add(r["id"])
            check_record(r, ids, concepts, checker, existing, names)
    by_id = {r["id"]: r for rs in packs.values() for r in rs}
    for r in by_id.values():
        if r["status"] == "candidate":
            bad = [p["id"] for p in r["prerequisites"] if p["id"] in by_id and by_id[p["id"]]["status"] == "deferred"]
            if bad:
                raise ValueError(f"{r['id']}: prerequisite is deferred: {bad[0]}")
    return packs, raw, existing, checker


def fingerprint(r, existing, by_id):
    # The full linked evidence is part of the review input, not only its ID.
    refs = {p["id"]: (existing.get(p["id"]) or by_id.get(p["id"])) for p in r["prerequisites"]}
    return digest([r, refs, PROMPT, REVIEW_PROMPT, read_json(DATA / "rubric.json")])


def accepted(pack, records, existing, by_id, data=None):
    _, jpath = pack_paths(pack, data)
    saved = read_json(jpath) if jpath.is_file() else {}
    return {r["id"]: saved[r["id"]] for r in records
            if r["id"] in saved and saved[r["id"]]["input_sha256"] == fingerprint(r, existing, by_id)}, saved


def pack_state(packs, existing, data=None):
    by_id = {r["id"]: r for rs in packs.values() for r in rs}
    return {p: accepted(p, rs, existing, by_id, data)[0] for p, rs in packs.items()}, by_id


def prepare(pack, batch_size=6, max_chars=48000):
    packs, raw, existing, _ = inputs()
    if pack not in packs:
        raise ValueError(f"unknown pack {pack}")
    records = packs[pack]
    state, by_id = pack_state(packs, {k: v for k, v in existing.items()})
    current = state[pack]
    pending = [r for r in records if r["status"] == "candidate" and r["id"] not in current]
    queue = QUEUE / pack
    queue.mkdir(parents=True, exist_ok=True)
    for old in queue.glob("batch-*.toon"):
        old.unlink()
    prompt = PROMPT + REVIEW_PROMPT + "\nRubric:\n" + to_toon({"rubric_json": json.dumps(raw["rubric"])})
    write_json(queue / "records.json", records)
    (queue / "prompt.toon").write_text(prompt + "\n")
    batches, ids, blocks = [], [], []

    def flush():
        if not ids:
            return
        name = f"batch-{len(batches):03d}"
        text = prompt + "\n\n" + "\n\n".join(blocks) + "\n"
        (queue / f"{name}.toon").write_text(text)
        batches.append({"batch": name, "ids": list(ids), "sha256": sha256_bytes(text.encode()), "chars": len(text)})
        ids.clear()
        blocks.clear()

    for r in pending:
        ev = {"id": r["id"], "name": r["name"], "aliases": r["aliases"], "sources": [pack],
              "uses": {"application": 0, "influence": 0}, "restatements": 0, "tg_matches": 0}
        row = packet_row(ev, {})
        row.update({"statement": r["statement"], "hypotheses": r["hypotheses"], "source": r["source"], "proof": r["proof"],
                    "definitions_json": json.dumps(r["definitions"], ensure_ascii=False),
                    "prerequisite_evidence_json": json.dumps(r["prerequisites"], ensure_ascii=False),
                    "concept_prerequisites": r["concept_prerequisites"], "selection": r["selection"],
                    "applications_json": json.dumps(r["applications"], ensure_ascii=False)})
        # Complete statements and proofs are never truncated to meet the bound.
        refs = {p["id"]: (existing[p["id"]] if p["id"] in existing else by_id[p["id"]]) for p in r["prerequisites"]}
        block = to_toon({"result": row, "linked_evidence_json": json.dumps(refs, ensure_ascii=False)})
        if len(prompt) + len(block) + 4 > max_chars:
            raise ValueError(f"{r['id']}: full proof and linked evidence exceed {max_chars} characters; increase --max-chars")
        if len(ids) >= batch_size or len(prompt) + sum(map(len, blocks)) + len(block) + 2 * len(ids) + 4 > max_chars:
            flush()
        ids.append(r["id"])
        blocks.append(block)
    flush()
    write_json(queue / "index.json", batches)
    return status(packs, state, only=pack, batches=len(batches))


def application_steps(record):
    return {(record["id"], a["id"], s["id"]) for a in record["applications"] for s in a["steps"]}


def check_answer(text, entry, records, checker):
    data = from_toon(text)
    by_id = {r["id"]: r for r in records}
    expected_computations = set().union(*(application_steps(by_id[rid]) for rid in entry["ids"]))
    tables = {"answers", "reviews", "steps"} | ({"computations"} if expected_computations else set())
    if set(data) != tables:
        raise ValueError("answer requires exactly its proof and computation tables")
    computations = data.get("computations", [])
    if len(computations) != len(expected_computations) or {(c["id"], c["application"], c["step"]) for c in computations} != expected_computations:
        raise ValueError("computation reviews must cover every application step exactly once")
    for c in computations:
        if set(c) != COMPUTATION_FIELDS or c["verdict"] not in {"accept", "defer"} or not isinstance(c["why"], str) or len(c["why"].strip()) < 30:
            raise ValueError("each computation requires a verdict and a specific explanation")
    judgments = validate_batch(to_toon({"answers": data["answers"]}), entry["ids"], checker)
    reviews = data["reviews"]
    if not isinstance(reviews, list) or len(reviews) != len(entry["ids"]) or {r["id"] for r in reviews} != set(entry["ids"]):
        raise ValueError("reviews must match every batch ID exactly once")
    expected_steps = {(rid, s["id"]) for rid in entry["ids"] for s in by_id[rid]["proof"]["steps"]}
    steps = data["steps"]
    if not isinstance(steps, list) or len(steps) != len(expected_steps) or {(s["id"], s["step"]) for s in steps} != expected_steps:
        raise ValueError("step reviews must cover every proof step exactly once")
    for review in reviews:
        if set(review) != REVIEW_FIELDS or review["decision"] not in {"accept", "defer"}:
            raise ValueError("invalid review fields or decision")
        if any(not isinstance(review[k], str) or len(review[k].strip()) < 30 for k in ("conditions", "prerequisites", "alignment", "why")):
            raise ValueError("each proof review needs specific explanations")
    for step in steps:
        if set(step) != STEP_FIELDS or step["verdict"] not in {"accept", "defer"} or not isinstance(step["why"], str) or len(step["why"].strip()) < 30:
            raise ValueError("each inference needs a verdict and explanation")
    for j in judgments:
        r = by_id[j["id"]]
        if set(j["pre"]) != {p["id"] for p in r["prerequisites"]} or not set(j["concepts"]) <= set(r["concept_prerequisites"]):
            raise ValueError(f"{j['id']}: answer does not match the named prerequisite results and concepts")
        review = next(v for v in reviews if v["id"] == j["id"])
        st = [s for s in steps if s["id"] == j["id"]]
        cr = [c for c in computations if c["id"] == j["id"]]
        if review["decision"] == "accept" and (any(s["verdict"] != "accept" for s in st) or any(c["verdict"] != "accept" for c in cr)):
            raise ValueError("an accepted result contains a deferred inference")
        j.update({"review": review, "step_reviews": st})
        if cr:
            j["computation_reviews"] = cr
    return judgments


def accept(pack, batch, answer, config):
    packs, raw, existing, checker = inputs()
    if pack not in packs:
        raise ValueError(f"unknown pack {pack}")
    records = packs[pack]
    queue = QUEUE / pack
    index = read_json(queue / "index.json")
    entry = next((b for b in index if b["batch"] == batch), None)
    if entry is None:
        raise ValueError("unknown batch")
    packet = (queue / f"{batch}.toon").read_bytes()
    if sha256_bytes(packet) != entry["sha256"] or read_json(queue / "records.json") != records:
        raise ValueError("queue input changed; prepare it again")
    if any(config.get(k, "unspecified") == "unspecified" for k in ("id", "model", "provider", "session")):
        raise ValueError("new answers require actual judge identity")
    judged = check_answer(Path(answer).read_text(), entry, records, checker)
    by_id = {r["id"]: r for rs in packs.values() for r in rs}
    _, saved = accepted(pack, records, existing, by_id)
    for j in judged:
        j.update({"judge": config, "input_sha256": fingerprint(by_id[j["id"]], existing, by_id),
                  "packet_sha256": entry["sha256"], "answer_sha256": sha256_bytes(Path(answer).read_bytes()),
                  "rubric_version": RUBRIC_VERSION, "reviewed_at": datetime.now(timezone.utc).isoformat()})
        saved[j["id"]] = j
    # No file changes occur before the whole batch passes all checks.
    write_json(pack_paths(pack)[1], saved)
    state, _ = pack_state(packs, existing)
    return status(packs, state, only=pack)


def status(packs, state, only=None, batches=0):
    names = [only] if only else sorted(packs)
    out = {"packs": [], "coverage": [], "deferred": [], "pending": []}
    topics, total = Counter(), Counter()
    for p in names:
        records, current = packs[p], state[p]
        pending = [r["id"] for r in records if r["status"] == "candidate" and r["id"] not in current]
        good = [r for r in records if r["status"] == "candidate" and current.get(r["id"], {}).get("review", {}).get("decision") == "accept"]
        out["packs"].append({"pack": p, "records": len(records), "accepted": len(good),
                             "counted": sum(r["selection"] == "core" for r in good),
                             "support": sum(r["selection"] == "support" for r in good),
                             "deferred": sum(r["status"] == "deferred" for r in records) +
                             sum(current.get(r["id"], {}).get("review", {}).get("decision") == "defer" for r in records),
                             "unresolved": len(pending)})
        for r in good:
            topics.update(r["cats"])
        out["deferred"] += [{"pack": p, "id": r["id"], "reason": (r.get("deferred_reason") or current[r["id"]]["review"]["why"])[:120]}
                            for r in records if r["status"] == "deferred" or current.get(r["id"], {}).get("review", {}).get("decision") == "defer"][:6]
        out["pending"] += [f"{p}:{i}" for i in pending[:6]]
        total.update(accepted=len(good), counted=sum(r["selection"] == "core" for r in good), unresolved=len(pending))
    out["coverage"] = [{"topic": c, "accepted": n} for c, n in sorted(topics.items())]
    out["total"] = {"accepted": total["accepted"], "counted": total["counted"], "unresolved": total["unresolved"], "batches": batches}
    first = next((x["pack"] for x in out["packs"] if x["unresolved"]), None)
    out["next"] = (f"run.py --supplement --pack {first} prepare   then   run.py --supplement --pack {first} accept "
                   "--batch batch-NNN --answer ANSWER --identity IDENTITY") if first else "run.py --supplement build"
    return out


def overlay(raw, data=None):
    """Append the accepted results of every pack to a historical snapshot. Pure: used by build and by the refresh."""
    import assemble
    packs, _, existing, checker = inputs(data=data)
    state, by_id = pack_state(packs, existing, data)
    report = status(packs, state)
    if report["total"]["unresolved"]:
        raise ValueError("unresolved judgments prevent publication; run prepare and accept")
    core, detail, start = catalog(raw)
    core["rows"], detail = core["rows"][:start], detail[:start]
    core["relations"] = [r for r in core["relations"] if not r.get("supplement")]
    if any(r["source"] >= start or r["target"] >= start for r in core["relations"]):
        raise ValueError("existing relations refer to removed supplement rows")
    add = [(p, r) for p in sorted(packs) for r in packs[p]
           if r["status"] == "candidate" and state[p][r["id"]]["review"]["decision"] == "accept"]
    idx = {r["id"]: i for i, r in enumerate(core["rows"])}
    idx.update({r["id"]: start + i for i, (_, r) in enumerate(add)})
    for _, r in add:
        for p in r["prerequisites"]:
            if p["id"] not in idx:
                raise ValueError(f"{r['id']}: prerequisite {p['id']} is not accepted")
    cat_idx = {c[0]: i for i, c in enumerate(raw["taxonomy"]["categories"])}
    concept_pack = unpack(raw, "concepts")
    concept_idx = {r["id"]: i for i, r in enumerate(concept_pack["rows"])}
    concept_pack["rc"] = concept_pack["rc"][:start]
    for c in concept_pack["rows"]:
        c["rx"] = [i for i in c["rx"] if i < start]
    for p, r in add:
        j = state[p][r["id"]]
        pre = [idx[x["id"]] for x in r["prerequisites"]]
        template = {k: None for k in core["rows"][0]}
        template.update({"id": r["id"], "n": r["name"], "t": j["type"], "s": assemble.score_text(j["scores"]),
                         "c": j["conf"], "cat": [cat_idx[c] for c in j["cats"]], "acat": [cat_idx[c] for c in j["acats"]],
                         "lv": assemble.LEVELS.index(j["level"]), "ef": [j["effort"][k] for k in ("understand", "apply", "prove")],
                         "src": [p], "f": 0, "st": assemble.text_tokens(r["statement"]), "stb": "authored",
                         "spb": "no-local-formal-check", "ax": [], "pre": pre, "ua": 0, "ui": 0, "rs": 0, "tg": 0,
                         "ev": "thin", "evk": ["source-proof", "authored-proof"],
                         "q": " ".join([r["name"], *r["aliases"], r["statement"], *r["concepts"]]).lower(),
                         "supplement": SCHEMA})
        core["rows"].append(template)
        source = r["source"]
        literature = source.get("kind") == "literature"
        location = ", ".join(source[k] for k in ("module", "declaration", "page")) if literature else source["declaration"]
        ev = {"id": f"ev:{p}:{r['id']}", "kind": "source statement" if literature else "formal declaration",
              "explicit": True, "url": source["url"], "revision": source["revision"], "location": location,
              "claim": source["excerpt"], "dates": {"observed": r["authored"]},
              "method": "published source inspected; no formal check" if literature else "source text inspected; no local Lean check",
              "reuse": source["reuse"]}
        if literature:
            ev["citation"] = source["citation"]
        if r["proof"]["kind"] == "outline":
            core["rows"][-1]["evk"] = ["source-proof", "cited-outline"]
        detail.append({"al": r["aliases"], "why": j["why"], "why2": None, "cn": r["concepts"], "wd": None, "sig": None,
                       "concl": None, "hyps": None, "cls": None, "mod": None if literature else source["module"],
                       "decls": [] if literature else [source["declaration"]], "ndecls": 0 if literature else 1,
                       "evs": [ev], "rs": [], "list": r["statement"], "authored_statement": r["statement"],
                       "authored_hypotheses": r["hypotheses"], "pack": p, "selection": r["selection"],
                       "definitions": r["definitions"], "applications": r["applications"],
                       "limitations": r.get("limitations", []), "source_references": r["source_references"],
                       "proof": {**r["proof"], "verification":
                                 "outline review accepted; published proof cited; no formal check" if r["proof"]["kind"] == "outline"
                                 else "agent inference review accepted; no local Lean check"},
                       "prerequisite_evidence": r["prerequisites"], "concept_prerequisites": r["concept_prerequisites"],
                       "assessment": j})
        for x in r["prerequisites"]:
            core["relations"].append({"id": f"rel:{p}:{r['id']}:{x['id']}", "type": "prerequisite", "source": idx[r["id"]],
                                      "target": idx[x["id"]], "status": "judged: authored proof dependency",
                                      "evidence": [ev["id"]], "note": x["reason"], "supplement": SCHEMA})
        ci = [concept_idx[c] for c in r["concept_prerequisites"]]
        concept_pack["rc"].append(ci)
        for k in ci:
            concept_pack["rows"][k]["rx"].append(idx[r["id"]])
    cycles = [sorted(c) for c in assemble.tarjan(len(core["rows"]), [r["pre"] for r in core["rows"]]) if len(c) > 1]
    if any(any(i >= start for i in c) for c in cycles):
        raise ValueError("new prerequisite cycle prevents publication")
    core["cycles"] = cycles
    rows = core["rows"]
    cov = raw["coverage"]
    cov["named"].update({"records": len(rows), "scored": sum(r["s"].isdigit() for r in rows),
                         "unscored": sum(not r["s"].isdigit() for r in rows),
                         "by_type": [{"type": t, "records": n, "scored": sum(r["t"] == t and r["s"].isdigit() for r in rows)}
                                     for t, n in Counter(r["t"] for r in rows).most_common()]})
    for key, field in (("statement_length", "stb"), ("proof_length", "spb"), ("evidence", "ev")):
        cov[key] = dict(Counter(r[field] for r in rows))
    cov["relations"] = dict(Counter(r["type"] for r in core["relations"]))
    cov["supplement"] = {"packs": report["packs"], **report["total"]}
    cov["concepts"]["result_concept_links"] = sum(map(len, concept_pack["rc"]))
    cov["concepts"]["results_with_concepts"] = sum(bool(x) for x in concept_pack["rc"])
    raw["packs"].update({"core": assemble.pack(core), "detail": assemble.pack(detail), "concepts": assemble.pack(concept_pack)})
    judges = list({digest(j["judge"]): j["judge"] for p in state.values() for j in p.values()}.values())
    raw["sources"]["supplement"] = {"id": SCHEMA, "packs": {p: {"records_sha256": digest(packs[p]), "judgments_sha256": digest(state[p])}
                                                          for p in sorted(packs)},
                                    "source": "pinned mathlib source excerpts", "reuse": "Apache-2.0; authored proofs and statements for this catalog",
                                    "accepted": len(add), "formal_checks": 0}
    if any(r["source"].get("kind") == "literature" for _, r in add):
        raw["sources"]["supplement"].update(source="Mathlib source excerpts and published literature",
                                              reuse="Each source states its reuse terms; authored explanations for this catalog")
    snapshot = raw["snapshot"]
    snapshot["supplement_judges"] = judges
    if SCHEMA not in snapshot["rules"]:
        snapshot["rules"].append(SCHEMA)
    return raw, report, start


def build():
    import run
    raw = read_json(VISUAL / "raw.json")
    before = copy.deepcopy(raw)
    raw, report, start = overlay(raw)
    snapshot = raw["snapshot"]
    snapshot["source_manifest"] = "manifest/" + digest(raw["sources"])[:16]
    new_id = "te-2026-10-" + digest([raw["packs"]["core"]["sha256"], raw["packs"]["detail"]["sha256"]])[:8]
    if new_id != snapshot["id"]:
        run.keep(before)
        snapshot["previous"] = snapshot["id"]
    snapshot.update({"id": new_id, "coverage_report": "coverage/" + digest(raw["coverage"])[:12]})
    queue = QUEUE
    queue.mkdir(parents=True, exist_ok=True)
    run.OUT.mkdir(parents=True, exist_ok=True)
    write_json(run.OUT / "raw.json", raw, indent=None)
    write_json(run.OUT / "change-report.json", run.change_report(before, raw, snapshot.get("identity_map", [])))
    run.keep(raw)
    run.publish(queue / "publish.log", apply_supplement=False)
    return {**report, "catalog": {"before": len(unpack(before, "core")["rows"]), "after": len(unpack(raw, "core")["rows"])},
            "next": "python3 scripts/check.py theorem-explorer"}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pack", default=None, help=f"the pack name (default {DEFAULT_PACK} for prepare and accept)")
    sub = ap.add_subparsers(dest="command", required=True)
    p = sub.add_parser("prepare")
    p.add_argument("--batch-size", type=int, default=6)
    p.add_argument("--max-chars", type=int, default=48000)
    a = sub.add_parser("accept")
    a.add_argument("--batch", required=True)
    a.add_argument("--answer", type=Path, required=True)
    a.add_argument("--identity", type=Path, required=True)
    sub.add_parser("status")
    sub.add_parser("check")
    sub.add_parser("build")
    args = ap.parse_args(argv)
    pack = args.pack or DEFAULT_PACK
    try:
        if args.command == "prepare":
            if args.batch_size < 1 or args.max_chars < 1000:
                raise ValueError("prompt bounds must be positive and at least 1000 characters")
            result = prepare(pack, args.batch_size, args.max_chars)
        elif args.command == "accept":
            result = accept(pack, args.batch, args.answer, provenance(args.identity))
        elif args.command == "build":
            result = build()
        else:
            packs, _, existing, _ = inputs()
            state, _ = pack_state(packs, existing)
            result = status(packs, state, only=args.pack)
            if args.command == "check":
                result = {"valid": {"packs": sorted(packs) if not args.pack else [args.pack],
                                    "records": sum(len(v) for v in packs.values())}, "next": result["next"]}
        print(to_toon(result))
        return 0
    except (ValueError, KeyError, TypeError, OSError) as e:
        print(to_toon({"error": str(e), "next": "Correct the input. Then repeat the command."}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
