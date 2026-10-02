/* Generating Functions Lab: the pure mathematical core.
 *
 * No DOM, storage, clock, randomness or network: the page (`self.GF`) and Node (`require`) load the
 * same file. Counting is exact: integer series are arrays of BigInt, rational series are arrays of
 * rationals { n, d } with BigInt parts, and roots-of-unity values live exactly in the cyclotomic ring
 * Z[ζ_N] (polynomials in ζ reduced modulo the cyclotomic polynomial Φ_N). Floating point is used
 * only for pictures (phasors, plots) and for the asymptotic comparisons, which state a tolerance.
 *
 * Every counting result here has an independent check: a generating-function coefficient on one
 * side, and a brute-force enumeration or a dynamic-programming recurrence on the other.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GF = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- integers ---------- */
  const B = (x) => (typeof x === "bigint" ? x : BigInt(x));
  const babs = (a) => (a < 0n ? -a : a);
  function bgcd(a, b) { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; }
  function factorial(n) { let r = 1n; for (let k = 2n; k <= B(n); k++) r *= k; return r; }
  function binom(n, k) {
    n = B(n); k = B(k);
    if (k < 0n || n < 0n || k > n) return 0n;
    if (k > n - k) k = n - k;
    let r = 1n;
    for (let i = 1n; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  }

  /* ---------- rationals { n, d }, d > 0, lowest terms ---------- */
  function Q(n, d = 1n) {
    n = B(n); d = B(d);
    if (d === 0n) throw new Error("division by zero");
    if (d < 0n) { n = -n; d = -d; }
    const g = bgcd(n, d) || 1n;
    return { n: n / g, d: d / g };
  }
  const isQ = (x) => x !== null && typeof x === "object" && typeof x.n === "bigint" && typeof x.d === "bigint";
  const toQ = (x) => (isQ(x) ? x : Q(x));
  const qadd = (a, b) => { a = toQ(a); b = toQ(b); return Q(a.n * b.d + b.n * a.d, a.d * b.d); };
  const qsub = (a, b) => { a = toQ(a); b = toQ(b); return Q(a.n * b.d - b.n * a.d, a.d * b.d); };
  const qmul = (a, b) => { a = toQ(a); b = toQ(b); return Q(a.n * b.n, a.d * b.d); };
  const qdiv = (a, b) => { a = toQ(a); b = toQ(b); return Q(a.n * b.d, a.d * b.n); };
  const qeq = (a, b) => { a = toQ(a); b = toQ(b); return a.n === b.n && a.d === b.d; };
  const qIsZero = (a) => toQ(a).n === 0n;
  const qnum = (a) => { a = toQ(a); return bigRatio(a.n, a.d); };
  const qstr = (a) => { a = toQ(a); return a.d === 1n ? fmtInt(a.n) : `${fmtInt(a.n)}/${a.d}`; };
  /* A BigInt ratio as a float, safe when both parts exceed the double range. */
  function bigRatio(n, d) {
    const ln = bigLog(babs(n)) - bigLog(babs(d));
    const s = (n < 0n) !== (d < 0n) ? -1 : 1;
    return n === 0n ? 0 : s * Math.exp(ln);
  }
  /* Natural log of a positive BigInt, from its leading digits. */
  function bigLog(b) {
    b = babs(B(b));
    if (b === 0n) return -Infinity;
    const s = b.toString();
    if (s.length <= 15) return Math.log(Number(b));
    return Math.log(Number(s.slice(0, 15))) + (s.length - 15) * Math.LN10;
  }
  /* Integers with a true minus sign, as the page prints them. */
  const fmtInt = (n) => (B(n) < 0n ? "−" + (-B(n)).toString() : B(n).toString());

  /* ---------- integer series (arrays of BigInt), always truncated to N terms ---------- */
  const zeros = (N) => Array.from({ length: N }, () => 0n);
  const seriesFrom = (arr, N = arr.length) => Array.from({ length: N }, (_, i) => (i < arr.length ? B(arr[i]) : 0n));
  const trunc = (a, N) => seriesFrom(a, N);
  const add = (a, b, N = Math.max(a.length, b.length)) => Array.from({ length: N }, (_, i) => (a[i] ?? 0n) + (b[i] ?? 0n));
  const sub = (a, b, N = Math.max(a.length, b.length)) => Array.from({ length: N }, (_, i) => (a[i] ?? 0n) - (b[i] ?? 0n));
  const scale = (a, c) => a.map((x) => x * B(c));
  /* x^k A(x): [x^n] x^k A = a_{n-k}. */
  const shift = (a, k, N = a.length) => Array.from({ length: N }, (_, i) => (i - k >= 0 && i - k < a.length ? a[i - k] : 0n));
  /* A'(x): [x^n] A' = (n + 1) a_{n+1}. */
  const derivative = (a) => a.slice(1).map((x, i) => x * B(i + 1));
  /* x A'(x): [x^n] = n a_n. */
  const xDerivative = (a) => a.map((x, i) => x * B(i));
  /* ∫₀ˣ A: [x^n] = a_{n-1}/n, rational. */
  const integral = (a, N = a.length + 1) => Array.from({ length: N }, (_, i) => (i === 0 || i - 1 >= a.length ? Q(0) : Q(toBig(a[i - 1]), i)));
  const toBig = (x) => (isQ(x) ? (x.d === 1n ? x.n : (() => { throw new Error("not an integer"); })()) : B(x));
  /* Cauchy product: [x^n] A B = Σ_k a_k b_{n-k}. */
  function mul(a, b, N = a.length + b.length - 1) {
    const c = zeros(N);
    for (let i = 0; i < a.length && i < N; i++) if (a[i]) for (let j = 0; j < b.length && i + j < N; j++) c[i + j] += a[i] * b[j];
    return c;
  }
  /* 1/A(x) for a₀ = ±1, exact over the integers. */
  function inverse(a, N) {
    if (a[0] !== 1n && a[0] !== -1n) throw new Error("inverse needs a₀ = ±1 over the integers");
    const r = zeros(N);
    r[0] = a[0];
    for (let n = 1; n < N; n++) {
      let s = 0n;
      for (let k = 1; k <= n && k < a.length; k++) s += a[k] * r[n - k];
      r[n] = -s * a[0];
    }
    return r;
  }
  /* P(x)/Q(x) with Q(0) = ±1. */
  const rational = (p, q, N) => mul(seriesFrom(p), inverse(seriesFrom(q), N), N);
  /* 1/(1 - P(x)), the SEQUENCE construction, P(0) = 0. */
  function sequenceOf(p, N) { const q = scale(seriesFrom(p, Math.max(p.length, 1)), -1); q[0] += 1n; return inverse(q, N); }
  function power(a, k, N) { let r = seriesFrom([1], N); for (let i = 0; i < k; i++) r = mul(r, a, N); return r; }
  /* A(B(x)) with b₀ = 0, by Horner's rule on truncated series. */
  function compose(a, b, N) {
    if ((b[0] ?? 0n) !== 0n) throw new Error("composition needs b₀ = 0");
    let r = zeros(N);
    for (let i = Math.min(a.length, N) - 1; i >= 0; i--) { r = mul(r, b, N); r[0] += a[i]; }
    return r;
  }
  /* Evaluate a finite integer polynomial at a float x (Horner). */
  const evalAt = (a, x) => a.reduceRight((s, c) => s * x + Number(c), 0);

  /* ---------- rational series (arrays of Q) ---------- */
  const qseries = (arr, N = arr.length) => Array.from({ length: N }, (_, i) => (i < arr.length ? toQ(arr[i]) : Q(0)));
  function qmulSeries(a, b, N = a.length + b.length - 1) {
    const c = Array.from({ length: N }, () => Q(0));
    for (let i = 0; i < a.length && i < N; i++) if (!qIsZero(a[i])) for (let j = 0; j < b.length && i + j < N; j++) c[i + j] = qadd(c[i + j], qmul(a[i], b[j]));
    return c;
  }
  /* exp(C(x)) for c₀ = 0: n e_n = Σ_{k=1}^{n} k c_k e_{n-k} (from E' = C'E). */
  function qexp(c, N) {
    if (!qIsZero(c[0] ?? Q(0))) throw new Error("exp needs c₀ = 0");
    const e = [Q(1)];
    for (let n = 1; n < N; n++) {
      let s = Q(0);
      for (let k = 1; k <= n && k < c.length; k++) s = qadd(s, qmul(Q(k), qmul(c[k], e[n - k])));
      e.push(qdiv(s, Q(n)));
    }
    return e;
  }
  /* EGF coefficient list (a_n x^n/n!) from counts a_n, and back. */
  const egfFromCounts = (a) => a.map((x, n) => Q(B(x), factorial(n)));
  const countsFromEgf = (e) => e.map((q, n) => toBig(qmul(q, Q(factorial(n)))));
  /* Labelled product: c_n = Σ_k C(n,k) a_k b_{n-k}. */
  function binomialConvolution(a, b, N = Math.min(a.length, b.length)) {
    return Array.from({ length: N }, (_, n) => { let s = 0n; for (let k = 0; k <= n; k++) s += binom(n, k) * B(a[k]) * B(b[n - k]); return s; });
  }

  /* ---------- the sequences of the lab, each with an independent check ---------- */
  /* Fibonacci F_n with F_0 = 0, F_1 = 1, from F(x) = x/(1 - x - x²). */
  const fibonacciGF = (N) => rational([0, 1], [1, -1, -1], N);
  function fibonacciDP(N) { const f = [0n, 1n]; while (f.length < N) f.push(f.at(-1) + f.at(-2)); return f.slice(0, N); }

  /* Q(√5) = { a + b√5 } with rational a, b: Binet's formula checked exactly. */
  const s5 = (a, b) => ({ a: toQ(a), b: toQ(b) });
  const s5mul = (x, y) => s5(qadd(qmul(x.a, y.a), qmul(Q(5), qmul(x.b, y.b))), qadd(qmul(x.a, y.b), qmul(x.b, y.a)));
  const s5pow = (x, n) => { let r = s5(1, 0); for (let i = 0; i < n; i++) r = s5mul(r, x); return r; };
  const PHI = s5(Q(1, 2), Q(1, 2)), PSI = s5(Q(1, 2), Q(-1, 2));
  /* F_n = (φⁿ − ψⁿ)/√5: the difference is 2b√5, so F_n = 2b where φⁿ = a + b√5. */
  function binet(n) {
    const p = s5pow(PHI, n), q = s5pow(PSI, n);
    if (!qeq(p.a, q.a)) throw new Error("conjugates must share their rational part");
    return toBig(qsub(p.b, q.b));
  }

  /* Coin change: [x^n] Π 1/(1 - x^d). */
  function coinChangeGF(denoms, N) { let r = seriesFrom([1], N); for (const d of denoms) { const q = zeros(d + 1); q[0] = 1n; q[d] = -1n; r = mul(r, inverse(q, N), N); } return r; }
  /* Every multiset of coins as its tuple of counts (c₁, c₂, …): Σ c_i d_i = n. */
  function coinSolutions(denoms, n) {
    const out = [];
    const go = (i, left, acc) => {
      if (i === denoms.length - 1) { if (left % denoms[i] === 0) out.push([...acc, left / denoms[i]]); return; }
      for (let c = 0; c * denoms[i] <= left; c++) go(i + 1, left - c * denoms[i], [...acc, c]);
    };
    if (denoms.length) go(0, n, []);
    return out;
  }

  /* Compositions with parts in S: 1/(1 - Σ_{s∈S} x^s). */
  function compositionsGF(parts, N) { const p = zeros(Math.max(...parts) + 1); for (const s of parts) p[s] += 1n; return sequenceOf(p, N); }
  function compositionsList(parts, n, limit = Infinity) {
    const out = [];
    const go = (left, acc) => {
      if (out.length >= limit) return;
      if (left === 0) { out.push(acc.slice()); return; }
      for (const s of parts) if (s <= left) { acc.push(s); go(left - s, acc); acc.pop(); }
    };
    go(n, []);
    return out;
  }
  function compositionsCount(parts, n) { const c = [1n]; for (let m = 1; m <= n; m++) c.push(parts.reduce((s, p) => s + (p <= m ? c[m - p] : 0n), 0n)); return c[n]; }

  /* Binary strings with no two adjacent 1s. States: last bit 0 (or empty), last bit 1. */
  const NO11 = { states: ["ends in 0 or empty", "ends in 1"], M: [[1n, 1n], [1n, 0n]] };
  /* v_{n+1} = M v_n with v_0 = (1, 0): the empty string sits in the "last 0" state. */
  function transferCounts(N) {
    const out = []; let v = [1n, 0n];
    for (let n = 0; n < N; n++) { out.push(v[0] + v[1]); v = [NO11.M[0][0] * v[0] + NO11.M[0][1] * v[1], NO11.M[1][0] * v[0] + NO11.M[1][1] * v[1]]; }
    return out;
  }
  /* (1 + x)/(1 - x - x²) = Σ F_{n+2} xⁿ. */
  const no11GF = (N) => rational([1, 1], [1, -1, -1], N);
  function no11Strings(n) { const out = []; for (let m = 0; m < 2 ** n; m++) { const s = m.toString(2).padStart(n, "0"); if (n === 0 || !s.includes("11")) out.push(n === 0 ? "" : s); } return n === 0 ? [""] : out; }

  /* Catalan: C = 1 + x C², solved by fixed-point iteration on truncated series. */
  function catalanGF(N) { let c = seriesFrom([1], N); for (let i = 0; i < N; i++) { const next = shift(mul(c, c, N), 1, N); next[0] += 1n; c = next; } return c; }
  const catalanClosed = (n) => binom(2 * n, n) / B(n + 1);
  function balancedParens(n) {
    const out = [];
    const go = (s, open, close) => { if (s.length === 2 * n) { out.push(s); return; } if (open < n) go(s + "(", open + 1, close); if (close < open) go(s + ")", open, close + 1); };
    go("", 0, 0);
    return out;
  }
  /* Binary trees with n internal nodes, as nested arrays: null is a leaf, [L, R] an internal node. */
  function binaryTrees(n) {
    if (n === 0) return [null];
    const out = [];
    for (let k = 0; k < n; k++) for (const l of binaryTrees(k)) for (const r of binaryTrees(n - 1 - k)) out.push([l, r]);
    return out;
  }

  /* Lagrange inversion for T = x φ(T): [xⁿ] T^k = (k/n) [u^{n-k}] φ(u)ⁿ. */
  function lagrange(phi, n, k = 1) {
    if (n < 1 || k < 1 || k > n) throw new Error("Lagrange inversion needs 1 ≤ k ≤ n");
    const pw = power(seriesFrom(phi), n, n - k + 1);
    return Q(B(k) * pw[n - k], n);
  }
  /* The same coefficients by iterating T ← x φ(T) (a different computation). */
  function implicitSeries(phi, N) { let t = zeros(N); for (let i = 0; i < N; i++) t = shift(compose(seriesFrom(phi), t, N), 1, N); return t; }
  /* Rooted labelled trees on n vertices (Cayley), by brute force over parent maps: n^{n-1}. */
  function rootedLabelledTrees(n) {
    let count = 0;
    const parent = new Array(n).fill(0);
    const total = (n + 1) ** n; // each vertex: parent 0..n-1, or n meaning "is the root"
    for (let m = 0; m < total; m++) {
      let x = m, roots = 0;
      for (let i = 0; i < n; i++) { parent[i] = x % (n + 1); x = Math.floor(x / (n + 1)); if (parent[i] === n) roots++; if (parent[i] === i) roots = 99; }
      if (roots !== 1) continue;
      let ok = true;
      for (let i = 0; i < n && ok; i++) { let v = i, steps = 0; while (parent[v] !== n && steps <= n) { v = parent[v]; steps++; } if (steps > n) ok = false; }
      if (ok) count++;
    }
    return BigInt(count);
  }

  /* Permutations, their cycles, and Stirling numbers of the first kind. */
  function permutations(n) {
    const out = [], a = Array.from({ length: n }, (_, i) => i);
    const go = (k) => { if (k === n) { out.push(a.slice()); return; } for (let i = k; i < n; i++) { [a[k], a[i]] = [a[i], a[k]]; go(k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
    go(0);
    return out;
  }
  function cyclesOf(p) {
    const seen = new Array(p.length).fill(false), out = [];
    for (let i = 0; i < p.length; i++) if (!seen[i]) { const c = []; let j = i; while (!seen[j]) { seen[j] = true; c.push(j); j = p[j]; } out.push(c); }
    return out;
  }
  /* c(n, k) by the recurrence c(n+1, k) = n c(n, k) + c(n, k-1). */
  function stirling1(N) {
    const t = [[1n]];
    for (let n = 0; n < N - 1; n++) { const row = zeros(n + 2); for (let k = 0; k <= n; k++) { row[k] += B(n) * t[n][k]; row[k + 1] += t[n][k]; } t.push(row); }
    return t;
  }
  /* The bivariate EGF exp(y · log 1/(1-x)) = (1-x)^{-y}: [xⁿ/n!] is the rising factorial y(y+1)…(y+n-1). */
  function cyclesBGF(N) {
    const rows = [];
    for (let n = 0; n < N; n++) { let p = [1n]; for (let j = 0; j < n; j++) p = mul(p, [B(j), 1n], p.length + 1); rows.push(p); }
    return rows;
  }
  function stirling1Enumerated(n) { const row = zeros(n + 1); for (const p of permutations(n)) row[cyclesOf(p).length] += 1n; return row; }
  /* Exponential formula, cycles → permutations: exp(Σ_{n≥1} (n-1)! xⁿ/n!) = Σ n! xⁿ/n!. */
  function permutationsByExpFormula(N) { const c = [Q(0), ...Array.from({ length: N - 1 }, (_, i) => Q(1, i + 1))]; return countsFromEgf(qexp(c, N)); }
  /* Set partitions (Bell numbers): exp(eˣ - 1); enumerated by restricted growth strings. */
  function bellByExpFormula(N) { const c = [Q(0), ...Array.from({ length: N - 1 }, (_, i) => Q(1, factorial(i + 1)))]; return countsFromEgf(qexp(c, N)); }
  function setPartitions(n) {
    const out = [];
    const go = (s, max) => { if (s.length === n) { out.push(s.slice()); return; } for (let b = 0; b <= max + 1; b++) { s.push(b); go(s, Math.max(max, b)); s.pop(); } };
    if (n === 0) return [[]];
    go([], -1);
    return out;
  }
  /* Arrangements: an ordered subset of {1..n}, a labelled product SEQ × SET; EGF eˣ/(1 - x). */
  const arrangementsGF = (N) => binomialConvolution(Array.from({ length: N }, (_, k) => factorial(k)), Array.from({ length: N }, () => 1n), N);
  function arrangementsEnumerated(n) {
    let count = 0n;
    for (let m = 0; m < 2 ** n; m++) { let k = 0; for (let i = 0; i < n; i++) if (m & (1 << i)) k++; count += factorial(k); }
    return count;
  }
  /* Arrangements by literal enumeration of every (subset, order) pair, for the picture. */
  function arrangementsList(n) { const out = []; for (let m = 0; m < 2 ** n; m++) { const s = []; for (let i = 0; i < n; i++) if (m & (1 << i)) s.push(i + 1); for (const p of permutations(s.length)) out.push(p.map((i) => s[i])); } return out; }

  /* Dice: PGF ((z + … + z^6)/6)^k, exact; and enumeration over all 6^k outcomes. */
  function dicePGF(k, faces = 6) { const one = qseries([0, ...Array.from({ length: faces }, () => Q(1, faces))]); let r = [Q(1)]; for (let i = 0; i < k; i++) r = qmulSeries(r, one); return r; }
  function diceEnumerated(k, faces = 6) { const cnt = new Array(k * faces + 1).fill(0n); const go = (i, s) => { if (i === k) { cnt[s] += 1n; return; } for (let f = 1; f <= faces; f++) go(i + 1, s + f); }; go(0, 0); const total = B(faces) ** B(k); return cnt.map((c) => Q(c, total)); }
  const pgfMean = (p) => p.reduce((s, q, n) => qadd(s, qmul(q, Q(n))), Q(0));

  /* Integer partitions: Π 1/(1 - x^k), distinct parts Π(1 + x^k), odd parts Π 1/(1 - x^{2k-1}). */
  function partitionsGF(N, { parts = null, distinct = false, maxPart = Infinity } = {}) {
    let r = seriesFrom([1], N);
    for (let k = 1; k < N && k <= maxPart; k++) {
      if (parts === "odd" && k % 2 === 0) continue;
      const f = zeros(N);
      if (distinct) { f[0] = 1n; f[k] = 1n; } else for (let j = 0; j < N; j += k) f[j] = 1n;
      r = mul(r, f, N);
    }
    return r;
  }
  function partitionsList(n, { maxPart = n, distinct = false, odd = false } = {}) {
    const out = [];
    const go = (left, max, acc) => {
      if (left === 0) { out.push(acc.slice()); return; }
      for (let k = Math.min(left, max); k >= 1; k--) {
        if (odd && k % 2 === 0) continue;
        acc.push(k); go(left - k, distinct ? k - 1 : k, acc); acc.pop();
      }
    };
    go(n, maxPart, []);
    return out;
  }

  /* Addition and subtraction: even and odd piles, and piles whose size is not a multiple of 3. */
  const evenGF = (N) => rational([1], [1, 0, -1], N);
  const oddGF = (N) => rational([0, 1], [1, 0, -1], N);
  const notMultipleOf3GF = (N) => sub(rational([1], [1, -1], N), rational([1], [1, 0, 0, -1], N), N);

  /* Composition SEQ(SEQ≥1(atom)): 1/(1 - x/(1-x)) = (1-x)/(1-2x), 2^{n-1} compositions of n ≥ 1. */
  const compositionsAllGF = (N) => compose(rational([1], [1, -1], N), rational([0, 1], [1, -1], N), N);

  /* Lattice paths with E and N steps: A(x, y) = 1/(1 - x - y), a_{m,n} = C(m+n, m). */
  function latticeGrid(M) { const g = Array.from({ length: M }, () => zeros(M)); for (let m = 0; m < M; m++) for (let n = 0; n < M; n++) g[m][n] = m === 0 || n === 0 ? 1n : g[m - 1][n] + g[m][n - 1]; return g; }
  /* The diagonal Σ C(2n, n) xⁿ = 1/√(1 - 4x): check by squaring (its square is 1/(1 - 4x)). */
  const centralBinomials = (N) => Array.from({ length: N }, (_, n) => binom(2 * n, n));

  /* ---------- the cyclotomic ring Z[ζ_N]: exact values at roots of unity ---------- */
  /* Polynomials as BigInt coefficient arrays, lowest degree first. */
  function polyDivExact(p, d) {
    p = p.slice(); const q = zeros(Math.max(p.length - d.length + 1, 0)), lead = d.at(-1);
    for (let i = p.length - d.length; i >= 0; i--) { const c = p[i + d.length - 1] / lead; if (c * lead !== p[i + d.length - 1]) throw new Error("not exact"); q[i] = c; for (let j = 0; j < d.length; j++) p[i + j] -= c * d[j]; }
    if (p.some((x) => x !== 0n)) throw new Error("division left a remainder");
    return q;
  }
  const PHI_CACHE = new Map();
  /* Φ_N(t) = (t^N - 1) / Π_{d | N, d < N} Φ_d(t). */
  function cyclotomic(N) {
    if (PHI_CACHE.has(N)) return PHI_CACHE.get(N);
    let p = zeros(N + 1); p[0] = -1n; p[N] = 1n;
    for (let d = 1; d < N; d++) if (N % d === 0) p = polyDivExact(p, cyclotomic(d));
    PHI_CACHE.set(N, p);
    return p;
  }
  /* Reduce a polynomial in ζ modulo Φ_N (monic): an element of Z[ζ_N] in the basis 1, ζ, …, ζ^{φ(N)-1}. */
  function zreduce(p, N) {
    const phi = cyclotomic(N), deg = phi.length - 1; p = p.slice();
    for (let i = p.length - 1; i >= deg; i--) { const c = p[i]; if (!c) continue; for (let j = 0; j <= deg; j++) p[i - deg + j] -= c * phi[j]; }
    return seriesFrom(p.slice(0, deg), deg);
  }
  /* ζ^k as an element. */
  function zeta(k, N) { const m = ((k % N) + N) % N, p = zeros(m + 1); p[m] = 1n; return zreduce(p, N); }
  const zadd = (a, b) => a.map((x, i) => x + b[i]);
  const zmul = (a, b, N) => zreduce(mul(a, b), N);
  const zIsInt = (a) => a.slice(1).every((x) => x === 0n);
  const zeq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  /* A(ζ^k) exactly: collect Σ a_n ζ^{kn mod N} in Z[t]/(t^N - 1), then reduce by Φ_N. */
  function evalAtRoot(a, k, N) { const p = zeros(N); a.forEach((c, n) => { p[(((k * n) % N) + N) % N] += B(c); }); return zreduce(p, N); }
  /* DFT: the coefficient vector of a finite GF ↦ its values at the N-th roots of unity, ω = e^{2πi/N}. */
  function dftExact(a, N = a.length) { return Array.from({ length: N }, (_, k) => evalAtRoot(seriesFrom(a, N), k, N)); }
  /* Inverse DFT as coefficient extraction: a_n = (1/N) Σ_k A(ω^k) ω^{-kn}. Returns rationals. */
  function idftExact(values, N = values.length) {
    return Array.from({ length: N }, (_, n) => {
      let s = zeros(cyclotomic(N).length - 1);
      for (let k = 0; k < N; k++) s = zadd(s, zmul(values[k], zeta(-k * n, N), N));
      if (!zIsInt(s)) throw new Error("the inverse DFT of integer data must land in the integers");
      return Q(s[0], N);
    });
  }
  /* Cyclic convolution: c_n = Σ_k a_k b_{(n-k) mod N}. */
  function cyclicConvolution(a, b, N = a.length) { const c = zeros(N); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) c[(i + j) % N] += B(a[i] ?? 0n) * B(b[j] ?? 0n); return c; }
  /* The convolution theorem, exactly: IDFT(DFT(a) · DFT(b)) = a ⊛ b. */
  function cyclicByDFT(a, b, N = a.length) { const A = dftExact(a, N), Bv = dftExact(b, N); return idftExact(A.map((x, k) => zmul(x, Bv[k], N)), N).map(toBig); }
  /* Roots-of-unity filter: Σ_{n ≡ r (mod m)} a_n = (1/m) Σ_j ω^{-rj} A(ω^j), exactly. */
  function rootsFilterExact(a, m, r) {
    let s = zeros(cyclotomic(m).length - 1);
    for (let j = 0; j < m; j++) s = zadd(s, zmul(zeta(-r * j, m), evalAtRoot(a, j, m), m));
    if (!zIsInt(s)) throw new Error("the filter of integer data must land in the integers");
    return Q(s[0], m);
  }
  const residueSum = (a, m, r) => a.reduce((s, c, n) => s + ((((n - r) % m) + m) % m === 0 ? B(c) : 0n), 0n);

  /* Z[ζ_N] → complex float, for pictures. */
  function zToComplex(z, N) { let re = 0, im = 0; z.forEach((c, j) => { re += Number(c) * Math.cos((2 * Math.PI * j) / N); im += Number(c) * Math.sin((2 * Math.PI * j) / N); }); return { re: clean(re), im: clean(im) }; }
  const clean = (x) => (Math.abs(x) < 1e-12 ? 0 : x);
  /* Exact text for an element when N ∈ {1, 2, 3, 4, 6, 8}; otherwise null. */
  function zExactString(z, N) {
    const q = (x) => toQ(x);
    if (z.length === 1) return fmtInt(z[0]);
    if (N === 4) return complexText(q(z[0]), q(z[1]), "");
    if (N === 3) return complexText(qsub(q(z[0]), Q(z[1], 2)), Q(z[1], 2), "√3");
    if (N === 6) return complexText(qadd(q(z[0]), Q(z[1], 2)), Q(z[1], 2), "√3");
    if (N === 8) {
      const [c0, c1, c2, c3] = z;
      return complexSurd([q(c0), Q(c1 - c3, 2)], [q(c2), Q(c1 + c3, 2)]);
    }
    return null;
  }
  /* re + (im·surd) i where re is rational and the imaginary part is a rational multiple of surd (or 1). */
  function complexText(re, imCoef, surd) {
    const imPart = surdTerm(imCoef, surd);
    if (qIsZero(imCoef)) return qstr(re);
    const imStr = imPart.text === "1" ? "i" : imPart.text === "−1" ? "−i" : surd ? `${imPart.text}\u2009i` : `${imPart.text}i`;
    if (qIsZero(re)) return imStr;
    return `${qstr(re)} ${imPart.neg ? "−" : "+"} ${imStr.replace(/^−/, "")}`;
  }
  function surdTerm(c, surd) {
    c = toQ(c);
    const neg = c.n < 0n, n = babs(c.n);
    let t;
    if (!surd) t = c.d === 1n ? n.toString() : `${n}/${c.d}`;
    else t = (n === 1n ? "" : n.toString()) + surd + (c.d === 1n ? "" : `/${c.d}`);
    return { neg, text: (neg ? "−" : "") + t };
  }
  /* (a + b√2) + (c + d√2) i. */
  function complexSurd([a, b], [c, d]) {
    const part = (r, s) => {
      if (qIsZero(s)) return qstr(r);
      const st = surdTerm(s, "√2");
      if (qIsZero(r)) return st.text;
      return `${qstr(r)} ${st.neg ? "−" : "+"} ${st.text.replace(/^−/, "")}`;
    };
    if (qIsZero(c) && qIsZero(d)) return part(a, b);
    const re = part(a, b);
    /* A compound imaginary part whose terms are both ≤ 0 is written −(…)i. */
    const flip = qnum(c) <= 0 && qnum(d) <= 0;
    const im = flip ? part(qsub(Q(0), c), qsub(Q(0), d)) : part(c, d);
    const body = /[ +−]/.test(im.slice(1)) ? `(${im})\u2009i` : im === "1" ? "i" : im.includes("√") ? `${im}\u2009i` : `${im}i`;
    const imText = flip ? "−" + body : body;
    if (re === "0") return imText;
    return imText.startsWith("−") ? `${re} − ${imText.slice(1)}` : `${re} + ${imText}`;
  }

  /* ---------- complex floats: phasors and the FFT picture ---------- */
  const C = (re, im = 0) => ({ re, im });
  const cadd = (a, b) => C(a.re + b.re, a.im + b.im);
  const csub = (a, b) => C(a.re - b.re, a.im - b.im);
  const cmul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const cabs = (a) => Math.hypot(a.re, a.im);
  const root = (k, N) => C(Math.cos((2 * Math.PI * k) / N), Math.sin((2 * Math.PI * k) / N));
  /* The head-to-tail phasor path for A(ω^k): partial sums of a_n ω^{kn}. */
  function phasorPath(a, k, N) { const pts = [C(0)]; let s = C(0); a.forEach((c, n) => { s = cadd(s, cmul(C(Number(c)), root(k * n, N))); pts.push(C(clean(s.re), clean(s.im))); }); return pts; }
  function dftFloat(a, N = a.length) { return Array.from({ length: N }, (_, k) => phasorPath(a, k, N).at(-1)); }
  /* Radix-2 FFT by the even/odd split A(x) = A_even(x²) + x A_odd(x²); counts complex multiplications. */
  function fft(a, stats = { mults: 0 }) {
    const N = a.length;
    if (N === 1) return [C(a[0].re ?? Number(a[0]), a[0].im ?? 0)];
    if (N % 2) throw new Error("FFT length must be a power of two");
    const even = fft(a.filter((_, i) => i % 2 === 0), stats), odd = fft(a.filter((_, i) => i % 2 === 1), stats), out = new Array(N);
    for (let k = 0; k < N / 2; k++) { const t = cmul(root(k, N), odd[k]); stats.mults++; out[k] = cadd(even[k], t); out[k + N / 2] = csub(even[k], t); }
    return out;
  }
  /* The even/odd split, exactly, at every N-th root: A(ω^k) = A_even(ω^{2k}) + ω^k A_odd(ω^{2k}). */
  function evenOddSplitHolds(a, N) {
    const ev = a.filter((_, i) => i % 2 === 0), od = a.filter((_, i) => i % 2 === 1);
    for (let k = 0; k < N; k++) {
      const lhs = evalAtRoot(a, k, N), rhs = zadd(evalAtRoot(ev, 2 * k, N), zmul(zeta(k, N), evalAtRoot(od, 2 * k, N), N));
      if (!zeq(lhs, rhs)) return false;
    }
    return true;
  }
  /* Polynomial product by evaluate → multiply pointwise → interpolate, with N ≥ deg + 1 so nothing wraps. */
  function multiplyByDFT(a, b) { let N = 1; while (N < a.length + b.length - 1) N *= 2; return cyclicByDFT(seriesFrom(a, N), seriesFrom(b, N), N).slice(0, a.length + b.length - 1); }

  /* ---------- asymptotics (floating point, with stated tolerances) ---------- */
  /* Lanczos Γ for real x > 0 (g = 7, n = 9): relative error below 1e-13 on the range used here. */
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function gamma(x) {
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
    x -= 1; let a = LANCZOS[0]; const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
  }
  /* [xⁿ](1 - x)^{-α} = α(α+1)…(α+n-1)/n!, exact for rational α. */
  function risingCoefficient(alpha, n) { let r = Q(1); for (let j = 0; j < n; j++) r = qmul(r, qdiv(qadd(toQ(alpha), Q(j)), Q(j + 1))); return r; }
  const singularityEstimate = (alpha, n) => Math.pow(n, qnum(alpha) - 1) / gamma(qnum(alpha));
  const catalanLogEstimate = (n) => n * Math.log(4) - 0.5 * Math.log(Math.PI) - 1.5 * Math.log(n);
  const fibonacciEstimate = (n) => Math.pow((1 + Math.sqrt(5)) / 2, n) / Math.sqrt(5);
  /* Ratio exact/estimate, computed through logs so huge coefficients never overflow. */
  const ratioToEstimate = (exactBig, logEstimate) => Math.exp(bigLog(exactBig) - logEstimate);
  /* Saddle point for eˣ: |e^z / z^{n+1}| on |z| = r is largest at z = r; the saddle is r = n + 1 (r = n to leading order). */
  const saddleEstimate = (n) => Math.exp(n - (n + 0.5) * Math.log(n) - 0.5 * Math.log(2 * Math.PI)); // eⁿ/(nⁿ√(2πn)) ≈ 1/n!
  const contourMagnitude = (n, r, theta) => Math.exp(r * Math.cos(theta) - (n + 1) * Math.log(r));

  /* ---------- a small TeX subset → HTML, so the page shows the same formulas the deck exports ---------- */
  const SYM = {
    alpha: "α", beta: "β", varepsilon: "ε", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ", theta: "θ", lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
    Gamma: "Γ", Delta: "Δ", Phi: "Φ", Psi: "Ψ", Omega: "Ω", Sigma: "Σ", Pi: "Π", ell: "ℓ", infty: "∞", partial: "∂",
    cdot: "·", cdots: "⋯", ldots: "…", dots: "…", vdots: "⋮", ddots: "⋱", times: "×", pm: "±", mp: "∓", circ: "∘", ast: "∗", star: "⋆", oplus: "⊕", otimes: "⊗", circledast: "⊛",
    le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", equiv: "≡", sim: "∼", approx: "≈", cong: "≅", propto: "∝",
    to: "→", mapsto: "↦", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftrightarrow: "⇔", downarrow: "↓", uparrow: "↑", longmapsto: "⟼",
    in: "∈", notin: "∉", subset: "⊂", subseteq: "⊆", cup: "∪", cap: "∩", emptyset: "∅", setminus: "∖", mid: "∣", forall: "∀", exists: "∃",
    sum: "∑", prod: "∏", int: "∫", oint: "∮", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉", langle: "⟨", rangle: "⟩", prime: "′", "{": "{", "}": "}", "|": "‖", "%": "%", "#": "#", "&": "&amp;",
    quad: " ", qquad: "  ", ",": " ", ";": " ", ":": " ", "!": "", " ": " ", lvert: "|", rvert: "|", vert: "|",
  };
  const FUNCS = new Set(["exp", "log", "ln", "sin", "cos", "det", "Re", "Im", "max", "min", "lim", "deg", "arg", "mod", "gcd"]);
  const REL = new Set(["le", "leq", "ge", "geq", "ne", "neq", "equiv", "sim", "approx", "cong", "propto", "to", "mapsto", "rightarrow", "leftarrow", "leftrightarrow", "Rightarrow", "Leftrightarrow", "longmapsto", "in", "notin", "subset", "subseteq", "times", "pm", "cdot", "circledast", "otimes", "oplus"]);
  const BIGOPS = new Set(["sum", "prod", "int", "oint"]);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const alpha = (c) => c !== undefined && /^[A-Za-z]$/.test(c);
  function texToHtml(src) {
    let i = 0;
    const s = String(src);
    const peek = () => s[i];
    function readGroup() {
      while (s[i] === " ") i++;
      if (s[i] === "{") { i++; const out = parseSeq("}"); i++; return out; }
      if (s[i] === "\\") return parseCommand();
      const ch = s[i++];
      return atom(ch);
    }
    function readRawGroup() {
      while (s[i] === " ") i++;
      if (s[i] !== "{") return s[i++];
      let depth = 0, start = ++i;
      for (; i < s.length; i++) { if (s[i] === "{") depth++; else if (s[i] === "}") { if (depth === 0) break; depth--; } }
      const t = s.slice(start, i); i++; return t;
    }
    function atom(ch) {
      if (ch === undefined) return "";
      if (alpha(ch)) return `<i>${ch}</i>`;
      if (ch === "-") return " − ";
      if (ch === "*") return "∗";
      if (ch === "'") return "′";
      if (ch === "~") return " ";
      if (/[=<>+]/.test(ch)) return ` ${esc(ch)} `;
      return esc(ch);
    }
    function scripts(base) {
      let out = base;
      for (;;) {
        while (s[i] === " " && (s[i + 1] === "^" || s[i + 1] === "_")) i++;
        if (s[i] === "^") { i++; out += `<sup>${readGroup()}</sup>`; }
        else if (s[i] === "_") { i++; out += `<sub>${readGroup()}</sub>`; }
        else return out;
      }
    }
    function parseEnv(name) {
      const body = []; let row = [], cell = "";
      for (;;) {
        if (i >= s.length) break;
        if (s.startsWith("\\end{", i)) { i = s.indexOf("}", i) + 1; break; }
        if (s.startsWith("\\\\", i)) { i += 2; row.push(cell); body.push(row); row = []; cell = ""; continue; }
        if (s[i] === "&") { i++; row.push(cell); cell = ""; continue; }
        cell += parseOne();
      }
      if (cell.trim() || row.length) { row.push(cell); body.push(row); }
      const cols = Math.max(...body.map((r) => r.length));
      const grid = `<span class="mx" style="--cols:${cols}">${body.map((r) => Array.from({ length: cols }, (_, c) => `<span class="mc">${r[c] ?? ""}</span>`).join("")).join("")}</span>`;
      if (name === "cases") return `<span class="cases"><span class="brace">{</span>${grid.replace('class="mx"', 'class="mx mx-left"')}</span>`;
      if (name === "bmatrix") return `<span class="mat"><span class="bk">[</span>${grid}<span class="bk">]</span></span>`;
      if (name === "pmatrix") return `<span class="mat"><span class="bk">(</span>${grid}<span class="bk">)</span></span>`;
      return grid;
    }
    function parseCommand() {
      i++;
      let name = "";
      if (alpha(s[i])) while (alpha(s[i])) name += s[i++];
      else name = s[i++];
      switch (name) {
        case "frac": case "dfrac": case "tfrac": { const a = readGroup(), b = readGroup(); return `<span class="fr"><span class="nu">${a}</span><span class="de">${b}</span></span>`; }
        case "binom": { const a = readGroup(), b = readGroup(); return `<span class="bn">(<span class="fr fr-nobar"><span class="nu">${a}</span><span class="de">${b}</span></span>)</span>`; }
        case "sqrt": { const a = readGroup(); return `<span class="sq">√<span class="sqa">${a}</span></span>`; }
        case "text": case "mathrm": case "operatorname": case "textrm": return `<span class="tx">${esc(readRawGroup())}</span>`;
        case "mathbb": { const t = readRawGroup(); return ({ C: "ℂ", Z: "ℤ", N: "ℕ", Q: "ℚ", R: "ℝ" })[t] || esc(t); }
        case "mathcal": return `<span class="cal">${esc(readRawGroup())}</span>`;
        case "hat": return `<span class="acc">${readGroup()}<span class="ac">̂</span></span>`;
        case "bar": case "overline": return `<span class="ovl">${readGroup()}</span>`;
        case "tilde": return `${readGroup()}̃`;
        case "left": case "right": case "big": case "Big": case "bigl": case "bigr": case "Bigl": case "Bigr": {
          while (s[i] === " ") i++;
          if (s[i] === ".") { i++; return ""; }
          if (s[i] === "\\") return parseCommand();
          return esc(s[i++]);
        }
        case "bmod": return " mod ";
        case "pmod": return ` (mod ${readGroup()})`;
        case "begin": return parseEnv(readRawGroup());
        case "displaystyle": case "limits": case "nolimits": return "";
        default:
          if (FUNCS.has(name)) return `<span class="fn">${name}</span>`;
          if (BIGOPS.has(name)) return `<span class="op">${SYM[name]}</span>`;
          if (REL.has(name)) return ` ${SYM[name]} `;
          if (name in SYM) return SYM[name];
          throw new Error(`texToHtml: unsupported command \\${name}`);
      }
    }
    function parseOne() {
      const ch = peek();
      if (ch === "{") { i++; const g = parseSeq("}"); i++; return scripts(g); }
      if (ch === "\\") return scripts(parseCommand());
      if (ch === "^" || ch === "_") return scripts("");
      i++;
      if (ch === " " || ch === "\n") return "";
      return scripts(atom(ch));
    }
    function parseSeq(end) { let out = ""; while (i < s.length && s[i] !== end) out += parseOne(); if (end && s[i] !== end) throw new Error(`texToHtml: missing ${end} in ${s}`); return out; }
    /* Binary spacing, except where a sign is unary: at the start, or after an opening bracket, a script or an operator. */
    return parseSeq(undefined).replace(/ {2,}/g, " ").replace(/(^|[(\[{]|<sup>|<sub>|<span class="(?:nu|de|sqa|mc)">) ([−+±]) /g, "$1$2").replace(/([,=≤≥≡→↦∼≈≅]) ([−+±]) /g, "$1 $2").replace(/ {2,}/g, " ").trim();
  }

  /* ---------- formatting helpers shared by the page and the decks ---------- */
  const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  const SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };
  const sup = (n) => String(n).split("").map((c) => SUP[c] ?? c).join("");
  const subs = (n) => String(n).split("").map((c) => SUB[c] ?? c).join("");
  /* A truncated series as plain Unicode text: "1 + x + 2x² + …". */
  function seriesText(a, { variable = "x", terms = 8, egf = false } = {}) {
    const parts = [];
    for (let n = 0; n < a.length && parts.length < terms; n++) {
      const c = toQ(a[n]); if (c.n === 0n) continue;
      const neg = c.n < 0n, mag = qstr(Q(babs(c.n), c.d));
      const mono = n === 0 ? "" : n === 1 ? variable : variable + sup(n);
      let coef = n > 0 && mag === "1" ? "" : mag;
      if (c.d !== 1n && n > 0) coef = `(${mag})`;
      let term = coef + mono;
      if (egf && n > 1) term = `${coef}${mono}/${n}!`;
      if (egf && n === 0) term = mag;
      parts.push({ neg, term: term || "1" });
    }
    if (!parts.length) return "0";
    return parts.map((p, i) => (i === 0 ? (p.neg ? "−" : "") + p.term : `${p.neg ? " − " : " + "}${p.term}`)).join("") + " + ⋯";
  }
  /* Float formatting with a true minus and a fixed number of significant digits. */
  function fmtNum(x, digits = 4) {
    if (!Number.isFinite(x)) return String(x);
    if (Math.abs(x) < 1e-12) return "0";
    const a = Math.abs(x);
    let t = a >= 1e6 || a < 1e-4 ? a.toExponential(digits - 1).replace(/e\+?(-?)(\d+)/, (_, s, e) => `×10${sup(s + e)}`) : String(Number(a.toPrecision(digits)));
    return (x < 0 ? "−" : "") + t;
  }
  const fmtComplex = (z, d = 4) => { const re = clean(z.re), im = clean(z.im); if (im === 0) return fmtNum(re, d); const ims = Math.abs(im) === 1 ? "i" : `${fmtNum(Math.abs(im), d)}i`; if (re === 0) return (im < 0 ? "−" : "") + ims; return `${fmtNum(re, d)} ${im < 0 ? "−" : "+"} ${ims}`; };

  return {
    B, bgcd, factorial, binom, Q, toQ, isQ, qadd, qsub, qmul, qdiv, qeq, qIsZero, qnum, qstr, bigLog, bigRatio, fmtInt, toBig,
    zeros, seriesFrom, trunc, add, sub, scale, shift, derivative, xDerivative, integral, mul, inverse, rational, sequenceOf, power, compose, evalAt,
    qseries, qmulSeries, qexp, egfFromCounts, countsFromEgf, binomialConvolution,
    fibonacciGF, fibonacciDP, binet, PHI, PSI, s5pow,
    coinChangeGF, coinSolutions, compositionsGF, compositionsList, compositionsCount,
    NO11, transferCounts, no11GF, no11Strings, catalanGF, catalanClosed, balancedParens, binaryTrees,
    lagrange, implicitSeries, rootedLabelledTrees,
    permutations, cyclesOf, stirling1, cyclesBGF, stirling1Enumerated, permutationsByExpFormula, bellByExpFormula, setPartitions,
    arrangementsGF, arrangementsEnumerated, arrangementsList, dicePGF, diceEnumerated, pgfMean,
    partitionsGF, partitionsList, evenGF, oddGF, notMultipleOf3GF, compositionsAllGF, latticeGrid, centralBinomials,
    cyclotomic, zreduce, zeta, zadd, zmul, zeq, zIsInt, evalAtRoot, dftExact, idftExact, cyclicConvolution, cyclicByDFT, rootsFilterExact, residueSum,
    zToComplex, zExactString, C, cadd, csub, cmul, cabs, root, phasorPath, dftFloat, fft, evenOddSplitHolds, multiplyByDFT,
    gamma, risingCoefficient, singularityEstimate, catalanLogEstimate, fibonacciEstimate, ratioToEstimate, saddleEstimate, contourMagnitude,
    texToHtml, esc, sup, subs, seriesText, fmtNum, fmtComplex,
  };
});
