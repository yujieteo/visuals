/* Per-fastener checks and the governing margin (spec 5.5 and 5.10).
 *
 * Each mode gives one result per fastener: { mode, label, status, ms, ... }.
 * status "ok" carries a margin; "not-evaluated" means an allowable was not
 * entered and never shows a number; "not-computed" means the solve failed
 * (W-008) or preload alone exceeds the allowable (W-017); "unloaded" means
 * no load reaches the fastener (MS = ∞). The governing MS of a fastener is
 * the minimum across its evaluated modes, and the critical fastener is the
 * one with the lowest governing MS.
 */

import { solveScale } from "./interaction.mjs";
import { boltLoad } from "./tension.mjs";
import { issue } from "./warnings.mjs";

export const MODES = { interaction: "Shear-tension interaction" };

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/* Settings and allowable checks that need no solve: E-002, E-008, W-006, W-007. */
export function validateCheckInputs(pattern, resolved) {
  const issues = [];
  const it = pattern.settings?.interaction || {};
  for (const key of ["a", "b"]) {
    const v = it[key];
    const field = `settings.interaction.${key}`;
    if (!isNum(v)) issues.push(issue("E-002", `Interaction exponent ${key} is ${v === null || v === undefined || v === "" ? "missing" : `not a number (“${v}”)`}.`, { field }));
    else if (v <= 0) issues.push(issue("E-008", `Interaction exponent ${key} = ${v}; exponents must be greater than zero.`, { field }));
    else if (v < 1) issues.push(issue("W-007", `Interaction exponent ${key} = ${v} gives a non-convex, unconservative interaction curve.`, { field }));
  }
  if (isNum(it.a) && isNum(it.b) && it.a > 0 && it.b > 0 && !(it.a === 1 && it.b === 1)) {
    issues.push(issue("W-006", `Exponents (a, b) = (${it.a}, ${it.b}): MS is the exact load scale factor k* − 1 at which IF(k*) = 1, not the 1/IF − 1 convention.`, { field: "settings.interaction" }));
  }
  const allowable = (value, label, field, fastener = null) => {
    if (value === null || value === undefined) return;
    if (!isNum(value)) issues.push(issue("E-002", `${label} is not a number (“${value}”).`, { field, fastener }));
    else if (!(value > 0)) issues.push(issue("E-002", `${label} must be greater than zero (is ${value}).`, { field, fastener }));
  };
  allowable(pattern.defaults?.shearAllowable, "Default shear allowable Fs", "defaults.shearAllowable");
  allowable(pattern.defaults?.tensionAllowable, "Default tension allowable Ft", "defaults.tensionAllowable");
  for (const f of pattern.fasteners || []) {
    const o = f.overrides || {};
    if ("shearAllowable" in o) allowable(o.shearAllowable, `${f.id} Fs`, "shearAllowable", f.id);
    if ("tensionAllowable" in o) allowable(o.tensionAllowable, `${f.id} Ft`, "tensionAllowable", f.id);
  }
  return issues;
}

/*
 * `fasteners`: solve() fastener results (resolved properties plus shear and
 * axial). Tension feeding the interaction is the positive part of T;
 * unloading counts as zero (N-006). Rs and T within zeroTol of the largest
 * |Rs| and |T| in the group are round-off and count as zero.
 */
export function fastenerChecks(fasteners, settings, zeroTol, tensionFor = () => ({ prying: { kind: "off" }, preload: null }), plateModesFor = () => []) {
  const { a, b } = settings.interaction;
  const issues = [];
  const notComputed = [], preloadOnly = [], shortEdge = [], shortIds = [];
  const idOf = (entry) => entry.split(" ")[0];
  const basisOf = (f) => (f.basisShear === undefined ? f.shear : f.basisShear);
  const shearFloor = zeroTol * Math.max(...fasteners.map((f) => Math.abs(basisOf(f)?.Rs ?? 0)), 0);
  const tensionFloor = zeroTol * Math.max(...fasteners.map((f) => Math.abs(f.axial.T)), 0);
  const results = fasteners.map((f) => {
    const sh = basisOf(f);
    const Rs = sh && sh.Rs > shearFloor ? sh.Rs : 0;
    const Text = f.axial.T > tensionFloor ? f.axial.T : 0;
    // Tension chain: external T through prying and preload to the bolt load
    // F_b, re-evaluated at every load multiplier k (preload does not scale).
    const chain = tensionFor(f);
    const tension = boltLoad(Text, chain.prying, chain.preload);
    const tensionAt = (k) => boltLoad(k * Text, chain.prying, chain.preload).Fb;
    const Rt = tension.Fb;
    const Fs = f.shearAllowable, Ft = f.tensionAllowable;
    const missing = [Fs === null || Fs === undefined ? "Fs" : null, Ft === null || Ft === undefined ? "Ft" : null].filter(Boolean);
    let interaction;
    if (!sh) {
      interaction = { mode: "interaction", label: MODES.interaction, status: "not-computed", reason: "ICR basis selected but ICR did not converge", ms: null, Rs: null, Rt, Text, Q: tension.Q, a, b };
      notComputed.push(`${f.id} (ICR not converged)`);
    } else if (missing.length) {
      interaction = { mode: "interaction", label: MODES.interaction, status: "not-evaluated", ms: null, missing, Rs, Rt, Text, Q: tension.Q, a, b };
    } else {
      const s = solveScale({ Rs, tensionAt, Fs, Ft, a, b });
      interaction = { mode: "interaction", label: MODES.interaction, ...s, Rs, Rt, Text, Q: tension.Q, Fs, Ft, a, b, shearRatio: Rs / Fs, tensionRatio: Rt / Ft };
      if (s.status === "not-computed") notComputed.push(`${f.id} (${s.reason})`);
      if (s.status === "preload") preloadOnly.push(`${f.id} (IF(0) = ${s.IF0.toPrecision(4)})`);
    }
    // Bearing and tear-out per plate use the same round-off-snapped Rs.
    const modes = [interaction, ...(sh ? plateModesFor({ ...f, shear: { ...sh, Rs } }) : [])];
    for (const m of modes) {
      if (m.mode === "tearout" && m.minRatio !== null && m.minRatio !== undefined && m.eOverD !== null && m.eOverD !== undefined && m.eOverD < m.minRatio) {
        shortEdge.push(`${f.id} in ${m.plate}: e/D = ${m.eOverD.toPrecision(4)} < ${m.minRatio}`);
        shortIds.push(f.id);
      }
    }
    const evaluated = modes.filter((m) => m.status === "ok" || m.status === "unloaded");
    const blocked = modes.filter((m) => m.status === "not-computed" || m.status === "preload");
    let governing = null;
    if (evaluated.length) {
      const g = evaluated.reduce((lo, m) => (m.ms < lo.ms ? m : lo));
      governing = { mode: g.mode, plate: g.plate || null, label: g.label, ms: g.ms };
    }
    const clamp = tension.preload
      ? { status: tension.preload.separated ? "separated" : "clamped", clamp: tension.preload.clamp, separationLoad: tension.preload.separationLoad }
      : { status: "no preload" };
    return { id: f.id, modes, governing, blocked: blocked.map((m) => m.mode), unloadingCountedZero: f.axial.unloading && !missing.length, tension, clamp };
  });
  if (shortEdge.length) issues.push(issue("W-011", `Edge distance along the bearing direction is below the keyed minimum: ${shortEdge.join("; ")}.`, { fasteners: [...new Set(shortIds)] }));
  if (notComputed.length) issues.push(issue("W-008", `MS not computed for ${notComputed.join(", ")}.`, { fasteners: notComputed.map(idOf) }));
  if (preloadOnly.length) issues.push(issue("W-017", `IF(0) ≥ 1, so MS is not computed, for ${preloadOnly.join(", ")}.`, { fasteners: preloadOnly.map(idOf) }));
  const separated = results.filter((r) => r.clamp.status === "separated");
  if (separated.length) {
    const loads = separated.map((r) => `${r.id} F_b = ${r.tension.Fb.toPrecision(4)} (${r.tension.preload.branch === "separated" ? "T + Q" : "P_max + φ·T + Q"})`);
    issues.push(issue("W-013", `Clamp force P_min − (1 − φ)·T has reached zero on ${separated.map((r) => r.id).join(", ")}: the joint is separated there. Bolt load ${loads.join("; ")}.`, { fasteners: separated.map((r) => r.id) }));
  }
  const manual = results.filter((r) => r.tension.prying.method === "manual").map((r) => r.id);
  if (manual.length) issues.push(issue("W-012", `Manual prying factor replaces the T-stub result on ${manual.join(", ")} (bolt tension = factor × T).`, { fasteners: manual }));
  if (settings.preload?.enabled) issues.push(issue("N-005", "Clamp force is reported, but no friction-slip capacity is claimed."));
  else if (results.some((r) => r.tension.Text > 0)) issues.push(issue("N-007", "Preload is disabled: the bolt load is the external tension plus prying, T + Q."));
  const zeroed = results.filter((r) => r.unloadingCountedZero).map((r) => r.id);
  if (zeroed.length) issues.push(issue("N-006", `Unloading fasteners enter the interaction with zero external tension${settings.preload?.enabled ? ", so their bolt load is P_max" : ""}: ${zeroed.join(", ")}.`, { fasteners: zeroed }));
  const withMargin = results.filter((r) => r.governing && Number.isFinite(r.governing.ms));
  const critical = withMargin.length ? withMargin.reduce((lo, r) => (r.governing.ms < lo.governing.ms ? r : lo)) : null;
  return {
    fasteners: results,
    critical: critical ? { id: critical.id, ms: critical.governing.ms, mode: critical.governing.mode, plate: critical.governing.plate, label: critical.governing.label } : null,
    evaluatedCount: results.filter((r) => r.governing).length,
    issues,
  };
}

/*
 * Why no fastener has a finite margin (critical is null): ids with no
 * allowable entered, unloaded (MS = ∞), and not computed (W-008 or W-017).
 */
export function noMarginSummary(results) {
  const ids = (...statuses) => results.filter((r) => r.modes.some((m) => statuses.includes(m.status))).map((r) => r.id);
  const missing = ids("not-evaluated"), unloaded = ids("unloaded"), blocked = ids("not-computed", "preload");
  const parts = [];
  if (unloaded.length) parts.push(`unloaded (MS = ∞): ${unloaded.join(", ")}`);
  if (blocked.length) parts.push(`MS not computed: ${blocked.join(", ")}`);
  if (missing.length) parts.push(`no allowables entered: ${missing.join(", ")}`);
  const text = unloaded.length || blocked.length ? `No finite margin — ${parts.join("; ")}.` : "No margin evaluated: no allowables entered.";
  return { missing, unloaded, blocked, text };
}

/* Display text for one mode's margin; `num` formats a finite number. */
export function marginText(m, num = String) {
  if (!m) return "—";
  if (m.status === "ok") return num(m.ms);
  if (m.status === "unloaded") return "∞ (no load on this fastener)";
  if (m.status === "not-evaluated") return `not evaluated (no allowable entered: ${m.missing.join(", ")})`;
  if (m.status === "preload") return "MS not computed (preload alone exceeds the allowable, W-017)";
  return "MS not computed (W-008)";
}
