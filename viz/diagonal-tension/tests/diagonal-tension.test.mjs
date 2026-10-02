/* Model tests: the engine is extracted from the page at test time (never duplicated) and run in a
   vm, as the page and its Web Worker run it. One test per acceptance bullet of the specification,
   then the inputs, exports, artifact and worker checks. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("diagonal-tension.html");
const script = (id) => new RegExp(`<script(?: type="text/plain")? id="${id}">([\\s\\S]*?)</script>`).exec(html)[1];
const load = () => { const ctx = {}; ctx.self = ctx; vm.createContext(ctx); vm.runInContext(script("dt-engine"), ctx); return ctx.DiagonalTension; };
const DT = load();
const J = (x) => JSON.parse(JSON.stringify(x));
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const state = (edit) => { const s = DT.defaultState(); if (edit) edit(s); return s; };
const solved = (edit) => { const r = DT.runComparison(state(edit)); assert.equal(r.ok, true, JSON.stringify(r.error || r.errors)); return r; };

test("the in-page self-check passes every check", () => {
  const t = DT.selfTests();
  assert.equal(t.filter((x) => !x.pass).map((x) => `${x.id}: ${x.detail}`).join("\n"), "");
  assert.deepEqual(J(t.map((x) => x.id)), ["patch", "bar", "shear", "reference-shear", "reference-stretch", "equilibrium", "scaling", "zero-doubler", "full-doubler", "mass", "convergence", "failures"]);
});

test("the demonstration example opens with the specified values", () => {
  assert.deepEqual(J(DT.defaultState()), {
    panel: { L: 600, W: 400, t: 1 },
    stringers: [{ y: 100, A: 50 }, { y: 200, A: 50 }, { y: 300, A: 50 }],
    doubler: { x0: 200, y0: 100, Lx: 200, Ly: 200, t: 1 },
    material: { E: 70000, nu: 0.33, rho: 2700 },
    load: { q: 50 }, mesh: { h: 20 }, regions: { exclude: 40, band: 50 },
  });
  assert.match(DT.META.example, /Demonstration values/);
  assert.ok(DT.ASSUMPTIONS.some((a) => /not alloy allowables/.test(a)));
});

test("acceptance: uniform-strain patch test (MacNeal-Harder distorted patch)", () => {
  const P = [[0, 0], [0.24, 0], [0.24, 0.12], [0, 0.12], [0.04, 0.02], [0.18, 0.03], [0.16, 0.08], [0.08, 0.08]];
  const quads = [0, 1, 5, 4, 1, 2, 6, 5, 2, 3, 7, 6, 3, 0, 4, 7, 4, 5, 6, 7];
  // A field with all three strain components, applied on the boundary only.
  const field = (x, y) => [2e-3 * x - 1e-3 * y, 0.5e-3 * x + 3e-3 * y];
  const fixed = [], val = [];
  for (const n of [0, 1, 2, 3]) { fixed.push(2 * n, 2 * n + 1); val.push(...field(...P[n])); }
  const E = 1e6, nu = 0.25;
  const r = DT.solve({ coords: Float64Array.from(P.flat()), quads: Int32Array.from(quads), thick: new Float64Array(5).fill(0.001), bars: new Int32Array(0), barA: new Float64Array(0), E, nu, fixed: Int32Array.from(fixed), fixedVal: Float64Array.from(val), f: new Float64Array(16) });
  assert.equal(r.ok, true);
  for (const n of [4, 5, 6, 7]) { const [ux, uy] = field(...P[n]); assert.ok(rel(r.u[2 * n], ux) < 1e-9 && rel(r.u[2 * n + 1], uy) < 1e-9, `node ${n}`); }
  const ex = 2e-3, ey = 3e-3, g = -1e-3 + 0.5e-3, c = E / (1 - nu * nu);
  const want = [c * (ex + nu * ey), c * (nu * ex + ey), (c * (1 - nu) / 2) * g];
  for (let p = 0; p < 20; p++) for (let k = 0; k < 3; k++) assert.ok(Math.abs(r.sig[3 * p + k] - want[k]) < 1e-9 * Math.abs(want[0]), `Gauss point ${p} component ${k}`);
});

test("acceptance: a bar has tip displacement FL/EA, at any orientation", () => {
  const E = 70000, A = 50, L = 750, F = 2400;
  for (const deg of [0, 30, 90, 135]) {
    const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
    // A second bar, perpendicular, makes the tip node stable; it carries no force.
    const coords = Float64Array.from([0, 0, L * c, L * s, L * c - L * s, L * s + L * c]);
    const r = DT.solve({ coords, quads: new Int32Array(0), thick: new Float64Array(0), bars: Int32Array.from([0, 1, 1, 2]), barA: Float64Array.from([A, A]), E, nu: 0.3, fixed: Int32Array.from([0, 1, 4, 5]), fixedVal: new Float64Array(4), f: Float64Array.from([0, 0, F * c, F * s, 0, 0]) });
    assert.equal(r.ok, true, `${deg}°`);
    const along = r.u[2] * c + r.u[3] * s;
    assert.ok(rel(along, (F * L) / (E * A)) < 1e-10, `${deg}°: ${along}`);
    assert.ok(rel(r.barN[0], F) < 1e-10 && Math.abs(r.barN[1]) < 1e-9 * F, `${deg}°: N`);
  }
});

test("acceptance: pure shear gives principal stresses ±|τ| at 45 degrees", () => {
  for (const tau of [50, -30, 1e-3]) {
    const p = DT.principal(0, 0, tau);
    assert.equal(p.s1, Math.abs(tau)); assert.equal(p.s2, -Math.abs(tau));
    assert.ok(Math.abs((p.theta1 * 180) / Math.PI - Math.sign(tau) * 45) < 1e-12);
    assert.ok(rel(p.vm, Math.sqrt(3) * Math.abs(tau)) < 1e-15);
  }
  // The specification's formulas, on a general state.
  const p = DT.principal(80, -40, 30);
  assert.ok(Math.abs(p.s1 - (20 + Math.hypot(60, 30))) < 1e-12 && Math.abs(p.s2 - (20 - Math.hypot(60, 30))) < 1e-12);
  assert.ok(Math.abs(p.theta1 - 0.5 * Math.atan2(60, 120)) < 1e-15);
  // The solved panel without a doubler is in pure shear q/t everywhere, stringers included.
  const r = solved((s) => { s.doubler.t = 0; s.load.q = 35; s.panel.t = 1.6; });
  for (let g = 0; g < r.A.sig.length / 3; g++) {
    const q = DT.principal(r.A.sig[3 * g], r.A.sig[3 * g + 1], r.A.sig[3 * g + 2]);
    assert.ok(rel(q.s1, 35 / 1.6) < 1e-8 && rel(q.s2, -35 / 1.6) < 1e-8 && Math.abs((q.theta1 * 180) / Math.PI - 45) < 1e-7, `Gauss point ${g}`);
  }
});

test("acceptance: force and moment equilibrium, and linear load scaling", () => {
  const r1 = solved(), r3 = solved((s) => { s.load.q = -150; });
  for (const k of ["A", "B"]) {
    const e = r1[k].diag.equilibrium;
    assert.ok(e.relForce < 1e-10 && e.relMoment < 1e-10, `${k}: ${JSON.stringify(e)}`);
    // The applied shear flow is self-equilibrated, so the minimal restraints carry no load.
    const R = r1[k].R;
    assert.ok(Math.max(Math.abs(R[0]), Math.abs(R[1]), Math.abs(R[r1.model.fixed[2]])) < 1e-6, `${k}: reactions ${R[0]}, ${R[1]}`);
  }
  const umax = Math.max(...r1.B.u.map(Math.abs));
  for (let i = 0; i < r1.B.u.length; i++) assert.ok(Math.abs(r3.B.u[i] + 3 * r1.B.u[i]) < 1e-8 * umax);
  assert.ok(rel(r3.B.scalars[0], 9 * r1.B.scalars[0]) < 1e-8);
  for (let g = 0; g < r1.B.sig.length; g++) assert.ok(Math.abs(r3.B.sig[g] + 3 * r1.B.sig[g]) < 1e-7 * 50);
  // Total applied load: q·W on each vertical edge, q·L on each horizontal edge, resultant zero.
  const f = r1.model.f, nx = r1.model.nx;
  let right = 0, top = 0;
  for (let j = 0; j < r1.model.ny; j++) right += f[2 * (j * nx + nx - 1) + 1];
  for (let i = 0; i < nx; i++) top += f[2 * ((r1.model.ny - 1) * nx + i)];
  assert.ok(rel(right, 50 * 400) < 1e-12 && rel(top, 50 * 600) < 1e-12);
});

test("acceptance: zero doubler thickness makes A and B identical", () => {
  const r = solved((s) => { s.doubler.t = 0; });
  assert.deepEqual([...r.A.u], [...r.B.u]);
  assert.deepEqual([...r.A.sig], [...r.B.sig]);
  for (const row of r.rows) { assert.equal(row.delta, 0, row.id); assert.equal(row.a, row.b, row.id); }
});

test("acceptance: a full-panel doubler matches a uniformly thicker skin", () => {
  const d = solved((s) => { s.doubler = { x0: 0, y0: 0, Lx: 600, Ly: 400, t: 1.25 }; });
  const u = solved((s) => { s.panel.t = 2.25; s.doubler.t = 0; });
  const m = Math.max(...u.A.u.map(Math.abs));
  for (let i = 0; i < u.A.u.length; i++) assert.ok(Math.abs(d.B.u[i] - u.A.u[i]) <= 1e-10 * m);
  for (let i = 0; i < u.A.sig.length; i++) assert.ok(Math.abs(d.B.sig[i] - u.A.sig[i]) <= 1e-8 * 50);
  assert.ok(rel(d.summary.B.mass.total, u.summary.A.mass.total) < 1e-12);
});

test("acceptance: added mass is density × doubler volume, kg/m³ × mm³ × 10⁻⁹", () => {
  for (const [rho, Lx, Ly, td] of [[2700, 200, 200, 1], [2810, 150, 90, 1.6], [2700, 600, 400, 0.5]]) {
    const r = solved((s) => { s.material.rho = rho; s.doubler = { x0: 0, y0: 0, Lx, Ly, t: td }; s.mesh.h = 50; });
    const added = r.summary.B.mass.total - r.summary.A.mass.total;
    assert.ok(rel(added, rho * Lx * Ly * td * 1e-9) < 1e-12, `${added}`);
  }
  // The example: 2700 kg/m³ × 200 × 200 × 1 mm³ = 0.108 kg; skin 0.648 kg; stringers 3 × 50 × 600 mm³ → 0.243 kg.
  const r = solved();
  assert.ok(rel(r.summary.A.mass.total, 0.891) < 1e-12 && rel(r.summary.B.mass.total, 0.999) < 1e-12);
  assert.ok(rel(r.rows.find((x) => x.id === "mass").pct, (100 * 0.108) / 0.891) < 1e-12);
});

test("acceptance: three mesh levels converge fixed-probe displacements and region stresses within the declared tolerances", () => {
  const { levels, displacementTol, stressTol } = DT.CONVERGENCE;
  assert.deepEqual([...levels], [40, 20, 10]);
  const runs = levels.map((h) => solved((s) => { s.mesh.h = h; }));
  const pick = (r) => ({ P1: r.summary.B.probes[0].u, P2: r.summary.B.probes[1].u, compliance: r.summary.B.compliance, doubler: r.summary.B.regions.doubler.s1.value, band: r.summary.B.regions.band.s1.value, skin: r.summary.B.regions.skin.s1.value, P3: r.summary.B.probes[2].txy, P4: r.summary.B.probes[3].txy });
  const [a, b, c] = runs.map(pick);
  for (const k of Object.keys(a)) {
    const d12 = Math.abs(b[k] - a[k]) / Math.abs(c[k]), d23 = Math.abs(c[k] - b[k]) / Math.abs(c[k]);
    const global = ["P1", "P2", "compliance"].includes(k);
    assert.ok(d23 <= (global ? displacementTol : stressTol), `${k}: ${d23}`);
    if (global) assert.ok(d23 < d12, `${k} converges monotonically: ${d12} then ${d23}`);
  }
  // Refinement stiffens nothing that is not there: displacements grow towards the converged value.
  assert.ok(a.P1 <= b.P1 && b.P1 <= c.P1);
});

test("acceptance: failed solves are detected and return no results", () => {
  const capped = DT.runComparison(state(), null, { maxIterations: 5 });
  assert.equal(capped.ok, false);
  assert.equal(capped.error.code, "iterations");
  assert.equal(capped.A, undefined);
  assert.equal(capped.rows, undefined);
  const sq = { coords: Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1]), quads: Int32Array.from([0, 1, 2, 3]), thick: Float64Array.from([1]), bars: new Int32Array(0), barA: new Float64Array(0), E: 1000, nu: 0.3, fixed: Int32Array.from([0, 1, 3]), fixedVal: new Float64Array(3), f: Float64Array.from([0, 0, 1, 0, 0, 0, 0, 0]) };
  assert.equal(DT.solve(sq).ok, true);
  assert.equal(DT.solve({ ...sq, quads: Int32Array.from([0, 3, 2, 1]) }).error.code, "inverted");
  assert.equal(DT.solve({ ...sq, coords: Float64Array.from([0, 0, 1, 0, 1, 0, 0, 1]) }).error.code, "degenerate");
  assert.equal(DT.solve({ ...sq, fixed: Int32Array.from([0, 1]), fixedVal: new Float64Array(2) }).error.code, "singular");
  assert.equal(DT.solve({ ...sq, fixed: Int32Array.from([0, 2, 4]), fixedVal: new Float64Array(3) }).error.code, "singular", "three parallel restraints leave a translation free");
  const orphan = DT.solve({ ...sq, coords: Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1, 5, 5]), f: new Float64Array(10) });
  assert.equal(orphan.error.code, "disconnected");
  const zeroBar = DT.solve({ ...sq, coords: Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1, 2, 0]), bars: Int32Array.from([1, 4]), barA: Float64Array.from([0]), f: new Float64Array(10) });
  assert.equal(zeroBar.error.code, "disconnected", "a node held only by a zero-area bar is disconnected");
  assert.equal(DT.solve({ ...sq, f: Float64Array.from([0, 0, NaN, 0, 0, 0, 0, 0]) }).error.code, "nonfinite");
  assert.equal(DT.solve({ ...sq, E: -1 }).error.code, "material");
});

test("inputs: positive dimensions and E, valid Poisson ratio, non-negative areas and doubler thickness, geometry inside the panel", () => {
  const errs = (edit) => DT.validate(state(edit)).errors.map((e) => e.field);
  assert.deepEqual(J(errs()), []);
  for (const [edit, field] of [
    [(s) => { s.panel.L = 0; }, "panel.L"], [(s) => { s.panel.W = -5; }, "panel.W"], [(s) => { s.panel.t = NaN; }, "panel.t"],
    [(s) => { s.material.E = 0; }, "material.E"], [(s) => { s.material.nu = 0.5; }, "material.nu"], [(s) => { s.material.nu = -1; }, "material.nu"],
    [(s) => { s.stringers[1].A = -1; }, "stringers.1.A"], [(s) => { s.stringers[0].y = 401; }, "stringers.0.y"], [(s) => { s.stringers[2].y = 100; }, "stringers"],
    [(s) => { s.doubler.t = -0.1; }, "doubler.t"], [(s) => { s.doubler.x0 = 450; }, "doubler.Lx"], [(s) => { s.doubler.y0 = 250; }, "doubler.Ly"],
    [(s) => { s.doubler.Lx = 0; }, "doubler.Lx"], [(s) => { s.doubler.x0 = -1; }, "doubler.x0"], [(s) => { s.load.q = 0; }, "load.q"],
    [(s) => { s.mesh.h = 0; }, "mesh.h"], [(s) => { s.mesh.h = 2; }, "mesh.h"], [(s) => { s.regions.band = 0; }, "regions.band"],
  ]) assert.ok(errs(edit).includes(field), `${field}: ${errs(edit)}`);
  // Zero stringer area and zero doubler thickness are allowed, for comparison checks.
  assert.deepEqual(J(errs((s) => { s.stringers[0].A = 0; s.doubler.t = 0; })), []);
  const r = solved((s) => { s.stringers = [{ y: 0, A: 0 }, { y: 400, A: 20 }]; s.doubler = { x0: 0, y0: 0, Lx: 120, Ly: 80, t: 2 }; s.mesh.h = 40; });
  assert.equal(r.mesh.bars, 2 * 15);
  // The mesh limit names the node count and the limit.
  assert.match(DT.validate(state((s) => { s.mesh.h = 2; })).errors[0].message, /nodes; the limit is 40,000/);
  // The node count is found without building the grid, so an absurd element size fails fast.
  for (const h of [20, 30, 7]) { const s = state((x) => { x.mesh.h = h; x.doubler.x0 = 133; x.stringers[0].y = 87.5; }), { xs, ys } = DT.meshLines(s); assert.equal(DT.estimateNodes(s), xs.length * ys.length, `h = ${h}`); }
  const t0 = performance.now(), tiny = DT.validate(state((s) => { s.mesh.h = 1e-5; }));
  assert.ok(performance.now() - t0 < 100, "validated without building 60 million grid lines");
  assert.deepEqual(J(tiny.errors.map((e) => e.field)), ["mesh.h"]);
});

test("mesh: conforming, split at every stringer and doubler edge, no duplicated skin elements", () => {
  const s = state((x) => { x.stringers = [{ y: 87.5, A: 30 }, { y: 100, A: 50 }]; x.doubler = { x0: 133, y0: 100, Lx: 251, Ly: 77, t: 1 }; x.mesh.h = 30; });
  const { xs, ys } = DT.meshLines(s);
  for (const x of [0, 133, 384, 600]) assert.ok(xs.includes(x), `x = ${x}`);
  for (const y of [0, 87.5, 100, 177, 400]) assert.ok(ys.includes(y), `y = ${y}`);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > 0 && xs[i] - xs[i - 1] <= 30 + 1e-9);
  for (let j = 1; j < ys.length; j++) assert.ok(ys[j] - ys[j - 1] > 0 && ys[j] - ys[j - 1] <= 30 + 1e-9);
  const m = DT.buildModel(s), ne = (m.nx - 1) * (m.ny - 1);
  assert.equal(m.quads.length, 4 * ne, "one quadrilateral per cell, never two");
  let area = 0, dArea = 0;
  for (let e = 0; e < ne; e++) {
    const i = e % (m.nx - 1), j = (e - i) / (m.nx - 1), a = (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
    area += a; if (m.inDoubler[e]) dArea += a;
    assert.equal(m.tB[e] - m.tA[e], m.inDoubler[e] ? 1 : 0);
  }
  assert.ok(rel(area, 600 * 400) < 1e-12 && rel(dArea, 251 * 77) < 1e-12);
  // Bars share skin nodes along each stringer line.
  for (let b = 0; b < m.barA.length; b++) assert.equal(m.coords[2 * m.bars[2 * b] + 1], m.stringerY[m.barStringer[b]]);
});

test("results: regions, probes and stringer forces are defined geometrically and reported per variant", () => {
  const r = solved();
  const s = r.state;
  assert.equal(DT.regionOf(10, 200, s), 0, "edge zone excluded");
  assert.equal(DT.regionOf(220, 110, s), 0, "doubler corner excluded");
  assert.equal(DT.regionOf(300, 200, s), 1);
  assert.equal(DT.regionOf(430, 200, s), 2);
  assert.equal(DT.regionOf(520, 200, s), 3);
  assert.deepEqual(J(r.summary.A.probes.map((p) => [p.id, p.x, p.y])), [["P1", 600, 400], ["P2", 300, 200], ["P3", 300, 150], ["P4", 425, 150]]);
  for (const p of r.summary.B.probes) {
    assert.equal(typeof p.element, "number");
    assert.ok(Number.isFinite(p.sx) && Number.isFinite(p.ux) && p.t > 0);
  }
  assert.equal(r.summary.B.probes[2].t, 2, "P3 sits in the doubler");
  assert.equal(r.summary.B.probes[3].t, 1, "P4 sits in the skin beside it");
  // P4 moves to a side of the patch that has skin, and is left out when none does.
  const flush = solved((x) => { x.doubler.x0 = 400; });
  const p4 = flush.summary.B.probes.find((p) => p.id === "P4");
  assert.deepEqual([p4.x, p4.y, p4.t], [375, 150, 1]);
  const full = solved((x) => { x.doubler = { x0: 0, y0: 0, Lx: 600, Ly: 400, t: 1 }; });
  assert.deepEqual(J(full.summary.B.probes.map((p) => p.id)), ["P1", "P2", "P3"]);
  assert.equal(full.rows.find((x) => x.id === "P4.txy"), undefined);
  // The doubler attracts shear flow: τ·t inside the patch exceeds q, while the stress itself falls.
  const p3 = r.summary.B.probes[2];
  assert.ok(p3.txy < 50 && p3.txy * p3.t > 50);
  // Stringers in pure shear carry nothing; with the doubler, the edge stringers pick up load symmetrically.
  assert.ok(r.summary.A.stringers.every((x) => x.maxAbs < 1e-6));
  const [s1, s2, s3] = r.summary.B.stringers;
  assert.ok(s1.maxAbs > 100 && rel(s1.maxAbs, s3.maxAbs) < 1e-6 && s2.maxAbs < 1e-6);
  // Lower stress inside the patch, higher in the skin at its edges: the table shows both.
  const row = (id) => r.rows.find((x) => x.id === id);
  assert.ok(row("max.s1.doubler").delta < 0 && row("max.s1.band").delta > 0);
  assert.equal(row("stringer.0").pct, null, "no percentage from a zero baseline");
  assert.ok(row("compliance").pct < 0 && row("mass").pct > 0);
  // Energy: U = ½ fᵀu.
  for (const k of ["A", "B"]) assert.ok(rel(r[k].scalars[1], r[k].scalars[0] / 2) < 1e-8 && r.summary[k].energy === r[k].scalars[1] && r.summary[k].compliance === r[k].scalars[0]);
  // Probing at a point reports coordinates, element, thickness, stresses and the region.
  const p = DT.probeAt(r, "B", 350, 150);
  for (const key of ["x", "y", "element", "t", "sx", "sy", "txy", "s1", "s2", "theta1Deg", "vm", "ux", "uy", "region"]) assert.ok(key in p, key);
});

test("exports: model JSON and results CSV carry units, assumptions, mesh and solver diagnostics", () => {
  const r = solved();
  const model = JSON.parse(DT.modelJSON(DT.defaultState(), r));
  assert.equal(model.schemaVersion, 1); assert.equal(model.visual, "diagonal-tension");
  assert.equal(model.units.stress, "MPa"); assert.equal(model.units.mass, "kg");
  assert.deepEqual(model.assumptions, J(DT.ASSUMPTIONS));
  assert.equal(model.mesh.nodes, 651); assert.equal(model.mesh.xs.length, 31); assert.equal(model.mesh.load.totalPerVerticalEdge, 20000);
  assert.ok(model.diagnostics.A.iterations > 0 && model.diagnostics.B.trueResidual < 1e-9);
  assert.equal(JSON.parse(DT.modelJSON(state((s) => { s.panel.L = -1; }), null)).validation[0].field, "panel.L");
  const csv = DT.resultsCSV(r);
  for (const want of [/^# units,/m, /^# assumption 1,/m, /^# mesh,"651 nodes, 600 quadrilaterals, 90 bars/m, /^# solver A,.*iterations/m, /^quantity,unit,A,B,change,change_percent$/m, /^Mass,kg,0\.891,0\.999,0\.108,12\.121212$/m, /^probe,variant,x,y/m, /^region,variant/m, /^stringer_y_mm/m]) assert.match(csv, want);
  assert.equal(csv, DT.resultsCSV(solved()), "deterministic");
});

test("artifact: one self-contained file, published byte-identical as index.html, with raw.json from the engine", () => {
  assert.equal(read("index.html"), html, "index.html is diagonal-tension.html");
  assert.deepEqual(JSON.parse(read("raw.json")), { meta: J(DT.META), model: JSON.parse(DT.modelJSON(DT.defaultState(), null)) });
});

test("engine: runs without a clock, randomness, storage or DOM, and gives byte-identical output", () => {
  const ctx = {}; ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(`Math.random = () => { throw new Error("Math.random"); }; Date = new Proxy(Date, { construct() { throw new Error("Date"); }, apply() { throw new Error("Date"); }, get(t, k) { throw new Error("Date." + String(k)); } });`, ctx);
  vm.runInContext(script("dt-engine"), ctx);
  for (const g of ["document", "window", "localStorage", "navigator"]) assert.equal(vm.runInContext(`typeof ${g}`, ctx), "undefined");
  const E = ctx.DiagonalTension, once = () => { const r = E.runComparison(E.defaultState()); return [E.modelJSON(E.defaultState(), r), E.resultsCSV(r), JSON.stringify(E.beamdswitchReport(r))]; };
  assert.deepEqual(once(), once());
  assert.deepEqual(once()[1], DT.resultsCSV(solved()));
});

test("worker: the Blob worker runs the engine text and the dt-worker script", () => {
  const posted = [];
  const ctx = { postMessage: (m) => posted.push(m) };
  ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(`${script("dt-engine")}\n${script("dt-worker")}`, ctx);
  ctx.onmessage({ data: { cmd: "compare", id: 7, state: DT.defaultState() } });
  const result = posted.find((m) => m.type === "result");
  assert.equal(result.id, 7); assert.equal(result.result.ok, true);
  assert.ok(posted.some((m) => m.type === "progress" && m.progress.stage === "solve" && m.progress.variant === "B"));
  assert.deepEqual(J(result.result.rows), J(solved().rows), "the worker's result is the engine's");
  ctx.onmessage({ data: { cmd: "compare", id: 8, state: state((s) => { s.panel.W = 0; }) } });
  assert.equal(posted.at(-1).result.stage, "validate");
  ctx.onmessage({ data: { cmd: "nope", id: 9 } });
  assert.equal(posted.at(-1).type, "error");
});
