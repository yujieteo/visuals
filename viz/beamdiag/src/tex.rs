//! The small TeX subset of the hand calculations, drawn as HTML without a maths library: text,
//! fractions, superscripts and subscripts.

use look::esc;

#[derive(Clone, Debug, PartialEq)]
pub enum Node { Text(String), Sup(Vec<Node>), Sub(Vec<Node>), Roman(Vec<Node>), Frac(Vec<Node>, Vec<Node>) }

fn symbol(name: &str) -> Option<&'static str> {
    Some(match name {
        "langle" => "⟨", "rangle" => "⟩", "theta" => "θ", "sigma" => "σ", "sum" => "Σ", "int" => "∫", "iint" => "∬", "cdot" => "·", "times" => " × ",
        "Rightarrow" => " ⇒ ", "le" => " ≤ ", "ge" => " ≥ ", "approx" => " ≈ ", "pm" => " ± ", "infty" => "∞", "nu" => "ν", "Delta" => "Δ", "max" => "max",
        "min" => "min", "quad" => " ", "qquad" => "  ", "," | " " | ";" => " ", "{" => "{", "}" => "}", "|" => "‖", "\\" => " ",
        _ => return None,
    })
}
fn math_char(c: char) -> String { match c { '-' => "−".into(), '\'' => "′".into(), '=' => " = ".into(), c => c.to_string() } }

struct Parser { s: Vec<char>, i: usize }

impl Parser {
    fn at(&self) -> Option<char> { self.s.get(self.i).copied() }
    fn atom(&mut self) -> Vec<Node> {
        match self.at() {
            Some('{') => { self.i += 1; self.seq(Some('}')) }
            Some('\\') => self.command(),
            Some(c) => { self.i += 1; vec![Node::Text(math_char(c))] }
            None => vec![],
        }
    }
    fn command(&mut self) -> Vec<Node> {
        self.i += 1;
        let start = self.i;
        while self.at().is_some_and(|c| c.is_ascii_alphabetic()) { self.i += 1 }
        let word = self.i > start;
        if !word && self.at().is_some() { self.i += 1 }
        let name: String = self.s[start..self.i].iter().collect();
        // As in TeX, a control word swallows the spaces after it.
        if word { while self.at() == Some(' ') { self.i += 1 } }
        match name.as_str() {
            "frac" => { let n = self.atom(); let d = self.atom(); vec![Node::Frac(n, d)] }
            "mathrm" => vec![Node::Roman(self.atom())],
            "text" if self.at() == Some('{') => {
                self.i += 1;
                let (mut depth, mut s) = (1, String::new());
                while let Some(c) = self.at() {
                    self.i += 1;
                    if c == '{' { depth += 1 } else if c == '}' { depth -= 1; if depth == 0 { break } }
                    s.push(c);
                }
                vec![Node::Roman(vec![Node::Text(s)])]
            }
            "text" => self.atom(),
            "left" | "right" => match self.at() { Some('.') => { self.i += 1; vec![] } Some(c) => { self.i += 1; vec![Node::Text(math_char(c))] } None => vec![] },
            _ => vec![Node::Text(symbol(&name).map_or(name.clone(), str::to_string))],
        }
    }
    fn seq(&mut self, end: Option<char>) -> Vec<Node> {
        let mut out: Vec<Node> = vec![];
        while let Some(c) = self.at() {
            if Some(c) == end { self.i += 1; break }
            match c {
                '^' | '_' => { self.i += 1; let a = self.atom(); out.push(if c == '^' { Node::Sup(a) } else { Node::Sub(a) }) }
                '\\' => out.extend(self.command()),
                '{' => { self.i += 1; out.extend(self.seq(Some('}'))) }
                c => { out.push(Node::Text(math_char(c))); self.i += 1 }
            }
        }
        // Neighbouring strings merge, and runs of spaces close up.
        let mut merged: Vec<Node> = vec![];
        for n in out {
            match (merged.last_mut(), n) { (Some(Node::Text(a)), Node::Text(b)) => a.push_str(&b), (_, n) => merged.push(n) }
        }
        for n in &mut merged {
            if let Node::Text(t) = n { while t.contains("  ") { *t = t.replace("  ", " ") } }
        }
        merged
    }
}

pub fn nodes(src: &str) -> Vec<Node> { Parser { s: src.chars().collect(), i: 0 }.seq(None) }

/// Plain text of a TeX string, for accessible labels.
pub fn text(src: &str) -> String {
    fn flat(ns: &[Node]) -> String {
        ns.iter().map(|n| match n {
            Node::Text(t) => t.clone(), Node::Frac(a, b) => format!("({})/({})", flat(a), flat(b)),
            Node::Sup(c) => format!("^{}", flat(c)), Node::Sub(c) => format!("_{}", flat(c)), Node::Roman(c) => flat(c),
        }).collect()
    }
    flat(&nodes(src)).split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn html(src: &str) -> String {
    fn draw(ns: &[Node], out: &mut String) {
        for n in ns {
            match n {
                Node::Text(t) => out.push_str(&esc(t)),
                Node::Frac(a, b) => { out.push_str("<span class=\"frac\"><span>"); draw(a, out); out.push_str("</span><span>"); draw(b, out); out.push_str("</span></span>") }
                Node::Sup(c) => { out.push_str("<sup>"); draw(c, out); out.push_str("</sup>") }
                Node::Sub(c) => { out.push_str("<sub>"); draw(c, out); out.push_str("</sub>") }
                Node::Roman(c) => { out.push_str("<span>"); draw(c, out); out.push_str("</span>") }
            }
        }
    }
    let mut out = String::new();
    draw(&nodes(src), &mut out);
    out
}

/// Text with inline $maths$.
pub fn inline(s: &str) -> String {
    let (mut out, mut from, mut last) = (String::new(), 0, 0);
    while let Some(a) = s[from..].find('$').map(|k| k + from) {
        match s[a + 1..].find('$') {
            Some(k) if k > 0 => {
                out += &esc(&s[last..a]);
                out += &format!("<span class=\"math\">{}</span>", html(&s[a + 1..a + 1 + k]));
                (last, from) = (a + 2 + k, a + 2 + k);
            }
            Some(_) => from = a + 1,
            None => break,
        }
    }
    out + &esc(&s[last..])
}
