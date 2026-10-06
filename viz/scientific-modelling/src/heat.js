/* Scientific Modelling: the solvers of the declared conduction models (piece 3), in dimensionless form. The page's
 * declarations (data/catalogue.json) name these solutions as their reference results; tools/references.py computes
 * the same quantities independently with mpmath, and tests/conduction.test.mjs compares the two.
 *
 *   transient conduction   θ_τ = X^{-j} (X^j θ_X)_X on 0 < X < 1, θ_X(0) = 0, −θ_X(1) = Bi θ(1), θ(X, 0) = 1,
 *                          with j = 0 (slab), 1 (cylinder), 2 (sphere): the exact series of modes, the one-mode
 *                          approximation, the surface-temperature limit (Bi → ∞), the lumped model and the
 *                          short-time solution of a semi-infinite solid with surface convection
 *   volumetric source      θ'' + Γ = 0, θ'(0) = 0, −θ'(1) = Bi θ(1): exact in rationals
 *   multilayer wall        series thermal resistances with contact resistance: exact in rationals
 *   straight fin           θ'' − λ²θ = 0, θ(0) = 1, −θ'(1) = β λ θ(1) (β = 0: insulated tip)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"), require("./special.js"));
  else (root.SM = root.SM || {}).H = factory(root.SM.Q, root.SM.SF);
})(typeof self !== "undefined" ? self : this, function (Q, S) {
  "use strict";

  const GEOMETRIES = ["slab", "cylinder", "sphere"];
  /** j of the operator X^{-j}(X^j θ_X)_X. */
  const J = { slab: 0, cylinder: 1, sphere: 2 };
  /** Modes are kept while λ²τ <= this: the first one left out is below e^{-50} ≈ 2 × 10^{-22} times its coefficient. */
  const TAIL = 50;
  const MAX_MODES = 400;

  /** The spatial mode f(λX), with f(0) = 1. */
  function mode(geom, lam, X) {
    const z = lam * X;
    if (geom === "slab") return Math.cos(z);
    if (geom === "cylinder") return S.J0(z);
    return Math.abs(z) < 1e-8 ? 1 - (z * z) / 6 : Math.sin(z) / z;
  }

  /** The mean of a mode, (j + 1) ∫ X^j f(λX) dX, from its closed form. */
  function modeMean(geom, lam) {
    if (lam === 0) return 1;
    if (geom === "slab") return Math.sin(lam) / lam;
    if (geom === "cylinder") return (2 * S.J1(lam)) / lam;
    return lam < 1e-4 ? 1 - (lam * lam) / 10 : (3 * (Math.sin(lam) - lam * Math.cos(lam))) / (lam * lam * lam);
  }

  /** The coefficient C_n = ∫ X^j f_n dX / ∫ X^j f_n² dX of the uniform initial condition, in closed form. */
  function coefficient(geom, lam) {
    if (geom === "slab") return (4 * Math.sin(lam)) / (2 * lam + Math.sin(2 * lam));
    if (geom === "cylinder") {
      const [j0, j1] = S.bessel01(lam);
      return (2 / lam) * j1 / (j0 * j0 + j1 * j1);
    }
    return (4 * (Math.sin(lam) - lam * Math.cos(lam))) / (2 * lam - Math.sin(2 * lam));
  }

  /** The characteristic function whose roots are the eigenvalues, without poles. */
  function characteristic(geom, Bi) {
    if (geom === "slab") return (l) => l * Math.sin(l) - Bi * Math.cos(l);
    if (geom === "cylinder") return (l) => { const [j0, j1] = S.bessel01(l); return l * j1 - Bi * j0; };
    return (l) => l * Math.cos(l) - (1 - Bi) * Math.sin(l);
  }

  const modeCache = new Map();
  /**
   * The first n eigenvalues λ_k and coefficients C_k for Biot number Bi (Infinity: prescribed surface temperature).
   * Each root is found by Brent's method in its own bracket: ((k − 1)π, (k − 1/2)π) for the slab, (j_{1,k−1},
   * j_{0,k}) for the cylinder, ((k − 1)π, kπ) for the sphere.
   * @param {"slab" | "cylinder" | "sphere"} geom @param {number} Bi @param {number} n
   */
  function modes(geom, Bi, n) {
    const key = `${geom}|${Bi}`;
    const have = modeCache.get(key);
    if (have && have.length >= n) return have.slice(0, n);
    if (Bi === 0) return [{ lambda: 0, C: 1 }];
    const out = [];
    const f = characteristic(geom, Bi);
    const z0 = geom === "cylinder" ? S.besselZeros(0, n) : [];
    const z1 = geom === "cylinder" ? [0, ...S.besselZeros(1, n - 1)] : [];
    for (let k = 1; k <= n; k++) {
      let lam;
      if (Bi === Infinity) lam = geom === "slab" ? (k - 0.5) * Math.PI : geom === "cylinder" ? z0[k - 1] : k * Math.PI;
      else if (geom === "slab") lam = S.brent(f, (k - 1) * Math.PI, (k - 0.5) * Math.PI);
      else if (geom === "cylinder") lam = S.brent(f, z1[k - 1], z0[k - 1]);
      else lam = S.brent(f, k === 1 ? 1e-7 : (k - 1) * Math.PI, k * Math.PI);
      const L = /** @type {number} */ (lam);
      out.push({ lambda: L, C: coefficient(geom, L) });
    }
    if (modeCache.size > 400) modeCache.clear();
    modeCache.set(key, out);
    return out.slice();
  }

  /** The mode values f_n(λ_n X_i) for the points xs, kept for each point list (by identity), geometry and Bi. */
  const basisCache = new WeakMap();
  function basis(geom, Bi, list, xs) {
    let byXs = basisCache.get(xs);
    if (!byXs) { byXs = new Map(); basisCache.set(xs, byXs); }
    const key = `${geom}|${Bi}`;
    let b = byXs.get(key);
    if (!b || b.length < list.length) {
      b = list.map((m) => xs.map((X) => mode(geom, m.lambda, X)));
      if (byXs.size > 400) byXs.clear();
      byXs.set(key, b);
    }
    return b;
  }

  /** How many modes the series needs at time τ: those with λ²τ <= 50, at least one. */
  function modeCount(tau) {
    const lamMax = Math.sqrt(TAIL / Math.max(tau, 1e-12));
    return Math.max(1, Math.min(MAX_MODES, Math.ceil(lamMax / Math.PI) + 2));
  }

  /**
   * The exact series θ(X, τ) at the points X, with its settings: { values, modes, centre, mean, ok, reason }.
   * `limit` keeps only the first `limit` modes (1: the one-mode approximation).
   * @param {"slab" | "cylinder" | "sphere"} geom @param {number} Bi @param {number} tau @param {number[]} xs
   */
  function series(geom, Bi, tau, xs, limit = Infinity) {
    const need = modeCount(tau);
    if (need >= MAX_MODES && limit === Infinity) return { ok: false, reason: `The series needs more than ${MAX_MODES} modes at τ = ${tau}.`, values: [], modes: 0, mean: 0 };
    const list = modes(geom, Bi, Math.min(need, limit));
    const b = basis(geom, Bi, list, xs);
    const w = list.map((m) => m.C * Math.exp(-m.lambda * m.lambda * tau));
    const values = xs.map((_, i) => w.reduce((s, c, n) => s + c * b[n][i], 0));
    const mean = list.reduce((s, m) => s + m.C * modeMean(geom, m.lambda) * Math.exp(-m.lambda * m.lambda * tau), 0);
    return { ok: true, values, modes: list.length, mean };
  }

  /** The lumped model: θ = exp(−(j + 1) Bi τ), uniform in X. */
  const lumped = (geom, Bi, tau) => Math.exp(-(J[geom] + 1) * Bi * tau);

  /**
   * The short-time solution: a semi-infinite solid with surface convection, with s = 1 − X the distance from the
   * surface: θ = erf(η) + exp(−η²) erfcx(η + Bi√τ), η = s/(2√τ). This form has no overflow for large Bi or τ.
   */
  function semiInfinite(Bi, tau, X) {
    const r = Math.sqrt(tau);
    const eta = (1 - X) / (2 * r);
    if (Bi === Infinity) return S.erf(eta);
    return S.erf(eta) + Math.exp(-eta * eta) * S.erfcx(eta + Bi * r);
  }

  /** Rational coefficients of the first-order small-Bi outer expansion (src/asymptotic.js derives them): θ ≈
   * e^{−T}[1 + Bi(c + rT − X²/2)], T = (j + 1) Bi τ, c = (j + 1)/(2(j + 3)), r = 1/(j + 3). */
  function outerFirst(geom) {
    const j = J[geom];
    return { c: Q.q(j + 1, 2 * (j + 3)), r: Q.q(1, j + 3) };
  }
  function outerFirstValue(geom, Bi, tau, X) {
    const { c, r } = outerFirst(geom);
    const T = (J[geom] + 1) * Bi * tau;
    return Math.exp(-T) * (1 + Bi * (Q.toNumber(c) + Q.toNumber(r) * T - (X * X) / 2));
  }

  /* ---------- volumetric source in a slab: exact ---------- */

  /**
   * θ = Γ((1 − X²)/2 + 1/Bi) for θ'' + Γ = 0, θ'(0) = 0, −θ'(1) = Bi θ(1). All values are exact rationals.
   * @param {any} Gamma rational @param {any} Bi rational, > 0
   */
  function source(Gamma, Bi) {
    const half = Q.q(1, 2);
    const surface = Q.div(Gamma, Bi);
    const drop = Q.mul(Gamma, half);
    const at = (X) => Q.add(Q.mul(Gamma, Q.mul(half, Q.sub(Q.ONE, Q.mul(X, X)))), surface);
    return {
      at, centre: Q.add(drop, surface), surface, drop,
      // Heat balance: the source Γ (per unit area, over 0..1) leaves through the surface as −θ'(1) = Γ.
      flux: Gamma, exchange: Q.mul(Bi, surface),
      ratio: Q.div(drop, surface), // = Bi/2
    };
  }

  /* ---------- multilayer wall: exact series resistances ---------- */

  /**
   * A plane wall of layers with contact resistances between them and convection on both faces. Inputs are SI values
   * as rationals: { h1, Tinf1, layers: [{ L, k }], contacts: [R''], h2, Tinf2 }. Returns the resistances per unit
   * area, the heat flux, every interface temperature (both sides of each contact) and the checks.
   */
  function multilayer(w) {
    const parts = [{ id: "film-1", label: "film at face 1", R: Q.inv(w.h1) }];
    w.layers.forEach((ly, i) => {
      parts.push({ id: `layer-${i + 1}`, label: `layer ${i + 1}`, R: Q.div(ly.L, ly.k) });
      if (i < w.layers.length - 1) parts.push({ id: `contact-${i + 1}`, label: `contact ${i + 1}–${i + 2}`, R: w.contacts[i] });
    });
    parts.push({ id: "film-2", label: "film at face 2", R: Q.inv(w.h2) });
    const total = parts.reduce((s, p) => Q.add(s, p.R), Q.ZERO);
    const dT = Q.sub(w.Tinf1, w.Tinf2);
    const q = Q.div(dT, total);
    // Temperatures along the path: each element drops q R.
    let T = w.Tinf1;
    const nodes = [{ at: "fluid 1", T }];
    for (const p of parts) {
      p.drop = Q.mul(q, p.R);
      T = Q.sub(T, p.drop);
      nodes.push({ at: `after ${p.label}`, T });
    }
    // Heat continuity: the flux through each layer from its own face temperatures, k (T_left − T_right)/L.
    const fluxes = [];
    let idx = 1;
    w.layers.forEach((ly, i) => {
      const left = nodes[idx].T, right = nodes[idx + 1].T;
      fluxes.push({ layer: i + 1, q: Q.div(Q.mul(ly.k, Q.sub(left, right)), ly.L) });
      idx += i < w.layers.length - 1 ? 2 : 1;
    });
    return { parts, total, q, nodes, fluxes, closes: Q.eq(nodes[nodes.length - 1].T, w.Tinf2) };
  }

  /* ---------- straight fin ---------- */

  /**
   * The constant-section fin θ'' − λ²θ = 0, θ(0) = 1, −θ'(1) = βλθ(1), with β = h_tip/(mk) (0 for an insulated tip).
   * Written with e^{−λ} so that no cosh overflows: { at(X), Q (= Q̇L/(kA_cΔT) = −θ'(0)), efficiency, tip }. The
   * efficiency divides by the heat flow of a fin at the base temperature everywhere: λ² from the sides and βλ from the tip.
   */
  function fin(lam, beta = 0) {
    const e2 = Math.exp(-2 * lam);
    const den = (1 + beta) + (1 - beta) * e2;
    const at = (X) => ((1 + beta) * Math.exp(-lam * X) + (1 - beta) * Math.exp(-lam * (2 - X))) / den;
    const Qb = lam === 0 ? 0 : (lam * ((1 + beta) - (1 - beta) * e2)) / den;
    return { at, Q: Qb, tip: at(1), efficiency: lam === 0 ? 1 : Qb / (lam * lam + beta * lam) };
  }

  return { GEOMETRIES, J, TAIL, MAX_MODES, mode, modeMean, coefficient, characteristic, modes, modeCount, series, lumped, semiInfinite, outerFirst, outerFirstValue, source, multilayer, fin };
});
