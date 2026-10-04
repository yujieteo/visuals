"""Judgment validation and caching (spec sections 7.1 and 7.5).

The judge (see JUDGE) reads <work>/judge/prompt.txt and one packet, and writes the answer table
<work>/judge/answers/<batch>.toon:

  answers[N]{id,type,eff,res,pra,rea,hyp,pro,app,cats,acats,level,effort,pre,rel,conf,why}:
    <one row per packet result>

A second assessment uses the folder answers-2/ with the same format (spec 7.5).

This stage checks every row: the id belongs to the batch, every component is 0-4, u or na, the categories are
official ids of the pinned taxonomy (an alias is resolved and recorded), the effort bands are 1-5 or x, the
prerequisite ids exist, and the explanation is present. These checks validate form and arithmetic only; they do
not validate the judge's mathematical interpretation.

Each accepted row keeps its cache key: sha256 of the packet row text, the prompt text, the rubric version and the
judge configuration. A later refresh reuses a judgment when its key is unchanged (spec section 13).
"""
import json
import re
import sys

from common import DATA, RUBRIC_VERSION, STAGE, WORK, from_toon, read_json, sha256_bytes, to_toon

JUDGE = {"id": "judge/claude-opus-5-5/e8318084", "model": "claude-opus-5-5", "provider": "Anthropic",
         "access": "in-session judgement by the build worker (Claude Code); no API call",
         "session": "e8318084-009f-42d6-9b12-c19026dac191"}
COMPONENTS = ["eff", "res", "pra", "rea", "hyp", "pro", "app"]
TYPES = {"theorem", "lemma", "inequality", "identity", "principle", "formula", "criterion", "conjecture-proved",
         "construction", "classification", "other-result"}
NOT_RESULT = {"concept", "conjecture", "axiom", "definition", "heuristic", "physics", "method", "open-problem", "list"}
LEVELS = {"school", "undergrad", "graduate", "research"}
RELS = {"special-case-of", "generalizes", "consequence-of", "equivalent", "similar", "influenced"}
CONF = {"high", "medium", "low"}
FIELDS = ["id", "type", *COMPONENTS, "cats", "acats", "level", "effort", "pre", "rel", "conf", "why"]


def split_list(cell):
    return [x.strip() for x in str(cell or "").split(";") if x.strip()]


def score(cell):
    s = str(cell).strip()
    if s in ("u", "na"):
        return s
    if re.fullmatch(r"[0-4]", s):
        return int(s)
    raise ValueError(f"score {s!r} is not 0-4, u or na")


class Checker:
    def __init__(self):
        tax = read_json(DATA / "arxiv-taxonomy.json")
        self.known = {c["id"] for c in tax["categories"]}
        self.aliases = tax["aliases"]
        self.ids = {e["id"] for e in json.loads((STAGE / "evidence.json").read_text(encoding="utf-8"))}

    def cats(self, cell, notes):
        out = []
        for c in split_list(cell):
            if c == "unclassified":
                continue
            canon = self.aliases.get(c, c)
            if canon != c:
                notes.append(f"alias {c} -> {canon}")
            if canon not in self.known:
                raise ValueError(f"category {c!r} is not in the pinned arXiv taxonomy")
            if canon not in out:
                out.append(canon)
        return out

    def row(self, raw, batch_ids):
        notes = []
        rid = raw["id"]
        if rid not in batch_ids:
            raise ValueError(f"{rid}: not in this batch")
        rtype = str(raw["type"]).strip()
        if rtype.startswith("not-a-result:"):
            if rtype.split(":", 1)[1] not in NOT_RESULT:
                raise ValueError(f"{rid}: unknown non-result type {rtype}")
        elif rtype not in TYPES:
            raise ValueError(f"{rid}: unknown type {rtype}")
        scores = {k: score(raw[k]) for k in COMPONENTS}
        level = str(raw["level"]).strip()
        if level not in LEVELS:
            raise ValueError(f"{rid}: level {level!r}")
        effort = str(raw["effort"]).split("/")
        if len(effort) != 3 or any(e not in {"1", "2", "3", "4", "5", "x"} for e in effort):
            raise ValueError(f"{rid}: effort {raw['effort']!r} is not three bands a/b/c")
        pre_results, pre_concepts = [], []
        for p in split_list(raw["pre"]):
            if re.match(r"^(wd|nl|nm):", p):
                if p not in self.ids:
                    raise ValueError(f"{rid}: prerequisite {p} is not a catalog result")
                if p != rid:
                    pre_results.append(p)
            else:
                pre_concepts.append(p)
        rels = []
        for r in split_list(raw["rel"]):
            kind, _, target = r.partition(">")
            if kind not in RELS or target not in self.ids:
                raise ValueError(f"{rid}: relation {r!r}")
            rels.append({"type": kind, "target": target})
        conf = str(raw["conf"]).strip()
        if conf not in CONF:
            raise ValueError(f"{rid}: confidence {conf!r}")
        why = str(raw["why"]).strip()
        if len(why) < 20:
            raise ValueError(f"{rid}: explanation is missing")
        return {"id": rid, "type": rtype, "scores": scores, "cats": self.cats(raw["cats"], notes),
                "acats": self.cats(raw["acats"], notes), "level": level,
                "effort": {"understand": effort[0], "apply": effort[1], "prove": effort[2]},
                "pre": pre_results, "concepts": pre_concepts, "rel": rels, "conf": conf, "why": why,
                **({"notes": notes} if notes else {})}


def packet_rows(text):
    """The packet text of each result, for the cache key."""
    out = {}
    for block in text.strip().split("\n\n"):
        m = re.search(r'^  id: "?([^"\n]+)"?$', block, re.M)
        if m:
            out[m[1]] = block
    return out


def collect(folder="answers"):
    """Validate every answer file in <work>/judge/<folder>/ and return (judgments, problems)."""
    checker = Checker()
    prompt = (WORK / "judge" / "prompt.txt").read_text(encoding="utf-8")
    config = json.dumps(JUDGE, sort_keys=True)
    index = json.loads((WORK / "judge" / "index.json").read_text(encoding="utf-8"))
    out, problems = {}, []
    for entry in index:
        path = WORK / "judge" / folder / f"{entry['batch']}.toon"
        if not path.is_file():
            continue
        packet = (WORK / "judge" / "packets" / f"{entry['batch']}.toon").read_text(encoding="utf-8")
        rows = packet_rows(packet)
        try:
            table = from_toon(path.read_text(encoding="utf-8"))["answers"]
        except Exception as e:  # noqa: BLE001 - reported per file
            problems.append(f"{path.name}: {e}")
            continue
        for raw in table:
            try:
                j = checker.row(raw, set(entry["ids"]))
            except (ValueError, KeyError) as e:
                problems.append(f"{path.name}: {e}")
                continue
            j["batch"] = entry["batch"]
            j["cache_key"] = sha256_bytes("\n".join([rows.get(j["id"], ""), prompt, RUBRIC_VERSION, config]).encode())
            out[j["id"]] = j
    return out, problems


if __name__ == "__main__":
    folder = sys.argv[1] if len(sys.argv) > 1 else "answers"
    judged, problems = collect(folder)
    print(to_toon({"judged": len(judged), "problems": problems or ["none"]}))
    sys.exit(1 if problems else 0)
