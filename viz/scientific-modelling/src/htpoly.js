/* Scientific Modelling: exact polynomials in one variable with rational coefficients (src/rational.js). The
 * declared convection models of piece 7 that have polynomial solutions (Couette heating, the thermocapillary
 * layer, fully developed tube and channel flow, the vertical mixed-convection channel) are solved and checked with
 * this arithmetic, so each residual, boundary value, integral and Nusselt number is an exact rational. A polynomial
 * is a frozen array of coefficients, lowest power first, with no trailing zero.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"));
  else (root.SM = root.SM || {}).HP = factory(root.SM.Q);
})(typeof self !== "undefined" ? self : this, function (Q) {
  "use strict";

  /** A polynomial from coefficients (rationals, numbers or text), lowest power first. */
  function poly(cs) {
    const out = cs.map(Q.of);
    while (out.length && Q.isZero(out[out.length - 1])) out.pop();
    return Object.freeze(out);
  }
  const ZERO = poly([]);
  const ONE = poly([1]);
  /** The variable itself, x. */
  const X = poly([0, 1]);
  const coef = (p, k) => p[k] ?? Q.ZERO;
  const degree = (p) => p.length - 1;
  const isZero = (p) => p.length === 0;
  const eq = (a, b) => a.length === b.length && a.every((c, i) => Q.eq(c, b[i]));

  function add(a, b) {
    const n = Math.max(a.length, b.length);
    return poly(Array.from({ length: n }, (_, i) => Q.add(coef(a, i), coef(b, i))));
  }
  const scale = (a, k) => poly(a.map((c) => Q.mul(c, Q.of(k))));
  const sub = (a, b) => add(a, scale(b, -1));
  function mul(a, b) {
    if (!a.length || !b.length) return ZERO;
    const out = Array.from({ length: a.length + b.length - 1 }, () => Q.ZERO);
    a.forEach((x, i) => b.forEach((y, j) => { out[i + j] = Q.add(out[i + j], Q.mul(x, y)); }));
    return poly(out);
  }
  /** a to a nonnegative integer power. */
  function pow(a, k) {
    let out = ONE;
    for (let i = 0; i < k; i++) out = mul(out, a);
    return out;
  }
  /** The derivative. */
  const deriv = (a) => poly(a.slice(1).map((c, i) => Q.mul(c, Q.q(i + 1))));
  /** The antiderivative that is 0 at x = 0. */
  const integ = (a) => poly([Q.ZERO, ...a.map((c, i) => Q.div(c, Q.q(i + 1)))]);
  /** The value at a rational x (Horner). */
  function at(a, x) {
    const v = Q.of(x);
    let s = Q.ZERO;
    for (let i = a.length - 1; i >= 0; i--) s = Q.add(Q.mul(s, v), a[i]);
    return s;
  }
  /** The integral from lo to hi. */
  const definite = (a, lo, hi) => { const F = integ(a); return Q.sub(at(F, hi), at(F, lo)); };
  /** A floating-point evaluation, for drawing only. */
  function atFloat(a, x) {
    let s = 0;
    for (let i = a.length - 1; i >= 0; i--) s = s * x + Q.toNumber(a[i]);
    return s;
  }

  /** TeX of the polynomial in the variable `v`, highest power first: "\frac{3}{4}\zeta^{2}-\frac{1}{2}\zeta". */
  function tex(a, v = "x") {
    if (!a.length) return "0";
    const parts = [];
    for (let i = a.length - 1; i >= 0; i--) {
      const c = a[i];
      if (Q.isZero(c)) continue;
      const neg = Q.sign(c) < 0;
      const m = Q.abs(c);
      const power = i === 0 ? "" : i === 1 ? v : `${v}^{${i}}`;
      const num = i > 0 && Q.eq(m, Q.ONE) ? "" : Q.tex(m);
      parts.push({ neg, body: `${num}${power}` });
    }
    return parts.map((p, i) => (i === 0 ? `${p.neg ? "-" : ""}${p.body}` : `${p.neg ? "-" : "+"}${p.body}`)).join("");
  }
  /** Plain text: "3/4 z^2 - 1/2 z". */
  function text(a, v = "x") {
    if (!a.length) return "0";
    const parts = [];
    for (let i = a.length - 1; i >= 0; i--) {
      const c = a[i];
      if (Q.isZero(c)) continue;
      const m = Q.abs(c);
      const power = i === 0 ? "" : i === 1 ? v : `${v}^${i}`;
      const num = i > 0 && Q.eq(m, Q.ONE) ? "" : Q.str(m);
      parts.push({ neg: Q.sign(c) < 0, body: [num, power].filter(Boolean).join(" ") });
    }
    return parts.map((p, i) => (i === 0 ? `${p.neg ? "-" : ""}${p.body}` : ` ${p.neg ? "-" : "+"} ${p.body}`)).join("");
  }

  return { poly, ZERO, ONE, X, coef, degree, isZero, eq, add, sub, scale, mul, pow, deriv, integ, at, definite, atFloat, tex, text };
});
