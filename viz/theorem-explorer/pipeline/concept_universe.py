"""The concept universe (tc-universe/1): every mathematical concept the declared sources name, merged by name.

Inputs (all at the pins of data/sources/pins.json): <work>/nlab-content, <work>/stage/mathlib-decls.json.gz and
<work>/stage/concept-candidates.json (concept_sources.py), the committed raw.json (the result catalog) and
data/concepts.json (the fully judged core concepts).

Members, merged by names.normalize() of their names:
  nlab      every nLab page except: pages in the categories people, reference, empty, disambiguation, meta,
            software, svg, Initiality Project, motivation, philosophy and adjective; sub-pages ("A > B"); site pages
            (nLab..., Sandbox, HomePage, HowTo, Latest Changes, About, Help, CSS, Test); pages under 200 bytes;
            pages whose name holds a year (bibliography entries); and pages whose name is a catalog result
  results   every key concept that a catalog result names (the detail pack's `cn`)
  mathlib   every Mathlib class or structure with a doc comment of at least 40 characters, whose name, split at
            its capitals ("InnerProductSpace" -> "inner product space"), is not already a member; an existing
            member with that split name gets the declaration as its formal link
  core      the judged concepts of data/concepts.json keep their ids, and absorb the members whose name is their
            name, one of their aliases or one of their merged candidate keys, or whose nLab page is theirs

Each member keeps its evidence: the nLab page id, name, backlinks, Idea passage (at most 280 characters) and the
links of its Idea and Definition sections (the first 8 that are members: its documented prerequisites, not judged);
the Mathlib declaration, kind, module, line, doc line and file count; the results that name it.

Output: <work>/stage/concept-universe.json.gz, a list in a stable order (core first, then by name).
"""
import gzip
import json
import os
import re
import unicodedata

from common import DATA, STAGE, VISUAL, WORK
from concept_sources import result_concepts
from names import normalize

RULE = "tc-universe/1"
EXCLUDE = {"people", "reference", "empty", "disambiguation", "meta", "software", "svg", "Initiality Project",
           "motivation", "philosophy", "adjective"}
_SITE = re.compile(r"(?i)^(nlab|sandbox|homepage|howto|latest changes|about|help|css|test)\b")
_YEAR = re.compile(r"\b(1[89]|20)\d\d\b")
_LINK = re.compile(r"\[\[(?!!)([^\]|]+)(?:\|[^\]]*)?\]\]")
_SECTION = re.compile(r"^#+\s*(Idea|Definition|Definitions)\s*$", re.M)
_HEAD = re.compile(r"^#+\s", re.M)
_CAMEL = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")


def slug(name):
    s = unicodedata.normalize("NFKD", name)
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    s = re.sub(r"[∞]", "infinity", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:80] or "concept"


def camel_name(decl):
    last = decl.split(".")[-1]
    return normalize(_CAMEL.sub(" ", last).replace("_", " "))


def definition_links(content):
    """The wiki links of the Idea and Definition sections (in order, without repeats)."""
    out = []
    for m in _SECTION.finditer(content):
        rest = content[m.end():]
        nxt = _HEAD.search(rest)
        for link in _LINK.findall(rest[:nxt.start()] if nxt else rest):
            key = normalize(link.split("#")[0].strip())
            if key and key not in out:
                out.append(key)
    return out


def nlab_members(root, result_names):
    from nlab import idea_passage
    pages, backlinks = [], {}
    for dirpath, _, names in os.walk(root / "pages"):
        if "name" not in names or "content.md" not in names:
            continue
        name = open(os.path.join(dirpath, "name"), encoding="utf-8").read().strip()
        content = open(os.path.join(dirpath, "content.md"), encoding="utf-8").read()
        for link in {normalize(l.split("#")[0].strip()) for l in _LINK.findall(content)}:
            backlinks[link] = backlinks.get(link, 0) + 1
        cats = {c.strip() for line in re.findall(r"^category:\s*(.*)$", content, re.M) for c in line.split(",")}
        if cats & EXCLUDE or " > " in name or _SITE.match(name) or len(content.strip()) < 200 or _YEAR.search(name):
            continue
        key = normalize(name)
        if key in result_names:
            continue
        pages.append((key, int(os.path.basename(dirpath)), name, content))
    out = {}
    for key, pid, name, content in sorted(pages, key=lambda p: p[1]):
        if key in out:
            continue
        out[key] = {"name": name, "nlab": {"page": pid, "name": name, "backlinks": backlinks.get(key, 0),
                                          "idea": idea_passage(content)[:280], "links": definition_links(content)}}
    return out


def build():
    raw = json.loads((VISUAL / "raw.json").read_text(encoding="utf-8"))
    import base64
    core_pack = json.loads(gzip.decompress(base64.b64decode(raw["packs"]["core"]["gz"])))
    result_names = {normalize(r["n"]) for r in core_pack["rows"] if not r["t"].startswith("not-a-result")}
    members = nlab_members(WORK / "nlab-content", result_names)
    for key, ids in result_concepts(raw).items():
        m = members.setdefault(key, {"name": key})
        m["results"] = sorted(set(ids))
    decls = json.loads(gzip.open(STAGE / "mathlib-decls.json.gz", "rt", encoding="utf-8").read())
    for decl, d in sorted(decls.items()):
        if d["k"] not in ("class", "structure") or len(d["doc"]) < 40:
            continue
        key = camel_name(decl)
        if len(key) < 3:
            continue
        m = members.get(key)
        if m is None:
            m = members[key] = {"name": key}
        if "mathlib" not in m:
            m["mathlib"] = {"decl": decl, **{k: d[k] for k in ("k", "mod", "line", "doc", "files")}}
    # The judged core absorbs its members.
    judged = json.loads((DATA / "concepts.json").read_text(encoding="utf-8"))
    out, used = [], set()
    for c in judged:
        keys = [normalize(c["name"]), *[normalize(a) for a in c["al"]], *c["from"]]
        if c.get("nlab"):
            keys.append(normalize(c["nlab"]))
        rec = {"id": c["id"], "name": c["name"], "core": True, "keys": []}
        for k in dict.fromkeys(keys):
            m = members.get(k)
            if m is None or k in used:
                continue
            used.add(k)
            rec["keys"].append(k)
            for f in ("nlab", "mathlib"):
                if f in m and f not in rec:
                    rec[f] = m[f]
            if "results" in m:
                rec["results"] = sorted(set(rec.get("results", [])) | set(m["results"]))
        out.append(rec)
    ids = {r["id"] for r in out}
    for key in sorted(k for k in members if k not in used):
        m = members[key]
        sid = "c:" + slug(m["name"])
        n = 2
        while sid in ids:
            sid = f"c:{slug(m['name'])}-{n}"
            n += 1
        ids.add(sid)
        out.append({"id": sid, "name": m["name"], "core": False, "keys": [key],
                    **{f: m[f] for f in ("nlab", "mathlib", "results") if f in m}})
    # Documented prerequisites: Idea and Definition links that are members (ids), at most 8.
    by_key = {k: r["id"] for r in out for k in r["keys"]}
    for r in out:
        if "nlab" in r:
            r["links"] = [by_key[k] for k in r["nlab"].pop("links") if k in by_key and by_key[k] != r["id"]][:8]
    with gzip.open(STAGE / "concept-universe.json.gz", "wt", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    return {"rule": RULE, "members": len(out), "core": sum(r["core"] for r in out),
            "with_nlab": sum("nlab" in r for r in out), "with_mathlib": sum("mathlib" in r for r in out),
            "with_results": sum("results" in r for r in out)}


if __name__ == "__main__":
    print(build())
