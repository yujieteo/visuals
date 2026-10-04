"""The arXiv category taxonomy adapter (spec section 3.4).

Reads the official page https://arxiv.org/category_taxonomy (saved to <work>/arxiv-taxonomy.html by run.py)
and writes data/arxiv-taxonomy.json: groups, archives and categories with their official IDs, names and
descriptions, and the official aliases ("cs.NA is an alias for math.NA"), with the retrieval date and digest.

Extraction rules (taxonomy-rule/1):
  group     each <h2 class="accordion-head" id="accordion-head-grp_X"> heading; its text is the group name
  archive   each <h3>Name<br><span>(id)</span></h3> heading inside a group; a group without archive headings
            has one archive per category prefix (the text before the dot), named after the group
  category  each <h4>id <span>(name)</span></h4> with the next <p> as its description
  alias     a description that starts "<id> is an alias for <id>." makes the first id an alias of the second
"""
import html
import re
import sys

from common import DATA, WORK, pins, sha256_bytes, write_json

URL = "https://arxiv.org/category_taxonomy"
RULE = "taxonomy-rule/1"

_GROUP = re.compile(r'<h2 class="accordion-head" id="accordion-head-grp_([^"]+)">.*?</span>\s*(.*?)\s*</button>', re.S)
_ARCHIVE = re.compile(r"<h3>([^<]+)<br><span>\(([^)]+)\)</span></h3>")
_CATEGORY = re.compile(r"<h4>([A-Za-z\-]+(?:\.[A-Za-z\-]+)?) <span>\(([^)]*)\)</span></h4>.*?<p>(.*?)</p>", re.S)
_ALIAS = re.compile(r"^([A-Za-z\-]+(?:\.[A-Za-z\-]+)?) is an alias for ([A-Za-z\-]+(?:\.[A-Za-z\-]+)?)\.")


def _text(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def parse(page):
    """The taxonomy as {groups, archives, categories, aliases} from the page's HTML text."""
    groups, archives, categories, aliases = [], [], [], {}
    heads = list(_GROUP.finditer(page))
    if not heads:
        raise ValueError("no group headings: the taxonomy page changed its markup")
    for i, head in enumerate(heads):
        gid, gname = head[1], _text(head[2])
        body = page[head.end():heads[i + 1].start() if i + 1 < len(heads) else len(page)]
        groups.append({"id": gid, "name": gname})
        marks = list(_ARCHIVE.finditer(body))
        seen_archive = set()
        for m in _CATEGORY.finditer(body):
            cid, cname, desc = m[1], _text(m[2]), _text(m[3])
            before = [a for a in marks if a.start() < m.start()]
            if before:
                aid, aname = before[-1][2], _text(before[-1][1])
            else:
                aid, aname = cid.split(".")[0], gname
            if aid not in seen_archive:
                seen_archive.add(aid)
                if not any(a["id"] == aid for a in archives):
                    archives.append({"id": aid, "name": aname, "group": gid})
            alias = _ALIAS.match(desc)
            if alias and alias[1] == cid:
                aliases[cid] = alias[2]
            categories.append({"id": cid, "name": cname, "archive": aid, "group": gid, "description": desc})
    ids = {c["id"] for c in categories}
    for a, b in aliases.items():
        if b not in ids:
            raise ValueError(f"alias target {b} of {a} is not a category")
    return {"groups": groups, "archives": archives, "categories": categories, "aliases": aliases}


def build(retrieved):
    raw = (WORK / "arxiv-taxonomy.html").read_bytes()
    tax = parse(raw.decode("utf-8"))
    doc = {
        "source": URL,
        "retrieved": retrieved,
        "sha256": sha256_bytes(raw),
        "bytes": len(raw),
        "rule": RULE,
        "version": f"arxiv-taxonomy@{retrieved}#{sha256_bytes(raw)[:12]}",
        "reuse": "arXiv category names and descriptions, quoted as facts of the classification for attribution.",
        **tax,
    }
    write_json(DATA / "arxiv-taxonomy.json", doc)
    return doc


if __name__ == "__main__":
    d = build(sys.argv[1] if len(sys.argv) > 1 else pins()["taxonomy_retrieved"])
    print(f"{len(d['groups'])} groups, {len(d['archives'])} archives, {len(d['categories'])} categories, {len(d['aliases'])} aliases")
