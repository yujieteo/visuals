//! The paper links: the records of links.json, packed into columns for the codec, and written back out
//! exactly as links.json holds them, so the page builder can prove the round trip.

use crate::json::{self, Value};

/// One link. `cat` and `tags` index the tables of `Data`; `year` and `authors` are absent on some links.
pub struct Rec { pub title: String, pub url: String, pub cat: u32, pub tags: Vec<u32>, pub authors: Vec<String>, pub year: Option<u32>, pub note: String }

pub struct Data { pub tags: Vec<String>, pub cats: Vec<String>, pub recs: Vec<Rec> }

/// The keys of a record in links.json, in their order there.
const KEYS: [&str; 7] = ["title", "url", "category", "tags", "authors", "year", "note"];

fn intern(table: &mut Vec<String>, s: &str) -> u32 {
    (table.iter().position(|t| t == s).unwrap_or_else(|| { table.push(s.into()); table.len() - 1 })) as u32
}

fn varint(b: &mut Vec<u8>, mut n: usize) {
    while n >= 0x80 { b.push(n as u8 | 0x80); n >>= 7 }
    b.push(n as u8);
}

fn text(b: &mut Vec<u8>, s: &str) { b.extend_from_slice(s.as_bytes()); b.push(0) }

struct Reader<'a> { b: &'a [u8], i: usize }

impl Reader<'_> {
    fn num(&mut self) -> usize {
        let (mut n, mut shift) = (0, 0);
        while let Some(&x) = self.b.get(self.i) {
            self.i += 1;
            n |= ((x & 0x7f) as usize) << shift;
            if x < 0x80 { break }
            shift += 7;
        }
        n
    }
    fn text(&mut self) -> String {
        let end = self.b[self.i..].iter().position(|&c| c == 0).map_or(self.b.len(), |k| self.i + k);
        let s = String::from_utf8_lossy(&self.b[self.i..end]).into_owned();
        self.i = end + 1;
        s
    }
}

impl Data {
    /// The records of links.json. It panics on a record the columns cannot hold, so a change to the data
    /// that would not survive the round trip stops the build.
    pub fn from_json(src: &str) -> Data {
        let v = json::parse(src).expect("links.json is JSON");
        let mut d = Data { tags: vec![], cats: vec![], recs: vec![] };
        for r in v.arr().expect("links.json is a list") {
            let Value::Obj(m) = r else { panic!("a record is an object") };
            let keys: Vec<&str> = m.iter().map(|(k, _)| k.as_str()).collect();
            assert!(KEYS.iter().filter(|k| keys.contains(k)).eq(keys.iter()), "unexpected keys {keys:?}");
            let cat = intern(&mut d.cats, r.s("category"));
            let tags = r.get("tags").arr().expect("tags").iter().map(|t| intern(&mut d.tags, t.str().expect("a tag"))).collect();
            let authors: Vec<String> = r.get("authors").arr().map(|a| a.iter().map(|x| x.str().expect("an author").into()).collect()).unwrap_or_default();
            assert!(authors.is_empty() != keys.contains(&"authors"), "authors, when present, are not empty");
            let year = r.get("year").num().map(|y| y as u32);
            assert!(year.is_some() == keys.contains(&"year") && year != Some(0), "a year is a positive integer");
            let rec = Rec { title: r.s("title").into(), url: r.s("url").into(), cat, tags, authors, year, note: r.s("note").into() };
            assert!([&rec.title, &rec.url, &rec.note].into_iter().chain(&rec.authors).all(|s| !s.contains('\0')), "no zero bytes");
            d.recs.push(rec);
        }
        d
    }

    /// The columns: the tables, then each field of every record in turn, strings ended by a zero byte.
    pub fn pack(&self) -> Vec<u8> {
        let mut b = vec![];
        for table in [&self.tags, &self.cats] { varint(&mut b, table.len()); table.iter().for_each(|s| text(&mut b, s)) }
        varint(&mut b, self.recs.len());
        self.recs.iter().for_each(|r| varint(&mut b, r.cat as usize));
        for r in &self.recs { varint(&mut b, r.tags.len()); r.tags.iter().for_each(|&t| varint(&mut b, t as usize)) }
        self.recs.iter().for_each(|r| varint(&mut b, r.year.unwrap_or(0) as usize));
        self.recs.iter().for_each(|r| varint(&mut b, r.authors.len()));
        self.recs.iter().flat_map(|r| &r.authors).for_each(|a| text(&mut b, a));
        self.recs.iter().for_each(|r| text(&mut b, &r.title));
        self.recs.iter().for_each(|r| text(&mut b, &r.url));
        self.recs.iter().for_each(|r| text(&mut b, &r.note));
        b
    }

    pub fn unpack(b: &[u8]) -> Data {
        let mut r = Reader { b, i: 0 };
        let table = |r: &mut Reader| (0..r.num()).map(|_| r.text()).collect::<Vec<_>>();
        let (tags, cats) = (table(&mut r), table(&mut r));
        let n = r.num();
        let cat: Vec<u32> = (0..n).map(|_| r.num() as u32).collect();
        let tagv: Vec<Vec<u32>> = (0..n).map(|_| (0..r.num()).map(|_| r.num() as u32).collect()).collect();
        let year: Vec<usize> = (0..n).map(|_| r.num()).collect();
        let count: Vec<usize> = (0..n).map(|_| r.num()).collect();
        let authors: Vec<Vec<String>> = count.iter().map(|&k| (0..k).map(|_| r.text()).collect()).collect();
        let title: Vec<String> = (0..n).map(|_| r.text()).collect();
        let url: Vec<String> = (0..n).map(|_| r.text()).collect();
        let recs = title.into_iter().zip(url).zip(authors).zip(tagv).enumerate().map(|(k, (((title, url), authors), tags))| {
            Rec { title, url, cat: cat[k], tags, authors, year: (year[k] > 0).then_some(year[k] as u32), note: r.text() }
        }).collect();
        Data { tags, cats, recs }
    }

    /// Record `i` as links.json holds it.
    pub fn record(&self, i: usize) -> Value {
        let r = &self.recs[i];
        let mut m = vec![
            ("title".into(), Value::from(r.title.as_str())), ("url".into(), r.url.as_str().into()),
            ("category".into(), self.cats[r.cat as usize].as_str().into()),
            ("tags".into(), Value::Arr(r.tags.iter().map(|&t| self.tags[t as usize].as_str().into()).collect())),
        ];
        if !r.authors.is_empty() { m.push(("authors".into(), r.authors.clone().into())) }
        if let Some(y) = r.year { m.push(("year".into(), y.into())) }
        m.push(("note".into(), r.note.as_str().into()));
        Value::Obj(m)
    }

    /// The text of links.json: one record a line.
    pub fn to_json(&self) -> String {
        let lines: Vec<String> = (0..self.recs.len()).map(|i| self.record(i).to_string()).collect();
        format!("[\n{}\n]\n", lines.join(",\n"))
    }
}
