//! JavaScript's number to text conversions, digit for digit: `String(x)`, `toPrecision`,
//! `toExponential`, `toFixed` and `toLocaleString("en-GB")` with fixed fraction digits. The page's
//! formatters were written with them, so every number reads the same as it always has.

/// The shortest digits that read back as x (x finite and positive), and n with x = 0.d₁d₂… × 10ⁿ.
pub(crate) fn shortest(x: f64) -> (Vec<u8>, i32) {
    let s = format!("{x:e}");
    let (m, e) = s.split_once('e').unwrap();
    (m.bytes().filter(u8::is_ascii_digit).collect(), e.parse::<i32>().unwrap() + 1)
}

/// `String(x)`.
pub fn js(x: f64) -> String {
    if x.is_nan() {
        return "NaN".into();
    }
    if x == 0.0 {
        return "0".into();
    }
    if x.is_infinite() {
        return if x > 0.0 { "Infinity" } else { "-Infinity" }.into();
    }
    let (d, n) = shortest(x.abs());
    let k = d.len() as i32;
    let ds = String::from_utf8(d).unwrap();
    let body = if k <= n && n <= 21 {
        format!("{ds}{}", "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &ds[..n as usize], &ds[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{ds}", "0".repeat(-n as usize))
    } else {
        let m = if k == 1 { ds.clone() } else { format!("{}.{}", &ds[..1], &ds[1..]) };
        format!("{m}e{}{}", if n - 1 >= 0 { "+" } else { "-" }, (n - 1).abs())
    };
    if x < 0.0 { format!("-{body}") } else { body }
}

/// Adds one unit in the last place of a digit string; true when it carried out of the first digit.
fn bump(d: &mut [u8]) -> bool {
    for c in d.iter_mut().rev() {
        if *c == b'9' {
            *c = b'0';
        } else {
            *c += 1;
            return false;
        }
    }
    true
}

/// p significant digits of x > 0 and the exponent e of x ≈ d.dd… × 10ᵉ, rounded half up from x's
/// exact binary value, as JavaScript rounds. Rust's own rounding is half to even, so a tail that reads
/// as exactly one half is settled from the exact digits.
fn round_sig(x: f64, p: usize) -> (Vec<u8>, i32) {
    let parse = |s: String| {
        let (m, e) = s.split_once('e').unwrap();
        (m.bytes().filter(u8::is_ascii_digit).collect::<Vec<u8>>(), e.parse::<i32>().unwrap())
    };
    let (mut d, mut e) = parse(format!("{:.*e}", p + 2, x));
    let up = if d[p..] == *b"500" {
        // Every double has at most 767 significant digits, so 780 are exact.
        let (x_d, x_e) = parse(format!("{:.780e}", x));
        d = x_d;
        e = x_e;
        d[p] >= b'5'
    } else {
        d[p] >= b'5'
    };
    d.truncate(p);
    if up && bump(&mut d) {
        d.insert(0, b'1');
        d.truncate(p);
        e += 1;
    }
    (d, e)
}

/// `x.toPrecision(p)`.
pub fn to_precision(x: f64, p: usize) -> String {
    if !x.is_finite() {
        return js(x);
    }
    let sign = if x < 0.0 { "-" } else { "" };
    let (d, e) = if x == 0.0 { (vec![b'0'; p], 0) } else { round_sig(x.abs(), p) };
    let ds = String::from_utf8(d).unwrap();
    let body = if e < -6 || e >= p as i32 {
        let m = if p == 1 { ds.clone() } else { format!("{}.{}", &ds[..1], &ds[1..]) };
        format!("{m}e{}{}", if e >= 0 { "+" } else { "-" }, e.abs())
    } else if e == p as i32 - 1 {
        ds
    } else if e >= 0 {
        format!("{}.{}", &ds[..e as usize + 1], &ds[e as usize + 1..])
    } else {
        format!("0.{}{ds}", "0".repeat((-(e + 1)) as usize))
    };
    format!("{sign}{body}")
}

/// `+x.toPrecision(p)`: x rounded to p significant digits.
pub fn prec(x: f64, p: usize) -> f64 {
    if !x.is_finite() { x } else { to_precision(x, p).parse().unwrap() }
}

/// `x.toExponential(f)`, f fraction digits.
pub fn to_exponential(x: f64, f: usize) -> String {
    if !x.is_finite() {
        return js(x);
    }
    let sign = if x < 0.0 { "-" } else { "" };
    let (d, e) = if x == 0.0 { (vec![b'0'; f + 1], 0) } else { round_sig(x.abs(), f + 1) };
    let ds = String::from_utf8(d).unwrap();
    let m = if f == 0 { ds.clone() } else { format!("{}.{}", &ds[..1], &ds[1..]) };
    format!("{sign}{m}e{}{}", if e >= 0 { "+" } else { "-" }, e.abs())
}

/// `x.toFixed(f)`, rounded half up from the exact value.
pub fn to_fixed(x: f64, f: usize) -> String {
    if !x.is_finite() || x.abs() >= 1e21 {
        return js(x);
    }
    let sign = if x < 0.0 { "-" } else { "" };
    // The integer and f fraction digits, then whether the rest rounds them up.
    let split = |s: &str, take: usize| {
        let (i, frac) = s.split_once('.').unwrap();
        (i.bytes().chain(frac.bytes().take(take)).collect::<Vec<u8>>(), frac.as_bytes()[take..].to_vec())
    };
    let (mut d, tail) = split(&format!("{:.*}", f + 3, x.abs()), f);
    let up = if tail == b"500" {
        // A double's exact expansion ends within 1,074 decimals.
        let (exact, rest) = split(&format!("{:.1100}", x.abs()), f);
        d = exact;
        rest[0] >= b'5'
    } else {
        tail[0] >= b'5'
    };
    if up && bump(&mut d) {
        d.insert(0, b'1');
    }
    fixed_text(sign, d, f)
}

/// Integer digits n of x·10ᶠ as JavaScript writes them: "0.0n", "n.nn".
fn fixed_text(sign: &str, mut d: Vec<u8>, f: usize) -> String {
    while d.len() > 1 && d[0] == b'0' && d.len() > f + 1 {
        d.remove(0);
    }
    while d.len() < f + 1 {
        d.insert(0, b'0');
    }
    let ds = String::from_utf8(d).unwrap();
    let k = ds.len();
    if f == 0 { format!("{sign}{ds}") } else { format!("{sign}{}.{}", &ds[..k - f], &ds[k - f..]) }
}

/// `x.toLocaleString("en-GB", { minimumFractionDigits: f, maximumFractionDigits: f })`: ICU rounds the
/// shortest decimal that reads back as x, half away from zero, then groups the thousands with commas.
pub fn locale(x: f64, f: usize) -> String {
    if !x.is_finite() {
        return if x.is_nan() { "NaN".into() } else if x > 0.0 { "∞".into() } else { "-∞".into() };
    }
    let sign = if x < 0.0 { "-" } else { "" };
    // The digits of x·10ᶠ: the shortest digits, the decimal point moved f places.
    let (mut d, n) = if x == 0.0 { (vec![b'0'], 1) } else { shortest(x.abs()) };
    let point = n + f as i32; // digits before the point of x·10ᶠ
    let int: Vec<u8> = if point <= 0 {
        // All of x·10ᶠ is below one: it rounds to 1 only from a first digit of 5 or more in the first place.
        if point == 0 && d[0] >= b'5' { vec![b'1'] } else { vec![b'0'] }
    } else {
        let p = point as usize;
        while d.len() < p { d.push(b'0') }
        let up = d.len() > p && d[p] >= b'5';
        let mut i = d[..p].to_vec();
        if up && bump(&mut i) { i.insert(0, b'1') }
        i
    };
    let mut text = fixed_text("", int, f);
    // Group the integer part.
    let int_end = text.find('.').unwrap_or(text.len());
    let (ip, rest) = text.split_at(int_end);
    let mut grouped = String::new();
    for (i, c) in ip.chars().enumerate() {
        if i > 0 && (ip.len() - i) % 3 == 0 { grouped.push(',') }
        grouped.push(c);
    }
    text = format!("{grouped}{rest}");
    format!("{sign}{text}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strings_as_javascript_writes_them() {
        for (x, s) in [(0.0, "0"), (1.0, "1"), (-1.5, "-1.5"), (1e21, "1e+21"), (1e-7, "1e-7"), (1.5e-7, "1.5e-7"), (123456789012345680000.0, "123456789012345680000"),
            (0.000001, "0.000001"), (0.1 + 0.2, "0.30000000000000004"), (5e-324, "5e-324"), (1.7976931348623157e308, "1.7976931348623157e+308"), (-0.0, "0"), (100.0, "100")] {
            assert_eq!(js(x), s, "{x:e}");
        }
    }

    #[test]
    fn precision_rounds_half_up() {
        for (x, p, s) in [(2.5, 1, "3"), (0.125, 2, "0.13"), (1.005, 3, "1.00"), (123456.0, 2, "1.2e+5"), (0.000001234, 2, "0.0000012"), (1.234e-7, 2, "1.2e-7"),
            (9.9999, 3, "10.0"), (-2.5, 1, "-3"), (0.0, 4, "0.000"), (999.95, 4, "1000"), (1e21, 3, "1.00e+21"), (45.0, 1, "5e+1")] {
            assert_eq!(to_precision(x, p), s, "{x} {p}");
        }
        assert_eq!(to_exponential(1234.5, 3), "1.235e+3");
        assert_eq!(to_exponential(-0.00015, 0), "-1e-4");
        assert_eq!(to_exponential(0.0, 2), "0.00e+0");
    }

    #[test]
    fn fixed_and_locale() {
        for (x, f, s) in [(0.125, 2, "0.13"), (1.005, 2, "1.00"), (12.0, 2, "12.00"), (-0.001, 2, "-0.00"), (0.5, 0, "1"), (1.45, 1, "1.4"), (99.995, 2, "100.00"), (0.0, 2, "0.00"),
            (1e21, 2, "1e+21"), (123.456, 0, "123")] {
            assert_eq!(to_fixed(x, f), s, "{x} {f}");
        }
        for (x, f, s) in [(1.005, 2, "1.01"), (2.5, 0, "3"), (1234.5, 0, "1,235"), (-1234.5, 0, "-1,235"), (0.125, 2, "0.13"), (12345678.9, 0, "12,345,679"),
            (999.96, 1, "1,000.0"), (5.0, 3, "5.000"), (0.0004, 2, "0.00"), (0.005, 2, "0.01")] {
            assert_eq!(locale(x, f), s, "{x} {f}");
        }
    }
}
