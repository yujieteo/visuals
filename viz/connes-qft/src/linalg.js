/* Connes QFT laboratory: complex linear algebra for the finite models.
 *
 * Matrices are { n, m, re: Float64Array(n*m), im: Float64Array(n*m) }, row-major. The sizes here
 * are small (at most a few hundred), so the algorithms are the plain ones: a complex Jacobi
 * eigensolver for Hermitian matrices, Gaussian elimination with partial pivoting for null spaces and
 * ranks, and matrix functions through the eigendecomposition.
 */
(function (factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else factory(self.ConnesQFT);
})(function (Q) {
  "use strict";

  /* ---------- complex scalars: [re, im] ---------- */
  const C = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
    conj: (a) => [a[0], -a[1]],
    abs: (a) => Math.hypot(a[0], a[1]),
    arg: (a) => Math.atan2(a[1], a[0]),
    div: (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
    exp: (a) => { const r = Math.exp(a[0]); return [r * Math.cos(a[1]), r * Math.sin(a[1])]; },
    polar: (r, t) => [r * Math.cos(t), r * Math.sin(t)],
    scale: (a, s) => [a[0] * s, a[1] * s],
  };

  /* ---------- construction ---------- */
  function zeros(n, m = n) { return { n, m, re: new Float64Array(n * m), im: new Float64Array(n * m) }; }
  function eye(n) { const A = zeros(n); for (let i = 0; i < n; i++) A.re[i * n + i] = 1; return A; }
  /* From nested arrays whose entries are numbers or [re, im]. */
  function from(rows) {
    const n = rows.length, m = rows[0].length, A = zeros(n, m);
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const v = rows[i][j];
      if (Array.isArray(v)) { A.re[i * m + j] = v[0]; A.im[i * m + j] = v[1]; } else A.re[i * m + j] = v;
    }
    return A;
  }
  function diag(vals) {
    const n = vals.length, A = zeros(n);
    vals.forEach((v, i) => { if (Array.isArray(v)) { A.re[i * n + i] = v[0]; A.im[i * n + i] = v[1]; } else A.re[i * n + i] = v; });
    return A;
  }
  const get = (A, i, j) => [A.re[i * A.m + j], A.im[i * A.m + j]];
  const set = (A, i, j, v) => { A.re[i * A.m + j] = Array.isArray(v) ? v[0] : v; A.im[i * A.m + j] = Array.isArray(v) ? v[1] : 0; };
  const clone = (A) => ({ n: A.n, m: A.m, re: Float64Array.from(A.re), im: Float64Array.from(A.im) });
  const toArray = (A) => Array.from({ length: A.n }, (_, i) => Array.from({ length: A.m }, (_, j) => get(A, i, j)));

  /* ---------- arithmetic ---------- */
  function add(A, B) { const R = zeros(A.n, A.m); for (let k = 0; k < A.re.length; k++) { R.re[k] = A.re[k] + B.re[k]; R.im[k] = A.im[k] + B.im[k]; } return R; }
  function sub(A, B) { const R = zeros(A.n, A.m); for (let k = 0; k < A.re.length; k++) { R.re[k] = A.re[k] - B.re[k]; R.im[k] = A.im[k] - B.im[k]; } return R; }
  function scale(A, s) {
    const [sr, si] = Array.isArray(s) ? s : [s, 0], R = zeros(A.n, A.m);
    for (let k = 0; k < A.re.length; k++) { R.re[k] = A.re[k] * sr - A.im[k] * si; R.im[k] = A.re[k] * si + A.im[k] * sr; }
    return R;
  }
  function mul(A, B) {
    if (A.m !== B.n) throw new Error(`mul: ${A.n}×${A.m} by ${B.n}×${B.m}`);
    const R = zeros(A.n, B.m), n = A.n, m = B.m, p = A.m;
    for (let i = 0; i < n; i++) for (let k = 0; k < p; k++) {
      const ar = A.re[i * p + k], ai = A.im[i * p + k];
      if (ar === 0 && ai === 0) continue;
      for (let j = 0; j < m; j++) {
        const br = B.re[k * m + j], bi = B.im[k * m + j];
        R.re[i * m + j] += ar * br - ai * bi;
        R.im[i * m + j] += ar * bi + ai * br;
      }
    }
    return R;
  }
  const mulAll = (...Ms) => Ms.reduce((acc, M) => mul(acc, M));
  function adj(A) { const R = zeros(A.m, A.n); for (let i = 0; i < A.n; i++) for (let j = 0; j < A.m; j++) { R.re[j * A.n + i] = A.re[i * A.m + j]; R.im[j * A.n + i] = -A.im[i * A.m + j]; } return R; }
  function transpose(A) { const R = zeros(A.m, A.n); for (let i = 0; i < A.n; i++) for (let j = 0; j < A.m; j++) { R.re[j * A.n + i] = A.re[i * A.m + j]; R.im[j * A.n + i] = A.im[i * A.m + j]; } return R; }
  function conj(A) { const R = clone(A); for (let k = 0; k < R.im.length; k++) R.im[k] = -R.im[k]; return R; }
  const comm = (A, B) => sub(mul(A, B), mul(B, A));
  function trace(A) { let r = 0, i2 = 0; for (let i = 0; i < A.n; i++) { r += A.re[i * A.m + i]; i2 += A.im[i * A.m + i]; } return [r, i2]; }
  function kron(A, B) {
    const R = zeros(A.n * B.n, A.m * B.m);
    for (let i = 0; i < A.n; i++) for (let j = 0; j < A.m; j++) {
      const ar = A.re[i * A.m + j], ai = A.im[i * A.m + j];
      if (ar === 0 && ai === 0) continue;
      for (let k = 0; k < B.n; k++) for (let l = 0; l < B.m; l++) {
        const br = B.re[k * B.m + l], bi = B.im[k * B.m + l], idx = (i * B.n + k) * R.m + (j * B.m + l);
        R.re[idx] = ar * br - ai * bi; R.im[idx] = ar * bi + ai * br;
      }
    }
    return R;
  }
  const kronAll = (...Ms) => Ms.reduce((acc, M) => kron(acc, M));
  /* Frobenius norm. */
  function fnorm(A) { let s = 0; for (let k = 0; k < A.re.length; k++) s += A.re[k] * A.re[k] + A.im[k] * A.im[k]; return Math.sqrt(s); }
  const maxAbsDiff = (A, B) => { let s = 0; for (let k = 0; k < A.re.length; k++) s = Math.max(s, Math.hypot(A.re[k] - B.re[k], A.im[k] - B.im[k])); return s; };
  /* Hilbert–Schmidt inner product ⟨A, B⟩ = Tr(A* B). */
  function hs(A, B) { let r = 0, i = 0; for (let k = 0; k < A.re.length; k++) { r += A.re[k] * B.re[k] + A.im[k] * B.im[k]; i += A.re[k] * B.im[k] - A.im[k] * B.re[k]; } return [r, i]; }
  function matvec(A, v) {
    const out = Array.from({ length: A.n }, () => [0, 0]);
    for (let i = 0; i < A.n; i++) for (let j = 0; j < A.m; j++) {
      const a = [A.re[i * A.m + j], A.im[i * A.m + j]], b = v[j];
      out[i][0] += a[0] * b[0] - a[1] * b[1]; out[i][1] += a[0] * b[1] + a[1] * b[0];
    }
    return out;
  }
  const vdot = (u, v) => u.reduce((s, a, i) => C.add(s, C.mul(C.conj(a), v[i])), [0, 0]);
  const vnorm = (v) => Math.sqrt(v.reduce((s, a) => s + a[0] * a[0] + a[1] * a[1], 0));
  const isHermitian = (A, tol = 1e-10) => A.n === A.m && maxAbsDiff(A, adj(A)) <= tol * Math.max(1, fnorm(A));

  /* ---------- Hermitian eigensolver (cyclic complex Jacobi) ---------- */
  /* Returns { values (ascending), vectors: n×n matrix whose columns are eigenvectors }. */
  function eigh(H) {
    const n = H.n;
    const ar = Float64Array.from(H.re), ai = Float64Array.from(H.im);
    // Symmetrize against round-off.
    for (let i = 0; i < n; i++) { ai[i * n + i] = 0; for (let j = i + 1; j < n; j++) { const r = (ar[i * n + j] + ar[j * n + i]) / 2, im = (ai[i * n + j] - ai[j * n + i]) / 2; ar[i * n + j] = r; ar[j * n + i] = r; ai[i * n + j] = im; ai[j * n + i] = -im; } }
    const vr = new Float64Array(n * n), vi = new Float64Array(n * n);
    for (let i = 0; i < n; i++) vr[i * n + i] = 1;
    const off = () => { let s = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) s += ar[i * n + j] ** 2 + ai[i * n + j] ** 2; return s; };
    let scaleN = 0;
    for (let k = 0; k < n * n; k++) scaleN += ar[k] * ar[k] + ai[k] * ai[k];
    const tol = 1e-30 * Math.max(1, scaleN);
    for (let sweep = 0; sweep < 100 && off() > tol; sweep++) {
      for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
        const hr = ar[p * n + q], hi = ai[p * n + q], habs = Math.hypot(hr, hi);
        if (habs < 1e-300) continue;
        const app = ar[p * n + p], aqq = ar[q * n + q];
        // Phase-rotate so the pivot is real, then a real Jacobi rotation.
        const er = hr / habs, ei = hi / habs; // e^{iφ}
        const theta = 0.5 * Math.atan2(2 * habs, aqq - app);
        const c = Math.cos(theta), s = Math.sin(theta);
        // Rotation G acts on columns p, q: col_p' = c col_p - s e^{-iφ}... chosen so (G* A G)_{pq} = 0.
        // G = [[c, s e^{iφ}], [-s e^{-iφ}, c]] restricted to (p, q).
        const g_pq_r = s * er, g_pq_i = s * ei;      // G[p][q]
        const g_qp_r = -s * er, g_qp_i = s * ei;     // G[q][p] = -s e^{-iφ}
        // A ← A G (columns)
        for (let k = 0; k < n; k++) {
          const kpR = ar[k * n + p], kpI = ai[k * n + p], kqR = ar[k * n + q], kqI = ai[k * n + q];
          ar[k * n + p] = c * kpR + (kqR * g_qp_r - kqI * g_qp_i);
          ai[k * n + p] = c * kpI + (kqR * g_qp_i + kqI * g_qp_r);
          ar[k * n + q] = (kpR * g_pq_r - kpI * g_pq_i) + c * kqR;
          ai[k * n + q] = (kpR * g_pq_i + kpI * g_pq_r) + c * kqI;
          const vpR = vr[k * n + p], vpI = vi[k * n + p], vqR = vr[k * n + q], vqI = vi[k * n + q];
          vr[k * n + p] = c * vpR + (vqR * g_qp_r - vqI * g_qp_i);
          vi[k * n + p] = c * vpI + (vqR * g_qp_i + vqI * g_qp_r);
          vr[k * n + q] = (vpR * g_pq_r - vpI * g_pq_i) + c * vqR;
          vi[k * n + q] = (vpR * g_pq_i + vpI * g_pq_r) + c * vqI;
        }
        // A ← G* A (rows): (G*)[p][p] = c, (G*)[p][q] = conj(G[q][p]), (G*)[q][p] = conj(G[p][q]), (G*)[q][q] = c
        for (let k = 0; k < n; k++) {
          const pkR = ar[p * n + k], pkI = ai[p * n + k], qkR = ar[q * n + k], qkI = ai[q * n + k];
          // conj(G[q][p]) = (g_qp_r, -g_qp_i); conj(G[p][q]) = (g_pq_r, -g_pq_i)
          ar[p * n + k] = c * pkR + (qkR * g_qp_r + qkI * g_qp_i);
          ai[p * n + k] = c * pkI + (qkI * g_qp_r - qkR * g_qp_i);
          ar[q * n + k] = (pkR * g_pq_r + pkI * g_pq_i) + c * qkR;
          ai[q * n + k] = (pkI * g_pq_r - pkR * g_pq_i) + c * qkI;
        }
        ar[p * n + q] = ar[q * n + p] = 0; ai[p * n + q] = ai[q * n + p] = 0;
        ai[p * n + p] = 0; ai[q * n + q] = 0;
      }
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => ar[a * n + a] - ar[b * n + b]);
    const values = order.map((i) => ar[i * n + i]);
    const V = zeros(n);
    order.forEach((src, dst) => { for (let k = 0; k < n; k++) { V.re[k * n + dst] = vr[k * n + src]; V.im[k * n + dst] = vi[k * n + src]; } });
    return { values, vectors: V };
  }
  const eigvalsh = (H) => eigh(H).values;
  /* f(H) for Hermitian H, through its eigendecomposition. f maps a real eigenvalue to a number or [re, im]. */
  function funm(H, f) {
    const { values, vectors: V } = eigh(H);
    return mul(mul(V, diag(values.map(f))), adj(V));
  }
  /* Operator norm ‖A‖ = √(largest eigenvalue of A*A). */
  function opnorm(A) { const v = eigvalsh(mul(adj(A), A)); return Math.sqrt(Math.max(0, v[v.length - 1])); }
  /* exp(-i t H) for Hermitian H. */
  const expiH = (H, t) => funm(H, (x) => C.polar(1, -t * x));

  /* ---------- Gaussian elimination ---------- */
  /* Reduced row echelon form of a complex matrix; returns { R, pivots }. */
  function rref(A, tol = 1e-10) {
    const R = clone(A), n = R.n, m = R.m, pivots = [];
    let scaleRef = 1e-300;
    for (let k = 0; k < R.re.length; k++) scaleRef = Math.max(scaleRef, Math.abs(R.re[k]), Math.abs(R.im[k]));
    let row = 0;
    for (let col = 0; col < m && row < n; col++) {
      let best = row, bestAbs = 0;
      for (let i = row; i < n; i++) { const a = Math.hypot(R.re[i * m + col], R.im[i * m + col]); if (a > bestAbs) { bestAbs = a; best = i; } }
      if (bestAbs <= tol * scaleRef) continue;
      if (best !== row) for (let j = 0; j < m; j++) {
        [R.re[row * m + j], R.re[best * m + j]] = [R.re[best * m + j], R.re[row * m + j]];
        [R.im[row * m + j], R.im[best * m + j]] = [R.im[best * m + j], R.im[row * m + j]];
      }
      const piv = [R.re[row * m + col], R.im[row * m + col]];
      for (let j = 0; j < m; j++) { const v = C.div([R.re[row * m + j], R.im[row * m + j]], piv); R.re[row * m + j] = v[0]; R.im[row * m + j] = v[1]; }
      for (let i = 0; i < n; i++) {
        if (i === row) continue;
        const f = [R.re[i * m + col], R.im[i * m + col]];
        if (f[0] === 0 && f[1] === 0) continue;
        for (let j = 0; j < m; j++) {
          const v = C.mul(f, [R.re[row * m + j], R.im[row * m + j]]);
          R.re[i * m + j] -= v[0]; R.im[i * m + j] -= v[1];
        }
      }
      pivots.push(col);
      row++;
    }
    return { R, pivots };
  }
  const rank = (A, tol) => rref(A, tol).pivots.length;
  /* Basis of the null space {x : A x = 0}, as an array of vectors ([re, im] entries). */
  function nullspace(A, tol = 1e-10) {
    const { R, pivots } = rref(A, tol), m = A.m;
    const free = [];
    for (let j = 0; j < m; j++) if (!pivots.includes(j)) free.push(j);
    return free.map((f) => {
      const v = Array.from({ length: m }, () => [0, 0]);
      v[f] = [1, 0];
      pivots.forEach((pc, r) => { v[pc] = [-R.re[r * m + f], -R.im[r * m + f]]; });
      return v;
    });
  }
  /* Orthonormalize a list of vectors (modified Gram–Schmidt), dropping dependent ones. */
  function orthonormalize(vs, tol = 1e-9) {
    const out = [];
    for (const v0 of vs) {
      let v = v0.map((a) => a.slice());
      for (const u of out) { const c = vdot(u, v); v = v.map((a, i) => C.sub(a, C.mul(c, u[i]))); }
      const nv = vnorm(v);
      if (nv > tol) out.push(v.map((a) => C.scale(a, 1 / nv)));
    }
    return out;
  }
  /* Solve A x = b for square nonsingular A. */
  function solve(A, b) {
    const n = A.n, M = zeros(n, n + 1);
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) set(M, i, j, get(A, i, j)); set(M, i, n, b[i]); }
    const { R, pivots } = rref(M);
    if (pivots.length < n || pivots.includes(n)) throw new Error("solve: singular system");
    return Array.from({ length: n }, (_, i) => get(R, i, n));
  }
  /* Matrix as a vector (row-major) and back. */
  const vec = (A) => Array.from({ length: A.re.length }, (_, k) => [A.re[k], A.im[k]]);
  function unvec(v, n, m = n) { const A = zeros(n, m); v.forEach((a, k) => { A.re[k] = a[0]; A.im[k] = a[1]; }); return A; }

  /* ---------- real symmetric helpers (used by the harmonic chain) ---------- */
  /* Real symmetric eigensolver (cyclic Jacobi) on a plain array of arrays. */
  function eighReal(S) {
    const n = S.length, a = S.map((r) => r.slice()), v = S.map((_, i) => S.map((__, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
      if (off < 1e-26) break;
      for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq; }
        for (let k = 0; k < n; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk; }
        for (let k = 0; k < n; k++) { const kp = v[k][p], kq = v[k][q]; v[k][p] = c * kp - s * kq; v[k][q] = s * kp + c * kq; }
      }
    }
    const order = a.map((_, i) => i).sort((x, y) => a[x][x] - a[y][y]);
    return { values: order.map((i) => a[i][i]), vectors: v.map((row) => order.map((i) => row[i])) };
  }

  const api = {
    C, zeros, eye, from, diag, get, set, clone, toArray,
    add, sub, scale, mul, mulAll, adj, transpose, conj, comm, trace, kron, kronAll, fnorm, maxAbsDiff, hs, matvec, vdot, vnorm, isHermitian,
    eigh, eigvalsh, funm, opnorm, expiH, rref, rank, nullspace, orthonormalize, solve, vec, unvec, eighReal,
  };
  Q.linalg = api;
  return api;
});
