/* Prying and preload: the tension chain from external tension T to the
 * bolt load that feeds the interaction (spec 5.6).
 *
 * Prying (T-stub: the Struik-de Back equilibrium model with modified a'
 * and b', Kulak-Fisher-Struik Guide 2nd ed. Eqs. 17.8 to 17.12, checked by
 * VR-01; keyed B and Fp so no code factor is built in) acts only on
 * positive external tension:
 *   a_used = min(a, 1.25·b)
 *   b' = b − D/2    a' = a_used + D/2    ρ = b'/a'    δ = 1 − d_h/p
 *   t_c = √(4·B·b' / (p·Fp))
 *   α'  = (1/δ)·[(T/B)·(t_c/t)² − 1], clamped to 0 ≤ α' ≤ 1
 *   Q   = B·δ·α'·ρ·(t/t_c)²   (Q = 0 when α' ≤ 0)
 * A manual amplification factor f overrides the T-stub: the bolt sees f·T,
 * so Q = (f − 1)·T (W-012).
 *
 * Preload (P_max, P_min and load-sharing factor φ, 0 < φ < 1):
 *   bolt load        F_b = max(P_max + φ·T, T) + Q
 *   clamp force      C   = P_min − (1 − φ)·T
 *   separation load  T_sep = P_min / (1 − φ)
 * The max(…) keeps F_b continuous through separation; once C ≤ 0 the joint
 * is separated (W-013). Prying Q is added to the bolt load (conservative).
 * With preload off the tension used is T + Q.
 */

import { issue } from "./warnings.mjs";

export const A_LIMIT = 1.25;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const given = (v) => v !== null && v !== undefined && v !== "";

/* T-stub prying for one fastener at external tension T ≥ 0. */
export function tStubPrying(T, { B, b, a, p, dh, D, t, Fp }) {
  const aUsed = Math.min(a, A_LIMIT * b);
  const bP = b - D / 2, aP = aUsed + D / 2;
  const rho = bP / aP, delta = 1 - dh / p;
  const tc = Math.sqrt((4 * B * bP) / (p * Fp));
  const base = { method: "t-stub", aUsed, aLimited: aUsed < a, bP, aP, rho, delta, tc, t, B };
  if (!(T > 0)) return { ...base, alphaRaw: null, alpha: 0, Q: 0 };
  const alphaRaw = (1 / delta) * ((T / B) * (tc / t) ** 2 - 1);
  const alpha = Math.min(Math.max(alphaRaw, 0), 1);
  const Q = alpha > 0 ? B * delta * alpha * rho * (t / tc) ** 2 : 0;
  return { ...base, alphaRaw, alpha, Q };
}

/* Bolt load and clamp state at external tension T (≥ 0). `prying` is
 * { kind: "off" } | { kind: "manual", factor } | { kind: "t-stub", params };
 * `preload` is null or { pMax, pMin, phi }. */
export function boltLoad(T, prying, preload) {
  const Text = Math.max(T, 0);
  let pry = { method: "off", Q: 0 };
  if (prying.kind === "manual") pry = { method: "manual", factor: prying.factor, Q: Text > 0 ? (prying.factor - 1) * Text : 0 };
  else if (prying.kind === "t-stub") pry = tStubPrying(Text, prying.params);
  const Q = pry.Q;
  if (!preload) return { Text, prying: pry, Q, preload: null, Fb: Text + Q };
  const { pMax, pMin, phi } = preload;
  const shared = pMax + phi * Text;
  const branch = shared >= Text ? "preloaded" : "separated";
  const clamp = pMin - (1 - phi) * Text;
  return {
    Text, prying: pry, Q,
    preload: { pMax, pMin, phi, shared, branch, clamp, separationLoad: pMin / (1 - phi), separated: clamp <= 0 },
    Fb: Math.max(shared, Text) + Q,
  };
}

/* Per-fastener prying and preload inputs, resolved. `plate` supplies the
 * flange thickness t and strength Fp. Returns { prying, preload } in the
 * shape boltLoad expects. */
export function tensionInputs(f, settings, plate) {
  const pryOn = !!settings.prying?.enabled, preOn = !!settings.preload?.enabled;
  let prying = { kind: "off" };
  if (pryOn) {
    const pr = f.prying || {};
    if (given(pr.manualFactor)) prying = { kind: "manual", factor: pr.manualFactor };
    else prying = { kind: "t-stub", params: { B: pr.boltStrengthB, b: pr.b, a: pr.a, p: pr.p, dh: pr.holeDiameter, D: f.diameter, t: plate?.thickness, Fp: plate?.flangeStrength } };
  }
  const pl = f.preload || {};
  const preload = preOn ? { pMax: pl.pMax, pMin: pl.pMin, phi: pl.phi } : null;
  return { prying, preload };
}

/*
 * Input checks for enabled prying and preload: E-007 (missing), E-002
 * (not a number or inconsistent geometry), E-009 (φ), E-014 (P_max < P_min).
 * `resolved` are fasteners with defaults merged; `plate` the flange plate.
 */
export function validateTensionInputs(pattern, resolved, plate) {
  const issues = [];
  const settings = pattern.settings || {};
  const where = (f, key) => (f.overrides && hasPath(f.overrides, key) ? { fastener: f.id, field: key } : { field: `defaults.${key}` });
  const seen = new Set();
  const push = (id, detail, opts) => {
    const key = `${id}|${opts.fastener || ""}|${opts.field}|${detail}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue(id, detail, opts));
  };
  const originals = new Map((pattern.fasteners || []).map((f) => [f.id, f]));
  if (settings.prying?.enabled) {
    const plateLabel = plate ? plate.id : "the loaded plate";
    const tStub = resolved.some((f) => !given(f.prying?.manualFactor));
    if (tStub && !plate) push("E-007", "Prying needs the loaded plate (flange thickness t and flange strength Fp), but it does not exist.", { field: "load.appliedPlate" });
    else if (tStub && !given(plate.thickness)) push("E-007", `Prying needs flange thickness t: ${plateLabel} thickness is not entered.`, { field: `plates.${plate.id}.thickness` });
    else if (tStub && !(isNum(plate.thickness) && plate.thickness > 0)) push("E-002", `${plateLabel} thickness must be a positive number.`, { field: `plates.${plate.id}.thickness` });
    for (const f of resolved) {
      const o = originals.get(f.id) || {};
      const pr = f.prying || {};
      if (given(pr.manualFactor)) {
        const at = where(o, "prying.manualFactor");
        if (!(isNum(pr.manualFactor) && pr.manualFactor >= 1)) push("E-002", `${at.fastener ? `${f.id}: m` : "M"}anual prying factor must be a number ≥ 1 (is ${pr.manualFactor}).`, at);
        continue;
      }
      if (plate && !given(plate.flangeStrength)) push("E-007", `Prying needs flange strength Fp: ${plateLabel} flange strength is not entered.`, { field: `plates.${plate.id}.flangeStrength` });
      else if (plate && !(isNum(plate.flangeStrength) && plate.flangeStrength > 0)) push("E-002", `${plateLabel} flange strength Fp must be a positive number.`, { field: `plates.${plate.id}.flangeStrength` });
      const need = [["diameter", "diameter D", f.diameter], ["prying.b", "distance b", pr.b], ["prying.a", "edge distance a", pr.a],
        ["prying.p", "tributary width p", pr.p], ["prying.holeDiameter", "hole diameter d_h", pr.holeDiameter], ["prying.boltStrengthB", "bolt reference strength B", pr.boltStrengthB]];
      let complete = true;
      for (const [key, label, v] of need) {
        const at = where(o, key);
        if (!given(v)) { push("E-007", `Prying needs ${label}${at.fastener ? ` for ${f.id}` : " (group default)"}.`, at); complete = false; }
        else if (!(isNum(v) && v > 0)) { push("E-002", `${label} must be a positive number (is ${v}).`, at); complete = false; }
      }
      if (!complete) continue;
      const bAt = where(o, "prying.b"), pAt = where(o, "prying.p");
      if (!(pr.b > f.diameter / 2)) push("E-002", `${bAt.fastener ? `${f.id}: p` : "P"}rying distance b (${pr.b}) must exceed D/2 (${f.diameter / 2}) so b' > 0.`, bAt);
      if (!(pr.p > pr.holeDiameter)) push("E-002", `${pAt.fastener ? `${f.id}: t` : "T"}ributary width p (${pr.p}) must exceed the hole diameter (${pr.holeDiameter}) so δ > 0.`, pAt);
    }
  }
  if (settings.preload?.enabled) {
    for (const f of resolved) {
      const o = originals.get(f.id) || {};
      const pl = f.preload || {};
      const phiAt = where(o, "preload.phi");
      if (!(isNum(pl.phi) && pl.phi > 0 && pl.phi < 1)) {
        push("E-009", given(pl.phi) ? `φ = ${pl.phi}${phiAt.fastener ? ` for ${f.id}` : ""}; it must satisfy 0 < φ < 1.` : `Preload is enabled but φ is not entered${phiAt.fastener ? ` for ${f.id}` : ""}; it has no default.`, phiAt);
      }
      let both = true;
      for (const [key, label] of [["pMax", "P_max"], ["pMin", "P_min"]]) {
        const v = pl[key], at = where(o, `preload.${key}`);
        if (!given(v)) { push("E-007", `Preload needs ${label}${at.fastener ? ` for ${f.id}` : " (group default)"}.`, at); both = false; }
        else if (!(isNum(v) && v >= 0)) { push("E-002", `${label} must be a number ≥ 0 (is ${v}).`, at); both = false; }
      }
      if (both && pl.pMax < pl.pMin) {
        const at = where(o, "preload.pMax");
        push("E-014", `${at.fastener ? `${f.id}: ` : ""}P_max = ${pl.pMax} is less than P_min = ${pl.pMin}.`, at);
      }
    }
  }
  return issues;
}

function hasPath(obj, path) {
  let o = obj;
  for (const k of path.split(".")) {
    if (!o || typeof o !== "object" || !(k in o)) return false;
    o = o[k];
  }
  return true;
}

/* Torque convenience: preload P from torque T = K·D·P. K is keyed by the user (no default). */
export function preloadFromTorque(torque, K, D) {
  if (![torque, K, D].every(isNum) || !(K > 0) || !(D > 0)) throw new Error("Torque, nut factor K and diameter D must be numbers, with K and D greater than zero.");
  return torque / (K * D);
}
