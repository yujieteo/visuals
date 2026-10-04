"""Use records, restatements, and paper activity from the TheoremSearch public dataset (te-use-rule/1, spec
sections 3.1 and 10).

Input: <work>/stage/ts-papers.jsonl.gz and ts-theorems.jsonl.gz (theoremsearch.py), and the consolidated named
results (consolidate.py). Each TheoremSearch statement is a source passage in an arXiv paper.

Name index. Every result name and alias that contains a result word (names.NAME_WORDS), has at least two words,
does not start with a generic word (GENERIC), and belongs to exactly one consolidated result.

te-use-rule/1, applied to every statement body:
  1. Find each phrase that ends at a result word and equals an indexed name after names.normalize(), longest
     phrase first (at most 8 words, inside one sentence).
  2. Classify the mention by the 40 characters before it:
       application  APPLY cue just before the name ("by", "using", "applying", "via", "follows from", ...)
       influence    INFLUENCE cue just before the name ("a generalization of", "an analogue of", ...)
       mention      anything else: recorded in the counts only, never as a use (spec section 10.2)
  3. One use record per (result, paper, year, use type); repeated mentions and versions of a paper join it.
     The year is the first-version year of the arXiv identifier (a publication date of the source document).
  4. A statement whose own name has a parenthetical part that equals an indexed name, as in "Theorem 2.1
     (Mean value theorem)", is a candidate restatement of that result: kept unnamed and unscored, linked to it.

Research activity: each paper counts once in its first-version year, as 1/k in each of its k distinct
canonical categories (aliases resolved through the pinned taxonomy).
"""
import re
from collections import Counter, defaultdict

from common import DATA, STAGE, USE_RULE_VERSION, read_json, read_jsonl, write_jsonl
from names import NAME_WORDS, normalize

RULE = USE_RULE_VERSION
GENERIC = {"main", "following", "above", "previous", "first", "second", "third", "next", "same", "this", "that",
           "our", "a", "an", "new", "general", "key", "basic", "standard", "usual", "classical", "well-known",
           "famous", "last", "preceding", "technical", "auxiliary", "crucial", "important", "local", "global",
           "weak", "strong", "fundamental", "structure", "uniqueness", "existence", "comparison", "triangle",
           "maximum", "minimum", "approximation", "convergence", "compactness", "density", "stability",
           "regularity", "embedding", "extension", "trace", "index", "fixed point", "mean value",
           "representation", "classification", "duality", "decomposition", "factorization", "residue",
           "product", "chain", "sum", "division", "change of variables", "inverse function", "implicit function"}
_RESULT_WORD = re.compile(r"\b(?:" + "|".join(NAME_WORDS) + r")\b")
APPLY = re.compile(r"(?:\bby|\busing|\buse of|\bapplying|\bapply|\bapplied to|\bapplication of|\bvia|\bthanks to|"
                   r"\binvoking|\bfollows from|\bconsequence of|\bfrom|\bin view of|\bbased on)"
                   r"(?:\s+(?:the|a|an))?\s*$")
INFLUENCE = re.compile(r"(?:generali[sz]ation|generali[sz]es|generali[sz]ing|extension|extends|extending|"
                       r"analog(?:ue)?|variant|version|refinement|refines|strengthening|strengthens|improvement|"
                       r"improves|sharpening|sharpens|counterpart|converse|quantitative form|extended)"
                       r"(?:\s+of)?(?:\s+(?:the|a|an))?\s*$")
_ARXIV_NEW = re.compile(r"^(\d{2})(\d{2})\.\d{4,5}")
_ARXIV_OLD = re.compile(r"/(\d{2})(\d{2})\d{3}")
_PAREN = re.compile(r"\(([^()]{4,90})\)")
_TEX = re.compile(r"\\(?:emph|textit|textbf|textsc|text)\{([^{}]*)\}")


def arxiv_year(paper_id):
    m = _ARXIV_NEW.match(paper_id) or _ARXIV_OLD.search(paper_id)
    if not m:
        return None
    yy = int(m[1])
    return 2000 + yy if yy < 91 else 1900 + yy


def base_id(paper_id):
    return re.sub(r"v\d+$", "", paper_id)


def name_index(results):
    owners = defaultdict(set)
    for r in results:
        for a in [r["name"], *r["aliases"]]:
            key = normalize(a)
            words = key.split()
            if len(words) < 2 or not _RESULT_WORD.search(key):
                continue
            head = " ".join(words[:-1])
            if words[0] in GENERIC or head in GENERIC:
                continue
            owners[key].add(r["id"])
    return {k: next(iter(v)) for k, v in owners.items() if len(v) == 1}


def canonical(cat, aliases, known):
    cat = aliases.get(cat, cat)
    return cat if cat in known else None


def clean_text(body):
    return re.sub(r"\s+", " ", _TEX.sub(r"\1", body or "")).strip()


def scan(text, index, maxlen):
    """(start, end, result id) of each indexed name in text, longest first, without overlaps."""
    low = text.lower()
    hits, taken = [], []
    for m in _RESULT_WORD.finditer(low):
        end = m.end()
        start_limit = max(0, low.rfind(".", 0, m.start()) + 1)
        words = list(re.finditer(r"[^\s(),;:]+", low[start_limit:end]))
        for n in range(min(len(words), 8), 1, -1):
            w = words[-n]
            s = start_limit + w.start()
            key = normalize(low[s:end])
            if len(key) <= maxlen and key in index:
                if not any(a < end and s < b for a, b in taken):
                    hits.append((s, end, index[key]))
                    taken.append((s, end))
                break
    return hits


def build():
    tax = read_json(DATA / "arxiv-taxonomy.json")
    known = {c["id"] for c in tax["categories"]}
    aliases = tax["aliases"]
    consolidated = read_json(STAGE / "consolidated.json")
    index = name_index(consolidated["results"])
    maxlen = max(map(len, index))
    papers = {}
    for p in read_jsonl(STAGE / "ts-papers.jsonl.gz"):
        cats = []
        for c in [p["primary_category"], *p["categories"]]:
            cc = canonical(c, aliases, known)
            if cc and cc not in cats:
                cats.append(cc)
        papers[p["paper_id"]] = {"cats": cats, "primary": canonical(p["primary_category"], aliases, known),
                                 "year": arxiv_year(p["paper_id"]), "title": p["title"], "license": p["license"]}
    uses, restatements, counts = {}, [], Counter()
    for t in read_jsonl(STAGE / "ts-theorems.jsonl.gz"):
        counts["statements"] += 1
        paper = papers.get(t["paper_id"])
        if paper is None:
            counts["statements without paper"] += 1
            continue
        for m in _PAREN.finditer(t["name"] or ""):
            rid = index.get(normalize(clean_text(m[1])))
            if rid:
                restatements.append({"result": rid, "theorem_id": t["theorem_id"], "paper": t["paper_id"],
                                     "label": t["name"], "body": t["body"], "parse": t["parsing_method"]})
                counts["restatements"] += 1
                break
        text = clean_text(t["body"])
        for s, e, rid in scan(text, index, maxlen):
            before = text[max(0, s - 40):s].lower()
            kind = "application" if APPLY.search(before) else "influence" if INFLUENCE.search(before) else None
            counts[f"mention {kind or 'only'}"] += 1
            if not kind:
                continue
            key = (rid, base_id(t["paper_id"]), kind)
            if key in uses:
                uses[key]["mentions"] += 1
                continue
            lo, hi = max(0, s - 160), min(len(text), e + 160)
            uses[key] = {"result": rid, "paper": base_id(t["paper_id"]), "year": paper["year"], "type": kind,
                         "theorem_id": t["theorem_id"], "passage": text[lo:hi], "mentions": 1,
                         "paper_cats": paper["cats"], "paper_primary": paper["primary"]}
    activity = defaultdict(lambda: defaultdict(float))
    no_year = 0
    for p in papers.values():
        if p["year"] is None:
            no_year += 1
            continue
        k = len(p["cats"])
        for c in p["cats"]:
            activity[p["year"]][c] += 1 / k
        if not k:
            activity[p["year"]]["unclassified"] += 1
    use_rows = sorted(uses.values(), key=lambda u: (u["result"], u["paper"], u["type"]))
    write_jsonl(STAGE / "uses.jsonl.gz", use_rows)
    write_jsonl(STAGE / "restatements.jsonl.gz", restatements)
    counts.update({"papers": len(papers), "papers without year": no_year, "use records": len(use_rows),
                   "indexed names": len(index)})
    return {"rule": RULE, "counts": dict(counts),
            "activity": {str(y): {c: round(v, 4) for c, v in sorted(cs.items())} for y, cs in sorted(activity.items())}}


if __name__ == "__main__":
    import json
    out = build()
    print(json.dumps(out["counts"], indent=1))
