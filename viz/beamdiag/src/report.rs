//! The beamdswitch report of a solved beam: every number read from the solver's result and written with
//! the formatter the page uses for that value, so the deck, its narration and the page agree digit for
//! digit. The ::: plot curves are the solver's own shear, moment and deflection written as Macaulay
//! brackets from its reactions and the loads.

use crate::deck::{Frame, Meta, Plot, Report};
use crate::engine::{Kind, Load, Q, Reaction, Solved, Units, indeterminacy, scale_model, to_units};
use crate::fmt::{VOICE, counted, from_origin, list, residual, say_number, sci, sig4, snf, span_ratio, spoken_unit, tex_number, tex_unit};
use crate::num::{js, prec};

/// How a report or a hand calculation writes its numbers: the unit convention and the origin of x.
#[derive(Clone, Copy)]
pub struct View<'a> { pub u: &'a Units, pub mid: bool, pub l: f64 }

impl View<'_> {
    pub fn show(&self, si: f64, q: Q) -> f64 { to_units(si, q, self.u) }
    pub fn sym(&self, q: Q) -> &'static str { self.u.symbol(q) }
    /// The display coordinate of a position measured from the left end, as the page shows it.
    pub fn x(&self, x: f64) -> f64 { self.show(from_origin(x, self.l, self.mid), Q::Length) }
    pub fn text(&self, t: &str, q: Q) -> String { format!("{t} {}", self.sym(q)) }
    pub fn say(&self, t: &str, q: Q) -> String { crate::fmt::say(t, q, self.u) }
    pub fn tex(&self, t: &str, q: Q) -> String { format!("{}\\ {}", tex_number(t), tex_unit(self.sym(q))) }
    pub fn v4(&self, si: f64, q: Q) -> String { sig4(self.show(si, q)) }
    pub fn pos(&self, x: f64) -> String { self.text(&sig4(self.x(x)), Q::Length) }
    pub fn say_pos(&self, x: f64) -> String { format!("x equals {}", self.say(&sig4(self.x(x)), Q::Length)) }
    pub fn units_spoken(&self) -> String {
        format!("{}, {} and {}", spoken_unit(self.u, Q::Force, true), spoken_unit(self.u, Q::Length, true), spoken_unit(self.u, Q::Stress, true))
    }
}

/// What the report says about the section and the material, beyond their numbers.
#[derive(Clone, Debug, Default)]
pub struct Described { pub shape: String, pub section: String, pub dims: Vec<(String, f64, Q)>, pub material: String }

const SHAPE_NAMES: [(&str, &str); 4] = [("rect", "solid rectangle"), ("circle", "solid circle"), ("tube", "circular tube"), ("custom", "custom section")];

/// "Concrete (uncracked, C30/37)" as said: "concrete".
fn material_said(label: &str) -> String {
    let base = match label.find('(') { Some(i) if label.ends_with(')') => label[..i].trim_end(), _ => label };
    base.to_lowercase()
}

/// The method frame: how the reactions follow, for a beam statically indeterminate to degree `deg`
/// (its supports give r = deg + 2 reaction components).
fn method_frame(deg: i64) -> Frame {
    let r = deg + 2;
    if deg <= 0 {
        return Frame {
            title: "Statically determinate: equilibrium alone gives the reactions".into(),
            body: [format!("$$ n = r - 2 = {r} - 2 = 0 $$"), String::new(), "$$ \\sum F_y = 0, \\qquad \\sum M = 0 $$".into(), String::new(),
                "- Two equations, two unknown reaction components.".into(),
                "- The solver still uses the direct stiffness method, which agrees with equilibrium here.".into()].join("\n"),
            narration: ["The supports provide two reaction components, and a planar beam gives two useful equilibrium equations.",
                "So the beam is statically determinate: vertical equilibrium and moment equilibrium fix the reactions.",
                "The solver uses the direct stiffness method for every beam, and for this one it agrees with equilibrium alone."].join(" "),
            ..Default::default()
        };
    }
    let (r, d) = (r as usize, deg as usize);
    Frame {
        title: format!("Indeterminate to degree {deg}: equilibrium needs {}", counted(d, "compatibility condition", "compatibility conditions")),
        body: [format!("$$ n = r - 2 = {r} - 2 = {deg} $$"), String::new(),
            "- Compatibility: $v = 0$ at every support, and $\\theta = 0$ at every fixed support.".into(),
            "- The direct stiffness method enforces all of them at once:".into(),
            "$$ \\mathbf{K}\\,\\mathbf{u} = \\mathbf{f} $$".into(),
            "- It solves for the free deflections and slopes; the reactions are the forces the restrained ones need.".into()].join("\n"),
        notes: "Two-node Hermite beam elements run between the supports and the ends. Loads between them enter as consistent nodal loads, which are the exact fixed-end actions, so the reactions are exact rather than approximate.".into(),
        narration: [format!("The supports provide {}, but a planar beam gives only two useful equilibrium equations.", counted(r, "reaction component", "reaction components")),
            format!("So the beam is statically indeterminate to degree {deg}, and we need {} from compatibility.", counted(d, "extra equation", "extra equations")),
            "Compatibility says the beam cannot deflect at a support, and cannot rotate at a fixed support.".into(),
            "The solver imposes every one of these conditions at once with the direct stiffness method, then reads the reactions from the restrained degrees of freedom.".into()].join(" "),
        ..Default::default()
    }
}

/// The solver's V, M and v in the view's units and origin, as beamdswitch plot expressions written
/// with Macaulay brackets from the reactions and the loads, and the x range they span.
fn macaulay_curves(r: &Solved, w: &View) -> ([String; 3], [String; 2]) {
    let d = scale_model(&r.model, w.u, false, false);
    let ld = d.length;
    let o = if w.mid { ld / 2.0 } else { 0.0 };
    let eps = 1e-9 * ld;
    let num = |v: f64| js(prec(v, 12));
    let shift = |a: f64| { let s = a - o; if s == 0.0 { "x".to_string() } else if s > 0.0 { format!("x - {}", num(s)) } else { format!("x + {}", num(-s)) } };
    let mac = |a: f64, n: u32| format!("max(0, {})^{n}", shift(a));
    // 1 from a on: V and M just right of a.
    let step = |a: f64| format!("min(1, max(0, ({})/{} + 1))", shift(a), num(eps));
    let sum = |terms: &[(f64, String)]| {
        let s: String = terms.iter().filter(|t| t.0 != 0.0).enumerate().map(|(i, (c, t))| {
            let sign = if i > 0 { if *c < 0.0 { " - " } else { " + " } } else if *c < 0.0 { "-" } else { "" };
            format!("{sign}{}{}", num(c.abs()), if t.is_empty() { String::new() } else { format!("*{t}") })
        }).collect();
        if s.is_empty() { "0".into() } else { s }
    };
    // A point action at the right end only affects the diagram at x = L itself, where the page shows the left limit.
    let inside = |a: f64| a < ld;
    let (mut vt, mut mt, mut dt): (Vec<(f64, String)>, Vec<(f64, String)>, Vec<(f64, String)>) = (vec![], vec![], vec![]);
    let eid = d.e * d.section.i;
    let start = r.displacements[0];
    dt.push((w.show(start.v, Q::Length), String::new()));
    dt.push((start.theta, if o != 0.0 { format!("({})", shift(0.0)) } else { "x".into() }));
    for re in &r.reactions {
        let (x, fy, mz) = (to_units(re.x, Q::Length, w.u), w.show(re.fy, Q::Force), w.show(re.mz, Q::Moment));
        if !inside(x) { continue }
        vt.push((fy, step(x)));
        mt.push((fy, mac(x, 1)));
        mt.push((-mz, step(x)));
        dt.push((fy / 6.0 / eid, mac(x, 3)));
        dt.push((-mz / 2.0 / eid, mac(x, 2)));
    }
    for l in &d.loads {
        match *l {
            Load::Point { x, f } if inside(x) => { vt.push((f, step(x))); mt.push((f, mac(x, 1))); dt.push((f / 6.0 / eid, mac(x, 3))) }
            Load::Moment { x, c } if inside(x) => { mt.push((-c, step(x))); dt.push((-c / 2.0 / eid, mac(x, 2))) }
            Load::Dist { x1, x2, q1, q2 } => {
                let s = (q2 - q1) / (x2 - x1);
                for (a, q, sign) in [(x1, q1, 1.0), (x2, q2, -1.0)] {
                    if !inside(a) { continue }
                    vt.push((sign * q, mac(a, 1)));
                    vt.push((sign * s / 2.0, mac(a, 2)));
                    mt.push((sign * q / 2.0, mac(a, 2)));
                    mt.push((sign * s / 6.0, mac(a, 3)));
                    dt.push((sign * q / 24.0 / eid, mac(a, 4)));
                    dt.push((sign * s / 120.0 / eid, mac(a, 5)));
                }
            }
            _ => {}
        }
    }
    ([sum(&vt), sum(&mt), sum(&dt)], [num(-o), num(ld - o)])
}

fn kind_name(k: Kind) -> &'static str { if k == Kind::Pin { "pinned support" } else { "fixed support" } }

/// The report of a solved beam; `title` names it (a preset's label), `about` describes its section and material.
pub fn beam_report(r: &Solved, u: &Units, mid: bool, title: &str, about: &Described) -> Report {
    let m = &r.model;
    let l = m.length;
    let w = View { u, mid, l };
    let ex = r.extremes;
    let deg = indeterminacy(&m.supports);
    let ei = m.e * m.section.i;
    let resid = residual(&r.equilibrium);
    let c = m.section.c;
    let stress = c.map(|c| ex.m.value.abs() * c / m.section.i);
    let ratio = span_ratio(l, ex.v.value);
    let units_spoken = w.units_spoken();

    /* ----- set-up ----- */
    let load_text = |ld: &Load| match *ld {
        Load::Point { x, f } => format!("point force {} at x = {}", w.text(&w.v4(f, Q::Force), Q::Force), w.pos(x)),
        Load::Moment { x, c } => format!("couple {} at x = {}", w.text(&w.v4(c, Q::Moment), Q::Moment), w.pos(x)),
        Load::Dist { x1, x2, q1, q2 } => format!("distributed {} from x = {} to {}",
            if q1 == q2 { w.text(&w.v4(q1, Q::Distributed), Q::Distributed) } else { format!("{} → {}", w.v4(q1, Q::Distributed), w.text(&w.v4(q2, Q::Distributed), Q::Distributed)) },
            w.pos(x1), w.pos(x2)),
    };
    let updown = |v: f64| if v < 0.0 { "downward " } else if v > 0.0 { "upward " } else { "" };
    let load_said = |ld: &Load| match *ld {
        Load::Point { x, f } => format!("a {}point force of {} at {}", updown(f), w.say(&w.v4(f.abs(), Q::Force), Q::Force), w.say_pos(x)),
        Load::Moment { x, c } => format!("a {}couple of {} at {}", if c < 0.0 { "clockwise " } else if c > 0.0 { "counter-clockwise " } else { "" }, w.say(&w.v4(c.abs(), Q::Moment), Q::Moment), w.say_pos(x)),
        Load::Dist { x1, x2, q1, q2 } if q1 == q2 => format!("a uniform {}load of {} from {} to {}", updown(q1), w.say(&w.v4(q1.abs(), Q::Distributed), Q::Distributed), w.say_pos(x1), w.say(&sig4(w.x(x2)), Q::Length)),
        Load::Dist { x1, x2, q1, q2 } => format!("a distributed load varying from {} at {} to {} at {}", w.say(&w.v4(q1, Q::Distributed), Q::Distributed), w.say_pos(x1), w.say(&w.v4(q2, Q::Distributed), Q::Distributed), w.say_pos(x2)),
    };
    let from_where = if mid { "mid-span, negative to the left" } else { "the left end" };
    let mut body = vec![format!("- Length $L$ = {}; x runs from {} to {}, measured from {from_where}.", w.text(&w.v4(l, Q::Length), Q::Length), w.pos(0.0), w.pos(l))];
    body.extend(m.supports.iter().enumerate().map(|(i, s)| format!("- Support {}: {} at x = {}", i + 1, s.kind.name(), w.pos(s.x))));
    if m.loads.is_empty() { body.push("- No loads.".into()) } else { body.extend(m.loads.iter().enumerate().map(|(i, ld)| format!("- Load {}: {}", i + 1, load_text(ld)))) }
    let beam_frame = Frame {
        title: format!("The beam: L = {} on {}, with {}", w.text(&w.v4(l, Q::Length), Q::Length), counted(m.supports.len(), "support", "supports"), counted(m.loads.len(), "load", "loads")),
        body: body.join("\n"),
        notes: "Forces and distributed loads are positive up; couples, rotations and support moments positive counter-clockwise. V(x) is the sum of the upward forces left of the section, and M(x) is positive when it sags the beam.".into(),
        narration: [
            format!("The beam is {} long, with x measured from {} from {} to {}.", w.say(&w.v4(l, Q::Length), Q::Length), if mid { "mid-span, so it runs" } else { "the left end, so it runs" }, w.say(&sig4(w.x(0.0)), Q::Length), w.say(&sig4(w.x(l)), Q::Length)),
            format!("It rests on {}.", list(&m.supports.iter().map(|s| format!("a {} at {}", kind_name(s.kind), w.say_pos(s.x))).collect::<Vec<_>>())),
            if m.loads.is_empty() { "It carries no load.".into() } else { format!("It carries {}.", list(&m.loads.iter().map(load_said).collect::<Vec<_>>())) },
            "Forces are positive upward, couples positive counter-clockwise, and a sagging bending moment is positive.".into(),
        ].join(" "),
        ..Default::default()
    };
    let dims: Vec<String> = about.dims.iter().map(|(label, v, q)| format!("{label} = {}", w.text(&w.v4(*v, *q), *q))).collect();
    let said_dims: Vec<String> = about.dims.iter().map(|(label, v, q)| format!("{} {}", label.split(',').next().unwrap().to_lowercase(), w.say(&w.v4(*v, *q), *q))).collect();
    let mut props = vec![format!("$A$ = {}", w.text(&sci(w.show(m.section.a, Q::Area)), Q::Area)), format!("$I$ = {}", w.text(&sci(w.show(m.section.i, Q::Inertia)), Q::Inertia))];
    if let Some(c) = c { props.push(format!("$c$ = {}", w.text(&sig4(w.show(c, Q::Length)), Q::Length))) }
    props.push(format!("$EI$ = {}", w.text(&sci(w.show(ei, Q::Rigidity)), Q::Rigidity)));
    let or = |s: &str, d: &str| if s.is_empty() { d.to_string() } else { s.to_string() };
    let section_frame = Frame {
        title: format!("Section, material and units: EI = {}", w.text(&sci(w.show(ei, Q::Rigidity)), Q::Rigidity)),
        body: [
            format!("- Section: {}{}", or(&about.section, "custom"), if dims.is_empty() { String::new() } else { format!(", {}", dims.join(", ")) }),
            format!("- {}", props.join(", ")),
            format!("- Material: {}, $E$ = {}, $\\nu$ = {}", or(&about.material, "custom"), w.text(&w.v4(m.e, Q::Stress), Q::Stress), sig4(m.nu)),
            format!("- Units: {}, one consistent convention for every input and result.", u.label),
        ].join("\n"),
        narration: [
            format!("The section is a {}{}, with a second moment of area of {}.", SHAPE_NAMES.iter().find(|s| s.0 == about.shape).map_or("custom section", |s| s.1),
                if said_dims.is_empty() { String::new() } else { format!(", {}", list(&said_dims)) }, w.say(&sci(w.show(m.section.i, Q::Inertia)), Q::Inertia)),
            format!("The material is {}, with a Young's modulus of {}.", if about.material.is_empty() { "a custom material".into() } else { material_said(&about.material) }, w.say(&w.v4(m.e, Q::Stress), Q::Stress)),
            format!("So the flexural rigidity E I is {}.", w.say(&sci(w.show(ei, Q::Rigidity)), Q::Rigidity)),
            format!("Every number in this talk is in {units_spoken}."),
        ].join(" "),
        ..Default::default()
    };

    /* ----- method ----- */
    let statics_frame = Frame {
        title: "Shear and moment follow from statics, deflection from EI v″ = M".into(),
        body: ["$$ V(x) = \\sum_{\\text{left of } x} F_y, \\qquad \\frac{dM}{dx} = V, \\qquad \\frac{dV}{dx} = q $$", "", "$$ EI\\,\\frac{d^2 v}{dx^2} = M(x) $$", "",
            "- Exact at every point force and couple: $V$ jumps by the force, $M$ by minus the couple."].join("\n"),
        narration: ["With the reactions known, the shear force at any section is the sum of the upward forces to its left.", "The bending moment is the integral of the shear.",
            "Integrating the moment over E I twice gives the slope and the deflection.", "The solver does all of this exactly, so every jump at a point force or a couple is kept."].join(" "),
        ..Default::default()
    };

    /* ----- results ----- */
    let reaction_said = |re: &Reaction| {
        let f = snf(w.show(re.fy.abs(), Q::Force));
        let push = if re.fy < 0.0 { "pulls down with" } else { "pushes up with" };
        let mut s = format!("The {} at {} {push} {}", kind_name(re.kind), w.say_pos(re.x), w.say(&f, Q::Force));
        if re.kind == Kind::Fixed {
            s += &format!(", and resists with a {} moment of {}", if re.mz < 0.0 { "clockwise" } else { "counter-clockwise" }, w.say(&snf(w.show(re.mz.abs(), Q::Moment)), Q::Moment));
        }
        format!("{s}.")
    };
    let mut rows = vec![format!("| Support | x ({}) | Force ({}) | Moment ({}) |", w.sym(Q::Length), w.sym(Q::Force), w.sym(Q::Moment)), "| --- | --- | --- | --- |".into()];
    rows.extend(r.reactions.iter().enumerate().map(|(i, re)| format!("| {}, {} | {} | {} | {} |", i + 1, re.kind.name(), sig4(w.x(re.x)), snf(w.show(re.fy, Q::Force)),
        if re.kind == Kind::Fixed { snf(w.show(re.mz, Q::Moment)) } else { "—".into() })));
    rows.extend([String::new(), "Force positive up; moment positive counter-clockwise.".into()]);
    let counted_supports = counted(r.reactions.len(), "support", "supports");
    let reaction_frame = Frame {
        title: format!("Reactions at the {}", counted_supports.strip_prefix("one ").unwrap_or(&counted_supports)),
        body: rows.join("\n"),
        narration: r.reactions.iter().map(reaction_said).collect::<Vec<_>>().join(" "),
        ..Default::default()
    };
    let ([cv, cm, cd], cx) = macaulay_curves(r, &w);
    let plot = |ylabel: String, curve: String| Some(Plot { x: cx.clone(), xlabel: format!("x ({}), from {}", w.sym(Q::Length), if mid { "mid-span" } else { "the left end" }), ylabel, curves: vec![curve] });
    let v = w.v4(ex.v_shear.value, Q::Force);
    let mm = w.v4(ex.m.value, Q::Moment);
    let vmax = w.v4(ex.v.value, Q::Length);
    let sense = if ex.m.value >= 0.0 { "sagging" } else { "hogging" };
    let shear_frame = Frame {
        title: format!("Largest shear: {} at x = {}", w.text(&v, Q::Force), w.pos(ex.v_shear.x)),
        plot: plot(format!("shear force V ({})", w.sym(Q::Force)), cv),
        body: format!("$$ V_{{\\text{{largest}}}} = {} \\quad \\text{{at }} x = {} $$", w.tex(&v, Q::Force), w.tex(&sig4(w.x(ex.v_shear.x)), Q::Length)),
        narration: ["Here is the shear force along the beam.".into(), "It jumps at every support and point force, and slopes wherever a distributed load acts.".into(),
            format!("The largest shear is {}, at {}.", w.say(&v, Q::Force), w.say_pos(ex.v_shear.x))].join(" "),
        ..Default::default()
    };
    let stress_t = stress.map(|s| w.v4(s, Q::Stress));
    let mut mbody = vec![format!("$$ M_{{\\text{{largest}}}} = {} \\quad \\text{{at }} x = {} $$", w.tex(&mm, Q::Moment), w.tex(&sig4(w.x(ex.m.x)), Q::Length))];
    if let Some(st) = &stress_t { mbody.extend([String::new(), format!("$$ \\sigma_{{\\max}} = \\frac{{|M_{{\\text{{largest}}}}|\\, c}}{{I}} = {} $$", w.tex(st, Q::Stress))]) }
    let mut msaid = vec!["Next, the bending moment.".into(), "It is the running integral of the shear, so it peaks where the shear crosses zero or jumps.".into(),
        format!("The largest moment is {}, {sense}, at {}.", w.say(&mm, Q::Moment), w.say_pos(ex.m.x))];
    if let (Some(st), Some(c)) = (&stress_t, c) {
        msaid.push(format!("With the extreme fibre {} from the neutral axis, that is a peak bending stress of {}.", w.say(&sig4(w.show(c, Q::Length)), Q::Length), w.say(st, Q::Stress)));
    }
    let moment_frame = Frame {
        title: format!("Largest moment: {}, {sense}, at x = {}", w.text(&mm, Q::Moment), w.pos(ex.m.x)),
        plot: plot(format!("bending moment M ({})", w.sym(Q::Moment)), cm),
        body: mbody.join("\n"), narration: msaid.join(" "), ..Default::default()
    };
    let deflection_frame = Frame {
        title: format!("Largest deflection: {} at x = {} (L/{ratio})", w.text(&vmax, Q::Length), w.pos(ex.v.x)),
        plot: plot(format!("deflection v ({}), + up", w.sym(Q::Length)), cd),
        body: [format!("$$ v_{{\\text{{largest}}}} = {} \\quad \\text{{at }} x = {} $$", w.tex(&vmax, Q::Length), w.tex(&sig4(w.x(ex.v.x)), Q::Length)), String::new(),
            format!("$$ \\frac{{L}}{{|v_{{\\text{{largest}}}}|}} = {} $$", if ratio == "∞" { "\\infty" } else { &ratio })].join("\n"),
        narration: ["Finally, the deflected shape, positive upward.".into(), format!("The largest deflection is {}, at {}.", w.say(&vmax, Q::Length), w.say_pos(ex.v.x)),
            if ratio == "∞" { "The beam does not deflect.".into() } else { format!("That is the span divided by {ratio}.") }].join(" "),
        ..Default::default()
    };

    /* ----- checks and takeaway ----- */
    let check_frame = Frame {
        title: if resid < 1e-9 { "Loads and reactions balance".into() } else { format!("Loads and reactions balance to a relative error of {}", sci(resid)) },
        body: [format!("- $\\sum F_y$ and $\\sum M$ of the loads and reactions: relative error {}.", sci(resid)),
            format!("- Deflection is zero at every support{}: these are the conditions the solver imposed.", if m.supports.iter().any(|s| s.kind == Kind::Fixed) { ", and slope is zero at every fixed support" } else { "" }),
            format!("- {}", if deg > 0 { format!("Indeterminate to degree {deg}: equilibrium and compatibility both hold.") } else { "Determinate: the reactions follow from equilibrium alone.".into() })].join("\n"),
        narration: [format!("Adding up every load and reaction, the forces and moments balance to a relative error of {}.", say_number(&sci(resid))),
            "The beam does not deflect at any support, which is exactly the condition the solver imposed.".into(),
            if deg > 0 { "So both equilibrium and compatibility hold." } else { "So the reactions are the ones equilibrium alone would give." }.into()].join(" "),
        ..Default::default()
    };
    let mut tsaid = vec![format!("To sum up, the largest bending moment is {}, {sense}, at {}.", w.say(&mm, Q::Moment), w.say_pos(ex.m.x)),
        format!("The largest deflection is {}, at {}.", w.say(&vmax, Q::Length), w.say_pos(ex.v.x))];
    if let Some(st) = &stress_t { tsaid.push(format!("The peak bending stress is {}.", w.say(st, Q::Stress))) }
    let takeaway = Frame {
        title: "Takeaway".into(),
        key: format!("Largest moment {} ({sense}) at x = {}; largest deflection {} at x = {}, L/{ratio}.{}", w.text(&mm, Q::Moment), w.pos(ex.m.x), w.text(&vmax, Q::Length), w.pos(ex.v.x),
            stress_t.as_ref().map_or(String::new(), |st| format!(" Peak bending stress {}.", w.text(st, Q::Stress)))),
        narration: tsaid.join(" "),
        ..Default::default()
    };

    let name = title.trim();
    Report {
        meta: Meta { title: if name.is_empty() { "Beam analysis".into() } else { format!("Beam analysis: {name}") }, subtitle: "Reactions, shear force, bending moment and deflection".into(), voice: VOICE.into(), ..Default::default() },
        narration: format!("Beam analysis{}. We find the reactions, shear force, bending moment and deflection of this beam, with every number from the solver, in {units_spoken}.",
            if name.is_empty() { String::new() } else { format!(": {name}") }),
        notes: String::new(),
        sections: [vec![beam_frame, section_frame], vec![method_frame(deg), statics_frame], vec![reaction_frame, shear_frame, moment_frame, deflection_frame], vec![check_frame, takeaway]],
        hand: vec![],
    }
}
