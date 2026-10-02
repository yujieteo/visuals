// Builds examples.json: the reference drawings from the design specification
// (section 10), authored through the same unit parsing the tool uses, then
// normalised by its loader so the file is exactly what the tool would save.
// Run: node tools/make-examples.mjs && node tools/sync-examples.mjs
import fs from "node:fs";
import { loadCore } from "./core.mjs";

const F = loadCore();
const q = (text, kind) => { const r = F.parseQuantity(text, kind, null); if (r.error) throw new Error(r.error); return r.value; };
const show = (o = {}) => ({ label: true, magnitude: true, angle: false, units: true, ...o });
const input = (mode = "polar", o = {}) => ({ mode, slope: null, toward: null, ...o });
const force = (o) => ({ kind: "force", style: "applied", label: null, magnitude: null, unit: null, dir: 270, dirRef: "global", plane: "in", anchor: "head", input: input(), show: show(), labelOffset: null, ...o });
const moment = (o) => ({ kind: "moment", style: "applied", label: null, magnitude: null, unit: null, sense: "ccw", axis: "normal", dir: 0, dirRef: "global", show: show(), labelOffset: null, ...o });
const dist = (o) => ({ kind: "distributed", style: "applied", label: null, w1: null, w2: null, h1: 1, h2: 1, unit: null, dirMode: "perpendicular", flip: false, show: show(), labelOffset: null, ...o });
const round = (x) => Math.round(x * 1e6) / 1e6;
function drawing(title, geometry, view = {}) {
  const d = F.newDoc(title);
  Object.assign(d.geometry, geometry);
  Object.assign(d.view, view);
  const r = F.load(JSON.parse(JSON.stringify(d)));
  if (r.errors.length) throw new Error(`${title}:\n${r.errors.join("\n")}`);
  return r.doc;
}

/* 1. Cantilever: fixed support, point load, UDL, end moment, dimension. */
const cantilever = drawing("Cantilever with point load, UDL and end moment", {
  joints: [{ id: "j1", x: 0, y: 0 }, { id: "j2", x: q("3 m", "length"), y: 0 }],
  bodies: [
    { id: "b1", type: "beam", joints: ["j1", "j2"], label: null, depth: 200 },
    { id: "b2", type: "line", joints: ["j1", "j2"], label: null, role: "dimension", offset: -60 },
  ],
  supports: [{ id: "s1", kind: "fixed", at: { joint: "j1" }, angle: 180, label: "A", labelOffset: null }],
  loads: [
    dist({ id: "q1", label: "w", body: "b1", edge: 0, s1: 0, s2: q("3 m", "length"), w1: q("2 kN/m", "distributed"), w2: q("2 kN/m", "distributed"), unit: "kN/m" }),
    force({ id: "f1", label: "P", at: { body: "b1", edge: 0, s: q("2 m", "length"), n: 0 }, magnitude: q("10 kN", "force"), unit: "kN" }),
    moment({ id: "m1", label: "M_B", at: { joint: "j2" }, magnitude: q("5 kN·m", "moment"), unit: "kN·m", sense: "cw" }),
    force({ id: "f2", style: "reaction", label: "A_x", at: { joint: "j1" }, dir: 0, anchor: "tail", show: show() }),
    force({ id: "f3", style: "reaction", label: "A_y", at: { joint: "j1" }, dir: 90, anchor: "head" }),
    moment({ id: "m2", style: "reaction", label: "M_A", at: { joint: "j1" }, sense: "ccw" }),
  ],
}, { units: { system: "SI", length: "m", force: "kN", moment: "kN·m", distributed: "kN/m" }, triad: { visible: true, x: -800, y: -700, rotation: 0, ySense: 1, labels: ["x", "y"], preset: "engineering", aircraftView: null } });

/* 2. Inclined-plane block: rotated triad; N by polar input, friction by
   components and weight by pointing at a point, all in the triad frame. */
const th = 30, u = [Math.cos(F.rad(th)), Math.sin(F.rad(th))], n = [-u[1], u[0]];
const P = (s, h = 0) => ({ x: round(u[0] * s + n[0] * h), y: round(u[1] * s + n[1] * h) });
const run = q("4 m", "length");
const incline = drawing("Block on a 30° inclined plane", {
  joints: [
    { id: "j1", x: 0, y: 0 }, { id: "j2", ...P(run) }, { id: "j3", x: P(run).x, y: 0 },
    { id: "j4", ...P(1500) }, { id: "j5", ...P(2100) }, { id: "j6", ...P(2100, 600) }, { id: "j7", ...P(1500, 600) },
  ],
  bodies: [
    { id: "b1", type: "polygon", joints: ["j1", "j3", "j2"], label: null },
    { id: "b2", type: "polygon", joints: ["j4", "j5", "j6", "j7"], label: "m" },
  ],
  supports: [],
  loads: [
    force({ id: "f1", kind: "weight", label: "W", at: { body: "b2", centroid: true }, magnitude: q("490.5 N", "force"), dir: 270, show: show({ angle: true }), input: input("toward", { toward: { x: P(1800, 300).x, y: round(P(1800, 300).y - 1200) } }) }),
    force({ id: "f2", label: "N", at: { body: "b2", edge: 0, s: 300, n: 0 }, magnitude: q("424.8 N", "force"), dir: F.fromTriad({ triad: { rotation: th, ySense: 1 } }, 90), anchor: "tail", show: show({ angle: true }) }),
    force({ id: "f3", label: "F_f", at: { body: "b2", edge: 0, s: 450, n: 0 }, magnitude: q("245.25 N", "force"), dir: F.fromTriad({ triad: { rotation: th, ySense: 1 } }, 0), anchor: "tail", input: input("components"), show: show({ angle: true }) }),
  ],
}, { triad: { visible: true, x: 0, y: 0, rotation: th, ySense: 1, labels: ["x'", "y'"], preset: "engineering", aircraftView: null } });

/* 3. Simply supported beam in imperial: pin, roller, triangular load. */
const span = q("20 ft", "length");
const simple = drawing("Simply supported beam with a triangular load (imperial)", {
  joints: [{ id: "j1", x: 0, y: 0 }, { id: "j2", x: span, y: 0 }],
  bodies: [
    { id: "b1", type: "beam", joints: ["j1", "j2"], label: null, depth: q("12 in", "length") },
    { id: "b2", type: "line", joints: ["j1", "j2"], label: null, role: "dimension", offset: -70 },
  ],
  supports: [
    { id: "s1", kind: "pin", at: { joint: "j1" }, angle: 270, label: "A", labelOffset: null },
    { id: "s2", kind: "roller", at: { joint: "j2" }, angle: 270, label: "B", labelOffset: null },
  ],
  loads: [
    dist({ id: "q1", label: "w", body: "b1", edge: 0, s1: 0, s2: span, w1: 0, w2: q("2 kip/ft", "distributed"), unit: "kip/ft" }),
    force({ id: "f1", style: "reaction", label: "A_x", at: { joint: "j1" }, dir: 0, anchor: "head" }),
    force({ id: "f2", style: "reaction", label: "A_y", at: { joint: "j1" }, dir: 90 }),
    force({ id: "f3", style: "reaction", label: "B_y", at: { joint: "j2" }, dir: 90 }),
  ],
}, { units: { system: "imperial", length: "ft", force: "kip", moment: "kip·ft", distributed: "kip/ft" }, triad: { visible: true, x: q("-3 ft", "length"), y: q("-3 ft", "length"), rotation: 0, ySense: 1, labels: ["x", "y"], preset: "engineering", aircraftView: null } });

/* 4. Aircraft top view: PORT/STBD, L, D, T, W, CG, roll, pitch, yaw. */
const plan = [[0, 6000], [450, 5200], [450, 1500], [5600, 0], [5600, -700], [450, -700], [450, -3300], [1900, -4100], [1900, -4500], [0, -4200],
  [-1900, -4500], [-1900, -4100], [-450, -3300], [-450, -700], [-5600, -700], [-5600, 0], [-450, 1500], [-450, 5200]];
const airView = F.defaultView();
F.applyPreset(airView, "aircraft", "top");
airView.triad.x = -7000; airView.triad.y = 4000;
const ax = (axis, sign) => F.bodyAxis(airView, axis, sign);
const aircraft = drawing("Aircraft top view", {
  joints: plan.map(([x, y], i) => ({ id: `j${i + 1}`, x, y })),
  bodies: [{ id: "b1", type: "polygon", joints: plan.map((_, i) => `j${i + 1}`), label: null }],
  markers: [{ id: "c1", kind: "cg", at: { x: 0, y: -300 }, label: "CG", labelOffset: null }],
  supports: [],
  loads: [
    force({ id: "f1", label: "T", at: { x: 0, y: 6000 }, dir: ax("x", 1).dir, anchor: "tail" }),
    force({ id: "f2", label: "D", at: { x: 0, y: -4200 }, dir: ax("x", -1).dir, anchor: "tail" }),
    force({ id: "f3", label: "L", at: { x: 1200, y: -300 }, plane: ax("z", -1).plane }),
    force({ id: "f4", kind: "weight", label: "W", at: { x: -1200, y: -300 }, plane: ax("z", 1).plane }),
    moment({ id: "m1", label: "Roll", at: { x: 0, y: 2500 }, axis: "inplane", dir: ax("x", 1).dir }),
    moment({ id: "m2", label: "Pitch", at: { x: 2600, y: -2600 }, axis: "inplane", dir: ax("y", 1).dir }),
    moment({ id: "m3", label: "Yaw", at: { x: -2600, y: -2600 }, axis: "normal", sense: ax("z", 1).plane === "into" ? "cw" : "ccw" }),
  ],
}, { units: { system: "SI", length: "m", force: "kN", moment: "kN·m", distributed: "kN/m" }, triad: airView.triad });

/* 5. Freeform plate: loads with no values; blanks show as — in Markdown. */
const plate = drawing("Freeform plate with loads left blank", {
  joints: [{ id: "j1", x: 0, y: 0 }, { id: "j2", x: 1600, y: 0 }, { id: "j3", x: 2200, y: 900 }, { id: "j4", x: 1200, y: 1600 }, { id: "j5", x: 200, y: 1100 }],
  bodies: [{ id: "b1", type: "polygon", joints: ["j1", "j2", "j3", "j4", "j5"], label: null }],
  supports: [
    { id: "s1", kind: "pin", at: { joint: "j1" }, angle: 270, label: null, labelOffset: null },
    { id: "s2", kind: "roller", at: { joint: "j2" }, angle: 270, label: null, labelOffset: null },
  ],
  loads: [
    force({ id: "f1", at: { joint: "j4" }, dir: 300 }),
    force({ id: "f2", label: "F_1", at: { body: "b1", edge: 1, s: 540, n: 0 }, dir: 180 }),
    force({ id: "f3", label: "\\theta", at: { body: "b1", edge: 3, s: 500, n: 0 }, dir: 0, dirRef: "global" }),
    moment({ id: "m1", at: { body: "b1", edge: 0, s: 800, n: 700 } }),
    dist({ id: "q1", body: "b1", edge: 3, s1: 0, s2: 1100, h1: 0, h2: 1, flip: true }),
  ],
});

const examples = {
  format: "fbd-drawer-examples", version: 1,
  note: "Reference drawings 1 to 5 from the FBD Drawer specification, section 10. Drawing 6 is building drawing 1 by touch alone.",
  examples: [
    { id: "cantilever", title: cantilever.title, tests: "Distributed loads, moments, supports and dimension lines; the 3 m member measures 3000 mm.", drawing: cantilever },
    { id: "inclined-plane", title: incline.title, tests: "A rotated triad, with polar (N), component (friction) and point-at (weight) input.", drawing: incline },
    { id: "simply-supported-imperial", title: simple.title, tests: "Unit conversion: entered in ft and kip/ft, stored in mm and N/mm.", drawing: simple },
    { id: "aircraft-top", title: aircraft.title, tests: "The aircraft preset: PORT and STBD, L, D, T, W, CG and roll, pitch and yaw by the right-hand rule.", drawing: aircraft },
    { id: "freeform-plate", title: plate.title, tests: "Optional fields left blank, and the Markdown export.", drawing: plate },
  ],
};
const out = new URL("../examples.json", import.meta.url);
fs.writeFileSync(out, JSON.stringify(examples, null, 2) + "\n");
console.log(`wrote ${out.pathname}`);
