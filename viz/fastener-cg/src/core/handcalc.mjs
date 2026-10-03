/* Hand calculations: the solver's answer for the current pattern, worked
 * step by step as it would be on paper.
 *
 * The solver is authoritative. Every step is a formula, then the solver's
 * own inputs substituted into it, then the solver's own result, in the
 * pattern's unit system; carrying the arithmetic through reproduces each
 * result to the digits shown. The group-level steps (centroids, J, Ixx, Iyy,
 * Ixy, principal axes, lever arms, plate rotations, every fastener's shear
 * and tension, margins and equilibrium) are written here; the per-fastener
 * steps (load reduction, direct and torsional shear, tension, prying,
 * preload, bearing, tear-out and the interaction) are the calculation trace
 * of trace.mjs, reused unchanged. The ICR solve is iterative: its method and
 * result are stated, not derived. No table values are used; every allowable
 * is the user's.
 *
 *   handCalc(pattern, result, { precision, fastenerId })
 *     → { ok, id, sections: [{ title, frames: [{ title, blocks, narration }] }] }
 *   markdownOf(blocks)               a frame's blocks as Markdown
 *   handCalcMarkdown(pattern, result, opts)
 *     → a Markdown document of every step that beamdswitch also opens as a
 *       narrated deck (front matter with a voice, the Preliminary sizing line,
 *       # sections, ## frames, ". . ." reveals, ::: narration on every
 *       slide)
 *
 * A block is { p }, { list }, { steps: [{ label, formula, substituted,
 * value, unit }] } or { table: { head, rows, numeric } }. Narration is plain
 * spoken prose: no maths, symbols or markup.
 */

import { unitLabel } from "./units.mjs";
import { fmt } from "./format.mjs";
import { buildTrace, traceFastenerId } from "./trace.mjs";
import { EDGES } from "./contact.mjs";
import { noMarginSummary } from "./checks.mjs";
import { CONVENTIONS } from "./meta.mjs";
import { PRELIMINARY } from "./persist.mjs";

/* Longest sum written term by term; fastener rows per slide. */
export const WRITE_TERMS = 12;
export const SLIDE_ROWS = 6;
export const HAND_VOICE = "bf_emma";

const SPOKEN = {
  mm: ["millimetre", "millimetres"], in: ["inch", "inches"], N: ["newton", "newtons"], lbf: ["pound-force", "pounds-force"],
  "N·mm": ["newton millimetre", "newton millimetres"], "in·lbf": ["inch pound-force", "inch pounds-force"],
  "mm²": ["square millimetre", "square millimetres"], "in²": ["square inch", "square inches"], MPa: ["megapascal", "megapascals"], psi: ["psi", "psi"],
};

/* A number as the page writes it, read aloud. */
export function sayNumber(text) {
  return String(text).replace(/^−/, "minus ").replace(/∞/, "infinity").replace(/e([−-]?)\+?(\d+)$/, (_, minus, e) => ` times ten to the ${minus ? "minus " : ""}${e}`);
}
/* Characters a voice cannot read, from names typed into the page. */
export const speakable = (s) => String(s ?? "").replace(/[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻·∠°σ]/g, " ").replace(/\s+/g, " ").trim();

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const range = (rows) => (rows.length === 1 ? rows[0] : `${rows[0]} to ${rows.at(-1)}`);
const P = (p) => ({ p });
const LIST = (list) => ({ list });
const STEPS = (steps) => ({ steps });
const TABLE = (head, rows, numeric = []) => ({ table: { head, rows, numeric } });
const step = (label, formula, substituted, value, unit = "", text) => ({ label, formula, substituted, value, unit, ...(text !== undefined ? { text } : {}) });

/* Formatting and speech for one pattern and result. */
function context(pattern, result, precision) {
  const digits = Math.max(precision, 6);
  const u = (k) => unitLabel(pattern.unitSystem, k);
  const L = u("length"), F = u("force"), M = u("moment"), S = u("section");
  // Round-off below 1e-9 of the pattern's own scale of each kind reads as zero, as on the page.
  const pr = result.props, fs = result.fasteners;
  const force = Math.max(Math.hypot(result.reduced.Fx, result.reduced.Fy, result.reduced.Fz), ...fs.map((f) => Math.max(f.shear.Rs, Math.abs(f.axial.T))), 0);
  const scales = { [L]: pr.extent, [S]: pr.J + pr.Ixx + pr.Iyy, [F]: force, [M]: force * pr.extent + Math.hypot(result.reduced.shear.Mz, result.reduced.axial.Mx, result.reduced.axial.My) };
  // Steps carry the trace's digits; titles and narration the page's. `unit` picks the round-off scale.
  const num = (v, unit) => fmt(v, digits, scales[unit] || 0);
  const n = (v, unit) => (typeof v === "number" && v < 0 && Number.isFinite(v) && num(v, unit) !== "0" ? `(${num(v, unit)})` : typeof v === "number" ? num(v, unit) : "—");
  const show = (v, unit) => fmt(v, precision, scales[unit] || 0);
  const say = (v, unit) => {
    const t = show(v, unit), w = SPOKEN[unit];
    return w ? `${sayNumber(t)} ${/^−?1$/.test(t) ? w[0] : w[1]}` : sayNumber(t);
  };
  const perLength = `${SPOKEN[F][1]} per ${SPOKEN[L][0]}`;
  const terms = (xs) => (xs.length <= WRITE_TERMS ? xs.join(" + ") : `Σ over the ${xs.length} fasteners (table)`);
  return { pattern, result, precision, digits, u, L, F, M, S, num, n, show, say, perLength, terms, sys: pattern.unitSystem };
}

/* A frame with a per-fastener table. `title` is [frame title, table slide title, what the table gives]:
   as slides, the table moves to slides of its own (slidesOf). */
function chunked(title, lead, head, rows, numeric, narration, more = []) {
  const [name, tableTitle, noun] = title;
  return [{ title: name, blocks: [...lead, TABLE(head, rows, numeric), ...more], narration, table: { title: tableTitle, noun } }];
}

/* A frame as slides that fit: explanatory prose to the speaker notes (unless it is all there is), and
   a per-fastener table on slides of its own, SLIDE_ROWS rows each. */
function slidesOf(fr) {
  const prose = fr.blocks.filter((b) => b.p != null);
  const tables = fr.table ? fr.blocks.filter((b) => b.table) : [];
  let blocks = fr.blocks.filter((b) => b.p == null && !tables.includes(b));
  const keep = !blocks.length;
  if (keep) blocks = prose;
  const out = [{ title: fr.title, blocks, narration: fr.narration, ...(!keep && prose.length ? { notes: prose.map((b) => b.p).join("\n") } : {}) }];
  for (const t of tables) {
    for (let i = 0; i < t.table.rows.length; i += SLIDE_ROWS) {
      const part = t.table.rows.slice(i, i + SLIDE_ROWS), ids = range(part.map((r) => r[0].replace(/ \(.*\)$/, "")));
      out.push({ title: `${fr.table.title} (${ids})`, blocks: [TABLE(t.table.head, part, t.table.numeric)], narration: `The table gives ${fr.table.noun} for fasteners ${ids}.` });
    }
  }
  return out;
}

/* ---------- the frames ---------- */

function methodFrame(c, id) {
  const r = c.result;
  return {
    title: "How these hand calculations relate to the solver",
    blocks: [
      P(`The page's solver is authoritative. Each step writes a formula, substitutes the solver's own numbers and gives the solver's result, in ${c.sys}: lengths in ${c.L}, forces in ${c.F}, moments in ${c.M} and section properties in ${c.S} × weight. Steps carry ${c.digits} significant figures; carrying the arithmetic through reproduces each result to the digits shown.`),
      LIST([
        ...CONVENTIONS.slice(0, 4),
        `The worked fastener is ${id}${id === traceFastenerId(r) ? ", the governing fastener" : ""}; every other fastener follows the same steps and is listed in the tables.`,
        "The instantaneous-centre-of-rotation solve is iterative: its method and result are stated, not derived by hand.",
        "No table values are used: every allowable, preload and prying input is keyed in on the page.",
      ]),
    ],
    narration: `These hand calculations work the solver's answer step by step, in ${c.sys === "in-lbf" ? "pounds-force and inches" : "newtons and millimetres"}. Every number shown is the solver's own value, and the worked fastener is ${speakable(id)}. The iterative centre of rotation solve is stated, not derived, and no table values are used.`,
  };
}

function centroidFrames(c) {
  const pr = c.result.props, fs = c.result.fasteners;
  const one = (key, weight, wname, name, use) => {
    const C = pr[key], w = fs.map((f) => f[weight]);
    const coincident = pr.centroids.find((k) => k.key === key).coincidentWith;
    return {
      title: `${name} ${key} = (${c.show(C.x, c.L)}, ${c.show(C.y, c.L)}) ${c.L}`,
      blocks: [
        P(`${name}: each fastener weighted by ${wname}. ${use}`),
        STEPS([
          step(`Σ${weight === "area" ? "A" : weight}`, `Σ ${weight === "area" ? "A" : weight}ᵢ`, c.terms(w.map(c.n)), C.sum, weight === "area" ? c.u("area") : ""),
          step(`${key},x`, `Σ ${weight === "area" ? "A" : weight}ᵢ·xᵢ / Σ${weight === "area" ? "A" : weight}`, `(${c.terms(fs.map((f) => `${c.n(f[weight])}·${c.n(f.x, c.L)}`))}) / ${c.n(C.sum)}`, C.x, c.L),
          step(`${key},y`, `Σ ${weight === "area" ? "A" : weight}ᵢ·yᵢ / Σ${weight === "area" ? "A" : weight}`, `(${c.terms(fs.map((f) => `${c.n(f[weight])}·${c.n(f.y, c.L)}`))}) / ${c.n(C.sum)}`, C.y, c.L),
        ]),
        ...(coincident.length ? [P(`${key} coincides with ${coincident.join(" and ")}.`)] : []),
      ],
      narration: `The ${name.toLowerCase()} weights each fastener by ${wname.replace(/ \(.*\)$/, "")}. The weights add up to ${c.say(C.sum, weight === "area" ? c.u("area") : "")}, so it sits at x equals ${c.say(C.x, c.L)} and y equals ${c.say(C.y, c.L)}.`,
    };
  };
  return [
    one("Cs", "ks", "its shear stiffness ks", "Shear centroid", "Torsion and J are taken about Cs, and in-plane shear and torsion are reduced to it."),
    one("Ca", "ka", "its axial stiffness ka", "Axial centroid", "Ixx, Iyy and Ixy are taken about Ca, and axial load and bending are reduced to it."),
    one("Cg", "area", "its area A", "Area centroid", "Cg is a geometric reference only."),
  ];
}

function propertyFrames(c) {
  const pr = c.result.props, fs = c.result.fasteners;
  const jTerms = fs.map((f, i) => f.ks * (pr.per[i].u ** 2 + pr.per[i].v ** 2));
  const J = chunked([`Polar moment J = ${c.show(pr.J, c.S)} ${c.S} about Cs`, "J by fastener", "each term of J"],
    [P("Each fastener's position from Cs is (u, v) = (x − Cs,x, y − Cs,y), and its contribution is ks·(u² + v²)."),
      STEPS([step("J", "Σ ks·(u² + v²)", c.terms(fs.map((f, i) => `${c.n(f.ks)}·(${c.n(pr.per[i].u, c.L)}² + ${c.n(pr.per[i].v, c.L)}²)`)), pr.J, c.S)])],
    ["id", `u (${c.L})`, `v (${c.L})`, "ks", `ks·(u² + v²) (${c.S})`],
    fs.map((f, i) => [f.id, c.num(pr.per[i].u, c.L), c.num(pr.per[i].v, c.L), c.num(f.ks), c.num(jTerms[i], c.S)]), [1, 2, 3, 4],
    `The polar moment about the shear centroid adds each fastener's shear stiffness times its squared distance from it, giving ${c.say(pr.J, c.S)}.`);
  const I = chunked([`Ixx = ${c.show(pr.Ixx, c.S)}, Iyy = ${c.show(pr.Iyy, c.S)}, Ixy = ${c.show(pr.Ixy, c.S)} ${c.S} about Ca`, "Ixx, Iyy, Ixy by fastener", "each term of I x x, I y y and I x y"],
    [P("Each fastener's position from Ca is (p, q) = (x − Ca,x, y − Ca,y)."),
      STEPS([
        step("Ixx", "Σ ka·q²", c.terms(fs.map((f, i) => `${c.n(f.ka)}·${c.n(pr.per[i].q, c.L)}²`)), pr.Ixx, c.S),
        step("Iyy", "Σ ka·p²", c.terms(fs.map((f, i) => `${c.n(f.ka)}·${c.n(pr.per[i].p, c.L)}²`)), pr.Iyy, c.S),
        step("Ixy", "Σ ka·p·q", c.terms(fs.map((f, i) => `${c.n(f.ka)}·${c.n(pr.per[i].p, c.L)}·${c.n(pr.per[i].q, c.L)}`)), pr.Ixy, c.S),
      ])],
    ["id", `p (${c.L})`, `q (${c.L})`, "ka", `ka·q² (${c.S})`, `ka·p² (${c.S})`, `ka·p·q (${c.S})`],
    fs.map((f, i) => { const { p, q } = pr.per[i]; return [f.id, c.num(p, c.L), c.num(q, c.L), c.num(f.ka), c.num(f.ka * q * q, c.S), c.num(f.ka * p * p, c.S), c.num(f.ka * p * q, c.S)]; }), [1, 2, 3, 4, 5, 6],
    `About the axial centroid, I x x is ${c.say(pr.Ixx, c.S)}, I y y is ${c.say(pr.Iyy, c.S)} and the product I x y is ${c.say(pr.Ixy, c.S)}.`);
  const pp = pr.principal, mean = (pr.Ixx + pr.Iyy) / 2, radius = Math.hypot((pr.Ixx - pr.Iyy) / 2, pr.Ixy);
  const equal = c.num(radius, c.S) === "0";
  const principal = {
    title: `Principal axes: I₁ = ${c.show(pp.I1, c.S)}, I₂ = ${c.show(pp.I2, c.S)} ${c.S}, θp = ${fmt(pp.thetaDeg, c.precision, 360)}°`,
    blocks: [STEPS([
      step("Mean", "(Ixx + Iyy)/2", `(${c.n(pr.Ixx, c.S)} + ${c.n(pr.Iyy, c.S)})/2`, mean, c.S),
      step("Radius", "√(((Ixx − Iyy)/2)² + Ixy²)", `√(((${c.n(pr.Ixx, c.S)} − ${c.n(pr.Iyy, c.S)})/2)² + ${c.n(pr.Ixy, c.S)}²)`, radius, c.S),
      step("I₁", "mean + radius", `${c.n(mean, c.S)} + ${c.n(radius, c.S)}`, pp.I1, c.S),
      step("I₂", "mean − radius", `${c.n(mean, c.S)} − ${c.n(radius, c.S)}`, pp.I2, c.S),
      // I₁ = I₂ (a bolt circle, a square): every axis is principal, and θp is whatever round-off leaves.
      equal
        ? step("θp", "½·atan2(−2·Ixy, Ixx − Iyy), CCW from +x to the I₁ axis", "I₁ = I₂, so every axis is principal; the solver's angle is shown", pp.thetaDeg, "°", fmt(pp.thetaDeg, c.digits, 360))
        : step("θp", "½·atan2(−2·Ixy, Ixx − Iyy), CCW from +x to the I₁ axis", `½·atan2(${c.n(-2 * pr.Ixy, c.S)}, ${c.n(pr.Ixx - pr.Iyy, c.S)})`, pp.thetaDeg, "°", fmt(pp.thetaDeg, c.digits, 360)),
    ])],
    narration: equal
      ? `The principal values are equal, ${c.say(pp.I1, c.S)}, so every axis through the axial centroid is principal.`
      : `The principal values are ${c.say(pp.I1, c.S)} and ${c.say(pp.I2, c.S)}, with the major axis at ${sayNumber(fmt(pp.thetaDeg, c.precision, 360))} degrees from x.`,
  };
  return [...J, ...I, principal];
}

function loadFrame(c, trace) {
  const load = c.pattern.load, red = c.result.reduced, pr = c.result.props;
  const reduced = trace.sections.find((s) => s.title === "Reduced load").lines;
  return {
    title: `Load reduction: Mz,s = ${c.show(red.shear.Mz, c.M)} ${c.M}`,
    blocks: [
      P(`The load Fx = ${c.num(load.Fx)}, Fy = ${c.num(load.Fy)}, Fz = ${c.num(load.Fz)} ${c.F} and Mx = ${c.num(load.Mx)}, My = ${c.num(load.My)}, Mz = ${c.num(load.Mz)} ${c.M} acts at P = (${c.num(load.point.x)}, ${c.num(load.point.y)}, ${c.num(load.point.z)}) ${c.L}. Moving it to a point Q on z = 0 adds r × F, with r = P − Q.`),
      STEPS([
        step("Lever to Cs", "(rx, ry) = (xp − Cs,x, yp − Cs,y)", `(${c.n(load.point.x)} − ${c.n(pr.Cs.x, c.L)}, ${c.n(load.point.y)} − ${c.n(pr.Cs.y, c.L)})`, `(${c.num(red.shear.rx, c.L)}, ${c.num(red.shear.ry, c.L)})`, c.L),
        reduced[0],
        step("Lever to Ca", "(rx, ry) = (xp − Ca,x, yp − Ca,y)", `(${c.n(load.point.x)} − ${c.n(pr.Ca.x, c.L)}, ${c.n(load.point.y)} − ${c.n(pr.Ca.y, c.L)})`, `(${c.num(red.axial.rx, c.L)}, ${c.num(red.axial.ry, c.L)})`, c.L),
        reduced[1], reduced[2],
      ]),
    ],
    narration: `Moving the load to the shear centroid gives a torsion of ${c.say(red.shear.Mz, c.M)}. Moving it to the axial centroid gives bending moments of ${c.say(red.axial.Mx, c.M)} about x and ${c.say(red.axial.My, c.M)} about y.`,
  };
}

function shearFrames(c, trace, id) {
  const r = c.result, red = r.reduced, fs = r.fasteners;
  const all = chunked(["Elastic in-plane shear for every fastener", "Shear by fastener", "the direct, torsional and resultant shear"],
    [P(`Direct shear is shared by ks: Rd = F·ks/Σks. Torsion turns the plate rigidly about Cs: Rtx = −Mz,s·ks·v/J and Rty = +Mz,s·ks·u/J, with Mz,s = ${c.num(red.shear.Mz, c.M)} ${c.M} and J = ${c.num(r.props.J, c.S)} ${c.S}.`)],
    ["id", "ks/Σks", `Rdx (${c.F})`, `Rdy (${c.F})`, `Rtx (${c.F})`, `Rty (${c.F})`, `Rs (${c.F})`],
    fs.map((f) => { const s = f.shear; return [f.id, c.num(s.share), c.num(s.Rdx, c.F), c.num(s.Rdy, c.F), c.num(s.Rtx, c.F), c.num(s.Rty, c.F), c.num(s.Rs, c.F)]; }), [1, 2, 3, 4, 5, 6],
    `Each fastener takes its share of the in-plane force plus a torsional share in proportion to its distance from the shear centroid. The largest resultant is ${c.say(Math.max(...fs.map((f) => f.shear.Rs)), c.F)}.`);
  const f = fs.find((q) => q.id === id);
  const lines = [...trace.sections.find((s) => s.title === "Direct shear").lines, ...trace.sections.find((s) => s.title.startsWith("Torsional shear")).lines];
  const worked = {
    title: `Worked shear, ${id}: Rs = ${c.show(f.shear.Rs, c.F)} ${c.F}`,
    blocks: [STEPS(lines)],
    narration: `For fastener ${speakable(id)}, the direct shear is ${c.say(f.shear.Rdx, c.F)} in x and ${c.say(f.shear.Rdy, c.F)} in y, the torsional shear is ${c.say(f.shear.Rtx, c.F)} in x and ${c.say(f.shear.Rty, c.F)} in y, and the resultant is ${c.say(f.shear.Rs, c.F)}.`,
  };
  return [...all, worked];
}

function tensionFrames(c, trace, id) {
  const r = c.result, am = r.axial, pr = r.props, red = r.reduced, fs = r.fasteners;
  const f = fs.find((q) => q.id === id);
  const lines = trace.sections.find((s) => s.title.startsWith("Moment-induced tension")).lines;
  const maxT = Math.max(...fs.map((q) => q.axial.T));
  const said = `The largest tension is ${c.say(maxT, c.F)}, and fastener ${speakable(id)} carries ${c.say(f.axial.T, c.F)}.`;
  if (am.mode === "contact-edge") {
    const where = `${EDGES[am.edge].label} of ${am.plateId}`;
    const frames = chunked([`Contact-edge tension (b), ${am.plateId} ${am.edge}: largest T = ${c.show(maxT, c.F)} ${c.F}`, "Contact-edge tension by fastener", "the distance from the edge and the tension"],
      [P(`The ${where} is the neutral axis and fasteners act in tension only. d is the distance from the edge on the tension side, and M_L the moment about the edge that puts the far side in tension (reduced to the projection of Ca onto the edge).`),
        STEPS([
          step("M_L", "moment about the contact edge", "", am.ML, c.M),
          step("Σ ka·d²", "over the fasteners with d > 0", c.terms(fs.filter((q) => q.axial.d > 0).map((q) => `${c.n(q.ka)}·${c.n(q.axial.d, c.L)}²`)), am.S, c.S),
          step("Contact reaction", "C = ΣT − Fz", `${c.n(sum(fs.map((q) => q.axial.T)), c.F)} − ${c.n(red.Fz, c.F)}`, am.C, c.F),
        ])],
      ["id", `d (${c.L})`, "ka", `T (${c.F})`], fs.map((q) => [q.id, c.num(q.axial.d, c.L), c.num(q.ka), c.num(q.axial.T, c.F)]), [1, 2, 3],
      `Under the contact edge method, the moment about the edge is ${c.say(am.ML, c.M)} and the contact reaction is ${c.say(am.C, c.F)}. ${said}`);
    return [...frames, { title: `Worked tension, ${id}: T = ${c.show(f.axial.T, c.F)} ${c.F}`, blocks: [STEPS(lines)], narration: `For fastener ${speakable(id)}, the tension is ${c.say(f.axial.T, c.F)}.` }];
  }
  const lead = [P("Method (a): a rigid plate with the neutral axis through Ca, so each fastener's tension is its ka share of Fz plus the plate rotation times its lever arm: T = ka·(Fz/Ka + θx·q − θy·p). Negative T is unloading (clamp-up), shown as computed.")];
  if (am.mode === "general") {
    lead.push(STEPS([
      step("D", "Ixx·Iyy − Ixy²", `${c.n(pr.Ixx, c.S)}·${c.n(pr.Iyy, c.S)} − ${c.n(pr.Ixy, c.S)}²`, am.D, `(${c.S})²`),
      step("θx", "(Iyy·Mx,a + Ixy·My,a) / D", `(${c.n(pr.Iyy, c.S)}·${c.n(red.axial.Mx, c.M)} + ${c.n(pr.Ixy, c.S)}·${c.n(red.axial.My, c.M)}) / ${c.n(am.D)}`, am.thetaX, `${c.F}/${c.L}`),
      step("θy", "(Ixy·Mx,a + Ixx·My,a) / D", `(${c.n(pr.Ixy, c.S)}·${c.n(red.axial.Mx, c.M)} + ${c.n(pr.Ixx, c.S)}·${c.n(red.axial.My, c.M)}) / ${c.n(am.D)}`, am.thetaY, `${c.F}/${c.L}`),
    ]));
  } else {
    lead.push(P(am.mode === "collinear"
      ? "The fasteners lie on one line (I₂ = 0), so bending is resisted about the principal axis along that line only."
      : "All fasteners sit at one point, so only Fz is resisted."));
  }
  const frames = chunked([`Tension about Ca: largest T = ${c.show(maxT, c.F)} ${c.F}`, "Tension by fastener", "the direct, bending and total tension"], lead,
    ["id", `p (${c.L})`, `q (${c.L})`, `direct (${c.F})`, `bending (${c.F})`, `T (${c.F})`],
    fs.map((q) => [q.id + (q.axial.unloading ? " (unloading)" : ""), c.num(q.axial.p, c.L), c.num(q.axial.q, c.L), c.num(q.axial.direct, c.F), c.num(q.axial.moment, c.F), c.num(q.axial.T, c.F)]), [1, 2, 3, 4, 5],
    `${am.mode === "general" ? `The plate rotations are ${sayNumber(c.show(am.thetaX))} about x and ${sayNumber(c.show(am.thetaY))} about y, in ${c.perLength}. ` : ""}${said}`);
  return [...frames, { title: `Worked tension, ${id}: T = ${c.show(f.axial.T, c.F)} ${c.F}`, blocks: [STEPS(lines)], narration: `For fastener ${speakable(id)}, the direct share is ${c.say(f.axial.direct, c.F)} and the bending share ${c.say(f.axial.moment, c.F)}, for a tension of ${c.say(f.axial.T, c.F)}.` }];
}

function icrFrames(c, trace) {
  const r = c.result, ic = r.icr;
  if (!ic) return [];
  if (ic.status !== "converged") {
    return [{
      title: "ICR: not converged",
      blocks: [P(`The instantaneous-centre-of-rotation search did not converge (${ic.reason}). No ICR numbers are reported, and the elastic result remains.`)],
      narration: "The instantaneous centre of rotation search did not converge, so the elastic result remains.",
    }];
  }
  const where = ic.icr ? `(${c.num(ic.icr.x, c.L)}, ${c.num(ic.icr.y, c.L)}) ${c.L}` : ic.mode === "translation" ? "at infinity (uniform translation)" : "none (no in-plane load)";
  const result = [
    `Response: ${ic.modelLabel}, ${ic.model === "elastic-plastic" ? "R = Rult·min(Δ/Δy, 1)" : "R = Rult·(1 − e^(−μΔ))^λ"}; each fastener deforms in proportion to its distance ρ from the ICR, Δ = Δmax,gov·ρ/ρ_gov.`,
    `ICR: ${where}${ic.governing !== null && ic.governing !== undefined ? `; governing fastener ${ic.governing} at Δmax` : ""}.`,
    ic.mode === "pure-moment" ? `Ultimate moment M_u = ${c.num(ic.Mu)} ${c.M}.` : `Ultimate load P_u = ${c.num(ic.Pu)} ${c.F}.`,
    `γ_ult = ${c.num(ic.gamma)}; ICR margin γ_ult − 1 = ${c.num(ic.margin)} (an ultimate capacity, not comparable to the allowable-based MS).`,
    `Search: bracketed Brent along the line through the Rult-weighted centroid perpendicular to the load${ic.offLine ? ", refined off it by a damped Newton iteration" : ""}; ${ic.iterations} iterations, residual ${c.num(ic.residual)}.`,
    `Reactions at the applied load are the ultimate reactions ÷ γ_ult (proportional scaling).${r.designBasis === "icr" ? " These feed the checks (ICR design basis)." : " The checks use the elastic reactions."}`,
  ];
  const frames = chunked([`ICR (${ic.modelLabel}), iterative: γ_ult = ${c.show(ic.gamma)}`, "ICR reactions by fastener", "the distance from the centre, the deformation and the reactions"], [P("The instantaneous-centre-of-rotation solve is iterative, so its method and result are stated here rather than derived by hand."), LIST(result)],
    ["id", `ρ (${c.L})`, `Δ (${c.L})`, `R ultimate (${c.F})`, `Rs at load (${c.F})`, `elastic Rs (${c.F})`],
    r.fasteners.map((f) => [f.id, c.num(f.icr.ultimate.rho, c.L), c.num(f.icr.ultimate.delta, c.L), c.num(f.icr.ultimate.R), c.num(f.icr.atLoad.Rs, c.F), c.num(f.shear.Rs, c.F)]), [1, 2, 3, 4, 5],
    `The instantaneous centre of rotation is found iteratively with the ${speakable(ic.modelLabel)} response. The ultimate capacity is ${sayNumber(c.show(ic.gamma))} times the applied load.`);
  const sec = trace.sections.find((s) => s.title.startsWith("ICR"));
  if (sec) frames.push({ title: `Worked ICR reaction, ${trace.id}`, blocks: [STEPS(sec.lines)], narration: `For fastener ${speakable(trace.id)}, the ultimate reaction divided by the capacity factor gives ${c.say(r.fasteners.find((f) => f.id === trace.id).icr.atLoad.Rs, c.F)} at the applied load.` });
  return frames;
}

function checkFrames(c, trace, id) {
  const r = c.result, f = r.fasteners.find((q) => q.id === id), t = f.checks.tension;
  const frames = [];
  const chain = trace.sections.find((s) => s.title === "Tension chain");
  const extras = [r.tensionSettings.prying ? "prying" : null, r.tensionSettings.preload ? "preload" : null].filter(Boolean);
  frames.push({
    title: `Bolt tension, ${id}: F_b = ${c.show(t.Fb, c.F)} ${c.F}`,
    blocks: [P(extras.length ? `The external tension passes through ${extras.join(" and ")} to the bolt load F_b that enters the interaction.` : "Prying and preload are off, so the bolt load is the positive external tension."), STEPS(chain.lines)],
    narration: `For fastener ${speakable(id)}, the external tension is ${c.say(t.Text, c.F)}${t.Q ? `, prying adds ${c.say(t.Q, c.F)}` : ""}${t.preload ? `, with preload the clamp force is ${c.say(t.preload.clamp, c.F)}` : ""}, and the bolt load is ${c.say(t.Fb, c.F)}.`,
  });
  const plates = trace.sections.find((s) => s.title === "Bearing and tear-out");
  if (plates && plates.lines.length) {
    frames.push({
      title: `Bearing and tear-out, ${id}`,
      blocks: [P("Bearing R_br,allow = Fbr·D·t (or a keyed direct-load allowable); tear-out capacity 2·t·(e − D/2)·Fsu, with e cast from the fastener along its bearing direction to the plate edge. MS = capacity/Rs − 1."), STEPS(plates.lines)],
      narration: `Fastener ${speakable(id)} is checked for bearing and tear out in every plate, with the margin of safety the capacity over the shear, minus one.`,
    });
  }
  const it = f.checks.modes.find((m) => m.mode === "interaction");
  const lines = [...trace.sections.find((s) => s.title.startsWith("Interaction")).lines];
  // With a = b and a bolt load proportional to the load, IF(k) = k^a·IF(1): k* has a closed form to check the search.
  const linear = !r.tensionSettings.preload && f.checks.tension.prying.method !== "t-stub";
  if (it.status === "ok" && it.a === it.b && linear) {
    lines.splice(2, 0, step("Check: closed form", "a = b and F_b ∝ load, so k* = IF(1)^(−1/a)", `${c.n(it.IF1)}^(−1/${c.n(it.a)})`, Math.pow(it.IF1, -1 / it.a)));
  }
  const said = it.status === "ok"
    ? `The interaction value at the applied load is ${sayNumber(c.show(it.IF1))}. Scaling the load until it reaches one gives a factor of ${sayNumber(c.show(it.kStar))}, so the interaction margin of safety is ${sayNumber(c.show(it.ms))}.`
    : it.status === "not-evaluated" ? "The interaction is not evaluated, because an allowable is not entered." : "No finite interaction margin is computed for this fastener.";
  frames.push({
    title: it.status === "ok" ? `Interaction, ${id}: IF(1) = ${c.show(it.IF1)}, MS = ${c.show(it.ms)}` : `Interaction, ${id}`,
    blocks: [P(`IF(k) = (k·Rs/Fs)^a + (k·Rt/Ft)^b with a = ${c.num(r.interaction.a)} and b = ${c.num(r.interaction.b)}; Rt is the bolt load F_b, re-evaluated at every k. The margin is the exact load scale factor: MS = k* − 1 where IF(k*) = 1, found by a bracketed Brent search on the page.`), STEPS(lines)],
    narration: `For fastener ${speakable(id)} on the ${r.designBasis} basis: ${said}`,
  });
  const ms = (m) => (!m ? "—" : m.status === "ok" ? c.num(m.ms) : m.status === "unloaded" ? "∞" : m.status === "not-evaluated" ? "not evaluated" : "not computed");
  const crit = r.critical;
  const summary = crit ? `Critical fastener ${crit.id}: governing MS = ${c.num(crit.ms)} (${crit.label}).` : noMarginSummary(r.fasteners.map((q) => q.checks)).text;
  frames.push(...chunked([crit ? `Margins: critical fastener ${crit.id}, MS = ${c.show(crit.ms)}` : "Margins for every fastener", "Margins by fastener", "the loads and margins of safety"],
    [P(`Every fastener on the ${r.designBasis} basis. The governing MS of a fastener is its lowest margin across modes; the critical fastener has the lowest governing MS.`)],
    ["id", `Rs (${c.F})`, `F_b (${c.F})`, "IF(1)", "MS interaction", "governing MS", "mode"],
    r.fasteners.map((q) => {
      const m = q.checks.modes.find((x) => x.mode === "interaction"), g = q.checks.governing;
      return [q.id, c.num((q.basisShear ?? q.shear).Rs, c.F), c.num(q.checks.tension.Fb, c.F), m.status === "ok" ? c.num(m.IF1) : "—", ms(m), g ? (Number.isFinite(g.ms) ? c.num(g.ms) : "∞") : "not evaluated", g ? g.label : ""];
    }), [1, 2, 3, 4, 5],
    crit ? `The critical fastener is ${speakable(crit.id)}, with a governing margin of safety of ${sayNumber(c.show(crit.ms))} in ${speakable(crit.label).toLowerCase()}.` : "No fastener has a finite margin of safety.",
    [P(summary)]));
  return frames;
}

function equilibriumFrame(c) {
  const cl = c.result.closure;
  return {
    title: `Equilibrium closes within ${cl.tol} relative`,
    blocks: [
      P("The fastener forces must carry the reduced load: the sums of the shear components, of the tensions and of their moments about the reduction points equal the load."),
      TABLE(["check", "residual", "relative", ""], cl.checks.map((k) => [k.name, c.num(k.residual), fmt(k.relative, 3), k.pass ? "pass" : "fail"]), [1, 2]),
    ],
    narration: `The fastener forces balance the load: all ${cl.checks.length} equilibrium sums close to within one part in a billion.`,
  };
}

/* ---------- assembling ---------- */

/* `slides`: frames sized for a slide (slidesOf); otherwise one frame per step group, tables whole, as the page shows them. */
export function handCalc(pattern, result, { precision = pattern.settings?.precision ?? 4, fastenerId = null, slides = false } = {}) {
  if (!result || !result.ok) {
    const errors = (result?.issues || []).filter((i) => i.tier === "error");
    return {
      ok: false, id: null,
      sections: [{ title: "Hand calculations", frames: [{
        title: "No hand calculations: the pattern has errors",
        blocks: [P("The solver rejected the inputs, so there are no numbers to work by hand."), LIST(errors.length ? errors.map((e) => `${e.id} ${e.title}: ${e.detail}`) : ["No result."])],
        narration: `The pattern has ${errors.length === 1 ? "an error" : "errors"}, so there are no hand calculations.`,
      }] }],
    };
  }
  const ids = result.fasteners.map((f) => f.id);
  const id = ids.includes(fastenerId) ? fastenerId : traceFastenerId(result);
  const c = context(pattern, result, precision);
  const trace = buildTrace(pattern, result, id, c.num);
  const sections = [
    { title: "Method and units", frames: [methodFrame(c, id)] },
    { title: "Centroids", frames: centroidFrames(c) },
    { title: "Section properties", frames: propertyFrames(c) },
    { title: "Load reduction", frames: [loadFrame(c, trace)] },
    { title: "In-plane shear", frames: shearFrames(c, trace, id) },
    { title: "Out-of-plane tension", frames: tensionFrames(c, trace, id) },
    ...(result.icr ? [{ title: "Instantaneous centre of rotation", frames: icrFrames(c, trace) }] : []),
    { title: "Checks and margin", frames: checkFrames(c, trace, id) },
    { title: "Equilibrium", frames: [equilibriumFrame(c)] },
  ];
  // Values are the solver's numbers; the text forms use the steps' digits.
  for (const s of sections) {
    if (slides) s.frames = s.frames.flatMap(slidesOf);
    for (const fr of s.frames) { fr.narration = speakable(fr.narration); delete fr.table; }
  }
  for (const s of sections) for (const fr of s.frames) for (const b of fr.blocks) if (b.steps) b.steps = b.steps.map((l) => ({ ...l, text: l.text ?? (typeof l.value === "number" ? c.num(l.value, l.unit) : l.value ?? "—") }));
  return { ok: true, id, digits: c.digits, sections };
}

/* Text as Markdown: a literal asterisk (k*) must not open emphasis. */
export const md = (t) => String(t ?? "").replace(/\*/g, "\\*");
const cell = (t) => md(t).replace(/\|/g, "\\|");
/* formula = substituted = result; a step with no number (a check not evaluated) states its formula and why. */
function stepMarkdown(l) {
  const text = l.text ?? (l.value === null || l.value === undefined ? "—" : String(l.value));
  if (text === "—") return `- **${md(l.label)}**: ${md(l.formula)}${l.substituted ? ` (${md(l.substituted)})` : ""}`;
  return `- **${md(l.label)}**: ${md(l.formula)}${l.substituted ? ` = ${md(l.substituted)}` : ""} = **${md(text)}${l.unit ? ` ${md(l.unit)}` : ""}**`;
}

export const markdownTable = (head, rows) => [`| ${head.map(cell).join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");

/* A frame's blocks as Markdown, one ". . ." reveal between blocks. */
export function markdownOf(blocks) {
  return blocks.map((b) => {
    if (b.p != null) return md(b.p);
    if (b.list) return b.list.map((t) => `- ${md(t)}`).join("\n");
    if (b.steps) return b.steps.map(stepMarkdown).join("\n");
    return markdownTable(b.table.head, b.table.rows);
  }).join("\n\n. . .\n\n");
}

/* Every step as one Markdown document; beamdswitch opens it as a narrated deck. */
export function handCalcMarkdown(pattern, result, opts = {}) {
  const hc = handCalc(pattern, result, { ...opts, slides: true });
  const name = String(pattern.name || "").replace(/\s+/g, " ").trim();
  const narr = (t) => ["::: narration", speakable(t) || "No narration.", ":::"];
  const out = ["---", `title: Hand calculations: ${name || "fastener pattern"}`,
    `subtitle: ${hc.ok ? `Fastener group, ${pattern.unitSystem}; worked fastener ${hc.id}` : "The pattern has errors"}`];
  if (opts.date) out.push(`date: ${opts.date}`);
  out.push(`voice: ${HAND_VOICE}`, "---", "", md(PRELIMINARY), "",
    ...narr(`Hand calculations for the fastener pattern ${name}. Each step works the page's own result by hand, in ${pattern.unitSystem === "in-lbf" ? "pounds-force and inches" : "newtons and millimetres"}. This is preliminary sizing, to verify against the governing specification.`), "");
  hc.sections.forEach((s, i) => {
    out.push(`# ${s.title}`, "", ...narr(`Part ${i + 1}. ${s.title}.`), "");
    for (const fr of s.frames) out.push(`## ${fr.title}`, "", markdownOf(fr.blocks), "", ...(fr.notes ? ["::: notes", md(fr.notes), ":::", ""] : []), ...narr(fr.narration), "");
  });
  return out.join("\n");
}
