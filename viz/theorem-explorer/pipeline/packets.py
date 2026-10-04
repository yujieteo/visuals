"""Judge packets (te-judge-prompt/1, spec section 7.1): the evidence of each named result, in TOON.

For each consolidated named result this stage gathers, from the earlier stages:
  - names, aliases, naming sources, the Wikidata description, the Wikipedia lead passage, the nLab passage
  - the primary formal declaration with its complete elaborated type (never truncated) and its measurements
  - the use, restatement, and TheoremGraph match counts
  - formal prerequisite candidates: the nearest other named results reached through the primary
    declaration's type and proof references (a search that stops at each named declaration it meets)
It writes <work>/stage/evidence.json (one record per result, also read by assemble.py) and the packets
<work>/judge/packets/batch-NNN.toon, about BATCH results each. The calibration results come first, then the
results with the most naming sources, so the default ranks are judged early.

The judge reads PROMPT and the packet, and writes <work>/judge/answers/batch-NNN.toon with one row per result
(judge.py validates it). The packet text, the prompt version, the rubric version and the judge configuration
form the cache key of each answer.
"""
import json
import re
from collections import defaultdict, deque

from common import PROMPT_VERSION, RUBRIC_VERSION, STAGE, WORK, read_json, read_jsonl, sha256_bytes, to_toon
from wiki import CACHE, lead_passage

BATCH = 40
CALIBRATION = ["nm:union-bound", "nm:pigeonhole-principle", "wd:Q4975963", "wd:Q755991"]
SEARCH_LIMIT = 4000

PROMPT = f"""{PROMPT_VERSION} / {RUBRIC_VERSION}
You are the judge of the Theorem Explorer. For each result in the packet, write one row of the answer table:

id        the result id from the packet
type      theorem | lemma | inequality | identity | principle | formula | criterion | conjecture-proved |
          construction | classification | other-result | not-a-result:<concept|conjecture|axiom|definition|
          heuristic|physics|method|open-problem|list>
eff..app  the 7 rubric components, each 0-4, or u (unknown) or na (not applicable); anchors in rubric.json.
          Use u only when no evidence or knowledge supports any score. Thin evidence lowers conf instead.
cats      the theorem's arXiv categories (official ids, ';' separated, most central first) or unclassified
acats     the arXiv categories where the result is applied (';' separated) or unclassified
level     the reader level that a learner needs: school | undergrad | graduate | research
effort    effort bands for understand/apply/prove, each 1-5 (1 = under 1 hour, 2 = hours, 3 = days,
          4 = weeks, 5 = months); x when the depth does not apply
pre       prerequisites (';' separated): result ids from the packet or the catalog, or concept names
rel       optional relations (';' separated) as type>target, where type is special-case-of | generalizes |
          consequence-of | equivalent | similar | influenced
conf      high | medium | low: evidence completeness and the consistency of the judgment
why       the explanation, in ASD-STE100 Simplified Technical English, with the evidence that sets the scores
Keep explicit source claims separate from inference: the why text says which part comes from a source.
"""


def nearest_named(start, graph, named, limit=SEARCH_LIMIT):
    """Named declarations first reached from start through references; the search stops at each of them."""
    seen, out = {start}, []
    queue = deque(graph.get(start, ()))
    while queue and len(seen) < limit:
        d = queue.popleft()
        if d in seen:
            continue
        seen.add(d)
        if d in named:
            out.append(d)
            continue
        queue.extend(graph.get(d, ()))
    return out


def evidence_records():
    consolidated = read_json(STAGE / "consolidated.json")
    results = consolidated["results"]
    wikidata = read_json(CACHE / "wikidata.json")
    wikipedia = read_json(CACHE / "wikipedia.json")
    decl_of = {}
    for r in results:
        for d in r["decls"]:
            decl_of.setdefault(d["decl"], r["id"])
    need = set(decl_of)
    graph, mrec = {}, {}
    for row in read_jsonl(STAGE / "mathlib.jsonl.gz"):
        graph[row["n"]] = [d for d in dict.fromkeys(row.get("tdeps", []) + row.get("vdeps", []))]
        if row["n"] in need:
            mrec[row["n"]] = row
    uses = defaultdict(lambda: {"application": 0, "influence": 0})
    for u in read_jsonl(STAGE / "uses.jsonl.gz"):
        uses[u["result"]][u["type"]] += 1
    restate = defaultdict(int)
    for s in read_jsonl(STAGE / "restatements.jsonl.gz"):
        restate[s["result"]] += 1
    tg = defaultdict(int)
    for link in read_json(STAGE / "theoremgraph.json")["links"]:
        tg[link["result"]] += 1
    named = set(decl_of)
    out = []
    for r in results:
        qid = r.get("wikidata", {}).get("qid")
        wd = wikidata.get(qid, {}) if qid and re.fullmatch(r"Q\d+", qid) else {}
        wp = wikipedia.get(wd.get("enwiki") or "", {})
        ev = {"id": r["id"], "name": r["name"], "aliases": r["aliases"][:6], "sources": r["sources"]}
        if wd.get("description"):
            ev["wd_description"] = wd["description"]
        if wp.get("extract"):
            ev["wp"] = {"title": wp["title"], "revision": wp["revision"], "timestamp": wp["timestamp"],
                        "passage": lead_passage(wp["extract"])}
        if wd:
            ev["wd"] = {"qid": qid, "revision": wd.get("revision"), "modified": wd.get("modified"),
                        "P575": wd.get("P575"), "P61": wd.get("P61"), "P138": wd.get("P138")}
        if r.get("nlab"):
            ev["nlab"] = r["nlab"]
        if r.get("wikidata"):
            ev["list"] = r["wikidata"]
        p = r["primary"]
        if p and p in mrec:
            m = mrec[p]
            ev["primary"] = {"decl": p, "module": m["m"], "kind": m["k"], "sig": m["sig"], "hyps": m.get("hyps", []),
                             "st": m.get("st"), "sp": m.get("sp"), "ax": m.get("ax", [])}
            cands = [decl_of[d] for d in nearest_named(p, graph, named) if decl_of[d] != r["id"]]
            ev["formal_pre"] = list(dict.fromkeys(cands))
        ev["decl_count"] = len(r["decls"])
        ev["uses"] = dict(uses.get(r["id"], {"application": 0, "influence": 0}))
        ev["restatements"] = restate.get(r["id"], 0)
        ev["tg_matches"] = tg.get(r["id"], 0)
        out.append(ev)
    return out


def order(evs):
    first = {rid: i for i, rid in enumerate(CALIBRATION)}
    return sorted(evs, key=lambda e: (first.get(e["id"], 99), -len(e["sources"]),
                                      -(e["uses"]["application"] + e["uses"]["influence"] + e["restatements"]),
                                      e["id"]))


def packet_row(ev, names):
    row = {"id": ev["id"], "name": ev["name"]}
    if ev["aliases"]:
        row["aliases"] = ev["aliases"][:4]
    row["sources"] = ev["sources"]
    if ev.get("wd_description"):
        row["description"] = ev["wd_description"]
    if ev.get("wp"):
        row["wikipedia"] = ev["wp"]["passage"][:500]
    if ev.get("nlab"):
        row["nlab"] = (ev["nlab"].get("passage") or "")[:400]
        if ev["nlab"].get("categories"):
            row["nlab_categories"] = ev["nlab"]["categories"][:5]
    if ev.get("list", {}).get("statement"):
        row["list_statement"] = ev["list"]["statement"]
    if ev.get("primary"):
        pr = ev["primary"]
        row["formal"] = {"decl": pr["decl"], "type": pr["sig"], "statement_tokens": pr["st"],
                         "proof_tokens": pr["sp"], "hypotheses": len(pr["hyps"])}
    if ev.get("formal_pre"):
        row["formal_prerequisites"] = [f"{x} {names[x]}" for x in ev["formal_pre"][:8]]
    row["evidence_counts"] = {"applications": ev["uses"]["application"], "influences": ev["uses"]["influence"],
                              "restatements": ev["restatements"], "theoremgraph": ev["tg_matches"]}
    return row


def build():
    evs = order(evidence_records())
    (STAGE / "evidence.json").write_text(json.dumps(evs, ensure_ascii=False), encoding="utf-8")
    names = {e["id"]: e["name"] for e in evs}
    folder = WORK / "judge" / "packets"
    folder.mkdir(parents=True, exist_ok=True)
    index = []
    for b in range(0, len(evs), BATCH):
        rows = [packet_row(e, names) for e in evs[b:b + BATCH]]
        text = "\n\n".join(to_toon({"result": row}) for row in rows) + "\n"
        name = f"batch-{b // BATCH:03d}"
        (folder / f"{name}.toon").write_text(text, encoding="utf-8")
        index.append({"batch": name, "ids": [r["id"] for r in rows], "sha256": sha256_bytes(text.encode())})
    (WORK / "judge" / "prompt.txt").write_text(PROMPT, encoding="utf-8")
    (WORK / "judge" / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
    return len(evs), len(index)


if __name__ == "__main__":
    print(build())
