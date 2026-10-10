//! Linear-elastic Euler–Bernoulli beam, direct stiffness method.
//!
//! Units are SI throughout: m, N, N/m, N·m, Pa, m², m⁴. `UNITS` lists the consistent unit conventions a
//! caller may enter and read values in; `to_units` and `from_units` convert at that edge, and the solver
//! itself never sees anything but SI. Axes: x along the beam from its left end, +y up. Rotations and
//! couples are counter-clockwise positive (+z out of the page).
//! Loads: point force F (+ up), couple C (+ CCW), linearly varying distributed load q from x1 to x2
//! (N/m, + up). Supports: a pin restrains deflection; a fixed support restrains deflection and slope.
//! Internal forces use the usual beam convention: V(x) is the sum of the upward forces left of the
//! section, M(x) is positive when sagging, dM/dx = V, dV/dx = q.
//!
//! The stiffness system uses two-node Hermite elements between the supports and the beam ends only,
//! loaded by consistent (work-equivalent) nodal loads from every point force, couple and distributed
//! load inside each element. For Euler–Bernoulli beams these are the exact fixed-end actions, so nodal
//! deflections and support reactions are exact and statically indeterminate supports (fixed–fixed,
//! propped cantilevers, continuous spans) are solved without any equilibrium-only shortcut. Keeping
//! load points out of the matrix keeps it well conditioned however closely loads are spaced. V and M are
//! then recovered exactly by statics from the loads and the reactions, which keeps every jump at a point
//! force or couple, and deflection by integrating M/EI exactly from the nearest event on the left. None
//! of this depends on the number of elements per segment, which only sets the NASTRAN mesh.
//!
//! The arithmetic follows the JavaScript engine it replaces operation for operation, so the numbers are
//! the ones the page has always shown. Powers are correctly rounded: JavaScript's `**` takes the
//! platform's pow, whose last bit varies between systems.

use crate::num::{js, prec};
use std::collections::HashMap;

/// xⁿ for a whole n, correctly rounded (x·x for a square, as everywhere).
pub fn pw(x: f64, n: i32) -> f64 {
    match n {
        0 => 1.0,
        1 => x,
        2 => x * x,
        _ if !x.is_finite() || x == 0.0 => x.powi(n),
        _ if n < 0 => {
            let (h, l) = dd_pow(x, -n);
            if !h.is_finite() || h == 0.0 { return 1.0 / h }
            // 1 / (h + l), correctly rounded: q, then the remainder of 1 − q·(h + l).
            let q = 1.0 / h;
            let (p, e) = two_prod(q, h);
            q + ((1.0 - p) - e - q * l) / h
        }
        _ => dd_pow(x, n).0,
    }
}

/// a·b as an exact sum of two doubles (Dekker's product, no fused multiply-add needed).
fn two_prod(a: f64, b: f64) -> (f64, f64) {
    let p = a * b;
    if !p.is_finite() || p == 0.0 { return (p, 0.0) }
    let split = |v: f64| { let c = 134_217_729.0 * v; let hi = c - (c - v); (hi, v - hi) };
    let ((ah, al), (bh, bl)) = (split(a), split(b));
    (p, ((ah * bh - p) + ah * bl + al * bh) + al * bl)
}

/// xⁿ (n ≥ 1) in double-double arithmetic: its rounding to one double is xⁿ correctly rounded.
fn dd_pow(x: f64, n: i32) -> (f64, f64) {
    let (mut h, mut l) = (x, 0.0);
    for _ in 1..n {
        let (p, e) = two_prod(h, x);
        let e = e + l * x;
        let s = p + e;
        (h, l) = (s, e - (s - p));
    }
    (h, l)
}

/// `Math.max` and `Math.min`, which give NaN when either side is NaN.
pub fn jmax(a: f64, b: f64) -> f64 { if a.is_nan() || b.is_nan() { f64::NAN } else { a.max(b) } }
pub fn jmin(a: f64, b: f64) -> f64 { if a.is_nan() || b.is_nan() { f64::NAN } else { a.min(b) } }

/* ---------- unit conventions ---------- */

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Q { Length, Force, Stress, Moment, Distributed, Area, Inertia, Rigidity, Angle }

impl Q {
    pub fn name(self) -> &'static str {
        ["length", "force", "stress", "moment", "distributed", "area", "inertia", "rigidity", "angle"][self as usize]
    }
}

/// A consistent unit system: each gives the SI size of one unit of every quantity, and stress is always
/// force per length squared, so E·I/L³ and every other product stays in the system without extra
/// factors. `ascii` names the system in NASTRAN comments, which should stay plain ASCII.
pub struct Units {
    pub id: &'static str,
    pub label: &'static str,
    pub ascii: &'static str,
    /// In `Q` order. The products are written as JavaScript computed them.
    factor: [f64; 9],
    symbol: [&'static str; 9],
}

impl Units {
    pub fn factor(&self, q: Q) -> f64 { self.factor[q as usize] }
    pub fn symbol(&self, q: Q) -> &'static str { self.symbol[q as usize] }
}

// lbf = 4.4482216152605 N and in = 0.0254 m, exactly by definition; the products are those of `LBF / INCH ** 2` and so on.
pub const UNITS: [Units; 5] = [
    Units { id: "kN-m", label: "SI: kN, m, kPa", ascii: "kN, m, kPa (kN/m2)", factor: [1.0, 1e3, 1e3, 1e3, 1e3, 1.0, 1.0, 1e3, 1.0],
        symbol: ["m", "kN", "kPa", "kN·m", "kN/m", "m²", "m⁴", "kN·m²", "rad"] },
    Units { id: "N-m", label: "SI: N, m, Pa", ascii: "N, m, Pa (N/m2)", factor: [1.0; 9],
        symbol: ["m", "N", "Pa", "N·m", "N/m", "m²", "m⁴", "N·m²", "rad"] },
    Units { id: "N-mm", label: "SI: N, mm, MPa", ascii: "N, mm, MPa (N/mm2)", factor: [0.001, 1.0, 1e6, 0.001, 1000.0, 0.000001, 1.0000000000000002e-12, 0.000001, 1.0],
        symbol: ["mm", "N", "MPa", "N·mm", "N/mm", "mm²", "mm⁴", "N·mm²", "rad"] },
    Units { id: "lbf-in", label: "US customary: lbf, in, psi", ascii: "lbf, in, psi (lbf/in2)",
        factor: [0.0254, 4.4482216152605, 6894.757293168361, 0.11298482902761668, 175.12683524647636, 0.00064516, 4.162314255999999e-7, 0.0028698146573014637, 1.0],
        symbol: ["in", "lbf", "psi", "lbf·in", "lbf/in", "in²", "in⁴", "lbf·in²", "rad"] },
    Units { id: "kip-in", label: "US customary: kip, in, ksi", ascii: "kip, in, ksi (kip/in2)",
        factor: [0.0254, 4448.2216152605, 6894757.293168361, 112.98482902761668, 175126.83524647637, 0.00064516, 4.162314255999999e-7, 2.869814657301464, 1.0],
        symbol: ["in", "kip", "ksi", "kip·in", "kip/in", "in²", "in⁴", "kip·in²", "rad"] },
];
pub const DEFAULT_UNITS: &str = "N-mm";
pub const SI: &Units = &UNITS[1];

pub fn units(id: &str) -> Option<&'static Units> { UNITS.iter().find(|u| u.id == id) }
/// An SI value in `u`, and back.
pub fn to_units(v: f64, q: Q, u: &Units) -> f64 { v / u.factor(q) }
pub fn from_units(v: f64, q: Q, u: &Units) -> f64 { v * u.factor(q) }

/* ---------- the model ---------- */

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind { Pin, Fixed }

impl Kind {
    pub fn name(self) -> &'static str { if self == Kind::Pin { "pin" } else { "fixed" } }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Support { pub kind: Kind, pub x: f64 }

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Load {
    Point { x: f64, f: f64 },
    Moment { x: f64, c: f64 },
    Dist { x1: f64, x2: f64, q1: f64, q2: f64 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Section { pub a: f64, pub i: f64, pub iy: f64, pub j: f64, pub c: Option<f64> }

#[derive(Clone, Debug, PartialEq)]
pub struct Model { pub length: f64, pub e: f64, pub nu: f64, pub section: Section, pub supports: Vec<Support>, pub loads: Vec<Load>, pub divisions: usize }

/// An unchecked model, as it comes from the page, a WebMCP tool or a test: NaN stands for a value that
/// is missing or not a number, None for one left out (which takes its default).
#[derive(Clone, Debug, Default)]
pub struct Input {
    pub length: f64,
    pub e: f64,
    pub nu: f64,
    pub a: f64,
    pub i: f64,
    pub iy: Option<f64>,
    pub j: Option<f64>,
    pub c: Option<f64>,
    pub divisions: Option<f64>,
    pub supports: Option<Vec<InSupport>>,
    pub loads: Option<Vec<InLoad>>,
}

#[derive(Clone, Debug, Default)]
pub struct InSupport { pub kind: String, pub x: f64 }

/// A load of any kind: the fields its kind does not use are ignored.
#[derive(Clone, Debug, Default)]
pub struct InLoad { pub kind: String, pub x: f64, pub f: f64, pub c: f64, pub x1: f64, pub x2: f64, pub q1: f64, pub q2: f64 }

impl From<&Model> for Input {
    fn from(m: &Model) -> Input {
        Input {
            length: m.length, e: m.e, nu: m.nu, a: m.section.a, i: m.section.i, iy: Some(m.section.iy), j: Some(m.section.j), c: m.section.c,
            divisions: Some(m.divisions as f64),
            supports: Some(m.supports.iter().map(|s| InSupport { kind: s.kind.name().into(), x: s.x }).collect()),
            loads: Some(m.loads.iter().map(|l| match *l {
                Load::Point { x, f } => InLoad { kind: "point".into(), x, f, ..Default::default() },
                Load::Moment { x, c } => InLoad { kind: "moment".into(), x, c, ..Default::default() },
                Load::Dist { x1, x2, q1, q2 } => InLoad { kind: "dist".into(), x1, x2, q1, q2, ..Default::default() },
            }).collect()),
        }
    }
}

/// What is wrong with a model, and the field that holds it ("loads.2.x").
#[derive(Clone, Debug, PartialEq)]
pub struct ModelError { pub message: String, pub field: Option<String> }

fn fail<T>(message: impl Into<String>, field: &str) -> Result<T, ModelError> {
    Err(ModelError { message: message.into(), field: (!field.is_empty()).then(|| field.to_string()) })
}

/// A whole number written as JavaScript's `String`, else six significant figures.
pub fn fmt(x: f64) -> String {
    if x.is_finite() && x.fract() == 0.0 { js(x) } else { js(prec(x, 6)) }
}

/// A length in `u` with its symbol, as messages quote it.
pub fn length_text(u: &Units, x: f64) -> String { format!("{} {}", fmt(to_units(x, Q::Length, u)), u.symbol(Q::Length)) }

fn number(v: f64, label: &str, field: &str, positive: bool) -> Result<f64, ModelError> {
    if !v.is_finite() { return fail(format!("{label} must be a finite number."), field) }
    if positive && !(v > 0.0) { return fail(format!("{label} must be greater than zero."), field) }
    Ok(v)
}

/// Check and normalise an SI model; the error names the offending field. `u` only sets how lengths are
/// written in the messages.
pub fn validate(input: &Input, u: &Units) -> Result<Model, ModelError> {
    let len = |x: f64| length_text(u, x);
    let length = number(input.length, "Beam length", "length", true)?;
    if length < 1e-3 || length > 1e4 {
        return fail(format!("Beam length must be between {} and {}.", len(1e-3), len(1e4)), "length");
    }
    let at = |v: f64, label: &str, field: &str| -> Result<f64, ModelError> {
        let v = number(v, label, field, false)?;
        if v < 0.0 || v > length { return fail(format!("{label} must lie on the beam, between 0 and {}.", len(length)), field) }
        Ok(v)
    };
    let e = number(input.e, "Young's modulus E", "material.E", true)?;
    let nu = number(input.nu, "Poisson's ratio ν", "material.nu", false)?;
    if !(nu > -1.0 && nu < 0.5) { return fail("Poisson's ratio ν must be greater than −1 and less than 0.5.", "material.nu") }
    let a = number(input.a, "Section area A", "section.A", true)?;
    let i = number(input.i, "Second moment of area I", "section.I", true)?;
    let iy = number(input.iy.unwrap_or(i), "Out-of-plane second moment Iy", "section.Iy", true)?;
    let j = number(input.j.unwrap_or(2.0 * i), "Torsion constant J", "section.J", true)?;
    let c = match input.c { None => None, Some(c) => Some(number(c, "Extreme-fibre distance c", "section.c", true)?) };
    if !(e * i).is_finite() || e * i <= 0.0 { return fail("Flexural rigidity EI overflows; check the units of E and I.", "section.I") }
    let divisions = input.divisions.unwrap_or(4.0);
    if !(divisions.is_finite() && divisions.fract() == 0.0) || divisions < 1.0 {
        return fail("Elements per segment must be a whole number, at least 1.", "divisions");
    }
    let Some(ins) = input.supports.as_ref().filter(|s| !s.is_empty()) else { return fail("Add at least one support.", "supports") };
    let mut supports = vec![];
    for (n, s) in ins.iter().enumerate() {
        let kind = match s.kind.as_str() {
            "pin" => Kind::Pin,
            "fixed" => Kind::Fixed,
            _ => return fail(format!("Support {} must be a pin or fixed support.", n + 1), &format!("supports.{n}.kind")),
        };
        supports.push(Support { kind, x: at(s.x, &format!("Support {} position", n + 1), &format!("supports.{n}.x"))? });
    }
    let mut sorted: Vec<f64> = supports.iter().map(|s| s.x).collect();
    sorted.sort_by(f64::total_cmp_js);
    for w in sorted.windows(2) {
        if w[1] == w[0] { return fail(format!("Two supports share the position x = {}.", len(w[1])), "supports") }
    }
    // With only pins and fixed supports the structure is stable exactly when it has a fixed support or
    // two separate pins; anything less can move rigidly.
    if !supports.iter().any(|s| s.kind == Kind::Fixed) && supports.len() < 2 {
        return fail("Mechanism: a single pin lets the beam rotate freely. Add a second support or make it fixed.", "supports");
    }
    let Some(inl) = input.loads.as_ref() else { return fail("Loads must be a list.", "loads") };
    let mut loads = vec![];
    for (n, l) in inl.iter().enumerate() {
        let label = format!("Load {}", n + 1);
        let f = |k: &str| format!("loads.{n}.{k}");
        loads.push(match l.kind.as_str() {
            "point" => Load::Point { x: at(l.x, &format!("{label} position"), &f("x"))?, f: number(l.f, &format!("{label} force"), &f("F"), false)? },
            "moment" => Load::Moment { x: at(l.x, &format!("{label} position"), &f("x"))?, c: number(l.c, &format!("{label} couple"), &f("C"), false)? },
            "dist" => {
                let x1 = at(l.x1, &format!("{label} start"), &f("x1"))?;
                let x2 = at(l.x2, &format!("{label} end"), &f("x2"))?;
                if !(x2 > x1) { return fail(format!("{label} must end to the right of where it starts."), &f("x2")) }
                Load::Dist { x1, x2, q1: number(l.q1, &format!("{label} start intensity"), &f("q1"), false)?,
                    q2: number(l.q2, &format!("{label} end intensity"), &f("q2"), false)? }
            }
            _ => return fail(format!("{label} must be a point force, a couple or a distributed load."), &f("kind")),
        });
    }
    let model = Model { length, e, nu, section: Section { a, i, iy, j, c }, supports, loads, divisions: divisions.min(1e9) as usize };
    events(&model, u)?;
    Ok(model)
}

/// Numeric order for finite values, as `(a, b) => a - b` sorts them.
trait JsOrder { fn total_cmp_js(&self, other: &Self) -> std::cmp::Ordering; }
impl JsOrder for f64 {
    fn total_cmp_js(&self, other: &f64) -> std::cmp::Ordering { self.partial_cmp(other).unwrap_or(std::cmp::Ordering::Equal) }
}

/// Distinct values in increasing order, as `[...new Set(xs)].sort((a, b) => a - b)` (−0 is 0).
pub fn distinct(mut xs: Vec<f64>) -> Vec<f64> {
    let mut seen: Vec<f64> = Vec::with_capacity(xs.len());
    xs.retain(|x| if seen.contains(x) { false } else { seen.push(*x); true });
    xs.sort_by(f64::total_cmp_js);
    xs
}

/// The same, for long lists.
fn distinct_fast(mut xs: Vec<f64>) -> Vec<f64> {
    xs.sort_by(f64::total_cmp_js);
    xs.dedup_by(|a, b| a == b);
    xs
}

/// Positions where something happens: ends, supports, point actions, load ends.
pub fn events(m: &Model, u: &Units) -> Result<Vec<f64>, ModelError> {
    let mut xs = vec![0.0, m.length];
    xs.extend(m.supports.iter().map(|s| s.x));
    for l in &m.loads {
        match *l { Load::Dist { x1, x2, .. } => xs.extend([x1, x2]), Load::Point { x, .. } | Load::Moment { x, .. } => xs.push(x) }
    }
    let unique = distinct_fast(xs);
    for w in unique.windows(2) {
        if w[1] - w[0] < 1e-6 * m.length {
            return fail(format!("Positions {} and {} are too close together; make them equal or separate them.", length_text(u, w[0]), length_text(u, w[1])), "loads");
        }
    }
    Ok(unique)
}

/// The NASTRAN mesh: every event, and `divisions` elements between consecutive ones.
pub fn mesh(m: &Model) -> Result<Vec<f64>, ModelError> {
    let ev = events(m, SI)?;
    let mut nodes = vec![ev[0]];
    for i in 1..ev.len() {
        for j in 1..m.divisions { nodes.push(ev[i - 1] + (ev[i] - ev[i - 1]) * j as f64 / m.divisions as f64) }
        nodes.push(ev[i]);
    }
    Ok(nodes)
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side { Left, Right }

/// Distributed-load intensity at x, taking the load starting at x (`Right`) or ending there (`Left`).
pub fn intensity(m: &Model, x: f64, side: Side) -> f64 {
    let mut q = 0.0;
    for l in &m.loads {
        if let Load::Dist { x1, x2, q1, q2 } = *l {
            let inside = if side == Side::Right { x >= x1 && x < x2 } else { x > x1 && x <= x2 };
            if inside { q += q1 + (q2 - q1) * (x - x1) / (x2 - x1) }
        }
    }
    q
}

/// Re-express a validated SI model in `u` (`back` converts the other way); `round` keeps 15 significant
/// figures, as the deck writes them.
pub fn scale_model(m: &Model, u: &Units, back: bool, round: bool) -> Model {
    let c = |v: f64, q: Q| {
        let v = if back { from_units(v, q, u) } else { to_units(v, q, u) };
        if round { prec(v, 15) } else { v }
    };
    let x = |v: f64| c(v, Q::Length);
    let s = m.section;
    Model {
        length: x(m.length), e: c(m.e, Q::Stress), nu: m.nu,
        section: Section { a: c(s.a, Q::Area), i: c(s.i, Q::Inertia), iy: c(s.iy, Q::Inertia), j: c(s.j, Q::Inertia), c: s.c.map(|v| c(v, Q::Length)) },
        supports: m.supports.iter().map(|sp| Support { x: x(sp.x), ..*sp }).collect(),
        loads: m.loads.iter().map(|l| match *l {
            Load::Point { x: p, f } => Load::Point { x: x(p), f: c(f, Q::Force) },
            Load::Moment { x: p, c: cc } => Load::Moment { x: x(p), c: c(cc, Q::Moment) },
            Load::Dist { x1, x2, q1, q2 } => Load::Dist { x1: x(x1), x2: x(x2), q1: c(q1, Q::Distributed), q2: c(q2, Q::Distributed) },
        }).collect(),
        divisions: m.divisions,
    }
}

/* ---------- the stiffness solution ---------- */

/// Beam DOFs only couple within one element, so a symmetric banded row keeps K[i][i..=i+BAND].
const BAND: usize = 3;

fn entry(k: &[[f64; BAND + 1]], i: usize, j: usize) -> f64 {
    if i.abs_diff(j) > BAND { 0.0 } else if i <= j { k[i][j - i] } else { k[j][i - j] }
}

fn singular<T>() -> Result<T, ModelError> { fail("The stiffness matrix is singular: the supports do not hold the beam in place.", "supports") }

/// Solve K u = f for symmetric positive definite banded K by LDLᵀ elimination. The system is first
/// scaled to a unit diagonal, which makes the pivot test independent of units and element lengths; a
/// vanishing scaled pivot means a mechanism.
fn solve_banded(k: &[[f64; BAND + 1]], f: &[f64]) -> Result<Vec<f64>, ModelError> {
    let n = f.len();
    let d: Vec<f64> = k.iter().map(|row| 1.0 / row[0].sqrt()).collect();
    if d.iter().any(|v| !(*v > 0.0 && v.is_finite())) { return singular() }
    let mut a: Vec<[f64; BAND + 1]> = k.iter().enumerate()
        .map(|(i, row)| std::array::from_fn(|kk| if i + kk < n { row[kk] * d[i] * d[i + kk] } else { 0.0 })).collect();
    let mut u: Vec<f64> = f.iter().zip(&d).map(|(v, d)| v * d).collect();
    for c in 0..n {
        if !(a[c][0] > 1e-12) { return singular() }
        for r in c + 1..=(n - 1).min(c + BAND) {
            let m = a[c][r - c] / a[c][0];
            if m == 0.0 { continue }
            for kk in r..=(n - 1).min(c + BAND) { a[r][kk - r] -= m * a[c][kk - c] }
            u[r] -= m * u[c];
        }
    }
    for r in (0..n).rev() {
        let mut s = u[r];
        for kk in r + 1..=(n - 1).min(r + BAND) { s -= a[r][kk - r] * u[kk] }
        u[r] = s / a[r][0];
    }
    Ok(u.iter().zip(&d).map(|(v, d)| v * d).collect())
}

/// Hermite shape functions on an element of length l at ξ ∈ [0, 1] (values and x-derivatives), ordered
/// v_i, θ_i, v_j, θ_j.
fn hermite(l: f64, t: f64) -> [f64; 4] {
    [1.0 - 3.0 * t * t + 2.0 * pw(t, 3), l * (t - 2.0 * t * t + pw(t, 3)), 3.0 * t * t - 2.0 * pw(t, 3), l * (pw(t, 3) - t * t)]
}
fn hermite_slope(l: f64, t: f64) -> [f64; 4] {
    [(6.0 * t * t - 6.0 * t) / l, 1.0 - 4.0 * t + 3.0 * t * t, (6.0 * t - 6.0 * t * t) / l, 3.0 * t * t - 2.0 * t]
}
const GAUSS5: [(f64, f64); 5] = [(-0.9061798459386640, 0.2369268850561891), (-0.5384693101056831, 0.4786286704993665), (0.0, 0.5688888888888889),
    (0.5384693101056831, 0.4786286704993665), (0.9061798459386640, 0.2369268850561891)];

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Reaction { pub kind: Kind, pub x: f64, pub fy: f64, pub mz: f64 }
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Displacement { pub x: f64, pub v: f64, pub theta: f64 }
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Equilibrium { pub fy: f64, pub mz: f64, pub scale_f: f64, pub scale_m: f64 }
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Extreme { pub x: f64, pub value: f64 }
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Extremes { pub v_shear: Extreme, pub m: Extreme, pub v: Extreme }

/// A solved beam: the model, the reactions in order of x, the deflection and slope at every event, the
/// out-of-balance of loads and reactions, and the largest V, M and v.
#[derive(Clone, Debug, PartialEq)]
pub struct Solved { pub model: Model, pub reactions: Vec<Reaction>, pub displacements: Vec<Displacement>, pub equilibrium: Equilibrium, pub extremes: Extremes }

/// Positions as map keys: −0 and 0 are one position, as in a JavaScript Map.
fn key(x: f64) -> u64 { (x + 0.0).to_bits() }

pub fn solve(input: &Input, u: &Units) -> Result<Solved, ModelError> {
    let model = validate(input, u)?;
    let ei = model.e * model.section.i;
    // Stiffness stations: the ends and every support. Loads between them enter as consistent nodal loads.
    let mut xs = vec![0.0, model.length];
    xs.extend(model.supports.iter().map(|s| s.x));
    let stations = distinct(xs);
    let n = stations.len() * 2;
    let mut k = vec![[0.0; BAND + 1]; n];
    let mut f = vec![0.0; n];
    let where_: HashMap<u64, usize> = stations.iter().enumerate().map(|(i, &x)| (key(x), i)).collect();
    let index = |x: f64| where_.get(&key(x)).copied();
    // The element with stations[e] < x < stations[e + 1].
    let element = |x: f64| {
        let (mut lo, mut hi) = (0, stations.len() - 2);
        while lo < hi { let mid = (lo + hi + 1) >> 1; if stations[mid] < x { lo = mid } else { hi = mid - 1 } }
        lo
    };
    let spread = |f: &mut Vec<f64>, e: usize, w: [f64; 4], value: f64| for (i, w) in w.iter().enumerate() { f[2 * e + i] += w * value };
    for e in 0..stations.len() - 1 {
        let l = stations[e + 1] - stations[e];
        let s = ei / pw(l, 3);
        let d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
        let ke = [[12.0, 6.0 * l, -12.0, 6.0 * l], [6.0 * l, 4.0 * l * l, -6.0 * l, 2.0 * l * l], [-12.0, -6.0 * l, 12.0, -6.0 * l], [6.0 * l, 2.0 * l * l, -6.0 * l, 4.0 * l * l]];
        for i in 0..4 { for j in i..4 { k[d[i]][d[j] - d[i]] += s * ke[i][j] } }
    }
    for ld in &model.loads {
        match *ld {
            Load::Point { x, f: value } | Load::Moment { x, c: value } => {
                let point = matches!(ld, Load::Point { .. });
                if let Some(i) = index(x) { f[2 * i + if point { 0 } else { 1 }] += value; continue }
                let e = element(x);
                let (a, l) = (stations[e], stations[e + 1] - stations[e]);
                let t = (x - a) / l;
                spread(&mut f, e, if point { hermite(l, t) } else { hermite_slope(l, t) }, value);
            }
            Load::Dist { x1, x2, q1, q2 } => {
                // ∫ N q dx over each element's share of the load: N is cubic and q linear, so 5-point Gauss is exact.
                for e in 0..stations.len() - 1 {
                    let (a, l) = (stations[e], stations[e + 1] - stations[e]);
                    let (lo, hi) = (jmax(a, x1), jmin(a + l, x2));
                    if !(hi > lo) { continue }
                    for (g, w) in GAUSS5 {
                        let x = lo + (hi - lo) * (g + 1.0) / 2.0;
                        let q = q1 + (q2 - q1) * (x - x1) / (x2 - x1);
                        spread(&mut f, e, hermite(l, (x - a) / l), w * q * (hi - lo) / 2.0);
                    }
                }
            }
        }
    }
    let mut fixed = vec![false; n];
    for s in &model.supports {
        let i = index(s.x).unwrap();
        fixed[2 * i] = true;
        if s.kind == Kind::Fixed { fixed[2 * i + 1] = true }
    }
    // Dropping constrained DOFs keeps the free system banded with the same BAND.
    let free: Vec<usize> = (0..n).filter(|&i| !fixed[i]).collect();
    let mut u = vec![0.0; n];
    if !free.is_empty() {
        let mut kf = vec![[0.0; BAND + 1]; free.len()];
        for (a, &i) in free.iter().enumerate() {
            for b in a..free.len().min(a + BAND + 1) { kf[a][b - a] = entry(&k, i, free[b]) }
        }
        let ff: Vec<f64> = free.iter().map(|&i| f[i]).collect();
        for (a, v) in solve_banded(&kf, &ff)?.into_iter().enumerate() { u[free[a]] = v }
    }
    if u.iter().any(|v| !v.is_finite()) { return fail("The solution overflowed; check that E, I and the loads use consistent units.", "section.I") }
    let residual = |i: usize| {
        let mut s = -f[i];
        for j in i.saturating_sub(BAND)..=(n - 1).min(i + BAND) { s += entry(&k, i, j) * u[j] }
        s
    };
    let mut reactions: Vec<Reaction> = model.supports.iter().map(|s| {
        let i = index(s.x).unwrap();
        Reaction { kind: s.kind, x: s.x, fy: residual(2 * i), mz: if s.kind == Kind::Fixed { residual(2 * i + 1) } else { 0.0 } }
    }).collect();
    reactions.sort_by(|a, b| a.x.total_cmp_js(&b.x));
    // Deflection at every event: stations take the solved values; other events integrate M/EI exactly
    // from the previous event (nothing happens strictly between two events).
    let zero = Extreme { x: 0.0, value: 0.0 };
    let mut r = Solved { model, reactions, displacements: vec![], equilibrium: Equilibrium { fy: 0.0, mz: 0.0, scale_f: 0.0, scale_m: 0.0 },
        extremes: Extremes { v_shear: zero, m: zero, v: zero } };
    for x in events(&r.model, SI)? {
        // x = 0 is a station, so every other event has one before it.
        let d = match index(x) {
            Some(i) => Displacement { x, v: u[2 * i], theta: u[2 * i + 1] },
            None => { let (v, theta) = integrate(&r, *r.displacements.last().unwrap(), x); Displacement { x, v, theta } }
        };
        r.displacements.push(d);
    }
    r.equilibrium = equilibrium(&r);
    r.extremes = extremes(&r);
    Ok(r)
}

/// Resultant force and moment about x = 0 of all loads and reactions (they should vanish).
fn equilibrium(r: &Solved) -> Equilibrium {
    let mut q = Equilibrium { fy: 0.0, mz: 0.0, scale_f: 0.0, scale_m: 0.0 };
    let mut add = |f: f64, x: f64, c: f64| { q.fy += f; q.mz += f * x + c; q.scale_f += f.abs(); q.scale_m += (f * x).abs() + c.abs(); };
    for re in &r.reactions { add(re.fy, re.x, re.mz) }
    for l in &r.model.loads {
        match *l {
            Load::Point { x, f } => add(f, x, 0.0),
            Load::Moment { c, .. } => add(0.0, 0.0, c),
            // A trapezoid is two triangles: q1 peaking at x1 and q2 peaking at x2.
            Load::Dist { x1, x2, q1, q2 } => { let b = x2 - x1; add(q1 * b / 2.0, x1 + b / 3.0, 0.0); add(q2 * b / 2.0, x1 + 2.0 * b / 3.0, 0.0) }
        }
    }
    q
}

/// Exact V and M at x from the left free body: `Left` gives the limit x⁻, `Right` gives x⁺.
pub fn internal(r: &Solved, x: f64, side: Side) -> (f64, f64) {
    let incl = |a: f64| if side == Side::Right { a <= x } else { a < x };
    let (mut v, mut m) = (0.0, 0.0);
    for re in &r.reactions {
        if incl(re.x) { v += re.fy; m += re.fy * (x - re.x) - re.mz }
    }
    for l in &r.model.loads {
        match *l {
            Load::Point { x: a, f } if incl(a) => { v += f; m += f * (x - a) }
            Load::Moment { x: a, c } if incl(a) => m -= c,
            Load::Dist { x1, x2, q1, q2 } if x > x1 => {
                let b = jmin(x, x2) - x1;
                let s = (q2 - q1) / (x2 - x1);
                let qb = q1 + s * b; // intensity at the end of the loaded part
                v += (q1 + qb) * b / 2.0;
                // Rectangle q1 plus triangle (qb − q1), each about the section at x.
                m += q1 * b * (x - x1 - b / 2.0) + (qb - q1) * b / 2.0 * (x - x1 - 2.0 * b / 3.0);
            }
            _ => {}
        }
    }
    (v, m)
}

/// Deflection and slope at x: values at the events, integrated exactly from M/EI between them.
pub fn deflection(r: &Solved, x: f64) -> (f64, f64) {
    let d = &r.displacements;
    // The segment containing x: the last one whose start is at or before x.
    let (mut lo, mut hi) = (0, d.len() - 2);
    while lo < hi { let mid = (lo + hi + 1) >> 1; if d[mid].x <= x { lo = mid } else { hi = mid - 1 } }
    if x == d[lo + 1].x { return (d[lo + 1].v, d[lo + 1].theta) }
    integrate(r, d[lo], x)
}

const GAUSS3: [(f64, f64); 3] = [(-0.7745966692414834, 5.0 / 9.0), (0.0, 8.0 / 9.0), (0.7745966692414834, 5.0 / 9.0)];

/// v and θ at x from their values at an earlier point with no event between: θ' = M/EI, v' = θ. M is
/// at most cubic there, so 3-point Gauss integrates M and (x − t)M exactly.
fn integrate(r: &Solved, from: Displacement, x: f64) -> (f64, f64) {
    let ei = r.model.e * r.model.section.i;
    let (x0, s) = (from.x, x - from.x);
    if s == 0.0 { return (from.v, from.theta) }
    let (mut dv, mut dt) = (0.0, 0.0);
    for (g, w) in GAUSS3 {
        let t = s * (g + 1.0) / 2.0;
        let m = internal(r, x0 + t, Side::Right).1;
        dt += w * m;
        dv += w * (s - t) * m;
    }
    (from.v + from.theta * s + dv * s / 2.0 / ei, from.theta + dt * s / 2.0 / ei)
}

/// Values at x with both one-sided limits of V and M.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct At { pub x: f64, pub v_left: f64, pub v_right: f64, pub m_left: f64, pub m_right: f64, pub v: f64, pub theta: f64 }

pub fn at(r: &Solved, x: f64) -> At {
    let l = r.model.length;
    let left = if x > 0.0 { internal(r, x, Side::Left) } else { (0.0, 0.0) };
    let right = if x < l { internal(r, x, Side::Right) } else { (0.0, 0.0) };
    let (v, theta) = deflection(r, x);
    At { x, v_left: left.0, v_right: right.0, m_left: left.1, m_right: right.1, v, theta }
}

/// One point of the diagrams.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sample { pub x: f64, pub shear: f64, pub m: f64, pub v: f64, pub theta: f64 }

/// Mesh-independent plot samples: about `count` regular points plus per-segment critical points and
/// event limits. Each segment runs from its right limit at the start to its left limit at the end, so
/// jumps appear as two points at the same x.
pub fn diagram(r: &Solved, count: usize) -> Vec<Sample> {
    let ev: Vec<f64> = r.displacements.iter().map(|d| d.x).collect();
    let l = r.model.length;
    let at0 = deflection(r, 0.0);
    let mut pts = vec![Sample { x: 0.0, shear: 0.0, m: 0.0, v: at0.0, theta: at0.1 }];
    for e in 0..ev.len() - 1 {
        let (a, b) = (ev[e], ev[e + 1]);
        let n = 2f64.max((count as f64 * (b - a) / l).ceil()) as usize;
        let mut xs = critical_points(r, a, b);
        for j in 0..=n { xs.push(if j == n { b } else { a + (b - a) * j as f64 / n as f64 }) }
        for x in distinct_fast(xs) {
            let (shear, m) = internal(r, x, if x == b { Side::Left } else { Side::Right });
            let (v, theta) = deflection(r, x);
            pts.push(Sample { x, shear, m, v, theta });
        }
    }
    // Close the diagrams to zero at the free ends of the beam.
    let at_l = deflection(r, l);
    pts.push(Sample { x: l, shear: 0.0, m: 0.0, v: at_l.0, theta: at_l.1 });
    pts
}

fn critical_points(r: &Solved, a: f64, b: f64) -> Vec<f64> {
    let m = &r.model;
    let h = b - a;
    let mut xs = vec![a, b];
    let ra = internal(r, a, Side::Right);
    let (qa, qb) = (intensity(m, a, Side::Right), intensity(m, b, Side::Left));
    // q is linear and V quadratic inside a segment: V(s) = C + B s + A s².
    let (aa, bb, cc) = ((qb - qa) / (2.0 * h), qa, ra.0);
    if qa * qb < 0.0 { xs.push(a + qa / (qa - qb) * h) }
    let roots: Vec<f64> = if aa.abs() < 1e-300 {
        if bb != 0.0 { vec![-cc / bb] } else { vec![] }
    } else {
        let disc = bb * bb - 4.0 * aa * cc;
        if disc < 0.0 { vec![] } else { vec![(-bb + disc.sqrt()) / (2.0 * aa), (-bb - disc.sqrt()) / (2.0 * aa)] }
    };
    let mut shear_roots: Vec<f64> = roots.into_iter().filter(|&s| s > 0.0 && s < h).map(|s| a + s).collect();
    shear_roots.sort_by(f64::total_cmp_js);
    xs.extend(&shear_roots);
    let bisect = |mut lo: f64, mut hi: f64, value: &dyn Fn(f64) -> f64| {
        let mut vlo = value(lo);
        for _ in 0..60 {
            let mid = (lo + hi) / 2.0;
            if mid == lo || mid == hi { break }
            let vmid = value(mid);
            if vmid == 0.0 { return mid }
            if vlo * vmid < 0.0 { hi = mid } else { lo = mid; vlo = vmid }
        }
        (lo + hi) / 2.0
    };
    let moment = |x: f64| internal(r, x, if x == b { Side::Left } else { Side::Right }).1;
    let mut moment_roots = vec![];
    let mut partitions = vec![a];
    partitions.extend(&shear_roots);
    partitions.push(b);
    for w in partitions.windows(2) {
        let (lo, hi) = (w[0], w[1]);
        if moment(lo) == 0.0 { moment_roots.push(lo) }
        if moment(lo) * moment(hi) < 0.0 { moment_roots.push(bisect(lo, hi, &moment)) }
    }
    let slope = |x: f64| deflection(r, x).1;
    let mut slope_partitions = vec![a];
    slope_partitions.extend(moment_roots.iter().filter(|&&x| x > a && x < b));
    slope_partitions.push(b);
    for w in slope_partitions.windows(2) {
        let (lo, hi) = (w[0], w[1]);
        xs.extend([lo, hi]);
        if slope(lo) * slope(hi) < 0.0 { xs.push(bisect(lo, hi, &slope)) }
    }
    xs
}

fn extremes(r: &Solved) -> Extremes {
    let mut best: [Option<Extreme>; 3] = [None; 3];
    let pts = diagram(r, 800);
    for p in &pts[1..pts.len() - 1] {
        for (k, value) in [p.shear, p.m, p.v].into_iter().enumerate() {
            if best[k].is_none_or(|b| value.abs() > b.value.abs() + 1e-12 * value.abs()) { best[k] = Some(Extreme { x: p.x, value }) }
        }
    }
    // A solved beam has interior samples, so every extreme is set.
    Extremes { v_shear: best[0].unwrap(), m: best[1].unwrap(), v: best[2].unwrap() }
}

/* ---------- sections ---------- */

/// A shape and its dimensions (m), as the page and the WebMCP tools give them: None is left out.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Shape {
    pub shape: String,
    pub b: Option<f64>, pub h: Option<f64>, pub d: Option<f64>, pub t: Option<f64>,
    pub a: Option<f64>, pub i: Option<f64>, pub iy: Option<f64>, pub j: Option<f64>, pub c: Option<f64>,
}

/// Section properties (m, m², m⁴) from a shape. Bending is about the horizontal axis, depth along y.
pub fn section_properties(spec: &Shape) -> Result<Section, ModelError> {
    let pos = |v: Option<f64>, label: &str, field: &str| number(v.unwrap_or(f64::NAN), label, field, true);
    let pi = std::f64::consts::PI;
    match spec.shape.as_str() {
        "rect" => {
            let b = pos(spec.b, "Section width b", "section.b")?;
            let h = pos(spec.h, "Section depth h", "section.h")?;
            let (long, short) = (jmax(b, h), jmin(b, h));
            let r = short / long;
            // Saint-Venant torsion constant of a solid rectangle (Roark's series approximation).
            let j = long * pw(short, 3) * (1.0 / 3.0 - 0.21 * r * (1.0 - pw(r, 4) / 12.0));
            Ok(Section { a: b * h, i: b * pw(h, 3) / 12.0, iy: h * pw(b, 3) / 12.0, j, c: Some(h / 2.0) })
        }
        "circle" => {
            let d = pos(spec.d, "Diameter d", "section.d")?;
            Ok(Section { a: pi * d * d / 4.0, i: pi * pw(d, 4) / 64.0, iy: pi * pw(d, 4) / 64.0, j: pi * pw(d, 4) / 32.0, c: Some(d / 2.0) })
        }
        "tube" => {
            let d = pos(spec.d, "Outside diameter D", "section.d")?;
            let t = pos(spec.t, "Wall thickness t", "section.t")?;
            if !(2.0 * t < d) { return fail("Wall thickness must be less than half the outside diameter.", "section.t") }
            let di = d - 2.0 * t;
            let i = pi * (pw(d, 4) - pw(di, 4)) / 64.0;
            Ok(Section { a: pi * (d * d - di * di) / 4.0, i, iy: i, j: 2.0 * i, c: Some(d / 2.0) })
        }
        "custom" => {
            let i = pos(spec.i, "Second moment of area I", "section.I")?;
            Ok(Section {
                a: pos(spec.a, "Section area A", "section.A")?, i,
                iy: match spec.iy { None => i, v => pos(v, "Out-of-plane second moment Iy", "section.Iy")? },
                j: match spec.j { None => 2.0 * i, v => pos(v, "Torsion constant J", "section.J")? },
                c: match spec.c { None => None, v => Some(pos(v, "Extreme-fibre distance c", "section.c")?) },
            })
        }
        _ => fail("Choose a rectangle, solid circle, tube or custom section.", "section.shape"),
    }
}

/// Degree of static indeterminacy for transverse loading: reaction components minus the two
/// equilibrium equations.
pub fn indeterminacy(supports: &[Support]) -> i64 {
    supports.iter().map(|s| if s.kind == Kind::Fixed { 2 } else { 1 }).sum::<i64>() - 2
}
