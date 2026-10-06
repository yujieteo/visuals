/* Monte Carlo Probability Workbench: the dependence library of group 5. Five copulas, each a law on [0, 1]^d with
 * uniform margins: Gaussian, Student t, Clayton, Gumbel and Frank. Each copula checks its parameter and dimension
 * domain, draws exact samples (Cholesky factors for the elliptical copulas, the Marshall-Olkin frailty algorithm for
 * the Archimedean ones), gives its conditional-inversion sampler in two dimensions, its Kendall's tau, its tail
 * dependence coefficients and its CDF. closed() finds the reference value of a box probability of the copula, or
 * of its margins when a variable takes the copula uniform through the argument u (Sklar's theorem). Tests load this
 * file with require().
 */
/** @param {any} root the global object @param {(S: any, Cn: any, E: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCSpecial ?? require("./special.js"), root.MCContinuous ?? require("./continuous.js"), root.MCExpr ?? require("./expr.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCCopulas = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./special.js")} */ S, /** @type {typeof import("./continuous.js")} */ Cn, /** @type {typeof import("./expr.js")} */ E) {
  "use strict";

  /** @typedef {{ uniform(): number, u32(): number, below(m: number): number, normal(): number }} Rng */
  /** @typedef {Record<string, any>} Params */

  /** The kinds of the group 5 laws: a copula or a path. */
  const DEP_KIND = new Set(["copula", "process"]);
  const MAX_D = 16;
  /** @param {unknown} x */
  const show = (x) => (typeof x === "number" ? String(x) : "a vector");

  /* ---------- the normal and Student t laws that the copulas need ---------- */

  /**
   * The standard normal quantile by Wichura's algorithm AS 241 (Applied Statistics 37, 1988), relative error about
   * 1e-16; the bisection of MCSpecial.normalQuantile is the reference in the tests.
   * @param {number} p
   */
  function qnorm(p) {
    if (!(p > 0 && p < 1)) throw new RangeError(`a normal quantile needs 0 < p < 1, not ${p}`);
    const q = p - 0.5;
    if (Math.abs(q) <= 0.425) {
      const r = 0.180625 - q * q;
      return (q * (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608))
        / (((((((5226.495278852545925 * r + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
    }
    let r = Math.sqrt(-Math.log(q < 0 ? p : 1 - p)), x;
    if (r <= 5) {
      r -= 1.6;
      x = (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r + 1.42343711074968357734)
        / (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1);
    } else {
      r -= 5;
      x = (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r + 6.6579046435011037772)
        / (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
    }
    return q < 0 ? -x : x;
  }

  /** The CDF of Student's t law with nu > 0 degrees of freedom, from the incomplete beta function. @param {number} x @param {number} nu */
  function tCdf(x, nu) {
    if (x === Infinity) return 1;
    if (x === -Infinity) return 0;
    if (nu > 1e7) return S.normalCdf(x);
    const tail = 0.5 * S.ibeta(nu / (nu + x * x), nu / 2, 0.5);
    return x < 0 ? tail : 1 - tail;
  }

  /** The density of Student's t law. @param {number} x @param {number} nu */
  function tPdf(x, nu) {
    return Math.exp(S.lgamma((nu + 1) / 2) - S.lgamma(nu / 2) - 0.5 * Math.log(nu * Math.PI) - ((nu + 1) / 2) * Math.log1p((x * x) / nu));
  }

  /**
   * The quantile of Student's t law: closed forms for nu = 1 and 2, otherwise Newton steps on the CDF from the
   * normal quantile, kept inside a bracket that bisection narrows when a step leaves it. Relative error below 1e-12.
   * @param {number} p @param {number} nu
   */
  function tQuantile(p, nu) {
    if (!(p > 0 && p < 1)) throw new RangeError(`a t quantile needs 0 < p < 1, not ${p}`);
    if (nu === 1) return Math.tan(Math.PI * (p - 0.5));
    if (nu === 2) return (2 * p - 1) / Math.sqrt(2 * p * (1 - p));
    if (nu > 1e7) return qnorm(p);
    let lo = -1, hi = 1;
    while (tCdf(lo, nu) > p) lo *= 2;
    while (tCdf(hi, nu) < p) hi *= 2;
    let x = Math.min(hi, Math.max(lo, qnorm(p)));
    for (let i = 0; i < 100; i++) {
      const f = tCdf(x, nu) - p;
      if (f === 0) return x;
      if (f > 0) hi = x; else lo = x;
      let next = x - f / tPdf(x, nu);
      if (!(next >= lo && next <= hi)) next = (lo + hi) / 2;
      if (Math.abs(next - x) <= 1e-14 * Math.max(1, Math.abs(x))) return next;
      x = next;
    }
    return x;
  }

  /* ---------- the bivariate normal and t laws ---------- */

  const GL = [
    { w: [0.1713244923791705, 0.3607615730481384, 0.4679139345726904], x: [0.9324695142031522, 0.6612093864662647, 0.2386191860831970] },
    { w: [0.04717533638651177, 0.1069393259953183, 0.1600783285433464, 0.2031674267230659, 0.2334925365383547, 0.2491470458134029],
      x: [0.9815606342467191, 0.9041172563704750, 0.7699026741943050, 0.5873179542866171, 0.3678314989981802, 0.1252334085114692] },
    { w: [0.01761400713915212, 0.04060142980038694, 0.06267204833410906, 0.08327674157670475, 0.1019301198172404, 0.1181945319615184, 0.1316886384491766, 0.1420961093183821, 0.1491729864726037, 0.1527533871307259],
      x: [0.9931285991850949, 0.9639719272779138, 0.9122344282513259, 0.8391169718222188, 0.7463319064601508, 0.6360536807265150, 0.5108670019508271, 0.3737060887154196, 0.2277858511416451, 0.07652652113349733] },
  ];

  /**
   * P(X > h, Y > k) for a standard bivariate normal pair with correlation r: Genz's method (Statistics and
   * Computing 14, 2004), after Drezner and Wesolowsky, with Gauss-Legendre rules of 6, 12 or 20 points.
   * Absolute error about 1e-15.
   * @param {number} h @param {number} k @param {number} r
   */
  function bvnu(h, k, r) {
    const phid = S.normalCdf;
    if (h === Infinity || k === Infinity) return 0;
    if (h === -Infinity) return k === -Infinity ? 1 : phid(-k);
    if (k === -Infinity) return phid(-h);
    if (r === 0) return phid(-h) * phid(-k);
    const tp = 2 * Math.PI, rule = Math.abs(r) < 0.3 ? GL[0] : Math.abs(r) < 0.75 ? GL[1] : GL[2];
    const w = [...rule.w, ...rule.w], x = [...rule.x.map((v) => 1 - v), ...rule.x.map((v) => 1 + v)];
    let hk = h * k, bvn = 0;
    if (Math.abs(r) < 0.925) {
      const hs = (h * h + k * k) / 2, asr = Math.asin(r) / 2;
      for (let i = 0; i < x.length; i++) {
        const sn = Math.sin(asr * x[i]);
        bvn += w[i] * Math.exp((sn * hk - hs) / (1 - sn * sn));
      }
      return Math.max(0, Math.min(1, (bvn * asr) / tp + phid(-h) * phid(-k)));
    }
    if (r < 0) { k = -k; hk = -hk; }
    if (Math.abs(r) < 1) {
      const as = 1 - r * r;
      let a = Math.sqrt(as);
      const bs = (h - k) * (h - k), c = (4 - hk) / 8, d = (12 - hk) / 80;
      let asr = -(bs / as + hk) / 2;
      if (asr > -100) bvn = a * Math.exp(asr) * (1 - (c * (bs - as) * (1 - d * bs)) / 3 + c * d * as * as);
      if (hk > -100) {
        const b = Math.sqrt(bs), sp = Math.sqrt(tp) * phid(-b / a);
        bvn -= Math.exp(-hk / 2) * sp * b * (1 - (c * bs * (1 - d * bs)) / 3);
      }
      a /= 2;
      let sum = 0;
      for (let i = 0; i < x.length; i++) {
        const xs = (a * x[i]) ** 2;
        asr = -(bs / xs + hk) / 2;
        if (!(asr > -100)) continue;
        const sp = 1 + c * xs * (1 + 5 * d * xs), rs = Math.sqrt(1 - xs), ep = Math.exp((-(hk / 2) * xs) / ((1 + rs) * (1 + rs))) / rs;
        sum += w[i] * Math.exp(asr) * (sp - ep);
      }
      bvn = (a * sum - bvn) / tp;
    }
    if (r > 0) bvn += phid(-Math.max(h, k));
    else if (h >= k) bvn = -bvn;
    else bvn = (h < 0 ? phid(k) - phid(h) : phid(-h) - phid(-k)) - bvn;
    return Math.max(0, Math.min(1, bvn));
  }

  /** P(X ≤ a, Y ≤ b) for the standard bivariate normal law with correlation r. @param {number} a @param {number} b @param {number} r */
  const bvn = (a, b, r) => bvnu(-a, -b, r);

  // Gauss-Legendre nodes and weights on (0, 1), 32 points, for the panels of the bivariate t quadrature.
  const GL32 = (() => {
    const n = 32, xs = [], ws = [];
    for (let i = 1; i <= n; i++) {
      let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5)), dp = 0;
      for (let it = 0; it < 100; it++) {
        let p0 = 1, p1 = 0;
        for (let j = 1; j <= n; j++) { const p2 = p1; p1 = p0; p0 = ((2 * j - 1) * z * p1 - (j - 1) * p2) / j; }
        dp = (n * (z * p0 - p1)) / (z * z - 1);
        const dz = p0 / dp;
        z -= dz;
        if (Math.abs(dz) < 1e-16) break;
      }
      xs.push((1 - z) / 2);
      ws.push(1 / ((1 - z * z) * dp * dp));
    }
    return { xs, ws };
  })();

  /**
   * P(T1 ≤ a, T2 ≤ b) for the bivariate Student t law with nu degrees of freedom and correlation r, by quadrature
   * of the conditional law: given T1 = x, (T2 − r x) / sqrt((1 − r²)(nu + x²)/(nu + 1)) has the t law with nu + 1
   * degrees of freedom. The variable s = F(x) / F(a) maps (−∞, a] to (0, 1]; 64 panels of 32 Gauss-Legendre points, absolute error below 1e−7.
   * @param {number} a @param {number} b @param {number} r @param {number} nu
   */
  function bvt(a, b, r, nu) {
    if (a === -Infinity || b === -Infinity) return 0;
    if (a === Infinity) return tCdf(b, nu);
    if (b === Infinity) return tCdf(a, nu);
    const Fa = tCdf(a, nu), panels = 64, k = Math.sqrt(1 - r * r);
    let sum = 0;
    for (let j = 0; j < panels; j++) {
      for (let i = 0; i < GL32.xs.length; i++) {
        const s = (j + GL32.xs[i]) / panels, x = tQuantile(Math.min(1 - 1e-16, Math.max(1e-300, s * Fa)), nu);
        sum += (GL32.ws[i] / panels) * tCdf((b - r * x) / (k * Math.sqrt((nu + x * x) / (nu + 1))), nu + 1);
      }
    }
    return Math.max(0, Math.min(1, sum * Fa));
  }

  /* ---------- correlation matrices ---------- */

  /**
   * The d × d correlation matrix of rho: one number gives the same correlation for every pair; a vector gives the
   * d(d − 1)/2 entries above the diagonal, row by row. Returns { R, errors }.
   * @param {number | number[]} rho @param {number} d
   */
  function correlation(rho, d) {
    /** @type {string[]} */
    const errors = [];
    /** @type {number[][]} */
    const R = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? 1 : 0)));
    if (typeof rho === "number") {
      if (!(rho > -1 && rho < 1)) errors.push(`rho = ${show(rho)} is outside (−1, 1).`);
      for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) if (i !== j) R[i][j] = rho;
    } else if (Array.isArray(rho)) {
      if (rho.length !== (d * (d - 1)) / 2) errors.push(`rho has ${rho.length} entries. A ${d} × ${d} correlation matrix has ${(d * (d - 1)) / 2} entries above the diagonal.`);
      else {
        let k = 0;
        for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) {
          const v = rho[k++];
          if (!(v > -1 && v < 1)) errors.push(`The correlation of components ${i + 1} and ${j + 1}, ${v}, is outside (−1, 1).`);
          R[i][j] = R[j][i] = v;
        }
      }
    } else errors.push("rho is a number or a vector of correlations.");
    return { R, errors };
  }

  /** The lower Cholesky factor of a symmetric matrix, or the index of the first pivot that is not positive. @param {number[][]} R */
  function cholesky(R) {
    const d = R.length, Lm = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < d; i++) {
      for (let j = 0; j <= i; j++) {
        let s = R[i][j];
        for (let k = 0; k < j; k++) s -= Lm[i][k] * Lm[j][k];
        if (i === j) {
          if (!(s > 1e-12)) return { L: null, pivot: i + 1 };
          Lm[i][i] = Math.sqrt(s);
        } else Lm[i][j] = s / Lm[j][j];
      }
    }
    return { L: Lm, pivot: 0 };
  }

  /* ---------- frailty samplers for the Archimedean copulas ---------- */

  /**
   * A positive stable variable with Laplace transform exp(−t^a), 0 < a < 1, by Kanter's representation
   * (Ann. Probab. 3, 1975): sin(aΘ) / sin(Θ)^(1/a) · (sin((1 − a)Θ) / E)^((1 − a)/a), with Θ uniform on (0, π) and E
   * standard exponential.
   * @param {Rng} rng @param {number} a
   */
  function positiveStable(rng, a) {
    const th = Math.PI * rng.uniform(), e = -Math.log(rng.uniform());
    return (Math.sin(a * th) / Math.pow(Math.sin(th), 1 / a)) * Math.pow(Math.sin((1 - a) * th) / e, (1 - a) / a);
  }

  /**
   * The logarithmic series law P(V = k) = −p^k / (k log(1 − p)), k ≥ 1, by Kemp's algorithm LK (Appl. Statist. 30,
   * 1981), as in Devroye (1986), section X.5.
   * @param {Rng} rng @param {number} p
   */
  function logSeries(rng, p) {
    const h = Math.log1p(-p), u2 = rng.uniform();
    if (u2 > p) return 1;
    const q = -Math.expm1(rng.uniform() * h);
    if (u2 < q * q) return Math.floor(1 + Math.log(u2) / Math.log(q));
    return u2 > q ? 1 : 2;
  }

  /** The Debye function D1(x) = (1/x) ∫_0^x t / (e^t − 1) dt for x > 0, by 64-point Gauss-Legendre panels. @param {number} x */
  function debye1(x) {
    if (x === 0) return 1;
    const panels = Math.max(1, Math.ceil(x / 4));
    let s = 0;
    for (let j = 0; j < panels; j++) {
      for (let i = 0; i < GL32.xs.length; i++) {
        const t = ((j + GL32.xs[i]) / panels) * x;
        s += (GL32.ws[i] / panels) * (t / Math.expm1(t));
      }
    }
    return s;
  }

  /* ---------- the copulas ---------- */

  /** @param {Params} p */
  function checkD(p) {
    return Number.isInteger(p.d) && p.d >= 2 && p.d <= MAX_D ? [] : [`d = ${show(p.d)} is not an integer in [2, ${MAX_D}].`];
  }

  /** The draw count of one vector: d uniforms, with room for a frailty. @param {Params} p */
  const cost = (p) => (Number.isInteger(p.d) ? p.d + 2 : 1);

  /** @param {string} why @returns {{ unavailable: string }} */
  const none = (why) => ({ unavailable: why });
  const NO_REJECTION = "This page has no rejection sampler for a copula. A copula density can grow without bound near the corners of the unit cube, so a bounded envelope does not exist in general.";

  /** Box probability and margins: shared fields of every copula. @param {string} id @param {string} name @param {any} spec */
  function copula(id, name, spec) {
    return {
      id, name, kind: "copula", params: spec.params, check: spec.check, dim: (/** @type {Params} */ p) => p.d,
      support: () => ({ lo: 0, hi: 1 }), moments: () => ({ mean: 0.5, variance: 1 / 12, order: Infinity }), cost,
      supportText: (/** @type {Params} */ p) => `u ∈ (0, 1)^${p.d}, each margin uniform`,
      reference: spec.reference, inverse: spec.inverse, rejection: () => none(NO_REJECTION),
      euler: (/** @type {Params} */ p) => ({ ...spec.reference(p), label: `${spec.reference(p).label}. A copula has no time, so this method uses the exact sampler` }),
      tau: spec.tau, tails: spec.tails, cdf: spec.cdf, cdfExact: spec.cdfExact,
    };
  }

  /** The correlation matrix and its Cholesky factor, or the error. @param {Params} p */
  function elliptical(p) {
    const { R, errors } = correlation(p.rho, p.d);
    if (errors.length) return { R, L: null, errors };
    const { L: Lm, pivot } = cholesky(R);
    if (!Lm) return { R, L: null, errors: [`The correlation matrix is not positive definite: the Cholesky factorisation fails at pivot ${pivot}.${typeof p.rho === "number" && p.d > 2 ? ` One common correlation needs rho > −1/(d − 1) = ${(-1 / (p.d - 1)).toPrecision(4)}.` : ""}`] };
    return { R, L: Lm, errors: [] };
  }

  /** Correlated standard normals from independent ones. @param {number[][]} Lm @param {number[]} z */
  function mix(Lm, z) {
    const out = new Array(z.length);
    for (let i = 0; i < z.length; i++) { let s = 0; for (let k = 0; k <= i; k++) s += Lm[i][k] * z[k]; out[i] = s; }
    return out;
  }

  /** The pairs (i, j) with i < j and the correlation of each, from a correlation matrix. @param {number[][]} R */
  const pairs = (R) => R.flatMap((row, i) => row.slice(i + 1).map((r, k) => ({ i: i + 1, j: i + k + 2, r })));

  const gaussian = copula("gaussiancopula", "Gaussian copula", {
    params: [{ name: "rho", kind: "real", text: "correlation: one number for every pair, or the d(d − 1)/2 entries above the diagonal, row by row" }, { name: "d", kind: "integer", text: "dimension, 2 ≤ d ≤ 16" }],
    check: (/** @type {Params} */ p) => { const e = checkD(p); return e.length ? e : elliptical(p).errors; },
    reference: (/** @type {Params} */ p) => {
      const { L: Lm } = elliptical(p);
      return { label: "Cholesky factor L of the correlation matrix: Z = L N with independent standard normals N (Box–Muller), then U_i = Φ(Z_i)", exactness: "exact",
        draw: (/** @type {Rng} */ rng) => mix(/** @type {number[][]} */ (Lm), Array.from({ length: p.d }, () => rng.normal())).map(S.normalCdf) };
    },
    inverse: (/** @type {Params} */ p) => {
      const { L: Lm } = elliptical(p);
      return { label: "Conditional distribution method: independent normals by the inverse transform Φ⁻¹(V) (AS 241), the Cholesky factor gives each conditional normal law, then U_i = Φ(Z_i)", exactness: "exact",
        draw: (/** @type {Rng} */ rng) => mix(/** @type {number[][]} */ (Lm), Array.from({ length: p.d }, () => qnorm(rng.uniform()))).map(S.normalCdf) };
    },
    tau: (/** @type {Params} */ p) => pairs(elliptical(p).R).map((x) => ({ ...x, tau: (2 / Math.PI) * Math.asin(x.r) })),
    tails: (/** @type {Params} */ p) => pairs(elliptical(p).R).map((x) => ({ i: x.i, j: x.j, lower: 0, upper: 0 })),
    cdf: (/** @type {number[]} */ u, /** @type {Params} */ p) => {
      const idx = u.map((v, i) => (v < 1 ? i : -1)).filter((i) => i >= 0);
      if (idx.some((i) => u[i] <= 0)) return 0;
      if (idx.length === 0) return 1;
      if (idx.length === 1) return u[idx[0]];
      if (idx.length > 2) return null;
      const { R } = elliptical(p);
      return bvn(qnorm(u[idx[0]]), qnorm(u[idx[1]]), R[idx[0]][idx[1]]);
    },
    cdfExact: false,
  });

  const student = copula("tcopula", "Student t copula", {
    params: [{ name: "rho", kind: "real", text: "correlation: one number for every pair, or the d(d − 1)/2 entries above the diagonal, row by row" }, { name: "nu", kind: "real", text: "degrees of freedom, 0.5 ≤ nu ≤ 10^6" }, { name: "d", kind: "integer", text: "dimension, 2 ≤ d ≤ 16" }],
    check: (/** @type {Params} */ p) => {
      const e = [...checkD(p), ...(typeof p.nu === "number" && p.nu >= 0.5 && p.nu <= 1e6 ? [] : [`nu = ${show(p.nu)} is outside [0.5, 10^6].`])];
      return e.length ? e : elliptical(p).errors;
    },
    reference: (/** @type {Params} */ p) => {
      const { L: Lm } = elliptical(p);
      return { label: "Z = L N as for the Gaussian copula, W ~ χ²(ν) by the gamma sampler, T = Z / √(W/ν), then U_i = F_ν(T_i)", exactness: "exact",
        draw: (/** @type {Rng} */ rng) => {
          const z = mix(/** @type {number[][]} */ (Lm), Array.from({ length: p.d }, () => rng.normal())), s = Math.sqrt((2 * Cn.gamma(rng, p.nu / 2)) / p.nu);
          return z.map((x) => tCdf(x / s, p.nu));
        } };
    },
    inverse: (/** @type {Params} */ p) => {
      const { L: Lm } = elliptical(p);
      return { label: "Normals by the inverse transform Φ⁻¹(V), W ~ χ²(ν) by the gamma sampler, T = Z / √(W/ν), then U_i = F_ν(T_i)", exactness: "exact",
        draw: (/** @type {Rng} */ rng) => {
          const z = mix(/** @type {number[][]} */ (Lm), Array.from({ length: p.d }, () => qnorm(rng.uniform()))), s = Math.sqrt((2 * Cn.gamma(rng, p.nu / 2)) / p.nu);
          return z.map((x) => tCdf(x / s, p.nu));
        } };
    },
    tau: (/** @type {Params} */ p) => pairs(elliptical(p).R).map((x) => ({ ...x, tau: (2 / Math.PI) * Math.asin(x.r) })),
    tails: (/** @type {Params} */ p) => pairs(elliptical(p).R).map((x) => { const l = 2 * tCdf(-Math.sqrt(((p.nu + 1) * (1 - x.r)) / (1 + x.r)), p.nu + 1); return { i: x.i, j: x.j, lower: l, upper: l }; }),
    cdf: (/** @type {number[]} */ u, /** @type {Params} */ p) => {
      const idx = u.map((v, i) => (v < 1 ? i : -1)).filter((i) => i >= 0);
      if (idx.some((i) => u[i] <= 0)) return 0;
      if (idx.length === 0) return 1;
      if (idx.length === 1) return u[idx[0]];
      if (idx.length > 2) return null;
      const { R } = elliptical(p);
      return bvt(tQuantile(u[idx[0]], p.nu), tQuantile(u[idx[1]], p.nu), R[idx[0]][idx[1]], p.nu);
    },
    cdfExact: false,
  });

  /** The generator ψ and its inverse of each Archimedean copula at θ. @param {string} id @param {number} th */
  function generator(id, th) {
    if (id === "claytoncopula") return { psi: (/** @type {number} */ t) => Math.pow(Math.max(0, 1 + th * t), -1 / th), inv: (/** @type {number} */ u) => (Math.pow(u, -th) - 1) / th };
    if (id === "gumbelcopula") return { psi: (/** @type {number} */ t) => Math.exp(-Math.pow(t, 1 / th)), inv: (/** @type {number} */ u) => Math.pow(-Math.log(u), th) };
    const c = -Math.expm1(-th);
    return { psi: (/** @type {number} */ t) => -Math.log1p(-c * Math.exp(-t)) / th, inv: (/** @type {number} */ u) => -Math.log(-Math.expm1(-th * u) / c) };
  }

  /** The independence point of a family: θ = 0 for Clayton and Frank, θ = 1 for Gumbel. @param {string} id @param {number} th */
  const independent = (id, th) => (id === "gumbelcopula" ? th === 1 : th === 0);

  /** The CDF of an Archimedean copula: ψ(Σ ψ⁻¹(u_i)), with the lower Fréchet bound for Clayton θ < 0. @param {string} id */
  function archCdf(id) {
    return (/** @type {number[]} */ u, /** @type {Params} */ p) => {
      if (u.some((v) => v <= 0)) return 0;
      if (independent(id, p.theta)) return u.reduce((a, b) => a * Math.min(1, b), 1);
      const g = generator(id, p.theta);
      let t = 0;
      for (const v of u) if (v < 1) t += g.inv(v);
      return Math.min(1, Math.max(0, g.psi(t)));
    };
  }

  /** The conditional inverse v = C⁻¹(w | u) of each two-dimensional Archimedean copula. @param {string} id @param {number} th @param {number} u @param {number} w */
  function condInverse(id, th, u, w) {
    if (id === "claytoncopula") return Math.pow((Math.pow(w, -th / (1 + th)) - 1) * Math.pow(u, -th) + 1, -1 / th);
    if (id === "frankcopula") return -Math.log1p((w * Math.expm1(-th)) / (w + (1 - w) * Math.exp(-th * u))) / th;
    // Gumbel: C(v | u) = C(u, v)/u · (−log u)^(θ−1) · ((−log u)^θ + (−log v)^θ)^(1/θ − 1) increases in v; bisect.
    const x = -Math.log(u);
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) {
      const v = (lo + hi) / 2, y = -Math.log(v), s = Math.pow(x, th) + Math.pow(y, th);
      const c = Math.exp(-Math.pow(s, 1 / th) + x) * Math.pow(x, th - 1) * Math.pow(s, 1 / th - 1);
      if (c < w) lo = v; else hi = v;
    }
    return (lo + hi) / 2;
  }

  /**
   * One Archimedean family: its parameter domain for each dimension, the Marshall-Olkin sampler U_i = ψ(E_i / V)
   * with the frailty V whose Laplace transform is ψ, the conditional inverse in two dimensions, Kendall's tau, the
   * tail coefficients and the CDF.
   * @param {string} id @param {string} name @param {{ frailty: string, domain: (p: Params) => string[], draw: (rng: Rng, th: number) => number, tau: (th: number) => number, tails: (th: number) => { lower: number, upper: number } }} f
   */
  function archimedean(id, name, f) {
    return copula(id, name, {
      params: [{ name: "theta", kind: "real", text: "dependence parameter θ; its domain depends on the family and on d" }, { name: "d", kind: "integer", text: "dimension, 2 ≤ d ≤ 16" }],
      check: (/** @type {Params} */ p) => { const e = checkD(p); return e.length ? e : f.domain(p); },
      reference: (/** @type {Params} */ p) => {
        if (independent(id, p.theta)) return { label: `θ = ${p.theta} gives the independence copula: independent uniforms`, exactness: "exact", draw: (/** @type {Rng} */ rng) => Array.from({ length: p.d }, () => rng.uniform()) };
        if ((id === "claytoncopula" || id === "frankcopula") && p.theta < 0) return { label: "Conditional inversion: U_1 = V_1, U_2 = C⁻¹(V_2 | U_1) in closed form (θ < 0 needs d = 2)", exactness: "exact", draw: (/** @type {Rng} */ rng) => { const u = rng.uniform(); return [u, condInverse(id, p.theta, u, rng.uniform())]; } };
        const g = generator(id, p.theta);
        return { label: `Marshall–Olkin frailty algorithm: V ~ ${f.frailty}, E_i standard exponential, U_i = ψ(E_i / V)`, exactness: "exact",
          draw: (/** @type {Rng} */ rng) => { const v = f.draw(rng, p.theta); return Array.from({ length: p.d }, () => g.psi(-Math.log(rng.uniform()) / v)); } };
      },
      inverse: (/** @type {Params} */ p) => {
        if (p.d !== 2) return none("The conditional distribution method needs the derivatives of order d − 1 of the generator. This page has it in two dimensions only.");
        if (independent(id, p.theta)) return { label: "Independence copula: independent uniforms", exactness: "exact", draw: (/** @type {Rng} */ rng) => [rng.uniform(), rng.uniform()] };
        const how = id === "gumbelcopula" ? "by bisection to 2^−60" : "in closed form";
        return { label: `Conditional distribution method: U_1 = V_1, U_2 = C⁻¹(V_2 | U_1) ${how}`, exactness: id === "gumbelcopula" ? "exact up to the bisection tolerance 1e−18" : "exact",
          draw: (/** @type {Rng} */ rng) => { const u = rng.uniform(); return [u, condInverse(id, p.theta, u, rng.uniform())]; } };
      },
      tau: (/** @type {Params} */ p) => [{ i: 1, j: 2, tau: f.tau(p.theta) }],
      tails: (/** @type {Params} */ p) => [{ i: 1, j: 2, ...f.tails(p.theta) }],
      cdf: archCdf(id),
      cdfExact: true,
    });
  }

  /** @param {unknown} x */
  const num = (x) => typeof x === "number" && Number.isFinite(x);

  const clayton = archimedean("claytoncopula", "Clayton copula", {
    frailty: "Gamma(1/θ, 1)",
    domain: (p) => {
      if (!num(p.theta)) return ["theta is a number."];
      if (p.theta > 200) return [`theta = ${p.theta} is above 200, where the copula is numerically the comonotone one.`];
      if (p.d === 2) return p.theta > -1 ? [] : [`theta = ${p.theta}: in two dimensions the Clayton copula needs θ > −1 (θ = −1 is the countermonotone bound, which this page does not sample).`];
      if (p.theta >= 0) return [];
      return [p.theta >= -1 / (p.d - 1)
        ? `theta = ${p.theta}: for d = ${p.d} the Clayton generator is d-monotone for θ ≥ −1/(d − 1) (McNeil and Nešlehová, 2009), so the copula exists, but this page samples θ < 0 only for d = 2.`
        : `theta = ${p.theta}: for d = ${p.d} the Clayton generator is not d-monotone below θ = −1/(d − 1) = ${(-1 / (p.d - 1)).toPrecision(4)}, so no copula has these parameters.`];
    },
    draw: (rng, th) => Cn.gamma(rng, 1 / th) * th,
    tau: (th) => th / (th + 2),
    tails: (th) => ({ lower: th > 0 ? Math.pow(2, -1 / th) : 0, upper: 0 }),
  });

  const gumbel = archimedean("gumbelcopula", "Gumbel copula", {
    frailty: "positive stable with Laplace transform exp(−t^(1/θ)) (Kanter)",
    domain: (p) => (!num(p.theta) ? ["theta is a number."] : p.theta < 1 ? [`theta = ${p.theta}: the Gumbel copula needs θ ≥ 1 in every dimension (θ = 1 is independence). It has no negative dependence.`] : p.theta > 100 ? [`theta = ${p.theta} is above 100, where the copula is numerically the comonotone one.`] : []),
    draw: (rng, th) => positiveStable(rng, 1 / th),
    tau: (th) => 1 - 1 / th,
    tails: (th) => ({ lower: 0, upper: 2 - Math.pow(2, 1 / th) }),
  });

  const frank = archimedean("frankcopula", "Frank copula", {
    frailty: "logarithmic series with p = 1 − e^(−θ) (Kemp's algorithm)",
    domain: (p) => {
      if (!num(p.theta)) return ["theta is a number."];
      if (Math.abs(p.theta) > 700) return [`theta = ${p.theta}: |θ| > 700 overflows e^θ.`];
      if (p.theta < 0 && p.d > 2) return [`theta = ${p.theta}: for d ≥ 3 the Frank generator is completely monotone only for θ > 0, so negative θ is valid in two dimensions only.`];
      return [];
    },
    draw: (rng, th) => logSeries(rng, -Math.expm1(-th)),
    tau: (th) => (th === 0 ? 0 : 1 - (4 / th) * (1 - (th > 0 ? debye1(th) : debye1(-th) - th / 2))),
    tails: () => ({ lower: 0, upper: 0 }),
  });

  const COPULAS = [gaussian, student, clayton, gumbel, frank];
  /** @type {Record<string, any>} */
  const BY_ID = Object.fromEntries(COPULAS.map((c) => [c.id, c]));

  /* ---------- reference values of box probabilities ---------- */

  /** Replace each definition name in a tree by the definition's tree, to 16 levels. @param {any} tree @param {any} c @param {number} [depth] @returns {any} */
  function inline(tree, c, depth = 0) {
    if (depth > 16 || !tree) return tree;
    switch (tree.t) {
      case "id": {
        if (c.kinds.get(tree.name) !== "def") return tree;
        return inline(c.nodes.find((/** @type {any} */ n) => n.name === tree.name).tree, c, depth + 1);
      }
      case "un": return { ...tree, a: inline(tree.a, c, depth) };
      case "bin": return { ...tree, a: inline(tree.a, c, depth), b: inline(tree.b, c, depth) };
      case "call": return { ...tree, args: tree.args.map((/** @type {any} */ a) => inline(a, c, depth)) };
      case "idx": return { ...tree, a: inline(tree.a, c, depth), i: inline(tree.i, c, depth) };
      case "arr": return { ...tree, items: tree.items.map((/** @type {any} */ a) => inline(a, c, depth)) };
      default: return tree;
    }
  }

  /** True when a tree reads no random variable or definition. @param {any} tree @param {any} c */
  const fixed = (tree, c) => [...E.names(tree)].every((n) => c.kinds.get(n) === "param");

  /**
   * The reference value of each probability quantity that is a box event of one copula variable U: a conjunction
   * ("and") of comparisons of a component U[j], or of a variable drawn with u = U[j] from a discrete law, with a value
   * free of random variables. A discrete margin F gives N ≤ k ⇔ U_j ≤ F(k), so the box has exact corners, and
   * inclusion-exclusion over at most 4 components gives its probability from the copula CDF. Returns, for each
   * quantity, { value, exact, how } or null.
   * @param {any} c a compiled model @param {number} a the alternative @param {(node: any, env: any[]) => { params: any, error: string }} argsAt
   */
  function closed(c, a, argsAt) {
    const env = c.alternatives[a].values;
    const cops = c.nodes.filter((/** @type {any} */ n) => n.type === "var" && n.law.kind === "copula" && n.constant && n.repeat === 1);
    return c.quantities.map((/** @type {any} */ q) => {
      if (cops.length === 0) return null;
      // The margins of a copula are uniform: E U_j = 1/2.
      if (q.kind === "expectation") { const t = inline(q.trees[0], c), r = t.t === "idx" ? component(t, c, env, argsAt) : null; return r && !r.law ? { value: 0.5, exact: true, how: "closed form: a copula margin is uniform on (0, 1)" } : null; }
      if (q.kind !== "probability") return null;
      try {
        /** @type {any[]} */
        const atoms = [];
        const split = (/** @type {any} */ t) => { if (t.t === "bin" && t.op === "&&") { split(t.a); split(t.b); } else atoms.push(t); };
        split(inline(q.trees[0], c));
        /** @type {Map<number, [number, number]>} */
        const box = new Map();
        let node = null;
        for (const t of atoms) {
          if (t.t !== "bin" || !["<", "<=", ">", ">="].includes(t.op)) return null;
          let side = t.b, ref = t.a, op = t.op;
          if (!fixed(side, c)) { side = t.a; ref = t.b; op = /** @type {Record<string, string>} */ ({ "<": ">", "<=": ">=", ">": "<", ">=": "<=" })[op]; }
          if (!fixed(side, c)) return null;
          const v = E.compile(side, c.slots)(env);
          if (typeof v !== "number" || Number.isNaN(v)) return null;
          const comp = component(ref, c, env, argsAt);
          if (!comp) return null;
          if (node && comp.node !== node) return null;
          node = comp.node;
          // The event on U_j: U_j ≤ x (upper) or U_j > x (lower), with x from the margin.
          const upper = op === "<" || op === "<=";
          let x;
          if (comp.law && comp.law.continuous) x = comp.law.cdf(v, comp.params);
          else if (comp.law) {
            const k = op === "<" || op === ">=" ? Math.ceil(v) - 1 : Math.floor(v);
            x = comp.law.cdf(k, comp.params);
          } else x = Math.min(1, Math.max(0, v));
          const cur = box.get(comp.j) ?? [0, 1];
          box.set(comp.j, upper ? [cur[0], Math.min(cur[1], x)] : [Math.max(cur[0], x), cur[1]]);
        }
        if (!node || box.size > 4) return null;
        const cp = argsAt(node, env).params, law = node.law;
        if (law.check(cp).length) return null;
        const keys = [...box.keys()];
        if (keys.some((j) => j < 1 || j > cp.d)) return null;
        let total = 0;
        for (let mask = 0; mask < 1 << keys.length; mask++) {
          const u = new Array(cp.d).fill(1);
          let sign = 1;
          keys.forEach((j, b) => { const [lo, hi] = /** @type {[number, number]} */ (box.get(j)); if (mask & (1 << b)) { u[j - 1] = lo; sign = -sign; } else u[j - 1] = hi; });
          if (keys.some((j) => { const [lo, hi] = /** @type {[number, number]} */ (box.get(j)); return hi <= lo; })) return { value: 0, exact: true, how: "the box is empty" };
          const C = law.cdf(u, cp);
          if (C === null) return null;
          total += sign * C;
        }
        const value = Math.min(1, Math.max(0, total));
        return { value, exact: law.cdfExact, how: law.cdfExact ? `closed form: the ${law.name} CDF at the corners of the box` : `numerical: the ${law.name} CDF by ${law.id === "gaussiancopula" ? "Genz's bivariate normal method, error about 1e−15" : "quadrature of the conditional t law, error below 1e−7"}` };
      } catch {
        return null;
      }
    });
  }

  /** The copula component a tree reads: U[j] itself, or a variable drawn with u = U[j]. @param {any} t @param {any} c @param {any[]} env @param {(node: any, env: any[]) => { params: any, error: string }} argsAt */
  function component(t, c, env, argsAt) {
    /** @param {any} x */
    const comp = (x) => {
      if (x.t !== "idx" || x.a.t !== "id" || !fixed(x.i, c)) return null;
      const n = c.nodes.find((/** @type {any} */ y) => y.name === x.a.name);
      if (!n || n.type !== "var" || n.law.kind !== "copula") return null;
      const j = E.compile(x.i, c.slots)(env);
      return typeof j === "number" && Number.isInteger(j) ? { node: n, j } : null;
    };
    if (t.t === "idx") { const r = comp(t); return r ? { ...r, law: null, params: null } : null; }
    if (t.t !== "id") return null;
    const n = c.nodes.find((/** @type {any} */ y) => y.name === t.name);
    if (!n || n.type !== "var" || !n.uTree || !n.constant || DEP_KIND.has(n.law.kind) || n.law.dim) return null;
    const r = comp(n.uTree);
    if (!r) return null;
    const pr = argsAt(n, env);
    return pr.error || n.law.check(pr.params).length ? null : { ...r, law: n.law, params: pr.params };
  }

  return { COPULAS, BY_ID, qnorm, tCdf, tPdf, tQuantile, bvn, bvnu, bvt, correlation, cholesky, positiveStable, logSeries, debye1, closed, inline };
});
