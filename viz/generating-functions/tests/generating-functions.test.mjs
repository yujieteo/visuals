/* Generating Functions Lab: the mathematics. The engine and the curriculum are loaded from the built
   page, as the page runs them; every counting result is checked exactly against an independent
   enumeration or recurrence written here, and the asymptotic checks state their tolerance. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/** @param {string} p */
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const html = read("index.html");
/** @param {string} id */
const script = (id) => /** @type {RegExpExecArray} */ (new RegExp(`<script id="${id}">\\n([\\s\\S]*?)\\n</script>`).exec(html))[1];
const ctx = vm.createContext({});
ctx.self = ctx;
vm.runInContext(script("gf-engine"), ctx);
vm.runInContext(script("gf-lessons"), ctx);
/** @type {typeof import("../engine.js")} */
const G = ctx.GF;
/** @type {typeof import("../lessons.js")} */
const L = ctx.GFLab;
/** @param {Iterable<bigint | number>} a */
const big = (a) => Array.from(a, (x) => x.toString());
// Engine values come from another vm realm; compare them as plain JSON.
/** @param {unknown} a @param {unknown} b @param {string} [msg] */
const deq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);
/** @param {string} id */
const lessonOf = (id) => {
  const l = L.lesson(id);
  if (!l) assert.fail(`no lesson ${id}`);
  return l;
};
/** @param {number} k */
const problemOf = (k) => {
  const pr = L.PROBLEMS.find((p) => p.k === k);
  if (!pr) assert.fail(`no problem ${k}`);
  return pr;
};
/** The lesson route a hash names. @param {string} hash */
const lessonRoute = (hash) => {
  const r = L.parseHash(hash);
  if (r.page !== "lesson") assert.fail(`${hash} names no lesson`);
  return r;
};
/** @param {import("../engine.js").Exact[]} a */
const qs = (a) => a.map((q) => G.qstr(q));

test("the page inlines engine.js, lessons.js and ui.js unchanged", () => {
  assert.equal(script("gf-engine"), read("engine.js").trimEnd());
  assert.equal(script("gf-lessons"), read("lessons.js").trimEnd());
  assert.equal(script("gf-ui"), read("ui.js").trimEnd());
  deq(JSON.parse(/** @type {RegExpExecArray} */ (/self\.GF_DATA = (.*);\n<\/script>/.exec(html))[1]), JSON.parse(read("raw.json")));
});

test("raw.json is the curriculum's own metadata (regenerate with node raw.mjs > raw.json)", async () => {
  const { rawData } = await import("../raw.mjs");
  assert.deepEqual(JSON.parse(read("raw.json")), JSON.parse(JSON.stringify(rawData())));
});

test("series truncation, shift, derivative, integral and convolution", () => {
  const a = G.seriesFrom([1, 2, 3, 4, 5]);
  deq(big(G.trunc(a, 3)), ["1", "2", "3"]);
  deq(big(G.trunc(a, 7)), ["1", "2", "3", "4", "5", "0", "0"]);
  deq(big(G.shift(a, 2, 6)), ["0", "0", "1", "2", "3", "4"]);
  deq(big(G.derivative(a)), ["2", "6", "12", "20"]);
  deq(big(G.xDerivative(a)), ["0", "2", "6", "12", "20"]);
  deq(qs(G.integral(a)), ["0", "1", "1", "1", "1", "1"]);
  deq(qs(G.integral(G.seriesFrom([1, 1, 1, 1]))), ["0", "1", "1/2", "1/3", "1/4"]);
  // [x^n] AB = Σ a_k b_{n-k}, by hand.
  const b = G.seriesFrom([1, -1, 2]);
  const hand = [];
  for (let n = 0; n < 7; n++) { let s = 0; for (let k = 0; k <= n; k++) s += (Number(a[k] ?? 0n)) * Number(b[n - k] ?? 0n); hand.push(String(s)); }
  deq(big(G.mul(a, b)), hand);
  deq(big(G.mul(a, b, 3)), hand.slice(0, 3));
  // 1/(1 − x) times (1 − x) is 1, and the geometric series inverse is all ones.
  deq(big(G.inverse(G.seriesFrom([1, -1]), 6)), ["1", "1", "1", "1", "1", "1"]);
  deq(big(G.mul(G.inverse(G.seriesFrom([1, -1, -1]), 8), G.seriesFrom([1, -1, -1]), 8)), ["1", "0", "0", "0", "0", "0", "0", "0"]);
});

test("Fibonacci: the GF x/(1 − x − x²) agrees with the DP recurrence, and Binet exactly", () => {
  const N = 60, gf = G.fibonacciGF(N);
  const dp = [0n, 1n]; while (dp.length < N) dp.push(dp[dp.length - 1] + dp[dp.length - 2]);
  deq(big(gf), big(dp));
  assert.equal(gf[50], 12586269025n);
  for (let n = 0; n < 40; n++) assert.equal(G.binet(n), dp[n], `Binet n = ${n}`);
  const l = lessonOf("fibonacci");
  for (let n = 0; n <= 30; n++) assert.ok(L.verify(l, {}, n).every((c) => c.pass), `lesson checks at n = ${n}`);
});

test("coin change with 1, 2, 5: n = 12 gives 13, against brute-force enumeration", () => {
  /** @param {number} n */
  const brute = (n) => { let c = 0; for (let x = 0; x <= n; x++) for (let y = 0; 2 * y <= n; y++) for (let z = 0; 5 * z <= n; z++) if (x + 2 * y + 5 * z === n) c++; return c; };
  const gf = G.coinChangeGF([1, 2, 5], 41);
  assert.equal(gf[12], 13n);
  assert.equal(brute(12), 13);
  for (let n = 0; n <= 40; n++) assert.equal(Number(gf[n]), brute(n), `n = ${n}`);
  assert.equal(L.coefficient(lessonOf("coin-change"), L.defaults(lessonOf("coin-change")), 12), 13n);
});

test("compositions with parts 1–3, binary strings avoiding 11 (transfer matrix), Catalan and Lagrange inversion", () => {
  // Compositions: enumerate every ordered sum by recursion written here.
  /** @param {number} n @returns {number} */
  const comps = (n) => (n === 0 ? 1 : [1, 2, 3].reduce((s, p) => s + (p <= n ? comps(n - p) : 0), 0));
  const cg = G.compositionsGF([1, 2, 3], 16);
  for (let n = 0; n < 16; n++) assert.equal(Number(cg[n]), comps(n));
  assert.equal(cg[7], 44n);
  // Binary strings with no 11: brute force over all 2^n strings; transfer matrix; rational GF.
  /** @param {number} n */
  const no11 = (n) => { let c = 0; for (let m = 0; m < 2 ** n; m++) if (!(m & (m >> 1))) c++; return c; };
  const tm = G.transferCounts(16), rg = G.no11GF(16);
  for (let n = 0; n < 16; n++) { assert.equal(Number(tm[n]), no11(n), `transfer n = ${n}`); assert.equal(rg[n], tm[n]); }
  // Catalan: balanced strings by brute force over all 2^(2n) bracket strings.
  /** @param {number} n */
  const balanced = (n) => { let c = 0; for (let m = 0; m < 2 ** (2 * n); m++) { let d = 0, ok = true; for (let i = 0; i < 2 * n; i++) { d += (m >> i) & 1 ? 1 : -1; if (d < 0) { ok = false; break; } } if (ok && d === 0) c++; } return c; };
  const cat = G.catalanGF(12);
  deq(big(cat.slice(0, 7)), ["1", "1", "2", "5", "14", "42", "132"]);
  for (let n = 0; n <= 8; n++) { assert.equal(Number(cat[n]), balanced(n)); assert.equal(cat[n], G.catalanClosed(n)); assert.equal(G.binaryTrees(n).length, balanced(n)); }
  // Lagrange: [x^n]T^k = (k/n)[u^{n−k}](1+u)^{2n} against iteration T ← x(1+T)² and against counting trees.
  const T = G.implicitSeries([1, 2, 1], 12);
  for (let n = 1; n < 12; n++) for (let k = 1; k <= Math.min(n, 3); k++) {
    const lag = G.lagrange([1, 2, 1], n, k), it = G.power(T, k, 12)[n];
    assert.equal(G.qstr(lag), it.toString(), `n = ${n}, k = ${k}`);
    assert.equal(G.qstr(lag), (BigInt(k) * G.binom(2 * n, n - k) / BigInt(n)).toString());
  }
  for (let n = 1; n <= 8; n++) assert.equal(Number(T[n]), balanced(n), `T = C − 1 at n = ${n}`);
  assert.equal(G.qstr(G.lagrange([1, 2, 1], 6)), "132");
  // Cayley: rooted labelled trees n^{n−1}, by brute force over parent maps.
  deq([1, 2, 3, 4, 5].map((n) => Number(G.rootedLabelledTrees(n))), [1, 2, 9, 64, 625]);
});

test("EGFs: the binomial convolution, permutations by cycles (Stirling numbers of the first kind), dice sums", () => {
  // Labelled product of arrangements (k!) and sets (1): Σ C(n,k) k!, against enumerating (subset, order).
  const arr = G.arrangementsGF(9);
  deq(big(arr), ["1", "2", "5", "16", "65", "326", "1957", "13700", "109601"]);
  for (let n = 0; n <= 7; n++) assert.equal(arr[n], G.arrangementsEnumerated(n));
  assert.equal(G.arrangementsList(4).length, 65);
  // The same numbers from the product of EGFs, in exact rationals.
  const egf = G.qmulSeries(G.egfFromCounts([0, 1, 2, 3, 4, 5, 6].map((k) => G.factorial(k))), G.egfFromCounts([1, 1, 1, 1, 1, 1, 1]), 7);
  deq(big(G.countsFromEgf(egf)), big(arr.slice(0, 7)));
  // Stirling numbers of the first kind: recurrence, BGF (1 − x)^{−y}, and enumeration of all permutations.
  const st = G.stirling1(8), bgf = G.cyclesBGF(8);
  deq(big(st[4]), ["0", "6", "11", "6", "1"]);
  deq(big(st[5]), ["0", "24", "50", "35", "10", "1"]);
  for (let n = 0; n <= 7; n++) {
    deq(big(bgf[n]), big(st[n]));
    const byCycles = new Array(n + 1).fill(0);
    for (const p of G.permutations(n)) byCycles[G.cyclesOf(p).length]++;
    deq(byCycles.map(String), big(st[n]), `n = ${n}`);
  }
  deq(big(G.permutationsByExpFormula(9)), ["1", "1", "2", "6", "24", "120", "720", "5040", "40320"]);
  deq(big(G.bellByExpFormula(8)), ["1", "1", "2", "5", "15", "52", "203", "877"]);
  for (let n = 0; n <= 7; n++) assert.equal(G.setPartitions(n).length, Number(G.bellByExpFormula(8)[n]));
  // Dice: PGF ((z + … + z⁶)/6)^k against all 6^k outcomes; two dice sum to 7 with probability 1/6.
  for (const k of [1, 2, 3, 4]) { const p = G.dicePGF(k), e = G.diceEnumerated(k); assert.equal(p.length, e.length); p.forEach((q, i) => assert.ok(G.qeq(q, e[i]), `k = ${k}, sum ${i}`)); assert.equal(G.qstr(G.pgfMean(p)), G.qstr(G.Q(7 * k, 2))); }
  assert.equal(G.qstr(G.dicePGF(2)[7]), "1/6");
});

test("roots-of-unity filter: x⁰…x¹¹ with exponent divisible by 3 gives 4, exactly", () => {
  const ones = Array.from({ length: 12 }, () => 1n);
  assert.equal(G.qstr(G.rootsFilterExact(ones, 3, 0)), "4");
  for (const m of [2, 3, 4, 5, 6, 8]) for (let r = 0; r < m; r++) {
    const a = Array.from({ length: 13 }, (_, k) => G.binom(12, k));
    assert.equal(G.qstr(G.rootsFilterExact(a, m, r)), G.residueSum(a, m, r).toString(), `(1 + x)^12, m = ${m}, r = ${r}`);
  }
  assert.equal(G.qstr(G.rootsFilterExact(Array.from({ length: 13 }, (_, k) => G.binom(12, k)), 3, 0)), "1366");
  // The monomial picture: (1/m) Σ_j ω^{j(n−r)} is 1 or 0 (floating, tolerance 1e−12).
  for (const m of [3, 4, 6]) for (let n = 0; n < 12; n++) { let re = 0, im = 0; for (let j = 0; j < m; j++) { re += Math.cos((2 * Math.PI * j * n) / m) / m; im += Math.sin((2 * Math.PI * j * n) / m) / m; } assert.ok(Math.abs(re - (n % m === 0 ? 1 : 0)) < 1e-12 && Math.abs(im) < 1e-12); }
});

test("the N = 4 DFT of 1 + 2x + 3x² + 4x³, IDFT(DFT(a)) = a, and the cyclic convolution theorem", () => {
  const v = G.dftExact([1, 2, 3, 4], 4);
  deq(v.map((z) => G.zExactString(z, 4)), ["10", "−2 − 2i", "−2", "−2 + 2i"]);
  // As complex numbers, from the head-to-tail phasor sums: A(i) = 1 + 2i − 3 − 4i.
  const f = G.dftFloat([1, 2, 3, 4], 4);
  deq(f.map((z) => [Math.round(z.re), Math.round(z.im)]), [[10, 0], [-2, -2], [-2, 0], [-2, 2]]);
  deq(qs(G.idftExact(v)), ["1", "2", "3", "4"]);
  // Round trip and theorem, exact, for many deterministic vectors and every N used by the lab.
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), (seed % 19) - 9);
  for (const N of [1, 2, 3, 4, 5, 6, 8, 12, 16]) for (let t = 0; t < 6; t++) {
    const a = Array.from({ length: N }, rnd), b = Array.from({ length: N }, rnd);
    deq(qs(G.idftExact(G.dftExact(a, N), N)), a.map((x) => G.fmtInt(BigInt(x))), `round trip N = ${N}`);
    const direct = [];
    for (let n = 0; n < N; n++) { let s = 0; for (let k = 0; k < N; k++) s += a[k] * b[(((n - k) % N) + N) % N]; direct.push(String(s)); }
    deq(big(G.cyclicConvolution(a, b, N)), direct, `direct N = ${N}`);
    deq(big(G.cyclicByDFT(a, b, N)), direct, `via DFT N = ${N}`);
  }
  deq(big(G.cyclicConvolution([1, 2, 3, 4], [1, 1, 0, 0], 4)), ["5", "3", "5", "7"]);
  // Polynomial multiplication through the DFT once padded, and the even/odd FFT split.
  deq(big(G.multiplyByDFT([1, 2, 3], [4, 5, 6])), ["4", "13", "28", "27", "18"]);
  assert.ok(G.evenOddSplitHolds([3, -1, 4, 1, -5, 9, 2, -6], 8));
  const fft = G.fft([1, 2, 3, 4, 5, 6, 7, 8].map((x) => G.C(x))), dft = G.dftFloat([1, 2, 3, 4, 5, 6, 7, 8], 8);
  fft.forEach((z, k) => assert.ok(G.cabs(G.csub(z, dft[k])) < 1e-9, `FFT k = ${k}`));
});

test("partitions, and distinct parts versus odd parts", () => {
  const p = G.partitionsGF(41);
  deq(big(p.slice(0, 13)), ["1", "1", "2", "3", "5", "7", "11", "15", "22", "30", "42", "56", "77"]);
  assert.equal(p[40], 37338n);
  for (let n = 0; n <= 20; n++) assert.equal(G.partitionsList(n).length, Number(p[n]), `p(${n})`);
  const d = G.partitionsGF(61, { distinct: true }), o = G.partitionsGF(61, { parts: "odd" });
  deq(big(d), big(o));
  for (let n = 0; n <= 25; n++) { assert.equal(G.partitionsList(n, { distinct: true }).length, Number(d[n])); assert.equal(G.partitionsList(n, { odd: true }).length, Number(o[n])); }
  deq(big(G.partitionsGF(10, { maxPart: 3 })), ["1", "1", "2", "3", "4", "5", "7", "8", "10", "12"]);
});

test("asymptotics (Levels 29–30) agree within their stated tolerances", () => {
  // Level 29: F_n/(φⁿ/√5) − 1 = −(ψ/φ)ⁿ, below 1e−10 at n = 30.
  const F = G.fibonacciDP(31);
  assert.ok(Math.abs(Number(F[30]) / G.fibonacciEstimate(30) - 1) < 1e-10);
  // [xⁿ] 1/(1 − αx) = αⁿ exactly.
  assert.equal(G.qstr(L.coefficient(lessonOf("singularities"), { alpha: "3/2" }, 5)), "243/32");
  // Level 30: [xⁿ](1 − x)^{−α} ∼ n^{α−1}/Γ(α); relative error ≈ α(α−1)/(2n), so allow (|α(α−1)|/2 + 0.01)·1.05/n.
  for (const [a, alpha] of /** @type {[string, import("../engine.js").Rat][]} */ ([["1/2", G.Q(1, 2)], ["3/2", G.Q(3, 2)], ["2", G.Q(2)], ["3", G.Q(3)]])) for (const n of [100, 400, 1000]) {
    const r = G.qnum(G.risingCoefficient(alpha, n)) / G.singularityEstimate(alpha, n), al = G.qnum(alpha);
    assert.ok(Math.abs(r - 1) <= ((Math.abs(al * (al - 1)) / 2 + 0.01) * 1.05) / n, `α = ${a}, n = ${n}: ratio ${r}`);
  }
  // Catalan: Cₙ/(4ⁿ/(√π n^{3/2})) = 1 − 9/(8n) + O(n⁻²); tolerance 1.2/n, and the ratio is below 1.
  for (const n of [100, 500, 1000, 2000]) {
    const r = G.ratioToEstimate(G.catalanClosed(n), G.catalanLogEstimate(n));
    assert.ok(Math.abs(r - 1) <= 1.2 / n && r < 1, `n = ${n}: ${r}`);
    if (n >= 1000) assert.ok(Math.abs((1 - r) * n - 9 / 8) < 0.01, `first correction 9/(8n) at n = ${n}: ${(1 - r) * n}`);
  }
  // Γ(1/2)² = π and Γ(5) = 24.
  assert.ok(Math.abs(G.gamma(0.5) ** 2 - Math.PI) < 1e-12 && Math.abs(G.gamma(5) - 24) < 1e-10);
  // Saddle point: n!·eⁿ/(nⁿ√(2πn)) = 1 − 1/(12n) + O(n⁻²).
  for (const n of [10, 30, 60]) { const r = G.saddleEstimate(n) * G.qnum(G.Q(G.factorial(n))); assert.ok(Math.abs(r - 1) <= 1 / (12 * n) + 1 / n ** 2, `n = ${n}`); }
});

test("every lesson's verification passes at every offered parameter, and the in-page self-test is all green", () => {
  const t = L.selfTests();
  assert.ok(t.length >= 300, `${t.length} self-tests`);
  deq(t.filter((x) => !x.pass).map((x) => `${x.name}: ${x.detail}`), []);
  for (const l of L.LESSONS) if (l.gfName && l.n) for (const n of [l.n.min, l.n.def, L.nMax(l, L.defaults(l))]) {
    const checks = L.verify(l, L.defaults(l), n);
    assert.ok(checks.length >= 1 || ["finite-vectors", "dft", "inverse-dft"].includes(l.id) || !l.enumerate, `${l.id} has a check at n = ${n}`);
    assert.ok(checks.every((c) => c.pass), `${l.id} at n = ${n}`);
  }
});

test("the curriculum: 34 levels in order, the spec's technique index, the 22-problem ladder with checked answers", () => {
  deq(L.LESSONS.map((l) => l.level), Array.from({ length: 34 }, (_, i) => i));
  const ids = new Set(L.LESSONS.map((l) => l.id));
  for (const l of L.LESSONS) for (const p of [...l.prerequisites, ...l.related]) assert.ok(ids.has(p) || ["ogf-egf", "character-table"].includes(p), `${l.id} → ${p}`);
  for (const l of L.LESSONS) { assert.ok(l.when && l.key && l.problem && l.sayProblem, l.id); assert.ok(l.states({ ...L.defaults(l) }, l.n ? l.n.def : null).length >= 3, `${l.id} has states`); }
  assert.equal(L.TECHNIQUES.length, 39);
  for (const t of L.TECHNIQUES) assert.ok(L.techniqueLesson(t), t);
  assert.equal(L.PROBLEMS.length, 22);
  const expected = { 7: "13", 8: "44", 9: "21", 12: "132", 13: "65", 15: "1/6", 16: "4", 17: "3", 18: "5", 19: "28", 20: "42", 22: "252" };
  for (const [k, want] of Object.entries(expected)) { const pr = problemOf(Number(k)); assert.equal(G.isQ(L.problemAnswer(pr)) ? G.qstr(L.problemAnswer(pr)) : L.problemAnswer(pr).toString(), want, `problem ${k}`); assert.ok(L.checkAnswer(pr, want).ok); }
  assert.ok(!L.checkAnswer(L.PROBLEMS[6], "12").ok);
  assert.ok(L.checkAnswer(problemOf(21), "8.9e56").ok, "C₁₀₀ ≈ 8.97 × 10⁵⁶ within 1%");
  for (const pr of L.PROBLEMS) { assert.ok(pr.hints.length >= 3, `problem ${pr.k} hints`); assert.ok(!pr.hints[0].includes(pr.solution), `problem ${pr.k}: the first hint does not give the formula`); }
});

test("deep links: every lesson, alias and problem has a stable fragment that round-trips", () => {
  for (const h of ["ogf", "recurrence", "fibonacci", "convolution", "coin-change", "catalan", "lagrange-inversion", "egf", "exponential-formula", "partitions", "roots-of-unity", "dft", "cyclic-convolution", "fft", "singularity-analysis"]) {
    const r = L.parseHash(`#${h}`);
    assert.equal(r.page, "lesson", h); assert.ok(!r.unknown, h);
  }
  assert.equal(lessonRoute("#recurrence").id, "fibonacci");
  for (const l of L.LESSONS) {
    const r = lessonRoute(`#${l.hash}`);
    assert.equal(r.id, l.id);
    assert.equal(L.hashFor(r), `#${l.hash}`);
    for (const [k, spec] of Object.entries(l.params || {})) for (const v of spec.values) { if (spec.valid && !spec.valid(v, r.params)) continue; const r2 = { ...r, params: { ...r.params, [k]: v } }; r2.n = L.clampN(l, r2.n, r2.params); deq(JSON.parse(JSON.stringify(L.parseHash(L.hashFor(r2)))), JSON.parse(JSON.stringify(r2)), `${l.hash} ${k}=${v}`); }
  }
  assert.equal(lessonRoute("#roots-of-unity?m=3&r=5").params.r, 0, "a residue r ≥ m falls back to r = 0");
  assert.equal(lessonRoute("#roots-of-unity?m=6&r=5").params.r, 5);
  deq(L.parseHash("#coin-change?n=12"), { page: "lesson", id: "coin-change", n: 12, params: { coins: "1, 2, 5" } });
  assert.equal(lessonRoute("#coin-change?n=999").n, 40, "n is clamped");
  assert.equal(lessonRoute("#dft?n=7").n, 3, "finite vectors clamp n to N − 1");
  assert.equal(lessonRoute("#nonsense").unknown, "nonsense");
  for (const p of L.PROBLEMS) deq(L.parseHash(L.hashFor({ page: "problem", k: p.k })), { page: "problem", k: p.k });
  deq(L.parseHash("#compare/linear-cyclic"), { page: "compare", id: "linear-cyclic" });
  deq(L.parseHash("#fourier?N=8"), { page: "fourier", N: 8 });
});

test("search finds techniques, problems, formulas and aliases", () => {
  /** @param {string} q */
  const top = (q) => L.search(q, 5).map((e) => e.label);
  assert.match(top("coin change")[0], /Coin change/);
  assert.match(top("roots of unity")[0], /roots-of-unity/i);
  assert.match(top("catalan")[0], /Catalan/);
  assert.ok(top("partitions").some((x) => /partitions/i.test(x)));
  assert.ok(top("FFT").some((x) => /FFT/.test(x)));
  assert.ok(top("DFT").some((x) => /DFT/.test(x)));
  assert.ok(top("convolution").some((x) => /convolution/i.test(x)));
  assert.equal(L.search("zzzz-no-such-thing").length, 0);
});

test("the TeX subset renders every formula the lab shows, without a TeX library", () => {
  const h = G.texToHtml("[x^n]\\frac{1}{1-x} = \\sum_{k=0}^{n} \\binom{n}{k}");
  assert.match(h, /class="fr"/); assert.match(h, /class="bn"/); assert.doesNotMatch(h, /\\/);
  assert.throws(() => G.texToHtml("\\unknowncommand"), /unsupported/);
  assert.equal(G.texToHtml("a<b"), "<i>a</i> &lt; <i>b</i>");
  for (const l of L.LESSONS) {
    const p = L.defaults(l), n = l.n ? l.n.def : null;
    for (const s of l.states(p, n)) for (const t of s.tex) assert.doesNotMatch(G.texToHtml(t), /\\/, `${l.id}/${s.id}: ${t}`);
    if (l.closed) assert.doesNotMatch(G.texToHtml(l.closed(p)), /\\/, l.id);
  }
  for (const pr of L.PROBLEMS) assert.doesNotMatch(G.texToHtml(pr.solution), /\\/, `problem ${pr.k}`);
});
