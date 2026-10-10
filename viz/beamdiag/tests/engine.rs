//! The solver, its unit conventions and its NASTRAN deck, against closed forms (fixtures.json), the exact
//! Macaulay reference (reference.json and random.json, frozen from the Python reference solver before it
//! was removed) and themselves.

use beamdiag::bdf::{TITLE, exact_real, export_bdf, nastran_real};
use beamdiag::engine::*;
use beamdiag::json::{self, Value};

fn data(text: &str) -> Value { json::parse(text).unwrap() }
fn fixtures() -> Value { data(include_str!("../fixtures.json")) }
fn cases(v: &Value) -> &[Value] { v.get("cases").arr().unwrap() }
fn fixture(id: &str) -> Input {
    json::input(cases(&fixtures()).iter().find(|c| c.s("id") == id).unwrap_or_else(|| panic!("no fixture {id}")).get("model"))
}
fn solved(i: &Input) -> Solved { solve(i, SI).unwrap_or_else(|e| panic!("{}", e.message)) }
fn u(id: &str) -> &'static Units { units(id).unwrap() }

#[track_caller]
fn close(actual: f64, expected: f64, scale: f64, label: &str, tol: f64) {
    assert!((actual - expected).abs() <= tol * scale.max(expected.abs()).max(1e-300), "{label}: {actual} vs {expected}");
}
#[track_caller]
fn near(actual: f64, expected: f64, delta: f64, label: &str) {
    assert!((actual - expected).abs() <= delta, "{label}: {actual} vs {expected} (delta {delta})");
}

fn quantity(r: &Solved, q: &str, x: f64) -> f64 {
    let a = at(r, x);
    let reaction = || r.reactions.iter().find(|s| s.x == x).unwrap();
    match q {
        "R" => reaction().fy, "Mr" => reaction().mz, "v" => a.v, "theta" => a.theta,
        "M" => if x >= r.model.length { a.m_left } else { a.m_right },
        "Mleft" => a.m_left, "Mright" => a.m_right, "Vleft" => a.v_left, "Vright" => a.v_right,
        _ => panic!("no quantity {q}"),
    }
}

#[test]
fn closed_forms_for_simply_supported_fixed_propped_cantilever_and_continuous_beams() {
    let mut checked = 0;
    for c in cases(&fixtures()) {
        let r = solved(&json::input(c.get("model")));
        let ex = r.extremes;
        for e in c.get("expect").arr().unwrap() {
            let q = e.s("quantity");
            // Zero-valued expectations are compared against the size of that quantity elsewhere on the beam.
            let scale = match q { "v" => ex.v.value.abs(), "theta" => ex.v.value.abs() / r.model.length, "R" => ex.v_shear.value.abs(), _ => ex.m.value.abs() };
            close(quantity(&r, q, e.f("x")), e.f("value"), scale, &format!("{} {}", c.s("id"), e.s("formula")), 1e-9);
            checked += 1;
        }
    }
    assert!(checked >= 40);
}

/// The reactions and the point values of a frozen exact solution, against the solver's, each to `tol`
/// of the largest value of its kind.
fn agrees(id: &str, r: &Solved, reference: &Value, tol: f64) {
    let refs = reference.get("reactions").arr().unwrap();
    let points = reference.get("points").arr().unwrap();
    let l = r.model.length;
    let big = |k: &[&str], v: &[Value]| v.iter().flat_map(|p| k.iter().map(|k| p.f(k).abs())).fold(0.0, f64::max);
    let fs = big(&["Fy"], refs);
    let ms = big(&["Mleft", "Mright"], points).max(fs * l);
    let vs = big(&["v"], points).max(1e-300);
    // Slopes can vanish at every sampled point (all supports and midspans of equal spans); fall back to v/L.
    let ts = big(&["theta"], points).max(vs / l);
    assert_eq!(r.reactions.len(), refs.len(), "{id}");
    for (got, want) in r.reactions.iter().zip(refs) {
        assert_eq!(got.x, want.f("x"), "{id}");
        assert_eq!(got.kind.name(), want.s("kind"), "{id}");
        near(got.fy, want.f("Fy"), tol * fs, &format!("{id} R at {}", got.x));
        near(got.mz, want.f("Mz"), tol * ms, &format!("{id} M at {}", got.x));
    }
    for p in points {
        let x = p.f("x");
        let a = at(r, x);
        if x > 0.0 {
            near(a.v_left, p.f("Vleft"), tol * fs, &format!("{id} V({x}⁻)"));
            near(a.m_left, p.f("Mleft"), tol * ms, &format!("{id} M({x}⁻)"));
        }
        if x < l {
            near(a.v_right, p.f("Vright"), tol * fs, &format!("{id} V({x}⁺)"));
            near(a.m_right, p.f("Mright"), tol * ms, &format!("{id} M({x}⁺)"));
        }
        near(a.v, p.f("v"), tol * vs, &format!("{id} v({x})"));
        near(a.theta, p.f("theta"), tol * ts, &format!("{id} θ({x})"));
    }
}

#[test]
fn stiffness_solution_agrees_with_the_exact_reference_on_every_fixture() {
    let f = fixtures();
    let reference = data(include_str!("../reference.json"));
    let ids = |v: &Value| cases(v).iter().map(|c| c.s("id").to_string()).collect::<Vec<_>>();
    assert_eq!(ids(&reference), ids(&f));
    for (c, want) in cases(&f).iter().zip(cases(&reference)) {
        agrees(c.s("id"), &solved(&json::input(c.get("model"))), want, 1e-9);
    }
}

/// Seeded random beams (lengths from half a metre to over a hundred metres, one to many pinned or fixed
/// supports anywhere, mixed loads), a propped cantilever with loads 2 mm apart and a 90 m beam on 46
/// supports.
#[test]
fn random_beams_agree_with_the_exact_reference() {
    let random = data(include_str!("../random.json"));
    let all = cases(&random);
    let models: Vec<&Value> = all.iter().map(|c| c.get("model")).collect();
    let supports = |m: &Value| m.get("supports").arr().unwrap().to_vec();
    assert!(models.iter().map(|m| supports(m).len()).max().unwrap() >= 30);
    assert!(models.iter().any(|m| supports(m)[0].f("x") > 0.0), "a support away from the left end");
    assert!(models.iter().any(|m| supports(m).last().unwrap().f("x") < m.f("length")), "an overhang on the right");
    assert!(models.iter().map(|m| m.f("length")).fold(f64::INFINITY, f64::min) < 3.0);
    assert!(models.iter().map(|m| m.f("length")).fold(0.0, f64::max) > 20.0);
    for c in all {
        let r = solve(&json::input(c.get("model")), SI).unwrap_or_else(|e| panic!("{}: {}", c.s("id"), e.message));
        agrees(c.s("id"), &r, c, 1e-7);
    }
    let many = all.iter().find(|c| c.s("id") == "many-supports").unwrap();
    assert_eq!(many.get("reactions").arr().unwrap().len(), 46);
}

#[test]
fn loads_and_reactions_are_in_equilibrium_and_supports_hold_their_constraints() {
    for c in cases(&fixtures()) {
        let id = c.s("id");
        let r = solved(&json::input(c.get("model")));
        let q = r.equilibrium;
        assert!(q.fy.abs() <= 1e-10 * q.scale_f, "{id} ΣF");
        assert!(q.mz.abs() <= 1e-10 * q.scale_m, "{id} ΣM");
        let (ex, l) = (r.extremes, r.model.length);
        let v_scale = ex.v.value.abs();
        for s in &r.model.supports {
            let a = at(&r, s.x);
            assert!(a.v.abs() <= 1e-12 * v_scale, "{id} v = 0 at support {}", s.x);
            if s.kind == Kind::Fixed { assert!(a.theta.abs() <= 1e-12 * v_scale / l, "{id} θ = 0 at fixed {}", s.x) }
        }
        // Free or pinned ends carry no moment except an applied couple.
        let couples = |x: f64| r.model.loads.iter().map(|ld| if let Load::Moment { x: p, c } = *ld && p == x { c } else { 0.0 }).sum::<f64>();
        let fixed_at = |x: f64| r.reactions.iter().any(|s| s.x == x && s.kind == Kind::Fixed);
        if !fixed_at(0.0) { close(at(&r, 0.0).m_right, -couples(0.0), ex.m.value.abs(), &format!("{id} M(0⁺)"), 1e-9) }
        if !fixed_at(l) { close(at(&r, l).m_left, couples(l), ex.m.value.abs(), &format!("{id} M(L⁻)"), 1e-9) }
    }
}

#[test]
fn shear_jumps_by_each_point_force_and_moment_jumps_by_minus_each_couple() {
    let r = solved(&fixture("overhang-mixed-asymmetric"));
    let l = r.model.length;
    for ld in &r.model.loads {
        match *ld {
            Load::Point { x, f } if x > 0.0 && x < l => {
                let a = at(&r, x);
                let reaction = r.reactions.iter().find(|s| s.x == x).map_or(0.0, |s| s.fy);
                close(a.v_right - a.v_left, f + reaction, 1e4, &format!("V jump at {x}"), 1e-9);
            }
            Load::Moment { x, c } if x > 0.0 && x < l => { let a = at(&r, x); close(a.m_right - a.m_left, -c, 1e4, &format!("M jump at {x}"), 1e-9) }
            _ => {}
        }
    }
    // The plotted diagram keeps both sides of every jump at the same x.
    let at3: Vec<f64> = diagram(&r, 4).iter().filter(|p| p.x == 3.0).map(|p| p.m).collect();
    assert!(at3.len() >= 2);
    let (hi, lo) = (at3.iter().cloned().fold(f64::MIN, f64::max), at3.iter().cloned().fold(f64::MAX, f64::min));
    assert!((hi - lo - 8e3).abs() < 1e-6);
}

#[test]
fn results_do_not_depend_on_the_number_of_elements() {
    for id in ["fixed-fixed-triangular", "fixed-pinned-pinned-mixed", "two-span-continuous-udl"] {
        let model = fixture(id);
        let coarse = solved(&Input { divisions: Some(1.0), ..model.clone() });
        for n in [2.0, 5.0, 12.0, 40.0] {
            let fine = solved(&Input { divisions: Some(n), ..model.clone() });
            // Hundreds of elements add round-off, not discretisation error.
            for (f, c) in fine.reactions.iter().zip(&coarse.reactions) {
                close(f.fy, c.fy, 1e4, &format!("{id} n={n} R"), 1e-7);
                close(f.mz, c.mz, 1e4, &format!("{id} n={n} M"), 1e-7);
            }
            for x in [0.37, 1.9, 4.4] {
                let (a, b) = (at(&coarse, x), at(&fine, x));
                close(b.m_right, a.m_right, 1e4, &format!("{id} n={n} M({x})"), 1e-7);
                close(b.v, a.v, coarse.extremes.v.value.abs(), &format!("{id} n={n} v({x})"), 1e-7);
            }
        }
    }
}

#[test]
fn re_expressing_the_model_in_mm_n_and_mpa_scales_every_result_as_expected() {
    let model = fixture("fixed-pinned-pinned-mixed");
    let k = 1000.0;
    let mut mm = model.clone();
    mm.length *= k;
    mm.e /= 1e6;
    mm.a *= k * k;
    mm.i *= k * k * k * k;
    for s in mm.supports.iter_mut().flatten() { s.x *= k }
    for l in mm.loads.iter_mut().flatten() {
        l.x *= k;
        l.c *= k;
        l.x1 *= k;
        l.x2 *= k;
        l.q1 /= k;
        l.q2 /= k;
    }
    let (si, mm) = (solved(&model), solved(&mm));
    for (a, b) in si.reactions.iter().zip(&mm.reactions) {
        close(b.fy, a.fy, 1e4, "reaction force (N)", 1e-9);
        close(b.mz, a.mz * k, 1e7, "reaction moment (N·mm)", 1e-9);
    }
    for x in [1.0, 4.25, 7.5] {
        let (a, b) = (at(&si, x), at(&mm, x * k));
        close(b.m_right, a.m_right * k, 1e7, &format!("M({x})"), 1e-9);
        close(b.v, a.v * k, 1.0, &format!("v({x}) in mm"), 1e-9);
        close(b.theta, a.theta, 1e-3, &format!("θ({x})"), 1e-9);
    }
    // Linearity: doubling E halves deflection and leaves the indeterminate reactions unchanged.
    let stiff = solved(&Input { e: 2.0 * model.e, ..model.clone() });
    for (a, b) in stiff.reactions.iter().zip(&si.reactions) { close(a.fy, b.fy, 1e4, "reaction independent of E", 1e-9) }
    close(at(&stiff, 6.0).v, at(&si, 6.0).v / 2.0, 1e-3, "v ∝ 1/E", 1e-9);
}

fn support(kind: &str, x: f64) -> InSupport { InSupport { kind: kind.into(), x } }
fn point(x: f64, f: f64) -> InLoad { InLoad { kind: "point".into(), x, f, ..Default::default() } }
fn couple(x: f64, c: f64) -> InLoad { InLoad { kind: "moment".into(), x, c, ..Default::default() } }
fn dist(x1: f64, x2: f64, q1: f64, q2: f64) -> InLoad { InLoad { kind: "dist".into(), x1, x2, q1, q2, ..Default::default() } }
fn first() -> Input { json::input(cases(&fixtures())[0].get("model")) }

#[test]
fn invalid_models_mechanisms_and_singular_systems_give_useful_errors() {
    let good = first();
    let with = |f: &dyn Fn(&mut Input)| { let mut m = good.clone(); f(&mut m); m };
    let cases: Vec<(Input, &str, &str)> = vec![
        (with(&|m| m.length = 0.0), "length", "greater than zero"),
        (with(&|m| m.length = f64::NAN), "length", "finite"),
        (with(&|m| m.e = -1.0), "material.E", "greater than zero"),
        (with(&|m| m.nu = 0.5), "material.nu", "less than 0.5"),
        (with(&|m| { m.a = 1e-3; m.i = 0.0 }), "section.I", "greater than zero"),
        (with(&|m| m.supports = Some(vec![])), "supports", "at least one support"),
        (with(&|m| m.supports = Some(vec![support("pin", 3.0)])), "supports", "Mechanism"),
        (with(&|m| m.supports = Some(vec![support("pin", 1.0), support("pin", 1.0)])), "supports", "share"),
        (with(&|m| m.supports = Some(vec![support("roller", 0.0), support("pin", 6.0)])), "supports.0.kind", "pin or fixed"),
        (with(&|m| m.supports = Some(vec![support("pin", 0.0), support("pin", 7.0)])), "supports.1.x", "on the beam"),
        (with(&|m| m.loads = Some(vec![dist(4.0, 2.0, -1.0, -1.0)])), "loads.0.x2", "end to the right"),
        (with(&|m| m.loads = Some(vec![InLoad { kind: "point".into(), x: 2.0, f: f64::NAN, ..Default::default() }])), "loads.0.F", "finite"),
        (with(&|m| m.loads = Some(vec![InLoad { kind: "spring".into(), x: 2.0, ..Default::default() }])), "loads.0.kind", "point force"),
        (with(&|m| m.loads = Some(vec![point(3.0 + 1e-9, -1.0), point(3.0, -1.0)])), "loads", "too close"),
        (with(&|m| m.divisions = Some(0.0)), "divisions", "whole number"),
        (with(&|m| { m.e = 1e300; m.a = 1.0; m.i = 1e300 }), "section.I", "overflows"),
    ];
    for (model, field, message) in cases {
        let e = solve(&model, SI).err().unwrap_or_else(|| panic!("{field} {message} solved"));
        assert_eq!(e.field.as_deref(), Some(field), "{}", e.message);
        assert!(e.message.contains(message), "{field}: {}", e.message);
    }
    let e = export_bdf(&Input { loads: Some(vec![]), ..good }, TITLE, SI).unwrap_err();
    assert!(e.message.contains("non-zero load"), "{}", e.message);
}

#[test]
fn error_messages_give_lengths_in_the_chosen_convention() {
    let good = first();
    let msg = |m: Input, units: &str| solve(&m, u(units)).unwrap_err().message;
    assert!(msg(Input { supports: Some(vec![support("pin", 0.0), support("pin", 7.0)]), ..good.clone() }, "N-mm").contains("between 0 and 6000 mm"));
    assert!(msg(Input { length: 1e5, ..good.clone() }, "lbf-in").contains("between 0.0393701 in and 393701 in"));
    assert!(msg(Input { supports: Some(vec![support("pin", 0.0), support("pin", 0.0)]), ..good }, "kN-m").contains("x = 0 m"));
}

#[test]
fn section_properties_follow_the_standard_formulas() {
    let shape = |s: &str, b: Option<f64>, h: Option<f64>, d: Option<f64>, t: Option<f64>| section_properties(&Shape { shape: s.into(), b, h, d, t, ..Default::default() });
    let r = shape("rect", Some(0.1), Some(0.2), None, None).unwrap();
    close(r.a, 0.02, 1.0, "A", 1e-9);
    close(r.i, 0.1 * 0.2f64.powi(3) / 12.0, 1e-4, "I", 1e-9);
    close(r.iy, 0.2 * 0.1f64.powi(3) / 12.0, 1e-4, "Iy", 1e-9);
    close(r.c.unwrap(), 0.1, 1.0, "c", 1e-9);
    let pi = std::f64::consts::PI;
    let c = shape("circle", None, None, Some(0.2), None).unwrap();
    close(c.i, pi * 0.2f64.powi(4) / 64.0, 1e-4, "circle I", 1e-9);
    close(c.j, 2.0 * c.i, 1e-4, "circle J", 1e-9);
    let t = shape("tube", None, None, Some(0.2), Some(0.01)).unwrap();
    close(t.i, pi * (0.2f64.powi(4) - 0.18f64.powi(4)) / 64.0, 1e-4, "tube I", 1e-9);
    assert!(shape("tube", None, None, Some(0.1), Some(0.05)).unwrap_err().message.contains("less than half"));
    let s = |k: Kind| Support { kind: k, x: 0.0 };
    assert_eq!(indeterminacy(&[s(Kind::Fixed), s(Kind::Fixed)]), 2);
    assert_eq!(indeterminacy(&[s(Kind::Pin), s(Kind::Pin)]), 0);
    assert_eq!(indeterminacy(&[s(Kind::Fixed), s(Kind::Pin)]), 1);
}

/* ---------- reading a deck back ---------- */

/// A bulk entry: its name, whether it is large field, and its data fields, continuations joined.
struct Entry { name: String, large: bool, fields: Vec<String> }

fn slice(l: &str, from: usize, width: usize) -> String { l.get(from.min(l.len())..(from + width).min(l.len())).unwrap_or("").trim().to_string() }

fn bulk(deck: &str) -> Vec<Entry> {
    let lines: Vec<&str> = deck.split('\n').collect();
    let (begin, end) = (lines.iter().position(|l| *l == "BEGIN BULK").unwrap(), lines.iter().position(|l| *l == "ENDDATA").unwrap());
    let mut out: Vec<Entry> = vec![];
    for l in &lines[begin + 1..end] {
        if l.starts_with('$') { continue }
        let head = slice(l, 0, 8);
        let more = head.is_empty() || head == "*";
        let large = if more { out.last().unwrap().large } else { head.ends_with('*') };
        let width = if large { 16 } else { 8 };
        let fields = (0..if large { 4 } else { 8 }).map(|k| slice(l, 8 + k * width, width));
        if more { out.last_mut().unwrap().fields.extend(fields) } else { out.push(Entry { name: head.replace('*', ""), large, fields: fields.collect() }) }
    }
    out
}
fn named<'a>(e: &'a [Entry], name: &str) -> Vec<&'a Entry> { e.iter().filter(|x| x.name == name).collect() }

/// A NASTRAN real, including the exponent-without-E form 1.5-3.
fn nreal(text: &str) -> f64 {
    let b = text.as_bytes();
    let at = (1..b.len()).rev().find(|&i| matches!(b[i], b'+' | b'-') && (b[i - 1].is_ascii_digit() || b[i - 1] == b'.'));
    let t = match at { Some(i) if !text.contains('E') => format!("{}E{}", &text[..i], &text[i..]), _ => text.to_string() };
    t.parse().unwrap_or_else(|_| panic!("not a real: {text}"))
}

/// The beam a deck encodes, in the deck's own numbers, checking the assumptions the exporter makes.
fn model_from_bdf(deck: &str) -> Input {
    let lines: Vec<&str> = deck.split('\n').collect();
    let case = |k: &str| lines.iter().find_map(|l| l.trim().strip_prefix(k).and_then(|r| r.trim().strip_prefix('=')).map(|v| v.trim().to_string())).unwrap();
    let (spc, load) = (case("SPC"), case("LOAD"));
    assert_eq!((spc.as_str(), load.as_str()), ("1", "2"));
    let e = bulk(deck);
    assert_eq!(named(&e, "PARAM").iter().map(|p| (p.fields[0].as_str(), p.fields[1].as_str())).collect::<Vec<_>>(), [("POST", "0")]);
    let ps = &named(&e, "GRDSET")[0].fields[6];
    assert_eq!(ps, "345");
    let mut xs = std::collections::HashMap::new();
    for g in named(&e, "GRID") {
        assert_eq!((nreal(&g.fields[3]), nreal(&g.fields[4])), (0.0, 0.0), "every GRID lies on basic X");
        assert!(g.fields[1].is_empty() && g.fields[5].is_empty() && g.fields[6].is_empty());
        xs.insert(g.fields[0].clone(), nreal(&g.fields[2]));
    }
    let x0 = xs.values().cloned().fold(f64::INFINITY, f64::min);
    let length = xs.values().cloned().fold(f64::NEG_INFINITY, f64::max) - x0;
    let mat = named(&e, "MAT1")[0];
    let prop = named(&e, "PBAR")[0];
    assert_eq!(prop.fields[1], mat.fields[0], "PBAR references the MAT1");
    let mut bars = std::collections::HashMap::new();
    let mut chain = vec![];
    for b in named(&e, "CBAR") {
        assert_eq!(b.fields[1], prop.fields[0]);
        assert_eq!((nreal(&b.fields[4]), nreal(&b.fields[5]), nreal(&b.fields[6])), (0.0, 1.0, 0.0), "orientation +Y");
        let (a, z) = (xs[&b.fields[2]], xs[&b.fields[3]]);
        assert!(z > a, "CBAR runs in +X");
        chain.push((a, z));
        bars.insert(b.fields[0].clone(), (a, z));
    }
    chain.sort_by(|p, q| p.partial_cmp(q).unwrap());
    assert!(chain.windows(2).all(|w| w[0].1 == w[1].0), "one continuous chain");
    let mut supports = vec![];
    for s in named(&e, "SPC1") {
        assert_eq!(s.fields[0], spc);
        let kind = match s.fields[1].as_str() { "12" => "pin", "126" => "fixed", c => panic!("components {c}") };
        supports.extend(s.fields[2..].iter().filter(|g| !g.is_empty()).map(|g| support(kind, xs[g] - x0)));
    }
    let mut loads = vec![];
    for f in named(&e, "FORCE") {
        assert_eq!((f.fields[0].as_str(), f.fields[2].as_str()), (load.as_str(), "0"));
        assert_eq!((nreal(&f.fields[4]), nreal(&f.fields[5]), nreal(&f.fields[6])), (0.0, 1.0, 0.0));
        loads.push(point(xs[&f.fields[1]] - x0, nreal(&f.fields[3])));
    }
    for m in named(&e, "MOMENT") {
        assert_eq!((m.fields[0].as_str(), m.fields[2].as_str()), (load.as_str(), "0"));
        assert_eq!((nreal(&m.fields[4]), nreal(&m.fields[5]), nreal(&m.fields[6])), (0.0, 0.0, 1.0));
        loads.push(couple(xs[&m.fields[1]] - x0, nreal(&m.fields[3])));
    }
    for p in named(&e, "PLOAD1") {
        assert_eq!((p.fields[0].as_str(), p.fields[2].as_str(), p.fields[3].as_str()), (load.as_str(), "FY", "FR"));
        assert_eq!((nreal(&p.fields[4]), nreal(&p.fields[6])), (0.0, 1.0), "over the whole element");
        let (a, z) = bars[&p.fields[1]];
        loads.push(dist(a - x0, z - x0, nreal(&p.fields[5]), nreal(&p.fields[7])));
    }
    Input {
        length, e: nreal(&mat.fields[1]), nu: nreal(&mat.fields[3]), a: nreal(&prop.fields[2]), i: nreal(&prop.fields[3]),
        iy: Some(nreal(&prop.fields[4])), j: Some(nreal(&prop.fields[5])), c: None, divisions: Some(1.0), supports: Some(supports), loads: Some(loads),
    }
}

/// A model read in convention `u`, back in SI.
fn to_si(m: &Input, u: &Units) -> Input {
    let f = |q: Q| u.factor(q);
    Input {
        length: m.length * f(Q::Length), e: m.e * f(Q::Stress), a: m.a * f(Q::Area), i: m.i * f(Q::Inertia), iy: m.iy.map(|v| v * f(Q::Inertia)), j: m.j.map(|v| v * f(Q::Inertia)),
        supports: m.supports.as_ref().map(|s| s.iter().map(|s| InSupport { x: s.x * f(Q::Length), ..s.clone() }).collect()),
        loads: m.loads.as_ref().map(|s| s.iter().map(|l| InLoad { x: l.x * f(Q::Length), x1: l.x1 * f(Q::Length), x2: l.x2 * f(Q::Length), f: l.f * f(Q::Force), c: l.c * f(Q::Moment),
            q1: l.q1 * f(Q::Distributed), q2: l.q2 * f(Q::Distributed), ..l.clone() }).collect()),
        ..m.clone()
    }
}

#[test]
fn the_nastran_deck_is_hand_style_fixed_column_bulk_data_for_the_solved_mesh() {
    for c in cases(&fixtures()) {
        let input = json::input(c.get("model"));
        let deck = export_bdf(&input, TITLE, SI).unwrap();
        let nodes = mesh(&validate(&input, SI).unwrap()).unwrap();
        let lines: Vec<&str> = deck.split('\n').collect();
        assert_eq!(lines.iter().filter(|l| **l == "SOL 101").count(), 1);
        let (cend, begin) = (lines.iter().position(|l| *l == "CEND").unwrap(), lines.iter().position(|l| *l == "BEGIN BULK").unwrap());
        assert!(cend < begin);
        let case: Vec<&str> = lines[cend + 1..begin].iter().map(|l| l.trim()).collect();
        for card in ["TITLE = BEAMDIAG LINEAR STATIC", "SUBCASE 1", "SPC = 1", "LOAD = 2", "DISPLACEMENT = ALL", "SPCFORCES = ALL"] { assert!(case.contains(&card), "{card}") }
        assert_eq!(lines[lines.len() - 2], "ENDDATA");
        let body = &lines[begin + 1..lines.iter().position(|l| *l == "ENDDATA").unwrap()];
        for banner in ["Material and property", "Grid points", "Elements", "Constraints", "Loads"] { assert!(body.contains(&format!("$ ---- {banner} ----").as_str()), "{banner}") }
        for l in body {
            assert!(l.len() <= 72, "line too long: {l}");
            if l.starts_with('$') { continue }
            let head = &l[..8.min(l.len())];
            let width = if head.trim().ends_with('*') || l.starts_with('*') { 16 } else { 8 };
            let name = head.trim_end();
            assert!(name.trim_end_matches('*').bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit()) && name.matches('*').count() <= 1 && !name.starts_with(' '), "{l}");
            let mut i = 8;
            while i < l.len() { assert!(!slice(l, i, width).contains(char::is_whitespace), "{l}"); i += width }
        }
        let e = bulk(&deck);
        // Cards of one type share one format.
        for x in &e { assert!(named(&e, &x.name).iter().all(|y| y.large == x.large), "{}", x.name) }
        let grids = named(&e, "GRID");
        assert_eq!(grids.iter().map(|g| g.fields[0].parse::<usize>().unwrap()).collect::<Vec<_>>(), (1..=nodes.len()).collect::<Vec<_>>());
        for (g, x) in grids.iter().zip(&nodes) { close(nreal(&g.fields[2]), *x, input.length, "GRID", 1e-14) }
        assert_eq!(named(&e, "CBAR").iter().map(|b| b.fields[0].parse::<usize>().unwrap()).collect::<Vec<_>>(), (1..nodes.len()).collect::<Vec<_>>());
        // One SPC1 per support kind, listing every support grid once.
        let spc1 = named(&e, "SPC1");
        assert!(spc1.len() <= 2);
        assert_eq!(spc1.iter().flat_map(|s| s.fields[2..].iter().filter(|g| !g.is_empty())).count(), input.supports.as_ref().unwrap().len());
    }
    let deck = export_bdf(&fixture("simply-supported-udl"), TITLE, SI).unwrap();
    let lines: Vec<&str> = deck.split('\n').collect();
    for card in ["PARAM   POST    0", "MAT1    1       2.E11           0.3", "PBAR    1       1       0.005   8.E-5   8.E-5   1.6E-4",
        "GRDSET                                                  345", "GRID    2               1.5     0.      0.", "CBAR    1       1       1       2       0.      1.      0.",
        "SPC1    1       12      1       5", "PLOAD1  2       1       FY      FR      0.      -10000. 1.      -10000."] {
        assert!(lines.contains(&card), "{card}");
    }
}

#[test]
fn reals_are_written_compactly_and_exactly_falling_back_to_large_field() {
    for (x, text) in [(0.0, "0."), (6.0, "6."), (0.3, "0.3"), (-40000.0, "-40000."), (200e9, "2.E11"), (8e-5, "8.E-5"), (0.005, "0.005"), (1.6e-4, "1.6E-4"), (-1.25e-7, "-1.25-7"), (4.456e-4, "4.456-4")] {
        assert_eq!(exact_real(x, 8).as_deref(), Some(text));
        assert_eq!(nreal(text), x);
    }
    assert_eq!(exact_real(1.0 / 3.0, 8), None);
    assert_eq!(nreal(&exact_real(0.123456789, 16).unwrap()), 0.123456789);
    for x in [-1.2345678901234e-300, 1.0 / 3.0, 7.0 / 6.0, -123456.789012345] {
        let text = nastran_real(x);
        assert!(text.len() <= 16, "{text}");
        close(nreal(&text), x, 0.0, &format!("rounded {x}"), 1e-10);
    }
    // A mesh in sevenths cannot be written exactly in eight characters, so every GRID goes large field.
    let model = Input { divisions: Some(7.0), ..first() };
    let deck = export_bdf(&model, TITLE, SI).unwrap();
    let e = bulk(&deck);
    let grids = named(&e, "GRID");
    assert!(grids.iter().all(|g| g.large));
    let nodes = mesh(&validate(&model, SI).unwrap()).unwrap();
    for (g, x) in grids.iter().zip(&nodes) { close(nreal(&g.fields[2]), *x, 6.0, "GRID", 1e-14) }
}

#[test]
fn every_deck_rebuilds_the_same_beam_in_every_unit_convention() {
    let reference = data(include_str!("../reference.json"));
    for (c, want) in cases(&fixtures()).iter().zip(cases(&reference)) {
        let model = json::input(c.get("model"));
        for u in &UNITS {
            let deck = export_bdf(&model, TITLE, u).unwrap();
            assert!(deck.contains(&format!("$ Units {}.", u.ascii)), "{}", u.id);
            let got = model_from_bdf(&deck);
            let f = |q: Q| u.factor(q);
            let id = format!("{} {}", c.s("id"), u.id);
            close(got.length * f(Q::Length), model.length, 0.0, &format!("{id} length"), 1e-12);
            close(got.e * f(Q::Stress), model.e, 0.0, &format!("{id} E"), 1e-12);
            close(got.nu, model.nu, 0.0, &format!("{id} nu"), 1e-9);
            close(got.a * f(Q::Area), model.a, 0.0, &format!("{id} A"), 1e-9);
            close(got.i * f(Q::Inertia), model.i, 0.0, &format!("{id} I"), 1e-12);
            let key = |s: &[InSupport], k: f64| { let mut v: Vec<(String, i64)> = s.iter().map(|s| (s.kind.clone(), (s.x * k * 1e9).round() as i64)).collect(); v.sort(); v };
            assert_eq!(key(got.supports.as_ref().unwrap(), f(Q::Length)), key(model.supports.as_ref().unwrap(), 1.0), "{id}");
            // Solved back in SI it gives the original reactions and deflections. Positions come back to
            // rounding, so jumps are not compared.
            let r = solved(&to_si(&got, u));
            let refs = want.get("reactions").arr().unwrap();
            let scale = refs.iter().map(|r| r.f("Fy").abs()).fold(0.0, f64::max);
            for (a, b) in r.reactions.iter().zip(refs) {
                near(a.x, b.f("x"), 1e-12 * model.length, &id);
                near(a.fy, b.f("Fy"), 1e-8 * scale, &id);
                near(a.mz, b.f("Mz"), 1e-8 * scale * model.length, &id);
            }
            let points = want.get("points").arr().unwrap();
            let scale_v = points.iter().map(|p| p.f("v").abs()).fold(0.0, f64::max);
            for p in points { near(at(&r, p.f("x")).v, p.f("v"), 1e-8 * scale_v + 1e-15, &format!("{id} v({})", p.f("x"))) }
        }
    }
    // Reals too long for a 16-character large field are rounded to fit, and supports a few millimetres
    // apart amplify that rounding in the reactions, hence 1e-6.
    for c in cases(&data(include_str!("../random.json"))) {
        let model = json::input(c.get("model"));
        let got = model_from_bdf(&export_bdf(&model, TITLE, SI).unwrap());
        close(got.length, model.length, 0.0, "length", 1e-9);
        let sorted = |s: &[InSupport]| { let mut v = s.to_vec(); v.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap()); v };
        let (gs, ms) = (sorted(got.supports.as_ref().unwrap()), sorted(model.supports.as_ref().unwrap()));
        assert_eq!(gs.len(), ms.len());
        for (a, b) in gs.iter().zip(&ms) { assert_eq!(a.kind, b.kind); near(a.x, b.x, 1e-9 * model.length, "support") }
        let r = solved(&got);
        let refs = c.get("reactions").arr().unwrap();
        let scale = refs.iter().map(|r| r.f("Fy").abs()).fold(0.0, f64::max);
        for (a, b) in r.reactions.iter().zip(refs) {
            near(a.fy, b.f("Fy"), 1e-6 * scale, c.s("id"));
            near(a.mz, b.f("Mz"), 1e-6 * scale * model.length, c.s("id"));
        }
    }
}

#[test]
fn no_cap_on_supports_loads_or_elements() {
    let (n, l) = (150, 149.0);
    let mut loads: Vec<InLoad> = (0..149).map(|i| point(i as f64 + 0.25, -1000.0 * (1 + i % 7) as f64)).collect();
    loads.extend((0..50).map(|i| couple(3.0 * i as f64 + 0.6, if i % 2 == 1 { 500.0 } else { -500.0 })));
    loads.push(dist(0.0, l, -2000.0, -8000.0));
    let model = Input {
        length: l, divisions: Some(50.0), e: 200e9, nu: 0.3, a: 5e-3, i: 8e-5,
        supports: Some((0..n).map(|i| support(if i % 37 == 0 { "fixed" } else { "pin" }, i as f64)).collect()), loads: Some(loads), ..Default::default()
    };
    let r = solved(&model);
    let q = r.equilibrium;
    assert_eq!(r.reactions.len(), n);
    assert!(q.fy.abs() <= 1e-10 * q.scale_f && q.mz.abs() <= 1e-10 * q.scale_m);
    for s in model.supports.as_ref().unwrap() { assert_eq!(at(&r, s.x).v, 0.0) }
    // A finer mesh gives the same reactions up to round-off: the element count is free and exact.
    let coarse = solved(&Input { divisions: Some(1.0), ..model.clone() });
    let rs = coarse.reactions.iter().map(|r| r.fy.abs()).fold(0.0, f64::max);
    for (a, b) in r.reactions.iter().zip(&coarse.reactions) { close(a.fy, b.fy, rs, &format!("R at {}", a.x), 1e-8) }
    let e = bulk(&export_bdf(&model, TITLE, SI).unwrap());
    let grids = named(&e, "GRID").len();
    assert_eq!(grids, mesh(&r.model).unwrap().len());
    assert!(grids > 10000);
    assert_eq!(named(&e, "CBAR").len(), grids - 1);
    assert_eq!(named(&e, "FORCE").len(), 149);
    assert_eq!(named(&e, "MOMENT").len(), 50);
    assert_eq!(named(&e, "PLOAD1").len(), grids - 1);
    // Every support lands on its own GRID with the right constrained components.
    let spcs = named(&e, "SPC1");
    let listed = |c: &str| spcs.iter().filter(|s| s.fields[1] == c).flat_map(|s| s.fields[2..].iter().filter(|g| !g.is_empty()).cloned()).collect::<Vec<_>>();
    let all: std::collections::HashSet<String> = listed("12").into_iter().chain(listed("126")).collect();
    assert_eq!(all.len(), n);
    assert_eq!(listed("126").len(), model.supports.as_ref().unwrap().iter().filter(|s| s.kind == "fixed").count());
    assert_eq!(listed("12").len(), model.supports.as_ref().unwrap().iter().filter(|s| s.kind == "pin").count());
}

#[test]
fn a_very_fine_mesh_costs_the_same_to_plot() {
    let model = fixture("overhang-mixed-asymmetric");
    let coarse = solved(&Input { divisions: Some(1.0), ..model.clone() });
    let (cex, cpts) = (coarse.extremes, diagram(&coarse, 800));
    let t0 = std::time::Instant::now();
    let fine = solved(&Input { divisions: Some(10000.0), ..model.clone() });
    let pts = diagram(&fine, 800);
    assert!(t0.elapsed().as_millis() < 1000, "took {:?}", t0.elapsed());
    assert_eq!(pts.len(), cpts.len());
    assert!(pts.len() < 2000);
    for (p, c) in pts.iter().zip(&cpts) {
        assert_eq!(p.x, c.x);
        close(p.shear, c.shear, cex.v_shear.value.abs(), &format!("V({})", p.x), 1e-9);
        close(p.m, c.m, cex.m.value.abs(), &format!("M({})", p.x), 1e-9);
        close(p.v, c.v, cex.v.value.abs(), &format!("v({})", p.x), 1e-9);
    }
    let ex = fine.extremes;
    for (a, b) in [(ex.v_shear, cex.v_shear), (ex.m, cex.m), (ex.v, cex.v)] { close(a.value, b.value, b.value.abs(), "extreme", 1e-9) }
    // Both sides of every jump are plotted at the event itself.
    for l in &fine.model.loads {
        if let Load::Point { x, .. } = *l && x > 0.0 && x < model.length {
            let a = at(&fine, x);
            let side: Vec<f64> = pts.iter().filter(|p| p.x == x).map(|p| p.shear).collect();
            assert!(side.contains(&a.v_left) && side.contains(&a.v_right), "V jump at {x}");
        }
    }
}

#[test]
fn the_deflection_extreme_is_found_where_the_slope_vanishes() {
    // Simply supported, uniform load: v_max = 5 q L⁴ / (384 EI) at midspan.
    let (l, q, e, i) = (7.0, -12e3, 200e9, 3e-5);
    let r = solved(&Input { length: l, e, nu: 0.3, a: 1e-2, i, supports: Some(vec![support("pin", 0.0), support("pin", l)]),
        loads: Some(vec![point(1.0, 0.0), dist(0.0, l, q, q)]), ..Default::default() });
    let ex = r.extremes;
    close(ex.v.value, 5.0 * q * l.powi(4) / (384.0 * e * i), 1.0, "v max", 1e-12);
    close(ex.v.x, l / 2.0, l, "at midspan", 1e-9);
    close(ex.m.value, -q * l * l / 8.0, 1.0, "M max", 1e-12);
}

#[test]
fn shear_extrema_include_interior_zeros_of_total_intensity() {
    for sign in [-1.0, 1.0] {
        for split in [false, true] {
            let mut loads = if split { vec![dist(0.0, 6.0, -6000.0 * sign, 4000.0 * sign), dist(0.0, 6.0, -4000.0 * sign, 6000.0 * sign)] } else { vec![dist(0.0, 6.0, -10000.0 * sign, 10000.0 * sign)] };
            loads.push(couple(6.0, -60000.0 * sign));
            let r = solved(&Input { length: 6.0, divisions: Some(1.0), supports: Some(vec![support("pin", 0.0), support("pin", 6.0)]), loads: Some(loads), ..first() });
            close(r.extremes.v_shear.x, 3.0, 6.0, "interior shear position", 1e-9);
            close(r.extremes.v_shear.value, -15000.0 * sign, 15000.0, "interior shear value", 1e-9);
        }
    }
}

/* ---------- unit conventions ---------- */

const QUANTITIES: [Q; 9] = [Q::Length, Q::Force, Q::Moment, Q::Distributed, Q::Stress, Q::Area, Q::Inertia, Q::Rigidity, Q::Angle];

#[test]
fn every_unit_convention_is_consistent() {
    assert_eq!(UNITS.iter().map(|u| u.id).collect::<Vec<_>>(), ["kN-m", "N-m", "N-mm", "lbf-in", "kip-in"]);
    assert!(units(DEFAULT_UNITS).is_some());
    for u in &UNITS {
        let (l, f) = (u.factor(Q::Length), u.factor(Q::Force));
        let rel = |a: f64, b: f64| (a - b).abs() / b.abs();
        assert!(rel(u.factor(Q::Stress), f / (l * l)) < 1e-15, "{} stress", u.id);
        assert!(rel(u.factor(Q::Moment), f * l) < 1e-15 && rel(u.factor(Q::Distributed), f / l) < 1e-15, "{} moment, distributed", u.id);
        assert!(rel(u.factor(Q::Inertia), l.powi(4)) < 1e-15 && rel(u.factor(Q::Rigidity), f * l * l) < 1e-15, "{} inertia, rigidity", u.id);
        assert_eq!(u.factor(Q::Angle), 1.0);
        for q in QUANTITIES { assert!(!u.symbol(q).is_empty(), "{} names {}", u.id, q.name()) }
        assert!(u.ascii.bytes().all(|b| (0x20..0x7f).contains(&b)), "NASTRAN comment text is ASCII");
    }
    assert_eq!(u("lbf-in").factor(Q::Force), 4.4482216152605);
    assert_eq!(u("lbf-in").factor(Q::Length), 0.0254);
    assert_eq!(to_units(1.0, Q::Stress, u("N-mm")), 1e-6);
    assert!(units("furlong").is_none());
}

#[test]
fn converting_into_a_convention_and_back_is_exact_to_rounding() {
    let eps = f64::EPSILON;
    for u in &UNITS {
        for q in QUANTITIES {
            for x in [0.0, 1.0, -1.0, 0.1, 6.0, -12345.678, 2e11, 6.6667e-5, 3e-9, 1e-12, 7.3e14, std::f64::consts::PI] {
                let back = from_units(to_units(x, q, u), q, u);
                assert!((back - x).abs() <= 4.0 * eps * x.abs(), "{} {} {x} → {back}", u.id, q.name());
                // A field shows ten significant figures; reading it back stays within that rounding.
                let shown: f64 = beamdiag::num::to_precision(to_units(x, q, u), 10).parse().unwrap();
                assert!((from_units(shown, q, u) - x).abs() <= 5e-10 * x.abs(), "{} {} {x} via field", u.id, q.name());
                // Through every other convention and back again, as a user switching units would.
                let y = UNITS.iter().fold(x, |y, w| from_units(to_units(y, q, w), q, w));
                assert!((y - x).abs() <= 16.0 * eps * x.abs(), "{} {x} through all", q.name());
            }
        }
    }
    let v = validate(&fixture("fixed-pinned-pinned-mixed"), SI).unwrap();
    for u in &UNITS {
        let back = scale_model(&scale_model(&v, u, false, false), u, true, false);
        assert_eq!(back.supports.len(), v.supports.len());
        assert!((back.e - v.e).abs() <= 4.0 * eps * v.e);
        let nums = |l: &Load| match *l { Load::Point { x, f } => vec![x, f], Load::Moment { x, c } => vec![x, c], Load::Dist { x1, x2, q1, q2 } => vec![x1, x2, q1, q2] };
        for (a, b) in back.loads.iter().zip(&v.loads) {
            for (p, q) in nums(a).into_iter().zip(nums(b)) { assert!((p - q).abs() <= 4.0 * eps * q.abs(), "{} load", u.id) }
        }
    }
}

#[test]
fn the_same_beam_entered_in_each_convention_gives_the_same_results() {
    let model = fixture("fixed-pinned-pinned-mixed");
    let si = solved(&model);
    let ex = si.extremes;
    let (f, m, v) = (ex.v_shear.value.abs(), ex.m.value.abs(), ex.v.value.abs());
    let valid = validate(&model, SI).unwrap();
    for u in &UNITS {
        // What a user would type in this convention, read back.
        let entered = scale_model(&valid, u, false, false);
        let r = solved(&Input::from(&scale_model(&entered, u, true, false)));
        for (a, b) in r.reactions.iter().zip(&si.reactions) {
            close(a.fy, b.fy, f, &format!("{} reaction", u.id), 1e-12);
            close(a.mz, b.mz, m, &format!("{} support moment", u.id), 1e-12);
        }
        for x in [0.0, 1.0, 4.25, 7.5, model.length] {
            let (a, b) = (at(&si, x), at(&r, from_units(to_units(x, Q::Length, u), Q::Length, u)));
            close(b.m_right, a.m_right, m, &format!("{} M({x})", u.id), 1e-12);
            close(b.v_right, a.v_right, f, &format!("{} V({x})", u.id), 1e-12);
            close(b.v, a.v, v, &format!("{} v({x})", u.id), 1e-12);
        }
    }
    // A US-customary beam in its own numbers: 240 in simply supported span, 50 lbf/in down, E = 29 000 ksi,
    // I = 100 in⁴. Closed forms: M = wL²/8, v = 5wL⁴/(384 EI), σ = M c / I.
    for (id, w, e) in [("lbf-in", -50.0, 29e6), ("kip-in", -0.05, 29e3)] {
        let (l, i) = (240.0, 100.0);
        let own = Model { length: l, e, nu: 0.3, section: Section { a: 10.0, i, iy: i, j: 2.0 * i, c: Some(6.0) }, divisions: 4,
            supports: vec![Support { kind: Kind::Pin, x: 0.0 }, Support { kind: Kind::Pin, x: l }], loads: vec![Load::Dist { x1: 0.0, x2: l, q1: w, q2: w }] };
        let r = solved(&Input::from(&scale_model(&own, u(id), true, false)));
        let ex = r.extremes;
        let to = |x: f64, q: Q| to_units(x, q, u(id));
        close(to(ex.m.value, Q::Moment), -w * l * l / 8.0, 1.0, &format!("{id} M max"), 1e-12);
        close(to(ex.v.value, Q::Length), 5.0 * w * l.powi(4) / (384.0 * e * i), 1.0, &format!("{id} v max"), 1e-12);
        close(to(r.reactions[0].fy, Q::Force), -w * l / 2.0, 1.0, &format!("{id} reaction"), 1e-12);
        close(to(ex.m.value.abs() * r.model.section.c.unwrap() / r.model.section.i, Q::Stress), -w * l * l / 8.0 * 6.0 / i, 1.0, &format!("{id} stress"), 1e-12);
    }
}

#[test]
fn the_nastran_deck_states_its_unit_convention_and_writes_every_number_in_it() {
    let model = fixture("fixed-pinned-pinned-mixed");
    for u in &UNITS {
        let deck = export_bdf(&model, TITLE, u).unwrap();
        let lines: Vec<&str> = deck.split('\n').collect();
        assert!(lines.contains(&format!("$ Units {}. Beam on X, loads in Y (+ up), moments about Z (+ CCW).", u.ascii).as_str()), "{}", u.id);
        let head = lines[0].strip_prefix("$ Beam, L = ").unwrap();
        let (num, rest) = head.split_at(head.find(' ').unwrap());
        assert!(num.bytes().all(|b| b.is_ascii_digit() || b == b'.') && rest.starts_with(&format!(" {}:", u.symbol(Q::Length))), "{}", lines[0]);
        assert!(deck.is_ascii(), "deck is ASCII");
        // Numbers match the convention: E, A and I read back from MAT1 and PBAR.
        let e = bulk(&deck);
        let rel = |a: f64, b: f64| (a - b).abs() / b.abs();
        assert!(rel(nreal(&named(&e, "MAT1")[0].fields[1]), to_units(model.e, Q::Stress, u)) < 1e-9, "{} E", u.id);
        let pbar = &named(&e, "PBAR")[0].fields;
        assert!(rel(nreal(&pbar[2]), to_units(model.a, Q::Area, u)) < 1e-9, "{} A", u.id);
        assert!(rel(nreal(&pbar[3]), to_units(model.i, Q::Inertia, u)) < 1e-9, "{} I", u.id);
    }
    assert!(export_bdf(&model, TITLE, u("N-mm")).unwrap().contains("MAT1    1       200000.         0.3"));
}
