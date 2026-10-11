//! The codec of the embedded data, in the manner of LZMA: LZ77 over the whole input, coded by an adaptive
//! binary range coder. A literal is coded in the context of the byte before it, and after a match against
//! the byte at the last distance. A match is a length and a distance, a length at one of the last four
//! distances, or one byte at the last distance. The page builder compresses (`compress`), parsing each
//! stretch of the input for its least price; the page decompresses (`decompress`). The coder, the decoder
//! and the prices all run one model through the `Coder` trait, so they cannot drift apart.

const MIN: usize = 2;
const MAX: usize = MIN + 271;
const NICE: usize = 128;
const DEPTH: usize = 256;
const HASH: usize = 1 << 20;
/// The most positions one parse looks over.
const WINDOW: usize = 4096;
/// How many bytes the prices of lengths and near distances serve before the compressor finds them again.
const REFRESH: usize = 1024;
/// The kinds of operation: 0 a match, 1 a short repeat (one byte at the last distance), 2 to 5 a repeat of
/// the last distance but `kind - 2`, and LIT a literal.
const LIT: usize = 6;

/// One adaptive bit: the encoder codes `b` and returns it, the decoder ignores `b` and returns the bit.
trait Coder {
    fn bit(&mut self, p: &mut u16, b: u32) -> u32;
    fn direct(&mut self, v: u32, n: u32) -> u32;
}

struct Enc { low: u64, range: u32, cache: u8, pending: u64, out: Vec<u8> }

impl Enc {
    fn shift(&mut self) {
        if (self.low as u32) < 0xFF00_0000 || self.low >> 32 != 0 {
            let carry = (self.low >> 32) as u8;
            let mut c = self.cache;
            while self.pending > 0 { self.out.push(c.wrapping_add(carry)); c = 0xFF; self.pending -= 1 }
            self.cache = (self.low >> 24) as u8;
        }
        self.pending += 1;
        self.low = (self.low & 0x00FF_FFFF) << 8;
    }
}

impl Coder for Enc {
    fn bit(&mut self, p: &mut u16, b: u32) -> u32 {
        let bound = (self.range >> 11) * *p as u32;
        if b == 0 { self.range = bound; *p += (2048 - *p) >> 5 } else { self.low += bound as u64; self.range -= bound; *p -= *p >> 5 }
        while self.range < 1 << 24 { self.range <<= 8; self.shift() }
        b
    }
    fn direct(&mut self, v: u32, n: u32) -> u32 {
        for i in (0..n).rev() {
            self.range >>= 1;
            if v >> i & 1 == 1 { self.low += self.range as u64 }
            while self.range < 1 << 24 { self.range <<= 8; self.shift() }
        }
        v
    }
}

struct Dec<'a> { s: &'a [u8], i: usize, range: u32, code: u32 }

impl Dec<'_> {
    fn byte(&mut self) -> u32 { let b = self.s.get(self.i).copied().unwrap_or(0); self.i += 1; b as u32 }
}

impl Coder for Dec<'_> {
    fn bit(&mut self, p: &mut u16, _: u32) -> u32 {
        let bound = (self.range >> 11) * *p as u32;
        let b = if self.code < bound { self.range = bound; *p += (2048 - *p) >> 5; 0 } else { self.code -= bound; self.range -= bound; *p -= *p >> 5; 1 };
        while self.range < 1 << 24 { self.range <<= 8; self.code = self.code << 8 | self.byte() }
        b
    }
    fn direct(&mut self, _: u32, n: u32) -> u32 {
        let mut v = 0;
        for _ in 0..n {
            self.range >>= 1;
            let b = (self.code >= self.range) as u32;
            if b == 1 { self.code -= self.range }
            v = v << 1 | b;
            while self.range < 1 << 24 { self.range <<= 8; self.code = self.code << 8 | self.byte() }
        }
        v
    }
}

/// The price of coding, in sixteenths of a bit: it adds up what each bit would cost and changes no model.
struct Pricer<'a> { t: &'a [u32; 128], sum: u32 }

fn bit_price(t: &[u32; 128], p: u16, b: u32) -> u32 { t[(if b == 0 { p } else { 2048 - p }) as usize >> 4] }

impl Coder for Pricer<'_> {
    fn bit(&mut self, p: &mut u16, b: u32) -> u32 { self.sum += bit_price(self.t, *p, b); b }
    fn direct(&mut self, v: u32, n: u32) -> u32 { self.sum += 16 * n; v }
}

fn price(t: &[u32; 128], f: impl FnOnce(&mut Pricer)) -> u32 { let mut c = Pricer { t, sum: 0 }; f(&mut c); c.sum }

/// A bit tree, most significant bit first.
fn tree(c: &mut impl Coder, p: &mut [u16], bits: u32, v: u32) -> u32 {
    let mut m = 1usize;
    for i in (0..bits).rev() { m = m << 1 | c.bit(&mut p[m], v >> i & 1) as usize }
    (m - (1 << bits)) as u32
}

/// A bit tree, least significant bit first; node m (from 1) has its probability at p[m - 1].
fn rtree(c: &mut impl Coder, p: &mut [u16], bits: u32, v: u32) -> u32 {
    let (mut m, mut out) = (1usize, 0);
    for i in 0..bits { let b = c.bit(&mut p[m - 1], v >> i & 1); m = m << 1 | b as usize; out |= b << i }
    out
}

struct Len { choice: [u16; 2], low: [[u16; 8]; 4], mid: [[u16; 8]; 4], high: [u16; 256] }

impl Len {
    fn new() -> Len { Len { choice: [1024; 2], low: [[1024; 8]; 4], mid: [[1024; 8]; 4], high: [1024; 256] } }
    /// A length less MIN, from 0 to 271.
    fn code(&mut self, c: &mut impl Coder, ps: usize, v: u32) -> u32 {
        if c.bit(&mut self.choice[0], (v >= 8) as u32) == 0 { return tree(c, &mut self.low[ps], 3, v) }
        if c.bit(&mut self.choice[1], (v >= 16) as u32) == 0 { return 8 + tree(c, &mut self.mid[ps], 3, v.wrapping_sub(8)) }
        16 + tree(c, &mut self.high, 8, v.wrapping_sub(16))
    }
}

struct Model {
    is_match: [[u16; 4]; 12], is_rep: [u16; 12], is_rep0: [u16; 12], is_rep0_long: [[u16; 4]; 12], is_rep1: [u16; 12], is_rep2: [u16; 12],
    lit: Vec<u16>, len: Len, rep_len: Len, slot: [[u16; 64]; 4], spec: [u16; 128], align: [u16; 16],
}

impl Model {
    fn new() -> Model {
        Model {
            is_match: [[1024; 4]; 12], is_rep: [1024; 12], is_rep0: [1024; 12], is_rep0_long: [[1024; 4]; 12], is_rep1: [1024; 12], is_rep2: [1024; 12],
            lit: vec![1024; 8 * 0x300], len: Len::new(), rep_len: Len::new(), slot: [[1024; 64]; 4], spec: [1024; 128], align: [1024; 16],
        }
    }

    /// A literal in the context of the byte before it; after a match, also of the byte at the last distance.
    fn literal(&mut self, c: &mut impl Coder, prev: u8, matched: Option<u8>, byte: u32) -> u8 {
        let p = &mut self.lit[(prev as usize >> 5) * 0x300..][..0x300];
        let (mut sym, mut i) = (1usize, 8);
        if let Some(mb) = matched {
            while i > 0 {
                i -= 1;
                let mbit = (mb >> i & 1) as usize;
                let b = c.bit(&mut p[0x100 * (1 + mbit) + sym], byte >> i & 1) as usize;
                sym = sym << 1 | b;
                if b != mbit { break }
            }
        }
        while i > 0 { i -= 1; sym = sym << 1 | c.bit(&mut p[sym], byte >> i & 1) as usize }
        sym as u8
    }

    /// A distance less one: its slot (the bit length and the next bit), then the bits under it.
    fn dist(&mut self, c: &mut impl Coder, len: usize, d: u32) -> u32 {
        let slot = tree(c, &mut self.slot[(len - MIN).min(3)], 6, slot_of(d));
        if slot < 4 { return slot }
        let foot = (slot >> 1) - 1;
        let base = (2 | (slot & 1)) << foot;
        let rest = d.wrapping_sub(base);
        if slot < 14 { return base + rtree(c, &mut self.spec[(base - slot) as usize..], foot, rest) }
        let hi = c.direct(rest >> 4, foot - 4);
        base + (hi << 4) + rtree(c, &mut self.align, 4, rest & 15)
    }

    /// What follows a match bit: the kind of operation, its length, and for a match its distance less one.
    fn op(&mut self, c: &mut impl Coder, state: usize, ps: usize, (kind, len, dist): (usize, usize, usize)) -> (usize, usize, usize) {
        if c.bit(&mut self.is_rep[state], (kind > 0) as u32) == 0 {
            let len = MIN + self.len.code(c, ps, len.wrapping_sub(MIN) as u32) as usize;
            return (0, len, self.dist(c, len, dist as u32) as usize);
        }
        let kind = if c.bit(&mut self.is_rep0[state], (kind > 2) as u32) == 0 {
            if c.bit(&mut self.is_rep0_long[state][ps], (kind == 2) as u32) == 0 { return (1, 1, 0) }
            2
        } else if c.bit(&mut self.is_rep1[state], (kind > 3) as u32) == 0 { 3 }
        else if c.bit(&mut self.is_rep2[state], (kind > 4) as u32) == 0 { 4 } else { 5 };
        (kind, MIN + self.rep_len.code(c, ps, len.wrapping_sub(MIN) as u32) as usize, 0)
    }
}

fn slot_of(d: u32) -> u32 {
    if d < 4 { return d }
    let n = 31 - d.leading_zeros();
    n << 1 | (d >> (n - 1) & 1)
}

const AFTER_LIT: [usize; 12] = [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 4, 5];

/// The state and the last four distances after an operation.
fn next(state: usize, reps: [usize; 4], kind: usize, dist: usize) -> (usize, [usize; 4]) {
    let after = |a, b| if state < 7 { a } else { b };
    match kind {
        LIT => (AFTER_LIT[state], reps),
        0 => (after(7, 10), [dist, reps[0], reps[1], reps[2]]),
        1 => (after(9, 11), reps),
        _ => { let mut r = reps; r[..kind - 1].rotate_right(1); (after(8, 11), r) }
    }
}

/// The original bytes of `src`, which `compress` made.
pub fn decompress(src: &[u8]) -> Vec<u8> {
    let n = u32::from_le_bytes([src[0], src[1], src[2], src[3]]) as usize;
    let mut d = Dec { s: &src[4..], i: 1, range: u32::MAX, code: 0 };
    for _ in 0..4 { d.code = d.code << 8 | d.byte() }
    let (mut m, mut out) = (Model::new(), Vec::with_capacity(n));
    let (mut state, mut reps) = (0usize, [0usize; 4]);
    while out.len() < n {
        let ps = out.len() & 3;
        if d.bit(&mut m.is_match[state][ps], 0) == 0 {
            let matched = (state >= 7).then(|| out[out.len() - reps[0] - 1]);
            let b = m.literal(&mut d, out.last().copied().unwrap_or(0), matched, 0);
            out.push(b);
            (state, reps) = next(state, reps, LIT, 0);
            continue;
        }
        let (kind, len, dist) = m.op(&mut d, state, ps, (0, 0, 0));
        (state, reps) = next(state, reps, kind, dist);
        if reps[0] >= out.len() { break }
        for _ in 0..len.min(n - out.len()) { out.push(out[out.len() - reps[0] - 1]) }
    }
    out
}

/// How far `src` matches itself at `a` and the earlier `b`, up to `max`.
fn common(src: &[u8], a: usize, b: usize, max: usize) -> usize {
    let max = max.min(src.len() - a);
    (0..max).find(|&k| src[a + k] != src[b + k]).unwrap_or(max)
}

/// Hash chains over three-byte prefixes: the earlier positions where each position's prefix occurs.
struct Finder { head: Vec<u32>, prev: Vec<u32> }

impl Finder {
    fn hash(src: &[u8], p: usize) -> usize {
        ((src[p] as u32) << 16 | (src[p + 1] as u32) << 8 | src[p + 2] as u32).wrapping_mul(2_654_435_761) as usize >> 12 & (HASH - 1)
    }
    fn insert(&mut self, src: &[u8], p: usize) {
        if p + 3 > src.len() { return }
        let h = Finder::hash(src, p);
        self.prev[p] = self.head[h];
        self.head[h] = p as u32 + 1;
    }
    /// The earlier matches at `p`, each longer than the one before (length, distance less one); then `p`
    /// joins the chains.
    fn find(&mut self, src: &[u8], p: usize, out: &mut Vec<(usize, usize)>) {
        out.clear();
        if p + 3 <= src.len() {
            let (mut best, mut at) = (MIN, self.head[Finder::hash(src, p)]);
            for _ in 0..DEPTH {
                if at == 0 { break }
                let q = at as usize - 1;
                if src.get(p + best) == src.get(q + best) {
                    let l = common(src, p, q, MAX);
                    if l > best { best = l; out.push((l, p - q - 1)); if l >= NICE { break } }
                }
                at = self.prev[q];
            }
        }
        self.insert(src, p);
    }
}

/// The prices of lengths, by position, and of distances under 128, by length, as the model stands.
struct Prices { len: [[u32; MAX - MIN + 1]; 4], rep_len: [[u32; MAX - MIN + 1]; 4], near: [[u32; 128]; 4] }

impl Prices {
    fn update(&mut self, m: &mut Model, t: &[u32; 128]) {
        for ps in 0..4 {
            for l in 0..=MAX - MIN {
                self.len[ps][l] = price(t, |c| { m.len.code(c, ps, l as u32); });
                self.rep_len[ps][l] = price(t, |c| { m.rep_len.code(c, ps, l as u32); });
            }
            for d in 0..128 { self.near[ps][d] = price(t, |c| { m.dist(c, MIN + ps, d as u32); }) }
        }
    }
}

/// A position of a parse: its least price yet, the operation that reaches it from `from`, and the state
/// and distances there.
#[derive(Clone, Copy)]
struct Node { price: u32, from: usize, kind: usize, len: usize, dist: usize, state: usize, reps: [usize; 4] }

fn reach(opt: &mut [Node], to: usize, price: u32, from: usize, (kind, len, dist): (usize, usize, usize)) {
    if price < opt[to].price { opt[to] = Node { price, from, kind, len, dist, ..opt[to] } }
}

/// `src`, compressed: its length in four bytes, then the range coder's bytes.
pub fn compress(src: &[u8]) -> Vec<u8> {
    let mut e = Enc { low: 0, range: u32::MAX, cache: 0, pending: 1, out: (src.len() as u32).to_le_bytes().to_vec() };
    let mut m = Model::new();
    let mut f = Finder { head: vec![0; HASH], prev: vec![0; src.len()] };
    // The price of a bit by its probability in sixteenths: -16 log2(p / 2048).
    let t: [u32; 128] = std::array::from_fn(|i| (-((i * 16 + 8) as f64 / 2048.0).log2() * 16.0).round() as u32);
    let mut pr = Prices { len: [[0; MAX - MIN + 1]; 4], rep_len: [[0; MAX - MIN + 1]; 4], near: [[0; 128]; 4] };
    let none = Node { price: u32::MAX, from: 0, kind: LIT, len: 1, dist: 0, state: 0, reps: [0; 4] };
    let mut opt = vec![none; WINDOW + MAX + 1];
    let (mut found, mut path) = (vec![], vec![]);
    let (mut state, mut reps, mut pos, mut fresh) = (0usize, [0usize; 4], 0usize, 0usize);
    // The position whose matches `found` holds already, after a parse stopped there.
    let mut held = None;
    while pos < src.len() {
        if pos >= fresh { pr.update(&mut m, &t); fresh = pos + REFRESH }
        opt[0] = Node { price: 0, state, reps, ..none };
        let (mut cur, mut end) = (0, 0);
        loop {
            let p = pos + cur;
            if cur > 0 { let (o, a) = (opt[cur], opt[opt[cur].from]); (opt[cur].state, opt[cur].reps) = next(a.state, a.reps, o.kind, o.dist) }
            let Node { price: here, state: s, reps: r, .. } = opt[cur];
            if held != Some(p) { f.find(src, p, &mut found) }
            held = None;
            let ps = p & 3;
            let rep_lens: [usize; 4] = std::array::from_fn(|i| if p > r[i] { common(src, p, p - r[i] - 1, MAX) } else { 0 });
            let longest = found.last().map_or(0, |x| x.0);
            let (i, rl) = (0..4).map(|i| (i, rep_lens[i])).fold((0, 0), |a, b| if b.1 > a.1 { b } else { a });
            if longest.max(rl) >= NICE {
                // A long match goes in whole: at the start of a parse at once, else in the next parse.
                if cur > 0 { held = Some(p); break }
                let op = if rl >= NICE { (2 + i, rl, 0) } else { (0, longest, found.last().expect("a match").1) };
                for q in p + 1..p + op.1 { f.insert(src, q) }
                reach(&mut opt, op.1, 0, 0, op);
                (cur, end) = (op.1, op.1);
                break;
            }
            let matched = (s >= 7).then(|| src[p - r[0] - 1]);
            let lit = price(&t, |c| { m.literal(c, if p > 0 { src[p - 1] } else { 0 }, matched, src[p] as u32); });
            reach(&mut opt, cur + 1, here + bit_price(&t, m.is_match[s][ps], 0) + lit, cur, (LIT, 1, 0));
            let any = here + bit_price(&t, m.is_match[s][ps], 1);
            let rep = any + bit_price(&t, m.is_rep[s], 1);
            if p > r[0] && src[p] == src[p - r[0] - 1] {
                reach(&mut opt, cur + 1, rep + bit_price(&t, m.is_rep0[s], 0) + bit_price(&t, m.is_rep0_long[s][ps], 0), cur, (1, 1, 0));
            }
            for (i, &rl) in rep_lens.iter().enumerate().filter(|x| *x.1 >= MIN) {
                let head = rep + match i {
                    0 => bit_price(&t, m.is_rep0[s], 0) + bit_price(&t, m.is_rep0_long[s][ps], 1),
                    _ => bit_price(&t, m.is_rep0[s], 1) + bit_price(&t, m.is_rep1[s], (i > 1) as u32) + if i > 1 { bit_price(&t, m.is_rep2[s], (i > 2) as u32) } else { 0 },
                };
                for l in MIN..=rl { reach(&mut opt, cur + l, head + pr.rep_len[ps][l - MIN], cur, (2 + i, l, 0)) }
            }
            let mat = any + bit_price(&t, m.is_rep[s], 0);
            let mut from_len = MIN;
            for &(len, d) in &found {
                let mut dp = [u32::MAX; 4];
                for l in from_len..=len {
                    let ls = (l - MIN).min(3);
                    if dp[ls] == u32::MAX { dp[ls] = if d < 128 { pr.near[ls][d] } else { price(&t, |c| { m.dist(c, l, d as u32); }) } }
                    reach(&mut opt, cur + l, mat + pr.len[ps][l - MIN] + dp[ls], cur, (0, l, d));
                }
                from_len = len + 1;
            }
            end = end.max(cur + longest.max(rl).max(1));
            cur += 1;
            if cur == end || cur >= WINDOW { break }
        }
        path.clear();
        let mut k = cur;
        while k > 0 { path.push((opt[k].kind, opt[k].len, opt[k].dist)); k = opt[k].from }
        for &op in path.iter().rev() {
            let ps = pos & 3;
            if op.0 == LIT {
                e.bit(&mut m.is_match[state][ps], 0);
                let matched = (state >= 7).then(|| src[pos - reps[0] - 1]);
                m.literal(&mut e, if pos > 0 { src[pos - 1] } else { 0 }, matched, src[pos] as u32);
            } else {
                e.bit(&mut m.is_match[state][ps], 1);
                m.op(&mut e, state, ps, op);
            }
            (state, reps) = next(state, reps, op.0, op.2);
            pos += op.1;
        }
        opt[1..=end].iter_mut().for_each(|o| o.price = u32::MAX);
    }
    for _ in 0..5 { e.shift() }
    e.out
}
