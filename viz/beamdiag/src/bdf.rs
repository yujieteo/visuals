//! NASTRAN bulk data export (MSC Nastran SOL 101, fixed-format bulk data).

use crate::engine::{Input, Kind, Load, ModelError, Units, fmt, mesh, scale_model, validate};
use crate::num::{prec, shortest};
use std::collections::HashMap;

/// A real in the fewest characters that still read back as exactly the same double, such as 6. 0.3
/// -40000. 2.E11 4.456-4; None when that takes more than `width` characters.
pub fn exact_real(x: f64, width: usize) -> Option<String> {
    if x == 0.0 { return Some("0.".into()) }
    let (d, n) = shortest(x.abs());
    let (digits, e, sign) = (String::from_utf8(d).unwrap(), n - 1, if x < 0.0 { "-" } else { "" });
    let k = digits.len() as i32;
    let plain = if e >= k - 1 { format!("{digits}{}.", "0".repeat((e - k + 1) as usize)) }
        else if e >= 0 { format!("{}.{}", &digits[..e as usize + 1], &digits[e as usize + 1..]) }
        else { format!("0.{}{digits}", "0".repeat((-e - 1) as usize)) };
    let m = format!("{}.{}", &digits[..1], &digits[1..]);
    let mut candidates = vec![];
    if (-3..6).contains(&e) { candidates.push(plain.clone()); candidates.push(plain.strip_prefix("0.").map_or(plain.clone(), |r| format!(".{r}"))) }
    candidates.push(format!("{m}E{e}"));
    candidates.push(format!("{m}{}{e}", if e < 0 { "" } else { "+" }));
    // Prefer a form that leaves a blank column, so neighbouring fields do not run together.
    let fits: Vec<String> = candidates.into_iter().map(|c| format!("{sign}{c}")).collect();
    fits.iter().find(|c| c.len() < width).or_else(|| fits.iter().find(|c| c.len() == width)).cloned()
}

/// A real for a 16-character large field: exact when it fits, otherwise rounded to as many digits as fit.
pub fn nastran_real(x: f64) -> String {
    (1..=17).rev().find_map(|digits| exact_real(if digits == 17 { x } else { prec(x, digits) }, 16)).unwrap()
}

/// A field: an integer, a real or literal text ("" is blank).
#[derive(Clone, Debug)]
pub enum Field { Int(i64), Real(f64), Text(&'static str) }
use Field::{Int, Real, Text};

fn small_field(v: &Field) -> Option<String> {
    match v { Int(n) => Some(n.to_string()), Real(x) => exact_real(*x, 8), Text(s) => Some(s.to_string()) }
}
fn large_field(v: &Field) -> String {
    match v { Real(x) => nastran_real(*x), _ => small_field(v).unwrap() }
}
fn fits_small(fields: &[Field]) -> bool { fields.iter().all(|v| small_field(v).is_some_and(|s| s.len() <= 8)) }

fn pad(s: &str, n: usize) -> String { format!("{s:<n$}") }

/// One small-field entry: the name, then eight 8-character fields per line; continuations start blank.
pub fn small_entry(name: &str, fields: &[Field]) -> Vec<String> {
    let values: Vec<String> = fields.iter().map(|v| small_field(v).unwrap()).collect();
    (0..values.len().max(1)).step_by(8).map(|i| {
        let head = pad(if i == 0 { name } else { "" }, 8);
        let body: String = values[i..(i + 8).min(values.len())].iter().map(|v| pad(v, 8)).collect();
        (head + &body).trim_end().to_string()
    }).collect()
}

/// One large-field entry: NAME* then four 16-character fields per line.
pub fn large_entry(name: &str, fields: &[Field]) -> Result<Vec<String>, ModelError> {
    let values: Vec<String> = fields.iter().map(large_field).collect();
    if let Some(v) = values.iter().find(|v| v.len() > 16) {
        return Err(ModelError { message: format!("Field {v} is wider than 16 characters."), field: None });
    }
    Ok((0..values.len().max(1)).step_by(4).map(|i| {
        let head = pad(&if i == 0 { format!("{name}*") } else { "*".into() }, 8);
        let body: String = values[i..(i + 4).min(values.len())].iter().map(|v| pad(v, 16)).collect();
        (head + &body).trim_end().to_string()
    }).collect())
}

/// Cards of one type share a format: small field unless some value needs more than eight characters
/// to stay exact, then large field for the whole group.
fn card_group(name: &str, rows: &[Vec<Field>]) -> Result<Vec<String>, ModelError> {
    let small = rows.iter().all(|r| fits_small(r));
    let mut out = vec![];
    for r in rows { if small { out.extend(small_entry(name, r)) } else { out.extend(large_entry(name, r)?) } }
    Ok(out)
}

/// A "$" line naming the columns of a small-field card.
fn columns(names: &[&str]) -> String {
    let rest: String = names[1..].iter().map(|n| pad(n, 8)).collect();
    format!("${}{rest}", pad(names[0], 7)).trim_end().to_string()
}

fn count(n: usize, noun: &str) -> String { format!("{n} {noun}{}", if n == 1 { "" } else { "s" }) }

/// The title as a NASTRAN title line takes it: plain characters, at most 60.
fn safe_title(title: &str) -> String {
    let ok = |c: char| c.is_ascii_alphanumeric() || " _.,()+-".contains(c);
    // Each UTF-16 unit of a refused character becomes one space, as the page's regular expression did.
    let s: String = title.chars().flat_map(|c| { let n = if ok(c) { 1 } else { c.len_utf16() }; std::iter::repeat_n(if ok(c) { c } else { ' ' }, n) }).take(60).collect();
    let s = s.trim();
    if s.is_empty() { "BEAMDIAG".into() } else { s.into() }
}

pub const TITLE: &str = "BEAMDIAG LINEAR STATIC";

/// A NASTRAN deck that encodes exactly the model the page solved. The input is SI, like everything
/// here; the deck's numbers are written in `u`.
pub fn export_bdf(input: &Input, title: &str, u: &Units) -> Result<String, ModelError> {
    // Fifteen digits drop the last-bit noise a conversion leaves (5e-3 m² is 5000 mm², not 5000.000000000001).
    let model = scale_model(&validate(input, u)?, u, false, true);
    let nodes = mesh(&model)?;
    let has_load = model.loads.iter().any(|l| match *l { Load::Point { f, .. } => f != 0.0, Load::Moment { c, .. } => c != 0.0, Load::Dist { q1, q2, .. } => q1 != 0.0 || q2 != 0.0 });
    if !has_load { return Err(ModelError { message: "Add a non-zero load before exporting a NASTRAN deck.".into(), field: Some("loads".into()) }) }
    // Every support and point load sits on a mesh node; −0 and 0 are one position.
    let ids: HashMap<u64, i64> = nodes.iter().enumerate().map(|(i, x)| ((x + 0.0).to_bits(), i as i64 + 1)).collect();
    let gid = |x: f64| ids[&(x + 0.0).to_bits()];
    let (s, sec) = (u, model.section);
    let (spc, load) = (1, 2);
    let mut lines: Vec<String> = vec![
        format!("$ Beam, L = {} {}: {}, {}, {}, {}", fmt(model.length), s.symbol(crate::engine::Q::Length), count(nodes.len(), "grid"), count(nodes.len() - 1, "CBAR"), count(model.supports.len(), "support"), count(model.loads.len(), "load")),
        format!("$ Units {}. Beam on X, loads in Y (+ up), moments about Z (+ CCW).", s.ascii),
    ];
    lines.extend(["SOL 101", "CEND"].map(String::from));
    lines.push(format!("TITLE = {}", safe_title(title)));
    lines.extend(["ECHO = NONE", "DISPLACEMENT = ALL", "SPCFORCES = ALL", "OLOAD = ALL", "FORCE = ALL", "SUBCASE 1", "  LABEL = BEAM LOADS"].map(String::from));
    lines.push(format!("  SPC = {spc}"));
    lines.push(format!("  LOAD = {load}"));
    lines.extend(["BEGIN BULK", "$ Write the .xdb results database"].map(String::from));
    lines.extend(small_entry("PARAM", &[Text("POST"), Int(0)]));
    lines.extend(["$", "$ ---- Material and property ----"].map(String::from));
    lines.push(columns(&["MAT1", "MID", "E", "G", "NU"]));
    lines.extend(card_group("MAT1", &[vec![Int(1), Real(model.e), Text(""), Real(model.nu)]])?);
    lines.push("$ I1 = in-plane I. K1, K2 blank: no shear flexibility (Euler-Bernoulli).".into());
    lines.push(columns(&["PBAR", "PID", "MID", "A", "I1", "I2", "J"]));
    lines.extend(card_group("PBAR", &[vec![Int(1), Int(1), Real(sec.a), Real(sec.i), Real(sec.iy), Real(sec.j)]])?);
    lines.extend(["$", "$ ---- Grid points ----", "$ Planar beam: PS = 345 on every grid leaves only T1, T2 and R3 free."].map(String::from));
    lines.push(columns(&["GRDSET", "", "CP", "", "", "", "CD", "PS"]));
    lines.extend(small_entry("GRDSET", &[Text(""), Text(""), Text(""), Text(""), Text(""), Text(""), Int(345)]));
    lines.push(columns(&["GRID", "ID", "CP", "X1", "X2", "X3"]));
    let grids: Vec<Vec<Field>> = nodes.iter().enumerate().map(|(i, &x)| vec![Int(i as i64 + 1), Text(""), Real(x), Real(0.0), Real(0.0)]).collect();
    lines.extend(card_group("GRID", &grids)?);
    lines.extend(["$", "$ ---- Elements ----"].map(String::from));
    lines.push(columns(&["CBAR", "EID", "PID", "GA", "GB", "X1", "X2", "X3"]));
    let bars: Vec<Vec<Field>> = (1..nodes.len() as i64).map(|e| vec![Int(e), Int(1), Int(e), Int(e + 1), Real(0.0), Real(1.0), Real(0.0)]).collect();
    lines.extend(card_group("CBAR", &bars)?);
    lines.extend(["$", "$ ---- Constraints ----", "$ Pin: 12 (T1, T2). Fixed: 126 (T1, T2, R3)."].map(String::from));
    lines.push(columns(&["SPC1", "SID", "C", "G1", "G2", "G3", "G4", "G5", "G6"]));
    for (kind, c) in [(Kind::Pin, 12), (Kind::Fixed, 126)] {
        let mut g: Vec<i64> = model.supports.iter().filter(|s| s.kind == kind).map(|s| gid(s.x)).collect();
        g.sort();
        if !g.is_empty() {
            let mut f = vec![Int(spc), Int(c)];
            f.extend(g.into_iter().map(Int));
            lines.extend(small_entry("SPC1", &f));
        }
    }
    lines.extend(["$", "$ ---- Loads ----"].map(String::from));
    let forces: Vec<Vec<Field>> = model.loads.iter().filter_map(|l| match *l {
        Load::Point { x, f } if f != 0.0 => Some(vec![Int(load), Int(gid(x)), Int(0), Real(f), Real(0.0), Real(1.0), Real(0.0)]), _ => None }).collect();
    if !forces.is_empty() {
        lines.push(columns(&["FORCE", "SID", "G", "CID", "F", "N1", "N2", "N3"]));
        lines.extend(card_group("FORCE", &forces)?);
    }
    let moments: Vec<Vec<Field>> = model.loads.iter().filter_map(|l| match *l {
        Load::Moment { x, c } if c != 0.0 => Some(vec![Int(load), Int(gid(x)), Int(0), Real(c), Real(0.0), Real(0.0), Real(1.0)]), _ => None }).collect();
    if !moments.is_empty() {
        lines.push(columns(&["MOMENT", "SID", "G", "CID", "M", "N1", "N2", "N3"]));
        lines.extend(card_group("MOMENT", &moments)?);
    }
    // One PLOAD1 per element under each distributed load, with the intensities at the element ends.
    let mut ploads = vec![];
    for l in &model.loads {
        let Load::Dist { x1, x2, q1, q2 } = *l else { continue };
        if q1 == 0.0 && q2 == 0.0 { continue }
        let q = |x: f64| q1 + (q2 - q1) * (x - x1) / (x2 - x1);
        for e in 0..nodes.len() - 1 {
            let (a, b) = (nodes[e], nodes[e + 1]);
            if a >= x1 && b <= x2 { ploads.push(vec![Int(load), Int(e as i64 + 1), Text("FY"), Text("FR"), Real(0.0), Real(q(a)), Real(1.0), Real(q(b))]) }
        }
    }
    if !ploads.is_empty() {
        lines.push(columns(&["PLOAD1", "SID", "EID", "TYPE", "SCALE", "X1", "P1", "X2", "P2"]));
        lines.extend(card_group("PLOAD1", &ploads)?);
    }
    lines.extend(["$", "ENDDATA", ""].map(String::from));
    Ok(lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reals_read_back_exactly() {
        for (x, w, s) in [(6.0, 8, Some("6.")), (0.3, 8, Some("0.3")), (-40000.0, 8, Some("-40000.")), (2e11, 8, Some("2.E11")), (4.456e-4, 8, Some("4.456-4")),
            (0.0, 8, Some("0.")), (1.0 / 3.0, 8, None), (123456.0, 8, Some("123456.")), (-0.001, 8, Some("-0.001"))] {
            assert_eq!(exact_real(x, w).as_deref(), s, "{x}");
        }
        assert_eq!(nastran_real(1.0 / 3.0), ".333333333333333");
        assert_eq!(safe_title("Fixed–fixed beam 𝑥"), "Fixed fixed beam");
    }
}
