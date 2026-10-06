/* Scientific Modelling: asymptotic analysis of the declared conduction models, order by order, in exact rationals
 * (spec section 8). Each derivation records, at every order, the equation, the conditions, the solvability
 * requirement and its solution, the matching condition, and exact checks that the result satisfies them.
 *
 *   smallBi(j, N)    θ_τ = X^{-j}(X^j θ_X)_X, θ_X(0) = 0, −θ_X(1) = Bi θ(1), θ(X, 0) = 1 as Bi → 0 with the slow
 *                    time T = (j + 1) Bi τ fixed (a coupled limit). The outer expansion θ = Σ Bi^n θ_n(X, T) has
 *                    θ_n = e^{−T} × (a polynomial in X² and T). The solvability condition of order n + 1 fixes the
 *                    free function A_n(T); matching with the initial layer fixes its constant.
 *   finSmall(N)      θ'' − λ²θ = 0, θ(0) = 1, θ'(1) = 0 as λ → 0: a regular expansion in λ², polynomials in X.
 *
 * A function of (X, T) is a Map from "m,k" to a rational: the term coefficient × X^{2m} T^k e^{−T}.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"));
  else (root.SM = root.SM || {}).A = factory(root.SM.Q);
})(typeof self !== "undefined" ? self : this, function (Q) {
  "use strict";

  /* ---------- polynomials in X² and T, times e^{−T} ---------- */

  const key = (m, k) => `${m},${k}`;
  const unkey = (s) => s.split(",").map(Number);
  /** @param {[number, number, any][]} terms [m, k, rational] */
  function poly(terms) {
    const p = new Map();
    for (const [m, k, c] of terms) addTo(p, m, k, c);
    return p;
  }
  function addTo(p, m, k, c) {
    const s = key(m, k);
    const v = Q.add(p.get(s) ?? Q.ZERO, c);
    if (Q.isZero(v)) p.delete(s);
    else p.set(s, v);
  }
  const add = (a, b) => { const p = new Map(a); for (const [s, c] of b) addTo(p, ...unkey(s), c); return p; };
  const scale = (a, f) => { const p = new Map(); for (const [s, c] of a) addTo(p, ...unkey(s), Q.mul(c, f)); return p; };
  const isZero = (p) => p.size === 0;
  function mul(a, b) {
    const p = new Map();
    for (const [s, c] of a) for (const [t, d] of b) { const [m, k] = unkey(s), [n, l] = unkey(t); addTo(p, m + n, k + l, Q.mul(c, d)); }
    return p;
  }
  /** The product of two functions that each carry e^{−T}: the factor e^{−2T} is kept outside, so this is the
   * polynomial part only. Used at T = 0, where both factors are 1. */
  const atT0 = (a) => { const p = new Map(); for (const [s, c] of a) { const [m, k] = unkey(s); if (k === 0) addTo(p, m, 0, c); } return p; };
  /** ∂_T of e^{−T} T^k = e^{−T}(k T^{k−1} − T^k). */
  function dT(a) {
    const p = new Map();
    for (const [s, c] of a) {
      const [m, k] = unkey(s);
      if (k > 0) addTo(p, m, k - 1, Q.mul(c, Q.q(k)));
      addTo(p, m, k, Q.neg(c));
    }
    return p;
  }
  /** The operator L = X^{-j} d/dX (X^j d/dX): X^{2m} -> 2m(2m − 1 + j) X^{2m − 2}. */
  function Lop(a, j) {
    const p = new Map();
    for (const [s, c] of a) { const [m, k] = unkey(s); if (m > 0) addTo(p, m - 1, k, Q.mul(c, Q.q(2 * m * (2 * m - 1 + j)))); }
    return p;
  }
  /** The particular solution of L P = f with no X^0 term: X^{2m} -> X^{2m+2} / ((2m + 2)(2m + 1 + j)). */
  function Linv(f, j) {
    const p = new Map();
    for (const [s, c] of f) { const [m, k] = unkey(s); addTo(p, m + 1, k, Q.div(c, Q.q((2 * m + 2) * (2 * m + 1 + j)))); }
    return p;
  }
  /** The value at X = 1, a function of T. */
  const at1 = (a) => { const p = new Map(); for (const [s, c] of a) { const [, k] = unkey(s); addTo(p, 0, k, c); } return p; };
  /** ∂_X at X = 1: X^{2m} -> 2m. */
  const dXat1 = (a) => { const p = new Map(); for (const [s, c] of a) { const [m, k] = unkey(s); if (m > 0) addTo(p, 0, k, Q.mul(c, Q.q(2 * m))); } return p; };
  /** The weighted mean W[f] = (j + 1) ∫₀¹ X^j f dX: X^{2m} -> (j + 1)/(2m + j + 1). */
  const mean = (a, j) => { const p = new Map(); for (const [s, c] of a) { const [m, k] = unkey(s); addTo(p, 0, k, Q.mul(c, Q.q(j + 1, 2 * m + j + 1))); } return p; };
  /** The solution of A' + A = e^{−T} Σ r_k T^k with A(0) = c: e^{−T}(c + Σ r_k T^{k+1}/(k + 1)). Inputs and output are
   * functions of T only (m = 0). */
  function solveDecay(r, c) {
    const p = poly([[0, 0, c]]);
    for (const [s, v] of r) { const [, k] = unkey(s); addTo(p, 0, k + 1, Q.div(v, Q.q(k + 1))); }
    return p;
  }
  /** The value of the X-polynomial at T = 0 and X = 0: its constant term. */
  const constant = (a) => a.get(key(0, 0)) ?? Q.ZERO;

  /** TeX of e^{−T} × polynomial (or the polynomial alone, exp = false), with the variable names given. */
  function tex(a, { X = "X", T = "T", exp = true } = {}) {
    if (isZero(a)) return "0";
    const byK = new Map();
    for (const [s, c] of a) { const [m, k] = unkey(s); if (!byK.has(k)) byK.set(k, []); byK.get(k).push([m, c]); }
    const parts = [...byK.keys()].sort((x, y) => x - y).map((k) => {
      const list = byK.get(k).sort((x, y) => x[0] - y[0]);
      const tpow = k === 0 ? "" : k === 1 ? T : `${T}^{${k}}`;
      if (list.length === 1) return monomialWith(list[0], tpow, X);
      const inner = joinTerms(list.map(([m, c]) => monomial(c, m === 0 ? "" : m === 1 ? `${X}^{2}` : `${X}^{${2 * m}}`)));
      return tpow ? `\\left(${inner}\\right)${tpow}` : inner;
    });
    const body = joinTerms(parts);
    if (!exp) return body;
    return parts.length === 1 && byK.size === 1 && [...byK.values()][0].length === 1 ? `${body}\\,e^{-${T}}` : `e^{-${T}}\\left(${body}\\right)`;
  }
  function monomialWith([m, c], tpow, X) {
    const xs = m === 0 ? "" : m === 1 ? `${X}^{2}` : `${X}^{${2 * m}}`;
    return monomial(c, `${xs}${xs && tpow ? "\\," : ""}${tpow}`);
  }
  function monomial(c, v) {
    if (!v) return Q.tex(c);
    if (Q.eq(c, Q.ONE)) return v;
    if (Q.eq(c, Q.q(-1))) return `-${v}`;
    return `${Q.tex(c)}\\,${v}`;
  }
  const joinTerms = (list) => list.reduce((s, t, i) => (i === 0 ? t : t.startsWith("-") ? `${s}${t}` : `${s}+${t}`), "") || "0";

  /**
   * The small-Bi outer expansion to order N for the operator with index j (0 slab, 1 cylinder, 2 sphere). Returns the
   * orders with their equations, conditions, solvability and matching, the truncated sum, and the exact checks.
   * @param {number} j @param {number} N
   */
  function smallBi(j, N = 2) {
    const J1 = Q.q(j + 1);
    const theta = []; // complete θ_n
    const P = [new Map()]; // particular parts
    const orders = [];
    for (let n = 0; n <= N; n++) {
      // P_n solves L P_n = (j + 1) ∂_T θ_{n−1} (none at order 0).
      const rhs = n === 0 ? new Map() : scale(dT(theta[n - 1]), J1);
      const Pn = n === 0 ? new Map() : Linv(rhs, j);
      P[n] = Pn;
      // Solvability of order n + 1: A_n' + A_n = −P_n(1) − W[∂_T P_n].
      const R = add(scale(at1(Pn), Q.q(-1)), scale(mean(dT(Pn), j), Q.q(-1)));
      // Matching with the initial layer: the projection of θ(X, 0) = 1 on the slow mode is kept,
      // W[O_n(·, 0)] + W[Σ_{a + b = n, a, b >= 1} O_a(·, 0) O_b(·, 0)] = 0 for n >= 1, and c_0 = 1.
      let c;
      if (n === 0) c = Q.ONE;
      else {
        let cross = new Map();
        for (let a = 1; a < n; a++) cross = add(cross, mul(atT0(theta[a]), atT0(theta[n - a])));
        c = Q.neg(Q.add(constant(mean(atT0(Pn), j)), constant(mean(cross, j))));
      }
      const A = solveDecay(R, c);
      const th = add(Pn, A);
      theta.push(th);
      orders.push({
        n,
        rhs, rhsTex: n === 0 ? "0" : tex(rhs),
        particular: Pn, particularTex: tex(Pn),
        bcTex: n === 0 ? "0" : tex(at1(theta[n - 1])),
        solvability: R, solvabilityTex: tex(R),
        constant: Q.str(c), constantTex: Q.tex(c),
        A, ATex: tex(A),
        theta: th, thetaTex: tex(th),
      });
    }
    // Exact checks of each order: the equation, the surface condition and the solvability condition.
    const checks = orders.map((o, n) => {
      const eq = add(Lop(o.theta, j), scale(n === 0 ? new Map() : scale(dT(theta[n - 1]), J1), Q.q(-1)));
      const bc = add(scale(dXat1(o.theta), Q.q(-1)), scale(n === 0 ? new Map() : at1(theta[n - 1]), Q.q(-1)));
      const solv = add(scale(mean(dT(o.theta), j), Q.q(1)), at1(o.theta)); // W[∂_T θ_n] = −θ_n(1)
      return { n, equation: isZero(eq), surface: isZero(bc), solvability: isZero(solv) };
    });
    // The residual of the truncated sum S = Σ_{n<=N} Bi^n θ_n in the full slow-time problem:
    // (j + 1) Bi ∂_T S − L S = Bi^{N+1} (j + 1) ∂_T θ_N, and −S_X(1) − Bi S(1) = −Bi^{N+1} θ_N(1).
    const resEq = scale(dT(theta[N]), J1);
    const resBc = scale(at1(theta[N]), Q.q(-1));
    // What the expansion says about the slow mode C₁ f₁(λ₁X) e^{−λ₁²τ}: C₁ = Σ c_n Bi^n, and the T-terms give λ₁².
    const C1 = orders.map((o) => o.constant);
    const decay = decayRate(theta, N);
    return { j, N, orders, checks, residual: { equation: resEq, equationTex: tex(resEq), surface: resBc, surfaceTex: tex(resBc), order: N + 1 }, C1, decay,
      value: (Bi, tau, X) => value(theta, j, Bi, tau, X) };
  }

  /** λ₁²/((j + 1) Bi) = 1 − Σ μ_k Bi^k from the coefficients of T in the orders: θ_n(0, T)/e^{−T} has the T-term
   * that the expansion of exp(T Σ μ_k Bi^k) gives. Returns [μ_1, ..., μ_N] as rationals in text. */
  function decayRate(theta, N) {
    // log of the centre series: Σ Bi^n θ_n(0, T) e^{T} = C(Bi) exp(T μ(Bi)); compare the coefficient of T^1 Bi^n
    // after dividing by C(Bi) (the T^0 part). Power series in Bi with polynomial coefficients in T.
    const centre = theta.map((th) => { const p = new Map(); for (const [s, c] of th) { const [m, k] = unkey(s); if (m === 0) addTo(p, 0, k, c); } return p; });
    const C = centre.map((p) => p.get(key(0, 0)) ?? Q.ZERO);
    // Series division: G = centre / C, then log G = T μ(Bi) exactly when the mode is one exponential.
    const G = [];
    for (let n = 0; n <= N; n++) {
      let g = centre[n];
      for (let a = 1; a <= n; a++) g = add(g, scale(G[n - a], Q.neg(C[a])));
      G.push(scale(g, Q.inv(C[0])));
    }
    // log(1 + u) with u = G − 1, to order N; the coefficient of T^1 in Bi^n is μ_n.
    const u = G.map((g, n) => (n === 0 ? add(g, poly([[0, 0, Q.q(-1)]])) : g));
    const logs = Array.from({ length: N + 1 }, () => new Map());
    let power = [poly([[0, 0, Q.ONE]]), ...Array(N).fill(new Map())];
    for (let r = 1; r <= N; r++) {
      const next = Array.from({ length: N + 1 }, () => new Map());
      for (let a = 0; a <= N; a++) for (let b = 1; b <= N - a; b++) next[a + b] = add(next[a + b], mul(power[a], u[b]));
      power = next;
      const f = Q.q(r % 2 === 1 ? 1 : -1, r);
      for (let n = 0; n <= N; n++) logs[n] = add(logs[n], scale(power[n], f));
    }
    return logs.slice(1).map((p) => Q.str(p.get(key(0, 1)) ?? Q.ZERO));
  }

  /** The truncated sum at (Bi, τ, X), in floating point. */
  function value(theta, j, Bi, tau, X) {
    const T = (j + 1) * Bi * tau;
    let s = 0;
    theta.forEach((th, n) => {
      let v = 0;
      for (const [k, c] of th) { const [m, kk] = unkey(k); v += Q.toNumber(c) * X ** (2 * m) * T ** kk; }
      s += Bi ** n * v;
    });
    return Math.exp(-T) * s;
  }

  /* ---------- the fin as λ → 0: polynomials in X ---------- */

  /**
   * θ = Σ λ^{2n} φ_n(X) with φ_0 = 1 and φ_n'' = φ_{n−1}, φ_n(0) = 0, φ_n'(1) = 0. Each φ_n is a polynomial in X with
   * rational coefficients; Q* = −θ'(0) = Σ λ^{2n} (−φ_n'(0)). Returns the orders and the coefficients of Q*.
   */
  function finSmall(N = 4) {
    const phis = [[Q.ONE]]; // coefficient arrays, index = power of X
    const orders = [{ n: 0, phi: phis[0], tex: "1" }];
    for (let n = 1; n <= N; n++) {
      const prev = phis[n - 1];
      // Integrate twice: φ'' = prev; φ' = ∫ prev + a; φ = ∫∫ prev + a X (φ(0) = 0); φ'(1) = 0 fixes a.
      const first = [Q.ZERO, ...prev.map((c, i) => Q.div(c, Q.q(i + 1)))];
      const a = Q.neg(first.reduce((s, c) => Q.add(s, c), Q.ZERO));
      first[0] = a;
      const phi = [Q.ZERO, ...first.map((c, i) => Q.div(c, Q.q(i + 1)))];
      phis.push(phi);
      orders.push({ n, phi, tex: polyX(phi) });
    }
    const Qstar = phis.map((phi) => Q.neg(phi[1] ?? Q.ZERO)); // −φ_n'(0): Q* = Σ λ^{2n} Qstar_n
    // Exact checks: φ_n'' = φ_{n−1}, φ_n(0) = 0, φ_n'(1) = 0.
    const checks = orders.slice(1).map(({ n, phi }) => {
      const second = phi.slice(2).map((c, i) => Q.mul(c, Q.q((i + 2) * (i + 1))));
      const prev = phis[n - 1];
      const len = Math.max(second.length, prev.length);
      const eq = Array.from({ length: len }, (_, i) => Q.sub(second[i] ?? Q.ZERO, prev[i] ?? Q.ZERO)).every(Q.isZero);
      const d1 = phi.slice(1).reduce((s, c, i) => Q.add(s, Q.mul(c, Q.q(i + 1))), Q.ZERO);
      return { n, equation: eq, base: Q.isZero(phi[0]), tip: Q.isZero(d1) };
    });
    return { N, orders, Qstar: Qstar.map(Q.str), QstarTex: Qstar.map(Q.tex), checks };
  }
  function polyX(c) {
    const parts = c.map((v, i) => [v, i]).filter(([v]) => !Q.isZero(v)).map(([v, i]) => monomial(v, i === 0 ? "" : i === 1 ? "X" : `X^{${i}}`));
    return joinTerms(parts);
  }

  return { poly, add, scale, mul, dT, Lop, Linv, at1, dXat1, mean, tex, smallBi, finSmall, polyX };
});
