/* Instantaneous centre of rotation (ICR) method (spec 5.8).
 *
 * In-plane shear only (Fx, Fy and Mz,s about Cs); tension, prying, preload
 * and Fz never enter, and ks is ignored (N-004). Each fastener deforms in
 * proportion to its distance ρ from the ICR, perpendicular to the radius:
 * Δᵢ = Δmax,gov·ρᵢ/ρ_gov, where the governing fastener has the smallest
 * Δmax,ᵢ/ρᵢ and so reaches its limit first. Its load follows
 *   Crawford-Kulak           R = Rult·(1 − e^(−μΔ))^λ
 *   elastic-perfectly-plastic R = Rult·min(Δ/Δy, 1), fracture at Δmax
 *
 * Reference point: the Rult-weighted centroid C_R of the fasteners, which
 * does not depend on ks (it equals Cs for uniform ks and Rult); Mz is
 * re-reduced from Cs to it. A zero in-plane load is a converged zero-shear
 * state. The load is a uniform translation only when the translation loads,
 * scaled to |F|, carry the applied moment about C_R; otherwise the rotation
 * sense is the sign of the leftover moment.
 *
 * Search: with d̂ the applied force direction, the ICR lies on the line
 * through C_R perpendicular to d̂, on the side of the load's line of action
 * that gives the rotation sense, at distance u from that line. For each u
 * the ultimate load from moment equilibrium about the ICR and from force
 * equilibrium along d̂ are compared, and a bracketed Brent search finds
 * where they agree (normalised moment residual ≤ 1e-6, 200-iteration cap).
 * The scan in u covers both sides of C_R. Pure moment starts the ICR at C_R.
 *
 * Asymmetric groups: on that line the force perpendicular to d̂ need not
 * vanish. When it does not (relative to the ultimate load, beyond the
 * tolerance), the ICR is refined off the line by a damped Newton iteration
 * on its two coordinates, starting from the line solution, so every
 * reported ICR satisfies all three in-plane equilibrium equations.
 *
 * Results: ICR location, γ_ult = P_u/|F| (load scaled uniformly,
 * eccentricity kept) or M_u/|Mz| for pure moment, and the reactions at the
 * ultimate state. Reactions at the applied load are the ultimate ones
 * divided by γ_ult: a proportional scaling convention (W-015).
 */

import { brent } from "./interaction.mjs";
import { issue } from "./warnings.mjs";

export const ICR_TOL = 1e-6;
export const ICR_MAX_ITER = 200;
export const MODELS = { "crawford-kulak": "Crawford-Kulak", "elastic-plastic": "Elastic-perfectly-plastic" };

export function response(model, f, delta) {
  const c = f.icr;
  if (model === "elastic-plastic") return c.rult * Math.min(delta / c.deltaY, 1);
  return c.rult * Math.pow(1 - Math.exp(-c.mu * delta), c.lambda);
}

/* Fastener loads for a rigid rotation (sense s = ±1) about O, scaled so the
 * governing fastener reaches Δmax. Vectors are loads on the fasteners, in
 * the direction the plate moves (the elastic method's convention). */
export function rotationState(fasteners, O, s, model) {
  const rho = fasteners.map((f) => Math.hypot(f.x - O.x, f.y - O.y));
  let gov = -1, ratio = Infinity;
  fasteners.forEach((f, i) => {
    if (rho[i] > 0) {
      const q = f.icr.deltaMax / rho[i];
      if (q < ratio) { ratio = q; gov = i; }
    }
  });
  if (gov < 0) return null;
  let Rx = 0, Ry = 0, M = 0;
  const loads = fasteners.map((f, i) => {
    const delta = ratio * rho[i];
    const R = rho[i] > 0 ? response(model, f, delta) : 0;
    const ux = rho[i] > 0 ? (-s * (f.y - O.y)) / rho[i] : 0, uy = rho[i] > 0 ? (s * (f.x - O.x)) / rho[i] : 0;
    const rx = R * ux, ry = R * uy;
    Rx += rx; Ry += ry;
    M += (f.x - O.x) * ry - (f.y - O.y) * rx;
    return { id: f.id, rho: rho[i], delta, R, Rx: rx, Ry: ry };
  });
  return { loads, gov: fasteners[gov].id, Rx, Ry, M };
}

/* Uniform translation along d̂: every fastener at the smallest Δmax. */
function translation(fasteners, d, model) {
  const delta = Math.min(...fasteners.map((f) => f.icr.deltaMax));
  const gov = fasteners.find((f) => f.icr.deltaMax === delta).id;
  let P = 0;
  const loads = fasteners.map((f) => {
    const R = response(model, f, delta);
    P += R;
    return { id: f.id, rho: Infinity, delta, R, Rx: R * d.x, Ry: R * d.y };
  });
  return { loads, gov, P };
}

/* Damped Newton on the ICR position: `resid(O)` returns [r1, r2] (both normalised). */
function newton2(resid, O0, scaleL, { tol = ICR_TOL, maxIter = ICR_MAX_ITER } = {}) {
  let O = { ...O0 }, r = resid(O), it = 0;
  const norm = (v) => (v ? Math.hypot(v[0], v[1]) : Infinity);
  while (norm(r) > tol && it < maxIter) {
    it++;
    const h = 1e-7 * scaleL;
    const rx = resid({ x: O.x + h, y: O.y }), ry = resid({ x: O.x, y: O.y + h });
    if (!r || !rx || !ry) return { O, r, it, converged: false };
    const J = [[(rx[0] - r[0]) / h, (ry[0] - r[0]) / h], [(rx[1] - r[1]) / h, (ry[1] - r[1]) / h]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!Number.isFinite(det) || det === 0) return { O, r, it, converged: false };
    const dx = (-r[0] * J[1][1] + r[1] * J[0][1]) / det, dy = (r[0] * J[1][0] - r[1] * J[0][0]) / det;
    let t = 1, next = null;
    for (let k = 0; k < 30; k++, t /= 2) {
      const cand = { x: O.x + t * dx, y: O.y + t * dy };
      const rc = resid(cand);
      if (rc && norm(rc) < norm(r)) { next = { O: cand, r: rc }; break; }
    }
    if (!next) return { O, r, it, converged: false };
    O = next.O; r = next.r;
  }
  return { O, r, it, converged: norm(r) <= tol };
}

/*
 * fasteners: resolved (x, y, icr: { rult, mu, lambda, deltaMax, deltaY }).
 * Cs: shear centroid. load: { Fx, Fy, Mz } with Mz = Mz,s about Cs.
 * Returns { status: "converged" | "not-converged", ... }.
 */
export function icrSolve(fasteners, Cs, load, model = "crawford-kulak", { tol = ICR_TOL, maxIter = ICR_MAX_ITER } = {}) {
  const fail = (reason, residual = null, iterations = 0) => ({ status: "not-converged", reason, residual, iterations });
  if (fasteners.length === 0) return fail("no fasteners");
  const F = Math.hypot(load.Fx, load.Fy);
  if (F === 0 && load.Mz === 0) {
    const loads = fasteners.map((f) => ({ id: f.id, rho: Infinity, delta: 0, R: 0, Rx: 0, Ry: 0 }));
    return { status: "converged", mode: "no-shear", icr: null, gamma: Infinity, Pu: 0, loads, governing: null, residual: 0, iterations: 0, offLine: false };
  }

  // Reference point independent of ks: the Rult-weighted centroid (Cs for uniform ks and Rult).
  const W = fasteners.reduce((a, f) => a + f.icr.rult, 0);
  const ref = { x: fasteners.reduce((a, f) => a + f.icr.rult * f.x, 0) / W, y: fasteners.reduce((a, f) => a + f.icr.rult * f.y, 0) / W };
  const Mz = load.Mz + (Cs.x - ref.x) * load.Fy - (Cs.y - ref.y) * load.Fx;
  const L = Math.max(...fasteners.map((f) => Math.hypot(f.x - ref.x, f.y - ref.y)), 1e-12);

  let s = Math.sign(Mz);
  if (F > tol * Math.abs(Mz) / L) {
    // Uniform translation holds only when the translation loads, scaled to F, carry the applied moment about ref.
    const d = { x: load.Fx / F, y: load.Fy / F };
    const t = translation(fasteners, d, model);
    const T = t.loads.reduce((a, l, i) => a + (fasteners[i].x - ref.x) * l.Ry - (fasteners[i].y - ref.y) * l.Rx, 0);
    const imbalance = Mz - T * F / t.P;
    if (Math.abs(imbalance) <= tol * F * L) {
      return { status: "converged", mode: "translation", icr: null, gamma: t.P / F, Pu: t.P, loads: t.loads, governing: t.gov, residual: Math.abs(imbalance) / (F * L), iterations: 0, offLine: false };
    }
    s = Math.sign(imbalance);
  } else {
    // Pure moment: ICR near ref, refined so that the fastener loads sum to zero.
    const resid = (O) => {
      const st = rotationState(fasteners, O, s, model);
      if (!st) return null;
      const scale = Math.abs(st.M) / L || 1;
      return [st.Rx / scale, st.Ry / scale];
    };
    const n = newton2(resid, ref, L, { tol, maxIter });
    if (!n.converged) return fail("pure-moment ICR did not balance the fastener forces", n.r ? Math.hypot(...n.r) : null, n.it);
    const st = rotationState(fasteners, n.O, s, model);
    const Mu = Math.abs(st.M);
    return { status: "converged", mode: "pure-moment", icr: n.O, gamma: Mu / Math.abs(Mz), Mu, loads: st.loads, governing: st.gov, residual: n.r ? Math.hypot(...n.r) : 0, iterations: n.it, offLine: Math.hypot(n.O.x - ref.x, n.O.y - ref.y) > tol * L };
  }

  const d = { x: load.Fx / F, y: load.Fy / F };
  const X = { x: ref.x + (Mz / F) * d.y, y: ref.y - (Mz / F) * d.x }; // foot of ref on the line of action
  const nrm = { x: s * d.y, y: -s * d.x }; // unit normal to d̂; the load's moment about X − u·nrm is s·u·|F|
  const armAbout = (O) => (X.x - O.x) * d.y - (X.y - O.y) * d.x; // ((X − O) × d̂)_z
  const at = (u) => ({ x: X.x - u * nrm.x, y: X.y - u * nrm.y });
  const lineEval = (u) => {
    const st = rotationState(fasteners, at(u), s, model);
    if (!st) return null;
    const Pforce = st.Rx * d.x + st.Ry * d.y;
    const Pmoment = st.M / (s * u);
    return { st, Pforce, Pmoment };
  };
  const g = (u) => {
    const v = lineEval(u);
    return v ? (v.Pmoment - v.Pforce) / Math.max(Math.abs(v.Pmoment), Math.abs(v.Pforce), 1e-300) : NaN;
  };
  // Bracket on a log scale of the distance u from the line of action, 1e-6·L to 1e8·L: both sides of ref are covered.
  let lo = null, hi = null, prev = null;
  for (let k = -6; k <= 8; k += 0.25) {
    const u = L * Math.pow(10, k);
    const v = g(u);
    if (!Number.isFinite(v)) continue;
    if (prev && Math.sign(prev.v) !== Math.sign(v)) { lo = prev.u; hi = u; break; }
    prev = { u, v };
  }
  if (lo === null) return fail("no sign change of the moment-force mismatch along the search line");
  const b = brent(g, lo, hi, { tol: 1e-14, maxIter });
  if (!b.converged) return fail("Brent search on the ICR offset did not converge", Math.abs(b.residual), b.iterations);
  let O = at(b.root);
  let iterations = b.iterations;
  let v = lineEval(b.root);
  let P = v.Pforce;
  let perp = (v.st.Rx * -d.y + v.st.Ry * d.x) / Math.max(Math.abs(P), 1e-300);
  let momentResid = Math.abs(v.Pmoment - v.Pforce) / Math.max(Math.abs(P), 1e-300);
  let offLine = false;
  if (Math.abs(perp) > tol) {
    // Asymmetric group: move the ICR off the line until all three equations hold.
    const resid = (Oc) => {
      const st = rotationState(fasteners, Oc, s, model);
      if (!st) return null;
      const Pc = st.Rx * d.x + st.Ry * d.y;
      const scale = Math.max(Math.abs(Pc), 1e-300);
      return [(st.Rx * -d.y + st.Ry * d.x) / scale, (st.M - Pc * armAbout(Oc)) / (scale * L)];
    };
    const n = newton2(resid, O, L, { tol, maxIter: maxIter - iterations });
    iterations += n.it;
    if (!n.converged) return fail("ICR could not balance the force perpendicular to the load", n.r ? Math.hypot(...n.r) : null, iterations);
    O = n.O;
    offLine = true;
    const st = rotationState(fasteners, O, s, model);
    P = st.Rx * d.x + st.Ry * d.y;
    v = { st };
    perp = (st.Rx * -d.y + st.Ry * d.x) / Math.abs(P);
    momentResid = Math.abs(st.M - P * armAbout(O)) / (Math.abs(P) * L);
  }
  if (momentResid > tol) return fail("normalised moment residual above tolerance", momentResid, iterations);
  return {
    status: "converged", mode: "eccentric", icr: O, reference: ref, direction: d, gamma: P / F, Pu: P,
    loads: v.st.loads, governing: v.st.gov, residual: Math.max(momentResid, Math.abs(perp)), iterations, offLine,
  };
}

/* Reactions at the applied load under the proportional scaling convention. */
export function reactionsAtLoad(solution) {
  return solution.loads.map((l) => {
    const Rx = l.Rx / solution.gamma, Ry = l.Ry / solution.gamma;
    return { id: l.id, Rx, Ry, Rs: Math.hypot(Rx, Ry), angleDeg: Math.atan2(Ry, Rx) * 180 / Math.PI };
  });
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const given = (v) => v !== null && v !== undefined && v !== "";

/* ICR inputs when ICR is enabled (E-002, E-007), and the design basis. */
export function validateIcrInputs(pattern, resolved) {
  const issues = [];
  const st = pattern.settings || {};
  const on = !!st.icr?.enabled;
  if (st.designBasis === "icr" && !on) {
    issues.push(issue("E-007", "The ICR design basis needs the ICR method enabled.", { field: "settings.designBasis" }));
  }
  if (!on) return issues;
  const model = st.icr?.model || "crawford-kulak";
  const originals = new Map((pattern.fasteners || []).map((f) => [f.id, f]));
  const seen = new Set();
  const push = (id, detail, opts) => {
    const key = `${id}|${opts.fastener || ""}|${opts.field}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue(id, detail, opts));
  };
  const fields = [["rult", "Rult", true], ["mu", "μ", model === "crawford-kulak"], ["lambda", "λ", model === "crawford-kulak"],
    ["deltaMax", "Δmax", true], ["deltaY", "Δy", model === "elastic-plastic"]];
  for (const f of resolved) {
    const o = originals.get(f.id)?.overrides?.icr || {};
    for (const [key, label, needed] of fields) {
      if (!needed) continue;
      const v = f.icr?.[key];
      const at = key in o ? { fastener: f.id, field: `icr.${key}` } : { field: `defaults.icr.${key}` };
      const who = at.fastener ? ` for ${f.id}` : " (group default)";
      if (!given(v)) push("E-007", `ICR needs ${label}${who}.`, at);
      else if (!(isNum(v) && v > 0)) push("E-002", `ICR ${label}${who} must be a positive number (is ${v}).`, at);
    }
    if (model === "elastic-plastic" && isNum(f.icr?.deltaY) && isNum(f.icr?.deltaMax) && f.icr.deltaY > f.icr.deltaMax) {
      const at = "deltaY" in o ? { fastener: f.id, field: "icr.deltaY" } : { field: "defaults.icr.deltaY" };
      push("E-002", `ICR Δy (${f.icr.deltaY}) must not exceed Δmax (${f.icr.deltaMax}).`, at);
    }
  }
  return issues;
}
