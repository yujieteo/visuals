//! A figure as a display list: lines, paths, rectangles, circles and text in CSS pixels, y down, with
//! colours as the site's colour tokens. The page draws it as SVG; a saved figure is the same SVG in the
//! print palette, or a vector PDF (pdf.rs).

use look::esc;

/// Path segments, in absolute coordinates.
#[derive(Clone, Copy, Debug)]
pub enum Seg { M(f64, f64), L(f64, f64), C(f64, f64, f64, f64, f64, f64), Z }

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Anchor { Start, Middle, End }

#[derive(Clone, Debug)]
pub enum Shape {
    Line(f64, f64, f64, f64),
    Path(Vec<Seg>),
    Rect { x: f64, y: f64, w: f64, h: f64, rx: f64 },
    Circle(f64, f64, f64),
    /// Text with its baseline at y, styled by its class (see `TEXT`).
    Text { x: f64, y: f64, s: String, anchor: Anchor },
}

/// Paint: a stroke colour token and width, a fill token and its opacity.
#[derive(Clone, Copy, Debug, Default)]
pub struct Paint { pub stroke: Option<(&'static str, f64)>, pub fill: Option<&'static str>, pub opacity: Option<f64>, pub round: bool }

pub const fn stroke(c: &'static str, w: f64) -> Paint { Paint { stroke: Some((c, w)), fill: None, opacity: None, round: false } }
pub const fn fill(c: &'static str) -> Paint { Paint { stroke: None, fill: Some(c), opacity: None, round: false } }
pub const fn both(f: &'static str, s: &'static str, w: f64) -> Paint { Paint { stroke: Some((s, w)), fill: Some(f), opacity: None, round: false } }
pub const NONE: Paint = Paint { stroke: None, fill: None, opacity: None, round: false };

#[derive(Clone, Debug)]
pub struct Item { pub shape: Shape, pub paint: Paint, pub class: &'static str }

#[derive(Clone, Debug)]
pub enum Node { Item(Item), Group(String, Vec<Node>) }

/// Text styles by class: monospace, size (px), colour token, letter spacing (em), halo.
pub const TEXT: [(&str, bool, f64, &str, f64, bool); 9] = [
    ("tick", true, 11.0, "muted", 0.0, false), ("title", true, 11.0, "muted", 0.06, false), ("val", false, 11.5, "fg", 0.0, false),
    ("axlabel", true, 11.0, "fg", 0.0, false), ("axlabel halo", true, 11.0, "fg", 0.0, true), ("head", false, 18.0, "fg", 0.0, false),
    ("body", false, 12.0, "fg", 0.0, false), ("note", false, 12.0, "muted", 0.0, false), ("cell", false, 11.5, "fg", 0.0, false),
];
pub fn text_style(class: &str) -> (bool, f64, &'static str, f64, bool) {
    let t = TEXT.iter().find(|t| t.0 == class).unwrap_or(&TEXT[2]);
    (t.1, t.2, t.3, t.4, t.5)
}

/// The figure's own CSS, so a saved SVG looks as the page does.
pub fn css() -> String {
    TEXT.iter().map(|(c, mono, size, color, spacing, halo)| {
        let sel = c.split(' ').map(|p| format!(".{p}")).collect::<String>();
        format!(".bd-fig text{sel}{{font:{size}px var(--{});fill:var(--{color}){}{}}}", if *mono { "mono" } else { "sans" },
            if *spacing > 0.0 { format!(";letter-spacing:{spacing}em") } else { String::new() },
            if *halo { ";paint-order:stroke;stroke:var(--bg);stroke-width:3px;stroke-linejoin:round" } else { "" })
    }).collect()
}

/// A display list under construction: groups open and close around what is added.
#[derive(Default)]
pub struct Canvas { stack: Vec<(String, Vec<Node>)> }

impl Canvas {
    pub fn new() -> Canvas { Canvas { stack: vec![(String::new(), vec![])] } }
    pub fn open(&mut self, attrs: String) { self.stack.push((attrs, vec![])) }
    pub fn close(&mut self) { let (a, k) = self.stack.pop().unwrap(); self.stack.last_mut().unwrap().1.push(Node::Group(a, k)) }
    pub fn add(&mut self, shape: Shape, paint: Paint, class: &'static str) { self.stack.last_mut().unwrap().1.push(Node::Item(Item { shape, paint, class })) }
    pub fn line(&mut self, x1: f64, y1: f64, x2: f64, y2: f64, c: &'static str, w: f64) { self.add(Shape::Line(x1, y1, x2, y2), stroke(c, w), "") }
    pub fn path(&mut self, d: Vec<Seg>, p: Paint) { self.add(Shape::Path(d), p, "") }
    pub fn rect(&mut self, x: f64, y: f64, w: f64, h: f64, rx: f64, p: Paint) { self.add(Shape::Rect { x, y, w, h, rx }, p, "") }
    pub fn text(&mut self, x: f64, y: f64, s: impl Into<String>, class: &'static str, anchor: Anchor) { self.add(Shape::Text { x, y, s: s.into(), anchor }, NONE, class) }
    pub fn finish(mut self) -> Vec<Node> { while self.stack.len() > 1 { self.close() } self.stack.pop().unwrap().1 }
}

/// A coordinate as SVG writes it: at most two decimals.
pub fn n(x: f64) -> String {
    let t = format!("{:.2}", x);
    let t = if t.contains('.') { t.trim_end_matches('0').trim_end_matches('.').to_string() } else { t };
    if t == "-0" { "0".into() } else { t }
}

pub fn d(segs: &[Seg]) -> String {
    let mut out = String::new();
    for s in segs {
        match *s {
            Seg::M(x, y) => out += &format!("M{},{}", n(x), n(y)),
            Seg::L(x, y) => out += &format!("L{},{}", n(x), n(y)),
            Seg::C(a, b, c, e, x, y) => out += &format!("C{},{} {},{} {},{}", n(a), n(b), n(c), n(e), n(x), n(y)),
            Seg::Z => out += "Z",
        }
    }
    out
}

fn paint(p: &Paint) -> String {
    let mut out = String::new();
    out += &format!(" fill=\"{}\"", p.fill.map_or("none".into(), |f| format!("var(--{f})")));
    if let Some(o) = p.opacity { out += &format!(" fill-opacity=\"{o}\"") }
    if let Some((c, w)) = p.stroke { out += &format!(" stroke=\"var(--{c})\" stroke-width=\"{}\"", n(w)) }
    if p.round { out += " stroke-linejoin=\"round\"" }
    out
}

fn item(i: &Item, out: &mut String) {
    let class = if i.class.is_empty() { String::new() } else { format!(" class=\"{}\"", i.class) };
    match &i.shape {
        Shape::Line(x1, y1, x2, y2) => *out += &format!("<line{class} x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\"{}/>", n(*x1), n(*y1), n(*x2), n(*y2), paint(&i.paint)),
        Shape::Path(s) => *out += &format!("<path{class} d=\"{}\"{}/>", d(s), paint(&i.paint)),
        Shape::Rect { x, y, w, h, rx } => *out += &format!("<rect{class} x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"{}{}/>", n(*x), n(*y), n(*w), n(*h),
            if *rx > 0.0 { format!(" rx=\"{}\"", n(*rx)) } else { String::new() }, paint(&i.paint)),
        Shape::Circle(x, y, r) => *out += &format!("<circle{class} cx=\"{}\" cy=\"{}\" r=\"{}\"{}/>", n(*x), n(*y), n(*r), paint(&i.paint)),
        Shape::Text { x, y, s, anchor } => {
            let a = match anchor { Anchor::Start => "", Anchor::Middle => " text-anchor=\"middle\"", Anchor::End => " text-anchor=\"end\"" };
            *out += &format!("<text{class} x=\"{}\" y=\"{}\"{a}>{}</text>", n(*x), n(*y), esc(s));
        }
    }
}

fn nodes(ns: &[Node], out: &mut String) {
    for x in ns {
        match x {
            Node::Item(i) => item(i, out),
            Node::Group(a, k) => { *out += &format!("<g{a}>"); nodes(k, out); *out += "</g>" }
        }
    }
}

/// The SVG element: `attrs` go on the root, `defs` (styles, fonts) first inside it.
pub fn svg(list: &[Node], w: f64, h: f64, attrs: &str, defs: &str) -> String {
    let mut out = format!("<svg xmlns=\"http://www.w3.org/2000/svg\" class=\"bd-fig\" width=\"{}\" height=\"{}\" viewBox=\"0 0 {} {}\"{attrs}>{defs}", n(w), n(h), n(w), n(h));
    nodes(list, &mut out);
    out + "</svg>"
}

/// An arrowhead with its tip at (x, y), pointing at `deg` degrees clockwise from up, as a closed path.
pub fn arrow(x: f64, y: f64, deg: f64, size: f64, along: f64) -> Vec<Seg> {
    let (s, c) = deg.to_radians().sin_cos();
    let at = |dx: f64, dy: f64| (x + dx * c - dy * s, y + dx * s + dy * c);
    let (a, b) = (at(-size, size * along), at(size, size * along));
    vec![Seg::M(x, y), Seg::L(a.0, a.1), Seg::L(b.0, b.1), Seg::Z]
}
