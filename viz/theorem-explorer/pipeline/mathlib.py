"""The mathlib4 adapter, stage 2: the extractor's JSON lines -> measured formal records (spec sections 5.1, 5.2).

Stage 1 is pipeline/lean/Extract.lean (run.py runs it in shards from a mathlib4 checkout at the pinned commit).
This stage reads its shards, accounts for every constant (kept, or excluded with its rule), measures the source of
each kept declaration, and writes <work>/stage/mathlib.jsonl.gz plus the committed summary data/sources/mathlib.json.

Measurement rules (te-measure/1):
  declaration text   the source lines of the declaration range that Lean records, without its doc comment and
                     attributes. A declaration that a command generates (for example by to_additive) has the range
                     of the command's source, so it shares that text.
  statement / proof  the text splits at the first ":=" outside brackets, comments and strings; "where" or a first
                     "|" alternative at bracket depth 0 starts the body when there is no ":=" first. The statement
                     is the text before the split (the keyword and name included); the proof is the text after it.
  source tokens      te-lean-tokens/1: comments are removed; then each identifier (letters, digits, _, ', !, ?,
                     subscripts and dots inside a name), each number, each string or character literal, each bracket
                     and each maximal run of other non-space symbols counts as one token.
  proof-term nodes   from the extractor: pu counts distinct subterms (structurally equal subterms count once);
                     pt counts every occurrence. Both are Lean Expr nodes of the elaborated proof term.
  dependencies       tdeps are constants in the elaborated type (signature references); vdeps are constants in the
                     value that the type does not use (proof references). Only kept records are graph nodes; the
                     rest count as external references.
"""
import json
import re
import sys
from collections import Counter

from common import DATA, EXTRACT_VERSION, MEASURE_VERSION, STAGE, WORK, write_json, write_jsonl

STANDARD_AXIOMS = ("propext", "Quot.sound", "Classical.choice")

_IDENT = r"[A-Za-z_À-ɏͰ-Ͽᴀ-ᶿἀ-῿℀-⅏\U0001D400-\U0001D7FF«»][\w'!?À-ɏͰ-Ͽᴀ-ᶿἀ-῿₀-ₜ℀-⅏\U0001D400-\U0001D7FF«»]*"
TOKEN = re.compile(
    r"(?P<str>\"(?:[^\"\\]|\\.)*\")"
    r"|(?P<chr>'(?:[^'\\]|\\.)')"
    r"|(?P<num>\d+(?:\.\d+)?)"
    rf"|(?P<id>{_IDENT}(?:\.{_IDENT})*)"
    r"|(?P<br>[()\[\]{}⟨⟩⦃⦄‹›⟦⟧])"
    r"|(?P<sym>[^\sA-Za-z0-9()\[\]{}⟨⟩⦃⦄‹›⟦⟧\"]+)"
)


def strip_comments(text):
    """The text without -- line comments and nested /- -/ block comments; strings are kept."""
    out, i, n, depth = [], 0, len(text), 0
    while i < n:
        if depth:
            if text.startswith("/-", i):
                depth += 1
                i += 2
            elif text.startswith("-/", i):
                depth -= 1
                i += 2
            else:
                i += 1
            continue
        c = text[i]
        if text.startswith("/-", i):
            depth = 1
            i += 2
        elif text.startswith("--", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
        elif c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            out.append(text[i:j + 1])
            i = j + 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


def tokens(text):
    return sum(1 for _ in TOKEN.finditer(text))


_LEAD = re.compile(r"^\s*(?:/--.*?-/\s*)?(?:@\[[^\]]*(?:\[[^\]]*\][^\]]*)*\]\s*)*", re.S)


def split_declaration(text):
    """(statement, proof) of a declaration's source, comments removed, by the te-measure/1 split rule."""
    body = strip_comments(_LEAD.sub("", text, count=1))
    depth, i, n = 0, 0, len(body)
    while i < n:
        c = body[i]
        if c == '"':
            j = i + 1
            while j < n and body[j] != '"':
                j += 2 if body[j] == "\\" else 1
            i = j + 1
            continue
        if c in "([{⟨⦃⟦":
            depth += 1
        elif c in ")]}⟩⦄⟧":
            depth = max(0, depth - 1)
        elif depth == 0:
            if body.startswith(":=", i):
                return body[:i].strip(), body[i + 2:].strip()
            if body.startswith("where", i) and (i == 0 or body[i - 1].isspace()) and (i + 5 >= n or not body[i + 5].isalnum()):
                return body[:i].strip(), body[i:].strip()
            if c == "|" and body[body.rfind("\n", 0, i) + 1:i].strip() == "" and "\n" in body[:i]:
                return body[:i].strip(), body[i:].strip()
        i += 1
    return body.strip(), ""


class Sources:
    """Source files of the checkout, read once each."""

    def __init__(self, root):
        self.root = root
        self.cache = {}

    def lines(self, module):
        if module not in self.cache:
            path = self.root / (module.replace(".", "/") + ".lean")
            self.cache[module] = path.read_text(encoding="utf-8").split("\n") if path.is_file() else None
        return self.cache[module]

    def text(self, module, rng):
        lines = self.lines(module)
        if lines is None or not rng:
            return None
        a, ca, b, cb = rng
        part = lines[a - 1:b]
        if not part:
            return None
        part[-1] = part[-1][:cb] if len(part) > 1 else part[-1][ca:cb]
        if len(part) > 1:
            part[0] = part[0][ca:]
        return "\n".join(part)


def shards(folder):
    files = sorted(folder.glob("shard-*.jsonl"))
    if not files:
        raise SystemExit(f"no extractor shards in {folder}")
    return files


def build(mathlib_root=None, extract_dir=None):
    mathlib_root = mathlib_root or WORK / "mathlib4"
    extract_dir = extract_dir or WORK / "extract"
    src = Sources(mathlib_root)
    headers, kept, exclusions, kinds = [], [], Counter(), Counter()
    seen = set()
    for path in shards(extract_dir):
        with open(path, encoding="utf-8") as f:
            for line in f:
                r = json.loads(line)
                if "header" in r:
                    headers.append(r["header"])
                    continue
                if r["n"] in seen:
                    raise SystemExit(f"{r['n']} appears in two shards")
                seen.add(r["n"])
                if "x" in r:
                    exclusions[r["x"]] += 1
                    continue
                kinds[r["k"]] += 1
                kept.append(r)
    head = headers[0]
    if len(headers) != head["shards"] or {h["shard"] for h in headers} != set(range(head["shards"])):
        raise SystemExit("the extractor shards are incomplete")
    if any(h["mathlib"] != head["mathlib"] or h["lean"] != head["lean"] or h["tool"] != EXTRACT_VERSION for h in headers):
        raise SystemExit("the shards come from different extractions")
    if len(seen) != head["constants"]:
        raise SystemExit(f"{len(seen)} records for {head['constants']} constants")

    kept.sort(key=lambda r: (r["m"], (r.get("rng") or [0])[0], r["n"]))
    rows, unmeasured, sorry = [], 0, 0
    for r in kept:
        text = src.text(r["m"], r.get("rng"))
        row = {k: r[k] for k in ("n", "m", "k") if k in r}
        for k in ("sig", "concl", "hyps", "nd", "ncl", "cls", "tdeps", "vdeps", "pu", "pt", "rng", "doc"):
            if k in r:
                row[k] = r[k]
        row["ax"] = sorted(r.get("ax", []))
        if "sorryAx" in row["ax"]:
            sorry += 1
        if text is None:
            unmeasured += 1
        else:
            stmt, proof = split_declaration(text)
            row["st"] = tokens(stmt)
            row["sp"] = tokens(proof) if proof else None
        rows.append(row)
    write_jsonl(STAGE / "mathlib.jsonl.gz", rows)
    summary = {
        "source": "https://github.com/leanprover-community/mathlib4",
        "commit": head["mathlib"],
        "lean": head["lean"],
        "extraction_tool": EXTRACT_VERSION,
        "measurement_rules": MEASURE_VERSION,
        "licence": "Apache-2.0",
        "validation": "imported-build: the pinned mathlib cache (lake exe cache get) was imported; no local re-check of proofs",
        "constants": head["constants"],
        "kept": len(rows),
        "kinds": dict(kinds.most_common()),
        "exclusions": dict(exclusions.most_common()),
        "unmeasured_source": unmeasured,
        "sorry": sorry,
    }
    write_json(DATA / "sources" / "mathlib.json", summary)
    return summary


if __name__ == "__main__":
    s = build()
    json.dump(s, sys.stdout, indent=1)
    print()
