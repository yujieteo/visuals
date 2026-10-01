/* Unit systems and in-place conversion of a pattern (spec 3.2).
 *
 * Two systems: "N-mm" and "in-lbf". Switching converts every stored
 * dimensional value, rounded to 12 significant figures. Relative stiffness
 * factors, exponents and ratios are dimensionless and never change.
 */

export const UNIT_SYSTEMS = ["N-mm", "in-lbf"];

export const MM_PER_IN = 25.4;
export const N_PER_LBF = 4.4482216152605;

/* Symbols shown next to each quantity kind. */
export const UNIT_LABELS = {
  "N-mm": { length: "mm", force: "N", moment: "N·mm", stress: "MPa", area: "mm²", section: "mm²", invLength: "1/mm", none: "" },
  "in-lbf": { length: "in", force: "lbf", moment: "in·lbf", stress: "psi", area: "in²", section: "in²", invLength: "1/in", none: "" },
};

/* Multiplier taking one unit of `kind` in N-mm to in-lbf. */
const TO_IN_LBF = {
  length: 1 / MM_PER_IN,
  force: 1 / N_PER_LBF,
  moment: 1 / (N_PER_LBF * MM_PER_IN),
  stress: MM_PER_IN * MM_PER_IN / N_PER_LBF,
  area: 1 / (MM_PER_IN * MM_PER_IN),
  section: 1 / (MM_PER_IN * MM_PER_IN),
  invLength: MM_PER_IN,
  none: 1,
};

export function unitLabel(system, kind) {
  return (UNIT_LABELS[system] || UNIT_LABELS["N-mm"])[kind] ?? "";
}

export function round12(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return value;
  return Number(value.toPrecision(12));
}

export function convertValue(value, kind, from, to) {
  if (from === to || typeof value !== "number" || !Number.isFinite(value)) return value;
  const factor = TO_IN_LBF[kind];
  if (factor === undefined) throw new Error(`Unknown quantity kind ${kind}`);
  return round12(from === "N-mm" ? value * factor : value / factor);
}

/* Quantity kind of every dimensional field in a fastener property set
 * (group defaults and per-fastener overrides share this shape). */
export const PROPERTY_KINDS = {
  diameter: "length",
  area: "area",
  ks: "none",
  ka: "none",
  shearAllowable: "force",
  tensionAllowable: "force",
  icr: { rult: "force", mu: "invLength", lambda: "none", deltaMax: "length", deltaY: "length" },
  prying: { b: "length", a: "length", p: "length", holeDiameter: "length", boltStrengthB: "force", manualFactor: "none" },
  preload: { pMax: "force", pMin: "force", phi: "none" },
};

export const PLATE_KINDS = {
  thickness: "length", xMin: "length", xMax: "length", yMin: "length", yMax: "length",
  bearingAllowable: "stress", bearingLoadAllowable: "force", shearOutAllowable: "stress", minEdgeRatio: "none", flangeStrength: "stress",
};

export const LOAD_KINDS = {
  point: { x: "length", y: "length", z: "length" },
  Fx: "force", Fy: "force", Fz: "force", Mx: "moment", My: "moment", Mz: "moment",
};

function convertObject(object, kinds, from, to) {
  if (!object || typeof object !== "object") return object;
  const out = Array.isArray(object) ? [...object] : { ...object };
  for (const [key, kind] of Object.entries(kinds)) {
    if (!(key in out)) continue;
    out[key] = typeof kind === "string" ? convertValue(out[key], kind, from, to) : convertObject(out[key], kind, from, to);
  }
  return out;
}

/* Return a copy of `pattern` expressed in `to`. */
export function convertPattern(pattern, to) {
  const from = pattern.unitSystem;
  if (!UNIT_SYSTEMS.includes(to)) throw new Error(`Unknown unit system ${to}`);
  if (from === to) return pattern;
  return {
    ...pattern,
    unitSystem: to,
    defaults: convertObject(pattern.defaults, PROPERTY_KINDS, from, to),
    fasteners: (pattern.fasteners || []).map((f) => ({
      ...f,
      x: convertValue(f.x, "length", from, to),
      y: convertValue(f.y, "length", from, to),
      overrides: convertObject(f.overrides || {}, PROPERTY_KINDS, from, to),
    })),
    plates: (pattern.plates || []).map((p) => convertObject(p, PLATE_KINDS, from, to)),
    load: convertObject(pattern.load, LOAD_KINDS, from, to),
  };
}
