// Scientific Modelling, piece 3: the declared models (the six parts of section 10, the acceptance of each standard
// example), the exact link from the record through the Nondimensionalizer to its declaration, and the Regime Map
// Builder: axes and scales, layers, boundaries only between resolved points, unresolved regions, exact boundaries,
// limit paths, the inspection with its dimensional reconstruction, and invalidation after an edit.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const R = require("../src/record.js");
const C = require("../src/check.js");
const D = require("../src/declare.js");
const RM = require("../src/regime.js");
const Model = require("../src/model.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const DATA = require("../raw.json");
const ENGINE = Model.engineData(DATA);

const state = (example, patch = {}) => VisualKit.normalize(Model.FIELDS, { example, tool: "regime", ...patch }).state;
const confirmed = (example) => R.confirm(R.fromExample(ENGINE, example));
const derive = (example, patch = {}, rec = confirmed(example)) => Model.derive(state(example, patch), DATA, rec);
const STANDARD = ["lumped-body", "transient-slab", "transient-cylinder", "transient-sphere", "volumetric-source", "multilayer-wall", "straight-fin"];

test("every declaration has the six parts of section 10, the four methods each with a reason, and limitations", () => {
  const list = D.declarations(DATA);
  assert.equal(list.length, 26);
  assert.deepEqual(D.PARTS.map((p) => p.id), ["model", "domain", "operations", "methods", "acceptance", "solver"]);
  for (const decl of list) {
    assert.deepEqual(D.problemsOf(decl), [], decl.id);
    assert.ok(DATA.roadmap.families.some((f) => f.id === decl.family && f.piece === decl.piece && f.piece <= DATA.roadmap.current), `${decl.id}: its family is a built family of the roadmap, of its own piece`);
    assert.ok(Model.EXAMPLES.some((e) => e.id === decl.acceptance.example), `${decl.id}: its standard example exists`);
  }
  const fams = new Set(list.map((d) => d.family));
  assert.deepEqual([...fams].sort(), ["beams-and-columns", "boundary-layers", "buoyancy-convection", "compressible-nozzle-flow", "external-aerodynamic-flow", "fins-and-extended-surfaces", "free-surface-flow", "internal-viscous-flow",
    "lumped-thermal-models", "multilayer-conduction", "nonlinear-buckling", "plates-and-shells", "radiation", "thermoelasticity", "transient-conduction", "vibration"]);
  // Section 10: all four methods across the catalogue. Piece 3 declares two, each with its reason; piece 4 adds stability and bifurcation.
  for (const d of list.filter((x) => x.piece === 3)) assert.ok(d.methods["dominant-balance"].applies && d.methods.asymptotic.applies && !d.methods.stability.applies && !d.methods.bifurcation.applies);
  for (const m of ["dominant-balance", "asymptotic", "stability", "bifurcation"]) assert.ok(list.some((d) => d.methods[m].applies), `some declaration applies ${m}`);
});

test("the declaration test: each standard example matches its declared model exactly and passes every acceptance check", () => {
  for (const decl of D.declarations(DATA)) {
    const d = Model.derive(state(decl.acceptance.example, { tool: "catalogue", family: decl.id }), DATA, confirmed(decl.acceptance.example));
    const acc = d.catalogue.acceptance;
    assert.deepEqual(acc.problems, [], decl.id);
    assert.ok(acc.checks.length >= 2, `${decl.id}: ${acc.checks.length} checks`);
    for (const c of acc.checks) assert.ok(c.passed, `${decl.id}: ${c.title}: ${c.detail}`);
  }
});

test("the record links to its declared model through the Nondimensionalizer: exact equations, conditions and the record's point", () => {
  const counts = { "lumped-body": [1, 1], "transient-slab": [1, 3], "transient-cylinder": [1, 3], "transient-sphere": [1, 3], "volumetric-source": [1, 2], "multilayer-wall": [2, 4], "straight-fin": [1, 2] };
  for (const ex of STANDARD) {
    const rg = derive(ex).regime;
    assert.ok(rg.ready, `${ex}: ${rg.message} ${rg.problems?.join(" ")}`);
    assert.deepEqual([rg.match.equations.length, rg.match.conditions.length], counts[ex], ex);
  }
  const slab = derive("transient-slab").regime;
  assert.deepEqual(slab.params.map((p) => [p.id, p.exact]), [["Bi", "1/2"], ["Fo", "1/4"]], "Bi = hL/k = 1/2 and Fo = αt/L² = 1/4, exactly");
  assert.deepEqual(derive("multilayer-wall").regime.params.map((p) => p.exact), ["2", "1/4", "1", "1/4", "1/10"]);
  // The interface conditions count once for the pair of fields: no warning on the wall.
  assert.ok(!C.interpret(R.inputs(R.fromExample(ENGINE, "multilayer-wall")), ENGINE).issues.some((i) => i.code === "extra-conditions"));
});

test("a record that is not the declared model is refused with the difference, and a record without a declaration says so", () => {
  const dirichlet = R.confirm(R.edit(R.fromExample(ENGINE, "transient-slab"), (inp) => { inp.conditions.find((c) => c.id === "c-surface").text = "T = T_inf"; }, "Prescribed surface."));
  const rg = derive("transient-slab", {}, dirichlet).regime;
  assert.equal(rg.reason, "mismatch");
  assert.ok(rg.problems.some((p) => /-d\(theta,X\) = Bi\*theta at X = 1/.test(p)), rg.problems.join(" "));
  assert.ok(rg.problems.some((p) => /c-surface/.test(p)), "the refused record condition is named");
  const scaled = R.confirm(R.edit(R.fromExample(ENGINE, "transient-slab"), (inp) => { inp.scales.push({ id: "s-x", for: "v-x", scale: "2*L", offset: "0", symbol: "X", reason: "the full thickness" }); }, "A scale."));
  const r2 = derive("transient-slab", {}, scaled).regime;
  assert.equal(r2.reason, "mismatch");
  assert.ok(r2.problems.some((p) => /The scale of x is 2\*L/.test(p)), r2.problems.join(" "));
  assert.equal(derive("heat-transfer-pi").regime.reason, "no-declaration");
  const unknown = R.confirm(R.edit(R.fromExample(ENGINE, "transient-slab"), (inp) => { inp.purpose.declaration = "no-such-model"; }, "Unknown."));
  assert.equal(derive("transient-slab", {}, unknown).regime.reason, "unknown-declaration");
  assert.ok(derive("transient-slab", {}, unknown).results.some((r) => r.id === "r-rm-unresolved" && r.status === "unresolved"));
});

test("the 2D slice: grid, masks, boundaries only between resolved points, unresolved reasons and the gap", () => {
  const rg = derive("transient-sphere").regime;
  const n = rg.grid.xs.length * rg.grid.ys.length;
  assert.deepEqual([rg.axes.x.id, rg.axes.y.id, rg.axes.x.log, rg.axes.y.log], ["Bi", "Fo", true, true]);
  assert.ok(rg.unresolved.count > 0 && rg.unresolved.reasons.every((r) => /below 10⁻¹²/.test(r.reason)), "large Bi and Fo leave an unresolved corner");
  const lx = rg.grid.xs.map(Math.log10), ly = rg.grid.ys.map(Math.log10);
  const resolved = (ix, iy) => rg.unresolved.mask[iy * rg.grid.xs.length + ix] === "0";
  for (const l of rg.layers) {
    for (const r of l.regions) assert.equal(r.mask.length, n);
    for (const c of l.curves) for (const [x, y] of c.points) {
      // Every boundary point lies in a cell whose four corners are resolved: no boundary across an unresolved point.
      // A point on a grid line belongs to the cells on both sides of it.
      const cells = (axis, v) => axis.map((_, i) => i).filter((i) => i + 1 < axis.length && axis[i] <= v + 1e-9 && v - 1e-9 <= axis[i + 1]);
      const ok = cells(lx, Math.log10(x)).some((cx) => cells(ly, Math.log10(y)).some((cy) => resolved(cx, cy) && resolved(cx + 1, cy) && resolved(cx, cy + 1) && resolved(cx + 1, cy + 1)));
      assert.ok(ok, `${l.id} at (${x}, ${y})`);
    }
  }
  assert.ok(rg.gap.count > 0, "some resolved points have no approximation within the tolerance");
  assert.ok(rg.intersections.length > 0 && rg.limits.some((L) => L.coupled));
  assert.deepEqual(rg.layers.map((l) => l.kind), ["approximation", "approximation", "approximation", "approximation", "approximation", "balance", "balance"]);
});

test("a picked boundary is refined onto its criterion, and each region agrees with the evaluation at its points", () => {
  const rg = derive("transient-slab", { pick: "one-mode:0" }).regime;
  assert.ok(rg.boundary.refined && rg.boundary.residual < 1e-9, `residual ${rg.boundary.residual}`);
  const err = rg.boundary.point.layers.find((l) => l.layer === "one-mode").value;
  assert.ok(Math.abs(Math.log10(err) - Math.log10(rg.tolerance)) < 1e-9, `the one-mode error on its boundary is the tolerance: ${err}`);
  const impl = RM.implement(D.find(DATA, "slab-convection"));
  const meets = rg.layers.find((l) => l.id === "lumped").regions[0].mask;
  for (const k of [0, 77, 400, 913, 1270]) {
    const ix = k % rg.grid.xs.length, iy = Math.floor(k / rg.grid.xs.length);
    const v = impl.evaluate({ Bi: rg.grid.xs[ix], Fo: rg.grid.ys[iy] }).values["err-lumped"];
    assert.equal(meets[k] === "1", v <= rg.tolerance, `node ${k}`);
  }
});

test("a 1D diagram: the slab with a source has exact boundaries at Bi = 2t/(1 − t) and 2(1 − t)/t, and its crossover at Bi = 2", () => {
  const rg = derive("volumetric-source").regime;
  assert.equal(rg.axes.y, null);
  assert.deepEqual(rg.exactBoundaries, { uniform: "2/99", "surface-temperature": "198", source: "2" });
  const at = (id) => rg.layers.find((l) => l.id === id).curves.map((c) => c.points[0][0]);
  assert.ok(Math.abs(at("uniform")[0] - 2 / 99) < 1e-9 && Math.abs(at("surface-temperature")[0] - 198) < 1e-7 && Math.abs(at("source")[0] - 2) < 1e-9);
  assert.deepEqual(rg.gap.intervals.map((iv) => iv.map((x) => Number(x.toPrecision(6)))), [[0.020202, 198]], "between the two exact boundaries only the exact solution holds");
  const t3 = derive("volumetric-source", { tolerance: "1e-3" }).regime.exactBoundaries;
  assert.deepEqual([t3.uniform, t3["surface-temperature"]], ["2/999", "1998"]);
});

test("axes, scales and fixed values come from the view state, with a notice for each value that cannot apply", () => {
  const swapped = derive("transient-slab", { map_x: "Fo", map_y: "Bi", x_scale: "linear" }).regime;
  assert.deepEqual([swapped.axes.x.id, swapped.axes.y.id, swapped.axes.x.log, swapped.axes.y.log], ["Fo", "Bi", false, true]);
  const oneD = derive("transient-slab", { map_y: "none", fixed: "Fo=0.5" }).regime;
  assert.equal(oneD.axes.y, null);
  assert.deepEqual(oneD.fixed.map((f) => [f.id, f.value, f.source]), [["Fo", 0.5, "you"]]);
  const bad = derive("transient-slab", { map_y: "none", fixed: "Fo=99, junk" }).regime;
  assert.ok(bad.notices.some((n) => /outside the declared domain/.test(n)) && bad.notices.some((n) => /cannot be read/.test(n)));
  assert.deepEqual(bad.fixed.map((f) => f.value), [0.25], "an invalid fixed value keeps the record's value");
  const fin2 = derive("straight-fin", { map_y: "aspect" }).regime;
  assert.equal(fin2.axes.y.id, "aspect");
  assert.ok(fin2.layers.find((l) => l.id === "transverse").curves.length >= 1, "the transverse validity boundary is a curve in the (λ, PL/A_c) slice");
});

test("limit paths: the lumped limit keeps Bi·Fo fixed and the short-time limit keeps Bi√Fo fixed, both coupled", () => {
  const rg = derive("transient-slab").regime;
  const lumped = rg.limits.find((L) => L.id === "lumped-limit"), short = rg.limits.find((L) => L.id === "short-limit");
  assert.ok(lumped.coupled && short.coupled && !rg.limits.find((L) => L.id === "fixed-fo").coupled);
  for (const [b, f] of lumped.points) assert.ok(Math.abs(b * f - 0.125) < 1e-9);
  for (const [b, f] of short.points) assert.ok(Math.abs(b * Math.sqrt(f) - 0.25) < 1e-9);
});

test("the inspection reconstructs the dimensional values, checks the energy balance, and lists the reduced models", () => {
  const p = derive("transient-slab").regime.point;
  assert.deepEqual(p.reduced.map((r) => r.id), ["one-mode"]);
  const recon = Object.fromEntries(p.detail.reconstruction.map((r) => [r.id, r.value]));
  assert.equal(recon["recon-Bi"], 1250, "h = Bi k/L");
  assert.equal(recon["recon-Fo"], 8, "t = Fo L²/α");
  assert.ok(Math.abs(recon["T-centre"] - (293.15 + 280 * p.detail.values.find((v) => v.id === "centre").value)) < 1e-6);
  assert.ok(p.detail.checks.every((c) => c.passed));
  const q = derive("transient-slab", { point: "0.01,5" }).regime.point;
  assert.ok(q.reduced.some((r) => r.id === "lumped"), "at small Bi and late time the lumped model holds");
  assert.equal(derive("transient-slab", { point: "0.01,5" }).regime.point.detail.reconstruction.find((r) => r.id === "recon-Bi").value, 25);
  const wall = derive("multilayer-wall").regime.point.detail;
  assert.ok(wall.checks.length === 3 && wall.checks.every((c) => c.passed && c.status === "exact"), "continuity, the jump and the closure are exact at the record's point");
  const fin = derive("straight-fin").regime.point.detail;
  assert.ok(Math.abs(fin.reconstruction.find((r) => r.id === "recon-lambda").value - 25) < 1e-9, "h from λ");
});

test("the dominant-balance and asymptotic derivations: every order of the slab's expansion checks exactly, and the fin's outer problem loses its order", () => {
  const an = derive("transient-slab").regime.analysis;
  const small = an.asymptotic.limits.find((L) => L.id === "small-bi");
  assert.ok(small.coupled && small.orders.length === 3 && small.orders.every((o) => o.checks.equation && o.checks.surface && o.checks.solvability));
  assert.match(small.orders[1].result, /\\frac\{1\}\{6\}/, "c₁ = 1/6");
  assert.ok(an.balance.balances.every((b) => b.reduced && b.neglected && b.residual.tex), "each balance has its reduced model, neglected terms and residual");
  assert.match(an.balance.note, /not transitions/);
  const fin = derive("straight-fin").regime.analysis.asymptotic.limits.find((L) => L.id === "large-lambda");
  assert.match(fin.orderLoss, /loses its differential order/);
  assert.ok(fin.inner && /e\^\{-\\xi\}/.test(fin.inner.solution));
});

test("a convective fin tip matches the declaration's alternative condition and adds the insulated-tip approximation", () => {
  const rec = R.confirm(R.edit(R.fromExample(ENGINE, "straight-fin"), (inp) => { inp.conditions.find((c) => c.id === "c-tip").text = "-k*d(T,x) = h*(T - T_inf)"; }, "Convective tip."));
  const rg = derive("straight-fin", {}, rec).regime;
  assert.ok(rg.ready, rg.problems?.join(" "));
  assert.equal(rg.options.tip, "convective");
  assert.ok(rg.layers.some((l) => l.id === "insulated"));
});

test("invalidation: after confirmation, an edit that the map reads invalidates its results; the catalogue is part of the view only", () => {
  const rec = confirmed("transient-slab");
  const edited = R.edit(rec, (inp) => { inp.variables.find((v) => v.id === "v-h").value = "2500"; }, "Changed h.");
  const d = Model.derive(state("transient-slab"), DATA, edited);
  const stale = d.results.filter((r) => r.id.startsWith("r-rm-") && !r.valid);
  assert.ok(stale.length && stale.every((r) => r.invalidatedBy.includes("v-h")));
  const fresh = Model.derive(state("transient-slab"), DATA, R.confirm(edited));
  assert.equal(fresh.regime.params.find((p) => p.id === "Bi").exact, "1");
  const a = Model.derive(state("transient-slab"), DATA, rec), b = Model.derive(state("transient-slab", { tool: "catalogue", family: "fin" }), DATA, rec);
  assert.deepEqual(a.results, b.results, "the catalogue's selection changes no result");
});
