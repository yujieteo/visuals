/* Scientific Modelling: the fluid–structure interaction family (piece 9). A rigid airfoil section in pitch and
 * plunge, the typical section, with two declared aerodynamic models, after the open Georgia Tech typical-section
 * example (data/flutterrefs.json names the sources):
 *
 *   1. Frequency domain, Theodorsen's function C(k) from Hankel functions: the k method finds the flutter onset as
 *      the reduced frequency where the artificial damping g of a branch is 0; the p–k method gives the modal damping
 *      and frequency at each speed. Both solve the same flutter determinant.
 *   2. Time domain, the R. T. Jones approximation of the Wagner function: a real 6 × 6 state matrix A(V) whose
 *      eigenvalues give the modal damping, and whose first eigenvalue with Re p = 0 gives the onset.
 *
 * The checks compare the two methods (they differ only by the Jones approximation), compare method 1 with the
 * Jones C(k) against method 2 (the same aerodynamics, so they must agree to solver accuracy), check the exact
 * divergence speed and the positive mass matrix with rational arithmetic, measure the residuals, and integrate the
 * time-domain model with RK4 at the onset to show convergence of order 4 to the matrix-exponential solution. A
 * limit-cycle amplitude above the onset needs a nonlinear model: the analysis keeps it unresolved.
 *
 * Everything here is plain numbers: no BigInt leaves this module except through the exact checks, which return
 * text. Nondimensional time is τ = ω_θ t; the speed is V = U/(bω_θ); the reduced frequency is k = bω/U = Ω/V with
 * Ω = ω/ω_θ.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"));
  else (root.SM = root.SM || {}).FSI = factory(root.SM.Q);
})(typeof self !== "undefined" ? self : this, function (Q) {
  "use strict";

  /* ---------- complex numbers ---------- */

  /** @typedef {{ re: number, im: number }} Complex */
  /** @returns {Complex} */
  const cx = (re, im = 0) => ({ re, im });
  const cadd = (a, b) => cx(a.re + b.re, a.im + b.im);
  const csub = (a, b) => cx(a.re - b.re, a.im - b.im);
  const cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const cscale = (a, s) => cx(a.re * s, a.im * s);
  const cabs = (a) => Math.hypot(a.re, a.im);
  function cdiv(a, b) {
    const d = b.re * b.re + b.im * b.im;
    return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
  }
  /** The principal square root, without cancellation for a negative real part. */
  function csqrt(a) {
    const r = Math.hypot(a.re, a.im);
    if (r === 0) return cx(0, 0);
    if (a.re >= 0) {
      const t = Math.sqrt((r + a.re) / 2);
      return cx(t, a.im / (2 * t));
    }
    const t = Math.sqrt((r - a.re) / 2);
    return cx(Math.abs(a.im) / (2 * t), a.im < 0 ? -t : t);
  }
  /** Both roots of a x² + b x + c = 0 with complex coefficients, without cancellation. */
  function quadratic(a, b, c) {
    const disc = csqrt(csub(cmul(b, b), cscale(cmul(a, c), 4)));
    const s = b.re * disc.re + b.im * disc.im >= 0 ? 1 : -1;
    const q = cscale(cadd(b, cscale(disc, s)), -0.5);
    if (cabs(q) === 0) return [cx(0), cx(0)];
    return [cdiv(q, a), cdiv(c, q)];
  }

  /* ---------- Bessel functions of the first and second kind, orders 0 and 1, for x > 0 ---------- */

  const EULER_GAMMA = 0.5772156649015329;
  const SERIES_LIMIT = 14;

  /** Power series (DLMF 10.2.2 and 10.8.1). The largest term at x = 14 is about 3·10⁴, so about 1e-12 is lost. */
  function besselSeries(x) {
    const y = (x * x) / 4, h = x / 2;
    let a0 = 1, a1 = 1, H = 0, J0 = 0, J1s = 0, S0 = 0, S1 = 0;
    for (let k = 0; k < 120; k++) {
      if (k > 0) {
        a0 *= -y / (k * k);
        a1 *= -y / (k * (k + 1));
        H += 1 / k;
      }
      const H1 = H + 1 / (k + 1);
      J0 += a0;
      J1s += a1;
      S0 += H * a0;
      S1 += (H + H1) * a1;
      if (k > y && Math.abs(a0) * (1 + H1) < 1e-22 && Math.abs(a1) * (1 + H1) < 1e-22) break;
    }
    const J1 = h * J1s;
    const L = Math.log(h) + EULER_GAMMA;
    return { J0, J1, Y0: (2 / Math.PI) * (L * J0 - S0), Y1: -2 / (Math.PI * x) + (2 / Math.PI) * L * J1 - (h / Math.PI) * S1 };
  }

  /** Hankel's asymptotic expansion (DLMF 10.17.3 and 10.17.4), truncated at its smallest term. */
  function besselAsymptotic(x, n) {
    let P = 0, Qs = 0, a = 1, last = Infinity;
    for (let k = 0; k < 60; k++) {
      if (k > 0) a *= (4 * n * n - (2 * k - 1) ** 2) / (8 * k);
      const t = a / x ** k;
      if (Math.abs(t) > last) break;
      last = Math.abs(t);
      const sign = Math.floor(k / 2) % 2 === 0 ? 1 : -1;
      if (k % 2 === 0) P += sign * t;
      else Qs += sign * t;
      if (Math.abs(t) < 1e-17) break;
    }
    const chi = x - (n / 2 + 1 / 4) * Math.PI;
    const s = Math.sqrt(2 / (Math.PI * x));
    return { J: s * (P * Math.cos(chi) - Qs * Math.sin(chi)), Y: s * (P * Math.sin(chi) + Qs * Math.cos(chi)) };
  }

  /** J₀, J₁, Y₀ and Y₁ at x > 0. */
  function bessel(x) {
    if (!(x > 0)) throw new RangeError("bessel: x must be positive");
    if (x <= SERIES_LIMIT) return besselSeries(x);
    const b0 = besselAsymptotic(x, 0), b1 = besselAsymptotic(x, 1);
    return { J0: b0.J, J1: b1.J, Y0: b0.Y, Y1: b1.Y };
  }

  /* ---------- the two aerodynamic models ---------- */

  /** R. T. Jones' coefficients: φ(s) ≈ 1 − C₁e^(−ε₁s) − C₂e^(−ε₂s), s = Ut/b. */
  const JONES = Object.freeze({ C1: 0.165, eps1: 0.0455, C2: 0.335, eps2: 0.3 });
  /** Below this reduced frequency C(k) is 1 to better than 1e-12 · |k ln k|, and the static form is used. */
  const K_STATIC = 1e-9;

  /** Theodorsen's function C(k) = H₁⁽²⁾(k) / (H₁⁽²⁾(k) + i H₀⁽²⁾(k)), with H_n⁽²⁾ = J_n − iY_n. */
  function theodorsen(k) {
    if (k < K_STATIC) return cx(1, 0);
    const { J0, J1, Y0, Y1 } = bessel(k);
    return cdiv(cx(J1, -Y1), cx(J1 + Y0, J0 - Y1));
  }
  /** The transfer function of the R. T. Jones approximation at s = ik: 1 − C₁ik/(ik + ε₁) − C₂ik/(ik + ε₂). */
  function jones(k) {
    const s = cx(0, k);
    return csub(csub(cx(1), cscale(cdiv(s, cadd(s, cx(JONES.eps1))), JONES.C1)), cscale(cdiv(s, cadd(s, cx(JONES.eps2))), JONES.C2));
  }
  const AERO = { theodorsen, jones };

  /**
   * The aerodynamic coefficients of the flutter determinant, multiplied by k² (so they stay finite as k → 0):
   * k²l_h, k²l_θ, k²m_h, k²m_θ, from the Georgia Tech worksheet's l_h = 1 − 2iC/k, l_θ = −a − i/k − 2C/k² −
   * 2i(1/2 − a)C/k, m_h = −a + 2i(1/2 + a)C/k and m_θ = 1/8 + a² − i(1/2 − a)/k + 2(1/2 + a)C/k² + 2i(1/4 − a²)C/k.
   */
  function aeroK2(k, a, C) {
    const iCk = cmul(cx(0, k), C); // i C k
    return {
      lh: csub(cx(k * k), cscale(iCk, 2)),
      lt: csub(csub(cx(-a * k * k, -k), cscale(C, 2)), cscale(iCk, 2 * (0.5 - a))),
      mh: cadd(cx(-a * k * k), cscale(iCk, 2 * (0.5 + a))),
      mt: cadd(cadd(cx((1 / 8 + a * a) * k * k, -(0.5 - a) * k), cscale(C, 2 * (0.5 + a))), cscale(iCk, 2 * (0.25 - a * a))),
    };
  }

  /* ---------- the structural parameters ---------- */

  /**
   * Parameters from exact rationals (or numbers): a, e, μ, r², σ. Returns floats for the solvers, the exact text and
   * the exact checks of the parameter domain. @param {Record<string, any>} p
   */
  function parameters(p) {
    const ex = {};
    for (const key of ["a", "e", "mu", "r2", "sigma"]) {
      const v = p[key];
      ex[key] = v && typeof v === "object" && "n" in v ? v : Q.parse(String(v));
      if (!ex[key]) throw new TypeError(`parameters: ${key} is not a number`);
    }
    ex.xt = Q.sub(ex.e, ex.a);
    const f = Object.fromEntries(Object.entries(ex).map(([k, v]) => [k, Q.toNumber(v)]));
    const half = Q.q(1, 2), eighth = Q.q(1, 8);
    // The mass matrix of the section with the apparent mass of the air, scaled by 1/(πρb²) and 1/(πρb⁴).
    const M11 = Q.add(ex.mu, Q.ONE), M12 = Q.sub(Q.mul(ex.mu, ex.xt), ex.a), M22 = Q.add(Q.add(Q.mul(ex.mu, ex.r2), eighth), Q.mul(ex.a, ex.a));
    const detM = Q.sub(Q.mul(M11, M22), Q.mul(M12, M12));
    const detS = Q.mul(Q.mul(ex.mu, ex.mu), Q.sub(ex.r2, Q.mul(ex.xt, ex.xt)));
    const onePlus2a = Q.add(Q.ONE, Q.mul(Q.q(2), ex.a));
    const VD2 = Q.sign(onePlus2a) > 0 ? Q.div(Q.mul(ex.mu, ex.r2), onePlus2a) : null;
    const lt = (x, y) => Q.cmp(x, y) < 0;
    const domain = [
      { id: "mu", text: "μ > 0", ok: Q.sign(ex.mu) > 0 },
      { id: "r2", text: "r² > 0", ok: Q.sign(ex.r2) > 0 },
      { id: "sigma", text: "σ > 0", ok: Q.sign(ex.sigma) > 0 },
      { id: "a", text: "−1 < a < 1", ok: lt(Q.q(-1), ex.a) && lt(ex.a, Q.ONE) },
      { id: "e", text: "−1 < e < 1", ok: lt(Q.q(-1), ex.e) && lt(ex.e, Q.ONE) },
      { id: "inertia", text: `r² − x_θ² = ${Q.str(Q.sub(ex.r2, Q.mul(ex.xt, ex.xt)))} > 0`, ok: Q.sign(detS) > 0 },
      { id: "mass", text: `det M = ${Q.str(detM)} > 0`, ok: Q.sign(detM) > 0 },
    ];
    return {
      a: f.a, e: f.e, xt: f.xt, mu: f.mu, r2: f.r2, sigma: f.sigma,
      exact: { a: Q.str(ex.a), e: Q.str(ex.e), xt: Q.str(ex.xt), mu: Q.str(ex.mu), r2: Q.str(ex.r2), sigma: Q.str(ex.sigma),
        M: [[Q.str(M11), Q.str(M12)], [Q.str(M12), Q.str(M22)]], detM: Q.str(detM), VD2: VD2 ? Q.str(VD2) : null, onePlus2a: Q.str(onePlus2a), half: Q.str(half) },
      VD: VD2 ? Math.sqrt(Q.toNumber(VD2)) : null,
      domain, valid: domain.every((d) => d.ok),
    };
  }

  /* ---------- method 1: the frequency domain ---------- */

  /**
   * The roots X = (ω_θ/ω)²(1 + ig) of the flutter determinant at reduced frequency k:
   * [μ(1 − σ²X) + l_h][μr²(1 − X) + m_θ] − (μx_θ + l_θ)(μx_θ + m_h) = 0.
   */
  function flutterRoots(P, k, model = "theodorsen") {
    const C = AERO[model](k);
    const c = aeroK2(k, P.a, C);
    const ik2 = 1 / (k * k);
    const lh = cscale(c.lh, ik2), lt = cscale(c.lt, ik2), mh = cscale(c.mh, ik2), mt = cscale(c.mt, ik2);
    const { mu, r2, xt } = P, s2 = P.sigma * P.sigma;
    const A11 = cadd(cx(mu), lh), A22 = cadd(cx(mu * r2), mt);
    const a2 = cx(mu * mu * s2 * r2);
    const a1 = cscale(cadd(cscale(A11, r2), cscale(A22, s2)), -mu);
    const a0 = csub(cmul(A11, A22), cmul(cadd(cx(mu * xt), lt), cadd(cx(mu * xt), mh)));
    return { roots: quadratic(a2, a1, a0), coef: [a2, a1, a0] };
  }
  /** |det| / scale of the flutter determinant at (k, X): the residual of a flutter point. */
  function flutterResidual(P, k, X, model = "theodorsen") {
    const { coef } = flutterRoots(P, k, model);
    const val = cadd(cadd(cmul(coef[0], cmul(X, X)), cmul(coef[1], X)), coef[2]);
    const scale = cabs(cmul(coef[0], cmul(X, X))) + cabs(cmul(coef[1], X)) + cabs(coef[2]);
    return cabs(val) / scale;
  }

  /** A logarithmic grid from hi down to lo, n points. */
  const logGrid = (hi, lo, n) => Array.from({ length: n }, (_, i) => hi * (lo / hi) ** (i / (n - 1)));

  /** Brent's method (zeroin) on [a, b] with f(a)·f(b) ≤ 0. */
  function brent(f, a, b, tol = 1e-13, maxIter = 200) {
    let fa = f(a), fb = f(b);
    if (fa === 0) return { x: a, iterations: 0 };
    if (fb === 0) return { x: b, iterations: 0 };
    if (fa * fb > 0) throw new RangeError("brent: the interval does not bracket a root");
    let c = a, fc = fa, d = b - a, e = d;
    for (let it = 1; it <= maxIter; it++) {
      if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
      if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
      const tol1 = 2 * Number.EPSILON * Math.abs(b) + tol / 2;
      const xm = (c - b) / 2;
      if (Math.abs(xm) <= tol1 || fb === 0) return { x: b, iterations: it };
      if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
        const s = fb / fa;
        let p, q;
        if (a === c) { p = 2 * xm * s; q = 1 - s; }
        else {
          const qq = fa / fc, r = fb / fc;
          p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
          q = (qq - 1) * (r - 1) * (s - 1);
        }
        if (p > 0) q = -q;
        p = Math.abs(p);
        if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
        else { d = xm; e = d; }
      } else { d = xm; e = d; }
      a = b;
      fa = fb;
      b += Math.abs(d) > tol1 ? d : xm > 0 ? tol1 : -tol1;
      fb = f(b);
    }
    return { x: b, iterations: maxIter };
  }

  /** The root of a list nearest to a target. */
  const nearest = (roots, target) => roots.reduce((best, r) => (cabs(csub(r, target)) < cabs(csub(best, target)) ? r : best), roots[0]);

  /**
   * The k method: both branches X(k) for k from kMax down to kMin, tracked by continuity, with g = Im X/Re X,
   * Ω = 1/√(Re X) and V = Ω/k; the onset is the lowest V where a branch's g changes from negative to positive,
   * refined with Brent's method on Im X(k).
   */
  function kMethod(P, { model = "theodorsen", kMax = 4, kMin = 0.02, n = 240 } = {}) {
    const ks = logGrid(kMax, kMin, n);
    const branches = [[], []];
    let prev = null;
    for (const k of ks) {
      let [r1, r2] = flutterRoots(P, k, model).roots;
      if (!prev) { if (r1.re < r2.re) [r1, r2] = [r2, r1]; }
      else if (cabs(csub(r1, prev[0])) + cabs(csub(r2, prev[1])) > cabs(csub(r2, prev[0])) + cabs(csub(r1, prev[1]))) [r1, r2] = [r2, r1];
      prev = [r1, r2];
      [r1, r2].forEach((X, j) => {
        const ok = X.re > 0;
        branches[j].push({ k, X, ok, g: ok ? X.im / X.re : null, Omega: ok ? 1 / Math.sqrt(X.re) : null, V: ok ? 1 / Math.sqrt(X.re) / k : null });
      });
    }
    const crossings = [];
    branches.forEach((pts, j) => {
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1], p1 = pts[i];
        if (!p0.ok || !p1.ok) continue;
        if (p0.X.im < 0 && p1.X.im >= 0) {
          const f = (k) => nearest(flutterRoots(P, k, model).roots, cadd(p0.X, cscale(csub(p1.X, p0.X), (p0.k - k) / (p0.k - p1.k)))).im;
          const { x: k, iterations } = brent(f, p1.k, p0.k, 1e-15);
          const X = nearest(flutterRoots(P, k, model).roots, p1.X);
          const Omega = 1 / Math.sqrt(X.re);
          crossings.push({ branch: j, k, Omega, V: Omega / k, X, residual: flutterResidual(P, k, cx(X.re, 0), model), iterations });
        }
      }
    });
    crossings.sort((x, y) => x.V - y.V);
    return { model, branches: branches.map((pts) => pts.map((p) => ({ k: p.k, V: p.V, Omega: p.Omega, g: p.g }))), onset: crossings[0] ?? null, crossings };
  }

  /**
   * The p–k method at speed V for one mode: iterate k = Ω/V until it stops changing. The aerodynamic matrix is
   * evaluated at the current k and held fixed while the 2 × 2 problem det(p²M_s + K_s − V²·k²A(k)) = 0 is solved
   * for p, with M_s = μ[1 x_θ; x_θ r²] and K_s = μ[σ² 0; 0 r²]. Returns p = Re p + iΩ (per ω_θ).
   */
  function pkPoint(P, V, Omega0, { model = "theodorsen", tol = 1e-12, maxIter = 200 } = {}) {
    const { mu, r2, xt } = P, s2 = P.sigma * P.sigma;
    let Omega = Omega0, p = cx(0, Omega0);
    for (let it = 1; it <= maxIter; it++) {
      const k = Omega / V;
      const c = aeroK2(Math.max(k, 0), P.a, AERO[model](Math.max(k, K_STATIC)));
      const V2 = V * V;
      // N = K_s − V² k² A(k)
      const N11 = csub(cx(mu * s2), cscale(c.lh, V2)), N12 = cscale(c.lt, -V2), N21 = cscale(c.mh, -V2), N22 = csub(cx(mu * r2), cscale(c.mt, V2));
      const M11 = mu, M12 = mu * xt, M22 = mu * r2;
      const A = cx(M11 * M22 - M12 * M12);
      const B = csub(cadd(cscale(N22, M11), cscale(N11, M22)), cadd(cscale(N21, M12), cscale(N12, M12)));
      const Cc = csub(cmul(N11, N22), cmul(N12, N21));
      const Ps = quadratic(A, B, Cc);
      const cands = Ps.flatMap((Pq) => { const s = csqrt(Pq); return [s, cscale(s, -1)]; }).filter((x) => x.im >= -1e-14);
      const pick = cands.reduce((best, x) => (Math.abs(x.im - Omega) < Math.abs(best.im - Omega) ? x : best), cands[0]);
      const next = Math.max(pick.im, 0);
      p = pick;
      if (Math.abs(next - Omega) <= tol * Math.max(1, Omega)) return { p, k: next / V, iterations: it, converged: true };
      Omega = next;
      if (Omega < 1e-9) return { p, k: 0, iterations: it, converged: true, static: true };
    }
    return { p, k: Omega / V, iterations: maxIter, converged: false };
  }

  /** The in-vacuo frequencies Ω of the structure: det(K_s − Ω²M_s) = 0, in increasing order. */
  function inVacuo(P) {
    const { r2, xt } = P, s2 = P.sigma * P.sigma;
    // (s² − Ω²)(r² − r²Ω²) − x_θ²Ω⁴ = 0 → (r² − x_θ²)Ω⁴ − r²(1 + s²)Ω² + s²r² = 0
    const [w1, w2] = quadratic(cx(r2 - xt * xt), cx(-r2 * (1 + s2)), cx(s2 * r2)).map((z) => Math.sqrt(z.re));
    return [Math.min(w1, w2), Math.max(w1, w2)];
  }

  /** The p–k method over a speed grid: each mode tracked from its in-vacuo frequency. */
  function pkMethod(P, Vs, { model = "theodorsen" } = {}) {
    const start = inVacuo(P);
    let maxIter = 0, allConverged = true;
    const modes = start.map((Om0) => {
      let Omega = Om0;
      const pts = [];
      for (const V of Vs) {
        const r = pkPoint(P, V, Omega, { model });
        maxIter = Math.max(maxIter, r.iterations);
        allConverged = allConverged && r.converged;
        if (r.static) { pts.push({ V, re: r.p.re, Omega: 0, zeta: null, k: 0 }); break; }
        Omega = r.p.im;
        pts.push({ V, re: r.p.re, Omega: r.p.im, zeta: -r.p.re / cabs(r.p), k: r.k });
      }
      return pts;
    });
    return { model, modes, maxIterations: maxIter, converged: allConverged };
  }

  /** The p–k onset: Brent's method on Re p of the mode whose damping crosses 0 first on the grid. */
  function pkOnset(P, sweep, { model = "theodorsen" } = {}) {
    let best = null;
    sweep.modes.forEach((pts, j) => {
      for (let i = 1; i < pts.length; i++) {
        if (pts[i - 1].re < 0 && pts[i].re >= 0 && pts[i].Omega > 0) {
          const f = (V) => pkPoint(P, V, pts[i - 1].Omega, { model }).p.re;
          const { x: V } = brent(f, pts[i - 1].V, pts[i].V, 1e-14);
          const r = pkPoint(P, V, pts[i - 1].Omega, { model });
          if (!best || V < best.V) best = { mode: j, V, Omega: r.p.im, k: r.k, re: r.p.re };
          break;
        }
      }
    });
    return best;
  }

  /* ---------- method 2: the time domain ---------- */

  /**
   * The state matrix A(V) of x' = A x, x = [ξ, θ, ξ', θ', λ̂₁, λ̂₂], with ξ = h/b, ( )' = d/dτ, τ = ω_θ t and
   * λ̂ᵢ = λᵢ/(bω_θ). Divided by πρb³ω_θ² (plunge) and πρb⁴ω_θ² (pitch), the record's equations become
   *   (μ + 1)ξ'' + (μx_θ − a)θ'' + μσ²ξ + Vθ' + 2V q_e = 0,
   *   (μx_θ − a)ξ'' + (μr² + 1/8 + a²)θ'' + μr²θ + V(1/2 − a)θ' − 2V(a + 1/2) q_e = 0,
   *   q = ξ' + Vθ + (1/2 − a)θ',  q_e = (1 − C₁ − C₂)q + λ̂₁ + λ̂₂,  λ̂ᵢ' = Vεᵢ(Cᵢq − λ̂ᵢ).
   */
  function stateMatrix(P, V) {
    const { a, mu, r2, xt } = P, s2 = P.sigma * P.sigma;
    const { C1, C2, eps1, eps2 } = JONES;
    const c0 = 1 - C1 - C2;
    const q = [0, V, 1, 0.5 - a, 0, 0];
    const qe = [0, c0 * V, c0, c0 * (0.5 - a), 1, 1];
    const F1 = [mu * s2, 0, 0, V, 0, 0].map((x, j) => -(x + 2 * V * qe[j]));
    const F2 = [0, mu * r2, 0, V * (0.5 - a), 0, 0].map((x, j) => -(x - 2 * V * (a + 0.5) * qe[j]));
    const M11 = mu + 1, M12 = mu * xt - a, M22 = mu * r2 + 1 / 8 + a * a;
    const det = M11 * M22 - M12 * M12;
    const acc1 = F1.map((x, j) => (M22 * x - M12 * F2[j]) / det);
    const acc2 = F2.map((x, j) => (M11 * x - M12 * F1[j]) / det);
    return [
      [0, 0, 1, 0, 0, 0],
      [0, 0, 0, 1, 0, 0],
      acc1,
      acc2,
      q.map((x, j) => V * eps1 * C1 * x - (j === 4 ? V * eps1 : 0)),
      q.map((x, j) => V * eps2 * C2 * x - (j === 5 ? V * eps2 : 0)),
    ];
  }

  /** Reduce a copy of A to upper Hessenberg form by stabilized elementary similarity transformations. */
  function hessenberg(A) {
    const n = A.length;
    const a = A.map((r) => r.slice());
    for (let m = 1; m < n - 1; m++) {
      let x = 0, i = m;
      for (let j = m; j < n; j++) if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
      if (i !== m) {
        for (let j = m - 1; j < n; j++) [a[i][j], a[m][j]] = [a[m][j], a[i][j]];
        for (let j = 0; j < n; j++) [a[j][i], a[j][m]] = [a[j][m], a[j][i]];
      }
      if (x !== 0) {
        for (i = m + 1; i < n; i++) {
          let y = a[i][m - 1];
          if (y !== 0) {
            y /= x;
            a[i][m - 1] = y;
            for (let j = m; j < n; j++) a[i][j] -= y * a[m][j];
            for (let j = 0; j < n; j++) a[j][m] += y * a[j][i];
          }
        }
      }
    }
    for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) a[i][j] = 0;
    return a;
  }

  /** The eigenvalues of an upper Hessenberg matrix by the Francis double-shift QR algorithm (hqr, 1-based inside). */
  function hqr(H) {
    const n = H.length;
    const a = [[]];
    for (let i = 0; i < n; i++) a.push([0, ...H[i]]);
    const wr = new Array(n + 1).fill(0), wi = new Array(n + 1).fill(0);
    let anorm = 0;
    for (let i = 1; i <= n; i++) for (let j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i][j]);
    let nn = n, t = 0;
    let p = 0, q = 0, r = 0, s = 0, w = 0, x = 0, y = 0, z = 0;
    while (nn >= 1) {
      let its = 0, l;
      do {
        for (l = nn; l >= 2; l--) {
          s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
          if (s === 0) s = anorm;
          if (Math.abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; }
        }
        x = a[nn][nn];
        if (l === nn) {
          wr[nn] = x + t;
          wi[nn--] = 0;
        } else {
          y = a[nn - 1][nn - 1];
          w = a[nn][nn - 1] * a[nn - 1][nn];
          if (l === nn - 1) {
            p = 0.5 * (y - x);
            q = p * p + w;
            z = Math.sqrt(Math.abs(q));
            x += t;
            if (q >= 0) {
              z = p + (p >= 0 ? Math.abs(z) : -Math.abs(z));
              wr[nn - 1] = wr[nn] = x + z;
              if (z) wr[nn] = x - w / z;
              wi[nn - 1] = wi[nn] = 0;
            } else {
              wr[nn - 1] = wr[nn] = x + p;
              wi[nn - 1] = -(wi[nn] = z);
            }
            nn -= 2;
          } else {
            if (its === 60) throw new Error("hqr: no convergence");
            if (its === 10 || its === 20) {
              t += x;
              for (let i = 1; i <= nn; i++) a[i][i] -= x;
              s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
              y = x = 0.75 * s;
              w = -0.4375 * s * s;
            }
            ++its;
            let m;
            for (m = nn - 2; m >= l; m--) {
              z = a[m][m];
              r = x - z;
              s = y - z;
              p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
              q = a[m + 1][m + 1] - z - r - s;
              r = a[m + 2][m + 1];
              s = Math.abs(p) + Math.abs(q) + Math.abs(r);
              p /= s;
              q /= s;
              r /= s;
              if (m === l) break;
              const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
              const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
              if (u + v === v) break;
            }
            for (let i = m + 2; i <= nn; i++) {
              a[i][i - 2] = 0;
              if (i !== m + 2) a[i][i - 3] = 0;
            }
            for (let k = m; k <= nn - 1; k++) {
              if (k !== m) {
                p = a[k][k - 1];
                q = a[k + 1][k - 1];
                r = 0;
                if (k !== nn - 1) r = a[k + 2][k - 1];
                if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) {
                  p /= x;
                  q /= x;
                  r /= x;
                }
              }
              const sq = Math.sqrt(p * p + q * q + r * r);
              if ((s = p >= 0 ? sq : -sq) !== 0) {
                if (k === m) {
                  if (l !== m) a[k][k - 1] = -a[k][k - 1];
                } else a[k][k - 1] = -s * x;
                p += s;
                x = p / s;
                y = q / s;
                z = r / s;
                q /= p;
                r /= p;
                for (let j = k; j <= nn; j++) {
                  p = a[k][j] + q * a[k + 1][j];
                  if (k !== nn - 1) {
                    p += r * a[k + 2][j];
                    a[k + 2][j] -= p * z;
                  }
                  a[k + 1][j] -= p * y;
                  a[k][j] -= p * x;
                }
                const mmin = nn < k + 3 ? nn : k + 3;
                for (let i = l; i <= mmin; i++) {
                  p = x * a[i][k] + y * a[i][k + 1];
                  if (k !== nn - 1) {
                    p += z * a[i][k + 2];
                    a[i][k + 2] -= p * r;
                  }
                  a[i][k + 1] -= p * q;
                  a[i][k] -= p;
                }
              }
            }
          }
        }
      } while (l < nn - 1);
    }
    return wr.slice(1).map((re, i) => cx(re, wi[i + 1]));
  }

  /** The eigenvalues of a real square matrix. */
  const eigenvalues = (A) => hqr(hessenberg(A));

  /** Solve (A − λI)x = b in complex arithmetic with partial pivoting; A real, λ complex. */
  function shiftedSolve(A, lambda, b) {
    const n = A.length;
    const M = A.map((row, i) => row.map((v, j) => (i === j ? cx(v - lambda.re, -lambda.im) : cx(v))));
    const x = b.map((v) => ({ ...v }));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let i = c + 1; i < n; i++) if (cabs(M[i][c]) > cabs(M[piv][c])) piv = i;
      [M[c], M[piv]] = [M[piv], M[c]];
      [x[c], x[piv]] = [x[piv], x[c]];
      if (cabs(M[c][c]) === 0) M[c][c] = cx(1e-300);
      for (let i = c + 1; i < n; i++) {
        const f = cdiv(M[i][c], M[c][c]);
        for (let j = c; j < n; j++) M[i][j] = csub(M[i][j], cmul(f, M[c][j]));
        x[i] = csub(x[i], cmul(f, x[c]));
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let j = i + 1; j < n; j++) s = csub(s, cmul(M[i][j], x[j]));
      x[i] = cdiv(s, M[i][i]);
    }
    return x;
  }

  /** An eigenvector of A for an eigenvalue λ by inverse iteration, with the residual ‖Av − λv‖ / (‖A‖‖v‖). */
  function eigenvector(A, lambda) {
    const n = A.length;
    const norm = (v) => Math.sqrt(v.reduce((s, z) => s + z.re * z.re + z.im * z.im, 0));
    const shift = cadd(lambda, cx(1e-10 * (1 + cabs(lambda)), 1e-10 * (1 + cabs(lambda))));
    let v = Array.from({ length: n }, (_, i) => cx(1 / Math.sqrt(n), i / n));
    for (let it = 0; it < 3; it++) {
      v = shiftedSolve(A, shift, v);
      const s = norm(v);
      v = v.map((z) => cscale(z, 1 / s));
    }
    const Av = A.map((row) => row.reduce((s, aij, j) => cadd(s, cscale(v[j], aij)), cx(0)));
    const res = norm(Av.map((z, i) => csub(z, cmul(lambda, v[i]))));
    const Anorm = Math.max(...A.map((row) => row.reduce((s, x) => s + Math.abs(x), 0)));
    return { v, residual: res / (Anorm * norm(v)) };
  }

  /** Is an eigenvalue a structural mode (complex pair) rather than a real mode (aerodynamic lag, or divergence above V_D)? */
  const isStructural = (p) => p.im > 1e-9;

  /** The structural modes (Im p > 0) over a speed grid, tracked by continuity, with damping ratio ζ = −Re p/|p|. */
  function stateSweep(P, Vs) {
    const modes = [[], []];
    let prev = null;
    for (const V of Vs) {
      const ps = eigenvalues(stateMatrix(P, V)).filter(isStructural).sort((x, y) => x.im - y.im);
      if (ps.length < 2) {
        // A pair has become real: divergence. The tracked modes end here.
        if (prev && ps.length === 1) {
          const j = cabs(csub(ps[0], prev[0])) < cabs(csub(ps[0], prev[1])) ? 0 : 1;
          modes[j].push({ V, re: ps[0].re, Omega: ps[0].im, zeta: -ps[0].re / cabs(ps[0]) });
        }
        break;
      }
      let [p1, p2] = ps;
      if (prev && cabs(csub(p1, prev[0])) + cabs(csub(p2, prev[1])) > cabs(csub(p2, prev[0])) + cabs(csub(p1, prev[1]))) [p1, p2] = [p2, p1];
      prev = [p1, p2];
      [p1, p2].forEach((p, j) => modes[j].push({ V, re: p.re, Omega: p.im, zeta: -p.re / cabs(p) }));
    }
    return { modes };
  }

  /** The largest real part of the eigenvalues of A(V). */
  const growth = (P, V) => Math.max(...eigenvalues(stateMatrix(P, V)).map((p) => p.re));

  /**
   * The first instability of the time-domain model: the lowest V on the grid where the largest real part of the
   * eigenvalues becomes positive, refined by Brent's method. Flutter when the crossing eigenvalue is a complex pair,
   * divergence when it is real.
   */
  function stateOnset(P, Vs) {
    for (let i = 1; i < Vs.length; i++) {
      const g0 = growth(P, Vs[i - 1]), g1 = growth(P, Vs[i]);
      if (g0 < 0 && g1 >= 0) {
        const { x: V, iterations } = brent((v) => growth(P, v), Vs[i - 1], Vs[i], 1e-14);
        const A = stateMatrix(P, V);
        const ps = eigenvalues(A);
        const p = ps.reduce((b, x) => (x.re > b.re ? x : b), ps[0]);
        const pc = cx(p.re, Math.abs(p.im));
        const ev = eigenvector(A, pc);
        // The slope d(Re p)/dV by a central difference: positive for a transversal crossing.
        const h = 1e-6 * V;
        const slope = (growth(P, V + h) - growth(P, V - h)) / (2 * h);
        return { V, Omega: Math.abs(p.im), k: Math.abs(p.im) / V, re: p.re, kind: Math.abs(p.im) > 1e-9 ? "flutter" : "divergence", residual: ev.residual, slope, iterations, eigenvalues: ps };
      }
    }
    return null;
  }

  /* ---------- time integration: the matrix exponential and RK4 ---------- */

  const matmul = (A, B) => A.map((row) => B[0].map((_, j) => row.reduce((s, x, k) => s + x * B[k][j], 0)));
  const matvec = (A, x) => A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
  const identity = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

  /** exp(tA) by scaling and squaring with a Taylor series of degree 24 on ‖tA/2^s‖₁ ≤ 1/2. */
  function expm(A, t) {
    const n = A.length;
    const norm = Math.max(...A[0].map((_, j) => A.reduce((s, row) => s + Math.abs(row[j] * t), 0)));
    const sq = Math.max(0, Math.ceil(Math.log2(norm || 1)) + 1);
    const B = A.map((row) => row.map((x) => (x * t) / 2 ** sq));
    let E = identity(n), term = identity(n);
    for (let k = 1; k <= 24; k++) {
      term = matmul(term, B).map((row) => row.map((x) => x / k));
      E = E.map((row, i) => row.map((x, j) => x + term[i][j]));
    }
    for (let i = 0; i < sq; i++) E = matmul(E, E);
    return E;
  }

  /** Classical RK4 for x' = A x over N steps of size dt. */
  function rk4(A, x0, dt, N) {
    let x = x0.slice();
    for (let i = 0; i < N; i++) {
      const k1 = matvec(A, x);
      const k2 = matvec(A, x.map((v, j) => v + (dt / 2) * k1[j]));
      const k3 = matvec(A, x.map((v, j) => v + (dt / 2) * k2[j]));
      const k4 = matvec(A, x.map((v, j) => v + dt * k3[j]));
      x = x.map((v, j) => v + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    }
    return x;
  }
  const vnorm = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0));

  /** The initial state of the record's conditions: θ = θ₀ (scaled to 1), every other state 0. */
  const X0 = [0, 1, 0, 0, 0, 0];

  /**
   * The convergence check: RK4 on the time-domain model at speed V over three periods of the flutter mode, with
   * 16 to 256 steps per period, against exp(τA)x₀. The observed order log₂(e(Δτ)/e(Δτ/2)) tends to 4.
   */
  function convergence(P, V, Omega, { periods = 3, steps = [16, 32, 64, 128, 256] } = {}) {
    const A = stateMatrix(P, V);
    const T = (2 * Math.PI) / Omega;
    const tau = periods * T;
    const exact = matvec(expm(A, tau), X0);
    const rows = steps.map((perPeriod) => {
      const N = perPeriod * periods;
      const x = rk4(A, X0, tau / N, N);
      return { perPeriod, dt: tau / N, error: vnorm(x.map((v, j) => v - exact[j])) / vnorm(exact) };
    });
    rows.forEach((r, i) => { r.order = i ? Math.log2(rows[i - 1].error / r.error) : null; });
    return { V, tau, periods, rows, exactNorm: vnorm(exact) };
  }

  /** The response θ(τ), ξ(τ) to the initial pitch disturbance at speed V, from exp(ΔτA). */
  function response(P, V, { tauEnd = 60, n = 360 } = {}) {
    const A = stateMatrix(P, V);
    const dt = tauEnd / n;
    const E = expm(A, dt);
    let x = X0.slice();
    const tau = [0], theta = [x[1]], xi = [x[0]];
    for (let i = 1; i <= n; i++) {
      x = matvec(E, x);
      tau.push(i * dt);
      theta.push(x[1]);
      xi.push(x[0]);
    }
    const ps = eigenvalues(A);
    const lead = ps.reduce((b, p) => (p.re > b.re ? p : b), ps[0]);
    return { V, tau, theta, xi, rate: lead.re, kind: lead.re > 1e-9 ? "grows" : lead.re < -1e-9 ? "decays" : "neutral", eigenvalues: ps.map((p) => ({ re: p.re, im: p.im, zeta: p.im > 1e-9 ? -p.re / cabs(p) : null })) };
  }

  /* ---------- the whole analysis ---------- */

  /** A uniform grid of n points on [lo, hi]. */
  const grid = (lo, hi, n) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

  /** The declared tolerances. */
  const TOL = Object.freeze({ agreement: 0.01, consistency: 1e-8, samePoint: 1e-7, residual: 1e-9, reference: 1e-7, besselRef: 1e-10, convergence: 1e-6, order: [3.5, 4.5] });

  /**
   * Run both methods and every check on the parameters p (exact rationals or text) and the selected speed.
   * Returns plain data for the view, the report and the WebMCP tool.
   */
  function analyse(p, { speed = null, references = null } = {}) {
    const P = parameters(p);
    if (!P.valid) return { ready: false, params: P, failed: P.domain.filter((d) => !d.ok) };
    const k1 = kMethod(P, { model: "theodorsen" });
    const k1j = kMethod(P, { model: "jones" });
    const VFguess = k1.onset ? k1.onset.V : P.VD ?? 4;
    const VD = P.VD;
    const Vtop = Math.max(0.5, 1.25 * Math.min(VFguess, VD ?? Infinity));
    const Vs = grid(0.02, Vtop, 125);
    const ss = stateOnset(P, grid(0.02, 1.5 * Math.max(VFguess, VD ?? 0, 1), 400));
    const pkSweep = pkMethod(P, Vs);
    const pk = pkOnset(P, pkSweep);
    const ssSweep = stateSweep(P, Vs);
    const flutter = k1.onset;
    const conv = ss ? convergence(P, ss.V, ss.Omega || 1) : null;
    const sel = speed === null ? null : response(P, speed);
    return {
      ready: true, params: P, tolerances: TOL, jones: JONES, speeds: { top: Vtop },
      theodorsen: { k: k1.onset, kBranches: k1.branches, pk, pkModes: pkSweep.modes, pkIterations: pkSweep.maxIterations, pkConverged: pkSweep.converged },
      jonesFrequency: { k: k1j.onset },
      state: { onset: ss, modes: ssSweep.modes },
      divergence: { V2: P.exact.VD2, V: VD, exists: VD !== null },
      first: firstInstability(flutter, ss, VD),
      convergence: conv, response: sel,
      references: references ? compareReferences(p, P, { flutter, ss }, references) : null,
    };
  }

  /** Which instability comes first in each method: flutter or divergence. */
  function firstInstability(flutter, ss, VD) {
    const theo = flutter && (VD === null || flutter.V < VD) ? { kind: "flutter", V: flutter.V } : VD !== null ? { kind: "divergence", V: VD } : null;
    return { theodorsen: theo, state: ss ? { kind: ss.kind, V: ss.V } : null };
  }

  /** The reference case with the same exact parameters, and the relative differences from it. */
  function compareReferences(p, P, got, refs) {
    const c = (refs.cases ?? []).find((x) => ["a", "e", "mu", "r2", "sigma"].every((k) => x.parameters[k] === P.exact[k]));
    if (!c) return { case: null };
    const rel = (x, y) => (x === null || y === null || x === undefined || y === undefined ? null : Math.abs(x - y) / Math.abs(y));
    return {
      case: c.id,
      flutterV: rel(got.flutter?.V, c.theodorsen.V), flutterOmega: rel(got.flutter?.Omega, c.theodorsen.Omega), flutterK: rel(got.flutter?.k, c.theodorsen.k),
      stateV: rel(got.ss?.V, c.state.V), stateOmega: rel(got.ss?.Omega, c.state.Omega),
      reference: c,
    };
  }

  /** C(k) and the Jones C(k) at the reference frequencies, with the largest difference from the references. */
  function besselCheck(refs) {
    const rows = (refs?.theodorsen ?? []).map((r) => {
      const C = theodorsen(r.k);
      return { k: r.k, C: [C.re, C.im], ref: [r.re, r.im], diff: Math.hypot(C.re - r.re, C.im - r.im) };
    });
    return { rows, max: rows.length ? Math.max(...rows.map((r) => r.diff)) : null };
  }

  /* ====================================================================================================== *
   * The declared model for the Regime Map Builder (src/regime.js IMPLS)
   * ====================================================================================================== */

  /** "1.87376": six significant digits. */
  const fx = (x, d = 6) => (x === null || x === undefined || !Number.isFinite(x) ? "none" : String(Number(x.toPrecision(d))));
  /** "8e-17": one significant digit, for residuals and differences. */
  const fe = (x) => (x === 0 ? "0" : x.toExponential(0).replace("e+", "e"));
  /** A tolerance as text: "1e-6", "0.01". */
  const ft = (x) => (x < 1e-3 ? fe(x) : String(x));
  const num = (x) => (Number.isFinite(x) ? Number(x.toPrecision(10)) : null);
  /** "16/3" as TeX. */
  const texFrac = (s) => { const m = /^(-?)(\d+)\/(\d+)$/.exec(String(s)); return m ? `${m[1]}\\frac{${m[2]}}{${m[3]}}` : String(s); };

  const memo = new Map();
  function once(key, run) {
    if (!memo.has(key)) {
      if (memo.size > 40) memo.clear();
      memo.set(key, run());
    }
    return memo.get(key);
  }
  /** The exact value of a context expression, as a rational, or null. */
  function exactOf(ctx, text) {
    const v = ctx?.exact ? ctx.exact(text) : null;
    if (!v) return null;
    return v.exact ? Q.parse(v.exact) : Number.isFinite(v.float) ? Q.fromNumber(v.float) : null;
  }
  /** The record's parameters of the declared dimensionless form: a, x_θ, μ, r², σ and V, exact where possible. */
  function recordParams(ctx) {
    const out = { a: exactOf(ctx, "a"), xt: exactOf(ctx, "x_theta"), mu: exactOf(ctx, "m/m_a"), r2: exactOf(ctx, "I_theta/(m*b^2)"), sigma: exactOf(ctx, "omega_h/omega_theta"), V: exactOf(ctx, "U/(b*omega_theta)") };
    const lack = Object.entries(out).filter(([, v]) => !v).map(([k]) => k);
    if (lack.length) return { lack };
    return { p: { a: out.a, e: Q.add(out.a, out.xt), mu: out.mu, r2: out.r2, sigma: out.sigma }, V: Q.toNumber(out.V) };
  }

  /**
   * Both methods and every check on the record's parameters, as checks with status, tolerance and evidence, plus the
   * figures and tables of the solution panel. `refs` is data/flutterrefs.json.
   */
  function solve(p, speed, refs, declared) {
    const A = analyse(p, { speed, references: refs });
    const checks = [];
    const add = (c) => checks.push({ evidence: [], ...c });
    const P = A.params;
    if (!A.ready) {
      add({ id: "domain", title: `The parameters are outside the declared domain: ${A.failed.map((d) => d.text).join(", ")} does not hold`, status: "exact", passed: false, next: "Correct the parameter values. The declaration lists each condition of its domain.", evidence: ["gt-flutter"] });
      return { A, checks };
    }
    const T = A.tolerances;
    add({ id: "domain", title: `The parameters are in the declared domain: ${P.domain.map((d) => d.text).join(", ")}`, status: "exact", passed: true, evidence: ["gt-flutter"] });
    add({ id: "divergence", title: A.divergence.exists ? `Static divergence: V_D² = μr²/(1 + 2a) = ${P.exact.VD2} exactly, so V_D = ${fx(A.divergence.V)}` : `The model has no divergence speed, because 1 + 2a = ${P.exact.onePlus2a} is not positive`,
      status: "exact", passed: true, evidence: ["gt-flutter"] });
    const bes = besselCheck(refs);
    if (bes.max !== null) add({ id: "bessel", title: `Theodorsen's function from the Bessel functions agrees with mpmath at ${bes.rows.length} reduced frequencies. The largest difference is ${fe(bes.max)}`, status: "numerical", tolerance: ft(T.besselRef), passed: bes.max <= T.besselRef, evidence: ["gt-maple"] });
    const k1 = A.theodorsen.k, pk = A.theodorsen.pk, ss = A.state.onset, kj = A.jonesFrequency.k;
    if (k1) add({ id: "k", title: `Method 1, Theodorsen (k method): flutter at V_F = ${fx(k1.V)}, with Ω_F = ${fx(k1.Omega)} and k_F = ${fx(k1.k)}. The relative residual of the determinant is ${fe(k1.residual)}`, status: "numerical", tolerance: ft(T.residual), passed: k1.residual <= T.residual, evidence: ["gt-flutter", "gt-maple"] });
    else add({ id: "k", title: "Method 1, Theodorsen (k method): no branch has g = 0 for k from 4 to 0.02", status: "unresolved", passed: false, next: "Change the parameters. A larger range of k needs a later version of the declaration." });
    if (k1 && pk) { const d = Math.abs(pk.V - k1.V) / k1.V; add({ id: "pk", title: `The p–k method gives the same onset, V_F = ${fx(pk.V)}. The relative difference from the k method is ${fe(d)}`, status: "numerical", tolerance: ft(T.samePoint), passed: d <= T.samePoint, evidence: ["gt-flutter"] }); }
    if (ss) add({ id: "ss", title: `Method 2, R. T. Jones state space: ${ss.kind === "flutter" ? `flutter at V_F = ${fx(ss.V)}, with Ω_F = ${fx(ss.Omega)}` : `divergence at V_D = ${fx(ss.V)}`}. The relative residual of the eigenvector is ${fe(ss.residual)}`, status: "numerical", tolerance: ft(T.residual), passed: ss.residual <= T.residual, evidence: ["byu-wagner"] });
    if (ss && kj && ss.kind === "flutter") { const d = Math.abs(kj.V - ss.V) / ss.V; add({ id: "consistency", title: `The k method with the Jones C(k) gives V_F = ${fx(kj.V)}. The relative difference from the state-space onset is ${fe(d)}, so the two forms of the Jones aerodynamics agree`, status: "numerical", tolerance: ft(T.consistency), passed: d <= T.consistency, evidence: ["byu-wagner"] }); }
    if (k1 && ss && ss.kind === "flutter") {
      const dV = Math.abs(ss.V - k1.V) / k1.V, dO = Math.abs(ss.Omega - k1.Omega) / k1.Omega;
      add({ id: "agreement", title: `The two methods agree: V_F differs by ${fx(100 * dV, 2)} % and Ω_F by ${fx(100 * dO, 2)} %. The R. T. Jones approximation causes the difference`, status: "numerical", tolerance: ft(T.agreement), passed: dV <= T.agreement && dO <= T.agreement, evidence: ["byu-wagner", "gt-maple"],
        next: "Compare the two methods over a range of parameters. A larger difference shows the limit of the Jones approximation." });
    }
    const ref = A.references;
    if (ref && ref.case) {
      const worst = Math.max(...[ref.flutterV, ref.flutterOmega, ref.flutterK, ref.stateV, ref.stateOmega].filter((x) => x !== null));
      add({ id: "reference", title: `mpmath ${refs.versions.mpmath} and SciPy ${refs.versions.scipy} give the same onsets for both methods. The largest relative difference is ${fe(worst)}`, status: "numerical", tolerance: ft(T.reference), passed: worst <= T.reference, evidence: [] });
    }
    if (A.first.theodorsen) add({ id: "first", title: A.first.theodorsen.kind === "flutter" ? `Flutter comes first: V_F = ${fx(k1.V, 4)}${A.divergence.exists ? ` is below V_D = ${fx(A.divergence.V, 4)}` : ", and the model has no divergence"}` : `Divergence comes first: V_D = ${fx(A.divergence.V, 4)}${k1 ? ` is below V_F = ${fx(k1.V, 4)}` : ""}`, status: "numerical", tolerance: "each onset to 1e-13", passed: true });
    if (ss && ss.kind === "flutter") add({ id: "hopf", title: `At the onset, one complex pair crosses Re p = 0 at Ω_F = ${fx(ss.Omega, 4)} with d(Re p)/dV = ${fx(ss.slope, 3)}, which is more than 0. The linearization meets the eigenvalue conditions of a Hopf bifurcation. The nonlinear terms decide its type`, status: "numerical", tolerance: "central difference, step 1e-6 V", passed: ss.slope > 0 });
    if (A.convergence) {
      const last = A.convergence.rows.at(-1);
      add({ id: "convergence", title: `RK4 at the onset converges to exp(τA)x₀ with order ${fx(last.order, 3)}. The relative error is ${fx(last.error, 2)} at ${last.perPeriod} steps per period`, status: "numerical", tolerance: `${ft(T.convergence)}, order ${T.order[0]} to ${T.order[1]}`,
        passed: last.error <= T.convergence && last.order >= T.order[0] && last.order <= T.order[1] });
    }
    const pkPoints = A.theodorsen.pkModes.reduce((s, m) => s + m.length, 0);
    add({ id: "pkiter", title: `The p–k iteration converged at all ${pkPoints} points in ${A.theodorsen.pkIterations} iterations or fewer`, status: "numerical", tolerance: "1e-12·max(1, Ω) in Ω", passed: A.theodorsen.pkConverged });
    add({ id: "jones", title: "R. T. Jones approximated the Wagner function as φ(s) = 1 − 0.165e^(−0.0455s) − 0.335e^(−0.3s), with s = Ut/b", status: "evidence", passed: true, evidence: ["byu-wagner"] });
    for (const u of declared.unsupported) add({ id: u.id, title: u.title.replace(/\.$/, ""), status: "unresolved", passed: false, next: u.next });
    return { A, checks };
  }

  /** The declared tolerances and the unsupported results, kept with the code that applies them. */
  const DECLARED = {
    unsupported: [
      { id: "amplitude", title: "The page gives no oscillation amplitude above the onset. The declared model is linear, so its response above V_F grows without limit", next: "Declare a nonlinear model, such as a cubic pitch spring or a dynamic-stall model, as a separate family declaration." },
      { id: "classification", title: "The page does not classify the onset as a supercritical or a subcritical Hopf bifurcation. That classification needs the nonlinear terms", next: "Add the nonlinear terms in a separate declaration, then calculate the first Lyapunov coefficient." },
    ],
  };

  /** The figures and tables of the solution panel (src/stabview.js) from one analysis. */
  function panelOf(decl, A, checks, Vrec) {
    const k1 = A.theodorsen.k, ss = A.state.onset;
    const label = (j) => (j === 0 ? "mode 1" : "mode 2");
    const curves = (key) => [
      ...A.theodorsen.pkModes.map((pts, j) => ({ label: `${label(j)}, Theodorsen (p–k)`, pts: pts.filter((q) => q[key] !== null).map((q) => [num(q.V), num(q[key])]), dash: null })),
      ...A.state.modes.map((pts, j) => ({ label: `${label(j)}, R. T. Jones (state space)`, pts: pts.map((q) => [num(q.V), num(q[key])]), dash: "6 4" })),
    ];
    const bounds = (series) => { const ys = series.flatMap((s) => s.pts.map((q) => q[1])).filter(Number.isFinite); const lo = Math.min(...ys), hi = Math.max(...ys), d = (hi - lo) || 1; return [lo - 0.05 * d, hi + 0.05 * d]; };
    const top = A.speeds.top;
    const zs = curves("zeta"), om = curves("Omega");
    const marks = [k1 ? { x: num(k1.V), y: 0, shape: "circle", r: 4, label: `V_F = ${fx(k1.V, 5)}, Theodorsen` } : null, ss ? { x: num(ss.V), y: 0, shape: "circle", r: 4, label: `V_F = ${fx(ss.V, 5)}, R. T. Jones` } : null].filter(Boolean);
    const [z0, z1] = bounds(zs), [o0, o1] = bounds(om);
    const figures = [
      { id: "st-fsi-damping", title: "Modal damping ratio ζ against the speed V", caption: "Solid lines: Theodorsen's function by the p–k method. Dashed lines: the R. T. Jones state space. The flutter speed is the lowest speed where the damping of a mode changes from positive to negative. Away from the onset, the p–k damping is an approximation.",
        x: { min: 0, max: num(top), label: "V = U/(bω_θ)", log: false }, y: { min: num(z0), max: num(z1), label: "ζ = −Re p/|p|", log: false }, series: zs, points: marks },
      { id: "st-fsi-frequency", title: "Modal frequency Ω against the speed V", caption: "The two frequencies come nearer as V increases. At the onset, the flutter mode oscillates at Ω_F.",
        x: { min: 0, max: num(top), label: "V = U/(bω_θ)", log: false }, y: { min: num(Math.max(0, o0)), max: num(o1), label: "Ω = ω/ω_θ", log: false }, series: om,
        points: [k1 ? { x: num(k1.V), y: num(k1.Omega), shape: "circle", r: 4, label: `Ω_F = ${fx(k1.Omega, 4)}` } : null].filter(Boolean) },
    ];
    if (A.response) {
      const th = A.response.theta;
      const amp = Math.max(...th.map(Math.abs));
      figures.push({ id: "st-fsi-response", title: `Pitch response θ/θ₀ at V = ${fx(A.response.V, 3)}`, caption: `The response to the initial pitch disturbance ${A.response.kind === "grows" ? "grows. The linear model gives no amplitude above the onset" : A.response.kind === "decays" ? "decays: every eigenvalue of A(V) has a negative real part" : "neither grows nor decays"}. The page calculates the response with exp(ΔτA) in steps of Δτ.`,
        x: { min: 0, max: num(A.response.tau.at(-1)), label: "τ = ω_θ t", log: false }, y: { min: num(-1.05 * amp), max: num(1.05 * amp), label: "θ/θ₀", log: false },
        series: [{ label: "θ/θ₀", pts: A.response.tau.map((t, i) => [num(t), num(th[i])]), dash: null }], points: [] });
    }
    const tables = [
      { title: "Flutter onset by two methods", columns: ["Method", "Aerodynamics", "V", "Ω", "k"], rows: [
        k1 ? ["k method", "Theodorsen", fx(k1.V), fx(k1.Omega), fx(k1.k)] : ["k method", "Theodorsen", "none", "", ""],
        ...(A.theodorsen.pk ? [["p–k method", "Theodorsen", fx(A.theodorsen.pk.V), fx(A.theodorsen.pk.Omega), fx(A.theodorsen.pk.k)]] : []),
        ...(A.jonesFrequency.k ? [["k method", "R. T. Jones C(k)", fx(A.jonesFrequency.k.V), fx(A.jonesFrequency.k.Omega), fx(A.jonesFrequency.k.k)]] : []),
        ...(ss ? [["state space", "R. T. Jones", fx(ss.V), fx(ss.Omega), fx(ss.k)]] : []),
        ...(A.divergence.exists ? [["exact", "steady lift", `V_D = ${fx(A.divergence.V)}`, "0", "0"]] : [])] },
    ];
    if (A.convergence) tables.push({ title: `Convergence of RK4 at V = ${fx(A.convergence.V)} over ${A.convergence.periods} periods`, columns: ["Steps per period", "Δτ", "Relative error", "Observed order"],
      rows: A.convergence.rows.map((r) => [String(r.perPeriod), fx(r.dt, 4), r.error.toExponential(2), r.order === null ? "–" : fx(r.order, 3)]) });
    if (A.response) tables.push({ title: `Eigenvalues of A(V) at V = ${fx(A.response.V, 3)}`, columns: ["Re p", "Im p", "ζ", "Kind"],
      rows: A.response.eigenvalues.filter((q) => q.im >= 0).map((q) => [fx(q.re, 5), fx(q.im, 5), q.zeta === null ? "–" : fx(q.zeta, 4), q.zeta !== null ? "structural mode" : q.re > 1e-9 ? "real, grows (divergence)" : "real (lag or static)"]) });
    const P = A.params;
    const results = checks.map((c) => ({ id: `r-fsi-${c.id}`, kind: "solution", title: `${c.title}.`, status: c.status === "exact" || c.status === "numerical" ? (c.passed ? c.status : "unresolved") : c.status,
      tolerance: c.tolerance ?? null, next: c.next ?? (c.passed ? "" : "Check the inputs of this result."), steps: ["s-st-eigen"], evidence: c.evidence.length ? c.evidence : ["spec-10"] }));
    return { family: decl.family, model: decl.id, generic: true, heading: "Hand calculation 9: flutter onset by two methods, modal damping and convergence", point: { V: num(Vrec) },
      concept: "linear temporal stability of the equilibrium h = θ = 0 of the typical section: Theodorsen's frequency domain (k and p–k methods) and the R. T. Jones state space",
      results, figures, tables,
      method: ["The k method solves the flutter determinant for X = (ω_θ/ω)²(1 + ig) at each reduced frequency k. g is an artificial structural damping that makes harmonic motion possible. The onset is the lowest speed where g changes from negative to positive.",
        "The p–k method solves det(p²M_s + K_s − V²k²A(k)) = 0 at each speed with k = Im p/V. It repeats until k stays the same.",
        "The state space x' = A(V)x of the R. T. Jones model has six states. Its eigenvalues give ζ and Ω. The onset is where the largest real part is 0.",
        "Brent's method refines each onset. At the onset, the page compares RK4 with exp(τA)x₀."],
      displays: [
        { title: "Hand calculation 9: the exact divergence speed", tex: A.divergence.exists ? ["\\left(\\mu r^2-(1+2a)V^2\\right)\\theta=0", `V_D^2=\\frac{\\mu r^2}{1+2a}=${texFrac(P.exact.VD2)}`] : [`1+2a=${texFrac(P.exact.onePlus2a)}\\le0`] },
        { title: "Hand calculation 9: the flutter determinant", tex: ["\\det\\begin{pmatrix}\\mu(1-\\sigma^2X)+l_h&\\mu x_\\theta+l_\\theta\\\\\\mu x_\\theta+m_h&\\mu r^2(1-X)+m_\\theta\\end{pmatrix}=0", "C(k)=\\frac{H_1^{(2)}(k)}{H_1^{(2)}(k)+iH_0^{(2)}(k)}"] },
        { title: "Hand calculation 9: the mass matrix with the apparent mass", tex: [`M=\\begin{pmatrix}${texFrac(P.exact.M[0][0])}&${texFrac(P.exact.M[0][1])}\\\\${texFrac(P.exact.M[1][0])}&${texFrac(P.exact.M[1][1])}\\end{pmatrix},\\quad\\det M=${texFrac(P.exact.detM)}`] },
      ] };
  }

  /** The stability measure of the map: the largest real part of the eigenvalues of A(V) at the point. */
  function pointParams(p) {
    if (![p.V, p.mu, p.r2, p.sigma, p.a, p.xt].every(Number.isFinite)) return null;
    return { a: p.a, xt: p.xt, mu: p.mu, r2: p.r2, sigma: p.sigma };
  }
  function evaluatePoint(p) {
    const P = pointParams(p);
    if (!P) return { ok: false, reason: "The point needs V, μ, r², σ, a and x_θ." };
    const detM = (P.mu + 1) * (P.mu * P.r2 + 1 / 8 + P.a * P.a) - (P.mu * P.xt - P.a) ** 2;
    const e = P.a + P.xt;
    if (!(P.mu > 0 && P.r2 > P.xt * P.xt && P.sigma > 0 && detM > 0 && p.V >= 0 && Math.abs(P.a) < 1 && Math.abs(e) < 1)) return { ok: false, reason: "Outside the declared domain: μ > 0, σ > 0, −1 < a < 1, −1 < e < 1, r² > x_θ² and det M > 0." };
    const ps = eigenvalues(stateMatrix(P, p.V));
    const lead = ps.reduce((b, x) => (x.re > b.re ? x : b), ps[0]);
    const modes = ps.filter((x) => x.im > 1e-9);
    const least = modes.reduce((b, x) => (b === null || -x.re / cabs(x) < -b.re / cabs(b) ? x : b), null);
    return { ok: true, values: { growth: lead.re, zeta: least ? -least.re / cabs(least) : null, Omega: least ? least.im : null } };
  }

  function sectionImpl(decl, data) {
    const refs = data?.flutterrefs ?? null;
    const run = (ctx) => {
      const r = recordParams(ctx);
      if (r.lack) return { lack: r.lack };
      return once(JSON.stringify([Object.entries(r.p).map(([k, v]) => [k, Q.str(v)]), r.V]), () => ({ ...solve(r.p, r.V, refs, DECLARED), V: r.V }));
    };
    const layers = [{ id: "flutter", kind: "stability", boundary: "stability", title: "Flutter and divergence", measure: "growth", scale: "linear", status: "numerical", steps: ["s-st-eigen"], evidence: ["spec-8", "gt-flutter", "byu-wagner"],
      criterion: "Linear temporal stability of h = θ = 0 in the R. T. Jones state space. Neutral condition: the largest real part of the eigenvalues of A(V) is 0. If a complex pair crosses, the onset is flutter. If a real eigenvalue crosses, the onset is divergence",
      thresholds: () => ({ curves: [{ value: 0, label: "Neutral curve: the onset of flutter (or of divergence)" }], regions: [{ id: "stable", label: "Every mode is damped: the section is linearly stable", lo: -1e9, hi: 0 }, { id: "unstable", label: "A mode grows: flutter or divergence", lo: 0, hi: null }] }) }];
    return { id: decl.id, params: decl.domain.parameters, axes: { x: "V", y: "mu" }, approximations: [], layers,
      evaluate: evaluatePoint, limits: () => [], constraints: () => [],
      derived: (p) => { const P = pointParams(p); return P && 1 + 2 * P.a > 0 ? [{ id: "VD", tex: "V_D", label: "divergence speed √(μr²/(1 + 2a))", value: num(Math.sqrt((P.mu * P.r2) / (1 + 2 * P.a))) }] : []; },
      inspect: (p, ctx) => {
        const ev = evaluatePoint(p);
        const sc = ctx?.exact?.("b*omega_theta");
        return { ok: ev.ok, values: ev.ok ? [{ id: "growth", tex: "\\max\\operatorname{Re}p", label: "largest real part of the eigenvalues of A(V)", value: num(ev.values.growth) },
          { id: "zeta", tex: "\\zeta_{\\min}", label: "smallest modal damping ratio", value: num(ev.values.zeta) }, { id: "Omega", tex: "\\Omega", label: "frequency of that mode, ω/ω_θ", value: num(ev.values.Omega) }] : [],
          checks: [], reconstruction: sc && Number.isFinite(sc.float) ? [{ id: "U", tex: "U", label: "free-stream speed at the point", value: num(p.V * sc.float), unit: "m/s" }] : [] };
      },
      analysis: () => ({ note: "Each point of the map takes the eigenvalues of the 6 × 6 state matrix of the R. T. Jones model.",
        balance: { intro: "Near the onset, the inertial, elastic and aerodynamic terms have the same order. The aerodynamic forces couple the pitch and plunge modes. This coupling causes flutter.", terms: [
          { tex: "(\\mu+1)\\xi''", label: "inertia with the apparent mass", scale: "\\mu", why: "The mass ratio sets the inertia." },
          { tex: "\\mu\\sigma^2\\xi", label: "plunge stiffness", scale: "\\mu\\sigma^2", why: "The plunge spring." },
          { tex: "2Vq_e", label: "circulatory lift", scale: "V^2", why: "The lift grows with the square of the speed." }], balances: [], crossovers: [], note: "No term is small near the onset, so the page gives no reduced balance." },
        asymptotic: { limits: [], overlap: "The declaration derives no asymptotic limit.", gaps: "The page uses both methods at every point." } }),
      acceptance: (ctx) => {
        const out = run(ctx);
        if (out.lack) return [{ id: "values", title: `The record has no value for ${out.lack.join(", ")}`, passed: false, status: "exact", detail: "Enter the values of the standard example." }];
        return out.checks.filter((c) => c.status === "exact" || c.status === "numerical").map((c) => ({ id: c.id, title: c.title, passed: Boolean(c.passed), status: c.status, tolerance: c.tolerance ?? null, detail: c.tolerance ? `Tolerance: ${c.tolerance}.` : "Exact arithmetic." }));
      },
      stability: (p, ctx) => { const out = run(ctx); return out.lack ? null : panelOf(decl, out.A, out.checks, out.V); },
      solve: (ctx) => run(ctx) };
  }

  /** The implementation of a declaration of piece 9, or null. */
  function implement(decl, options = {}, data = null) {
    return decl.id === "typical-section" ? sectionImpl(decl, data) : null;
  }

  return { cx, cabs, csqrt, quadratic, bessel, theodorsen, jones, JONES, aeroK2, parameters, flutterRoots, flutterResidual, kMethod, pkPoint, pkMethod, pkOnset, inVacuo,
    stateMatrix, hessenberg, eigenvalues, eigenvector, stateSweep, stateOnset, growth, expm, rk4, convergence, response, brent, analyse, besselCheck, solve, implement, evaluatePoint, TOL };
});
