"""Concept catalog assembly (tc-assemble/1): the concept universe, its judgements and the arXiv popularity -> two
more packs in raw.json.

Inputs:
  <work>/stage/concept-universe.json.gz   concept_universe.py (tc-universe/1)
  <work>/stage/arxiv-papers.jsonl.gz      arxiv.py (tc-arxiv/1)
  data/concepts.json                      the full judge's answers (tc-judge-prompt/1): the core concepts
  data/concepts-light.json                the light judge's answers (tc-judge-light/1): every other member
  data/concept-rubric.json                tc-rubric/1
  raw.json                                the result catalog (its key concepts and its names)

A member enters the catalog when the full judge assessed it, or when the light judge kept it (keep 1). Variants
then fold into one concept (tc-merge/1, merge()): equal names once the last word is made singular, and light
members renamed to a fully judged concept's name or alias. Its
prerequisites are the full judge's for a core concept, else the member's documented nLab Idea and Definition
links to other catalog concepts (not judged). Its definition is the full judge's sentence, else the quoted nLab
Idea passage, else the quoted Mathlib doc comment. Its arXiv phrases are the full judge's, else its name and the
plural of its name when the light judge marked them safe (ph 1); a concept with no phrase is not counted.

popularity.count() then counts the papers that name each concept and each result (tc-popularity/1). The pack keeps
the counts per tag and per year bin: one year, or two or five when the one-year pack would pass 2.5 MB compressed
(tc-bins/1), so the page stays small; the bin is recorded.

Output: raw.json with packs.concepts, packs.popularity, concept_rubric, sources.concepts, sources.arxiv and
coverage.concepts, and the concept rules in snapshot.rules. Run `python3 concepts.py [raw.json]`: it rewrites the
given raw.json (default <work>/out/raw.json, after assemble.py) in place.
"""
import gzip
import json
import re
import sys
from collections import Counter, defaultdict

import popularity
from assemble import pack
from common import DATA, STAGE, WORK, pins, read_json, write_json
from names import normalize
from uses import name_index

RULE = "tc-assemble/1"
BIN_RULE = "tc-bins/1"
MAX_GZ = 2_500_000
LEVELS = ["school", "undergrad", "graduate", "research"]
JUDGE_FULL = "tc-judge-prompt/1"
JUDGE_LIGHT = "tc-judge-light/1"


def plural(name):
    words = name.split(" ")
    w = words[-1]
    if re.search(r"(s|x|z|ch|sh)$", w):
        w += "es"
    elif re.search(r"[^aeiou]y$", w):
        w = w[:-1] + "ies"
    else:
        w += "s"
    return " ".join([*words[:-1], w])


def clean_idea(text):
    """An nLab Idea passage without footnote marks and quote or emphasis markers at its start."""
    text = re.sub(r"\[\^[^\]]*\]", "", text or "")
    return re.sub(r"^[>*\s]+", "", text).strip()


def singular(key):
    """The key with its last word made singular, for matching variants only (tc-merge/1)."""
    words = key.split(" ")
    w = words[-1]
    if re.search(r"[^aeiou]ies$", w):
        w = w[:-3] + "y"
    elif re.search(r"(ss|x|ch|sh|z)es$", w):
        w = w[:-2]
    elif re.search(r"[^su]s$", w) and len(w) > 3:
        w = w[:-1]
    return " ".join([*words[:-1], w])


def merge(members, full):
    """Fold variants into one concept (tc-merge/1): members whose names, made singular, are equal, and a light
    member whose final name (after the light judge's renaming) is a fully judged concept's name, alias or merged
    candidate key. The survivor is the fully judged member, else the one with an nLab page, else the first; it
    gains the others' result links, documented links, nLab page and Mathlib declaration where it has none."""
    owner, out, folded = {}, [], 0
    for m, f, a in members:
        names = [m["name"]] + ([f["name"], *f["al"]] if f else [a[3]] if a[3] else []) + list(m["keys"]) + (f["from"] if f else [])
        keys = {singular(normalize(n)) for n in names if n}
        hit = next((owner[k] for k in keys if k in owner), None)
        if hit is not None and f and hit[1]:
            hit = None  # two fully judged concepts stay apart, even when they share a name (e.g. "lattice")
        if hit is None:
            entry = [m, f, a]
            out.append(entry)
            for k in keys:
                owner.setdefault(k, entry)
            continue
        folded += 1
        sm, sf, _ = hit
        if f and not sf:  # a fully judged member always survives
            hit[0], hit[1], hit[2] = m, f, None
            m, sm = sm, m
        sm["results"] = sorted(set(sm.get("results", [])) | set(m.get("results", [])))
        sm["links"] = list(dict.fromkeys(sm.get("links", []) + m.get("links", [])))[:8]
        sm["keys"] = list(dict.fromkeys(sm["keys"] + m["keys"]))
        for fld in ("nlab", "mathlib"):
            if fld in m and fld not in sm:
                sm[fld] = m[fld]
        for k in keys:
            owner.setdefault(k, hit)
    return [tuple(e) for e in out], folded


def unpack(raw, name):
    import base64
    return json.loads(gzip.decompress(base64.b64decode(raw["packs"][name]["gz"])))


def bin_counts(out, bin_w):
    y0, y1 = out["years"]
    nb = (y1 - y0) // bin_w + 1
    den = [[0] * nb for _ in out["tags"]]
    # The last tag, "all", holds every paper with a known category, so its row is the overall denominator.
    for t, y, n in out["papers"]:
        den[t][(y - y0) // bin_w] += n
    items = {}
    for iid, cells in out["items"].items():
        acc = defaultdict(int)
        for t, y, n in cells:
            acc[(t, (y - y0) // bin_w)] += n
        flat = []
        for (t, b), n in sorted(acc.items()):
            flat += [t, b, n]
        items[iid] = flat
    return den, items


def build(raw_path):
    raw = read_json(raw_path)
    tax = raw["taxonomy"]
    cat_idx = {c[0]: i for i, c in enumerate(tax["categories"])}
    core_rows = unpack(raw, "core")["rows"]
    detail = unpack(raw, "detail")
    rid = {r["id"]: i for i, r in enumerate(core_rows)}
    universe = json.loads(gzip.open(STAGE / "concept-universe.json.gz", "rt", encoding="utf-8").read())
    full = {c["id"]: c for c in read_json(DATA / "concepts.json")}
    light = {a[0]: a for a in read_json(DATA / "concepts-light.json")}
    dropped = Counter()
    members = []
    for m in universe:
        if m["id"] in full:
            members.append((m, full[m["id"]], None))
        elif m["id"] in light:
            a = light[m["id"]]
            if a[1] == 1:
                members.append((m, None, a))
            else:
                dropped[a[2]] += 1
        else:
            dropped["unjudged"] += 1
    members, folded = merge(members, full)
    cidx = {m["id"]: i for i, (m, _, _) in enumerate(members)}
    # Documented links to a folded member point at its survivor.
    alias_id = {}
    for m, _, _ in members:
        for k in m["keys"]:
            alias_id.setdefault(k, m["id"])

    # The key concepts of each result -> concept indices, through every member key and the full judge's names.
    key_owner = {}
    # The full judge's merged candidate keys and names first, so its sense of a shared word wins.
    for i, (m, f, _) in enumerate(members):
        if f:
            for k in [*f["from"], normalize(f["name"]), *[normalize(a) for a in f["al"]]]:
                key_owner.setdefault(k, i)
    for i, (m, f, _) in enumerate(members):
        for k in m["keys"]:
            key_owner.setdefault(k, i)
    rc = []
    for r, x in zip(core_rows, detail):
        got = []
        if not r["t"].startswith("not-a-result"):
            for name in x.get("cn") or []:
                j = key_owner.get(normalize(name))
                if j is not None and j not in got:
                    got.append(j)
        rc.append(got)
    rx = defaultdict(list)
    for i, got in enumerate(rc):
        for j in got:
            rx[j].append(i)

    decls = json.loads(gzip.open(STAGE / "mathlib-decls.json.gz", "rt", encoding="utf-8").read())
    first_key = {m["id"]: m["keys"][0] for m in universe if m["keys"]}

    def resolve(cid):
        """A link's concept id, or the id of the survivor it was folded into."""
        if cid in cidx:
            return cid
        return alias_id.get(first_key.get(cid, ""), cid)

    rows, texts, items = [], [], {}
    for i, (m, f, a) in enumerate(members):
        nl = m.get("nlab")
        ml = m.get("mathlib")
        if f:
            name, kind, s, c, lv, ef = f["name"], f["kind"], f["s"], f["c"], f["lv"], f["ef"]
            cats = [cat_idx[x] for x in f["cat"] if x in cat_idx]
            pre = [cidx[p] for p in f["pre"] if p in cidx]
            pk = "judged"
            decl = f.get("mathlib") or (ml or {}).get("decl")
            pat = f["pat"]
            text = {"def": f["def"], "defb": "judge", "al": f["al"], "why": f["why"]}
        else:
            name = a[3] or m["name"]
            kind, s, c, lv = a[2], a[4], a[5], a[6]
            ef = list(a[8])
            cats = [cat_idx[x] for x in a[7].split(";") if x in cat_idx]
            pre = list(dict.fromkeys(cidx[q] for q in (resolve(p) for p in m.get("links", [])) if q in cidx and cidx[q] != i))
            pk = "documented: nLab Idea and Definition links (not judged)"
            decl = (ml or {}).get("decl")
            base = normalize(name)
            pat = [base, plural(base)] if a[9] == 1 else []
            idea = clean_idea((nl or {}).get("idea"))
            doc = (ml or {}).get("doc") or ""
            text = {"def": idea or doc or None, "defb": "nLab Idea passage (quoted)" if idea else "mathlib doc comment (quoted)" if doc else None,
                    "al": [], "why": None}
        d = decls.get(decl) if decl else None
        text.update({"pat": pat, "idea": clean_idea((nl or {}).get("idea")) or None, "doc": (d or {}).get("doc") or None})
        rows.append({
            "id": m["id"], "n": name, "k": kind, "s": s, "c": c, "j": 2 if f else 1, "cat": cats, "lv": lv, "ef": ef,
            "pre": pre, "pk": pk, "decl": decl, "dv": 1 if d else 0, "mf": d["files"] if d else None,
            "mod": d["mod"] if d else None, "ln": d["line"] if d else None,
            "nl": nl["name"] if nl else None, "np": nl["page"] if nl else None, "nb": nl["backlinks"] if nl else None,
            "rx": rx.get(i, []), "amb": 1 if (f and f.get("amb")) else 0, "ap": None,
            "q": " ".join([name, *text["al"], kind, decl or "", (nl or {}).get("name", "")]).lower(),
        })
        texts.append(text)
        if pat:
            items[f"c{i}"] = pat

    # Result phrases (te-use-rule/1 name index) and one count over every paper.
    results = [{"id": r["id"], "name": r["n"], "aliases": x["al"]} for r, x in zip(core_rows, detail) if not r["t"].startswith("not-a-result")]
    for key, owner in name_index(results).items():
        items.setdefault(f"r{rid[owner]}", []).append(key)
    out = popularity.count(items)
    for k, n in out["item_totals"].items():
        if k[0] == "c":
            rows[int(k[1:])]["ap"] = n
    for i, r in enumerate(rows):
        if r["ap"] is None and texts[i]["pat"]:
            r["ap"] = 0
    for bin_w in (1, 2, 5):
        den, binned = bin_counts(out, bin_w)
        pop = {"rule": popularity.RULE, "bin_rule": BIN_RULE, "years": out["years"], "bin": bin_w, "tags": out["tags"],
               "ncat": out["ncat"], "narch": out["narch"], "den": den,
               "c": {k[1:]: v for k, v in binned.items() if k[0] == "c"},
               "r": {k[1:]: v for k, v in binned.items() if k[0] == "r"}}
        packed = pack(pop)
        if packed["gz_bytes"] <= MAX_GZ:
            break
    concepts = {"rule": RULE, "rows": rows, "text": texts, "rc": rc}
    raw["packs"]["concepts"] = pack(concepts)
    raw["packs"]["popularity"] = packed
    raw["concept_rubric"] = read_json(DATA / "concept-rubric.json")
    p = pins()
    raw["sources"]["arxiv"] = {
        "id": "arxiv-metadata", "source": p["arxiv"]["object"], "generation": p["arxiv"]["generation"], "version": f"generation {p['arxiv']['generation']}",
        "retrieved": p["observed"], "last_modified": p["arxiv"]["updated"], "rule": popularity.RULE, "norm": "tc-norm/1",
        "papers": sum(n for _, n in out["totals"]), "years": out["years"], "phrases": out["phrases"],
        "reuse": "arXiv metadata (titles, abstracts, categories) is released by arXiv under CC0 1.0; only counts are kept here.",
        "scope": "the arXiv metadata file in arXiv's public bulk-data bucket at the pinned generation (papers to August 2020); titles and abstracts only, not full texts",
    }
    raw["sources"]["concepts"] = {
        "id": "concept-catalog", "rule": RULE, "universe": "tc-universe/1", "judge": raw["snapshot"]["judge"]["id"],
        "prompts": [JUDGE_FULL, JUDGE_LIGHT], "rubric": "tc-rubric/1", "decl_rule": "tc-decl-text/1",
        "reuse": "nLab Idea passages are quoted with acknowledgement (nLab terms); Mathlib doc comments are Apache-2.0; judge text is authored for this catalog.",
    }
    kinds = Counter(r["k"] for r in rows)
    raw["coverage"]["concepts"] = {
        "universe": len(universe), "catalog": len(rows), "folded": folded, "full": sum(r["j"] == 2 for r in rows), "light": sum(r["j"] == 1 for r in rows),
        "dropped": dict(dropped), "kinds": dict(kinds),
        "with_nlab": sum(r["nl"] is not None for r in rows), "with_mathlib": sum(r["decl"] is not None for r in rows),
        "mathlib_verified": sum(r["dv"] for r in rows), "with_results": sum(bool(r["rx"]) for r in rows),
        "counted_on_arxiv": sum(r["ap"] is not None for r in rows), "named_on_arxiv": sum(bool(r["ap"]) for r in rows),
        "result_concept_links": sum(len(x) for x in rc), "results_with_concepts": sum(bool(x) for x in rc),
        "prerequisites_judged": sum(len(r["pre"]) for r in rows if r["j"] == 2),
        "prerequisites_documented": sum(len(r["pre"]) for r in rows if r["j"] == 1),
        "levels": dict(Counter(LEVELS[r["lv"]] for r in rows)), "confidence": dict(Counter(r["c"] for r in rows)),
    }
    for rule in ("tc-merge/1", "tc-universe/1", "tc-rubric/1", JUDGE_FULL, JUDGE_LIGHT, popularity.RULE, "tc-arxiv/1", "tc-norm/1", BIN_RULE, RULE):
        if rule not in raw["snapshot"]["rules"]:
            raw["snapshot"]["rules"].append(rule)
    write_json(raw_path, raw, indent=None)
    return raw["coverage"]["concepts"], {k: raw["packs"][k]["gz_bytes"] for k in ("concepts", "popularity")}, packed and pop["bin"]


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else WORK / "out" / "raw.json"
    cov, sizes, bin_w = build(target)
    print(json.dumps(cov, indent=1), sizes, "bin", bin_w)
