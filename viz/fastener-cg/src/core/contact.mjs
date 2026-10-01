/* Axial method (b): contact edge, tension-only fasteners (spec 5.7).
 *
 * The neutral axis is a selected plate edge L (axis-aligned). Fasteners on
 * the tension side at distance d > 0 from L carry
 *   T = M_L · ka·d / Σ(ka·d²)
 * and the rest carry nothing. M_L is the reduced moment about L that puts the
 * far side in tension, from the same transfer as 5.2 with Q on L (so it
 * includes the Fz lever). The contact reaction is C = ΣT − Fz.
 *
 * Q is the projection of the axial centroid Ca onto L. v1 limitation: the
 * moment component about the axis perpendicular to L must be zero (E-012).
 */

import { transferMoments } from "./loads.mjs";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const EDGES = {
  yMin: { axis: "x", label: "bottom edge (y = yMin)" },
  yMax: { axis: "x", label: "top edge (y = yMax)" },
  xMin: { axis: "y", label: "left edge (x = xMin)" },
  xMax: { axis: "y", label: "right edge (x = xMax)" },
};

/* Geometry of edge `edge` of `plate` and the load reduced to it. */
export function edgeFrame(plate, edge, load, Ca) {
  const c = plate[edge];
  const horizontal = EDGES[edge].axis === "x";
  const Q = horizontal ? { x: Ca.x, y: c } : { x: c, y: Ca.y };
  const m = transferMoments(load, Q);
  // Positive Mx tensions the y > c side; positive My tensions the x < c side.
  const ML = { yMin: m.Mx, yMax: -m.Mx, xMin: -m.My, xMax: m.My }[edge];
  const perp = horizontal ? m.My : m.Mx;
  const distance = (f) => ({ yMin: f.y - c, yMax: c - f.y, xMin: f.x - c, xMax: c - f.x }[edge]);
  return { plateId: plate.id, edge, c, horizontal, Q, ML, perp, transfer: m, distance };
}

export function contactEdgeAxial(fasteners, plate, edge, load, props) {
  const fr = edgeFrame(plate, edge, load, props.Ca);
  const ds = fasteners.map((f) => fr.distance(f));
  let S = 0;
  fasteners.forEach((f, i) => { if (ds[i] > 0) S += f.ka * ds[i] * ds[i]; });
  const active = fr.ML > 0 && S > 0;
  const T = fasteners.map((f, i) => {
    const d = ds[i];
    const t = active && d > 0 ? (fr.ML * f.ka * d) / S : 0;
    return { id: f.id, d, tensionSide: d > 0, direct: 0, moment: t, T: t };
  });
  const sumT = T.reduce((a, t) => a + t.T, 0);
  return { mode: "contact-edge", ...fr, S, active, T, C: sumT - load.Fz };
}

/* The plate edge nearest the compressive side of the applied moment: the
 * edge (of `plate`) with the largest positive M_L, or null when none. */
export function suggestContactEdge(plate, load, Ca) {
  if (![plate?.xMin, plate?.xMax, plate?.yMin, plate?.yMax].every(isNum)) return null;
  let best = null;
  for (const edge of Object.keys(EDGES)) {
    const fr = edgeFrame(plate, edge, load, Ca);
    if (fr.ML > 0 && (!best || fr.ML > best.ML)) best = { edge, ML: fr.ML };
  }
  return best ? best.edge : null;
}

/* Closure for method (b): ΣT − C = Fz and Σ T·d = M_L. */
export function contactClosureChecks(ax, Fz) {
  const sumT = ax.T.reduce((a, t) => a + t.T, 0);
  return [
    { name: "ΣT − C = Fz", residual: sumT - ax.C - Fz, kind: "force" },
    { name: "ΣT·d = M_L", residual: ax.T.reduce((a, t) => a + t.T * Math.max(t.d, 0), 0) - (ax.active ? ax.ML : 0), kind: "moment" },
  ];
}
