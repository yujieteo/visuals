/* WebMCP tools: let an agent read the page's pattern and run the same
 * solver on any pattern without changing the page. */

import { CATALOG } from "../core/warnings.mjs";
import { normalizePattern, toJSON } from "../core/persist.mjs";
import { solve } from "../core/solve.mjs";
import { TOOL_NAME, TOOL_VERSION, MILESTONE, CONVENTIONS, ASSUMPTIONS } from "../core/meta.mjs";
import { UNIT_LABELS } from "../core/units.mjs";

const text = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

/* A compact, JSON-safe view of a solve() result. */
export function summarize(result) {
  if (!result.ok) return { ok: false, issues: result.issues };
  const p = result.props, r = result.reduced;
  return {
    ok: true,
    unitSystem: result.unitSystem,
    centroids: p.centroids.map(({ key, name, weight, x, y, coincidentWith }) => ({ key, name, weight, x, y, coincidentWith })),
    section: { J: p.J, Ixx: p.Ixx, Iyy: p.Iyy, Ixy: p.Ixy, I1: p.principal.I1, I2: p.principal.I2, thetaDeg: p.principal.thetaDeg, sumKs: p.Ks, sumKa: p.Ka },
    reducedLoad: { Fx: r.Fx, Fy: r.Fy, Fz: r.Fz, MzAtCs: r.shear.Mz, MxAtCa: r.axial.Mx, MyAtCa: r.axial.My },
    fasteners: result.fasteners.map((f) => ({
      id: f.id, x: f.x, y: f.y, Rdx: f.shear.Rdx, Rdy: f.shear.Rdy, Rtx: f.shear.Rtx, Rty: f.shear.Rty,
      Rs: f.shear.Rs, directionDeg: f.shear.angleDeg, T: f.axial.T, unloading: !!f.axial.unloading,
      checks: f.checks.modes.map(({ mode, status, IF1, kStar, ms, missing }) => ({ mode, status, IF1, kStar: Number.isFinite(kStar) ? kStar : null, ms: Number.isFinite(ms) ? ms : null, missing: missing || [] })),
      governingMS: f.checks.governing && Number.isFinite(f.checks.governing.ms) ? f.checks.governing.ms : null,
      boltTension: { external: f.checks.tension.Text, prying: f.checks.tension.Q, pryingMethod: f.checks.tension.prying.method, boltLoad: f.checks.tension.Fb, clampForce: f.checks.tension.preload ? f.checks.tension.preload.clamp : null, joint: f.checks.clamp.status },
    })),
    interaction: result.interaction,
    designBasis: result.designBasis,
    icr: result.icr ? (result.icr.status === "converged"
      ? { status: "converged", model: result.icr.model, mode: result.icr.mode, icr: result.icr.icr, gammaUlt: result.icr.gamma, margin: result.icr.margin, governing: result.icr.governing, reactionsAtLoad: result.icr.atLoad, comparison: result.comparison }
      : { status: result.icr.status, reason: result.icr.reason, residual: result.icr.residual }) : null,
    critical: result.critical,
    closure: result.closure.checks.map(({ name, residual, pass }) => ({ name, residual, pass })),
    issues: result.issues,
  };
}

const patternSchema = { type: "object", description: "A pattern in the page's canonical JSON format (schemaVersion 1), as returned by get_current_pattern." };

export function registerTools({ current, markdown }) {
  const mc = (typeof document !== "undefined" && document.modelContext) || (typeof navigator !== "undefined" && navigator.modelContext);
  if (!mc || typeof mc.registerTool !== "function") return false;
  const parse = (input) => normalizePattern(input && input.pattern ? input.pattern : input);
  mc.registerTool({
    name: "get_metadata",
    description: "Return the tool version, milestone, units, sign conventions, assumptions and the full warnings catalogue (error, warning and note ids).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async execute() { return text({ title: TOOL_NAME, version: TOOL_VERSION, milestone: MILESTONE, units: UNIT_LABELS, conventions: CONVENTIONS, assumptions: ASSUMPTIONS, warnings: CATALOG }); },
  });
  mc.registerTool({
    name: "get_current_pattern",
    description: "Return the pattern on the page (canonical JSON inputs) and its results: centroids, J, Ixx, Iyy, Ixy, principal axes, reduced load, per-fastener loads, interaction margins (exact-k MS), the critical fastener and warnings.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async execute() { const { pattern, result } = current(); return text({ pattern: JSON.parse(toJSON(pattern)), results: summarize(result) }); },
  });
  mc.registerTool({
    name: "analyze_pattern",
    description: "Validate and solve a pattern given as canonical JSON and return the same results as get_current_pattern. Does not change the page.",
    inputSchema: { type: "object", properties: { pattern: patternSchema }, required: ["pattern"], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async execute(input) {
      const parsed = parse(input);
      if (!parsed.pattern) return text({ ok: false, issues: parsed.issues });
      return text({ importIssues: parsed.issues, results: summarize(solve(parsed.pattern)) });
    },
  });
  mc.registerTool({
    name: "export_markdown",
    description: "Return the Markdown export (input and result tables plus the exact JSON block) for a given pattern, or for the page's pattern when none is given.",
    inputSchema: { type: "object", properties: { pattern: patternSchema }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async execute(input) {
      if (!input || !input.pattern) return text({ markdown: markdown(current().pattern) });
      const parsed = parse(input);
      if (!parsed.pattern) return text({ ok: false, issues: parsed.issues });
      return text({ markdown: markdown(parsed.pattern) });
    },
  });
  return true;
}
