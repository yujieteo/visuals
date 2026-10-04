"""Named-result consolidation (consolidate-rule/1, spec section 4.1).

Candidates come from the naming sources in names.py (wikidata, freek100, overview, undergrad, docstring) and
from nlab.py. Two candidates join one result when
  - their names or aliases are equal after names.normalize(), or equal after a possessive "'s" is removed, or
  - they name the same kept mathlib declaration (a list's decl and a docstring's bold name on that declaration;
    two docstring names on one declaration only link),
unless the join would put two different Wikidata items or two different nLab pages in one result. A refused
join is kept as a candidate link between the two results (an uncertain identity), never merged.

A result's ID is "wd:<Q-id>" when it has a Wikidata item, else "nl:<page>" for an nLab page, else
"nm:<normalised name>". Its display name is the first available of: Wikidata label, list title, nLab name,
docstring name, overview leaf; its formal declarations keep the source that linked each one.

The primary declaration is the first available of: a list decl (wikidata, then freek100), an overview leaf,
then the docstring declaration with the most direct dependents (ties: fewer statement tokens, then name).
"""
import re
import unicodedata
from collections import defaultdict

from common import DATA, NAME_RULE_VERSION, STAGE, WORK, read_json, read_jsonl, write_json
from names import bold_names, decls_of, has_name_word, mathlib_lists, normalize

RULE = "consolidate-rule/1"


def base_qid(key):
    """The Wikidata item of a 1000+ list key: "Q4724004A" and "Q180345X" are variants under Q4724004 and Q180345."""
    m = re.match(r"Q\d+", key)
    return m[0] if m else key


def possessive_free(key):
    return re.sub(r"'s?\b", "", key).replace("  ", " ").strip()


class Union:
    def __init__(self, n):
        self.parent = list(range(n))

    def find(self, i):
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i


def candidates(lists, wikidata, nlab_rows, kept, curated=()):
    """Every naming-source candidate as {source, key, name, aliases, decls, ...}."""
    out = []
    for qid, item in lists["wikidata"].items():
        # a variant key (Q...A, Q...X) is a result beside its base item: it keeps the list title as its name
        wd = wikidata.get(qid, {}) if base_qid(qid) == qid else {}
        aliases = [item.get("title", "")] + ([wd["label"]] if wd.get("label") else []) + wd.get("aliases", [])
        out.append({"source": "wikidata", "qid": qid, "name": wd.get("label") or item.get("title") or qid,
                    "title": item.get("title"), "aliases": [a for a in aliases if a],
                    "decls": [(d, "wikidata") for d in decls_of(item) if d in kept],
                    "missing_decls": [d for d in decls_of(item) if d not in kept],
                    "statement": item.get("statement"), "authors": item.get("authors"), "date": item.get("date"),
                    "url": item.get("url"), "comment": item.get("comment")})
    for num, item in lists["freek100"].items():
        out.append({"source": "freek100", "freek": num, "name": item.get("title", f"Freek {num}"),
                    "aliases": [item.get("title", "")], "decls": [(d, "freek100") for d in decls_of(item) if d in kept],
                    "missing_decls": [d for d in decls_of(item) if d not in kept], "authors": item.get("authors"),
                    "note": item.get("note")})
    for which in ("overview", "undergrad"):
        for path, leaf, target in lists[which]:
            # a leaf names a result when it points at a theorem, or when its own name is a result name
            if kept.get(target, {}).get("k") == "theorem" or (target in kept and has_name_word(leaf)):
                out.append({"source": which, "name": leaf, "aliases": [leaf], "path": path,
                            "decls": [(target, which)], "missing_decls": []})
    by_name = defaultdict(list)
    for name, r in kept.items():
        if r["k"] == "theorem":
            for b in bold_names(r.get("doc")):
                by_name[normalize(b)].append((b, name))
    for key, hits in sorted(by_name.items()):
        out.append({"source": "docstring", "name": hits[0][0], "aliases": sorted({b for b, _ in hits}),
                    "decls": [(d, "docstring") for _, d in hits], "missing_decls": []})
    for item in curated:
        out.append({"source": "curated", "name": item["name"], "aliases": [item["name"], *item["aliases"]],
                    "decls": [(d, "curated") for d in item["decls"] if d in kept],
                    "missing_decls": [d for d in item["decls"] if d not in kept], "reason": item["reason"]})
    for row in nlab_rows:
        out.append({"source": "nlab", "page": row["page"], "name": row["name"], "aliases": [row["name"]],
                    "decls": [], "missing_decls": [], "nlab": row})
    return out


def consolidate(cands):
    n = len(cands)
    uf = Union(n)
    owners = [{"wikidata": {c["qid"]} if c["source"] == "wikidata" else set(),
               "nlab": {c["page"]} if c["source"] == "nlab" else set()} for c in cands]
    links = set()

    def join(a, b, why):
        ra, rb = uf.find(a), uf.find(b)
        if ra == rb:
            return
        oa, ob = owners[ra], owners[rb]
        if (oa["wikidata"] and ob["wikidata"] and oa["wikidata"] != ob["wikidata"]) or \
                (oa["nlab"] and ob["nlab"] and oa["nlab"] != ob["nlab"]):
            links.add((min(ra, rb), max(ra, rb), why))
            return
        uf.parent[rb] = ra
        owners[ra] = {"wikidata": oa["wikidata"] | ob["wikidata"], "nlab": oa["nlab"] | ob["nlab"]}

    # joins, strongest first: shared declarations, exact names, possessive-free names
    # two docstring names on one declaration are often two results ("a special case of X"): they only link
    first = {}
    for i, c in enumerate(cands):
        for d, _ in c["decls"]:
            if d not in first:
                first[d] = i
            elif cands[first[d]]["source"] == "docstring" and c["source"] == "docstring":
                links.add((first[d], i, f"declaration {d}"))
            else:
                join(first[d], i, f"declaration {d}")
    for keyf, why in ((normalize, "same name"), (lambda s: possessive_free(normalize(s)), "same name without 's")):
        seen = {}
        for i, c in enumerate(cands):
            for a in {keyf(x) for x in [c["name"], *c["aliases"]] if x}:
                if len(a) < 4:
                    continue
                if a in seen:
                    join(seen[a], i, f"{why}: {a}")
                else:
                    seen[a] = i
    groups = defaultdict(list)
    for i in range(n):
        groups[uf.find(i)].append(i)
    final_links = []
    for a, b, why in sorted(links):
        ra, rb = uf.find(a), uf.find(b)
        if ra != rb:
            final_links.append((ra, rb, why))
    return groups, final_links


ORDER = {"wikidata": 0, "freek100": 1, "curated": 2, "nlab": 3, "docstring": 4, "overview": 5, "undergrad": 6}


def result_record(members, cands, kept, dependents):
    ms = sorted((cands[i] for i in members), key=lambda c: ORDER[c["source"]])
    wd = next((c for c in ms if c["source"] == "wikidata"), None)
    nl = next((c for c in ms if c["source"] == "nlab"), None)
    if wd:
        rid = f"wd:{wd['qid']}"
    elif nl:
        rid = f"nl:{nl['page']}"
    else:
        ascii_name = unicodedata.normalize("NFKD", normalize(ms[0]["name"])).encode("ascii", "ignore").decode()
        rid = "nm:" + re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
    name = re.sub(r"^the\s+", "", ms[0]["name"], flags=re.I)
    if wd and wd.get("title"):
        name = wd["title"] if not wd["name"] or wd["name"] == wd["qid"] else wd["name"]
    aliases = []
    for c in ms:
        for a in [c["name"], *c["aliases"]]:
            if a and normalize(a) not in {normalize(x) for x in aliases} and normalize(a) != normalize(name):
                aliases.append(a)
    decls, origin = [], {}
    for c in ms:
        for d, src in c["decls"]:
            if d not in origin:
                decls.append(d)
                origin[d] = src
            elif src not in origin[d].split("+"):
                origin[d] += "+" + src
    listed = [d for d in decls if any(s in origin[d] for s in ("wikidata", "freek100", "curated", "overview", "undergrad"))]
    if listed:
        primary = listed[0]
    elif decls:
        primary = min(decls, key=lambda d: (-dependents.get(d, 0), kept[d].get("st") or 0, d))
    else:
        primary = None
    rec = {"id": rid, "name": name, "aliases": aliases, "sources": sorted({c["source"] for c in ms}, key=ORDER.get),
           "decls": [{"decl": d, "via": origin[d]} for d in decls], "primary": primary}
    if wd:
        rec["wikidata"] = {k: wd[k] for k in ("qid", "title", "authors", "date", "url", "comment", "statement")
                           if wd.get(k)}
        if wd["missing_decls"]:
            rec["wikidata"]["missing_decls"] = wd["missing_decls"]
    fk = [c for c in ms if c["source"] == "freek100"]
    if fk:
        rec["freek100"] = [{"n": c["freek"], "title": c["name"], **({"note": c["note"]} if c.get("note") else {})}
                           for c in fk]
    ov = [c for c in ms if c["source"] in ("overview", "undergrad")]
    if ov:
        rec["overview"] = [{"list": c["source"], "path": " / ".join(c["path"]), "leaf": c["name"]} for c in ov]
    cu = [c for c in ms if c["source"] == "curated"]
    if cu:
        rec["curated"] = {"reason": cu[0]["reason"], **({"missing_decls": cu[0]["missing_decls"]} if cu[0]["missing_decls"] else {})}
    if nl:
        rec["nlab"] = {k: nl["nlab"][k] for k in ("page", "name", "categories", "passage", "links", "arxiv")}
    return rec


def build(wikidata):
    lists = mathlib_lists()
    kept = {r["n"]: r for r in read_jsonl(STAGE / "mathlib.jsonl.gz")}
    dependents = defaultdict(int)
    for r in kept.values():
        for d in set(r.get("tdeps", [])) | set(r.get("vdeps", [])):
            dependents[d] += 1
    nlab_rows = list(read_jsonl(STAGE / "nlab.jsonl.gz"))
    curated = read_json(DATA / "curated-names.json")["entries"]
    cands = candidates(lists, wikidata, nlab_rows, kept, curated)
    groups, links = consolidate(cands)
    results, rid_of = [], {}
    for root, members in sorted(groups.items()):
        rec = result_record(members, cands, kept, dependents)
        base, k = rec["id"], 2
        while rec["id"] in rid_of.values():
            rec["id"] = f"{base}-{k}"
            k += 1
        rid_of[root] = rec["id"]
        results.append(rec)
    candidate_links = [{"a": rid_of[a], "b": rid_of[b], "why": why} for a, b, why in links]
    return {"rule": RULE, "names_rule": NAME_RULE_VERSION, "candidates": len(cands),
            "by_source": {s: sum(1 for c in cands if c["source"] == s) for s in ORDER},
            "results": sorted(results, key=lambda r: r["id"]), "candidate_links": candidate_links}


if __name__ == "__main__":
    out = build(read_json(WORK / "cache" / "wiki" / "wikidata.json"))
    write_json(STAGE / "consolidated.json", out, indent=None)
    print(out["candidates"], "candidates,", len(out["results"]), "results,", len(out["candidate_links"]), "candidate links")
