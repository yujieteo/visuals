// Scientific Modelling, piece 6: the flow families. The exact kernels (polynomials, the quadratic field, the
// trigonometric integrals), each flow model against tools/flow_references.py, the declaration test of each flow
// model (its record matches the declared dimensionless form exactly and passes every acceptance check), the
// compressible nozzle anchor (anchor test 3), the regime maps and their boundaries, the failure examples with their
// failed check and next action, invalidation, and the agreement of the page's data with the record and the deck.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assertStandardDeck } from "../../../scripts/kit/checks.mjs";

const require = createRequire(import.meta.url);
const FL = require("../src/flows.js");
const Q = require("../src/rational.js");
const R = require("../src/record.js");
const D = require("../src/declare.js");
const Model = require("../src/model.js");
const Report = require("../src/report.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const Beamdswitch = require("../../../scripts/templates/beamdswitch.js");
const DATA = require("../raw.json");
const ENGINE = Model.engineData(DATA);
const REF = DATA.flows;

const FLOWS = { "pipe-poiseuille": "pipe-flow", "channel-poiseuille": "channel-flow", "nozzle-air": "nozzle-flow", "shallow-water": "hydraulic-jump", blasius: "blasius-plate", "joukowski-airfoil": "airfoil-flow" };
const FAMILIES = ["internal-viscous-flow", "compressible-nozzle-flow", "free-surface-flow", "boundary-layers", "external-aerodynamic-flow"];
const state = (example, patch = {}) => VisualKit.normalize(Model.FIELDS, { example, tool: "regime", ...patch }).state;
const confirmed = (example) => R.confirm(R.fromExample(ENGINE, example));
const derive = (example, patch = {}, rec = confirmed(example)) => Model.derive(state(example, patch), DATA, rec);
const byId = (d, id) => d.results.find((r) => r.id === id);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const TOL = { fv: 1e-3, order: 0.3, dissipation: 0.01, root: 1e-12, conservation: 1e-10, reference: 1e-9, integral: 1e-9, remainder: 0.01, pressure: 1e-12, panel: 1e-4, approximation: 0.01 };

test("exact kernels: rational polynomials, the quadratic field Q(√d) and trigonometric integrals in multiples of π", () => {
  const { P, QS } = FL;
  const p = P.of(["1", "0", "-1"]);
  assert.ok(P.eq(P.mul(P.of(["1", "1"]), P.of(["1", "-1"])), p), "(1 + x)(1 − x) = 1 − x²");
  assert.ok(Q.eq(P.defInt(P.of(["0", "1", "0", "-1"]), 0, 1), Q.q(1n, 4n)), "∫₀¹ (x − x³) dx = 1/4");
  const r2 = QS.of(Q.ZERO, Q.ONE, Q.q(2n));
  assert.ok(QS.isZero(QS.sub(QS.mul(r2, r2), QS.rat(Q.q(2n)))), "√2·√2 = 2 exactly");
  assert.equal(QS.sign(QS.of(Q.q(-141n, 100n), Q.ONE, Q.q(2n))), 1, "√2 − 1.41 > 0, decided in rationals");
  assert.equal(QS.sign(QS.of(Q.q(-142n, 100n), Q.ONE, Q.q(2n))), -1, "√2 − 1.42 < 0, decided in rationals");
  assert.ok(QS.isZero(QS.sub(QS.of(Q.q(3n), Q.ZERO, Q.q(9n)), QS.rat(Q.q(3n)))), "a rational square root collapses to a rational");
  assert.ok(Q.eq(FL.periodInt(2, 0), Q.ONE) && Q.eq(FL.periodInt(4, 0), Q.q(3n, 4n)) && Q.isZero(FL.periodInt(3, 1)), "(1/π)∫sin² = 1, (1/π)∫sin⁴ = 3/4, odd powers 0");
  assert.ok(Q.eq(FL.halfInt(2), Q.q(1n, 2n)) && Q.isZero(FL.halfInt(3)), "(1/π)∫₀^π cos² = 1/2");
  assert.ok(P.eq(FL.cheb(3), P.of(["0", "-3", "0", "4"])), "T₃ = 4c³ − 3c");
});

test("the declarations of piece 6: five families, six models, each with the six parts and its standard example", () => {
  const list = D.declarations(DATA).filter((d) => d.piece === 6);
  assert.deepEqual(list.map((d) => d.id), Object.keys(FLOWS));
  assert.deepEqual([...new Set(list.map((d) => d.family))], FAMILIES);
  for (const d of list) {
    assert.deepEqual(D.problemsOf(d), [], d.id);
    assert.equal(d.acceptance.example, FLOWS[d.id]);
    for (const m of ["dominant-balance", "asymptotic", "stability", "bifurcation"]) assert.ok(d.methods[m].reason.length > 40, `${d.id}: the reason of ${m}`);
  }
  assert.deepEqual(DATA.roadmap.families.filter((f) => f.piece === 6).map((f) => f.id), FAMILIES);
  assert.ok(DATA.roadmap.current >= 6);
});

test("each flow record matches its declared dimensionless form exactly, and its point is the record's values", () => {
  const counts = { "pipe-flow": [2, 4], "channel-flow": [2, 4], "nozzle-flow": [4, 0], "hydraulic-jump": [2, 2], "blasius-plate": [2, 4], "airfoil-flow": [1, 4] };
  for (const [id, ex] of Object.entries(FLOWS)) {
    const rg = derive(ex).regime;
    assert.ok(rg.ready, `${ex}: ${rg.message} ${rg.problems?.join(" ")}`);
    assert.equal(rg.declaration.id, id);
    assert.deepEqual([rg.match.equations.length, rg.match.conditions.length], counts[ex], ex);
  }
  const point = (ex) => Object.fromEntries(derive(ex).regime.params.map((p) => [p.id, p.exact ?? p.record]));
  assert.deepEqual(point("nozzle-flow"), { eps: "2", pb: "2/25" }, "A_e/A_t = 2 and p_b/p₀ = 0.08 exactly");
  assert.deepEqual(point("hydraulic-jump"), { F: "8000/981" }, "Fr₁² = q²/(gh₁³) exactly");
  assert.deepEqual(point("pipe-flow"), { Br: "1/1000000", Re: "1000" });
  assert.equal(point("blasius-plate").Re, "1000000/3");
});

test("internal viscous flow: P, S, f·Re and Nu are exact rationals and equal SymPy's, and finite volumes converge at second order", () => {
  for (const [kase, D_] of [["pipe", { D: 0.01 }], ["channel", { H: 0.004 }]]) {
    const out = FL.compute["internal-viscous-flow"]({ case: kase, v: { mu: 1e-3, rho: 1000, um: 0.1, k: 0.6, cp: 4180, qw: 1000, ...D_ }, tolerances: TOL });
    assert.deepEqual(out.exact, REF.internal[kase], `${kase}: the same rationals as SymPy`);
    for (const c of out.checks.filter((x) => x.status === "exact")) assert.ok(c.passed, `${kase}: ${c.title}`);
    const fv = out.checks.find((c) => c.id === "fv");
    assert.ok(fv.passed, fv.title);
    assert.match(fv.title, /order 2(\.0\d*)? \(expected 2\)/);
  }
});

const out0 = () => FL.compute["compressible-nozzle"]({ v: { gamma: 1.4, R: 287, p0: 1e6, T0: 300, At: 1e-3, Ai: 3e-3, Ae: 2e-3, pb: 8e4 }, x: { gamma: Q.q(7n, 5n) }, tolerances: TOL });

test("anchor test 3, the compressible nozzle: the conservation derivation, the sonic condition, the choked mass flow and conservation along the nozzle", () => {
  const d = derive("nozzle-flow");
  const acc = d.regime.acceptance;
  const ok = (id) => { const c = acc.find((x) => x.id === id); assert.ok(c && c.passed, `${id}: ${c?.title}`); return c; };
  assert.equal(ok("energy-mach").status, "exact", "T₀/T = 1 + M²/5 from the energy equation, in rationals");
  assert.equal(ok("exponent").status, "exact", "the exponents of the mass flux add to −3");
  assert.equal(ok("sonic").status, "exact", "dF/dM ∝ 1 − M²: the only stationary point is M = 1, a maximum");
  assert.match(ok("phi").title, /21875\/46656/);
  assert.equal(REF.nozzle.phi2, "21875/46656", "SymPy gives the same square");
  assert.equal(ok("mass").status, "numerical");
  assert.equal(ok("energy").status, "numerical");
  // Both branches of the area–Mach relation against mpmath.
  const g = FL.gas(1.4);
  assert.ok(rel(g.mach(2, "sub").x, REF.nozzle.M_sub) <= 1e-12 && rel(g.mach(2, "sup").x, REF.nozzle.M_sup) <= 1e-12);
  assert.ok(rel(g.pRatio(g.mach(2, "sub").x), REF.nozzle.p1) <= 1e-12 && rel(g.pRatio(g.mach(2, "sup").x), REF.nozzle.p3) <= 1e-12);
  const p2 = out0().outputs.find((o) => o.id === "p2").value;
  assert.ok(rel(p2, REF.nozzle.p2) <= 1e-12, `the exit-shock ratio ${p2}`);
  // Between the design ratio and the exit-shock ratio the nozzle flow is isentropic: an overexpanded jet, not a failure.
  const over = FL.compute["compressible-nozzle"]({ v: { gamma: 1.4, R: 287, p0: 1e6, T0: 300, At: 1e-3, Ai: 3e-3, Ae: 2e-3, pb: 3e5 }, x: { gamma: Q.q(7n, 5n) }, tolerances: TOL });
  assert.equal(over.regime, "overexpanded");
  assert.equal(over.checks.find((c) => c.id === "regime").status, "evidence");
  // The mass flow: choked, from p₀, T₀ and A_t only; the record's back pressure gives a supersonic exit.
  const out = out0();
  const mdot = out.outputs.find((o) => o.id === "mdot").value;
  assert.ok(rel(mdot, 1e6 * 1e-3 * REF.nozzle.phi / Math.sqrt(287 * 300)) <= 1e-12, "ṁ = p₀A_tΦ/√(R_gT₀)");
  assert.equal(out.regime, "underexpanded");
  const recon = d.regime.point.detail.reconstruction.find((r) => r.id === "recon-m");
  assert.ok(recon && rel(Number(recon.value), mdot) <= 1e-9, `the point's mass flow in kg/s: ${recon?.value}`);
  // The shock range is not a result: it is an unresolved region of the map, and the regime result names the next action.
  const shock = derive("fail-nozzle-shock");
  const regime = byId(shock, "r-st-fl-regime");
  assert.equal(regime.status, "unresolved");
  assert.match(regime.title, /A normal shock stands in the diverging part of the nozzle/);
  assert.match(regime.next, /separate declaration/);
  assert.equal(byId(shock, "r-st-fl-choked").status, "evidence", "the choked mass flow upstream of the shock stays a result");
  assert.ok(shock.regime.unresolved.count > 0 && shock.regime.unresolved.reasons.some((r) => /Shock range/.test(r.reason)));
});

test("free-surface flow: the conjugate depth, the momentum balance and the head loss are exact in Q(√d) and equal SymPy's", () => {
  const out = FL.compute["free-surface-flow"]({ v: { g: 9.81, q: 0.8, h1: 0.2 }, x: { g: Q.parse("9.81"), q: Q.parse("0.8"), h1: Q.parse("0.2") }, conditions: [{ at: "x = 0", atVar: "x" }, { at: "x = 0", atVar: "x" }], tolerances: TOL });
  const c = (id) => out.checks.find((x) => x.id === id);
  for (const id of ["characteristics", "critical", "alternate", "momentum", "loss", "admissible"]) assert.ok(c(id).passed && c(id).status === "exact", `${id}: ${c(id).title}`);
  assert.equal(out.exact.Fr1sq, REF.jump.Fr1sq);
  const h2 = out.outputs.find((o) => o.id === "h2").value, dE = out.outputs.find((o) => o.id === "dE").value, alt = out.outputs.find((o) => o.id === "hAlt").value;
  assert.ok(rel(h2, REF.jump.h2) <= 1e-14 && rel(dE, REF.jump.dE) <= 1e-12 && rel(alt, REF.jump.h_alt) <= 1e-12);
  assert.equal(c("position").limitation, true, "the position of the jump is a declared limit, not a failed check");
  // A subcritical inflow: no jump, and its boundary data differ.
  const d = derive("fail-jump-subcritical");
  assert.equal(byId(d, "r-st-fl-admissible").status, "unresolved");
  assert.match(byId(d, "r-st-fl-admissible").next, /supercritical inflow/);
  assert.equal(byId(d, "r-st-fl-characteristics").status, "unresolved");
  assert.match(byId(d, "r-st-fl-characteristics").title, /needs 1 condition at x = 0 and 1 at x = L. The model gives 2 and 0/);
  // The map: the critical boundary is exactly Fr₁² = 1.
  const rg = derive("hydraulic-jump").regime;
  const crit = rg.layers.find((l) => l.id === "critical");
  assert.ok(Math.abs(crit.curves[0].points[0][0] - 1) <= 1e-9, `boundary at ${crit.curves[0].points[0][0]}`);
  assert.equal(derive("fail-dry-bed").regime.reason, "separate-declaration");
});

test("boundary layers: exact inner-scale exponents, f''(0) against mpmath, fourth-order step convergence and the momentum integral", () => {
  const out = FL.compute["boundary-layer"]({ v: { U: 10, rho: 1.2, mu: 1.8e-5, x: 0.5 }, tolerances: TOL, refs: REF });
  for (const c of out.checks.filter((x) => x.status !== "evidence")) assert.ok(c.passed, c.title);
  assert.equal(out.checks.find((c) => c.id === "scales").status, "exact");
  assert.equal(out.checks.find((c) => c.id === "reference").status, "numerical");
  assert.ok(Math.abs(FL.blasiusShoot(0.025, 12).s - REF.blasius.fpp0.value) <= 1e-9);
  // The approximation boundary of the map: δ*/x = 1.7208/√Re meets 0.01 at Re = (172.08)².
  const rg = derive("blasius-plate").regime;
  const at = rg.layers.find((l) => l.id === "bl").curves[0].points[0][0];
  assert.ok(rel(at, (REF.blasius.dstar / 0.01) ** 2) <= 1e-6, `boundary at Re = ${at}`);
});

test("external flow: exact cylinder forces and thin-airfoil coefficients, the Kutta–Joukowski lift by pressure integration, lumped vortices and the approximation boundary", () => {
  const out = FL.compute["external-potential-flow"]({ v: { U: 30, rho: 1.225, c: 1, alpha: (4 * Math.PI) / 180, m: 0.02, eps: 0.08 }, tolerances: TOL });
  for (const c of out.checks.filter((x) => x.status !== "evidence")) assert.ok(c.passed, c.title);
  assert.deepEqual(out.exact.liftG, ["0", "-4", "0"], "(1/π)∮C_p sin ψ dψ = −4G exactly");
  assert.equal(REF.airfoil.cylinder.lift_over_pi, "-4*G", "SymPy gives the same");
  assert.deepEqual(out.exact.dragG, ["0", "0", "0"]);
  assert.deepEqual([out.exact.A0, out.exact.A1, out.exact.A2], ["0", "1", "0"], "A₀ − α = 0, A₁ = 4m, A₂ = 0 (A₁ in units of 4m)");
  const cl = (id) => out.outputs.find((o) => o.id === id).value;
  assert.ok(rel(cl("clJ"), REF.airfoil.cl_joukowski) <= 1e-8 && rel(cl("clArc"), REF.airfoil.cl_arc) <= 1e-8 && rel(cl("clThin"), REF.airfoil.cl_thin) <= 1e-14, `${cl("clJ")} ${cl("clArc")}`);
  // The failure example: at 20° the thin-airfoil error is outside the tolerance, and the acceptance result says so.
  const stall = derive("fail-airfoil-stall");
  const r = byId(stall, "r-st-fl-approximation");
  assert.equal(r.status, "unresolved");
  assert.match(r.title, /outside the declared tolerance/);
});

test("the flow families reach the stability and solution panel with figures, tables, the derivation and results", () => {
  for (const ex of Object.values(FLOWS)) {
    const st = derive(ex).stability;
    assert.ok(st.ready && st.analysis?.generic, `${ex}: ${st.message}`);
    const an = st.analysis;
    assert.ok(an.heading.startsWith("Hand calculation 9") || an.heading.startsWith("Hand calculation 10"), an.heading);
    assert.ok(an.figures.length >= 1 && an.figures.every((f) => f.series.every((s) => s.pts.every((p) => p.every((x) => x === null || Number.isFinite(x))))), `${ex}: finite figure data`);
    assert.ok(an.displays.length >= 3 && an.displays.every((x) => x.tex.length), `${ex}: the derivation in TeX`);
    assert.ok(an.tables.length >= 1);
  }
});

test("an edit invalidates exactly the flow results that read the changed input", () => {
  const rec = confirmed("pipe-flow");
  const edited = R.edit(rec, (inp) => { inp.variables.find((v) => v.id === "v-qw").value = "2000"; }, "Changed q_w.");
  const d = derive("pipe-flow", {}, edited);
  assert.ok(!d.confirmed);
  const flows = d.results.filter((r) => r.id.startsWith("r-rm-accept-") || r.id.startsWith("r-st-fl-"));
  assert.ok(flows.length >= 6 && flows.every((r) => !r.valid && r.invalidatedBy.includes("v-qw")), "the declared-model results read q_w");
  assert.ok(d.results.filter((r) => r.id.startsWith("r-group-")).every((r) => r.valid), "q_w is not in the Pi set, so the groups stay valid");
});

test("agreement: for each flow example the page's results, the Markdown record and the deck show the same statuses and the derivation", () => {
  for (const ex of [...Object.values(FLOWS), "fail-nozzle-shock", "fail-jump-subcritical", "fail-airfoil-stall"]) {
    const s = state(ex);
    const d = Model.derive(s, DATA, confirmed(ex));
    const report = Report.report(s, d, DATA);
    const md = VisualKit.markdown(report);
    const deck = Beamdswitch.deck(report);
    assertStandardDeck(deck, ex);
    for (const r of d.results.filter((x) => /^r-(rm-accept|st-fl)-/.test(x.id))) {
      const line = Report.resultLine(r);
      assert.ok(md.includes(line) && deck.includes(line), `${ex}: ${r.id}`);
    }
    for (const disp of d.stability.analysis.displays) for (const t of disp.tex) assert.ok(md.includes(`$$${t}$$`), `${ex}: ${disp.title}`);
  }
});
