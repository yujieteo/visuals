"""arXiv paper metadata, stage 1: the public arXiv metadata snapshot -> normalized JSON lines (tc-arxiv/1).

Source: the arXiv metadata file that arXiv publishes with its bulk-data bucket on Google Cloud Storage,
gs://arxiv-dataset/metadata-v5/arxiv-metadata-oai.json (the same file as the Kaggle "arXiv dataset", one JSON
object per paper: id, title, abstract, categories, versions, ...). The pinned object is in
data/sources/pins.json ("arxiv"); its generation and size are recorded so a later run can tell a new upload.
The file is public: `gsutil cat` reads it with no account. No other arXiv service is called.

Each paper keeps:
  id     the arXiv identifier without version
  y      the first-version year, from the identifier (YYMM.NNNNN or archive/YYMMNNN), as uses.arxiv_year
  c      its canonical categories (aliases resolved through the pinned taxonomy; unknown ids dropped), in order;
         the first is the primary category
  t      the title and abstract, normalized by norm() for phrase matching

norm() (tc-norm/1): NFKD with the combining marks removed (Kähler -> kahler), lower case, TeX commands and
dollar signs removed, every character that is not a letter, a digit or an apostrophe made a space ("Riemann-Roch"
-> "riemann roch"), possessive "'s" kept as "s" ("Zorn's" -> "zorns"), single spaces, a space at each end, so a
phrase " a b " matches whole words only.

Output: <work>/stage/arxiv-papers.jsonl.gz. Run as `python3 arxiv.py` (reads `gsutil cat` of the pinned
object) or `python3 arxiv.py --file <local copy>`.
"""
import argparse
import gzip
import json
import re
import subprocess
import sys
import unicodedata

from common import DATA, STAGE, pins, read_json

RULE = "tc-arxiv/1"
NORM_RULE = "tc-norm/1"
_TEX = re.compile(r"\\[A-Za-z]+")
_NON = re.compile(r"[^a-z0-9']+")
_POSS = re.compile(r"'s\b")
_ARXIV_NEW = re.compile(r"^(\d{2})(\d{2})\.\d{4,5}")
_ARXIV_OLD = re.compile(r"/(\d{2})(\d{2})\d{3}")


def norm(text):
    s = unicodedata.normalize("NFKD", text or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    s = _TEX.sub(" ", s).replace("$", " ")
    s = _POSS.sub("s", s)
    s = _NON.sub(" ", s).replace("'", " ")
    return " " + " ".join(s.split()) + " "


def arxiv_year(paper_id):
    m = _ARXIV_NEW.match(paper_id) or _ARXIV_OLD.search(paper_id)
    if not m:
        return None
    yy = int(m[1])
    return 2000 + yy if yy < 91 else 1900 + yy


def taxonomy():
    tax = read_json(DATA / "arxiv-taxonomy.json")
    known = {c["id"] for c in tax["categories"]}
    return known, tax.get("aliases", {})


def categories(field, known, aliases):
    raw = " ".join(field) if isinstance(field, list) else str(field or "")
    out = []
    for c in raw.split():
        c = aliases.get(c, c)
        if c in known and c not in out:
            out.append(c)
    return out


def rows(stream, known, aliases):
    """One row per identifier: a repeated identifier keeps its first record (the stream can repeat records)."""
    seen = set()
    for line in stream:
        if not line.strip():
            continue
        p = json.loads(line)
        pid = re.sub(r"v\d+$", "", p["id"])
        if pid in seen:
            continue
        seen.add(pid)
        yield {"id": pid, "y": arxiv_year(pid), "c": categories(p.get("categories"), known, aliases),
               "t": norm(f"{p.get('title', '')} . {p.get('abstract', '')}")}


def build(local=None):
    known, aliases = taxonomy()
    src = pins()["arxiv"]
    if local:
        stream = open(local, encoding="utf-8")
        proc = None
    else:
        proc = subprocess.Popen(["gsutil", "-q", "cat", src["object"]], stdout=subprocess.PIPE, text=True,
                                encoding="utf-8", bufsize=1 << 20)
        stream = proc.stdout
    STAGE.mkdir(parents=True, exist_ok=True)
    n = 0
    with gzip.open(STAGE / "arxiv-papers.jsonl.gz", "wt", encoding="utf-8", compresslevel=5) as out:
        for r in rows(stream, known, aliases):
            out.write(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n")
            n += 1
            if n % 200000 == 0:
                print(f"{n} papers", file=sys.stderr, flush=True)
    if proc and proc.wait() != 0:
        raise SystemExit(f"gsutil cat {src['object']} failed with exit code {proc.returncode}")
    return n


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--file", help="a local copy of arxiv-metadata-oai.json instead of gsutil cat")
    a = ap.parse_args()
    print(build(a.file), "papers ->", STAGE / "arxiv-papers.jsonl.gz")
