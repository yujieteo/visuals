//! What the builder needs to write exactly the bytes the Python pipeline wrote: `json.dumps` with
//! `ensure_ascii=False` (compact, or with `indent=1`), Python's float repr, `str()` and `repr()` of a value in
//! a message, and the gzip+base64 packs.

use std::io::Write;

use base64::Engine;
use flate2::{Compress, Compression, Crc, FlushCompress};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

/// `json.dumps(value, ensure_ascii=False, separators=(",", ":"))`.
pub fn compact(value: &Value) -> String {
    let mut out = String::new();
    write(&mut out, value, None, 0);
    out
}

/// `json.dumps(value, ensure_ascii=False, indent=1)`.
pub fn indented(value: &Value) -> String {
    let mut out = String::new();
    write(&mut out, value, Some(1), 0);
    out
}

fn write(out: &mut String, value: &Value, indent: Option<usize>, depth: usize) {
    let newline = |out: &mut String, depth: usize| {
        if let Some(n) = indent {
            out.push('\n');
            out.extend(std::iter::repeat_n(' ', n * depth));
        }
    };
    let (comma, colon) = if indent.is_some() {
        (",", ": ")
    } else {
        (",", ":")
    };
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
                    out.push_str(comma);
                }
                newline(out, depth + 1);
                write(out, item, indent, depth + 1);
            }
            newline(out, depth);
            out.push(']');
        }
        Value::Object(map) if map.is_empty() => out.push_str("{}"),
        Value::Object(map) => {
            out.push('{');
            for (i, (key, item)) in map.iter().enumerate() {
                if i > 0 {
                    out.push_str(comma);
                }
                newline(out, depth + 1);
                string(out, key);
                out.push_str(colon);
                write(out, item, indent, depth + 1);
            }
            newline(out, depth);
            out.push('}');
        }
    }
}

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

fn number(n: &serde_json::Number) -> String {
    match n.as_f64() {
        Some(f) if n.is_f64() => float(f),
        _ => n.to_string(),
    }
}

/// Python's `repr(float)`: the shortest digits that read back to the same value, in positional form for
/// exponents from -4 to 15 and in scientific form, with a signed exponent of at least 2 digits, outside them.
pub fn float(f: f64) -> String {
    if f.is_nan() {
        return "NaN".into();
    }
    if f.is_infinite() {
        return if f > 0.0 { "Infinity" } else { "-Infinity" }.into();
    }
    let sci = format!("{:e}", f.abs());
    let (mantissa, exp) = sci.split_once('e').unwrap();
    let exp: i32 = exp.parse().unwrap();
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let sign = if f.is_sign_negative() { "-" } else { "" };
    if (-4..16).contains(&exp) {
        let point = exp + 1;
        let body = if point <= 0 {
            format!("0.{}{}", "0".repeat((-point) as usize), digits)
        } else if digits.len() as i32 <= point {
            format!(
                "{}{}.0",
                digits,
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
        format!(
            "{sign}{}{tail}e{}{:02}",
            &digits[..1],
            if exp < 0 { '-' } else { '+' },
            exp.abs()
        )
    }
}

/// Python's `str(value)` for a value read from JSON: a string is itself, anything else is its repr.
pub fn str_of(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(s)) => s.clone(),
        other => repr(other),
    }
}

/// Python's `repr(value)` for a value read from JSON (`None` when absent).
pub fn repr(value: Option<&Value>) -> String {
    match value {
        None | Some(Value::Null) => "None".into(),
        Some(Value::Bool(b)) => if *b { "True" } else { "False" }.into(),
        Some(Value::Number(n)) => number(n).replace("NaN", "nan").replace("Infinity", "inf"),
        Some(Value::String(s)) => repr_str(s),
        Some(Value::Array(items)) => format!(
            "[{}]",
            items
                .iter()
                .map(|v| repr(Some(v)))
                .collect::<Vec<_>>()
                .join(", ")
        ),
        Some(Value::Object(map)) => {
            format!(
                "{{{}}}",
                map.iter()
                    .map(|(k, v)| format!("{}: {}", repr_str(k), repr(Some(v))))
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        }
    }
}

fn repr_str(s: &str) -> String {
    let quote = if s.contains('\'') && !s.contains('"') {
        '"'
    } else {
        '\''
    };
    let mut out = String::from(quote);
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if c == quote => {
                out.push('\\');
                out.push(c);
            }
            c if (c as u32) < 0x20 || c as u32 == 0x7f => {
                out.push_str(&format!("\\x{:02x}", c as u32))
            }
            c => out.push(c),
        }
    }
    out.push(quote);
    out
}

/// Python's truth value of a JSON value: null, false, 0, "", [] and {} are false.
pub fn truthy(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64() != Some(0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(m)) => !m.is_empty(),
    }
}

/// `x.get(key) or default` for an array: the items, or none.
pub fn items<'a>(x: &'a Value, key: &str) -> &'a [Value] {
    x.get(key)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

/// `json.loads(gzip.decompress(base64.b64decode(raw["packs"][name]["gz"])))`.
pub fn unpack(raw: &Value, name: &str) -> Value {
    let gz = base64::engine::general_purpose::STANDARD
        .decode(raw["packs"][name]["gz"].as_str().expect("pack gz"))
        .expect("pack base64");
    let mut data = Vec::new();
    std::io::Read::read_to_end(&mut flate2::read::GzDecoder::new(&gz[..]), &mut data)
        .expect("pack gzip");
    serde_json::from_slice(&data).expect("pack JSON")
}

/// `{"bytes", "gz_bytes", "sha256", "gz"}` of a value: its compact JSON, gzip at level 9 with mtime 0 as
/// Python 3.13's `gzip.compress` writes it (zlib's deflate, OS byte 255), in base64.
pub fn pack(value: &Value) -> Value {
    let data = compact(value).into_bytes();
    let gz = gzip(&data);
    let mut map = Map::new();
    map.insert("bytes".into(), data.len().into());
    map.insert("gz_bytes".into(), gz.len().into());
    map.insert("sha256".into(), sha256_hex(&data).into());
    map.insert(
        "gz".into(),
        base64::engine::general_purpose::STANDARD.encode(&gz).into(),
    );
    Value::Object(map)
}

fn gzip(data: &[u8]) -> Vec<u8> {
    let mut deflate = Compress::new(Compression::new(9), false);
    let mut body = Vec::with_capacity(data.len() / 2 + 1024);
    loop {
        let read = deflate.total_in() as usize;
        let status = deflate
            .compress_vec(&data[read..], &mut body, FlushCompress::Finish)
            .expect("deflate");
        if status == flate2::Status::StreamEnd {
            break;
        }
        body.reserve(body.capacity().max(1 << 16));
    }
    let mut crc = Crc::new();
    crc.update(data);
    let mut out = vec![0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 2, 0xff];
    out.write_all(&body).unwrap();
    out.extend_from_slice(&crc.sum().to_le_bytes());
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out
}

pub fn sha256_hex(data: &[u8]) -> String {
    Sha256::digest(data)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Python's `str.strip()`: whitespace by `str.isspace`, which also counts the separators U+001C to U+001F.
pub fn strip(s: &str) -> &str {
    s.trim_matches(|c: char| c.is_whitespace() || ('\u{1c}'..='\u{1f}').contains(&c))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn floats_read_as_python_writes_them() {
        for (f, want) in [
            (1.0, "1.0"),
            (0.1, "0.1"),
            (1e-5, "1e-05"),
            (1e16, "1e+16"),
            (123456789012345.6, "123456789012345.6"),
            (0.0001, "0.0001"),
            (-2.5, "-2.5"),
            (1.5e-7, "1.5e-07"),
            (1e300, "1e+300"),
            (100000.0, "100000.0"),
            (-0.0, "-0.0"),
        ] {
            assert_eq!(float(f), want);
        }
    }

    #[test]
    fn json_has_python_separators_and_escapes() {
        let v: Value =
            serde_json::from_str(r#"{"a":[1,2.0,{}],"b":"x\u0001\n\"é","c":[]}"#).unwrap();
        assert_eq!(
            compact(&v),
            "{\"a\":[1,2.0,{}],\"b\":\"x\\u0001\\n\\\"é\",\"c\":[]}"
        );
        assert_eq!(
            indented(&v),
            "{\n \"a\": [\n  1,\n  2.0,\n  {}\n ],\n \"b\": \"x\\u0001\\n\\\"é\",\n \"c\": []\n}"
        );
        assert_eq!(
            repr(Some(&serde_json::json!(["s:a", null, 1, "it's"]))),
            "['s:a', None, 1, \"it's\"]"
        );
    }
}
