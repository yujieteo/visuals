/* BEAMDIAG engine: linear-elastic Euler–Bernoulli beam, direct stiffness method.
 *
 * Units are SI throughout: m, N, N/m, N·m, Pa, m², m⁴.
 * Axes: x along the beam from its left end, +y up. Rotations and couples are
 * counter-clockwise positive (+z out of the page).
 * Loads: point force Fy (+ up), couple Mz (+ CCW), linearly varying distributed
 * load q from x1 to x2 (N/m, + up).
 * Supports: "pin" restrains deflection; "fixed" restrains deflection and slope.
 * Internal forces use the usual beam convention: V(x) is the sum of the upward
 * forces left of the section, M(x) is positive when sagging, dM/dx = V, dV/dx = q.
 *
 * The stiffness system uses two-node Hermite elements between the supports and
 * the beam ends only, loaded by consistent (work-equivalent) nodal loads from
 * every point force, couple and distributed load inside each element. For
 * Euler–Bernoulli beams these are the exact fixed-end actions, so nodal
 * deflections and support reactions are exact and statically indeterminate
 * supports (fixed–fixed, propped cantilevers, continuous spans) are solved
 * without any equilibrium-only shortcut. Keeping load points out of the matrix
 * keeps it well conditioned however closely loads are spaced. V and M are then
 * recovered exactly by statics from the loads and the reactions, which keeps
 * every jump at a point force or couple, and deflection by integrating M/EI
 * exactly from the nearest event on the left. None of this depends on the
 * number of elements per segment, which only sets the NASTRAN mesh.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeamDiag = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SUPPORT_KINDS = ["pin", "fixed"];

  class ModelError extends Error {
    constructor(message, field) {
      super(message);
      this.name = "ModelError";
      this.field = field || null;
    }
  }
  const fail = (message, field) => { throw new ModelError(message, field); };

  function number(value, label, field, { positive = false, min = -Infinity, max = Infinity } = {}) {
    if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be a finite number.`, field);
    if (positive && !(value > 0)) fail(`${label} must be greater than zero.`, field);
    if (value < min || value > max) fail(`${label} must be between ${min} and ${max}.`, field);
    return value;
  }

  /* Check and normalise a model; throws ModelError naming the offending field. */
  function validate(input) {
    if (!input || typeof input !== "object") fail("A beam model is required.");
    const L = number(input.length, "Beam length", "length", { positive: true });
    if (L < 1e-3 || L > 1e4) fail("Beam length must be between 1 mm and 10 km.", "length");
    const at = (value, label, field) => {
      number(value, label, field);
      if (value < 0 || value > L) fail(`${label} must lie on the beam, between 0 and ${fmt(L)} m.`, field);
      return value;
    };
    const material = input.material || {};
    const E = number(material.E, "Young's modulus E", "material.E", { positive: true });
    const nu = number(material.nu, "Poisson's ratio ν", "material.nu");
    if (!(nu > -1 && nu < 0.5)) fail("Poisson's ratio ν must be greater than −1 and less than 0.5.", "material.nu");
    const section = input.section || {};
    const A = number(section.A, "Section area A", "section.A", { positive: true });
    const I = number(section.I, "Second moment of area I", "section.I", { positive: true });
    const Iy = number(section.Iy ?? I, "Out-of-plane second moment Iy", "section.Iy", { positive: true });
    const J = number(section.J ?? 2 * I, "Torsion constant J", "section.J", { positive: true });
    const c = section.c == null ? null : number(section.c, "Extreme-fibre distance c", "section.c", { positive: true });
    if (!Number.isFinite(E * I) || E * I <= 0) fail("Flexural rigidity EI overflows; check the units of E and I.", "section.I");

    const divisions = input.divisions ?? 4;
    if (!Number.isInteger(divisions) || divisions < 1)
      fail("Elements per segment must be a whole number, at least 1.", "divisions");

    if (!Array.isArray(input.supports) || input.supports.length === 0) fail("Add at least one support.", "supports");
    const supports = input.supports.map((s, i) => {
      if (!SUPPORT_KINDS.includes(s && s.kind)) fail(`Support ${i + 1} must be a pin or fixed support.`, `supports.${i}.kind`);
      return { kind: s.kind, x: at(s.x, `Support ${i + 1} position`, `supports.${i}.x`) };
    });
    const sorted = [...supports].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].x === sorted[i - 1].x) fail(`Two supports share the position x = ${fmt(sorted[i].x)} m.`, "supports");
    // With only pins and fixed supports the structure is stable exactly when it
    // has a fixed support or two separate pins; anything less can move rigidly.
    if (!supports.some((s) => s.kind === "fixed") && supports.length < 2)
      fail("Mechanism: a single pin lets the beam rotate freely. Add a second support or make it fixed.", "supports");

    if (!Array.isArray(input.loads)) fail("Loads must be a list.", "loads");
    const loads = input.loads.map((l, i) => {
      const label = `Load ${i + 1}`;
      switch (l && l.kind) {
        case "point":
          return { kind: "point", x: at(l.x, `${label} position`, `loads.${i}.x`), F: number(l.F, `${label} force`, `loads.${i}.F`) };
        case "moment":
          return { kind: "moment", x: at(l.x, `${label} position`, `loads.${i}.x`), C: number(l.C, `${label} couple`, `loads.${i}.C`) };
        case "dist": {
          const x1 = at(l.x1, `${label} start`, `loads.${i}.x1`), x2 = at(l.x2, `${label} end`, `loads.${i}.x2`);
          if (!(x2 > x1)) fail(`${label} must end to the right of where it starts.`, `loads.${i}.x2`);
          return { kind: "dist", x1, x2, q1: number(l.q1, `${label} start intensity`, `loads.${i}.q1`), q2: number(l.q2, `${label} end intensity`, `loads.${i}.q2`) };
        }
        default:
          return fail(`${label} must be a point force, a couple or a distributed load.`, `loads.${i}.kind`);
      }
    });
    return { length: L, material: { E, nu }, section: { A, I, Iy, J, c }, supports, loads, divisions };
  }

  /* Positions where something happens: ends, supports, point actions, load ends. */
  function events(model) {
    const xs = [0, model.length, ...model.supports.map((s) => s.x)];
    for (const l of model.loads) xs.push(...(l.kind === "dist" ? [l.x1, l.x2] : [l.x]));
    const unique = [...new Set(xs)].sort((a, b) => a - b);
    for (let i = 1; i < unique.length; i++)
      if (unique[i] - unique[i - 1] < 1e-6 * model.length)
        fail(`Positions ${fmt(unique[i - 1])} m and ${fmt(unique[i])} m are too close together; make them equal or separate them.`, "loads");
    return unique;
  }

  function mesh(model) {
    const ev = events(model), nodes = [ev[0]];
    for (let i = 1; i < ev.length; i++) {
      for (let j = 1; j < model.divisions; j++) nodes.push(ev[i - 1] + (ev[i] - ev[i - 1]) * j / model.divisions);
      nodes.push(ev[i]);
    }
    return nodes;
  }

  /* Distributed-load intensity at x, taking the load starting at x (side "right") or ending there ("left"). */
  function intensity(model, x, side = "right") {
    let q = 0;
    for (const l of model.loads) {
      if (l.kind !== "dist") continue;
      const inside = side === "right" ? x >= l.x1 && x < l.x2 : x > l.x1 && x <= l.x2;
      if (inside) q += l.q1 + (l.q2 - l.q1) * (x - l.x1) / (l.x2 - l.x1);
    }
    return q;
  }

  /* Symmetric banded matrix: row i keeps K[i][i..i+BAND]. Beam DOFs only couple within one element, so BAND = 3. */
  const BAND = 3;
  const banded = (n) => Array.from({ length: n }, () => new Float64Array(BAND + 1));
  const entry = (K, i, j) => (Math.abs(i - j) > BAND ? 0 : i <= j ? K[i][j - i] : K[j][i - j]);

  /* Solve K u = f for symmetric positive definite banded K by LDLᵀ elimination.
     The system is first scaled to a unit diagonal, which makes the pivot test independent of
     units and element lengths; a vanishing scaled pivot means a mechanism. */
  function solveBanded(K, f) {
    const n = f.length, d = K.map((row) => 1 / Math.sqrt(row[0]));
    if (d.some((v) => !(v > 0 && Number.isFinite(v))))
      fail("The stiffness matrix is singular: the supports do not hold the beam in place.", "supports");
    const a = K.map((row, i) => row.map((v, k) => (i + k < n ? v * d[i] * d[i + k] : 0))), u = f.map((v, i) => v * d[i]);
    for (let c = 0; c < n; c++) {
      if (!(a[c][0] > 1e-12))
        fail("The stiffness matrix is singular: the supports do not hold the beam in place.", "supports");
      for (let r = c + 1; r <= Math.min(n - 1, c + BAND); r++) {
        const m = a[c][r - c] / a[c][0];
        if (m === 0) continue;
        for (let k = r; k <= Math.min(n - 1, c + BAND); k++) a[r][k - r] -= m * a[c][k - c];
        u[r] -= m * u[c];
      }
    }
    for (let r = n - 1; r >= 0; r--) {
      let s = u[r];
      for (let k = r + 1; k <= Math.min(n - 1, r + BAND); k++) s -= a[r][k - r] * u[k];
      u[r] = s / a[r][0];
    }
    return u.map((v, i) => v * d[i]);
  }

  /* Hermite shape functions on an element of length l at ξ ∈ [0, 1] (values and x-derivatives),
     ordered v_i, θ_i, v_j, θ_j. */
  const hermite = (l, t) => [1 - 3 * t * t + 2 * t ** 3, l * (t - 2 * t * t + t ** 3), 3 * t * t - 2 * t ** 3, l * (t ** 3 - t * t)];
  const hermiteSlope = (l, t) => [(6 * t * t - 6 * t) / l, 1 - 4 * t + 3 * t * t, (6 * t - 6 * t * t) / l, 3 * t * t - 2 * t];
  const GAUSS5 = [[-0.9061798459386640, 0.2369268850561891], [-0.5384693101056831, 0.4786286704993665], [0, 0.5688888888888889],
    [0.5384693101056831, 0.4786286704993665], [0.9061798459386640, 0.2369268850561891]];

  function solve(input) {
    const model = validate(input), EI = model.material.E * model.section.I;
    // Stiffness stations: the ends and every support. Loads between them enter as consistent nodal loads.
    const stations = [...new Set([0, model.length, ...model.supports.map((s) => s.x)])].sort((a, b) => a - b);
    const n = stations.length * 2, K = banded(n), f = Array(n).fill(0);
    const where = new Map(stations.map((x, i) => [x, i])), index = (x) => where.get(x);
    const element = (x) => { // the element with stations[e] < x < stations[e + 1]
      let lo = 0, hi = stations.length - 2;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (stations[mid] < x) lo = mid; else hi = mid - 1; }
      return lo;
    };
    const spread = (e, weights, value) => weights.forEach((w, i) => { f[2 * e + i] += w * value; });

    for (let e = 0; e < stations.length - 1; e++) {
      const l = stations[e + 1] - stations[e], k = EI / l ** 3, d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      const ke = [[12, 6 * l, -12, 6 * l], [6 * l, 4 * l * l, -6 * l, 2 * l * l], [-12, -6 * l, 12, -6 * l], [6 * l, 2 * l * l, -6 * l, 4 * l * l]];
      for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) K[d[i]][d[j] - d[i]] += k * ke[i][j];
    }
    for (const ld of model.loads) {
      if (ld.kind === "point" || ld.kind === "moment") {
        const i = index(ld.x);
        if (i !== undefined) { f[2 * i + (ld.kind === "point" ? 0 : 1)] += ld.kind === "point" ? ld.F : ld.C; continue; }
        const e = element(ld.x), a = stations[e], l = stations[e + 1] - a, t = (ld.x - a) / l;
        if (ld.kind === "point") spread(e, hermite(l, t), ld.F);
        else spread(e, hermiteSlope(l, t), ld.C);
      } else {
        // ∫ N q dx over each element's share of the load: N is cubic and q linear, so 5-point Gauss is exact.
        for (let e = 0; e < stations.length - 1; e++) {
          const a = stations[e], l = stations[e + 1] - a, lo = Math.max(a, ld.x1), hi = Math.min(a + l, ld.x2);
          if (!(hi > lo)) continue;
          for (const [g, w] of GAUSS5) {
            const x = lo + (hi - lo) * (g + 1) / 2, q = ld.q1 + (ld.q2 - ld.q1) * (x - ld.x1) / (ld.x2 - ld.x1);
            spread(e, hermite(l, (x - a) / l), w * q * (hi - lo) / 2);
          }
        }
      }
    }

    const fixed = new Set();
    for (const s of model.supports) {
      fixed.add(2 * index(s.x));
      if (s.kind === "fixed") fixed.add(2 * index(s.x) + 1);
    }
    // Dropping constrained DOFs keeps the free system banded with the same BAND.
    const free = [...Array(n).keys()].filter((i) => !fixed.has(i));
    const u = Array(n).fill(0);
    if (free.length) {
      const Kf = banded(free.length);
      free.forEach((i, a) => { for (let b = a; b < Math.min(free.length, a + BAND + 1); b++) Kf[a][b - a] = entry(K, i, free[b]); });
      solveBanded(Kf, free.map((i) => f[i])).forEach((v, a) => { u[free[a]] = v; });
    }
    if (u.some((v) => !Number.isFinite(v))) fail("The solution overflowed; check that E, I and the loads use consistent units.", "section.I");

    const residual = (i) => {
      let s = -f[i];
      for (let j = Math.max(0, i - BAND); j <= Math.min(n - 1, i + BAND); j++) s += entry(K, i, j) * u[j];
      return s;
    };
    const reactions = model.supports.map((s) => {
      const i = index(s.x);
      return { kind: s.kind, x: s.x, Fy: residual(2 * i), Mz: s.kind === "fixed" ? residual(2 * i + 1) : 0 };
    }).sort((a, b) => a.x - b.x);

    // Deflection at every event: stations take the solved values; other events integrate M/EI
    // exactly from the previous event (nothing happens strictly between two events).
    const result = { model, reactions, displacements: [] };
    for (const x of events(model)) {
      const i = index(x), prev = result.displacements.at(-1);
      result.displacements.push(i !== undefined ? { x, v: u[2 * i], theta: u[2 * i + 1] } : { x, ...integrate(result, prev, x) });
    }
    result.equilibrium = equilibrium(result);
    return result;
  }

  /* Resultant force and moment about x = 0 of all loads and reactions (should vanish). */
  function equilibrium(result) {
    const { model, reactions } = result;
    let Fy = 0, Mz = 0, scaleF = 0, scaleM = 0;
    const add = (F, x, C = 0) => { Fy += F; Mz += F * x + C; scaleF += Math.abs(F); scaleM += Math.abs(F * x) + Math.abs(C); };
    for (const r of reactions) add(r.Fy, r.x, r.Mz);
    for (const l of model.loads) {
      if (l.kind === "point") add(l.F, l.x);
      if (l.kind === "moment") add(0, 0, l.C);
      if (l.kind === "dist") {
        // A trapezoid is two triangles: q1 peaking at x1 and q2 peaking at x2.
        const b = l.x2 - l.x1;
        add(l.q1 * b / 2, l.x1 + b / 3);
        add(l.q2 * b / 2, l.x1 + 2 * b / 3);
      }
    }
    return { Fy, Mz, scaleF, scaleM };
  }

  /* Exact internal forces at x from the left free body. side "left" gives the limit x⁻, "right" gives x⁺. */
  function internal(result, x, side = "right") {
    const { model, reactions } = result;
    const incl = (a) => (side === "right" ? a <= x : a < x);
    let V = 0, M = 0;
    for (const r of reactions) if (incl(r.x)) { V += r.Fy; M += r.Fy * (x - r.x) - r.Mz; }
    for (const l of model.loads) {
      if (l.kind === "point" && incl(l.x)) { V += l.F; M += l.F * (x - l.x); }
      if (l.kind === "moment" && incl(l.x)) M -= l.C;
      if (l.kind === "dist" && x > l.x1) {
        const b = Math.min(x, l.x2) - l.x1, s = (l.q2 - l.q1) / (l.x2 - l.x1);
        const qb = l.q1 + s * b; // intensity at the end of the loaded part
        V += (l.q1 + qb) * b / 2;
        // Rectangle q1 plus triangle (qb − q1), each about the section at x.
        M += l.q1 * b * (x - l.x1 - b / 2) + (qb - l.q1) * b / 2 * (x - l.x1 - 2 * b / 3);
      }
    }
    return { V, M };
  }

  const GAUSS = [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]];

  /* Deflection and slope at x: values at the events, integrated exactly from M/EI between them. */
  function deflection(result, x) {
    const d = result.displacements;
    // Binary search for the segment containing x (the last one whose start is at or before x).
    let lo = 0, hi = d.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (d[mid].x <= x) lo = mid; else hi = mid - 1; }
    if (x === d[lo + 1].x) { const { v, theta } = d[lo + 1]; return { v, theta }; }
    return integrate(result, d[lo], x);
  }

  /* v and θ at x from their values at an earlier point `from` with no event between: θ' = M/EI, v' = θ.
     M is at most cubic there, so 3-point Gauss integrates M and (x − t)M exactly. */
  function integrate(result, from, x) {
    const EI = result.model.material.E * result.model.section.I, x0 = from.x, s = x - x0, { v, theta } = from;
    if (s === 0) return { v, theta };
    let dv = 0, dt = 0;
    for (const [g, w] of GAUSS) {
      const t = s * (g + 1) / 2, M = internal(result, x0 + t, "right").M;
      dt += w * M;
      dv += w * (s - t) * M;
    }
    return { v: v + theta * s + dv * s / 2 / EI, theta: theta + dt * s / 2 / EI };
  }

  /* Values at x with both one-sided limits of V and M. */
  function at(result, x) {
    const L = result.model.length;
    const left = x > 0 ? internal(result, x, "left") : { V: 0, M: 0 };
    const right = x < L ? internal(result, x, "right") : { V: 0, M: 0 };
    return { x, Vleft: left.V, Vright: right.V, Mleft: left.M, Mright: right.M, ...deflection(result, x) };
  }

  /* Mesh-independent plot samples: about `count` regular points plus per-segment critical points
     and event limits. Each segment runs from its right limit at the start to its left limit at the
     end, so jumps appear as two points at the same x. */
  function diagram(result, count = 800) {
    const ev = result.displacements.map((d) => d.x), L = result.model.length, pts = [];
    for (let e = 0; e < ev.length - 1; e++) {
      const a = ev[e], b = ev[e + 1], n = Math.max(2, Math.ceil(count * (b - a) / L));
      const xs = new Set(criticalPoints(result, a, b));
      for (let j = 0; j <= n; j++) xs.add(j === n ? b : a + (b - a) * j / n);
      for (const x of [...xs].sort((x, y) => x - y)) {
        pts.push({ x, ...internal(result, x, x === b ? "left" : "right"), ...deflection(result, x) });
      }
    }
    // Close the diagrams to zero at the free ends of the beam.
    return [{ x: 0, V: 0, M: 0, ...deflection(result, 0) }, ...pts, { x: L, V: 0, M: 0, ...deflection(result, L) }];
  }

  function criticalPoints(result, a, b) {
    const model = result.model, h = b - a, xs = [a, b];
    const ra = internal(result, a, "right"), qa = intensity(model, a, "right"), qb = intensity(model, b, "left");
    // q is linear and V quadratic inside a segment: V(s) = C + B s + A s².
    const A = (qb - qa) / (2 * h), B = qa, C = ra.V;
    if (qa * qb < 0) xs.push(a + qa / (qa - qb) * h);
    const roots = Math.abs(A) < 1e-300 ? (B !== 0 ? [-C / B] : []) : (() => {
      const disc = B * B - 4 * A * C;
      return disc < 0 ? [] : [(-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A)];
    })();
    const shearRoots = roots.filter((s) => s > 0 && s < h).map((s) => a + s).sort((x, y) => x - y);
    xs.push(...shearRoots);
    const bisect = (lo, hi, value) => {
      let vlo = value(lo);
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (mid === lo || mid === hi) break;
        const vmid = value(mid);
        if (vmid === 0) return mid;
        if (vlo * vmid < 0) hi = mid;
        else { lo = mid; vlo = vmid; }
      }
      return (lo + hi) / 2;
    };
    const moment = (x) => internal(result, x, x === b ? "left" : "right").M;
    const momentRoots = [], partitions = [a, ...shearRoots, b];
    for (let i = 0; i < partitions.length - 1; i++) {
      const lo = partitions[i], hi = partitions[i + 1];
      if (moment(lo) === 0) momentRoots.push(lo);
      if (moment(lo) * moment(hi) < 0) momentRoots.push(bisect(lo, hi, moment));
    }
    const slope = (x) => deflection(result, x).theta;
    const slopePartitions = [a, ...momentRoots.filter((x) => x > a && x < b), b];
    for (let i = 0; i < slopePartitions.length - 1; i++) {
      const lo = slopePartitions[i], hi = slopePartitions[i + 1];
      xs.push(lo, hi);
      if (slope(lo) * slope(hi) < 0) xs.push(bisect(lo, hi, slope));
    }
    return xs;
  }

  function extremes(result) {
    const best = { V: null, M: null, v: null };
    for (const p of diagram(result).slice(1, -1)) {
      for (const key of ["V", "M", "v"]) {
        const value = p[key];
        if (!best[key] || Math.abs(value) > Math.abs(best[key].value) + 1e-12 * Math.abs(value)) best[key] = { x: p.x, value };
      }
    }
    return best;
  }

  /* Section properties (m, m², m⁴) from a shape. Bending is about the horizontal axis, depth along y. */
  function sectionProperties(spec) {
    const pos = (v, label, field) => number(v, label, field, { positive: true });
    switch (spec && spec.shape) {
      case "rect": {
        const b = pos(spec.b, "Section width b", "section.b"), h = pos(spec.h, "Section depth h", "section.h");
        const long = Math.max(b, h), short = Math.min(b, h), r = short / long;
        // Saint-Venant torsion constant of a solid rectangle (Roark's series approximation).
        const J = long * short ** 3 * (1 / 3 - 0.21 * r * (1 - r ** 4 / 12));
        return { A: b * h, I: b * h ** 3 / 12, Iy: h * b ** 3 / 12, J, c: h / 2 };
      }
      case "circle": {
        const d = pos(spec.d, "Diameter d", "section.d");
        return { A: Math.PI * d * d / 4, I: Math.PI * d ** 4 / 64, Iy: Math.PI * d ** 4 / 64, J: Math.PI * d ** 4 / 32, c: d / 2 };
      }
      case "tube": {
        const d = pos(spec.d, "Outside diameter D", "section.d"), t = pos(spec.t, "Wall thickness t", "section.t");
        if (!(2 * t < d)) fail("Wall thickness must be less than half the outside diameter.", "section.t");
        const di = d - 2 * t, I = Math.PI * (d ** 4 - di ** 4) / 64;
        return { A: Math.PI * (d * d - di * di) / 4, I, Iy: I, J: 2 * I, c: d / 2 };
      }
      case "custom": {
        const I = pos(spec.I, "Second moment of area I", "section.I");
        return {
          A: pos(spec.A, "Section area A", "section.A"), I,
          Iy: spec.Iy == null ? I : pos(spec.Iy, "Out-of-plane second moment Iy", "section.Iy"),
          J: spec.J == null ? 2 * I : pos(spec.J, "Torsion constant J", "section.J"),
          c: spec.c == null ? null : pos(spec.c, "Extreme-fibre distance c", "section.c"),
        };
      }
      default:
        return fail("Choose a rectangle, solid circle, tube or custom section.", "section.shape");
    }
  }

  /* Degree of static indeterminacy for transverse loading: reaction components minus the two equilibrium equations. */
  function indeterminacy(supports) {
    return supports.reduce((n, s) => n + (s.kind === "fixed" ? 2 : 1), 0) - 2;
  }

  /* ---------- NASTRAN bulk data export (MSC Nastran SOL 101, fixed-format bulk data) ---------- */

  /* A real in the fewest characters that still read back as exactly the same double,
   * e.g. 6. 0.3 -40000. 2.E11 4.456-4; null when that takes more than `width` characters. */
  function exactReal(x, width) {
    if (x === 0) return "0.";
    const [mant, exp] = Math.abs(x).toExponential().split("e"), e = +exp, sign = x < 0 ? "-" : "";
    const digits = mant.replace(".", "");
    let plain;
    if (e >= digits.length - 1) plain = digits + "0".repeat(e - digits.length + 1) + ".";
    else if (e >= 0) plain = digits.slice(0, e + 1) + "." + digits.slice(e + 1);
    else plain = "0." + "0".repeat(-e - 1) + digits;
    const m = digits[0] + "." + digits.slice(1);
    const candidates = e >= -3 && e < 6 ? [plain, plain.replace(/^0\./, ".")] : [];
    candidates.push(`${m}E${e}`, `${m}${e < 0 ? "" : "+"}${e}`);
    // Prefer a form that leaves a blank column, so neighbouring fields do not run together.
    const fits = candidates.map((c) => sign + c);
    return fits.find((c) => c.length < width) ?? fits.find((c) => c.length === width) ?? null;
  }

  /* A real for a 16-character large field: exact when it fits, otherwise rounded to as many digits as fit. */
  function nastranReal(x) {
    for (let digits = 17; ; digits--) {
      const text = exactReal(digits === 17 ? x : Number(x.toPrecision(digits)), 16);
      if (text !== null) return text;
    }
  }

  /* Fields are {int}, {real} or a literal string (blank = ""). */
  const int = (n) => ({ int: n });
  const real = (x) => ({ real: x });
  function smallField(v) {
    if (v && typeof v === "object" && "int" in v) return String(v.int);
    if (v && typeof v === "object" && "real" in v) return exactReal(v.real, 8);
    return v == null ? "" : String(v);
  }
  function largeField(v) {
    if (v && typeof v === "object" && "real" in v) return nastranReal(v.real);
    return smallField(v);
  }
  const fitsSmall = (fields) => fields.every((v) => { const s = smallField(v); return s !== null && s.length <= 8; });

  /* One small-field entry: the name, then eight 8-character fields per line; continuations start blank. */
  function smallEntry(name, fields) {
    const out = [], values = fields.map(smallField);
    for (let i = 0; i < Math.max(values.length, 1); i += 8) {
      const head = i === 0 ? name.padEnd(8) : "".padEnd(8);
      out.push((head + values.slice(i, i + 8).map((v) => v.padEnd(8)).join("")).trimEnd());
    }
    return out;
  }

  /* One large-field entry: NAME* then four 16-character fields per line. */
  function largeEntry(name, fields) {
    const out = [], values = fields.map(largeField);
    for (const v of values) if (v.length > 16) throw new Error(`Field ${v} is wider than 16 characters.`);
    for (let i = 0; i < Math.max(values.length, 1); i += 4) {
      const head = i === 0 ? `${name}*`.padEnd(8) : "*".padEnd(8);
      out.push((head + values.slice(i, i + 4).map((v) => v.padEnd(16)).join("")).trimEnd());
    }
    return out;
  }

  /* Cards of one type share a format: small field unless some value needs more than
   * eight characters to stay exact, then large field for the whole group. */
  function cardGroup(name, rows) {
    const entry = rows.every(fitsSmall) ? smallEntry : largeEntry;
    return rows.flatMap((fields) => entry(name, fields));
  }
  /* A "$" line naming the columns of a small-field card. */
  const columns = (...names) => ("$" + names[0].padEnd(7) + names.slice(1).map((n) => n.padEnd(8)).join("")).trimEnd();

  const count = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

  /* Build a NASTRAN deck that encodes exactly the model the browser solved. */
  function exportBdf(input, { title = "BEAMDIAG LINEAR STATIC" } = {}) {
    const model = validate(input), nodes = mesh(model);
    const hasLoad = model.loads.some((l) => (l.kind === "point" && l.F !== 0) || (l.kind === "moment" && l.C !== 0) || (l.kind === "dist" && (l.q1 !== 0 || l.q2 !== 0)));
    if (!hasLoad) fail("Add a non-zero load before exporting a NASTRAN deck.", "loads");
    const ids = new Map(nodes.map((x, i) => [x, i + 1])), gid = (x) => ids.get(x);
    const safeTitle = String(title).replace(/[^A-Za-z0-9 _.,()+\-]/g, " ").slice(0, 60).trim() || "BEAMDIAG";
    const { material: mat, section: sec } = model, SPC = 1, LOAD = 2;
    const lines = [
      `$ Beam, L = ${fmt(model.length)} m: ${count(nodes.length, "grid")}, ${count(nodes.length - 1, "CBAR")}, ${count(model.supports.length, "support")}, ${count(model.loads.length, "load")}`,
      "$ Units N, m, Pa. Beam on X, loads in Y (+ up), moments about Z (+ CCW).",
      "SOL 101",
      "CEND",
      `TITLE = ${safeTitle}`,
      "ECHO = NONE",
      "DISPLACEMENT = ALL",
      "SPCFORCES = ALL",
      "OLOAD = ALL",
      "FORCE = ALL",
      "SUBCASE 1",
      "  LABEL = BEAM LOADS",
      `  SPC = ${SPC}`,
      `  LOAD = ${LOAD}`,
      "BEGIN BULK",
      "$ Write the .xdb results database",
      ...smallEntry("PARAM", ["POST", int(0)]),
      "$",
      "$ ---- Material and property ----",
      columns("MAT1", "MID", "E", "G", "NU"),
      ...cardGroup("MAT1", [[int(1), real(mat.E), "", real(mat.nu)]]),
      "$ I1 = in-plane I. K1, K2 blank: no shear flexibility (Euler-Bernoulli).",
      columns("PBAR", "PID", "MID", "A", "I1", "I2", "J"),
      ...cardGroup("PBAR", [[int(1), int(1), real(sec.A), real(sec.I), real(sec.Iy), real(sec.J)]]),
      "$",
      "$ ---- Grid points ----",
      "$ Planar beam: PS = 345 on every grid leaves only T1, T2 and R3 free.",
      columns("GRDSET", "", "CP", "", "", "", "CD", "PS"),
      ...smallEntry("GRDSET", ["", "", "", "", "", "", int(345)]),
      columns("GRID", "ID", "CP", "X1", "X2", "X3"),
      ...cardGroup("GRID", nodes.map((x, i) => [int(i + 1), "", real(x), real(0), real(0)])),
      "$",
      "$ ---- Elements ----",
      columns("CBAR", "EID", "PID", "GA", "GB", "X1", "X2", "X3"),
      ...cardGroup("CBAR", nodes.slice(1).map((_, e) => [int(e + 1), int(1), int(e + 1), int(e + 2), real(0), real(1), real(0)])),
      "$",
      "$ ---- Constraints ----",
      "$ Pin: 12 (T1, T2). Fixed: 126 (T1, T2, R3).",
      columns("SPC1", "SID", "C", "G1", "G2", "G3", "G4", "G5", "G6"),
    ];
    for (const [kind, c] of [["pin", 12], ["fixed", 126]]) {
      const grids = model.supports.filter((s) => s.kind === kind).map((s) => gid(s.x)).sort((a, b) => a - b);
      if (grids.length) lines.push(...smallEntry("SPC1", [int(SPC), int(c), ...grids.map(int)]));
    }
    lines.push("$", "$ ---- Loads ----");
    const forces = model.loads.filter((l) => l.kind === "point" && l.F !== 0);
    if (forces.length) lines.push(columns("FORCE", "SID", "G", "CID", "F", "N1", "N2", "N3"),
      ...cardGroup("FORCE", forces.map((l) => [int(LOAD), int(gid(l.x)), int(0), real(l.F), real(0), real(1), real(0)])));
    const moments = model.loads.filter((l) => l.kind === "moment" && l.C !== 0);
    if (moments.length) lines.push(columns("MOMENT", "SID", "G", "CID", "M", "N1", "N2", "N3"),
      ...cardGroup("MOMENT", moments.map((l) => [int(LOAD), int(gid(l.x)), int(0), real(l.C), real(0), real(0), real(1)])));
    // One PLOAD1 per element under each distributed load, with the intensities at the element ends.
    const ploads = [];
    for (const l of model.loads) {
      if (l.kind !== "dist" || (l.q1 === 0 && l.q2 === 0)) continue;
      const q = (x) => l.q1 + (l.q2 - l.q1) * (x - l.x1) / (l.x2 - l.x1);
      for (let e = 0; e < nodes.length - 1; e++) {
        const a = nodes[e], b = nodes[e + 1];
        if (a >= l.x1 && b <= l.x2) ploads.push([int(LOAD), int(e + 1), "FY", "FR", real(0), real(q(a)), real(1), real(q(b))]);
      }
    }
    if (ploads.length) lines.push(columns("PLOAD1", "SID", "EID", "TYPE", "SCALE", "X1", "P1", "X2", "P2"), ...cardGroup("PLOAD1", ploads));
    lines.push("$", "ENDDATA", "");
    return lines.join("\n");
  }

  function fmt(x) {
    return Number.isInteger(x) ? String(x) : String(+x.toPrecision(6));
  }

  return { SUPPORT_KINDS, ModelError, sectionProperties, indeterminacy, validate, mesh, solve, internal, deflection, at, diagram, extremes, exportBdf, smallEntry, largeEntry, exactReal, nastranReal };
});
