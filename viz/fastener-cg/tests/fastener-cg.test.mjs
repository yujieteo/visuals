import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runVerification, HAND_CASES, PROPERTY_CASES, REFERENCE_CASES } from "../src/core/verify.mjs";
import { solve } from "../src/core/solve.mjs";
import { examplePattern, addFastener, resolveFastener, clone } from "../src/core/model.mjs";
import { convertPattern, convertValue, MM_PER_IN, N_PER_LBF } from "../src/core/units.mjs";
import { toJSON, parseJSON, toMarkdown, parseMarkdown, parsePatternFile, normalizePattern } from "../src/core/persist.mjs";
import { rectangularArray, staggeredRows, boltCircle, mirror } from "../src/core/generators.mjs";
import { buildScene } from "../src/core/scene.mjs";
import { fmt } from "../src/core/format.mjs";
import { CATALOG } from "../src/core/warnings.mjs";
import { registerTools } from "../src/ui/webmcp.mjs";
import { brent, solveScale, interactionValue } from "../src/core/interaction.mjs";
import { boltLoad, tStubPrying, preloadFromTorque } from "../src/core/tension.mjs";
import { rayToRect, edgeDistance } from "../src/core/plates.mjs";
import { suggestContactEdge, edgeFrame } from "../src/core/contact.mjs";
import { icrSolve, response, rotationState } from "../src/core/icr.mjs";
import { paintSvg } from "../src/core/svgpaint.mjs";
import { paint, paintLegend } from "../src/ui/canvas.mjs";
import { buildTrace, traceFastenerId } from "../src/core/trace.mjs";
import { reportHtml } from "../src/core/report.mjs";
import { TOOL_VERSION } from "../src/core/meta.mjs";
import { render, bundle } from "../build.mjs";
import { hitTest } from "../src/ui/canvas.mjs";

const VIZ = new URL("../", import.meta.url);
const close = (a, b, tol = 1e-9, label = "") => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${label} ${a} vs ${b}`);
const ids = (issues) => issues.map((i) => i.id);

function pattern(points, load = {}) {
  const p = examplePattern("N-mm");
  p.fasteners = points.map(([x, y], i) => ({ id: `F${i + 1}`, label: "", x, y, overrides: {} }));
  p.plates = [];
  p.load = { appliedPlate: "P1", point: { x: 0, y: 0, z: 0 }, Fx: 0, Fy: 0, Fz: 0, Mx: 0, My: 0, Mz: 0, ...load };
  return p;
}

test("the whole in-app verification set passes, published-reference cases included", () => {
  const v = runVerification();
  for (const r of v.results) {
    assert.ok(r.pass, `${r.id} ${r.error || r.checks.filter((c) => !c.pass).map((c) => `${c.label}: ${c.actual} vs ${c.expected}`).join("; ")}`);
  }
  assert.deepEqual(v.results.map((r) => r.id), ["VC-01", "VC-02", "VC-03", "VC-04", "VC-05", "VC-06", "VC-07", "VC-08", "VB-01", "VB-02", "VI-01", "VI-02", "VI-03", "VC-09",
    "P-01", "P-02", "P-03", "P-04", "P-05", "P-06", "P-07", "P-08", "P-09", "P-10", "P-11", "P-12", "P-13", "P-14", "VR-01", "VR-02", "VR-03"]);
  assert.equal(HAND_CASES.length + PROPERTY_CASES.length + REFERENCE_CASES.length, v.results.length);
  assert.deepEqual([v.passed, v.failed, v.pass], [31, 0, true]);
  assert.ok(REFERENCE_CASES.every((c) => typeof c.run === "function" && !("pending" in c)), "no reference case is left pending");
  assert.equal(v.results.find((r) => r.id === "VR-02").checks.length, 154, "every value of the b = 3 in block of Table 13.1");
});

test("a failing or throwing case fails the set", () => {
  const ok = { id: "X-1", title: "ok", run: () => [{ label: "x", pass: true }] };
  const bad = { id: "X-2", title: "bad", run: () => [{ label: "x", pass: false }] };
  const boom = { id: "X-3", title: "boom", run: () => { throw new Error("no"); } };
  assert.equal(runVerification([ok]).pass, true);
  assert.deepEqual(runVerification([ok, bad, boom]).results.map((r) => r.status), ["pass", "fail", "fail"]);
  assert.deepEqual([runVerification([ok, bad, boom]).passed, runVerification([ok, bad, boom]).failed, runVerification([ok, bad, boom]).pass], [1, 2, false]);
});

test("VC-01 independently: 2×2 bracket, Fy = −10 000 N at (150, 0, 0)", () => {
  const r = solve(examplePattern("N-mm"));
  assert.ok(r.ok);
  assert.equal(r.props.J, 13600);
  assert.equal(r.reduced.shear.Mz, -1.5e6);
  const at = (x, y) => r.fasteners.find((f) => f.x === x && f.y === y);
  // (50, 30): Rtx = 1.5e6·30/13600, Rty = −1.5e6·50/13600, Rdy = −2500
  close(at(50, 30).shear.Rtx, 1.5e6 * 30 / 13600);
  close(at(50, 30).shear.Rty, -1.5e6 * 50 / 13600);
  close(at(50, 30).shear.Rs, Math.hypot(1.5e6 * 30 / 13600, -2500 - 1.5e6 * 50 / 13600));
  assert.ok(Math.abs(at(50, 30).shear.Rs - 8670.8) <= 0.1);
  assert.ok(Math.abs(at(-50, -30).shear.Rs - 4476.2) <= 0.1);
});

test("load reduction carries the zp terms into the bending moments", () => {
  // Fy at height zp gives Mx,a = −zp·Fy; Fz at an offset gives both bending moments.
  const r = solve(pattern([[50, 30], [50, -30], [-50, 30], [-50, -30]], { point: { x: 20, y: -10, z: 40 }, Fx: 100, Fy: 300, Fz: 500, Mx: 7, My: 11, Mz: 13 }));
  assert.ok(r.ok);
  close(r.reduced.axial.Mx, 7 + (-10) * 500 - 40 * 300);
  close(r.reduced.axial.My, 11 + 40 * 100 - 20 * 500);
  close(r.reduced.shear.Mz, 13 + 20 * 300 - (-10) * 100);
});

test("stiffness weights separate the three centroids and weight J and I", () => {
  const p = pattern([[0, 0], [100, 0], [0, 60]]);
  p.fasteners[1].overrides = { ks: 3 };
  p.fasteners[2].overrides = { ka: 2, area: 300 };
  const r = solve(p);
  assert.ok(r.ok);
  close(r.props.Cs.x, 300 / 5); close(r.props.Cs.y, 60 / 5);
  close(r.props.Ca.x, 100 / 4); close(r.props.Ca.y, 120 / 4);
  const A = 113.1;
  close(r.props.Cg.x, (100 * A) / (2 * A + 300)); close(r.props.Cg.y, (60 * 300) / (2 * A + 300));
  const Cs = r.props.Cs, Ca = r.props.Ca;
  close(r.props.J, [[0, 0, 1], [100, 0, 3], [0, 60, 1]].reduce((s, [x, y, k]) => s + k * ((x - Cs.x) ** 2 + (y - Cs.y) ** 2), 0));
  close(r.props.Ixx, [[0, 0, 1], [100, 0, 1], [0, 60, 2]].reduce((s, [, y, k]) => s + k * (y - Ca.y) ** 2, 0));
  assert.ok(ids(r.issues).includes("N-002"));
  assert.ok(r.props.centroids.every((c) => c.coincidentWith.length === 0));
  assert.ok(r.closure.pass);
});

test("coincident centroids stay three named items with a coincident tag", () => {
  const r = solve(examplePattern("N-mm"));
  assert.deepEqual(r.props.centroids.map((c) => c.key), ["Cs", "Ca", "Cg"]);
  assert.deepEqual(r.props.centroids.map((c) => c.coincidentWith), [["Ca", "Cg"], ["Cs", "Cg"], ["Cs", "Ca"]]);
  assert.ok(!ids(r.issues).includes("N-002"));
});

test("principal axes of a rotated rectangle", () => {
  const t = 30 * Math.PI / 180;
  const pts = [[60, 20], [60, -20], [-60, 20], [-60, -20]].map(([x, y]) => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)]);
  const r = solve(pattern(pts));
  close(r.props.principal.I1, 4 * 3600);
  close(r.props.principal.I2, 4 * 400);
  // I1 (larger) is about the axis the fasteners are farthest from: perpendicular to the long side.
  close(r.props.principal.thetaDeg, -60); // 120° is the same line; angles are reported in (−90°, 90°]
});

test("errors block results and name the field or fastener", () => {
  const empty = pattern([]);
  let r = solve(empty);
  assert.equal(r.ok, false);
  assert.deepEqual(ids(r.issues.filter((i) => i.tier === "error")), ["E-001"]);
  assert.equal(r.props, undefined);

  const p = examplePattern("N-mm");
  p.fasteners[1].x = "12a";
  p.fasteners[2].overrides.ks = 0;
  p.load.Fz = null;
  p.defaults.ka = -1;
  r = solve(p);
  assert.equal(r.ok, false);
  const e2 = r.issues.filter((i) => i.id === "E-002");
  assert.deepEqual(e2.map((i) => [i.fastener, i.field]), [["F2", "x"], [null, "load.Fz"]]);
  const e3 = r.issues.filter((i) => i.id === "E-003");
  assert.deepEqual(e3.map((i) => [i.fastener, i.field]), [[null, "defaults.ka"], ["F3", "ks"]]);
});

test("single fastener: W-001, and torsion it cannot resist fails closure (E-010)", () => {
  let r = solve(pattern([[10, 10]], { point: { x: 10, y: 10, z: 0 }, Fy: 100 }));
  assert.ok(r.ok);
  assert.ok(ids(r.issues).includes("W-001"));
  r = solve(pattern([[10, 10]], { point: { x: 50, y: 10, z: 0 }, Fy: 100 }));
  assert.equal(r.ok, false);
  assert.ok(ids(r.issues).includes("E-010"));
  assert.match(r.issues.find((i) => i.id === "E-010").detail, /J = 0/);
});

test("collinear patterns: W-002 when the unresolved moment is zero, E-011 when it is not", () => {
  const line = [[-60, 0], [0, 0], [60, 0]];
  let r = solve(pattern(line, { My: 36000 }));
  assert.ok(r.ok);
  assert.ok(ids(r.issues).includes("W-002"));
  close(r.fasteners[0].axial.T, 36000 * 60 / 7200);
  close(r.fasteners[2].axial.T, -36000 * 60 / 7200);
  assert.ok(r.closure.pass);
  r = solve(pattern(line, { Mx: 1000 }));
  assert.equal(r.ok, false);
  assert.ok(ids(r.issues).includes("E-011"));
  // A load above the line in y transfers Fz into Mx about the line: also unresolved.
  r = solve(pattern(line, { point: { x: 0, y: 25, z: 0 }, Fz: 100 }));
  assert.ok(ids(r.issues).includes("E-011"));
  // Diagonal line: bending about the perpendicular axis is fine.
  const diag = [[-30, -30], [0, 0], [30, 30]];
  r = solve(pattern(diag, { Mx: -500, My: 500 }));
  assert.ok(r.ok, JSON.stringify(r.issues));
  assert.ok(r.closure.pass);
});

test("load warnings and notes: W-003, W-004, W-005, W-016, N-001, W-019", () => {
  let r = solve(pattern([[0, 10], [0, -10], [10, 0]]));
  assert.ok(ids(r.issues).includes("W-003"));
  r = solve(pattern([[0, 0], [20000, 0], [0, 20000]], { Fy: 5 }));
  assert.ok(ids(r.issues).includes("W-004"));
  r = solve(pattern([[50, 30], [50, -30], [-50, 30], [-50, -30]], { Fy: 5 }));
  assert.ok(ids(r.issues).includes("N-001"));
  assert.ok(!ids(r.issues).includes("W-005"));
  r = solve(pattern([[50, 30], [50, -30], [-50, 30], [-50, -30]], { Mx: 12000 }));
  assert.ok(ids(r.issues).includes("W-005"));
  assert.ok(ids(r.issues).includes("W-016"));
  assert.deepEqual(r.fasteners.filter((f) => f.axial.unloading).map((f) => f.id), ["F2", "F4"]);
  r = solve(pattern([[50, 30], [50, -30], [-50, 30], [-50, -30]], { Fz: 400 }));
  assert.ok(!ids(r.issues).includes("W-016"));
  const many = pattern(Array.from({ length: 201 }, (_, i) => [i % 20 * 10, Math.floor(i / 20) * 10]), { Fy: 1 });
  assert.ok(ids(solve(many).issues).includes("W-019"));
});

test("every issue id raised by the core is in the catalogue", () => {
  const seen = new Set();
  for (const c of [...HAND_CASES]) c.run();
  for (const p of [pattern([]), pattern([[1, 1]], { Mz: 5 }), pattern([[-1, 0], [1, 0]], { Mx: 1 })]) for (const i of solve(p).issues) seen.add(i.id);
  for (const id of seen) assert.ok(id in CATALOG, id);
  assert.equal(Object.keys(CATALOG).length, 14 + 20 + 8);
});

test("unit switching converts in place to 12 significant figures and round-trips", () => {
  const p = examplePattern("N-mm");
  const q = convertPattern(p, "in-lbf");
  assert.equal(q.unitSystem, "in-lbf");
  assert.equal(q.fasteners[0].x, Number((50 / MM_PER_IN).toPrecision(12)));
  assert.equal(q.load.Fy, Number((-10000 / N_PER_LBF).toPrecision(12)));
  assert.equal(q.defaults.area, Number((113.1 / MM_PER_IN ** 2).toPrecision(12)));
  assert.equal(q.defaults.icr.mu, Number((0.3937 * MM_PER_IN).toPrecision(12)));
  assert.equal(q.defaults.ks, 1);
  assert.equal(convertValue(1, "stress", "N-mm", "in-lbf"), Number((MM_PER_IN ** 2 / N_PER_LBF).toPrecision(12)));
  const back = convertPattern(q, "N-mm");
  close(back.fasteners[0].x, 50, 1e-11);
  close(back.load.Fy, -10000, 1e-11);
  // Results are physically identical: stresses in the new units, same ratios.
  const a = solve(p), b = solve(q);
  close(b.fasteners[0].shear.Rs * N_PER_LBF, a.fasteners[0].shear.Rs, 1e-10);
  close(b.props.J * MM_PER_IN ** 2, a.props.J, 1e-10);
});

test("JSON round-trips inputs exactly and stores no results", () => {
  const p = examplePattern("N-mm");
  p.fasteners[2].overrides = { ks: 2.5, icr: { rult: 5000 } };
  p.fasteners[2].label = "top | left";
  addFastener(p, 1 / 3, -7.25);
  const text = toJSON(p);
  const parsed = parseJSON(text);
  assert.deepEqual(parsed.issues, []);
  assert.equal(toJSON(parsed.pattern), text);
  assert.equal(parsed.pattern.fasteners[4].x, 1 / 3);
  assert.ok(!/"results"|"props"/.test(text));
  assert.equal(resolveFastener(parsed.pattern, parsed.pattern.fasteners[2]).icr.mu, 0.3937);
});

test("fastener ids are never reused within a pattern", () => {
  const p = examplePattern("N-mm");
  const a = addFastener(p, 0, 0);
  p.fasteners = p.fasteners.filter((f) => f.id !== a.id);
  const b = addFastener(p, 1, 1);
  assert.equal(a.id, "F5");
  assert.equal(b.id, "F6");
  const reloaded = parseJSON(toJSON(p)).pattern;
  assert.equal(addFastener(reloaded, 2, 2).id, "F7");
});

test("import: newer schema refused (E-013), every problem listed, optional fields defaulted (W-018)", () => {
  const newer = parseJSON(JSON.stringify({ ...JSON.parse(toJSON(examplePattern())), schemaVersion: 2 }));
  assert.equal(newer.pattern, null);
  assert.deepEqual(ids(newer.issues), ["E-013"]);
  assert.match(newer.issues[0].detail, /newer/);

  const bad = JSON.parse(toJSON(examplePattern()));
  bad.fasteners[0].x = "left";
  bad.fasteners[1].id = "F1";
  bad.unitSystem = "furlongs";
  bad.settings.axialMethod = "magic";
  const r = parseJSON(JSON.stringify(bad));
  assert.equal(r.pattern, null);
  assert.equal(r.errors.length, 4, r.errors.join("\n"));

  const sparse = { schemaVersion: 1, unitSystem: "in-lbf", fasteners: [{ id: "A", x: 1, y: 2 }, { id: "B", x: -1, y: 2 }], load: { Fy: -100 } };
  const s = parseJSON(JSON.stringify(sparse));
  assert.ok(s.pattern);
  assert.equal(s.pattern.unitSystem, "in-lbf");
  assert.equal(s.pattern.fasteners[0].x, 1, "no silent unit conversion");
  assert.equal(s.pattern.defaults.diameter, Number((12 / MM_PER_IN).toPrecision(12)), "app defaults expressed in the file's units");
  const w = s.issues.find((i) => i.id === "W-018");
  assert.match(w.detail, /settings/);
  assert.match(w.detail, /load\.point/);
  assert.equal(parseJSON("{nope").issues[0].id, "E-013");
  assert.equal(normalizePattern([]).issues[0].id, "E-013");
});

test("the autosaved working pattern restores blank and out-of-range fields as entered; file import stays strict", () => {
  const p = examplePattern("N-mm");
  p.fasteners[0].x = null;
  p.fasteners[1].y = "abc";
  p.fasteners[2].overrides = { area: null };
  p.load.Fx = null;
  p.settings.precision = 20;
  const saved = toJSON(p);
  assert.equal(parseJSON(saved).pattern, null, "file import rejects it");

  const restored = parseJSON(saved, { lenient: true });
  assert.ok(restored.pattern, restored.errors.join("\n"));
  assert.deepEqual(restored.pattern, JSON.parse(saved));
  const flagged = solve(restored.pattern).issues.filter((i) => i.id === "E-002").map((i) => i.field);
  for (const field of ["x", "y", "area", "load.Fx"]) assert.ok(flagged.includes(field), `E-002 for ${field}`);

  assert.ok(normalizePattern(JSON.parse(saved), { lenient: true }).pattern, "library entries restore too");
  assert.equal(parseJSON("{nope", { lenient: true }).pattern, null);
  const corrupt = JSON.parse(saved);
  corrupt.load = [];
  assert.equal(parseJSON(JSON.stringify(corrupt), { lenient: true }).pattern, null);
});

test("Markdown export holds readable tables and one checksummed JSON block that import prefers", () => {
  const p = examplePattern("N-mm");
  p.fasteners[0].overrides = { ka: 2 };
  p.settings.interaction = { a: 1.5, b: 2.5 };
  const md = toMarkdown(p, solve(p), { version: "test" });
  assert.equal((md.match(/```json/g) || []).length, 1);
  assert.match(md, /## Fasteners/);
  assert.match(md, /## Centroids/);
  assert.match(md, /Preliminary sizing — verify against the governing specification\./);
  const back = parseMarkdown(md);
  assert.equal(back.source, "json");
  assert.deepEqual(back.issues, []);
  assert.equal(toJSON(back.pattern), toJSON(p));
  assert.equal(parsePatternFile(md, "x.md").source, "json");
  assert.equal(parsePatternFile(md.replace(/\n/g, "\r\n"), "x.md").source, "json");
});

test("Markdown fallback: a hand-edited JSON block falls back to the tables and lists what was lost", () => {
  const p = examplePattern("N-mm");
  p.fasteners[3].overrides = { area: 50 };
  p.settings.interaction = { a: 1, b: 1 };
  const md = toMarkdown(p, solve(p)).replace('"name": "Bracket A - 2x2"', '"name": "Edited"');
  const r = parseMarkdown(md);
  assert.equal(r.source, "tables");
  assert.ok(r.pattern);
  assert.equal(r.pattern.name, "Bracket A - 2x2");
  assert.deepEqual(r.pattern.fasteners.map((f) => [f.id, f.x, f.y]), p.fasteners.map((f) => [f.id, f.x, f.y]));
  assert.deepEqual(r.pattern.fasteners[3].overrides, { area: 50 });
  assert.equal(r.pattern.load.Fy, -10000);
  assert.equal(r.pattern.load.point.x, 150);
  assert.equal(r.pattern.settings.interaction.a, 2, "settings revert to app defaults");
  const w = r.issues.find((i) => i.id === "W-018");
  assert.match(w.detail, /checksum mismatch/);
  assert.match(w.detail, /interaction/);
  // No block and no tables: refused.
  assert.equal(parseMarkdown("# nothing here").issues[0].id, "E-013");
  // No JSON block at all: tables only.
  const noBlock = md.replace(/<!--[\s\S]*$/, "");
  assert.equal(parseMarkdown(noBlock).source, "tables");
});

test("generators", () => {
  assert.deepEqual(rectangularArray({ nx: 2, ny: 2, sx: 100, sy: 60 }), [{ x: -50, y: 30 }, { x: 50, y: 30 }, { x: -50, y: -30 }, { x: 50, y: -30 }]);
  const circle = boltCircle({ n: 6, r: 50 });
  assert.equal(circle.length, 6);
  for (const p of circle) close(Math.hypot(p.x, p.y), 50, 1e-11);
  const r = solve(pattern(circle.map((p) => [p.x, p.y])));
  close(r.props.J, 15000, 1e-10);
  const st = staggeredRows({ rows: 2, perRow: 3, sx: 60, sy: 40 });
  assert.equal(st.length, 6);
  close(st.reduce((s, p) => s + p.x, 0) / 6, 0, 1e-12);
  assert.equal(st[3].x - st[0].x, 30);
  const m = mirror([{ x: 10, y: 5 }, { x: 0, y: 7 }], { axis: "x", c: 0 });
  assert.deepEqual(m, [{ x: -10, y: 5 }], "the image on the mirror line coincides with its source and is skipped");
  assert.deepEqual(mirror([{ x: 10, y: 5 }], { axis: "y", c: 1, existing: [] }), [{ x: 10, y: -3 }]);
  assert.throws(() => rectangularArray({ nx: 0, ny: 2, sx: 1, sy: 1 }));
});

test("scene model places centroids, load point and vectors through one transform", () => {
  const p = examplePattern("N-mm");
  const r = solve(p);
  const s = buildScene(p, r, { width: 800, height: 500 });
  const { scale, ox, oy } = s.transform;
  const scr = (w) => ({ x: ox + scale * w.x, y: oy - scale * w.y });
  for (const c of s.centroids) assert.deepEqual(c.screen, scr(c.world));
  assert.deepEqual(s.load.screen, scr({ x: 150, y: 0 }));
  for (const v of s.vectors) {
    assert.deepEqual(v.screen.from, scr(v.world.from));
    assert.deepEqual(v.screen.to, scr(v.world.to));
  }
  const reactions = s.vectors.filter((v) => v.kind === "reaction");
  assert.equal(reactions.length, 4);
  // Reaction vectors are parallel to the fastener load and scale with it.
  for (const v of reactions) {
    const f = r.fasteners.find((q) => q.id === v.id);
    const dx = v.world.to.x - v.world.from.x, dy = v.world.to.y - v.world.from.y;
    close(dx * f.shear.Ry - dy * f.shear.Rx, 0, 1e-9);
  }
  assert.deepEqual(s.centroids.map((c) => c.key), ["Cs", "Ca", "Cg"]);
  const pinned = buildScene(p, r, { width: 800, height: 500 }, { transform: { scale: 2, ox: 10, oy: 20 } });
  assert.deepEqual(pinned.load.screen, { x: 310, y: 20 });
});

test("display formatting", () => {
  assert.equal(fmt(8670.8123), "8671");
  assert.equal(fmt(-1.5e6), "−1500000");
  assert.equal(fmt(1e-12, 4, 1000), "0");
  assert.equal(fmt(0.000012345, 3), "1.23e-5");
  assert.equal(fmt(NaN), "—");
});

test("WebMCP tools answer from the same core", async () => {
  const tools = [];
  globalThis.document = { modelContext: { registerTool: (t) => tools.push(t) } };
  try {
    const p = examplePattern("N-mm");
    const ok = registerTools({ current: () => ({ pattern: p, result: solve(p) }), markdown: (q) => toMarkdown(q, solve(q)) });
    assert.ok(ok);
    assert.deepEqual(tools.map((t) => t.name), ["get_metadata", "get_current_pattern", "analyze_pattern", "export_markdown"]);
    const call = async (name, input) => JSON.parse((await tools.find((t) => t.name === name).execute(input)).content[0].text);
    const meta = await call("get_metadata", {});
    assert.equal(meta.warnings["E-011"], CATALOG["E-011"]);
    const cur = await call("get_current_pattern", {});
    assert.equal(cur.results.section.J, 13600);
    const q = clone(p);
    q.fasteners.pop();
    const an = await call("analyze_pattern", { pattern: q });
    assert.equal(an.results.fasteners.length, 3);
    const bad = await call("analyze_pattern", { pattern: { schemaVersion: 9 } });
    assert.equal(bad.issues[0].id, "E-013");
    const md = await call("export_markdown", {});
    assert.match(md.markdown, /```json/);
  } finally {
    delete globalThis.document;
  }
});

test("the published page and data are built from the current sources", async () => {
  const outputs = await render();
  assert.equal(await readFile(new URL("index.html", VIZ), "utf8"), outputs["index.html"], "run node visuals/fastener-cg/build.mjs");
  assert.equal(await readFile(new URL("raw.json", VIZ), "utf8"), outputs["raw.json"], "run node visuals/fastener-cg/build.mjs");
  const script = bundle();
  assert.ok(!/^\s*(import|export)\b/m.test(script));
  assert.doesNotThrow(() => new Function(`return () => { ${script} }`));
  const html = outputs["index.html"];
  // The shared beamdswitch template is inlined verbatim; its header comment cites beamdswitch's address.
  const shared = await readFile(new URL("./fixtures/beamdswitch/template.js", import.meta.url), "utf8");
  assert.ok(html.includes(shared), "the page inlines the site's templates/beamdswitch.js unchanged");
  assert.ok(!/<script[^>]+src=|<link[^>]+stylesheet|https?:\/\/(?!www\.w3\.org)/.test(html.replace(shared, "").replace(/<a [^>]*>/g, "")), "offline: no external scripts, styles or fetches");
  const raw = JSON.parse(outputs["raw.json"]);
  assert.equal(raw.warnings.length, Object.keys(CATALOG).length);
  assert.ok(raw.verification.cases.length >= 31);
  // The panel cites both published references.
  assert.ok(html.includes('<a href="https://www.boltcouncil.org/files/2ndEditionGuide.pdf">'));
  assert.ok(html.includes('<a href="https://ej.aisc.org/index.php/engj/article/download/378/377">'));
});

/* ---- M2: allowables, interaction, exact-k MS ---- */

function loaded(Fs, Ft, a = 2, b = 2) {
  const p = pattern([[50, 30], [50, -30], [-50, 30], [-50, -30]], { point: { x: 150, y: 0, z: 20 }, Fy: -10000, Fz: 6000, Mx: 90000 });
  p.defaults.shearAllowable = Fs;
  p.defaults.tensionAllowable = Ft;
  p.settings.interaction = { a, b };
  return p;
}
const interactionOf = (f) => f.checks.modes.find((m) => m.mode === "interaction");

test("VC-07 through the solver: exact k*, IF(1) and the W-006 reconciliation", () => {
  const run = (a, b) => {
    const p = pattern([[0, 0]], { Fy: -600, Fz: 500 });
    p.defaults.shearAllowable = 1000;
    p.defaults.tensionAllowable = 1000;
    p.settings.interaction = { a, b };
    return solve(p);
  };
  const e = run(2, 2);
  const m = interactionOf(e.fasteners[0]);
  close(m.IF1, 0.61, 1e-12);
  close(m.kStar, 1 / Math.sqrt(0.61), 1e-12);
  assert.equal(Number(m.ms.toFixed(4)), 0.2804);
  assert.ok(ids(e.issues).includes("W-006"));
  assert.notEqual(Number(m.ms.toFixed(3)), Number((1 / 0.61 - 1).toFixed(3)), "not the 1/IF − 1 convention (0.639)");
  const l = run(1, 1);
  const n = interactionOf(l.fasteners[0]);
  close(n.IF1, 1.1, 1e-12);
  close(n.ms, 1 / 1.1 - 1, 1e-12);
  assert.equal(Number(n.ms.toFixed(4)), -0.0909);
  assert.ok(!ids(l.issues).includes("W-006"));
});

test("Brent solve matches closed forms and reports iterations", () => {
  const r = brent((x) => x * x - 2, 0, 2);
  assert.ok(r.converged);
  close(r.root, Math.SQRT2, 1e-12);
  assert.ok(r.iterations > 0 && r.iterations < 60);
  assert.equal(brent((x) => x * x + 1, 0, 2).converged, false, "no sign change: no root, no number");
  // Unequal exponents: bisect independently and compare.
  const input = { Rs: 830, tensionAt: (k) => k * 410, Fs: 1000, Ft: 700, a: 2.4, b: 1.3 };
  const s = solveScale(input);
  let lo = 0, hi = 10;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (interactionValue(mid, input) < 1) lo = mid; else hi = mid; }
  close(s.kStar, (lo + hi) / 2, 1e-10);
  assert.equal(s.status, "ok");
});

test("preload that alone exceeds the allowable and zero-load fasteners are not given fake margins", () => {
  const pre = solveScale({ Rs: 100, tensionAt: (k) => 1200 + k * 50, Fs: 1000, Ft: 1000, a: 2, b: 2 });
  assert.equal(pre.status, "preload");
  assert.equal(pre.ms, null);
  const idle = solveScale({ Rs: 0, tensionAt: () => 0, Fs: 1000, Ft: 1000, a: 2, b: 2 });
  assert.equal(idle.status, "unloaded");
  assert.equal(idle.ms, Infinity);
  const bad = solveScale({ Rs: NaN, tensionAt: (k) => k, Fs: 1, Ft: 1, a: 2, b: 2 });
  assert.equal(bad.status, "not-computed");
  assert.equal(bad.ms, null);
});

test("interaction uses positive tension only and flags unloading as zero (N-006)", () => {
  const r = solve(loaded(8000, 9000));
  assert.ok(r.ok);
  for (const f of r.fasteners) {
    const m = interactionOf(f);
    assert.equal(m.Rt, Math.max(f.axial.T, 0));
    close(m.IF1, (f.shear.Rs / 8000) ** 2 + (Math.max(f.axial.T, 0) / 9000) ** 2, 1e-12);
    close((m.kStar * f.shear.Rs / 8000) ** 2 + (m.kStar * m.Rt / 9000) ** 2, 1, 1e-10);
  }
  assert.ok(r.fasteners.some((f) => f.axial.T < 0));
  assert.ok(ids(r.issues).includes("N-006"));
});

test("allowables: group defaults, sparse per-fastener overrides, and 'not evaluated' without them", () => {
  const p = loaded(8000, 9000);
  p.fasteners[2].overrides = { shearAllowable: 4000 };
  p.fasteners[3].overrides = { tensionAllowable: null };
  const r = solve(p);
  assert.equal(interactionOf(r.fasteners[0]).Fs, 8000);
  assert.equal(interactionOf(r.fasteners[2]).Fs, 4000);
  const none = interactionOf(r.fasteners[3]);
  assert.equal(none.status, "not-evaluated");
  assert.deepEqual(none.missing, ["Ft"]);
  assert.equal(none.ms, null);
  assert.equal(r.fasteners[3].checks.governing, null);
  const min = Math.min(...r.fasteners.filter((f) => f.checks.governing).map((f) => f.checks.governing.ms));
  assert.equal(r.critical.ms, min);
  assert.equal(r.critical.mode, "interaction");
  // No allowables at all: nothing is evaluated and there is no critical fastener.
  const bare = solve(loaded(null, null));
  assert.equal(bare.critical, null);
  assert.ok(bare.fasteners.every((f) => interactionOf(f).status === "not-evaluated"));
});

test("round-off loads on the neutral axis or at Cs count as zero: no spurious W-008 or N-006", () => {
  const grid = [];
  for (const y of [0.1, 0.2, 0.3]) for (const x of [0.1, 0.2, 0.3]) grid.push([x, y]);
  const run = (load) => {
    const p = pattern(grid, load);
    p.defaults.diameter = null; // a 0.1-pitch grid would otherwise overlap (E-005)
    p.defaults.shearAllowable = 1000;
    p.defaults.tensionAllowable = 1000;
    return solve(p);
  };
  // Ca.x computes to 0.2 + 4e-17, so under My the middle column carries T ≈ ±4.6e-13.
  const middle = ["F2", "F5", "F8"];
  for (const My of [-1000, 1000]) {
    const r = run({ point: { x: 0.2, y: 0.2, z: 0 }, My });
    assert.ok(r.ok);
    assert.ok(!ids(r.issues).includes("W-008"));
    for (const id of middle) {
      const f = r.fasteners.find((q) => q.id === id);
      assert.ok(f.axial.T !== 0 && Math.abs(f.axial.T) < 1e-9, `${id} T = ${f.axial.T} should be round-off`);
      const m = interactionOf(f);
      assert.equal(m.Rt, 0);
      assert.equal(m.status, "unloaded");
    }
    const zeroed = r.fasteners.filter((f) => f.checks.unloadingCountedZero).map((f) => f.id);
    assert.deepEqual(zeroed, r.fasteners.filter((f) => f.axial.unloading).map((f) => f.id));
    const n006 = r.issues.find((i) => i.id === "N-006");
    const w016 = r.issues.find((i) => i.id === "W-016");
    assert.deepEqual(n006?.fasteners, w016?.fasteners);
  }
  const t = run({ point: { x: 0.2, y: 0.2, z: 0 }, Mz: 1000 });
  assert.ok(t.ok);
  assert.ok(!ids(t.issues).includes("W-008"));
  const centre = interactionOf(t.fasteners.find((f) => f.id === "F5"));
  assert.equal(centre.Rs, 0);
  assert.equal(centre.status, "unloaded");
});

test("no finite margin: the UI and Markdown say why (no allowables, all unloaded, all not computed)", () => {
  const markdownLine = (p) => toMarkdown(p, solve(p)).split("\n").find((l) => l.startsWith("No "));
  const bare = loaded(null, null);
  assert.equal(markdownLine(bare), "No margin evaluated: no allowables entered.");
  const idle = pattern([[50, 30], [50, -30], [-50, 30], [-50, -30]]);
  idle.defaults.shearAllowable = 8000;
  idle.defaults.tensionAllowable = 9000;
  const r = solve(idle);
  assert.equal(r.critical, null);
  assert.ok(r.evaluatedCount > 0);
  assert.equal(markdownLine(idle), "No finite margin — unloaded (MS = ∞): F1, F2, F3, F4.");
  const huge = loaded(1e30, 1e30);
  const h = solve(huge);
  assert.equal(h.critical, null);
  assert.ok(h.fasteners.every((f) => interactionOf(f).status === "not-computed"));
  assert.equal(markdownLine(huge), "No finite margin — MS not computed: F1, F2, F3, F4.");
});

test("exponent and allowable input errors: E-008, E-002, W-007", () => {
  let r = solve(loaded(8000, 9000, 0, 2));
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues.filter((i) => i.id === "E-008").map((i) => i.field), ["settings.interaction.a"]);
  r = solve(loaded(8000, 9000, 2, -1));
  assert.deepEqual(r.issues.filter((i) => i.id === "E-008").map((i) => i.field), ["settings.interaction.b"]);
  r = solve(loaded(8000, 9000, 0.5, 2));
  assert.ok(r.ok);
  assert.ok(ids(r.issues).includes("W-007"));
  assert.ok(ids(r.issues).includes("W-006"));
  r = solve(loaded(8000, 9000, "two", 2));
  assert.deepEqual(r.issues.filter((i) => i.tier === "error").map((i) => [i.id, i.field]), [["E-002", "settings.interaction.a"]]);
  const p = loaded(-5, 9000);
  p.fasteners[1].overrides = { tensionAllowable: 0 };
  r = solve(p);
  assert.deepEqual(r.issues.filter((i) => i.tier === "error").map((i) => [i.id, i.fastener, i.field]),
    [["E-002", null, "defaults.shearAllowable"], ["E-002", "F2", "tensionAllowable"]]);
});

test("Markdown carries the margins and W-006, and the table fallback keeps per-fastener allowables", () => {
  const p = loaded(8000, 9000);
  p.fasteners[1].overrides = { shearAllowable: 5000 };
  const md = toMarkdown(p, solve(p));
  assert.match(md, /## Margins of safety/);
  assert.match(md, /Critical fastener: \*\*F\d\*\*/);
  assert.match(md, /\| W-006 \|/);
  assert.equal(toJSON(parseMarkdown(md).pattern), toJSON(p));
  const fallback = parseMarkdown(md.replace('"Fy": -10000', '"Fy": -1'));
  assert.equal(fallback.source, "tables");
  assert.deepEqual(fallback.pattern.fasteners[1].overrides, { shearAllowable: 5000, tensionAllowable: 9000 });
  assert.equal(fallback.pattern.defaults.shearAllowable, null, "defaults revert to the app's (none shipped)");
});

/* ---- M3: prying, preload, separation ---- */

function tee({ prying = false, preload = false } = {}) {
  // 2×2 tee flange in tension: Fz = 40 kN centred, so each bolt sees T = 10 kN.
  const p = pattern([[50, 30], [50, -30], [-50, 30], [-50, -30]], { Fz: 40000, Fy: -4000 });
  p.defaults.shearAllowable = 20000;
  p.defaults.tensionAllowable = 30000;
  p.plates = [{ ...examplePattern("N-mm").plates[0], thickness: 8, flangeStrength: 250 }];
  p.defaults.prying = { b: 40, a: 35, p: 60, holeDiameter: 14, boltStrengthB: 40000, manualFactor: null };
  p.defaults.preload = { pMax: 20000, pMin: 16000, phi: 0.2 };
  p.settings.prying = { enabled: prying };
  p.settings.preload = { enabled: preload };
  return p;
}
const checksOf = (r, i = 0) => r.fasteners[i].checks;

test("VC-08 through the solver: bolt load, clamp force, separation load and W-013", () => {
  const one = (Fz) => {
    const p = pattern([[0, 0]], { Fz });
    p.settings.preload = { enabled: true };
    p.defaults.preload = { pMax: 20000, pMin: 16000, phi: 0.2 };
    return solve(p);
  };
  const a = one(10000), b = one(25000);
  close(checksOf(a).tension.Fb, 22000, 1e-12);
  close(checksOf(a).tension.preload.clamp, 8000, 1e-12);
  close(checksOf(a).tension.preload.separationLoad, 20000, 1e-12);
  assert.equal(checksOf(a).clamp.status, "clamped");
  close(checksOf(b).tension.Fb, 25000, 1e-12);
  assert.equal(checksOf(b).clamp.status, "separated");
  assert.ok(ids(b.issues).includes("W-013"));
  assert.ok(!ids(a.issues).includes("W-013"));
  assert.ok(ids(a.issues).includes("N-005"));
});

test("T-stub prying follows the section 5.6 equations term by term", () => {
  const P = { B: 40000, b: 40, a: 35, p: 60, dh: 14, D: 12, t: 8, Fp: 250 };
  const T = 10000;
  const r = tStubPrying(T, P);
  const bP = 40 - 6, aP = 35 + 6, rho = bP / aP, delta = 1 - 14 / 60;
  const tc = Math.sqrt((4 * 40000 * bP) / (60 * 250));
  const alpha = Math.min(Math.max((1 / delta) * ((T / 40000) * (tc / 8) ** 2 - 1), 0), 1);
  close(r.tc, tc, 1e-12);
  close(r.alpha, alpha, 1e-12);
  assert.ok(alpha > 0 && alpha < 1, "this case sits between the clamps");
  close(r.Q, 40000 * delta * alpha * rho * (8 / tc) ** 2, 1e-12);
  // a above 1.25·b is limited.
  close(tStubPrying(T, { ...P, a: 80 }).aUsed, 50, 1e-12);
  assert.equal(tStubPrying(T, { ...P, a: 80 }).aLimited, true);
  // No positive tension, no prying.
  assert.equal(tStubPrying(0, P).Q, 0);
});

test("prying and preload feed the interaction through the bolt load, re-evaluated at k", () => {
  const plain = solve(tee());
  const pry = solve(tee({ prying: true }));
  const both = solve(tee({ prying: true, preload: true }));
  for (const r of [plain, pry, both]) assert.ok(r.ok, JSON.stringify(r.issues.filter((i) => i.tier === "error")));
  const c0 = checksOf(plain), c1 = checksOf(pry), c2 = checksOf(both);
  close(c0.tension.Fb, 10000, 1e-12);
  assert.ok(c1.tension.Q > 0);
  close(c1.tension.Fb, 10000 + c1.tension.Q, 1e-12);
  close(c2.tension.Fb, Math.max(20000 + 0.2 * 10000, 10000) + c2.tension.Q, 1e-12);
  // Margins fall as prying and preload add bolt tension, and k* satisfies IF(k*) = 1 through the chain.
  const m = (c) => c.modes[0];
  assert.ok(m(c1).ms < m(c0).ms);
  const P = { B: 40000, b: 40, a: 35, p: 60, dh: 14, D: 12, t: 8, Fp: 250 };
  const Fb = (k) => boltLoad(k * 10000, { kind: "t-stub", params: P }, { pMax: 20000, pMin: 16000, phi: 0.2 }).Fb;
  const k = m(c2).kStar;
  close((k * m(c2).Rs / 20000) ** 2 + (Fb(k) / 30000) ** 2, 1, 1e-9);
  assert.ok(ids(plain.issues).includes("N-007"));
});

test("manual prying factor overrides the T-stub (W-012) and needs no flange geometry", () => {
  const p = tee({ prying: true });
  p.defaults.prying = { b: null, a: null, p: null, holeDiameter: null, boltStrengthB: null, manualFactor: 1.25 };
  p.plates[0].flangeStrength = null;
  const r = solve(p);
  assert.ok(r.ok, JSON.stringify(r.issues.filter((i) => i.tier === "error")));
  close(checksOf(r).tension.Fb, 12500, 1e-12);
  assert.ok(ids(r.issues).includes("W-012"));
  p.defaults.prying.manualFactor = 0.8;
  assert.deepEqual(solve(p).issues.filter((i) => i.tier === "error").map((i) => [i.id, i.field]), [["E-002", "defaults.prying.manualFactor"]]);
});

test("prying and preload input errors: E-007, E-009, E-014, E-002, per-fastener overrides", () => {
  let p = tee({ prying: true });
  p.defaults.prying.boltStrengthB = null;
  p.plates[0].flangeStrength = null;
  let errs = solve(p).issues.filter((i) => i.tier === "error");
  assert.deepEqual(errs.map((i) => [i.id, i.field]).sort(), [["E-007", "defaults.prying.boltStrengthB"], ["E-007", "plates.P1.flangeStrength"]]);

  p = tee({ prying: true });
  p.defaults.prying.b = 5; // b ≤ D/2
  errs = solve(p).issues.filter((i) => i.tier === "error");
  assert.ok(errs.length && errs.every((i) => i.id === "E-002" && i.field === "defaults.prying.b"));

  p = tee({ preload: true });
  p.defaults.preload.phi = null;
  errs = solve(p).issues.filter((i) => i.tier === "error");
  assert.deepEqual(errs.map((i) => i.id), ["E-009"]);
  p.defaults.preload.phi = 1;
  assert.deepEqual(solve(p).issues.filter((i) => i.tier === "error").map((i) => i.id), ["E-009"]);

  p = tee({ preload: true });
  p.fasteners[2].overrides = { preload: { pMax: 10000 } };
  errs = solve(p).issues.filter((i) => i.tier === "error");
  assert.deepEqual(errs.map((i) => [i.id, i.fastener, i.field]), [["E-014", "F3", "preload.pMax"]]);

  // A per-fastener override is used for that fastener only.
  p = tee({ preload: true });
  p.fasteners[1].overrides = { preload: { pMax: 30000 } };
  const r = solve(p);
  close(checksOf(r, 1).tension.Fb, 30000 + 0.2 * 10000, 1e-12);
  close(checksOf(r, 0).tension.Fb, 20000 + 0.2 * 10000, 1e-12);
});

test("preload alone above the tension allowable: W-017 and no margin", () => {
  const p = tee({ preload: true });
  p.defaults.tensionAllowable = 15000; // P_max = 20 000 > Ft
  const r = solve(p);
  assert.ok(ids(r.issues).includes("W-017"));
  assert.ok(r.fasteners.every((f) => f.checks.modes[0].status === "preload" && f.checks.modes[0].ms === null));
  assert.equal(r.critical, null);
});

test("torque convenience: P = T/(K·D); K has no default", () => {
  close(preloadFromTorque(96000, 0.2, 12), 40000, 1e-12);
  assert.throws(() => preloadFromTorque(96000, null, 12));
  assert.throws(() => preloadFromTorque(96000, 0, 12));
});

test("Markdown carries the bolt tension table when prying or preload is on", () => {
  const p = tee({ prying: true, preload: true });
  const md = toMarkdown(p, solve(p));
  assert.match(md, /## Bolt tension \(prying, flange P1; preload\)/);
  assert.equal(toJSON(parseMarkdown(md).pattern), toJSON(p));
  assert.doesNotMatch(toMarkdown(tee(), solve(tee())), /## Bolt tension/);
});

test("W-013 fires on clamp force alone and quotes the actual bolt load and branch", () => {
  const one = (Fz) => {
    const p = pattern([[0, 0]], { Fz });
    p.settings.preload = { enabled: true };
    p.defaults.preload = { pMax: 20000, pMin: 16000, phi: 0.2 };
    return solve(p);
  };
  // Between P_min/(1 − φ) = 20 000 and P_max/(1 − φ) = 25 000: separated, but F_b = P_max + φ·T.
  const mid = one(21000);
  close(checksOf(mid).tension.Fb, 24200, 1e-12);
  const w = mid.issues.find((i) => i.id === "W-013");
  assert.ok(w);
  assert.match(w.detail, /F1 F_b = 2\.420e\+4 \(P_max \+ φ·T \+ Q\)/);
  assert.doesNotMatch(w.detail, /\(T \+ Q\)/);
  const far = one(30000);
  assert.match(far.issues.find((i) => i.id === "W-013").detail, /F1 F_b = 3\.000e\+4 \(T \+ Q\)/);
});

test("N-006 and the Markdown note give P_max as the unloading bolt load when preload is on", () => {
  const p = tee({ preload: true });
  p.load.My = 4e6; // T = 10 000 ± 20 000: two fasteners unload
  const r = solve(p);
  assert.ok(r.ok, JSON.stringify(r.issues.filter((i) => i.tier === "error")));
  const zeroed = r.fasteners.filter((f) => f.checks.unloadingCountedZero);
  assert.equal(zeroed.length, 2);
  for (const f of zeroed) close(f.checks.tension.Fb, 20000, 1e-12);
  assert.match(r.issues.find((i) => i.id === "N-006").detail, /zero external tension, so their bolt load is P_max/);
  assert.match(toMarkdown(p, r), /unloading counts as zero external tension, so the bolt load is P_max\./);
  p.settings.preload.enabled = false;
  const off = solve(p);
  assert.doesNotMatch(off.issues.find((i) => i.id === "N-006").detail, /P_max/);
  assert.doesNotMatch(toMarkdown(p, off), /so the bolt load is P_max/);
});

test("group-default P_max < P_min raises one E-014 with no fastener id", () => {
  const p = tee({ preload: true });
  p.defaults.preload.pMax = 10000;
  const errs = solve(p).issues.filter((i) => i.tier === "error");
  assert.deepEqual(errs.map((i) => [i.id, i.fastener, i.field]), [["E-014", null, "defaults.preload.pMax"]]);
  assert.doesNotMatch(errs[0].detail, /F\d/);
});

test("all-manual prying needs no flange thickness; a T-stub fastener still does", () => {
  const p = tee({ prying: true });
  p.defaults.prying.manualFactor = 1.25;
  p.plates[0].thickness = null;
  const r = solve(p);
  assert.ok(r.ok, JSON.stringify(r.issues.filter((i) => i.tier === "error")));
  p.fasteners[0].overrides = { prying: { manualFactor: null } };
  assert.deepEqual(solve(p).issues.filter((i) => i.tier === "error").map((i) => [i.id, i.field]), [["E-007", "plates.P1.thickness"]]);
});

/* ---- M4: plates, bearing, tear-out, contact edge, geometry checks ---- */

const plateOf = (id, over = {}) => ({ id, thickness: 10, xMin: -80, xMax: 80, yMin: -50, yMax: 50, bearingAllowable: null, bearingLoadAllowable: null, shearOutAllowable: null, minEdgeRatio: null, flangeStrength: null, ...over });
function bracket(load = { Fy: -10000 }, plates = [plateOf("P1")]) {
  const p = pattern([[50, 30], [50, -30], [-50, 30], [-50, -30]], load);
  p.plates = plates;
  return p;
}
const errors = (r) => r.issues.filter((i) => i.tier === "error");
const modeOf = (f, mode, plate) => f.checks.modes.find((m) => m.mode === mode && m.plate === plate);

test("ray cast to the plate rectangle and edge distance", () => {
  const P = plateOf("P1");
  close(rayToRect(50, 30, 0, 1, P), 20, 1e-12);
  close(rayToRect(50, 30, 1, 0, P), 30, 1e-12);
  const d = Math.SQRT1_2;
  close(rayToRect(50, 30, d, d, P), 20 / d, 1e-12, "the nearer of the two edges along the diagonal");
  close(rayToRect(0, 0, -0.6, -0.8, P), 50 / 0.8, 1e-12);
  assert.equal(edgeDistance(50, 30, P), 20);
  assert.ok(edgeDistance(90, 0, P) < 0);
});

test("geometry consistency: E-004, E-005, E-006, W-009 name the fasteners", () => {
  let r = solve(bracket({ point: { x: 150, y: 0, z: 0 }, Fy: -10000 }));
  assert.ok(r.ok);
  assert.ok(ids(r.issues).includes("W-009"), "load point (150, 0) is outside P1");
  assert.ok(!ids(solve(bracket({ point: { x: 10, y: 0, z: 0 }, Fy: -1 })).issues).includes("W-009"));
  let p = bracket({ point: { x: 0, y: 0, z: 0 }, Fy: -100 });
  p.fasteners[0].x = 90;
  r = solve(p);
  assert.deepEqual(errors(r).map((i) => [i.id, i.fastener]), [["E-004", "F1"]]);
  p = bracket({ point: { x: 0, y: 0, z: 0 }, Fy: -100 });
  p.fasteners[0].x = 77; // 3 from xMax, D/2 = 6
  r = solve(p);
  assert.deepEqual(errors(r).map((i) => [i.id, i.fastener]), [["E-006", "F1"]]);
  p = bracket({ point: { x: 0, y: 0, z: 0 }, Fy: -100 });
  p.fasteners[1].y = 22; // 8 from F1, D = 12
  r = solve(p);
  assert.deepEqual(errors(r).map((i) => [i.id, i.fasteners]), [["E-005", ["F1", "F2"]]]);
  // Every plate is checked: a second, smaller plate catches a fastener the first does not.
  p = bracket({ point: { x: 0, y: 0, z: 0 }, Fy: -100 }, [plateOf("P1"), plateOf("P2", { xMin: -40 })]);
  r = solve(p);
  assert.deepEqual(errors(r).map((i) => [i.id, i.fastener]).sort(), [["E-004", "F3"], ["E-004", "F4"]]);
});

test("bearing: Fbr·D·t or a direct allowable; not evaluated without one; E-007 without t", () => {
  let r = solve(bracket({ point: { x: 0, y: 0, z: 0 }, Fy: -10000 }, [plateOf("P1", { bearingAllowable: 300 })]));
  const b = modeOf(r.fasteners[0], "bearing", "P1");
  close(b.capacity, 300 * 12 * 10, 1e-12);
  close(b.ms, 36000 / 2500 - 1, 1e-12);
  assert.equal(r.critical.mode, "bearing");
  assert.equal(r.critical.plate, "P1");
  r = solve(bracket({ point: { x: 0, y: 0, z: 0 }, Fy: -10000 }, [plateOf("P1", { bearingAllowable: 300, bearingLoadAllowable: 20000 })]));
  close(modeOf(r.fasteners[0], "bearing", "P1").capacity, 20000, 1e-12, "the direct-load allowable overrides Fbr·D·t");
  r = solve(bracket({ point: { x: 0, y: 0, z: 0 }, Fy: -10000 }));
  assert.equal(modeOf(r.fasteners[0], "bearing", "P1").status, "not-evaluated");
  assert.equal(r.critical, null);
  r = solve(bracket({ point: { x: 0, y: 0, z: 0 }, Fy: -10000 }, [plateOf("P1", { bearingAllowable: 300, thickness: null })]));
  assert.deepEqual(errors(r).map((i) => [i.id, i.field]), [["E-007", "plates.P1.thickness"]]);
});

test("tear-out: the ray follows −R in the loaded plate and +R in the other", () => {
  const plates = [plateOf("P1", { shearOutAllowable: 200, minEdgeRatio: 2 }), plateOf("P2", { shearOutAllowable: 200, minEdgeRatio: 2 })];
  const r = solve(bracket({ point: { x: 0, y: 0, z: 0 }, Fx: 6000 }, plates));
  const f = r.fasteners.find((q) => q.x === 50 && q.y === 30);
  const loaded = modeOf(f, "tearout", "P1"), other = modeOf(f, "tearout", "P2");
  close(loaded.e, 130, 1e-12, "P1 is pushed +x, so its fastener bears towards −x: 50 − (−80)");
  close(other.e, 30, 1e-12, "P2 is pushed by the fastener towards +x: 80 − 50");
  close(other.capacity, 2 * 10 * (30 - 6) * 200, 1e-12);
  close(other.ms, other.capacity / 1500 - 1, 1e-12);
  assert.equal(r.critical.plate, "P2");
  assert.ok(!ids(r.issues).includes("W-011"), "e/D = 30/12 = 2.5 and 130/12 are both above the minimum of 2");
});

test("W-011 fires when e/D along the bearing direction is below the minimum", () => {
  const plates = [plateOf("P1"), plateOf("P2", { shearOutAllowable: 200, minEdgeRatio: 3 })];
  const r = solve(bracket({ point: { x: 0, y: 0, z: 0 }, Fx: 6000 }, plates));
  const w = r.issues.find((i) => i.id === "W-011");
  assert.ok(w);
  assert.deepEqual(w.fasteners, ["F1", "F2"]);
});

test("contact-edge method (b): T = M_L·ka·d/Σka·d², C = ΣT − Fz, Fz lever included", () => {
  const p = bracket({ point: { x: 0, y: 70, z: 0 }, Fz: 1000 });
  p.settings.axialMethod = "contact-edge";
  p.settings.contactEdge = { plateId: "P1", edge: "yMin" };
  const r = solve(p);
  assert.ok(r.ok, JSON.stringify(errors(r)));
  // Fz at y = 70 about the edge y = −50: M_L = (70 − (−50))·Fz = 120 000.
  close(r.axial.ML, 120000, 1e-12);
  const S = 2 * 80 ** 2 + 2 * 20 ** 2;
  const top = r.fasteners.find((f) => f.y === 30), bottom = r.fasteners.find((f) => f.y === -30);
  close(top.axial.T, (120000 * 80) / S, 1e-12);
  close(bottom.axial.T, (120000 * 20) / S, 1e-12);
  close(r.axial.C, (2 * 120000 * 100) / S - 1000, 1e-12);
  assert.ok(r.closure.pass);
  assert.ok(!ids(r.issues).includes("W-005"), "W-005 belongs to method (a)");
  assert.ok(!ids(r.issues).includes("W-016"));
});

test("contact-edge method (b): E-012, W-010, W-021, and the compressive-side suggestion", () => {
  const run = (load, edge) => {
    const p = bracket(load);
    p.settings.axialMethod = "contact-edge";
    p.settings.contactEdge = { plateId: "P1", edge };
    return solve(p);
  };
  let r = run({ point: { x: 0, y: 0, z: 0 }, Mx: 12000, My: 5000 }, "yMin");
  assert.deepEqual(errors(r).map((i) => i.id), ["E-012"]);
  r = run({ point: { x: 0, y: 0, z: 0 }, Mx: -12000 }, "yMin");
  assert.ok(r.ok);
  assert.ok(ids(r.issues).includes("W-010"));
  assert.ok(r.fasteners.every((f) => f.axial.T === 0));
  r = run({ point: { x: 0, y: 0, z: 0 }, Mx: 1000, Fz: 5000 }, "yMin"); // tension through Ca exceeds the moment's reaction
  assert.ok(ids(r.issues).includes("W-021"));
  const P = plateOf("P1");
  assert.equal(suggestContactEdge(P, { point: { x: 0, y: 0, z: 0 }, Fx: 0, Fy: 0, Fz: 0, Mx: 12000, My: 0, Mz: 0 }, { x: 0, y: 0 }), "yMin");
  assert.equal(suggestContactEdge(P, { point: { x: 0, y: 0, z: 0 }, Fx: 0, Fy: 0, Fz: 0, Mx: 0, My: 12000, Mz: 0 }, { x: 0, y: 0 }), "xMax");
  assert.equal(edgeFrame(P, "xMin", { point: { x: 0, y: 0, z: 0 }, Fx: 0, Fy: 0, Fz: 0, Mx: 0, My: 12000, Mz: 0 }, { x: 0, y: 0 }).ML, -12000);
});

test("M4 persistence and units: contact-edge settings round-trip; the direct bearing allowable is a force", () => {
  const p = bracket({ point: { x: 0, y: 0, z: 0 }, Mx: 12000 }, [plateOf("P1", { bearingLoadAllowable: 20000, bearingAllowable: 300 })]);
  p.settings.axialMethod = "contact-edge";
  p.settings.contactEdge = { plateId: "P1", edge: "yMin" };
  assert.equal(toJSON(parseJSON(toJSON(p)).pattern), toJSON(p));
  const q = convertPattern(p, "in-lbf");
  assert.equal(q.plates[0].bearingLoadAllowable, Number((20000 / N_PER_LBF).toPrecision(12)));
  assert.equal(q.plates[0].bearingAllowable, Number((300 * MM_PER_IN ** 2 / N_PER_LBF).toPrecision(12)));
  // A pre-M4 plate without the new field loads with W-018.
  const old = JSON.parse(toJSON(p));
  delete old.plates[0].bearingLoadAllowable;
  const back = parseJSON(JSON.stringify(old));
  assert.ok(back.pattern);
  assert.match(back.issues.find((i) => i.id === "W-018").detail, /plates\[0\]\.bearingLoadAllowable/);
});

test("scene model draws the contact edge through the same transform", () => {
  const p = bracket({ point: { x: 0, y: 0, z: 0 }, Mx: 12000 });
  p.settings.axialMethod = "contact-edge";
  p.settings.contactEdge = { plateId: "P1", edge: "yMin" };
  const s = buildScene(p, solve(p), { width: 600, height: 400 });
  const { scale, ox, oy } = s.transform;
  assert.deepEqual(s.contactEdge.screen.from, { x: ox + scale * -80, y: oy - scale * -50 });
  assert.deepEqual(s.contactEdge.screen.to, { x: ox + scale * 80, y: oy - scale * -50 });
  assert.ok(s.legend.some((e) => e.key === "contactEdge"));
  assert.equal(buildScene(bracket(), null, { width: 600, height: 400 }).contactEdge, null);
});

test("hit testing a contact-edge scene finds fasteners and empty space without drawing", () => {
  const p = bracket({ point: { x: 0, y: 0, z: 0 }, Mx: 12000 });
  p.settings.axialMethod = "contact-edge";
  p.settings.contactEdge = { plateId: "P1", edge: "yMin" };
  const s = buildScene(p, solve(p), { width: 600, height: 400 });
  assert.ok(s.contactEdge);
  const m = s.markers[0];
  assert.deepEqual(hitTest(s, m.screen), { kind: "fastener", id: m.id });
  assert.equal(hitTest(s, { x: -1000, y: -1000 }), null);
});

/* ---- M5: ICR, design basis, elastic vs ICR ---- */

const ICR = { rult: 1000, mu: 0.3937, lambda: 0.55, deltaMax: 8.6, deltaY: null };
function withIcr(p, { model = "crawford-kulak", basis = "elastic", icr = {} } = {}) {
  p.settings.icr = { enabled: true, model };
  p.settings.designBasis = basis;
  p.defaults.icr = { ...ICR, ...icr };
  return p;
}
const RECT4 = [[50, 30], [50, -30], [-50, 30], [-50, -30]];

test("ICR responses: Crawford-Kulak and elastic-perfectly-plastic", () => {
  const f = { icr: { ...ICR, deltaY: 1 } };
  close(response("crawford-kulak", f, 8.6), 1000 * (1 - Math.exp(-0.3937 * 8.6)) ** 0.55, 1e-12);
  close(response("elastic-plastic", f, 0.5), 500, 1e-12);
  close(response("elastic-plastic", f, 5), 1000, 1e-12);
});

test("ICR eccentric solve: the ICR balances force and moment, sits opposite the load, and the governing bolt reaches Δmax", () => {
  const r = solve(withIcr(pattern(RECT4, { point: { x: 150, y: 0, z: 0 }, Fy: -10000 })));
  assert.ok(r.ok);
  const ic = r.icr;
  assert.equal(ic.status, "converged");
  assert.ok(ic.icr.x < 0, "opposite side of Cs from the load at x = 150");
  const gov = ic.loads.find((l) => l.id === ic.governing);
  close(gov.delta, 8.6, 1e-12);
  // Independent check at the reported ICR: resultant along −y equals P_u, moment balances.
  const st = rotationState(RECT4.map(([x, y], i) => ({ id: `F${i + 1}`, x, y, icr: ICR })), ic.icr, -1, "crawford-kulak");
  close(st.Rx, 0, 1e-9 * ic.Pu);
  close(-st.Ry, ic.Pu, 1e-9);
  close(st.M, -ic.Pu * (150 - ic.icr.x), 1e-6);
  close(ic.gamma, ic.Pu / 10000, 1e-12);
  // Reactions at the applied load sum to the applied load (proportional scaling).
  close(ic.atLoad.reduce((a, l) => a + l.Ry, 0), -10000, 1e-6);
  assert.ok(ids(r.issues).includes("N-004"));
  assert.ok(ids(r.issues).includes("N-008"));
  assert.ok(!ids(r.issues).includes("W-015"), "elastic basis");
});

test("ICR on an asymmetric group balances all three in-plane equations", () => {
  const pts = [[0, 0], [100, 0], [0, 100]];
  const fs = pts.map(([x, y], i) => ({ id: `F${i + 1}`, x, y, icr: ICR }));
  const sol = icrSolve(fs, { x: 100 / 3, y: 100 / 3 }, { Fx: 0, Fy: -1000, Mz: -1e5 });
  assert.equal(sol.status, "converged");
  assert.equal(sol.offLine, true);
  const Rx = sol.loads.reduce((a, l) => a + l.Rx, 0), Ry = sol.loads.reduce((a, l) => a + l.Ry, 0);
  close(Rx, 0, 1e-6 * sol.Pu);
  close(-Ry, sol.Pu, 1e-6);
});

test("ICR failure is reported with its residual and no partial numbers (W-014 path)", () => {
  // One fastener cannot balance an eccentric load by rotation.
  const sol = icrSolve([{ id: "F1", x: 0, y: 0, icr: ICR }], { x: 0, y: 0 }, { Fx: 0, Fy: -1000, Mz: -1e5 });
  assert.equal(sol.status, "not-converged");
  assert.equal(sol.gamma, undefined);
  assert.equal(sol.loads, undefined);
  assert.ok(sol.reason);
});

test("ICR is anchored on a ks-independent reference: loads between the geometric centre and a moved Cs converge to the uniform-ks answer", () => {
  const at = (x, ks) => {
    const p = withIcr(pattern(RECT4, { point: { x, y: 0, z: 0 }, Fy: -1000 }));
    if (ks) { p.fasteners[0].overrides = { ks: 3 }; p.fasteners[3].overrides = { ks: 0.4 }; }
    return solve(p);
  };
  const csX = at(0, true).props.Cs.x;
  close(csX, 130 / 5.4, 1e-12);
  for (const [x, gamma] of [[csX, 3.1732], [20, 3.3067], [10, 3.6504], [5, 3.8130]]) {
    const r = at(x, true);
    assert.equal(r.icr.status, "converged", `x = ${x}`);
    assert.equal(r.icr.mode, "eccentric", `x = ${x}`);
    assert.ok(!ids(r.issues).includes("W-014"));
    close(r.icr.gamma, at(x, false).icr.gamma, 1e-6, `x = ${x}`);
    close(r.icr.gamma, gamma, 1e-4, `x = ${x}`);
  }
});

test("ICR with per-fastener Rult: translation only through the Rult-weighted centroid, γ_ult continuous beside it", () => {
  const at = (x, Mz = 0) => {
    const p = withIcr(pattern(RECT4, { point: { x, y: 0, z: 0 }, Fy: -1000, Mz }));
    p.fasteners[1].overrides = { icr: { rult: 2000 } };
    p.fasteners[3].overrides = { icr: { rult: 2000 } };
    return solve(p).icr;
  };
  const through = at(0), tiny = at(0, 1);
  assert.equal(through.mode, "translation");
  assert.equal(tiny.mode, "eccentric");
  close(tiny.gamma, through.gamma, 1e-5);
  close(at(5).gamma, 5.7006, 1e-4);
  close(at(10).gamma, 5.4356, 1e-4);
  // A load along x through the reference (0, −10) is a translation; one through Cs (0, 0) is not.
  const fs = RECT4.map(([x, y], i) => ({ id: `F${i + 1}`, x, y, icr: i % 2 ? { ...ICR, rult: 2000 } : ICR }));
  assert.equal(icrSolve(fs, { x: 0, y: 0 }, { Fx: 1000, Fy: 0, Mz: 1e4 }).mode, "translation");
  const viaCs = icrSolve(fs, { x: 0, y: 0 }, { Fx: 1000, Fy: 0, Mz: 0 });
  assert.equal(viaCs.mode, "eccentric");
  assert.ok(viaCs.gamma < through.gamma);
});

test("ICR with zero in-plane load: converged zero shear, no W-014, checks run with Rs = 0", () => {
  const p = withIcr(pattern(RECT4, { Fz: 4000 }), { basis: "icr" });
  p.defaults.shearAllowable = 12000; p.defaults.tensionAllowable = 15000;
  const r = solve(p);
  assert.equal(r.icr.status, "converged");
  assert.equal(r.icr.mode, "no-shear");
  assert.equal(r.icr.icr, null);
  assert.ok(!ids(r.issues).includes("W-014"));
  for (const f of r.fasteners) {
    assert.equal(f.icr.atLoad.Rs, 0);
    const m = f.checks.modes.find((x) => x.mode === "interaction");
    assert.equal(m.Rs, 0);
    close(m.Rt, 1000, 1e-9);
    assert.ok(Number.isFinite(f.checks.governing.ms));
  }
  assert.match(toMarkdown(p, r), /## Margins of safety \(ICR basis,/);
  assert.equal(buildScene(p, r, { width: 600, height: 400 }).icr, null);
});

test("design basis ICR: checks use the ICR reactions at the applied load (W-015), tension side unchanged", () => {
  const load = { point: { x: 150, y: 0, z: 0 }, Fy: -10000, Fz: 4000 };
  const el = withIcr(pattern(RECT4, load));
  el.defaults.shearAllowable = 12000; el.defaults.tensionAllowable = 15000;
  const ic = withIcr(pattern(RECT4, load), { basis: "icr" });
  ic.defaults.shearAllowable = 12000; ic.defaults.tensionAllowable = 15000;
  const a = solve(el), b = solve(ic);
  assert.ok(a.ok && b.ok);
  assert.equal(b.designBasis, "icr");
  assert.ok(ids(b.issues).includes("W-015"));
  for (const [i, f] of b.fasteners.entries()) {
    const m = f.checks.modes[0];
    close(m.Rs, f.icr.atLoad.Rs, 1e-12);
    close(m.Rt, a.fasteners[i].checks.modes[0].Rt, 1e-12, "tension side comes from the elastic distribution");
  }
  assert.ok(b.comparison);
  assert.equal(b.comparison.elasticCritical.Rs, Math.max(...a.fasteners.map((f) => f.shear.Rs)));
  // ICR shares the torsion more evenly than the elastic method here: the critical load drops.
  assert.ok(b.comparison.change < 0);
});

test("ICR input errors: E-007 for Rult, for Δy with the elastic-plastic model, and for an ICR basis without ICR", () => {
  let p = withIcr(pattern(RECT4, { Fy: -1000 }), { icr: { rult: null } });
  assert.deepEqual(solve(p).issues.filter((i) => i.tier === "error").map((i) => [i.id, i.field]), [["E-007", "defaults.icr.rult"]]);
  p = withIcr(pattern(RECT4, { Fy: -1000 }), { model: "elastic-plastic" });
  assert.deepEqual(solve(p).issues.filter((i) => i.tier === "error").map((i) => [i.id, i.field]), [["E-007", "defaults.icr.deltaY"]]);
  p = withIcr(pattern(RECT4, { Fy: -1000 }), { model: "elastic-plastic", icr: { deltaY: 20 } });
  assert.deepEqual(solve(p).issues.filter((i) => i.tier === "error").map((i) => i.id), ["E-002"]);
  p = pattern(RECT4, { Fy: -1000 });
  p.settings.designBasis = "icr";
  assert.deepEqual(solve(p).issues.filter((i) => i.tier === "error").map((i) => [i.id, i.field]), [["E-007", "settings.designBasis"]]);
  // Elastic-plastic with a tiny Δy: every fastener away from the ICR is at Rult.
  p = withIcr(pattern(RECT4, { point: { x: 150, y: 0, z: 0 }, Fy: -10000 }), { model: "elastic-plastic", icr: { deltaY: 1e-6 } });
  const r = solve(p);
  assert.ok(r.icr.loads.every((l) => Math.abs(l.R - 1000) < 1e-6));
  assert.ok(!ids(r.issues).includes("N-008"), "N-008 is about the Crawford-Kulak defaults");
});

test("M5 persistence, units, Markdown and scene: ICR settings round-trip; Δy is a length; the ICR is drawn", () => {
  const p = withIcr(pattern(RECT4, { point: { x: 150, y: 0, z: 0 }, Fy: -10000 }), { basis: "icr" });
  assert.equal(toJSON(parseJSON(toJSON(p)).pattern), toJSON(p));
  p.defaults.icr.deltaY = 2;
  assert.equal(convertPattern(p, "in-lbf").defaults.icr.deltaY, Number((2 / MM_PER_IN).toPrecision(12)));
  const old = JSON.parse(toJSON(p));
  delete old.defaults.icr.deltaY;
  assert.match(parseJSON(JSON.stringify(old)).issues.find((i) => i.id === "W-018").detail, /defaults\.icr\.deltaY/);
  const r = solve(p);
  const md = toMarkdown(p, r);
  assert.match(md, /## ICR method/);
  assert.match(md, /Critical-fastener load: elastic F\d/);
  const sc = buildScene(p, r, { width: 600, height: 400 });
  const { scale, ox, oy } = sc.transform;
  assert.deepEqual(sc.icr.screen, { x: ox + scale * r.icr.icr.x, y: oy - scale * r.icr.icr.y });
  assert.ok(sc.legend.some((e) => e.key === "icr"));
});

/* ---- M6: shared scene model, painters, trace, reports ---- */

/* A canvas 2D context that records every call (methods) and ignores property writes. */
function recordingContext() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key === "calls") return calls;
      if (key === "measureText") return (t) => ({ width: String(t).length * 6 });
      if (key in target) return target[key];
      return (...args) => { calls.push([key, ...args]); };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return ctx;
}
const COLOURS = { bg: "#fff", fg: "#000", muted: "#666", faint: "#999", grid: "#eee", surface: "#f5f5f5", shear: "#00f", axial: "#f80", area: "#0a0", load: "#90c", reaction: "#000", tension: "#f80", focus: "#06f", mono: "monospace" };
const near = (a, b) => Math.abs(a - b) <= 1e-3;
const svgAttr = (svg, role, extra = "") => [...svg.matchAll(new RegExp(`<[a-z]+ [^>]*data-role="${role}"${extra}[^>]*>`, "g"))].map((m) => {
  const tag = m[0];
  const get = (k) => { const x = new RegExp(`\\s${k}="([^"]*)"`).exec(tag); return x ? x[1] : null; };
  return { tag, get };
});

function sceneFixture() {
  // Contact edge (method b), ICR, eccentric load, three centroids and reaction vectors all present.
  const p = pattern([[50, 30], [50, -30], [-50, 30], [-50, -30]], { point: { x: 60, y: 0, z: 0 }, Fy: -10000, Mx: 12000 });
  p.plates = [plateOf("P1")];
  p.settings.axialMethod = "contact-edge";
  p.settings.contactEdge = { plateId: "P1", edge: "yMin" };
  p.settings.icr = { enabled: true, model: "crawford-kulak" };
  p.defaults.icr = { rult: 40000, mu: 0.3937, lambda: 0.55, deltaMax: 8.6, deltaY: null };
  const r = solve(p);
  assert.ok(r.ok, JSON.stringify(r.issues.filter((i) => i.tier === "error")));
  return { p, r, scene: buildScene(p, r, { width: 700, height: 440 }) };
}

test("scene-model consistency: the SVG and canvas painters draw every key position from the scene", () => {
  const { scene } = sceneFixture();
  assert.ok(scene.contactEdge && scene.icr && scene.load && scene.centroids.length === 3);
  const svg = paintSvg(scene);
  const ctx = recordingContext();
  paint(ctx, scene, COLOURS);
  const calls = ctx.calls;
  const has = (name, ...args) => calls.some((c) => c[0] === name && args.every((a, i) => near(c[i + 1], a)));

  for (const c of scene.centroids) {
    const [el] = svgAttr(svg, "centroid", ` data-key="${c.key}"`);
    assert.ok(near(Number(el.get("data-x")), c.screen.x) && near(Number(el.get("data-y")), c.screen.y), `SVG ${c.key}`);
    const s = c.size;
    if (c.shape === "ring") assert.ok(has("arc", c.screen.x, c.screen.y, s), `canvas ring ${c.key}`);
    if (c.shape === "diamond") assert.ok(has("moveTo", c.screen.x, c.screen.y - s), `canvas diamond ${c.key}`);
    if (c.shape === "square") assert.ok(has("rect", c.screen.x - s, c.screen.y - s, 2 * s, 2 * s), `canvas square ${c.key}`);
  }
  const [load] = svgAttr(svg, "load");
  assert.ok(near(Number(load.get("data-x")), scene.load.screen.x) && near(Number(load.get("data-y")), scene.load.screen.y));
  assert.ok(has("moveTo", scene.load.screen.x - 7, scene.load.screen.y - 7));
  const [icr] = svgAttr(svg, "icr");
  assert.ok(near(Number(icr.get("data-x")), scene.icr.screen.x) && near(Number(icr.get("data-y")), scene.icr.screen.y));
  assert.ok(has("arc", scene.icr.screen.x, scene.icr.screen.y, 7));
  const [edge] = svgAttr(svg, "contact-edge");
  const ce = scene.contactEdge.screen;
  assert.deepEqual(["x1", "y1", "x2", "y2"].map((k) => Number(edge.get(k))), [ce.from.x, ce.from.y, ce.to.x, ce.to.y].map((v) => Number(v.toFixed(3))));
  assert.ok(has("moveTo", ce.from.x, ce.from.y) && has("lineTo", ce.to.x, ce.to.y));
  const vectors = svgAttr(svg, "vector");
  assert.equal(vectors.length, scene.vectors.length);
  for (const v of scene.vectors) {
    const el = vectors.find((x) => x.get("data-id") === v.id && x.get("data-kind") === v.kind);
    assert.ok(near(Number(el.get("data-x2")), v.screen.to.x) && near(Number(el.get("data-y2")), v.screen.to.y), `SVG vector ${v.id}`);
    assert.ok(has("moveTo", v.screen.to.x, v.screen.to.y), `canvas arrow head at ${v.id}`);
  }
  // Every fastener marker in the SVG sits at the scene position.
  for (const m of scene.markers) {
    const el = svgAttr(svg, "fastener").find((x) => x.get("data-id") === m.id);
    assert.ok(near(Number(el.get("cx")), m.screen.x) && near(Number(el.get("cy")), m.screen.y));
    assert.ok(has("arc", m.screen.x, m.screen.y, m.radiusPx));
  }
  // The PNG legend painter handles every legend shape.
  const lctx = recordingContext();
  paintLegend(lctx, scene, COLOURS, scene.height);
  assert.equal(lctx.calls.filter((c) => c[0] === "fillText").length, scene.legend.length);
});

test("calculation trace: every value is the solver's own intermediate value", () => {
  const p = tee({ prying: true, preload: true });
  p.plates[0].bearingAllowable = 300;
  p.plates[0].shearOutAllowable = 200;
  p.settings.icr = { enabled: true, model: "crawford-kulak" };
  p.defaults.icr = { rult: 40000, mu: 0.3937, lambda: 0.55, deltaMax: 8.6, deltaY: null };
  p.load.point = { x: 30, y: 0, z: 0 };
  const r = solve(p);
  assert.ok(r.ok, JSON.stringify(r.issues.filter((i) => i.tier === "error")));
  const id = traceFastenerId(r);
  assert.equal(id, r.critical.id, "the default trace is the governing (critical) fastener");
  const tr = buildTrace(p, r, id);
  const f = r.fasteners.find((q) => q.id === id);
  const value = (sectionPrefix, label) => tr.sections.find((sct) => sct.title.startsWith(sectionPrefix)).lines.find((l) => l.label === label).value;
  assert.equal(value("Reduced load", "Torsion about Cs"), r.reduced.shear.Mz);
  assert.equal(value("Direct shear", "Rdy"), f.shear.Rdy);
  assert.equal(value("Torsional shear", "Rtx"), f.shear.Rtx);
  assert.equal(value("Torsional shear", "Resultant"), f.shear.Rs);
  assert.equal(value("ICR", "At the applied load"), f.icr.atLoad.Rs);
  assert.equal(value("ICR", "γ_ult"), r.icr.gamma);
  assert.equal(value("Moment-induced tension", "Tension"), f.axial.T);
  assert.equal(value("Tension chain", "Prying Q"), f.checks.tension.Q);
  assert.equal(value("Tension chain", "Bolt load"), f.checks.tension.Fb);
  assert.equal(value("Bearing and tear-out", "MS bearing, P1"), f.checks.modes.find((m) => m.mode === "bearing").ms);
  const it = f.checks.modes[0];
  assert.equal(value("Interaction", "IF(1)"), it.IF1);
  assert.equal(value("Interaction", "k*"), it.kStar);
  assert.equal(value("Interaction", "MS interaction"), it.ms);
  // Any fastener can be traced; an unknown id or an errored result gives none.
  assert.equal(buildTrace(p, r, "F4").id, "F4");
  assert.equal(buildTrace(p, r, "nope"), null);
  assert.equal(buildTrace(p, solve(pattern([])), "F1"), null);
});

test("PDF report: every required section, inline SVG, version, verification set and tolerance, warnings, preliminary line", () => {
  const { p, r } = sceneFixture();
  p.defaults.shearAllowable = 12000; p.defaults.tensionAllowable = 15000;
  const res = solve(p);
  const v = runVerification();
  const html = reportHtml(p, res, { date: "2026-10-01", verification: v });
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sections = [...html.matchAll(/data-section="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sections, ["conventions", "diagram", "inputs", "reduced", "properties", "fasteners", "icr", "margins", "trace", "warnings", "assumptions"]);
  assert.match(html, /<svg[^>]*aria-label="Fastener pattern diagram"/);
  assert.ok(html.includes(TOOL_VERSION));
  assert.ok(html.includes(`Verification set ${v.set}: ${v.passed} pass, ${v.failed} fail; closed-form tolerance ${v.tol} relative`));
  assert.ok(html.includes(esc(v.scope)) && v.references.every((r) => html.includes(esc(r))), "footer cites the published references and their scope");
  assert.equal((html.match(/Preliminary sizing — verify against the governing specification\./g) || []).length, 2, "header and footer");
  for (const i of res.issues) assert.ok(html.includes(`<td>${i.id}</td>`), `warning ${i.id} listed`);
  assert.ok(res.issues.some((i) => i.id === "W-006"), "W-006 persists into the report");
  assert.match(html, /Calculation trace — F\d \(governing fastener\)/);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html), "no external references");
  assert.equal(r.ok, true);
  // A pattern with errors still reports its inputs and warnings.
  const bad = reportHtml(pattern([]), solve(pattern([])), {});
  assert.match(bad, /No results: the pattern has errors/);
  assert.match(bad, /<td>E-001<\/td>/);
});

test("Markdown report: same sections as tables, the governing trace, assumptions and the verification footer", () => {
  const { p, r } = sceneFixture();
  const v = runVerification();
  const md = toMarkdown(p, r, { version: TOOL_VERSION, date: "2026-10-01", verification: v });
  for (const h of ["## Fasteners", "## Plates", "## Load", "## Centroids", "## Section properties", "## Reduced load", "## Axial method", "## Fastener loads (elastic)", "## Margins of safety", "## ICR method", "## Warnings", "## Calculation trace", "## Assumptions", "## Verification", "## Exact inputs"]) {
    assert.ok(md.includes(h), h);
  }
  assert.ok(md.includes(`Verification set ${v.set}: ${v.passed} pass, ${v.failed} fail`));
  assert.ok(md.includes(v.scope) && v.references.every((r, i) => md.includes(`${i + 1}. ${r}`)), "footer cites the published references and their scope");
  assert.ok(!/!\[|<img|data:image/.test(md), "no embedded images");
  assert.equal(toJSON(parseMarkdown(md).pattern), toJSON(p), "the report still imports");
});

test("verification panel data lists every VC, VB, VI, property and VR case, all passing, with the references", () => {
  const v = runVerification();
  assert.ok(v.results.every((r) => r.status === "pass"));
  assert.deepEqual(v.results.filter((r) => r.id.startsWith("VR-")).map((r) => r.id), ["VR-01", "VR-02", "VR-03"]);
  assert.equal(v.set, "M6 (v2)");
  assert.equal(v.references.length, 2);
  assert.match(v.scope, /not to the current AISC Manual/);
});

test("reaction-vector legend names the shear source actually drawn: elastic when the ICR basis has no converged reactions", () => {
  const p = withIcr(pattern(RECT4, { point: { x: 100, y: 0, z: 0 }, Fy: -1000 }), { basis: "icr" });
  const reactionLabel = (r) => buildScene(p, r, { width: 600, height: 400 }).legend.find((e) => e.key === "reaction").label;
  const converged = solve(p);
  assert.equal(converged.icr.status, "converged");
  assert.match(reactionLabel(converged), /ICR at applied load/);
  // The W-014 shape from solve: ICR basis kept, no converged reactions, elastic shear drawn.
  const failed = solve(p);
  failed.icr = { status: "not-converged", reason: "test" };
  failed.fasteners.forEach((f) => { delete f.icr; f.basisShear = null; });
  const scene = buildScene(p, failed, { width: 600, height: 400 });
  assert.match(reactionLabel(failed), /\(elastic\)/);
  const drawn = scene.vectors.filter((v) => v.kind === "reaction");
  assert.deepEqual(drawn.map((v) => v.value), failed.fasteners.filter((f) => f.shear.Rs > 0).map((f) => f.shear.Rs));
  assert.match(paintSvg(scene), /Fastener in-plane load \(elastic\)/);
});
