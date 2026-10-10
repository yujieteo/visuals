//! The page: its state, the events the host sends (a click, a typed value, a drag) and the commands it
//! sends back (set this element's HTML, value or class; save a file; copy text). Rust owns every
//! number, word and drawing; the host in the page only moves events in and applies the commands.
//!
//! The state and the solver stay in SI (N, m, Pa). Values are converted only where they are typed or
//! shown, so changing the convention re-expresses what was entered and never changes the beam or its
//! results. The model and the solver measure x from the left end; the origin option only changes the
//! positions people type and read: from mid-span they run from −L/2 to +L/2, still positive to the right.

use crate::draw::{self, Item, Node, Shape as Draw};
use crate::engine::{
    InLoad, InSupport, Input, Kind, Load, ModelError, Q, SI, Shape, Solved, Support, UNITS, Units, at, from_units, indeterminacy, pw, section_properties, solve,
    to_units, units,
};
use crate::fmt::{from_origin, nf, residual, sci, short_nf, sig, span_ratio};
use crate::json::{self, Value, obj};
use crate::num::{js, prec};
use crate::{bdf, deck, hand, pdf, report, tex};
use look::esc;

pub const RAW: &str = include_str!("../raw.json");

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum LK { Point, Moment, Dist }

/// A load as the page edits it: the fields its kind does not use are ignored.
#[derive(Clone, Copy, Debug)]
pub struct Ld { pub kind: LK, pub x: f64, pub f: f64, pub c: f64, pub x1: f64, pub x2: f64, pub q1: f64, pub q2: f64 }

impl Ld {
    fn of(v: &Value) -> Ld {
        let kind = match v.s("kind") { "point" => LK::Point, "moment" => LK::Moment, _ => LK::Dist };
        Ld { kind, x: v.f("x"), f: v.f("F"), c: v.f("C"), x1: v.f("x1"), x2: v.f("x2"), q1: v.f("q1"), q2: v.f("q2") }
    }
    fn input(&self) -> InLoad {
        let kind = match self.kind { LK::Point => "point", LK::Moment => "moment", LK::Dist => "dist" };
        InLoad { kind: kind.into(), x: self.x, f: self.f, c: self.c, x1: self.x1, x2: self.x2, q1: self.q1, q2: self.q2 }
    }
    pub fn name(&self) -> &'static str { match self.kind { LK::Point => "Point force", LK::Moment => "Couple", LK::Dist => "Distributed load" } }
}

pub struct Preset { pub id: String, pub label: String, pub note: String, pub length: f64, pub supports: Vec<Support>, pub loads: Vec<Ld>, pub material: String, pub section: Shape }
pub struct Material { pub id: String, pub label: String, pub e: f64, pub nu: f64 }

/// raw.json: presets, materials, sections, and the method, conventions, NASTRAN notes and sources.
pub struct Data { pub raw: Value, pub presets: Vec<Preset>, pub materials: Vec<Material>, pub sections: Vec<(String, String)> }

fn kind_of(s: &str) -> Kind { if s == "fixed" { Kind::Fixed } else { Kind::Pin } }

impl Data {
    pub fn new() -> Data {
        let raw = json::parse(RAW).expect("raw.json");
        let list = |k: &str| raw.get(k).arr().unwrap_or(&[]).to_vec();
        let presets = list("presets").iter().map(|p| Preset {
            id: p.s("id").into(), label: p.s("label").into(), note: p.s("note").into(), length: p.f("length"),
            supports: p.get("supports").arr().unwrap_or(&[]).iter().map(|s| Support { kind: kind_of(s.s("kind")), x: s.f("x") }).collect(),
            loads: p.get("loads").arr().unwrap_or(&[]).iter().map(Ld::of).collect(), material: p.s("material").into(), section: json::shape(p.get("section")),
        }).collect();
        let materials = list("materials").iter().map(|m| Material { id: m.s("id").into(), label: m.s("label").into(), e: m.f("E"), nu: m.f("nu") }).collect();
        let sections = list("sections").iter().map(|s| (s.s("id").to_string(), s.s("label").to_string())).collect();
        Data { raw, presets, materials, sections }
    }
}

impl Default for Data { fn default() -> Data { Data::new() } }

/// Each shape's fields: key, label, quantity, note.
pub const SECTION_FIELDS: [(&str, &[(&str, &str, Q, &str)]); 4] = [
    ("rect", &[("b", "Width b", Q::Length, ""), ("h", "Depth h", Q::Length, "")]),
    ("circle", &[("d", "Diameter d", Q::Length, "")]),
    ("tube", &[("d", "Outside D", Q::Length, ""), ("t", "Wall t", Q::Length, "")]),
    ("custom", &[("A", "Area A", Q::Area, ""), ("I", "I, in plane", Q::Inertia, ""), ("c", "Fibre c", Q::Length, ", optional"), ("Iy", "Iy, out of plane", Q::Inertia, ""), ("J", "Torsion J", Q::Inertia, "")]),
];
const SECTION_DEFAULTS: [(&str, &[(&str, f64)]); 4] = [
    ("rect", &[("b", 0.1), ("h", 0.2)]), ("circle", &[("d", 0.15)]), ("tube", &[("d", 0.1683), ("t", 0.008)]),
    ("custom", &[("A", 5.0e-3), ("I", 8.0e-5), ("c", 0.15), ("Iy", 8.0e-5), ("J", 1.6e-4)]),
];
pub fn fields_of(shape: &str) -> &'static [(&'static str, &'static str, Q, &'static str)] { SECTION_FIELDS.iter().find(|f| f.0 == shape).map_or(&[], |f| f.1) }

fn dim<'a>(s: &'a mut Shape, k: &str) -> Option<&'a mut Option<f64>> {
    Some(match k { "b" => &mut s.b, "h" => &mut s.h, "d" => &mut s.d, "t" => &mut s.t, "A" => &mut s.a, "I" => &mut s.i, "Iy" => &mut s.iy, "J" => &mut s.j, "c" => &mut s.c, _ => return None })
}
pub fn dim_of(s: &Shape, k: &str) -> Option<f64> { dim(&mut s.clone(), k).and_then(|v| *v) }

/// What is being edited, in SI.
#[derive(Clone, Debug)]
pub struct St { pub preset: Option<String>, pub length: f64, pub divisions: f64, pub supports: Vec<Support>, pub loads: Vec<Ld>, pub mat: (String, f64, f64), pub section: Shape }

/// A solved beam and, once asked for, its hand calculations in one convention and origin.
pub struct Solution { hand: Option<(&'static str, bool, hand::Derivation<'static>)>, r: Box<Solved> }

impl Solution {
    fn new(r: Solved) -> Solution { Solution { hand: None, r: Box::new(r) } }
    pub fn r(&self) -> &Solved { &self.r }
    /// The derivation is cached: re-deriving a long beam at every cursor move would be slow.
    pub fn derivation(&mut self, u: &'static Units, mid: bool) -> &hand::Derivation<'static> {
        if !matches!(&self.hand, Some((id, m, _)) if *id == u.id && *m == mid) {
            self.hand = None;
            // SAFETY: the derivation borrows the boxed beam, which is never moved, changed or dropped while
            // the derivation lives: `r` is private and set only in `new`, and `hand` is dropped first.
            let r: &'static Solved = unsafe { &*(&*self.r as *const Solved) };
            self.hand = Some((u.id, mid, hand::derive(r, u, mid)));
        }
        &self.hand.as_ref().unwrap().2
    }
}

/// Where a support or load end sat when a length edit began: at an end (0 or 1), or at a shown position.
struct Attach { load: bool, i: usize, key: &'static str, end: Option<u8>, at: f64 }

/// The drawn figure's x scale: margins, width, and the length it spans.
#[derive(Clone, Copy)]
pub struct Layout { pub ml: f64, pub mr: f64, pub w: f64, pub l: f64 }

impl Layout {
    pub fn x(&self, x: f64) -> f64 { self.ml + (x / self.l) * (self.w - self.ml - self.mr) }
}

pub struct App {
    pub d: Data,
    pub st: St,
    pub u: &'static Units,
    pub mid: bool,
    /// The last valid length: positions are attached to it while the length field holds something else.
    pub attach: f64,
    pub sol: Option<Solution>,
    pub error: Option<ModelError>,
    pub cursor: Option<f64>,
    /// The handle being dragged ("s0", "l2").
    pub active: Option<String>,
    pub layout: Option<Layout>,
    pub width: f64,
    hand_stale: bool,
    pending: bool,
    deck_text: Option<String>,
    deck_open: bool,
    length_edit: Option<Vec<Attach>>,
    format: String,
    bdf_name: String,
    fonts: Option<[&'static [u8]; 3]>,
    font_css: String,
    out: Vec<Value>,
}

/// `+x.toPrecision(10)` for a field, "" for a value that is not a number.
pub fn tidy(x: f64) -> String { if x.is_finite() { js(prec(x, 10)) } else { String::new() } }
/// JavaScript's `Math.round`: halves round up.
pub fn js_round(x: f64) -> f64 { let f = x.floor(); if x - f >= 0.5 { f + 1.0 } else { f } }
/// JavaScript's `Number(s)` for a field's value: "" is 0.
fn number(s: &str) -> f64 { let t = s.trim(); if t.is_empty() { 0.0 } else { t.parse().unwrap_or(f64::NAN) } }
/// A number field: "" is NaN, as the page reads it.
fn field_number(s: &str) -> f64 { if s.is_empty() { f64::NAN } else { number(s) } }
/// Length of a run of characters that are not white space, in bytes.
fn word(s: &str) -> usize { s.find(char::is_whitespace).unwrap_or(s.len()) }

fn base64_decode(s: &str) -> Vec<u8> {
    let val = |c: u8| match c { b'A'..=b'Z' => c - b'A', b'a'..=b'z' => c - b'a' + 26, b'0'..=b'9' => c - b'0' + 52, b'+' => 62, _ => 63 };
    let b: Vec<u8> = s.bytes().filter(|c| c.is_ascii_alphanumeric() || *c == b'+' || *c == b'/').collect();
    b.chunks(4).flat_map(|c| {
        let n = c.iter().enumerate().fold(0u32, |n, (i, &x)| n | (val(x) as u32) << (18 - 6 * i));
        (0..c.len() - 1).map(move |i| (n >> (16 - 8 * i)) as u8)
    }).collect()
}

/// Break text into lines of at most n characters, at spaces.
pub fn wrap(s: &str, n: usize) -> Vec<String> {
    let len = |t: &str| t.encode_utf16().count();
    let (mut lines, mut line) = (vec![], String::new());
    for w in s.split(' ') {
        if !line.is_empty() && len(&line) + 1 + len(w) > n { lines.push(std::mem::replace(&mut line, w.into())) }
        else if line.is_empty() { line = w.into() } else { line = format!("{line} {w}") }
    }
    lines.push(line);
    lines
}

fn options(list: &[(String, String)], selected: &str) -> String {
    list.iter().map(|(v, l)| format!("<option value=\"{}\"{}>{}</option>", esc(v), if v == selected { " selected" } else { "" }, esc(l))).collect()
}

impl App {
    /// The page as it opens: the first example, solved, in N, mm, MPa from the left end.
    pub fn new() -> App {
        let d = Data::new();
        let st = Self::from_preset(&d, 0);
        let mut app = App {
            st, d, u: units(crate::engine::DEFAULT_UNITS).unwrap(), mid: false, attach: f64::NAN, sol: None, error: None, cursor: None, active: None, layout: None,
            width: 700.0, hand_stale: false, pending: false, deck_text: None, deck_open: false, length_edit: None, format: "png".into(), bdf_name: "beamdiag.bdf".into(),
            fonts: None, font_css: String::new(), out: vec![],
        };
        app.update(false);
        app.out.clear();
        app
    }

    fn from_preset(d: &Data, i: usize) -> St {
        let p = &d.presets[i];
        // Every preset names one of the materials.
        let m = d.materials.iter().find(|m| m.id == p.material).unwrap();
        St { preset: Some(p.id.clone()), length: p.length, divisions: 4.0, supports: p.supports.clone(), loads: p.loads.clone(), mat: (m.id.clone(), m.e, m.nu), section: p.section.clone() }
    }

    /* ---------- commands ---------- */

    fn cmd<const N: usize>(&mut self, fields: [(&str, Value); N]) { self.out.push(obj(fields)) }
    fn html(&mut self, sel: &str, v: String) { self.cmd([("html", sel.into()), ("v", v.into())]) }
    fn text(&mut self, sel: &str, v: impl Into<String>) { self.cmd([("text", sel.into()), ("v", Value::Str(v.into()))]) }
    fn value(&mut self, sel: &str, v: impl Into<String>) { self.cmd([("value", sel.into()), ("v", Value::Str(v.into()))]) }
    fn attr(&mut self, sel: &str, name: &str, v: Option<String>) { self.cmd([("attr", sel.into()), ("name", name.into()), ("v", v.into())]) }
    fn cls(&mut self, sel: &str, name: &str, on: bool) { self.cmd([("cls", sel.into()), ("name", name.into()), ("on", on.into())]) }
    fn save(&mut self, name: &str, mime: &str, data: String, b64: bool) { self.cmd([("save", name.into()), ("mime", mime.into()), ("data", data.into()), ("b64", b64.into())]) }
    fn copy(&mut self, text: String, tag: &str) { self.cmd([("copy", text.into()), ("tag", tag.into())]) }

    /* ---------- units and positions ---------- */

    pub fn show(&self, si: f64, q: Q) -> f64 { to_units(si, q, self.u) }
    pub fn sym(&self, q: Q) -> &'static str { self.u.symbol(q) }
    /// Typed lengths drop conversion noise (2300 mm is 2.3 m, not 2.3000000000000003 m).
    pub fn take(&self, v: f64, q: Q) -> f64 { let si = from_units(v, q, self.u); if q == Q::Length { prec(si, 15) } else { si } }
    pub fn offset(&self, l: f64) -> f64 { if self.mid { l / 2.0 } else { 0.0 } }
    pub fn shown(&self, x: f64, l: f64) -> f64 { from_origin(x, l, self.mid) }
    pub fn typed(&self, d: f64, l: f64) -> f64 { let o = self.offset(l); if o != 0.0 && !o.is_nan() { prec(d + o, 12) } else { d } }
    /// A beam position as it is typed and read, in the chosen origin and units.
    pub fn show_x(&self, x: f64, l: f64) -> f64 { self.show(self.shown(x, l), Q::Length) }
    /// A default in SI, rounded to one significant figure in the current convention (−10 kN is −2000 lbf).
    fn round1(&self, si: f64, q: Q) -> f64 { self.take(prec(self.show(si, q), 1), q) }
    /// A position in the current length unit, on the solved beam.
    pub fn at_text(&self, x: f64) -> String { format!("{} {}", sig(self.show_x(x, self.r().model.length), 4), self.sym(Q::Length)) }
    pub fn r(&self) -> &Solved { self.sol.as_ref().unwrap().r() }
    fn solved(&self) -> bool { self.sol.is_some() && self.error.is_none() }

    /// A typed position (or length) lands exactly on any other position on the beam within 1e-9·L of it:
    /// fields show 10 significant figures, so typing back a shown value must give the position it shows.
    fn take_x(&self, v: f64, me: Option<(bool, usize, &str)>) -> f64 {
        let length = me.is_none();
        let x = if length { self.take(v, Q::Length) } else { self.typed(self.take(v, Q::Length), self.attach) };
        let l = if length { x } else { self.st.length };
        let mut at = if length { vec![0.0] } else { vec![0.0, l] };
        for (i, s) in self.st.supports.iter().enumerate() { if me != Some((false, i, "x")) { at.push(s.x) } }
        for (i, ld) in self.st.loads.iter().enumerate() {
            let keys: &[&str] = if ld.kind == LK::Dist { &["x1", "x2"] } else { &["x"] };
            for &k in keys { if me != Some((true, i, k)) { at.push(match k { "x1" => ld.x1, "x2" => ld.x2, _ => ld.x }) } }
        }
        at.into_iter().find(|p| (p - x).abs() <= 1e-9 * l).unwrap_or(x)
    }

    /// The solver's messages quote left-end positions; restate them in the chosen convention.
    fn in_convention(&self, m: &str) -> String {
        let o = self.offset(self.attach);
        if o == 0.0 || o.is_nan() { return m.into() }
        let at = |n: &str| format!("{} {}", sig(self.show_x(from_units(number(n), Q::Length, self.u), self.attach), 6), self.sym(Q::Length));
        let mut m = m.to_string();
        // "between 0 and (\S+) \S+\.$"
        let pat = "between 0 and ";
        if let Some(i) = m.match_indices(pat).map(|(i, _)| i).find(|&i| {
            let rest = &m[i + pat.len()..];
            let a = word(rest);
            a > 0 && rest[a..].starts_with(' ') && { let b = &rest[a + 1..]; word(b) == b.len() && b.len() > 1 && b.ends_with('.') }
        }) {
            let rest = &m[i + pat.len()..];
            m = format!("{}between {} and {}.", &m[..i], at("0"), at(&rest[..word(rest)]));
        }
        // "position x = (\S+) \S+\."
        let pat = "position x = ";
        if let Some((i, a, end)) = m.match_indices(pat).map(|(i, _)| i).find_map(|i| {
            let rest = &m[i + pat.len()..];
            let a = word(rest);
            if a == 0 || !rest[a..].starts_with(' ') { return None }
            let b = &rest[a + 1..b_end(rest, a)];
            let dot = b.rfind('.').filter(|&k| k > 0)?;
            Some((i, a, i + pat.len() + a + 1 + dot + 1))
        }) {
            let x = m[i + pat.len()..i + pat.len() + a].to_string();
            m = format!("{}position x = {}.{}", &m[..i], at(&x), &m[end..]);
        }
        // "^Positions (\S+) \S+ and (\S+) \S+ are"
        if let Some(rest) = m.strip_prefix("Positions ") {
            let w: Vec<&str> = rest.splitn(6, ' ').collect();
            if w.len() == 6 && w[2] == "and" && w[5].starts_with("are") && w[..5].iter().all(|t| !t.is_empty() && word(t) == t.len()) {
                m = format!("Positions {} and {} {}", at(w[0]), at(w[3]), w[5]);
            }
        }
        m
    }

    /* ---------- the model ---------- */

    pub fn input(&self) -> Result<Input, ModelError> {
        let s = section_properties(&self.st.section)?;
        Ok(Input {
            length: self.st.length, e: self.st.mat.1, nu: self.st.mat.2, a: s.a, i: s.i, iy: Some(s.iy), j: Some(s.j), c: s.c, divisions: Some(self.st.divisions),
            supports: Some(self.st.supports.iter().map(|s| InSupport { kind: s.kind.name().into(), x: s.x }).collect()),
            loads: Some(self.st.loads.iter().map(Ld::input).collect()),
        })
    }

    /// Whether a solved beam's diagrams stay finite when converted to the current convention.
    fn showable(&self, r: &Solved) -> bool {
        let e = &r.extremes;
        [(e.v_shear.value, Q::Force), (e.m.value, Q::Moment), (e.v.value, Q::Length)].iter().all(|&(v, q)| self.show(v, q).is_finite())
    }

    fn update_soon(&mut self) {
        self.pending = true;
        self.deck_text = None;
        self.cmd([("later", 150.0.into())]);
    }
    /// Apply a re-solve still waiting on paused typing, so an export or a drag starts from what was typed.
    fn flush(&mut self) { if self.pending { self.update(true) } }

    pub fn update(&mut self, keep_form: bool) {
        self.pending = false;
        if self.st.length.is_finite() && self.st.length > 0.0 { self.attach = self.st.length }
        if !keep_form { self.build_form() }
        else if self.st.preset.is_some() { self.st.preset = None; self.value("#preset", ""); self.text("#preset-note", "") }
        self.error = None;
        let next = self.input().and_then(|i| solve(&i, self.u)).and_then(|r| if self.showable(&r) { Ok(r) } else {
            Err(ModelError { message: format!("The results are too large to show in {}; choose a convention with larger units.", self.u.label), field: None })
        });
        match next { Ok(r) => self.sol = Some(Solution::new(r)), Err(e) => self.error = Some(e) }
        // A beam solved in one convention can overflow when shown in another (10³⁰⁶ N·m is Infinity in N·mm).
        if self.sol.as_ref().is_some_and(|s| !self.showable(s.r())) { self.sol = None; self.layout = None }
        match self.error.clone() {
            Some(e) => {
                self.cmd([("hidden", "#error".into()), ("on", false.into())]);
                let m = format!("<b>Can't solve this beam: </b>{}", esc(&self.in_convention(&e.message)));
                self.html("#error", m);
                self.mark_invalid(e.field.as_deref());
                self.cls("#plots,#stats,#table", "stale", true);
            }
            None => {
                self.cmd([("hidden", "#error".into()), ("on", true.into())]);
                self.mark_invalid(None);
                self.cls("#plots,#stats,#table", "stale", false);
            }
        }
        self.reset_deck();
        if let Some(l) = self.sol.as_ref().map(|s| s.r().model.length) {
            if self.cursor.is_none_or(|c| c > l) { self.cursor = Some(l / 2.0) }
            self.render();
            if self.error.is_none() {
                let (s, r, t) = (self.stats_html(), self.reactions_html(), self.table_html());
                self.html("#stats", s);
                self.html("#reactions", r);
                self.html("#table", t);
            }
        }
        // Re-deriving a long beam on every drag step is wasted work: the view catches up when the drag ends.
        if self.active.is_some() && self.error.is_none() { self.hand_stale = true } else { self.render_hand() }
        let s = self.section_summary();
        self.text("#section-derived", s);
    }

    fn mark_invalid(&mut self, field: Option<&str>) {
        self.attr("[data-field]", "aria-invalid", None);
        let sel = match field {
            None => return,
            Some("supports") => "[data-field=\"supports\"],[data-field^=\"supports.\"][data-field$=\".x\"]".to_string(),
            Some("loads") => ["x", "x1", "x2"].map(|k| format!("[data-field^=\"loads.\"][data-field$=\".{k}\"]")).join(",") + ",[data-field=\"loads\"]",
            Some(f) => format!("[data-field=\"{f}\"]"),
        };
        self.attr(&sel, "aria-invalid", Some("true".into()));
    }

    /* ---------- the editor ---------- */

    fn num_input(&self, label: &str, value: f64, field: &str) -> String {
        format!("<label class=\"f\"><span>{}</span><input type=\"number\" step=\"any\" value=\"{}\" data-field=\"{field}\"></label>", esc(label), tidy(value))
    }
    fn remove_button(label: &str, act: &str, i: usize) -> String {
        format!("<button type=\"button\" class=\"btn icon\" aria-label=\"{}\" data-act=\"{act}\" data-arg=\"{i}\">×</button>", esc(label))
    }

    pub fn supports_html(&self) -> String {
        let (l, len) = (self.attach, self.sym(Q::Length));
        self.st.supports.iter().enumerate().map(|(i, s)| {
            let kinds = options(&[("pin".into(), "Pin".into()), ("fixed".into(), "Fixed".into())], s.kind.name());
            format!("<li class=\"item\"><div class=\"fields\"><label class=\"f\"><span>Support {}</span><select data-field=\"supports.{i}.kind\">{kinds}</select></label>{}</div>{}</li>",
                i + 1, self.num_input(&format!("x ({len})"), self.show_x(s.x, l), &format!("supports.{i}.x")), Self::remove_button(&format!("Remove support {}", i + 1), "remove-support", i))
        }).collect()
    }

    pub fn loads_html(&self) -> String {
        if self.st.loads.is_empty() { return "<li class=\"note\">No loads yet.</li>".into() }
        let l = self.attach;
        let (len, force, moment, q) = (self.sym(Q::Length), self.sym(Q::Force), self.sym(Q::Moment), self.sym(Q::Distributed));
        self.st.loads.iter().enumerate().map(|(i, ld)| {
            let f = |k: &str| format!("loads.{i}.{k}");
            let fields = match ld.kind {
                LK::Point => self.num_input(&format!("x ({len})"), self.show_x(ld.x, l), &f("x")) + &self.num_input(&format!("F ({force})"), self.show(ld.f, Q::Force), &f("F")),
                LK::Moment => self.num_input(&format!("x ({len})"), self.show_x(ld.x, l), &f("x")) + &self.num_input(&format!("C ({moment})"), self.show(ld.c, Q::Moment), &f("C")),
                LK::Dist => [("from x₁", ld.x1, "x1", true), ("to x₂", ld.x2, "x2", true), ("q₁", ld.q1, "q1", false), ("q₂", ld.q2, "q2", false)].iter()
                    .map(|&(label, v, k, pos)| if pos { self.num_input(&format!("{label} ({len})"), self.show_x(v, l), &f(k)) } else { self.num_input(&format!("{label} ({q})"), self.show(v, Q::Distributed), &f(k)) })
                    .collect(),
            };
            format!("<li class=\"item\"><div class=\"fields\"><span class=\"tag\">{}. {}</span>{fields}</div>{}</li>", i + 1, ld.name(), Self::remove_button(&format!("Remove load {}, {}", i + 1, ld.name()), "remove-load", i))
        }).collect()
    }

    pub fn section_fields_html(&self) -> String {
        fields_of(&self.st.section.shape).chunks(2).map(|row| {
            let cells: String = row.iter().map(|&(k, label, q, note)| {
                let v = dim_of(&self.st.section, k).map_or(f64::NAN, |v| self.show(v, q));
                self.num_input(&format!("{label} ({}{note})", self.sym(q)), v, &format!("section.{k}"))
            }).collect();
            format!("<div class=\"row\">{cells}</div>")
        }).collect()
    }

    pub fn material_options(&self) -> String {
        let mut list: Vec<(String, String)> = self.d.materials.iter().map(|m| (m.id.clone(), format!("{} (E {} {})", m.label, sig(self.show(m.e, Q::Stress), 4), self.sym(Q::Stress)))).collect();
        list.push(("custom".into(), "Custom".into()));
        options(&list, &self.st.mat.0)
    }
    pub fn preset_options(&self) -> String {
        let mut list = vec![(String::new(), "Custom".to_string())];
        list.extend(self.d.presets.iter().map(|p| (p.id.clone(), p.label.clone())));
        options(&list, self.st.preset.as_deref().unwrap_or(""))
    }
    pub fn unit_options(&self) -> String { options(&UNITS.iter().map(|u| (u.id.to_string(), u.label.to_string())).collect::<Vec<_>>(), self.u.id) }
    pub fn shape_options(&self) -> String { options(&self.d.sections, &self.st.section.shape) }
    pub fn preset_note(&self) -> String { self.d.presets.iter().find(|p| Some(&p.id) == self.st.preset.as_ref()).map_or(String::new(), |p| p.note.clone()) }

    fn build_form(&mut self) {
        let u = self.u;
        self.value("#units", u.id);
        for q in [Q::Length, Q::Force, Q::Stress, Q::Moment, Q::Distributed, Q::Area, Q::Inertia, Q::Rigidity, Q::Angle] {
            self.text(&format!("[data-unit=\"{}\"]", q.name()), u.symbol(q));
        }
        self.text("[data-unit=\"system\"]", u.label);
        let (len, div) = (tidy(self.show(self.st.length, Q::Length)), js(self.st.divisions));
        self.value("#length", len);
        self.value("#divisions", div);
        self.value("#origin", if self.mid { "mid" } else { "left" });
        let (s, l, f, m) = (self.supports_html(), self.loads_html(), self.section_fields_html(), self.material_options());
        self.html("#supports", s);
        self.html("#loads", l);
        let shape = self.st.section.shape.clone();
        self.value("#shape", shape);
        self.html("#section-fields", f);
        self.html("#material", m);
        let (id, e, nu) = (self.st.mat.0.clone(), tidy(self.show(self.st.mat.1, Q::Stress)), tidy(self.st.mat.2));
        self.value("#material", id);
        self.value("#E", e);
        self.value("#nu", nu);
        let (p, note) = (self.st.preset.clone().unwrap_or_default(), self.preset_note());
        self.value("#preset", p);
        self.text("#preset-note", note);
    }

    /// A, I, c and EI of the current section, or "" while it is invalid.
    pub fn section_summary(&self) -> String {
        let Ok(s) = section_properties(&self.st.section) else { return String::new() };
        let ei = self.st.mat.1 * s.i;
        let mut t = format!("A = {} {} · I = {} {}", sci(self.show(s.a, Q::Area)), self.sym(Q::Area), sci(self.show(s.i, Q::Inertia)), self.sym(Q::Inertia));
        if let Some(c) = s.c.filter(|c| *c != 0.0 && !c.is_nan()) { t += &format!(" · c = {} {}", sig(self.show(c, Q::Length), 4), self.sym(Q::Length)) }
        if ei.is_finite() { t += &format!(" · EI = {} {}", sci(self.show(ei, Q::Rigidity)), self.sym(Q::Rigidity)) }
        t
    }

    /* ---------- events ---------- */

    /// One event from the host, as JSON; the commands for it, as a JSON array.
    pub fn handle(&mut self, text: &str) -> String {
        self.out.clear();
        if let Ok(e) = json::parse(text) {
            match e.s("ev") {
                "start" => {
                    self.width = e.f("w");
                    if let Some(f) = e.get("fonts").arr().filter(|f| f.len() == 3 && f.iter().all(|x| x.str().is_some_and(|s| !s.is_empty()))) {
                        let names = ["Fira Sans", "Fira Mono", "Fira Math"];
                        self.font_css = f.iter().zip(names).map(|(b, n)| format!("@font-face{{font-family:\"{n}\";src:url(data:font/otf;base64,{}) format(\"opentype\")}}", b.str().unwrap())).collect();
                        self.fonts = Some([0, 1, 2].map(|i| &*Box::leak(base64_decode(f[i].str().unwrap()).into_boxed_slice())));
                    }
                    self.update(false);
                }
                "input" => self.on_input(e.s("field"), e.s("value")),
                "change" => self.on_change(e.s("field"), e.s("value")),
                "done" => if e.s("field") == "length" { self.length_edit = None },
                "click" => self.on_click(e.s("act"), e.s("arg")),
                "toggle" => {
                    self.deck_open = e.get("open") == &Value::Bool(true);
                    if self.deck_open { let t = self.deck(); self.text("#deck", t) }
                }
                "down" => if self.layout.is_some() {
                    let k = e.s("key").to_string();
                    self.cls(&format!("[data-key=\"{k}\"]"), "active", true);
                    self.active = Some(k);
                },
                "move" => self.on_move(e.f("frac")),
                "up" => {
                    if let Some(k) = self.active.take() { self.cls(&format!("[data-key=\"{k}\"]"), "active", false) }
                    if self.hand_stale { self.render_hand() }
                }
                "key" => self.on_key(e.s("key"), e.get("shift") == &Value::Bool(true), e.s("target")),
                "width" => {
                    let w = e.f("w");
                    if w > 0.0 && w != self.width { self.width = w; if self.sol.is_some() { self.render() } }
                }
                "timer" => self.flush(),
                "result" => self.on_result(e.s("tag"), e.get("ok") == &Value::Bool(true), e.s("msg")),
                "tools" => { let t = tools(); self.cmd([("reply", t)]) }
                "tool" => { let r = self.tool(e.s("name"), e.get("input")); self.cmd([("reply", r)]) }
                _ => {}
            }
        }
        json::stringify(&Value::Arr(std::mem::take(&mut self.out)))
    }

    fn on_input(&mut self, field: &str, value: &str) {
        let v = field_number(value);
        let parts: Vec<&str> = field.split('.').collect();
        match parts.as_slice() {
            ["length"] => return self.edit_length(v),
            ["divisions"] => self.st.divisions = number(value),
            ["bdfname"] => return self.bdf_name = value.into(),
            ["supports", i, "x"] => {
                let Ok(i) = i.parse::<usize>() else { return };
                let x = self.take_x(v, Some((false, i, "x")));
                let Some(s) = self.st.supports.get_mut(i) else { return };
                s.x = x;
            }
            ["loads", i, k] => {
                let Ok(i) = i.parse::<usize>() else { return };
                let x = match *k { "x" | "x1" | "x2" => self.take_x(v, Some((true, i, k))), "F" => self.take(v, Q::Force), "C" => self.take(v, Q::Moment), _ => self.take(v, Q::Distributed) };
                let Some(l) = self.st.loads.get_mut(i) else { return };
                match *k { "x" => l.x = x, "x1" => l.x1 = x, "x2" => l.x2 = x, "F" => l.f = x, "C" => l.c = x, "q1" => l.q1 = x, "q2" => l.q2 = x, _ => return }
            }
            ["section", k] => {
                let Some(q) = fields_of(&self.st.section.shape).iter().find(|f| f.0 == *k).map(|f| f.2) else { return };
                let x = if *k == "c" && v.is_nan() { None } else { Some(self.take(v, q)) };
                if let Some(slot) = dim(&mut self.st.section, k) { *slot = x }
            }
            ["material", k @ ("E" | "nu")] => {
                if *k == "E" { self.st.mat.1 = if value.is_empty() { f64::NAN } else { self.take(v, Q::Stress) } } else { self.st.mat.2 = v }
                // E typed in psi only matches a preset to rounding, so presets are recognised within 1e-9.
                let (e, nu) = (self.st.mat.1, self.st.mat.2);
                let id = self.d.materials.iter().find(|m| (m.e - e).abs() <= 1e-9 * m.e && m.nu == nu).map_or("custom".to_string(), |m| m.id.clone());
                self.value("#material", id.clone());
                self.st.mat.0 = id;
            }
            _ => return,
        }
        self.update_soon();
    }

    /// Keep supports and loads at either end attached to it. Measured from mid-span, everything else
    /// keeps the position it was given, so it moves with the middle of the beam.
    fn edit_length(&mut self, v: f64) {
        let v = if v.is_nan() { v } else { self.take_x(v, None) };
        if self.length_edit.is_none() {
            let l = self.attach;
            let mut items = vec![];
            let mut add = |load: bool, i: usize, key: &'static str, x: f64| items.push(Attach { load, i, key, end: if x == 0.0 { Some(0) } else if x == l { Some(1) } else { None }, at: self.shown(x, l) });
            for (i, s) in self.st.supports.iter().enumerate() { add(false, i, "x", s.x) }
            for (i, ld) in self.st.loads.iter().enumerate() {
                if ld.kind == LK::Dist { add(true, i, "x1", ld.x1); add(true, i, "x2", ld.x2) } else { add(true, i, "x", ld.x) }
            }
            self.length_edit = Some(items);
        }
        self.st.length = v;
        if v.is_finite() && v > 0.0 {
            self.attach = v;
            let off = self.offset(v);
            let items = self.length_edit.take().unwrap();
            for a in &items {
                let x = match a.end { Some(0) => 0.0, Some(_) => v, None => self.typed(a.at, v) };
                let slot = if a.load {
                    self.st.loads.get_mut(a.i).map(|l| match a.key { "x1" => &mut l.x1, "x2" => &mut l.x2, _ => &mut l.x })
                } else { self.st.supports.get_mut(a.i).map(|s| &mut s.x) };
                let Some(slot) = slot else { continue };
                if x == *slot && off == 0.0 { continue }
                *slot = x;
                // From mid-span a left-end entry keeps its place on the beam but reads differently, so refresh it too.
                let shown = tidy(self.show_x(x, self.attach));
                self.value(&format!("[data-field=\"{}.{}.{}\"]", if a.load { "loads" } else { "supports" }, a.i, a.key), shown);
            }
            self.length_edit = Some(items);
        }
        self.update_soon();
    }

    fn on_change(&mut self, field: &str, value: &str) {
        match field {
            "preset" => if let Some(i) = self.d.presets.iter().position(|p| p.id == value) { self.st = Self::from_preset(&self.d, i); self.cursor = None; self.update(false) },
            "units" => {
                self.flush();
                if let Some(u) = units(value) { self.u = u }
                self.update(false);
            }
            "origin" => { self.flush(); self.mid = value == "mid"; self.update(false) }
            "section.shape" => {
                let mut s = Shape { shape: value.into(), ..Default::default() };
                for &(k, v) in SECTION_DEFAULTS.iter().find(|d| d.0 == value).map_or(&[][..], |d| d.1) { if let Some(slot) = dim(&mut s, k) { *slot = Some(v) } }
                self.st.section = s;
                self.st.preset = None;
                self.update(false);
            }
            "material" => {
                match self.d.materials.iter().find(|m| m.id == value) { Some(m) => self.st.mat = (m.id.clone(), m.e, m.nu), None => self.st.mat.0 = "custom".into() }
                self.st.preset = None;
                self.update(false);
            }
            "format" => self.format = value.into(),
            f => if let Some(i) = f.strip_prefix("supports.").and_then(|r| r.strip_suffix(".kind")).and_then(|i| i.parse::<usize>().ok()) {
                if let Some(s) = self.st.supports.get_mut(i) { s.kind = kind_of(value) }
                self.update(true);
            },
        }
    }

    fn on_click(&mut self, act: &str, arg: &str) {
        let l = self.st.length;
        match act {
            "ends" => {
                let (left, right) = arg.split_once(',').unwrap_or((arg, ""));
                let mut s = vec![Support { kind: kind_of(left), x: 0.0 }];
                s.extend(self.st.supports.iter().filter(|s| s.x > 0.0 && s.x < l));
                if !right.is_empty() { s.push(Support { kind: kind_of(right), x: l }) }
                self.st.supports = s;
                self.st.preset = None;
                self.update(false);
            }
            "add-support" => {
                // Try the usual spots first, then the middle of the widest gap between supports and ends.
                let taken: Vec<f64> = self.st.supports.iter().map(|s| s.x).collect();
                let has = |v: f64| taken.iter().any(|t| *t == v);
                let x = [l / 2.0, l / 4.0, 3.0 * l / 4.0, l, 0.0].into_iter().find(|v| !has(*v)).unwrap_or_else(|| {
                    let mut xs = vec![0.0, l];
                    xs.extend(&taken);
                    xs.sort_by(f64::total_cmp);
                    xs.dedup();
                    let mut best = 0;
                    for i in 1..xs.len() { if xs[i] - xs[i - 1] > xs[best + 1] - xs[best] { best = i - 1 } }
                    (xs[best] + xs[best + 1]) / 2.0
                });
                self.st.supports.push(Support { kind: Kind::Pin, x: prec(x, 10) });
                self.st.preset = None;
                self.update(false);
                self.cmd([("focus", "#supports li:last-child input".into())]);
            }
            "add" => {
                let q = self.round1(-5e3, Q::Distributed);
                let n = f64::NAN;
                let ld = match arg {
                    "point" => Ld { kind: LK::Point, x: prec(l / 2.0, 10), f: self.round1(-10e3, Q::Force), c: n, x1: n, x2: n, q1: n, q2: n },
                    "moment" => Ld { kind: LK::Moment, x: prec(l / 2.0, 10), c: self.round1(10e3, Q::Moment), f: n, x1: n, x2: n, q1: n, q2: n },
                    _ => Ld { kind: LK::Dist, x1: 0.0, x2: l, q1: q, q2: q, x: n, f: n, c: n },
                };
                self.st.loads.push(ld);
                self.st.preset = None;
                self.update(false);
                self.cmd([("focus", "#loads .item:last-child input".into())]);
            }
            "remove-support" | "remove-load" => {
                let Ok(i) = arg.parse::<usize>() else { return };
                if act == "remove-support" { if i < self.st.supports.len() { self.st.supports.remove(i); } } else if i < self.st.loads.len() { self.st.loads.remove(i); }
                self.st.preset = None;
                self.update(false);
            }
            "save-image" => { let k = if self.format == "svg" { "svg" } else { "png" }; self.save_figure(k) }
            "save-pdf" => self.save_figure("pdf"),
            "save-beamdswitch" | "copy-beamdswitch" => {
                let copy = act == "copy-beamdswitch";
                self.flush();
                if !self.solved() { return self.text("#figure-status", format!("Fix the beam first: there is no solution to {}.", if copy { "copy" } else { "save" })) }
                match (self.report_deck(), copy) {
                    (Ok(t), true) => self.copy(t, "deck"),
                    (Err(_), true) => self.text("#figure-status", "Could not copy the beamdswitch deck: the clipboard is blocked here."),
                    (Ok(t), false) => {
                        let name = "beamdiag-beamdswitch.md";
                        self.save(name, "text/markdown", t, false);
                        self.text("#figure-status", format!("Saved {name}: open it in beamdswitch."));
                    }
                    (Err(e), false) => self.text("#figure-status", format!("Could not save: {e}. Use Copy deck instead.")),
                }
            }
            "save-hand" | "copy-hand" => {
                let copy = act == "copy-hand";
                self.flush();
                if !self.solved() { return self.text("#hand-status", format!("Fix the beam first: there is no solution to {}.", if copy { "copy" } else { "save" })) }
                let t = self.hand_markdown();
                if copy { self.copy(t, "hand") } else {
                    let name = "beamdiag-hand-calculations.md";
                    self.save(name, "text/markdown", t, false);
                    self.text("#hand-status", format!("Saved {name}."));
                }
            }
            "download" => {
                let t = self.deck();
                if t.is_empty() { return }
                let typed = if self.bdf_name.is_empty() { "beamdiag.bdf" } else { &self.bdf_name };
                let mut name: String = typed.chars().map(|c| if c.is_ascii_alphanumeric() || "._-".contains(c) { c.to_string() } else { "_".repeat(c.len_utf16()) }).collect();
                if !name.to_ascii_lowercase().ends_with(".bdf") { name += ".bdf" }
                self.save(&name, "text/plain", t, false);
                self.text("#export-status", format!("Saved {name}."));
            }
            "copy" => { let t = self.deck(); if !t.is_empty() { self.copy(t, "bdf") } }
            _ => {}
        }
    }

    fn on_result(&mut self, tag: &str, ok: bool, msg: &str) {
        match (tag, ok) {
            ("deck", true) => self.text("#figure-status", "Copied the beamdswitch deck: paste it into beamdswitch."),
            ("deck", false) => self.text("#figure-status", "Could not copy the beamdswitch deck: the clipboard is blocked here."),
            ("hand", true) => self.text("#hand-status", "Copied the hand calculations as Markdown."),
            ("hand", false) => self.text("#hand-status", "Could not copy the hand calculations: the clipboard is blocked here."),
            ("bdf", true) => self.text("#export-status", "Deck copied."),
            ("bdf", false) => {
                self.cmd([("open", "#deck-details".into()), ("on", true.into())]);
                self.text("#export-status", "Copy is blocked here; the deck is shown below.");
            }
            ("png", true) => self.text("#figure-status", "Saved beamdiag.png."),
            ("png", false) => self.text("#figure-status", format!("Could not save: {msg}.")),
            _ => {}
        }
    }

    /* ---------- moving supports, loads and the cursor ---------- */

    /// Steps and snapping work in the current length unit, so a dragged support lands on 24 in, not 0.6 m.
    fn step_for(&self, l: f64) -> f64 {
        let raw = self.show(l, Q::Length) / 100.0;
        let p = pw(10.0, raw.log10().floor() as i32);
        // 10·p is at least raw, so a step is always found.
        [1.0, 2.0, 5.0, 10.0].iter().map(|m| m * p).find(|s| *s >= raw).map_or(f64::NAN, |s| self.take(s, Q::Length))
    }
    fn snap(&self, x: f64, step: f64) -> f64 { let s = self.show(step, Q::Length); self.take(prec(js_round(self.show(x, Q::Length) / s) * s, 12), Q::Length) }
    /// Snap a beam position to the step as it reads in the chosen origin.
    fn snap_shown(&self, x: f64, step: f64) -> f64 { self.typed(self.snap(self.shown(x, self.attach), step), self.attach) }

    fn handle_x(&mut self, key: &str) -> Option<&mut f64> {
        let i: usize = key.get(1..)?.parse().ok()?;
        if key.starts_with('s') { self.st.supports.get_mut(i).map(|s| &mut s.x) } else { self.st.loads.get_mut(i).filter(|l| l.kind != LK::Dist).map(|l| &mut l.x) }
    }

    fn move_handle(&mut self, key: &str, x: f64) {
        let l = self.st.length;
        let x = l.min(0f64.max(x));
        let Some(slot) = self.handle_x(key) else { return };
        *slot = x;
        let field = format!("[data-field=\"{}.{}.x\"]", if key.starts_with('s') { "supports" } else { "loads" }, &key[1..]);
        let shown = tidy(self.show_x(x, self.attach));
        self.value(&field, shown);
        self.update(true);
    }

    fn on_move(&mut self, frac: f64) {
        let Some(lay) = self.layout else { return };
        let x = ((frac * lay.w - lay.ml) / (lay.w - lay.ml - lay.mr)) * lay.l;
        if let Some(k) = self.active.clone() {
            self.move_handle(&k, self.snap_shown(x, self.step_for(self.st.length)));
        } else {
            let x = self.snap_event(x, 6.0);
            self.set_cursor(x);
        }
    }

    fn on_key(&mut self, key: &str, shift: bool, target: &str) {
        let l = self.st.length;
        let step = self.step_for(l) / if shift { 10.0 } else { 1.0 };
        if target != "plot" {
            let Some(cur) = self.handle_x(target).map(|x| *x) else { return };
            let next = match key { "ArrowLeft" | "ArrowDown" => cur - step, "ArrowRight" | "ArrowUp" => cur + step, "Home" => 0.0, "End" => l, _ => return };
            self.cmd([("prevent", true.into())]);
            let x = if key == "Home" || key == "End" { next } else { self.snap_shown(next, step) };
            return self.move_handle(target, x);
        }
        let (Some(sol), Some(c)) = (&self.sol, self.cursor) else { return };
        let len = sol.r().model.length;
        let evs: Vec<f64> = self.events().into_iter().map(|e| e.0).collect();
        let next = match key {
            "ArrowLeft" | "ArrowDown" => self.snap_shown(c - step, step),
            "ArrowRight" | "ArrowUp" => self.snap_shown(c + step, step),
            "Home" => 0.0,
            "End" => len,
            "PageDown" => evs.iter().copied().find(|x| *x > c + 1e-12).unwrap_or(len),
            "PageUp" => evs.iter().rev().copied().find(|x| *x < c - 1e-12).unwrap_or(0.0),
            _ => return,
        };
        self.cmd([("prevent", true.into())]);
        self.set_cursor(next);
    }

    /// Supports, loads and the ends, left to right, with what is at each.
    pub fn events(&self) -> Vec<(f64, Vec<String>)> {
        let m = &self.r().model;
        let mut map: Vec<(f64, Vec<String>)> = vec![];
        let mut add = |x: f64, what: String| match map.iter_mut().find(|e| e.0 == x) {
            Some(e) => if !e.1.contains(&what) { e.1.push(what) },
            None => map.push((x, vec![what])),
        };
        add(0.0, "left end".into());
        add(m.length, "right end".into());
        for s in &m.supports { add(s.x, if s.kind == Kind::Pin { "pin support" } else { "fixed support" }.into()) }
        for l in &m.loads {
            match *l {
                Load::Point { x, f } => add(x, format!("{} {} force", sig(self.show(f, Q::Force), 3), self.sym(Q::Force))),
                Load::Moment { x, c } => add(x, format!("{} {} couple", sig(self.show(c, Q::Moment), 3), self.sym(Q::Moment))),
                Load::Dist { x1, x2, .. } => { add(x1, "distributed load starts".into()); add(x2, "distributed load ends".into()) }
            }
        }
        map.sort_by(|a, b| a.0.total_cmp(&b.0));
        map
    }

    fn snap_event(&self, x: f64, px: f64) -> f64 {
        let Some(lay) = self.layout else { return x };
        let (mut best, mut dist) = (x, f64::INFINITY);
        for (e, _) in self.events() { let d = (lay.x(e) - lay.x(x)).abs(); if d < dist { dist = d; best = e } }
        if dist <= px { best } else { x }
    }

    /// Round-off far below the largest value of the same quantity on this beam reads as zero.
    fn clean(&self, value: f64, key: &str) -> f64 {
        let r = self.r();
        let e = &r.extremes;
        let scale = match key { "V" => e.v_shear.value.abs(), "M" => e.m.value.abs(), "v" => e.v.value.abs(), _ => e.v.value.abs() / r.model.length };
        if value.abs() <= 1e-10 * scale { 0.0 } else { value }
    }

    /// The readout at the cursor: x, V, M, v and θ, with a jump shown as "left → right".
    pub fn readout(&self, c: f64) -> Vec<(&'static str, String)> {
        let r = self.r();
        let l = r.model.length;
        let a = at(r, c);
        let jump = |p: f64, q: f64| (p - q).abs() > 1e-9 * (p.abs() + q.abs() + 1.0);
        let (jv, jm) = (jump(a.v_left, a.v_right), jump(a.m_left, a.m_right));
        let v = if c <= 0.0 { a.v_right } else if c >= l { a.v_left } else { a.v_right };
        let m = if c <= 0.0 { a.m_right } else if c >= l { a.m_left } else { a.m_right };
        let f = |v: f64, key: &str, q: Q| short_nf(self.show(self.clean(v, key), q), 3);
        vec![
            ("x", format!("{} {}", short_nf(self.show_x(c, l), 3), self.sym(Q::Length))),
            ("V", format!("{} {}", if jv { format!("{} → {}", f(a.v_left, "V", Q::Force), f(a.v_right, "V", Q::Force)) } else { f(v, "V", Q::Force) }, self.sym(Q::Force))),
            ("M", format!("{} {}", if jm { format!("{} → {}", f(a.m_left, "M", Q::Moment), f(a.m_right, "M", Q::Moment)) } else { f(m, "M", Q::Moment) }, self.sym(Q::Moment))),
            ("v", format!("{} {}", f(a.v, "v", Q::Length), self.sym(Q::Length))),
            ("θ", format!("{} {}", f(a.theta, "theta", Q::Angle), self.sym(Q::Angle))),
        ]
    }
    pub fn readout_html(&self) -> String {
        let Some(c) = self.cursor.filter(|_| self.sol.is_some()) else { return String::new() };
        self.readout(c).iter().map(|(k, v)| format!("<span><span class=\"k\">{k} </span><b>{}</b></span>", esc(v))).collect()
    }

    fn set_cursor(&mut self, x: f64) {
        let (Some(sol), Some(lay)) = (&self.sol, self.layout) else { return };
        let l = sol.r().model.length;
        let c = l.min(0f64.max(x));
        self.cursor = Some(c);
        let px = draw::n(lay.x(c));
        self.attr("#plots .cursor", "x1", Some(px.clone()));
        self.attr("#plots .cursor", "x2", Some(px));
        let h = self.readout_html();
        self.html("#readout", h);
        let (now, text) = (tidy(self.show_x(c, l)), self.readout(c).iter().map(|(k, v)| format!("{k} {v}")).collect::<Vec<_>>().join(", "));
        self.attr("#plotarea", "aria-valuenow", Some(now));
        self.attr("#plotarea", "aria-valuetext", Some(text));
        if self.active.is_none() { self.render_hand_point() }
    }

    fn render(&mut self) {
        let w = if self.width > 0.0 { self.width } else { 700.0 }.max(300.0);
        let s = self.figure_svg(w);
        self.html("#plots", s);
        if let Some(c) = self.cursor { self.set_cursor(c) }
    }

    /// The page's figure at width w, as SVG; it sets the layout the pointer is read against.
    pub fn figure_svg(&mut self, w: f64) -> String {
        let f = self.figure(w, true);
        self.layout = Some(Layout { ml: f.ml, mr: f.mr, w: f.w, l: f.l });
        draw::svg(&f.list, f.w, f.h, " role=\"group\" aria-label=\"Beam, shear force, bending moment and deflection diagrams\"", "")
    }

    /* ---------- results ---------- */

    /// The headline results, as [value, what it is]; shown under the figure and in saved figures.
    pub fn stat_items(&self) -> Vec<(String, String)> {
        let r = self.r();
        let (e, m) = (&r.extremes, &r.model);
        let deg = indeterminacy(&m.supports);
        let mut items = vec![
            if deg > 0 { (format!("Indeterminate, degree {deg}"), "more reactions than equilibrium can find: solved with compatibility".into()) }
            else { ("Determinate".into(), "reactions follow from equilibrium alone".into()) },
            (format!("{} {}", sig(self.show(e.v_shear.value, Q::Force), 4), self.sym(Q::Force)), format!("largest shear, at x = {}", self.at_text(e.v_shear.x))),
            (format!("{} {}", sig(self.show(e.m.value, Q::Moment), 4), self.sym(Q::Moment)),
                format!("largest moment ({}), at x = {}", if e.m.value >= 0.0 { "sagging" } else { "hogging" }, self.at_text(e.m.x))),
            (format!("{} {}", sig(self.show(e.v.value, Q::Length), 4), self.sym(Q::Length)), format!("largest deflection, at x = {} (L/{})", self.at_text(e.v.x), span_ratio(m.length, e.v.value))),
        ];
        if let Some(c) = m.section.c.filter(|c| *c != 0.0 && !c.is_nan()) {
            items.push((format!("{} {}", sig(self.show(e.m.value.abs() * c / m.section.i, Q::Stress), 4), self.sym(Q::Stress)), "peak bending stress |M|·c / I".into()));
        }
        let resid = residual(&r.equilibrium);
        items.push((if resid < 1e-9 { "Balanced".into() } else { format!("Residual {}", sci(resid)) }, format!("ΣF and ΣM of loads and reactions, relative error {}", sci(resid))));
        items
    }

    pub fn reaction_text(&self, i: usize) -> String {
        let r = self.r().reactions[i];
        let mut t = format!("{} at {}: {} {}", if r.kind == Kind::Pin { "Pin" } else { "Fixed" }, self.at_text(r.x), short_nf(self.show(r.fy, Q::Force), 3), self.sym(Q::Force));
        if r.kind == Kind::Fixed { t += &format!(", {} {}", short_nf(self.show(r.mz, Q::Moment), 3), self.sym(Q::Moment)) }
        t
    }

    pub fn stats_html(&self) -> String {
        if !self.solved() { return String::new() }
        self.stat_items().iter().map(|(b, s)| format!("<li><b>{}</b><span>{}</span></li>", esc(b), esc(s))).collect()
    }
    pub fn reactions_html(&self) -> String {
        if !self.solved() { return String::new() }
        (0..self.r().reactions.len()).map(|i| format!("<li><i></i>{}</li>", esc(&self.reaction_text(i)))).collect()
    }

    /// Values at every support and load, one row of [text, numeric] cells each.
    pub fn table_rows(&self) -> Vec<Vec<(String, bool)>> {
        let r = self.r();
        let l = r.model.length;
        let f = |v: f64, key: &str, q: Q| nf(self.show(self.clean(v, key), q), 3);
        let dash = || "—".to_string();
        self.events().into_iter().map(|(x, what)| {
            let a = at(r, x);
            vec![
                (nf(self.show_x(x, l), 3), true), (what.join(", "), false),
                (if x > 0.0 { f(a.v_left, "V", Q::Force) } else { dash() }, true), (if x < l { f(a.v_right, "V", Q::Force) } else { dash() }, true),
                (if x > 0.0 { f(a.m_left, "M", Q::Moment) } else { dash() }, true), (if x < l { f(a.m_right, "M", Q::Moment) } else { dash() }, true),
                (f(a.v, "v", Q::Length), true), (f(a.theta, "theta", Q::Angle), true),
            ]
        }).collect()
    }
    pub fn table_html(&self) -> String {
        if !self.solved() { return String::new() }
        self.table_rows().iter().map(|row| format!("<tr>{}</tr>", row.iter().map(|(v, num)| format!("<td{}>{}</td>", if *num { " class=\"num\"" } else { "" }, esc(v))).collect::<String>())).collect()
    }

    /* ---------- the NASTRAN deck ---------- */

    /// The deck is built only when it is downloaded, copied or shown: a fine mesh makes it large.
    fn deck(&mut self) -> String {
        self.flush();
        if self.deck_text.is_none() {
            match self.input().and_then(|i| bdf::export_bdf(&i, bdf::TITLE, self.u)) {
                Ok(t) => self.deck_text = Some(t),
                Err(e) => { self.deck_text = Some(String::new()); self.text("#export-status", e.message) }
            }
        }
        self.deck_text.clone().unwrap()
    }
    fn reset_deck(&mut self) {
        self.deck_text = None;
        self.text("#export-status", "");
        let t = if self.deck_open { self.deck() } else { String::new() };
        self.text("#deck", t);
    }

    /* ---------- the beamdswitch deck and the hand calculations ---------- */

    /// The chosen preset's name, used as the title of the exported deck and hand calculations.
    fn preset_title(&self) -> String { self.d.presets.iter().find(|p| Some(&p.id) == self.st.preset.as_ref()).map_or(String::new(), |p| p.label.clone()) }

    fn described(&self) -> report::Described {
        let s = &self.st.section;
        report::Described {
            shape: s.shape.clone(),
            section: self.d.sections.iter().find(|x| x.0 == s.shape).map_or(s.shape.clone(), |x| x.1.clone()),
            dims: if s.shape == "custom" { vec![] } else { fields_of(&s.shape).iter().filter_map(|&(k, label, q, _)| dim_of(s, k).map(|v| (label.to_string(), v, q))).collect() },
            material: self.d.materials.iter().find(|m| m.id == self.st.mat.0).map_or(String::new(), |m| m.label.clone()),
        }
    }

    fn report_deck(&mut self) -> Result<String, String> {
        let (about, title, u, mid, at) = (self.described(), self.preset_title(), self.u, self.mid, self.cursor);
        let sol = self.sol.as_mut().unwrap();
        let mut rep = report::beam_report(sol.r(), u, mid, &title, &about);
        rep.hand = hand::slides(sol.derivation(u, mid), at);
        deck::deck(&rep)
    }

    fn hand_markdown(&mut self) -> String {
        let (title, u, mid, at) = (self.preset_title(), self.u, self.mid, self.cursor);
        hand::markdown(self.sol.as_mut().unwrap().derivation(u, mid), at, &title)
    }

    pub fn hand_body_html(&mut self) -> String {
        if !self.solved() { return "<p class=\"muted\">Fix the beam first: there is no solution to work by hand.</p>".into() }
        let (u, mid) = (self.u, self.mid);
        let d = self.sol.as_mut().unwrap().derivation(u, mid);
        hand::frames(d, None).iter().map(|(title, frames)| {
            let seg = |f: &hand::HFrame| f.title.starts_with("Segment ");
            let open = frames.iter().filter(|f| seg(f)).count() <= 6;
            format!("<div class=\"hand-part\"><h3>{}</h3>{}</div>", esc(title), frames.iter().map(|f| frame_html(f, seg(f), open)).collect::<String>())
        }).collect()
    }
    /// The selected point's frame follows the cursor on the diagrams.
    pub fn hand_point_html(&mut self) -> String {
        let (u, mid) = (self.u, self.mid);
        match (self.solved(), self.cursor) {
            (true, Some(c)) => frame_html(&hand::point_frame(self.sol.as_mut().unwrap().derivation(u, mid), c), false, true),
            _ => String::new(),
        }
    }
    fn render_hand(&mut self) {
        self.hand_stale = false;
        let b = self.hand_body_html();
        self.html("#hand-body", b);
        self.render_hand_point();
    }
    fn render_hand_point(&mut self) { let p = self.hand_point_html(); self.html("#hand-point", p) }

    /* ---------- saving the figure ----------
       The image and the PDF are drawn from the same display list as the page, entirely in this page:
       nothing is uploaded. Saved figures always use the site's light colours, which print well. */

    fn model_lines(&self) -> Vec<String> {
        let l = self.r().model.length;
        let v = |si: f64, q: Q| format!("{} {}", sig(self.show(si, q), 4), self.sym(q));
        let mut lines = vec![format!("Length L = {}; x runs from {} to {}", v(l, Q::Length), self.at_text(0.0), self.at_text(l))];
        for (i, s) in self.st.supports.iter().enumerate() { lines.push(format!("Support {}: {} at x = {}", i + 1, s.kind.name(), self.at_text(s.x))) }
        for (i, ld) in self.st.loads.iter().enumerate() {
            lines.push(format!("Load {}: {}", i + 1, match ld.kind {
                LK::Point => format!("point force {} at x = {}", v(ld.f, Q::Force), self.at_text(ld.x)),
                LK::Moment => format!("couple {} at x = {}", v(ld.c, Q::Moment), self.at_text(ld.x)),
                LK::Dist => {
                    let q = if ld.q1 == ld.q2 { v(ld.q1, Q::Distributed) } else { format!("{} → {}", sig(self.show(ld.q1, Q::Distributed), 4), v(ld.q2, Q::Distributed)) };
                    format!("distributed {q} from x = {} to {}", self.at_text(ld.x1), self.at_text(ld.x2))
                }
            }));
        }
        let s = &self.st.section;
        lines.push(format!("Section: {}", self.d.sections.iter().find(|x| x.0 == s.shape).map_or(s.shape.clone(), |x| x.1.clone())));
        let dims: Vec<String> = fields_of(&s.shape).iter().filter_map(|&(k, label, q, _)| dim_of(s, k).map(|x| format!("{label} = {}", v(x, q)))).collect();
        if !dims.is_empty() { lines.push(dims.join(", ")) }
        lines.push(self.section_summary());
        let mat = self.d.materials.iter().find(|m| m.id == self.st.mat.0).map_or("custom", |m| m.label.as_str());
        lines.push(format!("Material: {mat}, E = {}, ν = {}", v(self.st.mat.1, Q::Stress), sig(self.st.mat.2, 4)));
        lines
    }

    /// The beam and its diagrams with every result under them: display list, width, height.
    pub fn export_figure(&mut self) -> (Vec<Node>, f64, f64) {
        let mut fig = self.figure(960.0, false);
        let (w, left) = (fig.w, 32.0);
        let mid = w / 2.0 + 8.0;
        let mut c = draw::Canvas::new();
        let mut y = fig.h + 16.0;
        c.text(left, y, "Beam diagram results", "head", draw::Anchor::Start);
        y += 20.0;
        let origin = if self.mid { "middle of the beam (mid-span), negative to the left" } else { "left end" };
        for line in wrap(&format!("Units {}. x from the {origin}, positive to the right; y and forces positive up; couples positive counter-clockwise; bending moment positive sagging.", self.u.label), 140) {
            c.text(left, y, line, "note", draw::Anchor::Start);
            y += 16.0;
        }
        y += 12.0;
        let column = |c: &mut draw::Canvas, x: f64, title: &str, lines: &[String]| {
            let mut yy = y;
            c.text(x, yy, title, "title", draw::Anchor::Start);
            yy += 18.0;
            for line in lines { for part in wrap(line, 68) { c.text(x, yy, part, "body", draw::Anchor::Start); yy += 17.0 } }
            yy
        };
        let mut results: Vec<String> = self.stat_items().iter().map(|(b, s)| format!("{b}: {s}")).collect();
        results.push("Reactions (force + up, couple + counter-clockwise):".into());
        results.extend((0..self.r().reactions.len()).map(|i| format!("  {}", self.reaction_text(i))));
        let a = column(&mut c, left, "BEAM, SECTION AND MATERIAL", &self.model_lines());
        let b = column(&mut c, mid, "RESULTS", &results);
        y = a.max(b) + 14.0;
        c.text(left, y, "VALUES AT SUPPORTS AND LOADS", "title", draw::Anchor::Start);
        y += 20.0;
        // x, what, V x⁻, V x⁺, M x⁻, M x⁺, v, θ: numbers right-aligned at these edges, "what" from its left.
        let cols = [92.0, 104.0, 520.0, 600.0, 690.0, 780.0, 860.0, w - left];
        let mut cells = |c: &mut draw::Canvas, row: &[(String, bool)], cls: &'static str| {
            let what = wrap(&row[1].0, 48);
            for (i, (v, num)) in row.iter().enumerate() {
                if i != 1 { c.text(cols[i], y, v.clone(), cls, if *num { draw::Anchor::End } else { draw::Anchor::Start }) }
            }
            for (k, part) in what.iter().enumerate() { c.text(cols[1], y + 16.0 * k as f64, part.clone(), cls, draw::Anchor::Start) }
            y += 16.0 * what.len() as f64 + 6.0;
            c.line(left, y - 13.0, w - left, y - 13.0, "line", 1.0);
        };
        let u = |q: Q| format!(" ({})", self.sym(q));
        let head: Vec<(String, bool)> = vec![(format!("x{}", u(Q::Length)), true), ("What is here".into(), false), (format!("V x⁻{}", u(Q::Force)), true), (format!("V x⁺{}", u(Q::Force)), true),
            (format!("M x⁻{}", u(Q::Moment)), true), (format!("M x⁺{}", u(Q::Moment)), true), (format!("v{}", u(Q::Length)), true), (format!("θ{}", u(Q::Angle)), true)];
        cells(&mut c, &head, "cell th");
        for row in self.table_rows() { cells(&mut c, &row, "cell") }
        let h = (y + 12.0).ceil();
        fig.list.push(Node::Group(String::new(), c.finish()));
        let mut list = vec![Node::Item(Item { shape: Draw::Rect { x: 0.0, y: 0.0, w, h, rx: 0.0 }, paint: draw::fill("bg"), class: "" })];
        list.extend(fig.list);
        (list, w, h)
    }

    /// A saved SVG: the print palette and the embedded fonts, so it looks the same anywhere.
    fn print_svg(&self, list: &[Node], w: f64, h: f64) -> String {
        let defs = format!("<style>{}{}</style>", self.font_css, draw::css());
        let s = draw::svg(list, w, h, "", &defs);
        let pal = look::print_palette();
        let mut out = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        let mut rest = s.as_str();
        while let Some(i) = rest.find("var(--") {
            out += &rest[..i];
            let tail = &rest[i + 6..];
            let end = tail.find(')').unwrap_or(0);
            let k = &tail[..end];
            match k {
                "sans" => out += "\"Fira Sans\",sans-serif",
                "mono" => out += "\"Fira Mono\",monospace",
                _ => match pal.iter().find(|p| p.0 == k) { Some(p) => out += &p.1, None => out += &rest[i..i + 7 + end] },
            }
            rest = &tail[end + 1..];
        }
        out + rest
    }

    fn save_figure(&mut self, kind: &str) {
        self.flush();
        if !self.solved() { return self.text("#figure-status", "Fix the beam first: there is no solution to save.") }
        let (list, w, h) = self.export_figure();
        let name = format!("beamdiag.{kind}");
        match kind {
            "svg" => { let s = self.print_svg(&list, w, h); self.save(&name, "image/svg+xml", s, false) }
            "pdf" => {
                let fonts = self.fonts.unwrap_or_else(default_fonts);
                let p = pdf::pdf(&list, w, h, "Beam diagram results", fonts);
                self.save(&name, "application/pdf", look::base64(&p), true);
            }
            _ => {
                let s = self.print_svg(&list, w, h);
                self.text("#figure-status", "Drawing…");
                let bg = look::print_palette().into_iter().find(|p| p.0 == "bg").unwrap().1;
                return self.cmd([("raster", s.into()), ("w", w.into()), ("h", h.into()), ("name", name.into()), ("bg", bg.into())]);
            }
        }
        self.text("#figure-status", format!("Saved {name}."));
    }

    /* ---------- WebMCP tools ---------- */

    fn tool(&self, name: &str, i: &Value) -> Value {
        let error = |e: ModelError| obj([("error", e.message.into())]);
        match name {
            "get_metadata" => {
                let r = &self.d.raw;
                let presets = Value::Arr(self.d.presets.iter().map(|p| obj([("id", p.id.as_str().into()), ("label", p.label.as_str().into()), ("note", p.note.as_str().into())])).collect());
                let systems = Value::Arr(UNITS.iter().map(units_json).collect());
                obj([("title", r.get("title").clone()), ("method", r.get("method").clone()), ("units", r.get("units").clone()), ("unitConventions", systems), ("pageUnits", self.u.id.into()),
                    ("conventions", r.get("conventions").clone()), ("assumptions", r.get("assumptions").clone()), ("presets", presets), ("nastran", r.get("nastran").clone()), ("sources", r.get("sources").clone())])
            }
            "get_current_beam" => match self.input().and_then(|i| solve(&i, SI)) {
                Ok(r) => { let Value::Obj(mut o) = summary(&r) else { unreachable!() }; o.insert(0, ("model".into(), json::model_json(&Input::from(&r.model)))); Value::Obj(o) }
                Err(e) => error(e),
            },
            "solve_beam" => match solve(&json::input(i), SI) {
                Ok(r) => summary(&r),
                Err(e) => obj([("error", e.message.into()), ("field", e.field.into())]),
            },
            "export_nastran_bdf" => {
                let m = i.get("model");
                let input = if matches!(m, Value::Obj(_) | Value::Arr(_)) { Ok(json::input(m)) } else { self.input() };
                let u = match i.get("units") {
                    Value::Null | Value::Bool(false) => Ok(self.u),
                    Value::Str(s) if s.is_empty() => Ok(self.u),
                    Value::Num(x) if *x == 0.0 || x.is_nan() => Ok(self.u),
                    v => {
                        let id = match v { Value::Obj(_) if !v.get("id").is_null() => v.get("id").clone(), v => v.clone() };
                        id.str().and_then(units).ok_or_else(|| ModelError {
                            message: format!("Unknown unit convention {}; choose one of {}.", json::stringify(&id), UNITS.iter().map(|u| u.id).collect::<Vec<_>>().join(", ")), field: Some("units".into()),
                        })
                    }
                };
                match input.and_then(|m| u.and_then(|u| bdf::export_bdf(&m, bdf::TITLE, u))) { Ok(b) => obj([("bdf", b.into())]), Err(e) => error(e) }
            }
            _ => obj([("error", format!("No tool {name}.").into())]),
        }
    }

    /* ---------- the page as it opens ---------- */

    /// Every region of the page, filled in as the script would, so the page reads before it runs.
    pub fn body(&mut self, root: &str) -> String {
        let figure = if self.sol.is_some() { self.figure_svg(700.0) } else { String::new() };
        let (hand, point) = (self.hand_body_html(), self.hand_point_html());
        let d = &self.d.raw;
        let items = |k: &Value| k.arr().unwrap_or(&[]).iter().map(|t| format!("<li>{}</li>", esc(t.str().unwrap_or("")))).collect::<String>();
        let n = d.get("nastran");
        let unit = |q: Q| format!("<span data-unit=\"{}\">{}</span>", q.name(), self.sym(q));
        let origin = |v: &str, l: &str| format!("<option value=\"{v}\"{}>{l}</option>", if (v == "mid") == self.mid { " selected" } else { "" });
        let error = match &self.error {
            Some(e) => format!("<div id=\"error\" class=\"error\" role=\"alert\"><b>Can't solve this beam: </b>{}</div>", esc(&self.in_convention(&e.message))),
            None => "<div id=\"error\" class=\"error\" role=\"alert\" hidden></div>".into(),
        };
        let vars: Vec<(&str, String)> = vec![
            ("root", root.into()), ("presets", self.preset_options()), ("units", self.unit_options()), ("note", esc(&self.preset_note())), ("error", error),
            ("stale", if self.error.is_some() { "stale".into() } else { String::new() }), ("figure", figure), ("readout", self.readout_html()),
            ("stats", self.stats_html()), ("reactions", self.reactions_html()), ("length", unit(Q::Length)), ("force", unit(Q::Force)), ("moment", unit(Q::Moment)),
            ("stress", unit(Q::Stress)), ("angle", unit(Q::Angle)), ("len", tidy(self.show(self.st.length, Q::Length))), ("div", js(self.st.divisions)),
            ("origins", origin("left", "Left end, + to the right") + &origin("mid", "Mid-span, − left, + right")), ("supports", self.supports_html()), ("loads", self.loads_html()),
            ("shapes", self.shape_options()), ("fields", self.section_fields_html()), ("derived", esc(&self.section_summary())), ("materials", self.material_options()),
            ("e", tidy(self.show(self.st.mat.1, Q::Stress))), ("nu", tidy(self.st.mat.2)), ("table", self.table_html()), ("point", point), ("hand", hand),
            ("system", esc(self.u.label)), ("run", items(n.get("run"))), ("status", esc(n.s("status"))),
            ("cards", n.get("cards").arr().unwrap_or(&[]).iter().map(|c| format!("<tr><td><code>{}</code></td><td>{}</td></tr>", esc(c.s("card")), esc(c.s("use")))).collect()),
            ("method", esc(d.s("method"))), ("conventions", items(d.get("conventions"))), ("assumptions", items(d.get("assumptions"))),
            ("sources", d.get("sources").arr().unwrap_or(&[]).iter().map(|s| format!("<li><a href=\"{}\" rel=\"noopener\">{}</a></li>", esc(s.s("url")), esc(s.s("title")))).collect()),
        ];
        fill(include_str!("body.html"), &vars)
    }
}

/// A template with each {{name}} replaced by its value.
fn fill(t: &str, vars: &[(&str, String)]) -> String {
    let (mut out, mut rest) = (String::new(), t);
    while let Some(i) = rest.find("{{") {
        out += &rest[..i];
        let tail = &rest[i + 2..];
        let j = tail.find("}}").expect("an open {{");
        out += &vars.iter().find(|v| v.0 == &tail[..j]).unwrap_or_else(|| panic!("no value for {{{{{}}}}}", &tail[..j])).1;
        rest = &tail[j + 2..];
    }
    out + rest
}

impl Default for App { fn default() -> App { App::new() } }

/// The fonts a PDF embeds before the page has passed its own (and in tests).
fn default_fonts() -> [&'static [u8]; 3] {
    #[cfg(not(target_arch = "wasm32"))]
    { look::FONTS.map(|f| f.1) }
    #[cfg(target_arch = "wasm32")]
    { [&[], &[], &[]] }
}

fn units_json(u: &Units) -> Value {
    let qs = [Q::Length, Q::Force, Q::Stress, Q::Moment, Q::Distributed, Q::Area, Q::Inertia, Q::Rigidity, Q::Angle];
    Value::Obj(vec![
        ("id".into(), u.id.into()), ("label".into(), u.label.into()), ("ascii".into(), u.ascii.into()),
        ("factor".into(), Value::Obj(qs.iter().map(|q| (q.name().to_string(), u.factor(*q).into())).collect())),
        ("symbol".into(), Value::Obj(qs.iter().map(|q| (q.name().to_string(), u.symbol(*q).into())).collect())),
    ])
}

/// What the tools return about a solved beam, in SI.
fn summary(r: &Solved) -> Value {
    let ex = |e: crate::engine::Extreme| obj([("x", e.x.into()), ("value", e.value.into())]);
    let mut xs = vec![0.0, r.model.length];
    xs.extend(r.model.supports.iter().map(|s| s.x));
    for l in &r.model.loads { match *l { Load::Dist { x1, x2, .. } => xs.extend([x1, x2]), Load::Point { x, .. } | Load::Moment { x, .. } => xs.push(x) } }
    let mut seen: Vec<f64> = vec![];
    for x in xs { if !seen.contains(&x) { seen.push(x) } }
    seen.sort_by(f64::total_cmp);
    obj([
        ("units", "SI: m, N, N·m; deflection m; slope rad".into()),
        ("indeterminacy", (indeterminacy(&r.model.supports) as f64).into()),
        ("reactions", Value::Arr(r.reactions.iter().map(|s| obj([("kind", s.kind.name().into()), ("x", s.x.into()), ("Fy", s.fy.into()), ("Mz", s.mz.into())])).collect())),
        ("extremes", obj([("shear", ex(r.extremes.v_shear)), ("moment", ex(r.extremes.m)), ("deflection", ex(r.extremes.v))])),
        ("points", Value::Arr(seen.iter().map(|&x| { let a = at(r, x);
            obj([("x", a.x.into()), ("Vleft", a.v_left.into()), ("Vright", a.v_right.into()), ("Mleft", a.m_left.into()), ("Mright", a.m_right.into()), ("v", a.v.into()), ("theta", a.theta.into())]) }).collect())),
    ])
}

/// The page's tools, for WebMCP.
pub fn tools() -> Value {
    json::parse(include_str!("tools.json")).expect("tools.json")
}

fn block_html(b: &hand::Block) -> String {
    use hand::Block::*;
    match b {
        P(t) | Items { text: t, .. } => format!("<p>{}</p>", tex::inline(t)),
        Eq(t) => format!("<div class=\"eq\" role=\"math\" aria-label=\"{}\">{}</div>", esc(&tex::text(t)), tex::html(t)),
        List(items) => format!("<ul>{}</ul>", items.iter().map(|t| format!("<li>{}</li>", tex::inline(t))).collect::<String>()),
        Table(head, rows) => {
            let cls = |i: usize| if i > 0 { " class=\"num\"" } else { "" };
            let head: String = head.iter().enumerate().map(|(i, h)| format!("<th scope=\"col\"{}>{}</th>", cls(i), tex::inline(h))).collect();
            let body: String = rows.iter().map(|r| format!("<tr>{}</tr>", r.iter().enumerate().map(|(i, v)| format!("<td{}>{}</td>", cls(i), tex::inline(v))).collect::<String>())).collect();
            format!("<div class=\"table-wrap\"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>")
        }
    }
}

/// A frame as an article, or for a segment a details element, open while the beam has few segments.
fn frame_html(f: &hand::HFrame, collapsible: bool, open: bool) -> String {
    let body: String = f.blocks.iter().map(block_html).collect();
    if collapsible { format!("<details class=\"calc\"{}><summary>{}</summary>{body}</details>", if open { " open" } else { "" }, esc(&f.title)) }
    else { format!("<article class=\"calc\"><h4>{}</h4>{body}</article>", esc(&f.title)) }
}

/// The end, in `rest`, of the word after its first word (`a` bytes long) and one space.
fn b_end(rest: &str, a: usize) -> usize { let b = &rest[a + 1..]; a + 1 + word(b) }
