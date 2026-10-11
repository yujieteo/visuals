//! BibTeX for the links, as the old Paper Links page wrote it (its static/js/bibtex.js, with the citation
//! of scripts/paper_tags.py): one @misc entry a link, with the same keys, fields and escaping.

use crate::data::Data;
use crate::fold::{ascii, words};
use std::collections::HashSet;

const STOP_WORDS: [&str; 14] = ["a", "an", "the", "on", "of", "and", "for", "in", "to", "via", "with", "from", "by", "at"];
/// The arXiv archives that name a field (paper_tags.py ARCHIVE_NAMES), and the field each names.
pub const ARCHIVES: [(&str, &str); 13] = [
    ("math", "mathematics"), ("cs", "computer-science"), ("stat", "statistics"), ("hep-th", "physics"), ("math-ph", "physics"),
    ("quant-ph", "physics"), ("gr-qc", "physics"), ("cond-mat", "physics"), ("physics", "physics"), ("q-bio", "quantitative-biology"),
    ("q-fin", "quantitative-finance"), ("econ", "economics"), ("eess", "electrical-engineering"),
];
const STANDALONE: [&str; 8] = ["hep-th", "hep-ph", "hep-lat", "hep-ex", "math-ph", "quant-ph", "gr-qc", "nucl-th"];

/// Whether a tag is an arXiv class, such as math.NT or hep-th.
pub fn is_arxiv_class(tag: &str) -> bool {
    if STANDALONE.contains(&tag) { return true }
    let Some((archive, sub)) = tag.split_once('.') else { return false };
    let shape = !archive.is_empty() && archive.bytes().all(|c| c.is_ascii_lowercase() || c == b'-')
        && !sub.is_empty() && sub.bytes().all(|c| c.is_ascii_alphabetic() || c == b'-');
    shape && (ARCHIVES.iter().any(|a| a.0 == archive) || ["cond-mat", "q-bio", "q-fin"].contains(&archive))
}

/// The arXiv identifier in a URL: arxiv.org/abs|pdf|html|format/ then 2107.01234 or math/0401222.
pub fn arxiv_id(url: &str) -> Option<String> {
    let low = url.to_ascii_lowercase();
    let b = url.as_bytes();
    let digits = |i: usize, n: usize| b.len() >= i + n && b[i..i + n].iter().all(u8::is_ascii_digit);
    for (at, _) in low.match_indices("arxiv.org/") {
        let rest = &low[at + 10..];
        let Some(kind) = ["abs/", "pdf/", "html/", "format/"].iter().find(|k| rest.starts_with(**k)) else { continue };
        let s = at + 10 + kind.len();
        if digits(s, 4) && b.get(s + 4) == Some(&b'.') && digits(s + 5, 4) {
            return Some(url[s..s + if digits(s + 9, 1) { 10 } else { 9 }].into());
        }
        let mut e = s;
        if !b.get(e).is_some_and(u8::is_ascii_alphabetic) { continue }
        while b.get(e).is_some_and(|c| c.is_ascii_alphabetic() || *c == b'-') { e += 1 }
        if b.get(e) == Some(&b'.') && b.len() >= e + 3 && b[e + 1..e + 3].iter().all(u8::is_ascii_alphabetic) && b.get(e + 3) == Some(&b'/') { e += 3 }
        if b.get(e) == Some(&b'/') && digits(e + 1, 7) { return Some(url[s..e + 8].into()) }
    }
    None
}

/// What a link's entry cites beyond its title and URL: its authors and year, and its arXiv identifier and class.
pub struct Citation { pub authors: Vec<String>, pub year: Option<u32>, pub eprint: Option<String>, pub class: Option<String> }

pub fn citation(d: &Data, i: usize) -> Citation {
    let r = &d.recs[i];
    let eprint = arxiv_id(&r.url);
    // New-style 2107.01234 is 2021; old-style math/0401222 is 2004.
    let from_id = eprint.as_ref().and_then(|e| e.rsplit('/').next()?.get(..2)?.parse::<u32>().ok()).map(|yy| if yy >= 91 { 1900 + yy } else { 2000 + yy });
    let class = eprint.as_ref().and_then(|_| r.tags.iter().map(|&t| d.tags[t as usize].as_str()).find(|t| is_arxiv_class(t)).map(String::from));
    Citation { authors: r.authors.clone(), year: r.year.or(from_id), eprint, class }
}

/// Free text made safe in a BibTeX field, keeping $...$ maths: `%`, `#` and `&` escaped everywhere, `_` and `^`
/// outside maths; an unmatched `$` escaped, an unmatched `{` closed and an unmatched `}` written as a command.
pub fn escape_text(value: &str) -> String {
    let mut c: Vec<char> = value.chars().collect();
    let dollars: Vec<usize> = (0..c.len()).filter(|&i| c[i] == '$' && (i == 0 || c[i - 1] != '\\')).collect();
    if dollars.len() % 2 == 1 { c.insert(dollars[dollars.len() - 1], '\\') }
    let (mut out, mut math, mut depth, mut i) = (String::with_capacity(c.len()), false, 0usize, 0);
    while i < c.len() {
        match c[i] {
            '\\' => { if i + 1 < c.len() { out.push('\\'); out.push(c[i + 1]) } else { out.push_str("\\textbackslash{}") } i += 1 }
            '$' => { math = !math; out.push('$') }
            ch @ ('%' | '#' | '&') => { out.push('\\'); out.push(ch) }
            '_' if !math => out.push_str("\\_"),
            '^' if !math => out.push_str("\\textasciicircum{}"),
            '{' => { depth += 1; out.push('{') }
            // BibTeX counts braces even after a backslash, so \} would not do.
            '}' => if depth == 0 { out.push_str("\\textbraceright{}") } else { depth -= 1; out.push('}') },
            ch => out.push(ch),
        }
        i += 1;
    }
    out + &"}".repeat(depth)
}

fn url_field(url: &str) -> String { url.replace('{', "%7B").replace('}', "%7D") }

/// A URL escaped for \url{...} inside another field's argument.
fn url_argument(url: &str) -> String { url_field(url).replace('%', "\\%").replace('#', "\\#") }

/// Whether `word` occurs in `s` as a whole word, ignoring ASCII case, as JavaScript's /\bword\b/i finds it.
fn has_word(s: &str, word: &str) -> bool {
    let (b, w) = (s.as_bytes(), word.len());
    let wordy = |k: Option<&u8>| k.is_some_and(|c| c.is_ascii_alphanumeric() || *c == b'_');
    (0..b.len().saturating_sub(w - 1)).any(|i| b[i..i + w].eq_ignore_ascii_case(word.as_bytes())
        && !wordy(i.checked_sub(1).and_then(|j| b.get(j))) && !wordy(b.get(i + w)))
}

fn format_author(name: &str) -> String {
    let t = name.trim_matches(crate::fold::js_space);
    if t == "et al." || t == "others" { return "others".into() }
    let e = escape_text(t);
    // Corporate authors stay one unit.
    if ["community", "team", "group", "collaboration", "consortium"].iter().any(|w| has_word(t, w)) { format!("{{{e}}}") } else { e }
}

/// The key suffix for the nth repeat of a base key: a to z, then aa, ab, ...
fn key_suffix(n: usize) -> String { (if n >= 26 { key_suffix(n / 26 - 1) } else { String::new() }) + &((b'a' + (n % 26) as u8) as char).to_string() }

/// A citation key (last name, year, first title word) not yet in `used`, which it joins.
fn citation_key(title: &str, authors: &[String], year: Option<u32>, used: &mut HashSet<String>) -> String {
    let t = ascii(title);
    let title_words: Vec<String> = t.split(|c: char| !c.is_ascii_alphanumeric()).filter(|w| !w.is_empty())
        .filter(|w| !STOP_WORDS.contains(&w.to_ascii_lowercase().as_str())).map(str::to_ascii_lowercase).collect();
    let first = title_words.first().map_or("untitled", String::as_str);
    let year = year.map_or(String::new(), |y| y.to_string());
    let mut base = match authors.first() {
        Some(a) if a != "et al." && a != "others" => {
            let last = words(&a.replace(['{', '}'], "")).last().map(ascii).unwrap_or_default();
            let last: String = last.chars().filter(char::is_ascii_alphanumeric).collect::<String>().to_ascii_lowercase();
            format!("{last}{year}{first}")
        }
        _ => {
            let b = title_words.iter().take(3).cloned().collect::<String>();
            (if b.is_empty() { "untitled".into() } else { b }) + &year
        }
    };
    if base.is_empty() { base = "entry".into() }
    let mut key = base.clone();
    let mut n = 0;
    while used.contains(&key) { key = format!("{base}{}", key_suffix(n)); n += 1 }
    used.insert(key.clone());
    key
}

/// The @misc entry of link `i`; its key is unique among those in `used`.
pub fn entry(d: &Data, i: usize, used: &mut HashSet<String>) -> String {
    let r = &d.recs[i];
    let c = citation(d, i);
    let note = words(&r.note).collect::<Vec<_>>().join(" ");
    let key = citation_key(&r.title, &c.authors, c.year, used);
    let mut fields = vec![("title", format!("{{{}}}", escape_text(&r.title)))];
    if c.authors.is_empty() {
        // Sort key for author-less entries in BibTeX styles such as plain.
        fields.push(("key", escape_text(&r.title)));
    } else {
        fields.push(("author", c.authors.iter().map(|a| format_author(a)).collect::<Vec<_>>().join(" and ")));
    }
    if let Some(y) = c.year { fields.push(("year", y.to_string())) }
    if let Some(e) = c.eprint {
        fields.push(("eprint", e));
        fields.push(("archivePrefix", "arXiv".into()));
        if let Some(p) = c.class { fields.push(("primaryClass", p)) }
    }
    fields.push(("url", url_field(&r.url)));
    fields.push(("howpublished", format!("\\url{{{}}}", url_argument(&r.url))));
    if !r.tags.is_empty() { fields.push(("keywords", escape_text(&r.tags.iter().map(|&t| d.tags[t as usize].as_str()).collect::<Vec<_>>().join(", ")))) }
    if !note.is_empty() { fields.push(("abstract", escape_text(&note))) }
    let width = fields.iter().map(|f| f.0.len()).max().unwrap_or(0);
    let body: Vec<String> = fields.iter().map(|(n, v)| format!("  {n:width$} = {{{v}}}")).collect();
    format!("@misc{{{key},\n{}\n}}", body.join(",\n"))
}

/// A .bib file of the given links, in their order, with unique keys.
pub fn render(d: &Data, links: &[usize]) -> String {
    let mut used = HashSet::new();
    let entries: Vec<String> = links.iter().map(|&i| entry(d, i, &mut used)).collect();
    format!("% Exported from the Paper Links page of this site.\n% {} {}. Encoding: UTF-8 (use biber, or \\usepackage[utf8]{{inputenc}} with bibtex).\n\n{}\n",
        links.len(), if links.len() == 1 { "entry" } else { "entries" }, entries.join("\n\n"))
}
