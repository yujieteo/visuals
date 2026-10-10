//! Authoring packets (tl-packets/1): what a proof author reads for each theorem, Lean first.
//!
//! Inputs: viz/theorem-explorer/raw.json (the source catalog: results, statements, evidence, key concepts,
//! relations and the concept catalog) and the pinned mathlib4 checkout at <work>/mathlib4 (the theorem-explorer
//! pipeline's work directory, build/te-work by default; TE_WORK moves it).
//!
//! For each scored result (a named theorem, lemma, inequality, identity, principle, formula, criterion, proved
//! conjecture, construction, classification or other result) the packet holds:
//!   id, name, type, aliases, reader level, arXiv categories
//!   sources     at most two quoted source statements (Wikipedia lead, nLab Idea paragraph or a mathlib list entry)
//!   lean        the formal declaration (name, signature, conclusion, explicit hypotheses, typeclasses, module,
//!               file and line range at the pinned commit) and the declaration's text from that file, at most 120
//!               lines: the Lean proof the author reads first
//!   concepts    the key concepts the result names, each with its catalog concept id when the catalog has one
//!   prereqs     the judged prerequisite results; related: special cases, generalizations, consequences, equivalents
//!   explanation the explorer's judge note on the result
//!
//! Outputs in <out> (default build/tl-work): packets/batch-NN.json (N per batch, in the explorer's default score
//! order, so the most useful results come first), concept-index.tsv (every catalog concept: id, name, kind,
//! level, aliases; authors search it for concept ids) and result-index.tsv (every catalog record: id, name,
//! type; authors search it for the lemmas a step uses).
//!
//! Concept packets (--concepts FILE: one concept id per line) go to concept-packets/batch-NN.json, 120 per
//! batch: id, name, kind, level, aliases, the catalog's definition text and its basis, the catalog
//! prerequisites, the concepts that need it and the results that name it, for the concept author.
//!
//! --marked writes concept packets for every catalog concept that the authored theorem files mark
//! ([word](c:id)), most used first, leaving out concepts already answered in data/learning/concepts/ and the
//! theorem files' own new_concepts.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::fmt::Write as _;
use std::path::Path;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Map, Value, json};

use crate::py::{indented, items, str_of, unpack};
use crate::{RESULT_TYPES, URL, json_files, read_json, write};

const LEVELS: [&str; 4] = ["school", "undergrad", "graduate", "research"];
const PRESET: [f64; 7] = [25.0, 25.0, 20.0, 15.0, 5.0, 5.0, 5.0];
static MARKED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\]\((c:[^)\s]+)\)").unwrap());

/// The explorer's balanced aggregate, or none when a component is unknown (te-rubric/1).
fn balanced(s: &str) -> Option<f64> {
    if !s.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    // Python's sum() starts from the integer 0 and adds each weight times the digit over 4 in order.
    Some(PRESET.iter().zip(s.chars()).fold(0.0, |sum, (w, c)| sum + w * c.to_digit(10).unwrap() as f64 / 4.0))
}

/// The declaration's place at the pinned commit, and its lines, from a formal-declaration evidence URL.
fn lean_text(url: &str, mathlib: &Path) -> (Option<Map<String, Value>>, Option<String>) {
    let Some(m) = URL.captures(url) else { return (None, None) };
    let (a, b): (usize, usize) = (m[3].parse().unwrap(), m[4].parse().unwrap());
    let mut place = Map::new();
    place.insert("file".into(), m[2].into());
    place.insert("lines".into(), json!([a, b]));
    place.insert("commit".into(), m[1].into());
    let path = mathlib.join(&m[2]);
    if !path.is_file() {
        return (Some(place), None);
    }
    let text = std::fs::read_to_string(&path).unwrap();
    let lines: Vec<&str> = text.split('\n').collect();
    // The recorded range can end at the statement; read on to the next blank line that closes the proof.
    let mut end = b;
    while end < lines.len() && (end as i64 - a as i64) < 120 && !crate::py::strip(lines[end]).is_empty() {
        end += 1;
    }
    let (start, stop) = ((a.max(1) - 1).min(lines.len()), end.min(lines.len()));
    (Some(place), Some(if start < stop { lines[start..stop].join("\n") } else { String::new() }))
}

/// Write the packets and both indexes into `out`; return the counts as JSON.
pub fn build(explorer: &Path, work: &Path, per: usize, out: &Path) -> Value {
    let raw = read_json(explorer);
    let (core, det, cpack) = (unpack(&raw, "core"), unpack(&raw, "detail"), unpack(&raw, "concepts"));
    let rows = items(&core, "rows");
    let det = det.as_array().unwrap();
    let tax = items(&raw["taxonomy"], "categories");
    let crows = items(&cpack, "rows");
    let rc = items(&cpack, "rc");
    let mut rel_by: HashMap<usize, Vec<(&str, &str, usize)>> = HashMap::new();
    for rel in items(&core, "relations") {
        let typ = rel["type"].as_str().unwrap();
        if ["special-case", "generalization", "consequence", "equivalent", "prerequisite"].contains(&typ) {
            let (s, t) = (rel["source"].as_u64().unwrap() as usize, rel["target"].as_u64().unwrap() as usize);
            rel_by.entry(s).or_default().push((typ, "out", t));
            rel_by.entry(t).or_default().push((typ, "in", s));
        }
    }
    let mathlib = work.join("mathlib4");
    let mut order: Vec<usize> = (0..rows.len()).filter(|&i| RESULT_TYPES.contains(&rows[i]["t"].as_str().unwrap())).collect();
    // Python: key (-(balanced or -1), name.lower(), i); a balanced aggregate of 0 counts as missing.
    let score = |i: usize| -balanced(rows[i]["s"].as_str().unwrap()).filter(|b| *b != 0.0).unwrap_or(-1.0);
    let names: Vec<String> = rows.iter().map(|r| r["n"].as_str().unwrap().to_lowercase()).collect();
    order.sort_by(|&i, &j| score(i).partial_cmp(&score(j)).unwrap().then_with(|| names[i].cmp(&names[j])).then(i.cmp(&j)));
    let mut packets = vec![];
    for &i in &order {
        let (r, x) = (&rows[i], &det[i]);
        let evs = items(x, "evs");
        let srcs: Vec<&Value> = evs.iter().filter(|e| e["kind"] == "source statement").take(2).collect();
        let formal = evs.iter().find(|e| e["kind"] == "formal declaration");
        let mut lean = Value::Null;
        if let (Some(formal), true) = (formal, crate::py::truthy(r.get("decl"))) {
            let (place, text) = lean_text(formal["url"].as_str().unwrap_or(""), &mathlib);
            let classes: BTreeSet<&str> = items(x, "cls").iter().map(|c| c.as_str().unwrap()).collect();
            let mut l = Map::new();
            l.insert("decl".into(), r["decl"].clone());
            l.insert("signature".into(), x["sig"].clone());
            l.insert("conclusion".into(), x["concl"].clone());
            l.insert("hypotheses".into(), x["hyps"].clone());
            l.insert("typeclasses".into(), json!(classes));
            l.insert("module".into(), x["mod"].clone());
            l.extend(place.unwrap_or_default());
            l.insert("text".into(), text.map_or(Value::Null, Value::from));
            l.insert("related_decls".into(), json!(items(x, "decls").iter().take(8).collect::<Vec<_>>()));
            lean = Value::Object(l);
        }
        let mut rels = vec![];
        for &(typ, direction, j) in rel_by.get(&i).map_or(&[][..], Vec::as_slice) {
            let phrase = match (typ, direction) {
                ("prerequisite", _) => continue,
                ("special-case", "out") => "is a special case of",
                ("special-case", _) => "has as a special case",
                ("generalization", "out") => "generalizes",
                ("generalization", _) => "is generalized by",
                ("consequence", "out") => "is a consequence of",
                ("consequence", _) => "has as a consequence",
                _ => "is equivalent to",
            };
            rels.push(json!({"relation": phrase, "id": rows[j]["id"], "name": rows[j]["n"]}));
        }
        let rci: Vec<usize> = rc[i].as_array().unwrap().iter().map(|j| j.as_u64().unwrap() as usize).collect();
        let concept_id = |name: &str| {
            let lower = name.to_lowercase();
            rci.iter().find(|&&j| crows[j]["n"].as_str().unwrap().to_lowercase() == lower).map_or(Value::Null, |&j| crows[j]["id"].clone())
        };
        let prereqs: BTreeSet<usize> = items(r, "pre").iter().map(|j| j.as_u64().unwrap() as usize).collect();
        let mut p = Map::new();
        p.insert("id".into(), r["id"].clone());
        p.insert("name".into(), r["n"].clone());
        p.insert("type".into(), r["t"].clone());
        p.insert("aliases".into(), x["al"].clone());
        p.insert("level".into(), LEVELS[r["lv"].as_u64().unwrap() as usize].into());
        p.insert("categories".into(), json!(items(r, "cat").iter().map(|k| &tax[k.as_u64().unwrap() as usize][0]).collect::<Vec<_>>()));
        p.insert("sources".into(), json!(srcs.iter().map(|e| json!({
            "text": e["claim"].as_str().unwrap().chars().take(700).collect::<String>(), "where": e["location"], "url": e["url"]})).collect::<Vec<_>>()));
        p.insert("lean".into(), lean);
        p.insert("concepts".into(), json!(items(x, "cn").iter().map(|c| json!({"name": c, "id": concept_id(c.as_str().unwrap())})).collect::<Vec<_>>()));
        p.insert("concept_ids".into(), json!(rci.iter().map(|&j| &crows[j]["id"]).collect::<Vec<_>>()));
        p.insert("prereqs".into(), json!(prereqs.iter().filter(|&&j| j != i).map(|&j| json!({"id": rows[j]["id"], "name": rows[j]["n"]})).collect::<Vec<_>>()));
        p.insert("related".into(), json!(rels.into_iter().take(12).collect::<Vec<_>>()));
        p.insert("explanation".into(), x["why"].clone());
        packets.push(Value::Object(p));
    }
    std::fs::create_dir_all(out.join("packets")).unwrap();
    let batches = packets.chunks(per).enumerate().map(|(k, batch)| write(&out.join(format!("packets/batch-{k:02}.json")), &indented(&json!(batch)))).count();
    let mut index = String::from("id\tname\tkind\tlevel\taliases\n");
    for (c, t) in crows.iter().zip(items(&cpack, "text")) {
        let level = c["lv"].as_u64().map_or("", |l| LEVELS[l as usize]);
        let aliases: Vec<&str> = items(t, "al").iter().map(|a| a.as_str().unwrap()).collect();
        writeln!(index, "{}\t{}\t{}\t{level}\t{}", str_of(c.get("id")), str_of(c.get("n")), str_of(c.get("k")), aliases.join("; ")).unwrap();
    }
    write(&out.join("concept-index.tsv"), &index);
    let mut results = String::from("id\tname\ttype\n");
    for r in rows {
        writeln!(results, "{}\t{}\t{}", str_of(r.get("id")), str_of(r.get("n")), str_of(r.get("t"))).unwrap();
    }
    write(&out.join("result-index.tsv"), &results);
    let with_text = packets.iter().filter(|p| crate::py::truthy(p["lean"].get("text"))).count();
    json!({"packets": packets.len(), "batches": batches, "with_lean_text": with_text})
}

/// Write concept packets for `ids`, 120 per batch; return the counts as JSON.
pub fn concept_packets(explorer: &Path, ids: &[String], out: &Path) -> Value {
    const PER: usize = 120;
    let raw = read_json(explorer);
    let (core, cpack) = (unpack(&raw, "core"), unpack(&raw, "concepts"));
    let (rows, crows, texts) = (items(&core, "rows"), items(&cpack, "rows"), items(&cpack, "text"));
    let by: HashMap<&str, usize> = crows.iter().enumerate().map(|(i, c)| (c["id"].as_str().unwrap(), i)).collect();
    let mut needs: HashMap<usize, Vec<usize>> = HashMap::new();
    for (i, c) in crows.iter().enumerate() {
        for j in items(c, "pre") {
            needs.entry(j.as_u64().unwrap() as usize).or_default().push(i);
        }
    }
    let named = |list: &[Value], limit: usize| -> Vec<Value> {
        list.iter().take(limit).map(|j| json!({"id": crows[j.as_u64().unwrap() as usize]["id"], "name": crows[j.as_u64().unwrap() as usize]["n"]})).collect()
    };
    let mut packets = vec![];
    for cid in ids {
        let Some(&i) = by.get(cid.as_str()) else { continue };
        let (c, t) = (&crows[i], &texts[i]);
        let needed: Vec<Value> = needs.get(&i).map_or(vec![], |v| v.iter().map(|&j| json!(j)).collect());
        let mut p = Map::new();
        p.insert("id".into(), cid.as_str().into());
        p.insert("name".into(), c["n"].clone());
        p.insert("kind".into(), c["k"].clone());
        p.insert("level".into(), c["lv"].as_u64().map_or(Value::Null, |l| LEVELS[l as usize].into()));
        p.insert("aliases".into(), json!(items(t, "al")));
        p.insert("catalog_definition".into(), t.get("def").cloned().unwrap_or(Value::Null));
        p.insert("definition_basis".into(), t.get("defb").cloned().unwrap_or(Value::Null));
        p.insert("catalog_prerequisites".into(), json!(named(items(c, "pre"), usize::MAX)));
        p.insert("needed_by".into(), json!(named(&needed, 10)));
        p.insert("named_by_results".into(), json!(items(c, "rx").iter().take(5).map(|j| &rows[j.as_u64().unwrap() as usize]["n"]).collect::<Vec<_>>()));
        p.insert("nlab_page".into(), c["nl"].clone());
        p.insert("mathlib".into(), c["decl"].clone());
        packets.push(Value::Object(p));
    }
    std::fs::create_dir_all(out.join("concept-packets")).unwrap();
    for (k, batch) in packets.chunks(PER).enumerate() {
        write(&out.join(format!("concept-packets/batch-{k:02}.json")), &indented(&json!(batch)));
    }
    json!({"concept_packets": packets.len(), "batches": packets.len().div_ceil(PER)})
}

/// Catalog concept ids marked in the authored theorem files, most used first, without answered ones.
pub fn marked_concepts(learning: &Path) -> Vec<String> {
    let (mut count, mut first, mut new) = (HashMap::<String, usize>::new(), vec![], HashSet::new());
    for f in json_files(&learning.join("theorems")) {
        let text = std::fs::read_to_string(&f).unwrap();
        for m in MARKED.captures_iter(&text) {
            let n = count.entry(m[1].to_string()).or_insert(0);
            if *n == 0 {
                first.push(m[1].to_string());
            }
            *n += 1;
        }
        let data: Value = serde_json::from_str(&text).unwrap();
        let list = if data.is_object() { items(&data, "theorems") } else { data.as_array().unwrap() };
        for t in list {
            new.extend(items(t, "new_concepts").iter().map(|c| str_of(c.get("id"))));
        }
    }
    let done: HashSet<String> = json_files(&learning.join("concepts"))
        .iter()
        .flat_map(|f| {
            let data = read_json(f);
            let list = if data.is_object() { items(&data, "concepts").to_vec() } else { data.as_array().unwrap().clone() };
            list.iter().map(|c| str_of(c.get("id"))).collect::<Vec<_>>()
        })
        .collect();
    let mut ids: Vec<String> = first.into_iter().filter(|c| !new.contains(c) && !done.contains(c)).collect();
    ids.sort_by(|a, b| count[b].cmp(&count[a]).then_with(|| a.cmp(b)));
    ids
}
