/* Probabilistic Method Atlas — pure engine, part 1: numbers, randomness and graphs.
 *
 * Everything here is deterministic: every random draw comes from a seeded stream, so the same seed
 * and parameters always give the same graph, colouring, sample and witness. No DOM, clock or network.
 */
/** @typedef {[number, number]} Edge an edge {i, j} with i < j */
/** @typedef {{ n: number, adj: Uint8Array, edges: Edge[] }} Graph a simple graph on 0..n-1 with its adjacency matrix */
/**
 * A seeded stream: rng() is uniform on [0, 1), with helpers for integers, bits, picks, shuffles and Poisson draws.
 * @typedef {(() => number) & { int(n: number): number, bit(p?: number): number, pick<T>(arr: ArrayLike<T>): T, shuffle<T>(arr: T[]): T[], poisson(lam: number): number }} Rng
 */
/** The engine's public object, filled in by each part (see PMApi in part 7). */
const PM = /** @type {PMApi} */ ({});

/* ---------- formatting ---------- */

const MINUS = "−";
/* The three number writers below (page, LaTeX, speech) share one shape: integers below 10⁹ stay whole, magnitudes
 * below `small` or from 10⁹ up go to scientific notation, and the rest keep `sig` significant figures. */
const wholeNumber = (/** @type {number} */ x) => Number.isInteger(x) && Math.abs(x) < 1e9;
const scientific = (/** @type {number} */ a, /** @type {number} */ small) => a !== 0 && (a < small || a >= 1e9);
/* |x| in scientific notation: the trimmed mantissa and the exponent. */
/** @param {number} a @param {number} sig @returns {[string, number]} */
function mantissaExponent(a, sig) { const [m, e] = a.toExponential(sig - 1).split("e"); return [trimZeros(m), Number(e)]; }
/* |x| to sig significant figures, never in exponent form, trailing zeros dropped. */
/** @param {number} a @param {number} sig */
function significant(a, sig) { const s = a.toPrecision(sig); return trimZeros(s.includes("e") ? String(Number(s)) : s); }
/* Significant-figure formatting with a true minus sign; integers stay integers. */
/** @param {number | null | undefined} x */
function fmt(x, sig = 4) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  if (x === Infinity) return "∞";
  if (x === -Infinity) return MINUS + "∞";
  const sign = x < 0 ? MINUS : "", a = Math.abs(x);
  if (wholeNumber(x)) return sign + String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (scientific(a, 1e-4)) { const [m, e] = mantissaExponent(a, sig); return sign + m + "×10" + superscript(e); }
  return sign + significant(a, sig);
}
/** @param {string} s */
function trimZeros(s) { return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s; }
/** @type {Record<string, string>} */
const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
/** @param {number | string} n */
function superscript(n) { return String(n).split("").map((c) => SUP[c] ?? c).join(""); }
/* Plain ASCII-ish number for Markdown and LaTeX: 1.234e-5 becomes 1.234 \times 10^{-5}. */
/** @param {number} x */
function tex(x, sig = 4) {
  if (x === Infinity) return "\\infty";
  if (x === -Infinity) return "-\\infty";
  if (wholeNumber(x)) return String(x);
  const sign = x < 0 ? "-" : "", a = Math.abs(x);
  if (scientific(a, 1e-4)) { const [m, e] = mantissaExponent(a, sig); return sign + m + " \\times 10^{" + e + "}"; }
  return sign + significant(a, sig);
}
/* A number as it is read aloud: no symbols, so it can go into ::: narration. */
/** @param {number} x */
function spokenNumber(x, sig = 3) {
  const sign = x < 0 ? "minus " : "", a = Math.abs(x);
  if (a === Infinity) return sign + "infinity";
  if (wholeNumber(x)) return sign + String(a);
  if (scientific(a, 1e-3)) { const [m, e] = mantissaExponent(a, sig); return sign + m + " times ten to the " + (e < 0 ? "minus " : "") + Math.abs(e); }
  return sign + significant(a, sig);
}
const pct = (/** @type {number} */ x, sig = 3) => fmt(100 * x, sig) + "%";

/* ---------- seeded randomness ---------- */

/* 32-bit FNV-1a of a string, used to split one seed into independent named streams. */
/** @param {string} str */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/* mulberry32: a small, fast, well-mixed 32-bit generator. rng() is uniform on [0, 1). */
/** @param {number} a @returns {() => number} */
function mulberry32(a) {
  a >>>= 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* A named stream: rng(seed, "graph") and rng(seed, "colouring") never share draws. */
/** @param {number} seed @returns {Rng} */
function rng(seed, stream = "") {
  // The helpers are attached just below.
  const r = /** @type {Rng} */ (mulberry32((hash32(stream) ^ Math.imul((seed >>> 0) || 0, 0x9e3779b1)) >>> 0));
  r.int = (n) => Math.floor(r() * n);
  r.bit = (p = 0.5) => (r() < p ? 1 : 0);
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  r.poisson = (lam) => { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 1000); return k - 1; };
  return r;
}

/* ---------- combinatorics ---------- */

/* Binomial coefficient C(n, k) as a float (exact for every integer result below 2^53). */
/** @param {number} n @param {number} k */
function choose(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || n < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r) === r || r > 2 ** 53 ? Math.round(r) : r;
}
/** @param {number} n @param {number} k */
function logChoose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}
/** @type {number[]} */
const LF = [0];
/** @param {number} n */
function logFactorial(n) {
  for (let i = LF.length; i <= n; i++) LF[i] = LF[i - 1] + Math.log(i);
  return LF[n];
}
/** @param {number} n */
function factorial(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
/* All k-subsets of {0..n-1} in lexicographic order. */
/** @param {number} n @param {number} k */
function subsets(n, k) {
  /** @type {number[][]} */
  const out = [];
  /** @type {number[]} */
  const cur = [];
  (function rec(/** @type {number} */ start) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i <= n - (k - cur.length); i++) { cur.push(i); rec(i + 1); cur.pop(); }
  })(0);
  return out;
}

/* ---------- distributions ---------- */

/** @param {number} n @param {number} k @param {number} p */
function binomPmf(n, k, p) {
  if (k < 0 || k > n) return 0;
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
}
/* P(X >= k) for X ~ Bin(n, p), summed exactly term by term. */
/** @param {number} n @param {number} k @param {number} p */
function binomUpperTail(n, k, p) {
  k = Math.max(0, Math.ceil(k - 1e-12));
  let s = 0;
  for (let i = k; i <= n; i++) s += binomPmf(n, i, p);
  return Math.min(1, s);
}
/** @param {number} lam @param {number} k */
function poissonPmf(lam, k) {
  if (k < 0) return 0;
  if (lam === 0) return k === 0 ? 1 : 0;
  return Math.exp(-lam + k * Math.log(lam) - logFactorial(k));
}
/** @param {number} lam @param {number} k */
function poissonCdf(lam, k) { let s = 0; for (let i = 0; i <= k; i++) s += poissonPmf(lam, i); return Math.min(1, s); }
/* Chernoff upper tail for a sum of independent [0,1] variables with mean mu:
 * P(X >= (1+d) mu) <= (e^d / (1+d)^(1+d))^mu, and the simpler exp(-d^2 mu / (2+d)), both for d > 0. */
/** @param {number} mu @param {number} d */
function chernoffUpper(mu, d) { return d <= 0 ? 1 : Math.min(1, Math.exp(mu * (d - (1 + d) * Math.log1p(d)))); }
/** @param {number} mu @param {number} d */
function chernoffSimple(mu, d) { return d <= 0 ? 1 : Math.min(1, Math.exp((-d * d * mu) / (2 + d))); }
/* Lower tail, 0 < d < 1: P(X <= (1-d) mu) <= exp(-d^2 mu / 2). */
/** @param {number} mu @param {number} d */
function chernoffLower(mu, d) { return d <= 0 ? 1 : Math.min(1, Math.exp((-d * d * mu) / 2)); }
/** @param {number} x */
function binaryEntropy(x) { return x <= 0 || x >= 1 ? 0 : -x * Math.log2(x) - (1 - x) * Math.log2(1 - x); }
/** @param {Iterable<number>} probs */
function entropy(probs) { let h = 0; for (const p of probs) if (p > 0) h -= p * Math.log2(p); return h; }
/* Standard normal upper tail, Abramowitz–Stegun 7.1.26 (error below 1.5e-7); used only for labelled heuristics. */
/** @param {number} z */
function normalUpper(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 - y) / 2 : (1 + y) / 2;
}

/* ---------- graphs ---------- */

/* G(n, p): each of the C(n,2) pairs, in lexicographic order, is an edge with probability p. */
/** @param {number} n @param {number} p @param {() => number} r @returns {Graph} */
function gnp(n, p, r) {
  const adj = new Uint8Array(n * n);
  /** @type {Edge[]} */
  const edges = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (r() < p) { adj[i * n + j] = adj[j * n + i] = 1; edges.push([i, j]); }
  return { n, adj, edges };
}
/** @param {number} n @param {readonly (readonly number[])[]} edges pairs, in either order @returns {Graph} */
function graphFromEdges(n, edges) {
  const adj = new Uint8Array(n * n);
  for (const [i, j] of edges) adj[i * n + j] = adj[j * n + i] = 1;
  return { n, adj, edges: edges.map((e) => /** @type {Edge} */ ([Math.min(...e), Math.max(...e)])).sort((a, b) => a[0] - b[0] || a[1] - b[1]) };
}
/** @param {{ n: number, edges: readonly (readonly number[])[] }} g @returns {number[]} */
function degrees(g) { const d = new Array(g.n).fill(0); for (const [i, j] of g.edges) { d[i]++; d[j]++; } return d; }
/* Expected number of copies of a fixed graph H (v vertices, e edges, automorphism group of size aut) in G(n, p). */
/** @param {number} n @param {number} p @param {number} v @param {number} e @param {number} aut */
function expectedCopies(n, p, v, e, aut) { return (choose(n, v) * factorial(v) / aut) * p ** e; }
/* Number of k-sets that are cliques in g (k-cliques), by enumeration; for teaching sizes only. */
/** @param {Graph} g @param {number} k */
function countCliques(g, k) {
  const { n, adj } = g; let c = 0;
  /** @type {number[]} */
  const cur = [];
  (function rec(/** @type {number} */ start) {
    if (cur.length === k) { c++; return; }
    for (let v = start; v < n; v++) {
      if (cur.every((u) => adj[u * n + v])) { cur.push(v); rec(v + 1); cur.pop(); }
    }
  })(0);
  return c;
}
/** @param {Graph} g */
function countTriangles(g) {
  const { n, adj } = g; let c = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (adj[i * n + j]) for (let k = j + 1; k < n; k++) if (adj[i * n + k] && adj[j * n + k]) c++;
  return c;
}
/* Connected components with union–find; returns sizes (descending) and the component label of each vertex. */
/** @param {number} n @param {readonly (readonly number[])[]} edges @returns {{ label: number[], sizes: number[] }} */
function components(n, edges) {
  const parent = Array.from({ length: n }, (_, i) => i), size = new Array(n).fill(1);
  const find = (/** @type {number} */ x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const [a, b] of edges) {
    let x = find(a), y = find(b);
    if (x === y) continue;
    if (size[x] < size[y]) [x, y] = [y, x];
    parent[y] = x; size[x] += size[y];
  }
  /** @type {number[]} */
  const label = new Array(n);
  /** @type {Map<number, number>} */
  const bySize = new Map();
  for (let i = 0; i < n; i++) { label[i] = find(i); bySize.set(label[i], size[label[i]]); }
  return { label, sizes: [...bySize.values()].sort((a, b) => b - a) };
}

/* ---------- set systems and dependency ---------- */

/* m × n 0/1 incidence matrix of sets (arrays of element indices) over n elements. */
/** @param {readonly (readonly number[])[]} sets @param {number} n @returns {number[][]} */
function incidenceMatrix(sets, n) { return sets.map((s) => { const row = new Array(n).fill(0); for (const x of s) row[x] = 1; return row; }); }
/* Dependency graph of events given by the variables each one reads: events i ≠ j are adjacent when they share a variable.
 * Each event is mutually independent of the events it does not touch, so this is a valid dependency graph. */
/** @param {readonly Iterable<unknown>[]} supports the variables each event reads @returns {number[][]} */
function dependencyGraph(supports) {
  /** @type {Map<unknown, number[]>} */
  const byVar = new Map();
  supports.forEach((s, i) => { for (const v of s) { if (!byVar.has(v)) byVar.set(v, []); /** @type {number[]} */ (byVar.get(v)).push(i); } });
  const nbrs = supports.map(() => /** @type {Set<number>} */ (new Set()));
  for (const evs of byVar.values()) for (const a of evs) for (const b of evs) if (a !== b) nbrs[a].add(b);
  return nbrs.map((s) => [...s].sort((a, b) => a - b));
}
/** @param {readonly Iterable<unknown>[]} supports */
function dependencyDegrees(supports) { return dependencyGraph(supports).map((s) => s.length); }

const CORE_API = {
  fmt, tex, pct, spokenNumber, superscript, hash32, mulberry32, rng, choose, logChoose, logFactorial, factorial, subsets,
  binomPmf, binomUpperTail, poissonPmf, poissonCdf, chernoffUpper, chernoffSimple, chernoffLower, binaryEntropy, entropy, normalUpper,
  gnp, graphFromEdges, degrees, expectedCopies, countCliques, countTriangles, components, incidenceMatrix, dependencyGraph, dependencyDegrees,
};
Object.assign(PM, CORE_API);

