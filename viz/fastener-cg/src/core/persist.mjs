/* Persistence (spec section 8): canonical JSON and Markdown, import and export.
 *
 * JSON stores inputs and settings only, exactly as entered, tagged with
 * `unitSystem`. Markdown holds readable tables plus one fenced JSON block;
 * import prefers that block and falls back to the fastener, plate and load
 * tables when it is missing or was hand-edited (its checksum no longer
 * matches). Import validation lists every problem at once; a file with any
 * error does not load. The app adopts the file's unit system: nothing is
 * converted on import.
 */

import { SCHEMA_VERSION, clone, defaultLoad, defaultPlate, defaultProperties, defaultSettings, resolveFastener } from "./model.mjs";
import { UNIT_SYSTEMS, convertPattern, unitLabel } from "./units.mjs";
import { issue } from "./warnings.mjs";
import { marginText, noMarginSummary } from "./checks.mjs";
import { buildTrace, traceFastenerId } from "./trace.mjs";
import { ASSUMPTIONS } from "./meta.mjs";

export const MAX_PLATES = 2;

/* Older schema versions that can be migrated, as { from: fn(raw) -> raw at from+1 }.
 * Version 1 is the first published schema, so none exist yet; N-003 is raised
 * whenever one runs. */
export const MIGRATIONS = {};

const ENUMS = {
  "settings.designBasis": ["elastic", "icr"],
  "settings.axialMethod": ["centroid", "contact-edge"],
  "settings.icr.model": ["crawford-kulak", "elastic-plastic"],
  "settings.pageSize": ["A4", "Letter"],
  "settings.contactEdge.edge": ["xMin", "xMax", "yMin", "yMax"],
};
const NOT_NULL = new Set(["area", "ks", "ka"]);
const PLATE_NULLABLE = new Set(["thickness", "bearingAllowable", "bearingLoadAllowable", "shearOutAllowable", "minEdgeRatio", "flangeStrength"]);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/* Fill `value` from `template`, recording defaulted and invalid fields. */
function conform(value, template, path, ctx, { nullable = () => true } = {}) {
  if (isObj(template)) {
    if (!isObj(value)) {
      ctx.errors.push(`${path} must be an object.`);
      return clone(template);
    }
    const out = {};
    for (const [key, t] of Object.entries(template)) {
      const p = `${path}.${key}`;
      if (!(key in value)) {
        ctx.defaulted.push(p);
        out[key] = clone(t);
      } else {
        out[key] = conform(value[key], t, p, ctx, { nullable });
      }
    }
    for (const key of Object.keys(value)) if (!(key in template)) ctx.ignored.push(`${path}.${key}`);
    return out;
  }
  if (typeof template === "number" || template === null) {
    if (isNum(value) || (value === null && nullable(path))) return value;
    if (ctx.lenient && (value === null || typeof value === "string")) return value;
    ctx.errors.push(`${path} must be a number${nullable(path) ? " or null" : ""} (found ${JSON.stringify(value)}).`);
    return template;
  }
  if (typeof template === "boolean") {
    if (typeof value === "boolean") return value;
    ctx.errors.push(`${path} must be true or false.`);
    return template;
  }
  if (typeof value !== "string") {
    ctx.errors.push(`${path} must be text.`);
    return template;
  }
  const allowed = ENUMS[path.replace(/^pattern\./, "")];
  if (allowed && !allowed.includes(value)) ctx.errors.push(`${path} must be one of ${allowed.join(", ")} (found “${value}”).`);
  return value;
}

/* Sparse overrides: only keys the defaults know, same shapes. */
function conformOverrides(value, template, path, ctx) {
  if (!isObj(value)) {
    ctx.errors.push(`${path} must be an object.`);
    return {};
  }
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    const p = `${path}.${key}`;
    if (!(key in template)) {
      ctx.ignored.push(p);
    } else if (isObj(template[key])) {
      out[key] = conformOverrides(v, template[key], p, ctx);
    } else {
      out[key] = conform(v, template[key], p, ctx, { nullable: () => !NOT_NULL.has(key) });
    }
  }
  return out;
}

/* Validate and normalise a parsed object. Returns { pattern, issues, errors }.
 * `lenient` restores the app's own saved state (working copy, library): blank,
 * text and out-of-range values are kept as entered so the page flags them,
 * instead of rejecting the whole pattern. */
export function normalizePattern(raw, { lenient = false } = {}) {
  const fail = (...messages) => ({ pattern: null, errors: messages, issues: [issue("E-013", messages.join(" "))] });
  if (!isObj(raw)) return fail("The file does not hold a pattern object.");
  let version = raw.schemaVersion;
  if (!Number.isInteger(version) || version < 1) return fail(`schemaVersion must be a whole number ≥ 1 (found ${JSON.stringify(version)}).`);
  if (version > SCHEMA_VERSION) {
    return fail(`schemaVersion ${version} is newer than this tool supports (${SCHEMA_VERSION}); it was not loaded. Use a newer version of the tool.`);
  }
  const notes = [];
  let data = raw;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return fail(`schemaVersion ${version} has no migration to ${SCHEMA_VERSION}.`);
    data = step(data);
    notes.push(issue("N-003", `Migrated from schemaVersion ${version} to ${version + 1}.`));
    version += 1;
  }

  const ctx = { errors: [], defaulted: [], ignored: [], lenient };
  if (!UNIT_SYSTEMS.includes(data.unitSystem)) {
    ctx.errors.push(`unitSystem must be ${UNIT_SYSTEMS.join(" or ")} (found ${JSON.stringify(data.unitSystem)}); values are never converted or guessed on import.`);
  }
  const unitSystem = UNIT_SYSTEMS.includes(data.unitSystem) ? data.unitSystem : "N-mm";
  // App defaults are in N-mm; express them in the file's system before filling gaps.
  const inUnits = (p) => convertPattern({ unitSystem: "N-mm", ...p }, unitSystem);
  const base = inUnits({ defaults: defaultProperties(), plates: [defaultPlate("P1")], load: defaultLoad(), fasteners: [] });

  let name = data.name;
  if (typeof name !== "string" || !name.trim()) {
    if (name !== undefined && typeof name !== "string") ctx.errors.push("name must be text.");
    else ctx.defaulted.push("name");
    name = "Untitled pattern";
  }
  const settings = "settings" in data ? conform(data.settings, defaultSettings(), "settings", ctx, { nullable: () => false }) : (ctx.defaulted.push("settings"), defaultSettings());
  if (!lenient && isNum(settings.precision) && !(Number.isInteger(settings.precision) && settings.precision >= 1 && settings.precision <= 15)) {
    ctx.errors.push("settings.precision must be a whole number from 1 to 15.");
  }
  const defaults = "defaults" in data
    ? conform(data.defaults, base.defaults, "defaults", ctx, { nullable: (p) => !NOT_NULL.has(p.split(".").pop()) })
    : (ctx.defaulted.push("defaults"), base.defaults);

  const fasteners = [];
  if (!Array.isArray(data.fasteners)) {
    ctx.errors.push("fasteners must be a list.");
  } else {
    const seen = new Set();
    data.fasteners.forEach((f, i) => {
      const at = `fasteners[${i}]`;
      if (!isObj(f)) return ctx.errors.push(`${at} must be an object.`);
      const id = f.id;
      if (typeof id !== "string" || !id) ctx.errors.push(`${at}.id must be non-empty text.`);
      else if (seen.has(id)) ctx.errors.push(`${at}.id “${id}” is used twice.`);
      seen.add(id);
      const label = f.label === undefined ? (ctx.defaulted.push(`${at}.label`), "") : f.label;
      if (typeof label !== "string") ctx.errors.push(`${at}.label must be text.`);
      for (const axis of ["x", "y"]) if (!isNum(f[axis]) && !(lenient && (f[axis] === null || typeof f[axis] === "string"))) ctx.errors.push(`${at}.${axis} (${id}) must be a number (found ${JSON.stringify(f[axis])}).`);
      const overrides = f.overrides === undefined ? {} : conformOverrides(f.overrides, base.defaults, `${at}.overrides`, ctx);
      for (const key of Object.keys(f)) if (!["id", "label", "x", "y", "overrides"].includes(key)) ctx.ignored.push(`${at}.${key}`);
      fasteners.push({ id, label, x: f.x, y: f.y, overrides });
    });
  }

  let plates;
  if (!("plates" in data)) {
    ctx.defaulted.push("plates");
    plates = base.plates;
  } else if (!Array.isArray(data.plates)) {
    ctx.errors.push("plates must be a list.");
    plates = [];
  } else {
    if (data.plates.length > MAX_PLATES) ctx.errors.push(`At most ${MAX_PLATES} plates are supported (found ${data.plates.length}).`);
    const seen = new Set();
    plates = data.plates.map((p, i) => {
      const plate = conform(p, { ...base.plates[0], id: `P${i + 1}` }, `plates[${i}]`, ctx, { nullable: (path) => PLATE_NULLABLE.has(path.split(".").pop()) });
      if (seen.has(plate.id)) ctx.errors.push(`plates[${i}].id “${plate.id}” is used twice.`);
      seen.add(plate.id);
      return plate;
    });
  }

  const load = "load" in data ? conform(data.load, base.load, "load", ctx, { nullable: () => false }) : (ctx.defaulted.push("load"), base.load);

  if (ctx.errors.length) {
    return { pattern: null, errors: ctx.errors, issues: [issue("E-013", `The file has ${ctx.errors.length} problem${ctx.errors.length > 1 ? "s" : ""}: ${ctx.errors.join(" ")}`)] };
  }
  const issues = [...notes];
  if (ctx.defaulted.length || ctx.ignored.length) {
    const parts = [];
    if (ctx.defaulted.length) parts.push(`defaulted: ${ctx.defaulted.join(", ")}`);
    if (ctx.ignored.length) parts.push(`ignored unknown fields: ${ctx.ignored.join(", ")}`);
    issues.push(issue("W-018", parts.join("; ") + "."));
  }
  const pattern = { schemaVersion: SCHEMA_VERSION, name, unitSystem, settings, defaults, fasteners, plates, load };
  if (Number.isInteger(data.nextId)) pattern.nextId = data.nextId;
  return { pattern, issues, errors: [] };
}

/* ---- JSON ---- */

/* Canonical key order, full precision. */
export function toJSON(pattern) {
  const { schemaVersion, name, unitSystem, settings, defaults, fasteners, plates, load, nextId } = pattern;
  const out = { schemaVersion, name, unitSystem, settings, defaults, fasteners, plates, load };
  if (nextId !== undefined) out.nextId = nextId;
  return JSON.stringify(out, null, 2) + "\n";
}

export function parseJSON(text, options) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { pattern: null, errors: [`Not valid JSON: ${e.message}`], issues: [issue("E-013", `Not valid JSON: ${e.message}`)] };
  }
  return normalizePattern(raw, options);
}

/* ---- Markdown ---- */

/* FNV-1a, 32 bit: detects a hand-edited JSON block. */
export function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const cell = (v) => (v === null || v === undefined ? "" : String(v).replace(/\|/g, "\\|").replace(/\n/g, " "));
const row = (cells) => `| ${cells.map(cell).join(" | ")} |`;
export function mdTable(head, rows) {
  return [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");
}

export const PRELIMINARY = "Preliminary sizing — verify against the governing specification.";

/* `result` (optional) adds result tables; they are ignored on import. */
export function toMarkdown(pattern, result = null, { version = "", date = "", verification = null, traceId = null } = {}) {
  const u = (kind) => unitLabel(pattern.unitSystem, kind);
  const json = toJSON(pattern);
  const lines = [
    `# Fastener pattern: ${pattern.name}`,
    "",
    `*${PRELIMINARY}*`,
    "",
    `- Unit system: \`${pattern.unitSystem}\``,
    `- Axes: right-handed, x right, y up, z toward the viewer; faying surface z = 0; positive Fz is tension; positive Mz is counter-clockwise viewed from +z.`,
  ];
  if (version) lines.push(`- Tool: Fastener Pattern CG Tracker ${version}`);
  if (date) lines.push(`- Exported: ${date}`);
  const resolved = pattern.fasteners.map((f) => resolveFastener(pattern, f));
  lines.push("", "## Fasteners", "",
    mdTable(["id", "label", `x (${u("length")})`, `y (${u("length")})`, `area (${u("area")})`, "ks", "ka", `diameter (${u("length")})`, `Fs (${u("force")})`, `Ft (${u("force")})`],
      resolved.map((f) => [f.id, f.label, f.x, f.y, f.area, f.ks, f.ka, f.diameter, f.shearAllowable, f.tensionAllowable])),
    "", "## Plates", "",
    mdTable(["id", `thickness (${u("length")})`, `xMin (${u("length")})`, `xMax (${u("length")})`, `yMin (${u("length")})`, `yMax (${u("length")})`,
      `Fbr (${u("stress")})`, `bearing direct (${u("force")})`, `Fsu (${u("stress")})`, "min e/D", `Fp (${u("stress")})`],
      pattern.plates.map((p) => [p.id, p.thickness, p.xMin, p.xMax, p.yMin, p.yMax, p.bearingAllowable, p.bearingLoadAllowable, p.shearOutAllowable, p.minEdgeRatio, p.flangeStrength])),
    "", "## Load", "",
    mdTable(["quantity", "value", "unit"], [
      ["appliedPlate", pattern.load.appliedPlate, ""],
      ["point.x", pattern.load.point.x, u("length")], ["point.y", pattern.load.point.y, u("length")], ["point.z", pattern.load.point.z, u("length")],
      ["Fx", pattern.load.Fx, u("force")], ["Fy", pattern.load.Fy, u("force")], ["Fz", pattern.load.Fz, u("force")],
      ["Mx", pattern.load.Mx, u("moment")], ["My", pattern.load.My, u("moment")], ["Mz", pattern.load.Mz, u("moment")],
    ]));
  if (result) lines.push("", ...resultSections(pattern, result), ...traceSection(pattern, result, traceId));
  if (result) lines.push("", "## Assumptions", "", ...ASSUMPTIONS.map((a) => `- ${a}`));
  if (result) {
    lines.push("", "## Verification", "", verification
      ? `Verification set ${verification.set}: ${verification.passed} pass, ${verification.failed} fail; closed-form tolerance ${verification.tol} relative (or the stated ± where the specification rounds).${version ? ` Tool ${version}.` : ""}`
      : "Verification not run for this export.");
    if (verification) lines.push("", verification.scope, "", ...verification.references.map((r, i) => `${i + 1}. ${r}`));
    lines.push("", `*${PRELIMINARY}*`);
  }
  lines.push("", "## Exact inputs", "",
    "Import reads this block. Editing it by hand makes import fall back to the tables above, and settings and defaults then revert.", "",
    `<!-- fastener-cg-json checksum=${checksum(json)} -->`, "```json", json.trimEnd(), "```", "");
  return lines.join("\n");
}

function resultSections(pattern, result) {
  const u = (kind) => unitLabel(pattern.unitSystem, kind);
  if (!result.ok) {
    return ["## Results", "", "Not computed: the pattern has errors.", "", ...issueTable(result.issues)];
  }
  const { props: p, reduced: r } = result;
  return [
    "## Centroids", "",
    mdTable(["centroid", `x (${u("length")})`, `y (${u("length")})`, "weight", "used for", "coincident with"],
      p.centroids.map((c) => [`${c.name} ${c.key}`, c.x, c.y, c.weight, c.usedFor, c.coincidentWith.join(", ") || "—"])),
    "", "## Section properties", "",
    mdTable(["property", "value", "unit"], [
      ["J (about Cs)", p.J, u("section")], ["Ixx (about Ca)", p.Ixx, u("section")], ["Iyy (about Ca)", p.Iyy, u("section")],
      ["Ixy (about Ca)", p.Ixy, u("section")], ["I1", p.principal.I1, u("section")], ["I2", p.principal.I2, u("section")],
      ["θp (CCW from +x to I1 axis)", p.principal.thetaDeg, "°"], ["Σks", p.Ks, ""], ["Σka", p.Ka, ""],
    ]),
    "", "## Reduced load", "",
    mdTable(["quantity", "value", "unit", "reduced to"], [
      ["Fx", r.Fx, u("force"), ""], ["Fy", r.Fy, u("force"), ""], ["Fz", r.Fz, u("force"), ""],
      ["Mz,s", r.shear.Mz, u("moment"), `Cs (${r.shear.Q.x}, ${r.shear.Q.y}, 0)`],
      ["Mx,a", r.axial.Mx, u("moment"), `Ca (${r.axial.Q.x}, ${r.axial.Q.y}, 0)`],
      ["My,a", r.axial.My, u("moment"), `Ca (${r.axial.Q.x}, ${r.axial.Q.y}, 0)`],
    ]),
    "", "## Axial method", "",
    result.axial.mode === "contact-edge"
      ? `Method (b), contact edge: ${result.axial.edge} of ${result.axial.plateId} is the neutral axis; M_L = ${result.axial.ML} about it (reduced to (${result.axial.Q.x}, ${result.axial.Q.y}, 0)); Σka·d² = ${result.axial.S}; contact reaction C = ${result.axial.C}.`
      : `Method (a), centroid neutral axis (${result.axial.mode}).`,
    "", "## Fastener loads (elastic)", "",
    mdTable(["id", `Rdx (${u("force")})`, `Rdy (${u("force")})`, `Rtx (${u("force")})`, `Rty (${u("force")})`, `Rs (${u("force")})`, "direction (°)", `T (${u("force")})`, "state"],
      result.fasteners.map((f) => [f.id, f.shear.Rdx, f.shear.Rdy, f.shear.Rtx, f.shear.Rty, f.shear.Rs, f.shear.angleDeg, f.axial.T, f.axial.unloading ? "unloading" : f.axial.T > 0 ? "tension" : "—"])),
    "", `## Margins of safety (${result.designBasis === "icr" ? "ICR" : "elastic"} basis, a = ${result.interaction.a}, b = ${result.interaction.b})`, "",
    result.critical
      ? `Critical fastener: **${result.critical.id}**, governing MS = ${result.critical.ms} (${result.critical.label}).`
      : noMarginSummary(result.fasteners.map((f) => f.checks)).text,
    "",
    `IF(1) is the interaction value at the applied load; MS = k* − 1 where IF(k*) = 1 (exact load scale factor). Rt is the bolt tension (external tension plus prying, through preload when enabled); unloading counts as zero external tension${result.tensionSettings.preload ? ", so the bolt load is P_max" : ""}.`,
    "",
    mdTable(["id", `Rs (${u("force")})`, `Rt (${u("force")})`, `Fs (${u("force")})`, `Ft (${u("force")})`, "IF(1)", "k*", "MS interaction", "governing MS", "governing mode"],
      result.fasteners.map((f) => {
        const m = f.checks.modes.find((x) => x.mode === "interaction");
        const g = f.checks.governing;
        return [f.id, m.Rs, m.Rt, m.Fs ?? "", m.Ft ?? "", m.status === "not-evaluated" ? "" : m.IF1, m.status === "ok" ? m.kStar : "", marginText(m), g ? (Number.isFinite(g.ms) ? g.ms : "∞") : "not evaluated", g ? g.label : ""];
      })),
    ...tensionSection(result, u),
    ...plateSection(result, u),
    ...icrSection(result, u),
    "", "## Equilibrium closure", "",
    mdTable(["check", "residual", "relative", "pass"], result.closure.checks.map((c) => [c.name, c.residual, c.relative, c.pass ? "yes" : "no"])),
    "", ...issueTable(result.issues),
  ];
}

function icrSection(result, u) {
  const ic = result.icr;
  if (!ic) return [];
  if (ic.status !== "converged") {
    return ["", "## ICR method", "", `ICR not converged (W-014): ${ic.reason}${ic.residual !== null && ic.residual !== undefined ? `, residual ${ic.residual}` : ""}. No ICR numbers are reported; the elastic result remains.`];
  }
  if (ic.mode === "no-shear") {
    return ["", "## ICR method", "", `${ic.modelLabel}; no in-plane load (Fx = Fy = Mz,s = 0), so every ICR shear is zero. Checks use the ${result.designBasis} basis.`];
  }
  const where = ic.mode === "translation" ? "at infinity (uniform translation)" : `at (${ic.icr.x}, ${ic.icr.y})${ic.offLine ? ", off the search line (asymmetric group)" : ""}`;
  const lines = ["", "## ICR method", "",
    `${ic.modelLabel}; ICR ${where}. γ_ult = ${ic.gamma}; ICR margin γ_ult − 1 = ${ic.margin} (ultimate capacity, not comparable to allowable-based MS). Governing fastener ${ic.governing}. Reactions at the applied load are the ultimate reactions ÷ γ_ult (proportional scaling convention). Checks use the ${result.designBasis} basis.`,
    "", mdTable(["id", `rho (${u("length")})`, `delta (${u("length")})`, `R ultimate (${u("force")})`, `Rs at load, ICR (${u("force")})`, `Rs, elastic (${u("force")})`],
      result.fasteners.map((f) => [f.id, Number.isFinite(f.icr.ultimate.rho) ? f.icr.ultimate.rho : "inf", f.icr.ultimate.delta, f.icr.ultimate.R, f.icr.atLoad.Rs, f.shear.Rs]))];
  if (result.comparison) {
    const c = result.comparison;
    lines.push("", `Critical-fastener load: elastic ${c.elasticCritical.id} ${c.elasticCritical.Rs} vs ICR ${c.icrCritical.id} ${c.icrCritical.Rs}${c.change === null ? "" : ` (change ${c.change})`}.`);
  }
  return lines;
}

function plateSection(result, u) {
  const ids = [...new Set(result.fasteners.flatMap((f) => f.checks.modes.filter((m) => m.plate).map((m) => m.plate)))];
  if (!ids.length) return [];
  return ["", "## Bearing and tear-out (per plate)", "",
    "The loaded plate bears on the −R side of each hole and the other plate on +R; the tear-out ray follows that direction to the plate edge.", "",
    mdTable(["id", "plate", `bearing capacity (${u("force")})`, "MS bearing", `e (${u("length")})`, "e/D", `tear-out capacity (${u("force")})`, "MS tear-out"],
      result.fasteners.flatMap((f) => ids.map((pid) => {
        const b = f.checks.modes.find((m) => m.mode === "bearing" && m.plate === pid);
        const t = f.checks.modes.find((m) => m.mode === "tearout" && m.plate === pid);
        return [f.id, pid, b.capacity ?? "", marginText(b), t.e ?? "", t.eOverD ?? "", t.capacity ?? "", marginText(t)];
      })))];
}

function tensionSection(result, u) {
  const ts = result.tensionSettings;
  if (!ts || !(ts.prying || ts.preload)) return [];
  const head = ["id", `T external (${u("force")})`];
  if (ts.prying) head.push("prying", "alpha'", `Q (${u("force")})`);
  if (ts.preload) head.push(`P_max + phi*T (${u("force")})`, `clamp force (${u("force")})`, `separation load (${u("force")})`);
  head.push(`bolt load F_b (${u("force")})`, "joint");
  return ["", `## Bolt tension (${[ts.prying ? `prying, flange ${ts.flangePlate}` : "", ts.preload ? "preload" : ""].filter(Boolean).join("; ")})`, "",
    mdTable(head, result.fasteners.map((f) => {
      const t = f.checks.tension;
      const row = [f.id, t.Text];
      if (ts.prying) row.push(t.prying.method, t.prying.method === "t-stub" && t.prying.alphaRaw !== null ? t.prying.alpha : "", t.Q);
      if (ts.preload) row.push(t.preload.shared, t.preload.clamp, t.preload.separationLoad);
      row.push(t.Fb, f.checks.clamp.status);
      return row;
    }))];
}

/* Calculation trace for one fastener (the governing one by default), as tables. */
function traceSection(pattern, result, traceId) {
  if (!result.ok) return [];
  const tr = buildTrace(pattern, result, traceId || traceFastenerId(result), (v) => String(Number(v.toPrecision(10))));
  if (!tr) return [];
  const out = ["", `## Calculation trace: ${tr.id}${tr.governing ? " (governing fastener)" : ""}`];
  for (const s of tr.sections) {
    out.push("", `### ${s.title}`, "", mdTable(["step", "formula", "substituted", "value", "unit"],
      s.lines.map((l) => [l.label, l.formula, l.substituted, l.value === null || l.value === undefined ? "" : l.value, l.unit])));
  }
  return out;
}

function issueTable(issues) {
  return ["## Warnings", "", issues.length
    ? mdTable(["id", "tier", "condition", "detail", "fastener or field"], issues.map((i) => [i.id, i.tier, i.title, i.detail, i.fastener || i.field || ""]))
    : "None."];
}

/* Split a Markdown table under `## heading` into rows of cells. */
function readTable(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start < 0) return null;
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith("## ")) break;
    if (!l.startsWith("|")) {
      if (rows.length) break;
      continue;
    }
    const cells = l.replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  if (!rows.length) return null;
  const [head, ...body] = rows;
  return body.map((cells) => Object.fromEntries(head.map((h, i) => [h.replace(/\s*\(.*\)$/, ""), cells[i] ?? ""])));
}

const num = (s) => (s === "" || s === undefined ? null : Number(s));

/* Rebuild a pattern from the fastener, plate and load tables only. */
function fromTables(text) {
  const unit = /Unit system:\s*`?([A-Za-z-]+)`?/.exec(text)?.[1];
  const name = /^# Fastener pattern:\s*(.+)$/m.exec(text)?.[1]?.trim();
  const fastenerRows = readTable(text, "Fasteners");
  const plateRows = readTable(text, "Plates");
  const loadRows = readTable(text, "Load");
  const errors = [];
  if (!unit) errors.push("No “Unit system” line; units are never guessed.");
  if (!fastenerRows) errors.push("No “## Fasteners” table.");
  if (!loadRows) errors.push("No “## Load” table.");
  if (errors.length) return { raw: null, errors };
  const appDefaults = convertPattern({ unitSystem: "N-mm", defaults: defaultProperties(), fasteners: [], plates: [], load: defaultLoad() }, UNIT_SYSTEMS.includes(unit) ? unit : "N-mm").defaults;
  const fasteners = fastenerRows.map((r) => {
    const overrides = {};
    const columns = { area: "area", ks: "ks", ka: "ka", diameter: "diameter", shearAllowable: "Fs", tensionAllowable: "Ft" };
    for (const [key, column] of Object.entries(columns)) {
      if (!(column in r)) continue;
      r[key] = r[column];
      const v = num(r[key]);
      if (r[key] !== undefined && r[key] !== "" && v !== appDefaults[key]) overrides[key] = Number.isFinite(v) ? v : r[key];
    }
    return { id: r.id, label: r.label || "", x: num(r.x), y: num(r.y), overrides };
  });
  const optional = { bearingAllowable: "Fbr", bearingLoadAllowable: "bearing direct", shearOutAllowable: "Fsu", minEdgeRatio: "min e/D", flangeStrength: "Fp" };
  const plates = (plateRows || []).map((r) => {
    const plate = { id: r.id, thickness: num(r.thickness), xMin: num(r.xMin), xMax: num(r.xMax), yMin: num(r.yMin), yMax: num(r.yMax) };
    for (const [key, column] of Object.entries(optional)) if (column in r) plate[key] = num(r[column]);
    return plate;
  });
  const load = { point: {} };
  for (const r of loadRows) {
    const key = r.quantity;
    if (key === "appliedPlate") load.appliedPlate = r.value;
    else if (key?.startsWith("point.")) load.point[key.slice(6)] = num(r.value);
    else if (key) load[key] = num(r.value);
  }
  return { raw: { schemaVersion: SCHEMA_VERSION, name, unitSystem: unit, fasteners, plates, load }, errors: [] };
}

export function parseMarkdown(text) {
  text = text.replace(/\r\n?/g, "\n");
  const block = /<!--\s*fastener-cg-json checksum=([0-9a-f]{8})\s*-->\s*```json\s*\n([\s\S]*?)\n```/.exec(text)
    || /```json\s*\n([\s\S]*?)\n```/.exec(text);
  let reason = "no JSON block";
  if (block) {
    const body = block.length === 3 ? block[2] : block[1];
    const sum = block.length === 3 ? block[1] : null;
    if (sum && checksum(body + "\n") === sum) {
      const parsed = parseJSON(body);
      if (parsed.pattern || !parsed.errors.some((e) => e.startsWith("Not valid JSON"))) return { ...parsed, source: "json" };
      reason = "the JSON block does not parse";
    } else {
      reason = sum ? "the JSON block was edited (checksum mismatch)" : "the JSON block has no checksum";
    }
  }
  const tables = fromTables(text);
  if (!tables.raw) {
    return { pattern: null, errors: tables.errors, issues: [issue("E-013", `Markdown import: ${reason}, and the tables could not be read: ${tables.errors.join(" ")}`)], source: "tables" };
  }
  const parsed = normalizePattern(tables.raw);
  if (!parsed.pattern) return { ...parsed, source: "tables" };
  const lost = issue("W-018", `Markdown import used the tables because ${reason}. Settings and group defaults reverted to app defaults (${Object.keys(defaultSettings()).join(", ")}; ${Object.keys(defaultProperties()).join(", ")}); only area, ks, ka, diameter, Fs and Ft were read per fastener; result tables were ignored.`);
  return { ...parsed, issues: [lost, ...parsed.issues.filter((i) => i.id !== "W-018")], source: "tables" };
}

/* Detect the format from the name and content. */
export function parsePatternFile(text, filename = "") {
  if (/\.json$/i.test(filename) || /^\s*\{/.test(text)) return { ...parseJSON(text), source: "json" };
  return parseMarkdown(text);
}
