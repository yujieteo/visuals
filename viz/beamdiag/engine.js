/* BEAMDIAG engine: linear-elastic Euler–Bernoulli beam, direct stiffness method.
 *
 * Units are SI throughout: m, N, N/m, N·m, Pa, m², m⁴. UNIT_SYSTEMS lists the
 * consistent unit conventions a caller may enter and read values in; toUnits and
 * fromUnits convert at that edge, and the solver itself never sees anything but SI.
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

  /* ---------- unit conventions ---------- */

  /* Consistent unit systems: each gives the SI size of one unit of length, force and stress, and
     stress is always force per length squared, so E·I/L³ and every other product stays in the
     system without extra factors. Other quantities are derived from length and force.
     `ascii` names the system in NASTRAN comments, which should stay plain ASCII. */
  const LBF = 4.4482216152605, INCH = 0.0254; // exact by definition
  const UNIT_SYSTEMS = Object.freeze(Object.fromEntries([
    { id: "kN-m", label: "SI: kN, m, kPa", length: [1, "m"], force: [1e3, "kN"], stress: [1e3, "kPa"], ascii: "kN, m, kPa (kN/m2)" },
    { id: "N-m", label: "SI: N, m, Pa", length: [1, "m"], force: [1, "N"], stress: [1, "Pa"], ascii: "N, m, Pa (N/m2)" },
    { id: "N-mm", label: "SI: N, mm, MPa", length: [1e-3, "mm"], force: [1, "N"], stress: [1e6, "MPa"], ascii: "N, mm, MPa (N/mm2)" },
    { id: "lbf-in", label: "US customary: lbf, in, psi", length: [INCH, "in"], force: [LBF, "lbf"], stress: [LBF / INCH ** 2, "psi"], ascii: "lbf, in, psi (lbf/in2)" },
    { id: "kip-in", label: "US customary: kip, in, ksi", length: [INCH, "in"], force: [1e3 * LBF, "kip"], stress: [1e3 * LBF / INCH ** 2, "ksi"], ascii: "kip, in, ksi (kip/in2)" },
  ].map((u) => {
    const [l, L] = u.length, [f, F] = u.force, [p, P] = u.stress;
    const factor = { length: l, force: f, stress: p, moment: f * l, distributed: f / l, area: l * l, inertia: l ** 4, rigidity: f * l * l, angle: 1 };
    const symbol = { length: L, force: F, stress: P, moment: `${F}·${L}`, distributed: `${F}/${L}`, area: `${L}²`, inertia: `${L}⁴`, rigidity: `${F}·${L}²`, angle: "rad" };
    return [u.id, Object.freeze({ id: u.id, label: u.label, ascii: u.ascii, factor: Object.freeze(factor), symbol: Object.freeze(symbol) })];
  })));
  const DEFAULT_UNITS = "N-mm";
  const SI = UNIT_SYSTEMS["N-m"];

  function unitSystem(units) {
    const u = typeof units === "string" ? UNIT_SYSTEMS[units] : units;
    if (!u || !UNIT_SYSTEMS[u.id]) fail(`Unknown unit convention ${JSON.stringify(units && units.id || units)}; choose one of ${Object.keys(UNIT_SYSTEMS).join(", ")}.`, "units");
    return u;
  }
  /* SI value → number in `units`, and back. */
  const toUnits = (value, quantity, units) => value / unitSystem(units).factor[quantity];
  const fromUnits = (value, quantity, units) => value * unitSystem(units).factor[quantity];

  /* Re-express a validated SI model in `units` (both directions via `convert`). */
  function scaleModel(model, units, convert = toUnits) {
    const u = unitSystem(units), c = (v, q) => (v == null ? v : convert(v, q, u)), x = (v) => c(v, "length");
    const { section: s } = model;
    return {
      ...model, length: x(model.length),
      material: { ...model.material, E: c(model.material.E, "stress") },
      section: { ...s, A: c(s.A, "area"), I: c(s.I, "inertia"), Iy: c(s.Iy, "inertia"), J: c(s.J, "inertia"), c: x(s.c) },
      supports: model.supports.map((sp) => ({ ...sp, x: x(sp.x) })),
      loads: model.loads.map((l) => (l.kind === "point" ? { ...l, x: x(l.x), F: c(l.F, "force") }
        : l.kind === "moment" ? { ...l, x: x(l.x), C: c(l.C, "moment") }
          : { ...l, x1: x(l.x1), x2: x(l.x2), q1: c(l.q1, "distributed"), q2: c(l.q2, "distributed") })),
    };
  }

  function number(value, label, field, { positive = false, min = -Infinity, max = Infinity } = {}) {
    if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be a finite number.`, field);
    if (positive && !(value > 0)) fail(`${label} must be greater than zero.`, field);
    if (value < min || value > max) fail(`${label} must be between ${min} and ${max}.`, field);
    return value;
  }

  /* Check and normalise an SI model; throws ModelError naming the offending field.
     `units` only sets how lengths are written in the messages. */
  function validate(input, { units = SI } = {}) {
    if (!input || typeof input !== "object") fail("A beam model is required.");
    const len = lengthText(units);
    const L = number(input.length, "Beam length", "length", { positive: true });
    if (L < 1e-3 || L > 1e4) fail(`Beam length must be between ${len(1e-3)} and ${len(1e4)}.`, "length");
    const at = (value, label, field) => {
      number(value, label, field);
      if (value < 0 || value > L) fail(`${label} must lie on the beam, between 0 and ${len(L)}.`, field);
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
      if (sorted[i].x === sorted[i - 1].x) fail(`Two supports share the position x = ${len(sorted[i].x)}.`, "supports");
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
    const model = { length: L, material: { E, nu }, section: { A, I, Iy, J, c }, supports, loads, divisions };
    events(model, units);
    return model;
  }

  /* Positions where something happens: ends, supports, point actions, load ends. */
  function events(model, units = SI) {
    const xs = [0, model.length, ...model.supports.map((s) => s.x)];
    for (const l of model.loads) xs.push(...(l.kind === "dist" ? [l.x1, l.x2] : [l.x]));
    const unique = [...new Set(xs)].sort((a, b) => a - b);
    for (let i = 1; i < unique.length; i++)
      if (unique[i] - unique[i - 1] < 1e-6 * model.length)
        fail(`Positions ${lengthText(units)(unique[i - 1])} and ${lengthText(units)(unique[i])} are too close together; make them equal or separate them.`, "loads");
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

  function solve(input, { units = SI } = {}) {
    const model = validate(input, { units }), EI = model.material.E * model.section.I;
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
  /* The input is SI, like every other function here; the deck's numbers are written in `units`. */
  function exportBdf(input, { title = "BEAMDIAG LINEAR STATIC", units = SI } = {}) {
    // Fifteen digits drop the last-bit noise a conversion leaves (5e-3 m² is 5000 mm², not 5000.000000000001).
    const u = unitSystem(units), model = scaleModel(validate(input, { units: u }), u, (v, q) => +toUnits(v, q, u).toPrecision(15)), nodes = mesh(model);
    const hasLoad = model.loads.some((l) => (l.kind === "point" && l.F !== 0) || (l.kind === "moment" && l.C !== 0) || (l.kind === "dist" && (l.q1 !== 0 || l.q2 !== 0)));
    if (!hasLoad) fail("Add a non-zero load before exporting a NASTRAN deck.", "loads");
    const ids = new Map(nodes.map((x, i) => [x, i + 1])), gid = (x) => ids.get(x);
    const safeTitle = String(title).replace(/[^A-Za-z0-9 _.,()+\-]/g, " ").slice(0, 60).trim() || "BEAMDIAG";
    const { material: mat, section: sec } = model, SPC = 1, LOAD = 2;
    const lines = [
      `$ Beam, L = ${fmt(model.length)} ${u.symbol.length}: ${count(nodes.length, "grid")}, ${count(nodes.length - 1, "CBAR")}, ${count(model.supports.length, "support")}, ${count(model.loads.length, "load")}`,
      `$ Units ${u.ascii}. Beam on X, loads in Y (+ up), moments about Z (+ CCW).`,
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

  /* ---------- number formatting, shared by the page and the beamdswitch report ---------- */
  /* Each unit convention puts values on a different scale (a deflection is 0.004 m or 4 mm),
     so very large and very small magnitudes switch to powers of ten. */
  const plain = (x, n) => String(+x.toPrecision(n)).replace("-", "−");
  const pow10 = (x, n) => {
    const [m, e] = x.toExponential(n - 1).split("e");
    return `${plain(+m, n)}×10${e.replace("+", "").replace("-", "⁻").replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c])}`;
  };
  const nf = (x, digits = 3) => {
    if (!Number.isFinite(x)) return "—";
    const a = Math.abs(x);
    if (a === 0) return "0";
    if (a >= 1e7 || a < 1e-3) return pow10(x, 4);
    if (a < 1) return plain(x, 4);
    const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : digits;
    return x.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }).replace("-", "−");
  };
  const sig = (x, n = 4) => {
    if (!Number.isFinite(x)) return "—";
    const a = Math.abs(x);
    return a === 0 || (a >= 1e-4 && a < 1e7) ? plain(x, n) : pow10(x, n);
  };
  const sci = (x) => {
    if (!Number.isFinite(x)) return "—";
    const a = Math.abs(x);
    return a === 0 || (a >= 1e-2 && a < 1e6) ? plain(x, 4) : pow10(x, 4);
  };
  // Figure labels: plain digits below `big`, otherwise n significant figures × a power of ten, so a
  // label stays a few characters long at any load magnitude in any unit convention.
  const short = (x, n = 3, big = 1e6) => (Number.isFinite(x) && Math.abs(x) >= big ? pow10(x, n) : sig(x, n));
  const shortNf = (x, digits) => (Number.isFinite(x) && Math.abs(x) >= 1e6 ? pow10(x, 4) : nf(x, digits));
  const format = Object.freeze({ plain, pow10, nf, sig, sci, short, shortNf });

  /* ---------- beamdswitch report ----------
   * beamReport(result, options) describes a solved beam as a report for the standard beamdswitch
   * template (beamdswitch.js; the site's templates/beamdswitch-report.md). It reads every number from the
   * solver's result and writes it with the same formatter the page uses for that value, so the
   * deck, its narration and the page agree digit for digit. The ::: plot curves are the solver's
   * own shear, moment and deflection written as Macaulay brackets from its reactions and the loads.
   * Options: units, origin ("left" or "mid"), title, section { shape, label, dims: [[label, SI
   * value, quantity]] }, material { label }. */

  /* A position measured from the left end, re-measured from `origin` ("left" or "mid") as the page
     shows it. Round-off of order 1e-12·L reads as exactly mid-span rather than as 10⁻¹⁴ mm. */
  function fromOrigin(x, L, origin) {
    if (origin !== "mid") return x;
    const s = x - L / 2;
    return Math.abs(s) <= 1e-12 * L ? 0 : +s.toPrecision(12);
  }

  /* Relative out-of-balance of loads and reactions, as the page reports it. */
  const residual = (eq) => Math.max(Math.abs(eq.Fy) / Math.max(eq.scaleF, 1e-300), Math.abs(eq.Mz) / Math.max(eq.scaleM, 1e-300));
  /* Span over largest deflection, as in "L/360"; "∞" when the beam does not deflect. */
  const spanRatio = (L, v) => (Math.abs(v) > 0 ? String(Math.round(L / Math.abs(v))) : "∞");

  const SPOKEN_UNITS = {
    m: ["metre", "metres"], mm: ["millimetre", "millimetres"], in: ["inch", "inches"],
    N: ["newton", "newtons"], kN: ["kilonewton", "kilonewtons"], lbf: ["pound-force", "pounds-force"], kip: ["kip", "kips"],
    Pa: ["pascal", "pascals"], kPa: ["kilopascal", "kilopascals"], MPa: ["megapascal", "megapascals"],
    psi: ["pound per square inch", "pounds per square inch"], ksi: ["kip per square inch", "kips per square inch"],
  };
  function spokenUnit(u, quantity, plural = true) {
    const w = (sym, many) => SPOKEN_UNITS[sym][many ? 1 : 0], L = u.symbol.length, F = u.symbol.force;
    switch (quantity) {
      case "moment": return `${w(F, false)} ${w(L, plural)}`;
      case "distributed": return `${w(F, plural)} per ${w(L, false)}`;
      case "area": return `square ${w(L, plural)}`;
      case "inertia": return `${w(L, plural)} to the fourth`;
      case "rigidity": return `${w(F, false)} square ${w(L, plural)}`;
      case "angle": return plural ? "radians" : "radian";
      default: return w(u.symbol[quantity], plural);
    }
  }
  const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const exponent = (e) => (e.startsWith("⁻") ? "-" : "") + [...e.replace("⁻", "")].map((c) => SUPERSCRIPT.indexOf(c)).join("");
  /* A number as the page writes it (−1,234 or 1.5×10⁻⁴), read aloud or typeset. */
  const sayNumber = (t) => t.replace(/^−/, "minus ").replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/, (_, e) => ` times ten to the ${exponent(e).replace("-", "minus ")}`);
  const texNumber = (t) => t.replace(/^−/, "-").replace(/,/g, "{,}").replace(/×10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/, (_, e) => `\\times 10^{${exponent(e)}}`);
  const texUnit = (sym) => `\\mathrm{${sym.replace(/·/g, "\\cdot ").replace(/²/g, "^2").replace(/³/g, "^3").replace(/⁴/g, "^4")}}`;

  /* The narration voice every beam deck declares. */
  const VOICE = "bf_emma";
  const speech = Object.freeze({ sayNumber, texNumber, texUnit, spokenUnit, VOICE });

  const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const SHAPE_NAMES = { rect: "solid rectangle", circle: "solid circle", tube: "circular tube", custom: "custom section" };
  /* "two supports", "one load": a small count in words. */
  const counted = (n, one, many) => `${NUMBER_WORDS[n] ?? n} ${n === 1 ? one : many}`;

  /* The method frame: how the reactions follow, for a beam statically indeterminate to degree deg
     (its supports give r = deg + 2 reaction components). */
  function methodFrame(deg) {
    const r = deg + 2;
    if (deg <= 0) return {
      title: "Statically determinate: equilibrium alone gives the reactions",
      body: [
        `$$ n = r - 2 = ${r} - 2 = 0 $$`,
        "",
        "$$ \\sum F_y = 0, \\qquad \\sum M = 0 $$",
        "",
        "- Two equations, two unknown reaction components.",
        "- The solver still uses the direct stiffness method, which agrees with equilibrium here.",
      ].join("\n"),
      narration: [
        "The supports provide two reaction components, and a planar beam gives two useful equilibrium equations.",
        "So the beam is statically determinate: vertical equilibrium and moment equilibrium fix the reactions.",
        "The solver uses the direct stiffness method for every beam, and for this one it agrees with equilibrium alone.",
      ].join(" "),
    };
    return {
      title: `Indeterminate to degree ${deg}: equilibrium needs ${counted(deg, "compatibility condition", "compatibility conditions")}`,
      body: [
        `$$ n = r - 2 = ${r} - 2 = ${deg} $$`,
        "",
        "- Compatibility: $v = 0$ at every support, and $\\theta = 0$ at every fixed support.",
        "- The direct stiffness method enforces all of them at once:",
        "$$ \\mathbf{K}\\,\\mathbf{u} = \\mathbf{f} $$",
        "- It solves for the free deflections and slopes; the reactions are the forces the restrained ones need.",
      ].join("\n"),
      notes: "Two-node Hermite beam elements run between the supports and the ends. Loads between them enter as consistent nodal loads, which are the exact fixed-end actions, so the reactions are exact rather than approximate.",
      narration: [
        `The supports provide ${counted(r, "reaction component", "reaction components")}, but a planar beam gives only two useful equilibrium equations.`,
        `So the beam is statically indeterminate to degree ${deg}, and we need ${counted(deg, "extra equation", "extra equations")} from compatibility.`,
        "Compatibility says the beam cannot deflect at a support, and cannot rotate at a fixed support.",
        "The solver imposes every one of these conditions at once with the direct stiffness method, then reads the reactions from the restrained degrees of freedom.",
      ].join(" "),
    };
  }

  /* The solver's V, M and v in units u, measured from `origin`, as beamdswitch plot expressions
     written with Macaulay brackets from the reactions and the loads, and the x range they span. */
  function macaulayCurves(result, u, origin) {
    const show = (si, q) => toUnits(si, q, u);
    const d = scaleModel(result.model, u), Ld = d.length, o = origin === "mid" ? Ld / 2 : 0, eps = 1e-9 * Ld;
    const num = (v) => String(+v.toPrecision(12));
    const shift = (a) => { const s = a - o; return s === 0 ? "x" : s > 0 ? `x - ${num(s)}` : `x + ${num(-s)}`; };
    const mac = (a, n) => `max(0, ${shift(a)})^${n}`;
    const step = (a) => `min(1, max(0, (${shift(a)})/${num(eps)} + 1))`; // 1 from a on: V and M just right of a
    const sum = (terms) => terms.filter(([c]) => c !== 0).map(([c, t], i) => `${i ? (c < 0 ? " - " : " + ") : c < 0 ? "-" : ""}${num(Math.abs(c))}${t ? `*${t}` : ""}`).join("") || "0";
    // A point action at the right end only affects the diagram at x = L itself, where the page shows the left limit.
    const inside = (a) => a < Ld;
    const reacts = result.reactions.map((re) => ({ x: toUnits(re.x, "length", u), Fy: show(re.Fy, "force"), Mz: show(re.Mz, "moment") })).filter((re) => inside(re.x));
    const Vt = [], Mt = [], vt = [];
    const EId = d.material.E * d.section.I, start = result.displacements[0];
    vt.push([show(start.v, "length"), ""], [start.theta, o ? `(${shift(0)})` : "x"]);
    for (const re of reacts) {
      Vt.push([re.Fy, step(re.x)]); Mt.push([re.Fy, mac(re.x, 1)], [-re.Mz, step(re.x)]);
      vt.push([re.Fy / 6 / EId, mac(re.x, 3)], [-re.Mz / 2 / EId, mac(re.x, 2)]);
    }
    for (const l of d.loads) {
      if (l.kind === "point" && inside(l.x)) { Vt.push([l.F, step(l.x)]); Mt.push([l.F, mac(l.x, 1)]); vt.push([l.F / 6 / EId, mac(l.x, 3)]); }
      if (l.kind === "moment" && inside(l.x)) { Mt.push([-l.C, step(l.x)]); vt.push([-l.C / 2 / EId, mac(l.x, 2)]); }
      if (l.kind === "dist") {
        const s = (l.q2 - l.q1) / (l.x2 - l.x1);
        for (const [a, q, sign] of [[l.x1, l.q1, 1], [l.x2, l.q2, -1]]) {
          if (!inside(a)) continue;
          Vt.push([sign * q, mac(a, 1)], [sign * s / 2, mac(a, 2)]);
          Mt.push([sign * q / 2, mac(a, 2)], [sign * s / 6, mac(a, 3)]);
          vt.push([sign * q / 24 / EId, mac(a, 4)], [sign * s / 120 / EId, mac(a, 5)]);
        }
      }
    }
    return { V: sum(Vt), M: sum(Mt), v: sum(vt), x: [num(-o), num(Ld - o)] };
  }

  function beamReport(result, { units = DEFAULT_UNITS, origin = "left", title = "", section = {}, material = {} } = {}) {
    const u = unitSystem(units), m = result.model, L = m.length, ex = result.extremes || extremes(result);
    const sym = (q) => u.symbol[q], show = (si, q) => toUnits(si, q, u);
    const mid = origin === "mid";
    const X = (x) => show(fromOrigin(x, L, origin), "length");
    const text = (t, q) => `${t} ${sym(q)}`;
    const say = (t, q) => `${sayNumber(t)} ${spokenUnit(u, q, !/^−?1$/.test(t))}`;
    const tex = (t, q) => `${texNumber(t)}\\ ${texUnit(sym(q))}`;
    const v4 = (si, q) => sig(show(si, q), 4);
    const pos = (x) => text(sig(X(x)), "length"), sayPos = (x) => `x equals ${say(sig(X(x)), "length")}`;
    const unitsSpoken = `${spokenUnit(u, "force")}, ${spokenUnit(u, "length")} and ${spokenUnit(u, "stress")}`;
    const deg = indeterminacy(m.supports), EI = m.material.E * m.section.I, resid = residual(result.equilibrium);
    const stress = m.section.c ? Math.abs(ex.M.value) * m.section.c / m.section.I : null;
    const ratio = spanRatio(L, ex.v.value);
    const kind = (s) => (s.kind === "pin" ? "pinned support" : "fixed support");

    /* ----- set-up ----- */
    const loadText = (l) => (l.kind === "point" ? `point force ${text(v4(l.F, "force"), "force")} at x = ${pos(l.x)}`
      : l.kind === "moment" ? `couple ${text(v4(l.C, "moment"), "moment")} at x = ${pos(l.x)}`
        : `distributed ${l.q1 === l.q2 ? text(v4(l.q1, "distributed"), "distributed") : `${v4(l.q1, "distributed")} → ${text(v4(l.q2, "distributed"), "distributed")}`} from x = ${pos(l.x1)} to ${pos(l.x2)}`);
    const updown = (v) => (v < 0 ? "downward " : v > 0 ? "upward " : "");
    const loadSaid = (l) => (l.kind === "point" ? `a ${updown(l.F)}point force of ${say(v4(Math.abs(l.F), "force"), "force")} at ${sayPos(l.x)}`
      : l.kind === "moment" ? `a ${l.C < 0 ? "clockwise " : l.C > 0 ? "counter-clockwise " : ""}couple of ${say(v4(Math.abs(l.C), "moment"), "moment")} at ${sayPos(l.x)}`
        : l.q1 === l.q2 ? `a uniform ${updown(l.q1)}load of ${say(v4(Math.abs(l.q1), "distributed"), "distributed")} from ${sayPos(l.x1)} to ${say(sig(X(l.x2)), "length")}`
          : `a distributed load varying from ${say(v4(l.q1, "distributed"), "distributed")} at ${sayPos(l.x1)} to ${say(v4(l.q2, "distributed"), "distributed")} at ${sayPos(l.x2)}`);
    const list = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
    const fromWhere = mid ? "mid-span, negative to the left" : "the left end";
    const beamFrame = {
      title: `The beam: L = ${text(v4(L, "length"), "length")} on ${counted(m.supports.length, "support", "supports")}, with ${counted(m.loads.length, "load", "loads")}`,
      body: [
        `- Length $L$ = ${text(v4(L, "length"), "length")}; x runs from ${pos(0)} to ${pos(L)}, measured from ${fromWhere}.`,
        ...m.supports.map((s, i) => `- Support ${i + 1}: ${s.kind === "pin" ? "pin" : "fixed"} at x = ${pos(s.x)}`),
        ...(m.loads.length ? m.loads.map((l, i) => `- Load ${i + 1}: ${loadText(l)}`) : ["- No loads."]),
      ].join("\n"),
      notes: "Forces and distributed loads are positive up; couples, rotations and support moments positive counter-clockwise. V(x) is the sum of the upward forces left of the section, and M(x) is positive when it sags the beam.",
      narration: [
        `The beam is ${say(v4(L, "length"), "length")} long, with x measured from ${mid ? "mid-span, so it runs" : "the left end, so it runs"} from ${say(sig(X(0)), "length")} to ${say(sig(X(L)), "length")}.`,
        `It rests on ${list(m.supports.map((s) => `a ${kind(s)} at ${sayPos(s.x)}`))}.`,
        m.loads.length ? `It carries ${list(m.loads.map(loadSaid))}.` : "It carries no load.",
        "Forces are positive upward, couples positive counter-clockwise, and a sagging bending moment is positive.",
      ].join(" "),
    };
    const dims = (section.dims || []).map(([label, value, q]) => `${label} = ${text(v4(value, q), q)}`);
    const saidDims = (section.dims || []).map(([label, value, q]) => `${label.replace(/,.*$/, "").toLowerCase()} ${say(v4(value, q), q)}`);
    const props = [`$A$ = ${text(sci(show(m.section.A, "area")), "area")}`, `$I$ = ${text(sci(show(m.section.I, "inertia")), "inertia")}`,
      ...(m.section.c ? [`$c$ = ${text(sig(show(m.section.c, "length")), "length")}`] : []), `$EI$ = ${text(sci(show(EI, "rigidity")), "rigidity")}`];
    const sectionFrame = {
      title: `Section, material and units: EI = ${text(sci(show(EI, "rigidity")), "rigidity")}`,
      body: [
        `- Section: ${section.label || "custom"}${dims.length ? `, ${dims.join(", ")}` : ""}`,
        `- ${props.join(", ")}`,
        `- Material: ${material.label || "custom"}, $E$ = ${text(v4(m.material.E, "stress"), "stress")}, $\\nu$ = ${sig(m.material.nu)}`,
        `- Units: ${u.label}, one consistent convention for every input and result.`,
      ].join("\n"),
      narration: [
        `The section is a ${SHAPE_NAMES[section.shape] || "custom section"}${saidDims.length ? `, ${list(saidDims)}` : ""}, with a second moment of area of ${say(sci(show(m.section.I, "inertia")), "inertia")}.`,
        `The material is ${material.label ? material.label.replace(/\s*\(.*\)$/, "").toLowerCase() : "a custom material"}, with a Young's modulus of ${say(v4(m.material.E, "stress"), "stress")}.`,
        `So the flexural rigidity E I is ${say(sci(show(EI, "rigidity")), "rigidity")}.`,
        `Every number in this talk is in ${unitsSpoken}.`,
      ].join(" "),
    };

    /* ----- method ----- */
    const staticsFrame = {
      title: "Shear and moment follow from statics, deflection from EI v″ = M",
      body: [
        "$$ V(x) = \\sum_{\\text{left of } x} F_y, \\qquad \\frac{dM}{dx} = V, \\qquad \\frac{dV}{dx} = q $$",
        "",
        "$$ EI\\,\\frac{d^2 v}{dx^2} = M(x) $$",
        "",
        "- Exact at every point force and couple: $V$ jumps by the force, $M$ by minus the couple.",
      ].join("\n"),
      narration: [
        "With the reactions known, the shear force at any section is the sum of the upward forces to its left.",
        "The bending moment is the integral of the shear.",
        "Integrating the moment over E I twice gives the slope and the deflection.",
        "The solver does all of this exactly, so every jump at a point force or a couple is kept.",
      ].join(" "),
    };

    /* ----- results ----- */
    const reactionRows = result.reactions.map((re, i) => `| ${i + 1}, ${re.kind === "pin" ? "pin" : "fixed"} | ${sig(X(re.x))} | ${shortNf(show(re.Fy, "force"))} | ${re.kind === "fixed" ? shortNf(show(re.Mz, "moment")) : "—"} |`);
    const reactionSaid = (re) => {
      const F = shortNf(show(Math.abs(re.Fy), "force")), push = re.Fy < 0 ? "pulls down with" : "pushes up with";
      let s = `The ${kind(re)} at ${sayPos(re.x)} ${push} ${say(F, "force")}`;
      if (re.kind === "fixed") s += `, and resists with a ${re.Mz < 0 ? "clockwise" : "counter-clockwise"} moment of ${say(shortNf(show(Math.abs(re.Mz), "moment")), "moment")}`;
      return `${s}.`;
    };
    const reactionFrame = {
      title: `Reactions at the ${counted(result.reactions.length, "support", "supports").replace(/^one /, "")}`,
      body: [
        `| Support | x (${sym("length")}) | Force (${sym("force")}) | Moment (${sym("moment")}) |`,
        "| --- | --- | --- | --- |",
        ...reactionRows,
        "",
        "Force positive up; moment positive counter-clockwise.",
      ].join("\n"),
      narration: result.reactions.map(reactionSaid).join(" "),
    };

    // Plots: the solver's V, M and v in the page's units and origin, as Macaulay brackets.
    const curves = macaulayCurves(result, u, origin);
    const plot = (ylabel, curve) => ({ x: curves.x, xlabel: `x (${sym("length")}), from ${mid ? "mid-span" : "the left end"}`, ylabel, curves: [curve] });

    const V = sig(show(ex.V.value, "force"), 4), M = sig(show(ex.M.value, "moment"), 4), vmax = sig(show(ex.v.value, "length"), 4);
    const sense = ex.M.value >= 0 ? "sagging" : "hogging";
    const shearFrame = {
      title: `Largest shear: ${text(V, "force")} at x = ${pos(ex.V.x)}`,
      plot: plot(`shear force V (${sym("force")})`, curves.V),
      body: `$$ V_{\\text{largest}} = ${tex(V, "force")} \\quad \\text{at } x = ${tex(sig(X(ex.V.x)), "length")} $$`,
      narration: [
        "Here is the shear force along the beam.",
        "It jumps at every support and point force, and slopes wherever a distributed load acts.",
        `The largest shear is ${say(V, "force")}, at ${sayPos(ex.V.x)}.`,
      ].join(" "),
    };
    const momentFrame = {
      title: `Largest moment: ${text(M, "moment")}, ${sense}, at x = ${pos(ex.M.x)}`,
      plot: plot(`bending moment M (${sym("moment")})`, curves.M),
      body: [
        `$$ M_{\\text{largest}} = ${tex(M, "moment")} \\quad \\text{at } x = ${tex(sig(X(ex.M.x)), "length")} $$`,
        ...(stress != null ? ["", `$$ \\sigma_{\\max} = \\frac{|M_{\\text{largest}}|\\, c}{I} = ${tex(sig(show(stress, "stress"), 4), "stress")} $$`] : []),
      ].join("\n"),
      narration: [
        "Next, the bending moment.",
        "It is the running integral of the shear, so it peaks where the shear crosses zero or jumps.",
        `The largest moment is ${say(M, "moment")}, ${sense}, at ${sayPos(ex.M.x)}.`,
        ...(stress != null ? [`With the extreme fibre ${say(sig(show(m.section.c, "length")), "length")} from the neutral axis, that is a peak bending stress of ${say(sig(show(stress, "stress"), 4), "stress")}.`] : []),
      ].join(" "),
    };
    const deflectionFrame = {
      title: `Largest deflection: ${text(vmax, "length")} at x = ${pos(ex.v.x)} (L/${ratio})`,
      plot: plot(`deflection v (${sym("length")}), + up`, curves.v),
      body: [
        `$$ v_{\\text{largest}} = ${tex(vmax, "length")} \\quad \\text{at } x = ${tex(sig(X(ex.v.x)), "length")} $$`,
        "",
        `$$ \\frac{L}{|v_{\\text{largest}}|} = ${ratio === "∞" ? "\\infty" : ratio} $$`,
      ].join("\n"),
      narration: [
        "Finally, the deflected shape, positive upward.",
        `The largest deflection is ${say(vmax, "length")}, at ${sayPos(ex.v.x)}.`,
        ratio === "∞" ? "The beam does not deflect." : `That is the span divided by ${ratio}.`,
      ].join(" "),
    };

    /* ----- checks and takeaway ----- */
    const balanced = resid < 1e-9;
    const checkFrame = {
      title: balanced ? "Loads and reactions balance" : `Loads and reactions balance to a relative error of ${sci(resid)}`,
      body: [
        `- $\\sum F_y$ and $\\sum M$ of the loads and reactions: relative error ${sci(resid)}.`,
        `- Deflection is zero at every support${m.supports.some((s) => s.kind === "fixed") ? ", and slope is zero at every fixed support" : ""}: these are the conditions the solver imposed.`,
        `- ${deg > 0 ? `Indeterminate to degree ${deg}: equilibrium and compatibility both hold.` : "Determinate: the reactions follow from equilibrium alone."}`,
      ].join("\n"),
      narration: [
        `Adding up every load and reaction, the forces and moments balance to a relative error of ${sayNumber(sci(resid))}.`,
        "The beam does not deflect at any support, which is exactly the condition the solver imposed.",
        deg > 0 ? "So both equilibrium and compatibility hold." : "So the reactions are the ones equilibrium alone would give.",
      ].join(" "),
    };
    const takeawayFrame = {
      title: "Takeaway",
      key: `Largest moment ${text(M, "moment")} (${sense}) at x = ${pos(ex.M.x)}; largest deflection ${text(vmax, "length")} at x = ${pos(ex.v.x)}, L/${ratio}.`
        + (stress != null ? ` Peak bending stress ${text(sig(show(stress, "stress"), 4), "stress")}.` : ""),
      narration: [
        `To sum up, the largest bending moment is ${say(M, "moment")}, ${sense}, at ${sayPos(ex.M.x)}.`,
        `The largest deflection is ${say(vmax, "length")}, at ${sayPos(ex.v.x)}.`,
        ...(stress != null ? [`The peak bending stress is ${say(sig(show(stress, "stress"), 4), "stress")}.`] : []),
      ].join(" "),
    };

    const name = String(title || "").trim();
    return {
      meta: { title: name ? `Beam analysis: ${name}` : "Beam analysis", subtitle: "Reactions, shear force, bending moment and deflection", voice: VOICE },
      narration: `Beam analysis${name ? `: ${name}` : ""}. We find the reactions, shear force, bending moment and deflection of this beam, with every number from the solver, in ${unitsSpoken}.`,
      setup: [beamFrame, sectionFrame],
      method: [methodFrame(deg), staticsFrame],
      results: [reactionFrame, shearFrame, momentFrame, deflectionFrame],
      checks: [checkFrame, takeawayFrame],
    };
  }

  function fmt(x) {
    return Number.isInteger(x) ? String(x) : String(+x.toPrecision(6));
  }
  const lengthText = (units) => { const u = unitSystem(units); return (x) => `${fmt(toUnits(x, "length", u))} ${u.symbol.length}`; };

  return { SUPPORT_KINDS, UNIT_SYSTEMS, DEFAULT_UNITS, toUnits, fromUnits, scaleModel, ModelError, sectionProperties, indeterminacy, validate, mesh, solve, internal, deflection, at, diagram, extremes, exportBdf, smallEntry, largeEntry, exactReal, nastranReal, format, speech, fromOrigin, residual, spanRatio, intensity, beamReport };
});
