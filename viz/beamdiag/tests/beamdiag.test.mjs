import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const B = require("../engine.js");
const read = async (name) => JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), "utf8"));
const fixtures = await read("fixtures.json");
const reference = await read("reference.json");

const close = (actual, expected, scale, label, tol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tol * Math.max(scale, Math.abs(expected), 1e-300), `${label}: ${actual} vs ${expected}`);

function quantity(result, q, x) {
  const L = result.model.length, a = B.at(result, x);
  const r = result.reactions.find((rr) => rr.x === x);
  return {
    R: r && r.Fy, Mr: r && r.Mz, v: a.v, theta: a.theta,
    M: x >= L ? a.Mleft : a.Mright, Mleft: a.Mleft, Mright: a.Mright, Vleft: a.Vleft, Vright: a.Vright,
  }[q];
}

test("closed-form results for simply supported, fixed-fixed, propped, cantilever and continuous beams", () => {
  let checked = 0;
  for (const c of fixtures.cases) {
    const result = B.solve(c.model), ex = B.extremes(result);
    // Zero-valued expectations are compared against the size of that quantity elsewhere on the beam.
    const scale = { v: Math.abs(ex.v.value), theta: Math.abs(ex.v.value) / result.model.length, R: Math.abs(ex.V.value) };
    for (const e of c.expect) {
      close(quantity(result, e.quantity, e.x), e.value, scale[e.quantity] ?? Math.abs(ex.M.value), `${c.id} ${e.formula}`);
      checked++;
    }
  }
  assert.ok(checked >= 40);
});

test("stiffness solution agrees with the independent Python (exact Macaulay) reference on every fixture", () => {
  assert.deepEqual(reference.cases.map((c) => c.id), fixtures.cases.map((c) => c.id));
  for (const ref of reference.cases) {
    const result = B.solve(fixtures.cases.find((c) => c.id === ref.id).model);
    const Fs = Math.max(...ref.reactions.map((r) => Math.abs(r.Fy)));
    const Ms = Math.max(...ref.points.flatMap((p) => [Math.abs(p.Mleft), Math.abs(p.Mright)]));
    const vs = Math.max(...ref.points.map((p) => Math.abs(p.v)));
    // Slopes can vanish at every sampled point (all supports and midspans of equal spans); fall back to v/L.
    const ts = Math.max(...ref.points.map((p) => Math.abs(p.theta)), vs / result.model.length);
    assert.equal(result.reactions.length, ref.reactions.length);
    ref.reactions.forEach((r, i) => {
      assert.equal(result.reactions[i].x, r.x);
      close(result.reactions[i].Fy, r.Fy, Fs, `${ref.id} R at ${r.x}`);
      close(result.reactions[i].Mz, r.Mz, Ms, `${ref.id} M at ${r.x}`);
    });
    for (const p of ref.points) {
      const a = B.at(result, p.x);
      close(a.Vleft, p.Vleft, Fs, `${ref.id} V(${p.x}⁻)`);
      close(a.Vright, p.Vright, Fs, `${ref.id} V(${p.x}⁺)`);
      close(a.Mleft, p.Mleft, Ms, `${ref.id} M(${p.x}⁻)`);
      close(a.Mright, p.Mright, Ms, `${ref.id} M(${p.x}⁺)`);
      close(a.v, p.v, vs, `${ref.id} v(${p.x})`);
      close(a.theta, p.theta, ts, `${ref.id} θ(${p.x})`);
    }
  }
});

test("loads and reactions are in equilibrium and supports hold their constraints", () => {
  for (const c of fixtures.cases) {
    const result = B.solve(c.model), eq = result.equilibrium;
    assert.ok(Math.abs(eq.Fy) <= 1e-10 * eq.scaleF, `${c.id} ΣF`);
    assert.ok(Math.abs(eq.Mz) <= 1e-10 * eq.scaleM, `${c.id} ΣM`);
    const ex = B.extremes(result), vScale = Math.abs(ex.v.value), L = result.model.length;
    for (const s of result.model.supports) {
      const a = B.at(result, s.x);
      assert.ok(Math.abs(a.v) <= 1e-12 * vScale, `${c.id} v = 0 at support ${s.x}`);
      if (s.kind === "fixed") assert.ok(Math.abs(a.theta) <= 1e-12 * vScale / L, `${c.id} θ = 0 at fixed ${s.x}`);
    }
    // Free or pinned ends carry no moment except an applied couple; both ends of the beam close to zero shear and moment.
    const at0 = B.at(result, 0), atL = B.at(result, L);
    const couples = (x) => result.model.loads.filter((l) => l.kind === "moment" && l.x === x).reduce((s, l) => s + l.C, 0);
    const fixedAt = (x) => result.reactions.find((r) => r.x === x && r.kind === "fixed");
    if (!fixedAt(0)) close(at0.Mright, -couples(0), Math.abs(ex.M.value), `${c.id} M(0⁺)`);
    if (!fixedAt(L)) close(atL.Mleft, couples(L), Math.abs(ex.M.value), `${c.id} M(L⁻)`);
  }
});

test("shear jumps by each point force and moment jumps by minus each couple", () => {
  const model = fixtures.cases.find((c) => c.id === "overhang-mixed-asymmetric").model;
  const result = B.solve(model);
  for (const l of model.loads) {
    const a = B.at(result, l.x);
    if (l.x === 0 || l.x === model.length) continue;
    const reaction = result.reactions.find((r) => r.x === l.x);
    if (l.kind === "point") close(a.Vright - a.Vleft, l.F + (reaction ? reaction.Fy : 0), 1e4, `V jump at ${l.x}`);
    if (l.kind === "moment") close(a.Mright - a.Mleft, -l.C, 1e4, `M jump at ${l.x}`);
  }
  // The plotted diagram keeps both sides of every jump at the same x.
  const pts = B.diagram(result, 4);
  const at3 = pts.filter((p) => p.x === 3);
  assert.ok(at3.length >= 2);
  assert.ok(Math.abs(Math.max(...at3.map((p) => p.M)) - Math.min(...at3.map((p) => p.M)) - 8e3) < 1e-6);
});

test("results do not depend on the number of elements (mesh convergence is exact)", () => {
  for (const id of ["fixed-fixed-triangular", "fixed-pinned-pinned-mixed", "two-span-continuous-udl"]) {
    const model = fixtures.cases.find((c) => c.id === id).model;
    const coarse = B.solve({ ...model, divisions: 1 });
    for (const n of [2, 5, 12, 40]) {
      const fine = B.solve({ ...model, divisions: n });
      coarse.reactions.forEach((r, i) => {
        // Hundreds of elements add round-off, not discretisation error.
        close(fine.reactions[i].Fy, r.Fy, 1e4, `${id} n=${n} R`, 1e-7);
        close(fine.reactions[i].Mz, r.Mz, 1e4, `${id} n=${n} M`, 1e-7);
      });
      for (const x of [0.37, 1.9, 4.4]) {
        const a = B.at(coarse, x), b = B.at(fine, x);
        close(b.Mright, a.Mright, 1e4, `${id} n=${n} M(${x})`, 1e-7);
        close(b.v, a.v, Math.abs(B.extremes(coarse).v.value), `${id} n=${n} v(${x})`, 1e-7);
      }
    }
  }
});

test("units are consistent: re-expressing the model in mm, N and MPa scales every result as expected", () => {
  const model = fixtures.cases.find((c) => c.id === "fixed-pinned-pinned-mixed").model;
  const k = 1000;
  const mmModel = {
    length: model.length * k, divisions: model.divisions,
    material: { E: model.material.E / 1e6, nu: model.material.nu },
    section: { A: model.section.A * k ** 2, I: model.section.I * k ** 4 },
    supports: model.supports.map((s) => ({ ...s, x: s.x * k })),
    loads: model.loads.map((l) => (l.kind === "point" ? { ...l, x: l.x * k }
      : l.kind === "moment" ? { ...l, x: l.x * k, C: l.C * k }
        : { ...l, x1: l.x1 * k, x2: l.x2 * k, q1: l.q1 / k, q2: l.q2 / k })),
  };
  const si = B.solve(model), mm = B.solve(mmModel);
  si.reactions.forEach((r, i) => {
    close(mm.reactions[i].Fy, r.Fy, 1e4, "reaction force (N)");
    close(mm.reactions[i].Mz, r.Mz * k, 1e7, "reaction moment (N·mm)");
  });
  for (const x of [1, 4.25, 7.5]) {
    const a = B.at(si, x), b = B.at(mm, x * k);
    close(b.Mright, a.Mright * k, 1e7, `M(${x})`);
    close(b.v, a.v * k, 1, `v(${x}) in mm`);
    close(b.theta, a.theta, 1e-3, `θ(${x})`);
  }
  // Linearity: doubling E halves deflection and leaves the indeterminate reactions unchanged.
  const stiff = B.solve({ ...model, material: { ...model.material, E: 2 * model.material.E } });
  stiff.reactions.forEach((r, i) => close(r.Fy, si.reactions[i].Fy, 1e4, "reaction independent of E"));
  close(B.at(stiff, 6).v, B.at(si, 6).v / 2, 1e-3, "v ∝ 1/E");
});

test("invalid models, mechanisms and singular systems give useful errors", () => {
  const good = fixtures.cases[0].model;
  const cases = [
    [{ ...good, length: 0 }, "length", /greater than zero/],
    [{ ...good, length: Number.NaN }, "length", /finite/],
    [{ ...good, material: { E: -1, nu: 0.3 } }, "material.E", /greater than zero/],
    [{ ...good, material: { E: 2e11, nu: 0.5 } }, "material.nu", /less than 0.5/],
    [{ ...good, section: { A: 1e-3, I: 0 } }, "section.I", /greater than zero/],
    [{ ...good, supports: [] }, "supports", /at least one support/],
    [{ ...good, supports: [{ kind: "pin", x: 3 }] }, "supports", /Mechanism/],
    [{ ...good, supports: [{ kind: "pin", x: 1 }, { kind: "pin", x: 1 }] }, "supports", /share/],
    [{ ...good, supports: [{ kind: "roller", x: 0 }, { kind: "pin", x: 6 }] }, "supports.0.kind", /pin or fixed/],
    [{ ...good, supports: [{ kind: "pin", x: 0 }, { kind: "pin", x: 7 }] }, "supports.1.x", /on the beam/],
    [{ ...good, loads: [{ kind: "dist", x1: 4, x2: 2, q1: -1, q2: -1 }] }, "loads.0.x2", /end to the right/],
    [{ ...good, loads: [{ kind: "point", x: 2 }] }, "loads.0.F", /finite/],
    [{ ...good, loads: [{ kind: "spring", x: 2 }] }, "loads.0.kind", /point force/],
    [{ ...good, loads: [{ kind: "point", x: 3 + 1e-9, F: -1 }, { kind: "point", x: 3, F: -1 }] }, "loads", /too close/],
    [{ ...good, divisions: 0 }, "divisions", /whole number/],
    [{ ...good, material: { E: 1e300, nu: 0.3 }, section: { A: 1, I: 1e300 } }, "section.I", /overflows/],
  ];
  for (const [model, field, message] of cases) {
    assert.throws(() => B.solve(model), (e) => e instanceof B.ModelError && e.field === field && message.test(e.message), `${field} ${message}`);
  }
  assert.throws(() => B.exportBdf({ ...good, loads: [] }), /non-zero load/);
});

test("section properties follow the standard formulas", () => {
  const r = B.sectionProperties({ shape: "rect", b: 0.1, h: 0.2 });
  close(r.A, 0.02, 1, "A"); close(r.I, 0.1 * 0.2 ** 3 / 12, 1e-4, "I"); close(r.Iy, 0.2 * 0.1 ** 3 / 12, 1e-4, "Iy"); close(r.c, 0.1, 1, "c");
  const c = B.sectionProperties({ shape: "circle", d: 0.2 });
  close(c.I, Math.PI * 0.2 ** 4 / 64, 1e-4, "circle I"); close(c.J, 2 * c.I, 1e-4, "circle J");
  const t = B.sectionProperties({ shape: "tube", d: 0.2, t: 0.01 });
  close(t.I, Math.PI * (0.2 ** 4 - 0.18 ** 4) / 64, 1e-4, "tube I");
  assert.throws(() => B.sectionProperties({ shape: "tube", d: 0.1, t: 0.05 }), /less than half/);
  assert.equal(B.indeterminacy([{ kind: "fixed" }, { kind: "fixed" }]), 2);
  assert.equal(B.indeterminacy([{ kind: "pin" }, { kind: "pin" }]), 0);
  assert.equal(B.indeterminacy([{ kind: "fixed" }, { kind: "pin" }]), 1);
});

test("NASTRAN deck is well-formed large-field bulk data for the solved mesh", () => {
  for (const c of fixtures.cases) {
    const deck = B.exportBdf(c.model), nodes = B.mesh(B.validate(c.model));
    const lines = deck.split("\n");
    assert.equal(lines.filter((l) => l === "SOL 101").length, 1);
    assert.ok(lines.indexOf("CEND") < lines.indexOf("BEGIN BULK"));
    assert.ok(lines.includes("PARAM,POST,0"));
    assert.equal(lines.at(-2), "ENDDATA");
    const bulk = lines.slice(lines.indexOf("BEGIN BULK") + 1, lines.indexOf("ENDDATA"));
    for (const l of bulk) {
      if (l.startsWith("$") || l === "PARAM,POST,0") continue;
      assert.ok(l.length <= 72, `line too long: ${l}`);
      assert.match(l.slice(0, 8), /^([A-Z0-9]+\*|\*)\s*$/);
      for (let i = 8; i < l.length; i += 16) assert.doesNotMatch(l.slice(i, i + 16).trim(), /\s/);
    }
    assert.equal(bulk.filter((l) => l.startsWith("GRID*")).length, nodes.length);
    assert.equal(bulk.filter((l) => l.startsWith("CBAR*")).length, nodes.length - 1);
    assert.equal(bulk.filter((l) => l.startsWith("SPC1*")).length, c.model.supports.length);
  }
  assert.equal(B.nastranReal(-1.2345678901234e-300).length, 16);
  assert.equal(B.nastranReal(0), "0.0");
});

test("no cap on supports, loads or elements: 150 supports, 200 loads and a fine mesh solve and export in full", () => {
  const S = 150, L = 149;
  const model = {
    length: L, divisions: 50, material: { E: 200e9, nu: 0.3 }, section: { A: 5e-3, I: 8e-5 },
    supports: Array.from({ length: S }, (_, i) => ({ kind: i % 37 === 0 ? "fixed" : "pin", x: i })),
    loads: [
      ...Array.from({ length: 149 }, (_, i) => ({ kind: "point", x: i + 0.25, F: -1000 * (1 + (i % 7)) })),
      ...Array.from({ length: 50 }, (_, i) => ({ kind: "moment", x: 3 * i + 0.6, C: 500 * (i % 2 ? 1 : -1) })),
      { kind: "dist", x1: 0, x2: L, q1: -2000, q2: -8000 },
    ],
  };
  const result = B.solve(model), eq = result.equilibrium;
  assert.equal(result.reactions.length, S);
  assert.ok(Math.abs(eq.Fy) <= 1e-10 * eq.scaleF && Math.abs(eq.Mz) <= 1e-10 * eq.scaleM);
  for (const s of model.supports) assert.equal(B.at(result, s.x).v, 0);
  // A finer mesh gives the same reactions up to round-off: the element count is free and exact.
  const coarse = B.solve({ ...model, divisions: 1 }), Rs = Math.max(...coarse.reactions.map((r) => Math.abs(r.Fy)));
  result.reactions.forEach((r, i) => close(r.Fy, coarse.reactions[i].Fy, Rs, `R at ${r.x}`, 1e-8));

  const bulk = B.exportBdf(model).split("\n");
  const grids = bulk.filter((l) => l.startsWith("GRID*")).length, spcs = bulk.filter((l) => l.startsWith("SPC1*"));
  assert.equal(grids, B.mesh(result.model).length);
  assert.ok(grids > 10000);
  assert.equal(bulk.filter((l) => l.startsWith("CBAR*")).length, grids - 1);
  assert.equal(spcs.length, S);
  assert.equal(bulk.filter((l) => l.startsWith("FORCE*")).length, 149);
  assert.equal(bulk.filter((l) => l.startsWith("MOMENT*")).length, 50);
  assert.equal(bulk.filter((l) => l.startsWith("PLOAD1*")).length, grids - 1);
  // Every support lands on its own GRID with the right constrained components.
  const ids = new Set(spcs.map((l) => l.slice(40, 56).trim()));
  assert.equal(ids.size, S);
  assert.equal(spcs.filter((l) => l.slice(24, 40).trim() === "126").length, model.supports.filter((s) => s.kind === "fixed").length);
});

test("a very fine mesh keeps the page responsive: solving, plotting and extremes cost the same at 10000 elements per segment", () => {
  const model = { ...fixtures.cases.find((c) => c.id === "overhang-mixed-asymmetric").model };
  const coarse = B.solve({ ...model, divisions: 1 }), coarseEx = B.extremes(coarse), coarsePts = B.diagram(coarse);
  const t0 = performance.now();
  const fine = B.solve({ ...model, divisions: 10000 }), ex = B.extremes(fine), pts = B.diagram(fine);
  assert.ok(performance.now() - t0 < 1000, `took ${performance.now() - t0} ms`);
  assert.equal(pts.length, coarsePts.length);
  assert.ok(pts.length < 2000);
  pts.forEach((p, i) => {
    assert.equal(p.x, coarsePts[i].x);
    close(p.V, coarsePts[i].V, Math.abs(coarseEx.V.value), `V(${p.x})`);
    close(p.M, coarsePts[i].M, Math.abs(coarseEx.M.value), `M(${p.x})`);
    close(p.v, coarsePts[i].v, Math.abs(coarseEx.v.value), `v(${p.x})`);
  });
  for (const k of ["V", "M", "v"]) close(ex[k].value, coarseEx[k].value, Math.abs(coarseEx[k].value), `extreme ${k}`);
  // Both sides of every jump are plotted at the event itself.
  for (const l of model.loads.filter((ld) => ld.kind === "point" && ld.x > 0 && ld.x < model.length)) {
    const a = B.at(fine, l.x), side = pts.filter((p) => p.x === l.x).map((p) => p.V);
    assert.ok(side.includes(a.Vleft) && side.includes(a.Vright), `V jump at ${l.x}`);
  }
});

test("the deflection extreme is found where the slope vanishes, not just at a sample", () => {
  // Simply supported, uniform load: v_max = 5 q L⁴ / (384 EI) at midspan.
  const L = 7, q = -12e3, E = 200e9, I = 3e-5;
  const r = B.solve({ length: L, material: { E, nu: 0.3 }, section: { A: 1e-2, I }, supports: [{ kind: "pin", x: 0 }, { kind: "pin", x: L }],
    loads: [{ kind: "point", x: 1, F: 0 }, { kind: "dist", x1: 0, x2: L, q1: q, q2: q }] });
  const ex = B.extremes(r);
  close(ex.v.value, 5 * q * L ** 4 / (384 * E * I), 1, "v max", 1e-12);
  close(ex.v.x, L / 2, L, "at midspan", 1e-9);
  close(ex.M.value, -q * L * L / 8, 1, "M max", 1e-12);
});
