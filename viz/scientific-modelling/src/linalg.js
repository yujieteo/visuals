/* Scientific Modelling: exact linear algebra over the rationals (src/rational.js). Row reduction records every
 * operation with its reason and the matrix after it, so the page, the report and the deck show the same steps.
 * Matrices are arrays of rows of rationals; vectors are arrays of rationals.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./rational.js"));
  else (root.SM = root.SM || {}).LA = factory(root.SM.Q);
})(typeof self !== "undefined" ? self : this, function (Q) {
  "use strict";

  /** A rational matrix from numbers, strings or rationals. @param {any[][]} rows */
  const matrix = (rows) => rows.map((r) => r.map((v) => Q.of(v)));
  const copy = (M) => M.map((r) => r.slice());
  const transpose = (M) => (M.length ? M[0].map((_, j) => M.map((r) => r[j])) : []);
  const columns = (M, idx) => M.map((r) => idx.map((j) => r[j]));
  const dot = (a, b) => a.reduce((s, v, i) => Q.add(s, Q.mul(v, b[i])), Q.ZERO);
  const mulMV = (M, v) => M.map((r) => dot(r, v));
  const mulMM = (A, B) => A.map((r) => transpose(B).map((c) => dot(r, c)));
  const isZeroVector = (v) => v.every(Q.isZero);
  const strings = (M) => M.map((r) => r.map(Q.str));

  /**
   * Reduced row echelon form with the record of every operation (swap, scale, add), its reason and the matrix
   * after it. The pivot in a column is the first row from the current one whose entry is 1 or -1, else the first
   * nonzero entry, so the steps are deterministic and small. Rows are named by position (R1 is always the first row).
   * @param {any[][]} M0 @param {{ cols?: string[] }} [names]
   */
  function rref(M0, names = {}) {
    const M = copy(M0);
    const rows = M.length, cols = rows ? M[0].length : 0;
    const labels = M.map((_, i) => `R${i + 1}`);
    const colName = (j) => (names.cols && names.cols[j] ? names.cols[j] : `column ${j + 1}`);
    const steps = [];
    const record = (op, text, tex, reason) => steps.push({ op, text, tex, reason, matrix: strings(M) });
    const pivots = [];
    let r = 0;
    for (let c = 0; c < cols && r < rows; c++) {
      let p = -1;
      for (let i = r; i < rows; i++) if (!Q.isZero(M[i][c]) && Q.eq(Q.abs(M[i][c]), Q.ONE)) { p = i; break; }
      if (p < 0) for (let i = r; i < rows; i++) if (!Q.isZero(M[i][c])) { p = i; break; }
      if (p < 0) continue;
      if (p !== r) {
        [M[r], M[p]] = [M[p], M[r]];
        record("swap", `${labels[r]} ↔ ${labels[p]}`, `${tx(labels[r])} \\leftrightarrow ${tx(labels[p])}`, `Move a nonzero entry of ${colName(c)} to row ${r + 1}.`);
      }
      const pv = M[r][c];
      if (!Q.eq(pv, Q.ONE)) {
        const f = Q.inv(pv);
        M[r] = M[r].map((v) => Q.mul(v, f));
        record("scale", `${labels[r]} ← (${Q.str(f)}) ${labels[r]}`, `${tx(labels[r])} \\leftarrow ${coef(f)}\\,${tx(labels[r])}`, `Make the pivot of ${colName(c)} equal to 1.`);
      }
      for (let i = 0; i < rows; i++) {
        if (i === r || Q.isZero(M[i][c])) continue;
        const f = Q.neg(M[i][c]);
        M[i] = M[i].map((v, j) => Q.add(v, Q.mul(f, M[r][j])));
        const s = Q.sign(f) < 0 ? "-" : "+";
        const fa = Q.abs(f);
        record("add", `${labels[i]} ← ${labels[i]} ${s} ${Q.eq(fa, Q.ONE) ? "" : `${Q.str(fa)} `}${labels[r]}`,
          `${tx(labels[i])} \\leftarrow ${tx(labels[i])} ${s} ${Q.eq(fa, Q.ONE) ? "" : `${coef(fa)}\\,`}${tx(labels[r])}`, `Clear ${colName(c)} in the other rows.`);
      }
      pivots.push(c);
      r++;
    }
    return { R: M, pivots, rank: pivots.length, steps };
  }
  /** A row label in TeX: R1 -> R_{1}. */
  const tx = (l) => `R_{${l.slice(1)}}`;
  const coef = (f) => (Q.isInteger(f) ? Q.str(f) : `\\left(${Q.tex(f)}\\right)`);

  const rank = (M) => (M.length ? rref(M).rank : 0);

  /** The basis of ker M that the reduced form gives: one vector per free column, with a 1 in that column. */
  function nullspace(M) {
    const n = M.length ? M[0].length : 0;
    const { R, pivots } = rref(M);
    const free = [];
    for (let j = 0; j < n; j++) if (!pivots.includes(j)) free.push(j);
    return { free, pivots, basis: free.map((f) => {
      const v = Array(n).fill(Q.ZERO);
      v[f] = Q.ONE;
      pivots.forEach((c, i) => { v[c] = Q.neg(R[i][f]); });
      return v;
    }) };
  }

  /** The smallest integer multiple of a vector, with the sign kept: [1/2, -3/4] -> [2, -3]. */
  function integerScale(v) {
    if (isZeroVector(v)) return v.slice();
    const L = Q.denominatorLcm(v);
    const w = v.map((x) => Q.mul(x, Q.q(L)));
    const g = Q.numeratorGcd(w);
    return w.map((x) => Q.div(x, Q.q(g)));
  }

  /** The exact determinant of a square matrix, by elimination with fractions. */
  function det(M0) {
    const M = copy(M0), n = M.length;
    let d = Q.ONE;
    for (let c = 0; c < n; c++) {
      let p = c;
      while (p < n && Q.isZero(M[p][c])) p++;
      if (p === n) return Q.ZERO;
      if (p !== c) { [M[c], M[p]] = [M[p], M[c]]; d = Q.neg(d); }
      d = Q.mul(d, M[c][c]);
      for (let i = c + 1; i < n; i++) {
        if (Q.isZero(M[i][c])) continue;
        const f = Q.div(M[i][c], M[c][c]);
        M[i] = M[i].map((v, j) => Q.sub(v, Q.mul(f, M[c][j])));
      }
    }
    return d;
  }

  /**
   * The coefficients c with B c = v, where the columns of B are the given vectors, or null when v is not in their
   * span. Exact; the columns must be independent for a unique answer.
   * @param {any[][]} vectors @param {any[]} v
   */
  function express(vectors, v) {
    const k = vectors.length;
    if (!k) return isZeroVector(v) ? [] : null;
    const aug = v.map((x, i) => [...vectors.map((b) => b[i]), x]);
    const { R, pivots } = rref(aug);
    if (pivots.includes(k)) return null;
    const c = Array(k).fill(Q.ZERO);
    pivots.forEach((col, i) => { c[col] = R[i][k]; });
    return c;
  }

  /** The solution of A x = b for a square nonsingular A, or null when A is singular. */
  function solve(A, b) {
    if (Q.isZero(det(A))) return null;
    return express(transpose(A), b);
  }

  /**
   * The first columns, in the given order, that are independent: each one raises the rank. Returns the chosen
   * indices and, for each refused index, the reason.
   * @param {any[][]} M @param {number[]} order @param {number} [want]
   */
  function independentColumns(M, order, want = Infinity) {
    const chosen = [], refused = [];
    for (const j of order) {
      if (chosen.length >= want) break;
      const r0 = rank(columns(M, chosen));
      if (rank(columns(M, [...chosen, j])) > r0) chosen.push(j);
      else refused.push(j);
    }
    return { chosen, refused };
  }

  return { matrix, copy, transpose, columns, dot, mulMV, mulMM, isZeroVector, strings, rref, rank, nullspace, integerScale, det, express, solve, independentColumns };
});
