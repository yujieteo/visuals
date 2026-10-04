"""Popularity by arXiv tag (tc-popularity/1): how many arXiv papers name each concept and each result, per arXiv
category and first-version year.

Input: <work>/stage/arxiv-papers.jsonl.gz (arxiv.py: the title and abstract of every paper in the pinned arXiv
metadata file, normalized by arxiv.norm) and the phrase lists of the items:

  concepts  the judge's phrases for each catalog concept (data/concepts.json `pat`): whole-word phrases, written
            to avoid everyday senses ("ring" alone is not a phrase; "commutative ring" is)
  results   every name and alias of a catalog result that passes uses.name_index (te-use-rule/1): at least two
            words, a result word, not a generic head, and one owner only

Rule, per paper: an item is named when one of its phrases occurs in the normalized title or abstract (Aho-Corasick
over " phrase " with spaces at both ends, so whole words only). A paper counts once per item, however often it
names it. It counts in every arXiv tag it carries: each category it lists (cross-lists included), each archive and each
group of those categories, once per tag and not shared out. So a share in a tag is "papers with the tag that
name the item / papers with the tag", at any taxonomy level, with no double count of a paper cross-listed
inside one archive. Its year is the first-version year of its identifier.

Output: <work>/stage/popularity.json.gz:
  years        [first, last]
  tags         the tag ids: every taxonomy category in the taxonomy order, then every archive, then every group,
               then "all" (every paper with a known category: the overall rate)
  papers       [tag index, year, papers] for every tag-year with papers (the denominators)
  totals       [year, papers] (papers with at least one known category)
  items        {item id: [[tag index, year, papers], ...]} sparse counts
  item_totals  {item id: papers that name the item, any category}
"""
import gzip
import json
import sys
import unicodedata
from collections import Counter, defaultdict

import ahocorasick

from arxiv import norm
from common import DATA, STAGE, read_json, read_jsonl

RULE = "tc-popularity/1"


def kept(phrase):
    """A phrase is kept when norm() loses no letter of it: a letter with no ASCII base (as in "σ-algebra") would
    vanish and leave a shorter, wrong phrase ("algebra"). The abstracts lose the same letters, so such a phrase
    could never match as written."""
    base = unicodedata.normalize("NFKD", phrase)
    base = "".join(ch for ch in base if not unicodedata.combining(ch))
    return bool(norm(phrase).strip()) and not any(ch.isalpha() and not ch.isascii() for ch in base)


def automaton(items):
    """items: {item id: [phrase, ...]} -> an automaton whose values are the item ids of each phrase."""
    owners = defaultdict(set)
    for iid, phrases in items.items():
        for p in phrases:
            if kept(p):
                owners[norm(p)].add(iid)
    a = ahocorasick.Automaton()
    for key, ids in owners.items():
        a.add_word(key, tuple(sorted(ids)))
    a.make_automaton()
    return a, len(owners)


def count(items, papers_path=None):
    tax = read_json(DATA / "arxiv-taxonomy.json")
    cats = [c["id"] for c in tax["categories"]]
    tags = cats + [a["id"] for a in tax["archives"]] + [g["id"] for g in tax["groups"]] + ["all"]
    # Each category's tags: itself, its archive and its group, by position, since one id can name a category, an
    # archive and a group at once ("hep-th" is a category and an archive; "cs" an archive and a group).
    archives = [a["id"] for a in tax["archives"]]
    groups = [g["id"] for g in tax["groups"]]
    up = {c["id"]: [i, len(cats) + archives.index(c["archive"]), len(cats) + len(archives) + groups.index(c["group"])]
          for i, c in enumerate(tax["categories"])}
    a, phrases = automaton(items)
    cells = Counter()
    denom = Counter()
    totals = Counter()
    item_totals = Counter()
    years = [9999, 0]
    for p in read_jsonl(papers_path or STAGE / "arxiv-papers.jsonl.gz"):
        y = p["y"]
        cs = sorted({t for c in p["c"] if c in up for t in up[c]})
        if y is None or not cs:
            continue
        cs.append(len(tags) - 1)
        years = [min(years[0], y), max(years[1], y)]
        totals[y] += 1
        for c in cs:
            denom[(c, y)] += 1
        found = set()
        for _, ids in a.iter(p["t"]):
            found.update(ids)
        for iid in found:
            item_totals[iid] += 1
            for c in cs:
                cells[(iid, c, y)] += 1
    out_items = defaultdict(list)
    for (iid, c, y), n in sorted(cells.items()):
        out_items[iid].append([c, y, n])
    return {"rule": RULE, "phrases": phrases, "years": years, "tags": tags, "ncat": len(cats), "narch": len(tax["archives"]),
            "papers": [[c, y, n] for (c, y), n in sorted(denom.items())],
            "totals": [[y, n] for y, n in sorted(totals.items())],
            "items": dict(out_items), "item_totals": dict(item_totals)}


def build(items):
    out = count(items)
    with gzip.open(STAGE / "popularity.json.gz", "wt", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    return out


if __name__ == "__main__":
    items = json.load(open(sys.argv[1], encoding="utf-8"))
    out = build(items)
    print({k: out[k] for k in ("rule", "phrases", "years")}, len(out["items"]), "items named")
