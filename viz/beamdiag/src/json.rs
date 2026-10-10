//! JSON as the page and its tools exchange it: a parser, and a writer that writes what
//! `JSON.stringify` writes, numbers included.

use crate::engine::{InLoad, InSupport, Input, Shape};
use crate::num::js;

#[derive(Clone, Debug, PartialEq)]
pub enum Value { Null, Bool(bool), Num(f64), Str(String), Arr(Vec<Value>), Obj(Vec<(String, Value)>) }

static NULL: Value = Value::Null;

impl Value {
    /// The member `k` of an object; null when absent or not an object.
    pub fn get(&self, k: &str) -> &Value {
        match self { Value::Obj(m) => m.iter().rev().find(|(n, _)| n == k).map_or(&NULL, |(_, v)| v), _ => &NULL }
    }
    pub fn num(&self) -> Option<f64> { if let Value::Num(x) = self { Some(*x) } else { None } }
    pub fn str(&self) -> Option<&str> { if let Value::Str(s) = self { Some(s) } else { None } }
    pub fn arr(&self) -> Option<&[Value]> { if let Value::Arr(a) = self { Some(a) } else { None } }
    pub fn is_null(&self) -> bool { matches!(self, Value::Null) }
    /// A number field: NaN when it is absent or not a number, as validation then reports it.
    pub fn f(&self, k: &str) -> f64 { self.get(k).num().unwrap_or(f64::NAN) }
    /// A field `??` its default: None when absent or null, NaN when not a number.
    pub fn opt(&self, k: &str) -> Option<f64> { let v = self.get(k); (!v.is_null()).then(|| v.num().unwrap_or(f64::NAN)) }
    pub fn s(&self, k: &str) -> &str { self.get(k).str().unwrap_or("") }
}

pub fn obj<const N: usize>(fields: [(&str, Value); N]) -> Value { Value::Obj(fields.into_iter().map(|(k, v)| (k.to_string(), v)).collect()) }
impl From<f64> for Value { fn from(x: f64) -> Value { Value::Num(x) } }
impl From<&str> for Value { fn from(s: &str) -> Value { Value::Str(s.into()) } }
impl From<String> for Value { fn from(s: String) -> Value { Value::Str(s) } }
impl From<bool> for Value { fn from(b: bool) -> Value { Value::Bool(b) } }
impl<T: Into<Value>> From<Option<T>> for Value { fn from(o: Option<T>) -> Value { o.map_or(Value::Null, Into::into) } }
impl<T: Into<Value>> From<Vec<T>> for Value { fn from(v: Vec<T>) -> Value { Value::Arr(v.into_iter().map(Into::into).collect()) } }

struct Parser<'a> { s: &'a [u8], i: usize }

impl Parser<'_> {
    fn ws(&mut self) { while self.i < self.s.len() && matches!(self.s[self.i], b' ' | b'\t' | b'\n' | b'\r') { self.i += 1 } }
    fn err<T>(&self, what: &str) -> Result<T, String> { Err(format!("JSON: {what} at byte {}", self.i)) }
    fn eat(&mut self, lit: &str) -> Result<(), String> {
        if self.s[self.i..].starts_with(lit.as_bytes()) { self.i += lit.len(); Ok(()) } else { self.err(&format!("expected {lit}")) }
    }
    fn value(&mut self, depth: usize) -> Result<Value, String> {
        if depth > 200 { return self.err("too deeply nested") }
        self.ws();
        let Some(&c) = self.s.get(self.i) else { return self.err("unexpected end") };
        match c {
            b'n' => { self.eat("null")?; Ok(Value::Null) }
            b't' => { self.eat("true")?; Ok(Value::Bool(true)) }
            b'f' => { self.eat("false")?; Ok(Value::Bool(false)) }
            b'"' => Ok(Value::Str(self.string()?)),
            b'[' => {
                self.i += 1;
                let mut out = vec![];
                self.ws();
                if self.s.get(self.i) == Some(&b']') { self.i += 1; return Ok(Value::Arr(out)) }
                loop {
                    out.push(self.value(depth + 1)?);
                    self.ws();
                    match self.s.get(self.i) { Some(b',') => self.i += 1, Some(b']') => { self.i += 1; return Ok(Value::Arr(out)) } _ => return self.err("expected , or ]") }
                }
            }
            b'{' => {
                self.i += 1;
                let mut out = vec![];
                self.ws();
                if self.s.get(self.i) == Some(&b'}') { self.i += 1; return Ok(Value::Obj(out)) }
                loop {
                    self.ws();
                    if self.s.get(self.i) != Some(&b'"') { return self.err("expected a key") }
                    let k = self.string()?;
                    self.ws();
                    self.eat(":")?;
                    out.push((k, self.value(depth + 1)?));
                    self.ws();
                    match self.s.get(self.i) { Some(b',') => self.i += 1, Some(b'}') => { self.i += 1; return Ok(Value::Obj(out)) } _ => return self.err("expected , or }") }
                }
            }
            b'-' | b'0'..=b'9' => self.number(),
            _ => self.err("unexpected character"),
        }
    }
    fn number(&mut self) -> Result<Value, String> {
        let start = self.i;
        let digits = |p: &mut Self| { let a = p.i; while p.i < p.s.len() && p.s[p.i].is_ascii_digit() { p.i += 1 } p.i - a };
        if self.s[self.i] == b'-' { self.i += 1 }
        let int = digits(self);
        if int == 0 || (int > 1 && self.s[self.i - int] == b'0') { return self.err("bad number") }
        if self.s.get(self.i) == Some(&b'.') { self.i += 1; if digits(self) == 0 { return self.err("bad number") } }
        if matches!(self.s.get(self.i), Some(b'e' | b'E')) {
            self.i += 1;
            if matches!(self.s.get(self.i), Some(b'+' | b'-')) { self.i += 1 }
            if digits(self) == 0 { return self.err("bad number") }
        }
        let t = std::str::from_utf8(&self.s[start..self.i]).unwrap();
        t.parse().map(Value::Num).or_else(|_| self.err("bad number"))
    }
    fn hex4(&mut self) -> Result<u32, String> {
        let t = self.s.get(self.i..self.i + 4).and_then(|h| std::str::from_utf8(h).ok()).and_then(|h| u32::from_str_radix(h, 16).ok());
        match t { Some(v) => { self.i += 4; Ok(v) } None => self.err("bad \\u escape") }
    }
    fn string(&mut self) -> Result<String, String> {
        self.i += 1;
        let mut out = String::new();
        loop {
            let start = self.i;
            while self.i < self.s.len() && self.s[self.i] != b'"' && self.s[self.i] != b'\\' && self.s[self.i] >= 0x20 { self.i += 1 }
            out += std::str::from_utf8(&self.s[start..self.i]).map_err(|_| "JSON: invalid UTF-8".to_string())?;
            match self.s.get(self.i) {
                Some(b'"') => { self.i += 1; return Ok(out) }
                Some(b'\\') => {
                    self.i += 1;
                    let Some(&e) = self.s.get(self.i) else { return self.err("unexpected end") };
                    self.i += 1;
                    match e {
                        b'"' => out.push('"'), b'\\' => out.push('\\'), b'/' => out.push('/'), b'b' => out.push('\u{8}'), b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'), b'r' => out.push('\r'), b't' => out.push('\t'),
                        b'u' => {
                            let mut c = self.hex4()?;
                            if (0xd800..0xdc00).contains(&c) && self.s[self.i..].starts_with(b"\\u") {
                                let at = self.i;
                                self.i += 2;
                                let lo = self.hex4()?;
                                if (0xdc00..0xe000).contains(&lo) { c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00) } else { self.i = at }
                            }
                            // A lone surrogate cannot be held in a Rust string; it reads as U+FFFD.
                            out.push(char::from_u32(c).unwrap_or('\u{fffd}'));
                        }
                        _ => return self.err("bad escape"),
                    }
                }
                _ => return self.err("unterminated string"),
            }
        }
    }
}

pub fn parse(text: &str) -> Result<Value, String> {
    let mut p = Parser { s: text.as_bytes(), i: 0 };
    let v = p.value(0)?;
    p.ws();
    if p.i != p.s.len() { return p.err("trailing characters") }
    Ok(v)
}

pub fn quote(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""), '\\' => out.push_str("\\\\"), '\n' => out.push_str("\\n"), '\r' => out.push_str("\\r"), '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"), '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn write(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Num(x) => out.push_str(&if x.is_finite() { js(*x) } else { "null".into() }),
        Value::Str(s) => quote(s, out),
        Value::Arr(a) => {
            out.push('[');
            for (i, x) in a.iter().enumerate() { if i > 0 { out.push(',') } write(x, out) }
            out.push(']');
        }
        Value::Obj(m) => {
            out.push('{');
            for (i, (k, x)) in m.iter().enumerate() { if i > 0 { out.push(',') } quote(k, out); out.push(':'); write(x, out) }
            out.push('}');
        }
    }
}

/// `JSON.stringify(v)`.
pub fn stringify(v: &Value) -> String { let mut out = String::new(); write(v, &mut out); out }

/// A beam model as the page, its tools and its tests write it: SI, with `material` {E, nu} and
/// `section` {A, I, Iy, J, c}.
pub fn input(v: &Value) -> Input {
    let (m, s) = (v.get("material"), v.get("section"));
    let list = |k: &str| v.get(k).arr();
    Input {
        length: v.f("length"), e: m.f("E"), nu: m.f("nu"), a: s.f("A"), i: s.f("I"), iy: s.opt("Iy"), j: s.opt("J"), c: s.opt("c"), divisions: v.opt("divisions"),
        supports: list("supports").map(|a| a.iter().map(|x| InSupport { kind: x.s("kind").into(), x: x.f("x") }).collect()),
        loads: list("loads").map(|a| a.iter().map(|l| InLoad { kind: l.s("kind").into(), x: l.f("x"), f: l.f("F"), c: l.f("C"), x1: l.f("x1"), x2: l.f("x2"), q1: l.f("q1"), q2: l.f("q2") }).collect()),
    }
}

/// A section shape and its dimensions (m), as presets and the WebMCP tools give them.
pub fn shape(v: &Value) -> Shape {
    Shape { shape: v.s("shape").into(), b: v.opt("b"), h: v.opt("h"), d: v.opt("d"), t: v.opt("t"), a: v.opt("A"), i: v.opt("I"), iy: v.opt("Iy"), j: v.opt("J"), c: v.opt("c") }
}

/// The model back as JSON, as the page saves and shares it.
pub fn model_json(i: &Input) -> Value {
    let n = |x: Option<f64>| Value::from(x);
    obj([
        ("length", i.length.into()), ("divisions", n(i.divisions)), ("material", obj([("E", i.e.into()), ("nu", i.nu.into())])),
        ("section", obj([("A", i.a.into()), ("I", i.i.into()), ("Iy", n(i.iy)), ("J", n(i.j)), ("c", n(i.c))])),
        ("supports", Value::Arr(i.supports.iter().flatten().map(|s| obj([("kind", s.kind.as_str().into()), ("x", s.x.into())])).collect())),
        ("loads", Value::Arr(i.loads.iter().flatten().map(|l| match l.kind.as_str() {
            "point" => obj([("kind", "point".into()), ("x", l.x.into()), ("F", l.f.into())]),
            "moment" => obj([("kind", "moment".into()), ("x", l.x.into()), ("C", l.c.into())]),
            k => obj([("kind", k.into()), ("x1", l.x1.into()), ("x2", l.x2.into()), ("q1", l.q1.into()), ("q2", l.q2.into())]),
        }).collect())),
    ])
}
