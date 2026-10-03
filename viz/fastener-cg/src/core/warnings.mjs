/* Warnings catalogue (spec section 6).
 *
 * Three tiers: errors block results and name the offending field or
 * fastener, warnings show results with a flag, notes are informational.
 * Each issue raised by the core is { id, tier, title, detail, fastener,
 * field }; `title` is the catalogue condition and `detail` says what
 * triggered it in this pattern.
 */

export const CATALOG = {
  "E-001": "No fasteners",
  "E-002": "Non-numeric or missing required field",
  "E-003": "Non-positive area, ks or ka",
  "E-004": "Fastener outside its plate outline",
  "E-005": "Overlapping fasteners (centre distance < diameter)",
  "E-006": "Edge distance < D/2",
  "E-007": "Diameter, thickness or allowable missing for an enabled check",
  "E-008": "Interaction exponent ≤ 0",
  "E-009": "Preload enabled without a valid φ (0 < φ < 1)",
  "E-010": "Equilibrium closure failure",
  "E-011": "Collinear pattern with bending moment about the unresolved axis",
  "E-012": "Method (b): moment component perpendicular to the contact edge is not zero",
  "E-013": "Import: invalid file, or schemaVersion newer than supported",
  "E-014": "P_max < P_min",
  "W-001": "Single fastener (no torsion resistance)",
  "W-002": "Collinear pattern",
  "W-003": "Zero load",
  "W-004": "Pattern extent > 10⁴ in the current unit (likely unit mix-up)",
  "W-005": "Method (a) assumes the joint stays clamped",
  "W-006": "Exponents ≠ (1, 1): MS is the exact scale factor, not 1/IF − 1",
  "W-007": "Exponent between 0 and 1: non-convex, unconservative",
  "W-008": "Scale-factor solve failed: MS not computed",
  "W-009": "Load point outside the plate outline",
  "W-010": "Contact edge on the wrong side for the applied moment",
  "W-011": "Edge distance below the keyed minimum e/D",
  "W-012": "Manual prying factor overrides the T-stub result",
  "W-013": "Separation reached: post-separation formulas in use",
  "W-014": "ICR not converged",
  "W-015": "ICR basis: reactions use the proportional scaling convention",
  "W-016": "Fasteners unloading under method (a): method (b) recommended",
  "W-017": "Preload alone exceeds the allowable at k = 0",
  "W-018": "Import: optional fields defaulted, or Markdown fallback lost settings",
  "W-019": "More than ~200 fasteners",
  "W-021": "Method (b): no contact reaction exists (C < 0)",
  "N-001": "Load line passes through the shear centroid (zero torsion)",
  "N-002": "Centroids differ: which one each calculation uses",
  "N-003": "Older schema migrated",
  "N-004": "ICR ignores ks",
  "N-005": "Friction slip not evaluated; clamp force reported only",
  "N-006": "Unloading fasteners counted as zero tension in the interaction",
  "N-007": "Preload disabled",
  "N-008": "ICR curve parameters are editable defaults; confirm for the fastener",
};

export const TIERS = { E: "error", W: "warning", N: "note" };
const TIER_ORDER = { error: 0, warning: 1, note: 2 };

export function tierOf(id) {
  return TIERS[id[0]];
}

/* `fastener` is the first (or only) fastener named; `fasteners` lists every one. */
export function issue(id, detail = "", { fastener = null, fasteners = null, field = null } = {}) {
  if (!(id in CATALOG)) throw new Error(`Unknown warning id ${id}`);
  const all = fasteners || (fastener ? [fastener] : []);
  return { id, tier: tierOf(id), title: CATALOG[id], detail, fastener: fastener ?? all[0] ?? null, fasteners: all, field };
}

/* Errors first, then warnings, then notes; catalogue order within a tier. */
export function sortIssues(issues) {
  const ids = Object.keys(CATALOG);
  return [...issues].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || ids.indexOf(a.id) - ids.indexOf(b.id));
}

export const hasErrors = (issues) => issues.some((i) => i.tier === "error");
