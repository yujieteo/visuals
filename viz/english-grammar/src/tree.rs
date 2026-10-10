//! One example: its tokens, its bracketed tree expanded into nested nodes with token spans and heads, and its
//! punctuation marks. Each check names the example and what is wrong, as build.py's assertions did.

use serde_json::{Map, Value, json};

/// Function labels: tree label, then the name that the page showed.
pub const FUNCTIONS: [(&str, &str); 23] = [
    ("Subject", "Subject"),
    ("Predicate", "Predicate"),
    ("Predicator", "Predicator"),
    ("Object", "Object"),
    ("Od", "Direct object"),
    ("Oi", "Indirect object"),
    ("PredComp", "Predicative complement"),
    ("Comp", "Complement"),
    ("Adjunct", "Adjunct"),
    ("Head", "Head"),
    ("Det", "Determiner"),
    ("Mod", "Modifier"),
    ("Marker", "Marker"),
    ("Coord", "Coordinate"),
    ("Supplement", "Supplement"),
    ("Prenucleus", "Prenucleus"),
    ("Nucleus", "Nucleus"),
    ("ExtSubj", "Extraposed subject"),
    ("Head+Prenucleus", "Head fused with prenucleus"),
    ("Det+Head", "Fused determiner-head"),
    ("Mod+Head", "Fused modifier-head"),
    // Word-internal structure (examples of kind "word").
    ("Base", "Base"),
    ("Affix", "Affix"),
];
const HEAD_FUNCTIONS: [&str; 6] = [
    "Head",
    "Predicate",
    "Predicator",
    "Head+Prenucleus",
    "Det+Head",
    "Mod+Head",
];
pub const WORD_CATEGORIES: [(&str, &str); 8] = [
    ("N", "Noun"),
    ("V", "Verb"),
    ("Adj", "Adjective"),
    ("Adv", "Adverb"),
    ("Prep", "Preposition"),
    ("D", "Determinative"),
    ("Sbr", "Subordinator"),
    ("Crd", "Coordinator"),
];
pub const PHRASE_CATEGORIES: [(&str, &str); 9] = [
    ("Clause", "Clause"),
    ("NP", "Noun phrase"),
    ("Nom", "Nominal"),
    ("VP", "Verb phrase"),
    ("AdjP", "Adjective phrase"),
    ("AdvP", "Adverb phrase"),
    ("PP", "Preposition phrase"),
    ("DP", "Determinative phrase"),
    ("Coordination", "Coordination"),
];
/// Pieces of a word that are not words themselves (word-internal structure only).
pub const MORPH_CATEGORIES: [(&str, &str); 3] = [
    ("Prefix", "Prefix"),
    ("Suffix", "Suffix"),
    ("Splinter", "Splinter (part of a word in a blend)"),
];
const MORPH_FUNCTIONS: [&str; 2] = ["Base", "Affix"];
/// Which categories may head which phrases (fused heads included).
const HEADS: [(&str, &[&str]); 8] = [
    ("Clause", &["VP", "Clause"]),
    ("NP", &["N", "Nom", "D", "Adj", "NP"]),
    ("Nom", &["N", "Nom"]),
    ("VP", &["V", "VP"]),
    ("AdjP", &["Adj", "AdjP"]),
    ("AdvP", &["Adv"]),
    ("PP", &["Prep"]),
    ("DP", &["D"]),
];
/// Functions allowed inside each containing category.
const ALLOWED: [(&str, &[&str]); 9] = [
    (
        "Clause",
        &[
            "Subject",
            "Predicate",
            "Adjunct",
            "Marker",
            "Head",
            "Prenucleus",
            "Nucleus",
            "Supplement",
        ],
    ),
    (
        "VP",
        &[
            "Predicator",
            "Object",
            "Od",
            "Oi",
            "PredComp",
            "Comp",
            "Adjunct",
            "ExtSubj",
            "Marker",
            "Head",
        ],
    ),
    (
        "NP",
        &[
            "Det",
            "Head",
            "Det+Head",
            "Mod+Head",
            "Head+Prenucleus",
            "Mod",
            "Comp",
            "Marker",
        ],
    ),
    ("Nom", &["Head", "Mod", "Comp"]),
    ("AdjP", &["Head", "Mod", "Comp", "Marker"]),
    ("AdvP", &["Head", "Mod", "Comp"]),
    ("PP", &["Head", "Comp", "Mod"]),
    ("DP", &["Head", "Mod"]),
    ("Coordination", &["Coord"]),
];
/// Punctuation indicators: name, its characters and its class.
const INDICATORS: [(&str, &str, &str); 12] = [
    ("full stop", ".", "primary terminal"),
    ("question mark", "?", "primary terminal"),
    ("exclamation mark", "!", "primary terminal"),
    ("comma", ",", "secondary boundary mark"),
    ("semicolon", ";", "secondary boundary mark"),
    ("colon", ":", "secondary boundary mark"),
    ("dash", "–—", "dash"),
    ("opening parenthesis", "(", "parenthesis"),
    ("closing parenthesis", ")", "parenthesis"),
    ("opening quotation mark", "“‘", "quotation mark"),
    ("closing quotation mark", "”’", "quotation mark"),
    ("hyphen", "-", "word-level punctuation"),
];
const PAIRED: [(&str, &str); 2] = [
    ("opening parenthesis", "closing parenthesis"),
    ("opening quotation mark", "closing quotation mark"),
];
const MARK_SIDES: [&str; 3] = ["start", "end", "between"];
const ATTRIBUTES: [&str; 6] = ["form", "cx", "anchor", "ante", "base", "alt"];

pub fn has(list: &[(&str, &str)], key: &str) -> bool {
    list.iter().any(|p| p.0 == key)
}
fn of<'a>(table: &[(&str, &'a [&'a str])], key: &str) -> &'a [&'a str] {
    table.iter().find(|p| p.0 == key).map_or(&[], |p| p.1)
}

/// A string field, or "".
pub fn s<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}
fn n(v: &Value, key: &str) -> usize {
    v.get(key).and_then(Value::as_u64).unwrap_or(0) as usize
}
fn span(v: &Value) -> Option<(usize, usize)> {
    let a = v.get("span")?.as_array()?;
    Some((a.first()?.as_u64()? as usize, a.get(1)?.as_u64()? as usize))
}
fn kids(v: &Value) -> &[Value] {
    v.get("children")
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}
fn is_word(t: &Value) -> bool {
    s(t, "k") == "w"
}
/// Whether every token from `lo` to `hi` is punctuation.
fn punct(tokens: &[Value], lo: usize, hi: usize) -> bool {
    (lo..hi).all(|j| tokens.get(j).is_some_and(|t| !is_word(t)))
}

/// Python's `[A-Za-z]+(?:['’-][A-Za-z]+)*|\d+|[^\sA-Za-z\d]`: words with inner apostrophes and hyphens, numbers,
/// and each other character that is not a space. A token is a word ("w") when its first character is alphanumeric.
fn tokenize(text: &str) -> Vec<Value> {
    let cs: Vec<char> = text.chars().collect();
    let letters = |mut i: usize| {
        while cs.get(i).is_some_and(char::is_ascii_alphabetic) {
            i += 1;
        }
        i
    };
    let (mut out, mut i) = (vec![], 0);
    while i < cs.len() {
        let start = i;
        if cs[i].is_ascii_alphabetic() {
            i = letters(i);
            while cs.get(i).is_some_and(|c| "'’-".contains(*c))
                && cs.get(i + 1).is_some_and(char::is_ascii_alphabetic)
            {
                i = letters(i + 1);
            }
        } else if cs[i].is_ascii_digit() {
            while cs.get(i).is_some_and(char::is_ascii_digit) {
                i += 1;
            }
        } else if cs[i].is_whitespace() {
            i += 1;
            continue;
        } else {
            i += 1;
        }
        let t: String = cs[start..i].iter().collect();
        out.push(json!({"t": t, "k": if cs[start].is_alphanumeric() { "w" } else { "p" }}));
    }
    out
}

/// A sentence is split into words and punctuation; a single word (kind "word") into its declared segments, glued
/// together (g) because they are written without spaces.
pub fn example_tokens(ex: &Value) -> Result<Vec<Value>, String> {
    let id = s(ex, "id");
    if s(ex, "kind") != "word" {
        ensure!(
            ex.get("segments").is_none(),
            "example {id}: only a word example has segments"
        );
        return Ok(tokenize(s(ex, "text")));
    }
    let segments: Vec<&str> = ex["segments"]
        .as_array()
        .map_or(vec![], |a| a.iter().filter_map(Value::as_str).collect());
    let text = s(ex, "text");
    ensure!(
        segments.concat() == text,
        "example {id}: segments do not spell {text:?}"
    );
    ensure!(
        segments.iter().all(|s| !s.is_empty()) && !text.contains(' '),
        "example {id}: a word example is one word"
    );
    Ok(segments
        .iter()
        .enumerate()
        .map(|(i, seg)| {
            let k = if seg.chars().next().is_some_and(char::is_alphanumeric) {
                "w"
            } else {
                "p"
            };
            if i > 0 {
                json!({"t": seg, "k": k, "g": 1})
            } else {
                json!({"t": seg, "k": k})
            }
        })
        .collect())
}

/// Split a bracketed tree into '[', ']' and atoms; braces keep their spaces.
fn lex(tree: &str) -> Vec<String> {
    let cs: Vec<char> = tree.chars().collect();
    let (mut out, mut i) = (vec![], 0);
    while i < cs.len() {
        let c = cs[i];
        if c.is_whitespace() {
            i += 1;
        } else if c == '[' || c == ']' {
            out.push(c.to_string());
            i += 1;
        } else {
            let (mut j, mut depth) = (i, 0i32);
            while j < cs.len()
                && (depth != 0 || !(cs[j].is_whitespace() || cs[j] == '[' || cs[j] == ']'))
            {
                depth += match cs[j] {
                    '{' => 1,
                    '}' => -1,
                    _ => 0,
                };
                j += 1;
            }
            out.push(cs[i..j].iter().collect());
            i = j;
        }
    }
    out
}

/// A node label, `Function:Category#id{key=value|key=value}`: function, category, id and attributes.
type Label<'a> = (Option<&'a str>, &'a str, Option<&'a str>, Option<&'a str>);

/// The parts of a label, as Python's LABEL_RE matched them, or None.
fn label(atom: &str) -> Option<Label<'_>> {
    let (func, rest) = match atom.split_once(':') {
        Some((f, r)) if !f.is_empty() && f.chars().all(|c| c.is_ascii_alphabetic() || c == '+') => {
            (Some(f), r)
        }
        _ => (None, atom),
    };
    let end = rest
        .find(|c: char| !c.is_ascii_alphabetic())
        .unwrap_or(rest.len());
    if end == 0 {
        return None;
    }
    let (cat, mut rest) = rest.split_at(end);
    let mut id = None;
    if let Some(r) = rest.strip_prefix('#') {
        let end = r
            .find(|c: char| !(c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'))
            .unwrap_or(r.len());
        if end == 0 {
            return None;
        }
        (id, rest) = (Some(&r[..end]), &r[end..]);
    }
    let mut attrs = None;
    if let Some(r) = rest.strip_prefix('{') {
        let end = r.find(['{', '}']).filter(|&e| r[e..].starts_with('}'))?;
        (attrs, rest) = (Some(&r[..end]), &r[end + 1..]);
    }
    rest.is_empty().then_some((func, cat, id, attrs))
}

/// The parser's place: the atoms, the next atom, the next word and the next automatic node id.
struct Parser<'a> {
    atoms: Vec<String>,
    pos: usize,
    cursor: usize,
    counter: usize,
    words: Vec<usize>,
    tokens: &'a [Value],
    at: String,
}

impl Parser<'_> {
    fn atom(&self) -> Result<&str, String> {
        self.atoms
            .get(self.pos)
            .map(String::as_str)
            .ok_or_else(|| format!("{}: the tree ends early", self.at))
    }

    fn node(&mut self) -> Result<Value, String> {
        let at = self.at.clone();
        ensure!(
            self.atom()? == "[",
            "{at}: expected '[' at atom {}",
            self.pos
        );
        self.pos += 1;
        let atom = self.atom()?.to_string();
        let (func, cat, id, attrs) =
            label(&atom).ok_or_else(|| format!("{at}: bad label {atom:?}"))?;
        self.pos += 1;
        let mut node = Map::new();
        node.insert(
            "id".into(),
            id.map_or_else(|| format!("n{}", self.counter), str::to_string)
                .into(),
        );
        node.insert("cat".into(), cat.into());
        self.counter += 1;
        if let Some(f) = func {
            node.insert("fn".into(), f.into());
        }
        for item in attrs.unwrap_or("").split('|').filter(|i| !i.is_empty()) {
            let (key, value) = item.split_once('=').unwrap_or((item, ""));
            ensure!(
                ATTRIBUTES.contains(&key) && !value.is_empty(),
                "{at}: bad attribute {item:?}"
            );
            node.insert(key.into(), value.trim().into());
        }
        let mut children = vec![];
        while self.atom()? != "]" {
            let a = self.atom()?.to_string();
            if a == "[" {
                children.push(self.node()?);
                continue;
            }
            self.pos += 1;
            if let Some(gap) = a.strip_prefix('~') {
                ensure!(
                    children.is_empty() && self.atom()? == "]",
                    "{at}: a gap must be a node's only child"
                );
                let next = if self.cursor > 0 {
                    self.words[self.cursor - 1] + 1
                } else {
                    0
                };
                node.insert("gap".into(), gap.into());
                node.insert("at".into(), next.into());
            } else {
                ensure!(
                    self.cursor < self.words.len(),
                    "{at}: tree has extra word {a:?}"
                );
                let index = self.words[self.cursor];
                let word = s(&self.tokens[index], "t");
                ensure!(word == a, "{at}: tree word {a:?} does not match {word:?}");
                ensure!(
                    children.is_empty() && self.atom()? == "]",
                    "{at}: word {a:?} must be a node's only child"
                );
                node.insert("word".into(), index.into());
                self.cursor += 1;
            }
        }
        self.pos += 1;
        if !children.is_empty() {
            node.insert("children".into(), children.into());
        }
        Ok(Value::Object(node))
    }
}

/// Expand one example's bracketed tree into nested nodes with token spans, and check its structure.
pub fn parse_tree(ex: &Value, tokens: &[Value]) -> Result<Value, String> {
    let words: Vec<usize> = (0..tokens.len()).filter(|&i| is_word(&tokens[i])).collect();
    let at = format!("example {}", s(ex, "id"));
    let mut p = Parser {
        atoms: lex(s(ex, "tree")),
        pos: 0,
        cursor: 0,
        counter: 0,
        words,
        tokens,
        at: at.clone(),
    };
    let mut root = p.node()?;
    ensure!(
        p.pos == p.atoms.len(),
        "{at}: trailing material after the root"
    );
    if p.cursor != p.words.len() {
        let rest: Vec<&str> = p.words[p.cursor..]
            .iter()
            .map(|&i| s(&tokens[i], "t"))
            .collect();
        return Err(format!("{at}: words not in the tree: {rest:?}"));
    }
    if s(ex, "kind") == "word" {
        annotate_word(&mut root, None, tokens, &at, &mut vec![])?;
    } else {
        annotate(&mut root, tokens, &at)?;
    }
    Ok(root)
}

/// A node's id, the node and its parent.
pub type Entry<'a> = (String, &'a Value, Option<&'a Value>);

/// Each node by id, with its parent, in document order.
pub fn flatten(root: &Value) -> Vec<Entry<'_>> {
    fn walk<'a>(n: &'a Value, parent: Option<&'a Value>, out: &mut Vec<Entry<'a>>) {
        let id = s(n, "id").to_string();
        match out.iter().position(|e| e.0 == id) {
            Some(i) => out[i] = (id, n, parent),
            None => out.push((id, n, parent)),
        }
        for k in kids(n) {
            walk(k, Some(n), out);
        }
    }
    let mut out = vec![];
    walk(root, None, &mut out);
    out
}

fn find<'a, 'b>(nodes: &'b [Entry<'a>], id: &str) -> Option<&'b Entry<'a>> {
    nodes.iter().find(|e| e.0 == id)
}

/// Add spans and head references to a sentence's tree, and check its structure.
fn annotate(root: &mut Value, tokens: &[Value], at: &str) -> Result<(), String> {
    fn walk(
        n: &mut Value,
        parent: Option<&str>,
        tokens: &[Value],
        at: &str,
        ids: &mut Vec<String>,
    ) -> Result<(), String> {
        let id = s(n, "id").to_string();
        ensure!(!ids.contains(&id), "{at}: duplicate node id {id}");
        ids.push(id.clone());
        let (cat, func) = (
            s(n, "cat").to_string(),
            n.get("fn").and_then(Value::as_str).map(str::to_string),
        );
        match (parent, func.as_deref()) {
            (None, f) => ensure!(f.is_none(), "{at}: the root must not have a function"),
            (Some(p), f) => {
                let f = f.ok_or_else(|| format!("{at}: unknown function None on {id}"))?;
                ensure!(has(&FUNCTIONS, f), "{at}: unknown function {f:?} on {id}");
                ensure!(
                    of(&ALLOWED, p).contains(&f),
                    "{at}: {f} is not a function inside {p} ({id})"
                );
            }
        }
        if n.get("word").is_some() {
            ensure!(
                has(&WORD_CATEGORIES, &cat),
                "{at}: word node {id} needs a word category, not {cat}"
            );
            let w = self::n(n, "word");
            n["span"] = json!([w, w + 1]);
        } else if n.get("gap").is_some() {
            ensure!(
                has(&PHRASE_CATEGORIES, &cat),
                "{at}: gap {id} needs a phrase category"
            );
            n["span"] = Value::Null;
        } else {
            ensure!(
                has(&PHRASE_CATEGORIES, &cat),
                "{at}: phrase node {id} needs a phrase category, not {cat}"
            );
            ensure!(
                !kids(n).is_empty(),
                "{at}: phrase node {id} has no children"
            );
            for k in n["children"].as_array_mut().into_iter().flatten() {
                walk(k, Some(&cat), tokens, at, ids)?;
            }
            let children = kids(n);
            let spans: Vec<(usize, usize)> = children.iter().filter_map(span).collect();
            ensure!(!spans.is_empty(), "{at}: {id} covers no words");
            for w in spans.windows(2) {
                ensure!(
                    w[0].1 <= w[1].0,
                    "{at}: children of {id} overlap or are out of order"
                );
                ensure!(
                    punct(tokens, w[0].1, w[1].0),
                    "{at}: {id} is not contiguous"
                );
            }
            let heads: Vec<&Value> = children
                .iter()
                .filter(|k| HEAD_FUNCTIONS.contains(&s(k, "fn")))
                .collect();
            ensure!(heads.len() <= 1, "{at}: {id} has more than one head");
            let head = heads
                .first()
                .map(|h| (s(h, "cat").to_string(), s(h, "id").to_string()));
            let coordinates = children.len() >= 2 && children.iter().all(|k| s(k, "fn") == "Coord");
            let nucleus = children.iter().any(|k| s(k, "fn") == "Nucleus");
            n["span"] = json!([spans[0].0, spans[spans.len() - 1].1]);
            if let Some((head_cat, head_id)) = head {
                ensure!(
                    of(&HEADS, &cat).contains(&head_cat.as_str()),
                    "{at}: a {head_cat} cannot head {cat} ({id})"
                );
                n["head"] = head_id.into();
            } else if cat != "Coordination" && cat != "Clause" {
                return Err(format!("{at}: {cat} {id} has no head"));
            } else if cat == "Coordination" {
                ensure!(
                    coordinates,
                    "{at}: coordination needs two or more coordinates"
                );
            } else {
                ensure!(
                    nucleus,
                    "{at}: clause {id} has neither a head nor a nucleus"
                );
            }
        }
        match func.as_deref() {
            Some("Det") => ensure!(parent == Some("NP"), "{at}: determiner outside an NP"),
            Some("Marker") => ensure!(
                cat == "Sbr" || cat == "Crd",
                "{at}: marker {id} must be a subordinator or coordinator"
            ),
            Some("Supplement") => ensure!(
                n.get("anchor").is_some(),
                "{at}: supplement {id} needs an anchor"
            ),
            _ => {}
        }
        ensure!(
            n.get("base").is_none() && n.get("alt").is_none(),
            "{at}: spelling alternations belong to word structure ({id})"
        );
        Ok(())
    }

    walk(root, None, tokens, at, &mut vec![])?;
    let nodes = flatten(root);
    for (id, n, parent) in &nodes {
        if let Some(gap) = n.get("gap") {
            let gap = gap.as_str().unwrap_or("");
            ensure!(
                find(&nodes, gap).is_some() && gap != id,
                "{at}: gap {id} links to unknown node {gap}"
            );
        }
        if let Some(anchor) = n.get("anchor") {
            let anchor = anchor.as_str().unwrap_or("");
            ensure!(
                find(&nodes, anchor).is_some() && anchor != id,
                "{at}: anchor of {id} is unknown"
            );
            ensure!(
                s(n, "fn") == "Supplement",
                "{at}: only supplements carry anchors"
            );
        }
        if s(n, "fn") == "Nucleus" {
            // The prenucleus is a sister of the nucleus, or (in a fused relative) fused with the head of the NP
            // that contains the relative clause.
            let parent = parent.expect("a node with a function has a parent");
            let grand = find(&nodes, s(parent, "id")).and_then(|e| e.2);
            let sisters = kids(parent).iter().chain(grand.map_or(&[][..], kids));
            ensure!(
                sisters
                    .into_iter()
                    .any(|k| matches!(s(k, "fn"), "Prenucleus" | "Head+Prenucleus")),
                "{at}: nucleus {id} without a prenucleus"
            );
        }
        if matches!(s(n, "fn"), "Prenucleus" | "Head+Prenucleus") {
            let gaps = nodes
                .iter()
                .filter(|e| e.1.get("gap").and_then(Value::as_str) == Some(id))
                .count();
            ensure!(
                gaps == 1,
                "{at}: prenucleus {id} must be linked to exactly one gap"
            );
        }
    }
    // An antecedent link joins two separate expressions: neither contains the other, and both are pronounced.
    for (id, n, _) in &nodes {
        let Some(ante) = n.get("ante") else { continue };
        let ante = ante.as_str().unwrap_or("");
        let target = find(&nodes, ante)
            .filter(|_| ante != id)
            .ok_or_else(|| format!("{at}: antecedent of {id} is unknown"))?;
        let (Some((a, b)), Some((c, d))) = (span(n), span(target.1)) else {
            return Err(format!(
                "{at}: an antecedent link cannot involve a gap ({id})"
            ));
        };
        ensure!(
            b <= c || d <= a,
            "{at}: anaphor {id} and its antecedent overlap"
        );
    }
    Ok(())
}

/// A spelling alternation that a base may show before a suffix: the spelling it gives, or None.
fn alternation(alt: &str, base: &str) -> Option<Option<String>> {
    let mut cs = base.chars();
    let last = cs.next_back();
    let stem = cs.as_str();
    match alt {
        "doubling" => Some(last.map(|c| format!("{base}{c}"))),
        "e-deletion" => Some(base.ends_with('e').then(|| stem.to_string())),
        "y-replacement" => Some(base.ends_with('y').then(|| format!("{stem}i"))),
        _ => None,
    }
}

/// Check word-internal structure: a word of a lexical category built from bases and affixes.
///
/// Every node has a lexical category except affixes and splinters; a complex node has at least one base, its
/// prefixes come before its bases and its suffixes after them, and a node with a single base (conversion, a vowel
/// change, clipping) must name its operation in cx. A base may declare the spelling alternation it shows
/// (base=happy|alt=y-replacement), which is checked.
fn annotate_word(
    n: &mut Value,
    parent: Option<&str>,
    tokens: &[Value],
    at: &str,
    ids: &mut Vec<String>,
) -> Result<(), String> {
    let id = s(n, "id").to_string();
    ensure!(!ids.contains(&id), "{at}: duplicate node id {id}");
    ids.push(id.clone());
    let (cat, func) = (
        s(n, "cat").to_string(),
        n.get("fn").and_then(Value::as_str).map(str::to_string),
    );
    ensure!(
        n.get("anchor").is_none() && n.get("ante").is_none() && n.get("gap").is_none(),
        "{at}: {id} has syntax-only notation"
    );
    match (parent, func.as_deref()) {
        (None, f) => ensure!(
            f.is_none() && has(&WORD_CATEGORIES, &cat),
            "{at}: the root of a word must be a word category without a function"
        ),
        (Some(_), f) => {
            let shown = f.map_or("None".into(), |f| format!("{f:?}"));
            let f = f
                .filter(|f| MORPH_FUNCTIONS.contains(f))
                .ok_or_else(|| format!("{at}: {shown} is not a function inside a word ({id})"))?;
            if f == "Affix" {
                ensure!(
                    cat == "Prefix" || cat == "Suffix",
                    "{at}: affix {id} must be a prefix or suffix"
                );
            } else {
                ensure!(
                    has(&WORD_CATEGORIES, &cat) || cat == "Splinter",
                    "{at}: base {id} needs a lexical category or Splinter"
                );
            }
        }
    }
    if n.get("base").is_some() || n.get("alt").is_some() {
        let (base, alt) = (s(n, "base"), s(n, "alt"));
        let spelled =
            alternation(alt, base).filter(|_| n.get("word").is_some() && !base.is_empty());
        let spelled = spelled.ok_or_else(|| format!("{at}: {id} needs base= and a known alt="))?;
        let word = s(&tokens[self::n(n, "word")], "t");
        ensure!(
            spelled.as_deref() == Some(word),
            "{at}: {base:?} with {alt} is not spelled {word:?}"
        );
    }
    if n.get("word").is_some() {
        let w = self::n(n, "word");
        n["span"] = json!([w, w + 1]);
        ensure!(
            parent.is_some(),
            "{at}: a word example needs structure above its pieces"
        );
        return Ok(());
    }
    ensure!(
        has(&WORD_CATEGORIES, &cat),
        "{at}: complex part {id} needs a lexical category"
    );
    ensure!(!kids(n).is_empty(), "{at}: {id} has no parts");
    for k in n["children"].as_array_mut().into_iter().flatten() {
        annotate_word(k, Some(&cat), tokens, at, ids)?;
    }
    let children = kids(n);
    let order: Vec<u8> = children
        .iter()
        .map(|k| match s(k, "cat") {
            "Prefix" => 0,
            "Suffix" => 2,
            _ => 1,
        })
        .collect();
    ensure!(
        order.is_sorted() && order.contains(&1),
        "{at}: {id} needs prefixes, then at least one base, then suffixes"
    );
    if children.len() == 1 {
        ensure!(
            !s(n, "cx").is_empty(),
            "{at}: {id} has a single base, so it must name its operation (cx)"
        );
    }
    let spans: Vec<(usize, usize)> = children
        .iter()
        .map(|k| span(k).unwrap_or_default())
        .collect();
    for w in spans.windows(2) {
        ensure!(
            w[0].1 <= w[1].0 && punct(tokens, w[0].1, w[1].0),
            "{at}: parts of {id} are not contiguous"
        );
    }
    n["span"] = json!([spans[0].0, spans[spans.len() - 1].1]);
    Ok(())
}

/// Resolve and check punctuation marks: which token each is, what it attaches to and where. ',2' is the second
/// comma of the example; ',' the first.
pub fn build_marks(ex: &Value, tokens: &[Value], tree: &Value) -> Result<Vec<Value>, String> {
    let at = format!("example {}", s(ex, "id"));
    let nodes = flatten(tree);
    let mut out: Vec<Value> = vec![];
    for m in ex
        .get("marks")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let (pos, id, name, bounds, side) = (
            s(m, "at"),
            s(m, "id"),
            s(m, "name"),
            s(m, "bounds"),
            s(m, "side"),
        );
        let mut cs = pos.chars();
        let (Some(c), rest) = (cs.next().filter(|c| !c.is_ascii_digit()), cs.as_str()) else {
            return Err(format!("bad mark position {pos:?}"));
        };
        ensure!(
            rest.chars().all(|d| d.is_ascii_digit()),
            "bad mark position {pos:?}"
        );
        let nth: usize = if rest.is_empty() {
            1
        } else {
            rest.parse()
                .map_err(|_| format!("bad mark position {pos:?}"))?
        };
        let found: Vec<usize> = (0..tokens.len())
            .filter(|&i| !is_word(&tokens[i]) && s(&tokens[i], "t") == c.to_string())
            .collect();
        ensure!(found.len() >= nth, "{at}: no punctuation token {pos:?}");
        // Python's found[nth - 1]: position 0 is the last one.
        let i = *(if nth == 0 {
            found.last()
        } else {
            found.get(nth - 1)
        })
        .ok_or_else(|| format!("{at}: no punctuation token {pos:?}"))?;
        let indicator = INDICATORS
            .iter()
            .find(|x| x.0 == name)
            .filter(|x| x.1.contains(c));
        let (_, _, class) =
            indicator.ok_or_else(|| format!("{at}: {:?} is not a {name}", c.to_string()))?;
        let digits = id
            .strip_prefix('m')
            .is_some_and(|d| !d.is_empty() && d.chars().all(|c| c.is_ascii_digit()));
        ensure!(
            digits && find(&nodes, id).is_none(),
            "{at}: bad or clashing mark id {id}"
        );
        ensure!(
            find(&nodes, bounds).is_some()
                && MARK_SIDES.contains(&side)
                && !s(m, "use").trim().is_empty(),
            "{at}: mark {id} needs bounds, side and use"
        );
        let node = find(&nodes, bounds).expect("checked").1;
        let (a, b) = span(node).ok_or_else(|| format!("{at}: mark {id} cannot attach to a gap"))?;
        match side {
            "start" => ensure!(
                i < a && punct(tokens, i, a),
                "{at}: mark {id} is not at the start of {bounds}"
            ),
            "end" => ensure!(
                i >= b && punct(tokens, b, i),
                "{at}: mark {id} is not at the end of {bounds}"
            ),
            _ => {
                let spans: Vec<(usize, usize)> = kids(node).iter().filter_map(span).collect();
                ensure!(
                    spans.windows(2).any(|w| w[0].1 <= i && i < w[1].0),
                    "{at}: mark {id} is not between two parts of {bounds}"
                );
            }
        }
        if *class == "primary terminal" {
            ensure!(
                bounds == s(tree, "id") && side == "end" && punct(tokens, i, tokens.len()),
                "{at}: a terminal closes the whole example"
            );
        }
        let mut item = json!({"id": id, "i": i, "name": name, "class": class, "use": m["use"], "bounds": bounds, "side": side});
        if let Some(pair) = m.get("pair") {
            item["pair"] = pair.clone();
        }
        out.push(item);
    }
    let ids: Vec<&str> = out.iter().map(|m| s(m, "id")).collect();
    ensure!(
        (0..ids.len()).all(|j| !ids[..j].contains(&ids[j])),
        "{at}: duplicate mark id"
    );
    let marked: Vec<usize> = out.iter().map(|m| n(m, "i")).collect();
    ensure!(
        (0..marked.len()).all(|j| !marked[..j].contains(&marked[j])),
        "{at}: two marks on one token"
    );
    if !out.is_empty() {
        let unmarked: Vec<&str> = (0..tokens.len())
            .filter(|j| !is_word(&tokens[*j]) && !marked.contains(j))
            .map(|j| s(&tokens[j], "t"))
            .collect();
        ensure!(
            unmarked.is_empty(),
            "{at}: punctuation not attached to anything: {unmarked:?}"
        );
    }
    // The last mark of an id wins, as in a Python dict.
    let by_id = |id: &str| out.iter().rev().find(|m| s(m, "id") == id);
    for m in &out {
        let (id, name) = (s(m, "id"), s(m, "name"));
        if PAIRED.iter().any(|p| p.0 == name || p.1 == name) {
            ensure!(
                m.get("pair").is_some(),
                "{at}: mark {id} ({name}) must be paired"
            );
        }
        let Some(pair) = m.get("pair") else { continue };
        let pair_id = pair.as_str().unwrap_or("");
        let p = by_id(pair_id).filter(|p| s(p, "pair") == id && s(p, "bounds") == s(m, "bounds"));
        let p = p.ok_or_else(|| {
            format!("{at}: marks {id} and {pair_id} are not a pair around one constituent")
        })?;
        let sides = [s(m, "side"), s(p, "side")];
        ensure!(
            sides.contains(&"start") && sides.contains(&"end"),
            "{at}: paired marks {id} must open and close"
        );
        let (opener, closer) = if s(m, "side") == "start" {
            (m, p)
        } else {
            (p, m)
        };
        if let Some(want) = PAIRED.iter().find(|x| x.0 == s(opener, "name")) {
            ensure!(
                want.1 == s(closer, "name"),
                "{at}: {} closed by {}",
                s(opener, "name"),
                s(closer, "name")
            );
        }
    }
    Ok(out)
}
