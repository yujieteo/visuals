/* The narrated beamdswitch report: the pattern on the page as plain data
 * for the site's standard report template (beamdswitch.js, inlined in the
 * page), whose deck(report) writes the Markdown deck.
 *
 *   # Set-up               the pattern, its load and settings, in the page's units
 *   # Method               the elastic method and the margin
 *   # Results              the headline numbers, then the hand calculations,
 *                          step by step (handcalc.mjs)
 *   # Checks and takeaway  equilibrium, warnings, verification and the key
 *
 * Every number is the solver's, formatted as the page shows it.
 */

import { unitLabel } from "./units.mjs";
import { fmt } from "./format.mjs";
import { resolveFastener } from "./model.mjs";
import { noMarginSummary } from "./checks.mjs";
import { PRELIMINARY } from "./persist.mjs";
import { CONVENTIONS, TOOL_NAME } from "./meta.mjs";
import { handCalc, markdownOf, markdownTable, md, speakable, sayNumber, HAND_VOICE, SLIDE_ROWS } from "./handcalc.mjs";

const list = (items) => items.map((t) => `- ${md(t)}`).join("\n");
const frame = (title, body, narration, extra = {}) => ({ title, body, narration: speakable(narration), ...extra });

/*
 * opts: { precision, fastenerId (the worked fastener), date, verification
 * (a runVerification() summary) }. Returns the report for deck(report).
 */
export function deckReport(pattern, result, opts = {}) {
  const p = opts.precision ?? pattern.settings?.precision ?? 4;
  const u = (k) => unitLabel(pattern.unitSystem, k);
  const L = u("length"), F = u("force"), M = u("moment"), S = u("section");
  const metric = pattern.unitSystem !== "in-lbf";
  const words = { L: metric ? "millimetres" : "inches", F: metric ? "newtons" : "pounds-force", M: metric ? "newton millimetres" : "inch pounds-force", S: metric ? "square millimetres" : "square inches" };
  const f = (v) => fmt(v, p);
  const say = (v, w = "") => `${sayNumber(f(v))}${w ? ` ${w}` : ""}`;
  const name = String(pattern.name || "fastener pattern").replace(/\s+/g, " ").trim();
  const load = pattern.load, s = pattern.settings;
  const ok = !!(result && result.ok);
  const n = pattern.fasteners.length;
  const hc = handCalc(pattern, result, { precision: p, fastenerId: opts.fastenerId, slides: true });

  const resolved = pattern.fasteners.map((q) => resolveFastener(pattern, q));
  const allowable = (v) => (v === null || v === undefined ? "—" : f(v));
  const rows = resolved.slice(0, SLIDE_ROWS).map((q) => [q.id, f(q.x), f(q.y), f(q.ks), f(q.ka), f(q.diameter), allowable(q.shearAllowable), allowable(q.tensionAllowable)]);
  const extent = ok ? result.props.extent : null;
  const setup = [
    frame(`The pattern: ${n} fastener${n === 1 ? "" : "s"}${ok ? `, ${f(extent)} ${L} across` : ""}`,
      [markdownTable(["id", `x (${L})`, `y (${L})`, "ks", "ka", `D (${L})`, `Fs (${F})`, `Ft (${F})`], rows),
        ...(n > SLIDE_ROWS ? [md(`…and ${n - SLIDE_ROWS} more, listed on the page.`)] : [])].join("\n\n"),
      `The pattern ${name} has ${n} fastener${n === 1 ? "" : "s"}${ok ? `, spanning ${say(extent, words.L)}` : ""}. Lengths are in ${words.L} and forces in ${words.F}.`,
      { notes: [md(`Unit system ${pattern.unitSystem}: lengths ${L}, forces ${F}, moments ${M}. Allowables are keyed in by the user; a dash is not entered.`), ...CONVENTIONS].join("\n") }),
    frame(`The load, applied at (${f(load.point.x)}, ${f(load.point.y)}, ${f(load.point.z)}) ${L}`,
      list([
        `Forces Fx = ${f(load.Fx)}, Fy = ${f(load.Fy)}, Fz = ${f(load.Fz)} ${F}; positive Fz is tension.`,
        `Moments Mx = ${f(load.Mx)}, My = ${f(load.My)}, Mz = ${f(load.Mz)} ${M}, right-hand rule.`,
        `Applied at P = (${f(load.point.x)}, ${f(load.point.y)}, ${f(load.point.z)}) ${L}, on plate ${load.appliedPlate || "—"}.`,
        `Axial method ${s.axialMethod === "contact-edge" ? `(b), contact edge ${s.contactEdge?.edge} of ${s.contactEdge?.plateId}` : "(a), neutral axis through Ca"}; design basis ${s.designBasis || "elastic"}.`,
        `Interaction exponents a = ${f(s.interaction?.a)}, b = ${f(s.interaction?.b)}; prying ${s.prying?.enabled ? "on" : "off"}; preload ${s.preload?.enabled ? "on" : "off"}; ICR ${s.icr?.enabled ? `on (${s.icr.model})` : "off"}; ${pattern.plates.length} plate${pattern.plates.length === 1 ? "" : "s"}.`,
      ]),
      `The load is ${say(load.Fx, words.F)} in x, ${say(load.Fy, words.F)} in y and ${say(load.Fz, words.F)} in z, applied at x ${say(load.point.x, words.L)}, y ${say(load.point.y, words.L)} and z ${say(load.point.z, words.L)}, with applied moments of ${say(load.Mx, words.M)}, ${say(load.My, words.M)} and ${say(load.Mz, words.M)} about x, y and z.`),
  ];

  const method = [
    frame("Elastic method: a rigid plate, shear about Cs and tension about Ca",
      list([
        "Three centroids: shear Cs (weights ks), axial Ca (weights ka) and area Cg (weights A).",
        "J = Σ ks·(u² + v²) about Cs; Ixx = Σ ka·q², Iyy = Σ ka·p², Ixy = Σ ka·p·q about Ca.",
        "The load moves to Cs for shear and torsion and to Ca for axial load and bending, adding r × F.",
        "Direct shear Rd = F·ks/Σks; torsional shear Rtx = −Mz,s·ks·v/J, Rty = +Mz,s·ks·u/J.",
        s.axialMethod === "contact-edge"
          ? "Tension by method (b): T = M_L·ka·d/Σ(ka·d²) about the contact edge, tension only."
          : "Tension by method (a): T = ka·(Fz/Ka + θx·q − θy·p), the neutral axis through Ca.",
      ]),
      "The plate is rigid. In-plane force and torsion are shared about the shear centroid in proportion to each fastener's shear stiffness and distance, and out of plane force and bending about the axial centroid in the same way."),
    frame("Margin: the exact load scale factor k*",
      list([
        `IF(k) = (k·Rs/Fs)^a + (k·Rt/Ft)^b; MS = k* − 1 where IF(k*) = 1, by a bracketed Brent search.`,
        ...(s.prying?.enabled || s.preload?.enabled ? ["Rt is the bolt load F_b through prying and preload, re-evaluated at every k; preload does not scale."] : ["Rt is the positive external tension; unloading fasteners count as zero."]),
        ...(pattern.plates.length ? ["Bearing (Fbr·D·t) and tear-out (2·t·(e − D/2)·Fsu) margins per plate: capacity/Rs − 1."] : []),
        ...(s.icr?.enabled ? ["The instantaneous-centre-of-rotation method gives the ultimate capacity γ_ult by an iterative search; it is stated, not derived."] : []),
        "The governing MS of a fastener is its lowest margin; the critical fastener has the lowest governing MS.",
      ]),
      "The margin of safety is the exact factor by which the whole load can grow before the interaction reaches one, minus one."),
  ];

  // The hand calculations are the results; their equilibrium frame is a check.
  const handFrames = hc.sections.flatMap((sec) => sec.frames.map((fr) => ({ sec: sec.title, fr })));
  const toFrame = ({ sec, fr }) => frame(fr.title, markdownOf(fr.blocks), fr.narration, { notes: `Hand calculations: ${sec}.${fr.notes ? `\n${md(fr.notes)}` : ""}` });
  let results;
  if (ok) {
    const pr = result.props, red = result.reduced;
    const maxRs = Math.max(...result.fasteners.map((q) => (q.basisShear ?? q.shear).Rs));
    const maxT = Math.max(...result.fasteners.map((q) => q.axial.T));
    results = [
      frame(`Cs = (${f(pr.Cs.x)}, ${f(pr.Cs.y)}) ${L}, J = ${f(pr.J)} ${S}; largest Rs = ${f(maxRs)} ${F}`,
        list([
          `Shear centroid Cs = (${f(pr.Cs.x)}, ${f(pr.Cs.y)}) ${L}; axial centroid Ca = (${f(pr.Ca.x)}, ${f(pr.Ca.y)}) ${L}.`,
          `J = ${f(pr.J)}, Ixx = ${f(pr.Ixx)}, Iyy = ${f(pr.Iyy)}, Ixy = ${f(pr.Ixy)} ${S}.`,
          `Reduced load: Mz,s = ${f(red.shear.Mz)}, Mx,a = ${f(red.axial.Mx)}, My,a = ${f(red.axial.My)} ${M}.`,
          `Largest in-plane shear Rs = ${f(maxRs)} ${F}; largest tension T = ${f(maxT)} ${F}.`,
          result.critical ? `Critical fastener ${result.critical.id}: governing MS = ${f(result.critical.ms)} (${result.critical.label}).` : noMarginSummary(result.fasteners.map((q) => q.checks)).text,
        ]),
        `The shear centroid is at x ${say(pr.Cs.x, words.L)} and y ${say(pr.Cs.y, words.L)}, and the polar moment is ${say(pr.J, words.S)}. The largest shear on a fastener is ${say(maxRs, words.F)} and the largest tension ${say(maxT, words.F)}. The hand calculations that follow work every step.`),
      ...handFrames.filter((h) => h.sec !== "Equilibrium").map(toFrame),
    ];
  } else {
    results = [toFrame(handFrames[0])];
  }

  const issues = result ? result.issues : [];
  const count = (tier) => issues.filter((i) => i.tier === tier).length;
  const checks = [
    ...(ok ? handFrames.filter((h) => h.sec === "Equilibrium").map(toFrame) : []),
    frame(`Warnings: ${count("error")} errors, ${count("warning")} warnings, ${count("note")} notes`,
      issues.length ? list(issues.map((i) => `${i.id} ${i.title}: ${i.detail}`)) : md("No warnings."),
      issues.length ? `The page raises ${count("error")} errors, ${count("warning")} warnings and ${count("note")} notes, listed on the slide.` : "The page raises no warnings."),
  ];
  const v = opts.verification;
  if (v) {
    checks.push(frame(`Verification: ${v.passed} of ${v.results.length} cases pass`,
      list([`Set ${v.set}; closed-form tolerance ${v.tol} relative.`, `${TOOL_NAME} runs every hand-calculation, property and published-reference case on its own solver.`, v.scope]),
      `The page's verification set runs ${v.results.length} cases on its own solver, and ${v.passed} of them pass.`));
  }
  const crit = ok ? result.critical : null;
  const key = !ok ? "The pattern has errors, so there are no results to check."
    : crit ? `Critical fastener ${crit.id}: governing MS = ${f(crit.ms)} (${crit.label}), on the ${result.designBasis} basis.`
      : noMarginSummary(result.fasteners.map((q) => q.checks)).text;
  checks.push(frame("Takeaway", md(PRELIMINARY), !ok ? "The pattern has errors, so there are no results yet."
    : crit ? `The critical fastener is ${crit.id}, with a governing margin of safety of ${sayNumber(f(crit.ms))} in ${crit.label.toLowerCase()}. This is preliminary sizing, to verify against the governing specification.`
      : "No fastener has a finite margin of safety yet. This is preliminary sizing, to verify against the governing specification.",
  { key: md(key) }));

  return {
    meta: {
      title: `Fastener group analysis: ${name}`,
      subtitle: ok ? (crit ? `Critical fastener ${crit.id}, governing MS ${f(crit.ms)}` : "No finite margin of safety") : "The pattern has errors",
      ...(opts.date ? { date: opts.date } : {}),
      voice: HAND_VOICE,
    },
    narration: speakable(`An analysis of the fastener pattern ${name}, with ${n} fastener${n === 1 ? "" : "s"}, in ${words.F}, ${words.L} and ${words.M}, with every step worked by hand.`),
    setup, method, results, checks,
  };
}
