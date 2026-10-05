// Scientific Modelling: the bounded symbolic engine of src/sym.js. Canonical sums of products, expansion, sums under
// a power, substitution, differentiation with the product and chain rules, exact powers of rationals, the round trip
// through the page's plain syntax, and the reasons it refuses what it cannot do.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const S = require("../src/sym.js");

const FIELD = { isField: (n) => n === "T", isCoordinate: (n) => n === "x" || n === "t", depends: () => true, isVar: (n) => ["T", "x", "t", "theta"].includes(n) };
const HATS = { ...FIELD, isVar: (n) => n === "theta" };
const read = (t, ctx = S.PLAIN) => S.read(t, ctx);
const same = (a, b, ctx = S.PLAIN, msg = `${a} = ${b}`) => assert.ok(S.equal(read(a, ctx), read(b, ctx)), msg);

test("canonical form: equal expressions have equal forms, and unequal ones do not", () => {
  same("(a+b)^2", "a^2 + 2*a*b + b^2");
  same("(a+b)/(a+b)", "1");
  same("(a+b)*c/(a+b)", "c");
  same("0.1 + 0.2", "3/10");
  same("x/(2*y) + x/(2*y)", "x/y");
  assert.ok(!S.equal(read("(a+b)^2"), read("a^2 + b^2")), "the cross term matters");
  assert.equal(S.plain(read("a - a")), "0");
});

test("the plain syntax round trip: the text the engine writes reads back to the same form", () => {
  const texts = ["rho*c_p*d(T,t) - k*d(T,x,x)", "exp(-E/(R*T)) + q_0^(1/2)", "(T - T_inf)^(-1)*h", "-k*d(T,x)/L + h*(T - T_inf)", "sqrt(k*A_c/(h*P))"];
  for (const t of texts) {
    const p = read(t, FIELD);
    assert.ok(S.equal(read(S.plain(p), FIELD), p), t);
  }
});

test("differentiation: the product rule, the chain rule, and derivatives of fields", () => {
  assert.ok(S.equal(read("d(k*T*x, x)", FIELD), read("k*x*d(T,x) + k*T", FIELD)), "product rule with a field");
  assert.ok(S.equal(S.diff(read("exp(a*x)*x^2"), "x"), read("a*x^2*exp(a*x) + 2*x*exp(a*x)")), "chain rule for exp");
  assert.ok(S.equal(S.diff(read("log(x^2 + 1)"), "x"), read("2*x/(x^2 + 1)")), "chain rule for log");
  assert.ok(S.equal(read("d(d(T,x),t)", FIELD), read("d(T,t,x)", FIELD)), "mixed derivatives of a smooth field commute");
  assert.throws(() => S.diff(read("abs(x)"), "x"), S.Unsupported, "the derivative of abs is outside the supported set");
  assert.throws(() => read("d(T, k)", FIELD), /not a coordinate/);
});

test("substitution: a sum under a power becomes pivot × (1 + ...), and the reverse substitution gives the original back", () => {
  const arrhenius = read("exp(-E/(R*T))", FIELD);
  const sub = S.subst(arrhenius, { sym: (n) => (n === "T" ? read("T_w + S*theta") : null) }, HATS);
  // The argument -E/(R (T_w + S θ)) = -(E/(R T_w)) (1 + (S/T_w) θ)^-1: both coefficients are dimensionless groups.
  assert.ok(S.equal(sub, read("exp(-E/(R*T_w)*(1 + S/T_w*theta)^(-1))", HATS)));
  const back = S.subst(sub, { sym: (n) => (n === "theta" ? read("(T - T_w)/S") : null) }, FIELD);
  assert.ok(S.equal(back, arrhenius), "θ = (T − T_w)/S undoes T = T_w + S θ exactly");
});

test("exact powers: rational roots stay rational, and the rest stays a symbolic power", () => {
  same("sqrt(4*x^2)", "2*x");
  same("(8/27)^(1/3)", "2/3");
  same("2^(1/2)*2^(1/2)", "2");
  assert.match(S.plain(read("2^(1/2)")), /\(2\)\^\(1\/2\)/, "√2 is not rounded");
  assert.throws(() => read("(-8)^(1/3)"), S.Unsupported, "a negative base has no real fractional power here");
  assert.throws(() => read("(a+b)^9"), /beyond the expansion limit of 8/);
  assert.throws(() => read("x^y"), /not a number/);
});
