import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";
import { render } from "../build.mjs";

const html = read("index.html");
const block = (id) => new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`).exec(html)[1];
const ctx = {}; ctx.self = ctx; vm.runInNewContext(block("riemann-roch-engine"), ctx);
const RR = ctx.RiemannRoch;
const T = (await import("node:module")).createRequire(import.meta.url)("./fixtures/beamdswitch/template.js");
const plain = (v) => JSON.parse(JSON.stringify(v));
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const INF = RR.INF, O = RR.O, E = { a: -1, b: 1 }, E3 = { a: -1, b: 0 }; // E3: three real roots
const onE = (C, x, s = 1) => ({ x, y: s * Math.sqrt(RR.ecf(C, x)) });

test("the page is built from its sources and is one offline file", () => {
  const out = render();
  assert.equal(read("index.html"), out["index.html"], "run node build.mjs");
  assert.equal(read("raw.json"), out["raw.json"], "run node build.mjs");
  assert.match(html, /<title>Divisors, Linear Systems &amp; Riemann–Roch Laboratory<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/teoyujie\.org\/visuals\/riemann-roch">/);
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'/);
  assert.deepEqual([...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]), [' id="site-theme"', ' id="beamdswitch"', ' id="riemann-roch-engine"', ' id="riemann-roch-ui"'], "inline scripts only");
  assert.doesNotMatch(html, /\b(?:src|href)="(?:https?:)?\/\/(?!teoyujie\.org)/, "no external resources");
  assert.match(html, /<div id="nojs">[\s\S]*L\(d∞\) = ⟨1, x, …, x<sup>d<\/sup>⟩/, "a no-JavaScript fallback with the core computations");
  assert.match(html, /prefers-color-scheme:dark/); assert.match(html, /prefers-reduced-motion/);
});

test("P¹: L(d∞) = ⟨1, x, …, x^d⟩ and the search rejects x^(d+1)", () => {
  for (let d = 0; d <= 7; d++) {
    const r = RR.p1Basis([{ p: INF, n: d }]);
    assert.deepEqual(plain(r.basis.map((b) => b.label)), ["1", "x", "x²", "x³", "x⁴", "x⁵", "x⁶", "x⁷"].slice(0, d + 1), `d = ${d}`);
    assert.equal(r.ell, d + 1);
    assert.equal(r.rr.ellKD, 0, "deg D > −2 = deg K: nonspecial");
    const s = RR.p1Search(d);
    assert.deepEqual(plain(s.map((x) => x.accepted)), [...Array(d + 1).fill(true), false, false]);
  }
  assert.equal(RR.p1Basis([{ p: INF, n: -1 }]).ell, 0, "deg D < 0");
  /* D = P + Q: f = s(x)/((x − a)(x − b)) with deg s ≤ 2 */
  const pq = RR.p1Basis([{ p: RR.cx(0), n: 1 }, { p: RR.cx(1), n: 1 }]);
  assert.equal(pq.ell, 3);
  for (const b of pq.basis) assert.ok(RR.p1Eligibility(b.f, pq.D).member, `${b.label} ∈ L(P + Q)`);
  /* a forced zero: D = 2∞ − [3] means f must vanish at 3 */
  const z = RR.p1Basis([{ p: INF, n: 2 }, { p: RR.cx(3), n: -1 }]);
  assert.deepEqual(plain(z.basis.map((b) => b.label)), ["(x − 3)", "(x − 3)·x"]);
  for (const b of z.basis) assert.equal(RR.p1ord(b.f, RR.cx(3)), 1);
  assert.equal(RR.p1Eligibility({ c: 1, factors: [] }, z.D).member, false, "1 does not vanish at 3");
});

test("principal divisors on P¹ have degree 0 and match the textbook examples", () => {
  const a = RR.cx(2), b = RR.cx(-1);
  assert.equal(RR.p1str(RR.p1div({ c: 1, factors: [{ a, m: 1 }] })), "[2] − ∞");
  assert.equal(RR.p1str(RR.p1div({ c: 1, factors: [{ a, m: 1 }, { a: b, m: -1 }] })), "[2] − [−1]");
  const f = { c: 1, factors: [{ a, m: 2 }, { a: b, m: -3 }] }, D = RR.p1div(f);
  assert.equal(RR.degree(D), 0);
  assert.deepEqual([RR.p1ord(f, a), RR.p1ord(f, b), RR.p1ord(f, INF)], [2, -3, 1]);
  /* §14 eligibility: div(f) + D point by point */
  const el = RR.p1Eligibility(f, [{ p: b, n: 2 }, { p: INF, n: 1 }]);
  assert.equal(el.member, false);
  assert.deepEqual(plain(el.rows.find((r) => r.point === "−1")), { point: "−1", ord: -3, D: 2, total: -1, ok: false });
  assert.equal(RR.p1Eligibility(f, [{ p: b, n: 3 }]).member, true);
});

test("Weierstrass E at O: monomials xⁱyʲ, j ≤ 1, pole order 2i + 3j ≤ n", () => {
  const expect = { 0: ["1"], 1: ["1"], 2: ["1", "x"], 3: ["1", "x", "y"], 4: ["1", "x", "y", "x²"], 5: ["1", "x", "y", "x²", "xy"], 6: ["1", "x", "y", "x²", "xy", "x³"] };
  for (const [n, labels] of Object.entries(expect)) assert.deepEqual(plain(RR.ecBasisAtO(+n).map((b) => b.label)), labels, `L(${n}O)`);
  for (let n = 1; n <= 12; n++) {
    const b = RR.ecBasisAtO(n);
    assert.equal(b.length, n, `ℓ(${n}O) = ${n}`);
    for (const m of b) { assert.ok(m.j <= 1); assert.equal(m.pole, 2 * m.i + 3 * m.j); assert.ok(m.pole <= n); }
    assert.equal(new Set(b.map((m) => m.pole)).size, n, "distinct pole orders, so independent");
  }
  assert.deepEqual(plain(RR.gaps([2, 3])), [1], "the 2, 3 semigroup at O has the single gap 1");
  assert.deepEqual(plain(RR.poleOrders(RR.ecBasisAtO(8))), [0, 2, 3, 4, 5, 6, 7, 8]);
});

test("E: ℓ(D) = deg D for positive degree, and in degree 0 exactly the principal divisors", () => {
  const P = onE(E, 1), Q = onE(E, 3, -1), R = onE(E, 0.2);
  for (const D of [[{ p: P, n: 1 }], [{ p: P, n: 1 }, { p: Q, n: 1 }], [{ p: O, n: 2 }, { p: R, n: 1 }], [{ p: P, n: 3 }, { p: Q, n: -1 }, { p: R, n: 2 }]])
    assert.equal(RR.ecEll(E, D), RR.degree(D));
  for (const D of [[{ p: P, n: -1 }], [{ p: P, n: 1 }, { p: Q, n: -2 }]]) assert.equal(RR.ecEll(E, D), 0);
  const L = RR.ecLine(E, P, Q);
  assert.equal(RR.degree(L.divisor), 0);
  assert.equal(RR.ecEll(E, L.divisor), 1, "div(chord) = P + Q + R − 3O is principal");
  assert.equal(RR.ecEll(E, RR.ecVertical(E, P)), 1, "div(x − x(P)) = P + (−P) − 2O");
  assert.equal(RR.ecEll(E, [{ p: P, n: 1 }, { p: Q, n: -1 }]), 0, "P − Q is not principal for P ≠ Q");
  for (let d = -2; d <= 6; d++) { const D = [{ p: O, n: d }], r = RR.riemannRoch(RR.ecEll(E, D), d, 1); assert.ok(r.holds); if (d > 0) assert.equal(r.ellKD, 0); }
  assert.equal(RR.analyse({ curve: { type: "elliptic", ...E }, divisor: [{ p: P, n: 2 }] }).ell, 2);
});

test("E ≅ Pic⁰(E): the chord construction is a group law and the Abel–Jacobi map turns it into addition", () => {
  for (const C of [E, E3, { a: 2, b: 3 }]) {
    const e1 = RR.ecCubicRoots(C).at(-1), pts = [onE(C, e1 + 0.3), onE(C, e1 + 1.1, -1), onE(C, e1 + 2.7), onE(C, e1 + 0.05, -1)];
    for (const p of pts) assert.ok(RR.ecOn(C, p));
    const [P, Q, R] = pts;
    const L = RR.ecLine(C, P, Q);
    assert.ok(RR.ecOn(C, L.R, 1e-6), "the third intersection lies on E");
    assert.ok(RR.ecEq(RR.ecAdd(C, RR.ecAdd(C, P, Q), L.R), O), "P + Q + R ∼ 3O, so P ⊕ Q ⊕ R = O");
    assert.ok(RR.ecEq(RR.ecAdd(C, RR.ecAdd(C, P, Q), R), RR.ecAdd(C, P, RR.ecAdd(C, Q, R)), 1e-6), "associative");
    for (const [X, Y] of [[P, Q], [Q, R], [P, pts[3]], [P, P]]) {
      const S = RR.ecAdd(C, X, Y), u = (RR.ecAbel(C, X).u + RR.ecAbel(C, Y).u) % 1, v = RR.ecAbel(C, S).u;
      assert.ok(Math.min(Math.abs(u - v), 1 - Math.abs(u - v)) < 1e-8, `u(X ⊕ Y) = u(X) + u(Y): ${u} vs ${v}`);
    }
    for (const u of [0.1, 0.37, 0.5, 0.81]) { const X = RR.ecFromAbel(C, u, 0); close(RR.ecAbel(C, X).u, u, 1e-9, "ecFromAbel inverts ecAbel"); }
  }
  /* the egg (second real component) is a coset: egg + egg lands on the identity component */
  const [e3, e2] = RR.ecCubicRoots(E3), A = onE(E3, (e3 + e2) / 2), B = onE(E3, e3 + 0.1, -1), S = RR.ecAdd(E3, A, B);
  assert.equal(RR.ecAbel(E3, A).component, 1);
  assert.equal(RR.ecAbel(E3, S).component, 0);
  const u = (RR.ecAbel(E3, A).u + RR.ecAbel(E3, B).u) % 1, v = RR.ecAbel(E3, S).u;
  assert.ok(Math.min(Math.abs(u - v), 1 - Math.abs(u - v)) < 1e-8);
  assert.ok(RR.minimumComputations().find((c) => c.id === "pic0").ok);
});

test("|2O| is a double cover E → P¹ and |3O| recovers the Weierstrass cubic", () => {
  const m2 = RR.ecMap(E, 2);
  assert.deepEqual(plain(m2.basis.map((b) => b.label)), ["1", "x"]);
  assert.equal(m2.degreeOfMap, 2);
  assert.equal(m2.branchPoints.length, 4, "three roots of the cubic and ∞");
  assert.equal(RR.riemannHurwitz({ degree: 2, gTarget: 0, ramification: [2, 2, 2, 2] }).g, 1);
  const m3 = RR.ecMap(E, 3);
  assert.deepEqual(plain(m3.basis.map((b) => [b.label, b.pole])), [["1", 0], ["x", 2], ["y", 3]]);
  assert.ok(m3.embedding);
  for (const C of [E, E3, { a: -2, b: 0.5 }, { a: 3, b: -7 }, { a: 0, b: 2 }]) {
    const c = RR.recoverCubic(C);
    assert.equal(c.dimension, 1, "exactly one cubic relation among 1, x, y");
    close(c.a, C.a, 1e-6, "a"); close(c.b, C.b, 1e-6, "b"); close(c.x3, 1, 1e-6, "x³"); assert.ok(c.residual < 1e-6, "no other monomials");
  }
  assert.equal(RR.recoverCubic(E).equation, "y²z = x³ − xz² + z³");
  assert.equal(RR.relations(RR.ecImagePoints(E, 4).points, 2).dimension, 2, "|4O|: the image in P³ lies on two quadrics");
  const st2 = RR.ecStages(E, [{ p: O, n: 2 }], onE(E, 1.5), onE(E, 1.5, -1));
  assert.deepEqual([st2.basePointFree, st2.separatesPoints, st2.pair.separated, st2.veryAmple], [true, false, false, false], "|2O| collapses P and −P");
  assert.equal(RR.ecStages(E, [{ p: O, n: 2 }], onE(E, 1.5), onE(E, 2)).pair.separated, true);
  const st1 = RR.ecStages(E, [{ p: O, n: 1 }]);
  assert.ok(st1.basePoint && st1.basePoint.inf, "|O| has a base point at O");
  assert.ok(RR.ecStages(E, [{ p: O, n: 3 }], onE(E, 1.5), onE(E, 1.5, -1)).pair.separated);
});

test("hyperelliptic y² = f(x): bases xⁱ and y·xʲ, Riemann–Roch, gaps and the canonical system", () => {
  for (let g = 1; g <= 4; g++) {
    const degf = 2 * g + 1;
    for (let n = 0; n <= 4 * g + 3; n++) {
      const b = RR.hyperBasis(degf, n);
      for (const t of b.basis) assert.equal(t.pole, t.kind === "x" ? 2 * t.i : 2 * t.j + 2 * g + 1);
      assert.equal(new Set(b.poles).size, b.ell, "distinct pole orders at ∞");
      if (n > 2 * g - 2) assert.equal(b.ell, n + 1 - g, `ℓ(${n}∞) = n + 1 − g on genus ${g}`);
      assert.ok(RR.riemannRoch(b.ell, n, g).holds);
    }
    assert.deepEqual(plain(RR.gaps([2, 2 * g + 1])), Array.from({ length: g }, (_, i) => 2 * i + 1), "gaps 1, 3, …, 2g − 1");
    assert.deepEqual(plain(RR.poleOrders(RR.hyperBasis(degf, 4 * g + 4).basis)), plain(RR.semigroup([2, 2 * g + 1], 4 * g + 4).filter((s) => s.allowed).map((s) => s.n)));
    const K = RR.hyperBasis(degf, 2 * g - 2);
    assert.equal(K.ell, g, "ℓ(K) = g with K = (2g − 2)∞");
    assert.deepEqual(plain(K.basis.map((t) => t.kind)), Array(g).fill("x"), "L(K) = ⟨1, x, …, x^(g−1)⟩: φ_K factors through x");
    /* even degree: two points at infinity */
    for (let n = g; n <= g + 4; n++) assert.equal(RR.hyperBasis(2 * g + 2, n).ell, 2 * n + 1 - g);
    assert.equal(RR.hyperBasis(2 * g + 2, g - 1).ell, g, "(g − 1)(∞₊ + ∞₋) ∼ K");
  }
  assert.deepEqual(plain(RR.hyperBasis(5, 5).basis.map((t) => t.label)), ["1", "x", "x²", "y"]);
  const a = RR.analyse({ curve: { type: "hyperelliptic", f: [0, 4, 0, -5, 0, 1] }, divisor: [{ p: { inf: true }, n: 3 }] });
  assert.deepEqual(plain(a.basePoints), ["∞"], "3 is a gap on genus 2: ∞ is a base point of |3∞|");
  const off = RR.analyse({ curve: { type: "hyperelliptic", f: [0, 4, 0, -5, 0, 1] }, divisor: [{ p: { x: 0.5, y: 1 }, n: 1 }, { p: { inf: true }, n: 1 }] });
  assert.equal(off.exact, false, "a special-range divisor off ∞ gets bounds, not an invented basis");
  assert.equal(off.basis, null);
  assert.deepEqual([off.range.min, off.range.max], [1, 2]);
  const P = RR.analyse({ curve: { type: "hyperelliptic", f: [0, 4, 0, -5, 0, 1] }, divisor: [{ p: { x: 0.5, y: 1 }, n: 1 }] });
  assert.equal(P.exact, true, "an effective D contains the constants: ℓ(P) = 1 on genus 2");
  assert.equal(P.ell, 1); assert.ok(P.rr.holds);
  const plus = RR.analyse({ curve: { type: "hyperelliptic", f: [1, 0, 0, 0, 0, -3, 1] }, divisor: [{ p: { inf: "+" }, n: 1 }] });
  assert.equal(plus.ell, 1, "ℓ(∞₊) = 1 on an even-degree model");
  const PQ = RR.analyse({ curve: { type: "hyperelliptic", f: [0, 4, 0, -5, 0, 1] }, divisor: [{ p: { x: 0.5, y: 1 }, n: 1 }, { p: { x: 0.5, y: -1 }, n: -1 }] });
  assert.equal(PQ.exact, false, "a non-effective degree-0 divisor keeps the Riemann–Roch lower bound");
  assert.equal(PQ.range.min, 0);
});

test("Riemann–Hurwitz: genus from branch points", () => {
  for (const [b, g] of [[2, 0], [4, 1], [6, 2], [8, 3], [10, 4]]) assert.equal(RR.doubleCover(b).g, g, `${b} branch points`);
  assert.equal(RR.doubleCover(5).ok, false, "an odd number of branch points is impossible");
  for (let g = 1; g <= 4; g++) { assert.equal(RR.hyperBranchCount(2 * g + 1), 2 * g + 2); assert.equal(RR.hyperBranchCount(2 * g + 2), 2 * g + 2); assert.equal(RR.hyperGenus(2 * g + 1), g); assert.equal(RR.hyperGenus(2 * g + 2), g); }
  assert.equal(RR.riemannHurwitz({ degree: 3, gTarget: 0, ramification: [3, 3, 3] }).g, 1, "a cyclic triple cover branched at three points is elliptic");
  assert.equal(RR.riemannHurwitz({ degree: 2, gTarget: 1, ramification: [] }).g, 1, "unramified double covers of E are elliptic");
  assert.equal(RR.riemannHurwitz({ degree: 2, gTarget: 0, ramification: [2, 2, 2] }).valid, false);
  assert.equal(RR.minimumComputations().find((c) => c.id === "rh").value, "2g − 2 = 2(−2) + 6 = 2, so g = 2");
});

test("smooth plane curves: genus, adjunction and ℓ(nH)", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(RR.planeGenus), [0, 0, 1, 3, 6]);
  for (let d = 1; d <= 8; d++) {
    const a = RR.adjunction(d);
    assert.equal(a.degK, d * (d - 3)); assert.equal(a.degK, 2 * RR.planeGenus(d) - 2, `adjunction for d = ${d}`);
    assert.equal(RR.planeDifferentials(d).length, RR.planeGenus(d), "xⁱyʲ dx/F_y, i + j ≤ d − 3 give g differentials");
    for (let n = 0; n <= 6; n++) {
      const ell = RR.planeEll(d, n), deg = n * d, g = RR.planeGenus(d);
      assert.equal(RR.planeBasis(d, n).length, ell);
      if (deg > 2 * g - 2) assert.equal(ell, deg + 1 - g, `ℓ(${n}H) on degree ${d}`);
      else assert.ok(ell >= deg + 1 - g);
    }
  }
  assert.equal(RR.planeEll(4, 1), 3, "quartic: ℓ(K) = ℓ(H) = 3 = g");
  const q = RR.canonicalMap(3, false);
  assert.ok(q.embedding); assert.equal(q.imageDegree, 4); assert.equal(q.target, 2);
});

test("Bézout: intersection multiplicities add up to d·e", () => {
  const P = RR.PLANE, names = ["line", "conic", "cubic", "quartic"];
  for (const a of names) for (const b of names) {
    if (a === b) continue;
    const r = RR.intersect(P[a].F, P[b].F);
    assert.equal(r.total, P[a].d * P[b].d, `${a} × ${b}`);
  }
  assert.equal(RR.intersect(P.conic.F, P.conic.F).common, true, "a common component has no finite count");
  const t = RR.intersect(RR.lineForm(0, 1, -1), P.conic.F);
  assert.deepEqual(plain(t.points.map((p) => [p.m, p.x.re, p.y.re])), [[2, 0, 1]], "y = 1 is tangent to x² + y² = 1: one point of multiplicity 2");
  const s = RR.intersect(RR.lineForm(0, 2, -1), P.conic.F);
  assert.deepEqual(plain(s.points.map((p) => p.m)), [1, 1], "moving the line splits it into two transverse points");
  assert.deepEqual(plain(RR.intersect(P.conic.F, P.cubic.F).points.map((p) => p.m).sort()), [2, 4], "circle and y² = x³ − x: tangent at (1, 0) and of order 4 at (−1, 0)");
  assert.deepEqual(plain(RR.intersect(P.conic.F, P.quartic.F).points.map((p) => p.m)), [2, 2, 2, 2]);
  const v = RR.intersect(RR.lineForm(1, 0, -1), RR.cubicForm(E));
  assert.equal(v.total, 3);
  assert.ok(v.points.some((p) => !p.affine && p.m === 1), "the vertical line meets E at O = [0 : 1 : 0]");
  /* the chord through P, Q meets E at the third point R of the group law */
  const Pp = onE(E, 1), Qq = onE(E, 3, -1), L = RR.ecLine(E, Pp, Qq), I = RR.intersect(RR.lineForm(-L.lambda, 1, -L.nu), RR.cubicForm(E));
  assert.equal(I.total, 3);
  assert.ok(I.points.some((p) => p.affine && Math.abs(p.x.re - L.R.x) < 1e-6 && Math.abs(p.y.re - L.R.y) < 1e-6));
});

test("Riemann–Roch on an abstract curve: deg K = 2g − 2, the nonspecial regime and Clifford", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(RR.degK), [-2, 0, 2, 4, 6]);
  for (let g = 0; g <= 5; g++) for (let d = -3; d <= 2 * g + 4; d++) {
    const r = RR.rrRange(d, g);
    if (d < 0) assert.deepEqual([r.exact, r.min, r.max], [true, 0, 0]);
    else if (d > 2 * g - 2) assert.deepEqual([r.exact, r.min, r.regime], [true, d + 1 - g, "nonspecial"]);
    else { assert.equal(r.min, Math.max(0, d + 1 - g)); assert.equal(r.max, Math.floor(d / 2) + 1); }
  }
  for (let g = 2; g <= 6; g++) {
    for (const h of [true, false]) for (const p of RR.cliffordData(g, h).points) if (p.d <= 2 * g - 2) assert.ok(p.ell <= p.d / 2 + 1, "Clifford");
    assert.ok(RR.cliffordData(g, true).points.filter((p) => p.d % 2 === 0 && p.d <= 2 * g - 2).every((p) => p.ell === p.d / 2 + 1), "hyperelliptic saturates at even degree");
    assert.equal(RR.abstractEll(2 * g - 2, g, "canonical"), g, "ℓ(K) = g");
  }
  assert.deepEqual(plain(RR.gapSequence(4)), [1, 2, 3, 4], "generic gaps 1..g");
  assert.deepEqual(plain(RR.gapSequence(3, "hyperelliptic")), [1, 3, 5]);
  assert.equal(RR.weierstrassWeight([1, 3, 5]), 3); assert.equal(RR.weierstrassWeight([1, 2, 3]), 0);
});

test("canonical maps: genus 2 is a double cover, quartics embed, hyperelliptic curves fold", () => {
  const k2 = RR.canonicalMap(2, true);
  assert.deepEqual([k2.target, k2.degreeOfMap, k2.embedding], [1, 2, false]);
  assert.ok(RR.canonicalMap(2, false).impossible);
  const h3 = RR.canonicalMap(3, true);
  assert.deepEqual([h3.degreeOfMap, h3.imageDegree], [2, 2], "2 : 1 onto a conic: 2 · 2 = 4 = deg K");
  const n4 = RR.canonicalMap(4, false);
  assert.deepEqual([n4.embedding, n4.imageDegree, n4.target], [true, 6, 3]);
  for (let g = 2; g <= 4; g++) { const h = RR.canonicalMap(g, true); assert.equal(h.degreeOfMap * h.imageDegree, 2 * g - 2); }
  const v = RR.veronese(2);
  assert.deepEqual(plain(v.quadricEquations), ["XZ − Y² = 0"], "the conic XZ = Y²");
  for (let d = 2; d <= 5; d++) { const x = RR.veronese(d); assert.equal(x.quadrics, x.expectedQuadrics, `rational normal curve of degree ${d}`); assert.equal(x.quadricEquations.length, x.expectedQuadrics); }
  const g2 = RR.analyse(RR.PRESETS.find((p) => p.id === "k2").state);
  assert.deepEqual(plain(g2.basis), ["1", "x"]); assert.equal(g2.canonical, true); assert.equal(g2.map.degreeOfMap, 2);
  const six = RR.analyse(RR.PRESETS.find((p) => p.id === "six").state);
  assert.equal(six.g, 2); assert.equal(six.branchPoints, 6);
});

test("computation mode parses curves and divisors and refuses what it cannot do", () => {
  const r = RR.compute("y^2 = x^5 - x + 1", "3inf");
  assert.deepEqual([r.g, r.ell, r.deg], [2, 2, 3]); assert.deepEqual(plain(r.basis), ["1", "x"]);
  assert.deepEqual(plain(RR.compute("y^2 = x^5 - x + 1", "6∞").basis), ["1", "x", "x²", "y", "x³"]);
  const k = RR.compute("y² = x⁷ − x", "K");
  assert.deepEqual([k.g, k.ell], [3, 3]); assert.deepEqual(plain(k.differentials), ["dx/y", "x dx/y", "x² dx/y"]);
  const e = RR.compute("y^2 = x^3 - 2x + 1", "4O");
  assert.ok(e.curve.weierstrass); assert.deepEqual(plain(e.basis), ["1", "x", "y", "x²"]);
  const p = RR.compute("P1", "2[0] + [1] - [inf]");
  assert.equal(p.ell, 3); assert.equal(p.deg, 2);
  assert.equal(RR.compute("P1", "K").ell, 0, "ℓ(K) = 0 on P¹");
  assert.throws(() => RR.compute("y^2 = x^3", "3inf"), /repeated root/);
  assert.throws(() => RR.compute("y^2 = x^5 + 1", "[2]"), /supports divisors n∞/);
  assert.throws(() => RR.compute("x^2 + y^2 = 1", "3inf"), /P1 or y\^2 = f\(x\)/);
  assert.equal(RR.compute("P1", "60inf").ell, 61);
  for (const [c, d] of [["P1", "999999999inf"], ["P1", "-61O"], ["P1", "999999999[0]"], ["P1", "40[0] + 30[0]"], ["y^2 = x^5 - x + 1", "61inf"]])
    assert.throws(() => RR.compute(c, d), /\|n\| ≤ 60/, `${c}, ${d} is refused`);
});

test("every minimum computation of the specification holds, and raw.json agrees", () => {
  const mc = RR.minimumComputations();
  assert.deepEqual(plain(mc.map((c) => c.id)), ["p1-L", "e-ell", "e-2o", "e-3o", "cubic", "rh", "plane", "k2", "quartic", "pic0"]);
  for (const c of mc) assert.ok(c.ok, c.claim);
  const raw = JSON.parse(read("raw.json"));
  assert.deepEqual(raw.minimum_computations, plain(mc));
  assert.deepEqual(raw.presets.map((p) => p.id), plain(RR.PRESETS.map((p) => p.id)));
  assert.equal(RR.PRESETS.length, 11);
  for (const p of RR.PRESETS) { const a = RR.analyse(p.state); assert.ok(a.exact, p.id); assert.ok(a.rr.holds, p.id); }
  assert.equal(RR.REFERENCES.length, 4);
  for (const r of RR.REFERENCES) assert.doesNotMatch(r.where, /\bp\.\s*\d|pages? \d/i, "chapter-level references only");
});

test("every preset's deck opens in beamdswitch as the standard narrated template", () => {
  assertTemplateCopy();
  assertInlined(html, "beamdswitch", read("tests/fixtures/beamdswitch/template.js"), "riemann-roch");
  for (const p of RR.PRESETS) {
    const md = T.deck(RR.report(p.state));
    assertStandardDeck(md, p.id);
    assert.match(md, /^voice: bf_emma$/m);
  }
  assertStandardDeck(T.deck(RR.report({ curve: { type: "abstract", g: 3 }, divisor: { kind: "points", points: [{ n: 1, label: "P" }, { n: 1, label: "Q" }] } })), "abstract special range");
});

test("the page boots, its WebMCP tools answer, and the deck buttons export the page as set", async () => {
  const page = await openPage("riemann-roch");
  assert.equal(page.run('document.getElementById("app").hidden'), false, "the app replaces the no-JavaScript text");
  assert.equal(page.run('document.getElementById("nojs").hidden'), true);
  const tools = page.run("RiemannRochTools");
  assert.deepEqual(plain(tools.map((t) => t.name)), ["get_metadata", "get_current_state", "compute_linear_system", "apply_riemann_hurwitz", "run_minimum_computations"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true);
  const call = async (name, args = {}) => JSON.parse((await tools.find((t) => t.name === name).execute(args)).content[0].text);
  assert.equal((await call("get_metadata")).url, "https://teoyujie.org/visuals/riemann-roch");
  const st = await call("get_current_state");
  assert.deepEqual([st.divisor, st.ell, st.basis], ["3∞", 4, ["1", "x", "x²", "x³"]]);
  assert.deepEqual((await call("compute_linear_system", { curve: "y^2 = x^3 - x + 1", divisor: "3O" })).basis, ["1", "x", "y"]);
  assert.equal((await call("compute_linear_system", { curve: "elephant", divisor: "3O" })).ok, false);
  assert.equal((await call("apply_riemann_hurwitz", { degree: 2, ramification: [2, 2, 2, 2, 2, 2] })).g, 2);
  assert.ok((await call("run_minimum_computations")).every((c) => c.ok));
  for (const p of RR.PRESETS) page.run(`RiemannRochPage.loadPreset(${JSON.stringify(p.id)})`);
  for (const c of ["P1", "elliptic", "hyperelliptic", "plane", "abstract"]) page.run(`RiemannRochPage.setCurve(${JSON.stringify(c)})`);
  page.run('RiemannRochPage.loadPreset("e-3o")');
  assert.deepEqual((await call("get_current_state")).basis, ["1", "x", "y"]);
  await assertButtonsExport(page, "riemann-roch", T.deck(RR.report(RR.PRESETS.find((p) => p.id === "e-3o").state)));
});
