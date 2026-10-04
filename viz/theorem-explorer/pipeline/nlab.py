"""The nLab adapter (spec section 3.1), from the public source mirror https://github.com/ncatlab/nlab-content.

Page-discovery rule (nlab-rule/1), repeatable on any mirror commit:
  1. every directory under pages/ with a `name` file and a `content.md` file is a page; its page ID is the
     directory name
  2. a page is a candidate when its name, after names.normalize(), ends in one of names.NAME_WORDS, and its
     `category:` lines do not include "people"
  3. every other page is recorded only in the counts (pages read, pages discovered)

For each candidate the adapter keeps: page ID, name, the mirror commit, the categories, the first paragraph of
its "Idea" section (or of the page, after the table of contents) as the quoted passage, the [[wiki links]] of
the page (documentation links, never proof dependencies), and the arXiv identifiers it cites.

Reuse terms (nLab HomePage): "Using and distributing content obtained from the nLab is free and encouraged if
you acknowledge the source, as usual in academia." Each passage keeps its page link and the mirror commit.
"""
import os
import re
import subprocess

from common import STAGE, WORK, write_jsonl
from names import NAME_WORDS, normalize

RULE = "nlab-rule/1"
REUSE = ("Using and distributing content obtained from the nLab is free and encouraged if you acknowledge the "
         "source, as usual in academia. (nLab HomePage)")
_END = re.compile(r"\b(?:" + "|".join(NAME_WORDS) + r")$")
_LINK = re.compile(r"\[\[(?!!)([^\]|]+)(?:\|[^\]]*)?\]\]")
_ARXIV = re.compile(r"arXiv:(\d{4}\.\d{4,5}|[a-z\-]+(?:\.[A-Z]{2})?/\d{7})")


def mirror_commit(root):
    out = subprocess.run(["git", "-C", str(root), "log", "-1", "--format=%H %cI"], capture_output=True, text=True,
                         check=True).stdout.split()
    return {"commit": out[0], "date": out[1]}


def _clean(md):
    md = re.sub(r"\[\[!include[^\]]*\]\]", "", md)
    md = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"\2", md)
    md = re.sub(r"\[\[([^\]]+)\]\]", r"\1", md)
    md = re.sub(r"\[([^\]]+)\]\(#[^)]*\)", r"\1", md)
    md = re.sub(r"\[([^\]]+)\]\((https?://[^)]*)\)", r"\1", md)
    md = re.sub(r"\{[#:][^}]*\}", "", md)
    return md


def idea_passage(content):
    """The first paragraph of the Idea section, else the first prose paragraph after the table of contents."""
    text = content
    m = re.search(r"^#+\s*Idea\s*$", text, re.M)
    if m:
        text = text[m.end():]
    else:
        t = text.find("\\tableofcontents")
        text = text[t + len("\\tableofcontents"):] if t >= 0 else text
    for para in re.split(r"\n\s*\n", text):
        p = para.strip()
        if not p or p.startswith(("#", "+--", "=--", "*", "[[!", "\\", "$$", "|", "<")):
            continue
        p = _clean(p)
        p = re.sub(r"\s+", " ", p).strip()
        if len(p) > 40:
            return p[:1200]
    return ""


def discover(root=None):
    root = root or WORK / "nlab-content"
    pages, rows = 0, []
    for dirpath, _, files in os.walk(root / "pages"):
        if "name" not in files or "content.md" not in files:
            continue
        pages += 1
        with open(os.path.join(dirpath, "name"), encoding="utf-8") as f:
            name = f.read().strip()
        if not _END.search(normalize(name)):
            continue
        with open(os.path.join(dirpath, "content.md"), encoding="utf-8") as f:
            content = f.read()
        cats = [c.strip() for line in re.findall(r"^category:\s*(.*)$", content, re.M) for c in line.split(",")]
        if "people" in cats:
            continue
        links = list(dict.fromkeys(l.strip() for l in _LINK.findall(content)))
        rows.append({"page": int(os.path.basename(dirpath)), "name": name, "categories": cats,
                     "passage": idea_passage(content), "links": links,
                     "arxiv": sorted(set(_ARXIV.findall(content))), "bytes": len(content.encode("utf-8"))})
    rows.sort(key=lambda r: r["page"])
    return pages, rows


def build(root=None):
    root = root or WORK / "nlab-content"
    pages, rows = discover(root)
    write_jsonl(STAGE / "nlab.jsonl.gz", rows)
    return {"source": "https://github.com/ncatlab/nlab-content", "site": "https://ncatlab.org/nlab/show/",
            **mirror_commit(root), "rule": RULE, "pages_read": pages, "discovered": len(rows), "reuse": REUSE}


if __name__ == "__main__":
    print(build())
