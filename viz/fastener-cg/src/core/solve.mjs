/* One calculation: validate, resolve properties, reduce the load, distribute
 * it, raise the catalogue issues and check equilibrium closure.
 *
 * Returns { ok, issues, ... }. When any error is raised `ok` is false and
 * no result fields are present, so nothing downstream can show numbers the
 * checks have rejected.
 */

import { resolveFastener, validateInputs } from "./model.mjs";
import { sectionProperties } from "./geometry.mjs";
import { reduceLoad } from "./loads.mjs";
import { elasticShear, elasticAxialCentroid } from "./elastic.mjs";
import { issue, hasErrors, sortIssues } from "./warnings.mjs";
import { validateCheckInputs, fastenerChecks } from "./checks.mjs";
import { tensionInputs, validateTensionInputs } from "./tension.mjs";
import { validatePlates, plateModes } from "./plates.mjs";
import { contactEdgeAxial, contactClosureChecks, EDGES } from "./contact.mjs";
import { icrSolve, reactionsAtLoad, validateIcrInputs, MODELS } from "./icr.mjs";

export const EXTENT_WARNING = 1e4;
export const CLOSURE_TOL = 1e-9;
export const ZERO_TOL = 1e-9;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/* Equilibrium closure, per basis: ΣR = F and ΣM = M about the reduction point. */
export function closure(shear, axial, red, props, contact = null) {
  const forceScale = Math.hypot(red.Fx, red.Fy, red.Fz) + sum(shear.map((r) => r.Rs)) + sum(axial.map((t) => Math.abs(t.T)));
  const lever = Math.max(props.extent, 1e-300);
  const momentScale = Math.hypot(red.axial.Mx, red.axial.My, red.shear.Mz) + forceScale * lever;
  const checks = [
    { name: "ΣRx = Fx", residual: sum(shear.map((r) => r.Rx)) - red.Fx, scale: forceScale },
    { name: "ΣRy = Fy", residual: sum(shear.map((r) => r.Ry)) - red.Fy, scale: forceScale },
    { name: "Σ(u·Ry − v·Rx) = Mz,s", residual: sum(shear.map((r) => r.u * r.Ry - r.v * r.Rx)) - red.shear.Mz, scale: momentScale },
    ...(contact
      ? contactClosureChecks(contact, red.Fz).map((c) => ({ name: c.name, residual: c.residual, scale: c.kind === "force" ? forceScale + Math.abs(contact.C) : momentScale + Math.abs(contact.ML) }))
      : [
        { name: "ΣT = Fz", residual: sum(axial.map((t) => t.T)) - red.Fz, scale: forceScale },
        { name: "ΣT·q = Mx,a", residual: sum(axial.map((t) => t.T * t.q)) - red.axial.Mx, scale: momentScale },
        { name: "Σ(−T·p) = My,a", residual: sum(axial.map((t) => -t.T * t.p)) - red.axial.My, scale: momentScale },
      ]),
  ];
  for (const c of checks) {
    c.relative = c.scale > 0 ? Math.abs(c.residual) / c.scale : Math.abs(c.residual);
    c.pass = c.relative <= CLOSURE_TOL;
  }
  return { tol: CLOSURE_TOL, checks, pass: checks.every((c) => c.pass) };
}

/* Elastic vs ICR shear at the applied load, and the change in the critical-fastener load. */
function compare(fasteners) {
  const rows = fasteners.map((f) => ({ id: f.id, elastic: f.shear.Rs, icr: f.icr.atLoad.Rs, diff: f.icr.atLoad.Rs - f.shear.Rs }));
  const pick = (key) => rows.reduce((a, b) => (b[key] > a[key] ? b : a));
  const e = pick("elastic"), i = pick("icr");
  return { rows, elasticCritical: { id: e.id, Rs: e.elastic }, icrCritical: { id: i.id, Rs: i.icr }, change: e.elastic > 0 ? i.icr / e.elastic - 1 : null };
}

export function solve(pattern) {
  const issues = [...validateInputs(pattern), ...validateCheckInputs(pattern)];
  if (hasErrors(issues)) return { ok: false, issues: sortIssues(issues) };

  const settings = pattern.settings || {};
  const fasteners = pattern.fasteners.map((f) => resolveFastener(pattern, f));
  // Prying bends the flange of the loaded plate: its thickness is t and its flange strength Fp.
  const flangePlate = (pattern.plates || []).find((p) => p.id === pattern.load?.appliedPlate) || null;
  issues.push(...validateTensionInputs(pattern, fasteners, flangePlate));
  issues.push(...validatePlates(pattern, fasteners));
  issues.push(...validateIcrInputs(pattern, fasteners));
  const axialMethod = settings.axialMethod || "centroid";
  const edgeSpec = settings.contactEdge || {};
  const edgePlate = (pattern.plates || []).find((p) => p.id === edgeSpec.plateId) || null;
  if (axialMethod === "contact-edge") {
    if (!edgePlate) issues.push(issue("E-002", `Method (b) needs a contact-edge plate; “${edgeSpec.plateId ?? ""}” is not one of the plates.`, { field: "settings.contactEdge.plateId" }));
    if (!(edgeSpec.edge in EDGES)) issues.push(issue("E-002", `Method (b) contact edge must be one of ${Object.keys(EDGES).join(", ")}.`, { field: "settings.contactEdge.edge" }));
  }
  if (hasErrors(issues)) return { ok: false, issues: sortIssues(issues) };
  const props = sectionProperties(fasteners);
  const load = pattern.load;
  const red = reduceLoad(load, props.Cs, props.Ca);

  const n = fasteners.length;
  if (n === 1) issues.push(issue("W-001", "One fastener cannot resist torsion.", { fastener: fasteners[0].id }));
  if (props.extent > EXTENT_WARNING) {
    issues.push(issue("W-004", `The pattern spans ${props.extent.toPrecision(4)} ${pattern.unitSystem === "in-lbf" ? "in" : "mm"}; check the unit system.`));
  }
  const loadZero = ["Fx", "Fy", "Fz", "Mx", "My", "Mz"].every((k) => load[k] === 0);
  if (loadZero) issues.push(issue("W-003", "All six load components are zero."));

  const Fin = Math.hypot(red.Fx, red.Fy);
  if (Fin > 0 && Math.abs(red.shear.Mz) <= ZERO_TOL * Fin * Math.max(props.extent, Math.hypot(red.shear.rx, red.shear.ry), 1)) {
    issues.push(issue("N-001", "Mz,s = 0: in-plane shear is direct only."));
  }
  const differ = props.centroids.filter((c) => c.coincidentWith.length < 2);
  if (differ.length) {
    issues.push(issue("N-002", "Torsion and J use the shear centroid Cs (ks); out-of-plane bending, Ixx, Iyy and Ixy use the axial centroid Ca (ka); the area centroid Cg (A) is a geometric reference only."));
  }

  const shear = elasticShear(fasteners, props, red);
  const contact = axialMethod === "contact-edge" ? contactEdgeAxial(fasteners, edgePlate, edgeSpec.edge, load, props) : null;
  const axial = contact || elasticAxialCentroid(fasteners, props, red);

  if (contact) {
    const scale = Math.abs(contact.ML) + Math.abs(contact.perp) + Math.abs(red.Fz) * Math.max(props.extent, 1) + Math.hypot(red.axial.Mx, red.axial.My);
    const where = `${EDGES[contact.edge].label} of ${contact.plateId}`;
    if (Math.abs(contact.perp) > ZERO_TOL * scale) {
      issues.push(issue("E-012", `The moment about the axis perpendicular to the ${where} is ${contact.perp.toPrecision(4)} (reduced to (${contact.Q.x.toPrecision(4)}, ${contact.Q.y.toPrecision(4)}, 0)); v1 method (b) needs it to be zero. Use method (a), or a contact edge parallel to the bending axis.`, { field: "settings.contactEdge.edge" }));
    }
    if (contact.ML < -ZERO_TOL * scale) {
      issues.push(issue("W-010", `The applied moment about the ${where} is ${contact.ML.toPrecision(4)}: it presses the far side down, so no fastener is in tension. Pick the edge on the compressive side.`, { field: "settings.contactEdge.edge" }));
    }
    if (contact.C < -ZERO_TOL * (Math.abs(red.Fz) + Math.abs(contact.ML) / Math.max(props.extent, 1))) {
      issues.push(issue("W-021", `Contact reaction C = ΣT − Fz = ${contact.C.toPrecision(4)} < 0: the plate lifts off the ${where}. Use method (a).`, { field: "settings.axialMethod" }));
    }
  } else if (axial.mode !== "general") {
    const scale = Math.hypot(red.axial.Mx, red.axial.My) + Math.abs(red.Fz) * props.extent;
    const unresolved = Math.abs(axial.unresolved.moment);
    const where = axial.mode === "collinear"
      ? `about the pattern line (${axial.unresolved.axisDeg.toPrecision(4)}° from +x)`
      : "(all fasteners at one point)";
    if (unresolved > ZERO_TOL * scale) {
      issues.push(issue("E-011", `Bending ${where} is ${unresolved.toPrecision(4)} and cannot be resisted.`, { field: "load" }));
    } else if (n > 1) {
      issues.push(issue("W-002", `All fasteners lie on one line; bending ${where} cannot be resisted (it is zero here).`));
    }
  }

  if (axialMethod === "centroid" && (red.Fz !== 0 || red.axial.Mx !== 0 || red.axial.My !== 0)) {
    issues.push(issue("W-005", "Method (a) keeps the neutral axis at Ca and assumes the plates stay in contact everywhere."));
  }
  const tensionScale = Math.max(...axial.T.map((t) => Math.abs(t.T)), 0);
  const unloading = contact ? [] : axial.T.filter((t) => t.T < -ZERO_TOL * tensionScale);
  for (const t of axial.T) t.unloading = unloading.includes(t);
  if (unloading.length) {
    issues.push(issue("W-016", `Unloading (clamp-up) under method (a): ${unloading.map((t) => t.id).join(", ")}. The contact-edge method (b) is recommended.`, { fasteners: unloading.map((t) => t.id) }));
  }

  if (hasErrors(issues)) return { ok: false, issues: sortIssues(issues) };

  const close = closure(shear, axial.T, red, props, contact);
  if (!close.pass) {
    const failed = close.checks.filter((c) => !c.pass);
    const why = props.J === 0 && red.shear.Mz !== 0 ? ` Torsion Mz,s = ${red.shear.Mz.toPrecision(4)} with J = 0 cannot be resisted.` : "";
    issues.push(issue("E-010", `${failed.map((c) => `${c.name} (residual ${c.residual.toPrecision(3)})`).join("; ")}.${why}`));
    return { ok: false, issues: sortIssues(issues), closure: close };
  }

  const fastenerResults = fasteners.map((f, i) => ({ ...f, shear: shear[i], axial: axial.T[i] }));

  // ICR (in-plane only, ks ignored). The design basis picks which shear feeds the checks.
  const basis = settings.designBasis === "icr" ? "icr" : "elastic";
  let icr = null;
  if (settings.icr?.enabled) {
    const model = settings.icr.model || "crawford-kulak";
    const sol = icrSolve(fasteners, props.Cs, { Fx: red.Fx, Fy: red.Fy, Mz: red.shear.Mz }, model);
    issues.push(issue("N-004", "The ICR method ignores ks: each fastener's load follows its own response curve and distance from the ICR."));
    if (model === "crawford-kulak") issues.push(issue("N-008", "μ, λ and Δmax are editable defaults (metric equivalents of the common structural-bolt curve), not recommendations: confirm them for the fastener."));
    if (sol.status !== "converged") {
      issues.push(issue("W-014", `ICR not converged: ${sol.reason}${sol.residual !== null && sol.residual !== undefined ? ` (residual ${Number(sol.residual).toPrecision(3)})` : ""}. The elastic result remains.`));
      icr = { model, status: sol.status, reason: sol.reason, residual: sol.residual, iterations: sol.iterations };
    } else {
      const atLoad = reactionsAtLoad(sol);
      icr = { model, modelLabel: MODELS[model], ...sol, atLoad, margin: sol.gamma - 1 };
      fastenerResults.forEach((f, i) => { f.icr = { ultimate: sol.loads[i], atLoad: atLoad[i] }; });
    }
    if (basis === "icr") {
      issues.push(issue("W-015", "Checks use the ICR reactions at the applied load: the ultimate reactions divided by γ_ult (proportional scaling convention), not a physical service-load response."));
    }
  }
  // Shear on the selected basis; null means the ICR basis has no converged reactions.
  fastenerResults.forEach((f) => { f.basisShear = basis === "icr" ? (f.icr ? f.icr.atLoad : null) : f.shear; });
  const plates = pattern.plates || [];
  const checks = fastenerChecks(fastenerResults, settings, ZERO_TOL, (f) => tensionInputs(f, settings, flangePlate),
    (f) => plateModes(f, f.shear, plates, pattern.load?.appliedPlate));
  issues.push(...checks.issues);
  fastenerResults.forEach((f, i) => { f.checks = checks.fasteners[i]; });
  return {
    ok: true,
    issues: sortIssues(issues),
    critical: checks.critical,
    designBasis: basis,
    icr,
    comparison: icr && icr.status === "converged" ? compare(fastenerResults) : null,
    evaluatedCount: checks.evaluatedCount,
    interaction: { a: settings.interaction.a, b: settings.interaction.b },
    tensionSettings: { prying: !!settings.prying?.enabled, preload: !!settings.preload?.enabled, flangePlate: flangePlate ? flangePlate.id : null },
    unitSystem: pattern.unitSystem,
    props,
    reduced: red,
    axial: contact
      ? { method: axialMethod, mode: "contact-edge", plateId: contact.plateId, edge: contact.edge, c: contact.c, Q: contact.Q, ML: contact.ML, perp: contact.perp, C: contact.C, S: contact.S, transfer: contact.transfer }
      : { method: axialMethod, mode: axial.mode, thetaX: axial.thetaX, thetaY: axial.thetaY, D: axial.D },
    fasteners: fastenerResults,
    closure: close,
  };
}
