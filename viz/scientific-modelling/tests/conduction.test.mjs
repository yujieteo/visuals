// Scientific Modelling, piece 3: the solvers of the conduction families against independent references (mpmath at
// 30 digits and SymPy, from tools/references.py), the exact identities they must satisfy, and the asymptotic
// expansions order by order in exact rationals.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Q = require("../src/rational.js");
const SF = require("../src/special.js");
const H = require("../src/heat.js");
const A = require("../src/asymptotic.js");
const DATA = require("../raw.json");
const REF = DATA.references.conduction;

test("special functions agree with mpmath: J0 and J1 within 1e-15, erf, erfc and erfcx within 1e-14 relative, and the Bessel zeros", () => {
  for (const [x, v] of REF.special.J0) assert.ok(Math.abs(SF.J0(x) - v) < 1e-15, `J0(${x})`);
  for (const [x, v] of REF.special.J1) assert.ok(Math.abs(SF.J1(x) - v) < 1e-15, `J1(${x})`);
  for (const name of ["erf", "erfc", "erfcx"]) for (const [x, v] of REF.special[name]) assert.ok(Math.abs(SF[name](x) - v) <= 1e-14 * Math.abs(v), `${name}(${x}) = ${SF[name](x)}, mpmath ${v}`);
  SF.besselZeros(0, 5).forEach((z, k) => assert.ok(Math.abs(z - REF.special.j0zeros[k]) < 1e-13));
  SF.besselZeros(1, 5).forEach((z, k) => assert.ok(Math.abs(z - REF.special.j1zeros[k]) < 1e-13));
  assert.ok(Math.abs(SF.gauss(Math.exp, 0, 1) - (Math.E - 1)) < 1e-15, "Gauss–Legendre integrates exp exactly to rounding");
  assert.equal(SF.brent((x) => x * x - 2, 0, 1), null, "no sign change, no root");
});

test("the eigenvalues and coefficients of the slab, the cylinder and the sphere agree with mpmath's roots and quadratures", () => {
  for (const r of REF.modes) {
    const list = H.modes(r.geometry, r.Bi === "inf" ? Infinity : r.Bi, r.lambda.length);
    r.lambda.forEach((l, k) => {
      assert.ok(Math.abs(list[k].lambda - l) <= 1e-12 * l, `${r.geometry} Bi=${r.Bi} λ${k + 1}`);
      assert.ok(Math.abs(list[k].C - r.C[k]) <= 1e-11 * Math.abs(r.C[k]), `${r.geometry} Bi=${r.Bi} C${k + 1}: ${list[k].C} against ${r.C[k]}`);
    });
  }
  // Bi = 1 for the sphere: λ₁ = π/2 and C₁ = 4/π exactly.
  const [s1] = H.modes("sphere", 1, 1);
  assert.ok(Math.abs(s1.lambda - Math.PI / 2) < 1e-15 && Math.abs(s1.C - 4 / Math.PI) < 1e-14);
});

test("the series temperatures agree with mpmath, and each mode keeps the energy balance d(mean)/dFo = −(j + 1) Bi θ(1)", () => {
  for (const r of REF.temperatures) {
    const s = H.series(r.geometry, r.Bi, r.Fo, r.X);
    s.values.forEach((v, k) => assert.ok(Math.abs(v - r.theta[k]) < 1e-12, `${r.geometry} Bi=${r.Bi} Fo=${r.Fo} X=${r.X[k]}: ${v} against ${r.theta[k]}`));
  }
  for (const geom of H.GEOMETRIES) for (const Bi of [0.05, 2, 40]) {
    const j = H.J[geom];
    for (const m of H.modes(geom, Bi, 8)) {
      // λ² × mean of the mode = (j + 1) Bi f(λ): the eigenvalue equation in integral form.
      const lhs = m.lambda * m.lambda * H.modeMean(geom, m.lambda), rhs = (j + 1) * Bi * H.mode(geom, m.lambda, 1);
      assert.ok(Math.abs(lhs - rhs) <= 1e-11 * Math.max(1, Math.abs(rhs)), `${geom} Bi=${Bi} λ=${m.lambda}`);
      // The closed-form coefficient equals the ratio of the two weighted integrals by quadrature.
      const w = (X) => X ** j;
      const C = SF.gauss((X) => w(X) * H.mode(geom, m.lambda, X), 0, 1, 16) / SF.gauss((X) => w(X) * H.mode(geom, m.lambda, X) ** 2, 0, 1, 16);
      assert.ok(Math.abs(C - m.C) <= 1e-11 * Math.max(1, Math.abs(C)), `${geom} Bi=${Bi} C=${m.C} quadrature ${C}`);
    }
  }
});

test("the short-time solution of a semi-infinite solid equals the slab series up to the reflection from the centre", () => {
  const xs = [1, 0.95, 0.8, 0.6];
  for (const Bi of [0.3, 3, 30]) {
    const s = H.series("slab", Bi, 0.004, xs);
    xs.forEach((X, k) => assert.ok(Math.abs(H.semiInfinite(Bi, 0.004, X) - s.values[k]) < 1e-12, `Bi=${Bi} X=${X}`));
  }
  assert.ok(Math.abs(H.semiInfinite(Infinity, 0.01, 1)) < 1e-15, "a prescribed surface temperature gives θ = 0 at the surface");
});

test("the small-Bi expansion, order by order: each order satisfies its equation, its surface condition and its solvability condition exactly", () => {
  for (const geom of H.GEOMETRIES) {
    const j = H.J[geom];
    const sb = A.smallBi(j, 3);
    assert.ok(sb.checks.every((c) => c.equation && c.surface && c.solvability), `${geom}: every order checks`);
    const ref = REF.smallBi.find((r) => r.geometry === geom);
    assert.deepEqual(sb.C1, ref.C1, `${geom}: C₁ as a series in Bi is SymPy's`);
    assert.deepEqual(sb.decay, ref.mu, `${geom}: λ₁²/((j + 1)Bi) as a series in Bi is SymPy's`);
    // Order 1 in closed form: c = (j + 1)/(2(j + 3)) and the T-rate 1/(j + 3).
    const { c, r } = H.outerFirst(geom);
    assert.equal(sb.orders[1].constant, Q.str(c));
    assert.equal(sb.decay[0], Q.str(r));
    assert.equal(sb.residual.order, 4, "the residual of the order-3 sum is of order Bi⁴");
  }
  // The truncated outer expansion approaches the exact first mode as Bi → 0 at fixed T = Bi Fo (slab).
  const sb = A.smallBi(0, 2);
  const errs = [0.1, 0.01].map((Bi) => {
    const tau = 1 / Bi;
    const exact = H.series("slab", Bi, tau, [0, 1]).values;
    return Math.max(Math.abs(sb.value(Bi, tau, 0) - exact[0]), Math.abs(sb.value(Bi, tau, 1) - exact[1]));
  });
  assert.ok(errs[1] < errs[0] / 500, `the order-2 error falls like Bi³: ${errs}`);
});

test("the fin: the small-λ expansion gives the Taylor series of λ tanh λ, the closed form agrees with mpmath, and the proved bounds hold", () => {
  const fs = A.finSmall(4);
  assert.ok(fs.checks.every((c) => c.equation && c.base && c.tip));
  assert.deepEqual(fs.Qstar, REF.fin.series, "Q* = λ² − λ⁴/3 + 2λ⁶/15 − 17λ⁸/315 + …");
  const f = H.fin(REF.fin.lambda, 0);
  assert.ok(Math.abs(f.Q - REF.fin.Q) < 1e-15 && Math.abs(f.efficiency - REF.fin.efficiency) < 1e-15);
  for (const [X, v] of REF.fin.profile) assert.ok(Math.abs(f.at(X) - v) < 1e-15);
  for (let k = -3; k <= 3; k += 0.25) {
    const l = 10 ** k, Qs = H.fin(l, 0).Q;
    assert.ok(Qs <= l * l * (1 + 1e-15) && Qs >= l * l - l ** 4 / 3 - 1e-15 * l * l, `λ² − λ⁴/3 ≤ λ tanh λ ≤ λ² at λ = ${l}`);
    assert.ok(Math.abs(Qs - l) <= 2 * l * Math.exp(-2 * l) + 1e-15 * l, `|λ tanh λ − λ| ≤ 2λe^{−2λ} at λ = ${l}`);
  }
  const big = H.fin(800, 0.5);
  assert.ok(Number.isFinite(big.Q) && Math.abs(big.Q - 800) < 1e-9, "no overflow at λ = 800");
  // Base heat flow = surface loss (sides and tip) for a convective tip.
  const g = H.fin(1.3, 0.4);
  const loss = SF.gauss((X) => 1.69 * g.at(X), 0, 1) + 0.4 * 1.3 * g.tip;
  assert.ok(Math.abs(loss - g.Q) < 1e-13);
});

test("the slab with a source and the two-layer wall are exact in rationals, and agree with SymPy", () => {
  const s = H.source(Q.parse(REF.source.Gamma), Q.parse(REF.source.Bi));
  for (const [X, v] of REF.source.values) assert.ok(Q.eq(s.at(Q.parse(X)), Q.parse(v)), `θ(${X})`);
  assert.ok(Q.eq(s.flux, s.exchange), "heat balance");
  assert.equal(Q.str(H.source(Q.ONE, Q.q(2)).ratio), "1", "the crossover is at Bi = 2");
  const ex = DATA.examples.examples.find((e) => e.id === "multilayer-wall");
  const val = Object.fromEntries(ex.variables.filter((v) => v.value).map((v) => [v.symbol, Q.parse(v.value)]));
  const K = Q.parse("273.15");
  const w = H.multilayer({ h1: val.h_1, Tinf1: Q.add(val.T_inf1, K), layers: [{ L: val.L_1, k: val.k_1 }, { L: val.L_2, k: val.k_2 }], contacts: [val.R_c], h2: val.h_2, Tinf2: Q.add(val.T_inf2, K) });
  assert.equal(Q.str(w.q), REF.multilayer.q);
  assert.deepEqual(w.nodes.slice(1).map((n) => Q.str(n.T)), REF.multilayer.nodes);
  assert.ok(w.fluxes.every((f) => Q.eq(f.q, w.q)) && w.closes, "heat continuity and closure, exactly");
});
