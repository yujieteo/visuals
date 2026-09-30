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

/* Bulk entries of a deck as {name, large, fields}, joining continuation lines. */
function bulkEntries(deck) {
  const lines = deck.split("\n"), out = [];
  for (const l of lines.slice(lines.indexOf("BEGIN BULK") + 1, lines.indexOf("ENDDATA"))) {
    if (l.startsWith("$")) continue;
    const head = l.slice(0, 8).trim();
    if (head === "" || head === "*") {
      const e = out.at(-1), width = e.large ? 16 : 8;
      for (let i = 8; i < 8 + (e.large ? 4 : 8) * width; i += width) e.fields.push(l.slice(i, i + width).trim());
      continue;
    }
    const large = head.endsWith("*"), width = large ? 16 : 8, fields = [];
    for (let i = 8; i < 8 + (large ? 4 : 8) * width; i += width) fields.push(l.slice(i, i + width).trim());
    out.push({ name: head.replace("*", ""), large, fields });
  }
  return out;
}
const named = (entries, name) => entries.filter((e) => e.name === name);
/* A NASTRAN real as a number, including the exponent-without-E form 1.5-3. */
const nreal = (text) => Number(text.replace(/(\d|\.)([+-]\d+)$/, "$1E$2"));

test("NASTRAN deck is hand-style fixed-column bulk data for the solved mesh", () => {
  for (const c of fixtures.cases) {
    const deck = B.exportBdf(c.model), nodes = B.mesh(B.validate(c.model));
    const lines = deck.split("\n");
    assert.equal(lines.filter((l) => l === "SOL 101").length, 1);
    const cend = lines.indexOf("CEND"), begin = lines.indexOf("BEGIN BULK");
    assert.ok(cend < begin);
    const caseControl = lines.slice(cend + 1, begin).map((l) => l.trim());
    for (const card of ["TITLE = BEAMDIAG LINEAR STATIC", "SUBCASE 1", "SPC = 1", "LOAD = 2", "DISPLACEMENT = ALL", "SPCFORCES = ALL"])
      assert.ok(caseControl.includes(card), card);
    assert.equal(lines.at(-2), "ENDDATA");
    const bulk = lines.slice(begin + 1, lines.indexOf("ENDDATA"));
    for (const banner of ["Material and property", "Grid points", "Elements", "Constraints", "Loads"])
      assert.ok(bulk.includes(`$ ---- ${banner} ----`), banner);
    for (const l of bulk) {
      assert.ok(l.length <= 72, `line too long: ${l}`);
      if (l.startsWith("$")) continue;
      const width = l.slice(0, 8).trim().endsWith("*") || l.startsWith("*") ? 16 : 8;
      assert.match(l.slice(0, 8), /^([A-Z0-9]*\*?)\s*$/);
      for (let i = 8; i < l.length; i += width) assert.doesNotMatch(l.slice(i, i + width).trim(), /\s/, l);
    }
    const entries = bulkEntries(deck);
    // Cards of one type share one format.
    for (const name of new Set(entries.map((e) => e.name)))
      assert.equal(new Set(named(entries, name).map((e) => e.large)).size, 1, name);
    assert.deepEqual(named(entries, "PARAM").map((e) => e.fields.slice(0, 2)), [["POST", "0"]]);
    assert.equal(named(entries, "GRDSET")[0].fields[6], "345");
    const grids = named(entries, "GRID");
    assert.deepEqual(grids.map((e) => +e.fields[0]), nodes.map((_, i) => i + 1));
    grids.forEach((e, i) => close(nreal(e.fields[2]), nodes[i], c.model.length, `GRID ${i + 1}`, 1e-14));
    assert.deepEqual(named(entries, "CBAR").map((e) => +e.fields[0]), nodes.slice(1).map((_, i) => i + 1));
    // One SPC1 per support kind, listing every support grid once.
    const spc1 = named(entries, "SPC1");
    assert.ok(spc1.length <= 2);
    assert.equal(spc1.flatMap((e) => e.fields.slice(2).filter(Boolean)).length, c.model.supports.length);
  }
  const lines = B.exportBdf(fixtures.cases.find((c) => c.id === "simply-supported-udl").model).split("\n");
  for (const card of [
    "PARAM   POST    0",
    "MAT1    1       2.E11           0.3",
    "PBAR    1       1       0.005   8.E-5   8.E-5   1.6E-4",
    "GRDSET                                                  345",
    "GRID    2               1.5     0.      0.",
    "CBAR    1       1       1       2       0.      1.      0.",
    "SPC1    1       12      1       5",
    "PLOAD1  2       1       FY      FR      0.      -10000. 1.      -10000.",
  ]) assert.ok(lines.includes(card), card);
});

test("reals are written compactly and exactly, falling back to large field", () => {
  const cases = [[0, "0."], [6, "6."], [0.3, "0.3"], [-40000, "-40000."], [200e9, "2.E11"], [8e-5, "8.E-5"], [0.005, "0.005"], [1.6e-4, "1.6E-4"], [-1.25e-7, "-1.25-7"], [4.456e-4, "4.456-4"]];
  for (const [x, text] of cases) {
    assert.equal(B.exactReal(x, 8), text);
    assert.equal(nreal(text), x);
  }
  assert.equal(B.exactReal(1 / 3, 8), null);
  assert.equal(Number(B.exactReal(0.123456789, 16)), 0.123456789);
  for (const x of [-1.2345678901234e-300, 1 / 3, 7 / 6, -123456.789012345]) {
    const text = B.nastranReal(x);
    assert.ok(text.length <= 16, text);
    close(nreal(text), x, 0, `rounded ${x}`, 1e-10);
  }
  // A mesh in sevenths cannot be written exactly in eight characters, so every GRID goes large field.
  const deck = B.exportBdf({ ...fixtures.cases[0].model, divisions: 7 });
  const grids = named(bulkEntries(deck), "GRID");
  assert.ok(grids.every((e) => e.large));
  const nodes = B.mesh(B.validate({ ...fixtures.cases[0].model, divisions: 7 }));
  grids.forEach((e, i) => close(nreal(e.fields[2]), nodes[i], 6, `GRID ${i + 1}`, 1e-14));
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

  const entries = bulkEntries(B.exportBdf(model)), grids = named(entries, "GRID").length, spcs = named(entries, "SPC1");
  assert.equal(grids, B.mesh(result.model).length);
  assert.ok(grids > 10000);
  assert.equal(named(entries, "CBAR").length, grids - 1);
  assert.equal(named(entries, "FORCE").length, 149);
  assert.equal(named(entries, "MOMENT").length, 50);
  assert.equal(named(entries, "PLOAD1").length, grids - 1);
  // Every support lands on its own GRID with the right constrained components.
  const listed = (c) => spcs.filter((e) => e.fields[1] === c).flatMap((e) => e.fields.slice(2).filter(Boolean));
  assert.equal(new Set([...listed("12"), ...listed("126")]).size, S);
  assert.equal(listed("126").length, model.supports.filter((s) => s.kind === "fixed").length);
  assert.equal(listed("12").length, model.supports.filter((s) => s.kind === "pin").length);
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

/* ---------- unit conventions ---------- */

const SYSTEMS = Object.values(B.UNIT_SYSTEMS);
const QUANTITIES = ["length", "force", "moment", "distributed", "stress", "area", "inertia", "rigidity", "angle"];
const toSystem = (model, u) => B.scaleModel(B.validate(model), u);
const fromSystem = (model, u) => B.scaleModel(model, u, B.fromUnits);

test("every unit convention is consistent: stress is force per length squared and derived units follow", () => {
  assert.deepEqual(SYSTEMS.map((u) => u.id), ["kN-m", "N-m", "N-mm", "lbf-in", "kip-in"]);
  assert.ok(B.UNIT_SYSTEMS[B.DEFAULT_UNITS]);
  for (const u of SYSTEMS) {
    const { length: l, force: f } = u.factor, rel = (a, b) => Math.abs(a - b) / Math.abs(b);
    assert.ok(rel(u.factor.stress, f / l ** 2) < 1e-15, `${u.id} stress`);
    assert.ok(rel(u.factor.moment, f * l) < 1e-15 && rel(u.factor.distributed, f / l) < 1e-15, `${u.id} moment, distributed`);
    assert.ok(rel(u.factor.inertia, l ** 4) < 1e-15 && rel(u.factor.rigidity, f * l * l) < 1e-15, `${u.id} inertia, rigidity`);
    assert.equal(u.factor.angle, 1);
    for (const q of QUANTITIES) assert.ok(u.symbol[q], `${u.id} names ${q}`);
    assert.match(u.ascii, /^[\x20-\x7e]+$/, "NASTRAN comment text is ASCII");
  }
  assert.equal(B.UNIT_SYSTEMS["lbf-in"].factor.force, 4.4482216152605);
  assert.equal(B.UNIT_SYSTEMS["lbf-in"].factor.length, 0.0254);
  assert.equal(B.toUnits(1, "stress", "N-mm"), 1e-6);
  assert.throws(() => B.toUnits(1, "force", "furlong"), /Unknown unit convention/);
});

test("converting into a convention and back is exact to rounding, also through the page's 10-digit fields", () => {
  const values = [0, 1, -1, 0.1, 6, -12345.678, 2e11, 6.6667e-5, 3e-9, 1e-12, 7.3e14, Math.PI];
  for (const u of SYSTEMS) for (const q of QUANTITIES) for (const x of values) {
    const back = B.fromUnits(B.toUnits(x, q, u), q, u);
    assert.ok(Math.abs(back - x) <= 4 * Number.EPSILON * Math.abs(x), `${u.id} ${q} ${x} → ${back}`);
    // A field shows toPrecision(10); reading it back stays within that rounding.
    const shown = +B.toUnits(x, q, u).toPrecision(10), typed = B.fromUnits(shown, q, u);
    assert.ok(Math.abs(typed - x) <= 5e-10 * Math.abs(x), `${u.id} ${q} ${x} via field`);
    // Through every other convention and back again, as a user switching units would.
    let y = x;
    for (const w of SYSTEMS) y = B.fromUnits(B.toUnits(y, q, w), q, w);
    assert.ok(Math.abs(y - x) <= 16 * Number.EPSILON * Math.abs(x), `${q} ${x} through all`);
  }
  const model = fixtures.cases.find((c) => c.id === "fixed-pinned-pinned-mixed").model, v = B.validate(model);
  for (const u of SYSTEMS) {
    const back = fromSystem(toSystem(model, u), u);
    assert.equal(back.supports.length, v.supports.length);
    assert.ok(Math.abs(back.material.E - v.material.E) <= 4 * Number.EPSILON * v.material.E);
    back.loads.forEach((l, i) => {
      for (const k of ["x", "F", "C", "x1", "x2", "q1", "q2"]) if (k in l) assert.ok(Math.abs(l[k] - v.loads[i][k]) <= 4 * Number.EPSILON * Math.abs(v.loads[i][k]), `${u.id} load ${i} ${k}`);
    });
  }
});

test("the same beam entered in each convention gives the same results, and the right numbers in that convention", () => {
  // A propped continuous beam with every load kind, entered through each convention's numbers.
  const model = fixtures.cases.find((c) => c.id === "fixed-pinned-pinned-mixed").model;
  const si = B.solve(model), exSI = B.extremes(si), F = Math.abs(exSI.V.value), M = Math.abs(exSI.M.value), v = Math.abs(exSI.v.value);
  for (const u of SYSTEMS) {
    const entered = toSystem(model, u); // what a user would type in this convention
    const r = B.solve(fromSystem(entered, u));
    r.reactions.forEach((rr, i) => {
      close(rr.Fy, si.reactions[i].Fy, F, `${u.id} reaction ${i}`, 1e-12);
      close(rr.Mz, si.reactions[i].Mz, M, `${u.id} support moment ${i}`, 1e-12);
    });
    for (const x of [0, 1, 4.25, 7.5, model.length]) {
      const a = B.at(si, x), b = B.at(r, B.fromUnits(B.toUnits(x, "length", u), "length", u));
      close(b.Mright, a.Mright, M, `${u.id} M(${x})`, 1e-12);
      close(b.Vright, a.Vright, F, `${u.id} V(${x})`, 1e-12);
      close(b.v, a.v, v, `${u.id} v(${x})`, 1e-12);
    }
  }
  // A US-customary beam in its own numbers: 240 in simply supported span, 50 lbf/in down,
  // E = 29 000 ksi, I = 100 in⁴. Closed forms: M = wL²/8, v = 5wL⁴/(384 EI), σ = M c / I.
  for (const [id, w, E] of [["lbf-in", -50, 29e6], ["kip-in", -0.05, 29e3]]) {
    const L = 240, I = 100;
    const beam = fromSystem({ length: L, divisions: 4, material: { E, nu: 0.3 }, section: { A: 10, I, Iy: I, J: 2 * I, c: 6 },
      supports: [{ kind: "pin", x: 0 }, { kind: "pin", x: L }], loads: [{ kind: "dist", x1: 0, x2: L, q1: w, q2: w }] }, id);
    const r = B.solve(beam), ex = B.extremes(r), to = (x, q) => B.toUnits(x, q, id);
    close(to(ex.M.value, "moment"), -w * L * L / 8, 1, `${id} M max`, 1e-12);
    close(to(ex.v.value, "length"), 5 * w * L ** 4 / (384 * E * I), 1, `${id} v max`, 1e-12);
    close(to(r.reactions[0].Fy, "force"), -w * L / 2, 1, `${id} reaction`, 1e-12);
    close(to(Math.abs(ex.M.value) * r.model.section.c / r.model.section.I, "stress"), -w * L * L / 8 * 6 / I, 1, `${id} stress`, 1e-12);
  }
});

test("the NASTRAN deck states its unit convention and writes every number in it", () => {
  const model = fixtures.cases.find((c) => c.id === "fixed-pinned-pinned-mixed").model;
  assert.equal(B.exportBdf(model), B.exportBdf(model, { units: "N-m" }), "SI N, m, Pa stays the default");
  for (const u of SYSTEMS) {
    const deck = B.exportBdf(model, { units: u.id }), lines = deck.split("\n");
    assert.ok(lines.includes(`$ Units ${u.ascii}. Beam on X, loads in Y (+ up), moments about Z (+ CCW).`), u.id);
    assert.match(lines[0], new RegExp(`^\\$ Beam, L = [\\d.]+ ${u.symbol.length}:`));
    assert.match(deck, /^[\x00-\x7e]*$/, "deck is ASCII");
    // Numbers match the convention: read E, A and I back from MAT1 and PBAR (small or large field).
    const cards = {};
    for (let i = 0; i < lines.length; i++) {
      const name = lines[i].slice(0, 8).trim();
      if (!["MAT1", "MAT1*", "PBAR", "PBAR*"].includes(name)) continue;
      const w = name.endsWith("*") ? 16 : 8, per = w === 16 ? 4 : 8, text = [lines[i]];
      while (lines[i + 1] && lines[i + 1][0] === "*") text.push(lines[++i]);
      cards[name.replace("*", "")] = text.flatMap((t) => Array.from({ length: per }, (_, k) => t.slice(8 + k * w, 8 + (k + 1) * w).trim()));
    }
    const real = (s) => Number(s.replace(/([0-9.])([+-]\d+)$/, "$1E$2"));
    const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
    assert.ok(rel(real(cards.MAT1[1]), B.toUnits(model.material.E, "stress", u)) < 1e-9, `${u.id} E ${cards.MAT1[1]}`);
    assert.ok(rel(real(cards.PBAR[2]), B.toUnits(model.section.A, "area", u)) < 1e-9, `${u.id} A ${cards.PBAR[2]}`);
    assert.ok(rel(real(cards.PBAR[3]), B.toUnits(model.section.I, "inertia", u)) < 1e-9, `${u.id} I ${cards.PBAR[3]}`);
  }
  assert.ok(B.exportBdf(model, { units: "N-mm" }).includes("MAT1    1       200000.         0.3"));
  assert.throws(() => B.exportBdf(model, { units: "cubits" }), /Unknown unit convention/);
});

test("error messages give lengths in the chosen convention", () => {
  const good = fixtures.cases[0].model;
  assert.throws(() => B.solve({ ...good, supports: [{ kind: "pin", x: 0 }, { kind: "pin", x: 7 }] }, { units: "N-mm" }), /between 0 and 6000 mm/);
  assert.throws(() => B.solve({ ...good, length: 1e5 }, { units: "lbf-in" }), /between 0.0393701 in and 393701 in/);
  assert.throws(() => B.solve({ ...good, supports: [{ kind: "pin", x: 0 }, { kind: "pin", x: 0 }] }, { units: "kN-m" }), /x = 0 m/);
});
