/* Connes QFT laboratory: engine core.
 *
 * Every engine module is a UMD file with no DOM, storage, clock, randomness or network use, so the
 * page and Node's test runner load the same code. In the browser the modules attach to
 * self.ConnesQFT; in Node, require("./engine.js") returns the same namespace.
 *
 * This file holds the constants (each with its source), numerical quadrature, the special
 * functions the physics modules need, and number formatting shared by the page and the exports.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ConnesQFT = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- constants ---------- */
  // Each value names its source; the page shows the source beside the number.
  const CONST = {
    alphaInv: { value: 137.035999177, source: "CODATA 2022 recommended value (Mohr et al., Rev. Mod. Phys. 97, 025002, 2025)" },
    me: { value: 0.51099895069, unit: "MeV", source: "CODATA 2022 electron mass energy equivalent" },
    mmu: { value: 105.6583755, unit: "MeV", source: "CODATA 2022 muon mass energy equivalent" },
    mZ: { value: 91188.0, unit: "MeV", source: "Particle Data Group, Review of Particle Physics 2024: m_Z = 91.1880 GeV" },
    hbarc: { value: 197.3269804, unit: "MeV fm", source: "CODATA 2018/2022 exact-derived ħc" },
    aeExp: { value: 0.00115965218059, source: "Fan, Myers, Sukra, Gabrielse, Phys. Rev. Lett. 130, 071801 (2023)" },
    eulerGamma: { value: 0.5772156649015329, source: "Euler–Mascheroni constant" },
  };
  const ALPHA = 1 / CONST.alphaInv.value;
  const E_CHARGE = Math.sqrt(4 * Math.PI * ALPHA); // Heaviside–Lorentz natural units, e² = 4πα
  const EG = CONST.eulerGamma.value;

  /* ---------- small helpers ---------- */
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const linspace = (a, b, n) => range(n).map((i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1)));
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
  /* Round for deterministic output across engines and Node versions. */
  const round = (x, digits = 12) => {
    if (!Number.isFinite(x)) return x;
    if (x === 0) return 0;
    const r = Number(x.toPrecision(digits));
    return Object.is(r, -0) ? 0 : r;
  };

  /* ---------- quadrature ---------- */
  const GL_CACHE = new Map();
  /* Gauss–Legendre nodes and weights on [-1, 1], by Newton's method on P_n. */
  function gaussLegendre(n) {
    if (GL_CACHE.has(n)) return GL_CACHE.get(n);
    const x = new Array(n), w = new Array(n);
    for (let i = 0; i < Math.ceil(n / 2); i++) {
      let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)), pp = 0;
      for (let it = 0; it < 100; it++) {
        let p1 = 1, p2 = 0;
        for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
        pp = (n * (z * p1 - p2)) / (z * z - 1);
        const dz = p1 / pp;
        z -= dz;
        if (Math.abs(dz) < 1e-16) break;
      }
      x[i] = -z; x[n - 1 - i] = z;
      w[i] = w[n - 1 - i] = 2 / ((1 - z * z) * pp * pp);
    }
    const r = { x, w };
    GL_CACHE.set(n, r);
    return r;
  }
  /* Composite Gauss–Legendre on [a, b]: `panels` panels of `order` points each. */
  function integrate(f, a, b, { order = 20, panels = 8 } = {}) {
    const { x, w } = gaussLegendre(order);
    const h = (b - a) / panels;
    let s = 0;
    for (let p = 0; p < panels; p++) {
      const lo = a + p * h, mid = lo + h / 2;
      for (let i = 0; i < order; i++) s += w[i] * f(mid + (h / 2) * x[i]);
    }
    return (s * h) / 2;
  }
  /* ∫_a^∞ f, by the substitution x = a + t/(1-t). */
  function integrateToInfinity(f, a, opts = {}) {
    return integrate((t) => { if (t >= 1) return 0; const u = 1 - t; return f(a + t / u) / (u * u); }, 0, 1, { order: 24, panels: 16, ...opts });
  }
  /* ∫ over the 2-simplex {x, y ≥ 0, x + y ≤ 1} of f(x, y). */
  function integrateSimplex(f, opts = {}) {
    return integrate((x) => integrate((y) => f(x, y), 0, 1 - x, opts), 0, 1, opts);
  }

  /* ---------- special functions ---------- */
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function gamma(z) {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1;
    let a = LANCZOS[0];
    const t = z + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a;
  }
  /* Riemann zeta at integer k ≥ 2: direct sum with an Euler–Maclaurin tail. */
  function zeta(k) {
    if (k < 2 || Math.floor(k) !== k) throw new Error("zeta(k) needs an integer k ≥ 2");
    const N = 30;
    let s = 0;
    for (let n = 1; n < N; n++) s += Math.pow(n, -k);
    // tail ∑_{n≥N} n^{-k} ≈ N^{1-k}/(k-1) + N^{-k}/2 + k N^{-k-1}/12 - k(k+1)(k+2) N^{-k-3}/720
    s += Math.pow(N, 1 - k) / (k - 1) + Math.pow(N, -k) / 2 + (k * Math.pow(N, -k - 1)) / 12 - (k * (k + 1) * (k + 2) * Math.pow(N, -k - 3)) / 720;
    return s;
  }
  /* Modified Bessel function K_ν(x), x > 0, from K_ν(x) = ∫_0^∞ e^{-x cosh t} cosh(νt) dt. */
  function besselK(nu, x) {
    if (!(x > 0)) return Infinity;
    const tmax = Math.acosh(Math.max(1, 50 / x + 1)) + 1;
    return integrate((t) => Math.exp(-x * Math.cosh(t)) * Math.cosh(nu * t), 0, tmax, { order: 24, panels: 12 });
  }
  /* Taylor coefficients of log Γ(1 + z) = -γ z + ∑_{k≥2} (-1)^k ζ(k) z^k / k, up to z^n. */
  function logGamma1pSeries(n) {
    const c = new Array(n + 1).fill(0);
    if (n >= 1) c[1] = -EG;
    for (let k = 2; k <= n; k++) c[k] = ((k % 2 === 0 ? 1 : -1) * zeta(k)) / k;
    return c;
  }

  /* ---------- formatting ---------- */
  const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "+": "⁺" };
  const sup = (s) => String(s).split("").map((ch) => SUP[ch] ?? ch).join("");
  /* A number to `sig` significant figures, with ×10ⁿ for very large or small magnitudes. */
  function fmt(x, sig = 4) {
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    if (x === Infinity) return "∞";
    if (x === -Infinity) return "−∞";
    if (x === 0) return "0";
    const ax = Math.abs(x);
    if (ax >= 1e-3 && ax < 1e6) {
      let s = Number(x.toPrecision(sig)).toString();
      if (/e/.test(s)) s = x.toFixed(Math.max(0, sig - 1));
      return s.replace("-", "−");
    }
    const e = Math.floor(Math.log10(ax));
    let m = Number((x / Math.pow(10, e)).toPrecision(sig));
    let ee = e;
    if (Math.abs(m) >= 10) { m /= 10; ee += 1; }
    return `${String(m).replace("-", "−")}×10${sup(ee)}`;
  }
  /* Plain ASCII form for spoken or machine text: 1.2e-5 style is avoided in narration by callers. */
  const fmtPlain = (x, sig = 4) => (x === 0 ? "0" : Number(x.toPrecision(sig)).toString());
  /* A number in words for narration: "minus 0.2122", "1.2 times ten to the minus 5". */
  function spokenNumber(x, sig = 4) {
    if (!Number.isFinite(x)) return x > 0 ? "infinity" : "minus infinity";
    if (x === 0) return "zero";
    const ax = Math.abs(x), sign = x < 0 ? "minus " : "";
    if (ax >= 1e-3 && ax < 1e6) return sign + Number(ax.toPrecision(sig)).toString();
    const e = Math.floor(Math.log10(ax));
    const m = Number((ax / Math.pow(10, e)).toPrecision(sig));
    return `${sign}${m} times ten to the ${e < 0 ? "minus " : ""}${Math.abs(e)}`;
  }

  return {
    CONST, ALPHA, E_CHARGE, EG,
    clamp, lerp, range, linspace, sum, near, round,
    gaussLegendre, integrate, integrateToInfinity, integrateSimplex,
    gamma, zeta, besselK, logGamma1pSeries,
    sup, fmt, fmtPlain, spokenNumber,
  };
});
