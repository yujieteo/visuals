// Scientific Modelling, piece 4: stability and bifurcation. The numerical kernel against exact values, the
// Rayleigh–Bénard anchor (neutral curve against the characteristic determinant of tools/stability_references.py,
// the roll branch against Table 1S of Wen, Goluskin and Doering, the amplitude equation and the stability of the
// rolls), the radiation models against their closed forms and exact rationals, the custom ODE engine against exact
// folds, the cusp and the Hopf point of the Lorenz equations, the exact symbolic checks, invalidation, the failure
// cases, and the agreement of the page's data with the report.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const N = require("../src/numerics.js");
const RB = require("../src/convection.js");
const RAD = require("../src/radiation.js");
const ODE = require("../src/ode.js");
const Q = require("../src/rational.js");
const R = require("../src/record.js");
const C = require("../src/check.js");
const S = require("../src/sym.js");
const Model = require("../src/model.js");
const Report = require("../src/report.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const DATA = require("../raw.json");
const ENGINE = Model.engineData(DATA);
const REF = DATA.stability.computed;

const state = (example, patch = {}) => VisualKit.normalize(Model.FIELDS, { example, tool: "regime", ...patch }).state;
const confirmed = (example) => R.confirm(R.fromExample(ENGINE, example));
const derive = (example, patch = {}, rec = confirmed(example)) => Model.derive(state(example, patch), DATA, rec);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const result = (d, id) => d.results.find((r) => r.id === id);

test("the eigenvalue solver returns the roots of a companion matrix, and the clamped collocation operator its exact eigenvalues", () => {
  // (x − 1)(x − 2)(x − 3)(x² + 2x + 5): roots 3, 2, 1, −1 ± 2i.
  const ev = N.eig([[0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1], [30, -43, 14, -4, 4]].map((r) => Float64Array.from(r)));
  const want = [[3, 0], [2, 0], [1, 0], [-1, 2], [-1, -2]];
  want.forEach(([re, im], i) => { assert.ok(Math.abs(ev[i].re - re) < 1e-12 && Math.abs(ev[i].im - im) < 1e-12, JSON.stringify(ev[i])); });
  // W'''' = λW on [−1, 1] with W = W' = 0: λ = (β/2)⁴ with cosh β cos β = 1; β₁ from the transcendental equation.
  const beta = N.root((b) => Math.cosh(b) * Math.cos(b) - 1, 4.5, 5);
  const K = 16, xi = N.lobatto(K + 1).slice(1, -1), D1 = N.diffMatrix(xi);
  const P = [N.eye(K), D1]; for (let k = 2; k <= 4; k++) P.push(N.matmul(P[k - 1], D1));
  const g = [xi.map((x) => (1 - x * x) ** 2), xi.map((x) => -4 * x * (1 - x * x)), xi.map((x) => 12 * x * x - 4), xi.map((x) => 24 * x), xi.map(() => 24)];
  const L4 = [[1, 0, 4], [4, 1, 3], [6, 2, 2], [4, 3, 1], [1, 4, 0]].reduce((A, [c, gi, j]) => N.axpby(1, A, c, N.rowScale(g[gi], P[j])), N.zeros(K));
  const lam = N.eig(N.solveMatrix(N.diag(g[0]), L4)).map((e) => e.re).sort((a, b) => a - b)[0];
  assert.ok(rel(lam, (beta / 2) ** 4) < 1e-10, `${lam} against ${(beta / 2) ** 4}`);
});

test("continuation turns at the fold of x² + μ = 0 and Dormand–Prince integrates y' = −y within its tolerance", () => {
  const Fy = (y) => Float64Array.from([y[0] * y[0] + y[1]]);
  const Jy = (y) => [Float64Array.from([2 * y[0], 1])];
  const c = N.continuation({ Fy, Jy, y0: Float64Array.from([1, -1]), range: [-2, 2], h: 0.05, hmax: 0.2, maxSteps: 200, direction: 1 });
  const turn = c.points.findIndex((p, k) => k > 0 && Math.sign(p.t[1]) !== Math.sign(c.points[k - 1].t[1]));
  assert.ok(turn > 0, "the tangent's μ part changes sign");
  assert.ok(Math.abs(c.points[turn].mu) < 0.05 && c.points.every((p) => Math.abs(p.y[0] ** 2 + p.mu) < 1e-9));
  const s = N.rk45((t, y) => [-y[0]], 0, [1], 3, { rtol: 1e-10, atol: 1e-12 });
  assert.ok(Math.abs(s.ys.at(-1)[0] - Math.exp(-3)) < 1e-9);
});

test("Rayleigh–Bénard: the neutral curve, its minimum and the box modes agree with the characteristic determinant", () => {
  const c = RB.critical(16);
  assert.ok(rel(c.Ra, REF.rb.Ra_c) < 1e-9, `${c.Ra} against ${REF.rb.Ra_c}`);
  assert.ok(Math.abs(c.a - REF.rb.a_c) < 1e-5, `${c.a} against ${REF.rb.a_c}`);
  assert.ok(rel(RB.neutral(16, Math.PI).Ra, REF.rb.Ra_pi) < 1e-10);
  const enc = RB.enclosureOnset(16, REF.rb.enclosure.Gamma);
  for (const m of REF.rb.enclosure.modes) assert.ok(rel(enc.modes.find((x) => x.n === m.n).Ra, m.Ra) < 1e-9, `mode ${m.n}`);
  assert.equal(enc.n, 3, "Γ = 2.5 starts with three rolls");
  // Exchange of stabilities: at the critical point the largest growth rate is real and 0; above it, positive.
  const g0 = RB.growthRates(16, c.Ra, c.a, 1), g1 = RB.growthRates(16, 2000, c.a, 7);
  assert.ok(Math.abs(g0.lead.re) < 1e-7 && g0.lead.im === 0 && g0.residual < 1e-12);
  assert.ok(g1.lead.re > 0 && g1.lead.im === 0);
});

test("Rayleigh–Bénard: the analytic Jacobian of the roll system equals its finite differences", () => {
  const sys = RB.rollSystem({ K: 8, M: 3, k: Math.PI, Pr: 0.7 });
  const u = Float64Array.from({ length: sys.n }, (_, i) => 0.1 * Math.sin(1.3 * i + 0.2));
  const J = sys.jacobian(u, 1800);
  const h = 1e-6;
  let err = 0;
  for (let c = 0; c < sys.n; c++) {
    const up = Float64Array.from(u), um = Float64Array.from(u);
    up[c] += h; um[c] -= h;
    const rp = sys.residual(up, 1800), rm = sys.residual(um, 1800);
    for (let r = 0; r < sys.n; r++) err = Math.max(err, Math.abs((rp[r] - rm[r]) / (2 * h) - J[r][c]));
  }
  assert.ok(err < 1e-8, `largest difference ${err}`);
});

test("Rayleigh–Bénard: the roll branch reproduces Nu of Table 1S, converges, and the amplitude equation classifies a supercritical pitchfork", () => {
  const rows = DATA.stability.wgd.rows;
  const br = RB.rollBranch({ K: 16, M: 8, k: Math.PI, Pr: 1, targets: rows.map((r) => r.Ra) });
  assert.ok(br.ok, br.reason);
  for (const r of rows) {
    const t = br.targets.find((x) => x.Ra === r.Ra);
    assert.ok(rel(t.Nu, r.Nu) < 1e-4, `Ra = ${r.Ra}: ${t.Nu} against ${r.Nu}`);
    assert.ok(Math.abs(t.Nu - t.NuTop) < 1e-3, "volume and wall Nusselt numbers agree");
  }
  const fine = RB.refine(br, 1e4, 20, 10);
  assert.ok(fine.converged && rel(fine.Nu, br.targets.at(-1).Nu) < 1e-5);
  const ae = RB.amplitudeEquation(br.sys);
  assert.ok(ae.supercritical && Math.abs(ae.solvability) < 1e-10, JSON.stringify(ae));
  // The slope of the branch near onset tends to the slope of the amplitude equation.
  const first = br.points[1];
  const slope = (first.Nu - 1) / ((first.Ra - br.Ran) / br.Ran);
  assert.ok(rel(slope, ae.slope) < 0.05, `${slope} against ${ae.slope}`);
  // Exchange of stability: at the first point of the branch, close to onset, the rolls decay at twice the rate the
  // conductive state grows there.
  const near = br.points[0];
  assert.ok((near.Ra - br.Ran) / br.Ran < 0.01, "the first point is close to onset");
  const sr = RB.rollStability(br.sys, br.solutions.get(near.Ra), near.Ra);
  const sc = RB.growthRates(16, near.Ra, Math.PI, 1).lead.re;
  assert.ok(sr.stable && Math.abs(sr.lead.re / sc + 2) < 0.05, `${sr.lead.re} against ${sc}`);
});

test("the Rayleigh–Bénard record: exact base state, perturbation equations and symmetry, then the onset and the branch with their statuses", () => {
  const d = derive("rayleigh-benard");
  assert.ok(d.regime.ready && d.stability.ready && d.stability.kind === "declared");
  const ex = d.stability.exact;
  assert.ok(ex.base.ok && ex.symmetry.ok && ex.perturbation.every((p) => p.zeroOrder));
  // The linearized heat equation: θ' is advected by the base gradient −1 through −∂Ψ'/∂X.
  const heat = ex.perturbation.find((p) => p.of === "heat");
  const ctx = { isField: (n) => /_p$/.test(n), isCoordinate: (n) => ["X", "Z", "tau"].includes(n), depends: () => true, isVar: () => true };
  const want = S.read("d(theta_p,tau) + d(Psi_p,X) - d(theta_p,X,X) - d(theta_p,Z,Z)", ctx);
  const got = S.read(heat.linearPlain, ctx);
  assert.ok(S.equal(got, want) || S.equal(got, S.neg(want)), heat.linearPlain);
  for (const id of ["r-st-base", "r-st-perturb", "r-st-symmetry"]) assert.equal(result(d, id).status, "exact", id);
  for (const id of ["r-st-onset", "r-st-critical", "r-st-branch", "r-st-amplitude", "r-st-classify"]) assert.equal(result(d, id).status, "numerical", id);
  assert.equal(result(d, "r-st-wgd").status, "evidence");
  assert.equal(result(d, "r-st-coverage").status, "unresolved", "the search coverage stays visible");
  const an = d.stability.analysis;
  assert.equal(an.box.n, 1);
  assert.ok(an.lead.re > 0, "Ra = 5232 is above onset");
  assert.ok(an.branch.record && Math.abs(an.branch.record.Nu - 2.1479) < 1e-3);
  // The map: the onset curve and the second branch point are boundaries between resolved points.
  const onset = d.regime.layers.find((l) => l.id === "onset"), branches = d.regime.layers.find((l) => l.id === "branches");
  assert.ok(onset.curves.length >= 1 && branches.curves.length >= 1 && d.regime.unresolved.count === 0);
  assert.equal(d.regime.gap.count, 0, "a model without approximation layers has no gap");
});

test("the enclosure: onset with three rolls, the base state, and the branch at Pr = 5.85", () => {
  const d = derive("enclosure-convection");
  const an = d.stability.analysis;
  assert.equal(an.box.n, 3);
  assert.ok(rel(an.box.Ra, REF.rb.enclosure.modes[2].Ra) < 1e-9);
  assert.ok(an.point.Ra > an.box.Ra && an.lead.re > 0, "the record's Ra is above onset");
  assert.ok(an.branch.ok && an.branch.amplitude.supercritical && an.branch.convergence.rel < 1e-5);
  // The rolls of three cells carry only the harmonics of 3π/Γ: the result names the box modes the test leaves out.
  assert.deepEqual(an.branch.rollStability.untested.map((m) => m.n), [1, 2, 4, 5, 7, 8]);
  assert.match(result(d, "r-st-rolls").title, /roll period 2Γ\/3 .*leaves out box modes 1, 2, 4, 5, 7, 8\. Mode 2 also grows on the conductive state here/);
});

test("radiation: the lumped body's closed form, equilibrium and eigenvalue, and the exact radiosity network of the duct", () => {
  const ref = REF.radiation;
  assert.ok(rel(RAD.equilibrium(ref.lumped.q), ref.lumped.theta_eq) < 1e-12);
  assert.ok(Math.abs(RAD.lumpedTheta(ref.lumped.theta_i, ref.lumped.q, 1) - ref.lumped.theta_tau1) < 1e-9, "closed form against mpmath's integrator");
  const d = derive("lumped-radiation");
  const e = d.stability.analysis.equilibrium;
  assert.ok(rel(e.theta, ref.lumped.theta_eq) < 1e-9 && rel(e.eigenvalue, -4 * ref.lumped.theta_eq ** 3) < 1e-9);
  assert.equal(result(d, "r-st-jacobian").status, "exact");
  assert.ok(d.stability.exact.jacobian.ok && d.stability.exact.base.ok);
  // The late-time limit path runs along τ_r from the selected point to the edge of the map at fixed θ_i.
  const late = derive("lumped-radiation").regime.limits.find((L) => L.id === "late");
  assert.ok(late.onSlice && late.points.length === 21);
  assert.deepEqual([late.points[0], late.points.at(-1)], [[0.1, 3], [10, 3]]);
  // The duct: every check exact, and the net flux the SymPy value.
  const s = derive("surface-radiation");
  const an = s.stability.analysis;
  assert.equal(an.q1, ref.duct.q1);
  assert.deepEqual(an.j, ref.duct.j);
  assert.deepEqual([an.viewFactors.F12, an.viewFactors.F1R, an.viewFactors.FR1], [ref.duct.F12, ref.duct.F1R, ref.duct.FR1]);
  for (const c of an.checks) assert.ok(c.passed && c.status === "exact", c.id);
  // An irrational diagonal makes the view-factor check numerical, never exact.
  assert.equal(RAD.viewFactors(Q.q(1n), Q.q(1n)).exact, false);
  // Convection and radiation: the root against mpmath, and the linearization limit.
  assert.ok(Math.abs(RAD.crTheta(ref.plate.N_r, ref.plate.Q) - ref.plate.theta) < 1e-12);
  const cr = derive("convection-radiation");
  assert.ok(cr.stability.exact.jacobian.ok);
  assert.ok(cr.regime.layers.some((l) => l.id === "linear" && l.curves.length), "the linearization boundary crosses the map");
});

test("custom ODE: the ignition folds, the hysteresis interval and the cusp agree with the exact fold conditions", () => {
  const d = derive("custom-ignition");
  assert.ok(d.stability.ready && d.stability.kind === "custom");
  const an = d.stability.analysis;
  const folds = an.branches.flatMap((b) => b.special).filter((s) => s.kind === "fold").sort((a, b) => a.mu - b.mu);
  assert.equal(folds.length, 2);
  const ref = REF.ignition.folds.slice().sort((a, b) => a.Da - b.Da);
  folds.forEach((f, i) => { assert.ok(rel(f.mu, ref[i].Da) < 1e-9 && rel(f.x[0], ref[i].theta_float) < 1e-8 && f.classified, JSON.stringify(f)); });
  assert.deepEqual(an.hysteresis.map((h) => h.map((x) => Number(x.toPrecision(9)))), [[Number(ref[0].Da.toPrecision(9)), Number(ref[1].Da.toPrecision(9))]]);
  const cusp = an.two.curves.flatMap((c) => c.cusps)[0];
  assert.ok(Math.abs(cusp.mu2 - 0.25) < 1e-5 && rel(cusp.mu, REF.ignition.cusp.Da) < 1e-5 && Math.abs(cusp.x[0] - 4) < 1e-3, JSON.stringify(cusp));
  assert.ok(an.two.grid.counts.includes(2), "the map has a region with two stable equilibria");
  assert.equal(result(d, "r-st-ode-coverage").status, "unresolved");
});

test("custom ODE: the Lorenz equations give a supercritical pitchfork at r = 1 and a subcritical Hopf point at r = 470/19", () => {
  const d = derive("custom-lorenz");
  const an = d.stability.analysis;
  assert.equal(an.symmetry, "(x, y, z) → (−x, −y, z)");
  const sp = an.branches.flatMap((b) => b.special);
  const bp = sp.find((s) => s.kind === "branch-point");
  assert.ok(bp && Math.abs(bp.mu - 1) < 1e-9 && /supercritical pitchfork/.test(bp.label), JSON.stringify(bp));
  const hopf = sp.filter((s) => s.kind === "hopf");
  assert.equal(hopf.length, 2, "one Hopf point on each of the two symmetric branches");
  for (const h of hopf) {
    assert.ok(rel(h.mu, REF.lorenz.r_hopf_float) < 1e-9 && rel(h.omega, REF.lorenz.omega) < 1e-8, JSON.stringify(h));
    assert.ok(h.classified && h.l1 > 0 && /subcritical/.test(h.label));
  }
  assert.deepEqual(an.multistable.map((m) => m.map((x) => Number(x.toPrecision(6)))), [[1, Number(REF.lorenz.r_hopf_float.toPrecision(6))]]);
  assert.equal(result(d, "r-st-ode-symmetry").status, "exact");
});

test("failure cases: a second-order ODE, a missing control parameter and a custom PDE each give the failed check and the next action", () => {
  const rec = R.fromExample(ENGINE, "custom-ignition");
  const second = R.edit(rec, (inp) => { inp.equations[0].text = "d(theta,t,t) = Da*exp(theta/(1 + eps*theta)) - theta"; inp.conditions.push({ id: "c-2", kind: "initial", text: "d(theta,t) = 0", at: "t = 0" }); }, "Second order.");
  const a = ODE.system(C.interpret(R.inputs(second), ENGINE));
  assert.ok(!a.ok && /order 2/.test(a.reason) && /first-order/.test(a.next), JSON.stringify(a));
  const noControl = R.confirm(R.edit(rec, (inp) => { inp.purpose = { ...inp.purpose, analysis: { range: "0.2..0.6" } }; }, "No control."));
  const d1 = Model.derive(state("custom-ignition"), DATA, noControl);
  const u = result(d1, "r-st-unresolved");
  assert.ok(u && u.status === "unresolved" && /control parameter/.test(u.title) && /Da, eps/.test(u.next), JSON.stringify(u));
  const d2 = derive("fail-unsupported");
  assert.ok(d2.interp.issues.some((i) => i.code === "unsupported-analysis"));
  assert.ok(!d2.stability.ready && /custom PDE/.test(d2.stability.message));
});

test("invalidation: an edit of the temperature drop after confirmation invalidates the stability results that read it", () => {
  const rec = confirmed("rayleigh-benard");
  const edited = R.edit(rec, (inp) => { inp.variables.find((v) => v.id === "v-DT").value = "6"; }, "Changed ΔT.");
  const d = Model.derive(state("rayleigh-benard"), DATA, edited);
  const st = d.results.filter((r) => r.id.startsWith("r-st-"));
  assert.ok(st.length && st.every((r) => !r.valid && r.invalidatedBy.includes("v-DT")), "every stability result reads ΔT through the declared model");
});

test("the page's stability data, the Markdown record and the deck agree for every piece 4 example", () => {
  for (const ex of ["rayleigh-benard", "enclosure-convection", "lumped-radiation", "surface-radiation", "convection-radiation", "custom-ignition", "custom-lorenz"]) {
    const st = state(ex);
    const d = derive(ex);
    const rep = Report.report(st, d, DATA);
    const frame = rep.results.find((f) => /^Stability and bifurcation/.test(f.title));
    assert.ok(frame, ex);
    for (const r of d.results.filter((x) => x.id.startsWith("r-st-"))) assert.ok(frame.body.includes(r.title.replace(/\|/g, "\\|")), `${ex}: ${r.id}`);
    const nine = rep.method.filter((f) => /^Hand calculation 9/.test(f.title));
    assert.ok(nine.length >= 1, `${ex}: hand calculation 9 is in the Method section`);
    for (const f of nine) assert.ok(f.narration && !/[$\\=]/.test(f.narration), `${ex}: narration is plain prose`);
  }
  // The values in the report's tables are the page's values.
  const d = derive("rayleigh-benard");
  const body = Report.report(state("rayleigh-benard"), d, DATA).method.map((f) => f.body).join("\n");
  for (const m of d.stability.analysis.box.modes) assert.ok(body.includes(`| ${m.n} |`), `mode ${m.n}`);
  for (const p of d.stability.analysis.branch.compare) assert.ok(body.includes(p.ref.toFixed(6)), `Table 1S value ${p.ref}`);
});
