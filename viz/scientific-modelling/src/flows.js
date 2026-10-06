/* Scientific Modelling: the flow families of piece 6 (spec section 10) as declared models for the Regime Map Builder.
 *
 *   pipe-poiseuille      θ'' + θ'/X = S U, U'' + U'/X = −P: Hagen–Poiseuille flow with a uniform wall heat flux;
 *                        exact P = 8, S = 2, f·Re_D = 64 and Nu_D = 48/11 in rationals, and finite volumes.
 *   channel-poiseuille   the same between parallel plates: P = 3, S = 1, f·Re = 96 and Nu = 140/17.
 *   nozzle-air           quasi-1D isentropic air, γ = 7/5 (anchor test 3): the exact derivation, the sonic condition
 *                        dF/dM ∝ 1 − M², the choked mass flow, both branches of the area–Mach relation, the
 *                        back-pressure regimes and mass and energy conservation along the nozzle.
 *   shallow-water        steady shallow water on a flat bed: characteristics, critical depth, alternate depths and
 *                        the hydraulic jump, exact in rationals and in a quadratic field Q(√d).
 *   blasius              the laminar flat-plate boundary layer: exact inner-scale exponents, shooting with RK4,
 *                        step and domain convergence, the momentum integral and the estimated remainder.
 *   joukowski-airfoil    potential flow: exact cylinder forces in rational multiples of π, the Joukowski airfoil with
 *                        the Kutta condition and pressure integration, thin-airfoil theory and lumped vortices.
 *
 * Statuses: an "exact" check is rational, polynomial, quadratic-field or π-multiple equality, never a float
 * comparison. A numerical check states its tolerance and its convergence. Plain data out: no BigInt.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"));
  else (root.SM = root.SM || {}).FL = factory(root.SM.Q);
})(typeof self !== "undefined" ? self : this, function (Q) {
  "use strict";

  const q = (n, d = 1) => Q.q(BigInt(n), BigInt(d));
  const N = (x) => Q.toNumber(x);

  /* ---------- exact: polynomials with rational coefficients (index = power) ---------- */

  const P = {
    of: (list) => P.trim(list.map((c) => Q.of(c))),
    trim(a) {
      const out = a.slice();
      while (out.length > 1 && Q.isZero(out[out.length - 1])) out.pop();
      return out.length ? out : [Q.ZERO];
    },
    add(a, b) { return P.trim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => Q.add(a[i] ?? Q.ZERO, b[i] ?? Q.ZERO))); },
    sub(a, b) { return P.add(a, P.scale(b, Q.q(-1n))); },
    scale(a, k) { return P.trim(a.map((c) => Q.mul(c, k))); },
    mul(a, b) {
      const out = Array(a.length + b.length - 1).fill(Q.ZERO);
      a.forEach((x, i) => b.forEach((y, j) => { out[i + j] = Q.add(out[i + j], Q.mul(x, y)); }));
      return P.trim(out);
    },
    pow(a, k) { let r = [Q.ONE]; for (let i = 0; i < k; i++) r = P.mul(r, a); return r; },
    deriv(a) { return P.trim(a.slice(1).map((c, i) => Q.mul(c, q(i + 1)))); },
    /** The antiderivative with value 0 at 0. */
    integ(a) { return P.trim([Q.ZERO, ...a.map((c, i) => Q.div(c, q(i + 1)))]); },
    /** a(x)/x, for a polynomial with a(0) = 0. */
    divX(a) { if (!Q.isZero(a[0])) throw new Error("divX: a(0) is not 0"); return P.trim(a.slice(1).length ? a.slice(1) : [Q.ZERO]); },
    at(a, x) { return a.reduceRight((acc, c) => Q.add(Q.mul(acc, x), c), Q.ZERO); },
    atFloat(a, x) { return a.reduceRight((acc, c) => acc * x + N(c), 0); },
    defInt(a, lo, hi) { const A = P.integ(a); return Q.sub(P.at(A, Q.of(hi)), P.at(A, Q.of(lo))); },
    isZero(a) { return a.every((c) => Q.isZero(c)); },
    eq(a, b) { return P.isZero(P.sub(a, b)); },
    /** TeX of a polynomial in v, highest power first. */
    tex(a, v = "x") {
      const terms = [];
      for (let i = a.length - 1; i >= 0; i--) {
        const c = a[i];
        if (Q.isZero(c)) continue;
        const neg = Q.sign(c) < 0, m = Q.abs(c);
        const coef = i && Q.eq(m, Q.ONE) ? "" : Q.tex(m);
        const pw = i === 0 ? "" : i === 1 ? v : `${v}^{${i}}`;
        terms.push({ neg, body: `${coef}${coef && pw ? "\\," : ""}${pw}` || "1" });
      }
      if (!terms.length) return "0";
      return terms.map((t, k) => (k === 0 ? (t.neg ? `-${t.body}` : t.body) : `${t.neg ? "-" : "+"}${t.body}`)).join("");
    },
  };

  /* ---------- exact: numbers a + b√d of a quadratic field, d > 0 rational ---------- */

  /** The integer square root of a nonnegative BigInt. */
  function isqrt(n) {
    if (n < 2n) return n;
    let x = BigInt(Math.floor(Math.sqrt(Number(n))));
    while (x * x > n) x -= 1n;
    while ((x + 1n) * (x + 1n) <= n) x += 1n;
    return x;
  }
  /** √r for a rational r ≥ 0 when it is rational, else null. */
  function ratSqrt(r) {
    if (Q.sign(r) < 0) return null;
    const a = isqrt(r.n), b = isqrt(r.d);
    return a * a === r.n && b * b === r.d ? Q.q(a, b) : null;
  }
  const QS = {
    /** a + b√d; when √d is rational the number collapses to a rational (b = 0). */
    of(a, b, d) {
      const s = ratSqrt(d);
      if (s) return { a: Q.add(a, Q.mul(b, s)), b: Q.ZERO, d: Q.ONE };
      return { a, b, d };
    },
    rat: (a) => ({ a, b: Q.ZERO, d: Q.ONE }),
    same(x, y) { if (Q.isZero(x.b) || Q.isZero(y.b) || Q.eq(x.d, y.d)) return Q.isZero(x.b) ? y.d : x.d; throw new Error("QS: different fields"); },
    add(x, y) { const d = QS.same(x, y); return { a: Q.add(x.a, y.a), b: Q.add(x.b, y.b), d }; },
    sub(x, y) { const d = QS.same(x, y); return { a: Q.sub(x.a, y.a), b: Q.sub(x.b, y.b), d }; },
    mul(x, y) { const d = QS.same(x, y); return { a: Q.add(Q.mul(x.a, y.a), Q.mul(Q.mul(x.b, y.b), d)), b: Q.add(Q.mul(x.a, y.b), Q.mul(x.b, y.a)), d }; },
    inv(x) {
      const den = Q.sub(Q.mul(x.a, x.a), Q.mul(Q.mul(x.b, x.b), x.d));
      return { a: Q.div(x.a, den), b: Q.neg(Q.div(x.b, den)), d: x.d };
    },
    div(x, y) { return QS.mul(x, QS.inv(y)); },
    scale(x, k) { return { a: Q.mul(x.a, k), b: Q.mul(x.b, k), d: x.d }; },
    isZero: (x) => Q.isZero(x.a) && Q.isZero(x.b),
    /** The exact sign: compare a² with b²d when a and b differ in sign. */
    sign(x) {
      const sa = Q.sign(x.a), sb = Q.sign(x.b);
      if (sb === 0) return sa;
      if (sa === 0) return sb;
      if (sa === sb) return sa;
      const c = Q.cmp(Q.mul(x.a, x.a), Q.mul(Q.mul(x.b, x.b), x.d));
      return c === 0 ? 0 : c > 0 ? sa : sb;
    },
    num: (x) => N(x.a) + N(x.b) * Math.sqrt(N(x.d)),
    tex(x) {
      if (Q.isZero(x.b)) return Q.tex(x.a);
      const root = `\\sqrt{${Q.tex(x.d)}}`;
      const bb = Q.eq(Q.abs(x.b), Q.ONE) ? root : `${Q.tex(Q.abs(x.b))}${root}`;
      if (Q.isZero(x.a)) return `${Q.sign(x.b) < 0 ? "-" : ""}${bb}`;
      return `${Q.tex(x.a)}${Q.sign(x.b) < 0 ? "-" : "+"}${bb}`;
    },
  };

  /* ---------- exact: trigonometric integrals as rational multiples of π ---------- */

  const dfact = (k) => { let r = 1n; for (let i = k; i > 1; i -= 2) r *= BigInt(i); return r; };
  /** (1/π) ∫_0^{2π} sin^p ψ cos^r ψ dψ, exact. */
  function periodInt(p, r) {
    if (p % 2 || r % 2) return Q.ZERO;
    return Q.q(2n * dfact(p - 1) * dfact(r - 1), dfact(p + r));
  }
  /** (1/π) ∫_0^{π} cos^k θ dθ, exact. */
  function halfInt(k) { return k % 2 ? Q.ZERO : Q.q(dfact(k - 1), dfact(k)); }
  /** The Chebyshev polynomial T_n in c = cos θ: cos(nθ) = T_n(cos θ). */
  function cheb(n) {
    let a = [Q.ONE], b = [Q.ZERO, Q.ONE];
    if (n === 0) return a;
    for (let i = 1; i < n; i++) [a, b] = [b, P.sub(P.scale(P.mul([Q.ZERO, Q.ONE], b), q(2)), a)];
    return b;
  }
  /** (1/π) ∫_0^{π} p(cos θ) dθ for a polynomial p. */
  const halfIntPoly = (p) => p.reduce((s, c, k) => Q.add(s, Q.mul(c, halfInt(k))), Q.ZERO);

  /* ---------- floating point: solvers ---------- */

  /** A root of f in [a, b] by bisection, with f(a) f(b) < 0. */
  function bisect(f, a, b, tol = 1e-15, max = 200) {
    let fa = f(a), fb = f(b), it = 0;
    if (fa === 0) return { x: a, it, residual: 0 };
    if (fb === 0) return { x: b, it, residual: 0 };
    if (fa * fb > 0) return null;
    while (it++ < max) {
      const m = 0.5 * (a + b), fm = f(m);
      if (fm === 0 || (b - a) / 2 < tol * Math.max(1, Math.abs(m))) return { x: m, it, residual: Math.abs(fm) };
      if (fa * fm < 0) { b = m; fb = fm; } else { a = m; fa = fm; }
    }
    const x = 0.5 * (a + b);
    return { x, it, residual: Math.abs(f(x)) };
  }
  /** The solution of a tridiagonal system (Thomas algorithm): lower a, diagonal b, upper c, right side d. */
  function thomas(a, b, c, d) {
    const n = b.length, cp = Array(n), dp = Array(n), x = Array(n);
    cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
    for (let i = 1; i < n; i++) {
      const m = b[i] - a[i] * cp[i - 1];
      cp[i] = c[i] / m;
      dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
    }
    x[n - 1] = dp[n - 1];
    for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
    return x;
  }
  /** The solution of A x = b by Gaussian elimination with partial pivoting. */
  function solveDense(A0, b0) {
    const n = b0.length, A = A0.map((r) => r.slice()), b = b0.slice();
    for (let k = 0; k < n; k++) {
      let p = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
      [A[k], A[p]] = [A[p], A[k]];
      [b[k], b[p]] = [b[p], b[k]];
      for (let i = k + 1; i < n; i++) {
        const m = A[i][k] / A[k][k];
        for (let j = k; j < n; j++) A[i][j] -= m * A[k][j];
        b[i] -= m * b[k];
      }
    }
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }
  /** The observed order of convergence from errors at successive halvings of the step. */
  const order = (e1, e2) => Math.log2(Math.abs(e1) / Math.abs(e2));

  /* ---------- text ---------- */

  /** Short decimal text: 6 significant digits. */
  function fmt(x, p = 6) {
    if (!Number.isFinite(x)) return String(x);
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e7) return String(Number(x.toPrecision(p)));
    const [m, e] = x.toExponential(p - 1).split("e");
    return `${Number(m)}×10^${Number(e)}`;
  }
  /** The same number in TeX. */
  function texNum(x, p = 6) {
    const s = fmt(x, p);
    const m = /^(-?[\d.]+)×10\^(-?\d+)$/.exec(s);
    return m ? `${m[1]}\\times10^{${m[2]}}` : s;
  }
  const qText = (x) => (Q.isInteger(x) ? Q.str(x) : `${Q.str(x)} = ${fmt(N(x))}`);

  /* ======================================================================================================== */
  /* Internal viscous flow: plane channel (j = 0) and circular pipe (j = 1)                                   */
  /* ======================================================================================================== */

  /**
   * The finite-volume solution of (r^j Φ')' = r^j s(r) on [0, 1] with N cells of width 1/N, nodes at r_i = i/N.
   * Velocity: Φ(1) = 0, symmetry at 0. Temperature: Φ(0) = 0 and the wall flux r^j Φ' = w at r = 1.
   */
  function fvSolve(j, n, s, kind, w = 0) {
    const h = 1 / n, rf = (r) => (j ? r : 1);
    // ∫ r^j s(r) dr over a control volume, by 4-point Gauss-Legendre (exact for these polynomials).
    const gl = [[-0.8611363115940526, 0.3478548451374538], [-0.3399810435848563, 0.6521451548625461], [0.3399810435848563, 0.6521451548625461], [0.8611363115940526, 0.3478548451374538]];
    const src = (a, b) => gl.reduce((acc, [t, wt]) => { const r = 0.5 * (a + b) + 0.5 * (b - a) * t; return acc + 0.5 * (b - a) * wt * rf(r) * s(r); }, 0);
    if (kind === "velocity") {
      const m = n; // unknowns Φ_0 .. Φ_{n-1}; Φ_n = 0
      const A = Array(m).fill(0), B = Array(m).fill(0), C = Array(m).fill(0), D = Array(m).fill(0);
      for (let i = 0; i < m; i++) {
        const lo = Math.max(0, (i - 0.5) * h), hi = (i + 0.5) * h;
        const fr = rf(hi) / h, fl = i ? rf(lo) / h : 0;
        B[i] = -(fr + fl); C[i] = i < m - 1 ? fr : 0; A[i] = fl;
        D[i] = src(lo, hi);
      }
      const phi = [...thomas(A, B, C, D), 0];
      return phi;
    }
    // temperature: unknowns Φ_1 .. Φ_n, Φ_0 = 0
    const m = n;
    const A = Array(m).fill(0), B = Array(m).fill(0), C = Array(m).fill(0), D = Array(m).fill(0);
    for (let k = 0; k < m; k++) {
      const i = k + 1;
      const lo = (i - 0.5) * h, hi = Math.min(1, (i + 0.5) * h);
      const fl = rf(lo) / h;
      if (i < n) {
        const fr = rf(hi) / h;
        A[k] = k ? fl : 0; B[k] = -(fl + fr); C[k] = fr; D[k] = src(lo, hi);
      } else {
        A[k] = fl; B[k] = -fl; C[k] = 0; D[k] = src(lo, hi) - w;
      }
    }
    return [0, ...thomas(A, B, C, D)];
  }
  /** Trapezoid integral of g(r_i) r_i^j over [0, 1] at the nodes. */
  const trap = (vals, j) => { const n = vals.length - 1, h = 1 / n; let s = 0; for (let i = 0; i <= n; i++) s += (i === 0 || i === n ? 0.5 : 1) * vals[i] * (j ? i * h : 1); return s * h; };

  function internalFlow(ctx) {
    const pipe = ctx.case !== "channel";
    const j = pipe ? 1 : 0;
    const rv = pipe ? "X" : "Y";
    const Ls = pipe ? "R" : "b";
    const rj = j ? P.of([0, 1]) : P.of([1]);
    // The declared form: (X^j U')' = −P X^j with U'(0) = 0, U(1) = 0 and the mean (j+1)∫X^j U dX = 1, which fixes P.
    const U1 = P.of([Q.q(1n, BigInt(2 * (j + 1))), 0, Q.q(-1n, BigInt(2 * (j + 1)))]); // the solution for P = 1
    const mean1 = Q.mul(q(j + 1), P.defInt(P.mul(U1, rj), 0, 1));
    const Pd = Q.inv(mean1);
    const Ud = P.scale(U1, Pd);
    const odeResidual = P.add(P.deriv(P.mul(rj, P.deriv(Ud))), P.scale(rj, Pd));
    const wall = P.at(Ud, Q.ONE), centre = P.at(P.deriv(Ud), Q.ZERO);
    const mean = Q.mul(q(j + 1), P.defInt(P.mul(Ud, rj), 0, 1));
    const tauHat = Q.neg(P.at(P.deriv(Ud), Q.ONE));
    const dh = q(pipe ? 2 : 4); // D_h over the scale length: D/R = 2, 4b/b = 4
    // f = 8τ_w/(ρu_m²) with τ_w = μu_m|U'(1)|/L_s, Re = ρu_mD_h/μ: f·Re = 8|U'(1)| D_h/L_s.
    const fRe = Q.mul(Q.mul(q(8), tauHat), dh);
    // (X^j θ')' = S X^j U with θ'(0) = 0 and θ'(1) = 1: the energy balance fixes S; θ holds an additive constant.
    const balance = P.defInt(P.mul(rj, Ud), 0, 1);
    const Sd = Q.inv(balance);
    const rjT1 = P.scale(P.integ(P.mul(rj, Ud)), Sd);
    const T1 = j ? P.divX(rjT1) : rjT1;
    const Theta = P.integ(T1);
    const thetaResidual = P.sub(P.deriv(P.mul(rj, P.deriv(Theta))), P.scale(P.mul(rj, Ud), Sd));
    const flux = P.at(T1, Q.ONE);
    const thetaW = P.at(Theta, Q.ONE);
    const thetaM = Q.div(P.defInt(P.mul(P.mul(Ud, Theta), rj), 0, 1), balance);
    // h = q_w/(T_w − T_m) with T − T_w = (q_wL_s/k)(θ − θ(1)): Nu = hD_h/k = (D_h/L_s)/(θ(1) − θ_m).
    const Nu = Q.div(dh, Q.sub(thetaW, thetaM));
    const reference = { fRe: q(pipe ? 64 : 96), Nu: pipe ? q(48, 11) : q(140, 17), P: q(pipe ? 8 : 3), S: q(pipe ? 2 : 1) };

    // Finite volumes: N = 16, 32, 64, 128, on the same equations with P = 1 and the exact source.
    const grid = [16, 32, 64, 128].map((n) => {
      const vel = fvSolve(j, n, () => -1, "velocity");
      const m1 = (j + 1) * trap(vel, j);
      const uh = (r) => P.atFloat(Ud, r);
      const th = fvSolve(j, n, (r) => N(Sd) * uh(r), "temperature", 1);
      const nodesU = th.map((_, i) => uh(i / n));
      const tm = trap(th.map((t, i) => t * nodesU[i]), j) / trap(nodesU, j);
      const nu = N(dh) / (th[n] - tm);
      return { n, P: 1 / m1, errP: Math.abs(1 / m1 - N(Pd)), nu, errNu: Math.abs(nu - N(Nu)) };
    });
    const ord = order(grid[2].errNu, grid[3].errNu);

    // Dimensional values.
    const { v } = ctx;
    const Dh = pipe ? v.D : 2 * v.H, L = pipe ? v.D / 2 : v.H / 2;
    const G = N(Pd) * v.mu * v.um / (L * L);
    const tauW = v.mu * v.um * N(tauHat) / L;
    const Re = v.rho * v.um * Dh / v.mu;
    const f = N(fRe) / Re;
    const thermal = ["k", "cp", "qw"].every((r) => r in v);
    const hc = thermal ? N(Nu) * v.k / Dh : null;
    const beta = thermal ? N(Sd) * v.qw / (v.rho * v.cp * v.um * L) : null;
    const dT = thermal ? v.qw / hc : null;
    const Pr = thermal ? v.mu * v.cp / v.k : null;
    const dissipation = thermal ? G * v.um * Dh / (4 * v.qw) : null;
    const tol = ctx.tolerances;
    const lap = (f) => (pipe ? `\\frac{1}{X}\\frac{\\mathrm d}{\\mathrm dX}\\left(X\\,\\frac{\\mathrm d${f}}{\\mathrm dX}\\right)` : `\\frac{\\mathrm d^{2}${f}}{\\mathrm dY^{2}}`);
    const dA = pipe ? "X\\,\\mathrm dX" : "\\mathrm dY";

    const name = pipe ? "circular pipe" : "plane channel";
    const steps = [
      { id: "s-fam-momentum", item: 7, title: "The velocity profile and the pressure gradient",
        reason: "The axial momentum equation of a fully developed Newtonian flow has no inertia term. With no slip at the wall and symmetry at the centre, the profile is a parabola. The mean velocity is the scale, so the mean of U is 1, and this fixes P.",
        tex: [`${lap("U")}=-P,\\qquad U'(0)=0,\\qquad U(1)=0,\\qquad ${j + 1}\\int_0^1 U\\,${dA}=1`,
          `U=${P.tex(Ud, rv)},\\qquad P=\\frac{G${Ls}^{2}}{\\mu u_m}=${Q.tex(Pd)},\\qquad \\left|U'(1)\\right|=${Q.tex(tauHat)}`], evidence: ["poiseuille"] },
      { id: "s-fam-friction", item: 8, title: "Friction factor and Reynolds number",
        reason: "The Darcy friction factor and the Reynolds number use the hydraulic diameter and the mean velocity. Their product does not depend on the flow rate.",
        tex: [`D_h=${pipe ? "2R" : "4b"},\\qquad f=\\frac{8\\tau_w}{\\rho u_m^{2}},\\qquad \\tau_w=\\frac{\\mu u_m}{${Ls}}\\left|U'(1)\\right|,\\qquad Re=\\frac{\\rho u_m D_h}{\\mu}`,
          `f\\,Re=8\\left|U'(1)\\right|\\frac{D_h}{${Ls}}=${Q.tex(fRe)}`], evidence: ["poiseuille"] },
      { id: "s-fam-energy", item: 7, title: "The temperature profile under a uniform wall heat flux",
        reason: "With a uniform wall heat flux, the temperature rises linearly along the flow at every point of the section. Axial conduction is then zero. The heat that enters at the wall must leave with the flow, and this energy balance fixes S.",
        tex: [`${lap("\\theta")}=S\\,U,\\qquad \\theta'(0)=0,\\qquad \\theta'(1)=1,\\qquad \\frac{\\partial^{2}T}{\\partial x^{2}}=0`,
          `S=\\frac{\\rho c_p\\beta u_m${Ls}}{q_w}=\\left(\\int_0^1 U\\,${dA}\\right)^{-1}=${Q.tex(Sd)},\\qquad \\theta=${P.tex(Theta, rv)}+\\text{const}`], evidence: ["lienhard"] },
      { id: "s-fam-nusselt", item: 8, title: "Nusselt number of the fully developed flow",
        reason: "The heat-transfer coefficient uses the wall-to-bulk temperature difference. The bulk temperature weights the profile with the velocity, so the constant in θ cancels.",
        tex: [`\\theta_m=\\frac{\\int_0^1 U\\,\\theta\\,${dA}}{\\int_0^1 U\\,${dA}},\\qquad \\theta(1)-\\theta_m=${Q.tex(Q.sub(thetaW, thetaM))}`,
          `Nu=\\frac{hD_h}{k}=\\frac{D_h/${Ls}}{\\theta(1)-\\theta_m}=${Q.tex(Nu)}`], evidence: ["lienhard"] },
      { id: "s-fam-fv", item: 10, title: "Numerical procedure: finite volumes",
        reason: "A finite-volume solution of the same two equations checks the exact algebra. It uses N cells, flux balances on each cell and the trapezoid rule for the mean values.",
        tex: [`N=${grid.map((g) => g.n).join(",\\,")},\\qquad \\left|Nu_N-Nu\\right|=${grid.map((g) => texNum(g.errNu, 3)).join(",\\,")}`], evidence: [] },
    ];
    const checks = [
      { id: "ode", status: P.isZero(odeResidual) && Q.isZero(wall) && Q.isZero(centre) && Q.eq(mean, Q.ONE) ? "exact" : "unresolved", passed: P.isZero(odeResidual) && Q.isZero(wall) && Q.isZero(centre) && Q.eq(mean, Q.ONE),
        title: `The velocity U = ${pipe ? "2(1 − X²)" : "(3/2)(1 − Y²)"} satisfies the momentum equation with P = ${Q.str(Pd)}, both conditions and the unit mean, exactly.`, tex: `U=${P.tex(Ud, rv)}`, evidence: ["poiseuille"], steps: ["s-fam-momentum"] },
      { id: "fre", status: Q.eq(fRe, reference.fRe) ? "exact" : "unresolved", passed: Q.eq(fRe, reference.fRe),
        title: `f·Re = ${Q.str(fRe)} exactly for the laminar ${name}, which is the reference value ${Q.str(reference.fRe)}.`, tex: `f\\,Re=${Q.tex(fRe)}`, evidence: ["poiseuille"], steps: ["s-fam-friction"] },
      { id: "theta", status: P.isZero(thetaResidual) && Q.eq(flux, Q.ONE) && Q.eq(Sd, reference.S) ? "exact" : "unresolved", passed: P.isZero(thetaResidual) && Q.eq(flux, Q.ONE) && Q.eq(Sd, reference.S),
        title: `Energy balance: with S = ${Q.str(Sd)}, the temperature profile satisfies the energy equation, θ'(0) = 0 and θ'(1) = 1 exactly. The heat that enters at the wall leaves with the flow.`, tex: `\\theta=${P.tex(Theta, rv)}`, evidence: ["lienhard"], steps: ["s-fam-energy"] },
      { id: "nusselt", status: Q.eq(Nu, reference.Nu) ? "exact" : "unresolved", passed: Q.eq(Nu, reference.Nu),
        title: `Nu = ${qText(Nu)} exactly for the ${name} with a uniform wall heat flux, which is the reference value.`, tex: `Nu=${Q.tex(Nu)}`, evidence: ["lienhard"], steps: ["s-fam-nusselt"] },
      { id: "fv", status: "numerical", passed: grid[3].errNu <= tol.fv && Math.abs(ord - 2) <= tol.order && grid[3].errP <= tol.fv,
        title: `The finite-volume solution converges to the exact Nu at order ${fmt(ord, 3)} (expected 2). At N = 128 the error of Nu is ${fmt(grid[3].errNu, 3)}, and the error of P is ${fmt(grid[3].errP, 3)}.`,
        tolerance: `error ≤ ${tol.fv} at N = 128, |order − 2| ≤ ${tol.order}`, evidence: [], steps: ["s-fam-fv"] },
    ];
    if (thermal) {
      checks.push({ id: "dissipation", status: dissipation <= tol.dissipation ? "numerical" : "unresolved", passed: dissipation <= tol.dissipation,
        title: dissipation <= tol.dissipation ? `Viscous heating is ${fmt(dissipation, 3)} of the wall heat, which is below the declared tolerance ${tol.dissipation}. The model neglects it.` : `Viscous heating is ${fmt(dissipation, 3)} of the wall heat, which is above the declared tolerance ${tol.dissipation}. The model cannot neglect it.`,
        tolerance: `G u_m D_h/(4 q_w) ≤ ${tol.dissipation}`, evidence: [], steps: ["s-fam-energy"], next: dissipation <= tol.dissipation ? "" : "Use the viscous heat-generation family (piece 7 of the build plan), or reduce the velocity." });
    }
    checks.push({ id: "laminar", status: "evidence", passed: true,
      title: `Re = ${fmt(Re)}. The model assumes laminar flow and does not predict transition. A turbulent flow needs a separate declaration.`, evidence: ["poiseuille"], steps: ["s-fam-friction"] });

    const outputs = [
      { id: "Re", label: "Reynolds number", tex: "Re", value: Re, unit: "" },
      { id: "G", label: "Pressure gradient", tex: "G", value: G, unit: "Pa/m", role: "G" },
      { id: "tau", label: "Wall shear stress", tex: "\\tau_w", value: tauW, unit: "Pa" },
      { id: "f", label: "Darcy friction factor", tex: "f", value: f, unit: "" },
      ...(thermal ? [
        { id: "Nu", label: "Nusselt number", tex: "Nu", value: N(Nu), unit: "", exact: Q.str(Nu) },
        { id: "h", label: "Heat-transfer coefficient", tex: "h", value: hc, unit: "W/(m^2*K)", role: "h" },
        { id: "beta", label: "Rise of the bulk temperature", tex: "\\beta", value: beta, unit: "K/m" },
        { id: "dT", label: "Wall minus bulk temperature", tex: "T_w-T_m", value: dT, unit: "K" },
        { id: "Pr", label: "Prandtl number", tex: "Pr", value: Pr, unit: "" }] : []),
    ];
    const n = 41;
    const prof = Array.from({ length: n }, (_, i) => -1 + (2 * i) / (n - 1));
    const thetaRel = (r) => (P.atFloat(Theta, Math.abs(r)) - N(thetaW)) / (N(thetaM) - N(thetaW));
    const figures = [
      { id: "profile", title: `Velocity and temperature across the ${name}`, caption: `U = u/u_m and (T − T_w)/(T_m − T_w) against ${pipe ? "r/R" : "y/b"}, from the exact polynomials.`,
        x: { label: pipe ? "r/R" : "y/b", min: -1, max: 1 }, y: { label: "ratio", min: 0 },
        series: [{ label: "u/u_m", points: prof.map((r) => [r, P.atFloat(Ud, Math.abs(r))]) },
          { label: "(T − T_w)/(T_m − T_w)", points: prof.map((r) => [r, thetaRel(r)]), dash: true }] },
      { id: "convergence", title: "Finite-volume convergence of Nu", caption: "The error of the finite-volume Nu falls by about 4 when N doubles: second order.",
        x: { label: "cells N", log: true }, y: { label: "|Nu_N − Nu|", log: true },
        series: [{ label: "error", points: grid.map((g) => [g.n, g.errNu]), markers: true }] },
    ];
    return { steps, checks, outputs, figures, table: grid.map((g) => ({ cells: String(g.n), "Nu_N": fmt(g.nu, 8), "error of Nu": fmt(g.errNu, 3), "P_N": fmt(g.P, 8) })),
      exact: { fRe: Q.str(fRe), Nu: Q.str(Nu), P: Q.str(Pd), S: Q.str(Sd) }, key: `f·Re = ${Q.str(fRe)} and Nu = ${Q.str(Nu)} (${fmt(N(Nu), 4)}), exact` };
  }

  /* ======================================================================================================== */
  /* Compressible nozzle: quasi-1D isentropic ideal gas (anchor test 3)                                        */
  /* ======================================================================================================== */

  /** The isentropic relations for one ratio of specific heats. */
  function gas(g) {
    const k = (g - 1) / 2, n = (g + 1) / (2 * (g - 1));
    const G = (M) => 1 + k * M * M;
    return {
      k, n, G,
      areaRatio: (M) => Math.pow(G(M) / (1 + k), n) / M,
      flux: (M) => M * Math.pow(G(M), -n),
      pRatio: (M) => Math.pow(G(M), -g / (g - 1)),
      tRatio: (M) => 1 / G(M),
      rhoRatio: (M) => Math.pow(G(M), -1 / (g - 1)),
      /** The Mach number on one branch for an area ratio A/A* ≥ 1. */
      mach(ar, branch) {
        if (ar < 1) return null;
        if (ar === 1) return { x: 1, it: 0, residual: 0 };
        if (branch === "sub") return bisect((M) => this.areaRatio(M) - ar, 1e-12, 1);
        let hi = 2;
        while (this.areaRatio(hi) < ar && hi < 1e6) hi *= 2;
        return bisect((M) => this.areaRatio(M) - ar, 1, hi);
      },
    };
  }

  function nozzle(ctx) {
    const { v, x, tolerances: tol } = ctx;
    const g = v.gamma, gs = gas(g);
    const cp = g * v.R / (g - 1);
    const steps = [], checks = [];
    // Exact algebra on the record's γ when it is rational.
    const gx = x.gamma;
    const exact = gx && Q.cmp(gx, Q.ONE) > 0;
    let polyOk = false, expOk = false, coefOk = false, nx = null, phi2 = null;
    if (exact) {
      const one = Q.ONE, two = q(2);
      const k = Q.div(Q.sub(gx, one), two);
      nx = Q.div(Q.add(gx, one), Q.mul(two, Q.sub(gx, one)));
      const cpOverR = Q.div(gx, Q.sub(gx, one));
      coefOk = Q.eq(Q.div(gx, Q.mul(two, cpOverR)), k);
      expOk = Q.eq(Q.add(Q.neg(Q.inv(Q.sub(gx, one))), q(-1, 2)), Q.neg(nx));
      // d/dM [M g^{-n}] = g^{-n-1} (g - n M g'), g = 1 + k M^2: the bracket must equal 1 - M^2.
      const Gp = [one, Q.ZERO, k];
      const bracket = P.sub(Gp, P.scale(P.mul([Q.ZERO, one], P.deriv(Gp)), nx));
      polyOk = P.eq(bracket, P.of([1, 0, -1]));
      if (Q.isInteger(Q.mul(two, nx))) phi2 = Q.mul(gx, Q.pow(Q.div(two, Q.add(gx, one)), Number(Q.mul(two, nx).n)));
    }
    const nf = (g + 1) / (2 * (g - 1));
    const tStar = 2 / (g + 1), pStar = Math.pow(tStar, g / (g - 1)), rhoStar = Math.pow(tStar, 1 / (g - 1));
    const phi = Math.sqrt(g) * Math.pow(tStar, nf);
    const mdotMax = v.p0 * v.At * phi / Math.sqrt(v.R * v.T0);
    const eps = v.Ae / v.At, epsIn = v.Ai / v.At;
    const sub = gs.mach(eps, "sub"), sup = gs.mach(eps, "sup");
    const p1 = gs.pRatio(sub.x), p3 = gs.pRatio(sup.x);
    const pb = v.pb / v.p0;
    const near = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));
    let regime, mdot, Me, branch, Astar;
    if (pb >= 1) { regime = "no-flow"; mdot = 0; Me = 0; branch = null; Astar = Infinity; }
    else if (pb > p1 && !near(pb, p1)) {
      regime = "subsonic";
      Me = Math.sqrt((2 / (g - 1)) * (Math.pow(1 / pb, (g - 1) / g) - 1));
      Astar = v.Ae / gs.areaRatio(Me);
      mdot = v.p0 * v.Ae * Math.sqrt(g / (v.R * v.T0)) * gs.flux(Me);
      branch = "sub";
    } else if (near(pb, p1)) { regime = "choked-subsonic"; Me = sub.x; Astar = v.At; mdot = mdotMax; branch = "sub"; }
    else if (pb > p3 && !near(pb, p3)) { regime = "shock"; Me = null; Astar = v.At; mdot = mdotMax; branch = null; }
    else { regime = near(pb, p3) ? "design" : "underexpanded"; Me = sup.x; Astar = v.At; mdot = mdotMax; branch = "sup"; }

    // The flow along the declared nozzle, X = x/L in [0, 1], throat at X = 1/2.
    const area = (X) => (X <= 0.5 ? v.At + (v.Ai - v.At) * (1 - 2 * X) ** 2 : v.At + (v.Ae - v.At) * (2 * X - 1) ** 2);
    const stations = [];
    let massDev = 0, energyDev = 0, resid = 0;
    if (branch || regime === "shock") {
      for (let i = 0; i <= 60; i++) {
        const X = i / 60, A = area(X);
        const downstream = X > 0.5;
        if (regime === "shock" && downstream) { stations.push({ X, A: A / v.At, M: null, p: null, T: null }); continue; }
        const br = !downstream || branch === "sub" || regime === "shock" ? "sub" : "sup";
        const ar = A / Astar;
        const sol = Math.abs(ar - 1) < 1e-14 ? { x: 1, residual: 0 } : gs.mach(ar, br);
        const M = sol.x;
        resid = Math.max(resid, Math.abs(gs.areaRatio(M) - ar) / ar);
        const T = v.T0 * gs.tRatio(M), p = v.p0 * gs.pRatio(M), rho = p / (v.R * T), u = M * Math.sqrt(g * v.R * T);
        if (mdot > 0) massDev = Math.max(massDev, Math.abs(rho * u * A - mdot) / mdot);
        energyDev = Math.max(energyDev, Math.abs(cp * T + u * u / 2 - cp * v.T0) / (cp * v.T0));
        stations.push({ X, A: A / v.At, M, p: p / v.p0, T: T / v.T0 });
      }
    }
    const exitT = Me != null ? v.T0 * gs.tRatio(Me) : null;
    const exitU = Me != null ? Me * Math.sqrt(g * v.R * exitT) : null;

    steps.push(
      { id: "s-fam-conservation", item: 7, title: "Conservation laws of the quasi-1D flow",
        reason: "Steady flow in a slender nozzle: mass, energy and entropy are constant along the axis. The gas is ideal with constant specific heats, and the walls exchange no heat and no shear.",
        tex: ["\\rho\\,u\\,A=\\dot m,\\qquad c_pT+\\tfrac12u^{2}=c_pT_0,\\qquad p=\\rho RT,\\qquad \\frac{p}{\\rho^{\\gamma}}=\\frac{p_0}{\\rho_0^{\\gamma}}",
          "c_p=\\frac{\\gamma R}{\\gamma-1},\\qquad a^{2}=\\gamma RT,\\qquad M=\\frac{u}{a}"], evidence: ["nasa-choking"] },
      { id: "s-fam-isentropic", item: 7, title: "Stagnation ratios in terms of the Mach number",
        reason: "The energy equation divided by c_p T gives the temperature ratio. The isentropic relation then gives the pressure and density ratios.",
        tex: ["\\frac{T_0}{T}=1+\\frac{\\gamma-1}{2}M^{2},\\qquad \\frac{p_0}{p}=\\left(\\frac{T_0}{T}\\right)^{\\gamma/(\\gamma-1)},\\qquad \\frac{\\rho_0}{\\rho}=\\left(\\frac{T_0}{T}\\right)^{1/(\\gamma-1)}"], evidence: ["nasa-choking"] },
      { id: "s-fam-massflow", item: 7, title: "Mass flow in dimensionless form",
        reason: "Mass conservation with the stagnation ratios gives one dimensionless mass-flow parameter. It depends on M and γ only.",
        tex: ["\\frac{\\dot m\\sqrt{RT_0}}{p_0A}=\\sqrt{\\gamma}\\;M\\left(1+\\frac{\\gamma-1}{2}M^{2}\\right)^{-\\frac{\\gamma+1}{2(\\gamma-1)}}\\equiv F(M)",
          "-\\frac{1}{\\gamma-1}-\\frac12=-\\frac{\\gamma+1}{2(\\gamma-1)}"], evidence: ["nasa-choking"] },
      { id: "s-fam-sonic", item: 8, title: "Sonic condition and the mass-flow maximum",
        reason: "The derivative of F has the sign of 1 − M². Thus F has one maximum, at M = 1. The throat is the only place where the flow can pass M = 1, because dA = 0 there.",
        tex: ["\\frac{\\mathrm dF}{\\mathrm dM}=\\sqrt{\\gamma}\\left(1+\\frac{\\gamma-1}{2}M^{2}\\right)^{-\\frac{\\gamma+1}{2(\\gamma-1)}-1}\\left(1-M^{2}\\right)",
          "\\frac{\\mathrm dA}{A}=\\left(M^{2}-1\\right)\\frac{\\mathrm du}{u}",
          `\\frac{A}{A^{*}}=\\frac{1}{M}\\left[\\frac{2}{\\gamma+1}\\left(1+\\frac{\\gamma-1}{2}M^{2}\\right)\\right]^{\\frac{\\gamma+1}{2(\\gamma-1)}},\\qquad \\frac{T^{*}}{T_0}=\\frac{2}{\\gamma+1}=${texNum(tStar)}`], evidence: ["nasa-choking"] },
      { id: "s-fam-branches", item: 9, title: "The two branches of the area–Mach relation",
        reason: "A/A* has its only minimum, 1, at M = 1. Thus each area ratio above 1 has exactly two solutions: one subsonic and one supersonic. The branches meet at a fold at M = 1.",
        tex: [`\\frac{A_e}{A_t}=${texNum(eps)}:\\qquad M_{e,\\mathrm{sub}}=${texNum(sub.x)},\\quad M_{e,\\mathrm{sup}}=${texNum(sup.x)}`,
          `\\frac{p_{e,\\mathrm{sub}}}{p_0}=${texNum(p1)},\\qquad \\frac{p_{e,\\mathrm{sup}}}{p_0}=${texNum(p3)}`], evidence: ["nasa-choking"] },
      { id: "s-fam-regime", item: 8, title: "The back pressure selects the flow",
        reason: "Above the first critical ratio the flow is subsonic everywhere. Below it the throat is sonic and the mass flow is at its maximum. Between the two critical ratios, shocks occur, and this model does not describe them.",
        tex: [`\\frac{p_b}{p_0}=${texNum(pb)}:\\quad ${regime === "subsonic" ? "\\frac{p_b}{p_0}>\\frac{p_{e,\\mathrm{sub}}}{p_0}" : regime === "shock" ? "\\frac{p_{e,\\mathrm{sup}}}{p_0}<\\frac{p_b}{p_0}<\\frac{p_{e,\\mathrm{sub}}}{p_0}" : regime === "no-flow" ? "p_b\\ge p_0" : "\\frac{p_b}{p_0}\\le\\frac{p_{e,\\mathrm{sup}}}{p_0}"}`,
          `\\dot m_{\\max}=\\frac{p_0A_t}{\\sqrt{RT_0}}\\sqrt{\\gamma}\\left(\\frac{2}{\\gamma+1}\\right)^{\\frac{\\gamma+1}{2(\\gamma-1)}}=${texNum(mdotMax)}\\ \\mathrm{kg/s}`], evidence: ["nasa-choking"] },
      { id: "s-fam-numerics", item: 10, title: "Numerical procedure: bisection on each branch",
        reason: "For each station the page solves A/A* = f(M) by bisection on the branch that the regime selects. Then it computes ρuA and the total enthalpy at each station.",
        tex: [`61\\ \\text{stations},\\qquad \\max\\frac{|\\rho uA-\\dot m|}{\\dot m}=${texNum(massDev, 3)},\\qquad \\max\\frac{|c_pT+u^{2}/2-c_pT_0|}{c_pT_0}=${texNum(energyDev, 3)}`], evidence: [] },
    );
    if (exact) {
      checks.push({ id: "energy-mach", status: coefOk ? "exact" : "unresolved", passed: coefOk, title: `With c_p = γR/(γ − 1), the energy equation gives T₀/T = 1 + ${Q.str(Q.div(Q.sub(gx, Q.ONE), q(2)))}·M² exactly for γ = ${Q.str(gx)}.`, tex: `\\frac{\\gamma R}{2c_p}=\\frac{\\gamma-1}{2}=${Q.tex(Q.div(Q.sub(gx, Q.ONE), q(2)))}`, evidence: ["nasa-choking"], steps: ["s-fam-isentropic"] });
      checks.push({ id: "exponent", status: expOk ? "exact" : "unresolved", passed: expOk, title: `The exponents of the mass flux add exactly: −1/(γ − 1) − 1/2 = −(γ + 1)/(2(γ − 1)) = −${Q.str(nx)} for γ = ${Q.str(gx)}. Thus ρuA is the same at every station.`, tex: `-\\frac{\\gamma+1}{2(\\gamma-1)}=${Q.tex(Q.neg(nx))}`, evidence: [], steps: ["s-fam-massflow"] });
      checks.push({ id: "sonic", status: polyOk ? "exact" : "unresolved", passed: polyOk, title: "The numerator of dF/dM is exactly 1 − M². Thus M = 1 is the only stationary point, and it is a maximum: the sonic condition.", tex: "1+\\frac{\\gamma-1}{2}M^{2}-\\frac{\\gamma+1}{2(\\gamma-1)}\\,M\\,(\\gamma-1)M=1-M^{2}", evidence: ["nasa-choking"], steps: ["s-fam-sonic"] });
      checks.push({ id: "critical", status: "exact", passed: true, title: `At M = 1: A/A* = 1 and T*/T₀ = 2/(γ + 1) = ${qText(Q.div(q(2), Q.add(gx, Q.ONE)))} exactly.`, tex: `\\frac{T^{*}}{T_0}=${Q.tex(Q.div(q(2), Q.add(gx, Q.ONE)))}`, evidence: [], steps: ["s-fam-sonic"] });
      if (phi2) checks.push({ id: "phi", status: "exact", passed: Math.abs(Math.sqrt(N(phi2)) - phi) <= 1e-14 * phi, title: `The squared choked mass-flow parameter is exactly ${Q.str(phi2)}, so ṁ√(RT₀)/(p₀A_t) = ${fmt(Math.sqrt(N(phi2)), 8)}.`, tex: `\\left(\\frac{\\dot m\\sqrt{RT_0}}{p_0A_t}\\right)^{2}=\\gamma\\left(\\frac{2}{\\gamma+1}\\right)^{\\frac{\\gamma+1}{\\gamma-1}}=${Q.tex(phi2)}`, evidence: ["nasa-choking"], steps: ["s-fam-regime"] });
    } else {
      checks.push({ id: "sonic", status: "unresolved", passed: false, title: "γ has no exact value, so the page cannot check the sonic condition exactly.", next: "Enter γ as a decimal or a fraction, such as 1.4 or 7/5.", evidence: [], steps: ["s-fam-sonic"] });
    }
    checks.push({ id: "roots", status: "numerical", passed: sub.residual <= tol.root && sup.residual <= tol.root,
      title: `The two exit Mach numbers for A_e/A_t = ${fmt(eps)} are ${fmt(sub.x, 8)} and ${fmt(sup.x, 8)}. The residuals of the area–Mach relation are ${fmt(sub.residual, 2)} and ${fmt(sup.residual, 2)}.`, tolerance: `residual ≤ ${tol.root}`, evidence: [], steps: ["s-fam-branches"] });
    if (stations.length && mdot > 0) {
      checks.push({ id: "mass", status: "numerical", passed: massDev <= tol.conservation && resid <= tol.conservation,
        title: `Mass conservation along the nozzle: ρuA differs from ṁ by at most ${fmt(massDev, 2)} (relative) over ${stations.filter((s) => s.M != null).length} stations.`, tolerance: `relative difference ≤ ${tol.conservation}`, evidence: [], steps: ["s-fam-numerics"] });
      checks.push({ id: "energy", status: "numerical", passed: energyDev <= tol.conservation,
        title: `Energy conservation: c_pT + u²/2 differs from c_pT₀ by at most ${fmt(energyDev, 2)} (relative).`, tolerance: `relative difference ≤ ${tol.conservation}`, evidence: [], steps: ["s-fam-numerics"] });
    }
    const regimeText = {
      "no-flow": "The back pressure is not below p₀, so no flow goes through the nozzle.",
      subsonic: `p_b/p₀ = ${fmt(pb)} is above the first critical ratio ${fmt(p1)}. The flow is subsonic everywhere, the throat is not sonic, and ṁ = ${fmt(mdot)} kg/s is below the choked value.`,
      "choked-subsonic": `p_b/p₀ = ${fmt(pb)} is the first critical ratio. The throat is sonic, and the flow is subsonic after it.`,
      design: `p_b/p₀ = ${fmt(pb)} is the design ratio. The flow is isentropic and supersonic from the throat to the exit, with M_e = ${fmt(Me)}.`,
      underexpanded: `p_b/p₀ = ${fmt(pb)} is below the design ratio ${fmt(p3)}. The flow in the nozzle is isentropic and supersonic after the throat, with M_e = ${fmt(Me)}. The jet expands further outside the nozzle. The quasi-1D model does not describe the jet.`,
      shock: `p_b/p₀ = ${fmt(pb)} is between the design ratio ${fmt(p3)} and the first critical ratio ${fmt(p1)}. Shocks occur in the nozzle or in the jet. This declaration does not include shocks.`,
    }[regime];
    checks.push(regime === "shock" || regime === "no-flow"
      ? { id: "regime", status: "unresolved", passed: false, title: regimeText, evidence: ["nasa-choking"], steps: ["s-fam-regime"], next: regime === "shock" ? "Shocks need a separate declaration. The choked mass flow upstream of the shock stays valid. Or select a back pressure outside the shock range." : "Lower the back pressure below p₀." }
      : { id: "regime", status: "evidence", passed: true, title: regimeText, evidence: ["nasa-choking"], steps: ["s-fam-regime"] });
    if (regime !== "subsonic" && regime !== "no-flow") {
      checks.push({ id: "choked", status: "evidence", passed: true, title: `The throat is sonic, so the mass flow is the choked value ṁ = ${fmt(mdotMax)} kg/s. A lower back pressure does not increase it.`, evidence: ["nasa-choking"], steps: ["s-fam-regime"] });
    }

    const outputs = [
      { id: "mdot", label: "Mass flow rate", tex: "\\dot m", value: mdot, unit: "kg/s", role: "mdot" },
      { id: "mdotMax", label: "Choked mass flow rate", tex: "\\dot m_{\\max}", value: mdotMax, unit: "kg/s" },
      { id: "phi", label: "Choked mass-flow parameter", tex: "\\dot m_{\\max}\\sqrt{RT_0}/(p_0A_t)", value: phi, unit: "" },
      { id: "p1", label: "First critical pressure ratio", tex: "p_{e,\\mathrm{sub}}/p_0", value: p1, unit: "" },
      { id: "p3", label: "Design pressure ratio", tex: "p_{e,\\mathrm{sup}}/p_0", value: p3, unit: "" },
      { id: "pstar", label: "Critical pressure ratio", tex: "p^{*}/p_0", value: pStar, unit: "" },
      { id: "rhostar", label: "Critical density ratio", tex: "\\rho^{*}/\\rho_0", value: rhoStar, unit: "" },
      ...(Me != null ? [{ id: "Me", label: "Exit Mach number", tex: "M_e", value: Me, unit: "" }, { id: "Te", label: "Exit temperature", tex: "T_e", value: exitT, unit: "K" }, { id: "ue", label: "Exit velocity", tex: "u_e", value: exitU, unit: "m/s" }] : []),
    ];
    const Ms = Array.from({ length: 121 }, (_, i) => 0.02 + i * 0.025);
    const figures = [
      { id: "nozzle", title: "Mach number and pressure along the nozzle", caption: regime === "shock" ? "The page draws the flow up to the throat. After the throat a shock occurs, which this declaration does not include." : "M and p/p₀ against x/L. The throat is at x/L = 0.5.",
        x: { label: "x/L", min: 0, max: 1 }, y: { label: "M, p/p₀, A/A_t", min: 0 },
        series: [{ label: "A/A_t", points: stations.map((s) => [s.X, s.A]), dash: true }, { label: "M", points: stations.filter((s) => s.M != null).map((s) => [s.X, s.M]) }, { label: "p/p₀", points: stations.filter((s) => s.p != null).map((s) => [s.X, s.p]) }],
        vlines: [{ x: 0.5, label: "throat" }] },
      { id: "flux", title: "Mass-flow parameter against the Mach number", caption: "F(M)/F(1) has its only maximum at M = 1: the sonic condition.",
        x: { label: "M", min: 0, max: 3 }, y: { label: "F(M)/F(1)", min: 0, max: 1.05 },
        series: [{ label: "F/F(1)", points: Ms.map((M) => [M, gs.flux(M) / gs.flux(1)]) }], vlines: [{ x: 1, label: "M = 1" }] },
      { id: "backpressure", title: "Back-pressure ratio and the flow regime", caption: "The two critical ratios divide the back-pressure axis. The shock range needs a separate declaration.",
        kind: "bands", x: { label: "p_b/p₀", min: 0, max: 1 },
        bands: [{ from: 0, to: p3, label: "supersonic exit", state: "ok" }, { from: p3, to: p1, label: "shocks: separate declaration", state: "unresolved" }, { from: p1, to: 1, label: "subsonic", state: "ok" }],
        marks: [{ x: Math.min(1, pb), label: `p_b/p₀ = ${fmt(pb, 4)}` }] },
    ];
    return { steps, checks, outputs, figures, regime, table: stations.filter((s, i) => i % 6 === 0).map((s) => ({ "x/L": fmt(s.X, 3), "A/A_t": fmt(s.A, 4), M: s.M == null ? "shock range" : fmt(s.M, 5), "p/p₀": s.p == null ? "" : fmt(s.p, 5) })),
      exact: { phi2: phi2 ? Q.str(phi2) : null, n: nx ? Q.str(nx) : null }, key: `ṁ = ${fmt(mdot)} kg/s, ${regime === "subsonic" ? "not choked" : "choked at the throat"}` };
  }

  /* ======================================================================================================== */
  /* Free-surface flow: 1D shallow water on a flat bed                                                         */
  /* ======================================================================================================== */

  function shallowWater(ctx) {
    const { v, x, tolerances: tol } = ctx;
    const g = v.g, qv = v.q, h1 = v.h1;
    const checks = [], steps = [];
    const allExact = x.g && x.q && x.h1;
    const Fr1sq = (qv * qv) / (g * h1 ** 3);
    const hc = Math.cbrt((qv * qv) / g);
    const E = (h) => h + (qv * qv) / (2 * g * h * h);
    const Mf = (h) => (qv * qv) / (g * h) + (h * h) / 2;
    const E1 = E(h1);
    // Boundary data from the characteristics u ± √(gh): the count that enters at each end.
    const counts = (fr2) => (fr2 < 1 ? { inflow: 1, outflow: 1 } : fr2 > 1 ? { inflow: 2, outflow: 0 } : null);
    let exactOut = null;
    if (allExact) {
      const G = x.g, qq = Q.mul(x.q, x.q), H1 = x.h1;
      const fr2 = Q.div(qq, Q.mul(G, Q.pow(H1, 3)));
      const sup = Q.cmp(fr2, Q.ONE) > 0;
      // Hydraulic jump: r = h2/h1 solves r^2 + r - 2 Fr1^2 = 0, so r = (-1 + √(1 + 8 Fr1^2))/2.
      const disc = Q.add(Q.ONE, Q.mul(q(8), fr2));
      const r = QS.of(q(-1, 2), q(1, 2), disc);
      const rPoly = QS.add(QS.add(QS.mul(r, r), r), QS.rat(Q.neg(Q.mul(q(2), fr2))));
      const h2 = QS.scale(r, H1);
      const c = Q.div(qq, G); // q^2/g
      const Mq = (h) => QS.add(QS.mul(QS.rat(c), QS.inv(h)), QS.scale(QS.mul(h, h), q(1, 2)));
      const Eq = (h) => QS.add(h, QS.scale(QS.inv(QS.mul(h, h)), Q.div(c, q(2))));
      const h1s = QS.rat(H1);
      const momentum = QS.sub(Mq(h1s), Mq(h2));
      const dE = QS.sub(Eq(h1s), Eq(h2));
      const dEformula = QS.div(QS.mul(QS.mul(QS.sub(h2, h1s), QS.sub(h2, h1s)), QS.sub(h2, h1s)), QS.scale(QS.mul(h1s, h2), q(4)));
      const lossOk = QS.isZero(QS.sub(dE, dEformula));
      const fr2b = QS.mul(QS.rat(c), QS.inv(QS.mul(QS.mul(h2, h2), h2)));
      const sub2 = QS.sign(QS.sub(fr2b, QS.rat(Q.ONE))) < 0;
      // Alternate depth: h^3 - E1 h^2 + q^2/(2g) = (h - h1)(h^2 + (h1 - E1) h + h1 (h1 - E1)).
      const e1 = Q.add(H1, Q.div(c, Q.mul(q(2), Q.mul(H1, H1))));
      const pp = Q.sub(H1, e1);
      const cubicRem = Q.add(Q.div(c, q(2)), Q.mul(H1, Q.mul(H1, pp)));
      const dd = Q.sub(Q.mul(pp, pp), Q.mul(q(4), Q.mul(H1, pp)));
      const hAlt = QS.of(Q.div(Q.neg(pp), q(2)), q(1, 2), dd);
      const altE = QS.sub(Eq(hAlt), QS.rat(e1));
      // Critical depth: E(h_c) = 3/2 h_c, with q^2/g = h_c^3. As polynomials in h_c: h_c + h_c^3/(2 h_c^2) - 3/2 h_c.
      const crit = P.sub(P.add(P.of([0, 1]), P.of([0, Q.q(1n, 2n)])), P.of([0, Q.q(3n, 2n)]));
      exactOut = { fr2, sup, r, rPoly, h2, momentum, dE, lossOk, fr2b, sub2, hAlt, altE, cubicRem, crit, disc };
    }
    const r = exactOut ? QS.num(exactOut.r) : (-1 + Math.sqrt(1 + 8 * Fr1sq)) / 2;
    const h2 = r * h1, dE = E1 - E(h2), Fr2sq = (qv * qv) / (g * h2 ** 3);
    const altF = Fr1sq > 1 ? bisect((h) => E(h) - E1, hc, Math.max(4 * E1, hc * 2)) : bisect((h) => E(h) - E1, 1e-9 * hc, hc);
    const hAltExact = exactOut ? QS.num(exactOut.hAlt) : null;
    const up = counts(Fr1sq), down = counts(Fr2sq);
    // The record's conditions at each end of the reach.
    const atEnd = (end) => ctx.conditions.filter((cnd) => cnd.atVar && new RegExp(`^${cnd.atVar}\\s*=\\s*${end === "inflow" ? "0" : "L"}$`).test(String(cnd.at).replace(/\s+/g, " ").trim()));
    const given = { inflow: atEnd("inflow").length, outflow: atEnd("outflow").length };
    const jumpOk = Fr1sq > 1;

    steps.push(
      { id: "s-fam-swe", item: 7, title: "Shallow-water equations on a flat bed",
        reason: "Long waves on a thin layer: the pressure is hydrostatic, and the velocity is uniform over the depth. The bed is flat and has no friction, and the water covers the whole reach.",
        tex: ["\\frac{\\partial h}{\\partial t}+\\frac{\\partial (hu)}{\\partial x}=0,\\qquad \\frac{\\partial (hu)}{\\partial t}+\\frac{\\partial}{\\partial x}\\left(hu^{2}+\\tfrac12gh^{2}\\right)=0,\\qquad h>0"], evidence: ["swe"] },
      { id: "s-fam-characteristics", item: 8, title: "Characteristics and admissible boundary data",
        reason: "The flux Jacobian has the eigenvalues u ± √(gh). Each characteristic that enters the reach needs one condition. Fr < 1 gives one condition at each end. Fr > 1 gives two at the inflow and none at the outflow.",
        tex: ["\\lambda_{\\pm}=u\\pm\\sqrt{gh},\\qquad Fr^{2}=\\frac{u^{2}}{gh}=\\frac{q^{2}}{gh^{3}}",
          `Fr_1^{2}=${texNum(Fr1sq)}\\ (\\text{inflow}),\\qquad Fr_2^{2}=${texNum(Fr2sq)}\\ (\\text{outflow})`], evidence: ["swe"] },
      { id: "s-fam-energy", item: 8, title: "Specific energy and critical depth",
        reason: "Steady flow keeps q = hu and the specific energy E. E has its minimum where Fr = 1, at the critical depth. Each E above the minimum has one subcritical and one supercritical depth.",
        tex: ["E=h+\\frac{q^{2}}{2gh^{2}},\\qquad \\frac{\\mathrm dE}{\\mathrm dh}=1-Fr^{2},\\qquad h_c=\\left(\\frac{q^{2}}{g}\\right)^{1/3},\\qquad E_{\\min}=\\tfrac32h_c",
          `h_c=${texNum(hc)}\\ \\mathrm m,\\qquad E_1=${texNum(E1)}\\ \\mathrm m,\\qquad h_{\\mathrm{alt}}=${texNum(altF ? altF.x : NaN)}\\ \\mathrm m`], evidence: ["open-channel"] },
      { id: "s-fam-jump", item: 8, title: "Hydraulic jump: conjugate depths",
        reason: "Across a jump the flow keeps its mass and its momentum, but it loses energy. The momentum function is equal on both sides, and this gives the conjugate depth.",
        tex: ["\\frac{q^{2}}{gh_1}+\\frac{h_1^{2}}{2}=\\frac{q^{2}}{gh_2}+\\frac{h_2^{2}}{2}\\;\\Rightarrow\\; r^{2}+r-2Fr_1^{2}=0,\\qquad r=\\frac{h_2}{h_1}=\\frac{\\sqrt{1+8Fr_1^{2}}-1}{2}",
          "\\Delta E=E_1-E_2=\\frac{(h_2-h_1)^{3}}{4h_1h_2}",
          exactOut ? `\\frac{h_2}{h_1}=${QS.tex(exactOut.r)}=${texNum(r)}` : `\\frac{h_2}{h_1}=${texNum(r)}`], evidence: ["jump"] },
    );
    if (exactOut) {
      const inOk = Boolean(up && given.inflow === up.inflow && given.outflow === up.outflow);
      checks.push({ id: "characteristics", status: inOk ? "exact" : "unresolved", passed: inOk,
        title: `Boundary data: the inflow is ${exactOut.sup ? "supercritical" : "subcritical"} (Fr₁² = ${qText(exactOut.fr2)}, exact sign of Fr₁² − 1), so the flow needs ${up ? up.inflow : "?"} condition${up && up.inflow === 1 ? "" : "s"} at x = 0 and ${up ? up.outflow : "?"} at x = L. The model gives ${given.inflow} and ${given.outflow}.${jumpOk && down ? ` A jump forms only when the outflow holds the subcritical conjugate depth h₂: that adds ${down.outflow} condition at x = L.` : ""}`,
        evidence: ["swe"], steps: ["s-fam-characteristics"], next: inOk ? "" : "Give one condition for each characteristic that enters the reach." });
      checks.push({ id: "critical", status: P.isZero(exactOut.crit) ? "exact" : "unresolved", passed: P.isZero(exactOut.crit), title: "With q²/g = h_c³, E(h_c) = h_c + h_c/2 = (3/2) h_c exactly, and dE/dh = 1 − Fr² is 0 there.", tex: "E(h_c)=h_c+\\frac{h_c^{3}}{2h_c^{2}}=\\tfrac32h_c", evidence: ["open-channel"], steps: ["s-fam-energy"] });
      checks.push({ id: "alternate", status: QS.isZero(exactOut.altE) && Q.isZero(exactOut.cubicRem) ? "exact" : "unresolved", passed: QS.isZero(exactOut.altE),
        title: `The alternate depth with the same specific energy is h = ${fmt(hAltExact, 8)} m, exact in the field with √${Q.str(exactOut.hAlt.d)}. E(h) − E₁ = 0 exactly.`, tex: `h_{\\mathrm{alt}}=${QS.tex(exactOut.hAlt)}`, evidence: ["open-channel"], steps: ["s-fam-energy"] });
      if (altF) checks.push({ id: "alternate-float", status: "numerical", passed: Math.abs(altF.x - hAltExact) <= tol.root * hAltExact,
        title: `Bisection gives the alternate depth ${fmt(altF.x, 10)} m, which agrees with the exact value within ${fmt(Math.abs(altF.x - hAltExact) / hAltExact, 2)} (relative).`, tolerance: `relative difference ≤ ${tol.root}`, evidence: [], steps: ["s-fam-energy"] });
      checks.push({ id: "momentum", status: QS.isZero(exactOut.momentum) && QS.isZero(exactOut.rPoly) ? "exact" : "unresolved", passed: QS.isZero(exactOut.momentum),
        title: `The conjugate depth h₂ = ${fmt(h2, 8)} m keeps the momentum function exactly: M(h₁) − M(h₂) = 0 in the field with √${Q.str(exactOut.disc)}.`, tex: `h_2=${QS.tex(exactOut.h2)}`, evidence: ["jump"], steps: ["s-fam-jump"] });
      checks.push({ id: "loss", status: exactOut.lossOk ? "exact" : "unresolved", passed: exactOut.lossOk, title: `The energy loss E₁ − E₂ equals (h₂ − h₁)³/(4h₁h₂) exactly: ΔE = ${fmt(dE, 6)} m.`, tex: `\\Delta E=${QS.tex(exactOut.dE)}`, evidence: ["jump"], steps: ["s-fam-jump"] });
      if (jumpOk) {
        checks.push({ id: "admissible", status: QS.sign(exactOut.dE) > 0 && exactOut.sub2 ? "exact" : "unresolved", passed: QS.sign(exactOut.dE) > 0 && exactOut.sub2,
          title: `The jump is admissible: it loses energy (ΔE > 0, exact sign), and it goes from supercritical to subcritical flow (Fr₂² = ${fmt(Fr2sq, 6)} < 1, exact sign).`, evidence: ["jump"], steps: ["s-fam-jump"] });
      } else {
        checks.push({ id: "admissible", status: "unresolved", passed: false,
          title: `No jump is possible: the inflow is subcritical (Fr₁² = ${fmt(Fr1sq, 6)} < 1). The momentum balance gives h₂ = ${fmt(h2, 6)} m < h₁ with an energy gain of ${fmt(-dE, 4)} m, which no real flow can supply.`,
          evidence: ["jump"], steps: ["s-fam-jump"], next: "A hydraulic jump needs supercritical inflow. Increase q or decrease h₁ so that Fr₁ > 1." });
      }
    } else {
      checks.push({ id: "exact-inputs", status: "unresolved", passed: false, title: "g, q or h₁ has no exact value, so the page cannot check the jump exactly.", next: "Enter g, q and h₁ as decimals or fractions.", evidence: [], steps: ["s-fam-jump"] });
    }
    if (jumpOk) checks.push({ id: "position", status: "unresolved", passed: null, limitation: true, title: "This model does not fix the position of the jump: on a flat bed with no friction, every position conserves mass and momentum.", evidence: ["jump"], steps: ["s-fam-jump"], next: "Bed friction or a bed slope fixes the position. That needs a separate declaration." });

    const outputs = [
      { id: "Fr1", label: "Upstream Froude number", tex: "Fr_1", value: Math.sqrt(Fr1sq), unit: "" },
      { id: "h2", label: "Conjugate depth", tex: "h_2", value: h2, unit: "m", role: "h2" },
      { id: "r", label: "Depth ratio", tex: "h_2/h_1", value: r, unit: "" },
      { id: "Fr2", label: "Downstream Froude number", tex: "Fr_2", value: Math.sqrt(Fr2sq), unit: "" },
      { id: "dE", label: "Energy loss of the jump", tex: "\\Delta E", value: dE, unit: "m" },
      { id: "P", label: "Power loss per metre of width", tex: "\\rho g q\\,\\Delta E", value: 1000 * g * qv * dE, unit: "W/m", note: "for water, ρ = 1000 kg/m³" },
      { id: "hc", label: "Critical depth", tex: "h_c", value: hc, unit: "m" },
      { id: "hAlt", label: "Alternate depth", tex: "h_{\\mathrm{alt}}", value: altF ? altF.x : NaN, unit: "m" },
    ].filter((o) => o.id !== "P");
    const hs = Array.from({ length: 160 }, (_, i) => hc * (0.35 + i * 0.03));
    const figures = [
      { id: "energy", title: "Specific energy against depth", caption: "The upstream depth, its alternate depth and the critical depth lie on one curve for the same q. The conjugate depth has less energy.",
        x: { label: "E (m)", min: 0 }, y: { label: "h (m)", min: 0 },
        series: [{ label: "E(h)", points: hs.map((h) => [E(h), h]) }],
        marks: [{ x: E1, y: h1, label: "h₁" }, { x: E(hc), y: hc, label: "h_c" }, ...(altF ? [{ x: E1, y: altF.x, label: "alternate" }] : []), { x: E(h2), y: h2, label: "h₂" }] },
      { id: "momentum", title: "Momentum function against depth", caption: "The jump connects the two depths with equal momentum function M = q²/(gh) + h²/2.",
        x: { label: "M (m²)", min: 0 }, y: { label: "h (m)", min: 0 },
        series: [{ label: "M(h)", points: hs.map((h) => [Mf(h), h]) }],
        marks: [{ x: Mf(h1), y: h1, label: "h₁" }, { x: Mf(h2), y: h2, label: "h₂" }] },
    ];
    return { steps, checks, outputs, figures, exact: exactOut ? { r: QS.tex(exactOut.r), Fr1sq: Q.str(exactOut.fr2) } : null, key: jumpOk ? `h₂ = ${fmt(h2)} m (h₂/h₁ = ${fmt(r, 5)}), ΔE = ${fmt(dE, 4)} m` : "no admissible jump: the inflow is subcritical" };
  }

  /* ======================================================================================================== */
  /* Boundary layer: steady laminar flat plate (Blasius)                                                       */
  /* ======================================================================================================== */

  /** f''' + f f''/2 = 0 from η = 0 to etaMax with f''(0) = s, by RK4 with step h. The fourth component carries
   * the momentum-thickness integral ∫ f'(1 − f') dη, with the same fourth-order accuracy. */
  function blasiusRun(s, h, etaMax, keep = false) {
    const F = (y) => [y[1], y[2], -0.5 * y[0] * y[2], y[1] * (1 - y[1])];
    let y = [0, 0, s, 0];
    const n = Math.round(etaMax / h), path = keep ? [[0, ...y]] : null;
    for (let i = 0; i < n; i++) {
      const k1 = F(y), k2 = F(y.map((v, j) => v + 0.5 * h * k1[j])), k3 = F(y.map((v, j) => v + 0.5 * h * k2[j])), k4 = F(y.map((v, j) => v + h * k3[j]));
      y = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
      if (keep) path.push([(i + 1) * h, ...y]);
    }
    return { y, path, theta: y[3] };
  }
  function blasiusShoot(h, etaMax) {
    const sol = bisect((s) => blasiusRun(s, h, etaMax).y[1] - 1, 0.2, 0.5, 1e-15, 200);
    return { s: sol.x, it: sol.it };
  }

  function blasius(ctx) {
    const { v, tolerances: tol, refs } = ctx;
    const nu = v.mu / v.rho;
    const Re = v.U * v.x / nu;
    const ref = refs?.blasius?.fpp0 ?? null;
    const base = { h: 0.025, eta: 12 };
    const conv = [0.1, 0.05, 0.025].map((h) => ({ h, s: blasiusShoot(h, base.eta).s }));
    const dom = [10, 12, 14].map((eta) => ({ eta, s: eta === base.eta ? conv[2].s : blasiusShoot(base.h, eta).s }));
    const ord = order(conv[0].s - conv[1].s, conv[1].s - conv[2].s);
    const s = conv[2].s;
    const run = blasiusRun(s, 0.025, 12, true);
    const path = run.path;
    const at99 = (() => { for (let i = 1; i < path.length; i++) if (path[i][2] >= 0.99) { const [a, b] = [path[i - 1], path[i]]; return a[0] + (0.99 - a[2]) * (b[0] - a[0]) / (b[2] - a[2]); } return NaN; })();
    const last = path[path.length - 1];
    const dstar = last[0] - last[1];
    const theta = run.theta;
    const vEdge = 0.5 * (last[0] * last[2] - last[1]);
    const H = dstar / theta;
    const remainder = dstar / Math.sqrt(Re);
    const tauW = v.rho * v.U * v.U * s / Math.sqrt(Re);
    // Exact exponents of the inner-outer scaling. Write δ/L = Re^a with ν = U L/Re. In units of U²/L the inertia
    // term is Re^0 and the viscous term is Re^(-1-2a); the balance -1 - 2a = 0 gives a. Continuity gives V/U = δ/L.
    // The neglected terms ν u_xx and the pressure change across the layer are (δ/L)² of the kept ones.
    const a = Q.div(q(-1), q(2));
    const viscous = Q.sub(q(-1), Q.mul(q(2), a));
    const neglected = Q.mul(q(2), a);
    const scalesOk = Q.isZero(viscous) && Q.eq(neglected, q(-1));
    // Similarity: x-exponents of u u_x, v u_y and ν u_yy with u ~ x^0, ∂/∂x ~ x^-1, η = y x^-1/2 so ∂/∂y ~ x^-1/2,
    // and v ~ x^-1/2.
    const half = q(-1, 2);
    const ex = { uux: Q.add(Q.ZERO, q(-1)), vuy: Q.add(half, half), nuuyy: Q.mul(q(2), half) };
    const simOk = Q.eq(ex.uux, ex.vuy) && Q.eq(ex.vuy, ex.nuuyy);
    const steps = [
      { id: "s-fam-scales", item: 6, title: "Inner and outer scales",
        reason: "The outer flow has the length L and the speed U. Near the wall, viscosity must balance inertia, so the wall layer has its own thickness δ and its own normal velocity V.",
        tex: ["u\\frac{\\partial u}{\\partial x}\\sim\\frac{U^{2}}{L},\\qquad \\nu\\frac{\\partial^{2}u}{\\partial y^{2}}\\sim\\frac{\\nu U}{\\delta^{2}}\\;\\Rightarrow\\;\\frac{\\delta}{L}=Re_L^{-1/2},\\qquad \\frac{V}{U}=\\frac{\\delta}{L}=Re_L^{-1/2}",
          "\\frac{\\nu\\,\\partial^{2}u/\\partial x^{2}}{\\nu\\,\\partial^{2}u/\\partial y^{2}}\\sim\\left(\\frac{\\delta}{L}\\right)^{2}=Re_L^{-1}"], evidence: ["mit-bl"] },
      { id: "s-fam-equations", item: 7, title: "Boundary-layer equations",
        reason: "The terms of order 1/Re drop out. The normal momentum equation then says that the pressure across the layer is the pressure of the outer flow. On a flat plate the outer pressure is constant.",
        tex: ["\\frac{\\partial u}{\\partial x}+\\frac{\\partial v}{\\partial y}=0,\\qquad u\\frac{\\partial u}{\\partial x}+v\\frac{\\partial u}{\\partial y}=\\nu\\frac{\\partial^{2}u}{\\partial y^{2}}",
          "u(x,0)=v(x,0)=0,\\qquad u(x,\\infty)=U,\\qquad u(0,y)=U"], evidence: ["mit-bl"] },
      { id: "s-fam-similarity", item: 7, title: "Similarity variable",
        reason: "The plate has no length of its own, so the solution depends on one combined variable. Every term of the momentum equation then has the same power of x, and the equation becomes an ordinary differential equation.",
        tex: ["\\eta=y\\sqrt{\\frac{U}{\\nu x}},\\qquad \\psi=\\sqrt{\\nu U x}\\,f(\\eta),\\qquad u=Uf',\\qquad v=\\frac12\\sqrt{\\frac{\\nu U}{x}}\\left(\\eta f'-f\\right)",
          "f'''+\\tfrac12ff''=0,\\qquad f(0)=f'(0)=0,\\qquad f'(\\infty)=1"], evidence: ["blasius"] },
      { id: "s-fam-shooting", item: 10, title: "Numerical procedure: shooting",
        reason: "The page guesses f''(0), integrates with the classical Runge–Kutta method, and adjusts the guess by bisection until f' = 1 at the end of the domain. Then it repeats with smaller steps and longer domains.",
        tex: [`f''(0)=${s.toFixed(10)}\\quad(h=0.025,\\ \\eta_{\\max}=12)`,
          `\\delta_{99}=${fmt(at99, 5)}\\frac{x}{\\sqrt{Re_x}},\\qquad \\delta^{*}=${fmt(dstar, 6)}\\frac{x}{\\sqrt{Re_x}},\\qquad \\theta=${fmt(theta, 6)}\\frac{x}{\\sqrt{Re_x}},\\qquad H=${fmt(H, 5)}`], evidence: ["blasius"] },
      { id: "s-fam-validity", item: 8, title: "Validity: the estimated remainder",
        reason: "The first correction to the boundary-layer solution comes from the displacement of the outer flow. Its relative size is about δ*/x. This is an estimate of the remainder, not a proved error bound.",
        tex: [`Re_x=\\frac{Ux}{\\nu}=${texNum(Re)},\\qquad \\frac{\\delta^{*}}{x}=\\frac{${fmt(dstar, 5)}}{\\sqrt{Re_x}}=${texNum(remainder, 3)}`], evidence: ["mit-bl"] },
    ];
    const checks = [
      { id: "scales", status: scalesOk ? "exact" : "unresolved", passed: scalesOk, title: "The exponents of the inner scales are exact: δ/L = Re^(−1/2) and V/U = Re^(−1/2). The neglected terms have the relative size Re^(−1).", tex: "\\frac{\\delta}{L}=Re^{-1/2},\\quad \\frac{V}{U}=Re^{-1/2},\\quad \\text{neglected}\\sim Re^{-1}", evidence: ["mit-bl"], steps: ["s-fam-scales"] },
      { id: "similarity", status: simOk ? "exact" : "unresolved", passed: simOk, title: "With η = y√(U/(νx)), every term of the momentum equation has the power x^(−1). Thus the similarity form is exact.", tex: "u\\,u_x\\sim v\\,u_y\\sim \\nu\\,u_{yy}\\sim x^{-1}", evidence: ["blasius"], steps: ["s-fam-similarity"] },
    ];
    if (ref) checks.push({ id: "reference", status: "numerical", passed: Math.abs(s - ref.value) <= tol.reference, title: `f''(0) = ${s.toFixed(10)} agrees with the mpmath reference ${ref.value.toFixed(12)} within ${fmt(Math.abs(s - ref.value), 2)}.`, tolerance: `|difference| ≤ ${tol.reference}`, evidence: [], steps: ["s-fam-shooting"] });
    checks.push({ id: "step", status: "numerical", passed: Math.abs(ord - 4) <= tol.order && Math.abs(conv[1].s - conv[2].s) <= tol.reference,
      title: `Step convergence: halving the step from 0.1 to 0.025 changes f''(0) at order ${fmt(ord, 3)} (Runge–Kutta: 4). The last change is ${fmt(Math.abs(conv[1].s - conv[2].s), 2)}.`, tolerance: `|order − 4| ≤ ${tol.order}, last change ≤ ${tol.reference}`, evidence: [], steps: ["s-fam-shooting"] });
    checks.push({ id: "domain", status: "numerical", passed: Math.abs(dom[2].s - dom[1].s) <= tol.reference, title: `Domain convergence: η_max = 10, 12 and 14 give f''(0) values that differ by ${fmt(Math.abs(dom[0].s - dom[1].s), 2)} and ${fmt(Math.abs(dom[2].s - dom[1].s), 2)}.`, tolerance: `change from 12 to 14 ≤ ${tol.reference}`, evidence: [], steps: ["s-fam-shooting"] });
    checks.push({ id: "momentum-integral", status: "numerical", passed: Math.abs(theta - 2 * s) <= tol.integral, title: `Momentum integral: with dp/dx = 0, dθ/dx = c_f/2 needs ∫f'(1 − f')dη = 2f''(0). The two sides are ${fmt(theta, 9)} and ${fmt(2 * s, 9)}.`, tolerance: `|difference| ≤ ${tol.integral}`, evidence: ["blasius"], steps: ["s-fam-shooting"] });
    checks.push(remainder <= tol.remainder
      ? { id: "remainder", status: "numerical", passed: true, title: `The estimated remainder δ*/x = ${fmt(remainder, 3)} is below the declared tolerance ${tol.remainder} at Re_x = ${fmt(Re)}. This is an estimate, not a proved bound.`, tolerance: `δ*/x ≤ ${tol.remainder}`, evidence: ["mit-bl"], steps: ["s-fam-validity"] }
      : { id: "remainder", status: "unresolved", passed: false, title: `The estimated remainder δ*/x = ${fmt(remainder, 3)} is above the declared tolerance ${tol.remainder} at Re_x = ${fmt(Re)}. The boundary-layer approximation does not meet the tolerance here.`, evidence: ["mit-bl"], steps: ["s-fam-validity"], next: "Move the station downstream or increase U so that Re_x is larger. Near the leading edge the full Navier–Stokes equations apply." });
    checks.push({ id: "laminar", status: "evidence", passed: true, title: `The model assumes a laminar layer and does not predict transition. A turbulent layer needs a separate declaration.`, evidence: ["mit-bl"], steps: ["s-fam-validity"] });
    const outputs = [
      { id: "Re", label: "Local Reynolds number", tex: "Re_x", value: Re, unit: "" },
      { id: "fpp", label: "Wall shear parameter", tex: "f''(0)", value: s, unit: "" },
      { id: "d99", label: "99 % thickness", tex: "\\delta_{99}", value: at99 * v.x / Math.sqrt(Re), unit: "m" },
      { id: "dstar", label: "Displacement thickness", tex: "\\delta^{*}", value: dstar * v.x / Math.sqrt(Re), unit: "m" },
      { id: "theta", label: "Momentum thickness", tex: "\\theta", value: theta * v.x / Math.sqrt(Re), unit: "m" },
      { id: "H", label: "Shape factor", tex: "H", value: H, unit: "" },
      { id: "tau", label: "Wall shear stress", tex: "\\tau_w", value: tauW, unit: "Pa", role: "tau" },
      { id: "cf", label: "Skin-friction coefficient", tex: "c_f", value: 2 * s / Math.sqrt(Re), unit: "" },
      { id: "ve", label: "Normal velocity at the edge", tex: "v_e/U", value: vEdge / Math.sqrt(Re), unit: "" },
    ];
    const pts = path.filter((_, i) => i % 8 === 0 && path[i][0] <= 8);
    const figures = [
      { id: "profile", title: "Blasius velocity profile", caption: "u/U = f'(η) and the shear f''(η)/f''(0) across the layer. f' reaches 0.99 at η ≈ 4.91.",
        x: { label: "u/U, f''/f''(0)", min: 0, max: 1.05 }, y: { label: "η = y√(U/(νx))", min: 0, max: 8 },
        series: [{ label: "u/U = f'", points: pts.map((p) => [p[2], p[0]]) }, { label: "f''/f''(0)", points: pts.map((p) => [p[3] / s, p[0]]), dash: true }],
        hlines: [{ y: at99, label: "δ₉₉" }] },
      { id: "convergence", title: "Step convergence of f''(0)", caption: "The change of f''(0) falls by about 16 when the step halves: fourth order.",
        kind: "table" },
    ];
    return { steps, checks, outputs, figures, table: conv.map((c) => ({ step: String(c.h), "f''(0)": c.s.toFixed(12) })), domain: dom.map((d) => ({ "η_max": String(d.eta), "f''(0)": d.s.toFixed(12) })),
      key: `f''(0) = ${s.toFixed(8)}, τ_w = ${fmt(tauW)} Pa at Re_x = ${fmt(Re)}` };
  }

  /* ======================================================================================================== */
  /* External aerodynamic flow: cylinder, Joukowski airfoil, thin-airfoil theory                               */
  /* ======================================================================================================== */

  const C = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
    abs: (a) => Math.hypot(a[0], a[1]), exp: (t) => [Math.cos(t), Math.sin(t)],
  };
  /** A Joukowski airfoil from its circle: thickness parameter eps, camber parameter kappa = 2m, map constant b = 1. */
  function joukowski(eps, kappa, alpha) {
    const z0 = [-eps, kappa * (1 + eps)];
    const a = C.abs(C.sub([1, 0], z0));
    const beta = Math.atan2(z0[1], 1 + eps);
    const Gam = 4 * Math.PI * a * Math.sin(alpha + beta); // U = 1, clockwise circulation
    const map = (zeta) => C.add(zeta, C.div([1, 0], zeta));
    const dmap = (zeta) => C.sub([1, 0], C.div([1, 0], C.mul(zeta, zeta)));
    // Complex velocity on the circle: dw/dζ = e^{-iα} - a² e^{iα}/(ζ-ζ0)² + iΓ/(2π(ζ-ζ0)).
    const wz = (zeta) => {
      const d = C.sub(zeta, z0);
      return C.add(C.sub(C.exp(-alpha), C.div(C.mul([a * a, 0], C.exp(alpha)), C.mul(d, d))), C.div([0, Gam / (2 * Math.PI)], d));
    };
    const thetaTE = -beta; // the circle point ζ = 1
    const surface = (n) => Array.from({ length: n }, (_, i) => {
      const t = thetaTE + (2 * Math.PI * (i + 0.5)) / n;
      const zeta = C.add(z0, [a * Math.cos(t), a * Math.sin(t)]);
      const z = map(zeta), dz = dmap(zeta);
      const vel = C.abs(wz(zeta)) / C.abs(dz);
      return { t, z, dz, zeta, cp: 1 - vel * vel };
    });
    // Chord: trailing edge z = 2, leading edge the surface point farthest from it (400 samples, then golden section).
    const at = (t) => map(C.add(z0, [a * Math.cos(t), a * Math.sin(t)]));
    const dist = (t) => C.abs(C.sub(at(t), [2, 0]));
    let tBest = thetaTE + Math.PI, dBest = 0;
    for (let i = 0; i < 400; i++) { const t = thetaTE + (2 * Math.PI * (i + 0.5)) / 400, d = dist(t); if (d > dBest) { dBest = d; tBest = t; } }
    let lo = tBest - (2 * Math.PI) / 400, hi = tBest + (2 * Math.PI) / 400;
    const gr = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 60; i++) {
      const t1 = hi - gr * (hi - lo), t2 = lo + gr * (hi - lo);
      if (dist(t1) > dist(t2)) hi = t2; else lo = t1;
    }
    const le = { t: 0.5 * (lo + hi), z: at(0.5 * (lo + hi)) };
    const chord = C.abs(C.sub(le.z, [2, 0]));
    /** Lift per span (ρ = U = 1) from the surface pressure with n points: F = -∮ p n ds. */
    const pressureLift = (n) => {
      const pts = surface(n);
      let fx = 0, fy = 0;
      const dt = (2 * Math.PI) / n;
      for (const p of pts) {
        // dz/dt along the surface (counterclockwise in t): dz/dζ · i (ζ - ζ0).
        const dzdt = C.mul(p.dz, C.mul([0, 1], C.sub(p.zeta, z0)));
        // Outward normal times ds: -i dz for a counterclockwise contour, i.e. (dy, -dx).
        const pr = 0.5 * p.cp; // p - p_inf with ρ = U = 1
        fx -= pr * dzdt[1] * dt;
        fy -= -pr * dzdt[0] * dt;
      }
      // Lift is normal to the free stream (angle α).
      return -fx * Math.sin(alpha) + fy * Math.cos(alpha);
    };
    const kuttaResidual = C.abs(wz([1, 0]));
    /** Thickness ratio: the largest distance between the surfaces normal to the chord line, in 200 stations. */
    const thickness = () => {
      const dir = C.sub([2, 0], le.z), L = C.abs(dir), ux = [dir[0] / L, dir[1] / L];
      const top = Array(200).fill(-Infinity), bottom = Array(200).fill(Infinity);
      for (let i = 0; i < 8000; i++) {
        const d = C.sub(at(thetaTE + (2 * Math.PI * (i + 0.5)) / 8000), le.z);
        const s0 = (d[0] * ux[0] + d[1] * ux[1]) / L, n0 = (-d[0] * ux[1] + d[1] * ux[0]) / L;
        const k = Math.min(199, Math.max(0, Math.floor(s0 * 200)));
        top[k] = Math.max(top[k], n0); bottom[k] = Math.min(bottom[k], n0);
      }
      return Math.max(...top.map((x, k) => (Number.isFinite(x) && Number.isFinite(bottom[k]) ? x - bottom[k] : 0)));
    };
    return { a, beta, Gam, chord, surface, pressureLift, kuttaResidual, le, thickness };
  }
  /** The lumped-vortex method on n equal panels of a camber line with slope dz(x), chord 1, U = 1: the lift
   * coefficient and the moment coefficient about the quarter chord. */
  function lumpedVortex(n, alpha, dz) {
    const xv = Array.from({ length: n }, (_, i) => (i + 0.25) / n), xc = Array.from({ length: n }, (_, i) => (i + 0.75) / n);
    const A = xc.map((xi) => xv.map((xj) => 1 / (2 * Math.PI * (xi - xj))));
    const b = xc.map((xi) => alpha - dz(xi));
    // Induced downward velocity Σ Γ_j/(2π(x_i − ξ_j)) must cancel the normal component of the stream.
    const G = solveDense(A, b);
    return { cl: 2 * G.reduce((s, x) => s + x, 0), cm: -2 * G.reduce((s, g, j) => s + g * (xv[j] - 0.25), 0) };
  }

  function external(ctx) {
    const { v, tolerances: tol } = ctx;
    const alpha = v.alpha, m = v.m, eps = v.eps ?? 0;
    const kappa = 2 * m;
    const J = joukowski(eps, kappa, alpha), Arc = joukowski(0, kappa, alpha);
    const tc = J.thickness();
    const clJ = (2 * J.Gam) / J.chord; // C_l = L'/(½ρU²c) with ρ = U = 1: 2Γ/c
    const clArc = (2 * Arc.Gam) / Arc.chord;
    const clThin = 2 * Math.PI * (alpha + 2 * m);
    // Exact: cylinder forces as polynomials in G = Γ/(2πaU). Cp = 1 - (2 sin ψ + G)^2.
    // Coefficients in G of (1/π)∫ Cp sin ψ dψ and (1/π)∫ Cp cos ψ dψ over one period.
    const cpG = [[Q.ONE, Q.ZERO, q(-4)], [Q.ZERO, q(-4)], [q(-1)]]; // [coef of G^k as polynomial in s = sin ψ]
    const liftG = cpG.map((poly) => poly.reduce((acc, c, k) => Q.add(acc, Q.mul(c, periodInt(k + 1, 0))), Q.ZERO));
    const dragG = cpG.map((poly) => poly.reduce((acc, c, k) => Q.add(acc, Q.mul(c, periodInt(k, 1))), Q.ZERO));
    // L' = -½ρU² a ∮ Cp sin ψ dψ = -½ρU² a π Σ liftG_k G^k; the theorem needs exactly 2πρU²aG = ρUΓ.
    const kjOk = Q.isZero(liftG[0]) && Q.eq(Q.mul(q(-1, 2), liftG[1]), q(2)) && Q.isZero(liftG[2]);
    const dragOk = dragG.every((c) => Q.isZero(c));
    // Thin airfoil, parabolic camber line z = 4 m x(1 - x): dz/dx = 4m cos θ with x = (1 - cos θ)/2.
    const slope = P.of([0, 1]); // in units of 4m, as a polynomial in c = cos θ
    const A0 = Q.neg(halfIntPoly(slope)); // A0 = α + (this) * 4m
    const An = (k) => Q.mul(q(2), halfIntPoly(P.mul(slope, cheb(k))));
    const A1 = An(1), A2 = An(2);
    const thinOk = Q.isZero(A0) && Q.eq(A1, Q.ONE) && Q.isZero(A2);
    // Cl/π = 2A0 + A1 → 2α + 4m (A1 in units of 4m); Cm,c/4 = (π/4)(A2 − A1) → −πm.
    const clCoefM = Q.mul(q(4), A1), cmCoefM = Q.mul(Q.mul(q(1, 4), Q.sub(A2, A1)), q(4));
    // Numerical: pressure integration over the Joukowski surface, N = 64 ... 4096.
    const Ns = [16, 32, 64, 128, 256];
    const relP = Ns.map((n) => ({ n, err: Math.abs(J.pressureLift(n) - J.Gam) / Math.abs(J.Gam) }));
    const falling = relP.every((r, i) => i === 0 || r.err < relP[i - 1].err || r.err <= 1e-14);
    // Lumped vortex: flat plate (exact for every n) and the parabolic camber line.
    const dzPar = (xx) => 4 * m * (1 - 2 * xx);
    const flat = [8, 32].map((n) => Math.abs(lumpedVortex(n, alpha, () => 0).cl - 2 * Math.PI * alpha));
    const cmThin = -Math.PI * m;
    const pan = [16, 32, 64, 128].map((n) => ({ n, ...lumpedVortex(n, alpha, dzPar) }));
    const panErr = pan.map((p) => ({ n: p.n, cl: Math.abs(p.cl - clThin) / Math.abs(clThin), cm: Math.abs(p.cm - cmThin) }));
    const ordPan = order(panErr[2].cm, panErr[3].cm);
    // Overlapping approximations: thin airfoil against the exact circular arc along (α, m) = s (α0, m0).
    const path = [1, 0.5, 0.25, 0.125].map((s) => {
      const a = s * (alpha || 0.05), mm = s * (m || 0.02);
      const arc = joukowski(0, 2 * mm, a);
      const cArc = (2 * arc.Gam) / arc.chord, cThin = 2 * Math.PI * (a + 2 * mm);
      return { s, rel: Math.abs(cThin - cArc) / Math.abs(cArc) };
    });
    const ordPath = order(path[2].rel, path[3].rel);
    const thinErr = Math.abs(clThin - clArc) / Math.abs(clArc);
    // The approximation boundary: the angle where the thin-airfoil error reaches the tolerance, at this camber.
    const errAt = (a) => { const arc = joukowski(0, kappa, a); const c = (2 * arc.Gam) / arc.chord; return Math.abs(2 * Math.PI * (a + 2 * m) - c) / Math.abs(c) - tol.approximation; };
    const aBound = errAt(0.6) > 0 ? bisect(errAt, Math.max(0, -2 * m) + 1e-6, 0.6, 1e-10) : null;
    const deg = (r) => (r * 180) / Math.PI;

    const steps = [
      { id: "s-fam-potential", item: 7, title: "Potential flow and its conditions",
        reason: "Away from the thin boundary layer the flow is inviscid and has no vorticity. A velocity potential then exists, and mass conservation makes it harmonic. Bernoulli's equation gives the pressure.",
        tex: ["\\nabla^{2}\\phi=0,\\qquad \\frac{\\partial\\phi}{\\partial n}=0\\ \\text{on the surface},\\qquad \\nabla\\phi\\to U(\\cos\\alpha,\\sin\\alpha)\\ \\text{far away}", "C_p=\\frac{p-p_\\infty}{\\tfrac12\\rho U^{2}}=1-\\frac{|\\nabla\\phi|^{2}}{U^{2}}"], evidence: ["potential"] },
      { id: "s-fam-cylinder", item: 8, title: "Circular cylinder with circulation",
        reason: "The circle flow is the base solution. Its surface speed gives C_p. The integrals of C_p around the circle give zero drag and the lift ρUΓ for every circulation.",
        tex: ["\\frac{|V|}{U}=\\left|2\\sin\\psi+G\\right|,\\qquad G=\\frac{\\Gamma}{2\\pi aU},\\qquad C_p=1-\\left(2\\sin\\psi+G\\right)^{2}",
          `\\frac{1}{\\pi}\\oint C_p\\cos\\psi\\,\\mathrm d\\psi=0,\\qquad \\frac{1}{\\pi}\\oint C_p\\sin\\psi\\,\\mathrm d\\psi=${Q.tex(liftG[1])}G\\;\\Rightarrow\\;L'=\\rho U\\Gamma`], evidence: ["potential"] },
      { id: "s-fam-joukowski", item: 8, title: "Joukowski airfoil and the Kutta condition",
        reason: "The Joukowski map turns a circle through ζ = b into an airfoil with a sharp trailing edge. The Kutta condition puts a stagnation point at that edge, and this fixes the circulation.",
        tex: ["z=\\zeta+\\frac{b^{2}}{\\zeta},\\qquad \\zeta_0=b\\left(-\\varepsilon+\\mathrm i\\,2m(1+\\varepsilon)\\right),\\qquad \\Gamma=4\\pi Ua\\sin(\\alpha+\\beta)",
          `\\beta=${texNum(deg(J.beta), 4)}^{\\circ},\\qquad \\frac{t}{c}=${texNum(tc, 4)},\\qquad C_l=\\frac{2\\Gamma}{Uc}=${texNum(clJ)}`], evidence: ["joukowski"] },
      { id: "s-fam-thin", item: 8, title: "Thin-airfoil theory",
        reason: "For a thin airfoil at a small angle, a vortex sheet on the chord line represents the airfoil. The Fourier coefficients of the camber-line slope give the lift and the moment.",
        tex: ["\\frac{\\mathrm dz_c}{\\mathrm dx}=4m(1-2x)=4m\\cos\\theta,\\qquad x=\\tfrac12(1-\\cos\\theta)",
          "A_0=\\alpha-\\frac1\\pi\\int_0^\\pi\\frac{\\mathrm dz_c}{\\mathrm dx}\\mathrm d\\theta=\\alpha,\\qquad A_1=\\frac2\\pi\\int_0^\\pi\\frac{\\mathrm dz_c}{\\mathrm dx}\\cos\\theta\\,\\mathrm d\\theta=4m,\\qquad A_2=0",
          `C_l=\\pi(2A_0+A_1)=2\\pi(\\alpha+2m)=${texNum(clThin)},\\qquad \\alpha_{L0}=-2m,\\qquad C_{m,c/4}=\\frac\\pi4(A_2-A_1)=-\\pi m`], evidence: ["thin-airfoil"] },
      { id: "s-fam-panels", item: 10, title: "Numerical procedure: pressure integration and vortex panels",
        reason: "The page integrates the surface pressure of the Joukowski airfoil with the midpoint rule. It also solves the lumped-vortex method on the camber line, with a vortex at 1/4 and a collocation point at 3/4 of each panel.",
        tex: [`N=${Ns.join(",\\,")}:\\qquad \\frac{|L'_p-\\rho U\\Gamma|}{\\rho U\\Gamma}=${relP.map((r) => texNum(r.err, 2)).join(",\\,")}`,
          `\\text{panels }${pan.map((p) => p.n).join(",\\,")}:\\qquad \\left|C_{m,N}-C_{m,c/4}\\right|=${panErr.map((p) => texNum(p.cm, 2)).join(",\\,")}`], evidence: ["vortex-panel"] },
      { id: "s-fam-limits", item: 8, title: "Approximation boundary and viscous limits",
        reason: "The exact circular-arc solution and thin-airfoil theory overlap at small angles and small camber. Their difference measures the error of the linearization. Viscous effects set further limits that potential flow cannot show.",
        tex: [`\\frac{|C_{l,\\mathrm{thin}}-C_{l,\\mathrm{arc}}|}{C_{l,\\mathrm{arc}}}=${texNum(thinErr, 3)},\\qquad \\text{tolerance } ${tol.approximation}${aBound ? `\\ \\text{reached at } \\alpha=${texNum(deg(aBound.x), 4)}^{\\circ}` : ""}`], evidence: ["viscous-limits"] },
    ];
    const checks = [
      { id: "dalembert", status: dragOk ? "exact" : "unresolved", passed: dragOk, title: "The pressure on the cylinder gives zero drag exactly, for every circulation (d'Alembert's paradox).", tex: "\\oint C_p\\cos\\psi\\,\\mathrm d\\psi=0", evidence: ["potential"], steps: ["s-fam-cylinder"] },
      { id: "kutta-joukowski", status: kjOk ? "exact" : "unresolved", passed: kjOk, title: "The pressure on the cylinder gives the lift L' = ρUΓ exactly, for every circulation (Kutta–Joukowski theorem).", tex: "-\\tfrac12\\rho U^{2}a\\oint C_p\\sin\\psi\\,\\mathrm d\\psi=2\\pi\\rho U^{2}aG=\\rho U\\Gamma", evidence: ["potential"], steps: ["s-fam-cylinder"] },
      { id: "thin", status: thinOk ? "exact" : "unresolved", passed: thinOk, title: `The Fourier coefficients of the parabolic camber line are exact: A₀ = α, A₁ = 4m and A₂ = 0. Thus C_l = 2πα + ${Q.str(clCoefM)}πm and C_m,c/4 = ${Q.eq(cmCoefM, q(-1)) ? "−" : Q.str(cmCoefM)}πm.`, tex: "C_l=2\\pi\\alpha+4\\pi m,\\qquad C_{m,c/4}=-\\pi m", evidence: ["thin-airfoil"], steps: ["s-fam-thin"] },
      { id: "kutta", status: "numerical", passed: J.kuttaResidual <= tol.root, title: `The Kutta condition holds: the velocity on the circle at the trailing-edge point is ${fmt(J.kuttaResidual, 2)} of U.`, tolerance: `≤ ${tol.root}`, evidence: ["joukowski"], steps: ["s-fam-joukowski"] },
      { id: "pressure", status: "numerical", passed: relP[relP.length - 1].err <= tol.pressure && falling, title: `The surface pressure of the Joukowski airfoil integrates to the Kutta–Joukowski lift. The relative difference falls from ${fmt(relP[0].err, 2)} at N = ${Ns[0]} to ${fmt(relP[relP.length - 1].err, 2)} at N = ${Ns[Ns.length - 1]}: the midpoint rule on a smooth periodic integrand converges faster than any power of N.`, tolerance: `relative difference ≤ ${tol.pressure} at N = ${Ns[Ns.length - 1]}`, evidence: [], steps: ["s-fam-panels"] },
      { id: "flat-plate", status: "numerical", passed: Math.max(...flat) <= 1e-10, title: `The lumped-vortex method gives the flat-plate lift 2πα for 8 and for 32 panels, with differences ${flat.map((e) => fmt(e, 2)).join(" and ")}.`, tolerance: "≤ 1e-10", evidence: ["vortex-panel"], steps: ["s-fam-panels"] },
      { id: "panels-lift", status: "numerical", passed: Math.max(...panErr.map((p) => p.cl)) <= 1e-10, title: `With the parabolic camber line, the lumped-vortex lift agrees with thin-airfoil theory for 16 to 128 panels: the largest relative difference is ${fmt(Math.max(...panErr.map((p) => p.cl)), 2)}.`, tolerance: "relative difference ≤ 1e-10", evidence: ["vortex-panel"], steps: ["s-fam-panels"] },
      { id: "panels-moment", status: "numerical", passed: panErr[3].cm <= tol.panel && Math.abs(ordPan - 2) <= tol.order, title: `The lumped-vortex moment about the quarter chord converges to −πm at order ${fmt(ordPan, 3)} (expected 2). At 128 panels the difference is ${fmt(panErr[3].cm, 2)}.`, tolerance: `difference ≤ ${tol.panel} at 128 panels, |order − 2| ≤ ${tol.order}`, evidence: ["vortex-panel"], steps: ["s-fam-panels"] },
      { id: "overlap", status: "numerical", passed: Math.abs(ordPath - 2) <= tol.order, title: `Overlapping approximations: along (α, m) = s(α₀, m₀), the difference between thin-airfoil theory and the exact circular arc falls at order ${fmt(ordPath, 3)} in s (expected 2).`, tolerance: `|order − 2| ≤ ${tol.order}`, evidence: [], steps: ["s-fam-limits"] },
      thinErr <= tol.approximation
        ? { id: "approximation", status: "numerical", passed: true, title: `At α = ${fmt(deg(alpha), 4)}°, thin-airfoil theory differs from the exact circular arc by ${fmt(thinErr * 100, 3)} %, which is inside the declared tolerance ${tol.approximation * 100} %.${aBound ? ` The tolerance is reached at α = ${fmt(deg(aBound.x), 4)}° for this camber.` : ""}`, tolerance: `relative difference ≤ ${tol.approximation}`, evidence: [], steps: ["s-fam-limits"] }
        : { id: "approximation", status: "unresolved", passed: false, title: `At α = ${fmt(deg(alpha), 4)}°, thin-airfoil theory differs from the exact circular arc by ${fmt(thinErr * 100, 3)} %, which is outside the declared tolerance ${tol.approximation * 100} %.${aBound ? ` The approximation boundary for this camber is at α = ${fmt(deg(aBound.x), 4)}°.` : ""}`, evidence: [], steps: ["s-fam-limits"], next: "Use a smaller angle of attack, or use the exact Joukowski result. Large angles also bring flow separation, which this model cannot show." },
      { id: "viscous", status: "evidence", passed: true, title: "Viscous limits: potential flow gives no drag and does not predict separation or stall. The Kutta condition stands for the effect of viscosity at the sharp trailing edge. The results apply to attached flow at high Reynolds number.", evidence: ["viscous-limits"], steps: ["s-fam-limits"] },
    ];
    const outputs = [
      { id: "Lp", label: "Lift per unit span", tex: "L'", value: 0.5 * v.rho * v.U * v.U * v.c * clJ, unit: "N/m", role: "Lp" },
      { id: "Gamma", label: "Circulation", tex: "\\Gamma", value: 0.5 * v.U * v.c * clJ, unit: "m^2/s" },
      { id: "clJ", label: "Lift coefficient, Joukowski", tex: "C_{l,J}", value: clJ, unit: "" },
      { id: "clArc", label: "Lift coefficient, circular arc", tex: "C_{l,\\mathrm{arc}}", value: clArc, unit: "" },
      { id: "clThin", label: "Lift coefficient, thin airfoil", tex: "C_{l,\\mathrm{thin}}", value: clThin, unit: "" },
      { id: "aL0", label: "Zero-lift angle", tex: "\\alpha_{L0}", value: deg(-2 * m), unit: "deg" },
      { id: "cm", label: "Moment coefficient, quarter chord", tex: "C_{m,c/4}", value: -Math.PI * m, unit: "" },
      { id: "tc", label: "Thickness ratio", tex: "t/c", value: tc, unit: "" },
    ];
    // Surface pressure against x/c.
    const surf = J.surface(240);
    const xs = surf.map((p) => p.z[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const curve = (fn) => Array.from({ length: 41 }, (_, i) => { const a = (-4 + i * 0.4) * Math.PI / 180; return [deg(a), fn(a)]; });
    const figures = [
      { id: "shape", title: "The Joukowski airfoil", caption: `Thickness ratio ${fmt(tc, 3)}, camber ratio ${fmt(m, 3)}, chord along x.`, kind: "shape", aspect: 0.3,
        series: [{ label: "surface", points: surf.map((p) => [(p.z[0] - x0) / (x1 - x0), p.z[1] / (x1 - x0)]), closed: true }] },
      { id: "cp", title: "Surface pressure coefficient", caption: "−C_p against x/c. The upper surface has the larger suction. At the trailing edge both surfaces meet: the Kutta condition.",
        x: { label: "x/c", min: 0, max: 1 }, y: { label: "−C_p" },
        series: [{ label: "surface", points: surf.map((p) => [(p.z[0] - x0) / (x1 - x0), -p.cp]), markers: true, noLine: true }] },
      { id: "lift", title: "Lift coefficient against the angle of attack", caption: "Thin-airfoil theory, the exact circular arc and the Joukowski airfoil with thickness. The marker is the current angle.",
        x: { label: "α (deg)" }, y: { label: "C_l" },
        series: [{ label: "thin airfoil", points: curve((a) => 2 * Math.PI * (a + 2 * m)), dash: true },
          { label: "circular arc", points: curve((a) => { const s = joukowski(0, kappa, a); return (2 * s.Gam) / s.chord; }) },
          { label: "Joukowski", points: curve((a) => { const s = joukowski(eps, kappa, a); return (2 * s.Gam) / s.chord; }) }],
        marks: [{ x: deg(alpha), y: clJ, label: "current" }] },
    ];
    return { steps, checks, outputs, figures, table: pan.map((p, i) => ({ panels: String(p.n), "C_l": fmt(p.cl, 8), "C_m,c/4": fmt(p.cm, 8), "moment difference": fmt(panErr[i].cm, 3) })),
      exact: { A0: Q.str(A0), A1: Q.str(A1), A2: Q.str(A2), liftG: liftG.map(Q.str), dragG: dragG.map(Q.str) },
      key: `C_l = ${fmt(clJ, 5)} (Joukowski), ${fmt(clThin, 5)} (thin airfoil)` };
  }

  /* ======================================================================================================== */
  /* The declared models for the Regime Map Builder (src/regime.js IMPLS)                                      */
  /* ======================================================================================================== */

  /** Tolerances of the declarations (data/catalogue.json, acceptance and solver). */
  const TOL = { fv: 1e-3, order: 0.3, dissipation: 0.01, root: 1e-12, conservation: 1e-10, reference: 1e-9, integral: 1e-9, remainder: 0.01, pressure: 1e-12, panel: 1e-4, approximation: 0.01 };
  const num = (x) => (Number.isFinite(x) ? Number(x.toPrecision(12)) : null);
  const memo = new Map();
  /** Run a family solver once for each set of inputs. */
  function solve(id, input) {
    const key = JSON.stringify([id, input.case ?? "", input.v, Object.fromEntries(Object.entries(input.x ?? {}).map(([k, x]) => [k, x ? Q.str(x) : null]))]);
    if (!memo.has(key)) {
      if (memo.size > 60) memo.clear();
      memo.set(key, RUN[id]({ tolerances: TOL, x: {}, ...input }));
    }
    return memo.get(key);
  }
  /** The record's value of each role: floats in v, exact rationals (or null) in x. */
  function values(ctx, roles) {
    const v = {}, x = {};
    for (const [k, role] of Object.entries(roles)) {
      const r = ctx?.role ? ctx.role(role) : null;
      if (!r) continue;
      v[k] = r.float;
      x[k] = r.exact && typeof r.exact === "object" ? r.exact : typeof r.exact === "string" ? Q.parse(r.exact) : null;
    }
    return { v, x };
  }
  const missing = (v, keys) => keys.filter((k) => !Number.isFinite(v[k]));
  const noBalance = (intro, terms = []) => ({ intro, terms, balances: [], crossovers: [], note: "A balance crossover is a comparison of terms. It is not a transition." });
  const noAsymptotic = (why) => ({ limits: [], overlap: why, gaps: "None: the page uses the declared solution at every point." });
  /** An acceptance check from a solver check: exact and numerical ones only; claims and limits go to the panel. */
  const acceptOf = (c) => ({ id: c.id, title: c.title.replace(/\.$/, ""), passed: Boolean(c.passed), status: c.status === "unresolved" ? "exact" : c.status, tolerance: c.tolerance ?? null, detail: c.tolerance ? `Tolerance: ${c.tolerance}.` : "Exact arithmetic." });
  const isCheck = (c) => (c.status === "exact" || c.status === "numerical") && c.limitation !== true;
  /** The generic panel (src/stabview.js) of a family solver's output. */
  function panel(decl, out, opts) {
    const figures = (out.figures ?? []).filter((f) => f.series && f.kind !== "bands" && f.kind !== "table").map((f) => {
      const all = f.series.flatMap((s) => s.points);
      const xs = all.map((p) => p[0]).filter(Number.isFinite), ys = all.map((p) => p[1]).filter(Number.isFinite);
      const pad = (lo, hi) => { const d = (hi - lo) || 1; return [lo - 0.04 * d, hi + 0.04 * d]; };
      const [x0, x1] = f.x?.min !== undefined && f.x?.max !== undefined ? [f.x.min, f.x.max] : pad(Math.min(...xs), Math.max(...xs));
      const [y0, y1] = f.y?.min !== undefined && f.y?.max !== undefined ? [f.y.min, f.y.max] : pad(f.y?.min ?? Math.min(...ys), Math.max(...ys));
      return { id: `st-fl-${decl.id}-${f.id}`, title: f.title, caption: f.caption,
        x: { min: x0, max: x1, label: f.x?.label ?? "x", log: Boolean(f.x?.log) }, y: { min: y0, max: y1, label: f.y?.label ?? "y", log: Boolean(f.y?.log) },
        series: f.series.map((s) => ({ label: s.label, pts: s.points.map(([a, b]) => [num(a), num(b)]), dash: s.dash ? "6 4" : null })),
        points: (f.marks ?? []).filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y)).map((m) => ({ x: num(m.x), y: num(m.y), shape: "circle", r: 4, label: m.label })) };
    });
    const tables = [];
    if (out.outputs?.length) tables.push({ title: "Results at the record's values", columns: ["Quantity", "Symbol", "Value", "Unit"], rows: out.outputs.map((o) => [o.label, o.tex.replace(/\\[a-z]+\{?|[{}]/g, "").replace(/_/g, ""), o.exact ? `${o.exact} = ${fmt(o.value)}` : fmt(o.value), o.unit || "–"]) });
    if (out.table?.length) tables.push({ title: opts.tableTitle, columns: Object.keys(out.table[0]), rows: out.table.map((r) => Object.values(r).map(String)) });
    if (out.domain?.length) tables.push({ title: "Domain convergence", columns: Object.keys(out.domain[0]), rows: out.domain.map((r) => Object.values(r).map(String)) });
    const results = out.checks.filter((c) => !isCheck(c)).map((c) => ({ id: `r-st-fl-${c.id}`, kind: opts.kind, title: c.title, status: c.status, tolerance: c.tolerance ?? null, next: c.next ?? "",
      steps: [opts.step], evidence: c.evidence?.length ? c.evidence : ["spec-10"] }));
    return { family: decl.family, model: decl.id, generic: true, heading: opts.heading, point: opts.point ?? {}, concept: opts.concept,
      results, figures, tables, method: out.steps.map((s) => `${s.title}: ${s.reason}`), displays: out.steps.map((s) => ({ title: `Hand calculation ${s.item}: ${s.title}`, tex: s.tex })) };
  }

  /* ---------- internal viscous flow ---------- */

  function internalImpl(decl) {
    const pipe = decl.id === "pipe-poiseuille";
    const len = pipe ? "R" : "b";
    const c = pipe ? 8 : 12; // dissipation over wall heat = c·Br
    const params = decl.domain.parameters;
    const run = (ctx) => {
      const { v } = values(ctx, { mu: "mu", rho: "rho", um: "u_m", L: len, k: "k", cp: "c_p", qw: "q_w" });
      const lack = missing(v, ["mu", "rho", "um", "L", "k", "cp", "qw"]);
      if (lack.length) return { lack };
      return solve("internal-viscous-flow", { case: pipe ? "pipe" : "channel", v: { mu: v.mu, rho: v.rho, um: v.um, k: v.k, cp: v.cp, qw: v.qw, [pipe ? "D" : "H"]: 2 * v.L } });
    };
    const layers = [{ id: "dissipation", kind: "approximation", boundary: "approximation", title: "Viscous heating neglected", measure: "dissipation", scale: "log", status: "exact", hue: "dissipation",
      criterion: `${c}Br: the viscous heating over the wall heat, from the exact profile, at most the tolerance`, steps: ["s-rm-map"], evidence: ["spec-9"],
      thresholds: (tol) => ({ curves: [{ value: tol, label: `Viscous heating = ${tol} of the wall heat` }], regions: [{ id: "meets", label: "Viscous heating is below the tolerance: the declared model holds", lo: 0, hi: tol }] }) }];
    const approximations = [{ id: "dissipation", label: "No viscous heating", tex: "Br\\to0", limit: "Br → 0", why: "The declared energy equation leaves out the viscous heating.", error: `${c}Br, exact from the Poiseuille profile` }];
    return { id: decl.id, params, axes: { x: "Br", y: null }, approximations, layers,
      evaluate: (p) => (p.Br > 0 ? { ok: true, values: { dissipation: c * p.Br } } : { ok: false, reason: "Br must be positive." }),
      limits: () => [],
      inspect: (p, ctx) => ({ ok: true, values: [{ id: "Br", tex: "Br", label: "Brinkman number", value: num(p.Br) }, { id: "dissipation", tex: `${c}Br`, label: "viscous heating over the wall heat", value: num(c * p.Br) }],
        checks: [], reconstruction: ctx?.reconstruct ? [ctx.reconstruct("P", pipe ? 8 : 3), ctx.reconstruct("Sb", pipe ? 2 : 1), ctx.reconstruct("Nu", pipe ? 48 / 11 : 140 / 17)].filter(Boolean) : [] }),
      derived: () => [{ id: "P", tex: "P", label: "dimensionless pressure gradient, from the mean velocity", value: pipe ? 8 : 3 }, { id: "Sb", tex: "S", label: "dimensionless temperature rise, from the energy balance", value: pipe ? 2 : 1 },
        { id: "fRe", tex: "f\\,Re", label: "friction factor times Reynolds number", value: pipe ? 64 : 96 }, { id: "Nu", tex: "Nu", label: "Nusselt number", value: num(pipe ? 48 / 11 : 140 / 17) }],
      constraints: (p) => (p.Re > 2000 ? [`Re = ${fmt(p.Re)}: the declared model assumes laminar flow and does not predict transition. Check that the flow is laminar.`] : []),
      analysis: () => ({ note: "The fully developed flow has an exact polynomial solution. The map shows where the viscous heating, which the model leaves out, stays below the tolerance.",
        balance: { intro: "The energy balance of a slice of the flow has two heat inputs: the wall heat and the viscous heating.",
          terms: [{ tex: "q_w\\,\\mathcal P", label: "wall heat per unit length", scale: "q_w D_h", why: "The heat flux over the wetted perimeter." }, { tex: "G\\,u_m A", label: "viscous heating per unit length", scale: "G u_m A", why: "The work of the pressure gradient on the flow, which friction turns into heat." }],
          balances: [{ title: "Wall heat only", when: `${c}Br\\ll1`, derivation: `The ratio of the two terms is G u_m D_h/(4q_w) = ${c}Br with the exact P = ${pipe ? 8 : 3}.`, reduced: pipe ? "\\theta''+\\theta'/X=S\\,U" : "\\theta''=S\\,U", neglected: "viscous heating", assumptions: ["Br small."],
            residual: { tex: `${c}Br`, order: "first order in Br", status: "exact", note: "The neglected heating is exactly this fraction of the wall heat." } }],
          crossovers: [{ criterion: `${c}Br=1`, status: "exact", text: "The viscous heating equals the wall heat." }], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: noAsymptotic("The fully developed solution is exact, so no approximation needs a limit.") }),
      acceptance: (ctx) => { const out = run(ctx); return out.lack ? [{ id: "values", title: `The record has no value for ${out.lack.join(", ")}`, passed: false, status: "exact", detail: "Enter the values of the standard example." }] : out.checks.filter(isCheck).map(acceptOf); },
      stability: (p, ctx) => { const out = run(ctx); return out.lack ? null : panel(decl, out, { kind: "solution", step: "s-fl-solution", heading: "Hand calculation 10: the declared solution and its reference checks", concept: "fully developed laminar flow with an exact polynomial solution", point: { Br: num(p.Br) }, tableTitle: "Finite-volume convergence of the Nusselt number" }); } };
  }

  /* ---------- compressible nozzle ---------- */

  function nozzleImpl(decl) {
    const params = decl.domain.parameters;
    const g = gas(1.4);
    const crit = (eps) => ({ p1: g.pRatio(g.mach(eps, "sub").x), p3: g.pRatio(g.mach(eps, "sup").x) });
    const run = (ctx) => {
      const { v } = values(ctx, { p0: "p_0", T0: "T_0", R: "R_g", At: "A_t", Ae: "A_e", Ai: "A_i", pb: "p_b" });
      const lack = missing(v, ["p0", "T0", "R", "At", "Ae", "pb"]);
      if (lack.length) return { lack };
      return solve("compressible-nozzle", { v: { gamma: 1.4, R: v.R, p0: v.p0, T0: v.T0, At: v.At, Ai: v.Ai ?? 3 * v.At, Ae: v.Ae, pb: v.pb }, x: { gamma: q(7, 5) } });
    };
    const layers = [
      { id: "choking", kind: "bifurcation", boundary: "bifurcation", title: "Sonic throat", measure: "sub", scale: "log", status: "exact", hue: "choking",
        criterion: "p_b/p₀ against the first critical ratio p_e,sub/p₀: below it the throat is sonic and the subsonic and supersonic branches of the area–Mach relation meet there (the fold at M = 1)", steps: ["s-st-fold"], evidence: ["nasa-choking"],
        thresholds: () => ({ curves: [{ value: 1, label: "The first critical ratio: the throat becomes sonic" }], regions: [{ id: "choked", label: "Choked: the throat is sonic and ṁ is at its maximum", lo: 0, hi: 1 }, { id: "subsonic", label: "Subsonic everywhere: ṁ is below the maximum", lo: 1, hi: null }] }) },
      { id: "design", kind: "balance", boundary: "balance-crossover", title: "Exit pressure against back pressure", measure: "sup", scale: "log", status: "exact", hue: "design",
        criterion: "p_b/p₀ against the design ratio p_e,sup/p₀: the isentropic exit pressure equals the back pressure on the curve", steps: ["s-rm-map"], evidence: ["nasa-choking"],
        thresholds: () => ({ curves: [{ value: 1, label: "Design: the exit pressure equals the back pressure" }], regions: [{ id: "under", label: "Underexpanded: the jet expands further outside the nozzle", lo: 0, hi: 1 }, { id: "over", label: "Above the design ratio", lo: 1, hi: null }] }) },
    ];
    return { id: decl.id, params, axes: { x: "eps", y: "pb" }, approximations: [], layers,
      evaluate: (p) => {
        if (!(p.eps > 1) || !(p.pb > 0 && p.pb < 1)) return { ok: false, reason: "The area ratio must be above 1, and the back-pressure ratio between 0 and 1." };
        const { p1, p3 } = crit(p.eps);
        if (p.pb > p3 * (1 + 1e-12) && p.pb < p1 * (1 - 1e-12)) return { ok: false, reason: "Shock range: a shock stands in the nozzle or in the jet. Shocks need a separate declaration." };
        return { ok: true, values: { sub: p.pb / p1, sup: p.pb / p3 } };
      },
      limits: () => [],
      inspect: (p, ctx) => {
        const { p1, p3 } = crit(p.eps);
        const choked = p.pb <= p1;
        const Me = choked ? g.mach(p.eps, "sup").x : Math.sqrt(5 * (Math.pow(1 / p.pb, 2 / 7) - 1));
        const phi = choked ? Math.sqrt(1.4) * Math.pow(5 / 6, 3) : Math.sqrt(1.4) * p.eps * g.flux(Me);
        return { ok: true, values: [{ id: "p1", tex: "p_{e,\\mathrm{sub}}/p_0", label: "first critical ratio", value: num(p1) }, { id: "p3", tex: "p_{e,\\mathrm{sup}}/p_0", label: "design ratio", value: num(p3) },
          { id: "Me", tex: "M_e", label: "exit Mach number", value: num(Me) }, { id: "m", tex: "\\Phi", label: "mass-flow parameter ṁ√(R_gT₀)/(p₀A_t)", value: num(phi) }],
          checks: [], reconstruction: ctx?.reconstruct ? [ctx.reconstruct("m", phi)].filter(Boolean) : [] };
      },
      derived: (p) => { const { p1, p3 } = crit(p.eps); return [{ id: "p1", tex: "p_{e,\\mathrm{sub}}/p_0", label: "first critical ratio", value: num(p1) }, { id: "p3", tex: "p_{e,\\mathrm{sup}}/p_0", label: "design ratio", value: num(p3) }, { id: "phi", tex: "\\Phi_{\\max}", label: "choked mass-flow parameter", value: num(Math.sqrt(1.4) * Math.pow(5 / 6, 3)) }]; },
      constraints: () => ["The declaration fixes γ = 7/5 (air)."],
      exactBoundaries: () => [{ layer: "choking", text: "The throat is sonic for every p_b/p₀ below the first critical ratio; the mass flow is then (ṁ√(R_gT₀)/(p₀A_t))² = 21875/46656 exactly." }],
      analysis: () => ({ note: "The back pressure and the area ratio select the flow. Between the design ratio and the first critical ratio a shock occurs, and the map shows that region as unresolved.",
        balance: noBalance("Dominant balance does not apply: every term of the quasi-one-dimensional equations is of order 1."),
        asymptotic: noAsymptotic("The quasi-one-dimensional model is the declared model; it has no small parameter of its own.") }),
      acceptance: (ctx) => { const out = run(ctx); return out.lack ? [{ id: "values", title: `The record has no value for ${out.lack.join(", ")}`, passed: false, status: "exact", detail: "Enter the values of the standard example." }] : out.checks.filter(isCheck).map(acceptOf); },
      stability: (p, ctx) => { const out = run(ctx); return out.lack ? null : panel(decl, out, { kind: "bifurcation", step: "s-st-fold", heading: "Hand calculation 9: the two branches of the area–Mach relation and the sonic throat", concept: "branches of the steady solutions: the subsonic and supersonic branches meet at a fold at M = 1", point: { eps: num(p.eps), pb: num(p.pb) }, tableTitle: "The flow along the nozzle" }); } };
  }

  /* ---------- free-surface flow ---------- */

  function shallowImpl(decl) {
    const params = decl.domain.parameters;
    const ratio = (F) => (Math.sqrt(1 + 8 * F) - 1) / 2;
    const conditions = [{ at: "x = 0", atVar: "x" }, { at: "x = 0", atVar: "x" }];
    const run = (ctx) => {
      const { v, x } = values(ctx, { g: "g", q: "q", h1: "h_1" });
      const lack = missing(v, ["g", "q", "h1"]);
      if (lack.length) return { lack };
      return solve("free-surface-flow", { v, x, conditions });
    };
    const layers = [{ id: "critical", kind: "bifurcation", boundary: "bifurcation", title: "Critical inflow", measure: "F", scale: "log", status: "exact", hue: "critical",
      criterion: "Fr₁² = 1: the subcritical and the supercritical depth of one specific energy meet at the critical depth (the fold of E(h)); a jump needs Fr₁² > 1", steps: ["s-st-fold"], evidence: ["jump"],
      thresholds: () => ({ curves: [{ value: 1, label: "Fr₁ = 1: critical flow" }], regions: [{ id: "sub", label: "Subcritical inflow: no jump", lo: 0, hi: 1 }, { id: "super", label: "Supercritical inflow: a jump to the conjugate depth", lo: 1, hi: null }] }) }];
    return { id: decl.id, params, axes: { x: "F", y: null }, approximations: [], layers,
      evaluate: (p) => (p.F > 0 ? { ok: true, values: { F: p.F, r: ratio(p.F) } } : { ok: false, reason: "Fr₁² must be positive." }),
      limits: () => [],
      inspect: (p, ctx) => {
        const r = ratio(p.F), loss = (r - 1) ** 3 / (4 * r);
        return { ok: true, values: [{ id: "r", tex: "h_2/h_1", label: "conjugate depth ratio", value: num(r) }, { id: "loss", tex: "\\Delta E/h_1", label: "energy loss over the inflow depth", value: num(loss) }, { id: "Fr2", tex: "Fr_2^{2}", label: "square of the outflow Froude number", value: num(p.F / r ** 3) }],
          checks: [], reconstruction: ctx?.reconstruct ? [ctx.reconstruct("r", r)].filter(Boolean) : [] };
      },
      derived: (p) => [{ id: "r", tex: "h_2/h_1", label: "conjugate depth ratio", value: num(ratio(p.F)) }],
      constraints: (p) => (p.F < 1 ? ["The inflow is subcritical: no hydraulic jump is possible, and the conjugate root is not a physical depth."] : []),
      exactBoundaries: () => [{ layer: "critical", text: "Fr₁² = 1 exactly: at the critical depth dE/dh = 1 − Fr² = 0." }],
      analysis: () => ({ note: "Fr₁ decides the flow: a supercritical inflow can jump to its subcritical conjugate depth, a subcritical inflow cannot.",
        balance: noBalance("Dominant balance does not apply: the steady long-wave equations keep every term."),
        asymptotic: noAsymptotic("The shallow-water equations are the declared long-wave model; the page computes no correction to it.") }),
      acceptance: (ctx) => { const out = run(ctx); return out.lack ? [{ id: "values", title: `The record has no value for ${out.lack.join(", ")}`, passed: false, status: "exact", detail: "Enter the values of the standard example." }] : out.checks.filter(isCheck).map(acceptOf); },
      stability: (p, ctx) => { const out = run(ctx); return out.lack ? null : panel(decl, out, { kind: "bifurcation", step: "s-st-fold", heading: "Hand calculation 9: the two depth branches, the critical depth and the jump", concept: "branches of the steady depths: the subcritical and supercritical depths of one specific energy meet at a fold at the critical depth", point: { F: num(p.F) }, tableTitle: "Depths" }); } };
  }

  /* ---------- boundary layers ---------- */

  function blasiusImpl(decl, refs) {
    const params = decl.domain.parameters;
    const DSTAR = 1.7207876575205;
    const run = (ctx) => {
      const { v } = values(ctx, { U: "U", nu: "nu", rho: "rho", L: "L" });
      const lack = missing(v, ["U", "nu", "L"]);
      if (lack.length) return { lack };
      const rho = Number.isFinite(v.rho) ? v.rho : 1;
      return solve("boundary-layer", { v: { U: v.U, rho, mu: v.nu * rho, x: v.L }, refs: ctx?.flows ?? refs ?? null });
    };
    const layers = [{ id: "bl", kind: "approximation", boundary: "approximation", title: "Boundary-layer approximation", measure: "rem", scale: "log", status: "numerical", hue: "bl",
      criterion: "The estimated remainder δ*/x = 1.7208/√Re, the relative size of the displacement correction, at most the tolerance (an estimate, not a proved bound)", steps: ["s-rm-asymptotic"], evidence: ["mit-bl"],
      thresholds: (tol) => ({ curves: [{ value: tol, label: `δ*/x = ${tol}` }], regions: [{ id: "meets", label: "The boundary-layer approximation meets the tolerance", lo: 0, hi: tol }] }) }];
    const approximations = [{ id: "bl", label: "Boundary-layer equations", tex: "Re\\to\\infty", limit: "Re → ∞ with x fixed", why: "The inner scale δ = L Re^(−1/2) makes the neglected terms of relative size Re^(−1); the displacement correction is of size Re^(−1/2).", error: "δ*/x = 1.7208/√Re (estimated remainder)" }];
    return { id: decl.id, params, axes: { x: "Re", y: null }, approximations, layers,
      evaluate: (p) => (p.Re > 0 ? { ok: true, values: { rem: DSTAR / Math.sqrt(p.Re) } } : { ok: false, reason: "Re must be positive." }),
      limits: (p) => [{ id: "re", label: "Re → ∞: the boundary-layer limit", coupled: false, approx: "bl", note: "The remainder falls as Re^(−1/2).", points: Array.from({ length: 21 }, (_, i) => ({ ...p, Re: 10 ** (2 + i * 0.25) })) }],
      inspect: (p, ctx) => {
        const s = 0.33205733621519630;
        return { ok: true, values: [{ id: "cf", tex: "c_f", label: "skin-friction coefficient 2f''(0)/√Re", value: num(2 * s / Math.sqrt(p.Re)) }, { id: "d99", tex: "\\delta_{99}/L", label: "99 % thickness over the distance", value: num(4.9099 / Math.sqrt(p.Re)) }, { id: "rem", tex: "\\delta^{*}/L", label: "estimated remainder", value: num(DSTAR / Math.sqrt(p.Re)) }],
          checks: [], reconstruction: ctx?.reconstruct ? [ctx.reconstruct("cf", s / Math.sqrt(p.Re))].filter(Boolean) : [] };
      },
      derived: (p) => [{ id: "fpp", tex: "f''(0)", label: "wall shear parameter of the Blasius solution", value: 0.332057336215 }, { id: "cf", tex: "c_f", label: "skin-friction coefficient", value: num(0.664115 / Math.sqrt(p.Re)) }],
      constraints: () => ["Laminar layer: the model does not predict transition."],
      analysis: () => ({ note: "The boundary-layer equations are the leading order of Re → ∞. The map shows where the estimated remainder δ*/x stays below the tolerance.",
        balance: { intro: "Near the plate, inertia along the plate meets viscous diffusion across it.",
          terms: [{ tex: "u\\,u_x", label: "inertia", scale: "U^{2}/L", why: "The speed U changes over the length L." }, { tex: "\\nu\\,u_{yy}", label: "viscous diffusion across the layer", scale: "\\nu U/\\delta^{2}", why: "The speed changes across the thickness δ." }, { tex: "\\nu\\,u_{xx}", label: "viscous diffusion along the plate", scale: "\\nu U/L^{2}", why: "The speed changes over L." }],
          balances: [{ title: "Inertia against diffusion across the layer", when: "\\delta=L\\,Re^{-1/2}", derivation: "U²/L ~ νU/δ² gives δ/L = Re^(−1/2); continuity gives V/U = δ/L.", reduced: "u u_x+v u_y=\\nu u_{yy}", neglected: "diffusion along the plate and the pressure change across the layer", assumptions: ["Re ≫ 1."],
            residual: { tex: "Re^{-1}", order: "relative size Re^(−1)", status: "exact", note: "The neglected terms are (δ/L)² of the kept ones: the exponent is exact." } }],
          crossovers: [], note: "A balance crossover is a comparison of terms. It is not a transition." },
        asymptotic: { limits: [{ parameter: "Re\\to\\infty", path: "Re → ∞ with x fixed", coupled: false, kind: "Leading order of a matched expansion (formal)", fixed: "the uniform outer stream", setup: "u=u_0+Re^{-1/2}u_1+\\dots",
          orders: [{ n: 0, equation: "f'''+\\tfrac12ff''=0", conditions: ["f(0)=f'(0)=0", "f'(\\infty)=1"], result: "f''(0)=0.332057336" }, { n: 1, equation: "\\text{displacement correction}", conditions: ["\\text{outer flow over the displacement thickness}"], result: "\\delta^{*}/x=1.7208\\,Re_x^{-1/2}\\ \\text{(estimate)}" }],
          orderLoss: "The reduced equations lose the second derivative in x and the condition far downstream; the leading-edge condition replaces it. Near the leading edge the full equations apply.",
          error: { formal: "The neglected terms have the relative size Re^(−1).", estimated: "The displacement correction has the relative size δ*/x = 1.7208/√Re_x.", proved: "none for this limit." },
          validity: "Re_x ≫ 1 and a laminar layer; the map draws the boundary where the estimated remainder meets the tolerance." }],
          overlap: "The inner solution tends to the outer stream as η → ∞: f' → 1 to machine precision at η = 12.", gaps: "The leading edge, where Re_x is of order 1, needs the full equations." } }),
      acceptance: (ctx) => { const out = run(ctx); return out.lack ? [{ id: "values", title: `The record has no value for ${out.lack.join(", ")}`, passed: false, status: "exact", detail: "Enter the values of the standard example." }] : out.checks.filter(isCheck).map(acceptOf); },
      stability: (p, ctx) => { const out = run(ctx); return out.lack ? null : panel(decl, out, { kind: "solution", step: "s-fl-solution", heading: "Hand calculation 10: the Blasius solution and its reference checks", concept: "the similarity solution of the laminar boundary layer, computed by shooting", point: { Re: num(p.Re) }, tableTitle: "Step convergence of f''(0)" }); } };
  }

  /* ---------- external aerodynamic flow ---------- */

  function airfoilImpl(decl) {
    const params = decl.domain.parameters;
    const arcCl = (alpha, m) => { const s = joukowski(0, 2 * m, alpha); return (2 * s.Gam) / s.chord; };
    const run = (ctx) => {
      const { v } = values(ctx, { U: "U", rho: "rho", c: "c", alpha: "alpha", m: "m", eps: "epsilon" });
      const lack = missing(v, ["U", "c", "alpha", "m"]);
      if (lack.length) return { lack };
      return solve("external-potential-flow", { v: { U: v.U, rho: Number.isFinite(v.rho) ? v.rho : 1.225, c: v.c, alpha: v.alpha, m: v.m, eps: Number.isFinite(v.eps) ? v.eps : 0 } });
    };
    const layers = [{ id: "thin", kind: "approximation", boundary: "approximation", title: "Thin-airfoil theory", measure: "err", scale: "log", status: "numerical", hue: "thin",
      criterion: "|c_l,thin − c_l,arc| / |c_l,arc|: thin-airfoil theory against the exact circular-arc solution of the same camber, at most the tolerance", steps: ["s-rm-asymptotic"], evidence: ["thin-airfoil"],
      thresholds: (tol) => ({ curves: [{ value: tol, label: `Thin-airfoil error = ${tol}` }], regions: [{ id: "meets", label: "Thin-airfoil theory meets the tolerance", lo: 0, hi: tol }] }) }];
    const approximations = [{ id: "thin", label: "Thin-airfoil theory", tex: "c_l=2\\pi(\\alpha+2m)", limit: "α, m, ε → 0", why: "A vortex sheet on the chord line replaces the airfoil; the error is of second order in α and m.", error: "relative difference from the exact circular arc" }];
    return { id: decl.id, params, axes: { x: "alpha", y: "m" }, approximations, layers,
      evaluate: (p) => {
        const cArc = arcCl(p.alpha, p.m);
        if (Math.abs(cArc) < 0.01) return { ok: false, reason: "Near zero lift (|c_l| < 0.01) the relative error is not defined." };
        return { ok: true, values: { err: Math.abs(2 * Math.PI * (p.alpha + 2 * p.m) - cArc) / Math.abs(cArc), cl: cArc } };
      },
      limits: (p) => [{ id: "small", label: "α, m → 0 together: thin-airfoil limit", coupled: true, approx: "thin", note: "Angle and camber fall together; the error falls as their square.", points: Array.from({ length: 11 }, (_, i) => ({ ...p, alpha: p.alpha * (1 - i / 10.5), m: p.m * (1 - i / 10.5) })) }],
      inspect: (p, ctx) => {
        const J = joukowski(p.eps, 2 * p.m, p.alpha), cl = (2 * J.Gam) / J.chord;
        return { ok: true, values: [{ id: "clJ", tex: "c_{l,J}", label: "lift coefficient of the Joukowski airfoil", value: num(cl) }, { id: "clArc", tex: "c_{l,\\mathrm{arc}}", label: "lift coefficient of the circular arc", value: num(arcCl(p.alpha, p.m)) }, { id: "clThin", tex: "c_{l,\\mathrm{thin}}", label: "thin-airfoil lift coefficient", value: num(2 * Math.PI * (p.alpha + 2 * p.m)) }],
          checks: [], reconstruction: ctx?.reconstruct ? [ctx.reconstruct("Cl", cl)].filter(Boolean) : [] };
      },
      derived: (p) => [{ id: "aL0", tex: "\\alpha_{L0}", label: "zero-lift angle −2m (rad)", value: num(-2 * p.m) }, { id: "cm", tex: "c_{m,c/4}", label: "moment coefficient about the quarter chord", value: num(-Math.PI * p.m) }],
      constraints: (p) => (p.alpha > 0.2 ? ["At large angles real airfoils stall. Potential flow does not show separation."] : []),
      analysis: () => ({ note: "Thin-airfoil theory linearizes the exact potential flow in angle, camber and thickness. The map compares it with the exact circular arc.",
        balance: noBalance("Dominant balance does not apply: potential flow has the Laplace equation only, and viscosity enters through the Kutta condition."),
        asymptotic: { limits: [{ parameter: "\\alpha,m\\to0", path: "(α, m) = s(α₀, m₀), s → 0", coupled: true, kind: "Linearization (formal)", fixed: "the shape of the camber line and zero thickness", setup: "c_l=c_l^{(1)}+O(s^{3})",
          orders: [{ n: 1, equation: "\\frac{1}{2\\pi}\\int_0^c\\frac{\\gamma(\\xi)\\,\\mathrm d\\xi}{x-\\xi}=U\\left(\\alpha-\\frac{\\mathrm dz_c}{\\mathrm dx}\\right)", conditions: ["\\gamma(c)=0\\ \\text{(Kutta)}"], result: "c_l=2\\pi(\\alpha+2m)" }],
          orderLoss: "The linearization keeps the Kutta condition and moves the surface condition to the chord line; it loses the effect of thickness on the lift.",
          error: { formal: "Second order in s: the difference from the exact circular arc falls as s².", estimated: "The relative difference from the exact circular arc at the record's point.", proved: "none for this limit." },
          validity: "Small angle, camber and thickness with attached flow; the map draws the approximation boundary where the error meets the tolerance." }],
          overlap: "Along the limit path the difference from the exact circular arc falls at order 2 in s.", gaps: "Near zero lift the relative error is not defined, and the map shows those points as unresolved." } }),
      acceptance: (ctx) => { const out = run(ctx); return out.lack ? [{ id: "values", title: `The record has no value for ${out.lack.join(", ")}`, passed: false, status: "exact", detail: "Enter the values of the standard example." }] : out.checks.filter(isCheck).map(acceptOf); },
      stability: (p, ctx) => { const out = run(ctx); return out.lack ? null : panel(decl, out, { kind: "solution", step: "s-fl-solution", heading: "Hand calculation 10: the potential-flow solutions and their reference checks", concept: "steady potential flow with the Kutta condition, and thin-airfoil theory as its limit", point: { alpha: num(p.alpha), m: num(p.m) }, tableTitle: "Lumped-vortex convergence" }); } };
  }

  const RUN = { "internal-viscous-flow": internalFlow, "compressible-nozzle": nozzle, "free-surface-flow": shallowWater, "boundary-layer": blasius, "external-potential-flow": external };
  const IMPLS = { "pipe-poiseuille": internalImpl, "channel-poiseuille": internalImpl, "nozzle-air": nozzleImpl, "shallow-water": shallowImpl, blasius: blasiusImpl, "joukowski-airfoil": airfoilImpl };
  /** The implementation of a declaration of piece 6, or null. */
  function implement(decl, options = {}) {
    const f = IMPLS[decl.id];
    return f ? f(decl, options.flows ?? null) : null;
  }

  return { implement, compute: RUN, P, QS, periodInt, halfInt, cheb, isqrt, ratSqrt, gas, joukowski, lumpedVortex, blasiusShoot, fmt, texNum };
});
