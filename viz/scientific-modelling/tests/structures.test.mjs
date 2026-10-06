// Scientific Modelling, piece 5: the structures families. The numerical kernel against exact values, the declaration
// test of each structures model (the six parts, the standard example against the declared form, the acceptance
// checks against tools/structures_references.py), the Euler column anchor (anchor test 4) with its explicit
// separation from post-buckling claims, the elastica's branch point, exact series, symmetry and stability, the exact
// rational checks of the oscillator and the thermoelastic models, the failure example, invalidation, and the
// agreement of the page's data with the Markdown record and the deck.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assertStandardDeck } from "../../../scripts/kit/checks.mjs";

const require = createRequire(import.meta.url);
const SN = require("../src/structures-num.js");
const STR = require("../src/structures.js");
const Q = require("../src/rational.js");
const R = require("../src/record.js");
const D = require("../src/declare.js");
const Model = require("../src/model.js");
const Report = require("../src/report.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const Beamdswitch = require("../../../scripts/templates/beamdswitch.js");
const DATA = require("../raw.json");
const ENGINE = Model.engineData(DATA);
const REF = DATA.structures;

const STRUCTURES = { "euler-column": "euler-column", "beam-column": "beam-deflection", elastica: "elastica", "damped-oscillator": "damped-oscillator", "beam-modes": "beam-modes",
  "navier-plate": "navier-plate", "cylindrical-shell": "cylindrical-shell", "thermal-rod": "thermal-rod", "thermal-plate": "thermal-plate" };
const state = (example, patch = {}) => VisualKit.normalize(Model.FIELDS, { example, tool: "regime", ...patch }).state;
const confirmed = (example) => R.confirm(R.fromExample(ENGINE, example));
const derive = (example, patch = {}, rec = confirmed(example)) => Model.derive(state(example, patch), DATA, rec);
const PI2 = Math.PI ** 2;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

test("the kernel: Jacobi and the generalized eigenproblem, RK4 at order 4, the AGM for K, and the three exact algebras", () => {
  const e = SN.jacobi([[2, -1, 0], [-1, 2, -1], [0, -1, 2]]);
  [2 - Math.SQRT2, 2, 2 + Math.SQRT2].forEach((x, i) => assert.ok(Math.abs(e.values[i] - x) < 1e-12));
  const g = SN.geneig([[2, 0], [0, 6]], [[1, 0], [0, 2]]);
  assert.ok(Math.abs(g.values[0] - 2) < 1e-12 && Math.abs(g.values[1] - 3) < 1e-12);
  const err = [20, 40].map((n) => Math.abs(SN.rk4((t, y) => [-y[0]], [1], 0, 1, n).y[0] - Math.exp(-1)));
  assert.ok(Math.log2(err[0] / err[1]) > 3.8, "RK4 is of order 4");
  assert.ok(Math.abs(SN.ellipK(0) - Math.PI / 2) < 1e-15 && Math.abs(SN.ellipK(0.5) - 1.854074677301372) < 1e-14);
  // Polynomials: (X − 2X³ + X⁴)/24 has the fourth derivative 1.
  assert.ok(SN.pzero(SN.psub(SN.pderivN(SN.poly([0, "1/24", 0, "-1/12", "1/24"]), 4), SN.poly([1]))));
  // Sines: sin(2πX)'' = −4π² sin(2πX), and sin(2π·½) = 0.
  const s = [{ c: Q.ONE, p: 0, fn: "sin", k: Q.q(2n) }];
  assert.deepEqual(SN.tcollect([...SN.tderivN(s, 2), ...SN.tscale(s, Q.q(4n), 2)]), []);
  assert.deepEqual(SN.tvalue(s, Q.q(1n, 2n)), {});
  // e^(−ξ)(cos ξ + sin ξ) has the fourth derivative −4 times itself.
  assert.deepEqual(SN.ederivN([Q.ONE, Q.ONE], 4).map(Q.str), ["-4", "-4"]);
});

test("the declaration test: each structures model has its six parts, matches its standard example exactly and passes every acceptance check", () => {
  for (const [id, example] of Object.entries(STRUCTURES)) {
    const decl = D.find(DATA, id);
    assert.ok(decl, id);
    assert.deepEqual(D.problemsOf(decl), [], id);
    assert.equal(decl.piece, 5);
    assert.equal(decl.acceptance.example, example);
    for (const m of D.METHODS) assert.ok(typeof decl.methods[m.id].applies === "boolean" && decl.methods[m.id].reason.length > 20, `${id}: ${m.id} has a reason`);
    const d = derive(example);
    assert.ok(d.regime && d.regime.ready, `${id}: ${d.regime?.message} ${JSON.stringify(d.regime?.problems ?? [])}`);
    assert.equal(d.regime.declaration.id, id);
    assert.ok(d.regime.acceptance.length >= 2, `${id} has acceptance checks`);
    for (const c of d.regime.acceptance) {
      assert.ok(c.passed, `${id}: ${c.title}: ${c.detail}`);
      assert.ok(["exact", "numerical"].includes(c.status));
      if (c.status === "numerical") assert.ok(c.tolerance, `${id}: ${c.id} states its tolerance`);
    }
    assert.ok(d.results.some((r) => r.id === "r-rm-match" && r.status === "exact"), `${id}: the record's dimensionless model equals the declared one`);
  }
  // Section 10: the four methods across the structures declarations, each with its reason.
  for (const m of ["dominant-balance", "asymptotic", "stability", "bifurcation"]) assert.ok(Object.keys(STRUCTURES).some((id) => D.find(DATA, id).methods[m].applies), m);
});

test("anchor test 4, the Euler column: dimensionless load, critical eigenvalue π², the mode and the explicit separation from post-buckling claims", () => {
  const d = derive("euler-column");
  const nd = d.nondim.equations.find((e) => e.id === "e-column");
  assert.match(nd.dimensionlessPlain, /d\(W,X,X,X,X\)/);
  const st = d.stability;
  assert.ok(st.ready && st.analysis.generic);
  const byId = Object.fromEntries(d.results.map((r) => [r.id, r]));
  assert.match(byId["r-st-lambda"].title, /λ = PL²\/\(EI\) = 9\/4/, "the record's λ is exact: 10⁵ · 9 / (2·10¹¹ · 2·10⁻⁶)");
  assert.equal(byId["r-st-lambda"].status, "exact");
  assert.equal(byId["r-st-modes"].status, "exact");
  assert.ok([1, 2, 3].every(STR.bucklingModeCheck));
  const fe = STR.feEigen(32, "buckling");
  assert.ok(rel(fe.values[0], PI2) < 1e-6 && rel(fe.values[1], 4 * PI2) < 1e-4);
  const sep = byId["r-st-amplitude"];
  assert.equal(sep.status, "unresolved", "the linear model makes no post-buckling claim");
  assert.match(sep.next, /elastica/);
  // P_cr = π²EI/L² = π² · 4·10⁵ / 9 N.
  assert.match(byId["r-st-critical"].title, new RegExp(`P_cr = ${String(Math.round((PI2 * 4e5) / 9)).slice(0, 4)}`));
  const mode1 = st.analysis.figures[0].series[0].pts;
  for (const [x, y] of mode1) assert.ok(Math.abs(y - Math.sin(Math.PI * x)) < 1e-6, "mode 1 is sin(πX)");
});

test("the elastica: branch point π², the exact series 1/8, symmetry, stability by the second variation, and the eccentric branch against SciPy", () => {
  assert.deepEqual(STR.elasticaSeries(3), REF.elastica.series, "the page's rational series equals SymPy's series of K");
  for (const row of REF.elastica.perfect) {
    const t = (row.theta0deg * Math.PI) / 180;
    assert.ok(rel(4 * SN.ellipK(Math.sin(t / 2) ** 2) ** 2, row.lambda) < 1e-12, `AGM against mpmath at ${row.theta0deg}°`);
    assert.ok(Math.abs(STR.perfectTheta0(row.lambda) - t) < 1e-9);
  }
  for (const row of REF.elastica.imperfect) assert.ok(Math.abs(STR.naturalTheta0(row.lambda, row.ehat, 200) - row.theta0) < 1e-6, `SciPy at λ = ${row.lambda}`);
  const d = derive("elastica");
  const byId = Object.fromEntries(d.results.map((r) => [r.id, r]));
  assert.match(byId["r-st-bp"].title, /λ\/π² = 1 /);
  assert.equal(byId["r-st-series"].status, "exact");
  assert.match(byId["r-st-stable"].title, /0 unstable direction at λ = π²\/2 .* and 1 at the record's λ = 12\. The buckled shape there .* has 0/);
  assert.equal(byId["r-st-imperfect"].status, "numerical");
  assert.equal(byId["r-st-coverage"].status, "unresolved", "the search coverage stays visible");
  assert.ok(d.regime.layers.some((l) => l.kind === "bifurcation" && l.curves.length === 1));
});

test("vibration: the oscillator's steady solution, peak and energy balance are exact in rationals; the beam modes converge to (nπ)⁴", () => {
  const e = STR.oscillatorExact(Q.q(1n, 10n), Q.q(9n, 10n));
  assert.ok(e.particular && e.energy);
  assert.equal(e.H2, "2000/137");
  assert.deepEqual(e.peak, { r2: "49/50", H2: "2500/99" });
  const d = derive("damped-oscillator");
  assert.ok(d.results.some((r) => r.id === "r-st-roots" && r.status === "exact" && /ζ = 1\/10/.test(r.title)));
  assert.ok(d.regime.layers.find((l) => l.id === "inertia-stiffness").curves.length >= 1, "the inertia–stiffness crossover r = 1 is on the map");
  for (const k of [1, 2, 3]) assert.ok(STR.sineModeCheck(k, Q.q(5n, 2n)), `sin(${k}πX) with λ = 5/2`);
  const fe = STR.feEigen(8, "vibration");
  REF.modes.scipy8.slice(0, 3).forEach((v, k) => assert.ok(rel(fe.values[k], v) < 1e-10, `SciPy mode ${k + 1}`));
});

test("plates and shells: the Navier series against mpmath, the strip limit, and the exact edge solution of the cylinder", () => {
  for (const r of REF.plate.navier) {
    const s = STR.navier(r.beta, r.nu, 61);
    assert.ok(rel(s.w, r.w) < 1e-6 && rel(s.mx, r.mx) < 1e-5, `β = ${r.beta}`);
  }
  assert.ok(Math.abs(STR.navier(1, 0.3, 61).w - 0.0040624) < 1e-7, "Kelly's 0.0040624");
  assert.ok(rel(STR.navier(40, 0.3, 61).w, 5 / 384) < 1e-3, "a long plate bends like a strip");
  const sh = STR.shellSolution(20);
  assert.ok(Math.abs(sh.W(0)) < 1e-12 && Math.abs(sh.W(0, 1)) < 1e-12 && Math.abs(sh.W(sh.xl, 1)) < 1e-12 && Math.abs(sh.W(sh.xl, 3)) < 1e-12);
  assert.ok(Math.abs(sh.W(0, 2) - 2) < 1e-9, "the edge curvature W_ξξ(0) = 2 gives M_0 = p/(2β²)");
  const d = derive("cylindrical-shell");
  assert.ok(d.regime.acceptance.find((c) => c.id === "beta").passed, "the record's D, E, h and ν agree exactly");
});

test("thermoelasticity: the rod against its spring and the plate held at its edges are exact in rationals", () => {
  const rod = derive("thermal-rod");
  const sol = rod.regime.acceptance.find((c) => c.id === "solution");
  assert.match(sol.title, /κ = 4 /);
  assert.match(sol.detail, /σ = .*-96000000 Pa/, "σ = −EαΔT · κ/(1 + κ) = −1.2·10⁸ · 4/5");
  assert.ok(rod.regime.acceptance.find((c) => c.id === "energy").passed);
  const plate = derive("thermal-plate");
  const m = plate.regime.acceptance.find((c) => c.id === "membrane");
  assert.ok(m.passed && /σ = -6440000000\/67 Pa/.test(m.detail), m.detail);
  assert.ok(plate.regime.acceptance.every((c) => c.status === "exact"));
});

test("the beam under a uniform load: W(½) = 5/384 exactly, and the amplification factor near the critical load", () => {
  assert.ok(Math.abs(STR.beamMid(0) - 5 / 384) < 1e-15);
  assert.ok(Math.abs(STR.beamMid(1.0001e-3) - STR.beamMid(0.9999e-3)) < 1e-9, "the closed form meets its series");
  assert.ok(rel(STR.beamMid(9), 5 / 384 / (1 - 9 / PI2)) < 5e-3, "the amplification factor holds within 0.5 % at λ = 9");
  const d = derive("beam-deflection");
  assert.ok(d.regime.acceptance.find((c) => c.id === "mid").passed);
});

test("failure: a plastic collapse load needs a separate declaration, with the next action; the Finder still runs", () => {
  const d = derive("fail-plastic");
  const r = d.results.find((x) => x.id === "r-rm-unresolved");
  assert.equal(r.status, "unresolved");
  assert.match(r.title, /plasticity, which requires a separate declaration/);
  assert.match(r.next, /yield law and plastic hinges/);
  assert.ok(d.finder && d.finder.ready, "calculations that do not read the declaration still run");
});

test("invalidation: an edit of the load after confirmation invalidates the structures results that read it", () => {
  const rec = confirmed("euler-column");
  const edited = R.edit(rec, (inp) => { inp.variables.find((v) => v.id === "v-P").value = "200000"; }, "Changed P.");
  const d = Model.derive(state("euler-column"), DATA, edited);
  const stale = d.results.filter((r) => !r.valid);
  assert.ok(stale.some((r) => r.id === "r-st-lambda"), "the stability results read P");
  const again = Model.derive(state("euler-column"), DATA, R.confirm(edited));
  assert.match(again.results.find((r) => r.id === "r-st-lambda").title, /= 9\/2/);
});

test("the page's data, the Markdown record and the deck agree for every structures example", () => {
  for (const ex of Object.values(STRUCTURES)) {
    const st = state(ex);
    const d = derive(ex);
    const rep = Report.report(st, d, DATA);
    const md = Beamdswitch.deck(rep);
    assertStandardDeck(md, ex);
    const all = [...rep.setup, ...rep.method, ...rep.results, ...rep.checks].map((f) => f.body ?? f.key ?? "").join("\n");
    for (const r of d.results.filter((x) => x.id.startsWith("r-st-") || x.id.startsWith("r-rm-accept-"))) assert.ok(all.includes(r.title.replace(/\|/g, "\\|")), `${ex}: ${r.id} is in the report`);
    if (d.stability?.analysis?.generic) for (const t of d.stability.analysis.tables) for (const row of t.rows) assert.ok(all.includes(`| ${row.join(" | ")} |`), `${ex}: table row ${row[0]}`);
  }
});
