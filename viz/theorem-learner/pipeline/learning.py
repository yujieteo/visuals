"""The authored learning data (te-learning/1): its markup, its rules and its checks.

Authored files (data/learning/, never written by a source refresh):
  mechanisms.json        reusable proof moves
  theorems/*.json        theorem objects: statement, hypotheses, conclusion, formal scope note and proofs
  concepts/*.json        concept objects: reminder, definition, examples, dependencies and generality links

Markup (tl-markup/1). Authored text marks each concept word explicitly: [word](c:concept-id). Inline TeX stays in
$...$ and never holds a mark. parse() turns a text into segments [[text, concept id or null], ...]; nothing finds
concepts by string replacement.

A theorem object:
  id            the catalog record id (theorem-explorer), e.g. wd:Q752375
  statement     markup: the exact statement
  hypotheses    [{id: "h:slug", text: markup, concept: concept id or null}]: the statement's own hypotheses only.
                A fact that a proof derives (such as finiteness of a subcover) is never a hypothesis.
  conclusion    markup
  formal        {decl, difference}: the mathlib declaration the catalog links, and how its statement differs from
                this statement (null when it states the same); null when the catalog links none
  proofs        [proof]; an empty list with "unknown": "reason" when no proof is authored
  new_concepts  optional [{id, name, reminder, definition, requires}] for concepts the catalog lacks

A concept object (concepts/*.json):
  id            a catalog concept id (or one a theorem file adds in new_concepts)
  reminder      one sentence of 4 to 25 words: what a reader needs back in mind
  definition    markup: the precise definition, 1 to 3 sentences
  examples      2 to 4 markup items; at least one starts with "Non-example"
  requires      the concepts the definition uses (catalog ids)
  links         0 to 3 generality links: {to, type: "generalizes" | "specializes", steps: [2 to 4 markup sentences],
                why}. "generalizes" says this concept is the more general one; "specializes" says it is a special case
                of `to`. The steps lift one concept to the other (how an instance of the special concept is an instance
                of the general one, or which condition the special case adds), in the format of proof steps.

A proof object (id unique inside its theorem; its public id is proof:<theorem id>:<id>):
  name, slogan (one sentence), scope (what it covers, its case split, an excluded case and how it is handled)
  mechanisms    [m:...]
  roles         one per hypothesis: {h, why, steps: [step ids]} or {h, why, unused: true} when this proof does not
                use the hypothesis
  steps         3 to 7: {id: "s:slug", slogan, detail (the full argument of the step), uses: [catalog ids of lemmas]}
  edges         [[from, to]]: the target step uses the output of the source step ("enables")
  conclusion    the step that gives the conclusion
  concepts      {concept id: why it matters in this proof}, for every concept marked in the theorem or the proof
  source        {kind: "lean", decl, follows: true|false, note} | {kind: "web", url, note} | {kind: "authored", note}
                | {kind: "cited", ref, url (optional), note}: a published proof (paper or book) that the steps outline,
                for a result whose full proof is too long to write out here

Rules (check()): every hypothesis has one role per proof, with steps unless unused; every role step, edge end and the
conclusion are steps of the proof; the step graph is acyclic and every step reaches the conclusion; a slogan is one
sentence of 4 to 20 words and not a bare "Apply X" or "Use X"; every marked concept exists and has a "why" in each
proof; every mechanism exists; every lemma id is a catalog record and not the theorem itself.

Run: python3 pipeline/learning.py check FILE... (authors run it on their batch; it prints every problem)
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VISUAL = HERE.parent
ROOT = VISUAL.parents[1]
LEARNING = VISUAL / "data" / "learning"
WORKDIR = ROOT / "build" / "tl-work"
SCHEMA = "te-learning/1"
MARKUP_RULE = "tl-markup/1"

_MARK = re.compile(r"\[([^\[\]]+)\]\((c:[a-z0-9][a-z0-9-]*)\)")
_HID = re.compile(r"^h:[a-z0-9][a-z0-9-]*$")
_SID = re.compile(r"^s:[a-z0-9][a-z0-9-]*$")
_PID = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_CID = re.compile(r"^c:[a-z0-9][a-z0-9-]*$")
_BARE = re.compile(r"^(?:apply|use|invoke|employ|do|by|recall)\b(?:\s+\S+){0,3}\.?$", re.I)
_WORD = re.compile(r"[A-Za-z0-9$\\][^\s]*")


def parse(text):
    """Markup -> segments [[text, concept id or None], ...]. Raises ValueError on a mark inside $...$."""
    text = text or ""
    out, pos = [], 0
    for m in _MARK.finditer(text):
        before = text[pos:m.start()]
        if text[:m.start()].count("$") % 2 == 1:
            raise ValueError(f"a concept mark sits inside $...$: {m.group(0)}")
        if before:
            out.append([before, None])
        out.append([m.group(1), m.group(2)])
        pos = m.end()
    if pos < len(text):
        out.append([text[pos:], None])
    return out


def plain(text):
    """Markup without its marks: the words a reader sees."""
    return _MARK.sub(lambda m: m.group(1), text or "")


def marks(text):
    return [m.group(2) for m in _MARK.finditer(text or "")]


def words(text):
    return len(_WORD.findall(plain(text)))


def one_sentence(text):
    t = plain(text).strip()
    # Ignore full stops inside $...$ and in abbreviations such as "e.g." or "i.e.".
    t = re.sub(r"\$[^$]*\$", "X", t)
    t = re.sub(r"\b(e\.g|i\.e|cf|resp|etc|vs)\.", "x", t)
    return t.endswith(".") and not re.search(r"[.!?]\s+[A-Z]", t[:-1])


def load_indexes(workdir=WORKDIR):
    concepts, results = set(), set()
    with open(workdir / "concept-index.tsv", encoding="utf-8") as f:
        next(f)
        for line in f:
            concepts.add(line.split("\t", 1)[0])
    with open(workdir / "result-index.tsv", encoding="utf-8") as f:
        next(f)
        for line in f:
            results.add(line.split("\t", 1)[0])
    mechanisms = {m["id"] for m in json.loads((LEARNING / "mechanisms.json").read_text(encoding="utf-8"))["mechanisms"]}
    return concepts, results, mechanisms


def reaches(steps, edges, target):
    """Steps from which the target is reachable along edges (the target included)."""
    back = {s: [] for s in steps}
    for a, b in edges:
        back.setdefault(b, []).append(a)
    seen, todo = {target}, [target]
    while todo:
        for a in back.get(todo.pop(), []):
            if a not in seen:
                seen.add(a)
                todo.append(a)
    return seen


def acyclic(steps, edges):
    nxt = {s: [] for s in steps}
    for a, b in edges:
        nxt.setdefault(a, []).append(b)
    state = {}

    def visit(u):
        state[u] = 1
        for v in nxt.get(u, []):
            if state.get(v) == 1 or (v not in state and not visit(v)):
                return False
        state[u] = 2
        return True
    return all(state.get(s) == 2 or visit(s) for s in steps)


def check_theorem(t, idx, packet_ids=None):
    """Every problem of one theorem object, as text lines."""
    concepts, results, mechanisms = idx
    p = []
    tid = t.get("id")
    where = f"{tid}"
    if tid not in results:
        p.append(f"{where}: id is not a catalog record")
    if packet_ids is not None and tid not in packet_ids:
        p.append(f"{where}: id is not in this batch")
    new = {c.get("id") for c in t.get("new_concepts") or []}
    for c in t.get("new_concepts") or []:
        if not _CID.match(c.get("id", "")) or c["id"] in concepts:
            p.append(f"{where}: new concept id {c.get('id')} is malformed or already in the catalog (use the catalog id)")
        for k in ("name", "reminder", "definition"):
            if not c.get(k):
                p.append(f"{where}: new concept {c.get('id')} has no {k}")
        for r in c.get("requires") or []:
            if r not in concepts and r not in new:
                p.append(f"{where}: new concept {c.get('id')} requires unknown concept {r}")
    known = concepts | new

    def text_ok(label, text, need=True):
        if need and not (text or "").strip():
            p.append(f"{where}: {label} is empty")
            return []
        try:
            parse(text)
        except ValueError as e:
            p.append(f"{where}: {label}: {e}")
        ids = marks(text)
        for c in ids:
            if c not in known:
                p.append(f"{where}: {label}: unknown concept id {c} (search build/tl-work/concept-index.tsv, or add it to new_concepts)")
        return ids

    theorem_marks = text_ok("statement", t.get("statement")) + text_ok("conclusion", t.get("conclusion"))
    hyps = t.get("hypotheses") or []
    hids = [h.get("id") for h in hyps]
    if len(set(hids)) != len(hids):
        p.append(f"{where}: hypothesis ids repeat")
    for h in hyps:
        if not _HID.match(h.get("id") or ""):
            p.append(f"{where}: hypothesis id {h.get('id')} is not h:slug")
        theorem_marks += text_ok(f"hypothesis {h.get('id')}", h.get("text"))
        if h.get("concept") and h["concept"] not in known:
            p.append(f"{where}: hypothesis {h.get('id')} concept {h['concept']} is unknown")
    formal = t.get("formal")
    if formal is not None and not formal.get("decl"):
        p.append(f"{where}: formal has no decl")
    proofs = t.get("proofs")
    if proofs is None:
        p.append(f"{where}: no proofs list")
        return p
    if not proofs and not t.get("unknown"):
        p.append(f"{where}: no proof and no 'unknown' reason")
    if not proofs and t.get("unknown") and len(str(t["unknown"])) < 30:
        p.append(f"{where}: the unknown reason must explain why the record is not one provable statement")
    if len(proofs) > 3:
        p.append(f"{where}: more than 3 proofs")
    pids = [q.get("id") for q in proofs]
    if len(set(pids)) != len(pids):
        p.append(f"{where}: proof ids repeat")
    names = [q.get("name") for q in proofs]
    if len(set(names)) != len(names):
        p.append(f"{where}: proof names repeat")
    for q in proofs:
        pw = f"{where} proof {q.get('id')}"
        if not _PID.match(q.get("id") or ""):
            p.append(f"{pw}: id is not a lowercase slug")
        if not q.get("name"):
            p.append(f"{pw}: no name")
        used = list(theorem_marks)
        sl = q.get("slogan") or ""
        used += text_ok(f"proof {q.get('id')} slogan", sl)
        if sl and (not one_sentence(sl) or words(sl) > 30):
            p.append(f"{pw}: the proof slogan must be one sentence of at most 30 words")
        used += text_ok(f"proof {q.get('id')} scope", q.get("scope"))
        for m in q.get("mechanisms") or []:
            if m not in mechanisms:
                p.append(f"{pw}: unknown mechanism {m}")
        steps = q.get("steps") or []
        sids = [s.get("id") for s in steps]
        if not 3 <= len(steps) <= 7:
            p.append(f"{pw}: {len(steps)} steps (3 to 7 are allowed)")
        if len(set(sids)) != len(sids):
            p.append(f"{pw}: step ids repeat")
        for s in steps:
            sw = f"{pw} step {s.get('id')}"
            if not _SID.match(s.get("id") or ""):
                p.append(f"{sw}: id is not s:slug")
            used += text_ok(f"{sw} slogan", s.get("slogan"))
            used += text_ok(f"{sw} detail", s.get("detail"))
            sl = s.get("slogan") or ""
            if sl:
                n = words(sl)
                if not one_sentence(sl):
                    p.append(f"{sw}: the slogan must be exactly one sentence that ends with a full stop")
                if n < 4 or n > 20:
                    p.append(f"{sw}: the slogan has {n} words (4 to 20)")
                if _BARE.match(plain(sl).strip()):
                    p.append(f"{sw}: the slogan '{plain(sl)}' does not name the object and the action")
            if words(s.get("detail") or "") < 12:
                p.append(f"{sw}: the detail is too short to be the step's argument (12 words or more)")
            for u in s.get("uses") or []:
                if u not in results or u == tid:
                    p.append(f"{sw}: uses {u}, which is not another catalog record")
        roles = q.get("roles") or []
        rh = [r.get("h") for r in roles]
        for h in hids:
            if rh.count(h) != 1:
                p.append(f"{pw}: hypothesis {h} needs exactly one role (it has {rh.count(h)})")
        for r in roles:
            rw = f"{pw} role {r.get('h')}"
            if r.get("h") not in hids:
                p.append(f"{rw}: not a hypothesis of the theorem")
            used += text_ok(f"{rw} why", r.get("why"))
            if r.get("unused"):
                if r.get("steps"):
                    p.append(f"{rw}: an unused hypothesis has no steps")
            elif not r.get("steps"):
                p.append(f"{rw}: no steps (give the steps that use it, or unused: true)")
            for s in r.get("steps") or []:
                if s not in sids:
                    p.append(f"{rw}: step {s} is not a step of the proof")
        edges = q.get("edges") or []
        for e in edges:
            if not (isinstance(e, list) and len(e) == 2 and e[0] in sids and e[1] in sids and e[0] != e[1]):
                p.append(f"{pw}: edge {e} does not join two different steps")
        good = [e for e in edges if isinstance(e, list) and len(e) == 2 and e[0] in sids and e[1] in sids]
        if not acyclic(sids, good):
            p.append(f"{pw}: the step graph has a cycle")
        c = q.get("conclusion")
        if c not in sids:
            p.append(f"{pw}: conclusion {c} is not a step")
        else:
            if any(a == c for a, _ in good):
                p.append(f"{pw}: the conclusion step has an outgoing edge")
            reach = reaches(sids, good, c)
            for s in sids:
                if s not in reach:
                    p.append(f"{pw}: step {s} does not lead to the conclusion step")
        whys = q.get("concepts") or {}
        for cid in sorted(set(used)):
            if cid not in whys or words(whys[cid]) < 4:
                p.append(f"{pw}: concept {cid} needs a 'why here' of 4 words or more in concepts")
        for cid in whys:
            if cid not in known:
                p.append(f"{pw}: concepts names unknown id {cid}")
        src = q.get("source") or {}
        if src.get("kind") not in ("lean", "web", "authored", "cited"):
            p.append(f"{pw}: source kind must be lean, web, authored or cited")
        if src.get("kind") == "cited" and len(str(src.get("ref", ""))) < 20:
            p.append(f"{pw}: a cited source gives the full reference (authors, title, venue, year)")
        if src.get("kind") == "cited" and src.get("url") and not str(src["url"]).startswith("https://"):
            p.append(f"{pw}: a cited source's url is https")
        if src.get("kind") == "lean" and not src.get("decl"):
            p.append(f"{pw}: a lean source names its decl")
        if src.get("kind") == "web" and not str(src.get("url", "")).startswith("https://"):
            p.append(f"{pw}: a web source has an https url")
    return p


def check_concept(c, idx):
    """Every problem of one concept object, as text lines."""
    concepts = idx[0]
    p = []
    cid = c.get("id")
    w = f"{cid}"
    if cid not in concepts:
        p.append(f"{w}: not a catalog concept id")

    def text_ok(label, text):
        if not (text or "").strip():
            p.append(f"{w}: {label} is empty")
            return
        try:
            parse(text)
        except ValueError as e:
            p.append(f"{w}: {label}: {e}")
        for m in marks(text):
            if m not in concepts:
                p.append(f"{w}: {label}: unknown concept id {m}")
    text_ok("reminder", c.get("reminder"))
    r = c.get("reminder") or ""
    if r and (not one_sentence(r) or not 4 <= words(r) <= 25):
        p.append(f"{w}: the reminder must be one sentence of 4 to 25 words")
    text_ok("definition", c.get("definition"))
    if words(c.get("definition") or "") < 8:
        p.append(f"{w}: the definition is too short")
    ex = c.get("examples") or []
    if not 2 <= len(ex) <= 4:
        p.append(f"{w}: {len(ex)} examples (2 to 4)")
    for k, e in enumerate(ex):
        text_ok(f"example {k + 1}", e)
    if ex and not any(plain(e).lower().startswith("non-example") for e in ex):
        p.append(f"{w}: no example starts with 'Non-example'")
    for q in c.get("requires") or []:
        if q not in concepts or q == cid:
            p.append(f"{w}: requires {q}, which is not another catalog concept")
    links = c.get("links") or []
    if len(links) > 3:
        p.append(f"{w}: more than 3 links")
    for ln in links:
        lw = f"{w} link to {ln.get('to')}"
        if ln.get("to") not in concepts or ln.get("to") == cid:
            p.append(f"{lw}: not another catalog concept")
        if ln.get("type") not in ("generalizes", "specializes"):
            p.append(f"{lw}: type must be generalizes or specializes")
        st = ln.get("steps") or []
        if not 2 <= len(st) <= 4:
            p.append(f"{lw}: {len(st)} steps (2 to 4)")
        for k, s in enumerate(st):
            text_ok(f"link step {k + 1}", s)
            if s and (not one_sentence(s) or not 4 <= words(s) <= 25):
                p.append(f"{lw}: step {k + 1} must be one sentence of 4 to 25 words")
        text_ok("link why", ln.get("why"))
    return p


def check_files(paths):
    idx = load_indexes()
    problems, n = [], 0
    for path in paths:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else data.get("theorems", [])
        if Path(path).parent.name == "concepts":
            cpacket = WORKDIR / "concept-packets" / Path(path).name
            cids = {x["id"] for x in json.loads(cpacket.read_text(encoding="utf-8"))} if cpacket.is_file() else None
            seen = set()
            for c in items:
                n += 1
                if c.get("id") in seen:
                    problems.append(f"{c.get('id')}: appears twice")
                seen.add(c.get("id"))
                problems += check_concept(c, idx)
            if cids is not None:
                problems += [f"{m}: in the concept batch but not answered" for m in sorted(cids - seen)]
            continue
        packet = WORKDIR / "packets" / Path(path).name
        ids = {x["id"] for x in json.loads(packet.read_text(encoding="utf-8"))} if packet.is_file() else None
        seen = set()
        for t in items:
            n += 1
            if t.get("id") in seen:
                problems.append(f"{t.get('id')}: appears twice")
            seen.add(t.get("id"))
            problems += check_theorem(t, idx, ids)
        if ids is not None:
            for missing in sorted(ids - seen):
                problems.append(f"{missing}: in the packet batch but not answered")
    return n, problems


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] != "check":
        sys.exit("usage: learning.py check FILE...")
    n, problems = check_files(sys.argv[2:])
    for line in problems:
        print(line)
    print(f"{n} theorems, {len(problems)} problems")
    sys.exit(1 if problems else 0)
