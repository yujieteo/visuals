/* Shared scene model (spec section 9, "Diagram consistency").
 *
 * Decides every piece of diagram geometry: scale, world-to-screen
 * transform, marker positions, vector end points, label text and legend.
 * Painters (the on-screen canvas now; the print SVG and PNG later) only turn
 * these primitives into drawing calls, so geometry cannot differ between them.
 */

import { unitLabel } from "./units.mjs";

export const CENTROID_STYLE = {
  Cs: { shape: "ring", size: 10, colour: "shear", label: "Cs shear centroid (CG)" },
  Ca: { shape: "diamond", size: 7, colour: "axial", label: "Ca axial centroid" },
  Cg: { shape: "square", size: 4, colour: "area", label: "Cg area centroid" },
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/* 1, 2 or 5 × 10ⁿ nearest below `x`. */
export function niceStep(x) {
  if (!(x > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / e;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e;
}

/*
 * pattern: current inputs; result: solve() output (may be !ok);
 * view: { width, height, padding }. Returns { transform, toScreen, toWorld, ...primitives }.
 * `transform` is { scale, ox, oy }: screen = (ox + scale·x, oy − scale·y).
 */
export function buildScene(pattern, result, view, { selected = null, transform: fixed = null } = {}) {
  const { width, height, padding = 36 } = view;
  const fasteners = (pattern.fasteners || []).filter((f) => isNum(f.x) && isNum(f.y));
  const pts = fasteners.map((f) => ({ x: f.x, y: f.y }));
  for (const p of pattern.plates || []) {
    if ([p.xMin, p.xMax, p.yMin, p.yMax].every(isNum)) pts.push({ x: p.xMin, y: p.yMin }, { x: p.xMax, y: p.yMax });
  }
  const L = pattern.load || {};
  const loadPoint = L.point && isNum(L.point.x) && isNum(L.point.y) ? { x: L.point.x, y: L.point.y, z: L.point.z } : null;
  if (loadPoint) pts.push(loadPoint);
  if (!pts.length) pts.push({ x: 0, y: 0 });
  pts.push({ x: 0, y: 0 }); // keep the datum in view
  let xMin = Math.min(...pts.map((p) => p.x)), xMax = Math.max(...pts.map((p) => p.x));
  let yMin = Math.min(...pts.map((p) => p.y)), yMax = Math.max(...pts.map((p) => p.y));
  const span = Math.max(xMax - xMin, yMax - yMin) || 100;
  const margin = span * 0.12;
  xMin -= margin; xMax += margin; yMin -= margin; yMax += margin;
  let scale = Math.min((width - 2 * padding) / (xMax - xMin || 1), (height - 2 * padding) / (yMax - yMin || 1));
  let ox = padding + ((width - 2 * padding) - scale * (xMax - xMin)) / 2 - scale * xMin;
  let oy = height - padding - ((height - 2 * padding) - scale * (yMax - yMin)) / 2 + scale * yMin;
  // A caller may pin the transform (e.g. while dragging, so the view does not refit under the pointer).
  if (fixed) ({ scale, ox, oy } = fixed);
  const transform = { scale, ox, oy };
  const toScreen = (p) => ({ x: ox + scale * p.x, y: oy - scale * p.y });
  const toWorld = (s) => ({ x: (s.x - ox) / scale, y: (oy - s.y) / scale });

  const world = { xMin, xMax, yMin, yMax };
  const u = unitLabel(pattern.unitSystem, "length");
  const fu = unitLabel(pattern.unitSystem, "force");

  const plates = (pattern.plates || []).filter((p) => [p.xMin, p.xMax, p.yMin, p.yMax].every(isNum)).map((p) => {
    const a = toScreen({ x: p.xMin, y: p.yMax }), b = toScreen({ x: p.xMax, y: p.yMin });
    return { id: p.id, world: { xMin: p.xMin, xMax: p.xMax, yMin: p.yMin, yMax: p.yMax }, screen: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, label: p.id };
  });

  const resolvedById = new Map(result && result.ok ? result.fasteners.map((f) => [f.id, f]) : []);
  // Contact edge (axial method b): the selected plate edge, drawn as the neutral axis.
  let contactEdge = null;
  const ce = pattern.settings?.contactEdge;
  if (pattern.settings?.axialMethod === "contact-edge" && ce) {
    const p = (pattern.plates || []).find((q) => q.id === ce.plateId);
    if (p && [p.xMin, p.xMax, p.yMin, p.yMax].every(isNum) && ce.edge in { xMin: 1, xMax: 1, yMin: 1, yMax: 1 }) {
      const horizontal = ce.edge === "yMin" || ce.edge === "yMax";
      const from = horizontal ? { x: p.xMin, y: p[ce.edge] } : { x: p[ce.edge], y: p.yMin };
      const to = horizontal ? { x: p.xMax, y: p[ce.edge] } : { x: p[ce.edge], y: p.yMax };
      contactEdge = { plateId: p.id, edge: ce.edge, world: { from, to }, screen: { from: toScreen(from), to: toScreen(to) }, label: `contact edge (${p.id} ${ce.edge})` };
    }
  }

  const icrPoint = result && result.ok && result.icr && result.icr.status === "converged" && result.icr.icr
    ? { world: { ...result.icr.icr }, screen: toScreen(result.icr.icr), label: "ICR" } : null;

  const markers = fasteners.map((f) => {
    const r = resolvedById.get(f.id);
    const d = r && isNum(r.diameter) ? r.diameter : isNum(pattern.defaults?.diameter) ? pattern.defaults.diameter : null;
    const radiusPx = Math.max(4, Math.min(18, d ? (d / 2) * scale : 6));
    const unloading = !!(r && r.axial.unloading);
    const tension = !!(r && r.axial.T > 0 && !unloading);
    return { id: f.id, label: f.label || f.id, world: { x: f.x, y: f.y }, screen: toScreen(f), radiusPx, selected: f.id === selected, tension, unloading };
  });

  const centroids = result && result.ok
    ? result.props.centroids.map((c) => ({ key: c.key, name: c.name, world: { x: c.x, y: c.y }, screen: toScreen(c), coincidentWith: c.coincidentWith, ...CENTROID_STYLE[c.key] }))
    : [];

  // Reaction vectors: in-plane load on each fastener, the largest drawn 0.16 × the shorter side.
  const vectors = [];
  const icrDrawn = !!(result && result.ok && result.designBasis === "icr" && result.fasteners.every((f) => f.basisShear));
  if (result && result.ok) {
    // Vectors show the in-plane load on the selected design basis (the one the checks use).
    const shearOf = (f) => f.basisShear || f.shear;
    const maxR = Math.max(...result.fasteners.map((f) => shearOf(f).Rs), 0);
    if (maxR > 0) {
      const perForce = (0.16 * Math.min(width, height)) / scale / maxR; // world length per unit force
      for (const f of result.fasteners) {
        const sh = shearOf(f);
        if (!(sh.Rs > 0)) continue;
        const from = { x: f.x, y: f.y }, to = { x: f.x + sh.Rx * perForce, y: f.y + sh.Ry * perForce };
        vectors.push({ kind: "reaction", id: f.id, world: { from, to }, screen: { from: toScreen(from), to: toScreen(to) }, value: sh.Rs, label: "" });
      }
    }
  }
  // Applied in-plane force at the load point: fixed 0.2 × shorter side, direction only.
  if (loadPoint && isNum(L.Fx) && isNum(L.Fy) && Math.hypot(L.Fx, L.Fy) > 0) {
    const len = (0.2 * Math.min(width, height)) / scale, F = Math.hypot(L.Fx, L.Fy);
    const from = loadPoint, to = { x: loadPoint.x + (L.Fx / F) * len, y: loadPoint.y + (L.Fy / F) * len };
    vectors.push({ kind: "applied", id: "load", world: { from, to }, screen: { from: toScreen(from), to: toScreen(to) }, value: F, label: `F = ${Number(F.toPrecision(4))} ${fu}` });
  }
  const moments = [];
  if (loadPoint && isNum(L.Mz) && L.Mz !== 0) moments.push({ kind: "Mz", screen: toScreen(loadPoint), ccw: L.Mz > 0, radiusPx: 16 });

  const load = loadPoint ? { world: loadPoint, screen: toScreen(loadPoint), label: `P (z = ${isNum(loadPoint.z) ? Number(loadPoint.z.toPrecision(4)) : "?"} ${u})` } : null;

  const axisLen = 0.12 * Math.min(width, height);
  const origin = toScreen({ x: 0, y: 0 });
  const axes = {
    origin,
    x: { from: origin, to: { x: origin.x + axisLen, y: origin.y }, label: "x" },
    y: { from: origin, to: { x: origin.x, y: origin.y - axisLen }, label: "y" },
    z: { at: origin, label: "z (toward viewer)" },
  };

  const barWorld = niceStep((0.22 * width) / scale);
  const scaleBar = { world: barWorld, px: barWorld * scale, label: `${Number(barWorld.toPrecision(6))} ${u}`, screen: { x: padding, y: height - padding / 2 } };

  const legend = [
    ...Object.entries(CENTROID_STYLE).map(([key, s]) => ({ key, shape: s.shape, colour: s.colour, label: s.label })),
    { key: "load", shape: "cross", colour: "load", label: "Load point P" },
    { key: "reaction", shape: "arrow", colour: "reaction", label: `Fastener in-plane load (${icrDrawn ? "ICR at applied load" : "elastic"})` },
    { key: "applied", shape: "arrow", colour: "load", label: "Applied in-plane force" },
    { key: "tension", shape: "disc", colour: "tension", label: "Fastener in tension" },
    { key: "unloading", shape: "dashed", colour: "fg", label: "Unloading (clamp-up)" },
  ];

  if (icrPoint) legend.push({ key: "icr", shape: "icr", colour: "load", label: "Instantaneous centre of rotation (ICR)" });
  if (contactEdge) legend.push({ key: "contactEdge", shape: "edge", colour: "axial", label: "Contact edge (method b neutral axis)" });
  return { width, height, transform, world, toScreen, toWorld, plates, contactEdge, icr: icrPoint, markers, centroids, vectors, moments, load, axes, scaleBar, legend };
}

/* Snap-grid lines covering the visible world window. */
export function gridLines(scene, step) {
  if (!(step > 0)) return [];
  const { toWorld, width, height } = scene;
  const a = toWorld({ x: 0, y: height }), b = toWorld({ x: width, y: 0 });
  if ((b.x - a.x) / step > 400 || (b.y - a.y) / step > 400) return [];
  const lines = [];
  for (let x = Math.ceil(a.x / step) * step; x <= b.x; x += step) lines.push({ axis: "x", value: x, px: scene.toScreen({ x, y: 0 }).x });
  for (let y = Math.ceil(a.y / step) * step; y <= b.y; y += step) lines.push({ axis: "y", value: y, px: scene.toScreen({ x: 0, y }).y });
  return lines;
}
