//! The search of the old Paper Links page (its static/js/corpus.js): every term of the text must occur in a
//! link's title, note, site or tags, and a link scores 8 a term in its title, 5 in its tags and 2 in its
//! note, plus 1. Tags in one facet match any of them; facets must all match. Text and tags compare after
//! `normalize("NFKC").toLowerCase()` (fold.rs).

use crate::bib::{is_arxiv_class, ARCHIVES};
use crate::data::Data;
use crate::fold::{fold, words};

/// The facets in their order on the page: (id, label). The first five group the tags as the old page did;
/// "site" is each link's category, the site it is on.
pub const FACETS: [(&str, &str); 6] = [("field", "Field"), ("arxiv", "arXiv class"), ("topic", "Topic"), ("form", "Form"), ("source", "Source"), ("site", "Site")];
pub const SITE: usize = 5;
const FORMS: [&str; 11] = ["lecture-notes", "survey", "book", "slides", "talk", "interview", "problem-list", "thesis", "historical-paper", "video", "q-and-a"];
const SOURCES: [&str; 11] = ["arxiv", "mathoverflow", "stackexchange", "nlab", "wikipedia", "github", "gitlab", "youtube", "blog", "stacks-project", "kerodon"];

/// The facet of a tag (scripts/filter_lists.py classify_paper_tag).
pub fn facet_of(tag: &str) -> usize {
    if ARCHIVES.iter().any(|a| a.1 == tag) { 0 }
    else if FORMS.contains(&tag) { 3 }
    else if SOURCES.contains(&tag) { 4 }
    else if is_arxiv_class(tag) { 1 }
    else { 2 }
}

/// A search: the folded terms of its text, and the values picked in each facet (tag or site indexes).
#[derive(Clone, Default, PartialEq)]
pub struct Query { pub terms: Vec<String>, pub picks: [Vec<u32>; 6] }

impl Query {
    pub fn new(text: &str) -> Query { Query { terms: words(&fold(text)).map(String::from).collect(), picks: Default::default() } }
    pub fn filtered(&self) -> bool { !self.terms.is_empty() || self.picks.iter().any(|p| !p.is_empty()) }
}

pub struct Index {
    pub data: Data,
    /// Each link's folded title, note, site and tags, apart by \u{1}, one link after another, each ended by \u{2}.
    hay: String,
    /// Where in `hay` each link's title, note, site and tags start, and where it ends.
    at: Vec<[u32; 5]>,
    /// The facet of each tag.
    pub tag_facet: Vec<u8>,
    /// Each facet's values with their counts, most used first, then by name.
    pub facets: Vec<Vec<(u32, u32)>>,
}

impl Index {
    pub fn new(data: Data) -> Index {
        let mut hay = String::with_capacity(data.recs.iter().map(|r| r.title.len() + r.note.len() + 64).sum());
        let mut at = Vec::with_capacity(data.recs.len());
        let tags: Vec<String> = data.tags.iter().map(|t| fold(t)).collect();
        let cats: Vec<String> = data.cats.iter().map(|t| fold(t)).collect();
        for r in &data.recs {
            let mut a = [0u32; 5];
            a[0] = hay.len() as u32;
            hay.push_str(&fold(&r.title));
            hay.push('\u{1}');
            a[1] = hay.len() as u32;
            hay.push_str(&fold(&r.note));
            hay.push('\u{1}');
            a[2] = hay.len() as u32;
            hay.push_str(&cats[r.cat as usize]);
            hay.push('\u{1}');
            a[3] = hay.len() as u32;
            for (k, &t) in r.tags.iter().enumerate() { if k > 0 { hay.push(' ') } hay.push_str(&tags[t as usize]) }
            a[4] = hay.len() as u32;
            hay.push('\u{2}');
            at.push(a);
        }
        let tag_facet: Vec<u8> = data.tags.iter().map(|t| facet_of(t) as u8).collect();
        let mut counts = vec![vec![0u32; data.tags.len()], vec![0u32; data.cats.len()]];
        for r in &data.recs {
            r.tags.iter().for_each(|&t| counts[0][t as usize] += 1);
            counts[1][r.cat as usize] += 1;
        }
        let facets = (0..FACETS.len()).map(|f| {
            let (names, n) = if f == SITE { (&data.cats, &counts[1]) } else { (&data.tags, &counts[0]) };
            let mut v: Vec<(u32, u32)> = (0..names.len()).filter(|&k| f == SITE || tag_facet[k] as usize == f).map(|k| (k as u32, n[k])).collect();
            v.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| names[a.0 as usize].to_lowercase().cmp(&names[b.0 as usize].to_lowercase())));
            v
        }).collect();
        Index { data, hay, at, tag_facet, facets }
    }

    /// The name of value `v` of facet `f`.
    pub fn name(&self, f: usize, v: u32) -> &str { if f == SITE { &self.data.cats[v as usize] } else { &self.data.tags[v as usize] } }

    /// The value of facet `f` called `name`, compared as the old page compared tags.
    pub fn value(&self, f: usize, name: &str) -> Option<u32> {
        let want = fold(name.trim());
        self.facets[f].iter().map(|v| v.0).find(|&v| fold(self.name(f, v)) == want)
    }

    fn field(&self, i: usize, k: usize) -> &str { &self.hay[self.at[i][k] as usize..self.at[i][k + 1] as usize - (k < 3) as usize] }

    fn picked(&self, q: &Query, i: usize) -> bool {
        let r = &self.data.recs[i];
        q.picks.iter().enumerate().all(|(f, p)| p.is_empty() || p.iter().any(|&v| if f == SITE { r.cat == v } else { r.tags.contains(&v) }))
    }

    /// The links the query matches, best first, then in the order of the data.
    pub fn rank(&self, q: &Query) -> Vec<u32> {
        let n = self.data.recs.len();
        if q.terms.is_empty() { return (0..n).filter(|&i| self.picked(q, i)).map(|i| i as u32).collect() }
        if q.terms.iter().any(|t| t.contains(['\u{1}', '\u{2}'])) { return vec![] }
        // The longest term finds the candidates; the others are checked in each candidate alone.
        let key = q.terms.iter().max_by_key(|t| t.len()).expect("a term");
        let mut hits: Vec<(u32, u32)> = vec![];
        let mut pos = 0;
        while let Some(k) = self.hay[pos..].find(key.as_str()) {
            let i = self.at.partition_point(|a| a[4] as usize <= pos + k);
            pos = self.at[i][4] as usize + 1;
            let all = &self.hay[self.at[i][0] as usize..self.at[i][4] as usize];
            if !self.picked(q, i) || !q.terms.iter().all(|t| all.contains(t.as_str())) { continue }
            let (title, note, tags) = (self.field(i, 0), self.field(i, 1), self.field(i, 3));
            let score = q.terms.iter().map(|t| 1 + 8 * title.contains(t.as_str()) as u32 + 5 * tags.contains(t.as_str()) as u32 + 2 * note.contains(t.as_str()) as u32).sum();
            hits.push((score, i as u32));
        }
        hits.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
        hits.into_iter().map(|h| h.1).collect()
    }
}
