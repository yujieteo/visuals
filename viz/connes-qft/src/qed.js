/* Connes QFT laboratory: perturbative QED and the classical-field and canonical-quantization models.
 *
 * Units: natural, ħ = c = 1, Heaviside–Lorentz charge (e² = 4πα), metric signature (+, −, −, −),
 * Dirac representation for γ^μ. Formulas follow Peskin & Schroeder, An Introduction to Quantum Field
 * Theory (1995), cited as P&S with an equation or section; every function says where its formula
 * comes from and which quantities are one-loop, leading-log or schematic.
 */
(function (factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"), require("./linalg.js"), require("./laurent.js"));
  else factory(self.ConnesQFT, self.ConnesQFT.linalg, self.ConnesQFT.laurent);
})(function (Q, LA, LS) {
  "use strict";
  const { ALPHA, CONST } = Q;
  const PI = Math.PI;

  /* ---------- Minkowski geometry ---------- */
  const dot = (p, q) => p[0] * q[0] - p[1] * q[1] - p[2] * q[2] - p[3] * q[3];
  const vadd = (p, q) => p.map((x, i) => x + q[i]);
  const vsub = (p, q) => p.map((x, i) => x - q[i]);
  /* Classify the separation of two events x, y (4-vectors or [t, x] pairs). */
  function interval(x, y) {
    const d = x.map((v, i) => v - y[i]);
    const s2 = d[0] * d[0] - d.slice(1).reduce((s, v) => s + v * v, 0);
    const tol = 1e-12 * Math.max(1, ...d.map(Math.abs)) ** 2;
    return { s2, kind: Math.abs(s2) <= tol ? "null" : s2 > 0 ? "timelike" : "spacelike" };
  }
  /* Boost along x with rapidity η acting on [t, x]. */
  const boost2 = (eta, [t, x]) => [Math.cosh(eta) * t + Math.sinh(eta) * x, Math.sinh(eta) * t + Math.cosh(eta) * x];

  /* ---------- Dirac matrices (Dirac representation, P&S use the Weyl one; both satisfy {γ^μ, γ^ν} = 2g^{μν}) ---------- */
  const I2 = [[1, 0], [0, 1]];
  const SIG = [
    [[0, 1], [1, 0]],
    [[0, [0, -1]], [[0, 1], 0]],
    [[1, 0], [0, -1]],
  ];
  const block = (a, b, c, d) => LA.from([...a.map((r, i) => [...r, ...b[i]]), ...c.map((r, i) => [...r, ...d[i]])]);
  const Z2 = [[0, 0], [0, 0]];
  const negm = (m) => m.map((r) => r.map((v) => (Array.isArray(v) ? [-v[0], -v[1]] : -v)));
  const GAMMA = [block(I2, Z2, Z2, negm(I2)), ...SIG.map((s) => block(Z2, s, negm(s), Z2))];
  const G5 = block(Z2, I2, I2, Z2);
  const METRIC = [1, -1, -1, -1];
  /* p-slash = γ^μ p_μ = γ^0 p^0 − γ^i p^i. */
  const slash = (p) => GAMMA.reduce((acc, g, mu) => LA.add(acc, LA.scale(g, METRIC[mu] * p[mu])), LA.zeros(4));
  /* Positive-energy spinor u(p, s) and negative-energy v(p, s) (Dirac rep), normalized ū u = 2m. */
  function spinorU(p, m, s) {
    const E = p[0], chi = s === 0 ? [1, 0] : [0, 1], k = Math.sqrt(E + m);
    const sp = [[p[3], [p[1], -p[2]]], [[p[1], p[2]], -p[3]]]; // σ·p
    const low = [0, 1].map((i) => [0, 1].reduce((acc, j) => { const v = Array.isArray(sp[i][j]) ? sp[i][j] : [sp[i][j], 0]; return [acc[0] + v[0] * chi[j], acc[1] + v[1] * chi[j]]; }, [0, 0]));
    return [[k * chi[0], 0], [k * chi[1], 0], [low[0][0] / k, low[0][1] / k], [low[1][0] / k, low[1][1] / k]];
  }
  function spinorV(p, m, s) {
    const E = p[0], eta = s === 0 ? [0, 1] : [1, 0], k = Math.sqrt(E + m);
    const sp = [[p[3], [p[1], -p[2]]], [[p[1], p[2]], -p[3]]];
    const up = [0, 1].map((i) => [0, 1].reduce((acc, j) => { const v = Array.isArray(sp[i][j]) ? sp[i][j] : [sp[i][j], 0]; return [acc[0] + v[0] * eta[j], acc[1] + v[1] * eta[j]]; }, [0, 0]));
    return [[up[0][0] / k, up[0][1] / k], [up[1][0] / k, up[1][1] / k], [k * eta[0], 0], [k * eta[1], 0]];
  }
  const bar = (u) => LA.matvec(GAMMA[0], u).map(LA.C.conj); // ū = u† γ^0 (as a row of entries)
  const rowDot = (row, v) => row.reduce((s, a, i) => LA.C.add(s, LA.C.mul(a, v[i])), [0, 0]);
  /* ū(a) Γ u(b) for a 4×4 matrix Γ. */
  const sandwich = (ua, G, ub) => rowDot(bar(ua), LA.matvec(G, ub));
  /* On-shell four-momentum with mass m and three-momentum k. */
  const onShell = (m, k) => [Math.sqrt(m * m + k[0] ** 2 + k[1] ** 2 + k[2] ** 2), k[0], k[1], k[2]];
  /* Residual ‖(p̸ − m) u‖ for the Dirac equation check. */
  function diracResidual(p, m, s) {
    const u = spinorU(p, m, s);
    const r = LA.matvec(LA.sub(slash(p), LA.scale(LA.eye(4), m)), u);
    return LA.vnorm(r);
  }

  /* ---------- tree-level e⁻μ⁻ → e⁻μ⁻ (one-photon exchange) ---------- */
  /* Centre-of-mass kinematics for √s and scattering angle θ (in the x–z plane). */
  function emuKinematics(sqrtS, theta, m = CONST.me.value, M = CONST.mmu.value) {
    const s = sqrtS * sqrtS;
    const pAbs = Math.sqrt(Math.max(0, (s - (m + M) ** 2) * (s - (m - M) ** 2))) / (2 * sqrtS);
    const p1 = onShell(m, [0, 0, pAbs]), p2 = onShell(M, [0, 0, -pAbs]);
    const p3 = onShell(m, [pAbs * Math.sin(theta), 0, pAbs * Math.cos(theta)]), p4 = onShell(M, [-pAbs * Math.sin(theta), 0, -pAbs * Math.cos(theta)]);
    const q = vsub(p1, p3);
    return { s, t: dot(q, q), u: dot(vsub(p1, p4), vsub(p1, p4)), pAbs, p1, p2, p3, p4, q, m, M };
  }
  /* The amplitude 𝓜 = (−ie)² [ū(p3)γ^μ u(p1)] D_μν(q) [ū(p4)γ^ν u(p2)] with D_μν = −i g_μν / q²,
     for each spin choice, and the spin average ¼ ∑|𝓜|² (P&S §5.1, eq. 5.10 by crossing). */
  function emuAmplitude(kin, e = Q.E_CHARGE) {
    const { p1, p2, p3, p4, q, m, M } = kin;
    const q2 = dot(q, q);
    const rows = [];
    let sumSq = 0;
    for (const s1 of [0, 1]) for (const s2 of [0, 1]) for (const s3 of [0, 1]) for (const s4 of [0, 1]) {
      const u1 = spinorU(p1, m, s1), u2 = spinorU(p2, M, s2), u3 = spinorU(p3, m, s3), u4 = spinorU(p4, M, s4);
      const J1 = GAMMA.map((g) => sandwich(u3, g, u1)); // electron current ū3 γ^μ u1
      const J2 = GAMMA.map((g) => sandwich(u4, g, u2)); // muon current ū4 γ^ν u2
      // g_μν J1^μ J2^ν
      const JJ = J1.reduce((acc, a, mu) => LA.C.add(acc, LA.C.scale(LA.C.mul(a, J2[mu]), METRIC[mu])), [0, 0]);
      // 𝓜 = (−ie)²(−i/q²) JJ = i e² JJ / q²
      const Mamp = LA.C.mul([0, (e * e) / q2], JJ);
      const sq = Mamp[0] ** 2 + Mamp[1] ** 2;
      sumSq += sq;
      rows.push({ spins: [s1, s2, s3, s4], J1, J2, M: Mamp, sq });
    }
    return { rows, avg: sumSq / 4, q2 };
  }
  /* Closed form of the spin average: (2e⁴/t²)[(s−m²−M²)² + (u−m²−M²)² + 2t(m²+M²)]. */
  function emuClosedForm(kin, e = Q.E_CHARGE) {
    const { s, t, u, m, M } = kin, S = m * m + M * M;
    return ((2 * e ** 4) / (t * t)) * ((s - S) ** 2 + (u - S) ** 2 + 2 * t * S);
  }
  /* CM differential cross-section dσ/dΩ = ⟨|𝓜|²⟩ / (64π² s) for elastic 2 → 2 (P&S eq. 4.85). */
  const dsigmaDOmega = (avg, s) => avg / (64 * PI * PI * s);

  /* ---------- propagators ---------- */
  /* Photon propagator in Feynman gauge: D_μν(q) = −i g_μν / (q² + iε). Returns the scalar factor −i/q². */
  const photonPropagator = (q) => { const q2 = dot(q, q); return { q2, factor: [0, -1 / q2], onShell: Math.abs(q2) < 1e-12 }; };
  /* Electron propagator S_F(p) = i(p̸ + m)/(p² − m² + iε): the 4×4 matrix (off shell) and p² − m². */
  function electronPropagator(p, m = CONST.me.value) {
    const den = dot(p, p) - m * m;
    return { den, offShell: den, matrix: Math.abs(den) < 1e-12 ? null : LA.scale(LA.add(slash(p), LA.scale(LA.eye(4), m)), [0, 1 / den]) };
  }

  /* ---------- Coulomb potential from photon exchange ---------- */
  /* ∫ d³q/(2π)³ e^{iq·r} · 1/(q² + μ²) with a Gaussian cutoff e^{−q²/Q²}: (1/(2π²r)) ∫ q sin(qr) e^{−q²/Q²}/(q²+μ²) dq.
     As Q → ∞ this tends to e^{−μr}/(4πr) (the Yukawa form; μ → 0 gives Coulomb's 1/(4πr)). */
  function fourierPotential(r, Qcut, mu = 0) {
    const f = (q) => (q * Math.sin(q * r) * Math.exp(-(q * q) / (Qcut * Qcut))) / (q * q + mu * mu);
    const qmax = 7 * Qcut;
    const panels = Math.max(16, Math.ceil((qmax * r) / 2));
    return Q.integrate(f, 0, qmax, { order: 16, panels }) / (2 * PI * PI * r);
  }
  const yukawa = (r, mu = 0) => Math.exp(-mu * r) / (4 * PI * r);

  /* ---------- one-loop vacuum polarization ---------- */
  /* Δ(x) = m² − x(1−x) q² (P&S eq. 7.90). */
  const vpDelta = (x, q2, m) => m * m - x * (1 - x) * q2;
  /* Π₂(q²; ε) in d = 4 − ε as a Laurent series to order `hi`, from P&S eq. 7.90:
       Π₂ = −(8e²/(4π)^{d/2}) μ^{ε} ∫₀¹ dx x(1−x) Γ(2 − d/2) Δ^{d/2 − 2}
          = −(e²/2π²) ∫₀¹ dx x(1−x) Γ(ε/2) (4πμ²/Δ)^{ε/2}.
     Every coefficient is integrated over x by Gauss–Legendre; nothing is hard-coded. Valid for
     Δ > 0 on [0, 1], i.e. q² < 4m² (spacelike q², or timelike below the pair threshold). */
  function vacuumPolarizationSeries(q2, mu, { m = CONST.me.value, alpha = ALPHA, hi = 2 } = {}) {
    if (q2 >= 4 * m * m) throw new Error("vacuumPolarizationSeries needs q² < 4m² (real Δ)");
    const e2 = 4 * PI * alpha;
    const G = LS.gammaHalfEps(hi + 1);
    const { x: nodes, w } = Q.gaussLegendre(40);
    let acc = LS.zero(hi);
    for (let i = 0; i < nodes.length; i++) {
      const x = (nodes[i] + 1) / 2, wt = w[i] / 2;
      const X = (4 * PI * mu * mu) / vpDelta(x, q2, m);
      const term = LS.mul(G, LS.powHalfEps(X, hi + 1));
      acc = LS.add(acc, LS.scale(term, wt * x * (1 - x)));
    }
    return LS.truncate(LS.scale(acc, -e2 / (2 * PI * PI)), hi);
  }
  /* The MS-bar renormalized Π̂(q²; μ) = (2α/π) ∫ x(1−x) log(Δ/μ²) dx (subtracting 2/ε − γ + log 4π). */
  const vpMSbar = (q2, mu, { m = CONST.me.value, alpha = ALPHA } = {}) => (2 * alpha / PI) * Q.integrate((x) => x * (1 - x) * Math.log(vpDelta(x, q2, m) / (mu * mu)), 0, 1, { order: 24, panels: 4 });
  /* On-shell subtracted Π̂₂(q²) = Π₂(q²) − Π₂(0) = −(2α/π) ∫ x(1−x) log(m²/Δ) dx (P&S eq. 7.91). */
  const vpOnShell = (q2, { m = CONST.me.value, alpha = ALPHA } = {}) => (-2 * alpha / PI) * Q.integrate((x) => x * (1 - x) * Math.log((m * m) / vpDelta(x, q2, m)), 0, 1, { order: 24, panels: 4 });
  /* Effective coupling α_eff(q²) = α / (1 − Π̂₂(q²)) (P&S §7.5), one loop, electron loop only. */
  const alphaEff = (q2, opts = {}) => (opts.alpha ?? ALPHA) / (1 - vpOnShell(q2, opts));
  /* Large-Q² form α/(1 − (α/3π) log(Q²/(A m²))), A = e^{5/3} (P&S eq. 7.96). */
  const alphaEffAsymptotic = (Q2, { m = CONST.me.value, alpha = ALPHA } = {}) => alpha / (1 - (alpha / (3 * PI)) * Math.log(Q2 / (Math.exp(5 / 3) * m * m)));

  /* ---------- counterterm, β-function and running ---------- */
  /* Residue z(e) of the 1/ε pole of Π₂ as a function of e (d = 4 − ε); δ₃ = z(e)/ε in minimal subtraction. */
  const vpResidue = (e, opts = {}) => LS.coef(vacuumPolarizationSeries(-1, 1, { ...opts, alpha: (e * e) / (4 * PI), hi: 0 }), -1);
  /* β(e) = μ de/dμ from e₀ = μ^{ε/2} Z₃^{−1/2} e (Ward identity Z₁ = Z₂), Z₃ = 1 + z(e)/ε:
     the μ-independence of e₀ gives β(e) = −(e²/4) z′(e) at ε → 0. z′ by central difference. */
  function betaFromCounterterm(e) {
    const h = 1e-4 * Math.max(1, e);
    const dz = (vpResidue(e + h) - vpResidue(e - h)) / (2 * h);
    return -(e * e / 4) * dz;
  }
  const betaOneLoop = (e) => (e ** 3) / (12 * PI * PI); // P&S eq. 12.? reference value e³/(12π²)
  /* One-loop running α(μ) for one Dirac fermion: 1/α(μ) = 1/α(μ₀) − (2/3π) log(μ/μ₀). */
  const alphaRun = (mu, { mu0 = CONST.me.value, alpha0 = ALPHA } = {}) => 1 / (1 / alpha0 - (2 / (3 * PI)) * Math.log(mu / mu0));
  /* One-loop Landau pole μ_L = μ₀ exp(3π/(2α₀)) (where the one-loop formula diverges; not a physical prediction). */
  const landauPole = ({ mu0 = CONST.me.value, alpha0 = ALPHA } = {}) => ({ log10: Math.log10(mu0) + (3 * PI) / (2 * alpha0) / Math.LN10 });
  /* One-loop MS-bar mass running: μ dm/dμ = −(3α/2π) m, so m(μ) = m(μ₀) (α(μ)/α(μ₀))^{−9/4}. */
  const gammaMass = (alpha) => (3 * alpha) / (2 * PI);
  /* RG vector field in (log μ, α, m): (dα/dlogμ, dm/dlogμ). */
  const rgField = (alpha, m) => [(2 * alpha * alpha) / (3 * PI), -gammaMass(alpha) * m];
  /* Integrate the one-loop RG flow from (α₀, m₀) over t = log(μ/μ₀) ∈ [0, T] with RK4. */
  function rgTrajectory(alpha0, m0, T, steps = 200) {
    const out = [{ t: 0, alpha: alpha0, m: m0 }];
    let a = alpha0, m = m0;
    const h = T / steps;
    for (let i = 0; i < steps; i++) {
      const f = (aa, mm) => rgField(aa, mm);
      const k1 = f(a, m), k2 = f(a + (h / 2) * k1[0], m + (h / 2) * k1[1]), k3 = f(a + (h / 2) * k2[0], m + (h / 2) * k2[1]), k4 = f(a + h * k3[0], m + h * k3[1]);
      a += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      m += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      out.push({ t: (i + 1) * h, alpha: a, m });
    }
    return out;
  }
  /* Two-loop β coefficient for comparison only: μ dα/dμ = 2α²/(3π) + α³/(2π²) (literature value,
     Jost & Luttinger 1950; not computed here). */
  const betaAlphaTwoLoop = (alpha) => (2 * alpha * alpha) / (3 * PI) + alpha ** 3 / (2 * PI * PI);

  /* ---------- Uehling potential ---------- */
  /* V(r) = −(Zα/r)[1 + (2α/3π) ∫₁^∞ du e^{−2mru} (1 + 1/(2u²)) √(u²−1)/u²] (Uehling 1935; Berestetskii,
     Lifshitz & Pitaevskii, Quantum Electrodynamics §114). Returns the bracket's correction term. */
  function uehlingCorrection(r, { m = CONST.me.value, alpha = ALPHA } = {}) {
    const f = (u) => Math.exp(-2 * m * r * u) * (1 + 1 / (2 * u * u)) * Math.sqrt(u * u - 1) / (u * u);
    // substitute u = cosh(s) to remove the square-root endpoint
    const g = (s) => { const u = Math.cosh(s); return f(u) * Math.sinh(s); };
    const smax = Math.acosh(1 + 40 / Math.max(1e-9, 2 * m * r)) + 1;
    return ((2 * alpha) / (3 * PI)) * Q.integrate(g, 0, smax, { order: 24, panels: 16 });
  }
  /* Effective coupling at distance r: α_eff(r) = α (1 + correction). */
  const alphaAtDistance = (r, opts = {}) => (opts.alpha ?? ALPHA) * (1 + uehlingCorrection(r, opts));
  /* Short-distance asymptote (mr ≪ 1): (2α/3π)[log(1/(mr)) − γ − 5/6]; long-distance (mr ≫ 1): (α/(4√π)) e^{−2mr}/(mr)^{3/2}. */
  const uehlingShort = (r, { m = CONST.me.value, alpha = ALPHA } = {}) => ((2 * alpha) / (3 * PI)) * (Math.log(1 / (m * r)) - Q.EG - 5 / 6);
  const uehlingLong = (r, { m = CONST.me.value, alpha = ALPHA } = {}) => (alpha / (4 * Math.sqrt(PI))) * Math.exp(-2 * m * r) / Math.pow(m * r, 1.5);

  /* ---------- vertex correction: F₂ and the anomalous magnetic moment ---------- */
  /* F₂(q²) = (α/2π) ∫ dx dy dz δ(x+y+z−1) 2m² z(1−z) / (m²(1−z)² − q² xy) (P&S eq. 6.56), for q² ≤ 0.
     With x = su, y = s(1−u), z = 1−s (Jacobian s) the integrand becomes 2m²(1−s)/(m² − q²u(1−u)),
     smooth on the unit square, which is integrated numerically. */
  function F2(q2, { m = CONST.me.value, alpha = ALPHA } = {}) {
    const val = Q.integrate((s) => Q.integrate((u) => (2 * m * m * (1 - s)) / (m * m - q2 * u * (1 - u)), 0, 1, { order: 20, panels: 2 }), 0, 1, { order: 20, panels: 2 });
    return (alpha / (2 * PI)) * val;
  }
  /* a_e = F₂(0) = α/2π at one loop (Schwinger 1948). */
  const anomalousMomentOneLoop = (alpha = ALPHA) => F2(0, { alpha });

  /* ---------- electron self-energy, UV and IR behaviour ---------- */
  /* The model log-divergent integral I(Λ) = ∫_{|k|<Λ} d⁴k_E/(2π)⁴ 1/(k² + m²)², radially: (1/8π²) ∫₀^Λ k³ dk/(k²+m²)². */
  const shellIntegrand = (k, m) => (k ** 3) / (8 * PI * PI * (k * k + m * m) ** 2);
  const cutoffIntegral = (Lambda, m) => Q.integrate((k) => shellIntegrand(k, m), 0, Lambda, { order: 20, panels: Math.max(8, Math.ceil(Math.log2(1 + Lambda / Math.max(m, 1e-9))) * 4) });
  /* Its closed form: (1/16π²)[log(1 + Λ²/m²) − Λ²/(Λ² + m²)]. */
  const cutoffIntegralExact = (Lambda, m) => (Math.log(1 + (Lambda * Lambda) / (m * m)) - (Lambda * Lambda) / (Lambda * Lambda + m * m)) / (16 * PI * PI);
  /* Contribution of shells [k_i, k_{i+1}] on a logarithmic grid between kmin and kmax. */
  function shellHistogram(m, kmin, kmax, bins = 24, { ir = false, irCut = 0 } = {}) {
    const edges = Q.linspace(Math.log(kmin), Math.log(kmax), bins + 1).map(Math.exp);
    const f = ir ? (k) => (k < irCut ? 0 : 1 / (8 * PI * PI * k)) : (k) => shellIntegrand(k, m);
    let cum = 0;
    return edges.slice(0, -1).map((a, i) => { const b = edges[i + 1]; const v = Q.integrate(f, a, b, { order: 12, panels: 2 }); cum += v; return { a, b, value: v, cumulative: cum }; });
  }
  /* The same integral in three regularizations (each is bookkeeping, none is physical):
     cutoff Λ, dimensional regularization (Laurent series in ε), Pauli–Villars mass M. */
  function regulatorComparison({ m = 1, Lambda = 100, M = 100, mu = 1, hi = 1 } = {}) {
    const cutoff = cutoffIntegralExact(Lambda, m);
    // ∫ d^dk/(2π)^d 1/(k²+m²)² μ^ε = Γ(ε/2)/(4π)^{2−ε/2} (μ²/m²)^{ε/2} = (1/16π²) Γ(ε/2) (4πμ²/m²)^{ε/2}
    const dimreg = LS.scale(LS.mul(LS.gammaHalfEps(hi + 1), LS.powHalfEps((4 * PI * mu * mu) / (m * m), hi + 1)), 1 / (16 * PI * PI));
    const pv = Math.log((M * M) / (m * m)) / (16 * PI * PI);
    // The coefficient of log m² is −1/16π² in every scheme (the regulator-independent physics).
    const h = 1e-4;
    const logSlope = {
      cutoff: (cutoffIntegralExact(Lambda, m * Math.exp(h / 2)) - cutoffIntegralExact(Lambda, m * Math.exp(-h / 2))) / (2 * h),
      dimreg: (LS.coef(LS.scale(LS.mul(LS.gammaHalfEps(1), LS.powHalfEps((4 * PI * mu * mu) / (m * m * Math.exp(h)), 1)), 1 / (16 * PI * PI)), 0) - LS.coef(LS.scale(LS.mul(LS.gammaHalfEps(1), LS.powHalfEps((4 * PI * mu * mu) / (m * m * Math.exp(-h)), 1)), 1 / (16 * PI * PI)), 0)) / (2 * h),
      pv: (Math.log((M * M) / (m * m * Math.exp(h))) - Math.log((M * M) / (m * m * Math.exp(-h)))) / (2 * h) / (16 * PI * PI),
    };
    return { cutoff, dimreg, pv, logSlope };
  }
  /* Electron mass shift with a Pauli–Villars photon of mass Λ, leading log: δm ≈ (3α/4π) m log(Λ²/m²) (P&S §7.1). */
  const deltaMass = (Lambda, { m = CONST.me.value, alpha = ALPHA } = {}) => ((3 * alpha) / (4 * PI)) * m * Math.log((Lambda * Lambda) / (m * m));

  /* ---------- Feynman parameters ---------- */
  /* 1/(AB) = ∫₀¹ dx / [xA + (1−x)B]² (P&S eq. 6.41). Returns both sides. */
  function feynmanParameter(A, B) {
    const rhs = Q.integrate((x) => 1 / (x * A + (1 - x) * B) ** 2, 0, 1, { order: 24, panels: 8 });
    return { lhs: 1 / (A * B), rhs };
  }

  /* ---------- canonical quantization: modes, oscillators, Fock space ---------- */
  /* Normal-mode coefficients of a string profile y(x) on [0, 1] with fixed ends: q_k = 2∫ y sin(kπx) dx. */
  const stringModes = (y, K = 12) => Q.range(K).map((i) => 2 * Q.integrate((x) => y(x) * Math.sin((i + 1) * PI * x), 0, 1, { order: 20, panels: 8 }));
  /* Truncated bosonic ladder operators on n_max + 1 levels: a|n⟩ = √n |n−1⟩. */
  function bosonLadder(nmax) {
    const a = LA.zeros(nmax + 1);
    for (let n = 1; n <= nmax; n++) LA.set(a, n - 1, n, Math.sqrt(n));
    return { a, adag: LA.adj(a) };
  }
  /* Fermionic mode: c|1⟩ = |0⟩, c² = 0, {c, c†} = 1. */
  function fermionLadder() { const c = LA.from([[0, 1], [0, 0]]); return { c, cdag: LA.adj(c) }; }
  /* Apply a†_k to occupation |n⟩: returns the new occupation and the amplitude √(n+1) (bosons) or the Pauli result (fermions). */
  const createBoson = (n) => ({ n: n + 1, amp: Math.sqrt(n + 1) });
  const createFermion = (n) => (n >= 1 ? { n: null, amp: 0 } : { n: 1, amp: 1 });
  /* Number of Fock states with N particles of types e⁻, e⁺, γ in K modes each (fermions: at most one per mode). */
  function fockSectorCount(N, K) {
    // generating function: (1+x)^{2K} (fermions e⁻, e⁺) × 1/(1−x)^K (photons)
    const binom = (n, k) => (k < 0 || k > n ? 0 : Q.range(k).reduce((p, i) => (p * (n - i)) / (i + 1), 1));
    let s = 0;
    for (let f = 0; f <= N; f++) s += binom(2 * K, f) * binom(N - f + K - 1, K - 1);
    return Math.round(s);
  }

  /* ---------- vacuum correlations ---------- */
  /* Free scalar of mass m on a ring of L sites (spacing 1): ω_k² = m² + 4 sin²(k/2), ⟨q_k²⟩ = 1/(2ω_k),
     ⟨0|φ(x)φ(y)|0⟩ = (1/L) ∑_k cos(k(x−y)) / (2ω_k). */
  function ringModes(L, m) { return Q.range(L).map((j) => { const k = (2 * PI * j) / L; const w = Math.sqrt(m * m + 4 * Math.sin(k / 2) ** 2); return { k, omega: w, fluct: 1 / (2 * w) }; }); }
  const ringCorrelator = (L, m, r) => ringModes(L, m).reduce((s, md) => s + (Math.cos(md.k * r) * md.fluct) / L, 0);
  /* Continuum 3+1 equal-time (or spacelike, r = √(−x²)) correlator of a free scalar: m K₁(mr)/(4π² r); m → 0 gives 1/(4π² r²). */
  const scalarCorrelator = (r, m) => (m <= 0 ? 1 / (4 * PI * PI * r * r) : (m * Q.besselK(1, m * r)) / (4 * PI * PI * r));

  /* ---------- path integral: stationary phase for a free particle ---------- */
  /* Paths x_a(t) = x_cl(t) + a sin(πt/T): S(a) = S_cl + m π² a² / (4T). The phasor sum ∑ e^{iS(a)/ħ} Δa. */
  function pathFamily({ m = 1, T = 1, x0 = 0, x1 = 1, hbar = 0.1, amax = 2, n = 161 } = {}) {
    const Scl = (m * (x1 - x0) ** 2) / (2 * T);
    const as = Q.linspace(-amax, amax, n), da = as[1] - as[0];
    let re = 0, im = 0;
    const paths = as.map((a) => {
      const S = Scl + (m * PI * PI * a * a) / (4 * T);
      const ph = S / hbar;
      const z = [Math.cos(ph) * da, Math.sin(ph) * da];
      re += z[0]; im += z[1];
      return { a, S, phase: ph, step: z, partial: [re, im] };
    });
    // exact Gaussian (Fresnel) value of ∫ e^{iS(a)/ħ} da over the whole line
    const k = (m * PI * PI) / (4 * T * hbar);
    const mag = Math.sqrt(PI / k);
    const exact = [mag * Math.cos(Scl / hbar + PI / 4), mag * Math.sin(Scl / hbar + PI / 4)];
    return { Scl, paths, total: [re, im], exact, width: Math.sqrt((4 * T * hbar) / (m * PI * PI)) };
  }

  /* ---------- generating functional and Wick contractions ---------- */
  /* Euclidean lattice ring K = −Δ + m²; G = K⁻¹ is the propagator, Z[J] = exp(½ J·G·J). */
  function latticePropagator(L, m) {
    return Q.range(L).map((i) => Q.range(L).map((j) => { let s = 0; for (let k = 0; k < L; k++) { const p = (2 * PI * k) / L; s += Math.cos(p * (i - j)) / (m * m + 4 * Math.sin(p / 2) ** 2); } return s / L; }));
  }
  /* All perfect matchings of the labels 0..2n−1. */
  function matchings(labels) {
    if (!labels.length) return [[]];
    const [a, ...rest] = labels, out = [];
    rest.forEach((b, i) => { const others = rest.filter((_, j) => j !== i); for (const m of matchings(others)) out.push([[a, b], ...m]); });
    return out;
  }
  const doubleFactorial = (n) => (n <= 0 ? 1 : n * doubleFactorial(n - 2));
  /* ⟨φ_{i1} … φ_{i2n}⟩ = ∑ over pairings ∏ G (Wick's theorem for a Gaussian measure). */
  function wickMoment(points, G) {
    const ms = matchings(points.map((_, k) => k));
    const terms = ms.map((mm) => ({ pairs: mm, value: mm.reduce((p, [a, b]) => p * G[points[a]][points[b]], 1) }));
    return { terms, total: Q.sum(terms.map((t) => t.value)) };
  }

  /* ---------- classical electromagnetism ---------- */
  /* Coulomb field in the plane z = 0 of point charges {x, y, q} (3D 1/r² law, Heaviside–Lorentz: E = q r̂/(4πr²)). */
  function efield(charges, x, y) {
    let ex = 0, ey = 0;
    for (const c of charges) { const dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy + 1e-9, r3 = r2 * Math.sqrt(r2); ex += (c.q * dx) / (4 * PI * r3); ey += (c.q * dy) / (4 * PI * r3); }
    return [ex, ey];
  }
  /* Field of a charge in uniform motion with speed v along x, from its present position
     (Heaviside 1888; Jackson §11.10): E = q(1−v²) R̂ / (4πR²(1 − v² sin²θ)^{3/2}); B = v × E. */
  function movingChargeField(q, v, dx, dy) {
    const R2 = dx * dx + dy * dy + 1e-9, R = Math.sqrt(R2), sin2 = (dy * dy) / R2;
    const mag = (q * (1 - v * v)) / (4 * PI * R2 * Math.pow(1 - v * v * sin2, 1.5));
    return { E: [(mag * dx) / R, (mag * dy) / R], Bz: v * (mag * dy) / R };
  }
  /* Flux of E through a circle of radius ρ about (cx, cy) in the plane, using the 3D field (∮ over a
     sphere is what Gauss's law needs; on a plane slice we integrate over the sphere of radius ρ). */
  function gaussFlux(charges, cx, cy, rho, n = 48) {
    // ∮_sphere E·dA with charges in the z = 0 plane; Gauss–Legendre in cos θ, uniform in φ.
    const { x: ct, w } = Q.gaussLegendre(n);
    let flux = 0;
    for (let i = 0; i < n; i++) {
      const cosT = ct[i], sinT = Math.sqrt(1 - cosT * cosT);
      for (let j = 0; j < 2 * n; j++) {
        const ph = (PI * (j + 0.5)) / n;
        const px = cx + rho * sinT * Math.cos(ph), py = cy + rho * sinT * Math.sin(ph), pz = rho * cosT;
        let ex = 0, ey = 0, ez = 0;
        for (const c of charges) { const dx = px - c.x, dy = py - c.y, dz = pz, r2 = dx * dx + dy * dy + dz * dz, r3 = r2 * Math.sqrt(r2); ex += (c.q * dx) / (4 * PI * r3); ey += (c.q * dy) / (4 * PI * r3); ez += (c.q * dz) / (4 * PI * r3); }
        const nx = sinT * Math.cos(ph), ny = sinT * Math.sin(ph), nz = cosT;
        flux += (ex * nx + ey * ny + ez * nz) * w[i] * (PI / n) * rho * rho;
      }
    }
    return flux;
  }
  /* Trace a field line from (x, y) by RK4 along Ê, stopping near a charge or outside the box. */
  function fieldLine(charges, x, y, { step = 0.02, maxSteps = 600, box = [-2, -1.4, 2, 1.4], dir = 1 } = {}) {
    const pts = [[x, y]];
    const unit = (px, py) => { const [ex, ey] = efield(charges, px, py); const n = Math.hypot(ex, ey) || 1; return [(dir * ex) / n, (dir * ey) / n]; };
    for (let i = 0; i < maxSteps; i++) {
      const k1 = unit(x, y), k2 = unit(x + (step / 2) * k1[0], y + (step / 2) * k1[1]), k3 = unit(x + (step / 2) * k2[0], y + (step / 2) * k2[1]), k4 = unit(x + step * k3[0], y + step * k3[1]);
      x += (step / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += (step / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      pts.push([x, y]);
      if (x < box[0] || y < box[1] || x > box[2] || y > box[3]) break;
      if (charges.some((c) => Math.hypot(x - c.x, y - c.y) < step * 1.5)) break;
    }
    return pts;
  }
  /* Plane wave travelling along +z: E = E₀ cos(kz − ωt) x̂, B = E₀ cos(kz − ωt) ŷ, ω = k (c = 1). */
  const planeWave = (z, t, k = 2 * PI, E0 = 1) => { const c = E0 * Math.cos(k * z - k * t); return { E: [c, 0, 0], B: [0, c, 0] }; };

  /* ---------- gauge fields on a lattice ---------- */
  /* Lattice U(1) gauge field on an N×N periodic grid: Ax[i][j] on the link (i,j)→(i+1,j), Ay on (i,j)→(i,j+1).
     Field strength F_xy = ∂_x A_y − ∂_y A_x on each plaquette (forward differences). */
  function latticeCurl(Ax, Ay) {
    const N = Ax.length, F = Q.range(N).map(() => new Array(N).fill(0));
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) F[i][j] = (Ay[(i + 1) % N][j] - Ay[i][j]) - (Ax[i][(j + 1) % N] - Ax[i][j]);
    return F;
  }
  /* A ↦ A + ∂χ on the lattice. */
  function gaugeTransform(Ax, Ay, chi, s = 1) {
    const N = Ax.length;
    return {
      Ax: Ax.map((row, i) => row.map((a, j) => a + s * (chi[(i + 1) % N][j] - chi[i][j]))),
      Ay: Ay.map((row, i) => row.map((a, j) => a + s * (chi[i][(j + 1) % N] - chi[i][j]))),
    };
  }
  /* Phase field ψ = e^{iθ} transformed by ψ ↦ e^{−ieχ}ψ, and the gauge-invariant comparison
     ψ(x)* U(x, x+1) ψ(x+1) with parallel transporter U = e^{ieA} (lattice spacing 1). */
  const transformPhase = (theta, chi, e = 1, s = 1) => theta.map((row, i) => row.map((t, j) => t - s * e * chi[i][j]));
  function linkComparison(theta, Ax, e = 1) {
    const N = theta.length;
    return theta.map((row, i) => row.map((t, j) => { const ang = -t + e * Ax[i][j] + theta[(i + 1) % N][j]; return Math.atan2(Math.sin(ang), Math.cos(ang)); }));
  }
  const naiveComparison = (theta) => theta.map((row, i) => row.map((t, j) => { const ang = theta[(i + 1) % theta.length][j] - t; return Math.atan2(Math.sin(ang), Math.cos(ang)); }));

  /* ---------- scale ladder for the scale microscope ---------- */
  const SCALES = [
    { id: "macro", label: "macroscopic", mu: 1e-12, note: "metres: classical electrodynamics" },
    { id: "atomic", label: "atomic", mu: 3.7e-3, note: "Bohr-radius momentum αm_e ≈ 3.7 keV" },
    { id: "me", label: "electron mass", mu: CONST.me.value, note: "m_e = 0.511 MeV: pair creation threshold" },
    { id: "collider", label: "high-energy collider", mu: CONST.mZ.value, note: "m_Z = 91.19 GeV" },
    { id: "uv", label: "UV", mu: 1e16, note: "far ultraviolet: the one-loop formula still runs; real physics adds more particles" },
  ];

  /* ---------- toy scalar sector for the effective potential (pedagogical only) ---------- */
  /* One-loop Coleman–Weinberg potential, MS-bar, for V₀ = ½m²φ² + (λ/4!)φ⁴:
     V = V₀ + (M⁴/64π²)(log(M²/μ²) − 3/2), M² = m² + λφ²/2 (Coleman & Weinberg 1973; MS-bar form as in Schwartz §34). */
  function effectivePotential(phi, { m2 = 1, lambda = 1, mu = 1 } = {}) {
    const V0 = 0.5 * m2 * phi * phi + (lambda / 24) * phi ** 4;
    const M2 = m2 + 0.5 * lambda * phi * phi;
    const V1 = M2 > 0 ? (M2 * M2 / (64 * PI * PI)) * (Math.log(M2 / (mu * mu)) - 1.5) : NaN;
    return { V0, V1, V: V0 + V1 };
  }

  /* ---------- Wilsonian shells ---------- */
  /* Leading-log effective coupling after integrating out shells down to Λ/b: α(Λ/b) = α(Λ)/(1 + (2α(Λ)/3π) log b).
     The one-loop coefficient is scheme independent, so this agrees with the MS-bar running at leading log. */
  const wilsonStep = (alphaL, b) => alphaL / (1 + ((2 * alphaL) / (3 * PI)) * Math.log(b));

  /* ---------- formal diffeomorphism from leading-log running ---------- */
  /* α(μ) = α/(1 − bα) = α + bα² + b²α³ + …, b = (2/3π) log(μ/μ₀): coefficients to order n. */
  const runningSeries = (logRatio, n = 4) => { const b = (2 / (3 * PI)) * logRatio; return Q.range(n).map((k) => Math.pow(b, k)); };

  /* ---------- anomaly and chiral spectral flow ---------- */
  /* Lowest-Landau-level picture (Nielsen & Ninomiya 1983): right movers E = +p, left movers E = −p,
     degeneracy eB/2π per area; dp/dt = eE gives d(N_R − N_L)/dt per volume = e² E B / (2π²). */
  const anomalyRate = (E, B, e = Q.E_CHARGE) => (e * e * E * B) / (2 * PI * PI);
  /* Chiral modes on a ring of length L threaded by flux s (in units of 2π/e): right p_n = (2π/L)(n + s), left −(2π/L)(n + s). */
  function chiralLevels(s, L = 2 * PI, nmax = 4) {
    return Q.range(2 * nmax + 1).map((i) => { const n = i - nmax; const p = ((2 * PI) / L) * (n + s); return { n, right: p, left: -p }; });
  }

  const api = {
    dot, vadd, vsub, interval, boost2, GAMMA, G5, METRIC, slash, spinorU, spinorV, bar, sandwich, onShell, diracResidual,
    emuKinematics, emuAmplitude, emuClosedForm, dsigmaDOmega, photonPropagator, electronPropagator, fourierPotential, yukawa,
    vpDelta, vacuumPolarizationSeries, vpMSbar, vpOnShell, alphaEff, alphaEffAsymptotic, vpResidue, betaFromCounterterm, betaOneLoop,
    alphaRun, landauPole, gammaMass, rgField, rgTrajectory, betaAlphaTwoLoop, uehlingCorrection, alphaAtDistance, uehlingShort, uehlingLong,
    F2, anomalousMomentOneLoop, shellIntegrand, cutoffIntegral, cutoffIntegralExact, shellHistogram, regulatorComparison, deltaMass,
    feynmanParameter, stringModes, bosonLadder, fermionLadder, createBoson, createFermion, fockSectorCount, ringModes, ringCorrelator, scalarCorrelator,
    pathFamily, latticePropagator, matchings, doubleFactorial, wickMoment, efield, movingChargeField, gaussFlux, fieldLine, planeWave,
    latticeCurl, gaugeTransform, transformPhase, linkComparison, naiveComparison, SCALES, effectivePotential, wilsonStep, runningSeries, anomalyRate, chiralLevels,
  };
  Q.qed = api;
  return api;
});
