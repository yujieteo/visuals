"""The source manifest (spec sections 3.1, 13 step 1 and 14): one record per source adapter, with its version, its
retrieval date, its reuse terms and its counts, in data/sources/<source>.json, and the index data/sources/manifest.json.

The manifest ID is the sha256 of the source records, so a refresh that changes any source version, count or reuse
term gives a new ID. The mathlib record is mathlib.py's own (data/sources/mathlib.json).
"""
import json
import sys

from common import DATA, STAGE, WORK, pins, read_json, read_jsonl, sha256_bytes, sha256_file, write_json
from theoremgraph import GRAPH, MATCHING

SOURCES = DATA / "sources"
WIKI_RETRIEVED = pins()["wiki_retrieved"]
TS = {"repo": "uw-math-ai/theorem-search-dataset-permissive",
      "url": "https://huggingface.co/datasets/uw-math-ai/theorem-search-dataset-permissive",
      "revision": pins()["theoremsearch"]["revision"], "last_modified": pins()["theoremsearch"]["last_modified"],
      "license": "cc-by-4.0 (dataset card); each paper row also keeps its own license field"}
WIKIMEDIA = ("Wikidata structured data is CC0. Wikipedia text is CC BY-SA 4.0: the catalog quotes at most the "
             "first two sentences of a lead section, with its title, revision and link "
             "(https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use).")


def wikimedia():
    wd = read_json(WORK / "cache" / "wiki" / "wikidata.json")
    wp = read_json(WORK / "cache" / "wiki" / "wikipedia.json")
    access = "MediaWiki Action API, no account, one request per second, descriptive User-Agent"
    return {
        "wikidata": {"source": "https://www.wikidata.org/w/api.php", "id": "wikidata", "retrieved": WIKI_RETRIEVED,
                     "access": access, "items": len(wd), "failures": sum(1 for v in wd.values() if "failure" in v),
                     "fields": ["label", "aliases", "description", "lastrevid", "modified", "enwiki sitelink",
                                "P31", "P138", "P575", "P61"],
                     "version": "per item: the item's last revision ID (lastrevid) at retrieval", "reuse": WIKIMEDIA},
        "wikipedia": {"source": "https://en.wikipedia.org/w/api.php", "id": "wikipedia", "retrieved": WIKI_RETRIEVED,
                      "access": access, "pages": len(wp), "failures": sum(1 for v in wp.values() if "failure" in v),
                      "fields": ["lead extract (plain text)", "revision ID", "revision timestamp"],
                      "version": "per page: the revision ID at retrieval", "reuse": WIKIMEDIA},
    }


def nlab():
    rows = sum(1 for _ in read_jsonl(STAGE / "nlab.jsonl.gz"))
    from nlab import REUSE, RULE, mirror_commit
    return {"source": "https://github.com/ncatlab/nlab-content", "site": "https://ncatlab.org/nlab/show/", "id": "nlab",
            **mirror_commit(WORK / "nlab-content"), "rule": RULE, "discovered": rows, "reuse": REUSE,
            "version": "mirror commit"}


def theoremsearch():
    folder = WORK / "theoremsearch"
    counts = read_json(STAGE / "uses-summary.json")["counts"]
    return {"id": "theoremsearch-dataset", **TS, "files": {p.name: sha256_file(p) for p in sorted(folder.glob("*.parquet"))},
            "papers": counts["papers"], "statements": counts["statements"],
            "scope": "the public dataset at the pinned revision; not the live TheoremSearch service, whose coverage differs",
            "reuse": "CC BY 4.0 (dataset card): attribute uw-math-ai/theorem-search-dataset-permissive; passages keep "
                     "their arXiv paper ID and the paper row's own license"}


def theoremgraph():
    tg = read_json(STAGE / "theoremgraph.json")
    return {"id": "theoremgraph", "rule": tg["rule"], "matching": MATCHING | {"links": len(tg["links"])}, "graph": GRAPH,
            "reuse": "theorem-matching: CC BY-SA 4.0; math-graph: CC BY 4.0 (cited, not downloaded)"}


def taxonomy():
    t = read_json(DATA / "arxiv-taxonomy.json")
    return {"id": "arxiv-taxonomy", **{k: t[k] for k in ("source", "retrieved", "sha256", "rule", "version", "reuse")},
            "categories": len(t["categories"]), "aliases": len(t["aliases"]), "groups": len(t["groups"]),
            "archives": len(t["archives"])}


def curated():
    c = read_json(DATA / "curated-names.json")
    return {"id": "curated", "rule": c["rule"], "entries": len(c["entries"]), "about": c["about"],
            "reuse": "authored for this catalog"}


def build():
    records = {"mathlib": read_json(SOURCES / "mathlib.json"), **wikimedia(), "nlab": nlab(),
               "theoremsearch": theoremsearch(), "theoremgraph": theoremgraph(), "taxonomy": taxonomy(),
               "curated": curated()}
    changed = []
    for name, rec in records.items():
        if name != "mathlib" and write_json(SOURCES / f"{name}.json", rec):
            changed.append(name)
    manifest_id = "manifest/" + sha256_bytes(json.dumps(records, sort_keys=True).encode())[:16]
    write_json(SOURCES / "manifest.json", {"id": manifest_id, "sources": sorted(records)})
    return manifest_id, records, changed


if __name__ == "__main__":
    mid, _, changed = build()
    print(mid, "changed:", ", ".join(changed) or "none", file=sys.stderr)
