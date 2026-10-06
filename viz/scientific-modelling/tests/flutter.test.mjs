// Scientific Modelling, piece 9: fluid–structure interaction. The typical-section declaration and its two records,
// the Bessel functions and Theodorsen's function against mpmath, the eigenvalue solver against SciPy, the onset of
// both methods against tools/flutter_references.py, the exact divergence speed, the convergence of RK4, the results
// that stay unresolved without a nonlinear model, invalidation, and the agreement of the page's data with the
// Markdown record and the deck.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assertStandardDeck } from "../../../scripts/kit/checks.mjs";

const require = createRequire(import.meta.url);
const FSI = require("../src/flutter.js");
const R = require("../src/record.js");
const D = require("../src/declare.js");
const Model = require("../src/model.js");
const Report = require("../src/report.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const Beamdswitch = require("../../../scripts/templates/beamdswitch.js");
const DATA = require("../raw.json");
const ENGINE = Model.engineData(DATA);
const REF = DATA.flutterrefs;

const state = (example, patch = {}) => VisualKit.normalize(Model.FIELDS, { example, tool: "regime", ...patch }).state;
const confirmed = (example) => R.confirm(R.fromExample(ENGINE, example));
const derive = (example, patch = {}, rec = confirmed(example)) => Model.derive(state(example, patch), DATA, rec);
const mine = (d) => d.results.filter((r) => r.id.startsWith("r-fsi-"));
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const GT = { a: "-1/5", e: "-1/10", mu: "20", r2: "4/25", sigma: "2/5" };

test("the declaration of piece 9: the six parts, the four methods with reasons, the family of the roadmap and both examples", () => {
  const list = D.declarations(DATA).filter((d) => d.piece === 9);
  assert.deepEqual(list.map((d) => d.id), ["typical-section"]);
  const decl = list[0];
  assert.deepEqual(D.problemsOf(decl), []);
  assert.equal(decl.family, "fluid-structure-interaction");
  assert.deepEqual(DATA.roadmap.families.filter((f) => f.piece === 9).map((f) => f.id), ["fluid-structure-interaction"]);
  for (const m of ["dominant-balance", "asymptotic", "stability", "bifurcation"]) assert.ok(decl.methods[m].reason.length > 40, m);
  assert.ok(decl.methods.stability.applies && !decl.methods["dominant-balance"].applies);
  for (const ex of ["flutter", "flutter-hp"]) assert.ok(Model.EXAMPLES.some((e) => e.id === ex), ex);
  assert.equal(decl.acceptance.example, "flutter");
});

test("each record matches the declared dimensionless form exactly, with the parameters of the source as exact fractions", () => {
  const want = { flutter: { V: "3/2", mu: "20", r2: "4/25", sigma: "2/5", a: "-1/5", xt: "1/10" }, "flutter-hp": { V: "3/2", mu: "20", r2: "6/25", sigma: "2/5", a: "-1/5", xt: "1/10" } };
  for (const [ex, params] of Object.entries(want)) {
    const rg = derive(ex).regime;
    assert.ok(rg.ready, `${ex}: ${rg.message} ${rg.problems?.join(" ")}`);
    assert.equal(rg.declaration.id, "typical-section");
    assert.deepEqual(Object.fromEntries(rg.params.map((p) => [p.id, p.exact ?? p.record])), params);
    assert.ok(rg.acceptance.length >= 12 && rg.acceptance.every((a) => a.passed), `${ex}: ${rg.acceptance.filter((a) => !a.passed).map((a) => a.title).join("; ")}`);
  }
});

test("Theodorsen's function from the Bessel functions agrees with mpmath at 12 reduced frequencies, on both sides of the series limit", () => {
  for (const r of REF.theodorsen) {
    const C = FSI.theodorsen(r.k);
    assert.ok(Math.hypot(C.re - r.re, C.im - r.im) <= 1e-10, `k = ${r.k}`);
  }
  const C0 = FSI.theodorsen(1e-12);
  assert.deepEqual([C0.re, C0.im], [1, 0], "C(k) → 1 as k → 0");
  // The Jones transfer function is the Laplace form of φ(s) = 1 − 0.165e^(−0.0455s) − 0.335e^(−0.3s): C_J(0) = 1 and C_J(∞) = 1/2.
  assert.ok(Math.abs(FSI.jones(0).re - 1) < 1e-15 && Math.abs(FSI.jones(1e9).re - 0.5) < 1e-9);
});

test("the eigenvalues of the Jones state matrix agree with SciPy, and both onsets agree with mpmath and SciPy", () => {
  for (const c of REF.cases) {
    const P = FSI.parameters(c.parameters);
    const mine = FSI.eigenvalues(FSI.stateMatrix(P, c.eigenvalues.V)).map((p) => [p.re, p.im]).sort((x, y) => x[1] - y[1] || x[0] - y[0]);
    c.eigenvalues.values.forEach((v, i) => assert.ok(Math.hypot(mine[i][0] - v[0], mine[i][1] - v[1]) < 1e-12, `${c.id}: eigenvalue ${i}`));
    const A = FSI.analyse(c.parameters);
    assert.ok(rel(A.theodorsen.k.V, c.theodorsen.V) < 1e-9 && rel(A.theodorsen.k.Omega, c.theodorsen.Omega) < 1e-9 && rel(A.theodorsen.k.k, c.theodorsen.k) < 1e-9, `${c.id}: Theodorsen onset`);
    assert.ok(rel(A.state.onset.V, c.state.V) < 1e-9 && rel(A.state.onset.Omega, c.state.Omega) < 1e-9, `${c.id}: state-space onset`);
    assert.equal(A.divergence.V2, c.divergence.V2, `${c.id}: V_D² exactly`);
    const x = FSI.expm(FSI.stateMatrix(P, c.response.V), c.response.tau).map((row) => row.reduce((s, v, j) => s + v * [0, 1, 0, 0, 0, 0][j], 0));
    x.forEach((v, j) => assert.ok(Math.abs(v - c.response.x[j]) < 1e-10, `${c.id}: exp(τA)x₀, state ${j}`));
  }
});

test("the Georgia Tech section: flutter at V_F = 1.8738 (Theodorsen) and 1.8614 (Jones), within 1 %, before divergence at V_D² = 16/3", () => {
  const A = FSI.analyse(GT, { speed: 1.5 });
  assert.ok(Math.abs(A.theodorsen.k.V - 1.873756) < 1e-6 && Math.abs(A.theodorsen.k.Omega - 0.602248) < 1e-6);
  assert.ok(rel(A.theodorsen.pk.V, A.theodorsen.k.V) < 1e-7, "the p–k method and the k method solve the same determinant");
  assert.ok(rel(A.jonesFrequency.k.V, A.state.onset.V) < 1e-8, "the Jones C(k) and the Jones state space are the same aerodynamics");
  assert.ok(rel(A.state.onset.V, A.theodorsen.k.V) < 0.01 && rel(A.state.onset.V, A.theodorsen.k.V) > 0.001, "the methods differ only by the Jones approximation");
  assert.equal(A.state.onset.kind, "flutter");
  assert.equal(A.params.exact.VD2, "16/3");
  assert.equal(A.first.theodorsen.kind, "flutter");
  assert.ok(A.state.onset.slope > 0, "a transversal crossing: the eigenvalue conditions of a Hopf bifurcation");
  assert.equal(A.response.kind, "decays", "below the onset the response decays");
  assert.equal(FSI.analyse(GT, { speed: 2 }).response.kind, "grows", "above the onset the linear response grows");
  // A section with the elastic axis ahead of the quarter chord has no divergence speed.
  assert.equal(FSI.analyse({ ...GT, a: "-3/5", e: "-1/2" }).divergence.exists, false);
});

test("convergence: RK4 at the onset converges to the matrix exponential at order 4", () => {
  const A = FSI.analyse(GT);
  const rows = A.convergence.rows;
  assert.equal(rows.length, 5);
  for (const r of rows.slice(1)) assert.ok(r.order > 3.5 && r.order < 4.5, `order ${r.order}`);
  assert.ok(rows.at(-1).error < 1e-6);
});

test("the domain is checked exactly, and the nonlinear amplitude and the Hopf classification stay unresolved", () => {
  assert.equal(FSI.analyse({ ...GT, r2: "1/200" }).ready, false, "r² < x_θ²: the mass matrix is not positive definite");
  const d = derive("flutter");
  const r = (id) => d.results.find((x) => x.id === `r-fsi-${id}`);
  assert.equal(r("domain").status, "exact");
  assert.equal(r("divergence").status, "exact");
  for (const id of ["k", "pk", "ss", "consistency", "agreement", "reference", "convergence", "hopf"]) assert.equal(r(id).status, "numerical", id);
  for (const id of ["amplitude", "classification"]) { assert.equal(r(id).status, "unresolved", id); assert.ok(r(id).next.length > 20, id); }
  assert.ok(mine(d).filter((x) => x.status === "numerical").every((x) => x.tolerance), "every numerical result states its tolerance");
});

test("invalidation: a new mass ratio changes the analysis only after the researcher confirms the new version", () => {
  const rec = confirmed("flutter");
  const edited = R.edit(rec, (inp) => { inp.variables.find((v) => v.id === "v-m").value = "28.863"; }, "Changed m.");
  const before = derive("flutter", {}, edited);
  assert.ok(before.results.some((x) => !x.valid), "results that read m are invalidated");
  const after = derive("flutter", {}, R.confirm(edited));
  assert.deepEqual(after.regime.params.find((p) => p.id === "mu").exact, "30");
  assert.ok(mine(after).every((x) => x.valid));
  assert.equal(after.results.find((x) => x.id === "r-fsi-reference"), undefined, "no reference covers μ = 30, so the page claims none");
});

test("agreement: for both flutter examples the page's results, the Markdown record and the deck show the same statuses and the derivation", () => {
  for (const ex of ["flutter", "flutter-hp"]) {
    const s = state(ex);
    const d = Model.derive(s, DATA, confirmed(ex));
    const report = Report.report(s, d, DATA);
    const md = VisualKit.markdown(report);
    const deck = Beamdswitch.deck(report);
    assertStandardDeck(deck, ex);
    assert.ok(mine(d).length >= 14, ex);
    for (const r of mine(d)) {
      const line = Report.resultLine(r);
      assert.ok(md.includes(line) && deck.includes(line), `${ex}: ${r.id}`);
    }
    for (const disp of d.stability.analysis.displays) for (const t of disp.tex) assert.ok(md.includes(`$$${t}$$`), `${ex}: ${disp.title}`);
  }
});

test("the eigenvalue table: above V_D the growing real eigenvalue is the divergence mode, not an aerodynamic lag", () => {
  const rec = confirmed("flutter");
  const d = derive("flutter", {}, R.confirm(R.edit(rec, (inp) => { inp.variables.find((v) => v.id === "v-U").value = "65"; }, "Changed U.")));
  const table = d.stability.analysis.tables.find((t) => t.title.startsWith("Eigenvalues of A(V)"));
  assert.equal(table.title, "Eigenvalues of A(V) at V = 2.6");
  const kinds = table.rows.map((r) => r[3]);
  assert.deepEqual(table.rows.filter((r) => Number(r[0]) > 0 && r[2] === "–").map((r) => r[3]), ["real, grows (divergence)"]);
  assert.ok(kinds.includes("real (lag or static)") && kinds.includes("structural mode"));
  assert.ok(!kinds.includes("aerodynamic lag"));
});
