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

#[cfg(test)]
mod tests {
    use super::*;

    /// Each literal as json.dumps(json.loads(literal)) writes it in Python 3.13.
    #[test]
    fn numbers_read_as_python_writes_them() {
        for (literal, want) in [
            ("1.0", "1.0"),
            ("0.1", "0.1"),
            ("1e-5", "1e-05"),
            ("1e-05", "1e-05"),
            ("0.0001", "0.0001"),
            ("0.00012345", "0.00012345"),
            ("1e16", "1e+16"),
            ("1e+16", "1e+16"),
            ("1e15", "1000000000000000.0"),
            ("1.5e16", "1.5e+16"),
            ("9999999999999998.0", "9999999999999998.0"),
            ("123456789012345.6", "123456789012345.6"),
            ("1234567890123456.7", "1234567890123456.8"),
            ("-2.5", "-2.5"),
            ("1.5e-7", "1.5e-07"),
            ("1E-7", "1e-07"),
            ("1e300", "1e+300"),
            ("1.7976931348623157e308", "1.7976931348623157e+308"),
            ("5e-324", "5e-324"),
            ("100000.0", "100000.0"),
            ("1e5", "100000.0"),
            ("-0.0", "-0.0"),
            ("0.30000000000000004", "0.30000000000000004"),
            ("2.5e-05", "2.5e-05"),
            ("1e400", "Infinity"),
            ("-1e400", "-Infinity"),
            ("1.50", "1.5"),
            ("0.0", "0.0"),
            ("3.141592653589793", "3.141592653589793"),
            ("1e22", "1e+22"),
            ("123e-2", "1.23"),
            ("0", "0"),
            ("-0", "0"),
            ("42", "42"),
            ("-17", "-17"),
            ("12345678901234567890123", "12345678901234567890123"),
            ("-9223372036854775809", "-9223372036854775809"),
        ] {
            let value: Value = serde_json::from_str(literal).unwrap();
            assert_eq!(indented(&value), want, "literal {literal}");
        }
        assert_eq!(float(f64::NAN), "NaN");
    }

    #[test]
    fn json_has_python_layout_and_escapes() {
        let value: Value = serde_json::from_str(
            r#"{"a":[1,2.0,{},[]],"b":"x\u0001\n\"é\u007f \\/\t\b\f\r","c":{},"d":[[],{"e":null,"f":true,"g":false}]}"#,
        )
        .unwrap();
        assert_eq!(
            indented(&value),
            "{\n \"a\": [\n  1,\n  2.0,\n  {},\n  []\n ],\n \"b\": \"x\\u0001\\n\\\"é\u{7f}\u{2028}\\\\/\\t\\b\\f\\r\",\n \"c\": {},\n \"d\": [\n  [],\n  {\n   \"e\": null,\n   \"f\": true,\n   \"g\": false\n  }\n ]\n}"
        );
        assert_eq!(indented(&serde_json::json!({})), "{}");
        assert_eq!(indented(&serde_json::json!([])), "[]");
    }
}
