/* Model tests for Motives and periods: the engine in <script id="motives-periods-engine">, checked against
   exact values (BigInt rationals, integer point counts), independent high-precision references, and the
   identities the mathematics guarantees; then the page's state, exports, claims and WebMCP tools. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { standIn } from "./beamdswitch-deck-checks.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = (id) => new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`).exec(html)[1];
const ctx = vm.createContext({});
ctx.self = ctx;
vm.runInContext(script("motives-periods-engine"), ctx);
const M = ctx.MotivesPeriods;
const plain = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tolerance ${tol})`);
const PI = Math.PI;

/* Reference values to 20 significant digits (ζ(n) from the standard tables; Bloch–Wigner at e^{iπ/3} is Cl₂(π/3)). */
const REF = {
  zeta3: 1.2020569031595942854, zeta5: 1.0369277551433699263, zeta7: 1.0083492773819228268, zeta9: 1.0020083928260822144,
  cl2: 1.0149416064096536250,
};
/* All compositions of k, and the admissible ones (first entry ≥ 2). */
function compositions(k) { if (k === 0) return [[]]; const out = []; for (let a = 1; a <= k; a++) for (const rest of compositions(k - a)) out.push([a, ...rest]); return out; }
const admissible = (k) => compositions(k).filter((c) => c[0] >= 2);

test("the engine is pure: it runs without DOM, storage or network, and never reads the clock or randomness", () => {
  // A bare context has no document, window, storage, fetch or timers; the clock and randomness are made to throw.
  const pure = vm.createContext({});
  vm.runInContext(`Object.defineProperty(globalThis, "Date", { get() { throw new Error("Date was read"); } });
    Object.defineProperty(Math, "random", { get() { throw new Error("Math.random was read"); } });
    Object.defineProperty(globalThis, "performance", { get() { throw new Error("performance was read"); } });`, pure);
  pure.self = pure;
  vm.runInContext(script("motives-periods-engine"), pure);
  const P = pure.MotivesPeriods;
  const states = [
    ...P.TURNS.map((turns) => ({ example: "tate", tate: { centre: 0.5, turns, steps: 64 } })),
    ...[[2], [3], [4], [2, 1], [5, 3]].map((composition) => ({ example: "zeta", zeta: { composition, terms: 1000 } })),
    ...P.GRAPHS.map((g) => ({ example: "feynman", feynman: { graph: g.id, nodes: 12 } })),
  ].map((raw) => P.normalize(raw).state);
  const run = () => plain({
    meta: P.META, self: P.selfTests(),
    each: states.map((st) => {
      const hash = P.toHash(st), json = P.toJSON(st);
      return { analyse: P.analyse(st), markdown: P.markdown(st), deck: P.beamdswitchReport(st), hash, fromHash: P.fromHash(hash, st), json, fromJSON: P.fromJSON(JSON.stringify(json)) };
    }),
  });
  const first = run();
  assert.deepEqual(run(), first, "the same state gives the same output");
  for (const r of first.self) assert.ok(r.pass, r.name);
  first.each.forEach((e, i) => { assert.deepEqual(e.fromHash.state, plain(states[i])); assert.deepEqual(e.fromJSON.state, plain(states[i])); });
});

test("the in-page self-test passes", () => {
  const t = M.selfTests();
  assert.ok(t.length >= 13);
  for (const r of t) assert.ok(r.pass, `${r.name} ${r.detail}`);
});

test("raw.json is the engine's metadata and default state", () => {
  const raw = JSON.parse(readFileSync(new URL("../raw.json", import.meta.url), "utf8"));
  assert.deepEqual(raw, plain({ meta: M.META, example: M.toJSON(M.defaultState()) }), "regenerate raw.json from the engine");
});

/* ---------- Tate ---------- */
test("∮ dz/z is 2πi times the winding number, and the Riemann sum converges to it", () => {
  for (const centre of [-2, -1.75, -0.5, 0, 0.75, 1.25, 2]) for (const turns of M.TURNS) {
    const r = M.loopIntegral({ centre, turns, steps: 4096 });
    const k = Math.abs(centre) < 1 ? turns : 0;
    assert.equal(r.winding, k, `centre ${centre}, turns ${turns}`);
    assert.deepEqual(plain(r.exact), { re: 0, im: 2 * PI * k });
    assert.ok(r.error < 2e-2, `centre ${centre}: error ${r.error}`);
  }
  // Around 0 the left-endpoint sum is exactly m(e^{2πik/m} − 1), so its error is known in closed form.
  for (const m of [3, 16, 100, 512]) {
    const r = M.loopIntegral({ centre: 0, turns: 1, steps: m });
    near(r.sum.re, m * (Math.cos((2 * PI) / m) - 1), 1e-12, `re at m = ${m}`);
    near(r.sum.im, m * Math.sin((2 * PI) / m), 1e-12, `im at m = ${m}`);
  }
  const errs = [8, 32, 128, 512].map((m) => M.loopIntegral({ centre: 0.5, turns: 1, steps: m }).error);
  errs.slice(1).forEach((e, i) => assert.ok(e < errs[i], "the error falls as the steps grow"));
  for (const centre of [-1, 1]) {
    const r = M.loopIntegral({ centre, turns: 1, steps: 16 });
    assert.equal(r.onPath, true); assert.equal(r.sum, null); assert.equal(r.exact, null);
  }
});

test("the Tate panel writes k·2πi for every winding", () => {
  const want = { 1: "2πi", [-1]: "−2πi", 2: "2·2πi", [-2]: "−2·2πi" };
  for (const turns of M.TURNS) {
    const t = M.analyse(M.normalize({ example: "tate", tate: { centre: 0, turns, steps: 64 } }).state).tate;
    assert.ok(t.headline.endsWith(`the integral is ${want[turns]}.`), t.headline);
    assert.ok(t.exactText.startsWith(`${want[turns]} = `), t.exactText);
  }
});

test("counting points reads h(P¹) = 𝟏 ⊕ 𝐋 as 1 + q and G_m as q − 1", () => {
  for (const q of M.PRIMES) { assert.equal(M.pointCountP1(q), q + 1); assert.equal(M.pointCountGm(q), q - 1); }
  assert.deepEqual(plain(M.analyse(M.defaultState()).tate.counts), [2, 3, 5, 7, 11].map((q) => ({ q, p1: q + 1, gm: q - 1 })));
});

/* ---------- Zeta ---------- */
test("Bernoulli numbers and the even zeta coefficients are exact", () => {
  const B = { 0: "1", 1: "−1/2", 2: "1/6", 3: "0", 4: "−1/30", 6: "1/42", 8: "−1/30", 10: "5/66", 12: "−691/2730", 14: "7/6", 16: "−3617/510" };
  for (const [n, v] of Object.entries(B)) assert.equal(M.rstr(M.bernoulli(+n)), v, `B_${n}`);
  // ζ(2) = π²/6, ζ(4) = π⁴/90, ζ(6) = π⁶/945, ζ(8) = π⁸/9450 as c·(2πi)^k.
  const C = { 2: "−1/24", 4: "1/1440", 6: "−1/60480", 8: "1/2419200" };
  for (const [k, v] of Object.entries(C)) assert.equal(M.rstr(M.evenZetaCoefficient(+k)), v, `c_${k}`);
  for (const [k, den] of [[2, 6], [4, 90], [6, 945], [8, 9450]]) {
    const a = M.analyse(M.normalize({ zeta: { composition: [k] } }).state).zeta;
    near(a.even.value, PI ** k / den, 1e-15 * PI ** k, `ζ(${k}) from its coefficient`);
    near(a.value, PI ** k / den, 2e-15, `ζ(${k})`);
  }
  assert.equal(M.analyse(M.normalize({ zeta: { composition: [3] } }).state).zeta.even, null, "odd ζ has no such coefficient");
});

test("single zeta values match 20-digit references", () => {
  near(M.mzv([3]), REF.zeta3, 1e-15, "ζ(3)");
  near(M.mzv([5]), REF.zeta5, 1e-15, "ζ(5)");
  near(M.mzv([7]), REF.zeta7, 1e-15, "ζ(7)");
  near(M.mzv([9]), REF.zeta9, 1e-15, "ζ(9)");
});

test("a double zeta value matches an independent direct summation", () => {
  // ζ(5, 3) = Σ_{n>m≥1} 1/(n⁵m³); the tail after N = 20000 is below 10⁻¹⁷, summed with compensation.
  let s = 0, c = 0, h = 0;
  for (let n = 2; n <= 20000; n++) { h += 1 / (n - 1) ** 3; const y = h / n ** 5 - c, t = s + y; c = t - s - y; s = t; }
  near(M.mzv([5, 3]), s, 1e-16, "ζ(5, 3)");
  near(M.mzv([3, 1]), PI ** 4 / 360, 1e-15, "ζ(3, 1) = π⁴/360");
  near(M.mzv([3, 1, 3, 1]), (2 * PI ** 8) / 3628800, 1e-15, "ζ(3, 1, 3, 1) = 2π⁸/10!");
});

test("duality holds for every admissible composition up to weight 8", () => {
  for (let k = 2; k <= 8; k++) for (const s of admissible(k)) {
    const d = M.dualComposition(s);
    assert.equal(M.weight(d), k);
    assert.deepEqual([...M.dualComposition(d)], s, `the dual of the dual of (${s})`);
    near(M.mzv(s), M.mzv(d), 2e-15, `ζ(${s}) = ζ(${d})`);
  }
  assert.deepEqual([...M.dualComposition([2, 1])], [3]);
  assert.deepEqual([...M.dualComposition([5, 3])], [2, 1, 2, 1, 1, 1]);
});

test("the stuffle product and the sum theorem hold", () => {
  for (const [a, b] of [[2, 2], [2, 3], [3, 4], [2, 5]]) near(M.mzv([a]) * M.mzv([b]), M.mzv([a, b]) + M.mzv([b, a]) + M.mzv([a + b]), 4e-15, `ζ(${a})ζ(${b})`);
  // Granville–Zagier: the admissible values of weight k and depth r sum to ζ(k).
  for (let k = 3; k <= 8; k++) for (let r = 1; r < k; r++) {
    const sum = admissible(k).filter((s) => s.length === r).reduce((t, s) => t + M.mzv(s), 0);
    near(sum, M.mzv([k]), 1e-14, `sum theorem, weight ${k}, depth ${r}`);
  }
});

test("the plain sum converges slowly toward the value", () => {
  for (const N of [10, 100, 1000]) near(M.mzv([2]) - M.partialSum([2], N), 1 / N - 1 / (2 * N * N), 1 / N ** 3, `ζ(2) tail at N = ${N}`);
  assert.ok(Math.abs(M.partialSum([3], 100000) - REF.zeta3) < 1e-10);
});

test("words, weights and the dimension counts", () => {
  assert.deepEqual([...M.toWord([3])], [0, 0, 1]);
  assert.deepEqual([...M.toWord([2, 1])], [0, 1, 1]);
  assert.deepEqual([...M.toComposition([0, 0, 0, 0, 1, 0, 0, 1])], [5, 3]);
  const d = [1, 0, 1, 1, 1, 2, 2, 3, 4, 5, 7, 9, 12, 16, 21, 28, 37];
  for (let k = 0; k <= 16; k++) {
    assert.equal(M.zagierD(k), d[k], `d_${k}`);
    assert.equal(M.hoffmanCount(k), compositions(k).filter((c) => c.every((x) => x === 2 || x === 3)).length, `Hoffman count ${k}`);
    if (k >= 2) assert.equal(M.admissibleCount(k), admissible(k).length, `admissible ${k}`);
  }
});

test("compositions are parsed and refused with reasons", () => {
  assert.deepEqual(plain(M.parseComposition("5, 3")), { ok: true, composition: [5, 3] });
  assert.deepEqual(plain(M.parseComposition(" 2 1 1 ")), { ok: true, composition: [2, 1, 1] });
  assert.match(M.parseComposition("1, 2").error, /diverges/);
  assert.match(M.parseComposition("2, x").error, /not a positive integer/);
  assert.match(M.parseComposition("0").error, /not a positive integer/);
  assert.match(M.parseComposition("").error, /Enter/);
  assert.match(M.parseComposition("9, 9").error, /Weight 18/);
});

/* ---------- Feynman ---------- */
test("Kirchhoff polynomials: one monomial per spanning tree, of degree the loop number", () => {
  const lucas = (n) => { let a = 2, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; };
  for (const g of M.GRAPHS) {
    const mons = M.kirchhoff(g), h = M.loops(g);
    assert.equal(g.edges.length, 2 * h, `${g.id} is log-divergent: 2h edges`);
    for (const m of mons) assert.equal(m.length, h, `${g.id}: a monomial of degree h`);
    assert.equal(new Set(mons.map((m) => m.join())).size, mons.length, `${g.id}: monomials are distinct`);
    assert.equal(mons.length, g.id === "bubble" ? 2 : lucas(2 * g.spokes) - 2, `${g.id}: spanning trees of the wheel are L_2n − 2`);
  }
  assert.equal(M.analyse(M.normalize({ feynman: { graph: "bubble" } }).state).feynman.psi, "α₂ + α₁");
});

test("the wheel periods are C(2n − 2, n − 1) ζ(2n − 3)", () => {
  const want = { bubble: ["1", null, 1], ws3: ["6", 3, 6 * REF.zeta3], ws4: ["20", 5, 20 * REF.zeta5], ws5: ["70", 7, 70 * REF.zeta7], ws6: ["252", 9, 252 * REF.zeta9] };
  for (const g of M.GRAPHS) {
    const p = M.period(g), [c, z, v] = want[g.id];
    assert.equal(M.rstr(p.coefficient), c, g.id); assert.equal(p.zetaArg, z, g.id);
    near(p.value, v, 1e-14 * v, `P(${g.id})`);
  }
});

test("the Bloch–Wigner dilogarithm and the K₄ quadrature reproduce 6ζ(3)", () => {
  near(M.blochWigner(0.5, Math.sqrt(3) / 2), REF.cl2, 1e-15, "D(e^{iπ/3}) = Cl₂(π/3)");
  for (const [x, y] of [[0.3, 0.4], [-0.7, 1.9], [2.5, 0.1], [0.5, 0.2]]) {
    const D = M.blochWigner(x, y), r2 = x * x + y * y;
    near(M.blochWigner(1 - x, -y), -D, 1e-14, `D(1 − z) = −D(z) at ${x}+${y}i`);
    near(M.blochWigner(x / r2, -y / r2), -D, 1e-14, `D(1/z) = −D(z) at ${x}+${y}i`);
    near(M.blochWigner(x, -y), -D, 1e-15, `D(z̄) = −D(z) at ${x}+${y}i`);
  }
  near(M.blochWigner(0.4, 0), 0, 1e-15, "D vanishes on the real line");
  const target = 6 * REF.zeta3, errs = [20, 40, 80, 160].map((n) => Math.abs(M.k4Quadrature(n) - target));
  errs.slice(1).forEach((e, i) => assert.ok(e < errs[i], `the error falls: ${errs}`));
  assert.ok(errs.at(-1) < 1e-7, `160 nodes: error ${errs.at(-1)}`);
});

test("point counts of the graph hypersurfaces", () => {
  for (const q of M.PRIMES) assert.equal(M.pointCount(M.GRAPH.bubble, q), q, `bubble at q = ${q}`);
  for (const q of [2, 3, 5, 7]) assert.equal(M.pointCount(M.GRAPH.ws3, q), M.K4_COUNT(q), `K₄ at q = ${q}`);
  // Out of the page's range: count K₄ at q = 11 here and compare with q⁵ + q³ − q².
  const mons = M.kirchhoff(M.GRAPH.ws3), q = 11, a = new Int32Array(6);
  let zeros = 0;
  for (let i = 0; i < q ** 6; i++) {
    let r = i; for (let e = 0; e < 6; e++) { a[e] = r % q; r = (r - a[e]) / q; }
    let s = 0; for (const m of mons) s += a[m[0]] * a[m[1]] * a[m[2]];
    if (s % q === 0) zeros++;
  }
  assert.equal(zeros, M.K4_COUNT(11));
  assert.deepEqual([...M.countablePrimes(M.GRAPH.ws6)], [2]);
  assert.equal(M.pointCount(M.GRAPH.ws6, 3), null, "too costly counts are refused");
});

/* ---------- State, exports, claims ---------- */
test("normalize repairs and reports bad input; JSON and the URL fragment round-trip", () => {
  const bad = M.normalize({ example: "nope", tate: { centre: 0.3, turns: 3, steps: 9999 }, zeta: { composition: [1, 2], terms: 0 }, feynman: { graph: "k5", nodes: 1, q: 13 } });
  assert.equal(bad.state.example, "tate");
  assert.equal(bad.state.tate.centre, 0.25); assert.equal(bad.state.tate.turns, 1); assert.equal(bad.state.tate.steps, 512);
  assert.deepEqual([...bad.state.zeta.composition], [3]); assert.equal(bad.state.zeta.terms, 1);
  assert.equal(bad.state.feynman.graph, "ws3"); assert.equal(bad.state.feynman.nodes, 4); assert.equal(bad.state.feynman.q, 5);
  assert.equal(bad.errors.length, 9, bad.errors.join("\n"));
  assert.deepEqual(plain(M.normalize(null).errors), ["The state must be an object."]);
  for (const raw of [{ example: "tate", tate: { centre: -1.5, turns: -2, steps: 40 } }, { example: "zeta", zeta: { composition: [5, 3], terms: 1000 } }, { example: "feynman", feynman: { graph: "ws4", nodes: 12, q: 3 } }]) {
    const st = M.normalize(raw).state;
    assert.deepEqual(plain(M.fromJSON(JSON.stringify(M.toJSON(st))).state), plain(st));
    const h = M.fromHash(M.toHash(st));
    assert.deepEqual(plain(h.errors), []);
    assert.deepEqual(plain(h.state[st.example]), plain(st[st.example]));
    assert.equal(h.state.example, st.example);
  }
  assert.match(M.fromJSON({ visual: "mohr", schemaVersion: 1, state: {} }).errors[0], /not motives-periods/);
  assert.match(M.fromJSON({ visual: "motives-periods", schemaVersion: 2, state: {} }).errors[0], /Schema version 2/);
  assert.match(M.fromJSON("{oops").errors[0], /Not JSON/);
  assert.equal(M.fromJSON({ visual: "motives-periods", schemaVersion: 1, state: { example: "x" } }).ok, false, "incompatible state is never silently accepted");
  assert.match(M.fromHash("#example=zeta&s=1,1").errors[0], /diverges/);
});

test("the URL fragment is laid over the current state, keeping the other examples' settings", () => {
  const cur = M.normalize({ example: "zeta", tate: { centre: 1.5, turns: -2, steps: 40 }, zeta: { composition: [5, 3], terms: 1000 }, feynman: { graph: "ws4", nodes: 12, q: 3 } }).state;
  const toFeynman = M.fromHash("#example=feynman&graph=ws3&nodes=80&q=7", cur);
  assert.deepEqual(plain(toFeynman.errors), []);
  assert.equal(toFeynman.state.example, "feynman");
  assert.deepEqual(plain(toFeynman.state.feynman), { graph: "ws3", nodes: 80, q: 7 });
  assert.deepEqual(plain(toFeynman.state.tate), plain(cur.tate));
  assert.deepEqual(plain(toFeynman.state.zeta), plain(cur.zeta));
  const back = M.fromHash(M.toHash(cur), toFeynman.state).state;
  assert.equal(back.example, "zeta");
  assert.deepEqual(plain(back.feynman), { graph: "ws3", nodes: 80, q: 7 }, "Back keeps the Feynman settings");
  assert.deepEqual(plain(M.fromHash(M.toHash(cur), cur).state), plain(cur), "the page's own fragment changes nothing");
  // A new graph without q takes that graph's offer rather than the old q.
  const ws6 = M.fromHash("#graph=ws6", cur);
  assert.deepEqual(plain(ws6.errors), []); assert.equal(ws6.state.feynman.q, 2);
  // Without a base the fragment is laid over the defaults.
  assert.deepEqual(plain(M.fromHash("#example=zeta").state), plain({ ...M.defaultState(), example: "zeta" }));
});

test("a malformed escape in the fragment is reported, not thrown", () => {
  for (const hash of ["#example=%", "#example=zeta&s=%E0", "#%zz=1&example=feynman"]) {
    const r = M.fromHash(hash);
    assert.match(r.errors[0], /not valid URL encoding/, hash);
  }
  const r = M.fromHash("#example=zeta&s=%E0&terms=500");
  assert.equal(r.state.example, "zeta"); assert.equal(r.state.zeta.terms, 500, "the valid parts still apply");
});

test("the Feynman panel states which graphs are φ⁴ graphs", () => {
  const status = (graph) => M.analyse(M.normalize({ example: "feynman", feynman: { graph } }).state).feynman.status;
  for (const g of ["bubble", "ws3", "ws4"]) assert.match(status(g), /^A φ⁴ graph/, g);
  assert.equal(status("ws5"), "Not a φ⁴ graph: the hub has degree 5 > 4. Its period follows the same wheel formula.");
  assert.equal(status("ws6"), "Not a φ⁴ graph: the hub has degree 6 > 4. Its period follows the same wheel formula.");
  const st = M.normalize({ example: "feynman", feynman: { graph: "ws5" } }).state;
  assert.ok(M.markdown(st).includes(status("ws5")));
  assert.ok(M.beamdswitchReport(st).setup[0].body.includes(status("ws5")));
});

test("every claim is sourced and every source is cited", () => {
  const ids = new Set(M.SOURCES.map((s) => s.id)), used = new Set();
  for (const ex of M.EXAMPLES) for (const c of M.CLAIMS[ex.id]) {
    assert.ok(c.src.length > 0, c.text);
    for (const id of c.src) { assert.ok(ids.has(id), `${id} is a source`); used.add(id); }
  }
  assert.deepEqual([...ids].filter((id) => !used.has(id)), []);
  for (const s of M.SOURCES) if (s.url) assert.match(s.url, /^https:\/\//);
});

test("the Markdown export states the page's numbers and its sources", () => {
  for (const [example, extra] of [["tate", {}], ["zeta", { zeta: { composition: [4] } }], ["feynman", {}]]) {
    const st = M.normalize({ example, ...extra }).state, md = M.markdown(st), a = M.analyse(st)[example];
    for (const h of ["## Inputs", "## Derived quantities", "## Result", "## Notes", "## Sources"]) assert.ok(md.includes(h), `${example}: ${h}`);
    if (example === "tate") { assert.ok(md.includes(a.sumText)); assert.ok(md.includes("2πi = 0.000000 + 6.283185i")); }
    if (example === "zeta") { assert.ok(md.includes(`ζ(4) = ${a.valueText}`)); assert.ok(md.includes("(1/1440)·(2πi)^4")); }
    if (example === "feynman") { assert.ok(md.includes("P(WS₃ = K₄) = 6ζ(3) = 7.212341418958")); assert.ok(md.includes("q = 7: 17101")); }
    for (const s of M.usedSources(example)) assert.ok(md.includes(`[${s.id}] ${s.text}`), `${example}: ${s.id}`);
  }
});

test("the no-JavaScript text quotes the engine's own numbers", () => {
  const stat = (key) => new RegExp(`data-static="${key}">([^<]*)<`).exec(html)[1];
  assert.equal(stat("zeta3"), M.mzv([3]).toFixed(15));
  assert.equal(stat("k4"), M.period(M.GRAPH.ws3).value.toFixed(12));
  assert.equal(stat("k4count"), "q⁵ + q³ − q²");
  assert.match(html, /<section id="nojs"[\s\S]*interactive lab, its exports and its self-test need JavaScript/);
});

test("the artifact is self-contained", () => {
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'/);
  assert.ok(html.length < 150_000, `${html.length} bytes`);
  assert.match(html, /<link rel="canonical" href="https:\/\/teoyujie.org\/visuals\/motives-periods\/">/);
});

/* ---------- The page and its WebMCP tools, in a stand-in DOM ---------- */
test("the page boots and its WebMCP tools answer", async () => {
  const s = standIn();
  s.run(html);
  const tools = s.context.MotivesPeriodsTools, call = async (name, input) => JSON.parse((await tools.find((t) => t.name === name).execute(input)).content[0].text);
  assert.deepEqual(plain(tools.map((t) => t.name)), ["get_metadata", "get_current_state", "compute_period", "get_beamdswitch_deck", "run_self_tests"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  assert.equal(s.$("nojs").hidden, true); assert.equal(s.$("app").hidden, false);
  assert.match(s.$("selftest-run").textContent, /^Self-test: (\d+)\/\1 pass$/);
  assert.equal((await call("get_metadata")).slug, "motives-periods");
  const cur = await call("get_current_state");
  assert.equal(cur.visual, "motives-periods"); assert.equal(cur.state.example, "tate"); assert.equal(cur.derived.winding, 1);
  const z = await call("compute_period", { example: "zeta", zeta: { composition: [2, 1] } });
  assert.equal(z.derived.valueText, M.mzv([2, 1]).toFixed(15)); assert.deepEqual(z.derived.dual, [3]);
  const f = await call("compute_period", { example: "feynman", feynman: { graph: "ws4", q: 3 } });
  assert.equal(f.derived.periodText, "20ζ(5)"); assert.equal(f.derived.count, M.pointCount(M.GRAPH.ws4, 3));
  assert.match((await call("compute_period", { example: "zeta", zeta: { composition: [1] } })).errors[0], /diverges/);
  assert.match((await call("get_beamdswitch_deck")).deck, /^---\ntitle: Motives and periods: 2πi/);
  const st = await call("run_self_tests");
  assert.equal(st.passed, st.total);
  // The tate panel shows the engine's numbers.
  assert.equal(s.$("tate-sum").textContent, M.analyse(M.defaultState()).tate.sumText);
});

test("partialSum is the defining nested sum, at depth one and above", () => {
  // ζ(2, 1) cut at n₁ ≤ 4: Σ_{n₁ > n₂ ≥ 1} 1/(n₁² n₂), written out term by term.
  const direct = 1 / 4 + (1 + 1 / 2) / 9 + (1 + 1 / 2 + 1 / 3) / 16;
  assert.ok(Math.abs(M.partialSum([2, 1], 4) - direct) < 1e-15, `${M.partialSum([2, 1], 4)} vs ${direct}`);
  assert.equal(M.partialSum([3], 1), 1);
  assert.ok(Math.abs(M.partialSum([2], 3) - (1 + 1 / 4 + 1 / 9)) < 1e-15);
});

test("normalize clamps each integer field to its limits and says so", () => {
  const { state, errors } = M.normalize({ tate: { steps: 9999 }, zeta: { terms: 0 }, feynman: { nodes: 3.6 } });
  assert.deepEqual([state.tate.steps, state.zeta.terms, state.feynman.nodes], [512, 1, 4]);
  assert.deepEqual([...errors], [
    "tate.steps must be an integer from 3 to 512; using 512.",
    "zeta.terms must be an integer from 1 to 100000; using 1.",
    "feynman.nodes must be an integer from 4 to 200; using 4.",
  ]);
  const ok = M.normalize({ tate: { steps: 40 }, zeta: { terms: 500 }, feynman: { nodes: 80 } });
  assert.deepEqual([ok.state.tate.steps, ok.state.zeta.terms, ok.state.feynman.nodes, ok.errors.length], [40, 500, 80, 0]);
});
