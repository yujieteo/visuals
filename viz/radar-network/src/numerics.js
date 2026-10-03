/* Radar network visualiser: numerical building blocks.
 *
 * Special functions (log-gamma, regularised incomplete gamma and its inverse, the noncentral chi-square
 * tail, Bessel J0 and J1), quadrature, root finding, the seeded random streams, the FFT (radix 2 and
 * Bluestein for any length) and the Wilson interval. Plain functions of numbers: no DOM, no state.
 * Loaded as a classic script in the page and its worker (RadarNet.numerics) and with require() in tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.RadarNet = root.RadarNet || {}).numerics = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ===== CONSTANTS ===== */
  const C = 299792458; // speed of light, m/s (exact)
  const K_B = 1.380649e-23; // Boltzmann constant, J/K (exact)
  const TWO_PI = 2 * Math.PI;

  /* ===== UNITS ===== */
  const dbToLin = (db) => Math.pow(10, db / 10);
  const linToDb = (x) => (x > 0 ? 10 * Math.log10(x) : x === 0 ? -Infinity : NaN);
  const dbToAmp = (db) => Math.pow(10, db / 20);
  const deg = (rad) => (rad * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;

  /* ===== GAMMA FUNCTIONS ===== */
  // Lanczos approximation, g = 7, n = 9: relative error about 1e-15 for x > 0.
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) {
    if (!(x > 0)) {
      if (x === 0) return Infinity;
      return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    }
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return 0.5 * Math.log(TWO_PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  /** Regularised incomplete gamma: { P, Q } with P + Q = 1, each accurate where it is the smaller one. */
  function gammaPQ(a, x) {
    if (!(a > 0) || !(x >= 0) || !Number.isFinite(a)) throw new RangeError(`gammaPQ: invalid a=${a}, x=${x}`);
    if (x === 0) return { P: 0, Q: 1 };
    if (x === Infinity) return { P: 1, Q: 0 };
    const logPre = a * Math.log(x) - x - lgamma(a);
    if (x < a + 1) {
      // Series for P.
      let ap = a, del = 1 / a, sum = del;
      for (let n = 0; n < 100000; n++) {
        ap += 1;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-17) break;
      }
      const P = Math.exp(logPre) * sum;
      return { P: Math.min(P, 1), Q: Math.max(1 - P, 0) };
    }
    // Continued fraction for Q (modified Lentz).
    const tiny = 1e-300;
    let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
    for (let i = 1; i < 100000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < tiny) d = tiny;
      c = b + an / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    const Q = Math.exp(logPre) * h;
    return { P: Math.max(1 - Q, 0), Q: Math.min(Q, 1) };
  }

  /** x such that Q(a, x) = q, for 0 < q < 1 (bracketed, then refined in log space). */
  function gammaQInv(a, q) {
    if (!(q > 0 && q < 1)) throw new RangeError("gammaQInv: q must be in (0, 1)");
    // Q decreases in x. Bracket.
    let lo = 0, hi = Math.max(1, a);
    while (gammaPQ(a, hi).Q > q) { lo = hi; hi *= 2; if (hi > 1e12) throw new RangeError("gammaQInv: no bracket"); }
    const target = Math.log(q);
    const f = (x) => { const r = gammaPQ(a, x); return (r.Q > 0 ? Math.log(r.Q) : -1e300) - target; };
    for (let i = 0; i < 200; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(mid) > 0) lo = mid; else hi = mid;
      if (hi - lo <= 1e-14 * hi) break;
    }
    return 0.5 * (lo + hi);
  }

  /* ===== NONCENTRAL CHI-SQUARE ===== */
  /**
   * Tail of the noncentral chi-square distribution with k degrees of freedom and noncentrality lambda at x:
   * { sf: P(X > x), cdf: P(X <= x), terms, bound }. A Poisson mixture of central chi-square tails, summed from
   * the mode outward until the remaining Poisson mass is below 1e-20. Far outside the bulk the result is the
   * Laurent-Massart / Birge exponential bound instead (bound names which side), so no term count explodes.
   */
  function ncx2Tail(x, k, lambda) {
    if (!(k > 0) || !(lambda >= 0) || !(x >= 0)) throw new RangeError(`ncx2Tail: invalid x=${x}, k=${k}, lambda=${lambda}`);
    const a0 = k / 2, y = x / 2;
    if (lambda === 0) { const r = gammaPQ(a0, y); return { sf: r.Q, cdf: r.P, terms: 1, bound: null }; }
    const m = k + lambda, v = k + 2 * lambda, Y = 50;
    if (x < m - 2 * Math.sqrt(v * Y)) return { sf: 1, cdf: Math.exp(-Y), terms: 0, bound: "cdf" };
    if (x > m + 2 * Math.sqrt(v * Y) + 2 * Y) return { sf: Math.exp(-Y), cdf: 1, terms: 0, bound: "sf" };
    const mu = lambda / 2;
    const j0 = Math.floor(mu);
    const logw = (j) => -mu + j * Math.log(mu) - lgamma(j + 1);
    let sf = 0, cdf = 0, mass = 0, terms = 0;
    for (let j = j0; j >= 0; j--) {
      const w = Math.exp(logw(j));
      const r = gammaPQ(a0 + j, y);
      sf += w * r.Q; cdf += w * r.P; mass += w; terms++;
      if (w < 1e-22 && j < j0 - 5) break;
    }
    for (let j = j0 + 1; ; j++) {
      const w = Math.exp(logw(j));
      const r = gammaPQ(a0 + j, y);
      sf += w * r.Q; cdf += w * r.P; mass += w; terms++;
      if (w < 1e-22 && j > j0 + 5) break;
      if (terms > 2e6) throw new Error("ncx2Tail: series did not converge");
    }
    // Normalise by the summed Poisson mass (it differs from 1 by less than 1e-15).
    return { sf: Math.min(sf / mass, 1), cdf: Math.min(cdf / mass, 1), terms, bound: null };
  }

  /** Marcum Q1(a, b) = P(|s + n|^2 > b^2/2 ...) in the chi-square form: ncx2 sf at b^2, 2 dof, noncentrality a^2. */
  const marcumQ1 = (a, b) => ncx2Tail(b * b, 2, a * a);

  /* ===== BESSEL J0, J1 ===== */
  function besselJ(n, x) {
    // n = 0 or 1. Power series for |x| <= 12 (loses at most 4 digits), Hankel asymptotic series above.
    const ax = Math.abs(x);
    if (ax <= 12) {
      const q = -(x * x) / 4;
      let term = n === 0 ? 1 : x / 2, sum = term;
      for (let k = 1; k < 200; k++) {
        term *= q / (k * (k + n));
        sum += term;
        if (Math.abs(term) < 1e-18 * Math.max(1, Math.abs(sum))) break;
      }
      return sum;
    }
    // P ~ sum_k (-1)^k a_2k / x^2k and Q ~ sum_k (-1)^k a_(2k+1) / x^(2k+1), with
    // a_m = (mu - 1^2)(mu - 3^2)...(mu - (2m-1)^2) / (m! 8^m) and mu = 4 n^2. Stop at the smallest term.
    const mu = 4 * n * n;
    let P = 1, Q = 0, t = 1, last = Infinity;
    for (let m = 1; m < 60; m++) {
      t *= (mu - (2 * m - 1) * (2 * m - 1)) / (m * 8 * ax);
      if (Math.abs(t) > last) break;
      last = Math.abs(t);
      const sign = Math.floor(m / 2) % 2 === 0 ? 1 : -1;
      if (m % 2 === 0) P += sign * t; else Q += sign * t;
      if (last < 1e-17) break;
    }
    const chi = ax - (n / 2 + 0.25) * Math.PI;
    const v = Math.sqrt(2 / (Math.PI * ax)) * (P * Math.cos(chi) - Q * Math.sin(chi));
    return n === 1 && x < 0 ? -v : v;
  }
  const besselJ0 = (x) => besselJ(0, x);
  const besselJ1 = (x) => besselJ(1, x);

  /* ===== QUADRATURE ===== */
  const GL_CACHE = new Map();
  /** Gauss-Legendre nodes and weights on [-1, 1]. */
  function gaussLegendre(n) {
    if (GL_CACHE.has(n)) return GL_CACHE.get(n);
    const x = new Float64Array(n), w = new Float64Array(n);
    for (let i = 0; i < Math.ceil(n / 2); i++) {
      let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), pp = 0;
      for (let it = 0; it < 100; it++) {
        let p1 = 1, p2 = 0;
        for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
        pp = (n * (z * p1 - p2)) / (z * z - 1);
        const z1 = z;
        z = z1 - p1 / pp;
        if (Math.abs(z - z1) < 1e-15) break;
      }
      x[i] = -z; x[n - 1 - i] = z;
      w[i] = w[n - 1 - i] = 2 / ((1 - z * z) * pp * pp);
    }
    const r = { x, w };
    GL_CACHE.set(n, r);
    return r;
  }
  /** Composite Gauss-Legendre: `panels` equal panels of `order` points on [a, b]. */
  function integrate(f, a, b, panels = 32, order = 16) {
    const { x, w } = gaussLegendre(order);
    const h = (b - a) / panels;
    let sum = 0;
    for (let p = 0; p < panels; p++) {
      const c = a + (p + 0.5) * h;
      for (let i = 0; i < order; i++) sum += w[i] * f(c + 0.5 * h * x[i]);
    }
    return 0.5 * h * sum;
  }
  /** Integrate and report the change when the panel count doubles: { value, error, panels }. */
  function integrateChecked(f, a, b, panels = 16, order = 16, tol = 1e-10, maxPanels = 4096) {
    let prev = integrate(f, a, b, panels, order), err = NaN, p = panels * 2;
    for (; p <= maxPanels; p *= 2) {
      const next = integrate(f, a, b, p, order);
      err = Math.abs(next - prev);
      prev = next;
      if (err <= tol * Math.max(1, Math.abs(next))) return { value: next, error: err, panels: p, converged: true };
    }
    return { value: prev, error: err, panels: p / 2, converged: false };
  }

  /* ===== ROOTS ===== */
  /** Bisection on a bracket [lo, hi] where f changes sign; returns { x, iterations, bracket }. */
  function bisect(f, lo, hi, tol = 1e-12, maxIter = 300) {
    let flo = f(lo), fhi = f(hi);
    if (Number.isNaN(flo) || Number.isNaN(fhi)) throw new RangeError("bisect: NaN at the bracket");
    if (flo === 0) return { x: lo, iterations: 0 };
    if (fhi === 0) return { x: hi, iterations: 0 };
    if (flo * fhi > 0) throw new RangeError("bisect: no sign change in the bracket");
    let i = 0;
    for (; i < maxIter && hi - lo > tol; i++) {
      const mid = 0.5 * (lo + hi), fm = f(mid);
      if (fm === 0) return { x: mid, iterations: i + 1 };
      if (fm * flo < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return { x: 0.5 * (lo + hi), iterations: i };
  }

  /* ===== SEEDED RANDOM STREAMS ===== */
  // cyrb128 string hash into four 32-bit words, and the sfc32 generator. A stream's name lists the seed,
  // the object IDs, the dwell index and the process, so reordering objects never changes a stream.
  function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
      const k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  /** A deterministic stream for (seed, ...parts): uniform in (0, 1), normal, complex normal, exponential, gamma(2, 1/2). */
  function stream(seed, ...parts) {
    const key = [String(seed), ...parts.map(String)].join("|");
    const s = cyrb128(key);
    const u32 = sfc32(s[0], s[1], s[2], s[3]);
    for (let i = 0; i < 12; i++) u32();
    const uniform = () => { let u; do { u = u32() + u32() / 4294967296; } while (u <= 0 || u >= 1); return u; };
    let spare = null;
    const normal = () => {
      if (spare !== null) { const v = spare; spare = null; return v; }
      const u1 = uniform(), u2 = uniform();
      const r = Math.sqrt(-2 * Math.log(u1));
      spare = r * Math.sin(TWO_PI * u2);
      return r * Math.cos(TWO_PI * u2);
    };
    return {
      key,
      uniform,
      normal,
      /** Complex normal with E|z|^2 = variance: each quadrature has variance/2. */
      cnormal(variance) { const s2 = Math.sqrt(variance / 2); return [s2 * normal(), s2 * normal()]; },
      exponential: () => -Math.log(uniform()),
      /** Gamma, shape 2 and scale 1/2: unit mean (Swerling 3 and 4). */
      gamma2: () => (-Math.log(uniform()) - Math.log(uniform())) / 2,
      phase: () => TWO_PI * uniform(),
    };
  }

  /* ===== FFT ===== */
  const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
  const nextPow2 = (n) => { let p = 1; while (p < n) p *= 2; return p; };
  /** In-place radix-2 FFT of (re, im). sign = -1 forward, +1 inverse (unscaled). */
  function fft2(re, im, sign = -1) {
    const n = re.length;
    if (!isPow2(n)) throw new RangeError("fft2: length must be a power of 2");
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (sign * TWO_PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  const BLUE = new Map();
  /** DFT of any length (Bluestein), returned as new arrays. sign = -1 forward, +1 inverse (unscaled). */
  function dft(re, im, sign = -1) {
    const n = re.length;
    if (isPow2(n)) { const r = Float64Array.from(re), i = Float64Array.from(im); fft2(r, i, sign); return [r, i]; }
    const m = nextPow2(2 * n - 1);
    const key = `${n}:${sign}`;
    let pre = BLUE.get(key);
    if (!pre) {
      const cr = new Float64Array(n), ci = new Float64Array(n);
      for (let k = 0; k < n; k++) { const a = (sign * Math.PI * ((k * k) % (2 * n))) / n; cr[k] = Math.cos(a); ci[k] = Math.sin(a); }
      const br = new Float64Array(m), bi = new Float64Array(m);
      br[0] = cr[0]; bi[0] = -ci[0];
      for (let k = 1; k < n; k++) { br[k] = br[m - k] = cr[k]; bi[k] = bi[m - k] = -ci[k]; }
      fft2(br, bi, -1);
      pre = { cr, ci, br, bi };
      BLUE.set(key, pre);
    }
    const ar = new Float64Array(m), ai = new Float64Array(m);
    for (let k = 0; k < n; k++) { ar[k] = re[k] * pre.cr[k] - im[k] * pre.ci[k]; ai[k] = re[k] * pre.ci[k] + im[k] * pre.cr[k]; }
    fft2(ar, ai, -1);
    for (let k = 0; k < m; k++) { const r = ar[k] * pre.br[k] - ai[k] * pre.bi[k]; ai[k] = ar[k] * pre.bi[k] + ai[k] * pre.br[k]; ar[k] = r; }
    fft2(ar, ai, 1);
    const or = new Float64Array(n), oi = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const xr = ar[k] / m, xi = ai[k] / m;
      or[k] = xr * pre.cr[k] - xi * pre.ci[k]; oi[k] = xr * pre.ci[k] + xi * pre.cr[k];
    }
    return [or, oi];
  }

  /* ===== STATISTICS ===== */
  /** Wilson score interval for k successes in n trials at confidence z (1.959964 for 95%). */
  function wilson(k, n, z = 1.959963984540054) {
    if (!(n > 0)) return { p: NaN, lo: NaN, hi: NaN };
    const p = k / n, z2 = z * z, den = 1 + z2 / n;
    const c = (p + z2 / (2 * n)) / den;
    const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
    return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
  }

  /* ===== VECTORS ===== */
  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vnorm = (a) => Math.hypot(a[0], a[1], a[2]);
  const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vunit = (a) => { const n = vnorm(a); return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [NaN, NaN, NaN]; };

  /* ===== FORMATTING ===== */
  /** n significant digits, plain or scientific, with a real minus sign never added: callers decide. */
  function sig(x, n = 4) {
    if (x === 0) return "0";
    if (!Number.isFinite(x)) return x > 0 ? "∞" : x < 0 ? "−∞" : "NaN";
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -3 && e < 6) return Number(x.toPrecision(n)).toString();
    return x.toExponential(n - 1);
  }

  return {
    C, K_B, TWO_PI,
    dbToLin, linToDb, dbToAmp, deg, rad,
    lgamma, gammaPQ, gammaQInv, ncx2Tail, marcumQ1, besselJ0, besselJ1,
    gaussLegendre, integrate, integrateChecked, bisect,
    cyrb128, stream,
    isPow2, nextPow2, fft2, dft,
    wilson,
    vsub, vadd, vscale, vdot, vnorm, vcross, vunit,
    sig,
  };
});
