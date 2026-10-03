/* Shear-tension interaction and the exact load-scale-factor margin (spec 5.5).
 *
 *   IF(k) = (k·Rs / Fs)^a + (Rt(k) / Ft)^b
 *
 * Shear scales linearly with the load multiplier k. Tension is re-evaluated
 * at the scaled load through `tensionAt(k)` (the prying and preload chain
 * once those exist), so a preload term does not scale with k.
 * MS = k* − 1 where IF(k*) = 1, solved by a bracketed Brent search. A failed
 * solve returns status "not-computed"; no fallback number is ever produced.
 */

export const PRESETS = {
  elliptical: { a: 2, b: 2, label: "Elliptical (2, 2)" },
  linear: { a: 1, b: 1, label: "Linear (1, 1)" },
};

export const K_TOL = 1e-12;
export const MAX_ITER = 200;
const K_MAX = 1e15;

/* Brent's method on [lo, hi] with f(lo)·f(hi) ≤ 0. Returns { root, iterations, converged, residual }. */
export function brent(f, lo, hi, { tol = K_TOL, maxIter = MAX_ITER } = {}) {
  let a = lo, b = hi, fa = f(a), fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || fa * fb > 0) return { root: NaN, iterations: 0, converged: false, residual: NaN };
  if (fa === 0) return { root: a, iterations: 0, converged: true, residual: 0 };
  if (fb === 0) return { root: b, iterations: 0, converged: true, residual: 0 };
  let c = a, fc = fa, d = b - a, e = d;
  for (let i = 1; i <= maxIter; i++) {
    if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol * Math.max(Math.abs(b), 1e-300);
    const m = 0.5 * (c - b);
    if (Math.abs(m) <= tol1 || fb === 0) return { root: b, iterations: i, converged: true, residual: fb };
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let p, q;
      const s = fb / fa;
      if (a === c) { p = 2 * m * s; q = 1 - s; }
      else {
        const r = fb / fc, t = fa / fc;
        p = s * (2 * m * t * (t - r) - (b - a) * (r - 1));
        q = (t - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q; else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
      else { d = m; e = d; }
    } else { d = m; e = d; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (m > 0 ? tol1 : -tol1);
    fb = f(b);
    if (!Number.isFinite(fb)) return { root: NaN, iterations: i, converged: false, residual: NaN };
  }
  return { root: b, iterations: maxIter, converged: false, residual: fb };
}

/* (value / allowable)^exp, with 0^exp = 0. */
const term = (value, allowable, exp) => (value <= 0 ? 0 : Math.pow(value / allowable, exp));

export function interactionValue(k, { Rs, tensionAt, Fs, Ft, a, b }) {
  return term(k * Rs, Fs, a) + term(tensionAt(k), Ft, b);
}

/*
 * Solve for k*. `tensionAt(k)` gives the tension used at load multiplier k
 * (≥ 0). Returns { status, IF1, IF0, kStar, ms, iterations, residual, bracket }:
 *   "ok"            MS = k* − 1
 *   "unloaded"      IF never reaches 1 (no load reaches this fastener): MS = ∞
 *   "preload"       IF(0) ≥ 1: preload alone exceeds the allowable (W-017)
 *   "not-computed"  the bracket or the Brent search failed (W-008)
 */
export function solveScale(input, { tol = K_TOL, maxIter = MAX_ITER } = {}) {
  const IF = (k) => interactionValue(k, input);
  const IF1 = IF(1), IF0 = IF(0);
  const base = { IF1, IF0, kStar: null, ms: null, iterations: 0, residual: null, bracket: null };
  if (!Number.isFinite(IF1) || !Number.isFinite(IF0)) return { ...base, status: "not-computed", reason: "IF is not finite" };
  if (IF0 >= 1) return { ...base, status: "preload" };
  const g = (k) => IF(k) - 1;
  let hi = 1;
  if (g(hi) < 0) {
    // Expand until IF ≥ 1; a fastener carrying no scalable load never gets there.
    while (g(hi) < 0 && hi < K_MAX) hi *= 2;
    if (g(hi) < 0) {
      const grows = IF(K_MAX) > IF0;
      return grows ? { ...base, status: "not-computed", reason: "no bracket below k = 1e15" } : { ...base, status: "unloaded", ms: Infinity, kStar: Infinity };
    }
  }
  const lo = hi === 1 ? 0 : hi / 2;
  const r = brent(g, lo, hi, { tol, maxIter });
  if (!r.converged || !(r.root > 0)) return { ...base, status: "not-computed", iterations: r.iterations, residual: r.residual, bracket: [lo, hi], reason: "Brent search did not converge" };
  return { ...base, status: "ok", kStar: r.root, ms: r.root - 1, iterations: r.iterations, residual: r.residual, bracket: [lo, hi] };
}
