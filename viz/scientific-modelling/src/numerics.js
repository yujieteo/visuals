/* Scientific Modelling: the numerical kernel of the stability and bifurcation analyses (piece 4). Dense LU with
 * partial pivoting (real and complex), the eigenvalues of a real matrix (balancing, Hessenberg reduction and the
 * Francis double-shift QR iteration), eigenvectors by inverse iteration, Chebyshev–Gauss–Lobatto nodes with
 * barycentric differentiation matrices and Clenshaw–Curtis weights, Newton's method, pseudo-arclength
 * continuation with fold, branch-point and Hopf test functions, a bracketed minimum and root, and an adaptive
 * Dormand–Prince integrator. Everything is floating point: a result of this module is a numerical check with a
 * stated tolerance, never an exact status.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.SM = root.SM || {}).NUM = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EPS = 2.220446049250313e-16;

  /* ---------- dense matrices: arrays of rows ---------- */

  const zeros = (n, m = n) => Array.from({ length: n }, () => new Float64Array(m));
  const eye = (n) => { const A = zeros(n); for (let i = 0; i < n; i++) A[i][i] = 1; return A; };
  const copy = (A) => A.map((r) => Float64Array.from(r));
  function matmul(A, B) {
    const n = A.length, k = B.length, m = B[0].length;
    const C = zeros(n, m);
    for (let i = 0; i < n; i++) {
      const Ai = A[i], Ci = C[i];
      for (let l = 0; l < k; l++) {
        const a = Ai[l];
        if (a === 0) continue;
        const Bl = B[l];
        for (let j = 0; j < m; j++) Ci[j] += a * Bl[j];
      }
    }
    return C;
  }
  function matvec(A, x) {
    const y = new Float64Array(A.length);
    for (let i = 0; i < A.length; i++) { let s = 0; const r = A[i]; for (let j = 0; j < x.length; j++) s += r[j] * x[j]; y[i] = s; }
    return y;
  }
  /** a*A + b*B. */
  function axpby(a, A, b, B) {
    return A.map((r, i) => { const o = new Float64Array(r.length); for (let j = 0; j < r.length; j++) o[j] = a * r[j] + b * B[i][j]; return o; });
  }
  const diag = (v) => { const A = zeros(v.length); v.forEach((x, i) => { A[i][i] = x; }); return A; };
  /** Scale row i of A by v[i]: diag(v) A. */
  const rowScale = (v, A) => A.map((r, i) => r.map((x) => x * v[i]));
  const norm2 = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0));
  const normInf = (x) => x.reduce((s, v) => Math.max(s, Math.abs(v)), 0);
  const matNormInf = (A) => A.reduce((s, r) => Math.max(s, r.reduce((t, v) => t + Math.abs(v), 0)), 0);

  /** Block matrix from a grid of blocks (null = zero block). */
  function blocks(grid) {
    const heights = grid.map((row) => row.find(Boolean).length);
    const widths = grid[0].map((_, j) => grid.find((row) => row[j])[j][0].length);
    const n = heights.reduce((a, b) => a + b, 0), m = widths.reduce((a, b) => a + b, 0);
    const out = zeros(n, m);
    let r0 = 0;
    grid.forEach((row, bi) => {
      let c0 = 0;
      row.forEach((B, bj) => {
        if (B) for (let i = 0; i < heights[bi]; i++) for (let j = 0; j < widths[bj]; j++) out[r0 + i][c0 + j] = B[i][j];
        c0 += widths[bj];
      });
      r0 += heights[bi];
    });
    return out;
  }

  /* ---------- LU with partial pivoting ---------- */

  /** LU factors of a square matrix (a copy), or null when a pivot is exactly zero. */
  function lu(A) {
    const n = A.length;
    const a = copy(A);
    const piv = new Int32Array(n);
    let sign = 1;
    for (let k = 0; k < n; k++) {
      let p = k, max = Math.abs(a[k][k]);
      for (let i = k + 1; i < n; i++) { const v = Math.abs(a[i][k]); if (v > max) { max = v; p = i; } }
      piv[k] = p;
      if (max === 0) return null;
      if (p !== k) { const t = a[p]; a[p] = a[k]; a[k] = t; sign = -sign; }
      const ak = a[k], d = ak[k];
      for (let i = k + 1; i < n; i++) {
        const ai = a[i];
        const f = ai[k] / d;
        if (f === 0) continue;
        ai[k] = f;
        for (let j = k + 1; j < n; j++) ai[j] -= f * ak[j];
      }
    }
    return { a, piv, sign, n };
  }
  /** Solve with LU factors. */
  function luSolve(F, b) {
    const { a, piv, n } = F;
    const x = Float64Array.from(b);
    for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { const t = x[p]; x[p] = x[k]; x[k] = t; } }
    for (let i = 1; i < n; i++) { let s = x[i]; const ai = a[i]; for (let j = 0; j < i; j++) s -= ai[j] * x[j]; x[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = x[i]; const ai = a[i]; for (let j = i + 1; j < n; j++) s -= ai[j] * x[j]; x[i] = s / ai[i]; }
    return x;
  }
  function solve(A, b) {
    const F = lu(A);
    return F ? luSolve(F, b) : null;
  }
  /** A^{-1} B, column by column. */
  function solveMatrix(A, B) {
    const F = lu(A);
    if (!F) return null;
    const n = B.length, m = B[0].length;
    const X = zeros(n, m);
    const col = new Float64Array(n);
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) col[i] = B[i][j];
      const x = luSolve(F, col);
      for (let i = 0; i < n; i++) X[i][j] = x[i];
    }
    return X;
  }
  /** Sign and log of |det A| (sign 0 for a singular matrix). */
  function logDet(A) {
    const F = lu(A);
    if (!F) return { sign: 0, log: -Infinity };
    let s = F.sign, l = 0;
    for (let i = 0; i < F.n; i++) { const d = F.a[i][i]; if (d < 0) s = -s; l += Math.log(Math.abs(d)); }
    return { sign: s, log: l };
  }

  /* ---------- complex LU, for shifted solves ---------- */

  /** LU of a complex matrix given as real and imaginary parts. */
  function luComplex(Re, Im) {
    const n = Re.length;
    const ar = copy(Re), ai = copy(Im);
    const piv = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      let p = k, max = Math.hypot(ar[k][k], ai[k][k]);
      for (let i = k + 1; i < n; i++) { const v = Math.hypot(ar[i][k], ai[i][k]); if (v > max) { max = v; p = i; } }
      piv[k] = p;
      if (max === 0) return null;
      if (p !== k) { let t = ar[p]; ar[p] = ar[k]; ar[k] = t; t = ai[p]; ai[p] = ai[k]; ai[k] = t; }
      const dr = ar[k][k], di = ai[k][k], dd = dr * dr + di * di;
      for (let i = k + 1; i < n; i++) {
        const xr = ar[i][k], xi = ai[i][k];
        if (xr === 0 && xi === 0) continue;
        const fr = (xr * dr + xi * di) / dd, fi = (xi * dr - xr * di) / dd;
        ar[i][k] = fr; ai[i][k] = fi;
        const rr = ar[k], ri = ai[k], sr = ar[i], si = ai[i];
        for (let j = k + 1; j < n; j++) { sr[j] -= fr * rr[j] - fi * ri[j]; si[j] -= fr * ri[j] + fi * rr[j]; }
      }
    }
    return { ar, ai, piv, n };
  }
  function luSolveComplex(F, br, bi) {
    const { ar, ai, piv, n } = F;
    const xr = Float64Array.from(br), xi = Float64Array.from(bi);
    for (let k = 0; k < n; k++) { const p = piv[k]; if (p !== k) { let t = xr[p]; xr[p] = xr[k]; xr[k] = t; t = xi[p]; xi[p] = xi[k]; xi[k] = t; } }
    for (let i = 1; i < n; i++) {
      let sr = xr[i], si = xi[i];
      for (let j = 0; j < i; j++) { sr -= ar[i][j] * xr[j] - ai[i][j] * xi[j]; si -= ar[i][j] * xi[j] + ai[i][j] * xr[j]; }
      xr[i] = sr; xi[i] = si;
    }
    for (let i = n - 1; i >= 0; i--) {
      let sr = xr[i], si = xi[i];
      for (let j = i + 1; j < n; j++) { sr -= ar[i][j] * xr[j] - ai[i][j] * xi[j]; si -= ar[i][j] * xi[j] + ai[i][j] * xr[j]; }
      const dr = ar[i][i], di = ai[i][i], dd = dr * dr + di * di;
      xr[i] = (sr * dr + si * di) / dd; xi[i] = (si * dr - sr * di) / dd;
    }
    return { re: xr, im: xi };
  }

  /* ---------- eigenvalues of a real matrix ---------- */

  /** Balance a copy of A by powers of 2 (the eigenvalues do not change). */
  function balance(A) {
    const a = copy(A), n = a.length;
    let done = false;
    while (!done) {
      done = true;
      for (let i = 0; i < n; i++) {
        let r = 0, c = 0;
        for (let j = 0; j < n; j++) if (j !== i) { c += Math.abs(a[j][i]); r += Math.abs(a[i][j]); }
        if (!c || !r) continue;
        let g = r / 2, f = 1;
        const s = c + r;
        while (c < g) { f *= 2; c *= 4; }
        g = r * 2;
        while (c > g) { f /= 2; c /= 4; }
        if ((c + r) / f < 0.95 * s) {
          done = false;
          for (let j = 0; j < n; j++) a[i][j] /= f;
          for (let j = 0; j < n; j++) a[j][i] *= f;
        }
      }
    }
    return a;
  }
  /** Reduce a (in place) to upper Hessenberg form by stabilized elimination. */
  function hessenberg(a) {
    const n = a.length;
    for (let m = 1; m < n - 1; m++) {
      let x = 0, i = m;
      for (let j = m; j < n; j++) if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
      if (i !== m) {
        for (let j = m - 1; j < n; j++) { const t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; }
        for (let j = 0; j < n; j++) { const t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; }
      }
      if (x === 0) continue;
      for (let r = m + 1; r < n; r++) {
        let y = a[r][m - 1];
        if (y === 0) continue;
        y /= x;
        a[r][m - 1] = y;
        for (let j = m; j < n; j++) a[r][j] -= y * a[m][j];
        for (let j = 0; j < n; j++) a[j][m] += y * a[j][r];
      }
    }
    for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) a[i][j] = 0;
    return a;
  }
  /**
   * Eigenvalues of an upper Hessenberg matrix (destroyed) by the Francis double-shift QR iteration.
   * @returns {{re: number, im: number}[]|null} null when the iteration does not converge
   */
  function hqr(a) {
    const n = a.length;
    const wr = new Float64Array(n), wi = new Float64Array(n);
    let anorm = 0;
    for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(a[i][j]);
    let nn = n - 1, t = 0;
    let p = 0, q = 0, r = 0, s = 0, w = 0, x = 0, y = 0, z = 0;
    while (nn >= 0) {
      let its = 0, l;
      do {
        for (l = nn; l >= 1; l--) {
          s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
          if (s === 0) s = anorm;
          if (Math.abs(a[l][l - 1]) <= EPS * s) { a[l][l - 1] = 0; break; }
        }
        x = a[nn][nn];
        if (l === nn) {
          wr[nn] = x + t; wi[nn--] = 0;
        } else {
          y = a[nn - 1][nn - 1];
          w = a[nn][nn - 1] * a[nn - 1][nn];
          if (l === nn - 1) {
            p = 0.5 * (y - x);
            q = p * p + w;
            z = Math.sqrt(Math.abs(q));
            x += t;
            if (q >= 0) {
              z = p + (p >= 0 ? Math.abs(z) : -Math.abs(z));
              wr[nn - 1] = wr[nn] = x + z;
              if (z) wr[nn] = x - w / z;
              wi[nn - 1] = wi[nn] = 0;
            } else {
              wr[nn - 1] = wr[nn] = x + p;
              wi[nn - 1] = -(wi[nn] = z);
            }
            nn -= 2;
          } else {
            if (its === 60) return null;
            if (its === 10 || its === 20 || its === 40) {
              t += x;
              for (let i = 0; i <= nn; i++) a[i][i] -= x;
              s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
              y = x = 0.75 * s;
              w = -0.4375 * s * s;
            }
            ++its;
            let m;
            for (m = nn - 2; m >= l; m--) {
              z = a[m][m];
              r = x - z;
              s = y - z;
              p = (r * s - w) / a[m + 1][m] + a[m][m + 1];
              q = a[m + 1][m + 1] - z - r - s;
              r = a[m + 2][m + 1];
              s = Math.abs(p) + Math.abs(q) + Math.abs(r);
              p /= s; q /= s; r /= s;
              if (m === l) break;
              const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
              const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
              if (u <= EPS * v) break;
            }
            for (let i = m + 2; i <= nn; i++) {
              a[i][i - 2] = 0;
              if (i !== m + 2) a[i][i - 3] = 0;
            }
            for (let k = m; k <= nn - 1; k++) {
              if (k !== m) {
                p = a[k][k - 1];
                q = a[k + 1][k - 1];
                r = 0;
                if (k !== nn - 1) r = a[k + 2][k - 1];
                if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) { p /= x; q /= x; r /= x; }
              }
              const nrm = Math.sqrt(p * p + q * q + r * r);
              s = p >= 0 ? nrm : -nrm;
              if (s !== 0) {
                if (k === m) {
                  if (l !== m) a[k][k - 1] = -a[k][k - 1];
                } else a[k][k - 1] = -s * x;
                p += s;
                x = p / s; y = q / s; z = r / s;
                q /= p; r /= p;
                for (let j = k; j <= nn; j++) {
                  p = a[k][j] + q * a[k + 1][j];
                  if (k !== nn - 1) { p += r * a[k + 2][j]; a[k + 2][j] -= p * z; }
                  a[k + 1][j] -= p * y;
                  a[k][j] -= p * x;
                }
                const mmin = nn < k + 3 ? nn : k + 3;
                for (let i = l; i <= mmin; i++) {
                  p = x * a[i][k] + y * a[i][k + 1];
                  if (k !== nn - 1) { p += z * a[i][k + 2]; a[i][k + 2] -= p * r; }
                  a[i][k + 1] -= p * q;
                  a[i][k] -= p;
                }
              }
            }
          }
        }
      } while (l < nn - 1);
    }
    return Array.from(wr, (re, i) => ({ re, im: wi[i] }));
  }
  /** Eigenvalues of a real square matrix, sorted by decreasing real part, or null when QR fails. */
  function eig(A) {
    if (!A.length) return [];
    if (A.length === 1) return [{ re: A[0][0], im: 0 }];
    const ev = hqr(hessenberg(balance(A)));
    return ev && ev.sort((u, v) => v.re - u.re || v.im - u.im);
  }
  /**
   * The eigenvector of A for an eigenvalue estimate, by inverse iteration with a complex shift. Normalized so the
   * component of largest modulus is 1. Returns the vector, the refined eigenvalue (Rayleigh quotient) and the
   * residual ||A v − λ v||∞ / ||v||∞.
   */
  function eigvec(A, lambda, iterations = 6) {
    const n = A.length;
    const scale = Math.max(matNormInf(A), 1);
    const shift = { re: lambda.re + 1e-10 * scale, im: lambda.im };
    const Re = copy(A), Im = zeros(n);
    for (let i = 0; i < n; i++) { Re[i][i] -= shift.re; Im[i][i] = -shift.im; }
    const F = luComplex(Re, Im);
    let vr = new Float64Array(n).fill(1), vi = new Float64Array(n);
    for (let i = 0; i < n; i++) vr[i] = 1 + 0.01 * Math.sin(i + 1);
    if (F) {
      for (let it = 0; it < iterations; it++) {
        const x = luSolveComplex(F, vr, vi);
        let k = 0, best = -1;
        for (let i = 0; i < n; i++) { const mo = Math.hypot(x.re[i], x.im[i]); if (mo > best) { best = mo; k = i; } }
        const dr = x.re[k], di = x.im[k], dd = dr * dr + di * di;
        for (let i = 0; i < n; i++) { const a = x.re[i], b = x.im[i]; vr[i] = (a * dr + b * di) / dd; vi[i] = (b * dr - a * di) / dd; }
      }
    }
    // Rayleigh quotient λ = (v* A v)/(v* v) and the residual.
    const Avr = matvec(A, vr), Avi = matvec(A, vi);
    let nr = 0, ni = 0, dd = 0;
    for (let i = 0; i < n; i++) { nr += vr[i] * Avr[i] + vi[i] * Avi[i]; ni += vr[i] * Avi[i] - vi[i] * Avr[i]; dd += vr[i] * vr[i] + vi[i] * vi[i]; }
    const lam = { re: nr / dd, im: ni / dd };
    let res = 0, vmax = 0;
    for (let i = 0; i < n; i++) {
      res = Math.max(res, Math.hypot(Avr[i] - (lam.re * vr[i] - lam.im * vi[i]), Avi[i] - (lam.re * vi[i] + lam.im * vr[i])));
      vmax = Math.max(vmax, Math.hypot(vr[i], vi[i]));
    }
    return { re: vr, im: vi, lambda: lam, residual: res / (vmax * scale) };
  }

  /* ---------- Chebyshev collocation ---------- */

  /** The N + 1 Chebyshev–Gauss–Lobatto nodes cos(πj/N), j = 0..N, from 1 down to −1. */
  const lobatto = (N) => Array.from({ length: N + 1 }, (_, j) => Math.cos((Math.PI * j) / N));
  /** The first-derivative matrix of polynomial interpolation on distinct nodes (barycentric form). */
  function diffMatrix(x) {
    const n = x.length;
    const w = x.map((xi, i) => 1 / x.reduce((p, xj, j) => (j === i ? p : p * (xi - xj)), 1));
    const D = zeros(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) if (j !== i) { D[i][j] = (w[j] / w[i]) / (x[i] - x[j]); s += D[i][j]; }
      D[i][i] = -s;
    }
    return D;
  }
  /** Clenshaw–Curtis weights on the N + 1 Lobatto nodes of [−1, 1] (they sum to 2). */
  function ccWeights(N) {
    const w = new Float64Array(N + 1);
    for (let j = 0; j <= N; j++) {
      const th = (Math.PI * j) / N;
      let s = 0;
      for (let k = 0; k <= N / 2; k++) {
        const bk = k === 0 || 2 * k === N ? 1 : 2;
        s += (bk / (1 - 4 * k * k)) * Math.cos(2 * k * th);
      }
      w[j] = ((j === 0 || j === N ? 1 : 2) / N) * s;
    }
    return w;
  }

  /* ---------- Newton, continuation and scalar searches ---------- */

  /**
   * Newton's method for F(x) = 0 with Jacobian J(x). Stops when ||F||∞ <= tol and the last step is small.
   * @returns {{x: Float64Array, converged: boolean, iterations: number, residual: number, history: number[]}}
   */
  function newton(F, J, x0, { tol = 1e-10, maxIter = 30, stepTol = 1e-10 } = {}) {
    let x = Float64Array.from(x0);
    const history = [];
    for (let it = 0; it < maxIter; it++) {
      const f = F(x);
      const res = normInf(f);
      history.push(res);
      if (!Number.isFinite(res)) return { x, converged: false, iterations: it, residual: res, history };
      const dx = solve(J(x), f);
      if (!dx) return { x, converged: false, iterations: it, residual: res, history };
      for (let i = 0; i < x.length; i++) x[i] -= dx[i];
      if (res <= tol && normInf(dx) <= stepTol * Math.max(1, normInf(x))) return { x, converged: true, iterations: it + 1, residual: normInf(F(x)), history };
      if (normInf(dx) <= stepTol * Math.max(1, normInf(x)) && normInf(F(x)) <= tol) return { x, converged: true, iterations: it + 1, residual: normInf(F(x)), history };
    }
    const res = normInf(F(x));
    return { x, converged: res <= tol, iterations: maxIter, residual: res, history };
  }

  /** The unit tangent of the solution curve of F(y) = 0, y = (x, μ), from the n × (n + 1) Jacobian Jy. */
  function tangent(Jy, prev) {
    const n = Jy.length;
    // Solve [Jy; e_k^T] t = e_{n} with k the largest component of the previous tangent (or μ).
    const k = prev ? prev.reduce((b, v, i) => (Math.abs(v) > Math.abs(prev[b]) ? i : b), 0) : n;
    const M = Jy.map((r) => Float64Array.from(r));
    const row = new Float64Array(n + 1); row[k] = 1;
    M.push(row);
    const rhs = new Float64Array(n + 1); rhs[n] = 1;
    const t = solve(M, rhs);
    if (!t) return null;
    const nr = norm2(t);
    for (let i = 0; i <= n; i++) t[i] /= nr;
    if (prev) { let d = 0; for (let i = 0; i <= n; i++) d += t[i] * prev[i]; if (d < 0) for (let i = 0; i <= n; i++) t[i] = -t[i]; }
    return t;
  }

  /**
   * Pseudo-arclength continuation of F(x, μ) = 0 from a converged point (x0, μ0).
   * opts: Fy(y) -> residual (length n), Jy(y) -> n × (n + 1) Jacobian, range [μmin, μmax], h (initial step), hmax,
   * maxSteps, direction (+1 or −1 in μ), tol. Each accepted point carries the tangent, the sign of the augmented
   * determinant det [Jy; t^T] (a change marks a branch point), the μ component of the tangent (a change of sign
   * marks a fold), and the Newton history.
   */
  function continuation({ Fy, Jy, y0, range, h = 0.05, hmin = 1e-6, hmax = 0.5, maxSteps = 400, direction = 1, tol = 1e-9, onPoint }) {
    const n = y0.length - 1;
    const pts = [];
    let y = Float64Array.from(y0);
    let t = tangent(Jy(y), null);
    if (!t) return { points: pts, stop: "The first tangent is undefined: the Jacobian is singular at the start." };
    if (Math.sign(t[n]) !== Math.sign(direction) && t[n] !== 0) for (let i = 0; i <= n; i++) t[i] = -t[i];
    const augSign = (yy, tt) => { const M = Jy(yy).map((r) => Float64Array.from(r)); M.push(Float64Array.from(tt)); return logDet(M).sign; };
    const record = (yy, tt, newtonInfo) => {
      const p = { y: Float64Array.from(yy), mu: yy[n], t: Float64Array.from(tt), det: augSign(yy, tt), newton: newtonInfo };
      if (onPoint) onPoint(p);
      pts.push(p);
      return p;
    };
    record(y, t, { iterations: 0, residual: normInf(Fy(y)) });
    let step = h, stop = "The step count reached its limit.";
    for (let k = 0; k < maxSteps; k++) {
      let accepted = false;
      while (!accepted) {
        const pred = Float64Array.from(y, (v, i) => v + step * t[i]);
        const y1 = y, t1 = t, s = step;
        const G = (z) => { const f = Fy(z); const g = new Float64Array(n + 1); g.set(f); let d = 0; for (let i = 0; i <= n; i++) d += (z[i] - y1[i]) * t1[i]; g[n] = d - s; return g; };
        const GJ = (z) => { const M = Jy(z).map((r) => Float64Array.from(r)); M.push(Float64Array.from(t1)); return M; };
        const res = newton(G, GJ, pred, { tol, maxIter: 8, stepTol: 1e-9 });
        if (res.converged) {
          const tn = tangent(Jy(res.x), t);
          if (tn) {
            y = res.x; t = tn; accepted = true;
            record(y, t, { iterations: res.iterations, residual: res.residual });
            if (res.iterations <= 3) step = Math.min(step * 1.5, hmax);
            break;
          }
        }
        step /= 2;
        if (step < hmin) return { points: pts, stop: "The corrector did not converge with the smallest step." };
      }
      if (y[n] < range[0] || y[n] > range[1]) { stop = "The branch left the parameter domain."; break; }
    }
    return { points: pts, stop };
  }

  /** A root of f in [a, b] with f(a) f(b) <= 0, by bisection safeguarded secant (Illinois). */
  function root(f, a, b, { tol = 1e-12, maxIter = 200 } = {}) {
    let fa = f(a), fb = f(b);
    if (fa === 0) return a;
    if (fb === 0) return b;
    if (fa * fb > 0) return NaN;
    let side = 0, c = a;
    for (let i = 0; i < maxIter; i++) {
      c = (a * fb - b * fa) / (fb - fa);
      const fc = f(c);
      if (fc === 0 || Math.abs(b - a) <= tol * Math.max(1, Math.abs(c))) return c;
      if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; } else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
    }
    return c;
  }
  /** The minimum of a unimodal f on [a, b] by golden-section search. */
  function minimize(f, a, b, { tol = 1e-10, maxIter = 200 } = {}) {
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
    for (let i = 0; i < maxIter && Math.abs(b - a) > tol * (Math.abs(c) + Math.abs(d)); i++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
    }
    const x = (a + b) / 2;
    return { x, f: f(x) };
  }

  /* ---------- Dormand–Prince 5(4) ---------- */

  const DP = {
    c: [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1],
    a: [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
      [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656], [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]],
    b: [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0],
    e: [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40],
  };
  /**
   * Integrate y' = f(t, y) from t0 to t1 with relative and absolute tolerances. Returns the accepted points and
   * the counts, so a report can state the settings and the work.
   */
  function rk45(f, t0, y0, t1, { rtol = 1e-9, atol = 1e-12, h0 = (t1 - t0) / 100, maxSteps = 100000 } = {}) {
    const n = y0.length;
    let t = t0, y = Float64Array.from(y0), h = h0;
    const ts = [t], ys = [Float64Array.from(y)];
    let accepted = 0, rejected = 0;
    const k = Array.from({ length: 7 }, () => new Float64Array(n));
    k[0] = Float64Array.from(f(t, y));
    for (let step = 0; step < maxSteps && t < t1; step++) {
      if (t + h > t1) h = t1 - t;
      for (let s = 1; s < 7; s++) {
        const ys1 = Float64Array.from(y);
        for (let j = 0; j < s; j++) { const a = DP.a[s][j]; if (a) for (let i = 0; i < n; i++) ys1[i] += h * a * k[j][i]; }
        k[s] = Float64Array.from(f(t + DP.c[s] * h, ys1));
      }
      const yn = Float64Array.from(y);
      let err = 0;
      for (let i = 0; i < n; i++) {
        let e = 0;
        for (let s = 0; s < 7; s++) { yn[i] += h * DP.b[s] * k[s][i]; e += h * DP.e[s] * k[s][i]; }
        const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yn[i]));
        err = Math.max(err, Math.abs(e) / sc);
      }
      if (err <= 1) {
        t += h; y = yn; k[0] = k[6]; accepted++;
        ts.push(t); ys.push(Float64Array.from(y));
      } else rejected++;
      h *= Math.min(5, Math.max(0.2, 0.9 * Math.pow(err || 1e-16, -1 / 5)));
    }
    return { ts, ys, accepted, rejected, rtol, atol };
  }

  return { EPS, zeros, eye, copy, matmul, matvec, axpby, diag, rowScale, blocks, norm2, normInf, matNormInf, lu, luSolve, solve, solveMatrix, logDet,
    luComplex, luSolveComplex, balance, hessenberg, hqr, eig, eigvec, lobatto, diffMatrix, ccWeights, newton, tangent, continuation, root, minimize, rk45 };
});
