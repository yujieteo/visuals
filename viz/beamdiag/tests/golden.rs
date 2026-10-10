//! The Rust page against the JavaScript page it replaces: for every frozen beam in golden/cases.json,
//! the solution, the NASTRAN deck in every unit convention, and the report deck and hand calculations
//! in every unit convention and origin must hash as the JavaScript outputs did (golden/hashes.json).
//! With BEAMDIAG_GOLDEN naming a folder of those outputs, a mismatch also shows the first line that differs.

use beamdiag::engine::{Q, SI, UNITS, at, diagram, solve};
use beamdiag::json::{self, Value, obj};
use beamdiag::{bdf, deck, hand, report};

fn q(name: &str) -> Q {
    match name { "length" => Q::Length, "area" => Q::Area, "inertia" => Q::Inertia, _ => panic!("no quantity {name}") }
}

fn outputs(c: &Value) -> Vec<(String, String)> {
    let input = json::input(c.get("model"));
    let r = solve(&input, SI).unwrap_or_else(|e| panic!("{}: {}", c.s("id"), e.message));
    let l = r.model.length;
    let n = |x: f64| Value::Num(x);
    let ex = |e: beamdiag::engine::Extreme| obj([("x", n(e.x)), ("value", n(e.value))]);
    let solved = obj([
        ("reactions", Value::Arr(r.reactions.iter().map(|s| obj([("kind", s.kind.name().into()), ("x", n(s.x)), ("Fy", n(s.fy)), ("Mz", n(s.mz))])).collect())),
        ("displacements", Value::Arr(r.displacements.iter().map(|d| obj([("x", n(d.x)), ("v", n(d.v)), ("theta", n(d.theta))])).collect())),
        ("equilibrium", obj([("Fy", n(r.equilibrium.fy)), ("Mz", n(r.equilibrium.mz)), ("scaleF", n(r.equilibrium.scale_f)), ("scaleM", n(r.equilibrium.scale_m))])),
        ("extremes", obj([("V", ex(r.extremes.v_shear)), ("M", ex(r.extremes.m)), ("v", ex(r.extremes.v))])),
        ("diagram", Value::Arr(diagram(&r, 800).iter().map(|p| obj([("x", n(p.x)), ("V", n(p.shear)), ("M", n(p.m)), ("v", n(p.v)), ("theta", n(p.theta))])).collect())),
        ("at", Value::Arr([0.0, l * 0.37, l / 2.0, l].iter().map(|&x| { let a = at(&r, x);
            obj([("x", n(a.x)), ("Vleft", n(a.v_left)), ("Vright", n(a.v_right)), ("Mleft", n(a.m_left)), ("Mright", n(a.m_right)), ("v", n(a.v)), ("theta", n(a.theta))]) }).collect())),
    ]);
    let mut out = vec![("solve.json".to_string(), json::stringify(&solved))];
    let (title, s) = (c.s("title"), c.get("section"));
    let about = report::Described {
        shape: s.s("shape").into(), section: s.s("label").into(), material: c.get("material").s("label").into(),
        dims: s.get("dims").arr().unwrap().iter().map(|d| { let d = d.arr().unwrap(); (d[0].str().unwrap().into(), d[1].num().unwrap(), q(d[2].str().unwrap())) }).collect(),
    };
    let x = c.f("at");
    for u in &UNITS {
        out.push((format!("{}.bdf", u.id), bdf::export_bdf(&input, bdf::TITLE, u).unwrap_or_else(|e| format!("ERROR {}", e.message))));
        for (origin, mid) in [("left", false), ("mid", true)] {
            let d = hand::derive(&r, u, mid);
            let mut rep = report::beam_report(&r, u, mid, title, &about);
            rep.hand = hand::slides(&d, Some(x));
            out.push((format!("{}-{origin}.deck.md", u.id), deck::deck(&rep).unwrap_or_else(|e| format!("ERROR {e}"))));
            out.push((format!("{}-{origin}.hand.md", u.id), hand::markdown(&d, Some(x), title)));
        }
    }
    out
}

#[test]
fn matches_the_javascript_page() {
    let cases = json::parse(include_str!("golden/cases.json")).unwrap();
    let hashes = json::parse(include_str!("golden/hashes.json")).unwrap();
    let dir = std::env::var("BEAMDIAG_GOLDEN").ok();
    let (mut bad, mut checked) = (vec![], 0);
    for c in cases.arr().unwrap() {
        for (name, text) in outputs(c) {
            let key = format!("{}/{name}", c.s("id"));
            checked += 1;
            if look::sha256(text.as_bytes()) == hashes.s(&key) { continue }
            let mut why = String::new();
            if let Some(d) = &dir {
                let want = std::fs::read_to_string(format!("{d}/{key}")).unwrap_or_default();
                let (mut w, mut g) = (want.split('\n'), text.split('\n'));
                for line in 1.. {
                    match (w.next(), g.next()) {
                        (None, None) => break,
                        (a, b) if a == b => continue,
                        (a, b) => { why = format!(" line {line}\n  want {}\n  got  {}", a.unwrap_or("<end>").chars().take(400).collect::<String>(), b.unwrap_or("<end>").chars().take(400).collect::<String>()); break }
                    }
                }
            }
            bad.push(format!("{key}{why}"));
        }
    }
    assert!(bad.is_empty(), "{} of {checked} outputs differ:\n{}", bad.len(), bad.join("\n"));
}
