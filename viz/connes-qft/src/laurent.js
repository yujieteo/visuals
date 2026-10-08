/* Connes QFT laboratory: truncated Laurent series in ε.
 *
 * A series is { lo, c, hi }: the coefficient of ε^k is c[k - lo] for lo ≤ k ≤ hi, and nothing is
 * known beyond ε^hi (hi = Infinity for an exact Laurent polynomial). Products and sums track hi, so
 * a result never claims more orders than its inputs determine. This is the algebra 𝒜 of
 * Connes–Kreimer: characters take values here, T is the projection onto the pole part, and the
 * Birkhoff factors are computed with it.
 */
(function (factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else factory(self.ConnesQFT);
})(function (Q) {
  "use strict";

  /* Build from a lowest power and coefficient list; hi defaults to the last given power (exact = Infinity). */
  function make(lo, coeffs, hi) {
    const c = coeffs.slice();
    const top = hi === undefined ? lo + c.length - 1 : hi;
    while (c.length && lo + c.length - 1 > top) c.pop();
    return normalize({ lo, c, hi: top });
  }
  const exact = (lo, coeffs) => make(lo, coeffs, Infinity);
  const constant = (x, hi = Infinity) => make(0, [x], hi);
  const zero = (hi = Infinity) => ({ lo: 0, c: [], hi });
  /* Drop zero coefficients at the ends (exact zeros only). */
  function normalize(s) {
    let { lo, c } = s;
    c = c.slice();
    while (c.length && c[0] === 0) { c.shift(); lo++; }
    while (c.length && c[c.length - 1] === 0) c.pop();
    if (!c.length) lo = 0;
    return { lo, c, hi: s.hi };
  }
  const coef = (s, k) => (k < s.lo || k - s.lo >= s.c.length ? 0 : s.c[k - s.lo]);
  const top = (s) => s.lo + s.c.length - 1;

  function add(a, b) {
    const hi = Math.min(a.hi, b.hi);
    if (!a.c.length && !b.c.length) return zero(hi);
    const lo = Math.min(a.c.length ? a.lo : Infinity, b.c.length ? b.lo : Infinity);
    const end = Math.min(hi, Math.max(top(a), top(b)));
    const c = [];
    for (let k = lo; k <= end; k++) c.push(coef(a, k) + coef(b, k));
    return normalize({ lo, c, hi });
  }
  const scale = (a, s) => normalize({ lo: a.lo, c: a.c.map((x) => x * s), hi: a.hi });
  const neg = (a) => scale(a, -1);
  const sub = (a, b) => add(a, neg(b));
  function mul(a, b) {
    if (!a.c.length || !b.c.length) {
      // 0 × (series known to hi) is known to (that hi + the other's lowest power).
      const hi = Math.min(a.hi + (b.c.length ? b.lo : 0), b.hi + (a.c.length ? a.lo : 0));
      return zero(hi);
    }
    const lo = a.lo + b.lo;
    const hi = Math.min(a.hi + b.lo, b.hi + a.lo);
    const end = Math.min(hi, top(a) + top(b));
    const c = new Array(Math.max(0, end - lo + 1)).fill(0);
    a.c.forEach((x, i) => b.c.forEach((y, j) => { const k = i + j; if (k < c.length) c[k] += x * y; }));
    return normalize({ lo, c, hi });
  }
  const mulAll = (...xs) => xs.reduce((s, x) => mul(s, x), constant(1));
  /* Truncate to orders ≤ hi. */
  const truncate = (a, hi) => make(a.lo, a.c, Math.min(hi, a.hi));
  /* T: the pole part (negative powers), exact once the input reaches ε^-1. */
  function pole(a) {
    if (a.hi < -1) throw new Error("pole part needs the series to reach ε^-1");
    const c = [];
    for (let k = a.lo; k < 0; k++) c.push(coef(a, k));
    return normalize({ lo: a.lo, c, hi: Infinity });
  }
  /* 1 - T: the regular (holomorphic at ε = 0) part. */
  function regular(a) {
    const c = [];
    for (let k = 0; k <= top(a); k++) c.push(coef(a, k));
    return normalize({ lo: 0, c, hi: a.hi });
  }
  /* Zero the coefficients that are round-off relative to the largest one. */
  function clean(a, tol = 1e-11) {
    const big = Math.max(1e-300, ...a.c.map(Math.abs));
    return normalize({ lo: a.lo, c: a.c.map((x) => (Math.abs(x) <= tol * big ? 0 : x)), hi: a.hi });
  }
  const hasPole = (a) => a.c.some((x, i) => a.lo + i < 0 && x !== 0);
  /* Value at ε = 0 of a series with no pole. */
  function at0(a) {
    if (hasPole(a)) throw new Error("at0: the series has a pole at ε = 0");
    if (a.hi < 0) throw new Error("at0: the constant term is not determined");
    return coef(a, 0);
  }
  /* Sum of the known terms at a given ε (a finite-order approximation). */
  const evalAt = (a, eps) => a.c.reduce((s, x, i) => s + x * Math.pow(eps, a.lo + i), 0);
  /* exp(x) for x with no pole: e^{x0} ∑ (x - x0)^n / n!, to order hi. */
  function exp(x) {
    if (hasPole(x)) throw new Error("exp of a series with a pole");
    const x0 = coef(x, 0), hi = x.hi;
    const y = make(1, x.c.slice(Math.max(0, 1 - x.lo)), hi); // x - x0 (starts at ε^1)
    let term = constant(1, hi), out = constant(1, hi);
    const N = Number.isFinite(hi) ? hi : 12;
    for (let n = 1; n <= N; n++) { term = scale(mul(term, y), 1 / n); out = add(out, term); }
    return truncate(scale(out, Math.exp(x0)), hi);
  }
  /* Multiplicative inverse of a series with a nonzero leading coefficient. */
  function inverse(a) {
    if (!a.c.length) throw new Error("inverse of zero");
    const a0 = a.c[0], n = Number.isFinite(a.hi) ? a.hi - a.lo : 12;
    const c = [1 / a0];
    for (let k = 1; k <= n; k++) {
      let s = 0;
      for (let j = 1; j <= k; j++) s += (a.c[j] || 0) * c[k - j];
      c.push(-s / a0);
    }
    // Known to the same number of orders past the leading term as the input (12 for an exact input).
    return make(-a.lo, c, -a.lo + n);
  }
  /* ε^k. */
  const monomial = (k, x = 1) => exact(k, [x]);
  /* Series of Γ(ε/2) about ε = 0, to order hi: Γ(ε/2) = (2/ε) Γ(1 + ε/2). */
  function gammaHalfEps(hi) {
    const n = hi + 2;
    const lg = Q.logGamma1pSeries(n).map((x, k) => x / Math.pow(2, k)); // log Γ(1 + ε/2) coefficients
    const g = exp(make(0, lg, n));                                       // Γ(1 + ε/2)
    return truncate(mul(monomial(-1, 2), g), hi);
  }
  /* X^{ε/2} = exp((ε/2) log X), to order hi. */
  const powHalfEps = (X, hi) => exp(make(0, [0, Math.log(X) / 2], hi));

  /* Human-readable forms. */
  function toText(a, { sig = 5, var: v = "ε" } = {}) {
    const terms = [];
    a.c.forEach((x, i) => {
      if (x === 0) return;
      const k = a.lo + i;
      const mag = Q.fmt(Math.abs(x), sig);
      const pow = k === 0 ? "" : k === 1 ? v : k === -1 ? `/${v}` : k < 0 ? `/${v}${Q.sup(-k)}` : `${v}${Q.sup(k)}`;
      const body = k < 0 ? `${mag}${pow}` : k === 0 ? mag : `${mag === "1" ? "" : mag}${pow}`;
      terms.push({ neg: x < 0, body });
    });
    let s = terms.map((t, i) => (i === 0 ? (t.neg ? "−" : "") + t.body : (t.neg ? " − " : " + ") + t.body)).join("");
    if (!s) s = "0";
    if (Number.isFinite(a.hi)) s += ` + O(${v}${Q.sup(a.hi + 1)})`;
    return s;
  }
  function toTeX(a, { sig = 5 } = {}) {
    const terms = [];
    a.c.forEach((x, i) => {
      if (x === 0) return;
      const k = a.lo + i, mag = Number(Math.abs(x).toPrecision(sig)).toString();
      const body = k < 0 ? `\\frac{${mag}}{\\varepsilon${k === -1 ? "" : `^{${-k}}`}}` : k === 0 ? mag : `${mag}\\,\\varepsilon${k === 1 ? "" : `^{${k}}`}`;
      terms.push((x < 0 ? "-" : terms.length ? "+" : "") + body);
    });
    return (terms.join(" ") || "0") + (Number.isFinite(a.hi) ? ` + O(\\varepsilon^{${a.hi + 1}})` : "");
  }

  const api = { clean, make, exact, constant, zero, normalize, coef, top, add, sub, scale, neg, mul, mulAll, truncate, pole, regular, hasPole, at0, evalAt, exp, inverse, monomial, gammaHalfEps, powHalfEps, toText, toTeX };
  Q.laurent = api;
  return api;
});
