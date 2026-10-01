/* Pattern data model (spec section 4).
 *
 * A pattern holds inputs and settings only. Group `defaults` supply every
 * fastener property; each fastener stores sparse `overrides`, so editing a
 * default never touches an overridden fastener.
 */

import { convertPattern } from "./units.mjs";
import { issue } from "./warnings.mjs";

export const SCHEMA_VERSION = 1;
export const SOFT_FASTENER_LIMIT = 200;

export function defaultSettings() {
  return {
    designBasis: "elastic",
    axialMethod: "centroid",
    contactEdge: { plateId: "P1", edge: "yMin" },
    interaction: { a: 2, b: 2 },
    prying: { enabled: false },
    preload: { enabled: false },
    icr: { enabled: false, model: "crawford-kulak" },
    precision: 4,
    pageSize: "A4",
  };
}

/* Group defaults in N-mm; the ICR values are the metric equivalents of the
 * common structural-bolt curve (editable defaults, not recommendations). */
export function defaultProperties() {
  return {
    diameter: 12, area: 113.1, ks: 1, ka: 1,
    shearAllowable: null, tensionAllowable: null,
    icr: { rult: null, mu: 0.3937, lambda: 0.55, deltaMax: 8.6, deltaY: null },
    prying: { b: null, a: null, p: null, holeDiameter: null, boltStrengthB: null, manualFactor: null },
    preload: { pMax: null, pMin: null, phi: null },
  };
}

export function defaultPlate(id = "P1") {
  return {
    id, thickness: 10, xMin: -80, xMax: 80, yMin: -50, yMax: 50,
    bearingAllowable: null, bearingLoadAllowable: null, shearOutAllowable: null, minEdgeRatio: null, flangeStrength: null,
  };
}

export function defaultLoad() {
  return { appliedPlate: "P1", point: { x: 150, y: 0, z: 0 }, Fx: 0, Fy: -10000, Fz: 0, Mx: 0, My: 0, Mz: 0 };
}

/* The spec's example: a 2×2 bracket loaded 150 mm to the right (VC-01). */
export function examplePattern(unitSystem = "N-mm") {
  const pattern = {
    schemaVersion: SCHEMA_VERSION,
    name: "Bracket A - 2x2",
    unitSystem: "N-mm",
    settings: defaultSettings(),
    defaults: defaultProperties(),
    fasteners: [
      { id: "F1", label: "", x: 50, y: 30, overrides: {} },
      { id: "F2", label: "", x: 50, y: -30, overrides: {} },
      { id: "F3", label: "", x: -50, y: 30, overrides: {} },
      { id: "F4", label: "", x: -50, y: -30, overrides: {} },
    ],
    plates: [defaultPlate("P1")],
    load: defaultLoad(),
  };
  return unitSystem === "N-mm" ? pattern : convertPattern(pattern, unitSystem);
}

export const clone = (value) => JSON.parse(JSON.stringify(value));

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/* Overlay sparse overrides on defaults, recursing into nested groups. */
export function mergeProps(base, overrides) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overrides || {})) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? mergeProps(base[key], value) : value;
  }
  return out;
}

/* Every property of fastener `f`, defaults filled in. */
export function resolveFastener(pattern, f) {
  return { id: f.id, label: f.label || "", x: f.x, y: f.y, ...mergeProps(pattern.defaults, f.overrides) };
}

/* Next free id. Ids are never reused within a pattern: the counter lives in
 * the pattern (`nextId`) and never goes below one past the largest id seen. */
export function nextFastenerId(pattern) {
  const used = (pattern.fasteners || []).map((f) => Number(/^F(\d+)$/.exec(f.id)?.[1] || 0));
  const n = Math.max(pattern.nextId || 1, ...used.map((u) => u + 1), 1);
  pattern.nextId = n + 1;
  return `F${n}`;
}

export function addFastener(pattern, x, y, extra = {}) {
  const f = { id: nextFastenerId(pattern), label: "", x, y, overrides: {}, ...extra };
  pattern.fasteners.push(f);
  return f;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/* Input checks that need no solve: E-001, E-002, E-003 and W-019. */
export function validateInputs(pattern) {
  const issues = [];
  const fasteners = pattern.fasteners || [];
  if (fasteners.length === 0) issues.push(issue("E-001", "Add at least one fastener."));
  if (fasteners.length > SOFT_FASTENER_LIMIT) {
    issues.push(issue("W-019", `${fasteners.length} fasteners; the soft limit is about ${SOFT_FASTENER_LIMIT}.`));
  }
  const need = (value, field, label, fastener = null) => {
    if (!isNum(value)) {
      issues.push(issue("E-002", `${label} is ${value === null || value === undefined || value === "" ? "missing" : `not a number (“${value}”)`}.`, { fastener, field }));
      return false;
    }
    return true;
  };
  for (const [key, label] of [["area", "Default area A"], ["ks", "Default ks"], ["ka", "Default ka"]]) {
    const v = pattern.defaults?.[key];
    if (need(v, `defaults.${key}`, label) && !(v > 0)) {
      issues.push(issue("E-003", `${label} must be greater than zero (is ${v}).`, { field: `defaults.${key}` }));
    }
  }
  for (const f of fasteners) {
    need(f.x, "x", `${f.id} x`, f.id);
    need(f.y, "y", `${f.id} y`, f.id);
    for (const key of ["area", "ks", "ka"]) {
      if (!f.overrides || !(key in f.overrides)) continue;
      const v = f.overrides[key];
      if (need(v, key, `${f.id} ${key}`, f.id) && !(v > 0)) {
        issues.push(issue("E-003", `${f.id} ${key} must be greater than zero (is ${v}).`, { fastener: f.id, field: key }));
      }
    }
  }
  const load = pattern.load || {};
  for (const axis of ["x", "y", "z"]) need(load.point?.[axis], `load.point.${axis}`, `Load point ${axis}`);
  for (const key of ["Fx", "Fy", "Fz", "Mx", "My", "Mz"]) need(load[key], `load.${key}`, key);
  return issues;
}
