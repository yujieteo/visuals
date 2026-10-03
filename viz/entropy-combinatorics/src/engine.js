/* Entropy Methods in Combinatorics Lab: the pure engine.
 *
 * Every number the page shows comes from here. Counts are exact integers (BigInt); a distribution is
 * kept as integer weights (its rational probabilities are weight / total) and only the logarithms are
 * floating point. Entropies are in bits; `inUnit` converts for display, and every counting bound is
 * produced by exponentiating in the same base, so it does not depend on the unit (spec §65).
 * No DOM, storage, clock, randomness or network: Node loads it with vm and the page with a <script>.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EntropyLab = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- logarithms, units and formatting ---------- */
  const LN2 = Math.LN2;
  const log2 = (x) => Math.log2(x);
  /* log2 of a positive BigInt without overflowing a double. */
  function log2Big(b) {
    b = BigInt(b);
    if (b <= 0n) throw new RangeError("log2Big needs a positive integer");
    const s = b.toString(2);
    if (s.length <= 52) return Math.log2(Number(b));
    return s.length - 52 + Math.log2(Number(BigInt("0b" + s.slice(0, 52))));
  }
  const UNITS = { bits: { label: "bits", base: 2, perBit: 1 }, nats: { label: "nats", base: Math.E, perBit: LN2 } };
  /* An entropy given in bits, expressed in the chosen unit. */
  const inUnit = (bits, unit = "bits") => bits * UNITS[unit].perBit;
  /* A counting bound from an entropy expressed in `unit`: base^value. Same count in every unit. */
  const countFrom = (value, unit = "bits") => Math.pow(UNITS[unit].base, value);

  const MINUS = "−";
  function fmt(x, digits = 3) {
    if (typeof x === "bigint") return fmtCount(x);
    if (!Number.isFinite(x)) return x > 0 ? "∞" : String(x);
    if (Math.abs(x) < 1e-12) return "0";
    let s;
    if (Math.abs(x) >= 1e7) s = x.toExponential(digits - 1).replace("e+", "×10^");
    else s = String(Number(x.toFixed(digits)));
    return s.replace("-", MINUS);
  }
  /* Fixed decimals, for tables that line up. */
  const fixed = (x, d = 2) => (Math.abs(x) < 5 * 10 ** -(d + 1) ? (0).toFixed(d) : x.toFixed(d)).replace("-", MINUS);
  function fmtCount(b) {
    const s = BigInt(b).toString();
    return s.length <= 4 ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /* ---------- exact counting ---------- */
  const FACT = [1n];
  function factorial(n) {
    if (!Number.isInteger(n) || n < 0) throw new RangeError("factorial needs a non-negative integer");
    while (FACT.length <= n) FACT.push(FACT[FACT.length - 1] * BigInt(FACT.length));
    return FACT[n];
  }
  function binom(n, k) {
    if (!Number.isInteger(n) || !Number.isInteger(k)) throw new RangeError("binom needs integers");
    if (k < 0 || k > n) return 0n;
    k = Math.min(k, n - k);
    let r = 1n;
    for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i);
    return r;
  }
  function multinomial(parts) {
    const n = parts.reduce((a, b) => a + b, 0);
    return parts.reduce((acc, p) => acc / factorial(p), factorial(n));
  }
  const bigPow = (b, e) => { let r = 1n; for (let i = 0; i < e; i++) r *= BigInt(b); return r; };
  const bigProd = (xs) => xs.reduce((a, b) => a * BigInt(b), 1n);

  /* ---------- entropy of integer-weighted distributions ---------- */
  /* H of the distribution weight_i / total, in bits. Weights are non-negative numbers (normally integers). */
  function entropyCounts(weights) {
    const w = [...weights].filter((x) => x > 0);
    const N = w.reduce((a, b) => a + b, 0);
    if (N <= 0) return 0;
    let s = 0;
    for (const c of w) s += c * log2(c);
    const H = log2(N) - s / N;
    return H < 1e-12 ? 0 : H;
  }
  const entropyProbs = (ps) => ps.reduce((s, p) => (p > 0 ? s - p * log2(p) : s), 0);
  /* Binary entropy h(p). */
  const h = (p) => (p <= 0 || p >= 1 ? 0 : -p * log2(p) - (1 - p) * log2(1 - p));
  /* KL divergence D(P||Q) in bits for weight vectors; Infinity when P puts mass where Q has none. */
  function kl(P, Q) {
    const sp = P.reduce((a, b) => a + b, 0), sq = Q.reduce((a, b) => a + b, 0);
    let d = 0;
    for (let i = 0; i < P.length; i++) {
      if (P[i] <= 0) continue;
      if (!(Q[i] > 0)) return Infinity;
      d += (P[i] / sp) * log2((P[i] / sp) / (Q[i] / sq));
    }
    return Math.max(0, d);
  }

  /* ---------- a two-way table of weights ---------- */
  function jointStats(table) {
    const rows = table.map((r) => r.reduce((a, b) => a + b, 0));
    const cols = table[0].map((_, j) => table.reduce((a, r) => a + r[j], 0));
    const HX = entropyCounts(rows), HY = entropyCounts(cols), HXY = entropyCounts(table.flat());
    const occupied = table.flat().filter((x) => x > 0).length;
    return {
      HX, HY, HXY, HXgY: Math.max(0, HXY - HY), HYgX: Math.max(0, HXY - HX), I: Math.max(0, HX + HY - HXY),
      rows, cols, occupied, total: rows.reduce((a, b) => a + b, 0),
      supportX: rows.filter((x) => x > 0).length, supportY: cols.filter((x) => x > 0).length,
      independent: Math.abs(HX + HY - HXY) < 1e-9,
    };
  }

  /* ---------- a family of tuples, sampled uniformly ---------- */
  const keyOf = (t, coords) => coords.map((i) => t[i]).join(",");
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  function projectCounts(family, coords) {
    const m = new Map();
    for (const t of family) { const k = keyOf(t, coords); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  }
  /* Entropy of the projection X_A of a uniformly random member: H(X_A). */
  const Hproj = (family, coords) => (coords.length ? entropyCounts([...projectCounts(family, coords).values()]) : 0);
  const projSize = (family, coords) => (coords.length ? projectCounts(family, coords).size : 1);
  /* H(X_A | X_B) = H(X_{A∪B}) − H(X_B). */
  const Hcond = (family, A, B) => Math.max(0, Hproj(family, [...new Set([...B, ...A])].sort((a, b) => a - b)) - Hproj(family, B));
  const dims = (family) => (family.length ? family[0].length : 0);
  function supports(family) {
    return range(dims(family)).map((i) => [...new Set(family.map((t) => t[i]))].sort((a, b) => a - b));
  }
  function uniq(family) {
    const seen = new Set(), out = [];
    for (const t of family) { const k = t.join(","); if (!seen.has(k)) { seen.add(k); out.push(t.slice()); } }
    return out;
  }

  /* Reveal the coordinates of one member in `order`: the compatible set shrinks and each step costs
     H(X_i | earlier) on average. Returns the per-step trace for `obj` and the chain-rule ledger. */
  function chainRule(family, order, obj) {
    const N = family.length, steps = [];
    let known = [], compatible = family.slice();
    for (const i of order) {
      const before = compatible.length;
      const cond = Hcond(family, [i], known);
      if (obj) compatible = compatible.filter((t) => t[i] === obj[i]);
      known = [...known, i];
      steps.push({ coord: i, value: obj ? obj[i] : null, before, after: compatible.length,
        cond, marginal: Hproj(family, [i]), pointwise: obj ? log2(before / compatible.length) : null });
    }
    const total = steps.reduce((a, s) => a + s.cond, 0);
    return { N, H: log2(N), steps, total };
  }

  /* Subadditivity ledger for a family: H(X) = log|F| ≤ Σ H(X_i) ≤ Σ log|supp X_i|. */
  function subadditivity(family) {
    const F = uniq(family), n = dims(F), sup = supports(F);
    const H = F.length ? log2(F.length) : 0;
    const marg = range(n).map((i) => Hproj(F, [i]));
    const sumH = marg.reduce((a, b) => a + b, 0);
    const sumLog = sup.reduce((a, s) => a + log2(s.length), 0);
    return { size: BigInt(F.length), H, marg, sumH, sumLog, supportSizes: sup.map((s) => s.length),
      product: bigProd(sup.map((s) => s.length)), entropyCount: Math.pow(2, sumH) };
  }

  /* ---------- binomial and multinomial bounds ---------- */
  function binomialBound(n, k) {
    const exact = binom(n, k), p = n ? k / n : 0; /* n = 0: one empty set, bound 1 */
    const exponent = n * h(p), bound = Math.pow(2, exponent);
    const ek = k === 0 ? 1 : Math.pow((Math.E * n) / k, k);
    return { n, k, p, exact, log2Exact: exact > 0n ? log2Big(exact) : -Infinity, exponent, bound,
      ratio: exact > 0n ? bound / Number(exact) : Infinity, naive: bigPow(2, n), ek };
  }
  function multinomialBound(parts) {
    const n = parts.reduce((a, b) => a + b, 0), exact = multinomial(parts);
    const H = n ? entropyProbs(parts.map((x) => x / n)) : 0;
    const exponent = n * H, bound = Math.pow(2, exponent);
    return { parts: parts.slice(), n, exact, H, exponent, bound, log2Exact: log2Big(exact), ratio: bound / Number(exact),
      naive: bigPow(parts.length, n) };
  }

  /* ---------- set systems: indicator encoding ---------- */
  /* sets: arrays of elements of [0, n). Duplicates are dropped (a family is a set of sets). */
  function setSystem(sets, n) {
    const keys = [...new Set(sets.map((s) => [...new Set(s)].sort((a, b) => a - b).join(",")))];
    const fam = keys.map((k) => { const s = new Set(k ? k.split(",").map(Number) : []); return range(n).map((i) => (s.has(i) ? 1 : 0)); });
    const m = fam.length;
    const counts = range(n).map((i) => fam.reduce((a, t) => a + t[i], 0));
    const p = counts.map((c) => (m ? c / m : 0));
    const terms = p.map(h), sum = terms.reduce((a, b) => a + b, 0);
    return { size: BigInt(m), n, counts, p, terms, sum, bound: Math.pow(2, sum), log2Size: m ? log2(m) : -Infinity,
      H: m ? log2(m) : 0, family: fam, naive: bigPow(2, n) };
  }

  /* ---------- Shearer ---------- */
  /* cover: arrays of coordinates. Coverage of every coordinate, r = the least, and both forms of Shearer. */
  function shearer(family, cover, n = dims(family)) {
    const F = uniq(family);
    const cov = range(n).map((i) => cover.filter((A) => A.includes(i)).length);
    const r = n ? Math.min(...cov) : 0;
    const parts = cover.map((A) => { const C = [...new Set(A)].sort((a, b) => a - b); return { set: C, H: Hproj(F, C), size: projSize(F, C) }; });
    const H = F.length ? log2(F.length) : 0;
    const sumH = parts.reduce((a, p) => a + p.H, 0), sumLog = parts.reduce((a, p) => a + log2(p.size), 0);
    const lhs = bigPow(F.length, r), rhs = bigProd(parts.map((p) => p.size));
    return { size: BigInt(F.length), n, coverage: cov, r, parts, H, rH: r * H, sumH, sumLog,
      entropyHolds: r * H <= sumH + 1e-9, lhs, rhs, countHolds: lhs <= rhs, tight: r > 0 && lhs === rhs,
      bound: r > 0 ? Math.pow(2, sumH / r) : Infinity, countBound: r > 0 ? Math.pow(2, sumLog / r) : Infinity };
  }

  /* ---------- Loomis–Whitney ---------- */
  /* points: d-tuples. π_i deletes coordinate i; |S|^(d−1) ≤ Π |π_i S|. */
  function loomisWhitney(points, d = points.length ? points[0].length : 3) {
    const S = uniq(points), size = S.length;
    const proj = range(d).map((i) => { const keep = range(d).filter((j) => j !== i); return { deleted: i, keep, size: projSize(S, keep), H: Hproj(S, keep) }; });
    const lhs = bigPow(size, d - 1), rhs = bigProd(proj.map((p) => p.size));
    const H = size ? log2(size) : 0, sumH = proj.reduce((a, p) => a + p.H, 0);
    return { size, d, proj, lhs, rhs, holds: lhs <= rhs, tight: lhs === rhs,
      bound: size ? Math.pow(Number(rhs), 1 / (d - 1)) : 0, H, lhsH: (d - 1) * H, sumH,
      sumLog: proj.reduce((a, p) => a + log2(p.size), 0) };
  }

  /* ---------- fractional covers ---------- */
  /* weights: [{ set: [coords], w }]. Valid when every coordinate's total weight is at least 1. */
  function fractionalCover(family, weights, n = dims(family)) {
    const F = uniq(family);
    const cov = range(n).map((i) => weights.reduce((a, e) => a + (e.set.includes(i) ? e.w : 0), 0));
    const valid = cov.every((c) => c >= 1 - 1e-9);
    const parts = weights.map((e) => ({ set: e.set, w: e.w, H: Hproj(F, e.set), size: projSize(F, e.set) }));
    const entropyBound = parts.reduce((a, p) => a + p.w * p.H, 0);
    const logBound = parts.reduce((a, p) => a + p.w * log2(p.size), 0);
    return { size: BigInt(F.length), H: F.length ? log2(F.length) : 0, coverage: cov, valid, parts,
      entropyBound, logBound, countBound: Math.pow(2, logBound), slack: logBound - (F.length ? log2(F.length) : 0) };
  }
  /* The best valid cover among candidates (by Σ α log |F_A|). */
  function bestCover(family, candidates, n = dims(family)) {
    const scored = candidates.map((c) => ({ ...c, result: fractionalCover(family, c.weights, n) }));
    const valid = scored.filter((c) => c.result.valid);
    valid.sort((a, b) => a.result.logBound - b.result.logBound);
    return { scored, best: valid[0] || null };
  }

  /* ---------- Han-type averages ---------- */
  function subsetsOfSize(n, k) {
    const out = [], rec = (start, acc) => {
      if (acc.length === k) { out.push(acc.slice()); return; }
      for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
    };
    rec(0, []);
    return out;
  }
  /* For each k, the average of H(X_A)/k over the k-subsets A: non-increasing in k (Han). */
  function han(family, n = dims(family)) {
    const F = uniq(family);
    return range(n).map((j) => {
      const k = j + 1, subs = subsetsOfSize(n, k);
      const vals = subs.map((A) => ({ set: A, H: Hproj(F, A) }));
      const avg = vals.reduce((a, v) => a + v.H, 0) / subs.length;
      return { k, subsets: vals, average: avg, perCoord: avg / k };
    });
  }

  /* ---------- bipartite matchings ---------- */
  /* adj[i] lists the right vertices adjacent to left vertex i (square, n × n). */
  function degrees(adj) { return adj.map((r) => r.length); }
  function perfectMatchings(adj) {
    const n = adj.length, out = [], used = new Array(n).fill(false), cur = [];
    const rec = (i) => {
      if (i === n) { out.push(cur.slice()); return; }
      for (const j of adj[i]) if (!used[j]) { used[j] = true; cur.push(j); rec(i + 1); cur.pop(); used[j] = false; }
    };
    rec(0);
    return out;
  }
  /* The permanent of the 0-1 matrix, exactly, by dynamic programming over subsets of right vertices. */
  function permanent(adj) {
    const n = adj.length, dp = new Map([[0, 1n]]);
    for (let i = 0; i < n; i++) {
      const next = new Map();
      for (const [mask, c] of dp) for (const j of adj[i]) if (!(mask & (1 << j))) {
        const m = mask | (1 << j); next.set(m, (next.get(m) || 0n) + c);
      }
      dp.clear(); for (const [k, v] of next) dp.set(k, v);
    }
    return dp.get((1 << n) - 1) || 0n;
  }
  /* Bregman: per(A) ≤ Π (d_i!)^(1/d_i). Per-row factors and their log contributions log(d!)/d. */
  function bregman(adj) {
    const d = degrees(adj), M = permanent(adj);
    const rows = d.map((di) => ({ d: di, factor: di ? Math.pow(Number(factorial(di)), 1 / di) : 0, bits: di ? log2Big(factorial(di)) / di : -Infinity }));
    const bits = rows.reduce((a, r) => a + r.bits, 0);
    const bound = Math.pow(2, bits);
    const naive = bigProd(d);
    return { degrees: d, permanent: M, rows, bits, bound, H: M > 0n ? log2Big(M) : -Infinity, naive,
      tight: M > 0n && Math.abs(bound - Number(M)) < 1e-9 * Math.max(1, bound), ratio: M > 0n ? bound / Number(M) : Infinity };
  }
  /* Every permutation of 0..n−1 in lexicographic order: the fixed, deterministic list of reveal orders. */
  function permutations(n) {
    const out = [], cur = [], used = new Array(n).fill(false);
    const rec = () => {
      if (cur.length === n) { out.push(cur.slice()); return; }
      for (let i = 0; i < n; i++) if (!used[i]) { used[i] = true; cur.push(i); rec(); cur.pop(); used[i] = false; }
    };
    rec();
    return out;
  }
  /* One proof trajectory: reveal the left vertices of `matching` in `order`. N_i counts the neighbours
     of i not yet taken by earlier vertices (its own partner always among them). */
  function revealTrajectory(adj, matching, order) {
    const taken = new Set(), steps = [];
    for (const i of order) {
      const available = adj[i].filter((j) => !taken.has(j));
      const gone = adj[i].filter((j) => taken.has(j));
      steps.push({ vertex: i, partner: matching[i], available, gone, N: available.length, bits: log2(available.length), degree: adj[i].length });
      taken.add(matching[i]);
    }
    return { steps, bits: steps.reduce((a, s) => a + s.bits, 0) };
  }
  /* Over every matching and every reveal order: for a fixed matching, N_i is uniform on {1..d_i};
     the average of log N_i is log(d_i!)/d_i; and the total is the Bregman exponent. */
  function revealAverages(adj) {
    const n = adj.length, Ms = perfectMatchings(adj), orders = permutations(n);
    const rows = range(n).map((i) => ({ vertex: i, d: adj[i].length, hist: new Array(adj[i].length + 1).fill(0), avgBits: 0 }));
    let uniformEveryMatching = true;
    for (const M of Ms) {
      const per = range(n).map((i) => new Array(adj[i].length + 1).fill(0));
      for (const o of orders) for (const s of revealTrajectory(adj, M, o).steps) { per[s.vertex][s.N]++; rows[s.vertex].hist[s.N]++; }
      for (let i = 0; i < n; i++) {
        const d = adj[i].length, each = orders.length / d;
        for (let v = 1; v <= d; v++) if (per[i][v] !== each) uniformEveryMatching = false;
        if (per[i][0]) uniformEveryMatching = false;
      }
    }
    const runs = Ms.length * orders.length;
    for (const r of rows) r.avgBits = runs ? r.hist.reduce((a, c, v) => a + (v ? c * log2(v) : 0), 0) / runs : 0;
    return { matchings: Ms.length, orders: orders.length, rows, uniformEveryMatching,
      totalBits: rows.reduce((a, r) => a + r.avgBits, 0) };
  }
  /* (1/d) Σ_{k=1..d} log k = log(d!)/d. */
  function averagingIdentity(d) {
    const terms = range(d).map((i) => log2(i + 1));
    const avg = terms.reduce((a, b) => a + b, 0) / d;
    return { d, terms, average: avg, logFactOverD: log2Big(factorial(d)) / d, factor: Math.pow(Number(factorial(d)), 1 / d) };
  }

  /* ---------- graph colourings: global family, local variables ---------- */
  function colourings(n, q, cycle) {
    const out = [], cur = [];
    const rec = (i) => {
      if (i === n) { if (!cycle || n < 2 || cur[n - 1] !== cur[0]) out.push(cur.slice()); return; }
      for (let c = 0; c < q; c++) if (i === 0 || cur[i - 1] !== c) { cur.push(c); rec(i + 1); cur.pop(); }
    };
    rec(0);
    return out;
  }
  const pathColourCount = (n, q) => (n === 0 ? 1n : BigInt(q) * bigPow(q - 1, n - 1));
  const cycleColourCount = (n, q) => bigPow(q - 1, n) + (n % 2 ? -1n : 1n) * BigInt(q - 1);

  /* ---------- the Boolean cube: edges inside a set ---------- */
  /* A: vertices of {0,1}^n as integers. Edges inside A ≤ ½ |A| log2 |A| (the entropy proof is exact). */
  function cubeEdges(A, n) {
    const S = new Set(A), edges = [];
    for (const v of S) for (let b = 0; b < n; b++) { const u = v ^ (1 << b); if (u > v && S.has(u)) edges.push([v, u, b]); }
    const size = S.size, bound = size ? (size * log2(size)) / 2 : 0;
    const pts = [...S].map((v) => range(n).map((b) => (v >> b) & 1));
    const proj = range(n).map((i) => projSize(pts, range(n).filter((j) => j !== i)));
    return { size, edges, count: edges.length, bound, holds: edges.length <= bound + 1e-9, tight: Math.abs(edges.length - bound) < 1e-9,
      projections: proj, lwHolds: bigPow(size, n - 1) <= bigProd(proj) };
  }

  /* ---------- typical sets and types ---------- */
  function typical(n, p, eps) {
    const layers = range(n + 1).map((k) => {
      const count = binom(n, k), prob = Number(count) * Math.pow(p, k) * Math.pow(1 - p, n - k);
      return { k, count, prob, inBand: Math.abs(k / n - p) <= eps + 1e-12 };
    });
    const band = layers.filter((l) => l.inBand);
    return { n, p, eps, layers, bandCount: band.reduce((a, l) => a + l.count, 0n), bandProb: band.reduce((a, l) => a + l.prob, 0),
      entropyCount: Math.pow(2, n * h(p)), nh: n * h(p), total: bigPow(2, n) };
  }
  /* All types (n_1..n_q) with Σ = n. */
  function types(n, q) {
    const out = [], cur = [];
    const rec = (left, j) => {
      if (j === q - 1) { out.push([...cur, left]); return; }
      for (let a = left; a >= 0; a--) { cur.push(a); rec(left - a, j + 1); cur.pop(); }
    };
    rec(n, 0);
    return out.map((t) => multinomialBound(t));
  }

  /* ---------- sumsets ---------- */
  function sumset(A, B) {
    const a = [...new Set(A)].sort((x, y) => x - y), b = [...new Set(B)].sort((x, y) => x - y);
    const dist = new Map();
    for (const x of a) for (const y of b) dist.set(x + y, (dist.get(x + y) || 0) + 1);
    const sums = [...dist.keys()].sort((x, y) => x - y);
    const HS = entropyCounts([...dist.values()]);
    return { A: a, B: b, sums, weights: sums.map((s) => dist.get(s)), size: sums.length, HX: a.length ? log2(a.length) : 0,
      HY: b.length ? log2(b.length) : 0, HS, logSize: sums.length ? log2(sums.length) : 0,
      holds: HS <= (sums.length ? log2(sums.length) : 0) + 1e-9, lower: Math.max(a.length ? log2(a.length) : 0, b.length ? log2(b.length) : 0) };
  }

  /* ---------- data processing: forgetting coordinates ---------- */
  function forget(family, keep) {
    const F = uniq(family), m = projectCounts(F, keep);
    return { size: F.length, image: m.size, H: F.length ? log2(F.length) : 0, Himage: entropyCounts([...m.values()]),
      fibres: [...m.entries()].map(([k, c]) => ({ key: k, count: c })) };
  }

  /* ---------- compression: descriptions of the same object ---------- */
  /* Huffman code lengths for integer weights (deterministic tie-break by index). */
  function huffmanLengths(weights) {
    const n = weights.length;
    if (n === 1) return [1];
    let nodes = weights.map((w, i) => ({ w, ids: [i], order: i }));
    const len = new Array(n).fill(0);
    let next = n;
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.w - b.w || a.order - b.order);
      const [x, y] = nodes.splice(0, 2);
      for (const i of [...x.ids, ...y.ids]) len[i]++;
      nodes.push({ w: x.w + y.w, ids: [...x.ids, ...y.ids], order: next++ });
    }
    return len;
  }
  /* Four descriptions of a uniformly random member of the family, each in bits. */
  function encodings(family, order) {
    const F = uniq(family), n = dims(F), N = F.length, sup = supports(F);
    order = order || range(n);
    const fixedIndex = N > 1 ? Math.ceil(log2(N)) : 0;
    const naive = sup.map((s) => (s.length > 1 ? Math.ceil(log2(s.length)) : 0));
    const marginal = range(n).map((i) => Hproj(F, [i]));
    const chain = chainRule(F, order).steps.map((s) => s.cond);
    const huff = huffmanLengths(new Array(N).fill(1));
    const avgHuff = huff.reduce((a, b) => a + b, 0) / N;
    const kraft = huff.reduce((a, l) => a + Math.pow(2, -l), 0);
    return { N, H: N ? log2(N) : 0, fixedIndex, naive, naiveTotal: naive.reduce((a, b) => a + b, 0),
      marginal, marginalTotal: marginal.reduce((a, b) => a + b, 0), chain, chainTotal: chain.reduce((a, b) => a + b, 0),
      huffman: huff, avgHuffman: avgHuff, kraft };
  }

  /* ---------- layers of the Boolean lattice ---------- */
  function layers(n) {
    return range(n + 1).map((k) => ({ ...binomialBound(n, k) }));
  }
  /* Brute-force the largest antichain in 2^[n] (n ≤ 4): checks Sperner exactly on small cases. */
  function largestAntichain(n) {
    const N = 1 << n, sub = (a, b) => (a & b) === a;
    let best = 0;
    const rec = (i, chosen) => {
      if (chosen.length + (N - i) <= best) return;
      if (i === N) { best = Math.max(best, chosen.length); return; }
      if (chosen.every((c) => !sub(c, i) && !sub(i, c))) { chosen.push(i); rec(i + 1, chosen); chosen.pop(); }
      rec(i + 1, chosen);
    };
    rec(0, []);
    return best;
  }

  /* ---------- Hamming balls: union of layers vs entropy ---------- */
  /* |{x ∈ {0,1}^n : weight ≤ k}|, the union-of-layers bound (k+1)·C(n,k) and, for k ≤ n/2, 2^(n h(k/n)). */
  function hammingBall(n, k) {
    let exact = 0n;
    for (let i = 0; i <= k; i++) exact += binom(n, i);
    const entropy = n === 0 ? 1 : 2 * k <= n ? Math.pow(2, n * h(k / n)) : Math.pow(2, n);
    return { n, k, exact, layers: BigInt(k + 1) * binom(n, Math.min(k, Math.floor(n / 2))), entropy, entropyValid: 2 * k <= n, naive: bigPow(2, n) };
  }

  /* ---------- families ---------- */
  function product(sizes) {
    let out = [[]];
    for (const s of sizes) out = out.flatMap((t) => range(s).map((v) => [...t, v]));
    return out;
  }
  const FAMILIES = {
    "no-adjacent": (n) => product(new Array(n).fill(2)).filter((t) => t.every((v, i) => !(v && t[i + 1]))),
    "cyclic-no-adjacent": (n) => product(new Array(n).fill(2)).filter((t) => t.every((v, i) => !(v && t[(i + 1) % n]))),
    "even-weight": (n) => product(new Array(n).fill(2)).filter((t) => t.reduce((a, b) => a + b, 0) % 2 === 0),
    "one-hot": (n) => range(n).map((i) => range(n).map((j) => (i === j ? 1 : 0))),
    "all-binary": (n) => product(new Array(n).fill(2)),
    "constant": (n) => [new Array(n).fill(0), new Array(n).fill(1)],
    "permutations": (n) => permutations(n),
    "k-subsets": (n, k) => product(new Array(n).fill(2)).filter((t) => t.reduce((a, b) => a + b, 0) === k),
    "staircase": (n, m = 2) => product(new Array(n).fill(m + 1)).filter((t) => t.reduce((a, b) => a + b, 0) <= m),
  };
  const family = (name, ...args) => FAMILIES[name](...args);

  /* ---------- deterministic samples ---------- */
  /* A small linear congruential generator: a fixed seed gives the same "random" sequence everywhere. */
  function lcg(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  return {
    LN2, UNITS, inUnit, countFrom, log2, log2Big, fmt, fixed, fmtCount,
    factorial, binom, multinomial, bigPow, bigProd,
    entropyCounts, entropyProbs, h, kl, jointStats,
    range, uniq, dims, projectCounts, Hproj, projSize, Hcond, supports, chainRule, subadditivity,
    binomialBound, multinomialBound, setSystem, shearer, loomisWhitney, fractionalCover, bestCover,
    subsetsOfSize, han, degrees, perfectMatchings, permanent, bregman, permutations, revealTrajectory,
    revealAverages, averagingIdentity, colourings, pathColourCount, cycleColourCount, cubeEdges,
    typical, types, sumset, forget, huffmanLengths, encodings, layers, largestAntichain, lcg,
    hammingBall, product, FAMILIES, family,
  };
});
