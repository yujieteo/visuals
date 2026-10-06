/* Scientific Modelling: buoyancy convection (piece 4). The Boussinesq layer between no-slip isothermal plates,
 * heated from below, in the thermal-diffusion scaling (length d, time d²/κ, temperature ΔT):
 *
 *   (1/Pr) J(ψ, ∇²ψ) = ∇⁴ψ − Ra ∂θ/∂x,    J(ψ, θ) − ∂ψ/∂x = ∇²θ,    u = ∂ψ/∂z, w = −∂ψ/∂x,
 *   ψ = ∂ψ/∂z = θ = 0 at z = ±1/2,         conductive base state u = 0, T = −z.
 *
 * Linear stability: normal modes exp(σt + iax) and Chebyshev collocation on a basis that meets the wall conditions
 * (W = (1−ξ²)²p, Θ = (1−ξ²)q, ξ = 2z), so every eigenproblem is a standard one: the neutral Rayleigh number at
 * each wavenumber, the critical point, the temporal growth rates σ and their modes. The enclosure with stress-free,
 * adiabatic side walls admits only the wavenumbers nπ/Γ. Nonlinear: steady two-dimensional rolls of one
 * horizontal period, Fourier in x (ψ odd, θ even) and the same collocation in z, solved by Newton's method and
 * followed in Ra by pseudo-arclength continuation, with the Nusselt number from the volume average and from both
 * walls. A weakly nonlinear (Landau) coefficient from the same operators classifies the onset.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./numerics.js"));
  else (root.SM = root.SM || {}).RB = factory(root.SM.NUM);
})(typeof self !== "undefined" ? self : this, function (N) {
  "use strict";

  const BINOM = [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]];
  const opCache = new Map();

  /**
   * Collocation operators on the K interior Lobatto nodes of z in [−1/2, 1/2]. W[k] maps the node values p of
   * Ψ = (1−ξ²)²p to d^kΨ/dz^k; T[k] maps q of Θ = (1−ξ²)q to d^kΘ/dz^k. wq are quadrature weights for ∫dz of a
   * function that is 0 at both walls; top and bottom evaluate the interpolant of q at ξ = 1 and ξ = −1.
   */
  function operators(K) {
    if (opCache.has(K)) return opCache.get(K);
    const all = N.lobatto(K + 1);
    const xi = all.slice(1, -1);
    const D = N.diffMatrix(xi);
    const P = [N.eye(K), D];
    for (let k = 2; k <= 4; k++) P.push(N.matmul(P[k - 1], D));
    const g = [xi.map((x) => (1 - x * x) ** 2), xi.map((x) => -4 * x * (1 - x * x)), xi.map((x) => 12 * x * x - 4), xi.map((x) => 24 * x), xi.map(() => 24)];
    const h = [xi.map((x) => 1 - x * x), xi.map((x) => -2 * x), xi.map(() => -2)];
    const build = (gg, k) => {
      let A = N.zeros(K);
      for (let j = 0; j <= k; j++) if (gg[k - j]) A = N.axpby(1, A, BINOM[k][j] * 2 ** k, N.rowScale(gg[k - j], P[j]));
      return A;
    };
    const w = xi.map((x, i) => 1 / xi.reduce((p, y, j) => (j === i ? p : p * (x - y)), 1));
    const edge = (e) => { const c = xi.map((x, j) => w[j] / (e - x)); const s = c.reduce((a, b) => a + b, 0); return c.map((v) => v / s); };
    const cc = N.ccWeights(K + 1);
    const ops = { K, xi, z: xi.map((x) => x / 2), W: [0, 1, 2, 3, 4].map((k) => build(g, k)), T: [0, 1, 2].map((k) => build(h, k)), g: g[0], h: h[0],
      wq: xi.map((_, j) => cc[j + 1] / 2), top: edge(1), bottom: edge(-1) };
    opCache.set(K, ops);
    return ops;
  }
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

  /* ---------- linear stability of the conductive state ---------- */

  /** (D² − a²)² on W and (D² − a²) on Θ. */
  const lapW2 = (o, a2) => N.axpby(1, N.axpby(1, o.W[4], -2 * a2, o.W[2]), a2 * a2, o.W[0]);
  const lapT = (o, a2) => N.axpby(1, o.T[2], -a2, o.T[0]);

  /**
   * The neutral Rayleigh number at wavenumber a for stationary modes (σ = 0): the smallest positive eigenvalue of
   * (D²−a²)²W = Ra a² Θ, (D²−a²)Θ = −W. Returns Ra with the mode W(z), Θ(z) at the nodes (max |W| = 1).
   */
  function neutral(K, a) {
    const o = operators(K), a2 = a * a;
    const Qm = N.matmul(o.T[0], N.solveMatrix(lapT(o, a2), o.W[0]));
    const M = N.solveMatrix(lapW2(o, a2), Qm.map((r) => r.map((x) => -a2 * x)));
    const ev = N.eig(M);
    if (!ev) return null;
    const best = ev.filter((e) => e.re > 0 && Math.abs(e.im) <= 1e-8 * e.re).sort((u, v) => v.re - u.re)[0];
    if (!best) return null;
    return { Ra: 1 / best.re, a, mu: best, M };
  }
  /** The neutral mode at wavenumber a: p of W and q of Θ, scaled so that max |W| = 1 and W > 0 at the centre. */
  function neutralMode(K, a) {
    const o = operators(K), nt = neutral(K, a);
    const v = N.eigvec(nt.M, nt.mu);
    const p = Float64Array.from(v.re);
    const Wv = N.matvec(o.W[0], p);
    const s = Wv.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
    for (let i = 0; i < K; i++) p[i] /= s;
    const q = N.solve(lapT(o, a * a), N.matvec(o.W[0], p).map((x) => -x));
    return { Ra: nt.Ra, p, q, W: N.matvec(o.W[0], p), Theta: N.matvec(o.T[0], q), residual: v.residual };
  }
  /** The critical point: the minimum of the neutral curve over a in [lo, hi]. */
  function critical(K, lo = 2, hi = 4.5) {
    const m = N.minimize((a) => neutral(K, a).Ra, lo, hi, { tol: 1e-10 });
    return { Ra: m.f, a: m.x };
  }
  /** The neutral curve Ra(a) at the given wavenumbers. */
  const neutralCurve = (K, as) => as.map((a) => ({ a, Ra: neutral(K, a).Ra }));

  /**
   * Temporal growth rates at (Ra, a, Pr): the eigenvalues σ of
   *   (σ/Pr)(D²−a²)W = (D²−a²)²W − Ra a² Θ,    σΘ = (D²−a²)Θ + W,
   * sorted by real part, with the leading mode and its residual ||A x − σ B x|| / ||A|| ||x||.
   */
  function growthRates(K, Ra, a, Pr) {
    const o = operators(K), a2 = a * a;
    const A = N.blocks([[lapW2(o, a2), o.T[0].map((r) => r.map((x) => -Ra * a2 * x))], [o.W[0], lapT(o, a2)]]);
    const B = N.blocks([[N.axpby(1 / Pr, o.W[2], -a2 / Pr, o.W[0]), null], [null, o.T[0]]]);
    const L = N.solveMatrix(B, A);
    const ev = N.eig(L);
    if (!ev) return null;
    const lead = ev[0];
    const v = N.eigvec(L, lead);
    return { sigma: ev, lead, residual: v.residual, mode: { p: v.re.slice(0, K), q: v.re.slice(K) } };
  }

  /** Onset in a 2D enclosure of aspect ratio Γ with stress-free adiabatic side walls: a = nπ/Γ, n = 1, 2, ... */
  function enclosureOnset(K, Gamma, nmax = 12) {
    const modes = [];
    for (let n = 1; n <= nmax; n++) {
      const a = (n * Math.PI) / Gamma;
      if (a > 40) break;
      modes.push({ n, a, Ra: neutral(K, a).Ra });
    }
    const best = modes.reduce((b, m) => (m.Ra < b.Ra ? m : b), modes[0]);
    return { Gamma, n: best.n, a: best.a, Ra: best.Ra, modes };
  }

  /* ---------- steady two-dimensional rolls ---------- */

  /**
   * The roll system at wavenumber k (period Γ = 2π/k), M Fourier modes, K nodes, Prandtl number Pr. Unknowns:
   * p_m (ψ, m = 1..M) then q_m (θ, m = 0..M), K node values each. residual(u, Ra) and jacobian(u, Ra) with the
   * extra column ∂R/∂Ra; nusselt(u) from the volume average and the walls; reynolds(u) = u_rms / Pr.
   */
  function rollSystem({ K, M, k, Pr }) {
    const o = operators(K);
    const Nx = 4 * M;
    const xs = Array.from({ length: Nx }, (_, i) => (i * 2 * Math.PI) / (k * Nx));
    const S = xs.map((x) => Array.from({ length: M }, (_, s) => Math.sin((s + 1) * k * x)));
    const C = xs.map((x) => Array.from({ length: M + 1 }, (_, m) => Math.cos(m * k * x)));
    const Ps = Array.from({ length: M }, (_, s) => xs.map((_, i) => (2 / Nx) * S[i][s]));
    const Pc = Array.from({ length: M + 1 }, (_, m) => xs.map((_, i) => ((m === 0 ? 1 : 2) / Nx) * C[i][m]));
    const n = (2 * M + 1) * K;
    const pOff = (m) => (m - 1) * K, qOff = (m) => (M + m) * K;
    const L4 = Array.from({ length: M + 1 }, (_, m) => (m ? lapW2(o, (m * k) ** 2) : null));
    const LT = Array.from({ length: M + 1 }, (_, m) => lapT(o, (m * k) ** 2));
    const lapWz = Array.from({ length: M + 1 }, (_, m) => (m ? N.axpby(1, o.W[2], -((m * k) ** 2), o.W[0]) : null));
    const lapWz1 = Array.from({ length: M + 1 }, (_, m) => (m ? N.axpby(1, o.W[3], -((m * k) ** 2), o.W[1]) : null));

    /** Mode profiles and the six grid fields of an iterate. */
    function fields(u) {
      const p = Array.from({ length: M + 1 }, (_, m) => (m ? u.subarray(pOff(m), pOff(m) + K) : null));
      const q = Array.from({ length: M + 1 }, (_, m) => u.subarray(qOff(m), qOff(m) + K));
      const prof = (A, v) => N.matvec(A, v);
      const W0 = p.map((v) => v && prof(o.W[0], v)), W1 = p.map((v) => v && prof(o.W[1], v));
      const Lx = p.map((v, m) => v && prof(lapWz[m], v)), Lz = p.map((v, m) => v && prof(lapWz1[m], v));
      const T0 = q.map((v) => prof(o.T[0], v)), T1 = q.map((v) => prof(o.T[1], v));
      const grid = () => Array.from({ length: Nx }, () => new Float64Array(K));
      const psiZ = grid(), psiX = grid(), lapX = grid(), lapZ = grid(), thX = grid(), thZ = grid();
      for (let i = 0; i < Nx; i++) for (let j = 0; j < K; j++) {
        let a = 0, b = 0, c = 0, d = 0, e = 0, f = 0;
        for (let m = 1; m <= M; m++) {
          const sn = S[i][m - 1], cs = C[i][m], mk = m * k;
          a += sn * W1[m][j]; b += mk * cs * W0[m][j]; c += mk * cs * Lx[m][j]; d += sn * Lz[m][j]; e += -mk * sn * T0[m][j];
        }
        for (let m = 0; m <= M; m++) f += C[i][m] * T1[m][j];
        psiZ[i][j] = a; psiX[i][j] = b; lapX[i][j] = c; lapZ[i][j] = d; thX[i][j] = e; thZ[i][j] = f;
      }
      return { p, q, W0, W1, T0, T1, psiZ, psiX, lapX, lapZ, thX, thZ };
    }
    const project = (P, F, j) => { let s = 0; for (let i = 0; i < Nx; i++) s += P[i] * F[i][j]; return s; };

    // Row equilibration: each equation is divided by the largest entry of its linear operator row, so the
    // residual tolerance means the same at every resolution.
    const scale = new Float64Array(n);
    for (let m = 1; m <= M; m++) for (let j = 0; j < K; j++) scale[pOff(m) + j] = 1 / Math.max(...L4[m][j].map(Math.abs));
    for (let m = 0; m <= M; m++) for (let j = 0; j < K; j++) scale[qOff(m) + j] = 1 / Math.max(...LT[m][j].map(Math.abs));

    function residual(u, Ra) {
      const R = rawResidual(u, Ra);
      for (let r = 0; r < n; r++) R[r] *= scale[r];
      return R;
    }
    function jacobian(u, Ra) {
      const J = rawJacobian(u, Ra);
      for (let r = 0; r < n; r++) { const row = J[r], s = scale[r]; for (let c = 0; c <= n; c++) row[c] *= s; }
      return J;
    }

    function rawResidual(u, Ra) {
      const F = fields(u);
      const R = new Float64Array(n);
      const N1 = F.psiZ.map((r, i) => r.map((a, j) => -(1 / Pr) * (a * F.lapX[i][j] - F.psiX[i][j] * F.lapZ[i][j])));
      const N2 = F.psiZ.map((r, i) => r.map((a, j) => -a * F.thX[i][j] + F.psiX[i][j] * F.thZ[i][j]));
      for (let m = 1; m <= M; m++) {
        const lin = N.matvec(L4[m], F.p[m]);
        for (let j = 0; j < K; j++) R[pOff(m) + j] = lin[j] + Ra * m * k * F.T0[m][j] + project(Ps[m - 1], N1, j);
      }
      for (let m = 0; m <= M; m++) {
        const lin = N.matvec(LT[m], F.q[m]);
        for (let j = 0; j < K; j++) R[qOff(m) + j] = lin[j] - (m ? m * k * F.W0[m][j] : 0) + project(Pc[m], N2, j);
      }
      return R;
    }

    /** Add ∂(projection of chi · basis ⊗ Z)/∂(unknown block) to J. */
    function addProduct(J, P, outOff, chi, basis, inModes, inOff, factor, Zop, scale) {
      const outModes = P.length;
      for (let j = 0; j < K; j++) {
        for (let mo = 0; mo < outModes; mo++) {
          const Pm = P[mo];
          const r = outOff(mo) + j;
          for (const mi of inModes) {
            let c = 0;
            for (let i = 0; i < Nx; i++) c += Pm[i] * chi[i][j] * basis(i, mi);
            c *= scale * factor(mi);
            if (c === 0) continue;
            const Z = Zop(mi)[j], col = inOff(mi), row = J[r];
            for (let jj = 0; jj < K; jj++) row[col + jj] += c * Z[jj];
          }
        }
      }
    }

    function rawJacobian(u, Ra) {
      const F = fields(u);
      const J = N.zeros(n, n + 1);
      const sinModes = Array.from({ length: M }, (_, s) => s + 1), cosModes = Array.from({ length: M + 1 }, (_, m) => m);
      for (let m = 1; m <= M; m++) {
        for (let j = 0; j < K; j++) {
          const row = J[pOff(m) + j];
          for (let jj = 0; jj < K; jj++) { row[pOff(m) + jj] += L4[m][j][jj]; row[qOff(m) + jj] += Ra * m * k * o.T[0][j][jj]; }
          row[n] = m * k * F.T0[m][j];
        }
      }
      for (let m = 0; m <= M; m++) {
        for (let j = 0; j < K; j++) {
          const row = J[qOff(m) + j];
          for (let jj = 0; jj < K; jj++) { row[qOff(m) + jj] += LT[m][j][jj]; if (m) row[pOff(m) + jj] -= m * k * o.W[0][j][jj]; }
        }
      }
      const sinB = (i, m) => S[i][m - 1], cosB = (i, m) => C[i][m];
      const one = () => 1, mk = (m) => m * k, nmk = (m) => -m * k;
      const outS = (s) => pOff(s + 1), outC = (m) => qOff(m);
      // N1 = −(1/Pr)(ψz ∇²ψx − ψx ∇²ψz)
      const s1 = -1 / Pr;
      addProduct(J, Ps, outS, F.lapX, sinB, sinModes, pOff, one, () => o.W[1], s1);
      addProduct(J, Ps, outS, F.psiZ, cosB, sinModes, pOff, mk, (m) => lapWz[m], s1);
      addProduct(J, Ps, outS, F.lapZ, cosB, sinModes, pOff, mk, () => o.W[0], -s1);
      addProduct(J, Ps, outS, F.psiX, sinB, sinModes, pOff, one, (m) => lapWz1[m], -s1);
      // N2 = −ψz θx + ψx θz
      addProduct(J, Pc, outC, F.thX, sinB, sinModes, pOff, one, () => o.W[1], -1);
      addProduct(J, Pc, outC, F.thZ, cosB, sinModes, pOff, mk, () => o.W[0], 1);
      addProduct(J, Pc, outC, F.psiZ, sinB, sinModes.filter((m) => m <= M), qOff, nmk, () => o.T[0], -1);
      addProduct(J, Pc, outC, F.psiX, cosB, cosModes, qOff, one, () => o.T[1], 1);
      return J;
    }

    /** Nusselt number: the volume average 1 + <wθ> and the two wall gradients 1 − dΘ₀/dz. */
    function nusselt(u) {
      const F = fields(u);
      let wt = 0;
      for (let m = 1; m <= M; m++) for (let j = 0; j < K; j++) wt += -(m * k / 2) * F.W0[m][j] * F.T0[m][j] * o.wq[j];
      const q0 = F.q[0];
      return { volume: 1 + wt, top: 1 + 4 * dot(o.top, q0), bottom: 1 - 4 * dot(o.bottom, q0) };
    }
    /** Reynolds number u_rms/Pr, with u_rms² = <u² + w²> in the thermal-diffusion scaling. */
    function reynolds(u) {
      const F = fields(u);
      let e = 0;
      for (let m = 1; m <= M; m++) for (let j = 0; j < K; j++) e += 0.5 * (F.W1[m][j] ** 2 + (m * k * F.W0[m][j]) ** 2) * o.wq[j];
      return Math.sqrt(e) / Pr;
    }
    /** The largest mode amplitude per Fourier mode: a spectral convergence measure. */
    const spectrum = (u) => Array.from({ length: M + 1 }, (_, m) => Math.max(m ? N.normInf(u.subarray(pOff(m), pOff(m) + K)) : 0, N.normInf(u.subarray(qOff(m), qOff(m) + K))));
    /** Temperature T = −z + θ on a uniform grid for drawing: nx × nz, walls included, by interpolation of the modes. */
    function temperature(u, nx = 96, nz = 33) {
      const F = fields(u);
      const xi = o.xi, w = xi.map((x, i) => 1 / xi.reduce((p, y, j) => (j === i ? p : p * (x - y)), 1));
      const zs = Array.from({ length: nz }, (_, j) => 0.5 - j / (nz - 1));
      // Θ_m = (1 − ξ²) q_m with q_m the polynomial through the node values.
      const theta = (m, z) => {
        const x = 2 * z;
        if (Math.abs(Math.abs(x) - 1) < 1e-14) return 0;
        const hit = xi.findIndex((y) => Math.abs(y - x) < 1e-15);
        const q = F.q[m];
        let val;
        if (hit >= 0) val = q[hit];
        else { let num = 0, den = 0; for (let j = 0; j < K; j++) { const c = w[j] / (x - xi[j]); num += c * q[j]; den += c; } val = num / den; }
        return (1 - x * x) * val;
      };
      const prof = zs.map((z) => Array.from({ length: M + 1 }, (_, m) => theta(m, z)));
      const xs = Array.from({ length: nx }, (_, i) => (i * 2 * Math.PI) / (k * nx));
      const T = xs.map((x) => zs.map((z, j) => { let t = -z; for (let m = 0; m <= M; m++) t += Math.cos(m * k * x) * prof[j][m]; return t; }));
      return { xs, zs, T };
    }
    return { n, K, M, k, Pr, pOff, qOff, scale, residual, jacobian, nusselt, reynolds, spectrum, temperature };
  }

  /** Newton at fixed Ra for the roll system (drops the ∂R/∂Ra column). */
  function solveAt(sys, u0, Ra, tol = 1e-11) {
    return N.newton((u) => sys.residual(u, Ra), (u) => sys.jacobian(u, Ra).map((r) => r.subarray(0, sys.n)), u0, { tol, maxIter: 25, stepTol: 1e-12 });
  }

  /** The first point of the roll branch: the neutral mode at wavenumber k with the amplitude of Θ₁ at the centre held fixed and Ra free. */
  function branchStart(sys, amplitude) {
    const { K, k } = sys;
    const nm = neutralMode(K, k);
    const jc = Math.floor(K / 2);
    const u1 = new Float64Array(sys.n);
    for (let j = 0; j < K; j++) { u1[sys.pOff(1) + j] = -nm.p[j] / k; u1[sys.qOff(1) + j] = nm.q[j]; }
    const qc = u1[sys.qOff(1) + jc];
    const y0 = new Float64Array(sys.n + 1);
    for (let i = 0; i < sys.n; i++) y0[i] = (amplitude / qc) * u1[i];
    y0[sys.n] = nm.Ra;
    const G = (y) => { const r = sys.residual(y.subarray(0, sys.n), y[sys.n]); const g = new Float64Array(sys.n + 1); g.set(r); g[sys.n] = y[sys.qOff(1) + jc] - amplitude; return g; };
    const GJ = (y) => { const J = sys.jacobian(y.subarray(0, sys.n), y[sys.n]); const e = new Float64Array(sys.n + 1); e[sys.qOff(1) + jc] = 1; J.push(e); return J; };
    const res = N.newton(G, GJ, y0, { tol: 1e-11, maxIter: 30, stepTol: 1e-12 });
    return { Ran: nm.Ra, u: res.x.slice(0, sys.n), Ra: res.x[sys.n], converged: res.converged, iterations: res.iterations, residual: res.residual };
  }

  /**
   * The roll branch from onset to raMax by natural-parameter continuation in Ra. The first point comes from
   * branchStart; each next point is predicted by linear extrapolation in s = √(Ra − Ra_n), which is exact to
   * first order at a pitchfork, and corrected by Newton's method; a failed correction halves the step. The
   * targets are points of the march. Returns the onset Ra_n at k and every point with Nu (volume and both
   * walls), Re, the Newton iterations and residual, and the spectral tail |mode M| / max |mode m|.
   */
  function rollBranch({ K = 16, M = 8, k = Math.PI, Pr = 1, raMax = 1e4, targets = [], amplitude = 0.02, ratio = 1.15 } = {}) {
    const sys = rollSystem({ K, M, k, Pr });
    const st = branchStart(sys, amplitude);
    if (!st.converged) return { ok: false, reason: "Newton's method did not converge at the first point of the branch.", Ran: st.Ran };
    const Ran = st.Ran;
    const wanted = [...new Set([...targets.filter((t) => t > st.Ra && t <= raMax), raMax])].sort((a, b) => a - b);
    const stops = [];
    let last = st.Ra;
    for (const t of wanted) {
      while (last * ratio < t) { last *= ratio; stops.push({ Ra: last, target: false }); }
      stops.push({ Ra: t, target: targets.includes(t) });
      last = t;
    }
    const sOf = (Ra) => Math.sqrt(Math.max(Ra - Ran, 0));
    const describe = (u, Ra, info, target) => {
      const nu = sys.nusselt(u), tail = sys.spectrum(u);
      return { Ra, target, Nu: nu.volume, NuTop: nu.top, NuBottom: nu.bottom, Re: sys.reynolds(u), amplitude: N.normInf(u.subarray(sys.qOff(1), sys.qOff(1) + K)),
        iterations: info.iterations, residual: info.residual, tail: tail[M] / Math.max(...tail) };
    };
    const sol = [{ Ra: st.Ra, u: st.u }];
    const points = [describe(st.u, st.Ra, st, false)];
    let failed = null, newtonSteps = st.iterations;
    for (let i = 0; i < stops.length && !failed; i++) {
      const goal = stops[i];
      let Ra = goal.Ra, tries = 0, done = false;
      while (!done) {
        const a = sol.at(-2) ?? null, b = sol.at(-1);
        const guess = a ? Float64Array.from(b.u, (v, j) => v + ((sOf(Ra) - sOf(b.Ra)) / (sOf(b.Ra) - sOf(a.Ra))) * (v - a.u[j])) : Float64Array.from(b.u, (v) => v * (sOf(Ra) / sOf(b.Ra)));
        const res = solveAt(sys, guess, Ra);
        newtonSteps += res.iterations;
        if (res.converged && N.normInf(res.x.subarray(sys.qOff(1), sys.qOff(1) + K)) > 0.1 * amplitude) {
          sol.push({ Ra, u: res.x });
          points.push(describe(res.x, Ra, res, Ra === goal.Ra && goal.target));
          done = Ra === goal.Ra;
          if (!done) Ra = goal.Ra;
        } else {
          if (++tries > 6) { failed = `Newton's method did not converge near Ra = ${Ra.toPrecision(5)}.`; break; }
          Ra = (Ra + b.Ra) / 2;
        }
      }
    }
    const solutions = new Map(sol.map((x) => [x.Ra, x.u]));
    return { ok: !failed, reason: failed, K, M, k, Pr, Ran, start: { Ra: st.Ra, iterations: st.iterations, residual: st.residual, amplitude },
      points, targets: points.filter((p) => p.target), newtonSteps, sys, solutions };
  }

  /** Interpolate a roll solution of one resolution onto another (more nodes, more modes). */
  function prolong(u, from, to) {
    const xa = operators(from.K).xi, xb = operators(to.K).xi;
    const w = xa.map((x, i) => 1 / xa.reduce((p, y, j) => (j === i ? p : p * (x - y)), 1));
    const interp = (vals) => xb.map((x) => {
      const hit = xa.findIndex((y) => Math.abs(y - x) < 1e-15);
      if (hit >= 0) return vals[hit];
      let num = 0, den = 0;
      for (let j = 0; j < xa.length; j++) { const c = w[j] / (x - xa[j]); num += c * vals[j]; den += c; }
      return num / den;
    });
    const out = new Float64Array(to.n);
    for (let m = 1; m <= Math.min(from.M, to.M); m++) out.set(interp(u.subarray(from.pOff(m), from.pOff(m) + from.K)), to.pOff(m));
    for (let m = 0; m <= Math.min(from.M, to.M); m++) out.set(interp(u.subarray(from.qOff(m), from.qOff(m) + from.K)), to.qOff(m));
    return out;
  }
  /** The same rolls at a finer resolution, from a coarser solution: the convergence check. */
  function refine(branch, Ra, K2, M2) {
    const fine = rollSystem({ K: K2, M: M2, k: branch.k, Pr: branch.Pr });
    const res = solveAt(fine, prolong(branch.solutions.get(Ra), branch.sys, fine), Ra);
    const nu = fine.nusselt(res.x);
    return { K: K2, M: M2, Ra, converged: res.converged, iterations: res.iterations, residual: res.residual, Nu: nu.volume, NuTop: nu.top, Re: fine.reynolds(res.x) };
  }

  /**
   * The amplitude equation at onset, from the discretized roll system R(u, Ra) = L(Ra)u + Q(u) (Q is quadratic).
   * With the null vector φ of L(Ra_n), the adjoint null vector ψ, and u = Aφ + A²u₂ + ..., the solvability
   * condition at third order gives the stationary amplitude equation
   *   g₁ (Ra − Ra_n) A + g₃ A³ = 0,   g₁ = ψᵀ ∂R/∂Ra(φ),   g₃ = 2 ψᵀ B(φ, u₂),   L u₂ = −B(φ, φ),
   * where B is the symmetric bilinear form of Q. The roll branch A² = −g₁(Ra − Ra_n)/g₃ exists above onset when
   * g₃/g₁ < 0 (supercritical pitchfork). Also the onset slope dNu/dε, ε = (Ra − Ra_n)/Ra_n, of the branch.
   */
  function amplitudeEquation(sys) {
    const Ran = neutral(sys.K, sys.k).Ra;
    const n = sys.n;
    const L = sys.jacobian(new Float64Array(n), Ran).map((r) => r.subarray(0, n));
    const Lt = Array.from({ length: n }, (_, j) => Float64Array.from(L, (r) => r[j]));
    const phi = N.eigvec(L, { re: 0, im: 0 }).re;
    const psi = N.eigvec(Lt, { re: 0, im: 0 }).re;
    const Q = (u) => { const r = sys.residual(u, Ran); const l = N.matvec(L, u); return r.map((x, i) => x - l[i]); };
    const B = (v, w) => { const s = Float64Array.from(v, (x, i) => x + w[i]); const qs = Q(s), qv = Q(v), qw = Q(w); return qs.map((x, i) => 0.5 * (x - qv[i] - qw[i])); };
    const ip = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
    // Bordered solve [[L, ψ], [φᵀ, 0]] [u₂; c] = [−B(φ, φ); 0].
    const Bpp = B(phi, phi);
    const Mb = L.map((r, i) => { const row = new Float64Array(n + 1); row.set(r); row[n] = psi[i]; return row; });
    const last = new Float64Array(n + 1); last.set(phi); Mb.push(last);
    const rhs = new Float64Array(n + 1); rhs.set(Bpp.map((x) => -x));
    const sol = N.solve(Mb, rhs);
    const u2 = sol.subarray(0, n);
    const g1 = ip(psi, sys.jacobian(phi, Ran).map((r) => r[n]));
    const g3 = 2 * ip(psi, B(phi, u2));
    // Nu − 1 = <wθ> is quadratic in u: at leading order Nu − 1 = A² (Nu(φ) − 1); with A² = −g₁(Ra − Ra_n)/g₃.
    const nuPhi = sys.nusselt(phi).volume - 1;
    const slope = Ran * nuPhi * (-g1 / g3);
    return { Ran, g1, g3, ratio: g3 / g1, supercritical: g3 / g1 < 0, solvability: ip(psi, Bpp) / (N.norm2(psi) * N.norm2(Bpp)), multiplier: sol[n], slope,
      adjointResidual: N.normInf(N.matvec(Lt, psi)) / N.normInf(psi) };
  }

  /**
   * Linear stability of a steady roll solution to disturbances of the same period and symmetry: the
   * eigenvalues σ of J v = σ B v, where B holds the time-derivative operators (1/Pr)∇² for ψ and the identity for θ.
   */
  function rollStability(sys, u, Ra) {
    const { K, M, k, Pr, scale } = sys;
    const o = operators(K);
    const J = sys.jacobian(u, Ra).map((r) => r.subarray(0, sys.n));
    const Bm = N.zeros(sys.n);
    for (let m = 1; m <= M; m++) {
      const lap = N.axpby(1 / Pr, o.W[2], -((m * k) ** 2) / Pr, o.W[0]);
      for (let j = 0; j < K; j++) { const r = sys.pOff(m) + j; for (let jj = 0; jj < K; jj++) Bm[r][sys.pOff(m) + jj] = scale[r] * lap[j][jj]; }
    }
    for (let m = 0; m <= M; m++) {
      for (let j = 0; j < K; j++) { const r = sys.qOff(m) + j; for (let jj = 0; jj < K; jj++) Bm[r][sys.qOff(m) + jj] = scale[r] * o.T[0][j][jj]; }
    }
    const ev = N.eig(N.solveMatrix(Bm, J));
    return ev ? { lead: ev[0], sigma: ev.slice(0, 6), stable: ev[0].re < 0 } : null;
  }

  /* ---------- the declared model "boussinesq-box" for the Regime Map Builder ---------- */

  /** Resolutions: the map, the linear analysis, the roll branch and its convergence check. */
  const MAP_K = 14, LIN_K = 16, ROLL = { K: 16, M: 8 }, FINE = { K: 20, M: 10 };
  /** The range of the roll branch that the acceptance test validates (Wen, Goluskin and Doering, Table 1S). */
  const RA_BRANCH_MAX = 1e4;
  const num = (x) => (Number.isFinite(x) ? Number(x.toPrecision(12)) : null);
  const memo = new Map();
  /** A cached result of a pure calculation, by key. */
  function cached(key, f) {
    if (memo.has(key)) return memo.get(key);
    const v = f();
    if (memo.size > 200) memo.clear();
    memo.set(key, v);
    return v;
  }
  /** The admissible modes a = nπ/Γ of the box with their neutral Ra, and the lowest. */
  function boxModes(Gamma, K = MAP_K) {
    return cached(`modes:${K}:${Gamma.toPrecision(12)}`, () => {
      const modes = [];
      for (let n = 1; n <= 60; n++) {
        const a = (n * Math.PI) / Gamma;
        if (a > 32 && modes.length) break;
        const nt = neutral(K, a);
        if (nt) modes.push({ n, a, Ra: nt.Ra });
      }
      const first = modes.reduce((b, m) => (m.Ra < b.Ra ? m : b), modes[0]);
      return { modes, n: first.n, a: first.a, Ra: first.Ra };
    });
  }
  const criticalAt = (K) => cached(`crit:${K}`, () => critical(K));
  /** The roll branch at (k, Pr) with the given targets, cached. */
  const branchAt = (k, Pr, targets, res = ROLL) => cached(`branch:${res.K}:${res.M}:${k.toPrecision(12)}:${Pr}:${targets.join(",")}`, () => rollBranch({ ...res, k, Pr, raMax: RA_BRANCH_MAX, targets }));

  /**
   * A continuous index of the roll branches at Ra: k − 1/2 at the k-th lowest neutral Ra of the box modes, and
   * logarithmic in Ra between them, so its level k − 1/2 is exactly the k-th branch point.
   */
  function branchIndex(bm, Ra) {
    const r = bm.modes.map((m) => m.Ra).sort((a, b) => a - b);
    if (Ra < r[0]) return Ra / r[0] - 0.5;
    let k = 0;
    while (k + 1 < r.length && Ra >= r[k + 1]) k++;
    return k + 1 < r.length ? k + 0.5 + Math.log(Ra / r[k]) / Math.log(r[k + 1] / r[k]) : k + 0.5 + Math.log(Ra / r[k]);
  }

  /** Wen, Goluskin and Doering (2022), supplementary Table 1S: Pr = 1, Γ = 2 (k = π), Nu and Re of steady rolls. */
  const wgdRows = (refs) => (refs?.wgd?.rows ?? []).filter((r) => r.Ra <= RA_BRANCH_MAX);

  function boxImpl(decl, refs) {
    const params = decl.domain.parameters;
    const evaluate = (p) => {
      if (!(p.Ra > 0) || !(p.Gamma > 0) || !(p.Pr > 0)) return { ok: false, reason: "Ra, Γ and Pr must be positive." };
      const bm = boxModes(p.Gamma);
      return { ok: true, values: { "onset-ratio": p.Ra / bm.Ra, "branch-index": branchIndex(bm, p.Ra) } };
    };
    const steps = ["s-st-base", "s-st-perturb", "s-st-eigen"];
    const layers = [
      { id: "onset", kind: "stability", boundary: "stability", title: "Onset of convection", measure: "onset-ratio", scale: "log", status: "numerical", steps, evidence: ["spec-8", "wgd-2022"],
        criterion: "Linear temporal stability of the conductive state to the normal modes of the box, a = nπ/Γ. Neutral condition: the largest growth rate σ of the least stable mode is 0 (σ is real there: exchange of stabilities, checked at each inspected point)",
        thresholds: () => ({ curves: [{ value: 1, label: "Neutral curve Ra = Ra_c(Γ), where the first roll branch starts" }], regions: [{ id: "stable", label: "The conductive state is linearly stable", lo: 0, hi: 1 }, { id: "unstable", label: "The conductive state is linearly unstable", lo: 1, hi: null }] }) },
      { id: "branches", kind: "bifurcation", boundary: "bifurcation", title: "Roll branches from the conductive state", measure: "branch-index", scale: "linear", status: "numerical", steps: ["s-st-eigen", "s-st-branch", "s-st-amplitude"], evidence: ["spec-8", "wgd-2022", "farrell-2016"],
        criterion: "Branch condition: one more box mode n has σ = 0, a simple zero eigenvalue of the conductive state. The first branch point lies on the neutral curve of the stability layer. Classification as a supercritical pitchfork only where the amplitude equation and the roll branch were computed: the record's Γ and Pr",
        thresholds: () => ({ curves: [{ value: 1.5, label: "Second branch point: rolls of the next box mode" }, { value: 2.5, label: "Third branch point" }],
          regions: [{ id: "none", label: "No roll branch: the conductive state is the only steady state found", lo: -1, hi: 0.5 }, { id: "one", label: "One roll branch: a pair of mirror-image roll states", lo: 0.5, hi: 1.5 }, { id: "more", label: "Two or more roll branches from the conductive state", lo: 1.5, hi: null }] }) },
    ];
    const limits = (p) => {
      const lo = params.find((x) => x.id === "Gamma").max;
      return [{ id: "wide", label: `Γ → ∞ at Ra = ${num(p.Ra)}: the box tends to the unbounded layer, with onset at Ra_c = ${num(criticalAt(LIN_K).Ra)}`, coupled: false,
        note: "The admissible wavenumbers nπ/Γ fill the axis, so the onset tends to the minimum of the neutral curve of the unbounded layer.", points: Array.from({ length: 21 }, (_, i) => ({ Ra: p.Ra, Gamma: p.Gamma * (lo / p.Gamma) ** (i / 20) })) },
      { id: "onset", label: `Ra → Ra_c(Γ) at Γ = ${num(p.Gamma)}: the weakly nonlinear limit, A² ∝ Ra − Ra_c`, coupled: false, note: "The amplitude equation holds on this path; the roll amplitude goes to 0 like the square root of Ra − Ra_c.",
        points: Array.from({ length: 21 }, (_, i) => ({ Ra: boxModes(p.Gamma).Ra * (1 + 0.5 * (i / 20)), Gamma: p.Gamma })) }];
    };
    const inspect = (p, ctx) => {
      const bm = boxModes(p.Gamma, LIN_K);
      const gr = growthRates(LIN_K, p.Ra, bm.a, p.Pr);
      const real = Math.abs(gr.lead.im) <= 1e-8 * Math.max(1, Math.abs(gr.lead.re));
      const recon = ctx.reconstruct ? [ctx.reconstruct("Ra", p.Ra), ctx.reconstruct("Gamma", p.Gamma), ctx.reconstruct("Pr", p.Pr)].filter(Boolean) : [];
      return { ok: true,
        values: [
          { id: "Ra_c", tex: "Ra_c(\\Gamma)", label: `onset of the box: mode n = ${bm.n}, a = nπ/Γ = ${num(bm.a)}`, value: num(bm.Ra) },
          { id: "eps", tex: "\\varepsilon=Ra/Ra_c-1", label: "distance from onset", value: num(p.Ra / bm.Ra - 1) },
          { id: "sigma", tex: "\\sigma_1", label: "largest growth rate of that mode, in units of κ/H²", value: num(gr.lead.re) },
          { id: "unstable", tex: "N_u", label: "box modes with σ > 0", value: bm.modes.filter((m) => p.Ra > m.Ra).length },
        ],
        checks: [{ id: "exchange", title: "The largest growth rate is real (exchange of stabilities)", passed: real, status: "numerical", tolerance: "|Im σ| ≤ 1e-8 max(1, |Re σ|)", detail: `σ₁ = ${num(gr.lead.re)}${gr.lead.im ? ` ${gr.lead.im > 0 ? "+" : "−"} ${num(Math.abs(gr.lead.im))}i` : ""}.` },
          { id: "residual", title: "Residual of the eigenpair with the largest growth rate", passed: gr.residual < 1e-8, status: "numerical", tolerance: "1e-8", detail: `||Ax − σBx|| ÷ (||A|| ||x||) = ${gr.residual.toExponential(2)}.` }],
        reconstruction: recon };
    };
    const derived = (p) => {
      const bm = boxModes(p.Gamma);
      return [{ id: "Ra_c", tex: "Ra_c(\\Gamma)", label: `onset of the box (mode n = ${bm.n})`, value: num(bm.Ra) }, { id: "a_n", tex: "a=n\\pi/\\Gamma", label: "wavenumber of the least stable mode", value: num(bm.a) },
        { id: "eps", tex: "\\varepsilon", label: "Ra/Ra_c − 1", value: num(p.Ra / bm.Ra - 1) }];
    };
    const constraints = (p) => [...(p.Ra > 0 ? [] : ["Ra must be positive."]), ...(p.Gamma > 0 ? [] : ["Γ must be positive."]), ...(p.Pr > 0 ? [] : ["Pr must be positive."])];
    return { id: decl.id, params, axes: { x: "Gamma", y: "Ra" }, approximations: [], layers, evaluate, limits, inspect, derived, constraints,
      analysis: () => boxAnalysis(), acceptance: () => boxAcceptance(refs), stability: (p) => boxStability(p, refs) };
  }

  /** Hand calculation 8 for the box: the balances at onset and the weakly nonlinear limit. */
  function boxAnalysis() {
    return {
      note: "Near onset the dominant balance is viscous diffusion against buoyancy, and the asymptotic analysis is the weakly nonlinear expansion in ε = Ra/Ra_c − 1. Hand calculation 9 gives the numbers.",
      balance: {
        terms: [
          { tex: "\\frac{1}{Pr}J(\\Psi,\\nabla^{2}\\Psi)", label: "inertia (advection of vorticity)", scale: "A^{2}/Pr", why: "Quadratic in the roll amplitude A." },
          { tex: "\\nabla^{4}\\Psi", label: "viscous diffusion of vorticity", scale: "(\\pi^{2}+a^{2})^{2}A", why: "The roll has the depth 1 and the wavenumber a." },
          { tex: "Ra\\,\\partial_{X}\\theta'", label: "buoyancy torque", scale: "Ra\\,a\\,A_{\\theta}", why: "θ′ is the departure from the conductive profile." },
          { tex: "J(\\Psi,\\theta')", label: "advection of heat", scale: "A\\,A_{\\theta}", why: "Quadratic in the amplitudes." },
          { tex: "\\nabla^{2}\\theta'", label: "heat diffusion", scale: "(\\pi^{2}+a^{2})A_{\\theta}", why: "The same length scales." },
        ],
        balances: [
          { title: "Viscous–buoyancy balance (linear onset)", when: "A\\to0", derivation: "As the amplitude goes to 0, the quadratic terms are small compared with the linear ones. The vorticity equation balances viscous diffusion against the buoyancy torque, and the heat equation balances diffusion against the advection of the conductive gradient.",
            reduced: "\\nabla^{4}\\Psi=Ra\\,\\partial_{X}\\theta',\\quad\\nabla^{2}\\theta'=-\\partial_{X}\\Psi", neglected: "the inertia and heat-advection terms, both of order A²", assumptions: ["The disturbance is small."],
            residual: { tex: "O(A^{2})", order: "second order in the amplitude", status: "numerical", note: "The amplitude equation gives A² ≈ −g₁ε Ra_c/g₃ for the computed roll branch." } },
        ],
        crossovers: [{ criterion: "A^{2}\\sim\\varepsilon", status: "numerical", text: "The quadratic terms become comparable with the linear ones as ε grows; the computed roll branch gives the full balance." }],
        note: "A balance crossover is a comparison of terms. It is not a transition.",
      },
      asymptotic: {
        limits: [{ parameter: "\\varepsilon=\\frac{Ra-Ra_c}{Ra_c}\\to0", path: "ε → 0 at fixed Γ and Pr", coupled: false, kind: "Weakly nonlinear expansion (formal)", fixed: "Γ, Pr and the wavenumber of the least stable box mode",
          setup: "u=A\\phi+A^{2}u_{2}+A^{3}u_{3}+\\dots,\\qquad Ra=Ra_c+\\varepsilon Ra_c",
          orders: [
            { n: 1, equation: "L(Ra_c)\\,\\phi=0", conditions: [], why: "The neutral mode of the least stable box mode.", result: "\\phi:\\ \\text{the neutral eigenvector}" },
            { n: 2, equation: "L(Ra_c)\\,u_{2}=-B(\\phi,\\phi)", conditions: [], solvability: "\\psi^{T}B(\\phi,\\phi)=0", solvabilityWhy: "The product of the first harmonic with itself has only the mean and the second harmonic, so it is orthogonal to the adjoint mode ψ.", result: "u_{2}:\\ \\text{mean temperature distortion and second harmonic}" },
            { n: 3, equation: "L(Ra_c)\\,u_{3}=-\\varepsilon Ra_c\\,\\partial_{Ra}L\\,\\phi-2B(\\phi,u_{2})", conditions: [], solvability: "g_{1}\\varepsilon Ra_c+g_{3}A^{2}=0", solvabilityWhy: "The right side must be orthogonal to ψ.", result: "A^{2}=-\\frac{g_{1}Ra_c}{g_{3}}\\,\\varepsilon" },
          ],
          orderLoss: "No loss of order: every order has the full operator L(Ra_c) and all wall conditions.",
          error: { formal: "The expansion is formal.", estimated: "The computed roll branch estimates the remainder: the slope of Nu at onset against the branch.", proved: null },
          validity: "Small ε at fixed Γ and Pr. The computed branch is the reference away from onset." }],
        overlap: "The weakly nonlinear slope and the computed roll branch agree as ε → 0 (hand calculation 9).",
        gaps: "None on the map: this model draws stability and bifurcation layers, not approximation layers.",
      },
    };
  }

  /** The acceptance checks of the standard example (Pr = 1, Γ = 1, so the rolls have the period 2 of Table 1S). */
  function boxAcceptance(refs) {
    return cached("box-acceptance", () => {
      const out = [];
      const c16 = criticalAt(LIN_K), c24 = criticalAt(24);
      const ref = refs?.computed?.rb ?? null;
      out.push({ id: "critical-convergence", title: "The critical point converges in the number of collocation nodes", passed: Math.abs(c16.Ra - c24.Ra) / c24.Ra < 1e-9, status: "numerical", tolerance: "1e-9 relative",
        detail: `Ra_c = ${num(c16.Ra)} with 16 nodes and ${num(c24.Ra)} with 24 nodes; a_c = ${c16.a.toFixed(5)}.` });
      if (ref) out.push({ id: "critical-reference", title: "Ra_c and a_c agree with the independent SciPy reference", passed: Math.abs(c16.Ra - ref.Ra_c) / ref.Ra_c < 1e-7 && Math.abs(c16.a - ref.a_c) < 1e-4, status: "numerical", tolerance: "1e-7 relative for Ra_c, 1e-4 for a_c",
        detail: `Engine ${num(c16.Ra)} and ${c16.a.toFixed(5)}; reference ${ref.Ra_c} and ${ref.a_c} (${ref.method}).` });
      out.push({ id: "critical-evidence", title: "Ra_c and the period 2π/a_c agree with the published values Ra_c ≈ 1708 and Γ ≈ 2.016", passed: Math.abs(c16.Ra - 1708) < 0.5 && Math.abs((2 * Math.PI) / c16.a - 2.016) < 5e-4, status: "evidence", detail: `2π/a_c = ${((2 * Math.PI) / c16.a).toFixed(4)}.` });
      const gr = growthRates(LIN_K, c16.Ra, c16.a, 1);
      out.push({ id: "exchange", title: "At the critical point the largest growth rate is real and 0 (exchange of stabilities)", passed: Math.abs(gr.lead.re) < 1e-6 && gr.lead.im === 0, status: "numerical", tolerance: "1e-6",
        detail: `σ₁ = ${gr.lead.re.toExponential(2)}, σ₂ = ${num(gr.sigma[1].re)}.` });
      const rows = wgdRows(refs);
      const br = branchAt(Math.PI, 1, rows.map((r) => r.Ra));
      if (br.ok) {
        const errs = rows.map((r) => { const t = br.targets.find((x) => x.Ra === r.Ra); return t ? Math.abs(t.Nu - r.Nu) / r.Nu : Infinity; });
        const worst = Math.max(...errs);
        out.push({ id: "branch-nu", title: `The roll branch reproduces Nu of Table 1S at ${rows.length} values of Ra up to 10⁴`, passed: worst <= 1e-4, status: "evidence", tolerance: "1e-4 relative",
          detail: `Largest relative difference ${worst.toExponential(2)} (resolution ${ROLL.M} modes × ${ROLL.K} nodes).` });
        const fine = refine(br, RA_BRANCH_MAX, FINE.K, FINE.M);
        const last = br.targets.at(-1);
        out.push({ id: "branch-convergence", title: "Nu at Ra = 10⁴ converges in the resolution", passed: fine.converged && Math.abs(fine.Nu - last.Nu) / fine.Nu < 1e-5, status: "numerical", tolerance: "1e-5 relative",
          detail: `Nu = ${num(last.Nu)} with ${ROLL.M} × ${ROLL.K} and ${num(fine.Nu)} with ${FINE.M} × ${FINE.K}.` });
        const ae = amplitudeEquation(br.sys);
        out.push({ id: "supercritical", title: "The amplitude equation classifies the onset as a supercritical pitchfork", passed: ae.supercritical, status: "numerical", detail: `g₃/g₁ = ${num(ae.ratio)} < 0; onset slope dNu/dε = ${ae.slope.toFixed(4)}.` });
      } else out.push({ id: "branch-nu", title: "The roll branch reproduces Table 1S", passed: false, status: "unresolved", detail: br.reason });
      return out;
    });
  }

  /**
   * Hand calculation 9 at a point of the box: the linear stability of the conductive state for each box mode, the
   * neutral curve with the admissible wavenumbers, the convergence of the critical point, and the roll branch of the
   * least stable mode with the amplitude equation, the stability of the rolls in their symmetric subspace and the
   * convergence check. Every number is a numerical result with its tolerance.
   */
  function boxStability(p, refs) {
    return cached(`box-stability:${p.Ra}:${p.Gamma}:${p.Pr}`, () => {
      const bm = boxModes(p.Gamma, LIN_K);
      const modes = bm.modes.slice(0, 6).map((m) => { const g = growthRates(LIN_K, p.Ra, m.a, p.Pr); return { n: m.n, a: num(m.a), Ra: num(m.Ra), sigma: num(g.lead.re), im: num(g.lead.im) }; });
      const lead = growthRates(LIN_K, p.Ra, bm.a, p.Pr);
      const nm = neutralMode(LIN_K, bm.a);
      const o = operators(LIN_K);
      const shape = { z: [0, ...o.z.map((z) => z + 0.5).reverse(), 1], W: [0, ...Array.from(nm.W).reverse(), 0], Theta: [0, ...Array.from(nm.Theta).reverse(), 0] };
      const tmax = Math.max(...shape.Theta.map(Math.abs));
      shape.Theta = shape.Theta.map((v) => num(v / tmax));
      shape.W = shape.W.map(num);
      shape.z = shape.z.map(num);
      const curve = neutralCurve(MAP_K, Array.from({ length: 61 }, (_, i) => 0.6 + (i * 9.4) / 60)).map((c) => [num(c.a), num(c.Ra)]);
      const crit = [12, 16, 24].map((K) => ({ K, ...criticalAt(K) }));
      // Transversality: dσ/dRa at the onset of the least stable mode.
      const dRa = 1e-3 * bm.Ra;
      const sp = growthRates(LIN_K, bm.Ra + dRa, bm.a, p.Pr).lead.re, sm = growthRates(LIN_K, bm.Ra - dRa, bm.a, p.Pr).lead.re;
      const atOnset = growthRates(LIN_K, bm.Ra, bm.a, p.Pr);
      const k = bm.a;
      const rows = Math.abs(k - Math.PI) < 1e-12 && p.Pr === 1 ? wgdRows(refs) : [];
      const want = [...new Set([...rows.map((r) => r.Ra), ...(p.Ra > bm.Ra && p.Ra <= RA_BRANCH_MAX ? [p.Ra] : [])])].sort((a, b) => a - b);
      const br = branchAt(k, p.Pr, want);
      let branch = null;
      if (br.ok) {
        const ae = amplitudeEquation(br.sys);
        // The first point of the branch is close to onset (amplitude 0.02), where σ_rolls ≈ −2σ_conductive.
        const near = br.points[0];
        const stabNear = rollStability(br.sys, br.solutions.get(near.Ra), near.Ra);
        const condNear = growthRates(LIN_K, near.Ra, k, p.Pr).lead.re;
        const atRec = p.Ra > bm.Ra && p.Ra <= RA_BRANCH_MAX ? br.points.find((x) => x.Ra === p.Ra) : null;
        const stabRec = atRec ? rollStability(br.sys, br.solutions.get(p.Ra), p.Ra) : null;
        const fine = refine(br, atRec ? p.Ra : RA_BRANCH_MAX, FINE.K, FINE.M);
        const coarse = atRec ?? br.points.at(-1);
        const eps = br.points.slice(1, 4).map((x) => ({ eps: (x.Ra - br.Ran) / br.Ran, slope: (x.Nu - 1) / ((x.Ra - br.Ran) / br.Ran) }));
        branch = {
          ok: true, K: ROLL.K, M: ROLL.M, k: num(k), Ran: num(br.Ran), points: br.points.map((x) => ({ Ra: num(x.Ra), Nu: num(x.Nu), NuTop: num(x.NuTop), Re: num(x.Re), A: num(x.amplitude), residual: x.residual, iterations: x.iterations, tail: x.tail })),
          start: br.start, newtonSteps: br.newtonSteps,
          compare: rows.map((r) => { const t = br.targets.find((x) => x.Ra === r.Ra); return { Ra: num(r.Ra), Nu: num(t?.Nu), ref: r.Nu, rel: t ? Math.abs(t.Nu - r.Nu) / r.Nu : null, Re: num(t?.Re), refRe: r.Re, relRe: t ? Math.abs(t.Re - r.Re) / r.Re : null }; }),
          amplitude: { g1: ae.g1, g3: ae.g3, ratio: num(ae.ratio), supercritical: ae.supercritical, slope: num(ae.slope), solvability: ae.solvability, adjointResidual: ae.adjointResidual, branchSlopes: eps.map((e) => ({ eps: num(e.eps), slope: num(e.slope) })) },
          rollStability: { near: { Ra: num(near.Ra), eps: num((near.Ra - br.Ran) / br.Ran), sigma: num(stabNear?.lead.re), conduction: num(condNear), ratio: num(stabNear ? stabNear.lead.re / condNear : NaN) }, record: stabRec ? { Ra: num(p.Ra), sigma: num(stabRec.lead.re), stable: stabRec.stable } : null,
            // The rolls of mode n carry only the harmonics of nπ/Γ: the test covers the box modes that are multiples of n.
            n: bm.n, untested: bm.modes.filter((m) => m.n % bm.n !== 0 && m.n <= 3 * bm.n).map((m) => ({ n: m.n, sigma: num(growthRates(LIN_K, p.Ra, m.a, p.Pr).lead.re) })) },
          record: atRec ? { Ra: num(atRec.Ra), Nu: num(atRec.Nu), NuTop: num(atRec.NuTop), Re: num(atRec.Re) } : null,
          convergence: { Ra: num(fine.Ra), coarse: num(coarse.Nu), fine: num(fine.Nu), rel: Math.abs(fine.Nu - coarse.Nu) / fine.Nu, K: FINE.K, M: FINE.M },
          field: atRec ? br.sys.temperature(br.solutions.get(p.Ra)) : br.sys.temperature(br.solutions.get(br.points.at(-1).Ra)),
        };
        branch.field = { xs: branch.field.xs.map((x) => Number(x.toFixed(4))), zs: branch.field.zs.map((z) => Number((z + 0.5).toFixed(4))), T: branch.field.T.map((r) => r.map((v) => Number((v + 0.5).toFixed(4)))) };
      } else branch = { ok: false, reason: br.reason };
      return {
        family: "buoyancy-convection", point: { Ra: p.Ra, Gamma: p.Gamma, Pr: p.Pr }, concept: `linear temporal stability of the conductive state to two-dimensional normal modes. Nonlinear steady rolls with the period ${bm.n === 1 ? "2Γ of the box" : `2Γ/${bm.n}`} and mirror symmetry`,
        box: { n: bm.n, a: num(bm.a), Ra: num(bm.Ra), modes }, lead: { re: num(lead.lead.re), im: num(lead.lead.im), residual: lead.residual, spectrum: lead.sigma.slice(0, 8).map((e) => ({ re: num(e.re), im: num(e.im) })) },
        shape, curve, critical: crit.map((c) => ({ K: c.K, Ra: num(c.Ra), a: num(c.a) })),
        transversality: { dsigma: num((sp - sm) / (2 * dRa)), second: num(atOnset.sigma[1].re), zero: num(atOnset.lead.re) }, branch,
      };
    });
  }

  /** The family module interface of src/regime.js: an implementation for each declaration of this module. */
  function implement(decl, options = {}) {
    return decl.id === "boussinesq-box" ? boxImpl(decl, options.references ?? null) : null;
  }

  return { operators, neutral, neutralMode, critical, neutralCurve, growthRates, enclosureOnset, rollSystem, solveAt, branchStart, rollBranch, prolong, refine, amplitudeEquation, rollStability,
    boxModes, RA_BRANCH_MAX, ROLL, FINE, implement, DECLARATIONS: ["boussinesq-box"] };
});
