//! Python's `json.dumps(value, ensure_ascii=False, indent=1)`, byte for byte, for a value that serde_json read
//! with `arbitrary_precision`: each number keeps the literal of its file, and Python's json.loads makes a float
//! of a literal with a fraction or an exponent and an integer of every other literal.

use serde_json::{Number, Value};

/// `json.dumps(value, ensure_ascii=False, indent=1)`.
pub fn indented(value: &Value) -> String {
    let mut out = String::new();
    write(&mut out, value, 0);
    out
}

fn newline(out: &mut String, depth: usize) {
    out.push('\n');
    out.extend(std::iter::repeat_n(' ', depth));
}

fn write(out: &mut String, value: &Value, depth: usize) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&number(n)),
        Value::String(s) => string(out, s),
        Value::Array(items) if items.is_empty() => out.push_str("[]"),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                newline(out, depth + 1);
                write(out, item, depth + 1);
            }
            newline(out, depth);
            out.push(']');
        }
        Value::Object(map) if map.is_empty() => out.push_str("{}"),
        Value::Object(map) => {
            out.push('{');
            for (i, (key, item)) in map.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                newline(out, depth + 1);
                string(out, key);
                out.push_str(": ");
                write(out, item, depth + 1);
            }
            newline(out, depth);
            out.push('}');
        }
    }
}

/// A JSON string as Python writes it with `ensure_ascii=False`: only the quote, the backslash and the control
/// characters below U+0020 are escaped.
fn string(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// A number as Python writes what json.loads made of its literal: a float's repr, or an integer's digits
/// (`-0` is the integer 0).
fn number(n: &Number) -> String {
    let literal = n.to_string();
    if literal.contains(['.', 'e', 'E']) {
        float(
            literal
                .parse()
                .expect("a JSON number literal parses as f64"),
        )
    } else if literal == "-0" {
        "0".into()
    } else {
        literal
    }
}

/// Python's `repr(float)` as json.dumps writes it: the shortest digits that read back to the same value, in
/// positional form for decimal exponents from -4 to 15 and in scientific form, with a signed exponent of at
/// least 2 digits, outside them. A float that is not finite is NaN, Infinity or -Infinity.
pub fn float(f: f64) -> String {
    if f.is_nan() {
        return "NaN".into();
    }
    if f.is_infinite() {
        return if f > 0.0 { "Infinity" } else { "-Infinity" }.into();
    }
    let sci = format!("{:e}", f.abs());
    let (mantissa, exp) = sci.split_once('e').expect("LowerExp writes an exponent");
    let exp: i32 = exp.parse().expect("LowerExp writes an integer exponent");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let sign = if f.is_sign_negative() { "-" } else { "" };
    if (-4..16).contains(&exp) {
        let point = exp + 1;
        let body = if point <= 0 {
            format!("0.{}{digits}", "0".repeat((-point) as usize))
        } else if digits.len() as i32 <= point {
            format!(
                "{digits}{}.0",
                "0".repeat((point - digits.len() as i32) as usize)
            )
        } else {
            format!(
                "{}.{}",
                &digits[..point as usize],
                &digits[point as usize..]
            )
        };
        format!("{sign}{body}")
    } else {
        let tail = if digits.len() > 1 {
            format!(".{}", &digits[1..])
        } else {
            String::new()
        };
        let exp_sign = if exp < 0 { '-' } else { '+' };
        format!("{sign}{}{tail}e{exp_sign}{:02}", &digits[..1], exp.abs())
    }
}
