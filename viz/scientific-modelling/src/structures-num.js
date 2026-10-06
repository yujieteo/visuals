/* Scientific Modelling: the numerical and exact tools of the structures families (piece 5). Dense linear solves,
 * Cholesky, the cyclic Jacobi method for symmetric eigenproblems and the symmetric generalized eigenproblem, RK4,
 * conjugate gradients, the AGM for the complete elliptic integral K, the Hermite cubic beam element, and three
 * small exact algebras: polynomials with rational coefficients, sums of c·π^p·sin(kπX) and c·π^p·cos(kπX) with
 * rational c and k, and e^(−ξ)(a cos ξ + b sin ξ) with rational a and b. Every routine is deterministic and has no
 * state, so the same inputs always give the same numbers.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"));
  else (root.SM = root.SM || {}).SN = factory(root.SM.Q);
})(typeof self !== "undefined" ? self : this, function (Q) {
  "use strict";

  /* ---------- dense linear algebra (floating point) ---------- */

  const zeros = (n, m) => Array.from({ length: n }, () => new Array(m).fill(0));

  /** x with A x = b, by Gaussian elimination with partial pivoting; null when A is singular. */
  function solve(A0, b0) {
    const n = b0.length;
    const A = A0.map((r) => r.slice()), b = b0.slice();
    for (let k = 0; k < n; k++) {
      let p = k;
      for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
      if (Math.abs(A[p][k]) < 1e-300) return null;
      [A[k], A[p]] = [A[p], A[k]];
      [b[k], b[p]] = [b[p], b[k]];
      for (let i = k + 1; i < n; i++) {
        const f = A[i][k] / A[k][k];
        if (f === 0) continue;
        for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
        b[i] -= f * b[k];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }

  /** The lower factor L of a symmetric positive definite A = L Lᵀ, or null. */
  function cholesky(A) {
    const n = A.length, L = zeros(n, n);
    for (let j = 0; j < n; j++) {
      let s = A[j][j];
      for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
      if (!(s > 0)) return null;
      L[j][j] = Math.sqrt(s);
      for (let i = j + 1; i < n; i++) {
        let t = A[i][j];
        for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k];
        L[i][j] = t / L[j][j];
      }
    }
    return L;
  }

  /** Eigenvalues (ascending) and eigenvectors (columns of V) of a symmetric matrix, by cyclic Jacobi rotations. */
  function jacobi(A0, tol = 1e-13, maxSweeps = 60) {
    const n = A0.length;
    const A = A0.map((r) => r.slice()), V = zeros(n, n);
    for (let i = 0; i < n; i++) V[i][i] = 1;
    let sweeps = 0;
    for (; sweeps < maxSweeps; sweeps++) {
      let off = 0, scale = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) (i === j ? (scale += A[i][j] * A[i][j]) : (off += A[i][j] * A[i][j]));
      if (off <= tol * tol * Math.max(scale, 1e-300)) break;
      for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
    const order = [...Array(n).keys()].sort((i, j) => A[i][i] - A[j][j]);
    return { values: order.map((i) => A[i][i]), vectors: order.map((i) => V.map((r) => r[i])), sweeps };
  }

  /** Lower-triangular solve L y = b. */
  function forward(L, b) {
    const n = b.length, y = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
      y[i] = s / L[i][i];
    }
    return y;
  }
  /** Upper solve Lᵀ x = y. */
  function backward(L, y) {
    const n = y.length, x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
      x[i] = s / L[i][i];
    }
    return x;
  }

  /**
   * The symmetric generalized eigenproblem K v = λ M v with M positive definite: L = chol(M), C = L⁻¹ K L⁻ᵀ, then
   * Jacobi on C. Returns ascending λ and the vectors v = L⁻ᵀ y, each scaled so that vᵀ M v = 1.
   */
  function geneig(K, M) {
    const L = cholesky(M);
    if (!L) return null;
    const n = K.length;
    const cols = [];
    for (let j = 0; j < n; j++) cols.push(forward(L, K.map((r) => r[j])));
    const B = zeros(n, n); // B = L⁻¹ K (columns), then C = B L⁻ᵀ = (L⁻¹ Bᵀ)ᵀ
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) B[i][j] = cols[j][i];
    const C = zeros(n, n);
    for (let i = 0; i < n; i++) {
      const row = forward(L, B[i]);
      for (let j = 0; j < n; j++) C[i][j] = row[j];
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = (C[i][j] + C[j][i]) / 2; C[i][j] = a; C[j][i] = a; }
    const e = jacobi(C);
    return { values: e.values, vectors: e.vectors.map((y) => backward(L, y)), sweeps: e.sweeps };
  }

  /** Conjugate gradients for a symmetric positive definite operator: x with A x = b to a relative residual tol. */
  function cg(apply, b, tol = 1e-12, maxit = 10000) {
    const n = b.length;
    const x = new Array(n).fill(0), r = b.slice(), p = b.slice();
    const dotv = (u, v) => { let s = 0; for (let i = 0; i < n; i++) s += u[i] * v[i]; return s; };
    let rr = dotv(r, r);
    const bb = Math.sqrt(rr) || 1;
    let it = 0;
    for (; it < maxit && Math.sqrt(rr) > tol * bb; it++) {
      const Ap = apply(p);
      const a = rr / dotv(p, Ap);
      for (let i = 0; i < n; i++) { x[i] += a * p[i]; r[i] -= a * Ap[i]; }
      const rr2 = dotv(r, r);
      const beta = rr2 / rr;
      rr = rr2;
      for (let i = 0; i < n; i++) p[i] = r[i] + beta * p[i];
    }
    return { x, iterations: it, residual: Math.sqrt(rr) / bb };
  }

  /* ---------- ODEs, quadrature and special functions ---------- */

  /** Classical RK4 for y' = f(s, y) from a to b in n equal steps. With `keep`, every state is returned. */
  function rk4(f, y0, a, b, n, keep = false) {
    const h = (b - a) / n;
    let y = y0.slice();
    const path = keep ? [y.slice()] : null;
    const add = (u, v, k) => u.map((x, i) => x + k * v[i]);
    for (let i = 0; i < n; i++) {
      const s = a + i * h;
      const k1 = f(s, y), k2 = f(s + h / 2, add(y, k1, h / 2)), k3 = f(s + h / 2, add(y, k2, h / 2)), k4 = f(s + h, add(y, k3, h));
      y = y.map((x, j) => x + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
      if (keep) path.push(y.slice());
    }
    return keep ? { y, path } : { y };
  }

  /** Composite Simpson's rule over equally spaced values (an even number of intervals). */
  function simpson(values, h) {
    const n = values.length - 1;
    let s = values[0] + values[n];
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * values[i];
    return (s * h) / 3;
  }

  /** The complete elliptic integral of the first kind K(m), m = k², by the arithmetic-geometric mean. */
  function ellipK(m) {
    if (!(m < 1)) return Infinity;
    let a = 1, g = Math.sqrt(1 - m);
    for (let i = 0; i < 40 && Math.abs(a - g) > 1e-16 * a; i++) [a, g] = [(a + g) / 2, Math.sqrt(a * g)];
    return Math.PI / (2 * a);
  }

  /** Observed orders of convergence p_i = log(e_i / e_(i+1)) / log(h_i / h_(i+1)). */
  const orders = (errors, hs) => errors.slice(1).map((e, i) => (errors[i] > 0 && e > 0 ? Math.log(errors[i] / e) / Math.log(hs[i] / hs[i + 1]) : null));

  /* ---------- the Hermite cubic beam element on [0, 1] ---------- */

  /**
   * Global matrices of n equal Hermite cubic elements on [0, 1] with unit stiffness, mass and axial load: the
   * bending stiffness K (∫ w''² ), the consistent mass M (∫ w²), the geometric stiffness G (∫ w'²) and the
   * consistent load f of a unit uniform load (∫ w). Degrees of freedom: w and w' at each node, in node order.
   */
  function beamFE(n) {
    const h = 1 / n, N = 2 * (n + 1);
    const K = zeros(N, N), M = zeros(N, N), G = zeros(N, N), f = new Array(N).fill(0);
    const h2 = h * h, h3 = h2 * h;
    const ke = [[12, 6 * h, -12, 6 * h], [6 * h, 4 * h2, -6 * h, 2 * h2], [-12, -6 * h, 12, -6 * h], [6 * h, 2 * h2, -6 * h, 4 * h2]].map((r) => r.map((x) => x / h3));
    const me = [[156, 22 * h, 54, -13 * h], [22 * h, 4 * h2, 13 * h, -3 * h2], [54, 13 * h, 156, -22 * h], [-13 * h, -3 * h2, -22 * h, 4 * h2]].map((r) => r.map((x) => (x * h) / 420));
    const ge = [[36, 3 * h, -36, 3 * h], [3 * h, 4 * h2, -3 * h, -h2], [-36, -3 * h, 36, -3 * h], [3 * h, -h2, -3 * h, 4 * h2]].map((r) => r.map((x) => x / (30 * h)));
    const fe = [h / 2, h2 / 12, h / 2, -h2 / 12];
    for (let e = 0; e < n; e++) {
      const dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (let a = 0; a < 4; a++) {
        f[dofs[a]] += fe[a];
        for (let b = 0; b < 4; b++) { K[dofs[a]][dofs[b]] += ke[a][b]; M[dofs[a]][dofs[b]] += me[a][b]; G[dofs[a]][dofs[b]] += ge[a][b]; }
      }
    }
    return { n, h, N, K, M, G, f };
  }
  /** The degrees of freedom that supports fix: pinned fixes w, clamped fixes w and w', free fixes none. */
  function fixedDofs(n, left, right) {
    const end = (node, type) => (type === "clamped" ? [2 * node, 2 * node + 1] : type === "pinned" ? [2 * node] : []);
    return [...end(0, left), ...end(n, right)];
  }
  /** A matrix or vector without the fixed rows and columns. */
  function reduce(A, keep) {
    return Array.isArray(A[0]) ? keep.map((i) => keep.map((j) => A[i][j])) : keep.map((i) => A[i]);
  }

  /* ---------- exact algebra 1: polynomials with rational coefficients ---------- */

  /** A polynomial is an array of rationals, lowest power first. */
  const poly = (cs) => cs.map((c) => Q.of(c));
  const pderiv = (p) => p.slice(1).map((c, i) => Q.mul(c, Q.q(BigInt(i + 1))));
  const peval = (p, x) => p.reduceRight((s, c) => Q.add(Q.mul(s, x), c), Q.ZERO);
  const pzero = (p) => p.every(Q.isZero);
  /** p - q. */
  const psub = (p, q) => Array.from({ length: Math.max(p.length, q.length) }, (_, i) => Q.sub(p[i] ?? Q.ZERO, q[i] ?? Q.ZERO));
  /** The k-th derivative. */
  const pderivN = (p, k) => { let r = p; for (let i = 0; i < k; i++) r = pderiv(r); return r; };

  /* ---------- exact algebra 2: c·π^p·sin(kπX) and c·π^p·cos(kπX) ---------- */

  /**
   * A trigonometric term { c, p, fn, k }: c·π^p·fn(kπX), with rational c and k and an integer p ≥ 0. A sum is a
   * list of terms. d/dX of sin(kπX) is kπ·cos(kπX), and of cos(kπX) is −kπ·sin(kπX).
   */
  function tderiv(terms) {
    return terms.map((t) => ({ c: t.fn === "sin" ? Q.mul(t.c, t.k) : Q.neg(Q.mul(t.c, t.k)), p: t.p + 1, fn: t.fn === "sin" ? "cos" : "sin", k: t.k }))
      .filter((t) => !Q.isZero(t.c));
  }
  const tderivN = (terms, n) => { let r = terms; for (let i = 0; i < n; i++) r = tderiv(r); return r; };
  /** Collect like terms; a constant is the term cos(0·πX). */
  function tcollect(terms) {
    const map = new Map();
    for (const t of terms) {
      const fn = Q.isZero(t.k) ? "cos" : t.fn;
      if (fn === "sin" && Q.isZero(t.k)) continue;
      const key = `${t.p}|${fn}|${Q.str(Q.abs(t.k))}`;
      // sin(−x) = −sin(x), cos(−x) = cos(x)
      const sign = fn === "sin" && Q.sign(t.k) < 0 ? -1 : 1;
      const c = sign < 0 ? Q.neg(t.c) : t.c;
      map.set(key, { ...(map.get(key) ?? { c: Q.ZERO, p: t.p, fn, k: Q.abs(t.k) }), c: Q.add(map.get(key)?.c ?? Q.ZERO, c) });
    }
    return [...map.values()].filter((t) => !Q.isZero(t.c));
  }
  const tscale = (terms, c, p = 0) => terms.map((t) => ({ ...t, c: Q.mul(t.c, c), p: t.p + p }));
  /**
   * The exact value at a rational X where every kX is a multiple of 1/2, as a sum over powers of π: { p: c }.
   * Returns null when a sine or cosine has no rational value there.
   */
  function tvalue(terms, X) {
    const out = {};
    for (const t of terms) {
      const half = Q.mul(Q.mul(t.k, X), Q.q(2n)); // 2kX must be an integer
      if (!Q.isInteger(half)) return null;
      const m = ((Number(half.n) % 4) + 4) % 4; // kπX = mπ/2
      const v = t.fn === "sin" ? [0, 1, 0, -1][m] : [1, 0, -1, 0][m];
      if (v) out[t.p] = Q.add(out[t.p] ?? Q.ZERO, Q.mul(t.c, Q.q(BigInt(v))));
    }
    for (const k of Object.keys(out)) if (Q.isZero(out[k])) delete out[k];
    return out;
  }

  /* ---------- exact algebra 3: e^(−ξ)(a cos ξ + b sin ξ) ---------- */

  /** d/dξ of e^(−ξ)(a cos ξ + b sin ξ) is e^(−ξ)((b − a) cos ξ + (−a − b) sin ξ). */
  const ederiv = ([a, b]) => [Q.sub(b, a), Q.neg(Q.add(a, b))];
  const ederivN = (ab, n) => { let r = ab; for (let i = 0; i < n; i++) r = ederiv(r); return r; };

  return { zeros, solve, cholesky, jacobi, geneig, cg, rk4, simpson, ellipK, orders, beamFE, fixedDofs, reduce,
    poly, pderiv, pderivN, peval, pzero, psub, tderiv, tderivN, tcollect, tscale, tvalue, ederiv, ederivN };
});
