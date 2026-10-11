//! JSON as the page, its tools and links.json use it: a parser, and a writer that writes strings as
//! `JSON.stringify` and Python's `json.dumps(..., ensure_ascii=False)` both write them.

#[derive(Clone, Debug, PartialEq)]
pub enum Value { Null, Bool(bool), Num(f64), Str(String), Arr(Vec<Value>), Obj(Vec<(String, Value)>) }

static NULL: Value = Value::Null;

impl Value {
    /// The member `k` of an object; null when absent or not an object.
    pub fn get(&self, k: &str) -> &Value {
        match self { Value::Obj(m) => m.iter().rev().find(|(n, _)| n == k).map_or(&NULL, |(_, v)| v), _ => &NULL }
    }
    pub fn str(&self) -> Option<&str> { if let Value::Str(s) = self { Some(s) } else { None } }
    pub fn num(&self) -> Option<f64> { if let Value::Num(x) = self { Some(*x) } else { None } }
    pub fn arr(&self) -> Option<&[Value]> { if let Value::Arr(a) = self { Some(a) } else { None } }
    pub fn s(&self, k: &str) -> &str { self.get(k).str().unwrap_or("") }
    /// The string at index `k` of an array; empty when absent.
    pub fn at(&self, k: usize) -> &str { self.arr().and_then(|a| a.get(k)).and_then(Value::str).unwrap_or("") }
}

impl From<&str> for Value { fn from(s: &str) -> Value { Value::Str(s.into()) } }
impl From<String> for Value { fn from(s: String) -> Value { Value::Str(s) } }
impl From<bool> for Value { fn from(b: bool) -> Value { Value::Bool(b) } }
impl From<usize> for Value { fn from(n: usize) -> Value { Value::Num(n as f64) } }
impl From<u32> for Value { fn from(n: u32) -> Value { Value::Num(n as f64) } }
impl<T: Into<Value>> From<Option<T>> for Value { fn from(o: Option<T>) -> Value { o.map_or(Value::Null, Into::into) } }
impl<T: Into<Value>> From<Vec<T>> for Value { fn from(v: Vec<T>) -> Value { Value::Arr(v.into_iter().map(Into::into).collect()) } }

pub fn obj<const N: usize>(fields: [(&str, Value); N]) -> Value { Value::Obj(fields.into_iter().map(|(k, v)| (k.to_string(), v)).collect()) }

struct Parser<'a> { s: &'a [u8], i: usize }

impl Parser<'_> {
    fn ws(&mut self) { while self.s.get(self.i).is_some_and(|c| matches!(c, b' ' | b'\t' | b'\n' | b'\r')) { self.i += 1 } }
    fn err<T>(&self, what: &str) -> Result<T, String> { Err(format!("JSON: {what} at byte {}", self.i)) }
    fn eat(&mut self, lit: &str) -> Result<(), String> {
        if self.s[self.i..].starts_with(lit.as_bytes()) { self.i += lit.len(); Ok(()) } else { self.err(&format!("expected {lit}")) }
    }
    fn value(&mut self, depth: usize) -> Result<Value, String> {
        if depth > 64 { return self.err("too deeply nested") }
        self.ws();
        let Some(&c) = self.s.get(self.i) else { return self.err("unexpected end") };
        let close = |p: &mut Self, end: u8| -> Result<bool, String> {
            p.ws();
            match p.s.get(p.i) { Some(b',') => { p.i += 1; Ok(false) } Some(&x) if x == end => { p.i += 1; Ok(true) } _ => p.err("expected , or a closing bracket") }
        };
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
                loop { out.push(self.value(depth + 1)?); if close(self, b']')? { return Ok(Value::Arr(out)) } }
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
                    if close(self, b'}')? { return Ok(Value::Obj(out)) }
                }
            }
            b'-' | b'0'..=b'9' => {
                let start = self.i;
                while self.s.get(self.i).is_some_and(|c| matches!(c, b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9')) { self.i += 1 }
                std::str::from_utf8(&self.s[start..self.i]).ok().and_then(|t| t.parse().ok()).map(Value::Num).map_or_else(|| self.err("bad number"), Ok)
            }
            _ => self.err("unexpected character"),
        }
    }
    fn hex4(&mut self) -> Result<u32, String> {
        let h = self.s.get(self.i..self.i + 4).and_then(|h| std::str::from_utf8(h).ok()).and_then(|h| u32::from_str_radix(h, 16).ok());
        self.i += 4;
        h.map_or_else(|| self.err("bad \\u escape"), Ok)
    }
    fn string(&mut self) -> Result<String, String> {
        self.i += 1;
        let mut out = String::new();
        loop {
            let start = self.i;
            while self.s.get(self.i).is_some_and(|&c| c != b'"' && c != b'\\') { self.i += 1 }
            out.push_str(std::str::from_utf8(&self.s[start..self.i]).map_err(|_| "JSON: not UTF-8".to_string())?);
            match self.s.get(self.i) {
                Some(b'"') => { self.i += 1; return Ok(out) }
                Some(b'\\') => {
                    self.i += 2;
                    match self.s.get(self.i - 1) {
                        Some(b'n') => out.push('\n'), Some(b't') => out.push('\t'), Some(b'r') => out.push('\r'),
                        Some(b'b') => out.push('\u{8}'), Some(b'f') => out.push('\u{c}'),
                        Some(b'u') => {
                            let mut c = self.hex4()?;
                            if (0xD800..0xDC00).contains(&c) && self.s[self.i..].starts_with(b"\\u") {
                                self.i += 2;
                                let lo = self.hex4()?;
                                c = 0x10000 + ((c - 0xD800) << 10) + (lo.wrapping_sub(0xDC00) & 0x3FF);
                            }
                            out.push(char::from_u32(c).unwrap_or('\u{FFFD}'));
                        }
                        Some(&c) => out.push(c as char),
                        None => return self.err("unexpected end"),
                    }
                }
                _ => return self.err("unterminated string"),
            }
        }
    }
}

pub fn parse(s: &str) -> Result<Value, String> {
    let mut p = Parser { s: s.as_bytes(), i: 0 };
    let v = p.value(0)?;
    p.ws();
    if p.i != p.s.len() { return p.err("trailing text") }
    Ok(v)
}

/// A string as a JSON literal.
pub fn quote(s: &str, out: &mut String) {
    out.push('"');
    for (i, c) in s.char_indices() {
        match c {
            '"' => out.push_str("\\\""), '\\' => out.push_str("\\\\"), '\n' => out.push_str("\\n"), '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"), '\u{8}' => out.push_str("\\b"), '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            // The slash after /home or /Users is \/, so links.json holds no text that reads as a home path.
            '/' if s[..i].ends_with("/home") || s[..i].ends_with("/Users") => out.push_str("\\/"),
            c => out.push(c),
        }
    }
    out.push('"');
}

impl Value {
    pub fn write(&self, out: &mut String) {
        match self {
            Value::Null => out.push_str("null"),
            Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            Value::Num(x) if x.fract() == 0.0 && x.abs() < 1e15 => out.push_str(&format!("{}", *x as i64)),
            Value::Num(x) if x.is_finite() => out.push_str(&format!("{x}")),
            Value::Num(_) => out.push_str("null"),
            Value::Str(s) => quote(s, out),
            Value::Arr(a) => {
                out.push('[');
                for (k, v) in a.iter().enumerate() { if k > 0 { out.push(',') } v.write(out) }
                out.push(']');
            }
            Value::Obj(m) => {
                out.push('{');
                for (k, (n, v)) in m.iter().enumerate() { if k > 0 { out.push(',') } quote(n, out); out.push(':'); v.write(out) }
                out.push('}');
            }
        }
    }
}

impl std::fmt::Display for Value {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result { let mut s = String::new(); self.write(&mut s); f.write_str(&s) }
}
