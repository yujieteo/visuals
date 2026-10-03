/* Radar network visualiser: the thermal-noise square-law detector.
 *
 * Complex samples are normalised so that the integrated noise has unit mean power. A cell is declared
 * when its statistic exceeds the threshold eta set by Pfa per decision cell:
 *   coherent      T = |sum of phase-compensated complex samples|^2 / N   (noise only: Exp(1))   eta = -ln Pfa
 *   noncoherent   T = sum of |sample|^2 over N pulses                     (noise only: Gamma(N, 1)) Q(N, eta) = Pfa
 * Pd is evaluated for Swerling 0 to 4 and for the synthetic scattering-phase model (fixed for the scenario,
 * per dwell, or per pulse). Every result names its method and its numerical check. Thermal noise only:
 * these probabilities say nothing about clutter or interference.
 */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./numerics.js") : root.RadarNet.numerics);
  if (node) module.exports = api;
  else (root.RadarNet = root.RadarNet || {}).detector = api;
})(typeof self !== "undefined" ? self : this, function (N) {
  "use strict";

  const INTEGRATIONS = ["coherent", "noncoherent"];
  const PHASES = ["fixed", "per-dwell", "per-pulse"];

  /* ===== THRESHOLD ===== */
  /** The noise-only threshold eta on the normalised statistic. */
  function threshold(integration, pulses, pfa) {
    if (!(pfa > 0 && pfa < 1)) throw new RangeError("Pfa must be in (0, 1)");
    if (integration === "coherent") {
      return { eta: -Math.log(pfa), rule: "\\eta=-\\ln P_{fa}", noise: "Exp(1)" };
    }
    if (integration === "noncoherent") {
      const eta = N.gammaQInv(pulses, pfa);
      return { eta, rule: "Q(N,\\eta)=P_{fa}", noise: `Gamma(${pulses}, 1)`, residual: N.gammaPQ(pulses, eta).Q / pfa - 1 };
    }
    throw new RangeError(`unknown integration ${integration}`);
  }

  /* ===== FLUCTUATION DISTRIBUTIONS (unit mean power factor x) ===== */
  const PDF = {
    exp: (x) => Math.exp(-x),
    gamma2: (x) => 4 * x * Math.exp(-2 * x),
  };
  const XMAX = { exp: 45, gamma2: 26 };
  const swerlingFactor = (sw) => (sw === 1 || sw === 2 ? "exp" : sw === 3 || sw === 4 ? "gamma2" : null);
  const perPulse = (sw) => sw === 2 || sw === 4;

  /** Pd of a single complex cell with SNR rho (nonfluctuating): Marcum Q1. */
  function cellPd(rho, eta) {
    const r = N.ncx2Tail(2 * eta, 2, 2 * rho);
    return { pd: r.sf, q: r.cdf, bound: r.bound };
  }

  /** Average f(rho * x) over the fluctuation distribution, by composite Gauss-Legendre with a doubling check. */
  function averageOver(kind, f) {
    const pdf = PDF[kind], memo = new Map();
    const g = (x) => { let v = memo.get(x); if (!v) { v = f(x); memo.set(x, v); } return v; };
    const pdR = N.integrateChecked((x) => pdf(x) * g(x).pd, 0, XMAX[kind], 16, 16, 1e-9, 2048);
    const qR = N.integrateChecked((x) => pdf(x) * g(x).q, 0, XMAX[kind], 16, 16, 1e-9, 2048);
    return { pd: pdR.value, q: qR.value, error: Math.max(pdR.error, qR.error), converged: pdR.converged && qR.converged, panels: Math.max(pdR.panels, qR.panels) };
  }

  /* ===== COHERENT, ALIGNED PHASE, PER-PULSE AMPLITUDE (SWERLING 2 AND 4) ===== */
  // S = sum of N independent amplitude factors a = sqrt(x). The pmf of S comes from an N-fold FFT
  // convolution on a grid; Pd = E[ Q1 at rho_coh = rho1 S^2 / N ]. Grid h and 2h give the convergence check.
  const SUM_CACHE = new Map();
  function amplitudeSum(kind, pulses, h) {
    const key = `${kind}:${pulses}:${h}`;
    if (SUM_CACHE.has(key)) return SUM_CACHE.get(key);
    const amax = kind === "exp" ? 6.6 : 4.8;
    const pdfA = kind === "exp" ? (a) => 2 * a * Math.exp(-a * a) : (a) => 8 * a * a * a * Math.exp(-2 * a * a);
    const n = Math.ceil(amax / h);
    const L = N.nextPow2(pulses * n + 1);
    if (L > (1 << 22)) throw new RangeError("amplitude-sum grid too large");
    // Bin i covers [i h - h/2, i h + h/2]; mass by 4-point Gauss-Legendre in each bin.
    const { x: gx, w: gw } = N.gaussLegendre(4);
    const re = new Float64Array(L), im = new Float64Array(L);
    let total = 0;
    for (let i = 0; i <= n; i++) {
      const a0 = Math.max(0, (i - 0.5) * h), a1 = (i + 0.5) * h;
      let m = 0;
      for (let k = 0; k < 4; k++) m += gw[k] * pdfA(0.5 * (a0 + a1) + 0.5 * (a1 - a0) * gx[k]);
      re[i] = 0.5 * (a1 - a0) * m;
      total += re[i];
    }
    for (let i = 0; i <= n; i++) re[i] /= total;
    N.fft2(re, im, -1);
    for (let k = 0; k < L; k++) {
      // (re + i im)^pulses by polar form.
      const r = Math.hypot(re[k], im[k]), th = Math.atan2(im[k], re[k]);
      const rp = Math.pow(r, pulses);
      re[k] = rp * Math.cos(pulses * th); im[k] = rp * Math.sin(pulses * th);
    }
    N.fft2(re, im, 1);
    const pmf = new Float64Array(L);
    for (let k = 0; k < L; k++) pmf[k] = Math.max(0, re[k] / L);
    const out = { pmf, h, total: pmf.reduce((s, v) => s + v, 0) };
    SUM_CACHE.set(key, out);
    return out;
  }
  function coherentAlignedPerPulse(kind, pulses, rho1, eta, h) {
    const { pmf } = amplitudeSum(kind, pulses, h);
    // Aggregate into at most ~800 coarse bins over the support with mass > 1e-18.
    let lo = 0, hi = pmf.length - 1;
    while (lo < hi && pmf[lo] < 1e-20) lo++;
    while (hi > lo && pmf[hi] < 1e-20) hi--;
    const step = Math.max(1, Math.ceil((hi - lo + 1) / 240));
    let pd = 0, q = 0, mass = 0;
    for (let b = lo; b <= hi; b += step) {
      let m = 0, ms = 0;
      for (let i = b; i < Math.min(b + step, hi + 1); i++) { m += pmf[i]; ms += pmf[i] * i * h; }
      if (m <= 0) continue;
      const s = ms / m;
      const c = cellPd((rho1 * s * s) / pulses, eta);
      pd += m * c.pd; q += m * c.q; mass += m;
    }
    return { pd: pd / mass, q: q / mass };
  }

  /* ===== COHERENT, PER-PULSE RANDOM PHASE: HANKEL INVERSION ===== */
  // The signal sum is isotropic in the complex plane, so the cell statistic |z| has CDF
  //   F(r0) = r0 * integral_0^inf J1(r0 t) Phi_s(t) exp(-t^2/4) dt,   r0 = sqrt(eta),
  // with Phi_s the 2D characteristic function of the signal sum (radial) and exp(-t^2/4) that of CN(0, 1).
  function hankelPd(phiS, eta, panels = 96) {
    const r0 = Math.sqrt(eta);
    const F = N.integrate((t) => N.besselJ1(r0 * t) * phiS(t) * Math.exp(-t * t / 4), 0, 14, panels, 16) * r0;
    const F2 = N.integrate((t) => N.besselJ1(r0 * t) * phiS(t) * Math.exp(-t * t / 4), 0, 14, panels * 2, 16) * r0;
    return { pd: Math.min(1, Math.max(0, 1 - F2)), q: Math.min(1, Math.max(0, F2)), error: Math.abs(F2 - F), converged: Math.abs(F2 - F) < 1e-9, panels: panels * 2 };
  }
  function phiPerPulse(sw, pulses, rho1) {
    const s = Math.sqrt(rho1 / pulses);
    if (sw === 0) return (t) => Math.pow(N.besselJ0(s * t), pulses);
    if (sw === 2) return (t) => Math.exp(-rho1 * t * t / 4);
    if (sw === 4) return (t) => { const c2 = s * s * t * t; return Math.pow((1 - c2 / 8) * Math.exp(-c2 / 8), pulses); };
    throw new RangeError("phiPerPulse: Swerling 1 and 3 use the tabulated average");
  }

  // Swerling 1 and 3 with a per-pulse random phase: average the Swerling 0 per-pulse-phase Pd, tabulated on a
  // 0.05 dB grid with cubic Hermite interpolation, over the dwell factor x. Checked at grid midpoints.
  const TABLE_CACHE = new Map();
  function sw0PerPulseTable(pulses, eta) {
    const key = `${pulses}:${eta}`;
    if (TABLE_CACHE.has(key)) return TABLE_CACHE.get(key);
    const lo = -50, hi = 50, d = 0.05, n = Math.round((hi - lo) / d) + 1;
    const pd = new Float64Array(n);
    for (let i = 0; i < n; i++) pd[i] = hankelPd(phiPerPulse(0, pulses, N.dbToLin(lo + i * d)), eta, 48).pd;
    const at = (db) => {
      if (db <= lo) return pd[0];
      if (db >= hi) return pd[n - 1];
      const u = (db - lo) / d, i = Math.min(n - 2, Math.floor(u)), t = u - i;
      const m0 = i > 0 ? (pd[i + 1] - pd[i - 1]) / 2 : pd[i + 1] - pd[i];
      const m1 = i < n - 2 ? (pd[i + 2] - pd[i]) / 2 : pd[i + 1] - pd[i];
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * pd[i] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * pd[i + 1] + (t3 - t2) * m1;
    };
    let maxErr = 0;
    for (const db of [-20.025, -10.025, -5.025, -0.025, 4.975, 9.975, 14.975, 19.975]) {
      maxErr = Math.max(maxErr, Math.abs(at(db) - hankelPd(phiPerPulse(0, pulses, N.dbToLin(db)), eta, 48).pd));
    }
    const out = { at, maxErr };
    TABLE_CACHE.set(key, out);
    return out;
  }

  /* ===== PD ===== */
  /**
   * Predicted Pd for single-pulse matched-filter SNR rho1 (linear) under the thermal-noise model.
   * opts: { integration, pulses, pfa, swerling (0..4), phase ("fixed" | "per-dwell" | "per-pulse") }.
   * Returns { pd, q = 1 - Pd (accurate when small), eta, method, check }.
   */
  function pd(opts, rho1, { check: withCheck = true } = {}) {
    const { integration, pulses, pfa } = opts;
    const sw = opts.swerling ?? 0;
    const phase = opts.phase ?? "fixed";
    if (!(rho1 >= 0)) throw new RangeError("rho1 must be nonnegative");
    if (!Number.isInteger(pulses) || pulses < 1) throw new RangeError("pulse count must be a positive integer");
    if (![0, 1, 2, 3, 4].includes(sw)) throw new RangeError("Swerling case must be 0 to 4");
    const { eta } = threshold(integration, pulses, pfa);
    const kind = swerlingFactor(sw);
    const doCheck = withCheck;
    let r, method, check;
    if (integration === "coherent") {
      const rhoN = pulses * rho1;
      if (phase !== "per-pulse" || pulses === 1) {
        if (sw === 0) { const c = cellPd(rhoN, eta); r = c; method = "Marcum Q1 (Poisson mixture of gamma tails)"; check = c.bound ? `outside the bulk: ${c.bound} bounded by e^-50` : "series to 1e-22 Poisson mass"; }
        else if (sw === 1 || (sw === 2 && pulses === 1)) { const pdv = Math.exp(-eta / (1 + rhoN)); r = { pd: pdv, q: -Math.expm1(-eta / (1 + rhoN)) }; method = "closed form exp(-eta/(1+rho_N)): the dwell amplitude is complex Gaussian"; check = "exact"; }
        else if (sw === 3 || (sw === 4 && pulses === 1)) { const c = 1 + rhoN / 2, e = Math.exp(-eta / c), pdv = e * (1 + (eta * (c - 1)) / (c * c)); r = { pd: pdv, q: 1 - pdv }; method = "closed form exp(-eta/c)(1 + eta(c-1)/c^2), c = 1 + rho_N/2"; check = "exact"; }
        else {
          const a = coherentAlignedPerPulse(kind, pulses, rho1, eta, 0.005);
          r = a; method = "conditional rho_coh = rho1 (sum sqrt x_m)^2 / N, averaged over the FFT-convolved distribution of the amplitude sum";
          if (doCheck) {
            const b = coherentAlignedPerPulse(kind, pulses, rho1, eta, 0.01);
            check = `grid 0.005 vs 0.01: |dPd| = ${N.sig(Math.abs(a.pd - b.pd), 2)}`;
          } else check = "grid 0.005 (check on request)";
        }
      } else {
        if (sw === 2) { const pdv = Math.exp(-eta / (1 + rho1)); r = { pd: pdv, q: -Math.expm1(-eta / (1 + rho1)) }; method = "closed form exp(-eta/(1+rho1)): the per-pulse random phasors sum to CN(0, rho1)"; check = "exact"; }
        else if (sw === 0 || sw === 4) { const h = hankelPd(phiPerPulse(sw, pulses, rho1), eta); r = h; method = "Hankel inversion of the isotropic signal-plus-noise characteristic function"; check = `panels doubled: |dF| = ${N.sig(h.error, 2)}`; }
        else {
          const tab = sw0PerPulseTable(pulses, eta);
          const av = averageOver(kind, (x) => { const p = tab.at(N.linToDb(rho1 * x)); return { pd: p, q: 1 - p }; });
          r = av; method = "Swerling 0 per-pulse-phase Pd (Hankel, tabulated at 0.05 dB) averaged over the dwell factor";
          check = `table midpoint error ${N.sig(tab.maxErr, 2)}; quadrature change ${N.sig(av.error, 2)}`;
        }
      }
    } else if (integration === "noncoherent") {
      if (sw === 0) { const c = N.ncx2Tail(2 * eta, 2 * pulses, 2 * pulses * rho1); r = { pd: c.sf, q: c.cdf }; method = `noncentral chi-square, ${2 * pulses} dof, noncentrality 2 N rho1`; check = c.bound ? `outside the bulk: ${c.bound} bounded by e^-50` : `${c.terms} Poisson terms`; }
      else if (sw === 2) { const g = N.gammaPQ(pulses, eta / (1 + rho1)); r = { pd: g.Q, q: g.P }; method = "closed form Q(N, eta/(1+rho1)): each pulse power is Exp(1 + rho1)"; check = "exact"; }
      else if (sw === 4) {
        const c = 1 + rho1 / 2, p = 1 / c;
        let s = 0, sq = 0;
        for (let j = 0; j <= pulses; j++) {
          const lw = N.lgamma(pulses + 1) - N.lgamma(j + 1) - N.lgamma(pulses - j + 1) + j * Math.log(p) + (pulses - j) * Math.log1p(-p);
          const w = p === 1 ? (j === pulses ? 1 : 0) : Math.exp(lw);
          if (w === 0) continue;
          const g = N.gammaPQ(2 * pulses - j, eta / c);
          s += w * g.Q; sq += w * g.P;
        }
        r = { pd: s, q: sq }; method = "closed form: binomial mixture of Gamma(2N - j, c), c = 1 + rho1/2 (from the moment-generating function)"; check = "exact series";
      } else {
        const av = averageOver(kind, (x) => { const c = N.ncx2Tail(2 * eta, 2 * pulses, 2 * pulses * rho1 * x); return { pd: c.sf, q: c.cdf }; });
        r = av; method = "noncentral chi-square averaged over the dwell factor (Gauss-Legendre)";
        check = `panels ${av.panels}, change on doubling ${N.sig(av.error, 2)}`;
      }
    } else throw new RangeError(`unknown integration ${integration}`);
    return { pd: r.pd, q: r.q, eta, method, check, converged: r.converged !== false };
  }

  /* ===== REQUIRED SNR ===== */
  const REQ_CACHE = new Map();
  /** Single-pulse matched-filter SNR rho1 that gives the required Pd, by bisection in dB. */
  function requiredSnr(opts) {
    const { pdRequired, pfa } = opts;
    if (!(pfa > 0 && pfa < pdRequired && pdRequired < 1)) throw new RangeError("need 0 < Pfa < Pd < 1");
    const key = JSON.stringify([opts.integration, opts.pulses, pfa, opts.swerling ?? 0, opts.phase ?? "fixed", pdRequired]);
    if (REQ_CACHE.has(key)) return REQ_CACHE.get(key);
    const f = (db) => pd(opts, N.dbToLin(db), { check: false }).pd - pdRequired;
    let lo = -60, hi = 90, out;
    if (f(hi) < 0) out = { rho1: Infinity, db: Infinity, reason: "the required Pd is not reached below 90 dB with this model" };
    else {
      const r = N.bisect(f, lo, hi, 1e-7, 200);
      const at = pd(opts, N.dbToLin(r.x));
      out = { rho1: N.dbToLin(r.x), db: r.x, iterations: r.iterations, residual: at.pd - pdRequired, method: at.method, check: at.check };
    }
    REQ_CACHE.set(key, out);
    return out;
  }

  return { INTEGRATIONS, PHASES, threshold, cellPd, pd, requiredSnr, amplitudeSum, hankelPd, phiPerPulse };
});
