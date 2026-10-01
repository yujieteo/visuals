/* Plates, geometry consistency, bearing and tear-out (spec 5.7).
 *
 * Each plate is an axis-aligned rectangle with a thickness and its own keyed
 * allowables. Every fastener passes through every plate, so each fastener is
 * checked against each plate and the governing plate is reported.
 *
 *   Bearing   R_br,allow = Fbr·D·t (or a keyed direct-load allowable);
 *             MS = R_br,allow / Rs − 1
 *   Tear-out  e = distance along the bearing direction from the fastener to
 *             the plate edge (ray cast); capacity = 2·t·(e − D/2)·Fsu;
 *             MS = capacity / Rs − 1. e/D below the keyed minimum is W-011.
 *
 * Bearing direction: Rs is the load the plate transmits to the fastener. The
 * loaded plate is pushed in the load direction, so its fastener bears
 * against the hole wall on the −R side; every other plate is pushed by the
 * fastener in +R. The tear-out ray follows that bearing direction.
 */

import { issue } from "./warnings.mjs";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const given = (v) => v !== null && v !== undefined && v !== "";
const outlineOk = (p) => [p.xMin, p.xMax, p.yMin, p.yMax].every(isNum) && p.xMax > p.xMin && p.yMax > p.yMin;

/* Distance from (x, y) inside the rectangle along unit (ux, uy) to its boundary. */
export function rayToRect(x, y, ux, uy, p) {
  let t = Infinity;
  if (ux > 0) t = Math.min(t, (p.xMax - x) / ux);
  if (ux < 0) t = Math.min(t, (p.xMin - x) / ux);
  if (uy > 0) t = Math.min(t, (p.yMax - y) / uy);
  if (uy < 0) t = Math.min(t, (p.yMin - y) / uy);
  return t;
}

export const edgeDistance = (x, y, p) => Math.min(x - p.xMin, p.xMax - x, y - p.yMin, p.yMax - y);

/* Plate inputs and geometry consistency: E-002, E-004, E-005, E-006, E-007, W-009. */
export function validatePlates(pattern, resolved) {
  const issues = [];
  const plates = pattern.plates || [];
  for (const p of plates) {
    const at = (k) => ({ field: `plates.${p.id}.${k}` });
    for (const k of ["xMin", "xMax", "yMin", "yMax"]) {
      if (!isNum(p[k])) issues.push(issue("E-002", `${p.id} ${k} is ${given(p[k]) ? `not a number (“${p[k]}”)` : "missing"}.`, at(k)));
    }
    if ([p.xMin, p.xMax, p.yMin, p.yMax].every(isNum) && !outlineOk(p)) {
      issues.push(issue("E-002", `${p.id} outline is empty: xMax must exceed xMin and yMax must exceed yMin.`, at("xMax")));
    }
    for (const [k, label] of [["thickness", "thickness"], ["bearingAllowable", "bearing allowable Fbr"], ["bearingLoadAllowable", "direct bearing allowable"], ["shearOutAllowable", "shear-out allowable Fsu"], ["minEdgeRatio", "minimum e/D"], ["flangeStrength", "flange strength Fp"]]) {
      if (given(p[k]) && !(isNum(p[k]) && p[k] > 0)) issues.push(issue("E-002", `${p.id} ${label} must be a positive number (is ${p[k]}).`, at(k)));
    }
    // E-007: an entered allowable enables its check, which then needs D and t.
    const tear = given(p.shearOutAllowable);
    if ((given(p.bearingAllowable) || tear) && !given(p.thickness)) {
      issues.push(issue("E-007", `${p.id} has ${tear ? "a shear-out" : "a bearing"} allowable but no thickness t.`, at("thickness")));
    }
    // Fbr·D·t and the tear-out capacity use D; a direct bearing allowable alone does not.
    if (given(p.bearingAllowable) || tear) {
      const noD = resolved.filter((f) => !given(f.diameter)).map((f) => f.id);
      if (noD.length) {
        issues.push(issue("E-007", `${p.id} bearing or tear-out needs diameter D for ${noD.join(", ")}.`, { fasteners: noD, field: "diameter" }));
      }
    }
  }
  const good = plates.filter(outlineOk);
  // E-004 and E-006: every fastener sits inside every plate, at least D/2 from each edge.
  for (const f of resolved) {
    for (const p of good) {
      const d = edgeDistance(f.x, f.y, p);
      if (d < 0) issues.push(issue("E-004", `${f.id} at (${f.x}, ${f.y}) is outside ${p.id}.`, { fastener: f.id, field: "x" }));
      else if (isNum(f.diameter) && d < f.diameter / 2) {
        issues.push(issue("E-006", `${f.id} is ${Number(d.toPrecision(6))} from the nearest edge of ${p.id}, less than D/2 = ${f.diameter / 2}.`, { fastener: f.id, field: "x" }));
      }
    }
  }
  // E-005: centre distance below the mean diameter.
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i], b = resolved[j];
      if (!isNum(a.diameter) || !isNum(b.diameter)) continue;
      const dist = Math.hypot(a.x - b.x, a.y - b.y), D = (a.diameter + b.diameter) / 2;
      if (dist < D) issues.push(issue("E-005", `${a.id} and ${b.id} are ${Number(dist.toPrecision(6))} apart, less than their diameter ${D}.`, { fasteners: [a.id, b.id], field: "x" }));
    }
  }
  // W-009: load point outside the loaded plate.
  const loaded = good.find((p) => p.id === pattern.load?.appliedPlate);
  const P = pattern.load?.point;
  if (loaded && P && isNum(P.x) && isNum(P.y) && edgeDistance(P.x, P.y, loaded) < 0) {
    issues.push(issue("W-009", `The load point (${P.x}, ${P.y}) is outside ${loaded.id}; the load is assumed to reach the plate through a rigid attachment.`, { field: "load.point.x" }));
  }
  return issues;
}

/* Bearing and tear-out modes of one fastener against every plate. `rs` is
 * the fastener's in-plane load { Rx, Ry, Rs } on the selected design basis. */
export function plateModes(f, rs, plates, loadedPlateId) {
  const modes = [];
  const D = f.diameter;
  for (const p of plates.filter(outlineOk)) {
    const sign = p.id === loadedPlateId ? -1 : 1;
    const t = p.thickness;
    // Bearing
    const direct = given(p.bearingLoadAllowable);
    const bearing = { mode: "bearing", plate: p.id, label: `Bearing, ${p.id}`, Rs: rs.Rs };
    if (!direct && !given(p.bearingAllowable)) modes.push({ ...bearing, status: "not-evaluated", ms: null, missing: [`${p.id} Fbr`] });
    else {
      const cap = direct ? p.bearingLoadAllowable : p.bearingAllowable * D * t;
      const basis = direct ? "direct-load allowable" : "Fbr·D·t";
      modes.push(rs.Rs > 0
        ? { ...bearing, status: "ok", capacity: cap, basis, ms: cap / rs.Rs - 1 }
        : { ...bearing, status: "unloaded", capacity: cap, basis, ms: Infinity });
    }
    // Tear-out
    const tear = { mode: "tearout", plate: p.id, label: `Tear-out, ${p.id}`, Rs: rs.Rs };
    const minRatio = given(p.minEdgeRatio) ? p.minEdgeRatio : null;
    if (!(rs.Rs > 0)) {
      modes.push(given(p.shearOutAllowable) ? { ...tear, status: "unloaded", ms: Infinity, minRatio } : { ...tear, status: "not-evaluated", ms: null, missing: [`${p.id} Fsu`], minRatio });
      continue;
    }
    const ux = (sign * rs.Rx) / rs.Rs, uy = (sign * rs.Ry) / rs.Rs;
    const e = rayToRect(f.x, f.y, ux, uy, p);
    const ray = { direction: { x: ux, y: uy }, e, eOverD: isNum(D) && D > 0 ? e / D : null, bearsTowards: sign < 0 ? "−R (loaded plate)" : "+R" };
    if (!given(p.shearOutAllowable)) {
      modes.push({ ...tear, ...ray, status: "not-evaluated", ms: null, missing: [`${p.id} Fsu`], minRatio });
      continue;
    }
    const cap = 2 * t * (e - D / 2) * p.shearOutAllowable;
    modes.push({ ...tear, ...ray, status: "ok", capacity: cap, minRatio, ms: cap / rs.Rs - 1 });
  }
  return modes;
}
