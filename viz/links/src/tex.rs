//! TeX in titles and notes, as MathML Core where the old page typeset it with MathJax: `$...$` and `\(...\)`
//! inline, `$$...$$` and `\[...\]` displayed, and `\$` a dollar sign. A delimiter without its
//! end stays text, and an end inside braces does not count, as in MathJax's search for maths.

use crate::esc;
use std::fmt::Write;

const GREEK: &str = "alpha α beta β gamma γ delta δ epsilon ϵ varepsilon ε zeta ζ eta η theta θ vartheta ϑ iota ι kappa κ varkappa ϰ \
lambda λ mu μ nu ν xi ξ omicron ο pi π varpi ϖ rho ρ varrho ϱ sigma σ varsigma ς tau τ upsilon υ phi ϕ varphi φ chi χ psi ψ omega ω digamma ϝ";
const CAPS: &str = "Gamma Γ Delta Δ Theta Θ Lambda Λ Xi Ξ Pi Π Sigma Σ Upsilon Υ Phi Φ Psi Ψ Omega Ω";
/// Letter-like symbols, drawn as identifiers.
const LETTERS: &str = "ell ℓ hbar ℏ hslash ℏ aleph ℵ beth ℶ gimel ℷ wp ℘ Re ℜ Im ℑ imath ı jmath ȷ infty ∞ partial ∂ nabla ∇ \
emptyset ∅ varnothing ∅ Bbbk 𝕜 eth ð mho ℧ complement ∁ flat ♭ sharp ♯ natural ♮ clubsuit ♣ diamondsuit ♢ heartsuit ♡ spadesuit ♠";
const OPS: &str = "cdot ⋅ cdotp ⋅ times × div ÷ pm ± mp ∓ ast ∗ star ⋆ circ ∘ bullet ∙ oplus ⊕ ominus ⊖ otimes ⊗ oslash ⊘ odot ⊙ \
boxplus ⊞ boxminus ⊟ boxtimes ⊠ boxdot ⊡ wedge ∧ land ∧ vee ∨ lor ∨ cap ∩ cup ∪ sqcap ⊓ sqcup ⊔ uplus ⊎ setminus ∖ smallsetminus ∖ \
backslash \\ wr ≀ amalg ⨿ dagger † ddagger ‡ diamond ⋄ triangle △ triangleleft ◁ triangleright ▷ lhd ⊲ rhd ⊳ unlhd ⊴ unrhd ⊵ \
rtimes ⋊ ltimes ⋉ bowtie ⋈ le ≤ leq ≤ ge ≥ geq ≥ leqslant ⩽ geqslant ⩾ lt < gt > ne ≠ neq ≠ ll ≪ gg ≫ lesssim ≲ gtrsim ≳ \
prec ≺ succ ≻ preceq ⪯ succeq ⪰ precsim ≾ succsim ≿ sim ∼ simeq ≃ cong ≅ approx ≈ equiv ≡ asymp ≍ doteq ≐ propto ∝ \
in ∈ notin ∉ ni ∋ owns ∋ subset ⊂ supset ⊃ subseteq ⊆ supseteq ⊇ subsetneq ⊊ supsetneq ⊋ sqsubset ⊏ sqsubseteq ⊑ sqsupseteq ⊒ \
mid ∣ nmid ∤ parallel ∥ nparallel ∦ perp ⊥ vdash ⊢ dashv ⊣ models ⊨ smile ⌣ frown ⌢ top ⊤ bot ⊥ neg ¬ lnot ¬ \
forall ∀ exists ∃ nexists ∄ angle ∠ square □ Box □ blacksquare ■ prime ′ colon : vert | Vert ‖ lvert | rvert | lVert ‖ rVert ‖ \
langle ⟨ rangle ⟩ lfloor ⌊ rfloor ⌋ lceil ⌈ rceil ⌉ lbrace { rbrace } lbrack [ rbrack ] \
to → rightarrow → leftarrow ← gets ← leftrightarrow ↔ Rightarrow ⇒ Leftarrow ⇐ Leftrightarrow ⇔ uparrow ↑ downarrow ↓ \
updownarrow ↕ Uparrow ⇑ Downarrow ⇓ nearrow ↗ searrow ↘ swarrow ↙ nwarrow ↖ mapsto ↦ longmapsto ⟼ hookrightarrow ↪ \
hookleftarrow ↩ twoheadrightarrow ↠ twoheadleftarrow ↞ rightarrowtail ↣ leftarrowtail ↢ longrightarrow ⟶ longleftarrow ⟵ \
longleftrightarrow ⟷ Longrightarrow ⟹ Longleftarrow ⟸ Longleftrightarrow ⟺ iff ⟺ implies ⟹ impliedby ⟸ \
rightrightarrows ⇉ leftleftarrows ⇇ rightleftarrows ⇄ leftrightarrows ⇆ curvearrowright ↷ curvearrowleft ↶ \
rightsquigarrow ⇝ leadsto ⇝ circlearrowright ↻ circlearrowleft ↺ restriction ↾ upharpoonright ↾ \
rightharpoonup ⇀ leftharpoondown ↽ rightleftharpoons ⇌ dots … ldots … cdots ⋯ vdots ⋮ ddots ⋱ dotsc … dotsb ⋯ dotsm ⋯ \
sum ∑ prod ∏ coprod ∐ int ∫ iint ∬ iiint ∭ oint ∮ bigcup ⋃ bigcap ⋂ bigsqcup ⨆ bigoplus ⨁ bigotimes ⨂ bigodot ⨀ \
biguplus ⨄ bigwedge ⋀ bigvee ⋁ S § P ¶ dag † ddag ‡ checkmark ✓ lozenge ◊";
const FUNS: &str = "arccos arcsin arctan arg cos cosh cot coth csc deg det dim exp gcd hom inf ker lg lim liminf limsup ln log max min \
Pr sec sin sinh sup tan tanh lcm";
/// Operators whose limits go under and over them in display maths.
const BIG: &str = "∑ ∏ ∐ ⋃ ⋂ ⨆ ⨁ ⨂ ⨀ ⨄ ⋀ ⋁ lim liminf limsup max min sup inf det gcd Pr";
const ACCENTS: &str = "hat ^ widehat ^ tilde ~ widetilde ~ bar ¯ overline ‾ check ˇ widecheck ˇ dot ˙ ddot ¨ dddot ⃛ vec → acute ´ grave ` \
breve ˘ mathring ˚ overrightarrow → overleftarrow ← overleftrightarrow ↔";

fn look(table: &'static str, k: &str) -> Option<&'static str> { look_in(table, k) }
fn look_in<'a>(table: &'a str, k: &str) -> Option<&'a str> {
    let mut it = table.split(' ');
    while let (Some(a), Some(b)) = (it.next(), it.next()) { if a == k { return Some(b) } }
    None
}

#[derive(Clone, Debug, PartialEq)]
enum M {
    /// An identifier: one letter is italic.
    I(String),
    /// An upright identifier or a function name.
    Up(String, bool),
    N(String),
    /// An operator and its attributes.
    O(String, &'static str),
    T(String),
    Sp(f32),
    R(Vec<M>),
    Frac(Box<M>, Box<M>, bool),
    Root(Box<M>, Option<Box<M>>),
    S(Box<M>, Option<Box<M>>, Option<Box<M>>),
    Over(Box<M>, Box<M>, bool),
    Under(Box<M>, Box<M>),
    Table(Vec<Vec<M>>, &'static str),
    Phantom(Box<M>),
    Bad(String),
}

const FIXED: &str = " stretchy=\"false\"";
const FENCES: &str = "()[]|‖{}⟨⟩⌊⌋⌈⌉/";

fn op(s: &str) -> M { M::O(s.into(), if FENCES.contains(s) && s.chars().count() == 1 { FIXED } else { "" }) }

struct P { c: Vec<char>, i: usize, depth: usize }

#[derive(Clone, Copy, PartialEq)]
enum Until { End, Brace, Right, Cell }

impl P {
    fn at(&self, s: &str) -> bool { s.chars().enumerate().all(|(k, ch)| self.c.get(self.i + k) == Some(&ch)) && !(s.ends_with(|c: char| c.is_ascii_alphabetic()) && self.c.get(self.i + s.chars().count()).is_some_and(char::is_ascii_alphabetic)) }
    fn ws(&mut self) { while self.c.get(self.i).is_some_and(|c| c.is_whitespace()) { self.i += 1 } }
    fn name(&mut self) -> String {
        let s = self.i;
        while self.c.get(self.i).is_some_and(char::is_ascii_alphabetic) { self.i += 1 }
        self.c[s..self.i].iter().collect()
    }

    fn row(&mut self, until: Until) -> Vec<M> {
        let mut v: Vec<M> = vec![];
        loop {
            self.ws();
            let Some(&ch) = self.c.get(self.i) else { break };
            match until {
                Until::Brace if ch == '}' => break,
                Until::Right if self.at("\\right") => break,
                Until::Cell if ch == '&' || self.at("\\\\") || self.at("\\end") => break,
                _ => {}
            }
            if ch == '^' || ch == '_' || ch == '\'' {
                self.i += 1;
                let arg = if ch == '\'' {
                    let mut primes = "′".to_string();
                    while self.c.get(self.i) == Some(&'\'') { primes.push('′'); self.i += 1 }
                    M::O(primes, "")
                } else { self.arg().unwrap_or(M::R(vec![])) };
                let (b, sb, sp) = match v.pop() { Some(M::S(b, sb, sp)) => (b, sb, sp), m => (Box::new(m.unwrap_or(M::R(vec![]))), None, None) };
                let arg = Some(Box::new(arg));
                v.push(if ch == '_' { M::S(b, arg, sp) } else { M::S(b, sb, arg) });
            } else if ch == '}' && until != Until::Brace { self.i += 1 } else if let Some(m) = self.atom() { v.push(m) } else { break }
        }
        v
    }

    fn group(&mut self) -> M {
        self.i += 1;
        let r = self.row(Until::Brace);
        if self.c.get(self.i) == Some(&'}') { self.i += 1 }
        M::R(r)
    }

    /// A command's argument: a group or one token, so `\frac12` is a half.
    fn arg(&mut self) -> Option<M> {
        self.ws();
        match self.c.get(self.i) {
            Some('{') => Some(self.group()),
            Some(c) if c.is_ascii_digit() => { self.i += 1; Some(M::N(c.to_string())) }
            _ => self.atom(),
        }
    }

    /// A group's text as written, such as the argument of `\text`.
    fn raw(&mut self) -> String {
        self.ws();
        if self.c.get(self.i) != Some(&'{') { return self.c.get(self.i).map(|c| { self.i += 1; c.to_string() }).unwrap_or_default() }
        let (s, mut depth) = (self.i + 1, 0);
        while let Some(&c) = self.c.get(self.i) {
            match c { '{' => depth += 1, '}' => { depth -= 1; if depth == 0 { break } } '\\' => self.i += 1, _ => {} }
            self.i += 1;
        }
        let t: String = self.c[s..self.i.min(self.c.len())].iter().collect();
        self.i += 1;
        t
    }

    fn optional(&mut self) -> Option<M> {
        self.ws();
        if self.c.get(self.i) != Some(&'[') { return None }
        self.i += 1;
        let mut v = vec![];
        while self.c.get(self.i).is_some_and(|&c| c != ']') { if let Some(m) = self.atom() { v.push(m) } else { break } }
        self.i += 1;
        Some(M::R(v))
    }

    /// The delimiter after `\left`, `\right` or `\big`: a character or a command; `.` is none.
    fn delim(&mut self) -> String {
        self.ws();
        let Some(&c) = self.c.get(self.i) else { return String::new() };
        self.i += 1;
        if c == '.' { return String::new() }
        if c != '\\' { return c.to_string() }
        let n = self.name();
        if n.is_empty() { return self.c.get(self.i).map(|&c| { self.i += 1; if c == '|' { "‖".into() } else { c.to_string() } }).unwrap_or_default() }
        look(OPS, &n).unwrap_or("").into()
    }

    fn atom(&mut self) -> Option<M> {
        self.ws();
        let ch = *self.c.get(self.i)?;
        self.depth += 1;
        if self.depth > 40 { self.i = self.c.len(); return None }
        self.i += 1;
        let m = match ch {
            '{' => { self.i -= 1; self.group() }
            '0'..='9' => {
                let s = self.i - 1;
                while self.c.get(self.i).is_some_and(|c| c.is_ascii_digit() || (*c == '.' && self.c.get(self.i + 1).is_some_and(char::is_ascii_digit))) { self.i += 1 }
                M::N(self.c[s..self.i].iter().collect())
            }
            '\\' => self.command(),
            '~' => M::Sp(0.333),
            '&' => M::R(vec![]),
            '-' => op("−"),
            '*' => op("∗"),
            c if c.is_alphabetic() => if "ΓΔΘΛΞΠΣΥΦΨΩ".contains(c) { M::Up(c.into(), false) } else { M::I(c.into()) },
            c => op(&c.to_string()),
        };
        self.depth -= 1;
        Some(m)
    }

    fn command(&mut self) -> M {
        let name = self.name();
        if name.starts_with("operatorname") && self.c.get(self.i) == Some(&'*') { self.i += 1 }
        let a = |p: &mut P| Box::new(p.arg().unwrap_or(M::R(vec![])));
        match name.as_str() {
            "" => {
                let Some(&c) = self.c.get(self.i) else { return M::T("\\".into()) };
                self.i += 1;
                match c {
                    ',' => M::Sp(0.167), ':' | '>' => M::Sp(0.222), ';' => M::Sp(0.278), '!' => M::Sp(-0.167), ' ' => M::Sp(0.25),
                    '|' => op("‖"), '\\' => M::R(vec![]),
                    '#' | '%' | '&' | '_' | '$' => M::T(c.to_string()),
                    c => op(&c.to_string()),
                }
            }
            "frac" | "tfrac" | "dfrac" | "cfrac" => M::Frac(a(self), a(self), false),
            "binom" | "tbinom" | "dbinom" => M::R(vec![op("("), M::Frac(a(self), a(self), true), op(")")]),
            "sqrt" => { let n = self.optional(); M::Root(a(self), n.map(Box::new)) }
            "mathbb" | "mathbbm" | "Bbb" | "mathbf" | "mathcal" | "mathscr" | "mathfrak" | "mathsf" | "mathit" | "mathtt" | "boldsymbol" | "bm" => {
                let m = *a(self);
                alphabet(&name, m)
            }
            "mathrm" | "mathup" | "rm" | "operatorname" | "mathop" | "operatornamewithlimits" => {
                let m = *a(self);
                upright(m, name.starts_with("operatorname"))
            }
            "text" | "textrm" | "textup" | "textnormal" | "textit" | "textbf" | "textsf" | "texttt" | "emph" | "mbox" | "hbox" => {
                let t = self.raw();
                M::T(t.replace("\\ ", " ").replace("\\$", "$").replace("\\&", "&").replace("\\%", "%").replace('~', "\u{a0}"))
            }
            "left" => {
                let l = self.delim();
                let mut v = vec![M::O(l, "")];
                v.extend(self.row(Until::Right));
                if self.at("\\right") { self.i += 6; v.push(M::O(self.delim(), "")) }
                M::R(v.into_iter().filter(|m| *m != M::O(String::new(), "")).collect())
            }
            "right" | "middle" => { let d = self.delim(); M::O(d, "") }
            "big" | "bigl" | "bigr" | "bigm" | "Big" | "Bigl" | "Bigr" | "Bigm" | "bigg" | "biggl" | "biggr" | "Bigg" | "Biggl" | "Biggr" => {
                let size = match name.trim_end_matches(['l', 'r', 'm']) { "big" => " minsize=\"1.2em\" maxsize=\"1.2em\"", "Big" => " minsize=\"1.623em\" maxsize=\"1.623em\"", "bigg" => " minsize=\"2.047em\" maxsize=\"2.047em\"", _ => " minsize=\"2.47em\" maxsize=\"2.47em\"" };
                M::O(self.delim(), size)
            }
            "quad" => M::Sp(1.0),
            "qquad" => M::Sp(2.0),
            "enspace" => M::Sp(0.5),
            "thinspace" => M::Sp(0.167),
            "medspace" => M::Sp(0.222),
            "thickspace" => M::Sp(0.278),
            "negthinspace" => M::Sp(-0.167),
            "hspace" => { self.raw(); M::Sp(0.5) }
            "underline" => M::Under(a(self), Box::new(M::O("_".into(), ""))),
            "overbrace" => M::Over(a(self), Box::new(M::O("⏞".into(), "")), false),
            "underbrace" => M::Under(a(self), Box::new(M::O("⏟".into(), ""))),
            "xrightarrow" | "xleftarrow" => {
                let below = self.optional();
                let above = a(self);
                let arrow = Box::new(M::O((if name == "xrightarrow" { "→" } else { "←" }).into(), ""));
                match below { Some(b) => M::Under(Box::new(M::Over(arrow, above, false)), Box::new(b)), None => M::Over(arrow, above, false) }
            }
            "overset" | "stackrel" => { let top = a(self); M::Over(a(self), top, false) }
            "underset" => { let bottom = a(self); M::Under(a(self), bottom) }
            "varprojlim" => M::Under(Box::new(M::Up("lim".into(), true)), Box::new(M::O("←".into(), ""))),
            "varinjlim" => M::Under(Box::new(M::Up("lim".into(), true)), Box::new(M::O("→".into(), ""))),
            "pmod" => M::R(vec![M::Sp(0.444), op("("), M::Up("mod".into(), true), *a(self), op(")")]),
            "bmod" | "mod" => M::R(vec![M::Sp(0.222), M::Up("mod".into(), false), M::Sp(0.222)]),
            "not" => match self.atom() {
                Some(M::O(s, _)) => M::O(negate(&s), ""),
                Some(m) => m,
                None => M::R(vec![]),
            },
            "rlap" | "llap" | "clap" | "mathbin" | "mathrel" | "mathord" | "mathopen" | "mathclose" | "mathpunct" | "textcolor" | "colorbox" => {
                if name == "textcolor" || name == "colorbox" { self.raw(); }
                *a(self)
            }
            "phantom" => M::Phantom(a(self)),
            "color" | "label" | "tag" | "hphantom" | "vphantom" => { self.raw(); M::R(vec![]) }
            "displaystyle" | "textstyle" | "scriptstyle" | "scriptscriptstyle" | "limits" | "nolimits" | "nonumber" | "notag" | "relax" => M::R(vec![]),
            "begin" => self.env(),
            "end" => { self.raw(); M::R(vec![]) }
            n if FUNS.split(' ').any(|f| f == n) => M::Up(n.into(), true),
            n => {
                if let Some(acc) = look(ACCENTS, n) {
                    let wide = n.starts_with("wide") || n.starts_with("over");
                    return M::Over(a(self), Box::new(M::O(acc.into(), if wide { "" } else { FIXED })), true);
                }
                if let Some(g) = look(GREEK, n) { return M::I(g.into()) }
                if let Some(g) = look(CAPS, n) { return M::Up(g.into(), false) }
                if let Some(g) = look(LETTERS, n) { return M::I(g.into()) }
                look(OPS, n).map_or_else(|| M::Bad(format!("\\{n}")), op)
            }
        }
    }

    /// A matrix-like environment: rows split by `\\`, cells by `&`, until its `\end`.
    fn env(&mut self) -> M {
        let env = self.raw();
        let base = env.trim_end_matches('*');
        if base == "array" { self.raw(); }
        let mut rows: Vec<Vec<M>> = vec![vec![]];
        loop {
            let cell = self.row(Until::Cell);
            rows.last_mut().unwrap().push(M::R(cell));
            if self.at("\\end") { self.i += 4; self.raw(); break }
            if self.i >= self.c.len() { break }
            if self.c[self.i] == '&' { self.i += 1 } else { self.i += 2; rows.push(vec![]) }
        }
        if rows.len() > 1 && rows.last().is_some_and(|r| r.iter().all(|m| *m == M::R(vec![]))) { rows.pop(); }
        let small = if base.contains("small") { " scriptlevel=\"1\"" } else { "" };
        let table = M::Table(rows, small);
        let (l, r) = match base.trim_end_matches("smallmatrix").trim_end_matches("matrix") {
            "p" => ("(", ")"), "b" => ("[", "]"), "B" => ("{", "}"), "v" => ("|", "|"), "V" => ("‖", "‖"),
            _ if base == "cases" => ("{", ""), _ => ("", ""),
        };
        let mut v = vec![];
        if !l.is_empty() { v.push(M::O(l.into(), "")) }
        v.push(table);
        if !r.is_empty() { v.push(M::O(r.into(), "")) }
        M::R(v)
    }
}

fn negate(s: &str) -> String {
    let pairs = "=≠ ∈∉ ⊂⊄ ⊃⊅ ⊆⊈ ⊇⊉ ∣∤ ≅≇ ∼≁ ≃≄ ≡≢ <≮ >≯ ≤≰ ≥≱ ∃∄ ∥∦";
    pairs.split(' ').find_map(|p| { let mut c = p.chars(); (c.next()?.to_string() == s).then(|| c.collect()) }).unwrap_or_else(|| format!("{s}\u{338}"))
}

/// A math alphabet: bold, italic, double-struck, script, fraktur, sans-serif or monospace letters.
fn alphabet(font: &str, m: M) -> M {
    let map = |c: char| -> char {
        let at = |base: u32, from: char| char::from_u32(base + c as u32 - from as u32).unwrap_or(c);
        let hole = |pairs: &str| pairs.split(' ').find_map(|p| { let mut k = p.chars(); (k.next() == Some(c)).then(|| k.next()).flatten() });
        match font {
            "mathbb" | "mathbbm" | "Bbb" => hole("Cℂ Hℍ Nℕ Pℙ Qℚ Rℝ Zℤ").unwrap_or(match c { 'A'..='Z' => at(0x1D538, 'A'), 'a'..='z' => at(0x1D552, 'a'), '0'..='9' => at(0x1D7D8, '0'), _ => c }),
            "mathcal" | "mathscr" => hole("Bℬ Eℰ Fℱ Hℋ Iℐ Lℒ Mℳ Rℛ eℯ gℊ oℴ").unwrap_or(match c { 'A'..='Z' => at(0x1D49C, 'A'), 'a'..='z' => at(0x1D4B6, 'a'), _ => c }),
            "mathfrak" => hole("Cℭ Hℌ Iℑ Rℜ Zℨ").unwrap_or(match c { 'A'..='Z' => at(0x1D504, 'A'), 'a'..='z' => at(0x1D51E, 'a'), _ => c }),
            "mathbf" => match c { 'A'..='Z' => at(0x1D400, 'A'), 'a'..='z' => at(0x1D41A, 'a'), '0'..='9' => at(0x1D7CE, '0'), _ => c },
            "boldsymbol" | "bm" => match c { 'A'..='Z' => at(0x1D468, 'A'), 'a'..='z' => at(0x1D482, 'a'), '0'..='9' => at(0x1D7CE, '0'), _ => c },
            "mathsf" => match c { 'A'..='Z' => at(0x1D5A0, 'A'), 'a'..='z' => at(0x1D5BA, 'a'), '0'..='9' => at(0x1D7E2, '0'), _ => c },
            "mathtt" => match c { 'A'..='Z' => at(0x1D670, 'A'), 'a'..='z' => at(0x1D68A, 'a'), '0'..='9' => at(0x1D7F6, '0'), _ => c },
            _ => match c { 'h' => 'ℎ', 'A'..='Z' => at(0x1D434, 'A'), 'a'..='z' => at(0x1D44E, 'a'), _ => c },
        }
    };
    match m {
        M::I(t) => M::I(t.chars().map(map).collect()),
        M::Up(t, f) => M::Up(t.chars().map(map).collect(), f),
        M::N(t) => M::N(t.chars().map(map).collect()),
        M::R(v) => M::R(v.into_iter().map(|m| alphabet(font, m)).collect()),
        M::S(b, sb, sp) => M::S(Box::new(alphabet(font, *b)), sb, sp),
        m => m,
    }
}

/// Upright letters, a run of them one name: `\mathrm{Spec}`, `\operatorname{Ext}`.
fn upright(m: M, fun: bool) -> M {
    let M::R(v) = m else { return match m { M::I(t) => M::Up(t, fun), m => m } };
    let mut out: Vec<M> = vec![];
    for m in v {
        match (out.last_mut(), m) {
            (Some(M::Up(w, _)), M::I(t)) => w.push_str(&t),
            (_, M::I(t)) => out.push(M::Up(t, false)),
            (_, m) => out.push(m),
        }
    }
    if fun { if let Some(M::Up(_, f)) = out.last_mut() { *f = true } }
    if out.len() == 1 { out.pop().unwrap() } else { M::R(out) }
}

fn is_big(m: &M) -> bool {
    match m { M::O(s, _) | M::Up(s, true) => BIG.split(' ').any(|b| b == s), _ => false }
}

fn ml(m: &M, d: bool, out: &mut String) {
    let wrap = |out: &mut String, tag: &str, kids: &[&M], d: bool| {
        out.push_str(&format!("<{tag}>"));
        for k in kids { ml(k, d, out) }
        out.push_str(&format!("</{}>", tag.split(' ').next().unwrap_or(tag)));
    };
    match m {
        M::I(s) => out.push_str(&format!("<mi>{}</mi>", esc(s))),
        M::Up(s, _) => out.push_str(&format!("<mi{}>{}</mi>", if s.chars().count() == 1 { " mathvariant=\"normal\"" } else { "" }, esc(s))),
        M::N(s) => out.push_str(&format!("<mn>{}</mn>", esc(s))),
        M::O(s, a) => out.push_str(&format!("<mo{a}>{}</mo>", esc(s))),
        M::T(s) => out.push_str(&format!("<mtext>{}</mtext>", esc(s))),
        M::Bad(s) => out.push_str(&format!("<mtext class=\"bad\">{}</mtext>", esc(s))),
        M::Sp(w) => out.push_str(&format!("<mspace width=\"{w}em\"/>")),
        M::R(v) if v.len() == 1 => ml(&v[0], d, out),
        M::R(v) => {
            out.push_str("<mrow>");
            for (k, m) in v.iter().enumerate() {
                ml(m, d, out);
                // A function name is followed by a thin space unless an argument in brackets follows.
                let base = if let M::S(b, _, _) = m { b } else { m };
                if matches!(base, M::Up(_, true)) && !matches!(v.get(k + 1), Some(M::O(o, _)) if o == "(" || o == "[" || o == "|") && !is_big(base) {
                    out.push_str("<mspace width=\"0.167em\"/>");
                }
            }
            out.push_str("</mrow>");
        }
        M::Frac(a, b, binom) => wrap(out, if *binom { "mfrac linethickness=\"0\"" } else { "mfrac" }, &[a, b], false),
        M::Root(a, None) => wrap(out, "msqrt", &[a], d),
        M::Root(a, Some(n)) => wrap(out, "mroot", &[a, n], d),
        M::S(b, sb, sp) => {
            let (lo, hi) = if d && is_big(b) { ("munder", "mover") } else { ("msub", "msup") };
            let empty = M::R(vec![]);
            match (sb, sp) {
                (Some(s), Some(p)) => wrap(out, &format!("{lo}{}", &hi[1..]), &[b, s, p], false),
                (Some(s), None) => wrap(out, lo, &[b, s], false),
                (None, Some(p)) => wrap(out, hi, &[b, p], false),
                (None, None) => wrap(out, "mrow", &[b, &empty], d),
            }
        }
        M::Over(b, a, accent) => wrap(out, if *accent { "mover accent=\"true\"" } else { "mover" }, &[b, a], d),
        M::Under(b, a) => wrap(out, "munder", &[b, a], d),
        M::Phantom(a) => wrap(out, "mphantom", &[a], d),
        M::Table(rows, small) => {
            out.push_str(&format!("<mtable{small}>"));
            for r in rows {
                out.push_str("<mtr>");
                for c in r { out.push_str("<mtd>"); ml(c, false, out); out.push_str("</mtd>") }
                out.push_str("</mtr>");
            }
            out.push_str("</mtable>");
        }
    }
}

/// One formula as MathML Core.
pub fn mathml(src: &str, display: bool) -> String {
    let mut p = P { c: src.chars().collect(), i: 0, depth: 0 };
    let mut v = vec![];
    while p.i < p.c.len() { v.extend(p.row(Until::End)); if p.i < p.c.len() { p.i += 1 } }
    let mut out = format!("<math{}>", if display { " display=\"block\"" } else { "" });
    ml(&M::R(v), display, &mut out);
    out + "</math>"
}

/// Where the maths that starts at byte `from` ends with `close`: outside braces, past escaped characters.
fn find_end(s: &[u8], from: usize, close: &[u8]) -> Option<usize> {
    let (mut j, mut braces) = (from, 0);
    while j < s.len() {
        if s[j..].starts_with(close) {
            if braces == 0 { return Some(j) }
            j += close.len();
            continue;
        }
        match s[j] { b'\\' => j += 1, b'{' => braces += 1, b'}' => braces = (braces - 1).max(0), _ => {} }
        j += 1;
    }
    None
}

/// Text with its TeX typeset: HTML-escaped text and MathML.
pub fn rich(s: &str) -> String {
    let b = s.as_bytes();
    let (mut out, mut i, mut text) = (String::new(), 0, 0);
    while i < b.len() {
        let open: Option<(&[u8], &[u8], bool)> = if b[i..].starts_with(b"$$") { Some((b"$$", b"$$", true)) }
            else if b[i..].starts_with(b"\\[") { Some((b"\\[", b"\\]", true)) }
            else if b[i..].starts_with(b"\\(") { Some((b"\\(", b"\\)", false)) }
            else if b[i] == b'$' { Some((b"$", b"$", false)) }
            else { None };
        if let Some((open, close, display)) = open {
            if let Some(end) = find_end(b, i + open.len(), close) {
                out.push_str(&esc(&s[text..i]));
                // A wide formula scrolls in its own box, so the page never does.
                let _ = write!(out, r#"<span class="{}">{}</span>"#, if display { "md" } else { "m" }, mathml(&s[i + open.len()..end], display));
                i = end + close.len();
                text = i;
            } else { i += open.len() }
        } else if b[i] == b'\\' && b.get(i + 1) == Some(&b'$') {
            out.push_str(&esc(&s[text..i]));
            text = i + 1;
            i += 2;
        } else { i += 1 }
    }
    out.push_str(&esc(&s[text..]));
    out
}
