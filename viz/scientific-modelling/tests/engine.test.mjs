// Scientific Modelling: the engine's parts, each run on known cases. Exact rationals, exact row reduction with its
// recorded steps, units with affine temperatures, and the equation parser with its LaTeX subset and dimension check.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Q = require("../src/rational.js");
const LA = require("../src/linalg.js");
const U = require("../src/units.js");
const E = require("../src/expr.js");

test("rationals: exact parse, arithmetic and text, with no floating-point step", () => {
  assert.equal(Q.str(Q.parse("0.1")), "1/10");
  assert.equal(Q.str(Q.parse("1.5e-3")), "3/2000");
  assert.equal(Q.str(Q.parse("-6/4")), "-3/2");
  assert.equal(Q.parse("1/0"), null);
  assert.equal(Q.parse("abc"), null);
  assert.equal(Q.str(Q.add(Q.parse("0.1"), Q.parse("0.2"))), "3/10", "0.1 + 0.2 is exactly 3/10");
  assert.equal(Q.str(Q.pow(Q.q(2, 3), -2)), "9/4");
  assert.equal(Q.tex(Q.q(-1, 2)), "-\\frac{1}{2}");
  assert.throws(() => Q.div(Q.ONE, Q.ZERO), /division by zero/);
});

test("row reduction: the spec's matrix D reduces in recorded steps to rank 4, and every step's matrix follows from the one before", () => {
  const D = LA.matrix([[1, 1, 1, 1, 0, 0, 0], [0, 1, -3, -1, 2, 1, 1], [-3, -3, 0, -1, -2, -1, 0], [-1, -1, 0, 0, -1, 0, 0]]);
  const r = LA.rref(D, { cols: ["h", "k", "ρ", "μ", "c_p", "U", "L"] });
  assert.equal(r.rank, 4);
  assert.deepEqual(r.pivots, [0, 1, 2, 3]);
  assert.ok(r.steps.length > 0 && r.steps.every((s) => ["swap", "scale", "add"].includes(s.op) && s.reason && s.tex));
  assert.deepEqual(r.steps.at(-1).matrix, LA.strings(r.R), "the last step holds the reduced form");
  // Replay each recorded operation on the matrix before it: the result is the recorded matrix.
  let M = LA.strings(D);
  for (const s of r.steps) {
    const A = M.map((row) => row.map((x) => Q.parse(x)));
    let m;
    if ((m = /^R(\d+) ↔ R(\d+)$/.exec(s.text))) { const [i, j] = [Number(m[1]) - 1, Number(m[2]) - 1]; [A[i], A[j]] = [A[j], A[i]]; }
    else if ((m = /^R(\d+) ← \((.+)\) R\d+$/.exec(s.text))) { const i = Number(m[1]) - 1; A[i] = A[i].map((x) => Q.mul(x, Q.parse(m[2]))); }
    else if ((m = /^R(\d+) ← R\d+ ([+-]) (?:(\S+) )?R(\d+)$/.exec(s.text))) {
      const i = Number(m[1]) - 1, j = Number(m[4]) - 1;
      const f = Q.mul(Q.parse(m[3] ?? "1"), Q.q(m[2] === "-" ? -1 : 1));
      A[i] = A[i].map((x, c) => Q.add(x, Q.mul(f, A[j][c])));
    } else assert.fail(`unknown step text ${s.text}`);
    M = LA.strings(A);
    assert.deepEqual(M, s.matrix, `step ${s.text}`);
  }
});

test("kernel, determinant and span: exact answers for the spec's matrices", () => {
  const D = LA.matrix([[1, 1, 1, 1, 0, 0, 0], [0, 1, -3, -1, 2, 1, 1], [-3, -3, 0, -1, -2, -1, 0], [-1, -1, 0, 0, -1, 0, 0]]);
  const ns = LA.nullspace(D);
  assert.equal(ns.basis.length, 3);
  for (const v of ns.basis) assert.ok(LA.isZeroVector(LA.mulMV(D, v)), "D v = 0 exactly");
  assert.equal(Q.str(LA.det(LA.matrix([[1, 0, 0, 1], [-3, 1, 1, 1], [0, -1, 0, -3], [0, 0, 0, -1]]))), "-1", "det D_R = -1 (spec section 5)");
  assert.deepEqual(LA.integerScale(LA.matrix([["1/2", "-3/4", "0"]])[0]).map(Q.str), ["2", "-3", "0"]);
  assert.deepEqual(LA.express([[Q.ONE, Q.ZERO], [Q.ONE, Q.ONE]], [Q.q(3), Q.q(5)]).map(Q.str), ["-2", "5"]);
  assert.equal(LA.express([[Q.ONE, Q.ZERO]], [Q.ZERO, Q.ONE]), null, "a vector outside the span has no coefficients");
});

test("units: compound SI units, prefixes, and conflicts between notations give their dimension", () => {
  const dim = (u) => U.text(U.parseUnit(u).dim);
  assert.equal(dim("W/(m^2*K)"), "M T⁻³ Θ⁻¹");
  assert.equal(dim("W m^-2 K^-1"), "M T⁻³ Θ⁻¹");
  assert.equal(dim("J/(kg·K)"), "L² T⁻² Θ⁻¹");
  assert.equal(dim("Pa*s"), "M L⁻¹ T⁻¹");
  assert.equal(dim("m²/s"), "L² T⁻¹");
  assert.equal(Q.str(U.parseUnit("mm").factor), "1/1000");
  assert.equal(Q.str(U.parseUnit("kPa").factor), "1000");
  assert.match(U.parseUnit("furlong").error, /not a known unit/);
  assert.equal(U.text(U.parseDimension("M/(L T)").dim), "M L⁻¹ T⁻¹");
  assert.match(U.parseDimension("X").error, /not a base dimension/);
});

test("affine temperatures: a lone °C is absolute and converts with its offset; inside a compound unit, or as delta, it is a difference", () => {
  const c = U.parseUnit("degC");
  assert.equal(c.temperature, "absolute");
  assert.equal(Q.str(U.toSI(Q.q(20), c, "absolute").value), "5863/20", "20 °C = 293.15 K");
  assert.equal(Q.str(U.toSI(Q.q(32), U.parseUnit("degF"), "absolute").value), "5463/20", "32 °F = 273.15 K");
  assert.equal(U.parseUnit("W/(m*degC)").temperature, "difference");
  assert.equal(U.parseUnit("W/(m*degC)").offset, null);
  assert.equal(U.parseUnit("delta_degC").temperature, "difference");
  assert.equal(Q.str(U.toSI(Q.q(9), U.parseUnit("Δ°F"), "difference").value), "5", "a 9 °F difference is 5 K");
  assert.equal(U.parseUnit("rad").meaning, "angle");
  assert.equal(U.parseUnit("%").meaning, "fraction");
});

test("equations: plain syntax and the LaTeX subset give the same tree, and the tree prints back", () => {
  const plain = E.read("rho*c_p*d(T,t) = k*d(T,x,x)");
  const latex = E.read("\\rho c_p \\frac{\\partial T}{\\partial t} = k \\frac{\\partial^2 T}{\\partial x^2}");
  assert.equal(plain.plain, "rho*c_p*d(T,t) = k*d(T,x,x)");
  assert.equal(latex.plain, plain.plain);
  assert.equal(E.tex(plain.ast), "\\rho\\,c_{p}\\,\\frac{\\partial T}{\\partial t} = k\\,\\frac{\\partial^{2} T}{\\partial x^{2}}");
  assert.equal(E.read("-k \\frac{\\partial T}{\\partial x} = h \\left(T - T_{\\infty}\\right)").plain, "-k*d(T,x) = h*(T - T_inf)");
  assert.equal(E.read("\\dot{Q} = \\sqrt{h P k A_c} (T_b - T_\\infty) \\tanh(m L)").plain, "Q_dot = sqrt(h*P*k*A_c)*(T_b - T_inf)*tanh(m*L)");
  assert.equal(E.read("\\frac{d_h}{L}").plain, "d_h/L", "d_h is a name, not a derivative");
  assert.match(E.read("rho c_p").error, /Write \* between two factors/);
  assert.match(E.read("2*(").error, /stops before its end/);
  assert.match(E.read("foo(x)").error, /not a known function/);
  assert.match(E.read("\\gamma_1 \\int x").error, /not in the supported subset/);
  assert.deepEqual(E.derivatives(plain.ast), [{ field: "T", order: { t: 1 } }, { field: "T", order: { x: 2 } }]);
});

test("dimension check: each failure names its terms, and absolute temperatures follow their rules", () => {
  const dims = { rho: "M L^-3", c_p: "L^2 T^-2 Theta^-1", T: "Theta", t: "T", x: "L", k: "M L T^-3 Theta^-1", T_inf: "Theta", E: "M L^2 T^-2 N^-1", R: "M L^2 T^-2 Theta^-1 N^-1", q0: "M L^-1 T^-3" };
  const env = (n) => (dims[n] ? { dim: U.parseDimension(dims[n]).dim, temperature: n.startsWith("T") && n !== "t" ? "absolute" : null, domain: n === "x" ? "real" : "positive", affine: n === "T" ? "°C" : null } : null);
  const check = (s) => E.infer(E.read(s).ast, env);
  assert.deepEqual(check("rho*c_p*d(T,t) = k*d(T,x,x)").issues.filter((i) => i.level !== "info"), []);
  const bad = check("rho*c_p*d(T,t) = k*d(T,x)").issues.find((i) => i.code === "dimension-mismatch");
  assert.deepEqual(bad.terms.map((t) => t.dim), ["M L^-1 T^-3", "M T^-3"]);
  assert.equal(check("T - T_inf").temperature, "difference", "a difference of absolute temperatures is a difference");
  assert.ok(check("T + T_inf").issues.some((i) => i.code === "absolute-temperature-sum"));
  assert.ok(check("q0*exp(-E/(R*T))").issues.some((i) => i.code === "absolute-temperature-scale"), "°C converts to K before the quotient");
  assert.ok(check("log(x)").issues.some((i) => i.code === "function-argument"));
  assert.ok(check("log(x)").issues.some((i) => i.code === "domain-required"));
  assert.ok(check("k/x").issues.some((i) => i.code === "domain-required"), "a divisor that can be 0 needs a declared domain");
  assert.ok(check("x^0.5").issues.some((i) => i.code === "domain-required"), "a fractional power needs a positive base");
  assert.ok(check("q9 + x").issues.some((i) => i.code === "undefined-symbol" && i.symbol === "q9"));
});
