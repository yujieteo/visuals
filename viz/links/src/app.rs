//! The page: its state, its HTML and its events. The host sends each event as JSON and runs the commands
//! that come back (HTML, text, attributes, focus, a download, a copy, a WebMCP reply). Every rule of the
//! old Paper Links page (static/js/filter.js and paper-bib.js) is here; the host only touches the DOM.

use crate::bib;
use crate::esc;
use crate::fold::js_space;
use crate::json::{self, obj, Value};
use crate::search::{Index, Query, FACETS, SITE};
use crate::tex::rich;
use std::collections::BTreeSet;
use std::fmt::Write;

/// Links a page of results shows, and tags a facet shows before "Show all".
const PAGE: usize = 10;
const SHOW_FIRST: usize = 8;
const TOOLS: &str = include_str!("tools.json");
/// Where links.json comes from: the repository, the file and the commit.
pub const SOURCE: [&str; 3] = ["yujieteo/sitedumb", "data/paper-links/paper-links.yaml", "8a823b9bd4007b3116d21c12593f227baed2a806"];

pub struct App {
    pub ix: Index,
    text: String,
    q: Query,
    ranked: Vec<u32>,
    page: usize,
    menu: bool,
    open: [bool; 6],
    find: String,
    cite: BTreeSet<u32>,
    /// The last .bib sent to the clipboard, and its entries, for the fallback when the copy fails.
    copied: (String, usize),
}

/// The commands of one answer.
struct Out(Vec<Value>);

impl Out {
    fn set(&mut self, cmd: &str, sel: &str, v: impl Into<Value>) { self.0.push(obj([(cmd, sel.into()), ("v", v.into())])) }
    fn hidden(&mut self, sel: &str, on: bool) { self.0.push(obj([("hidden", sel.into()), ("on", on.into())])) }
    fn attr(&mut self, sel: &str, name: &str, v: Option<&str>) { self.0.push(obj([("attr", sel.into()), ("name", name.into()), ("v", v.into())])) }
    fn one(&mut self, cmd: &str, v: impl Into<Value>) { self.0.push(obj([(cmd, v.into())])) }
}

fn entries(n: usize) -> String { format!("{n} {}", if n == 1 { "entry" } else { "entries" }) }

/// 2523 as 2,523.
pub fn thousands(n: usize) -> String {
    let s = n.to_string();
    s.chars().enumerate().fold(String::new(), |mut o, (k, c)| { if k > 0 && (s.len() - k) % 3 == 0 { o.push(',') } o.push(c); o })
}

fn pick(arg: &str) -> Option<(usize, u32)> {
    let (f, v) = arg.split_once(':')?;
    Some((f.parse().ok().filter(|&f| f < FACETS.len())?, v.parse().ok()?))
}

impl App {
    pub fn new(ix: Index) -> App {
        App { ix, text: String::new(), q: Query::default(), ranked: vec![], page: 0, menu: false, open: [false; 6], find: String::new(), cite: BTreeSet::new(), copied: (String::new(), 0) }
    }

    fn filtered(&self) -> bool { self.q.filtered() }

    /// After a change to the text or the facets: rank again, from the first page.
    fn rerank(&mut self) {
        self.q.terms = Query::new(&self.text).terms;
        self.ranked = if self.filtered() { self.ix.rank(&self.q) } else { vec![] };
        self.page = 0;
    }

    fn count(&self) -> String {
        if !self.filtered() { return format!("{} paper links · type or pick a filter to show them", self.ix.data.recs.len()) }
        let n = self.ranked.len();
        format!("{n} {}", if n == 1 { "match" } else { "matches" })
    }

    fn picked(&self, f: usize, v: u32) -> bool { self.q.picks[f].contains(&v) }

    fn toggle(&mut self, f: usize, v: u32) {
        let p = &mut self.q.picks[f];
        if let Some(k) = p.iter().position(|&x| x == v) { p.remove(k); } else { p.push(v) }
        self.rerank();
    }

    /// The facets: each one's most used tags (and any picked), or all of them, or those a "Find a tag" matches.
    fn facets(&self) -> String {
        let find = self.find.trim_matches(js_space).to_lowercase();
        let mut h = String::new();
        for (f, (_, label)) in FACETS.iter().enumerate() {
            let vals = &self.ix.facets[f];
            let buttons: String = vals.iter().enumerate().filter(|&(k, &(v, _))| match find.is_empty() {
                false => self.ix.name(f, v).to_lowercase().contains(&find),
                true => self.open[f] || k < SHOW_FIRST || self.picked(f, v),
            }).map(|(_, &(v, n))| format!(r#"<button type="button" class="tag" data-act="tag" data-arg="{f}:{v}" aria-pressed="{}">{} <span class="n">{n}</span></button>"#,
                self.picked(f, v), esc(self.ix.name(f, v)))).collect();
            if buttons.is_empty() { continue }
            let more = if vals.len() > SHOW_FIRST && find.is_empty() {
                let label = if self.open[f] { "Show fewer".into() } else { format!("Show all {}", vals.len()) };
                format!(r#"<button type="button" class="more" data-act="more" data-arg="{f}" aria-expanded="{}">{label}</button>"#, self.open[f])
            } else { String::new() };
            write!(h, r#"<fieldset class="facet"><legend>{label}</legend><div class="tags">{buttons}</div>{more}</fieldset>"#).unwrap();
        }
        h
    }

    fn chips(&self) -> String {
        let mut h = String::new();
        for (f, p) in self.q.picks.iter().enumerate() {
            for &v in p {
                let name = esc(self.ix.name(f, v));
                write!(h, r#"<li><button type="button" class="chip" data-act="unfilter" data-arg="{f}:{v}" aria-label="Remove filter {name}">{name}<span aria-hidden="true">×</span></button></li>"#).unwrap();
            }
        }
        h
    }

    fn entry(&self, i: u32) -> String {
        let r = &self.ix.data.recs[i as usize];
        let chip = |f: usize, v: u32, class: &str| format!(r#"<button type="button" class="{class}" data-act="chip" data-arg="{f}:{v}">{}</button>"#, esc(self.ix.name(f, v)));
        let tags: String = r.tags.iter().map(|&t| chip(self.ix.tag_facet[t as usize] as usize, t, "tag")).collect();
        let note = if r.note.is_empty() { String::new() } else { format!(r#"<p class="entry-abstract">{}</p>"#, rich(&r.note)) };
        let checked = if self.cite.contains(&i) { " checked" } else { "" };
        format!(r#"<article class="entry"><h2 class="entry-title"><a href="{}" target="_top">{}</a></h2>{note}<div class="entry-tags" aria-label="Tags">{}{tags}</div><label class="bib-pick"><input type="checkbox" data-cite="{i}" aria-label="Cite {}"{checked}> Cite</label></article>"#,
            esc(&r.url), rich(&r.title), chip(SITE, r.cat, "tag site"), esc(&r.title))
    }

    fn list(&self, o: &mut Out) {
        let (n, start) = (self.ranked.len(), self.page * PAGE);
        let end = (start + PAGE).min(n);
        o.set("html", "#list", self.ranked[start.min(end)..end].iter().map(|&i| self.entry(i)).collect::<String>());
        o.hidden("#empty", !self.filtered() || n > 0);
        let paged = n > PAGE;
        let off = |b: bool| if b { " disabled" } else { "" };
        o.set("html", "#pager", if !paged { String::new() } else { format!(
            r#"<button type="button" data-act="prev" data-arg=""{}>Previous</button><span>{}–{} of {n}</span><button type="button" data-act="next" data-arg=""{}>Next</button>"#,
            off(self.page == 0), start + 1, end, off(end >= n)) });
        o.hidden("#pager", !paged);
    }

    fn bib_state(&self, o: &mut Out) {
        o.set("text", "#picked", format!("{} selected", self.cite.len()));
        let none = self.cite.is_empty();
        for (sel, off) in [("[data-act=bib][data-arg^=selected]", none), ("[data-act=bibclear]", none), ("[data-act=bib][data-arg^=filtered]", !self.filtered())] {
            o.attr(sel, "disabled", off.then_some(""));
        }
    }

    /// Everything that follows the filters, and the facets too when `facets`.
    fn show(&self, o: &mut Out, facets: bool) {
        o.set("text", "#count", self.count());
        let n: usize = self.q.picks.iter().map(Vec::len).sum();
        o.set("text", "#active-count", if n > 0 { format!(" ({n})") } else { String::new() });
        o.hidden("#active-count", n == 0);
        o.set("html", "#chips", self.chips());
        o.hidden("#active", !self.filtered());
        if facets { o.set("html", "#facets", self.facets()) }
        self.list(o);
        self.bib_state(o);
        // The filters in the address, so a filtered view can be shared (not in a frame).
        let mut url: Vec<Value> = vec![];
        let text = self.text.trim_matches(js_space);
        if !text.is_empty() { url.push(vec!["q", text].into()) }
        for (f, p) in self.q.picks.iter().enumerate() { url.extend(p.iter().map(|&v| vec![FACETS[f].0, self.ix.name(f, v)].into())) }
        o.one("url", url);
    }

    /// The page as it opens: what the host fills once the module runs.
    pub fn body(&self) -> String {
        let n = self.ix.data.recs.len();
        let bib = |scope: &str, what: &str| format!(
            r#"<button type="button" data-act="bib" data-arg="{scope}-copy" aria-label="Copy .bib of {what}" disabled>Copy .bib</button><button type="button" data-act="bib" data-arg="{scope}-download" aria-label="Download .bib of {what}" disabled>Download .bib</button>"#);
        format!(r#"<div class="pl">
<h1>Paper links</h1>
<p class="lede">{} links to papers, lecture notes, slides, books and talks, with their tags. Search them, filter them by tag or by site, and get BibTeX for the ones you pick.</p>
<section class="bib" id="bib" aria-label="BibTeX export" hidden>
<p>Tick <strong>Cite</strong> on links, or filter the list, to get BibTeX for just those links.</p>
<div class="row"><span id="picked">0 selected</span>{}<button type="button" data-act="bibclear" data-arg="" disabled>Clear selection</button></div>
<div class="row"><span>All matches of the filters</span>{}</div>
<p class="status" id="bib-status" aria-live="polite"></p>
<textarea id="bib-fallback" aria-label="BibTeX to copy" readonly hidden></textarea>
</section>
<form class="sift" id="filter" role="search" aria-label="Filter">
<div class="field"><label for="q">Filter this list</label><input type="search" id="q" placeholder="Filter paper links by title, note or tag…" autocomplete="off" spellcheck="false" enterkeyhint="search"></div>
<button type="button" id="menu" data-act="menu" data-arg="" aria-expanded="false" aria-controls="panel">Filters<span id="active-count" hidden></span></button>
<output id="count" aria-live="polite" aria-atomic="true">{}</output>
<div id="panel" hidden><div class="tagfind"><label class="vh" for="tagq">Find a tag</label><input type="search" id="tagq" placeholder="Find a tag…" autocomplete="off" spellcheck="false"></div>
<div id="facets">{}</div>
<p class="note">Tags in one group match any of them; tags from different groups must all match.</p></div>
</form>
<div class="active" id="active" hidden><span>Filtered by</span><ul id="chips"></ul><button type="button" data-act="clear" data-arg="">Clear all</button></div>
<div id="list" aria-label="Results"></div>
<p id="empty" hidden>No paper links match these filters.</p>
<nav id="pager" aria-label="Result pages" hidden></nav>
<p class="error" id="error" role="alert" hidden></p>
<noscript><p class="error">The search, the filters and the BibTeX export need JavaScript.</p></noscript>
</div>"#, thousands(n), bib("selected", "the selected links"), bib("filtered", "every link matching the filters"), self.count(), self.facets())
    }

    fn export(&mut self, arg: &str, o: &mut Out) {
        let (scope, action) = arg.split_once('-').unwrap_or_default();
        // A selection goes in the order of the data, so its keys stay the same; the matches go in their rank.
        let links: Vec<usize> = match scope {
            "selected" if !self.cite.is_empty() => self.cite.iter().map(|&i| i as usize).collect(),
            "filtered" if self.filtered() => self.ranked.iter().map(|&i| i as usize).collect(),
            _ => return,
        };
        let text = bib::render(&self.ix.data, &links);
        if action == "download" {
            o.0.push(obj([("save", format!("paper-links-{scope}.bib").into()), ("data", text.into()), ("mime", "application/x-bibtex".into())]));
            o.one("say", format!("Downloaded {}", entries(links.len())));
        } else {
            o.0.push(obj([("copy", text.clone().into()), ("tag", scope.into())]));
            self.copied = (text, links.len());
        }
    }

    fn click(&mut self, act: &str, arg: &str, o: &mut Out) {
        match (act, pick(arg)) {
            ("menu", _) => {
                self.menu = !self.menu;
                o.attr("#menu", "aria-expanded", Some(if self.menu { "true" } else { "false" }));
                o.hidden("#panel", !self.menu);
            }
            ("tag", Some((f, v))) => { self.toggle(f, v); self.show(o, true) }
            // A tag on a link adds it to the filters.
            ("chip", Some((f, v))) => {
                if !self.picked(f, v) { self.toggle(f, v); self.show(o, true) }
                o.one("scroll", "#filter");
            }
            ("unfilter", Some((f, v))) if self.picked(f, v) => {
                self.toggle(f, v);
                self.show(o, true);
                o.one("focus", if self.q.picks.iter().any(|p| !p.is_empty()) { ".chip" } else { "#q" });
            }
            ("clear", _) => {
                self.text.clear();
                self.q.picks = Default::default();
                self.rerank();
                o.set("value", "#q", "");
                self.show(o, true);
                o.one("focus", "#q");
            }
            ("more", _) => {
                if let Some(f) = arg.parse::<usize>().ok().filter(|&f| f < FACETS.len()) { self.open[f] = !self.open[f] }
                o.set("html", "#facets", self.facets());
            }
            ("prev" | "next", _) => {
                let last = self.ranked.len().saturating_sub(1) / PAGE;
                self.page = if act == "next" { (self.page + 1).min(last) } else { self.page.saturating_sub(1) };
                self.list(o);
                o.one("scroll", "#list");
            }
            ("bib", _) => self.export(arg, o),
            ("bibclear", _) => {
                self.cite.clear();
                self.bib_state(o);
                self.list(o);
                o.one("say", "Selection cleared");
            }
            _ => {}
        }
    }

    pub fn handle(&mut self, msg: &str) -> String {
        let m = json::parse(msg).unwrap_or(Value::Null);
        let mut o = Out(vec![]);
        match m.s("ev") {
            "start" => {
                // A shared address's filters, then any text typed while the page loaded.
                for p in m.get("params").arr().unwrap_or_default() {
                    let (k, v) = (p.at(0), p.at(1));
                    if k == "q" { self.text = v.into() }
                    if let Some(f) = FACETS.iter().position(|x| x.0 == k) {
                        if let Some(v) = self.ix.value(f, v).filter(|&v| !self.picked(f, v)) { self.q.picks[f].push(v) }
                    }
                }
                if !m.s("q").is_empty() { self.text = m.s("q").into() }
                self.find = m.s("find").into();
                self.rerank();
                o.set("value", "#q", self.text.clone());
                self.show(&mut o, true);
                o.hidden("#bib", false);
            }
            "q" => { self.text = m.s("v").into(); self.rerank(); self.show(&mut o, false) }
            "find" => { self.find = m.s("v").into(); o.set("html", "#facets", self.facets()) }
            "click" => self.click(m.s("act"), m.s("arg"), &mut o),
            "cite" => {
                let i = m.get("i").num().map_or(u32::MAX, |x| x as u32);
                if (i as usize) < self.ix.data.recs.len() { if m.get("on") == &Value::Bool(true) { self.cite.insert(i); } else { self.cite.remove(&i); } }
                self.bib_state(&mut o);
            }
            "result" => {
                let n = entries(self.copied.1);
                if m.get("ok") == &Value::Bool(true) { o.one("say", format!("Copied {n}")) } else {
                    o.set("value", "#bib-fallback", self.copied.0.clone());
                    o.hidden("#bib-fallback", false);
                    o.one("select", "#bib-fallback");
                    o.one("say", format!("Could not copy automatically; the {n} are selected below."));
                }
            }
            "tools" => o.one("reply", json::parse(TOOLS).expect("tools.json")),
            "tool" => { let r = self.tool(m.s("name"), m.get("input")); o.one("reply", r) }
            _ => {}
        }
        Value::Arr(o.0).to_string()
    }

    // WebMCP ------------------------------------------------------------------------------------------------

    /// A search from a tool's input: text, tags (any facet but site) and sites.
    fn query(&self, input: &Value) -> Result<Query, String> {
        let mut q = Query::new(input.s("text"));
        let names = |k: &str| -> Result<Vec<String>, String> {
            match input.get(k) {
                Value::Null => Ok(vec![]),
                Value::Str(s) => Ok(vec![s.clone()]),
                Value::Arr(a) => a.iter().map(|t| t.str().map(String::from).ok_or(format!("{k} are strings"))).collect(),
                _ => Err(format!("{k} is a list of strings")),
            }
        };
        for name in names("tags")? {
            let (f, v) = (0..SITE).find_map(|f| self.ix.value(f, &name).map(|v| (f, v))).ok_or(format!("no tag {name:?}: list_tags gives every tag"))?;
            if !q.picks[f].contains(&v) { q.picks[f].push(v) }
        }
        for name in names("sites")? {
            let v = self.ix.value(SITE, &name).ok_or(format!("no site {name:?}: list_tags with facet \"site\" gives every site"))?;
            if !q.picks[SITE].contains(&v) { q.picks[SITE].push(v) }
        }
        Ok(q)
    }

    fn item(&self, i: usize) -> Value {
        let (r, d) = (&self.ix.data.recs[i], &self.ix.data);
        obj([("id", (i + 1).into()), ("title", r.title.as_str().into()), ("url", r.url.as_str().into()), ("site", d.cats[r.cat as usize].as_str().into()),
            ("tags", r.tags.iter().map(|&t| d.tags[t as usize].as_str()).collect::<Vec<_>>().into()), ("authors", r.authors.clone().into()), ("year", r.year.into()),
            ("note", r.note.as_str().into())])
    }

    fn ids(&self, input: &Value) -> Result<Vec<usize>, String> {
        let n = self.ix.data.recs.len();
        input.get("ids").arr().unwrap_or_default().iter().map(|x| match x.num() {
            Some(k) if k.fract() == 0.0 && k >= 1.0 && k <= n as f64 => Ok(k as usize - 1),
            _ => Err(format!("ids are whole numbers from 1 to {n}")),
        }).collect()
    }

    fn tool(&self, name: &str, input: &Value) -> Value {
        let n = self.ix.data.recs.len();
        let result: Result<Value, String> = (|| Ok(match name {
            "get_metadata" => obj([
                ("title", "Paper links".into()), ("links", n.into()),
                ("source", obj([("repository", SOURCE[0].into()), ("path", SOURCE[1].into()), ("commit", SOURCE[2].into())])),
                ("facets", FACETS.iter().enumerate().map(|(f, (id, label))| obj([("id", (*id).into()), ("label", (*label).into()), ("values", self.ix.facets[f].len().into())])).collect::<Vec<_>>().into()),
                ("search", "Every word of the text must occur in a link's title, note, site or tags, ignoring case. Links rank by the words in the title (8), the tags (5) and the note (2). Tags in one facet match any of them; facets must all match.".into()),
                ("page", obj([("text", self.text.as_str().into()), ("filters", self.q.picks.iter().enumerate().flat_map(|(f, p)| p.iter().map(move |&v| (f, v))).map(|(f, v)| self.ix.name(f, v)).collect::<Vec<_>>().into()),
                    ("matches", if self.filtered() { Value::from(self.ranked.len()) } else { Value::Null }), ("selected", self.cite.iter().map(|&i| i as usize + 1).collect::<Vec<_>>().into())])),
            ]),
            "search_links" => {
                let q = self.query(input)?;
                let limit = input.get("limit").num().unwrap_or(10.0);
                let offset = input.get("offset").num().unwrap_or(0.0);
                if limit.fract() != 0.0 || !(1.0..=100.0).contains(&limit) { return Err("limit is a whole number from 1 to 100".into()) }
                if offset.fract() != 0.0 || offset < 0.0 { return Err("offset is a whole number from 0".into()) }
                let ranked = if q.filtered() { self.ix.rank(&q) } else { (0..n as u32).collect() };
                let items: Vec<Value> = ranked.iter().skip(offset as usize).take(limit as usize).map(|&i| self.item(i as usize)).collect();
                obj([("total", ranked.len().into()), ("offset", (offset as usize).into()), ("items", Value::Arr(items))])
            }
            "get_link" => {
                let i = self.ids(&obj([("ids", Value::Arr(vec![input.get("id").clone()]))]))?[0];
                let mut v = self.item(i);
                if let Value::Obj(m) = &mut v { m.push(("bibtex".into(), bib::render(&self.ix.data, &[i]).into())) }
                v
            }
            "list_tags" => {
                let want = input.s("facet");
                let fs: Vec<usize> = (0..FACETS.len()).filter(|&f| want.is_empty() || FACETS[f].0 == want).collect();
                if fs.is_empty() { return Err(format!("facet is one of {}", FACETS.map(|f| f.0).join(", "))) }
                Value::Arr(fs.into_iter().map(|f| obj([("id", FACETS[f].0.into()), ("label", FACETS[f].1.into()),
                    ("values", Value::Arr(self.ix.facets[f].iter().map(|&(v, c)| obj([("name", self.ix.name(f, v).into()), ("links", c.into())])).collect()))])).collect())
            }
            "export_bib" => {
                let links = if input.get("ids").arr().is_some() { self.ids(input)? } else {
                    let q = self.query(input)?;
                    if !q.filtered() { return Err("give ids, or a text, tags or sites to export the links that match".into()) }
                    self.ix.rank(&q).into_iter().map(|i| i as usize).collect()
                };
                obj([("entries", links.len().into()), ("bib", bib::render(&self.ix.data, &links).into())])
            }
            _ => return Err(format!("no tool {name:?}")),
        }))();
        result.unwrap_or_else(|e| obj([("error", e.into())]))
    }
}
