//! Assemble the Theorem Learner's raw.json (te-learning/1) from the source catalog and the authored learning
//! data.
//!
//! Inputs:
//!   viz/theorem-explorer/raw.json   the refreshed source catalog: results, statements, evidence, relations,
//!                                   scores and the concept catalog (theorem-explorer's pipeline writes it; this
//!                                   builder never does)
//!   data/learning/                  the authored learning data (learning.rs): mechanisms, theorems with their
//!                                   proofs, concepts with reminders, examples and generality links. A source
//!                                   refresh never writes here, so reviewed proof explanations survive a refresh.
//!   <te-work>/mathlib4              the pinned mathlib, for the file and lines of a Lean declaration that a
//!                                   proof names as its source when the catalog does not already locate it
//!
//! Every authored file must pass learning::check_files; a failing file stops the run. Authored text becomes
//! explicit segments (learning::parse): a segment is a plain string, or [text, concept index] for a marked
//! concept word.
//!
//! Output raw.json:
//!   schema, snapshot (its own id, the source snapshot id, the rules), sources, rubric, concept_rubric,
//!   taxonomy, coverage (catalog and learning counts) and packs.core (gzip+base64) with:
//!     theorems   every scored catalog result: identity, scores, level, categories, the statement (authored
//!                segments, or the quoted source statement with its basis), hypotheses, conclusion, proof
//!                indices, formal declaration (decl, commit, file, lines, signature, difference), judged
//!                prerequisites, relations, key concepts, evidence indices, the explorer's note and the unknown
//!                reason
//!     proofs     proof objects: public id proof:<theorem id>:<slug>, theorem, name, slogan, scope, roles
//!                (hypothesis, why, steps, unused), steps (id, slogan, detail, concepts, lemmas), edges
//!                (enables), conclusion step, concept roles (why here), mechanisms, evidence, verification
//!     mechanisms the reusable proof moves and the proofs they occur in
//!     evidence   source statements, formal declarations (commit, declaration, file, line range) and proof
//!                sources, each with its status: formal declaration, source statement, proof source
//!     concepts   every catalog concept (identity, kind, level, scores, catalog prerequisites, definition text
//!                and basis) with the authored reminder, definition, examples, requires and links where they
//!                exist, and the concepts that theorem files add
//!     links      concept generality links: from, to, type, steps, why

use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Map, Value, json};

use crate::learning::{self, MARKUP_RULE, SCHEMA};
use crate::py::{self, compact, items, str_of, truthy, unpack};
use crate::{RESULT_TYPES, URL, json_files, read_json, read_text, write};

const RULE: &str = "tl-assemble/1";
static DECL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?m)^(?:@\[[^\]]*\]\s*)?(?:(?:protected|private|nonrec|noncomputable)\s+)*(theorem|lemma|def|instance)\s+([^\s:({\[]+)").unwrap()
});
static NS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?m)^(namespace|section|end)\b\s*([\w.]*)").unwrap());

/// Every .lean file under `dir`, in Python's order of `sorted(rglob(...))`: by path components.
fn lean_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(dir).unwrap().flatten() {
        let path = entry.path();
        if path.is_dir() {
            lean_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "lean") {
            out.push(path);
        }
    }
}

/// name -> (file, line) for theorem, lemma and def declarations of the pinned mathlib (namespaces resolved).
fn lean_locations(want: &HashSet<String>, mathlib: &Path) -> HashMap<String, (String, usize)> {
    let mut found = HashMap::new();
    if want.is_empty() || !mathlib.join("Mathlib").is_dir() {
        return found;
    }
    let mut files = vec![];
    lean_files(&mathlib.join("Mathlib"), &mut files);
    files.sort();
    for path in files {
        let text = read_text(&path);
        let mut events: Vec<(usize, bool, regex::Captures)> =
            NS.captures_iter(&text).map(|m| (m.get(0).unwrap().start(), true, m)).chain(DECL.captures_iter(&text).map(|m| (m.get(0).unwrap().start(), false, m))).collect();
        events.sort_by_key(|e| e.0);
        let mut stack: Vec<(String, String)> = vec![];
        for (pos, namespace, m) in events {
            if namespace {
                if &m[1] == "namespace" || &m[1] == "section" {
                    stack.push((m[1].to_string(), m[2].to_string()));
                } else {
                    stack.pop();
                }
                continue;
            }
            let ns: Vec<&str> = stack.iter().filter(|(w, a)| w == "namespace" && !a.is_empty()).map(|(_, a)| a.as_str()).collect();
            let ns = ns.join(".");
            let full = if !ns.is_empty() && !m[2].starts_with("_root_.") { format!("{ns}.{}", &m[2]) } else { m[2].replace("_root_.", "") };
            if want.contains(&full) && !found.contains_key(&full) {
                let line = text[..pos].matches('\n').count() + 1;
                found.insert(full, (path.strip_prefix(mathlib).unwrap().to_string_lossy().into_owned(), line));
            }
        }
        if found.len() == want.len() {
            break;
        }
    }
    found
}

fn index(v: &Value) -> usize {
    v.as_u64().expect("an index") as usize
}

/// The evidence list, each record once by id.
#[derive(Default)]
struct Evidence {
    list: Vec<Value>,
    by_id: HashMap<String, usize>,
}

impl Evidence {
    fn add(&mut self, rec: Value) -> usize {
        let id = str_of(rec.get("id"));
        *self.by_id.entry(id).or_insert_with(|| {
            self.list.push(rec);
            self.list.len() - 1
        })
    }
}

/// A formal-declaration evidence record at the pinned commit.
fn lean_evidence(decl: &str, commit: &str, loc: Option<&(String, usize, usize)>, claim: &Value) -> Value {
    json!({"id": format!("ev:lean:{decl}"), "kind": "formal declaration", "status": "formal declaration", "source": "mathlib",
           "decl": decl, "revision": commit, "file": loc.map(|l| &l.0), "lines": loc.map(|l| [l.1, l.2]),
           "url": loc.map(|l| format!("https://github.com/leanprover-community/mathlib4/blob/{commit}/{}#L{}-L{}", l.0, l.1, l.2)),
           "claim": claim, "reuse": "Apache-2.0"})
}

/// Build raw.json from the catalog at `explorer` into `out`; return the coverage and the packed size.
pub fn build(explorer: &Path, work: &Path, out: &Path) -> Result<(Value, usize), String> {
    let raw = read_json(explorer);
    let (core, det, cpack) = (unpack(&raw, "core"), unpack(&raw, "detail"), unpack(&raw, "concepts"));
    let (rows, crows, ctexts) = (items(&core, "rows"), items(&cpack, "rows"), items(&cpack, "text"));
    let det = det.as_array().unwrap();
    let commit = raw["sources"]["mathlib"]["commit"].as_str().unwrap();

    // ---- authored data, checked first ----
    let dir = learning::learning();
    let (files, cfiles) = (json_files(&dir.join("theorems")), json_files(&dir.join("concepts")));
    let (_, problems) = learning::check_files(&[files.clone(), cfiles.clone()].concat());
    if !problems.is_empty() {
        return Err(format!("authored learning data has problems:\n{}", problems.iter().take(60).cloned().collect::<Vec<_>>().join("\n")));
    }
    let (mut authored, mut authored_order) = (HashMap::new(), vec![]);
    for f in &files {
        for t in read_json(f).as_array().unwrap() {
            let id = t["id"].as_str().unwrap().to_string();
            if !authored.contains_key(&id) {
                authored_order.push(id.clone());
                authored.insert(id, t.clone());
            }
        }
    }
    let mut cauthored: HashMap<String, Value> = HashMap::new();
    for f in &cfiles {
        for c in read_json(f).as_array().unwrap() {
            cauthored.entry(c["id"].as_str().unwrap().to_string()).or_insert_with(|| c.clone());
        }
    }
    let mechs = read_json(&dir.join("mechanisms.json"))["mechanisms"].as_array().unwrap().clone();

    // ---- concepts: the catalog, then the concepts that theorem files add ----
    let mut concepts: Vec<Map<String, Value>> = vec![];
    for (c, t) in crows.iter().zip(ctexts) {
        let mut x = Map::new();
        for k in ["id", "n", "k", "lv", "s", "c", "j", "cat", "pre", "nl", "decl", "ap", "rx"] {
            x.insert(k.into(), c[k].clone());
        }
        x.insert("al".into(), json!(items(t, "al")));
        x.insert("def".into(), t.get("def").cloned().unwrap_or(Value::Null));
        x.insert("defb".into(), t.get("defb").cloned().unwrap_or(Value::Null));
        concepts.push(x);
    }
    let mut cidx: HashMap<String, usize> = concepts.iter().enumerate().map(|(i, c)| (str_of(c.get("id")), i)).collect();
    let mut added: HashMap<usize, Value> = HashMap::new();
    for id in &authored_order {
        for nc in items(&authored[id], "new_concepts") {
            let ncid = nc["id"].as_str().unwrap().to_string();
            if !cidx.contains_key(&ncid) {
                cidx.insert(ncid, concepts.len());
                added.insert(concepts.len(), nc.clone());
                concepts.push(serde_json::from_value(json!({"id": nc["id"], "n": nc["name"], "k": "other", "lv": null, "s": "uuuuuuu", "c": "low", "j": 0,
                    "cat": [], "pre": [], "nl": null, "decl": null, "ap": null, "rx": [], "al": [], "def": null, "defb": null, "new": true})).unwrap());
            }
        }
    }
    let seg = |text: Option<&Value>| -> Value {
        let segs = learning::parse(text.and_then(Value::as_str).unwrap_or("")).expect("checked markup");
        Value::Array(segs.into_iter().map(|(s, c)| c.map_or_else(|| json!(s), |c| json!([s, cidx[&c]]))).collect())
    };

    let mut links = vec![];
    for (i, c) in concepts.iter_mut().enumerate() {
        let id = str_of(c.get("id"));
        let a = match (cauthored.get(&id).filter(|a| truthy(Some(a))), added.get(&i)) {
            (Some(a), _) => a.clone(),
            (None, Some(nc)) => json!({"reminder": nc["reminder"], "definition": nc["definition"], "examples": [],
                                       "requires": items(nc, "requires"), "links": []}),
            (None, None) => continue,
        };
        c.insert("rem".into(), seg(a.get("reminder")));
        c.insert("adef".into(), seg(a.get("definition")));
        c.insert("ex".into(), json!(items(&a, "examples").iter().map(|e| seg(Some(e))).collect::<Vec<_>>()));
        c.insert("rq".into(), json!(items(&a, "requires").iter().filter_map(|r| r.as_str().and_then(|r| cidx.get(r))).collect::<Vec<_>>()));
        let mut ln_list = vec![];
        for ln in items(&a, "links") {
            let Some(&to) = ln["to"].as_str().and_then(|to| cidx.get(to)) else { continue };
            ln_list.push(links.len());
            links.push(json!({"id": format!("link:{id}:{}", str_of(ln.get("to"))), "from": cidx[&id], "to": to, "type": ln["type"],
                              "steps": items(ln, "steps").iter().map(|s| seg(Some(s))).collect::<Vec<_>>(), "why": seg(ln.get("why"))}));
        }
        c.insert("ln".into(), json!(ln_list));
    }

    // ---- theorems ----
    let mut evidence = Evidence::default();
    let order: Vec<usize> = (0..rows.len()).filter(|&i| RESULT_TYPES.contains(&rows[i]["t"].as_str().unwrap())).collect();
    let tidx: HashMap<&str, usize> = order.iter().enumerate().map(|(k, &i)| (rows[i]["id"].as_str().unwrap(), k)).collect();
    let mid: HashMap<&str, usize> = mechs.iter().enumerate().map(|(k, m)| (m["id"].as_str().unwrap(), k)).collect();
    let mut mech_proofs: Vec<Vec<usize>> = vec![vec![]; mechs.len()];
    let mut rel_by: HashMap<usize, Vec<Value>> = HashMap::new();
    for rel in items(&core, "relations") {
        let typ = rel["type"].as_str().unwrap();
        if ["special-case", "generalization", "consequence", "equivalent"].contains(&typ) {
            let (a, b) = (rows[index(&rel["source"])]["id"].as_str().unwrap(), rows[index(&rel["target"])]["id"].as_str().unwrap());
            if let (Some(&ka), Some(&kb)) = (tidx.get(a), tidx.get(b)) {
                rel_by.entry(ka).or_default().push(json!([typ, kb, "out"]));
                rel_by.entry(kb).or_default().push(json!([typ, ka, "in"]));
            }
        }
    }
    let mut lean_wanted = HashSet::new();
    for t in authored.values() {
        for q in items(t, "proofs") {
            if q["source"]["kind"] == "lean" {
                lean_wanted.insert(q["source"]["decl"].as_str().unwrap().to_string());
            }
        }
        if let Some(decl) = t.get("formal").and_then(|f| f.get("decl")).filter(|d| truthy(Some(d))) {
            lean_wanted.insert(decl.as_str().unwrap().to_string());
        }
    }
    let mut catalog_locs: HashMap<String, (String, usize, usize)> = HashMap::new();
    for &i in &order {
        let f = items(&det[i], "evs").iter().find(|e| e["kind"] == "formal declaration");
        let m = f.and_then(|f| URL.captures(f["url"].as_str().unwrap_or("")));
        if let (Some(m), true) = (m, truthy(rows[i].get("decl"))) {
            catalog_locs.insert(rows[i]["decl"].as_str().unwrap().into(), (m[2].to_string(), m[3].parse().unwrap(), m[4].parse().unwrap()));
        }
    }
    let mut locs = catalog_locs.clone();
    let wanted: HashSet<String> = lean_wanted.into_iter().filter(|d| !catalog_locs.contains_key(d)).collect();
    locs.extend(lean_locations(&wanted, &work.join("mathlib4")).into_iter().map(|(k, (file, line))| (k, (file, line, line))));

    let (mut theorems, mut proofs): (Vec<Map<String, Value>>, Vec<Value>) = (vec![], vec![]);
    for (k, &i) in order.iter().enumerate() {
        let (r, x) = (&rows[i], &det[i]);
        let mut evs = vec![];
        for e in items(x, "evs") {
            if e["kind"] == "source statement" {
                evs.push(evidence.add(json!({"id": e["id"], "kind": "source statement", "status": "source statement",
                    "source": e["method"].as_str().unwrap().split(' ').next().unwrap(), "url": e["url"], "revision": str_of(e.get("revision")),
                    "location": e["location"], "claim": e["claim"], "reuse": e.get("reuse")})));
            }
        }
        let mut formal = Value::Null;
        if truthy(r.get("decl")) {
            let decl = r["decl"].as_str().unwrap();
            let claim = if truthy(x.get("sig")) { x["sig"].clone() } else { r["decl"].clone() };
            let fe = evidence.add(lean_evidence(decl, commit, catalog_locs.get(decl), &claim));
            evs.push(fe);
            formal = json!({"decl": decl, "ev": fe, "sig": x["sig"], "concl": x["concl"], "hyps": x["hyps"], "difference": null});
        }
        let a = authored.get(r["id"].as_str().unwrap());
        let src = items(x, "evs").iter().find(|e| e["kind"] == "source statement");
        let lower = |v: &Value| v.as_str().unwrap_or("").to_lowercase();
        let decls: Vec<&str> = items(x, "decls").iter().map(|d| d.as_str().unwrap()).collect();
        let mut q = [r["q"].as_str().unwrap().to_string(), lower(&r["id"]), lower(&r["decl"]), decls.join(" ").to_lowercase(), lower(&x["mod"])].join(" ");
        let prereqs: BTreeSet<usize> = items(r, "pre").iter().map(index).collect();
        let mut th = Map::new();
        for key in ["id", "n", "t", "lv", "cat", "s", "c", "ef"] {
            th.insert(key.into(), r[key].clone());
        }
        th.insert("al".into(), x["al"].clone());
        th.insert("kc".into(), json!(cpack["rc"][i].as_array().unwrap().iter().map(|j| cidx[crows[index(j)]["id"].as_str().unwrap()]).collect::<Vec<_>>()));
        th.insert("pre".into(), json!(prereqs.iter().filter(|&&j| j != i).filter_map(|&j| tidx.get(rows[j]["id"].as_str().unwrap())).collect::<Vec<_>>()));
        th.insert("rel".into(), json!(rel_by.get(&k).cloned().unwrap_or_default()));
        th.insert("ev".into(), Value::Null);
        th.insert("why".into(), x["why"].clone());
        th.insert("formal".into(), Value::Null);
        th.insert("pf".into(), json!([]));
        th.insert("unk".into(), Value::Null);
        th.insert("q".into(), Value::Null);
        let mut pf = vec![];
        if let Some(a) = a {
            th.insert("st".into(), seg(a.get("statement")));
            th.insert("stb".into(), "authored".into());
            th.insert("hy".into(), json!(items(a, "hypotheses").iter().map(|h| json!({"id": h["id"], "seg": seg(h.get("text")),
                "c": if truthy(h.get("concept")) { h["concept"].as_str().and_then(|c| cidx.get(c)).map_or(Value::Null, |&c| json!(c)) } else { Value::Null }})).collect::<Vec<_>>()));
            th.insert("cn".into(), seg(a.get("conclusion")));
            let afdecl = a.get("formal").filter(|f| truthy(Some(f))).and_then(|f| f.get("decl")).and_then(Value::as_str);
            if !formal.is_null() && truthy(a.get("formal")) {
                formal["difference"] = a["formal"].get("difference").cloned().unwrap_or(Value::Null);
            } else if let (true, Some(decl)) = (formal.is_null(), afdecl.filter(|d| locs.contains_key(*d))) {
                // The catalog links no declaration, but the author found one in the pinned mathlib.
                let fe = evidence.add(lean_evidence(decl, commit, locs.get(decl), &json!(decl)));
                evs.push(fe);
                formal = json!({"decl": decl, "ev": fe, "sig": null, "concl": null, "hyps": null,
                                "difference": a["formal"].get("difference").cloned().unwrap_or(Value::Null)});
                q += &format!(" {}", decl.to_lowercase());
            }
            th.insert("unk".into(), a.get("unknown").cloned().unwrap_or(Value::Null));
            q += &format!(" {}", learning::plain(a["statement"].as_str().unwrap_or("")).to_lowercase());
            for p in items(a, "proofs") {
                let pid = proofs.len();
                pf.push(pid);
                let sk: HashMap<&str, usize> = items(p, "steps").iter().enumerate().map(|(j, s)| (s["id"].as_str().unwrap(), j)).collect();
                let step = |s: &Value| sk[s.as_str().unwrap()];
                let srcq = &p["source"];
                let mut pev = vec![];
                match srcq["kind"].as_str() {
                    Some("lean") => {
                        let decl = srcq["decl"].as_str().unwrap();
                        pev.push(evidence.add(lean_evidence(decl, commit, locs.get(decl), &json!(decl))));
                    }
                    Some("cited") => {
                        let rf = srcq["ref"].as_str().unwrap();
                        pev.push(evidence.add(json!({"id": format!("ev:cite:{}", &py::sha256_hex(rf.as_bytes())[..12]), "kind": "proof source",
                            "status": "cited proof", "source": "citation", "url": srcq.get("url"), "revision": null, "location": null,
                            "claim": rf, "note": srcq.get("note")})));
                    }
                    Some("web") => {
                        let url = srcq["url"].as_str().unwrap();
                        let note = if truthy(srcq.get("note")) { srcq["note"].clone() } else { json!("") };
                        pev.push(evidence.add(json!({"id": format!("ev:web:{}", &py::sha256_hex(url.as_bytes())[..12]), "kind": "proof source",
                            "status": "proof source", "source": "web", "url": url, "revision": null, "location": null, "claim": note})));
                    }
                    _ => {}
                }
                for m in items(p, "mechanisms") {
                    mech_proofs[mid[m.as_str().unwrap()]].push(pid);
                }
                let mut cw = Map::new();
                for (c, w) in p["concepts"].as_object().unwrap() {
                    cw.insert(cidx[c].to_string(), seg(Some(w)));
                }
                proofs.push(json!({
                    "id": format!("proof:{}:{}", str_of(r.get("id")), str_of(p.get("id"))), "th": k, "n": p["name"],
                    "sl": seg(p.get("slogan")), "sc": seg(p.get("scope")),
                    "ro": items(p, "roles").iter().map(|ro| json!({"h": ro["h"], "why": seg(ro.get("why")),
                        "st": items(ro, "steps").iter().map(step).collect::<Vec<_>>(), "un": truthy(ro.get("unused"))})).collect::<Vec<_>>(),
                    "stp": items(p, "steps").iter().map(|s| {
                        let text = |k: &str| s[k].as_str().unwrap_or("").to_string();
                        let cs: BTreeSet<usize> = learning::marks(&text("slogan")).into_iter().chain(learning::marks(&text("detail"))).map(|c| cidx[&c]).collect();
                        json!({"id": s["id"], "sl": seg(s.get("slogan")), "dt": seg(s.get("detail")), "cs": cs,
                               "lm": items(s, "uses").iter().filter_map(|u| u.as_str().and_then(|u| tidx.get(u))).collect::<Vec<_>>()})
                    }).collect::<Vec<_>>(),
                    "ed": items(p, "edges").iter().map(|e| json!([step(&e[0]), step(&e[1])])).collect::<Vec<_>>(),
                    "cl": step(&p["conclusion"]), "cw": cw,
                    "me": items(p, "mechanisms").iter().map(|m| mid[m.as_str().unwrap()]).collect::<Vec<_>>(), "ev": pev,
                    "src": {"kind": srcq["kind"], "decl": srcq.get("decl"), "follows": srcq.get("follows"), "url": srcq.get("url"),
                            "ref": srcq.get("ref"), "note": srcq.get("note")},
                    "vf": {"authored": true, "checked": false, "lean": false},
                }));
            }
        } else {
            let text = src.and_then(|s| s.get("claim")).filter(|c| truthy(Some(c))).cloned().unwrap_or_else(|| json!(""));
            th.insert("st".into(), json!([text]));
            th.insert("stb".into(), src.map_or_else(|| json!("none"), |s| json!(format!("quoted source statement: {}", str_of(s.get("location"))))));
            th.insert("hy".into(), json!([]));
            th.insert("cn".into(), Value::Null);
        }
        th.insert("ev".into(), json!(evs));
        th.insert("formal".into(), formal);
        th.insert("pf".into(), json!(pf));
        th.insert("q".into(), json!(q));
        theorems.push(th);
    }

    let mechanisms: Vec<Value> = mechs.iter().zip(&mech_proofs)
        .map(|(m, pf)| json!({"id": m["id"], "n": m["name"], "sl": m["slogan"], "d": m["description"], "pf": pf})).collect();
    let with_proofs = theorems.iter().filter(|t| truthy(t.get("pf"))).count();
    let mut by_source = Map::new();
    for p in &proofs {
        let kind = str_of(p["src"].get("kind"));
        let n = by_source.get(&kind).and_then(Value::as_u64).unwrap_or(0);
        by_source.insert(kind, json!(n + 1));
    }
    let evidence = evidence.list;
    let cov = json!({
        "catalog": {"theorems": theorems.len(), "concepts": crows.len()},
        "learning": {
            "theorems_with_proofs": with_proofs, "theorems_unknown": theorems.iter().filter(|t| truthy(t.get("unk"))).count(),
            "theorems_without_proofs": theorems.len() - with_proofs,
            "proofs": proofs.len(), "steps": proofs.iter().map(|p| items(p, "stp").len()).sum::<usize>(),
            "proofs_by_source": by_source,
            "proofs_following_lean": proofs.iter().filter(|p| p["src"]["kind"] == "lean" && truthy(p["src"].get("follows"))).count(),
            "theorems_with_alternatives": theorems.iter().filter(|t| t["pf"].as_array().is_some_and(|pf| pf.len() > 1)).count(),
            "mechanisms": mechanisms.len(), "mechanisms_used": mechanisms.iter().filter(|m| truthy(m.get("pf"))).count(),
            "concepts_with_reminders": concepts.iter().filter(|c| c.contains_key("rem")).count(),
            "concepts_added": concepts.iter().filter(|c| truthy(c.get("new"))).count(),
            "links": links.len(), "evidence": evidence.len(),
            "formal_declarations": evidence.iter().filter(|e| e["kind"] == "formal declaration").count(),
            "verification": {"authored": proofs.len(), "checked_correspondence": 0, "lean_checked": 0},
        },
    });
    let body = json!({"theorems": theorems, "proofs": proofs, "mechanisms": mechanisms, "evidence": evidence, "concepts": concepts, "links": links});
    let packed = py::pack(&body);
    let snap = &raw["snapshot"];
    let month: String = snap["generated_at"].as_str().unwrap().chars().take(7).collect();
    let mut rules = vec![json!(SCHEMA), json!(MARKUP_RULE), json!(RULE), json!("tl-proof-prompt/1"), json!("tl-concept-prompt/1")];
    rules.extend(items(snap, "rules").iter().cloned());
    let mut sources = Map::new();
    for key in ["mathlib", "nlab", "wikidata", "wikipedia", "theoremsearch", "taxonomy", "concepts"] {
        if let Some(s) = raw["sources"].get(key) {
            sources.insert(key.into(), s.clone());
        }
    }
    let gz_bytes = packed["gz_bytes"].as_u64().unwrap() as usize;
    let out_json = json!({
        "schema": SCHEMA,
        "snapshot": {"id": format!("tl-{month}-{}", &packed["sha256"].as_str().unwrap()[..8]), "generated_at": chrono::Local::now().date_naive().to_string(),
                     "source_snapshot": snap["id"], "evidence_cutoff": snap["evidence_cutoff"], "judge": snap["judge"], "rules": rules},
        "sources": sources, "rubric": raw["rubric"], "concept_rubric": raw["concept_rubric"], "taxonomy": raw["taxonomy"], "coverage": cov,
        "packs": {"core": packed},
    });
    write(out, &(compact(&out_json) + "\n"));
    Ok((cov, gz_bytes))
}
