//! The authored learning data (te-learning/1): its markup, its rules and its checks.
//!
//! Authored files (data/learning/, never written by a source refresh):
//!   mechanisms.json        reusable proof moves
//!   theorems/*.json        theorem objects: statement, hypotheses, conclusion, formal scope note and proofs
//!   concepts/*.json        concept objects: reminder, definition, examples, dependencies and generality links
//!
//! Markup (tl-markup/1). Authored text marks each concept word explicitly: [word](c:concept-id). Inline TeX
//! stays in $...$ and never holds a mark. `parse` turns a text into segments [(text, concept id or none)];
//! nothing finds concepts by string replacement.
//!
//! A theorem object:
//!   id            the catalog record id (theorem-explorer), e.g. wd:Q752375
//!   statement     markup: the exact statement
//!   hypotheses    [{id: "h:slug", text: markup, concept: concept id or null}]: the statement's own hypotheses
//!                 only. A fact that a proof derives (such as finiteness of a subcover) is never a hypothesis.
//!   conclusion    markup
//!   formal        {decl, difference}: the mathlib declaration the catalog links, and how its statement differs
//!                 from this statement (null when it states the same); null when the catalog links none
//!   proofs        [proof]; an empty list with "unknown": "reason" when no proof is authored
//!   new_concepts  optional [{id, name, reminder, definition, requires}] for concepts the catalog lacks
//!
//! A concept object (concepts/*.json):
//!   id            a catalog concept id (or one a theorem file adds in new_concepts)
//!   reminder      one sentence of 4 to 25 words: what a reader needs back in mind
//!   definition    markup: the precise definition, 1 to 3 sentences
//!   examples      2 to 4 markup items; at least one starts with "Non-example"
//!   requires      the concepts the definition uses (catalog ids)
//!   links         0 to 3 generality links: {to, type: "generalizes" | "specializes", steps: [2 to 4 markup
//!                 sentences], why}. "generalizes" says this concept is the more general one; "specializes" says
//!                 it is a special case of `to`. The steps lift one concept to the other, in the format of proof
//!                 steps.
//!
//! A proof object (id unique inside its theorem; its public id is proof:<theorem id>:<id>):
//!   name, slogan (one sentence), scope (what it covers, its case split, an excluded case and how it is handled)
//!   mechanisms    [m:...]
//!   roles         one per hypothesis: {h, why, steps: [step ids]} or {h, why, unused: true} when this proof does
//!                 not use the hypothesis
//!   steps         3 to 7: {id: "s:slug", slogan, detail (the full argument of the step), uses: [catalog ids]}
//!   edges         [[from, to]]: the target step uses the output of the source step ("enables")
//!   conclusion    the step that gives the conclusion
//!   concepts      {concept id: why it matters in this proof}, for every concept marked in the theorem or proof
//!   source        {kind: "lean", decl, follows: true|false, note} | {kind: "web", url, note} | {kind: "authored",
//!                 note} | {kind: "cited", ref, url (optional), note}: a published proof that the steps outline
//!
//! Rules (`check_theorem`): every hypothesis has one role per proof, with steps unless unused; every role step,
//! edge end and the conclusion are steps of the proof; the step graph is acyclic and every step reaches the
//! conclusion; a slogan is one sentence of 4 to 20 words and not a bare "Apply X" or "Use X"; every marked
//! concept exists and has a "why" in each proof; every mechanism exists; every lemma id is a catalog record and
//! not the theorem itself.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;
use serde_json::Value;

use crate::py::{self, compact, items, str_of, strip, truthy};
use crate::{read_json, visual};

pub const SCHEMA: &str = "te-learning/1";
pub const MARKUP_RULE: &str = "tl-markup/1";

static MARK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[([^\[\]]+)\]\((c:[a-z0-9][a-z0-9-]*)\)").unwrap());
static HID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^h:[a-z0-9][a-z0-9-]*$").unwrap());
static SID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^s:[a-z0-9][a-z0-9-]*$").unwrap());
static PID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[a-z0-9][a-z0-9-]*$").unwrap());
static CID: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^c:[a-z0-9][a-z0-9-]*").unwrap());
static BARE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^(?:apply|use|invoke|employ|do|by|recall)\b(?:\s+\S+){0,3}\.?$").unwrap());
static WORD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[A-Za-z0-9$\\][^\s]*").unwrap());
static TEX: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\$[^$]*\$").unwrap());
static ABBREVIATION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b(e\.g|i\.e|cf|resp|etc|vs)\.").unwrap());
static NEXT_SENTENCE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[.!?]\s+[A-Z]").unwrap());

pub fn learning() -> PathBuf {
    visual().join("data").join("learning")
}

/// Where packets.rs writes the packets and the indexes that the checks read: build/tl-work.
pub fn workdir() -> PathBuf {
    visual().join("../../build/tl-work")
}

/// Markup -> segments [(text, concept id or none)]. Fails on a mark inside $...$.
pub fn parse(text: &str) -> Result<Vec<(String, Option<String>)>, String> {
    let (mut out, mut pos) = (Vec::new(), 0);
    for m in MARK.captures_iter(text) {
        let whole = m.get(0).unwrap();
        if text[..whole.start()].matches('$').count() % 2 == 1 {
            return Err(format!("a concept mark sits inside $...$: {}", whole.as_str()));
        }
        if whole.start() > pos {
            out.push((text[pos..whole.start()].to_string(), None));
        }
        out.push((m[1].to_string(), Some(m[2].to_string())));
        pos = whole.end();
    }
    if pos < text.len() {
        out.push((text[pos..].to_string(), None));
    }
    Ok(out)
}

/// Markup without its marks: the words a reader sees.
pub fn plain(text: &str) -> String {
    MARK.replace_all(text, "$1").into_owned()
}

pub fn marks(text: &str) -> Vec<String> {
    MARK.captures_iter(text).map(|m| m[2].to_string()).collect()
}

fn words(text: &str) -> usize {
    WORD.find_iter(&plain(text)).count()
}

fn one_sentence(text: &str) -> bool {
    let plain = plain(text);
    // Ignore full stops inside $...$ and in abbreviations such as "e.g." or "i.e.".
    let t = TEX.replace_all(strip(&plain), "X");
    let t = ABBREVIATION.replace_all(&t, "x");
    t.ends_with('.') && !NEXT_SENTENCE.is_match(&t[..t.len() - 1])
}

/// The catalog's concept ids and record ids (from packets.rs's indexes) and the mechanism ids.
pub struct Indexes {
    concepts: HashSet<String>,
    results: HashSet<String>,
    mechanisms: HashSet<String>,
}

fn index_ids(path: &Path) -> HashSet<String> {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    // Each line keeps its newline, as Python's file iteration does, so a line without a tab keeps it in the id.
    text.split_inclusive('\n').skip(1).map(|line| line.split('\t').next().unwrap().to_string()).collect()
}

pub fn load_indexes(workdir: &Path) -> Indexes {
    let mechanisms = read_json(&learning().join("mechanisms.json"));
    Indexes {
        concepts: index_ids(&workdir.join("concept-index.tsv")),
        results: index_ids(&workdir.join("result-index.tsv")),
        mechanisms: items(&mechanisms, "mechanisms").iter().map(|m| m["id"].as_str().unwrap().to_string()).collect(),
    }
}

/// A JSON value as a set key: values are equal when their JSON is.
fn key(v: Option<&Value>) -> String {
    v.map_or_else(|| "null".into(), compact)
}

/// Steps from which the target is reachable along edges (the target included).
fn reaches(steps: &[String], edges: &[(String, String)], target: &str) -> HashSet<String> {
    let mut back: HashMap<&str, Vec<&str>> = steps.iter().map(|s| (s.as_str(), vec![])).collect();
    for (a, b) in edges {
        back.entry(b).or_default().push(a);
    }
    let (mut seen, mut todo) = (HashSet::from([target.to_string()]), vec![target.to_string()]);
    while let Some(u) = todo.pop() {
        for a in back.get(u.as_str()).into_iter().flatten() {
            if seen.insert(a.to_string()) {
                todo.push(a.to_string());
            }
        }
    }
    seen
}

fn acyclic(steps: &[String], edges: &[(String, String)]) -> bool {
    let mut next: HashMap<&str, Vec<&str>> = steps.iter().map(|s| (s.as_str(), vec![])).collect();
    for (a, b) in edges {
        next.entry(a).or_default().push(b);
    }
    fn visit<'a>(u: &'a str, next: &HashMap<&'a str, Vec<&'a str>>, state: &mut HashMap<&'a str, u8>) -> bool {
        state.insert(u, 1);
        for &v in next.get(u).into_iter().flatten() {
            if state.get(v) == Some(&1) || (!state.contains_key(v) && !visit(v, next, state)) {
                return false;
            }
        }
        state.insert(u, 2);
        true
    }
    let mut state = HashMap::new();
    steps.iter().all(|s| state.get(s.as_str()) == Some(&2) || visit(s, &next, &mut state))
}

/// One problem list, with the place every line starts with.
struct Problems<'a> {
    lines: Vec<String>,
    known: &'a HashSet<String>,
}

impl Problems<'_> {
    fn add(&mut self, line: String) {
        self.lines.push(line);
    }

    /// The marks of a text that must not be empty, with a problem for each fault.
    fn text_ok(&mut self, place: &str, label: &str, text: Option<&Value>, hint: &str) -> Vec<String> {
        let text = text.and_then(Value::as_str).unwrap_or("");
        if strip(text).is_empty() {
            self.add(format!("{place}: {label} is empty"));
            return vec![];
        }
        if let Err(e) = parse(text) {
            self.add(format!("{place}: {label}: {e}"));
        }
        let ids = marks(text);
        for c in &ids {
            if !self.known.contains(c) {
                self.add(format!("{place}: {label}: unknown concept id {c}{hint}"));
            }
        }
        ids
    }
}

const HINT: &str = " (search build/tl-work/concept-index.tsv, or add it to new_concepts)";

fn is_str_in(v: Option<&Value>, set: &HashSet<String>) -> bool {
    v.and_then(Value::as_str).is_some_and(|s| set.contains(s))
}

fn matches(re: &Regex, v: Option<&Value>) -> bool {
    re.is_match(v.and_then(Value::as_str).unwrap_or(""))
}

fn repeats(ids: &[String]) -> bool {
    ids.iter().collect::<HashSet<_>>().len() != ids.len()
}

/// Every problem of one theorem object, as text lines.
pub fn check_theorem(t: &Value, idx: &Indexes, packet_ids: Option<&HashSet<String>>) -> Vec<String> {
    let tid = t.get("id");
    let place = str_of(tid);
    let mut lines = vec![];
    if !is_str_in(tid, &idx.results) {
        lines.push(format!("{place}: id is not a catalog record"));
    }
    if packet_ids.is_some_and(|ids| !is_str_in(tid, ids)) {
        lines.push(format!("{place}: id is not in this batch"));
    }
    let new_concepts = items(t, "new_concepts");
    let new: HashSet<String> = new_concepts.iter().map(|c| key(c.get("id"))).collect();
    let new_ids: HashSet<String> = new_concepts.iter().filter_map(|c| c.get("id").and_then(Value::as_str)).map(String::from).collect();
    for c in new_concepts {
        if !matches(&CID, c.get("id")) || is_str_in(c.get("id"), &idx.concepts) {
            lines.push(format!("{place}: new concept id {} is malformed or already in the catalog (use the catalog id)", str_of(c.get("id"))));
        }
        for k in ["name", "reminder", "definition"] {
            if !truthy(c.get(k)) {
                lines.push(format!("{place}: new concept {} has no {k}", str_of(c.get("id"))));
            }
        }
        for r in items(c, "requires") {
            if !is_str_in(Some(r), &idx.concepts) && !new.contains(&key(Some(r))) {
                lines.push(format!("{place}: new concept {} requires unknown concept {}", str_of(c.get("id")), str_of(Some(r))));
            }
        }
    }
    let known: HashSet<String> = idx.concepts.union(&new_ids).cloned().collect();
    let mut p = Problems { lines, known: &known };

    let mut theorem_marks = p.text_ok(&place, "statement", t.get("statement"), HINT);
    theorem_marks.extend(p.text_ok(&place, "conclusion", t.get("conclusion"), HINT));
    let hyps = items(t, "hypotheses");
    let hids: Vec<String> = hyps.iter().map(|h| key(h.get("id"))).collect();
    if repeats(&hids) {
        p.add(format!("{place}: hypothesis ids repeat"));
    }
    for h in hyps {
        let hid = str_of(h.get("id"));
        if !matches(&HID, h.get("id")) {
            p.add(format!("{place}: hypothesis id {hid} is not h:slug"));
        }
        theorem_marks.extend(p.text_ok(&place, &format!("hypothesis {hid}"), h.get("text"), HINT));
        if truthy(h.get("concept")) && !is_str_in(h.get("concept"), &known) {
            p.add(format!("{place}: hypothesis {hid} concept {} is unknown", str_of(h.get("concept"))));
        }
    }
    if let Some(formal) = t.get("formal").filter(|f| !f.is_null()) {
        if !truthy(formal.get("decl")) {
            p.add(format!("{place}: formal has no decl"));
        }
    }
    let Some(proofs) = t.get("proofs").filter(|q| !q.is_null()) else {
        p.add(format!("{place}: no proofs list"));
        return p.lines;
    };
    let proofs = proofs.as_array().map_or(&[][..], Vec::as_slice);
    if proofs.is_empty() && !truthy(t.get("unknown")) {
        p.add(format!("{place}: no proof and no 'unknown' reason"));
    }
    if proofs.is_empty() && truthy(t.get("unknown")) && str_of(t.get("unknown")).chars().count() < 30 {
        p.add(format!("{place}: the unknown reason must explain why the record is not one provable statement"));
    }
    if proofs.len() > 3 {
        p.add(format!("{place}: more than 3 proofs"));
    }
    if repeats(&proofs.iter().map(|q| key(q.get("id"))).collect::<Vec<_>>()) {
        p.add(format!("{place}: proof ids repeat"));
    }
    if repeats(&proofs.iter().map(|q| key(q.get("name"))).collect::<Vec<_>>()) {
        p.add(format!("{place}: proof names repeat"));
    }
    for q in proofs {
        let qid = str_of(q.get("id"));
        let pw = format!("{place} proof {qid}");
        if !matches(&PID, q.get("id")) {
            p.add(format!("{pw}: id is not a lowercase slug"));
        }
        if !truthy(q.get("name")) {
            p.add(format!("{pw}: no name"));
        }
        let mut used = theorem_marks.clone();
        let slogan = q.get("slogan").filter(|s| truthy(Some(s))).cloned().unwrap_or_else(|| Value::from(""));
        used.extend(p.text_ok(&place, &format!("proof {qid} slogan"), Some(&slogan), HINT));
        let sl = slogan.as_str().unwrap_or("");
        if !sl.is_empty() && (!one_sentence(sl) || words(sl) > 30) {
            p.add(format!("{pw}: the proof slogan must be one sentence of at most 30 words"));
        }
        used.extend(p.text_ok(&place, &format!("proof {qid} scope"), q.get("scope"), HINT));
        for m in items(q, "mechanisms") {
            if !is_str_in(Some(m), &idx.mechanisms) {
                p.add(format!("{pw}: unknown mechanism {}", str_of(Some(m))));
            }
        }
        let steps = items(q, "steps");
        let sids: Vec<String> = steps.iter().map(|s| key(s.get("id"))).collect();
        if !(3..=7).contains(&steps.len()) {
            p.add(format!("{pw}: {} steps (3 to 7 are allowed)", steps.len()));
        }
        if repeats(&sids) {
            p.add(format!("{pw}: step ids repeat"));
        }
        for s in steps {
            let sw = format!("{pw} step {}", str_of(s.get("id")));
            if !matches(&SID, s.get("id")) {
                p.add(format!("{sw}: id is not s:slug"));
            }
            used.extend(p.text_ok(&place, &format!("{} slogan", &sw[place.len() + 1..]), s.get("slogan"), HINT));
            used.extend(p.text_ok(&place, &format!("{} detail", &sw[place.len() + 1..]), s.get("detail"), HINT));
            let sl = s.get("slogan").and_then(Value::as_str).unwrap_or("");
            if !sl.is_empty() {
                let n = words(sl);
                if !one_sentence(sl) {
                    p.add(format!("{sw}: the slogan must be exactly one sentence that ends with a full stop"));
                }
                if !(4..=20).contains(&n) {
                    p.add(format!("{sw}: the slogan has {n} words (4 to 20)"));
                }
                if BARE.is_match(strip(&plain(sl))) {
                    p.add(format!("{sw}: the slogan '{}' does not name the object and the action", plain(sl)));
                }
            }
            if words(s.get("detail").and_then(Value::as_str).unwrap_or("")) < 12 {
                p.add(format!("{sw}: the detail is too short to be the step's argument (12 words or more)"));
            }
            for u in items(s, "uses") {
                if !is_str_in(Some(u), &idx.results) || Some(u) == tid {
                    p.add(format!("{sw}: uses {}, which is not another catalog record", str_of(Some(u))));
                }
            }
        }
        let roles = items(q, "roles");
        let rh: Vec<String> = roles.iter().map(|r| key(r.get("h"))).collect();
        for (h, hyp) in hids.iter().zip(hyps) {
            let count = rh.iter().filter(|x| *x == h).count();
            if count != 1 {
                p.add(format!("{pw}: hypothesis {} needs exactly one role (it has {count})", str_of(hyp.get("id"))));
            }
        }
        for r in roles {
            let rw = format!("{pw} role {}", str_of(r.get("h")));
            if !hids.contains(&key(r.get("h"))) {
                p.add(format!("{rw}: not a hypothesis of the theorem"));
            }
            used.extend(p.text_ok(&place, &format!("{} why", &rw[place.len() + 1..]), r.get("why"), HINT));
            if truthy(r.get("unused")) {
                if truthy(r.get("steps")) {
                    p.add(format!("{rw}: an unused hypothesis has no steps"));
                }
            } else if !truthy(r.get("steps")) {
                p.add(format!("{rw}: no steps (give the steps that use it, or unused: true)"));
            }
            for s in items(r, "steps") {
                if !sids.contains(&key(Some(s))) {
                    p.add(format!("{rw}: step {} is not a step of the proof", str_of(Some(s))));
                }
            }
        }
        let edges = items(q, "edges");
        let pair = |e: &Value| e.as_array().filter(|e| e.len() == 2).map(|e| (key(Some(&e[0])), key(Some(&e[1]))));
        for e in edges {
            if !pair(e).is_some_and(|(a, b)| sids.contains(&a) && sids.contains(&b) && a != b) {
                p.add(format!("{pw}: edge {} does not join two different steps", str_of(Some(e))));
            }
        }
        let good: Vec<(String, String)> = edges.iter().filter_map(pair).filter(|(a, b)| sids.contains(a) && sids.contains(b)).collect();
        if !acyclic(&sids, &good) {
            p.add(format!("{pw}: the step graph has a cycle"));
        }
        let c = q.get("conclusion");
        if !sids.contains(&key(c)) {
            p.add(format!("{pw}: conclusion {} is not a step", str_of(c)));
        } else {
            if good.iter().any(|(a, _)| *a == key(c)) {
                p.add(format!("{pw}: the conclusion step has an outgoing edge"));
            }
            let reach = reaches(&sids, &good, &key(c));
            for (s, step) in sids.iter().zip(steps) {
                if !reach.contains(s) {
                    p.add(format!("{pw}: step {} does not lead to the conclusion step", str_of(step.get("id"))));
                }
            }
        }
        let empty = serde_json::Map::new();
        let whys = q.get("concepts").and_then(Value::as_object).unwrap_or(&empty);
        for cid in used.iter().collect::<BTreeSet<_>>() {
            if !whys.get(cid).is_some_and(|w| words(w.as_str().unwrap_or("")) >= 4) {
                p.add(format!("{pw}: concept {cid} needs a 'why here' of 4 words or more in concepts"));
            }
        }
        for cid in whys.keys() {
            if !known.contains(cid) {
                p.add(format!("{pw}: concepts names unknown id {cid}"));
            }
        }
        let src = q.get("source").filter(|s| truthy(Some(s))).cloned().unwrap_or_else(|| serde_json::json!({}));
        let kind = src.get("kind").and_then(Value::as_str);
        if !matches!(kind, Some("lean" | "web" | "authored" | "cited")) {
            p.add(format!("{pw}: source kind must be lean, web, authored or cited"));
        }
        if kind == Some("cited") && src.get("ref").map_or(0, |r| str_of(Some(r)).chars().count()) < 20 {
            p.add(format!("{pw}: a cited source gives the full reference (authors, title, venue, year)"));
        }
        if kind == Some("cited") && truthy(src.get("url")) && !str_of(src.get("url")).starts_with("https://") {
            p.add(format!("{pw}: a cited source's url is https"));
        }
        if kind == Some("lean") && !truthy(src.get("decl")) {
            p.add(format!("{pw}: a lean source names its decl"));
        }
        if kind == Some("web") && !src.get("url").is_some_and(|u| str_of(Some(u)).starts_with("https://")) {
            p.add(format!("{pw}: a web source has an https url"));
        }
    }
    p.lines
}

/// Every problem of one concept object, as text lines.
pub fn check_concept(c: &Value, idx: &Indexes) -> Vec<String> {
    let cid = c.get("id");
    let w = str_of(cid);
    let mut p = Problems { lines: vec![], known: &idx.concepts };
    if !is_str_in(cid, &idx.concepts) {
        p.add(format!("{w}: not a catalog concept id"));
    }
    p.text_ok(&w, "reminder", c.get("reminder"), "");
    let r = c.get("reminder").and_then(Value::as_str).unwrap_or("");
    if !r.is_empty() && (!one_sentence(r) || !(4..=25).contains(&words(r))) {
        p.add(format!("{w}: the reminder must be one sentence of 4 to 25 words"));
    }
    p.text_ok(&w, "definition", c.get("definition"), "");
    if words(c.get("definition").and_then(Value::as_str).unwrap_or("")) < 8 {
        p.add(format!("{w}: the definition is too short"));
    }
    let ex = items(c, "examples");
    if !(2..=4).contains(&ex.len()) {
        p.add(format!("{w}: {} examples (2 to 4)", ex.len()));
    }
    for (k, e) in ex.iter().enumerate() {
        p.text_ok(&w, &format!("example {}", k + 1), Some(e), "");
    }
    if !ex.is_empty() && !ex.iter().any(|e| plain(e.as_str().unwrap_or("")).to_lowercase().starts_with("non-example")) {
        p.add(format!("{w}: no example starts with 'Non-example'"));
    }
    for q in items(c, "requires") {
        if !is_str_in(Some(q), &idx.concepts) || Some(q) == cid {
            p.add(format!("{w}: requires {}, which is not another catalog concept", str_of(Some(q))));
        }
    }
    let links = items(c, "links");
    if links.len() > 3 {
        p.add(format!("{w}: more than 3 links"));
    }
    for ln in links {
        let lw = format!("{w} link to {}", str_of(ln.get("to")));
        if !is_str_in(ln.get("to"), &idx.concepts) || ln.get("to") == cid {
            p.add(format!("{lw}: not another catalog concept"));
        }
        if !matches!(ln.get("type").and_then(Value::as_str), Some("generalizes" | "specializes")) {
            p.add(format!("{lw}: type must be generalizes or specializes"));
        }
        let st = items(ln, "steps");
        if !(2..=4).contains(&st.len()) {
            p.add(format!("{lw}: {} steps (2 to 4)", st.len()));
        }
        for (k, s) in st.iter().enumerate() {
            p.text_ok(&w, &format!("link step {}", k + 1), Some(s), "");
            let s = s.as_str().unwrap_or("");
            if !s.is_empty() && (!one_sentence(s) || !(4..=25).contains(&words(s))) {
                p.add(format!("{lw}: step {} must be one sentence of 4 to 25 words", k + 1));
            }
        }
        p.text_ok(&w, "link why", ln.get("why"), "");
    }
    p.lines
}

fn ids_of(path: &Path) -> Option<HashSet<String>> {
    path.is_file().then(|| read_json(path).as_array().unwrap().iter().map(|x| x["id"].as_str().unwrap().to_string()).collect())
}

/// Check authored files against the catalog indexes and, when a file has a packet batch of the same name,
/// against that batch; return the number of objects and every problem.
pub fn check_files(paths: &[PathBuf]) -> (usize, Vec<String>) {
    let work = workdir();
    let idx = load_indexes(&work);
    let (mut problems, mut n) = (vec![], 0);
    for path in paths {
        let data = read_json(path);
        let objects = match &data {
            Value::Array(a) => a.as_slice(),
            other => items(other, "theorems"),
        };
        let name = path.file_name().unwrap();
        let concepts = path.parent().and_then(Path::file_name).is_some_and(|d| d == "concepts");
        let batch = ids_of(&work.join(if concepts { "concept-packets" } else { "packets" }).join(name));
        let mut seen = HashSet::new();
        for x in objects {
            n += 1;
            if !seen.insert(key(x.get("id"))) {
                problems.push(format!("{}: appears twice", str_of(x.get("id"))));
            }
            problems.extend(if concepts { check_concept(x, &idx) } else { check_theorem(x, &idx, batch.as_ref()) });
        }
        if let Some(batch) = batch {
            let what = if concepts { "concept batch" } else { "packet batch" };
            let missing: BTreeSet<&String> = batch.iter().filter(|id| !seen.contains(&py::compact(&Value::from(id.as_str())))).collect();
            problems.extend(missing.into_iter().map(|m| format!("{m}: in the {what} but not answered")));
        }
    }
    (n, problems)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks_become_segments_and_never_sit_in_tex() {
        let segs = parse("A [group](c:group) acts on $X$.").unwrap();
        assert_eq!(segs, vec![("A ".into(), None), ("group".into(), Some("c:group".into())), (" acts on $X$.".into(), None)]);
        assert!(parse("$[x](c:x)$").unwrap_err().contains("inside $...$"));
        assert_eq!(plain("a [b](c:b) c"), "a b c");
    }

    #[test]
    fn a_slogan_is_one_sentence() {
        assert!(one_sentence("Bound the sum by $f(x) = 1. Y$ e.g. here."));
        assert!(!one_sentence("Bound the sum. Then stop."));
        assert!(BARE.is_match("Apply the lemma."));
        assert_eq!(words("Use [compactness](c:compact) on $K$ twice."), 5);
    }

    #[test]
    fn the_step_graph_must_be_acyclic_and_reach_the_conclusion() {
        let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
        let e = |v: &[(&str, &str)]| v.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect::<Vec<_>>();
        assert!(acyclic(&s(&["a", "b", "c"]), &e(&[("a", "b"), ("b", "c")])));
        assert!(!acyclic(&s(&["a", "b"]), &e(&[("a", "b"), ("b", "a")])));
        assert_eq!(reaches(&s(&["a", "b", "c"]), &e(&[("a", "c")]), "c"), HashSet::from(["a".into(), "c".into()]));
    }
}
