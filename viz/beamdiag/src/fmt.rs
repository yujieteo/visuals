//! Number formatting and speech, shared by the page, its saved figures, the deck and the hand
//! calculations, so every number reads the same everywhere. Each unit convention puts values on a
//! different scale (a deflection is 0.004 m or 4 mm), so very large and very small magnitudes switch to
//! powers of ten.

use crate::engine::{Equilibrium, Q, Units, jmax};
use crate::num::{js, locale, prec, to_exponential};

/// JavaScript's `s.replace("-", "−")`: the first minus only.
fn minus(s: &str) -> String { s.replacen('-', "−", 1) }

pub fn plain(x: f64, n: usize) -> String { minus(&js(prec(x, n))) }

pub fn pow10(x: f64, n: usize) -> String {
    let t = to_exponential(x, n - 1);
    let (m, e) = t.split_once('e').unwrap();
    let e: String = e.replace('+', "").replacen('-', "⁻", 1).chars()
        .map(|c| c.to_digit(10).map_or(c, |d| SUPERSCRIPT[d as usize])).collect();
    format!("{}×10{e}", plain(m.parse().unwrap(), n))
}

pub fn nf(x: f64, digits: usize) -> String {
    if !x.is_finite() { return "—".into() }
    let a = x.abs();
    if a == 0.0 { return "0".into() }
    if a >= 1e7 || a < 1e-3 { return pow10(x, 4) }
    if a < 1.0 { return plain(x, 4) }
    let d = if a >= 1000.0 { 0 } else if a >= 100.0 { 1 } else if a >= 10.0 { 2 } else { digits };
    minus(&locale(x, d))
}

pub fn sig(x: f64, n: usize) -> String {
    if !x.is_finite() { return "—".into() }
    let a = x.abs();
    if a == 0.0 || (1e-4..1e7).contains(&a) { plain(x, n) } else { pow10(x, n) }
}
/// `sig` at its usual four figures.
pub fn sig4(x: f64) -> String { sig(x, 4) }

pub fn sci(x: f64) -> String {
    if !x.is_finite() { return "—".into() }
    let a = x.abs();
    if a == 0.0 || (1e-2..1e6).contains(&a) { plain(x, 4) } else { pow10(x, 4) }
}

/// Figure labels: plain digits below `big`, otherwise n significant figures × a power of ten, so a label
/// stays a few characters long at any load magnitude in any unit convention.
pub fn short(x: f64, n: usize) -> String { if x.is_finite() && x.abs() >= 1e6 { pow10(x, n) } else { sig(x, n) } }
pub fn short_nf(x: f64, digits: usize) -> String { if x.is_finite() && x.abs() >= 1e6 { pow10(x, 4) } else { nf(x, digits) } }
/// `shortNf` at its usual three digits.
pub fn snf(x: f64) -> String { short_nf(x, 3) }

/// A position measured from the left end, re-measured from `origin` ("left" or "mid") as the page shows
/// it. Round-off of order 1e-12·L reads as exactly mid-span rather than as 10⁻¹⁴ mm.
pub fn from_origin(x: f64, l: f64, mid: bool) -> f64 {
    if !mid { return x }
    let s = x - l / 2.0;
    if s.abs() <= 1e-12 * l { 0.0 } else { prec(s, 12) }
}

/// Relative out-of-balance of loads and reactions, as the page reports it.
pub fn residual(q: &Equilibrium) -> f64 {
    jmax(q.fy.abs() / jmax(q.scale_f, 1e-300), q.mz.abs() / jmax(q.scale_m, 1e-300))
}

/// Span over largest deflection, as in "L/360"; "∞" when the beam does not deflect.
pub fn span_ratio(l: f64, v: f64) -> String { if v.abs() > 0.0 { js((l / v.abs()).round()) } else { "∞".into() } }

const SPOKEN: [(&str, &str, &str); 12] = [
    ("m", "metre", "metres"), ("mm", "millimetre", "millimetres"), ("in", "inch", "inches"),
    ("N", "newton", "newtons"), ("kN", "kilonewton", "kilonewtons"), ("lbf", "pound-force", "pounds-force"), ("kip", "kip", "kips"),
    ("Pa", "pascal", "pascals"), ("kPa", "kilopascal", "kilopascals"), ("MPa", "megapascal", "megapascals"),
    ("psi", "pound per square inch", "pounds per square inch"), ("ksi", "kip per square inch", "kips per square inch"),
];

pub fn spoken_unit(u: &Units, q: Q, plural: bool) -> String {
    let w = |sym: &str, many: bool| { let s = SPOKEN.iter().find(|s| s.0 == sym).unwrap(); if many { s.2 } else { s.1 } };
    let (l, f) = (u.symbol(Q::Length), u.symbol(Q::Force));
    match q {
        Q::Moment => format!("{} {}", w(f, false), w(l, plural)),
        Q::Distributed => format!("{} per {}", w(f, plural), w(l, false)),
        Q::Area => format!("square {}", w(l, plural)),
        Q::Inertia => format!("{} to the fourth", w(l, plural)),
        Q::Rigidity => format!("{} square {}", w(f, false), w(l, plural)),
        Q::Angle => if plural { "radians" } else { "radian" }.into(),
        _ => w(u.symbol(q), plural).into(),
    }
}

const SUPERSCRIPT: [char; 10] = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

/// The trailing "×10⁻⁴" of a page number: the text before it and the exponent as "-4".
fn power(t: &str) -> Option<(&str, String)> {
    let at = t.rfind("×10")?;
    let e = &t[at + "×10".len()..];
    if e.is_empty() || !e.chars().all(|c| c == '⁻' || SUPERSCRIPT.contains(&c)) { return None }
    let digits: String = e.replace('⁻', "").chars().map(|c| char::from(b'0' + SUPERSCRIPT.iter().position(|&s| s == c).unwrap() as u8)).collect();
    Some((&t[..at], format!("{}{digits}", if e.starts_with('⁻') { "-" } else { "" })))
}

/// A number as the page writes it (−1,234 or 1.5×10⁻⁴), read aloud.
pub fn say_number(t: &str) -> String {
    let t = t.strip_prefix('−').map_or(t.to_string(), |r| format!("minus {r}"));
    match power(&t) { Some((m, e)) => format!("{m} times ten to the {}", e.replacen('-', "minus ", 1)), None => t }
}
/// The same, typeset.
pub fn tex_number(t: &str) -> String {
    let t = t.strip_prefix('−').map_or(t.to_string(), |r| format!("-{r}")).replace(',', "{,}");
    match power(&t) { Some((m, e)) => format!("{m}\\times 10^{{{e}}}"), None => t }
}
pub fn tex_unit(sym: &str) -> String {
    format!("\\mathrm{{{}}}", sym.replace('·', "\\cdot ").replace('²', "^2").replace('³', "^3").replace('⁴', "^4"))
}

/// The narration voice every beam deck declares.
pub const VOICE: &str = "bf_emma";

const NUMBER_WORDS: [&str; 13] = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/// "two supports", "one load": a small count in words.
pub fn counted(n: usize, one: &str, many: &str) -> String {
    let w = NUMBER_WORDS.get(n).map_or(n.to_string(), |w| w.to_string());
    format!("{w} {}", if n == 1 { one } else { many })
}

/// "a, b and c".
pub fn list(items: &[String]) -> String {
    match items {
        [] => String::new(),
        [one] => one.clone(),
        [rest @ .., last] => format!("{} and {last}", rest.join(", ")),
    }
}

/// JavaScript's `/^−?1$/.test(t)`: a number that takes a singular unit.
pub fn is_one(t: &str) -> bool { t == "1" || t == "−1" }

/// "1.5 newtons": a formatted number and its unit, read aloud.
pub fn say(t: &str, q: Q, u: &Units) -> String { format!("{} {}", say_number(t), spoken_unit(u, q, !is_one(t))) }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::units;

    #[test]
    fn formats_as_the_page_did() {
        assert_eq!(nf(-1234.5, 3), "−1,235");
        assert_eq!(nf(12.345, 3), "12.35");
        assert_eq!(nf(0.00012345, 3), "1.234×10⁻⁴");
        assert_eq!(nf(2.5e7, 3), "2.5×10⁷");
        assert_eq!(sig(-0.5, 4), "−0.5");
        assert_eq!(pow10(-123456789.0, 3), "−1.23×10⁸");
        assert_eq!(sci(1e-3), "1×10⁻³");
        assert_eq!(short(1.5e6, 3), "1.5×10⁶");
        assert_eq!(say_number("−1.5×10⁻⁴"), "minus 1.5 times ten to the minus 4");
        assert_eq!(tex_number("−1,234×10¹²"), "-1{,}234\\times 10^{12}");
        assert_eq!(tex_unit("N·mm²"), "\\mathrm{N\\cdot mm^2}");
        let u = units("lbf-in").unwrap();
        assert_eq!(spoken_unit(u, Q::Moment, true), "pound-force inches");
        assert_eq!(say("1", Q::Force, u), "1 pound-force");
        assert_eq!(span_ratio(10.0, 0.004), "2500");
        assert_eq!(from_origin(5.0 + 1e-13, 10.0, true), 0.0);
        assert_eq!(counted(13, "load", "loads"), "13 loads");
    }
}
