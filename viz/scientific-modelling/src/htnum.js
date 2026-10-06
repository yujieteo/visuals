/* Scientific Modelling: the numerical procedures of the piece 7 convection models. Each procedure is small,
 * deterministic and has fixed settings, so the page, the Node tests and the report give the same numbers:
 * classic fourth-order Runge-Kutta steps, a bracketed root search, composite Simpson quadrature, a banded LU solve
 * without pivoting for diagonally dominant finite-volume matrices, the Thomas algorithm in exact rationals, and
 * the observed order, Richardson extrapolation and grid convergence index of a mesh study. No procedure here gives
 * an "exact" status: every result that comes from it is a numerical check with a stated tolerance.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"));
  else (root.SM = root.SM || {}).HN = factory(root.SM.Q);
})(typeof self !== "undefined" ? self : this, function (Q) {
  "use strict";

  /**
   * Integrate y' = f(x, y) from x0 to x1 in n classic RK4 steps.
   * @param {(x: number, y: number[]) => number[]} f @param {number[]} y0 @param {number} x0 @param {number} x1 @param {number} n
   * @param {(x: number, y: number[]) => void} [visit] called at x0 and after every step
   */
  function rk4(f, y0, x0, x1, n, visit) {
    const h = (x1 - x0) / n;
    let y = y0.slice();
    let x = x0;
    visit?.(x, y);
    for (let i = 0; i < n; i++) {
      const k1 = f(x, y);
      const k2 = f(x + h / 2, y.map((v, j) => v + (h / 2) * k1[j]));
      const k3 = f(x + h / 2, y.map((v, j) => v + (h / 2) * k2[j]));
      const k4 = f(x + h, y.map((v, j) => v + h * k3[j]));
      y = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
      x = x0 + (i + 1) * h;
      visit?.(x, y);
    }
    return y;
  }

  /** A root of g in [a, b], where g(a) and g(b) differ in sign (the Illinois form of regula falsi). */
  function root(g, a, b, tol = 1e-13, maxit = 200) {
    let fa = g(a), fb = g(b);
    if (fa === 0) return a;
    if (fb === 0) return b;
    if (Math.sign(fa) === Math.sign(fb)) throw new RangeError("the bracket does not hold a sign change");
    let side = 0;
    for (let i = 0; i < maxit; i++) {
      const c = (a * fb - b * fa) / (fb - fa);
      const fc = g(c);
      if (Math.abs(b - a) < tol * Math.max(1, Math.abs(c)) || fc === 0) return c;
      if (Math.sign(fc) === Math.sign(fb)) {
        b = c; fb = fc;
        if (side === -1) fa /= 2;
        side = -1;
      } else {
        a = c; fa = fc;
        if (side === 1) fb /= 2;
        side = 1;
      }
    }
    return (a + b) / 2;
  }

  /** Composite Simpson quadrature of equally spaced values (an even number of intervals). @param {number[]} v @param {number} h */
  function simpson(v, h) {
    const n = v.length - 1;
    if (n < 2 || n % 2) throw new RangeError("Simpson's rule needs an even number of intervals");
    let s = v[0] + v[n];
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * v[i];
    return (s * h) / 3;
  }

  /**
   * A banded matrix of size n with half-bandwidth w, stored row by row, and its LU solve without pivoting. The
   * finite-volume matrices of the piece are diagonally dominant, so the solve needs no pivot.
   */
  function band(n, w) {
    const W = 2 * w + 1;
    const a = new Float64Array(n * W);
    return {
      n, w,
      /** Add v to entry (i, j); |i - j| must be at most w. */
      add(i, j, v) { a[i * W + (j - i + w)] += v; },
      get(i, j) { return Math.abs(i - j) > w ? 0 : a[i * W + (j - i + w)]; },
      /** Solve A x = b in place of a copy of b; A is overwritten by its factors. @param {Float64Array | number[]} b */
      solve(b) {
        const x = Float64Array.from(b);
        for (let k = 0; k < n; k++) {
          const piv = a[k * W + w];
          if (piv === 0) throw new RangeError("a zero pivot");
          const last = Math.min(n - 1, k + w);
          for (let i = k + 1; i <= last; i++) {
            const lik = a[i * W + (k - i + w)] / piv;
            if (lik === 0) continue;
            a[i * W + (k - i + w)] = 0;
            for (let j = k + 1; j <= Math.min(n - 1, k + w); j++) a[i * W + (j - i + w)] -= lik * a[k * W + (j - k + w)];
            x[i] -= lik * x[k];
          }
        }
        for (let k = n - 1; k >= 0; k--) {
          let s = x[k];
          for (let j = k + 1; j <= Math.min(n - 1, k + w); j++) s -= a[k * W + (j - k + w)] * x[j];
          x[k] = s / a[k * W + w];
        }
        return x;
      },
    };
  }

  /**
   * The Thomas algorithm in exact rationals: lower[i] x[i-1] + diag[i] x[i] + upper[i] x[i+1] = rhs[i].
   * @param {any[]} lower @param {any[]} diag @param {any[]} upper @param {any[]} rhs
   */
  function thomasExact(lower, diag, upper, rhs) {
    const n = diag.length;
    const c = new Array(n), d = new Array(n);
    c[0] = Q.div(upper[0] ?? Q.ZERO, diag[0]);
    d[0] = Q.div(rhs[0], diag[0]);
    for (let i = 1; i < n; i++) {
      const m = Q.sub(diag[i], Q.mul(lower[i], c[i - 1]));
      c[i] = i < n - 1 ? Q.div(upper[i], m) : Q.ZERO;
      d[i] = Q.div(Q.sub(rhs[i], Q.mul(lower[i], d[i - 1])), m);
    }
    const x = new Array(n);
    x[n - 1] = d[n - 1];
    for (let i = n - 2; i >= 0; i--) x[i] = Q.sub(d[i], Q.mul(c[i], x[i + 1]));
    return x;
  }

  /**
   * A mesh study from three results on meshes refined by the ratio r (coarse, medium, fine): the observed order
   * p, the Richardson extrapolation and the grid convergence index of the fine result (safety factor 1.25).
   * @param {number} f3 coarse @param {number} f2 medium @param {number} f1 fine @param {number} r
   */
  function meshStudy(f3, f2, f1, r) {
    const e32 = f3 - f2, e21 = f2 - f1;
    const monotone = e32 !== 0 && e21 !== 0 && Math.sign(e32) === Math.sign(e21);
    const p = monotone ? Math.log(Math.abs(e32 / e21)) / Math.log(r) : NaN;
    const extrapolated = monotone ? f1 - e21 / (r ** p - 1) : NaN;
    const gci = monotone ? (1.25 * Math.abs(e21 / f1)) / (r ** p - 1) : NaN;
    return { values: [f3, f2, f1], ratio: r, monotone, p, extrapolated, gci };
  }

  /** The observed order between two errors on meshes refined by the ratio r. */
  const order = (eCoarse, eFine, r = 2) => Math.log(Math.abs(eCoarse / eFine)) / Math.log(r);

  /** Short decimal text with s significant digits. */
  function fmt(x, s = 6) {
    if (!Number.isFinite(x)) return String(x);
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e7) return String(Number(x.toPrecision(s)));
    const [m, e] = x.toExponential(s - 1).split("e");
    return `${Number(m)}×10^${Number(e)}`;
  }
  /** The same number in TeX. */
  function fmtTex(x, s = 6) {
    const t = fmt(x, s);
    const m = /^(-?[\d.]+)×10\^(-?\d+)$/.exec(t);
    return m ? `${m[1]}\\times 10^{${m[2]}}` : t;
  }

  return { rk4, root, simpson, band, thomasExact, meshStudy, order, fmt, fmtTex };
});
