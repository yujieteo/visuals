import test from "node:test";
import assert from "node:assert/strict";
import { L, FIXTURES, ACCURACY, RAW, near, clone, compute } from "./helpers.mjs";

const T = L.torsion;

test("the Saint-Venant series tends to the thin-strip and square limits", () => {
  near(T.rectangleSeries(100, 100), 0.1405770 * 100 ** 4, 1e-6, { msg: "square β = 0.140577" });
  const b = 1e4, h = 1;
  near(T.rectangleSeries(b, h), (b * h ** 3) / 3 * (1 - 0.630249 * h / b), 1e-6, { msg: "thin strip" });
  near(T.rectangleSeries(100, 300), T.rectangleSeries(300, 100), 1e-15, { msg: "symmetric in b, h" });
});

test("every formula is recorded, checked on cases and within its stated accuracy", () => {
  const ids = ["circle", "chs", "semicircle", "triangle-equilateral", "rect", "rhs-bredt-sharp", "rhs-bredt-rounded", "open-thin-wall", "cold-formed-thin-wall"];
  assert.deepEqual(Object.keys(ACCURACY.formulas).sort(), ids.sort());
  for (const [id, a] of Object.entries(ACCURACY.formulas)) {
    assert.equal(a.pass, a.measured <= a.stated, id);
    assert.equal(a.cases, a.checks.length, id);
    assert.ok(a.pass, `${id} is withdrawn: measured ${a.measured} > stated ${a.stated}`);
    for (const c of a.checks) near(T.formula(c.shape, c.dims, c.radii).J, c.J_formula, 1e-9, { msg: `${id} formula value` });
  }
});

test("J is given with its accuracy only for a single part with a verified formula", () => {
  const circle = compute(FIXTURES.cases.find((c) => c.id === "circle").model, { plastic: false }).torsion;
  assert.equal(circle.available, true);
  assert.equal(circle.formula, "circle");
  assert.equal(circle.stated, ACCURACY.formulas.circle.stated);
  assert.equal(circle.measured, ACCURACY.formulas.circle.measured);
  const na = (model, re) => { const t = compute(model, { plastic: false }).torsion; assert.equal(t.available, false); assert.match(t.reason, re); };
  na(FIXTURES.cases.find((c) => c.id === "tee-hole").model, /single library shape/);
  na(FIXTURES.cases.find((c) => c.id === "rounded-square").model, /rounded corners/);
  na(FIXTURES.cases.find((c) => c.id === "triangle").model, /equilateral/);
  na(FIXTURES.cases.find((c) => c.id === "hexagon").model, /No verified/);
  const thick = clone(FIXTURES.cases.find((c) => c.id === "rhs-sharp").model);
  thick.parts[0].dims.t = 12;
  na(thick, /Bredt–Batho is used only/);
  const uneven = clone(FIXTURES.cases.find((c) => c.id === "rhs-rounded").model);
  uneven.parts[0].radii[5] = 3;
  na(uneven, /uniform wall/);
});

test("Bredt–Batho classifies sharp, mixed and rounded corners", () => {
  assert.equal(T.formula("rhs", { b: 100, h: 200, t: 5 }, [0, 0, 0, 0, 0, 0, 0, 0]).id, "rhs-bredt-sharp");
  assert.equal(T.formula("rhs", { b: 100, h: 200, t: 5 }, [10, 0, 10, 0, 5, 0, 5, 0]).id, "rhs-bredt-sharp");
  assert.equal(T.formula("rhs", { b: 100, h: 200, t: 5 }, [10, 10, 10, 10, 5, 5, 5, 5]).id, "rhs-bredt-rounded");
  // Sharp box: mid-line rectangle (b − t) × (h − t).
  const J = T.formula("rhs", { b: 100, h: 200, t: 5 }, [0, 0, 0, 0, 0, 0, 0, 0]).J;
  near(J, (4 * (95 * 195) ** 2 * 5) / (2 * (95 + 195)), 1e-14, { msg: "4 A_m² t / p_m" });
});

test("a formula that fails its stated accuracy is withdrawn to n/a", () => {
  const withdrawn = clone(ACCURACY);
  withdrawn.formulas.circle.pass = false;
  const t = L.compute(FIXTURES.cases.find((c) => c.id === "circle").model, { accuracy: withdrawn, plastic: false }).torsion;
  assert.equal(t.available, false);
  assert.match(t.reason, /Withdrawn/);
  const none = L.compute(FIXTURES.cases.find((c) => c.id === "circle").model, { accuracy: null, plastic: false }).torsion;
  assert.equal(none.available, false);
});

test("examples with a single shape report J", () => {
  for (const id of ["rhs", "chs"]) {
    const t = compute(RAW.presets.find((p) => p.id === id).model, { plastic: false }).torsion;
    assert.equal(t.available, true, id);
  }
});

test("thin-walled open sections: mid-line lengths, sharp corners only, and the thickness domain", () => {
  const J = (shape, d) => T.formula(shape, d, new Array(L.shapes.SHAPES[shape].corners(d).length).fill(0));
  near(J("ishape", { b: 150, h: 300, tf: 10, tw: 8 }).J, (2 * 150 * 1000 + 290 * 512) / 3, 1e-14, { msg: "I: flanges full width, web to flange mid-lines" });
  near(J("channel", { b: 100, h: 300, tf: 15, tw: 11 }).J, J("zed", { b: 100, h: 300, tf: 15, tw: 11 }).J, 1e-14, { msg: "channel and Z share their walls" });
  near(J("angle", { b: 100, h: 60, t: 8 }).J, ((100 + 60 - 8) * 512) / 3, 1e-14, { msg: "angle: one leg runs to the other's mid-line" });
  near(J("cross", { b: 200, h: 160, tb: 20, th: 15 }).J, (200 * 8000 + 140 * 3375) / 3, 1e-14, { msg: "cross" });
  for (const shape of ["ishape", "channel", "zed", "tee", "angle", "cross"]) {
    const d = L.shapes.defaults(shape);
    const rolled = T.formula(shape, d, L.shapes.SHAPES[shape].defaultRadii(d));
    if (L.shapes.SHAPES[shape].defaultRadii(d).some((r) => r > 0)) assert.match(rolled.reason, /Root fillets/, `${shape} with its default fillets`);
  }
  assert.match(J("tee", { b: 100, h: 100, tf: 16, tw: 8 }).reason, /walls up to 0.15/);
  assert.equal(J("tee", { b: 100, h: 100, tf: 15, tw: 15 }).id, "open-thin-wall");
  for (const [shape, thick, thin] of [["ishape", "tf", "tw"], ["channel", "tf", "tw"], ["zed", "tf", "tw"], ["tee", "tf", "tw"], ["cross", "tb", "th"]]) {
    for (const [big, small] of [[thick, thin], [thin, thick]]) {
      assert.equal(J(shape, { b: 140, h: 140, [big]: 21, [small]: 15 }).id, "open-thin-wall", `${shape} ${big}/${small} = 1.4`);
      assert.match(J(shape, { b: 140, h: 140, [big]: 21, [small]: 14.9 }).reason, /at most 1.4 times the thinner/, `${shape} ${big}/${small} > 1.4`);
    }
  }
});

test("a sharp rolled shape on its own reports J with the open-section accuracy; with fillets it is n/a", () => {
  const sharp = compute(FIXTURES.cases.find((c) => c.id === "ishape-sharp").model, { plastic: false }).torsion;
  assert.equal(sharp.available, true);
  assert.equal(sharp.formula, "open-thin-wall");
  assert.equal(sharp.stated, ACCURACY.formulas["open-thin-wall"].stated);
  const rolled = compute(FIXTURES.cases.find((c) => c.id === "ishape-rolled").model, { plastic: false }).torsion;
  assert.equal(rolled.available, false);
});

test("cold-formed strips: J = L t³/3 with L the developed mid-line, equal to area / t, within the wall domain", () => {
  for (const shape of ["cfangle", "cfchannel", "cfzed", "cfhat"]) {
    for (const lip of [undefined, 0]) {
      const d = { ...L.shapes.defaults(shape) };
      if (lip === 0) { if (!("c" in d)) continue; d.c = 0; }
      const A = L.geometry.area(L.shapes.SHAPES[shape].build(d, []).contours);
      near(T.developedLength(shape, d) * d.t, A, 1e-12, { msg: `${shape} developed length × t = area` });
      const f = T.formula(shape, d, []);
      assert.equal(f.id, "cold-formed-thin-wall", shape);
      near(f.J, (A * d.t ** 2) / 3, 1e-12, { msg: `${shape} J` });
    }
  }
  assert.match(T.formula("cfangle", { b: 40, h: 30, t: 3.5, ri: 2 }, []).reason, /walls up to 0.1/);
  assert.equal(T.formula("cfangle", { b: 40, h: 30, t: 3, ri: 2 }, []).id, "cold-formed-thin-wall");
});

test("cold-formed shapes reject impossible dimensions with a named reason", () => {
  const S = L.shapes.SHAPES;
  assert.throws(() => S.cfchannel.build({ h: 100, b: 40, c: 2, t: 3, ri: 2 }, []), /Lip c must be 0/);
  assert.throws(() => S.cfchannel.build({ h: 100, b: 40, c: 60, t: 3, ri: 2 }, []), /Lip c must be 0/);
  assert.throws(() => S.cfangle.build({ b: 20, h: 20, t: 3, ri: 20 }, []), /too large/);
  assert.throws(() => S.cfhat.build({ h: 40, b: 40, f: 2, t: 3, ri: 2 }, []), /overhang f/);
});
