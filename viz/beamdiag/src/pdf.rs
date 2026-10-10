//! A display list as a one-page vector PDF in the print palette. Text is set in the embedded Fira
//! subsets (OpenType CFF), addressed by glyph ID with a ToUnicode map, as the site's PDFs are; a
//! character missing from a font falls back to Fira Sans, then Fira Math. Nothing reads a clock, so
//! equal figures give equal bytes.

use crate::draw::{Anchor, Item, Node, Seg, Shape, text_style};
use std::collections::BTreeMap;
use std::fmt::Write;

fn be(b: &[u8], o: usize, n: usize) -> usize { b.get(o..o + n).map_or(0, |s| s.iter().fold(0, |a, &x| a << 8 | x as usize)) }

/// An OpenType font: character map, advances, metrics (bbox, ascent, descent, units per em), glyphs used.
pub struct Font { data: &'static [u8], map: BTreeMap<u32, u16>, used: BTreeMap<u16, char>, hm: usize, nh: usize, m: [i16; 6], em: f64 }

impl Font {
    pub fn new(data: &'static [u8]) -> Font {
        let b = data;
        let t = |tag: &[u8]| (0..be(b, 4, 2)).map(|i| 12 + 16 * i).find(|&o| b.get(o..o + 4) == Some(tag)).map_or(0, |o| be(b, o + 8, 4));
        let (cm, hh, mut map) = (t(b"cmap"), t(b"hhea"), BTreeMap::new());
        for o in (0..be(b, cm + 2, 2)).map(|i| cm + be(b, cm + 8 + 8 * i, 4)) {
            if be(b, o, 2) == 12 {
                for q in (0..be(b, o + 12, 4)).map(|g| o + 16 + 12 * g) {
                    for c in be(b, q, 4)..=be(b, q + 4, 4) { map.insert(c as u32, (be(b, q + 8, 4) + c - be(b, q, 4)) as u16); }
                }
            } else if be(b, o, 2) == 4 {
                let n = be(b, o + 6, 2) / 2;
                for s in 0..n {
                    let f = |k: usize| be(b, o + 14 + 2 * s + k * 2 * n + 2 * (k > 0) as usize, 2);
                    for c in f(1)..=f(0).min(0xfffe) {
                        let g = if f(3) == 0 { c } else { be(b, o + 16 + 6 * n + 2 * s + f(3) + 2 * (c - f(1)), 2) };
                        map.entry(c as u32).or_insert(if f(3) != 0 && g == 0 { 0 } else { ((g + f(2)) & 0xffff) as u16 });
                    }
                }
            }
        }
        let hd = t(b"head");
        let m = [hd + 36, hd + 38, hd + 40, hd + 42, hh + 4, hh + 6].map(|o| be(b, o, 2) as u16 as i16);
        Font { hm: t(b"hmtx"), nh: be(b, hh + 34, 2).max(1), map, used: BTreeMap::new(), m, em: be(b, hd + 18, 2).max(1) as f64, data }
    }
    fn adv(&self, g: usize) -> usize { be(self.data, self.hm + 4 * g.min(self.nh - 1), 2) }
    pub fn has(&self, c: char) -> bool { self.map.contains_key(&(c as u32)) }
}

/// The three fonts: sans, mono, maths.
pub struct Fonts(pub [Font; 3]);

impl Fonts {
    /// Sans, mono and maths, as OpenType bytes.
    pub fn new(data: [&'static [u8]; 3]) -> Fonts { Fonts(data.map(Font::new)) }
    /// A run of text as pieces in the first font with each character (the style's, then sans, then
    /// maths): font, script (0 level, 1 superscript, 2 subscript), glyph IDs as hex, width in px; and
    /// the whole width. The subsets lack most script digits, so these are base digits, small and moved.
    pub fn run(&mut self, mono: bool, size: f64, spacing: f64, s: &str) -> (Vec<Piece>, f64) {
        let mut v: Vec<Piece> = vec![];
        let first = if mono { 1 } else { 0 };
        for c in s.chars() {
            let (c, script) = script(c);
            let i = [first, 0, 2].into_iter().find(|&k| self.0[k].has(c)).unwrap_or(first);
            let f = &mut self.0[i];
            let g = f.map.get(&(c as u32)).copied().unwrap_or(0);
            f.used.insert(g, c);
            let w = f.adv(g as usize) as f64 * size * SCRIPT[script].0 / f.em + spacing * size;
            match v.last_mut() {
                Some(p) if p.font == i && p.script == script => { let _ = write!(p.glyphs, "{g:04X}"); p.width += w }
                _ => v.push(Piece { font: i, script, glyphs: format!("{g:04X}"), width: w }),
            }
        }
        let w = v.iter().map(|p| p.width).sum();
        (v, w)
    }
}

pub struct Piece { pub font: usize, pub script: usize, pub glyphs: String, pub width: f64 }

/// Size and rise (in ems) of level text, superscripts and subscripts.
const SCRIPT: [(f64, f64); 3] = [(1.0, 0.0), (0.7, 0.4), (0.7, -0.15)];

fn script(c: char) -> (char, usize) {
    const SUP: &str = "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺";
    const SUB: &str = "₀₁₂₃₄₅₆₇₈₉₋₊";
    const BASE: [char; 12] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '−', '+'];
    if let Some(k) = SUP.chars().position(|x| x == c) { (BASE[k], 1) }
    else if let Some(k) = SUB.chars().position(|x| x == c) { (BASE[k], 2) }
    else if c == '‖' { ('|', 0) }
    else { (c, 0) }
}

fn rgb(c: u32) -> String { format!("{} {} {}", f((c >> 16) as f64 / 255.0), f(((c >> 8) & 255) as f64 / 255.0), f((c & 255) as f64 / 255.0)) }
fn f(x: f64) -> String { crate::draw::n(x) }
fn stream(dict: &str, data: &[u8]) -> Vec<u8> { [format!("<<{dict}/Length {}>>stream\n", data.len()).as_bytes(), data, b"\nendstream"].concat() }
fn utf16(s: &str) -> String { s.encode_utf16().map(|u| format!("{u:04X}")).collect() }

/// Classes drawn only on the page: grips, focus rings, the plot frame and the cursor.
const PAGE_ONLY: [&str; 4] = ["ring", "hit", "box", "cursor"];

struct Writer { fonts: Fonts, pal: BTreeMap<&'static str, u32>, out: String }

impl Writer {
    fn colour(&self, token: &str) -> u32 { self.pal.get(token).copied().unwrap_or(0) }
    fn path(&mut self, segs: &[Seg]) {
        for s in segs {
            match *s {
                Seg::M(x, y) => { let _ = write!(self.out, "{} {} m ", f(x), f(y)); }
                Seg::L(x, y) => { let _ = write!(self.out, "{} {} l ", f(x), f(y)); }
                Seg::C(a, b, c, d, x, y) => { let _ = write!(self.out, "{} {} {} {} {} {} c ", f(a), f(b), f(c), f(d), f(x), f(y)); }
                Seg::Z => self.out += "h ",
            }
        }
    }
    fn item(&mut self, i: &Item) {
        if i.class.split(' ').any(|c| PAGE_ONLY.contains(&c)) { return }
        if let Shape::Text { x, y, s, anchor } = &i.shape { return self.text(*x, *y, s, *anchor, i.class) }
        let p = i.paint;
        if p.fill.is_none() && p.stroke.is_none() { return }
        self.out += "q ";
        if let Some(o) = p.opacity { let _ = write!(self.out, "/A{} gs ", (o * 100.0).round() as u32); }
        if let Some(c) = p.fill { let _ = write!(self.out, "{} rg ", rgb(self.colour(c))); }
        if let Some((c, w)) = p.stroke { let _ = write!(self.out, "{} RG {} w ", rgb(self.colour(c)), f(w)); }
        if p.round { self.out += "1 j " }
        match &i.shape {
            Shape::Line(x1, y1, x2, y2) => self.path(&[Seg::M(*x1, *y1), Seg::L(*x2, *y2)]),
            Shape::Path(s) => self.path(s),
            Shape::Rect { x, y, w, h, rx } => {
                if *rx > 0.0 {
                    let (r, k) = (rx.min(w / 2.0).min(h / 2.0), 0.5522847498 * rx.min(w / 2.0).min(h / 2.0));
                    let (x1, y1) = (x + w, y + h);
                    self.path(&[Seg::M(x + r, *y), Seg::L(x1 - r, *y), Seg::C(x1 - r + k, *y, x1, y + r - k, x1, y + r), Seg::L(x1, y1 - r), Seg::C(x1, y1 - r + k, x1 - r + k, y1, x1 - r, y1),
                        Seg::L(x + r, y1), Seg::C(x + r - k, y1, *x, y1 - r + k, *x, y1 - r), Seg::L(*x, y + r), Seg::C(*x, y + r - k, x + r - k, *y, x + r, *y), Seg::Z]);
                } else { let _ = write!(self.out, "{} {} {} {} re ", f(*x), f(*y), f(*w), f(*h)); }
            }
            Shape::Circle(x, y, r) => {
                let k = 0.5522847498 * r;
                self.path(&[Seg::M(x + r, *y), Seg::C(x + r, y + k, x + k, y + r, *x, y + r), Seg::C(x - k, y + r, x - r, y + k, x - r, *y),
                    Seg::C(x - r, y - k, x - k, y - r, *x, y - r), Seg::C(x + k, y - r, x + r, y - k, x + r, *y), Seg::Z]);
            }
            Shape::Text { .. } => unreachable!(),
        }
        self.out += match (p.fill.is_some(), p.stroke.is_some()) { (true, true) => "B Q\n", (true, false) => "f Q\n", _ => "S Q\n" };
    }
    /// Text at its baseline; the page's CTM flips y, so each run's matrix flips it back.
    fn text(&mut self, x: f64, y: f64, s: &str, anchor: Anchor, class: &str) {
        let (mono, size, colour, spacing, halo) = text_style(class);
        let (runs, w) = self.fonts.run(mono, size, spacing, s);
        let start = match anchor { Anchor::Start => x, Anchor::Middle => x - w / 2.0, Anchor::End => x - w };
        let tc = spacing * size;
        let pass = |mode: &str, out: &mut String| {
            let mut at = start;
            out.push_str("BT ");
            out.push_str(mode);
            for p in &runs {
                let (k, rise) = SCRIPT[p.script];
                let _ = write!(out, "/F{} {} Tf {} Tc 1 0 0 -1 {} {} Tm <{}> Tj ", p.font, f(size * k), f(tc), f(at), f(y - rise * size), p.glyphs);
                at += p.width;
            }
            out.push_str("ET\n");
        };
        let mut out = std::mem::take(&mut self.out);
        out += "q ";
        if halo {
            let _ = write!(out, "{} RG 3 w 1 j ", rgb(self.colour("bg")));
            pass("1 Tr ", &mut out);
        }
        let _ = write!(out, "{} rg ", rgb(self.colour(colour)));
        pass("0 Tr ", &mut out);
        out += "Q\n";
        self.out = out;
    }
    fn nodes(&mut self, ns: &[Node]) {
        for n in ns {
            match n { Node::Item(i) => self.item(i), Node::Group(a, k) => if !PAGE_ONLY.iter().any(|c| a.contains(&format!("class=\"{c}\""))) { self.nodes(k) } }
        }
    }
}

fn opacities(ns: &[Node], out: &mut Vec<u32>) {
    for n in ns {
        match n {
            Node::Item(i) => if let Some(o) = i.paint.opacity { let k = (o * 100.0).round() as u32; if !out.contains(&k) { out.push(k) } },
            Node::Group(_, k) => opacities(k, out),
        }
    }
}

/// The figure (CSS px, 96 to the inch) as one PDF page of the same size in points.
pub fn pdf(list: &[Node], w: f64, h: f64, title: &str, fonts: [&'static [u8]; 3]) -> Vec<u8> {
    let pal = look::print_palette().into_iter().map(|(k, v)| (k, u32::from_str_radix(&v[1..], 16).unwrap())).collect();
    let mut wr = Writer { fonts: Fonts::new(fonts), pal, out: String::new() };
    let (pw, ph) = (w * 0.75, h * 0.75);
    let _ = write!(wr.out, "{} rg 0 0 {} {} re f\n0.75 0 0 -0.75 0 {} cm\n", rgb(wr.colour("bg")), f(pw), f(ph), f(ph));
    wr.nodes(list);
    let mut alphas = vec![];
    opacities(list, &mut alphas);
    let mut objs: Vec<Vec<u8>> = vec![vec![]; 4];
    let mut add = |b: Vec<u8>| { objs.push(b); objs.len() };
    let mut fonts = String::new();
    for (i, font) in wr.fonts.0.iter().enumerate() {
        if font.used.is_empty() { continue }
        let file = add(stream("/Subtype/OpenType", font.data));
        let [x0, y0, x1, y1, asc, desc] = font.m;
        let d = add(format!("<</Type/FontDescriptor/FontName/F{i}/Flags 4/FontBBox[{x0} {y0} {x1} {y1}]/ItalicAngle 0/Ascent {asc}/Descent {desc}/CapHeight {asc}/StemV 80/FontFile3 {file} 0 R>>").into());
        let scale = 1000.0 / font.em;
        let ws: Vec<String> = (0..font.nh).map(|g| f(font.adv(g) as f64 * scale)).collect();
        let cid = add(format!("<</Type/Font/Subtype/CIDFontType0/BaseFont/F{i}/CIDSystemInfo<</Registry(Adobe)/Ordering(Identity)/Supplement 0>>/FontDescriptor {d} 0 R/W[0[{}]]>>", ws.join(" ")).into());
        // ToUnicode: each glyph used back to its character, in blocks of at most 100.
        let map: Vec<String> = font.used.iter().filter(|u| *u.0 > 0).map(|(g, c)| format!("<{g:04X}><{}>", utf16(&c.to_string()))).collect();
        let cmap: String = map.chunks(100).map(|c| format!("{} beginbfchar\n{}\nendbfchar\n", c.len(), c.join("\n"))).collect();
        let cmap = format!("/CIDInit/ProcSet findresource begin 12 dict begin begincmap/CIDSystemInfo<</Registry(Adobe)/Ordering(UCS)/Supplement 0>>def\
            /CMapName/Adobe-Identity-UCS def/CMapType 2 def\n1 begincodespacerange <0000><FFFF> endcodespacerange\n{cmap}endcmap CMapName currentdict/CMap defineresource pop end end");
        let tu = add(stream("", cmap.as_bytes()));
        let _ = write!(fonts, "/F{i} {} 0 R", add(format!("<</Type/Font/Subtype/Type0/BaseFont/F{i}/Encoding/Identity-H/DescendantFonts[{cid} 0 R]/ToUnicode {tu} 0 R>>").into()));
    }
    let gs: String = alphas.iter().map(|a| format!("/A{a}<</ca {}>>", f(*a as f64 / 100.0))).collect();
    let content = add(stream("", wr.out.as_bytes()));
    let page = add(format!("<</Type/Page/Parent 2 0 R/MediaBox[0 0 {} {}]/Resources 4 0 R/Contents {content} 0 R>>", f(pw), f(ph)).into());
    objs[0] = b"<</Type/Catalog/Pages 2 0 R/Lang(en)>>".to_vec();
    objs[1] = format!("<</Type/Pages/Kids[{page} 0 R]/Count 1>>").into_bytes();
    objs[2] = format!("<</Title<FEFF{}>/Producer(beamdiag)>>", utf16(title)).into_bytes();
    objs[3] = format!("<</Font<<{fonts}>>/ExtGState<<{gs}>>>>").into_bytes();
    let (mut o, mut at) = (b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n".to_vec(), String::new());
    for (i, b) in objs.iter().enumerate() {
        let _ = write!(at, "{:010} 00000 n \n", o.len());
        o.extend([format!("{} 0 obj\n", i + 1).as_bytes(), b, b"\nendobj\n"].concat());
    }
    let (id, n) = (look::sha256(&o)[..32].to_string(), objs.len() + 1);
    let start = o.len();
    o.extend(format!("xref\n0 {n}\n0000000000 65535 f \n{at}trailer\n<</Size {n}/Root 1 0 R/Info 3 0 R/ID[<{id}><{id}>]>>\nstartxref\n{start}\n%%EOF\n").as_bytes());
    o
}
