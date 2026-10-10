//! How English Grammar Works: the corpus builder. It reads raw.json (the CGEL chapter and section outline),
//! concepts.json, examples.json and meta.json, expands each bracketed tree into nodes with token spans and heads,
//! checks the whole corpus and writes corpus.json: the same bytes as the data that the Python builder that it
//! replaces (build.py, last at 02fcb4f) embedded in the page as JSON.
//!
//!   cargo run --release              check the corpus and write corpus.json
//!   cargo run --release -- --verify  check the corpus and that corpus.json is current; write nothing
//!
//! The story of yujieteo/site reads concepts.json, examples.json and raw.json through the site's visuals.lock,
//! not corpus.json.

/// Return an error with the message when the condition is false.
macro_rules! ensure {
    ($cond:expr, $($msg:tt)*) => {
        if !$cond {
            return Err(format!($($msg)*));
        }
    };
}

mod check;
mod py;
mod tree;

use serde_json::{Map, Value, json};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use tree::{MORPH_CATEGORIES, PHRASE_CATEGORIES, WORD_CATEGORIES, s};

const DISPLAY_TITLE: &str = "How English Grammar Works";
const KEY_MESSAGE: &str = "Grammatical category and syntactic function are different: inspect what an expression is, what role it has, and how it fits into a larger structure.";
const START_EXAMPLE: &str = "kim-laughed";
const SPECIAL_NOTATION: [(&str, &str); 6] = [
    (
        "gap",
        "A gap (__) marks the position of an element that is understood but not pronounced there; it is linked to the expression that supplies its interpretation.",
    ),
    (
        "fusion",
        "A function written with + is a fusion: one expression has two functions at once, for example Head+Prenucleus in a fused relative.",
    ),
    (
        "supplement",
        "A supplement is attached loosely and records its anchor, the expression it relates to; it is not a dependent of that anchor.",
    ),
    (
        "antecedent",
        "An antecedent link records where an anaphor (such as a pronoun) gets its interpretation. It is a link between two expressions, not a branch of the tree.",
    ),
    (
        "word",
        "This tree shows the structure inside a single word: bases, and affixes attached to them (prefixes before, suffixes after). Its pieces are parts of a word, not words, and a spelling change at a boundary is recorded on the base.",
    ),
    (
        "mark",
        "Punctuation marks are not constituents, so they are not drawn in the tree. Each one is attached to the boundary of the constituent it marks: at its start, at its end, or between two of its parts.",
    ),
];

/// This visual's folder, viz/english-grammar.
fn folder() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn read(dir: &Path, name: &str) -> Result<Value, String> {
    let path = dir.join(name);
    let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

fn list(v: &Value) -> &[Value] {
    v.as_array().map_or(&[], Vec::as_slice)
}

/// A reference [chapter, section or null] as the page showed it, with the section's title and start page.
fn ref_label(chapters: &[Value], r: &Value) -> Result<Value, String> {
    let ch = chapters
        .iter()
        .find(|c| c["n"] == r[0])
        .ok_or_else(|| format!("unknown chapter in reference {r}"))?;
    let n = &ch["n"];
    if r[1].is_null() {
        return Ok(json!({"chapter": n, "label": format!("Ch. {n} {}", s(ch, "title"))}));
    }
    let sec = list(&ch["sections"])
        .iter()
        .find(|x| x["id"] == r[1])
        .ok_or_else(|| format!("unknown section in reference {r}"))?;
    let label = format!("Ch. {n} §{} {}", s(sec, "id"), s(sec, "title"));
    Ok(json!({"chapter": n, "section": sec["id"], "label": label, "page": sec["page"]}))
}

/// build.py's model: the examples with tokens, trees and marks, each listing the concepts that cite it; the
/// concepts with their references and items; the contrasts with the concepts that reach them.
fn model(raw: &Value, concepts: &Value, examples: &Value) -> Result<Value, String> {
    let chapters = list(&raw["chapters"]);
    let mut exs = vec![];
    for ex in list(&examples["examples"]) {
        let mut e = ex.clone();
        let tokens = tree::example_tokens(ex)?;
        let root = tree::parse_tree(ex, &tokens)?;
        e["marks"] = tree::build_marks(ex, &tokens, &root)?.into();
        e["tokens"] = tokens.into();
        e["tree"] = root;
        exs.push(e);
    }
    let mut out = vec![];
    for c in list(&concepts["concepts"]) {
        let (mut c, id) = (c.clone(), s(c, "id").to_string());
        let location = ref_label(chapters, &c["loc"])?;
        let mut references = vec![location.clone()];
        for r in list(&c["refs"]) {
            references.push(ref_label(chapters, r)?);
        }
        let mut items = vec![];
        for item in list(&c["examples"]) {
            let text = item.as_str().unwrap_or("");
            let mut split = text.split('@');
            let (ex, node) = (
                split.next().unwrap_or(""),
                split
                    .next()
                    .ok_or_else(|| format!("concept {id}: {text:?} names no node"))?,
            );
            let e = exs
                .iter_mut()
                .find(|e| s(e, "id") == ex)
                .ok_or_else(|| format!("concept {id} cites unknown example {ex}"))?;
            let cited = e
                .as_object_mut()
                .expect("an example is an object")
                .entry("concepts")
                .or_insert(json!([]));
            if !list(cited).iter().any(|x| x == id.as_str()) {
                cited
                    .as_array_mut()
                    .expect("concepts is a list")
                    .push(id.as_str().into());
            }
            items.push(json!({"ex": ex, "node": node}));
        }
        c["location"] = location;
        c["references"] = references.into();
        c["items"] = items.into();
        out.push(c);
    }
    let mut contrasts = vec![];
    for k in list(&examples["contrasts"]) {
        let mut k = k.clone();
        let reaches = |c: &Value| {
            list(&c["items"])
                .iter()
                .any(|i| i["ex"] == k["a"]["ex"] || i["ex"] == k["b"]["ex"])
        };
        let ids: Vec<Value> = out
            .iter()
            .filter(|c| reaches(c))
            .map(|c| c["id"].clone())
            .collect();
        k["concepts"] = ids.into();
        contrasts.push(k);
    }
    Ok(
        json!({"chapters": raw["chapters"], "concepts": out, "examples": exs, "contrasts": contrasts,
              "route": concepts["route"], "confusions": concepts["confusions"]}),
    )
}

/// The keys of `v` that are listed, then those of `extra` that hold a value that Python finds true.
fn pick(v: &Value, keys: &[&str], extra: &[&str]) -> Value {
    let mut out = Map::new();
    for k in keys {
        out.insert(k.to_string(), v[k].clone());
    }
    for k in extra {
        let truthy = match v.get(*k) {
            None | Some(Value::Null) | Some(Value::Bool(false)) => false,
            Some(Value::String(x)) => !x.is_empty(),
            Some(Value::Array(x)) => !x.is_empty(),
            Some(Value::Object(x)) => !x.is_empty(),
            Some(Value::Number(n)) => n.as_f64() != Some(0.0),
            Some(Value::Bool(true)) => true,
        };
        if truthy {
            out.insert(k.to_string(), v[k].clone());
        }
    }
    Value::Object(out)
}

fn pairs(list: &[(&str, &str)]) -> Map<String, Value> {
    list.iter()
        .map(|(k, v)| (k.to_string(), Value::from(*v)))
        .collect()
}

/// The data that build.py embedded in the page (page_data()).
fn corpus(model: &Value, raw: &Value, meta: &Value) -> Value {
    let mut categories = pairs(&WORD_CATEGORIES);
    categories.extend(pairs(&PHRASE_CATEGORIES));
    categories.extend(pairs(&MORPH_CATEGORIES));
    let labels = json!({"functions": pairs(&tree::FUNCTIONS), "categories": categories, "notation": pairs(&SPECIAL_NOTATION)});
    let examples: Vec<Value> = list(&model["examples"])
        .iter()
        .map(|e| {
            pick(
                e,
                &[
                    "id",
                    "text",
                    "tokens",
                    "tree",
                    "focus",
                    "concepts",
                    "explanation",
                ],
                &["kind", "context", "usage", "predict", "marks"],
            )
        })
        .collect();
    let concepts: Vec<Value> = list(&model["concepts"])
        .iter()
        .map(|c| {
            pick(
                c,
                &[
                    "id",
                    "name",
                    "orientation",
                    "items",
                    "related",
                    "references",
                ],
                &["aliases", "abbr", "note"],
            )
        })
        .collect();
    let chapters: Vec<Value> = list(&model["chapters"])
        .iter()
        .map(|c| pick(c, &["n", "title", "authors", "pages", "sections"], &[]))
        .collect();
    json!({
        "title": DISPLAY_TITLE, "key": KEY_MESSAGE, "start": START_EXAMPLE,
        "book": raw["book"], "verification": raw["verification"], "chapters": chapters,
        "concepts": concepts, "examples": examples, "contrasts": model["contrasts"],
        "route": model["route"], "confusions": model["confusions"], "labels": labels,
        "checked": meta["fetched"], "assumptions": meta["assumptions"],
    })
}

/// The checked corpus and the bytes of corpus.json: `json.dumps(page_data, ensure_ascii=False, indent=1) + "\n"`.
fn build(dir: &Path) -> Result<(check::Summary, String), String> {
    let (raw, concepts, examples, meta) = (
        read(dir, "raw.json")?,
        read(dir, "concepts.json")?,
        read(dir, "examples.json")?,
        read(dir, "meta.json")?,
    );
    let model = model(&raw, &concepts, &examples)?;
    let summary = check::validate(&model, &meta)?;
    Ok((summary, py::indented(&corpus(&model, &raw, &meta)) + "\n"))
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let verify = match args.as_slice() {
        [] => false,
        [flag] if flag == "--verify" => true,
        _ => {
            eprintln!("usage: english-grammar [--verify]");
            return ExitCode::from(2);
        }
    };
    let dir = folder();
    let (sum, text) = match build(&dir) {
        Ok(built) => built,
        Err(e) => {
            eprintln!("english-grammar: {e}");
            return ExitCode::FAILURE;
        }
    };
    let path = dir.join("corpus.json");
    if verify {
        if std::fs::read(&path).ok().as_deref() != Some(text.as_bytes()) {
            eprintln!("english-grammar: stale corpus.json; run cargo run --release");
            return ExitCode::FAILURE;
        }
    } else if let Err(e) = std::fs::write(&path, &text) {
        eprintln!("{}: {e}", path.display());
        return ExitCode::FAILURE;
    }
    println!(
        "{} english-grammar/corpus.json ({} bytes): {} concepts across {} chapters, {} examples ({} analysis nodes; {} word \
         structures, {} punctuation marks, {} antecedent links), {} contrasts, {} aliases",
        if verify { "verified" } else { "wrote" },
        text.len(),
        sum.concepts,
        sum.chapters,
        sum.examples,
        sum.nodes,
        sum.words,
        sum.marks,
        sum.antecedents,
        sum.contrasts,
        sum.aliases
    );
    ExitCode::SUCCESS
}
