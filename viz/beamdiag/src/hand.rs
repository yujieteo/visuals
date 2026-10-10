//! Hand calculations: a readable, step-by-step derivation of the stiffness solver's answer.
//!
//! The direct stiffness method in engine.rs is authoritative. This writes the same answer the way it is
//! worked by hand, so it can be followed and checked on paper:
//!
//!   reactions   statically determinate: equilibrium, sum of forces and of moments about a support;
//!               indeterminate: compatibility (the force method) through Macaulay's double
//!               integration of EI v'' = M(x): two equilibrium equations, plus v = 0 at every
//!               support and v' = 0 at every fixed support, in the reactions and the two
//!               integration constants
//!   segments    between consecutive supports and load points, V(x) and M(x) by the method of
//!               sections, then EI θ and EI v by integrating M, continuous from segment to segment
//!   a point     V, M, θ, v and the bending stress at any chosen x
//!   checks      peak bending stress, and the sums of forces and moments of loads and reactions
//!
//! Every number shown is the solver's value at that step, written with the page's formatters, in the
//! page's unit convention and origin of x. `derive` also carries the hand chain itself (the reactions
//! solved from the written equations, then V, M, θ and v carried segment by segment from them), which
//! the tests compare with the solver. Where a written-out system would be too large to follow (more
//! than WRITE_UNKNOWNS unknowns), the set-up and equations are stated generally and the solver's values
//! are listed instead of fabricated steps.

use crate::deck::{Frame, Meta, document};
use crate::engine::{Kind, Load, Model, Q, Side, Solved, Units, at, deflection, indeterminacy, intensity, internal, jmax, jmin, pw, scale_model};
use crate::fmt::{VOICE, counted, list, residual, say_number, sci, sig4, snf, spoken_unit, tex_number, tex_unit};
use crate::report::View;

/// Largest linear system written out in full, and longest sum written term by term.
pub const WRITE_UNKNOWNS: usize = 8;
const WRITE_TERMS: usize = 14;

/// <d>ⁿ for d = x − a: zero left of a.
fn mac(d: f64, n: i32) -> f64 { if d > 0.0 { pw(d, n) } else { 0.0 } }

/// Gaussian elimination with partial pivoting on an equilibrated copy; None when singular.
pub fn solve_dense(a: &[Vec<f64>], b: &[f64]) -> Option<Vec<f64>> {
    let n = b.len();
    let mut a: Vec<Vec<f64>> = a.iter().zip(b).map(|(row, bi)| {
        let s = row.iter().fold(f64::NEG_INFINITY, |m, v| jmax(m, v.abs()));
        let s = if s == 0.0 || s.is_nan() { 1.0 } else { s };
        row.iter().map(|v| v / s).chain([bi / s]).collect()
    }).collect();
    for c in 0..n {
        let mut p = c;
        for r in c + 1..n { if a[r][c].abs() > a[p][c].abs() { p = r } }
        if !(a[p][c].abs() > 1e-14) { return None }
        a.swap(c, p);
        for r in 0..n {
            if r == c || a[r][c] == 0.0 { continue }
            let f = a[r][c] / a[c][c];
            for k in c..=n { let v = f * a[c][k]; a[r][k] -= v }
        }
    }
    Some((0..n).map(|i| a[i][n] / a[i][i]).collect())
}

#[derive(Clone, Debug)]
pub struct CReaction { pub i: usize, pub kind: Kind, pub x: f64, pub xi: f64, pub fy: f64, pub mz: f64 }

/// A load in display units: positions from the display origin.
#[derive(Clone, Debug)]
enum CLoad { Dist { xi1: f64, xi2: f64, q1: f64, q2: f64 }, Point { n: usize, moment: bool, x: f64, xi: f64, f: f64, c: f64 } }

/// Everything about one beam in one unit convention and origin: numbers in display units, the
/// formatters, and the actions (loads and reactions) as Macaulay terms in x.
pub struct Ctx<'a> {
    pub r: &'a Solved,
    pub w: View<'a>,
    /// The largest |V|, |M|, |v| and |v|/L on the beam, SI.
    scale: [f64; 4],
    d: Model,
    o: f64,
    pub ei: f64,
    pub reactions: Vec<CReaction>,
    loads: Vec<CLoad>,
}

fn key(q: Q) -> Option<usize> { match q { Q::Force => Some(0), Q::Moment => Some(1), Q::Length => Some(2), Q::Angle => Some(3), _ => None } }

impl<'a> Ctx<'a> {
    pub fn new(r: &'a Solved, u: &'a Units, mid: bool) -> Ctx<'a> {
        let m = &r.model;
        let l = m.length;
        let w = View { u, mid, l };
        let ex = r.extremes;
        let scale = [ex.v_shear.value.abs(), ex.m.value.abs(), ex.v.value.abs(), ex.v.value.abs() / l];
        let d = scale_model(m, u, false, false);
        let o = if mid { d.length / 2.0 } else { 0.0 };
        let ei = d.e * d.section.i;
        let reactions = r.reactions.iter().enumerate().map(|(i, re)| CReaction { i: i + 1, kind: re.kind, x: re.x, xi: w.x(re.x), fy: w.show(re.fy, Q::Force), mz: w.show(re.mz, Q::Moment) }).collect();
        // d.loads[j] is m.loads[j] in display units, the same kind of load.
        let loads = m.loads.iter().zip(&d.loads).enumerate().map(|(j, (l, s))| match (*l, *s) {
            (Load::Dist { .. }, Load::Dist { x1, x2, q1, q2 }) => CLoad::Dist { xi1: x1 - o, xi2: x2 - o, q1, q2 },
            (Load::Point { x, .. }, Load::Point { x: sx, f }) => CLoad::Point { n: j + 1, moment: false, x, xi: sx - o, f, c: 0.0 },
            (Load::Moment { x, .. }, Load::Moment { x: sx, c }) => CLoad::Point { n: j + 1, moment: true, x, xi: sx - o, f: 0.0, c },
            _ => unreachable!("scaling keeps each load's kind"),
        }).collect();
        Ctx { r, w, scale, d, o, ei, reactions, loads }
    }
    fn show(&self, si: f64, q: Q) -> f64 { self.w.show(si, q) }
    fn sym(&self, q: Q) -> &'static str { self.w.sym(q) }
    fn tex(&self, t: &str) -> String { tex_number(t) }
    fn tex_p(&self, t: &str) -> String { if t.starts_with('−') { format!("({})", tex_number(t)) } else { tex_number(t) } }
    fn tq(&self, t: &str, q: Q) -> String { format!("{}\\ {}", tex_number(t), tex_unit(self.sym(q))) }
    fn say(&self, t: &str, q: Q) -> String { self.w.say(t, q) }
    fn pos(&self, x: f64) -> String { sig4(self.w.x(x)) }
    fn say_pos(&self, x: f64) -> String { format!("x equals {}", self.say(&self.pos(x), Q::Length)) }
    /// A display value as the page writes it (shortNf), cleaned of round-off far below the largest value
    /// of the same kind on this beam.
    fn vtext(&self, value: f64, q: Q) -> String {
        let scale = key(q).map_or(0.0, |k| self.show(self.scale[k], q));
        snf(if value.abs() <= 1e-10 * scale.abs() { 0.0 } else { value })
    }
}

/* ---------- writing equations ---------- */

/// "c x" terms as TeX: [(coefficient, symbol)], zero coefficients left out, 1 written as the symbol.
fn linear(terms: &[(f64, String)]) -> String {
    let mut out = String::new();
    for (k, s) in terms {
        if *k == 0.0 { continue }
        let t = sig4(k.abs());
        let body = if s.is_empty() { tex_number(&t) } else if t == "1" { s.clone() } else { format!("{}\\,{s}", tex_number(&t)) };
        let sign = if out.is_empty() { if *k < 0.0 { "-" } else { "" } } else if *k < 0.0 { " - " } else { " + " };
        out += sign;
        out += &body;
    }
    if out.is_empty() { "0".into() } else { out }
}

fn power_name(v: &str, n: usize) -> String { match n { 0 => String::new(), 1 => v.into(), _ => format!("{v}^{{{n}}}") } }

/// A polynomial in s with coefficients [c0, c1, ...], dropping terms that are round-off at s = h.
fn poly(coef: &[f64], h: f64) -> String {
    let size = coef.iter().enumerate().fold(f64::NEG_INFINITY, |m, (n, k)| jmax(m, k.abs() * pw(h, n as i32)));
    linear(&coef.iter().enumerate().map(|(n, &k)| (if k.abs() * pw(h, n as i32) <= 1e-10 * size { 0.0 } else { k }, power_name("s", n))).collect::<Vec<_>>())
}
fn eval_poly(coef: &[f64], s: f64) -> f64 { coef.iter().enumerate().fold(0.0, |acc, (n, k)| acc + k * pw(s, n as i32)) }

/// The bracket <x − a>ⁿ in the display coordinate.
fn bracket(a: f64, n: i32) -> String {
    let t = sig4(a.abs());
    let inner = if a == 0.0 || t == "0" { "x".into() } else { format!("x {} {}", if a > 0.0 { "-" } else { "+" }, tex_number(&t)) };
    format!("\\langle {inner}\\rangle{}", if n == 1 { String::new() } else { format!("^{{{n}}}") })
}

/// A sum of already formatted terms, written out when short and then totalled.
fn sum_of(texts: &[String], total: &str) -> String {
    if texts.len() > WRITE_TERMS || texts.len() <= 1 { return tex_number(total) }
    let body: String = texts.iter().enumerate().map(|(i, t)| if i == 0 { t.clone() } else if let Some(r) = t.strip_prefix('-') { format!(" - {r}") } else { format!(" + {t}") }).collect();
    format!("{body} = {}", tex_number(total))
}

/* ---------- load resultants ---------- */

struct Action { f: f64, mo: f64, f_tex: Option<String>, m_tex: String }

/// Each load's vertical force and its moment about the display coordinate `reference`,
/// counter-clockwise positive, as display numbers with TeX for both. A trapezoid is a rectangle plus
/// a triangle, here split into two triangles so a load whose ends have opposite signs needs no special case.
fn actions(c: &Ctx, reference: f64) -> Vec<Action> {
    let mut out = vec![];
    for l in &c.loads {
        match *l {
            CLoad::Point { moment: false, xi, f, .. } => {
                let arm = xi - reference;
                out.push(Action { f, mo: f * arm, f_tex: Some(tex_number(&sig4(f))), m_tex: format!("{} \\times {}", c.tex_p(&sig4(f)), c.tex_p(&sig4(arm))) });
            }
            CLoad::Point { moment: true, c: cc, .. } => out.push(Action { f: 0.0, mo: cc, f_tex: None, m_tex: tex_number(&sig4(cc)) }),
            CLoad::Dist { xi1, xi2, q1, q2 } => {
                let b = xi2 - xi1;
                let parts = if q1 == q2 { vec![(q1 * b, xi1 + b / 2.0)] } else { vec![(q1 * b / 2.0, xi1 + b / 3.0), (q2 * b / 2.0, xi1 + 2.0 * b / 3.0)] };
                for (w, at) in parts {
                    if w == 0.0 { continue }
                    out.push(Action { f: w, mo: w * (at - reference), f_tex: Some(tex_number(&sig4(w))), m_tex: format!("{} \\times {}", c.tex_p(&sig4(w)), c.tex_p(&sig4(at - reference))) });
                }
            }
        }
    }
    out
}

/// A Macaulay term: coefficient, position, power.
type Term = (f64, f64, i32);

/// Macaulay terms of M(x) from the loads, display units.
fn load_terms(c: &Ctx) -> Vec<Term> {
    let mut out = vec![];
    for l in &c.loads {
        match *l {
            CLoad::Point { moment: false, xi, f, .. } if f != 0.0 => out.push((f, xi, 1)),
            CLoad::Point { moment: true, xi, c: cc, .. } if cc != 0.0 => out.push((-cc, xi, 0)),
            CLoad::Dist { xi1, xi2, q1, q2 } => {
                let s = (q2 - q1) / (xi2 - xi1);
                out.extend([(q1 / 2.0, xi1, 2), (s / 6.0, xi1, 3), (-q2 / 2.0, xi2, 2), (-s / 6.0, xi2, 3)]);
            }
            _ => {}
        }
    }
    out.into_iter().filter(|t| t.0 != 0.0).collect()
}

/// The k-fold integral of the terms at x.
fn integrated(terms: &[Term], k: i32, x: f64) -> f64 {
    terms.iter().fold(0.0, |acc, &(coef, a, p)| {
        let den = (p + 1..=p + k).fold(1.0, |d, n| d * n as f64);
        acc + coef * (if p + k == 0 { if x >= a { 1.0 } else { 0.0 } } else { mac(x - a, p + k) }) / den
    })
}

/* ---------- the derivation ---------- */

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UKind { R, M, C1, C2 }
#[derive(Clone, Debug)]
pub struct Unknown { pub name: String, pub kind: UKind, /// Index of the reaction it belongs to.
    pub r: Option<usize> }
#[derive(Clone, Debug)]
pub struct Row { pub label: String, pub what: String, pub coef: Vec<f64>, pub rhs: f64 }

/// V, M, θ and v at a point (display units, θ in rad).
#[derive(Clone, Copy, Debug, Default)]
pub struct State { pub v_shear: f64, pub m: f64, pub theta: f64, pub v: f64 }

#[derive(Clone, Debug)]
struct Jump { name: String, value: f64, reaction: Option<usize>, moment: bool }

/// One segment between consecutive events: the solver's values and the jumps at its start.
#[derive(Clone, Debug)]
pub struct Segment {
    pub index: usize, pub a: f64, pub b: f64, pub xa: f64, pub xb: f64, pub h: f64, pub qa: f64, pub qb: f64, pub k: f64,
    pub start: State, pub end: State, before: (f64, f64), jumps: Vec<Jump>,
    /// V, M, EI θ and EI v as polynomials in s = x − a.
    pub poly: [Vec<f64>; 4],
    stationary: Vec<(f64, f64, f64)>,
    support_at_end: Option<usize>,
    /// The hand chain's values at both ends.
    pub hand: (State, State),
}

pub struct Equilibria { pub sum_f: f64, pub sum_m0: f64, pub sum_r: f64, pub sum_mr: f64, pub resid: f64 }

pub struct Derivation<'a> {
    pub c: Ctx<'a>, pub deg: i64, pub unknowns: Vec<Unknown>, pub rows: Vec<Row>, pub solver: Vec<f64>, pub hand: Option<Vec<f64>>, pub written: bool,
    pub segments: Vec<Segment>, known: Vec<Term>, pub equilibrium: Equilibria, pub ends: [f64; 2],
}

pub fn derive<'a>(r: &'a Solved, u: &'a Units, mid: bool) -> Derivation<'a> {
    let c = Ctx::new(r, u, mid);
    let deg = indeterminacy(&r.model.supports);
    let (xi0, xil) = (-c.o, c.d.length - c.o);
    // Unknowns: each reaction force and fixed-support moment, then the integration constants.
    let mut unknowns = vec![];
    for (j, re) in c.reactions.iter().enumerate() {
        unknowns.push(Unknown { name: format!("R_{{{}}}", re.i), kind: UKind::R, r: Some(j) });
        if re.kind == Kind::Fixed { unknowns.push(Unknown { name: format!("M_{{{}}}", re.i), kind: UKind::M, r: Some(j) }) }
    }
    unknowns.push(Unknown { name: "C_1".into(), kind: UKind::C1, r: None });
    unknowns.push(Unknown { name: "C_2".into(), kind: UKind::C2, r: None });
    let known = load_terms(&c);
    let about0 = actions(&c, xi0);
    let sum_f = about0.iter().fold(0.0, |s, a| s + a.f);
    let sum_m0 = about0.iter().fold(0.0, |s, a| s + a.mo);
    let rx = |k: &Unknown| c.reactions[k.r.unwrap()].xi;
    let mut rows = vec![
        Row { label: "\\sum F_y = 0".into(), what: "vertical equilibrium".into(), coef: unknowns.iter().map(|k| if k.kind == UKind::R { 1.0 } else { 0.0 }).collect(), rhs: -sum_f },
        Row { label: format!("\\sum M_{{x = {}}} = 0", tex_number(&sig4(xi0))), what: "moments about the left end".into(),
            coef: unknowns.iter().map(|k| match k.kind { UKind::R => rx(k) - xi0, UKind::M => 1.0, _ => 0.0 }).collect(), rhs: -sum_m0 },
    ];
    for s in &c.reactions {
        let at = s.xi;
        rows.push(Row { label: format!("v({}) = 0", tex_number(&sig4(at))), what: format!("no deflection at support {}", s.i),
            coef: unknowns.iter().map(|k| match k.kind { UKind::R => mac(at - rx(k), 3) / 6.0, UKind::M => -mac(at - rx(k), 2) / 2.0, UKind::C1 => at, UKind::C2 => 1.0 }).collect(),
            rhs: -integrated(&known, 2, at) });
        if s.kind == Kind::Fixed {
            rows.push(Row { label: format!("\\theta({}) = 0", tex_number(&sig4(at))), what: format!("no rotation at fixed support {}", s.i),
                coef: unknowns.iter().map(|k| match k.kind { UKind::R => mac(at - rx(k), 2) / 2.0, UKind::M => -mac(at - rx(k), 1), UKind::C1 => 1.0, UKind::C2 => 0.0 }).collect(),
                rhs: -integrated(&known, 1, at) });
        }
    }
    // The solver's values of the unknowns, in display units: the integration constants are EI θ and EI v
    // at the left end, re-expressed for brackets measured in the display coordinate.
    let start = r.displacements[0];
    let (theta0, v0) = (start.theta, c.show(start.v, Q::Length));
    let ei = c.ei;
    let solver: Vec<f64> = unknowns.iter().map(|k| match k.kind {
        UKind::R => c.reactions[k.r.unwrap()].fy, UKind::M => c.reactions[k.r.unwrap()].mz, UKind::C1 => ei * theta0, UKind::C2 => ei * v0 - ei * theta0 * xi0,
    }).collect();
    // The hand solution: equilibrium alone when determinate, the whole system when it is small enough.
    let (mut hand, mut written) = (None, true);
    if deg == 0 { hand = Some(statics(&c, &unknowns, &rows)) }
    else if unknowns.len() <= WRITE_UNKNOWNS { hand = solve_dense(&rows.iter().map(|r| r.coef.clone()).collect::<Vec<_>>(), &rows.iter().map(|r| r.rhs).collect::<Vec<_>>()) }
    else { written = false }
    let hand_reactions = hand.clone().unwrap_or_else(|| solver.clone());
    // Segment by segment: V and M by sections from the solver's left-limit values; θ and v integrated.
    let xs: Vec<f64> = r.displacements.iter().map(|p| p.x).collect();
    let n = unknowns.len();
    let (c1, c2) = (hand_reactions[n - 2], hand_reactions[n - 1]);
    let mut chain = State { v_shear: 0.0, m: 0.0, theta: c1 / ei, v: (c1 * xi0 + c2) / ei };
    let mut segments = vec![];
    for e in 0..xs.len() - 1 {
        let mut seg = segment(&c, xs[e], xs[e + 1], e);
        // Hand chain: jumps at a from the hand reactions and the loads, then the polynomials across.
        let (mut dv, mut dm) = (0.0, 0.0);
        for j in &seg.jumps {
            let k = j.reaction.and_then(|ri| unknowns.iter().position(|q| q.r == Some(ri) && q.kind == if j.moment { UKind::M } else { UKind::R }));
            let value = k.map_or(j.value, |k| hand_reactions[k]);
            if j.moment { dm -= value } else { dv += value }
        }
        let h = seg.h;
        let (va, ma) = (chain.v_shear + dv, chain.m + dm);
        let vc = [va, seg.qa, seg.k / 2.0];
        let mc = [ma, va, seg.qa / 2.0, seg.k / 6.0];
        let tc = [ei * chain.theta, ma, va / 2.0, seg.qa / 6.0, seg.k / 24.0];
        let dc = [ei * chain.v, ei * chain.theta, ma / 2.0, va / 6.0, seg.qa / 24.0, seg.k / 120.0];
        let end = State { v_shear: eval_poly(&vc, h), m: eval_poly(&mc, h), theta: eval_poly(&tc, h) / ei, v: eval_poly(&dc, h) / ei };
        seg.hand = (State { v_shear: va, m: ma, theta: chain.theta, v: chain.v }, end);
        chain = end;
        segments.push(seg);
    }
    let resid = residual(&r.equilibrium);
    let sum_r = c.reactions.iter().fold(0.0, |s, re| s + re.fy);
    let sum_mr = c.reactions.iter().fold(0.0, |s, re| s + re.fy * (re.xi - xi0) + re.mz);
    Derivation { deg, unknowns, rows, solver, hand, written, segments, known, equilibrium: Equilibria { sum_f, sum_m0, sum_r, sum_mr, resid }, ends: [xi0, xil], c }
}

/// Reactions of a determinate beam from equilibrium alone, in the order of `unknowns`.
fn statics(c: &Ctx, unknowns: &[Unknown], rows: &[Row]) -> Vec<f64> {
    let r = &c.reactions;
    let mut out = vec![0.0; unknowns.len()];
    let reference = r[0].xi;
    let acts = actions(c, reference);
    let sum_f = acts.iter().fold(0.0, |s, a| s + a.f);
    let sum_m = acts.iter().fold(0.0, |s, a| s + a.mo);
    let first = |p: &dyn Fn(&Unknown) -> bool| unknowns.iter().position(p).unwrap();
    if r.len() == 2 { // two pins
        let r2 = -sum_m / (r[1].xi - reference);
        out[first(&|k| k.r == Some(1))] = r2;
        out[first(&|k| k.r == Some(0))] = -sum_f - r2;
    } else { // one fixed support
        out[first(&|k| k.kind == UKind::R)] = -sum_f;
        out[first(&|k| k.kind == UKind::M)] = -sum_m;
    }
    // The integration constants from the boundary-condition rows, with the reactions now known.
    let n = unknowns.len();
    let (a, b): (Vec<Vec<f64>>, Vec<f64>) = rows[2..].iter().map(|row| {
        let rest = row.coef[..n - 2].iter().enumerate().fold(0.0, |s, (i, k)| s + k * out[i]);
        (vec![row.coef[n - 2], row.coef[n - 1]], row.rhs - rest)
    }).unzip();
    // The two boundary conditions of a stable determinate beam fix C_1 and C_2.
    let cs = solve_dense(&a, &b).unwrap_or_else(|| vec![f64::NAN; 2]);
    out[n - 2] = cs[0];
    out[n - 1] = cs[1];
    out
}

fn segment(c: &Ctx, a: f64, b: f64, e: usize) -> Segment {
    let (r, m) = (c.r, &c.r.model);
    let h = c.show(b - a, Q::Length);
    let qa = c.show(intensity(m, a, Side::Right), Q::Distributed);
    let qb = c.show(intensity(m, b, Side::Left), Q::Distributed);
    let k = (qb - qa) / h;
    let start = internal(r, a, Side::Right);
    let end = internal(r, b, Side::Left);
    let before = if e == 0 { (0.0, 0.0) } else { internal(r, a, Side::Left) };
    let (da, db) = (deflection(r, a), deflection(r, b));
    let s = State { v_shear: c.show(start.0, Q::Force), m: c.show(start.1, Q::Moment), theta: da.1, v: c.show(da.0, Q::Length) };
    let en = State { v_shear: c.show(end.0, Q::Force), m: c.show(end.1, Q::Moment), theta: db.1, v: c.show(db.0, Q::Length) };
    let mut jumps = vec![];
    for (j, re) in c.reactions.iter().enumerate() {
        if re.x == a {
            jumps.push(Jump { name: format!("R_{{{}}}", re.i), value: re.fy, reaction: Some(j), moment: false });
            if re.kind == Kind::Fixed { jumps.push(Jump { name: format!("M_{{{}}}", re.i), value: re.mz, reaction: Some(j), moment: true }) }
        }
    }
    for l in &c.loads {
        if let CLoad::Point { n, moment, x, f, c: cc, .. } = *l && x == a {
            jumps.push(if moment { Jump { name: format!("C_{{{n}}}"), value: cc, reaction: None, moment: true } } else { Jump { name: format!("P_{{{n}}}"), value: f, reaction: None, moment: false } });
        }
    }
    // Polynomials in s = x − a from the solver's values at a⁺.
    let ei = c.ei;
    let poly = [vec![s.v_shear, qa, k / 2.0], vec![s.m, s.v_shear, qa / 2.0, k / 6.0], vec![ei * s.theta, s.m, s.v_shear / 2.0, qa / 6.0, k / 24.0],
        vec![ei * s.v, ei * s.theta, s.m / 2.0, s.v_shear / 6.0, qa / 24.0, k / 120.0]];
    // Zero shear inside the segment: the bending moment is stationary there.
    let mut roots = vec![];
    let (a2, a1, a0) = (k / 2.0, qa, s.v_shear);
    let size = a0.abs() + a1.abs() * h + a2.abs() * h * h;
    if size > 0.0 {
        let cand = if a2.abs() * h * h <= 1e-12 * size { if a1 != 0.0 { vec![-a0 / a1] } else { vec![] } } else {
            let disc = a1 * a1 - 4.0 * a2 * a0;
            if disc < 0.0 { vec![] } else { vec![(-a1 + disc.sqrt()) / (2.0 * a2), (-a1 - disc.sqrt()) / (2.0 * a2)] }
        };
        roots.extend(cand.into_iter().filter(|&s| s > 1e-9 * h && s < h * (1.0 - 1e-9)));
    }
    roots.sort_by(|p, q| p.partial_cmp(q).unwrap());
    let stationary = roots.into_iter().map(|s| { let x = a + (b - a) * s / h; (s, x, c.show(internal(r, x, Side::Right).1, Q::Moment)) }).collect();
    Segment {
        index: e + 1, a, b, xa: c.w.x(a), xb: c.w.x(b), h, qa, qb, k, start: s, end: en, before: (c.show(before.0, Q::Force), c.show(before.1, Q::Moment)),
        jumps, poly, stationary, support_at_end: c.reactions.iter().position(|re| re.x == b), hand: (State::default(), State::default()),
    }
}

/* ---------- frames ---------- */

#[derive(Clone, Debug)]
pub struct Item { pub text: String, pub said: String }

/// A block of a frame: a paragraph (which may list items a deck continues over slides), a display
/// equation, a list or a table.
#[derive(Clone, Debug)]
pub enum Block { P(String), Items { text: String, lead: String, items: Vec<Item> }, Eq(String), List(Vec<String>), Table(Vec<String>, Vec<Vec<String>>) }
use Block::{Eq, List, P, Table};

/// A narrated cut of a frame: from block `at`, under its own title on a slide.
#[derive(Clone, Debug)]
pub struct Part { pub at: usize, pub title: Option<String>, pub narration: String }

#[derive(Clone, Debug)]
pub struct HFrame { pub title: String, pub deck_title: Option<String>, pub blocks: Vec<Block>, pub narration: String, pub parts: Vec<Part> }

fn part(at: usize, title: &str, narration: impl Into<String>) -> Part { Part { at, title: Some(title.into()), narration: narration.into() } }
fn first_part(narration: impl Into<String>) -> Part { Part { at: 0, title: None, narration: narration.into() } }
fn capital(s: &str) -> String { let mut c = s.chars(); c.next().map_or(String::new(), |f| f.to_uppercase().collect::<String>() + c.as_str()) }

fn authority_frame(d: &Derivation) -> HFrame {
    let (c, deg) = (&d.c, d.deg);
    let r: i64 = c.r.model.supports.iter().map(|s| if s.kind == Kind::Fixed { 2 } else { 1 }).sum();
    let method = if deg == 0 { "equilibrium alone (sum of vertical forces and sum of moments)" } else { "compatibility, the force method, worked with Macaulay's double integration of EI v″ = M(x)" };
    let said = ["These hand calculations derive the solver's answer step by step.".into(),
        "The stiffness solver is authoritative, and every number shown is its value, so the hand steps and the solver agree to the digits shown.".into(),
        if deg == 0 { "The beam is statically determinate, so equilibrium alone gives the reactions.".into() }
        else { format!("The beam is statically indeterminate to degree {deg}, so the reactions come from compatibility, worked by Macaulay's method of double integration.") }].join(" ");
    HFrame {
        title: "Hand calculations: method, and how they relate to the solver".into(),
        deck_title: Some("Hand calculations: method and the solver".into()),
        blocks: vec![
            P("The direct stiffness solver is authoritative. These steps are a readable derivation of the same answer: every number shown is the solver's value at that step, written as this page writes it, and carrying the hand steps through reproduces it to the digits shown.".into()),
            Eq(format!("n = r - 2 = {r} - 2 = {deg}")),
            P(if deg == 0 { format!("The beam is statically determinate, so the reactions follow from {method}.") }
                else { format!("The beam is statically indeterminate to degree {deg}. The reactions are found by {method}: two equilibrium equations, plus $v = 0$ at every support and $\\theta = 0$ at every fixed support, solved together with the two integration constants. The three-moment equation or slope-deflection would give the same reactions.") }),
            List(vec![
                format!("Units: {}. $x$ in {}, measured from {}.", c.w.u.label, c.sym(Q::Length), if c.w.mid { "mid-span, negative to the left" } else { "the left end" }),
                "Forces and distributed loads positive up; couples, slopes and support moments positive counter-clockwise.".into(),
                "$V(x)$ is the sum of the upward forces left of the section; $M(x)$ is positive when sagging; $dM/dx = V$, $dV/dx = q$ and $EI\\,v'' = M$.".into(),
                format!("$EI = {}$.", c.tq(&sci(c.ei), Q::Rigidity)),
            ]),
        ],
        parts: vec![first_part(said.clone()), part(3, "Hand calculations: units and sign conventions", "The units and sign conventions used throughout are listed here.")],
        narration: said,
    }
}

fn constants(c: &Ctx, solver: &[f64], with_theta: Option<&str>) -> String {
    let n = solver.len();
    format!("C_1 = {}{}, \\qquad C_2 = {}\\ {}", with_theta.map_or(String::new(), |t| format!("EI\\,\\theta({t}) = ")), c.tq(&sig4(solver[n - 2]), Q::Rigidity),
        tex_number(&sig4(solver[n - 1])), tex_unit(&format!("{}·{}³", c.sym(Q::Force), c.sym(Q::Length))))
}

fn reaction_frames(d: &Derivation) -> Vec<HFrame> {
    let (c, deg, unknowns, rows, solver) = (&d.c, d.deg, &d.unknowns, &d.rows, &d.solver);
    let r = &c.reactions;
    let find = |j: usize, kind: UKind| unknowns.iter().position(|k| k.r == Some(j) && k.kind == kind);
    let rq = |k: usize| if unknowns[k].kind == UKind::M { Q::Moment } else { Q::Force };
    let rtext = |k: usize| c.vtext(solver[k], rq(k));
    let reaction_said: Vec<String> = (0..r.len()).map(|j| {
        let k_r = find(j, UKind::R).unwrap();
        format!("R {} is {}{}", r[j].i, c.say(&rtext(k_r), Q::Force), find(j, UKind::M).map_or(String::new(), |k_m| format!(" with a support moment of {}", c.say(&rtext(k_m), Q::Moment))))
    }).collect();
    let result_table = Table(vec!["Unknown".into(), "Value".into(), "Where".into()], unknowns.iter().enumerate().filter(|(_, k)| matches!(k.kind, UKind::R | UKind::M))
        .map(|(i, k)| { let re = &r[k.r.unwrap()]; vec![format!("${}$", k.name), format!("{} {}", rtext(i), c.sym(rq(i))), format!("{} at x = {} {}", re.kind.name(), sig4(re.xi), c.sym(Q::Length))] }).collect());

    if deg == 0 {
        let reference = &r[0];
        let acts = actions(c, reference.xi);
        let sum_f = acts.iter().fold(0.0, |s, a| s + a.f);
        let sum_m = acts.iter().fold(0.0, |s, a| s + a.mo);
        let f_t: Vec<String> = acts.iter().filter_map(|a| a.f_tex.clone()).collect();
        let m_t: Vec<String> = acts.iter().map(|a| a.m_tex.clone()).collect();
        let (s_f, s_m) = (snf(sum_f), snf(sum_m));
        let mut blocks = vec![
            P(format!("Each load's vertical force and its moment about support 1 at x = {} {} (counter-clockwise positive; a distributed load acts through its resultant):", sig4(reference.xi), c.sym(Q::Length))),
            Eq(format!("\\sum_j F_j = {}\\ {}", sum_of(&f_t, &s_f), tex_unit(c.sym(Q::Force)))),
            Eq(format!("\\sum_j m_j = {}\\ {}", sum_of(&m_t, &s_m), tex_unit(c.sym(Q::Moment)))),
        ];
        let said: [String; 2];
        if r.len() == 2 {
            let (k1, k2) = (unknowns.iter().position(|k| k.r == Some(0)).unwrap(), unknowns.iter().position(|k| k.r == Some(1)).unwrap());
            let span = sig4(r[1].xi - reference.xi);
            blocks.extend([
                P("Moments about support 1, where $R_1$ has no arm:".into()),
                Eq(format!("R_2 \\times {} + \\sum_j m_j = 0 \\quad\\Rightarrow\\quad R_2 = -\\frac{{{}}}{{{}}} = {}", c.tex_p(&span), c.tex(&s_m), c.tex(&span), c.tq(&rtext(k2), Q::Force))),
                P("Vertical equilibrium then gives $R_1$:".into()),
                Eq(format!("R_1 + R_2 + \\sum_j F_j = 0 \\quad\\Rightarrow\\quad R_1 = -{} - {} = {}", c.tex_p(&s_f), c.tex_p(&rtext(k2)), c.tq(&rtext(k1), Q::Force))),
            ]);
            said = [format!("Taking moments about support 1 gives R 2 equals {}", c.say(&rtext(k2), Q::Force)), format!("vertical equilibrium then gives R 1 equals {}", c.say(&rtext(k1), Q::Force))];
        } else {
            let (k_r, k_m) = (unknowns.iter().position(|k| k.kind == UKind::R).unwrap(), unknowns.iter().position(|k| k.kind == UKind::M).unwrap());
            blocks.extend([
                P("Vertical equilibrium and moments about the fixed support:".into()),
                Eq(format!("R_1 + \\sum_j F_j = 0 \\quad\\Rightarrow\\quad R_1 = -{} = {}", c.tex_p(&s_f), c.tq(&rtext(k_r), Q::Force))),
                Eq(format!("M_1 + \\sum_j m_j = 0 \\quad\\Rightarrow\\quad M_1 = -{} = {}", c.tex_p(&s_m), c.tq(&rtext(k_m), Q::Moment))),
            ]);
            said = [format!("Vertical equilibrium gives R 1 equals {}", c.say(&rtext(k_r), Q::Force)), format!("moments about the fixed support give a support moment of {}", c.say(&rtext(k_m), Q::Moment))];
        }
        if acts.len() > WRITE_TERMS { blocks.push(P(format!("The {} load terms are summed without being listed one by one.", acts.len()))) }
        let loads_said = format!("The loads add up to {} vertically.", c.say(&s_f, Q::Force));
        return vec![HFrame {
            title: "Reactions by equilibrium".into(), deck_title: None, blocks,
            narration: format!("{loads_said} {}, and {}.", said[0], said[1]),
            parts: vec![first_part(loads_said), part(2, "Reactions by equilibrium: moments of the loads", format!("Their moments about support 1 add up to {}.", c.say(&s_m, Q::Moment))),
                part(3, "Reactions by equilibrium: solving for them", format!("{}.", said[0])), part(5, "Reactions by equilibrium: solving for them (cont.)", format!("{}.", capital(&said[1])))],
        }];
    }

    // Indeterminate: the written system, or its general form when too large to follow.
    let names: Vec<&str> = unknowns.iter().map(|k| k.name.as_str()).collect();
    let n = unknowns.len();
    let setup = vec![
        P("Write the bending moment from every action left of $x$ with Macaulay brackets $\\langle x - a\\rangle^n$ (zero for $x < a$), integrate $EI\\,v'' = M$ twice, and impose equilibrium and the support conditions:".into()),
        Eq("M(x) = \\sum_i R_i \\langle x - a_i\\rangle - \\sum_i M_i \\langle x - a_i\\rangle^{0} + M_{\\text{loads}}(x)".into()),
        Eq("EI\\,v(x) = \\sum_i \\frac{R_i}{6} \\langle x - a_i\\rangle^{3} - \\sum_i \\frac{M_i}{2} \\langle x - a_i\\rangle^{2} + \\iint M_{\\text{loads}} + C_1 x + C_2".into()),
        P(format!("Unknowns: {}: {}, and as many equations.", names.iter().map(|n| format!("${n}$")).collect::<Vec<_>>().join(", "), counted(n, "unknown", "unknowns"))),
    ];
    let at_setup = setup.len();
    let mut frames = vec![];
    if d.written {
        let eqs = rows.iter().map(|row| Eq(format!("{}: \\quad {} = {}", row.label, linear(&row.coef.iter().zip(&names).map(|(k, nm)| (*k, nm.to_string())).collect::<Vec<_>>()), tex_number(&sig4(row.rhs)))));
        let said = [format!("With {}, there are {} and two constants of integration.", counted(r.len(), "support", "supports"), counted(n - 2, "unknown reaction", "unknown reactions")),
            "Two equations come from equilibrium, and the rest say the beam cannot deflect at a support or rotate at a fixed support.".to_string()];
        let in_numbers = "Compatibility equations in numbers";
        let mut blocks = setup;
        blocks.push(P("In numbers (coefficients to four significant figures):".into()));
        blocks.extend(eqs);
        let mut parts = vec![first_part(said[0].clone()), part(at_setup, in_numbers, said[1].clone())];
        parts.extend(rows.iter().enumerate().map(|(i, row)| part(at_setup + 1 + i, &format!("{in_numbers} (cont.)"), format!("{}.", capital(&row.what)))));
        frames.push(HFrame {
            title: format!("Compatibility: {} in the reactions and two integration constants", counted(n, "equation", "equations")),
            deck_title: Some(format!("Compatibility: {} in the unknowns", counted(n, "equation", "equations"))),
            blocks, narration: said.join(" "), parts,
        });
    } else {
        let mut blocks = setup;
        blocks.push(P(format!("With {n} unknowns the system is not worth working by hand. Its rows are $\\sum F_y = 0$, $\\sum M = 0$, $EI\\,v(a_s) = 0$ at each of the {} supports and $EI\\,v'(a_s) = 0$ at each fixed support; the values below are the stiffness solver's solution of the same conditions.", r.len())));
        frames.push(HFrame {
            title: format!("Compatibility: {}, too many to write out", counted(n, "equation", "equations")),
            deck_title: Some(format!("Compatibility: {n} equations, stated in general")),
            blocks, narration: format!("This beam has {n} unknowns, too many to work by hand, so the equations are stated in general and the solver's values are used."),
            parts: vec![first_part(format!("This beam has {n} unknowns, too many to work by hand.")), part(at_setup - 1, "Compatibility: the unknowns and the conditions", "So the equations are stated in general, and the solver's values are used.")],
        });
    }
    let said = format!("Solving gives {}.", list(&reaction_said));
    frames.push(HFrame {
        title: "Reactions from the compatibility equations".into(), deck_title: None,
        blocks: vec![result_table, Eq(constants(c, solver, None)),
            P(if d.written { "Solving the equations above reproduces these values, which are the solver's." } else { "These are the solver's values; the hand method above gives the same conditions." }.into())],
        parts: vec![first_part(said.clone())], narration: said,
    });
    frames
}

fn deflection_frame(d: &Derivation) -> HFrame {
    let (c, deg, rows, solver) = (&d.c, d.deg, &d.rows, &d.solver);
    let n = d.unknowns.len();
    // Terms at the right end vanish everywhere on the beam, so they are left out.
    let mut terms = d.known.clone();
    for re in &c.reactions { terms.extend([(re.fy, re.xi, 1), (-re.mz, re.xi, 0)]) }
    let terms: Vec<Term> = terms.into_iter().filter(|&(k, a, _)| k != 0.0 && a < d.ends[1]).collect();
    let mut blocks = vec![P("Integrate $EI\\,v'' = M(x)$ twice. Each Macaulay term $c\\langle x - a\\rangle^n$ integrates to $c\\langle x - a\\rangle^{n+1}/(n+1)$, which keeps $\\theta$ and $v$ continuous at every support and load:".into())];
    let (mut at_m, mut at_v) = (None, 1);
    if !terms.is_empty() && terms.len() <= WRITE_TERMS {
        at_m = Some(blocks.len());
        blocks.push(Eq(format!("M(x) = {}", linear(&terms.iter().map(|&(k, a, p)| (k, bracket(a, p))).collect::<Vec<_>>()))));
        at_v = blocks.len();
        blocks.push(Eq(format!("EI\\,v(x) = {} + C_1 x + C_2", linear(&terms.iter().map(|&(k, a, p)| (k / ((p + 1) * (p + 2)) as f64, bracket(a, p + 2))).collect::<Vec<_>>()))));
    } else {
        blocks.push(Eq("EI\\,v(x) = \\iint M(x)\\,dx\\,dx + C_1 x + C_2".into()));
    }
    let bc = &rows[2..];
    let at_bc = blocks.len();
    // The items let a deck continue a long list of conditions over slides.
    let items: Vec<Item> = bc.iter().map(|r| Item { text: format!("${}$ ({})", r.label, r.what), said: r.what.clone() }).collect();
    blocks.push(Block::Items { text: format!("Boundary conditions: {}.", items.iter().map(|t| t.text.as_str()).collect::<Vec<_>>().join("; ")), lead: "Boundary conditions: ".into(), items });
    if deg == 0 {
        blocks.push(P("With the reactions known, these give the two constants:".into()));
        for r in bc {
            let rest = r.coef[..n - 2].iter().enumerate().fold(0.0, |s, (i, k)| s + k * solver[i]);
            blocks.push(Eq(format!("{}: \\quad {} = {}", r.label, linear(&[(r.coef[n - 2], "C_1".into()), (r.coef[n - 1], "C_2".into())]), tex_number(&sig4(r.rhs - rest)))));
        }
    } else {
        blocks.push(P("They are the compatibility rows above, solved with the reactions.".into()));
    }
    let at_c = blocks.len();
    blocks.push(Eq(constants(c, solver, Some(&tex_number(&sig4(d.ends[0]))))));
    let (t0, v0) = (c.vtext(d.segments[0].start.theta, Q::Angle), c.vtext(d.segments[0].start.v, Q::Length));
    blocks.push(P(format!("So at the left end $\\theta$ = {t0} rad and $v$ = {v0} {}; each segment below starts from the slope and deflection the previous one ends with.", c.sym(Q::Length))));
    let said = ["Integrating the bending moment over E I twice gives the slope and the deflection, with two constants of integration.".to_string(),
        format!("The support conditions fix them, so at the left end the slope is {} radians and the deflection is {}.", say_number(&t0), c.say(&v0, Q::Length))];
    let mut parts = vec![first_part(said[0].clone())];
    if let Some(at) = at_m { parts.push(part(at, "Deflection and slope: the bending moment", "The bending moment carries a bracket term for every load and reaction.")) }
    parts.extend([part(at_v, "Deflection and slope: integrating twice", "Each bracket term integrates to the next power up, and the two constants of integration appear at the end."),
        part(at_bc, "Deflection and slope: boundary conditions", "The boundary conditions say the beam cannot deflect at a support, or rotate at a fixed support."),
        part(at_c, "Deflection and slope: the two constants", said[1].clone())]);
    HFrame { title: "Deflection and slope: double integration and boundary conditions".into(), deck_title: Some("Deflection and slope by double integration".into()), blocks, narration: said.join(" "), parts }
}

fn segment_frame(d: &Derivation, seg: &Segment) -> HFrame {
    let c = &d.c;
    let l = c.sym(Q::Length);
    let (xa, xb, ht) = (sig4(seg.xa), sig4(seg.xb), sig4(seg.h));
    let mut blocks = vec![P(format!("Cut the beam at $x$ between {xa} and {xb} {l} and keep the part to the left of the cut, with $s = x - {}$ running from 0 to {ht} {l}.", c.tex_p(&xa)))];
    // Start values: what the previous segment ends with, plus the jumps at x = a.
    let (s, before) = (seg.start, seg.before);
    let (vs, ms) = (c.vtext(s.v_shear, Q::Force), c.vtext(s.m, Q::Moment));
    let at = format!("{}^{{+}}", tex_number(&xa));
    let v_j: Vec<&Jump> = seg.jumps.iter().filter(|j| !j.moment).collect();
    let m_j: Vec<&Jump> = seg.jumps.iter().filter(|j| j.moment).collect();
    let names = |js: &[&Jump], sep: &str| js.iter().map(|j| j.name.as_str()).collect::<Vec<_>>().join(sep);
    let values = |js: &[&Jump], q: Q, sep: &str| js.iter().map(|j| c.tex_p(&c.vtext(j.value, q))).collect::<Vec<_>>().join(sep);
    blocks.push(Eq(if v_j.is_empty() { format!("V({at}) = V({}^{{-}}) = {}", tex_number(&xa), c.tq(&vs, Q::Force)) } else {
        format!("V({at}) = V({}^{{-}}) + {} = {} + {} = {}", tex_number(&xa), names(&v_j, " + "), c.tex_p(&c.vtext(before.0, Q::Force)), values(&v_j, Q::Force, " + "), c.tq(&vs, Q::Force))
    }));
    blocks.push(Eq(if m_j.is_empty() { format!("M({at}) = M({}^{{-}}) = {}", tex_number(&xa), c.tq(&ms, Q::Moment)) } else {
        format!("M({at}) = M({}^{{-}}) - {} = {} - {} = {}", tex_number(&xa), names(&m_j, " - "), c.tex_p(&c.vtext(before.1, Q::Moment)), values(&m_j, Q::Moment, " - "), c.tq(&ms, Q::Moment))
    }));
    // The section equations.
    let loaded = seg.qa != 0.0 || seg.k != 0.0;
    let at_v = blocks.len();
    blocks.push(if loaded { Eq(format!("q(s) = {}\\ {}", poly(&[seg.qa, seg.k], seg.h), tex_unit(c.sym(Q::Distributed)))) } else { P("No distributed load acts here, so $V$ is constant and $M$ is linear.".into()) });
    blocks.push(Eq(format!("V(s) = V({at}) + \\int_0^s q\\,ds = {}", poly(&seg.poly[0], seg.h))));
    blocks.push(Eq(format!("M(s) = M({at}) + \\int_0^s V\\,ds = {}", poly(&seg.poly[1], seg.h))));
    let at_theta = blocks.len();
    blocks.push(Eq(format!("EI\\,\\theta(s) = EI\\,\\theta({}) + \\int_0^s M\\,ds = {}", tex_number(&xa), poly(&seg.poly[2], seg.h))));
    blocks.push(Eq(format!("EI\\,v(s) = EI\\,v({}) + \\int_0^s \\theta\\,EI\\,ds = {}", tex_number(&xa), poly(&seg.poly[3], seg.h))));
    // Values at both ends, as the solver gives them.
    let e = seg.end;
    let row = |name: String, q: Q, s: f64, e: f64| vec![name, c.vtext(s, q), c.vtext(e, q)];
    let at_ends = blocks.len();
    blocks.push(Table(vec!["At".into(), format!("x = {xa}⁺"), format!("x = {xb}⁻")], vec![
        row(format!("V ({})", c.sym(Q::Force)), Q::Force, s.v_shear, e.v_shear), row(format!("M ({})", c.sym(Q::Moment)), Q::Moment, s.m, e.m),
        row("θ (rad)".into(), Q::Angle, s.theta, e.theta), row(format!("v ({l})"), Q::Length, s.v, e.v),
    ]));
    let mut notes = vec![];
    for &(st_s, st_x, st_m) in &seg.stationary {
        notes.push(format!("$V = 0$ at $s$ = {} {l} (x = {} {l}), where $M$ is stationary: $M$ = {} {}.", sig4(st_s), sig4(c.w.x(st_x)), c.vtext(st_m, Q::Moment), c.sym(Q::Moment)));
    }
    if seg.qa * seg.qb < 0.0 { notes.push(format!("$q = 0$ at $s$ = {} {l}, where $V$ is stationary.", sig4(-seg.qa / seg.k))) }
    if let Some(j) = seg.support_at_end {
        let sup = &c.reactions[j];
        notes.push(format!("Support {} at x = {xb} {l}: $v$ = {}{}, as the boundary condition requires.", sup.i, c.vtext(e.v, Q::Length),
            if sup.kind == Kind::Fixed { format!(" and $\\theta$ = {}", c.vtext(e.theta, Q::Angle)) } else { String::new() }));
    }
    if !notes.is_empty() { blocks.push(List(notes)) }
    let mut said = vec![
        format!("Segment {} runs from {} to {}.", seg.index, c.say_pos(seg.a), c.say(&sig4(seg.xb), Q::Length)),
        if loaded { "A distributed load acts here, so the shear force varies along it." } else { "No distributed load acts here, so the shear force is constant and the moment varies linearly." }.into(),
        format!("The shear force goes from {} to {}, and the bending moment from {} to {}.", c.say(&vs, Q::Force), c.say(&c.vtext(e.v_shear, Q::Force), Q::Force), c.say(&ms, Q::Moment), c.say(&c.vtext(e.m, Q::Moment), Q::Moment)),
    ];
    said.extend(seg.stationary.iter().map(|&(_, x, m)| format!("The shear force is zero at {}, where the moment reaches {}.", c.say_pos(x), c.say(&c.vtext(m, Q::Moment), Q::Moment))));
    said.push(format!("At the end of the segment the deflection is {}.", c.say(&c.vtext(e.v, Q::Length), Q::Length)));
    let name = format!("Segment {}", seg.index);
    HFrame {
        title: format!("{name}: x = {xa} to {xb} {l}"), deck_title: None, blocks, narration: said.join(" "),
        parts: vec![first_part(said[0].clone()), part(at_v, &format!("{name}: shear force and bending moment"), said[1..3].join(" ")),
            part(at_theta, &format!("{name}: slope and deflection"), "Integrating the bending moment once gives the slope, and twice the deflection, both carried on from the start of the segment."),
            part(at_ends, &format!("{name}: values at both ends"), said[3..].join(" "))],
    }
}

fn checks_frame(d: &Derivation) -> HFrame {
    let (c, q) = (&d.c, &d.equilibrium);
    let (m, ex) = (&c.r.model, c.r.extremes);
    let (mut blocks, mut said) = (vec![], vec![]);
    if let Some(fibre) = m.section.c {
        let m_max = sig4(c.show(ex.m.value, Q::Moment));
        let cc = sig4(c.show(fibre, Q::Length));
        let i = sci(c.show(m.section.i, Q::Inertia));
        let stress = sig4(c.show(ex.m.value.abs() * fibre / m.section.i, Q::Stress));
        blocks.push(P(format!("The largest moment is {m_max} {} at x = {} {}; the extreme fibre is $c$ = {cc} {} from the neutral axis.", c.sym(Q::Moment), c.pos(ex.m.x), c.sym(Q::Length), c.sym(Q::Length))));
        blocks.push(Eq(format!("\\sigma_{{\\max}} = \\frac{{|M|_{{\\max}}\\, c}}{{I}} = \\frac{{{} \\times {}}}{{{}}} = {}", tex_number(&sig4(c.show(ex.m.value, Q::Moment).abs())), tex_number(&cc), tex_number(&i), c.tq(&stress, Q::Stress))));
        said.push(format!("The peak bending stress is the largest moment times the extreme fibre distance over I, which is {}.", c.say(&stress, Q::Stress)));
    } else {
        blocks.push(P("The section has no extreme-fibre distance $c$, so the bending stress $\\sigma = M c / I$ is not evaluated.".into()));
        said.push("The section has no extreme fibre distance, so the bending stress is not evaluated.".into());
    }
    let (s_r, s_f, s_mr, s_m) = (snf(q.sum_r), snf(q.sum_f), snf(q.sum_mr), snf(q.sum_m0));
    let at_sums = blocks.len();
    blocks.extend([
        P("Equilibrium of the whole beam, loads and reactions together (moments about the left end):".into()),
        Eq(format!("\\sum F_y = \\sum_i R_i + \\sum_j F_j = {} + {} \\approx 0", c.tex_p(&s_r), c.tex_p(&s_f))),
        Eq(format!("\\sum M = \\sum_i (R_i\\,a_i + M_i) + \\sum_j m_j = {} + {} \\approx 0", c.tex_p(&s_mr), c.tex_p(&s_m))),
        P(format!("Relative error of the two sums: {}.", sci(q.resid))),
    ]);
    said.push(format!("The reactions add up to {} and the loads to {}, so the forces balance, and so do the moments, to a relative error of {}.", c.say(&s_r, Q::Force), c.say(&s_f, Q::Force), say_number(&sci(q.resid))));
    HFrame {
        title: if m.section.c.is_some() { "Bending stress and the equilibrium check" } else { "Equilibrium check" }.into(), deck_title: None, blocks, narration: said.join(" "),
        parts: vec![first_part(said[0].clone()), part(at_sums, "Equilibrium check", said[1].clone())],
    }
}

/// V, M, θ, v and σ at a chosen x (SI, measured from the left end), from the segment it lies in.
pub fn point_frame(d: &Derivation, x: f64) -> HFrame {
    let c = &d.c;
    let l = c.sym(Q::Length);
    let len = c.r.model.length;
    let x = jmin(len, jmax(0.0, x));
    let segs = &d.segments;
    let i = segs.iter().position(|s| x < s.b).unwrap_or(segs.len() - 1);
    let seg = &segs[i];
    let on_start = x == seg.a && i > 0;
    let s = c.show(x - seg.a, Q::Length);
    let (xt, st) = (sig4(c.w.x(x)), sig4(s));
    let sub = |coef: &[f64]| coef.iter().enumerate().map(|(n, &k)| (k, match n { 0 => String::new(), 1 => format!("({})", tex_number(&st)), _ => format!("({})^{{{n}}}", tex_number(&st)) })).collect::<Vec<_>>();
    let a = at(c.r, x);
    let (v, m) = if x >= len { (a.v_left, a.m_left) } else { (a.v_right, a.m_right) };
    let (vt, mt) = (c.vtext(c.show(v, Q::Force), Q::Force), c.vtext(c.show(m, Q::Moment), Q::Moment));
    let (tt, dt) = (c.vtext(a.theta, Q::Angle), c.vtext(c.show(a.v, Q::Length), Q::Length));
    let mut blocks = vec![P(format!("x = {xt} {l} lies in segment {} (x = {} to {} {l}), so $s = x - {}$ = {st} {l}.", seg.index, sig4(seg.xa), sig4(seg.xb), c.tex_p(&sig4(seg.xa))))];
    if on_start {
        blocks.push(P(format!("A support or load acts here, so $V$ and $M$ can jump: just to the left they are {} {} and {} {} (the end of segment {}); the values below are just to the right.",
            c.vtext(c.show(a.v_left, Q::Force), Q::Force), c.sym(Q::Force), c.vtext(c.show(a.m_left, Q::Moment), Q::Moment), c.sym(Q::Moment), seg.index - 1)));
    }
    let title = |name: &str| format!("At x = {xt} {l}: {name}");
    blocks.push(Eq(format!("V = {} = {}", linear(&sub(&seg.poly[0])), c.tq(&vt, Q::Force))));
    let at_m = blocks.len();
    blocks.push(Eq(format!("M = {} = {}", linear(&sub(&seg.poly[1])), c.tq(&mt, Q::Moment))));
    let at_theta = blocks.len();
    blocks.push(Eq(format!("\\theta = \\frac{{1}}{{EI}}\\left({}\\right) = {}\\ \\mathrm{{rad}}", linear(&sub(&seg.poly[2])), tex_number(&tt))));
    let at_v = blocks.len();
    blocks.push(Eq(format!("v = \\frac{{1}}{{EI}}\\left({}\\right) = {}", linear(&sub(&seg.poly[3])), c.tq(&dt, Q::Length))));
    let mut said = vec![format!("At {}, in segment {}, the shear force is {} and the bending moment {}.", c.say_pos(x), seg.index, c.say(&vt, Q::Force), c.say(&mt, Q::Moment)),
        format!("The slope is {} radians and the deflection {}.", say_number(&tt), c.say(&dt, Q::Length))];
    let mut parts = vec![first_part(format!("At {}, in segment {}, the shear force is {}.", c.say_pos(x), seg.index, c.say(&vt, Q::Force))),
        part(at_m, &title("bending moment"), format!("The bending moment is {}.", c.say(&mt, Q::Moment))),
        part(at_theta, &title("slope"), format!("The slope is {} radians.", say_number(&tt))),
        part(at_v, &title("deflection"), format!("The deflection is {}.", c.say(&dt, Q::Length)))];
    if let Some(fibre) = c.r.model.section.c {
        let st = sig4(c.show(m.abs() * fibre / c.r.model.section.i, Q::Stress));
        let narration = format!("The bending stress at the extreme fibre is {}.", c.say(&st, Q::Stress));
        parts.push(part(blocks.len(), &title("bending stress"), narration.clone()));
        blocks.push(Eq(format!("\\sigma = \\frac{{|M|\\,c}}{{I}} = {}", c.tq(&st, Q::Stress))));
        said.push(narration);
    }
    HFrame { title: format!("At the selected point x = {xt} {l}"), deck_title: None, blocks, narration: said.join(" "), parts }
}

/* ---------- assembling ---------- */

fn cell(t: &str) -> String { t.replace('|', "\\|") }

/// Blocks as Markdown with LaTeX maths, as beamdswitch reads it.
pub fn markdown_of(blocks: &[Block]) -> String {
    blocks.iter().map(|b| match b {
        P(p) | Block::Items { text: p, .. } => p.clone(),
        Eq(e) => format!("$$ {e} $$"),
        List(items) => items.iter().map(|t| format!("- {t}")).collect::<Vec<_>>().join("\n"),
        Table(head, rows) => {
            let mut out = vec![format!("| {} |", head.iter().map(|h| cell(h)).collect::<Vec<_>>().join(" | ")), format!("| {} |", vec!["---"; head.len()].join(" | "))];
            out.extend(rows.iter().map(|r| format!("| {} |", r.iter().map(|t| cell(t)).collect::<Vec<_>>().join(" | "))));
            out.join("\n")
        }
    }).collect::<Vec<_>>().join("\n\n")
}

/* ---------- slides that fit ----------
   beamdswitch lays a slide out at 1280 × 720 px: a 1136 × 506 px body in 30 px text, which it shrinks
   to no less than 18 px before the body clips, and a title on one line. Measured there, the body holds
   about 12 rows of 30 px text; a paragraph wraps after about 80 characters of Markdown; a display
   equation takes about 2 rows, 1.2 more per extra line and 0.5 more with a fraction, and fits the width
   while it draws about 63 characters; a table row takes 1.1 rows; a title fits on one line up to about
   53 characters. So a hand-calculation slide holds at most SLIDE_ROWS rows, its equations draw at most
   SLIDE_EQ_CHARS characters a line, its tables at most SLIDE_TABLE_ROWS rows, and its title at most 50
   characters: it then fits at full size. The page and the Markdown keep each frame whole; only the deck
   splits it, at the narrated `parts` the frame marks, and breaks long equations over lines, so every
   number is the same. */
pub const SLIDE_ROWS: f64 = 12.0;
const SLIDE_TEXT_CHARS: f64 = 80.0;
const SLIDE_EQ_CHARS: usize = 56;
const SLIDE_TABLE_ROWS: usize = 6;

/// Length as JavaScript counts it, in UTF-16 units.
fn units16(s: &str) -> usize { s.encode_utf16().count() }

/// Replaces every `\name{...}` (no nested braces) with its content.
fn unwrap_command(s: &str, name: &str) -> String {
    let pat = format!("\\{name}{{");
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find(&pat) {
        let after = &rest[i + pat.len()..];
        match after.find('}') {
            Some(j) if !after[..j].contains('}') => { out += &rest[..i]; out += &after[..j]; rest = &after[j + 1..]; }
            _ => { out += &rest[..i + pat.len()]; rest = after; }
        }
    }
    out + rest
}

/// Characters a TeX expression draws, roughly: commands as one glyph, \frac{1}{EI} as two, braces,
/// scripts and spacing as none.
pub fn drawn(tex: &str) -> usize {
    let mut s = unwrap_command(&unwrap_command(tex, "mathrm"), "text");
    // \times 10^{-4} draws as ×10-4.
    let mut out = String::new();
    let mut rest = s.as_str();
    while let Some(i) = rest.find("\\times 10^{") {
        let after = &rest[i + "\\times 10^{".len()..];
        let digits = after.strip_prefix('-').unwrap_or(after);
        let n = digits.bytes().take_while(u8::is_ascii_digit).count();
        if n > 0 && digits[n..].starts_with('}') {
            let e = &after[..after.len() - digits.len() + n];
            out += &rest[..i];
            out += "×10";
            out += e;
            rest = &digits[n + 1..];
        } else { out += &rest[..i + 1]; rest = &rest[i + 1..]; }
    }
    s = out + rest;
    for w in ["\\left", "\\right", "\\bigl", "\\bigr", "\\begin{aligned}", "\\end{aligned}"] { s = s.replace(w, "") }
    for w in ["\\,", "\\;", "\\:", "\\ "] { s = s.replace(w, " ") }
    s = s.replace("\\qquad", "    ").replace("\\quad", "  ").replace("\\frac{1}{EI}", "EI").replace("\\frac", "").replace("\\\\", "");
    // Any other command draws as one glyph.
    let mut t = String::new();
    let mut chars = s.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' && chars.peek().is_some_and(char::is_ascii_alphabetic) {
            while chars.peek().is_some_and(char::is_ascii_alphabetic) { chars.next(); }
            t.push('x');
        } else if !"{}^_&".contains(ch) { t.push(ch) }
    }
    units16(&t)
}

/// Rows a block takes on a slide at 30 px.
fn slide_rows(b: &Block) -> f64 {
    let text = |t: &str| (units16(t) as f64 / SLIDE_TEXT_CHARS).ceil();
    match b {
        P(p) | Block::Items { text: p, .. } => text(p),
        Eq(e) => 0.8 + 1.2 * e.split("\\\\").count() as f64 + if e.contains("\\frac") { 0.5 } else { 0.0 },
        List(items) => items.iter().fold(0.0, |n, t| n + text(t)),
        Table(_, rows) => 1.1 * (rows.len() + 1) as f64,
    }
}

/// A display equation as lines that each draw at most SLIDE_EQ_CHARS characters: each statement of
/// "a = …, \qquad b = …" on lines of its own, aligned on its first "=" and broken before a "+", "−" or
/// "=" outside any group or Macaulay bracket.
fn wrap_equation(tex: &str) -> String {
    if drawn(tex) <= SLIDE_EQ_CHARS { return tex.into() }
    let flat = tex.replace("\\left(", "\\bigl(").replace("\\right)", "\\bigr)");
    let mut lines = vec![];
    for statement in flat.split(", \\qquad ").enumerate().map(|(i, s)| if i + 1 < flat.split(", \\qquad ").count() { format!("{s},") } else { s.to_string() }) {
        match statement_lines(&statement) { Some(l) => lines.extend(l), None => return tex.into() }
    }
    format!("\\begin{{aligned}} {} \\end{{aligned}}", lines.join(" \\\\ "))
}

fn statement_lines(flat: &str) -> Option<Vec<String>> {
    let mut pieces = vec![];
    let (mut depth, mut from) = (0i32, 0usize);
    let b = flat.as_bytes();
    for i in 0..b.len() {
        let at = |p: &str| flat[i..].starts_with(p);
        if b[i] == b'{' { depth += 1 }
        else if b[i] == b'}' { depth -= 1 }
        else if at("\\langle") { depth += 1 }
        else if at("\\rangle") { depth -= 1 }
        else if depth == 0 && (at(" + ") || at(" - ") || at(" = ")) && i > from {
            pieces.push(&flat[from..i]);
            from = i + 1;
        }
    }
    pieces.push(&flat[from..]);
    let eq = pieces.iter().position(|p| p.starts_with("= "))?;
    if eq < 1 { return None }
    let lhs = pieces[..eq].join(" ");
    let lead = drawn(&lhs) + 3;
    let mut lines: Vec<Vec<&str>> = vec![vec![&pieces[eq][2..]]];
    for &p in &pieces[eq + 1..] {
        let line = lines.last_mut().unwrap();
        let mut with = line.clone();
        with.push(p);
        if lead + drawn(&with.join(" ")) <= SLIDE_EQ_CHARS { line.push(p) } else { lines.push(vec![p]) }
    }
    Some(lines.iter().enumerate().map(|(i, l)| if i == 0 { format!("{lhs} ={{}}& {}", l.join(" ")) } else if l[0].starts_with("= ") { format!("&{}", l.join(" ")) } else { format!("&\\quad {}", l.join(" ")) }).collect())
}

fn fitted(b: &Block) -> Block { match b { Eq(e) => Eq(wrap_equation(e)), _ => b.clone() } }
fn rows_of(blocks: &[Block]) -> f64 { blocks.iter().fold(0.0, |n, b| n + slide_rows(b)) }

/// A frame as deck slides: its parts packed in order, as many to a slide as fit in SLIDE_ROWS, a long
/// table or equation continuing on slides of its own. The first slide carries the frame's title (its
/// shorter deck title when it has one), each later one the title of the part it opens with.
pub fn slides_of(f: &HFrame) -> Vec<Frame> {
    let cuts = if f.parts.is_empty() { vec![first_part(f.narration.clone())] } else { f.parts.clone() };
    let frame_title = f.deck_title.clone().unwrap_or_else(|| f.title.clone());
    struct Cut { title: Option<String>, narration: String, blocks: Vec<Block> }
    let mut parts: Vec<Cut> = vec![];
    for (i, cut) in cuts.iter().enumerate() {
        parts.push(Cut { title: cut.title.clone(), narration: cut.narration.clone(), blocks: vec![] });
        let end = if i + 1 < cuts.len() { cuts[i + 1].at } else { f.blocks.len() };
        let (from, end) = (cut.at.min(f.blocks.len()), end.min(f.blocks.len()));
        for b in &f.blocks[from..end.max(from)] {
            let fit = fitted(b);
            if let Eq(e) = &fit && slide_rows(&fit) > SLIDE_ROWS {
                let inner = e.strip_prefix("\\begin{aligned} ").unwrap_or(e);
                let inner = inner.strip_suffix(" \\end{aligned}").unwrap_or(inner);
                let lines: Vec<&str> = inner.split(" \\\\ ").collect();
                let per = ((SLIDE_ROWS - 1.3) / 1.2).floor() as usize;
                for l in (0..lines.len()).step_by(per) {
                    if l > 0 { parts.push(Cut { title: Some(format!("{} (cont.)", cut.title.clone().unwrap_or_else(|| frame_title.clone()))), narration: "The equation continues.".into(), blocks: vec![] }) }
                    parts.last_mut().unwrap().blocks.push(Eq(format!("\\begin{{aligned}} {} \\end{{aligned}}", lines[l..(l + per).min(lines.len())].join(" \\\\ "))));
                }
                continue;
            }
            match b {
                Table(head, rows) if rows.len() > SLIDE_TABLE_ROWS => {
                    for r in (0..rows.len()).step_by(SLIDE_TABLE_ROWS) {
                        if r > 0 { parts.push(Cut { title: Some(format!("{frame_title} (cont.)")), narration: format!("The table continues with rows {} to {}.", r + 1, (r + SLIDE_TABLE_ROWS).min(rows.len())), blocks: vec![] }) }
                        parts.last_mut().unwrap().blocks.push(Table(head.clone(), rows[r..(r + SLIDE_TABLE_ROWS).min(rows.len())].to_vec()));
                    }
                }
                _ => parts.last_mut().unwrap().blocks.push(fit),
            }
        }
    }
    // A paragraph that lists items and would not fit continues on slides of its own.
    let mut i = 0;
    while i < parts.len() {
        let found = parts[i].blocks.iter().position(|b| matches!(b, Block::Items { .. }) && slide_rows(b) > SLIDE_ROWS / 2.0);
        if let Some(k) = found && let Block::Items { lead, items, .. } = parts[i].blocks[k].clone() {
            let rest: Vec<Block> = parts[i].blocks[k + 1..].to_vec();
            let mut chunks: Vec<Vec<Item>> = vec![vec![]];
            for t in items {
                let last = chunks.last().unwrap();
                let size = last.iter().chain([&t]).fold(units16(&lead), |n, x| n + units16(&x.text) + 2);
                if !last.is_empty() && size as f64 > SLIDE_TEXT_CHARS * SLIDE_ROWS / 2.0 { chunks.push(vec![]) }
                chunks.last_mut().unwrap().push(t);
            }
            if chunks.len() >= 2 {
                let n = chunks.len();
                let text = |c: &[Item], j: usize| format!("{}{}{}", if j > 0 { "" } else { lead.as_str() }, c.iter().map(|t| t.text.as_str()).collect::<Vec<_>>().join("; "), if j + 1 < n { ";" } else { "." });
                parts[i].blocks.truncate(k);
                parts[i].blocks.push(P(text(&chunks[0], 0)));
                let title = format!("{} (cont.)", parts[i].title.clone().unwrap_or_else(|| frame_title.clone()));
                let more: Vec<Cut> = chunks[1..].iter().enumerate().map(|(j, c)| {
                    let mut blocks = vec![P(text(c, j + 1))];
                    if j + 2 == n { blocks.extend(rest.iter().cloned()) }
                    Cut { title: Some(title.clone()), narration: format!("The list continues, from {} to {}.", c[0].said, c[c.len() - 1].said), blocks }
                }).collect();
                parts.splice(i + 1..i + 1, more);
            }
        }
        i += 1;
    }
    let mut slides: Vec<(String, Vec<Block>, Vec<String>)> = vec![];
    for Cut { title, narration, blocks } in parts {
        match slides.last_mut() {
            Some(last) if rows_of(&last.1) + rows_of(&blocks) <= SLIDE_ROWS => { last.1.extend(blocks); last.2.push(narration) }
            _ => { let t = if slides.is_empty() { frame_title.clone() } else { title.unwrap_or_default() }; slides.push((t, blocks, vec![narration])) }
        }
    }
    slides.into_iter().map(|(title, blocks, narration)| Frame { title, body: markdown_of(&blocks), narration: narration.join(" "), ..Default::default() }).collect()
}

/// The hand calculations as sections of frames; `at` (SI, from the left end) adds the chosen point.
pub fn frames(d: &Derivation, at: Option<f64>) -> Vec<(String, Vec<HFrame>)> {
    let mut first = vec![authority_frame(d)];
    first.extend(reaction_frames(d));
    let mut second = vec![deflection_frame(d)];
    second.extend(d.segments.iter().map(|s| segment_frame(d, s)));
    let mut sections = vec![("Method and reactions".to_string(), first), ("Shear, moment, slope and deflection by segment".to_string(), second)];
    if let Some(x) = at.filter(|x| x.is_finite()) { sections.push(("At the selected point".into(), vec![point_frame(d, x)])) }
    sections.push(("Stress and equilibrium".into(), vec![checks_frame(d)]));
    sections
}

/// A Markdown document of every hand-calculation step; it is also a beamdswitch deck.
pub fn markdown(d: &Derivation, at: Option<f64>, title: &str) -> String {
    let name = title.trim();
    let u = d.c.w.u;
    let sections: Vec<(String, Vec<Frame>)> = frames(d, at).into_iter().map(|(t, fs)| (t, fs.iter().map(|f| Frame { title: f.title.clone(), body: markdown_of(&f.blocks), narration: f.narration.clone(), ..Default::default() }).collect())).collect();
    document(&Meta { title: if name.is_empty() { "Hand calculations".into() } else { format!("Hand calculations: {name}") }, subtitle: "Reactions, shear force, bending moment, slope and deflection, step by step".into(), voice: VOICE.into(), ..Default::default() },
        &format!("Hand calculations{}. Each step derives the stiffness solver's answer by hand, in {}, {} and {}.", if name.is_empty() { String::new() } else { format!(" for {name}") },
            spoken_unit(u, Q::Force, true), spoken_unit(u, Q::Length, true), spoken_unit(u, Q::Stress, true)),
        &sections).unwrap_or_else(|e| e)
}

/// Every hand-calculation frame as deck slides, every segment included: each frame on as many slides as it needs to fit.
pub fn slides(d: &Derivation, at: Option<f64>) -> Vec<Frame> {
    frames(d, at).iter().flat_map(|(_, fs)| fs.iter().flat_map(slides_of)).collect()
}
