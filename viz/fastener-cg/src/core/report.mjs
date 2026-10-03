/* Full report (spec section 9) for browser print / Save as PDF.
 *
 * Carries the tool version, the verification set and tolerance, the full
 * warnings list and the "Preliminary sizing" line, and lays out: pattern
 * name and date, units and sign convention, the diagram (inline SVG from
 * the shared scene model), inputs, reduced load, the three centroids, J,
 * Ixx, Iyy, Ixy, the per-fastener table, elastic vs ICR, margins per mode,
 * the calculation trace, warnings and assumptions. Each section is a
 * <section class="r-sec"> that the print stylesheet keeps on one page.
 */

import { unitLabel } from "./units.mjs";
import { resolveFastener } from "./model.mjs";
import { fmt } from "./format.mjs";
import { buildScene } from "./scene.mjs";
import { paintSvg } from "./svgpaint.mjs";
import { buildTrace, traceFastenerId } from "./trace.mjs";
import { marginText } from "./checks.mjs";
import { PRELIMINARY } from "./persist.mjs";
import { TOOL_NAME, TOOL_VERSION, CONVENTIONS, ASSUMPTIONS } from "./meta.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function table(head, rows, numeric = []) {
  return `<table><thead><tr>${head.map((h, i) => `<th${numeric.includes(i) ? ' class="num"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
const section = (id, title, body) => `<section class="r-sec" data-section="${id}"><h2>${esc(title)}</h2>${body}</section>`;

export const SIGN_CONVENTION_SVG = `<svg width="112" height="104" viewBox="0 0 112 104" role="img" aria-label="Right-handed axes: x right, y up, z toward the viewer; positive Mz counter-clockwise"><defs><marker id="rah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1d1d1f"/></marker></defs><g stroke="#1d1d1f" fill="none" stroke-width="1.6"><line x1="30" y1="74" x2="96" y2="74" marker-end="url(#rah)"/><line x1="30" y1="74" x2="30" y2="10" marker-end="url(#rah)"/><circle cx="30" cy="74" r="6"/><path d="M58 44 A16 16 0 1 1 74 60" marker-end="url(#rah)" stroke="#8e44ad"/></g><circle cx="30" cy="74" r="1.8" fill="#1d1d1f"/><g font-family="monospace" font-size="11" fill="#1d1d1f"><text x="98" y="92" text-anchor="end">x</text><text x="38" y="14">y</text><text x="8" y="94">z</text><text x="76" y="30" fill="#8e44ad">+Mz</text></g></svg>`;

/*
 * opts: { date, precision, verification (runVerification() summary), traceId, diagram: { width, height } }.
 * Returns the report body HTML (no <html> wrapper).
 */
export function reportHtml(pattern, result, opts = {}) {
  const p = opts.precision ?? pattern.settings?.precision ?? 4;
  const f = (v, scale = 0) => fmt(v, p, scale);
  const u = (k) => unitLabel(pattern.unitSystem, k);
  const L = u("length"), F = u("force"), M = u("moment"), S = u("section");
  const v = opts.verification;
  const verifyLine = v
    ? `Verification set ${esc(v.set)}: ${v.passed} pass, ${v.failed} fail; closed-form tolerance ${v.tol} relative (or the stated ± where the specification rounds).`
    : "Verification not run.";
  const out = [];
  out.push(`<header class="r-head"><p class="r-eyebrow">${esc(TOOL_NAME)} · ${esc(TOOL_VERSION)}</p><h1>${esc(pattern.name)}</h1>
    <p>${esc(opts.date || "")} · unit system ${esc(pattern.unitSystem)} (${L}, ${F}, ${M})</p>
    <p class="r-prelim"><b>${esc(PRELIMINARY)}</b></p></header>`);

  out.push(section("conventions", "Units and sign convention", `<div class="r-conv">${SIGN_CONVENTION_SVG}<ul>${CONVENTIONS.map((c) => `<li>${esc(c)}</li>`).join("")}<li>Lengths ${L}, forces ${F}, moments ${M}, stresses ${u("stress")}, section properties ${S} (× weight).</li></ul></div>`));

  const dia = opts.diagram || { width: 680, height: 420 };
  const scene = buildScene(pattern, result, { width: dia.width, height: dia.height });
  out.push(section("diagram", "Pattern diagram", `<div class="r-diagram">${paintSvg(scene)}</div>`));

  const resolved = pattern.fasteners.map((q) => resolveFastener(pattern, q));
  const ov = (q, k) => (q.overrides && k in q.overrides ? " *" : "");
  out.push(section("inputs", "Inputs", `
    <h3>Fasteners (* = per-fastener override)</h3>
    ${table(["id", "label", `x (${L})`, `y (${L})`, `A (${u("area")})`, "ks", "ka", `D (${L})`, `Fs (${F})`, `Ft (${F})`],
      resolved.map((q, i) => { const o = pattern.fasteners[i]; return [esc(q.id), esc(q.label), f(q.x), f(q.y), f(q.area) + ov(o, "area"), f(q.ks) + ov(o, "ks"), f(q.ka) + ov(o, "ka"), f(q.diameter) + ov(o, "diameter"), f(q.shearAllowable) + ov(o, "shearAllowable"), f(q.tensionAllowable) + ov(o, "tensionAllowable")]; }),
      [2, 3, 4, 5, 6, 7, 8, 9])}
    <h3>Plates</h3>
    ${pattern.plates.length ? table(["id", `t (${L})`, `x (${L})`, `y (${L})`, `Fbr (${u("stress")})`, `bearing direct (${F})`, `Fsu (${u("stress")})`, "min e/D", `Fp (${u("stress")})`],
      pattern.plates.map((pl) => [esc(pl.id) + (pl.id === pattern.load.appliedPlate ? " (loaded)" : ""), f(pl.thickness), `${f(pl.xMin)} to ${f(pl.xMax)}`, `${f(pl.yMin)} to ${f(pl.yMax)}`, f(pl.bearingAllowable), f(pl.bearingLoadAllowable), f(pl.shearOutAllowable), f(pl.minEdgeRatio), f(pl.flangeStrength)]), [1, 4, 5, 6, 7, 8]) : "<p>No plates.</p>"}
    <h3>Load and settings</h3>
    ${table(["item", "value"], [
      ["Load point P", `(${f(pattern.load.point.x)}, ${f(pattern.load.point.y)}, ${f(pattern.load.point.z)}) ${L}`],
      ["Forces", `Fx ${f(pattern.load.Fx)}, Fy ${f(pattern.load.Fy)}, Fz ${f(pattern.load.Fz)} ${F}`],
      ["Moments", `Mx ${f(pattern.load.Mx)}, My ${f(pattern.load.My)}, Mz ${f(pattern.load.Mz)} ${M}`],
      ["Axial method", pattern.settings.axialMethod === "contact-edge" ? `(b) contact edge: ${esc(pattern.settings.contactEdge?.plateId)} ${esc(pattern.settings.contactEdge?.edge)}` : "(a) centroid neutral axis"],
      ["Design basis", esc(pattern.settings.designBasis || "elastic")],
      ["Interaction exponents", `a = ${f(pattern.settings.interaction.a)}, b = ${f(pattern.settings.interaction.b)}`],
      ["Prying", pattern.settings.prying?.enabled ? "on" : "off"], ["Preload", pattern.settings.preload?.enabled ? "on" : "off"],
      ["ICR", pattern.settings.icr?.enabled ? `on (${esc(pattern.settings.icr.model)})` : "off"],
    ])}`));

  if (!result || !result.ok) {
    out.push(section("results", "Results", "<p>No results: the pattern has errors (listed under Warnings).</p>"));
  } else {
    const pr = result.props, red = result.reduced;
    out.push(section("reduced", "Reduced load", table(["component", "value", "unit", "reduced to"], [
      ["Fx", f(red.Fx), F, ""], ["Fy", f(red.Fy), F, ""], ["Fz", f(red.Fz), F, ""],
      ["Mz,s", f(red.shear.Mz), M, `Cs (${f(red.shear.Q.x)}, ${f(red.shear.Q.y)}, 0)`],
      ["Mx,a", f(red.axial.Mx), M, `Ca (${f(red.axial.Q.x)}, ${f(red.axial.Q.y)}, 0)`],
      ["My,a", f(red.axial.My), M, `Ca (${f(red.axial.Q.x)}, ${f(red.axial.Q.y)}, 0)`],
    ], [1])));
    out.push(section("properties", "Centroids and section properties", `
      ${table(["centroid", `x (${L})`, `y (${L})`, "weight", "used for", ""], pr.centroids.map((c) => [`${esc(c.name)} ${c.key}`, f(c.x, pr.extent), f(c.y, pr.extent), c.weight, esc(c.usedFor), c.coincidentWith.length ? `coincident with ${c.coincidentWith.join(", ")}` : ""]), [1, 2])}
      ${table(["property", "value", "unit"], [["J (about Cs)", f(pr.J), S], ["Ixx (about Ca)", f(pr.Ixx), S], ["Iyy (about Ca)", f(pr.Iyy), S], ["Ixy (about Ca)", f(pr.Ixy), S],
        ["I₁", f(pr.principal.I1), S], ["I₂", f(pr.principal.I2), S], ["θp (CCW from +x to the I₁ axis)", f(pr.principal.thetaDeg, 360), "°"]], [1])}`));
    const scale = Math.max(...result.fasteners.map((q) => Math.max(q.shear.Rs, Math.abs(q.axial.T))), 1);
    out.push(section("fasteners", "Per-fastener loads", table(
      ["id", `Rd, direct (${F})`, `Rtors, torsional (${F})`, `Rs (${F})`, `T (${F})`, `Q (${F})`, `F_b (${F})`, "joint", "governing MS", "mode"],
      result.fasteners.map((q) => {
        const t = q.checks.tension, g = q.checks.governing;
        return [esc(q.id) + (result.critical?.id === q.id ? " (critical)" : ""), f(Math.hypot(q.shear.Rdx, q.shear.Rdy), scale), f(Math.hypot(q.shear.Rtx, q.shear.Rty), scale), f(q.shear.Rs, scale),
          `${f(q.axial.T, scale)}${q.axial.unloading ? " unloading" : ""}`, f(t.Q, scale), f(t.Fb, scale), esc(q.checks.clamp.status),
          g ? (Number.isFinite(g.ms) ? f(g.ms) : "∞") : "not evaluated", g ? esc(g.label) : ""];
      }), [1, 2, 3, 4, 5, 6, 8])));
    if (result.icr) {
      const ic = result.icr;
      out.push(section("icr", "Elastic vs ICR", ic.status !== "converged"
        ? `<p>ICR not converged (W-014): ${esc(ic.reason)}. No ICR numbers are reported; the elastic result remains.</p>`
        : `<p>${esc(ic.modelLabel)}; ICR ${ic.icr ? `at (${f(ic.icr.x)}, ${f(ic.icr.y)}) ${L}` : "at infinity (translation)"}; γ_ult = ${f(ic.gamma)}; ICR margin γ_ult − 1 = ${f(ic.margin)} (ultimate capacity, not comparable to allowable MS). Reactions at the applied load are the ultimate reactions ÷ γ_ult (proportional scaling convention). Checks use the <b>${esc(result.designBasis)}</b> basis.</p>
          ${table(["id", `elastic Rs (${F})`, `ICR Rs at load (${F})`, "change"], result.comparison.rows.map((r) => [esc(r.id), f(r.elastic), f(r.icr), r.elastic > 0 ? `${f((r.icr / r.elastic - 1) * 100, 100)}%` : "—"]), [1, 2, 3])}
          <p>Critical-fastener load: elastic ${esc(result.comparison.elasticCritical.id)} ${f(result.comparison.elasticCritical.Rs)} ${F} vs ICR ${esc(result.comparison.icrCritical.id)} ${f(result.comparison.icrCritical.Rs)} ${F}.</p>`));
    }
    const modeRows = result.fasteners.flatMap((q) => q.checks.modes.map((m) => [esc(q.id), esc(m.label), m.status === "ok" ? f(m.ms) : esc(marginText(m)), m.mode === "interaction" && m.IF1 !== undefined && m.status !== "not-evaluated" && m.Rs !== null ? f(m.IF1) : ""]));
    out.push(section("margins", `Margins of safety per mode (${result.designBasis} basis)`, `
      <p>${result.critical ? `Critical fastener <b>${esc(result.critical.id)}</b>: governing MS ${f(result.critical.ms)} (${esc(result.critical.label)}).` : "No finite margin: see the per-mode statuses."}
      MS for the interaction is the exact load scale factor k* − 1 with IF(k*) = 1${result.interaction.a !== 1 || result.interaction.b !== 1 ? " (not the 1/IF − 1 convention; W-006)" : ""}. A mode without its allowable is not evaluated.</p>
      ${table(["id", "mode", "MS", "IF(1)"], modeRows, [2, 3])}`));
    const tid = opts.traceId || traceFastenerId(result);
    const tr = buildTrace(pattern, result, tid, (x) => fmt(x, Math.max(p, 6)));
    if (tr) {
      out.push(section("trace", `Calculation trace — ${tr.id}${tr.governing ? " (governing fastener)" : ""}`,
        tr.sections.map((s) => `<h3>${esc(s.title)}</h3>${table(["step", "formula", "substituted", "value", "unit"], s.lines.map((l) => [esc(l.label), esc(l.formula), esc(l.substituted), typeof l.value === "number" ? fmt(l.value, Math.max(p, 6)) : esc(l.value ?? "—"), esc(l.unit)]), [3])}`).join("")));
    }
  }

  const issues = result ? result.issues : [];
  out.push(section("warnings", "Warnings", issues.length
    ? table(["id", "tier", "condition", "detail", "fastener or field"], issues.map((i) => [i.id, i.tier, esc(i.title), esc(i.detail), esc((i.fasteners && i.fasteners.length ? i.fasteners.join(", ") : "") || i.field || "")]))
    : "<p>None.</p>"));
  out.push(section("assumptions", "Assumptions", `<ul>${ASSUMPTIONS.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`));
  const refs = v ? `<p>${esc(v.scope)}</p><ol class="r-refs">${v.references.map((r) => `<li>${esc(r)}</li>`).join("")}</ol>` : "";
  out.push(`<footer class="r-foot"><p>${esc(TOOL_NAME)} ${esc(TOOL_VERSION)} · ${esc(verifyLine)}</p>${refs}<p><b>${esc(PRELIMINARY)}</b></p></footer>`);
  return out.join("\n");
}

