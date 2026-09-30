import test from "node:test";
import assert from "node:assert/strict";
import { L, FIXTURES, REFERENCE, near, clone, compute } from "./helpers.mjs";

const P = L.plastic;
const fixture = (id) => clone(FIXTURES.cases.find((c) => c.id === id).model);

test("Ramberg–Osgood inversion reproduces the strain and the 0.2% proof point", () => {
  for (const [E, s, n] of [[210000, 355, 25], [200000, 230, 6], [70000, 240, 10], [70000, 170, 1.5]]) {
    near(P.roStress(E, s, n, s / E + 0.002), s, 1e-13, { msg: "σ(ε_0.2) = σ0.2" });
    for (const e of [1e-7, 1e-4, 1e-3, 0.005, 0.02, 0.2]) {
      const sig = P.roStress(E, s, n, e);
      near(P.roStrain(E, s, n, sig), e, 1e-12, { msg: `ε(σ(${e}))` });
    }
  }
  assert.equal(P.roStress(210000, 355, 25, 0), 0);
});

test("M–κ matches the independent Python width-integration reference (1e-6)", () => {
  let n = 0;
  for (const c of FIXTURES.cases.filter((x) => x.plastic)) {
    const r = compute(c.model, { points: 65 }).plastic;
    const ref = REFERENCE.cases[c.id].plastic;
    near(r.alpha, ref.angle, 1e-12, { msg: `${c.id} bending axis angle` });
    near(r.limit.kappa, ref.kappa_lim, 1e-6, { msg: `${c.id} κ_lim` });
    near(r.limit.M, ref.M_lim, 1e-6, { msg: `${c.id} M_lim` });
    near(r.Mp, ref.Mp, 1e-6, { msg: `${c.id} M_p` });
    if ("MpN" in ref) near(r.MpN, ref.MpN, 1e-6, { msg: `${c.id} M_p(N)` });
    else assert.equal(r.MpN, null, `${c.id} M_p(N) only with an axial force`);
    ref.points.forEach((p, j) => {
      const q = r.curve[8 * j];
      near(q.kappa, p.kappa, 1e-6, { msg: `${c.id} κ point ${j}` });
      // Relative to the curve's own scale: at κ = 0 with an axial force the moment is ~0.
      assert.ok(Math.abs(q.M - p.M) <= 1e-6 * Math.abs(ref.M_lim), `${c.id} M point ${j}: ${q.M} vs ${p.M}`);
      n++;
    });
  }
  assert.ok(n >= 100);
});

test("small curvature follows linear elasticity: M = E_base I κ (transformed section)", () => {
  for (const id of ["rect", "composite", "tee-hole", "chs"]) {
    const m = fixture(id);
    const r = compute(m, { points: 400 });
    const p = r.props, pt = r.plastic.curve[1];
    const I = P.frameInertia(p, r.plastic.alpha).Ivv;
    near(pt.M, p.E_base * I * pt.kappa, 2e-4, { msg: `${id} initial stiffness` });
  }
});

test("the curve ends where the governing fibre reaches exactly ε_lim", () => {
  for (const c of FIXTURES.cases.filter((x) => x.plastic)) {
    const r = compute(c.model).plastic;
    near(r.limit.util, 1, 1e-6, { msg: `${c.id} utilisation at the end` });
    const g = r.limit.governing;
    const mats = Object.fromEntries(c.model.materials.map((m) => [m.id, m]));
    const part = c.model.parts.find((p) => p.id === g.part);
    const mat = mats[part.material];
    const lim = g.fibre === "tension" ? mat.eps_lim : (mat.compression || mat).eps_lim;
    near(Math.abs(g.strain), lim, 1e-6, { msg: `${c.id} governing strain` });
    for (let i = 1; i < r.curve.length; i++) assert.ok(r.curve[i].kappa > r.curve[i - 1].kappa && r.curve[i].M > r.curve[i - 1].M, `${c.id} curve increases`);
  }
});

test("mode (b) rotates the neutral axis so the cross moment vanishes; elastic angle matches theory", () => {
  const m = fixture("angle-zero-cross");
  const r = compute(m, { points: 200 });
  const pl = r.plastic;
  for (const s of pl.curve.slice(1)) assert.ok(Math.abs(s.Mcross) <= 1e-8 * Math.abs(s.M), `cross moment ${s.Mcross} vs M ${s.M}`);
  const I = P.frameInertia(r.props, 0);
  near(pl.curve[1].phi, Math.atan(I.Iuv / I.Iuu), 1e-4, { msg: "elastic neutral-axis rotation" });
  assert.ok(Math.abs(pl.limit.phi) > 0.1, "an angle bent about x rotates its neutral axis");
  // The σ0.2 block is also free of cross moment.
  assert.ok(Math.abs(pl.plasticNA.Mcross) <= 1e-8 * Math.abs(pl.Mp));
});

test("mode (a) keeps the neutral axis parallel and reports the cross moment", () => {
  const m = fixture("angle");
  const pl = compute(m).plastic;
  for (const s of pl.curve) assert.equal(s.phi, 0);
  assert.ok(Math.abs(pl.limit.Mcross) > 0.1 * pl.limit.M, "an angle needs a cross moment to bend about x alone");
  const b = clone(m); b.plastic.solve = "zero-cross";
  assert.ok(compute(b).plastic.limit.M < pl.limit.M, "freeing the neutral axis lowers the moment about x");
});

test("for sections symmetric about the bending axis both modes agree", () => {
  for (const id of ["rect", "tee-hole", "rhs-rounded", "composite"]) {
    const a = fixture(id); a.plastic.solve = "fixed-axis";
    const b = fixture(id); b.plastic.solve = "zero-cross";
    near(compute(a).plastic.limit.M, compute(b).plastic.limit.M, 1e-12, { msg: id });
  }
});

test("axial force: capacity limits and sign", () => {
  const m = fixture("rect");
  m.plastic.N = 355 * 2e4 * 1.5; // well past the tension capacity at ε_lim
  const r = compute(m);
  assert.match(r.plastic.error, /axial force alone/);
  const t = fixture("rect-axial");
  const pl = compute(t).plastic;
  assert.ok(pl.curve[0].e0 < 0, "compression shortens the centroid");
  assert.ok(pl.limit.governing.fibre === "compression");
  const z = fixture("rect-axial"); z.plastic.N = 0;
  const pz = compute(z).plastic;
  near(pl.Zp, pz.Zp, 1e-12, { msg: "Z_p does not depend on N" });
  near(pl.shapeFactor, pz.shapeFactor, 1e-12, { msg: "the shape factor does not depend on N" });
  assert.ok(pl.MpN < pl.Mp && pl.MelN < pl.Mel, "for a symmetric rectangle the axial force lowers M_p(N) and M_el(N)");
});

test("tension and compression laws are used on their own sides", () => {
  const m = fixture("mixed");
  const r = compute(m).plastic;
  assert.equal(r.Zp, null);
  assert.match(r.ZpNote, /Mixed materials/);
  const one = clone(fixture("chs"));
  one.materials[0].compression = { E: 70000, sigma02: 120, n: 10, eps_lim: 0.01 };
  const a = compute(one).plastic;
  assert.equal(a.Zp, null);
  assert.ok(a.Mp < compute(fixture("chs")).plastic.Mp, "a weaker compression law lowers M_p");
});

test("strip count only refines: 320 strips agree with the default to 1e-6", () => {
  const m = fixture("mixed");
  const a = compute(m).plastic, b = compute(m, { strips: 320 }).plastic;
  near(a.limit.M, b.limit.M, 1e-6, { msg: "M_lim" });
});
