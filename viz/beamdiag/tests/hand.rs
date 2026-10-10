//! The hand calculations: their own chain against the solver and the exact reference, and their
//! Markdown and deck slides as beamdswitch reads them.

use beamdiag::deck::{self, Frame};
use beamdiag::engine::*;
use beamdiag::hand::{self, Block, WRITE_UNKNOWNS, UKind, derive, markdown_of, slides_of};
use beamdiag::json::{self, Value};
use beamdiag::report::{Described, beam_report};

fn data(text: &str) -> Value { json::parse(text).unwrap() }
fn cases(v: &Value) -> Vec<Value> { v.get("cases").arr().unwrap().to_vec() }
fn solved(i: &Input) -> Solved { solve(i, SI).unwrap_or_else(|e| panic!("{}", e.message)) }
const ORIGINS: [(&str, bool); 2] = [("left", false), ("mid", true)];

/// Each kind of beam the hand calculations must handle.
const KINDS: [(&str, &str); 7] = [
    ("simply-supported-udl", "determinate, two pins"), ("cantilever-tip-load", "cantilever"), ("overhang-mixed-asymmetric", "overhangs"),
    ("fixed-fixed-point-asymmetric", "indeterminate, fixed–fixed"), ("propped-cantilever-udl", "indeterminate, propped cantilever"),
    ("two-span-continuous-udl", "continuous spans"), ("continuous-32-span-fixed-ends-udl", "continuous spans, too many unknowns to write out"),
];

#[test]
fn the_fixtures_cover_every_kind_of_beam_the_hand_calculations_handle() {
    let f = cases(&data(include_str!("../fixtures.json")));
    for (id, kind) in KINDS { assert!(f.iter().any(|c| c.s("id") == id), "{id} ({kind})") }
    let degrees: Vec<i64> = f.iter().map(|c| indeterminacy(&validate(&json::input(c.get("model")), SI).unwrap().supports)).collect();
    assert!(degrees.contains(&0) && degrees.iter().any(|d| *d > 0));
}

#[test]
fn the_hand_chain_reproduces_the_solver_and_the_exact_reference() {
    let reference = cases(&data(include_str!("../reference.json")));
    for c in cases(&data(include_str!("../fixtures.json"))) {
        let r = solved(&json::input(c.get("model")));
        let want = reference.iter().find(|x| x.s("id") == c.s("id")).unwrap();
        let ex = r.extremes;
        let l = r.model.length;
        let scale = [ex.v_shear.value.abs(), ex.m.value.abs(), ex.v.value.abs() / l, ex.v.value.abs()];
        let refs = want.get("reactions").arr().unwrap();
        let points = want.get("points").arr().unwrap();
        for u in &UNITS {
            for (origin, mid) in ORIGINS {
                let what = format!("{} {} {origin}", c.s("id"), u.id);
                let d = derive(&r, u, mid);
                let deg = indeterminacy(&r.model.supports);
                assert_eq!(d.written, deg == 0 || d.unknowns.len() <= WRITE_UNKNOWNS, "{what}");
                // Reactions: solved by hand from the written equations whenever they are written.
                if d.written {
                    let values = d.hand.as_ref().unwrap();
                    let size = refs.iter().map(|x| x.f("Fy").abs()).fold(1e-300, f64::max);
                    let msize = refs.iter().map(|x| x.f("Mz").abs() + x.f("Fy").abs() * l).fold(1e-300, f64::max);
                    for (i, k) in d.unknowns.iter().enumerate().filter(|(_, k)| matches!(k.kind, UKind::R | UKind::M)) {
                        let x = d.c.reactions[k.r.unwrap()].x;
                        let re = refs.iter().find(|p| p.f("x") == x).unwrap();
                        let (q, exact, tol) = if k.kind == UKind::R { (Q::Force, re.f("Fy"), size) } else { (Q::Moment, re.f("Mz"), msize) };
                        let got = from_units(values[i], q, u);
                        assert!((got - exact).abs() <= 1e-7 * tol, "{what} {}: hand {got}, reference {exact}", k.name);
                        assert!((d.solver[i] - values[i]).abs() <= 1e-7 * to_units(tol, q, u).abs(), "{what} {}: hand vs solver", k.name);
                    }
                }
                // Every segment: the hand chain at both ends against the solver and the exact reference.
                const KEYS: [(&str, Q); 4] = [("V", Q::Force), ("M", Q::Moment), ("theta", Q::Angle), ("v", Q::Length)];
                for seg in &d.segments {
                    for (k, (key, q)) in KEYS.iter().enumerate() {
                        let tol = 1e-6 * scale[k];
                        let of = |s: &hand::State| [s.v_shear, s.m, s.theta, s.v][k];
                        for (end, hand, solver, x) in [("start", &seg.hand.0, &seg.start, seg.a), ("end", &seg.hand.1, &seg.end, seg.b)] {
                            let (h, s) = (from_units(of(hand), *q, u), from_units(of(solver), *q, u));
                            assert!((h - s).abs() <= tol, "{what} segment {} {end} {key}: hand {h}, solver {s}", seg.index);
                            let Some(p) = points.iter().find(|p| p.f("x") == x) else { continue };
                            let exact = match (*key, end) { ("V", "start") => p.f("Vright"), ("V", _) => p.f("Vleft"), ("M", "start") => p.f("Mright"), ("M", _) => p.f("Mleft"), _ => p.f(key) };
                            assert!((h - exact).abs() <= tol, "{what} segment {} {end} {key}: hand {h}, reference {exact}", seg.index);
                        }
                        // The written polynomials, evaluated at the far end, land on the solver's value there.
                        let by = if k >= 2 { d.c.ei } else { 1.0 };
                        let at_end = seg.poly[k].iter().enumerate().fold(0.0, |acc, (n, c)| acc + c * seg.h.powi(n as i32)) / by;
                        assert!((from_units(at_end, *q, u) - from_units(of(&seg.end), *q, u)).abs() <= tol, "{what} segment {} {key}(h)", seg.index);
                    }
                }
                assert_eq!(d.segments.len(), r.displacements.len() - 1, "{what}");
            }
        }
    }
}

/// The presets, plus beams with a right-hand fixed end, an overhang and no load, as (label, model).
fn beams() -> Vec<(String, Input, Described)> {
    let raw = data(include_str!("../raw.json"));
    let mut presets = raw.get("presets").arr().unwrap().to_vec();
    let timber = |s: &str| { let mut v = data(s); if let Value::Obj(m) = &mut v { m.push(("material".into(), "timber".into())); m.push(("section".into(), data(r#"{"shape":"rect","b":0.05,"h":0.15}"#))) } v };
    presets.extend([
        timber(r#"{"id":"right-cantilever","label":"Right-hand cantilever","length":4,"supports":[{"kind":"fixed","x":4}],
            "loads":[{"kind":"point","x":0,"F":-3000},{"kind":"moment","x":4,"C":2000},{"kind":"dist","x1":1,"x2":4,"q1":-1000,"q2":-4000}]}"#),
        timber(r#"{"id":"overhang","label":"Overhanging beam","length":7.5,"supports":[{"kind":"pin","x":1.25},{"kind":"fixed","x":5}],
            "loads":[{"kind":"point","x":7.5,"F":-8000},{"kind":"moment","x":0,"C":-5000},{"kind":"dist","x1":0,"x2":7.5,"q1":2000,"q2":-6000}]}"#),
        timber(r#"{"id":"unloaded","label":"Unloaded beam","length":3,"supports":[{"kind":"pin","x":0},{"kind":"pin","x":3}],"loads":[]}"#),
    ]);
    presets.iter().map(|p| {
        let m = raw.get("materials").arr().unwrap().iter().find(|m| m.s("id") == p.s("material")).unwrap();
        let s = section_properties(&json::shape(p.get("section"))).unwrap();
        let mut input = json::input(p);
        (input.e, input.nu, input.a, input.i, input.iy, input.j, input.c) = (m.f("E"), m.f("nu"), s.a, s.i, Some(s.iy), Some(s.j), s.c);
        (p.s("label").to_string(), input, Described { material: m.s("label").into(), ..Default::default() })
    }).collect()
}

/// A deck's slides as (kind, section, title, body, narration): kind is "title", "section" or "frame".
fn parse(md: &str) -> Vec<(&'static str, String, String, String, String)> {
    let mut out: Vec<(&str, String, String, String, String)> = vec![("title", String::new(), String::new(), String::new(), String::new())];
    let mut section = String::new();
    let mut lines = md.split('\n');
    while let Some(l) = lines.next() {
        if let Some(t) = l.strip_prefix("## ") { out.push(("frame", section.clone(), t.into(), String::new(), String::new())) }
        else if let Some(t) = l.strip_prefix("# ") { section = t.into(); out.push(("section", t.into(), t.into(), String::new(), String::new())) }
        else if l == "::: narration" { out.last_mut().unwrap().4 = lines.next().unwrap().into(); assert_eq!(lines.next(), Some(":::")) }
        else if l.starts_with(":::") { for m in lines.by_ref() { if m == ":::" { break } } }
        else if out.len() > 1 { let body = &mut out.last_mut().unwrap().3; if !body.is_empty() || !l.is_empty() { *body += l; *body += "\n" } }
    }
    out
}
fn meta<'a>(md: &'a str, key: &str) -> &'a str { md.split('\n').find_map(|l| l.strip_prefix(key).and_then(|r| r.strip_prefix(": "))).unwrap_or("") }

#[test]
fn the_markdown_export_reads_in_beamdswitch_with_spoken_narration_on_every_slide() {
    for (label, input, _) in beams() {
        let r = solved(&input);
        for u in &UNITS {
            for (origin, mid) in ORIGINS {
                let what = format!("{label} {} {origin}", u.id);
                let md = hand::markdown(&derive(&r, u, mid), Some(r.model.length / 4.0), &label);
                assert_eq!(meta(&md, "voice"), "bf_emma", "{what}");
                assert_eq!(meta(&md, "title"), format!("Hand calculations: {label}"), "{what}");
                let slides = parse(&md);
                assert_eq!(slides.iter().filter(|s| s.0 == "section").map(|s| s.2.as_str()).collect::<Vec<_>>(),
                    ["Method and reactions", "Shear, moment, slope and deflection by segment", "At the selected point", "Stress and equilibrium"], "{what}");
                assert_eq!(md.matches("\n::: narration\n").count(), slides.len(), "{what}");
                for s in &slides {
                    assert!(!s.4.trim().is_empty(), "{what}: \"{}\" is narrated", s.2);
                    assert!(!s.4.contains(['$', '\\', '`', '*', '_', '#', '|', '<', '>', '×', '⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '⁻']), "{what}: \"{}\" reads as speech: {}", s.2, s.4);
                }
                // Display maths is one $$ … $$ per line, and every inline $ pairs up.
                for line in md.split('\n') {
                    if line.starts_with("$$") { assert!(line.len() > 6 && line.starts_with("$$ ") && line.ends_with(" $$"), "{what}: {line}") }
                    else { assert_eq!(line.matches('$').count() % 2, 0, "{what}: {line}") }
                }
            }
        }
    }
}

fn report(r: &Solved, u: &Units, mid: bool, at: Option<f64>, title: &str, about: &Described) -> String {
    let mut rep = beam_report(r, u, mid, title, about);
    rep.hand = hand::slides(&derive(r, u, mid), at);
    deck::deck(&rep).unwrap()
}

#[test]
fn the_beamdswitch_deck_carries_the_hand_calculations_as_their_own_narrated_section() {
    let mut n = 0;
    for (label, input, about) in beams() {
        let r = solved(&input);
        for u in &UNITS {
            for (origin, mid) in ORIGINS {
                n += 1;
                if n % 3 != 1 { continue }
                let what = format!("{label} {} {origin}", u.id);
                let md = report(&r, u, mid, Some(r.model.length / 2.0), &label, &about);
                let slides = parse(&md);
                assert_eq!(slides.iter().filter(|s| s.0 == "section").map(|s| s.2.as_str()).collect::<Vec<_>>(), ["Set-up", "Method", "Results", "Hand calculations", "Checks and takeaway"], "{what}");
                let said = |t: &str| slides.iter().find(|s| s.0 == "section" && s.2 == t).unwrap().4.clone();
                assert_eq!(said("Hand calculations"), "Part 4. Hand calculations.");
                assert_eq!(said("Checks and takeaway"), "Part 5. Checks and takeaway.");
                let hand: Vec<_> = slides.iter().filter(|s| s.0 == "frame" && s.1 == "Hand calculations").collect();
                assert!(hand.iter().any(|s| s.2.starts_with("Segment 1:")) && hand.iter().any(|s| s.2.starts_with("At the selected point")), "{what}");
                assert_eq!(md.matches("\n::: narration\n").count(), slides.len(), "{what}");
                assert_eq!(meta(&md, "voice"), "bf_emma", "{what}");
            }
        }
    }
    // A long beam's deck opens a slide for every segment, as the Markdown does.
    let f = cases(&data(include_str!("../fixtures.json")));
    let r = solved(&json::input(f.iter().find(|c| c.s("id") == "random-1").unwrap().get("model")));
    let u = units("N-mm").unwrap();
    let segments = |md: &str| parse(md).iter().filter(|s| s.0 == "frame" && s.2.starts_with("Segment ") && s.2.contains(": x = ")).count();
    assert_eq!(segments(&report(&r, u, false, None, "", &Described::default())), r.displacements.len() - 1);
    assert_eq!(segments(&hand::markdown(&derive(&r, u, false), None, "")), r.displacements.len() - 1);
}

#[test]
fn a_beam_with_too_many_unknowns_states_the_set_up_and_lists_the_solvers_values() {
    let f = cases(&data(include_str!("../fixtures.json")));
    let r = solved(&json::input(f.iter().find(|c| c.s("id") == "continuous-32-span-fixed-ends-udl").unwrap().get("model")));
    let d = derive(&r, units("kN-m").unwrap(), false);
    assert!(!d.written && d.hand.is_none());
    let frames: Vec<hand::HFrame> = hand::frames(&d, None).into_iter().flat_map(|s| s.1).collect();
    let system = frames.iter().find(|f| f.title.starts_with("Compatibility")).unwrap();
    assert!(system.title.contains("too many to write out"));
    assert!(!system.blocks.iter().any(|b| matches!(b, Block::Eq(e) if e.contains("R_{1} +"))), "no numeric rows are written");
    let reactions = frames.iter().find(|f| f.title == "Reactions from the compatibility equations").unwrap();
    assert!(markdown_of(&reactions.blocks).contains("These are the solver's values"));
}

/// What fits on one beamdswitch slide, as measured there: the 1136 × 506 px body holds about 12 rows of
/// 30 px text, where a paragraph wraps after about 80 characters of Markdown, a display equation takes 2
/// rows (1.2 more per extra line, 0.5 more with a fraction) and fits the width while it draws about 63
/// characters, a table row takes 1.1 rows and a list item a row per 80 characters; a title stays on one
/// line up to about 53 characters. A hand-calculation slide is held inside these, so it fits at full size.
const ROWS: f64 = 12.0;
const EQ_CHARS: usize = 60;
const TITLE_CHARS: usize = 50;

/// Rows and widest equation line of a slide body, read from its Markdown.
fn measure(md: &str) -> (f64, usize) {
    let (mut rows, mut widest) = (0.0, 0);
    let wraps = |t: &str| (t.encode_utf16().count() as f64 / 80.0).ceil();
    for block in md.trim().split("\n\n").filter(|b| !b.trim().is_empty()) {
        let block = block.trim_matches('\n');
        if let Some(tex) = block.strip_prefix("$$ ").and_then(|b| b.strip_suffix(" $$")) {
            let lines: Vec<&str> = tex.split(" \\\\ ").collect();
            let lhs = lines[0].split_once("={}&").map_or("", |p| p.0);
            rows += 0.8 + 1.2 * lines.len() as f64 + if tex.contains("\\frac") { 0.5 } else { 0.0 };
            for (i, l) in lines.iter().enumerate() { widest = widest.max(hand::drawn(&if i > 0 { format!("{lhs}{l}") } else { l.to_string() })) }
        } else if block.starts_with("| ") { rows += 1.1 * (block.split('\n').count() - 1) as f64 }
        else if block.starts_with("- ") { rows += block.split('\n').map(|l| wraps(&l[2..])).sum::<f64>() }
        else { rows += wraps(block) }
    }
    (rows, widest)
}

fn numbers(text: &str) -> Vec<String> {
    let mut out = vec![];
    let mut cur = String::new();
    for ch in text.chars() {
        if ch.is_ascii_digit() || (!cur.is_empty() && (ch == '.' || ch == ',')) { cur.push(ch) } else if !cur.is_empty() { out.push(std::mem::take(&mut cur)) }
    }
    if !cur.is_empty() { out.push(cur) }
    out
}

#[test]
fn every_hand_calculation_slide_fits_beamdswitchs_slide_with_every_number() {
    let f = cases(&data(include_str!("../fixtures.json")));
    let mut all: Vec<(String, Input)> = beams().into_iter().map(|(l, i, _)| (l, i)).collect();
    all.extend(f.iter().filter(|c| c.s("id").starts_with("random-") || c.s("id").starts_with("continuous-32")).map(|c| (c.s("id").to_string(), json::input(c.get("model")))));
    // Determinate beams with many loads, whose sums of forces and moments wrap over many lines.
    let base = &all[0].1.clone();
    for n in [12, 14] {
        for (kind, supports) in [("simply supported", vec![("pin", 0.0), ("pin", 10.0)]), ("cantilever", vec![("fixed", 0.0)])] {
            let steel = section_properties(&Shape { shape: "rect".into(), b: Some(0.1), h: Some(0.2), ..Default::default() }).unwrap();
            all.push((format!("{kind}, {n} point loads"), Input {
                length: 10.0, a: steel.a, i: steel.i, iy: Some(steel.iy), j: Some(steel.j), c: steel.c, divisions: None,
                supports: Some(supports.iter().map(|&(k, x)| InSupport { kind: k.into(), x }).collect()),
                loads: Some((0..n).map(|i| InLoad { kind: "point".into(), x: 0.37 + i as f64 * 9.1 / n as f64, f: -1234.567 * (i + 1) as f64, ..Default::default() }).collect()),
                ..base.clone()
            }));
        }
    }
    for (id, model) in all {
        let r = solved(&model);
        let at = r.model.length / 3.0;
        for u in &UNITS {
            for (origin, mid) in ORIGINS {
                let what = format!("{id} {} {origin}", u.id);
                // Split only on the deck: each frame's slides hold its blocks, in order, with the same numbers.
                let d = derive(&r, u, mid);
                for f in hand::frames(&d, Some(at)).into_iter().flat_map(|s| s.1) {
                    let slides: Vec<Frame> = slides_of(&f);
                    assert_eq!(numbers(&slides.iter().map(|s| s.body.as_str()).collect::<Vec<_>>().join("\n")), numbers(&markdown_of(&f.blocks)), "{what}: \"{}\" keeps every number", f.title);
                    assert_eq!(slides[0].title, f.deck_title.clone().unwrap_or(f.title.clone()), "{what}");
                    for s in &slides { assert!(!s.narration.trim().is_empty(), "{what}: \"{}\" is narrated", s.title) }
                }
                let md = report(&r, u, mid, Some(at), "", &Described::default());
                for s in parse(&md).iter().filter(|s| s.0 == "frame" && s.1 == "Hand calculations") {
                    let (rows, widest) = measure(&s.3);
                    assert!(rows <= ROWS, "{what}: \"{}\" takes {rows} rows", s.2);
                    assert!(widest <= EQ_CHARS, "{what}: \"{}\" has an equation {widest} characters wide", s.2);
                    assert!(s.2.encode_utf16().count() <= TITLE_CHARS, "{what}: \"{}\" fits one line", s.2);
                }
            }
        }
    }
    assert_eq!(hand::SLIDE_ROWS, ROWS);
}
