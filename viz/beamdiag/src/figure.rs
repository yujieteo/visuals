//! The beam and its shear force, bending moment and deflection diagrams, as a display list. The page's
//! figure is interactive: supports and loads are handles, and the diagrams are a slider with a cursor.
//! A saved figure is the same drawing without them.

use crate::app::{App, LK, Layout, js_round, tidy};
use crate::draw::{Anchor, Canvas, NONE, Node, Paint, Seg, Shape, arrow, both, fill, stroke};
use crate::engine::{Kind, Load, Q, Sample, diagram, jmax, jmin, pw};
use crate::fmt::{pow10, short, short_nf, sig};
use look::esc;

/// A drawn figure: its display list, size, margins and the length it spans.
pub struct Fig { pub list: Vec<Node>, pub w: f64, pub h: f64, pub ml: f64, pub mr: f64, pub l: f64 }

/// A diagram of one quantity, with its place in the figure and its axis.
struct Panel { key: &'static str, title: String, h: f64, color: &'static str, q: Q, top: f64, bottom: f64, lo: f64, hi: f64, ticks: Vec<f64>, labels: Vec<String> }

fn nice_ticks(mut lo: f64, mut hi: f64, count: f64) -> Vec<f64> {
    if lo == hi { lo -= 1.0; hi += 1.0 }
    let raw = hi / count - lo / count;
    let p = pw(10.0, raw.log10().floor() as i32);
    // 10·p is at least raw, so a step is always found.
    let step = [1.0, 2.0, 2.5, 5.0, 10.0].iter().map(|m| m * p).find(|s| *s >= raw).unwrap_or(f64::NAN);
    let mut ticks = vec![];
    let mut t = (lo / step).ceil() * step;
    while t <= hi + step * 1e-9 && ticks.len() < 100 {
        ticks.push(if t.abs() < step * 1e-9 { 0.0 } else { t });
        t += step;
    }
    ticks
}

/// Tick labels on one axis share a format: plain below 10⁵, otherwise a power of ten.
fn tick_labels(ticks: &[f64]) -> Vec<String> {
    let big = ticks.iter().fold(f64::NEG_INFINITY, |m, t| m.max(t.abs())) >= 1e5;
    ticks.iter().map(|&t| if t == 0.0 { "0".into() } else if big { pow10(t, 3) } else { sig(t, 3) }).collect()
}

/// Width of an 11px monospace axis label, rounded up.
fn label_width(s: &str) -> f64 { 7.0 * s.chars().count() as f64 }

/// A filled arrowhead with its tip at (x, y), pointing down (dir 1) or up (−1).
fn head(x: f64, tip: f64, dir: f64, size: f64) -> Vec<Seg> {
    let y = tip - dir * size * 1.6;
    vec![Seg::M(x, tip), Seg::L(x - size, y), Seg::L(x + size, y), Seg::Z]
}

fn anchor_at(x: f64, l: f64) -> Anchor { if x <= 0.08 * l { Anchor::Start } else if x >= 0.92 * l { Anchor::End } else { Anchor::Middle } }
fn shift(a: Anchor, by: f64) -> f64 { match a { Anchor::Start => by, Anchor::End => -by, Anchor::Middle => 0.0 } }

impl Panel {
    fn get(&self, app: &App, p: &Sample) -> f64 { app.show(match self.key { "V" => p.shear, "M" => p.m, _ => p.v }, self.q) }
    fn y(&self, v: f64) -> f64 { self.bottom - (v / 2.0 - self.lo / 2.0) / (self.hi / 2.0 - self.lo / 2.0) * (self.bottom - self.top) }
}

impl App {
    /// The beam and its diagrams at width w.
    pub fn figure(&self, w: f64, interactive: bool) -> Fig {
        let r = self.r();
        let narrow = w < 520.0;
        // The right margin holds the x axis's arrowhead and its label.
        let x_label = format!("x ({})", self.sym(Q::Length));
        let mr = 16.0 + label_width(&x_label);
        let l = r.model.length;
        let yb = if narrow { 75.0 } else { 85.0 };
        let panel = |key, title: String, h: f64, color, q| Panel { key, title, h, color, q, top: 0.0, bottom: 0.0, lo: 0.0, hi: 0.0, ticks: vec![], labels: vec![] };
        let mut panels = [
            panel("V", format!("SHEAR FORCE V ({})", self.sym(Q::Force)), if narrow { 130.0 } else { 160.0 }, "accent", Q::Force),
            panel("M", format!("BENDING MOMENT M ({}) · SAGGING +", self.sym(Q::Moment)), if narrow { 130.0 } else { 160.0 }, "warm", Q::Moment),
            panel("v", format!("DEFLECTION v ({})", self.sym(Q::Length)), if narrow { 110.0 } else { 130.0 }, "fg", Q::Length),
        ];
        // The beam panel first, from the top.
        let mut y = yb + 124.0 + 10.0;
        let pts = diagram(r, 800);
        for p in &mut panels {
            p.top = y + 22.0;
            p.bottom = y + p.h;
            y += p.h + 26.0;
            let (mut lo, mut hi) = (0.0, 0.0);
            for s in &pts { let v = p.get(self, s); lo = jmin(lo, v); hi = jmax(hi, v) }
            if !(hi - lo >= 1e-9) { lo = -1.0; hi = 1.0 }
            // Halved before subtracting so the span of loads near the double limit cannot overflow.
            let pad = (hi / 2.0 - lo / 2.0) * 0.4;
            (p.lo, p.hi) = (lo - pad, hi + pad);
            p.ticks = nice_ticks(p.lo, p.hi, if narrow { 3.0 } else { 4.0 });
            p.labels = tick_labels(&p.ticks);
        }
        let h = y;
        // Widen the left margin only when a tick label would not fit the usual one.
        let widest = panels.iter().flat_map(|p| p.labels.iter().map(|s| label_width(s))).fold(f64::NEG_INFINITY, f64::max);
        let ml = f64::max(if narrow { 48.0 } else { 64.0 }, 12.0 + widest);
        let lay = Layout { ml, mr, w, l };
        let mut c = Canvas::new();
        self.draw_beam(&mut c, &lay, yb, narrow, interactive, &x_label);
        if interactive {
            let now = self.cursor.map_or(String::new(), |x| format!(" aria-valuenow=\"{}\" aria-valuetext=\"{}\"", tidy(self.show_x(x, l)),
                esc(&self.readout(x).iter().map(|(k, v)| format!("{k} {v}")).collect::<Vec<_>>().join(", "))));
            c.open(format!(" class=\"plotarea\" id=\"plotarea\" tabindex=\"0\" role=\"slider\" aria-label=\"Section position along the beam\" aria-valuemin=\"{}\" aria-valuemax=\"{}\"{now}",
                tidy(self.show_x(0.0, l)), tidy(self.show_x(l, l))));
        } else {
            c.open(String::new());
        }
        for p in &panels { self.draw_diagram(&mut c, p, &pts, &lay, narrow, &x_label) }
        if interactive {
            c.add(Shape::Rect { x: ml - 4.0, y: panels[0].top - 20.0, w: w - ml - mr + 8.0, h: panels[2].bottom - panels[0].top + 24.0, rx: 6.0 }, NONE, "box");
        }
        c.close();
        if interactive {
            let x = lay.x(self.cursor.unwrap_or(l / 2.0));
            c.add(Shape::Line(x, 8.0, x, panels[2].bottom), NONE, "cursor");
        }
        Fig { list: c.finish(), w, h, ml, mr, l }
    }

    /// The x axis at height y: an arrow to the right, labelled past its tip.
    fn x_axis(&self, c: &mut Canvas, lay: &Layout, y: f64, label: &str) {
        let (w, mr) = (lay.w, lay.mr);
        c.line(lay.x(0.0), y, w - mr + 6.0, y, "fg", 1.0);
        c.path(arrow(w - mr + 10.0, y, 90.0, 3.5, 1.6), fill("fg"));
        c.text(w - mr + 14.0, y + 4.0, label, "axlabel", Anchor::Start);
    }

    /// Position ticks at height y, numbered in the chosen convention and drawn at their place on the beam.
    fn x_ticks(&self, c: &mut Canvas, lay: &Layout, y: f64, narrow: bool) {
        let (l, o) = (lay.l, self.offset(lay.l));
        for t in nice_ticks(self.show_x(0.0, l), self.show_x(l, l), if narrow { 4.0 } else { 6.0 }) {
            let px = lay.x(self.take(t, Q::Length) + o);
            c.line(px, y, px, y + 4.0, "muted", 1.0);
            c.text(px, y + 15.0, sig(t, 4), "tick", Anchor::Middle);
        }
    }

    /// A support or load handle: on the page, a slider to drag or move with the arrow keys.
    fn open_handle(&self, c: &mut Canvas, interactive: bool, key: &str, label: &str, x: f64, l: f64) {
        if !interactive { return c.open(String::new()) }
        let active = if self.active.as_deref() == Some(key) { " active" } else { "" };
        c.open(format!(" class=\"handle{active}\" tabindex=\"0\" role=\"slider\" aria-valuemin=\"{}\" aria-valuemax=\"{}\" data-key=\"{key}\" aria-label=\"{}\" aria-valuenow=\"{}\" aria-valuetext=\"{}\"",
            tidy(self.show_x(0.0, l)), tidy(self.show_x(l, l)), esc(label), tidy(self.show_x(x, l)), esc(&format!("{} {}", sig(self.show_x(x, l), 4), self.sym(Q::Length)))));
    }

    fn grip(c: &mut Canvas, interactive: bool, ring: [f64; 4], hit: [f64; 4]) {
        if !interactive { return }
        c.add(Shape::Rect { x: ring[0], y: ring[1], w: ring[2], h: ring[3], rx: 6.0 }, NONE, "ring");
        c.add(Shape::Rect { x: hit[0], y: hit[1], w: hit[2], h: hit[3], rx: 0.0 }, NONE, "hit");
    }

    fn draw_beam(&self, c: &mut Canvas, lay: &Layout, yb: f64, narrow: bool, interactive: bool, x_label: &str) {
        let r = self.r();
        let (m, l) = (&r.model, r.model.length);
        let x_of = |x: f64| lay.x(x);
        c.open(String::new());
        // Distributed loads: arrows scaled to the largest intensity.
        let (mut qmax, mut fmax) = (1e-12, 1e-12);
        for ld in &m.loads {
            match *ld { Load::Dist { q1, q2, .. } => qmax = jmax(jmax(qmax, q1.abs()), q2.abs()), Load::Point { f, .. } => fmax = jmax(fmax, f.abs()), _ => {} }
        }
        for ld in &m.loads {
            let Load::Dist { x1, x2, q1, q2 } = *ld else { continue };
            let hq = |q: f64| 10.0 + 30.0 * q.abs() / qmax;
            let (px1, px2) = (x_of(x1), x_of(x2));
            let n = 2f64.max(js_round((px2 - px1) / 22.0));
            let top_at = |x: f64| { let q = q1 + (q2 - q1) * (x - x1) / (x2 - x1); yb - 7.0 - hq(q) };
            c.path(vec![Seg::M(px1, top_at(x1)), Seg::L(px2, top_at(x2))], stroke("fg", 1.5));
            for j in 0..=(n as usize) {
                let j = j as f64;
                let (xm, q) = (x1 + (x2 - x1) * j / n, q1 + (q2 - q1) * j / n);
                if q.abs() < 1e-9 * qmax { continue }
                let (px, top, d) = (x_of(xm), top_at(xm), if q < 0.0 { 1.0 } else { -1.0 });
                c.line(px, top, px, yb - 8.0, "fg", 1.0);
                c.path(head(px, if d > 0.0 { yb - 7.0 } else { top }, d, 3.0), fill("fg"));
            }
            let qs = |v: f64| short(self.show(v, Q::Distributed), 3);
            let u = self.sym(Q::Distributed);
            let label = if q1 == q2 { format!("{} {u}", qs(q1)) } else { format!("{} → {} {u}", qs(q1), qs(q2)) };
            c.text((px1 + px2) / 2.0, jmin(top_at(x1), top_at(x2)) - 6.0, label, "val", Anchor::Middle);
        }
        c.rect(x_of(0.0), yb - 4.0, x_of(l) - x_of(0.0), 8.0, 2.0, both("surface", "fg", 1.5));
        // Supports and their reactions. With many close supports, label only those whose text has room;
        // every reaction is still listed below the figure and in the table.
        let (force, moment) = (self.sym(Q::Force), self.sym(Q::Moment));
        let mut labelled: Vec<f64> = vec![];
        let mut free_from = f64::NEG_INFINITY;
        for rr in &r.reactions {
            let x = x_of(rr.x);
            let w = 7.0 * (short_nf(self.show(rr.fy.abs(), Q::Force), 2).chars().count() + force.chars().count() + 3) as f64;
            let left = match anchor_at(rr.x, l) { Anchor::Start => x, Anchor::End => x - w, Anchor::Middle => x - w / 2.0 };
            if left >= free_from { labelled.push(rr.x); free_from = left + w + 6.0 }
        }
        for (i, s) in self.st.supports.iter().enumerate() {
            if !s.x.is_finite() { continue }
            let x = x_of(s.x);
            self.open_handle(c, interactive, &format!("s{i}"), &format!("{} support {}, position", if s.kind == Kind::Pin { "Pin" } else { "Fixed" }, i + 1), s.x, l);
            if s.kind == Kind::Pin {
                c.path(vec![Seg::M(x, yb + 4.0), Seg::L(x - 10.0, yb + 20.0), Seg::L(x + 10.0, yb + 20.0), Seg::Z], both("bg", "fg", 1.5));
                c.line(x - 14.0, yb + 23.0, x + 14.0, yb + 23.0, "fg", 1.5);
                for k in (-12..=8).step_by(5) { let k = k as f64; c.line(x + k, yb + 27.0, x + k + 4.0, yb + 23.0, "fg", 1.0) }
            } else {
                let side = if s.x <= 0.0 { -1.0 } else if s.x >= l { 1.0 } else { 0.0 };
                if side != 0.0 {
                    c.line(x, yb - 20.0, x, yb + 20.0, "fg", 2.0);
                    for k in (-20..20).step_by(6) { let k = k as f64; c.line(x, yb + k + 6.0, x + side * 6.0, yb + k, "fg", 1.0) }
                } else {
                    c.rect(x - 7.0, yb - 12.0, 14.0, 24.0, 0.0, both("bg", "fg", 1.5));
                    c.line(x - 7.0, yb - 12.0, x + 7.0, yb + 12.0, "fg", 1.0);
                    c.line(x + 7.0, yb - 12.0, x - 7.0, yb + 12.0, "fg", 1.0);
                }
            }
            Self::grip(c, interactive, [x - 16.0, yb - 22.0, 32.0, 52.0], [x - 16.0, yb - 22.0, 32.0, 52.0]);
            c.close();
            let Some(rr) = r.reactions.iter().find(|rr| rr.x == s.x) else { continue };
            let (up, ya, len) = (rr.fy >= 0.0, yb + 34.0, 20.0);
            c.line(x, if up { ya + len } else { ya }, x, if up { ya } else { ya + len }, "green", 2.0);
            c.path(head(x, if up { ya - 1.0 } else { ya + len + 1.0 }, if up { -1.0 } else { 1.0 }, 4.0), fill("green"));
            if labelled.contains(&rr.x) {
                let a = anchor_at(s.x, l);
                let tx = x - shift(a, 2.0);
                c.text(tx, ya + len + 14.0, format!("{} {force} {}", short_nf(self.show(rr.fy.abs(), Q::Force), 2), if up { "↑" } else { "↓" }), "val react", a);
                if s.kind == Kind::Fixed && rr.mz.abs() > 1e-9 * (rr.fy.abs() + 1.0) {
                    c.text(tx, ya + len + 28.0, format!("{} {moment} {}", short_nf(self.show(rr.mz.abs(), Q::Moment), 2), if rr.mz > 0.0 { "↺" } else { "↻" }), "val react", a);
                }
            }
        }
        // Point forces and couples
        for (i, ld) in self.st.loads.iter().enumerate() {
            if ld.kind == LK::Dist || !ld.x.is_finite() { continue }
            let x = x_of(ld.x);
            self.open_handle(c, interactive, &format!("l{i}"), &format!("Load {}, {}, position", i + 1, ld.name()), ld.x, l);
            let a = anchor_at(ld.x, l);
            if ld.kind == LK::Point {
                // Capped: while an edit is unsolved, F can exceed the largest force of the solved model.
                let ratio = ld.f.abs() / fmax;
                let len = 18.0 + 30.0 * if ratio.is_nan() { 0.0 } else { ratio.min(1.0) };
                let down = ld.f <= 0.0;
                let (y0, y1) = (yb - 6.0 - len, yb - 6.0);
                c.line(x, if down { y0 } else { y1 - 1.0 }, x, if down { y1 - 7.0 } else { y0 + 7.0 }, "fg", 2.0);
                c.text(x, y0 - 6.0, format!("{} {force} {}", short(self.show(ld.f.abs(), Q::Force), 3), if down { "↓" } else { "↑" }), "val", a);
                Self::grip(c, interactive, [x - 14.0, y0 - 4.0, 28.0, len + 6.0], [x - 16.0, y0 - 20.0, 32.0, len + 22.0]);
                c.close();
                c.path(head(x, if down { y1 } else { y0 }, if down { 1.0 } else { -1.0 }, 5.0), fill("fg"));
            } else {
                let (rr, ccw) = (14.0, ld.c >= 0.0);
                let (k, s) = (0.5522847498 * rr, if ccw { -1.0 } else { 1.0 });
                c.path(vec![Seg::M(x + rr, yb), Seg::C(x + rr, yb + s * k, x + k, yb + s * rr, x, yb + s * rr), Seg::C(x - k, yb + s * rr, x - rr, yb + s * k, x - rr, yb)], stroke("fg", 2.0));
                let tx = x - rr;
                c.path(vec![Seg::M(tx, yb - s), Seg::L(tx + 5.0 * s, yb + 7.0 * s), Seg::L(tx - 5.0 * s, yb + 7.0 * s), Seg::Z], fill("fg"));
                c.text(x, yb - rr - 8.0, format!("{} {moment} {}", short(self.show(ld.c.abs(), Q::Moment), 3), if ccw { "↺" } else { "↻" }), "val", a);
                Self::grip(c, interactive, [x - rr - 5.0, yb - rr - 5.0, 2.0 * rr + 10.0, rr + 12.0], [x - rr - 6.0, yb - rr - 22.0, 2.0 * rr + 12.0, rr + 30.0]);
                c.close();
            }
        }
        // Axes: x along the beam from the chosen origin, y up through it.
        let (ya, xo) = (yb + 104.0, x_of(self.offset(l)));
        c.open(" class=\"axes\"".into());
        self.x_axis(c, lay, ya, x_label);
        self.x_ticks(c, lay, ya, narrow);
        c.line(xo, ya, xo, ya - 12.0, "fg", 1.0);
        c.path(arrow(xo, ya - 16.0, 0.0, 3.5, 1.6), fill("fg"));
        c.text(xo - 6.0, ya - 8.0, "y", "axlabel halo", Anchor::End);
        c.close();
        c.close();
    }

    fn draw_diagram(&self, c: &mut Canvas, p: &Panel, pts: &[Sample], lay: &Layout, narrow: bool, x_label: &str) {
        let r = self.r();
        let (ml, w, mr) = (lay.ml, lay.w, lay.mr);
        let (top, bot) = (p.top, p.bottom);
        c.open(" class=\"axis\"".into());
        for (t, label) in p.ticks.iter().zip(&p.labels) {
            c.line(ml, p.y(*t), w - mr, p.y(*t), "line", 1.0);
            c.text(ml - 6.0, p.y(*t) + 4.0, label.clone(), "tick", Anchor::End);
        }
        c.line(ml, p.y(0.0), w - mr, p.y(0.0), "muted", 1.0);
        c.close();
        // Axes: the value up the left edge, labelled by the panel title at its tip; x along the zero line.
        c.open(" class=\"axes\"".into());
        c.line(ml, bot, ml, top + 4.0, "fg", 1.0);
        c.path(arrow(ml, top - 1.0, 0.0, 3.5, 1.6), fill("fg"));
        self.x_axis(c, lay, p.y(0.0), x_label);
        self.x_ticks(c, lay, bot, narrow);
        c.close();
        c.text(ml + 8.0, top - 5.0, p.title.clone(), "title", Anchor::Start);
        let mut path: Vec<Seg> = pts.iter().enumerate().map(|(i, s)| { let (x, y) = (lay.x(s.x), p.y(p.get(self, s))); if i == 0 { Seg::M(x, y) } else { Seg::L(x, y) } }).collect();
        if p.key != "v" && !pts.is_empty() {
            let line = path.clone();
            path.extend([Seg::L(lay.x(pts[pts.len() - 1].x), p.y(0.0)), Seg::L(lay.x(pts[0].x), p.y(0.0)), Seg::Z]);
            c.add(Shape::Path(path), Paint { opacity: Some(0.14), ..fill(p.color) }, "area");
            path = line;
        }
        c.path(path, Paint { round: true, ..stroke(p.color, 2.0) });
        // Label the extremes.
        let ex = match p.key { "V" => r.extremes.v_shear, "M" => r.extremes.m, _ => r.extremes.v };
        if ex.value.abs() > 0.0 {
            let v = self.show(ex.value, p.q);
            let (x, yv) = (lay.x(ex.x), p.y(v));
            c.add(Shape::Circle(x, yv, 3.5), both(p.color, "bg", 2.0), "");
            let a = if x < ml + 60.0 { Anchor::Start } else if x > w - mr - 60.0 { Anchor::End } else { Anchor::Middle };
            c.text(x + shift(a, 6.0), if v >= 0.0 { yv - 8.0 } else { yv + 16.0 }, format!("{} {}", short(v, 4), self.sym(p.q)), "val", a);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ticks_are_round_numbers() {
        assert_eq!(nice_ticks(0.0, 6000.0, 6.0), [0.0, 1000.0, 2000.0, 3000.0, 4000.0, 5000.0, 6000.0]);
        assert_eq!(tick_labels(&nice_ticks(-0.3, 0.3, 4.0)), ["−0.2", "0", "0.2"]);
        assert_eq!(tick_labels(&[0.0, 2e5]), ["0", "2×10⁵"]);
    }
}
