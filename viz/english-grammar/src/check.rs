//! The checks over the whole corpus, one function per part (chapters, concepts, examples, contrasts, route), each
//! naming what is wrong, as build.py's validate() did.

use crate::tree::{flatten, s};
use serde_json::Value;
use std::collections::BTreeSet;

const CONCEPT_RANGE: (usize, usize) = (40, 90);
const EXAMPLE_RANGE: (usize, usize) = (100, 220);
const ROUTE_RANGE: (usize, usize) = (10, 12);

fn list(v: &Value) -> &[Value] {
    v.as_array().map_or(&[], Vec::as_slice)
}
fn int(v: &Value) -> i64 {
    v.as_i64().unwrap_or(i64::MIN)
}
/// Python's `re.fullmatch(r"[a-z]+(?:-[a-z]+)*", id)`, or with digits too.
fn slug(id: &str, digits: bool) -> bool {
    !id.is_empty()
        && id.split('-').all(|p| {
            !p.is_empty()
                && p.chars()
                    .all(|c| c.is_ascii_lowercase() || (digits && c.is_ascii_digit()))
        })
}
/// The ids of an example's nodes and punctuation marks.
fn targets(e: &Value) -> BTreeSet<String> {
    let nodes = flatten(&e["tree"]).into_iter().map(|n| n.0);
    nodes
        .chain(list(&e["marks"]).iter().map(|m| s(m, "id").to_string()))
        .collect()
}

/// Chapters 1-20 with contiguous page ranges and ordered sections inside them.
fn chapters(chapters: &[Value]) -> Result<(), String> {
    ensure!(
        chapters.iter().map(|c| int(&c["n"])).eq(1..=20),
        "chapters must be numbered 1-20"
    );
    for w in chapters.windows(2) {
        ensure!(
            int(&w[0]["pages"][1]) + 1 == int(&w[1]["pages"][0]),
            "chapter page ranges must be contiguous ({}, {})",
            w[0]["n"],
            w[1]["n"]
        );
    }
    for c in chapters {
        let n = &c["n"];
        ensure!(
            !s(c, "title").is_empty() && !s(c, "authors").is_empty(),
            "chapter {n} needs a title and authors"
        );
        let ids: Vec<&str> = list(&c["sections"])
            .iter()
            .map(|s| s["id"].as_str().unwrap_or(""))
            .collect();
        ensure!(
            ids.iter().collect::<BTreeSet<_>>().len() == ids.len(),
            "duplicate section in chapter {n}"
        );
        let key = |id: &str| {
            id.split('.')
                .map(|x| x.parse::<i64>())
                .collect::<Result<Vec<_>, _>>()
        };
        let keys = ids
            .iter()
            .map(|id| key(id))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("chapter {n}: {e}"))?;
        ensure!(keys.is_sorted(), "sections out of order in chapter {n}");
        let pages: Vec<i64> = list(&c["sections"])
            .iter()
            .map(|s| int(&s["page"]))
            .collect();
        ensure!(
            pages.is_sorted(),
            "section pages out of order in chapter {n}"
        );
        ensure!(
            pages
                .iter()
                .all(|p| (int(&c["pages"][0])..=int(&c["pages"][1])).contains(p)),
            "section page outside chapter {n}"
        );
    }
    Ok(())
}

/// Each concept cites known examples and nodes, links to other concepts and has no colliding alias. Returns the
/// examples the concepts use and the number of distinct aliases.
fn concepts(
    concepts: &[Value],
    examples: &[Value],
    cids: &[&str],
    names: &BTreeSet<String>,
) -> Result<(BTreeSet<String>, usize), String> {
    let (mut used, mut aliases) = (BTreeSet::new(), BTreeSet::new());
    for c in concepts {
        let id = s(c, "id");
        ensure!(slug(id, false), "bad concept id {id}");
        ensure!(
            !s(c, "orientation").is_empty() && !s(c, "name").is_empty(),
            "{id}"
        );
        let items = list(&c["items"]);
        ensure!(!items.is_empty(), "concept {id} has no examples");
        ensure!(
            items
                .iter()
                .map(|i| s(i, "ex"))
                .collect::<BTreeSet<_>>()
                .len()
                == items.len(),
            "concept {id} lists an example twice"
        );
        for item in items {
            let (ex, node) = (s(item, "ex"), s(item, "node"));
            let e = examples
                .iter()
                .find(|e| s(e, "id") == ex)
                .ok_or_else(|| format!("concept {id} cites unknown example {ex}"))?;
            ensure!(
                targets(e).contains(node),
                "concept {id} cites unknown node {ex}@{node}"
            );
            used.insert(ex.to_string());
        }
        for r in list(&c["related"]).iter().map(|r| r.as_str().unwrap_or("")) {
            ensure!(
                cids.contains(&r) && r != id,
                "concept {id} has a bad related link {r}"
            );
        }
        for a in list(&c["aliases"]).iter().map(|a| a.as_str().unwrap_or("")) {
            ensure!(
                !names.contains(&a.to_lowercase()),
                "alias {a:?} of {id} collides with a canonical concept name"
            );
            aliases.insert(a.to_lowercase());
        }
    }
    Ok((used, aliases.len()))
}

/// Each example is explained, has a known focus, and its tree leaves cover every word once; identical texts are
/// allowed only as the two sides of a contrast.
fn examples(examples: &[Value], contrasts: &[Value]) -> Result<(), String> {
    for e in examples {
        let (id, t) = (s(e, "id"), targets(e));
        ensure!(
            !s(e, "explanation").trim().is_empty(),
            "example {id} needs an explanation"
        );
        ensure!(slug(id, true), "bad example id {id}");
        ensure!(
            t.contains(s(e, "focus")),
            "example {id} focus is not a node or mark"
        );
        ensure!(
            matches!(
                e.get("kind").map_or(Some("sentence"), Value::as_str),
                Some("sentence" | "word")
            ),
            "example {id} has an unknown kind"
        );
        if let Some(p) = e.get("predict") {
            ensure!(
                t.contains(s(p, "node")),
                "example {id} prediction node is unknown"
            );
        }
        let tokens = list(&e["tokens"]);
        let mut covered: Vec<u64> = flatten(&e["tree"])
            .iter()
            .filter_map(|n| n.1.get("word").and_then(Value::as_u64))
            .collect();
        covered.sort();
        ensure!(
            covered
                .into_iter()
                .eq((0..tokens.len() as u64).filter(|&i| s(&tokens[i as usize], "k") == "w")),
            "example {id}: leaves do not cover every word once"
        );
        let start = e["tree"]["span"][0].as_u64().unwrap_or(0) as usize;
        ensure!(
            tokens[..start.min(tokens.len())]
                .iter()
                .all(|t| s(t, "k") == "p"),
            "{id}"
        );
    }
    for (i, e) in examples.iter().enumerate() {
        let text = s(e, "text");
        if examples[..i].iter().any(|x| s(x, "text") == text) {
            continue;
        }
        let ids: BTreeSet<&str> = examples
            .iter()
            .filter(|x| s(x, "text") == text)
            .map(|x| s(x, "id"))
            .collect();
        // Identical text is allowed only for a declared structural ambiguity (a contrast).
        let pair = |k: &Value| {
            [s(&k["a"], "ex"), s(&k["b"], "ex")]
                .into_iter()
                .collect::<BTreeSet<_>>()
                == ids
        };
        ensure!(
            ids.len() == 1 || contrasts.iter().any(pair),
            "duplicate example text {text:?} without a contrast"
        );
    }
    Ok(())
}

/// Contrast ids are unique and each compares two different examples at known nodes.
fn contrasts(contrasts: &[Value], examples: &[Value]) -> Result<(), String> {
    let ids: BTreeSet<&str> = contrasts.iter().map(|k| s(k, "id")).collect();
    ensure!(ids.len() == contrasts.len(), "duplicate contrast id");
    for k in contrasts {
        let id = s(k, "id");
        for side in ["a", "b"] {
            let (ex, node) = (s(&k[side], "ex"), s(&k[side], "node"));
            let e = examples.iter().find(|e| s(e, "id") == ex);
            ensure!(
                e.is_some_and(|e| targets(e).contains(node)),
                "contrast {id} has a bad target"
            );
        }
        ensure!(
            s(&k["a"], "ex") != s(&k["b"], "ex"),
            "contrast {id} compares an example with itself"
        );
        ensure!(
            !list(&k["concepts"]).is_empty(),
            "contrast {id} is not reachable from any concept"
        );
        ensure!(
            !s(k, "explanation").trim().is_empty(),
            "contrast {id} needs an explanation"
        );
    }
    Ok(())
}

/// The beginner route and the common confusions point at real concepts and their examples.
fn route(model: &Value, cids: &[&str]) -> Result<(), String> {
    let route: Vec<&str> = list(&model["route"])
        .iter()
        .map(|r| s(r, "concept"))
        .collect();
    ensure!(
        (ROUTE_RANGE.0..=ROUTE_RANGE.1).contains(&route.len()),
        "beginner route must have 10-12 stops"
    );
    let unique = route.iter().collect::<BTreeSet<_>>().len() == route.len();
    ensure!(
        unique && route.iter().all(|r| cids.contains(r)),
        "route stops must be unique concepts"
    );
    for f in list(&model["confusions"]) {
        let label = s(f, "label");
        let concept = list(&model["concepts"])
            .iter()
            .find(|c| s(c, "id") == s(f, "concept"));
        let concept =
            concept.ok_or_else(|| format!("confusion {label} points to unknown concept"))?;
        ensure!(
            list(&concept["items"])
                .iter()
                .any(|i| s(i, "ex") == s(f, "example")),
            "confusion {label} example is not in its concept"
        );
    }
    Ok(())
}

/// The counts of a checked corpus.
pub struct Summary {
    pub concepts: usize,
    pub chapters: usize,
    pub examples: usize,
    pub nodes: usize,
    pub words: usize,
    pub marks: usize,
    pub antecedents: usize,
    pub contrasts: usize,
    pub aliases: usize,
}

/// Every check over the whole corpus (the model of build.py: chapters, concepts, examples, contrasts, route and
/// confusions) and meta.json.
pub fn validate(model: &Value, meta: &Value) -> Result<Summary, String> {
    chapters(list(&model["chapters"]))?;
    let (cs, es) = (list(&model["concepts"]), list(&model["examples"]));
    let cids: Vec<&str> = cs.iter().map(|c| s(c, "id")).collect();
    ensure!(
        cids.iter().collect::<BTreeSet<_>>().len() == cids.len(),
        "duplicate concept id"
    );
    let eids: BTreeSet<&str> = es.iter().map(|e| s(e, "id")).collect();
    ensure!(eids.len() == es.len(), "duplicate example id");
    ensure!(
        (CONCEPT_RANGE.0..=CONCEPT_RANGE.1).contains(&cs.len()),
        "{} concepts, outside {CONCEPT_RANGE:?}",
        cs.len()
    );
    ensure!(
        (EXAMPLE_RANGE.0..=EXAMPLE_RANGE.1).contains(&es.len()),
        "{} examples, outside {EXAMPLE_RANGE:?}",
        es.len()
    );
    let names: BTreeSet<String> = cs.iter().map(|c| s(c, "name").to_lowercase()).collect();
    ensure!(names.len() == cs.len(), "concept names must be unique");
    let (used, aliases) = concepts(cs, es, &cids, &names)?;
    let unused: Vec<&&str> = eids.iter().filter(|e| !used.contains(**e)).collect();
    ensure!(
        unused.is_empty(),
        "examples not used by any concept: {unused:?}"
    );
    examples(es, list(&model["contrasts"]))?;
    contrasts(list(&model["contrasts"]), es)?;
    route(model, &cids)?;
    let keys = [
        "slug",
        "source_url",
        "fetched",
        "key_file_used",
        "assumptions",
    ];
    ensure!(
        keys.iter().all(|k| meta.get(*k).is_some()),
        "meta.json needs {keys:?}"
    );
    let fetched = s(meta, "fetched").as_bytes();
    let date = fetched.len() == 10
        && fetched.iter().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                *c == b'-'
            } else {
                c.is_ascii_digit()
            }
        });
    ensure!(
        s(meta, "slug") == "english-grammar" && date,
        "meta.json needs slug english-grammar and a fetched date"
    );
    let nodes: Vec<_> = es.iter().flat_map(|e| flatten(&e["tree"])).collect();
    Ok(Summary {
        concepts: cs.len(),
        chapters: cs
            .iter()
            .map(|c| c["location"]["chapter"].to_string())
            .collect::<BTreeSet<_>>()
            .len(),
        examples: es.len(),
        nodes: nodes.len(),
        words: es.iter().filter(|e| s(e, "kind") == "word").count(),
        marks: es.iter().map(|e| list(&e["marks"]).len()).sum(),
        antecedents: nodes.iter().filter(|n| n.1.get("ante").is_some()).count(),
        contrasts: list(&model["contrasts"]).len(),
        aliases,
    })
}
