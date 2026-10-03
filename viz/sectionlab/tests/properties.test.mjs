import test from "node:test";
import assert from "node:assert/strict";
import { L, FIXTURES, REFERENCE, RAW, DIM, near, clone, compute } from "./helpers.mjs";

const PROPS = Object.keys(DIM);

test("closed-form expectations hold for every fixture (1e-9)", () => {
  let checked = 0;
  for (const c of FIXTURES.cases) {
    const r = compute(c.model, { plastic: c.expect.some((e) => ["Zp", "Mp", "Mel", "shapeFactor", "MpN"].includes(e.quantity)) });
    for (const e of c.expect) {
      let got;
      if (e.quantity === "J") got = r.torsion.J;
      else if (["Zp", "Mp", "Mel", "shapeFactor", "MpN"].includes(e.quantity)) got = r.plastic[e.quantity];
      else got = r.props[e.quantity];
      assert.equal(typeof got, "number", `${c.id} ${e.quantity} missing`);
      near(got, e.value, 1e-9, { area: r.props.A, dim: DIM[e.quantity] || 0, msg: `${c.id} ${e.quantity} = ${e.formula}` });
      checked++;
    }
  }
  assert.ok(checked >= 45, `only ${checked} expectations checked`);
});

test("engine matches the independent Python reference on every fixture (1e-9)", () => {
  for (const c of FIXTURES.cases) {
    const r = compute(c.model, { plastic: false });
    const ref = REFERENCE.cases[c.id].properties;
    for (const k of PROPS) {
      if (!(k in ref)) continue;
      near(r.props[k], ref[k], 1e-9, { area: r.props.A, dim: DIM[k], msg: `${c.id} ${k}` });
    }
  }
});

test("moving a section moves its centroid and leaves centroidal properties unchanged", () => {
  const base = FIXTURES.cases.find((c) => c.id === "mixed").model;
  const a = compute(base, { plastic: false }).props;
  const moved = clone(base);
  for (const p of moved.parts) { p.x += 1234.5; p.y -= 987.25; }
  const b = compute(moved, { plastic: false }).props;
  near(b.cx, a.cx + 1234.5, 1e-9, { area: a.A, dim: 1, msg: "cx" });
  near(b.cy, a.cy - 987.25, 1e-9, { area: a.A, dim: 1, msg: "cy" });
  for (const k of ["A", "Ix", "Iy", "Ixy", "I1", "I2", "Qx", "Qy", "Sx_top", "Sy_left"]) near(b[k], a[k], 1e-9, { area: a.A, dim: DIM[k], msg: k });
});

test("turning every part 90° about the origin swaps Ix and Iy and flips Ixy", () => {
  const base = FIXTURES.cases.find((c) => c.id === "triangle").model;
  const a = compute(base, { plastic: false }).props;
  const t = clone(base);
  t.parts[0].orientation = 90;
  const b = compute(t, { plastic: false }).props;
  near(b.Ix, a.Iy, 1e-12, { area: a.A, dim: 4, msg: "Ix" });
  near(b.Iy, a.Ix, 1e-12, { area: a.A, dim: 4, msg: "Iy" });
  near(b.Ixy, -a.Ixy, 1e-12, { area: a.A, dim: 4, msg: "Ixy" });
  near(b.I1, a.I1, 1e-12, { area: a.A, dim: 4, msg: "I1" });
});

test("principal values are the extremes of the rotated second moment", () => {
  for (const id of ["triangle", "angle", "mixed"]) {
    const p = compute(FIXTURES.cases.find((c) => c.id === id).model, { plastic: false }).props;
    const I = (t) => (p.Ix + p.Iy) / 2 + ((p.Ix - p.Iy) / 2) * Math.cos(2 * t) - p.Ixy * Math.sin(2 * t);
    near(I(p.theta), p.I1, 1e-12, { area: p.A, dim: 4, msg: `${id} I(θ) = I1` });
    near(I(p.theta + Math.PI / 2), p.I2, 1e-12, { area: p.A, dim: 4, msg: `${id} I(θ + 90°) = I2` });
    for (let t = 0; t < Math.PI; t += 0.01) assert.ok(I(t) <= p.I1 * (1 + 1e-12) && I(t) >= p.I2 * (1 - 1e-12));
    assert.ok(p.theta > -Math.PI / 2 && p.theta <= Math.PI / 2);
  }
});

test("a modular ratio of n counts a part n times, and E_base only rescales", () => {
  const m = FIXTURES.cases.find((c) => c.id === "composite").model;
  const a = compute(m, { plastic: false }).props;
  const m2 = clone(m); m2.E_base = 210000;
  const b = compute(m2, { plastic: false }).props;
  near(b.A, a.A / 3, 1e-12, { area: a.A, dim: 2, msg: "A scales with 1/E_base" });
  near(b.Ix, a.Ix / 3, 1e-12, { area: a.A, dim: 4, msg: "Ix scales with 1/E_base" });
  near(b.cy, a.cy, 1e-12, { area: a.A, dim: 1, msg: "centroid does not depend on E_base" });
  const parts = Object.fromEntries(a.parts.map((q) => [q.id, q]));
  assert.equal(parts.box.n, 1);
  assert.equal(parts.plate.n, 3);
});

test("a void takes its host's modulus and subtracts exactly its own area", () => {
  const m = FIXTURES.cases.find((c) => c.id === "mixed").model;
  const r = compute(m, { plastic: false });
  const tv = r.props.parts.find((q) => q.id === "tv");
  assert.equal(tv.host, "t");
  assert.equal(tv.material, "alc");
  near(tv.area, Math.PI * 6.25, 1e-12, { msg: "void area" });
  const noVoid = clone(m); noVoid.parts = noVoid.parts.filter((p) => p.id !== "tv");
  const r2 = compute(noVoid, { plastic: false });
  near(r2.props.A - r.props.A, (tv.n * Math.PI * 25) / 4, 1e-12, { area: r.props.A, dim: 2, msg: "A difference" });
});

test("Q is the first moment of either side of the centroidal axis", () => {
  for (const c of FIXTURES.cases) {
    const r = compute(c.model, { plastic: false });
    const G = L.geometry;
    let below = 0;
    // Q below the axis, from the same engine, must equal Q above (the centroid splits the first moment).
    for (const q of L.section.assemble(r.model).parts) {
      const cc = G.transformContours(q.contours, 0, -r.props.cx, -r.props.cy);
      below -= (q.part.void ? -1 : 1) * (q.material.E / r.model.E_base) * G.moments(cc, { hi: 0, ni: 1, nj: 2 })[0][1];
    }
    near(below, r.props.Qx, 1e-9, { area: r.props.A, dim: 3, msg: `${c.id} Q below = Q above` });
  }
});

test("rounded corners: fillet geometry is tangent and every radius combination builds", () => {
  const S = L.shapes.SHAPES;
  const b = S.rect.build({ b: 100, h: 60 }, [0, 5, 29.999, 30]);
  for (let i = 0; i < b.contours[0].length; i++) {
    const s = b.contours[0][i], n = b.contours[0][(i + 1) % b.contours[0].length];
    const e = L.geometry.segEnd(s), st = L.geometry.segStart(n);
    assert.ok(Math.hypot(e[0] - st[0], e[1] - st[1]) < 1e-9, "contour is closed and continuous");
  }
  assert.throws(() => S.rect.build({ b: 100, h: 60 }, [0, 30, 31, 0]), /too large/);
  assert.throws(() => S.rhs.build({ b: 100, h: 60, t: 30 }, [0, 0, 0, 0, 0, 0, 0, 0]), /Wall t/);
});

test("validation names the offending field", () => {
  const good = FIXTURES.cases.find((c) => c.id === "tee-hole").model;
  const bad = (edit, path, re) => {
    const m = clone(good); edit(m);
    assert.throws(() => L.section.normalize(m), (e) => e instanceof L.section.ModelError && e.path === path && re.test(e.message), `${path}`);
  };
  bad((m) => { m.parts[0].dims.b = -1; }, "parts[0].dims.b", /greater than 0/);
  bad((m) => { m.parts[0].dims = { b: 1 }; }, "parts[0].dims.h", /must be a number/);
  bad((m) => { m.parts[0].radii = [0, 0]; }, "parts[0].radii", /4 corner radii/);
  bad((m) => { m.parts[0].orientation = 45; }, "parts[0].orientation", /0 or 90/);
  bad((m) => { m.parts[1].material = "nope"; }, "parts[1].material", /unknown material/);
  bad((m) => { m.parts[1].id = "flange"; }, "parts[1].id", /used twice/);
  bad((m) => { m.materials[0].n = 0.5; }, "materials[0].n", /between 1 and 200/);
  bad((m) => { m.sectionlab = 2; }, "sectionlab", /Unsupported schema/);
  bad((m) => { m.plastic.axis = "z"; }, "plastic.axis", /one of/);
});

test("overlapping solids, stray voids and overlapping voids are rejected; touching parts are not", () => {
  const good = FIXTURES.cases.find((c) => c.id === "tee-hole").model;
  assert.doesNotThrow(() => compute(good, { plastic: false }));
  const overlap = clone(good); overlap.parts[0].y = 105;
  assert.throws(() => compute(overlap, { plastic: false }), /overlap/);
  const stray = clone(good); stray.parts[2].x = 5; // crosses the web's edge
  assert.throws(() => compute(stray, { plastic: false }), /entirely inside one solid part/);
  const twoVoids = clone(good); twoVoids.parts.push({ ...clone(good.parts[2]), id: "hole2", y: -38 });
  assert.throws(() => compute(twoVoids, { plastic: false }), /Voids "hole" and "hole2" overlap/);
  const onlyVoid = clone(good); onlyVoid.parts = [good.parts[2]];
  assert.throws(() => compute(onlyVoid, { plastic: false }), /at least one solid/);
});

test("every example on the page computes, including its moment–curvature curve", () => {
  for (const p of RAW.presets) {
    const r = compute(p.model);
    assert.ok(r.props.A > 0, p.id);
    assert.ok(r.plastic && !r.plastic.error, `${p.id}: ${r.plastic && r.plastic.error}`);
  }
});
