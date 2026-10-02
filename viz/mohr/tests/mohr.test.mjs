import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const engineSrc = /<script id="mohr-engine">([\s\S]*?)<\/script>/.exec(html)[1];
const load = (ctx = {}) => { vm.createContext(ctx); vm.runInContext(engineSrc, ctx); return ctx.Mohr; };
const M = load();

// Engine values come from another vm realm; compare them as plain JSON.
const J = (x) => JSON.parse(JSON.stringify(x));
const deq = (a, b, msg) => assert.deepEqual(J(a), J(b), msg);
const close = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected} (±${tol})`);
const rel = (actual, expected, label) => close(actual, expected, 1e-9 * Math.max(1, Math.abs(expected)), label);
const noNaN = (value, label) => {
  const walk = (v, path) => {
    if (typeof v === "number") assert.ok(Number.isFinite(v), `${label}: ${path} is ${v}`);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(value, "");
};

test("the in-page self-test (spec §14) passes every case", () => {
  const t = M.selfTests();
  assert.ok(t.length >= 35);
  assert.equal(t.filter((x) => !x.pass).map((x) => `${x.name}: ${x.detail}`).join("\n"), "");
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) assert.ok(t.some((x) => x.name.startsWith(`Preset ${id}`)), `preset ${id} is self-tested`);
  assert.ok(t.some((x) => /Shear convention A/.test(x.name)) && t.some((x) => /Shear convention B/.test(x.name)));
});

test("opens on preset 1: plane stress, 2D, stress, MPa, tension positive, shear convention A", () => {
  const s = M.defaultState();
  deq(M.toObject(s), M.toObject(M.presetState(1)));
  assert.equal(s.constraint, "plane-stress");
  assert.equal(s.view.dimension, "2D");
  assert.equal(s.view.quantity, "stress");
  assert.equal(s.units.stress, "MPa");
  assert.equal(s.conventions.normalSign, "tension-positive");
  assert.equal(s.conventions.shear2D, "A");
  assert.equal(s.plane.axis, "z");
});

test("preset 1 reads σ1 = 87.082, σ3 = −47.082, τ = 67.082 MPa, θp = 13.28°, σvm = 117.90", () => {
  const r = M.analyse(M.presetState(1));
  const [s1, s2, s3] = r.stress.principal.values;
  assert.equal(M.fmt(s1, 5), "87.082");
  assert.equal(s2, 0);
  assert.equal(M.fmt(s3, 5), "−47.082");
  assert.equal(M.fmt(r.stress.absMax, 5), "67.082");
  assert.equal(M.fmt(r.stress.circle.R, 5), "67.082");
  assert.equal(M.fmt(r.stress.circle.C, 5), "20");
  assert.equal(M.fmt(r.stress.circle.thetaP, 4), "13.28");
  assert.equal(M.fmt(r.stress.vm, 5), "117.9");
  close(r.stress.vm, 117.898, 5e-4, "σvm");
  // The default four significant digits (spec §9).
  assert.equal(M.fmt(s1, 4), "87.08");
});

test("preset 6 gives (40, 10, −20), directions ∝ (1,½,½), (1,−1,−1), (0,1,−1) and I1, I2, I3 = 30, −600, −8000", () => {
  const r = M.analyse(M.presetState(6));
  r.stress.principal.values.forEach((v, i) => rel(v, [40, 10, -20][i], `σ${i + 1}`));
  const want = [[1, 0.5, 0.5], [1, -1, -1], [0, 1, -1]];
  r.stress.principal.vectors.forEach((v, i) => {
    const n = Math.hypot(...want[i]);
    want[i].forEach((c, k) => close(v[k], c / n, 1e-12, `direction ${i + 1}[${k}]`));
  });
  rel(r.stress.invariants.I1, 30, "I1"); rel(r.stress.invariants.I2, -600, "I2"); rel(r.stress.invariants.I3, -8000, "I3");
  rel(r.stress.absMax, 30, "τmax"); rel(r.stress.vm, Math.sqrt(2700), "σvm");
});

test("preset 7 gives εx = 500 με, εy = εz = −150 με, γmax = 650 με", () => {
  const s = M.presetState(7);
  const rep = M.report(s);
  rel(rep.strain.tensor.xx, 500, "εx"); rel(rep.strain.tensor.yy, -150, "εy"); rel(rep.strain.tensor.zz, -150, "εz");
  rel(rep.strain.gammaMax, 650, "γmax");
  assert.equal(rep.strain.unit, "με");
});

test("preset 8 and both rosette layouts fill the in-plane strain", () => {
  const r = M.analyse(M.presetState(8));
  rel(r.E[0][0] * 1e6, 800, "εx"); rel(r.E[1][1] * 1e6, -200, "εy"); rel(2 * r.E[0][1] * 1e6, 200, "γxy");
  close(r.strain.circle.max * 1e6, 809.9, 0.05, "ε1 in plane"); close(r.strain.circle.min * 1e6, -209.9, 0.05, "ε2 in plane");
  assert.equal(r.stressDriven, false);
  assert.equal(M.presetState(8).constraint, "plane-stress");
  close(r.S[2][2], 0, 1e-9, "plane stress σz from the rosette");
  const d = M.rosette("delta", 100, 200, 300);
  for (const [i, a] of [0, 60, 120].entries()) close(M.gaugeReading(d.ex, d.ey, d.gxy, a), [100, 200, 300][i], 1e-9, `delta gauge ${a}°`);
});

test("switching units converts every value without changing the physical state", () => {
  const base = M.presetState(6);
  base.failure = { criterion: "mohr-coulomb", sigmaY: 250, c: 20, phiDeg: 30, tensionCutoff: 10, sigmaT: 250, sigmaC: 250 };
  const ref = M.analyse(base);
  for (const unit of Object.keys(M.STRESS_UNITS)) for (const su of Object.keys(M.STRAIN_UNITS)) {
    const s = M.clone(base);
    s.units.stress = unit; s.units.strain = su;
    const o = M.toObject(s);
    const f = M.STRESS_UNITS[unit];
    rel(o.stress.sx * f, 30, `σx in ${unit}`);
    rel(o.material.E * f, 200000, `E in ${unit}`);
    rel(o.failure.c * f, 20, `c in ${unit}`);
    rel(o.failure.tensionCutoff * f, 10, `cutoff in ${unit}`);
    const back = M.fromObject(o);
    const r = M.analyse(back);
    r.stress.principal.values.forEach((v, i) => rel(v, ref.stress.principal.values[i], `σ${i + 1} after ${unit}/${su}`));
    rel(r.failure.fos, ref.failure.fos, `FoS after ${unit}`);
    rel(M.report(s).stress.principal[0] * f, 40, `display σ1 in ${unit}`);
  }
});

test("compression positive negates the displayed tensor, reorders σ1 ≥ σ2 ≥ σ3 and toggles back to the same state", () => {
  const s = M.presetState(1);
  const tp = M.report(s);
  s.conventions.normalSign = "compression-positive";
  const cp = M.report(s);
  deq(cp.stress.principal.map((x) => M.fmt(x, 6)), tp.stress.principal.slice().reverse().map((x) => M.fmt(-x, 6)));
  assert.ok(cp.stress.principal[0] >= cp.stress.principal[1] && cp.stress.principal[1] >= cp.stress.principal[2]);
  assert.equal(cp.stress.tensor.xx, -80);
  assert.equal(M.toObject(s).stress.sx, -80);
  assert.equal(cp.failure.fos, tp.failure.fos, "failure checks use the physical state");
  s.conventions.normalSign = "tension-positive";
  deq(M.report(s), tp);
  // The same physical state typed in either convention.
  const o = M.toObject(M.presetState(1));
  const flipped = { ...o, conventions: { ...o.conventions, normalSign: "compression-positive" }, stress: Object.fromEntries(Object.entries(o.stress).map(([k, v]) => [k, v === 0 ? 0 : -v])) };
  deq(M.analyse(M.fromObject(flipped)).S, M.analyse(M.fromObject(o)).S);
});

test("the shear toggle flips the circle's rotation sense on screen", () => {
  const c = M.analyse(M.presetState(1)).stress.circle;
  const turn = (conv, sign) => {
    const ctr = M.mohrPoint(c.C, 0, conv, sign);
    const [a, b] = [0, 5].map((t) => { const p = M.pointAt(c, t); return M.mohrPoint(p.s, p.t, conv, sign); });
    return Math.sign((a[0] - ctr[0]) * (b[1] - ctr[1]) - (a[1] - ctr[1]) * (b[0] - ctr[0]));
  };
  assert.equal(turn("A", 1), 1); assert.equal(turn("B", 1), -1);
  assert.equal(turn("A", -1), 1); assert.equal(turn("B", -1), -1);
  // Convention A plots tensor-positive τxy downward, B upward.
  assert.ok(M.mohrPoint(80, 30, "A", 1)[1] < 0);
  assert.ok(M.mohrPoint(80, 30, "B", 1)[1] > 0);
});

test("2D circles are rotations about x, y, z or a principal axis", () => {
  const S = M.analyse(M.presetState(6)).S;
  const eg = M.eigen(S);
  for (const [axis, i, j] of [["z", 0, 1], ["x", 1, 2], ["y", 2, 0]]) {
    const c = M.circle2D(S, M.basis(axis, eg.vectors), 0);
    rel(c.sp, S[i][i], `${axis}: σp`); rel(c.sq, S[j][j], `${axis}: σq`); rel(c.tpq, S[i][j], `${axis}: τpq`);
    const R = M.rotateTensor(S, M.rotation(axis, 33));
    const t = M.circle2D(S, M.basis(axis, eg.vectors), 33);
    rel(t.s, R[i][i], `${axis}: σθ at 33°`); rel(t.t, R[i][j], `${axis}: τθ at 33°`);
  }
  for (const k of ["1", "2", "3"]) {
    const b = M.basis(k, eg.vectors);
    const c = M.circle2D(S, b, 10);
    close(c.tpq, 0, 1e-9, `principal ${k}: no shear in the principal frame`);
    assert.ok(M.vec.dot(M.vec.cross(b.p, b.q), b.a) > 0, `principal ${k}: right-handed`);
    const others = [0, 1, 2].filter((x) => x !== Number(k) - 1).map((x) => eg.values[x]);
    rel(c.max, Math.max(...others), `principal ${k} circle max`); rel(c.min, Math.min(...others), `principal ${k} circle min`);
  }
  // Direction cosines: a plane in the x–y plane shows on the z circle; one out of it does not.
  const s = M.presetState(1);
  s.plane = { mode: "cosines", axis: "z", angleDeg: 0, l: Math.cos(0.3), m: Math.sin(0.3), n: 0 };
  close(M.analyse(s).thetaView, (0.3 * 180) / Math.PI, 1e-9, "θ from cosines");
  s.plane = { mode: "cosines", axis: "z", angleDeg: 0, l: 1, m: 1, n: 1 };
  assert.equal(M.analyse(s).thetaView, null);
  const r = M.analyse(s);
  rel(r.stress.plane.sn, (80 - 40 + 2 * 30) / 3, "σn on (1,1,1)/√3");
});

test("constraints derive the out-of-plane values and keep the typed ones for General 3D", () => {
  const s = M.presetState(6);
  s.constraint = "plane-stress";
  let r = M.analyse(s);
  assert.equal(r.S[2][2], 0); assert.equal(r.S[1][2], 0); assert.equal(r.S[0][2], 0);
  rel(r.E[2][2], (-0.3 * 30) / 200000, "εz = −ν(σx+σy)/E");
  s.constraint = "plane-strain";
  r = M.analyse(s);
  rel(r.S[2][2], 0.3 * 30, "σz = ν(σx+σy)");
  close(r.E[2][2], 0, 1e-18, "εz");
  s.constraint = "general";
  deq(M.analyse(s).S, M.analyse(M.presetState(6)).S, "typed τyz, τzx return");
  // Strain-driven plane stress gives σz = 0.
  const e = M.presetState(8);
  e.constraint = "plane-stress";
  close(M.analyse(e).S[2][2], 0, 1e-9, "strain-driven plane stress σz");
  e.constraint = "plane-strain";
  assert.equal(M.analyse(e).E[2][2], 0);
});

test("repeated, hydrostatic and zero tensors give notes and no NaN", () => {
  const cases = {
    equalBiaxial: M.presetState(4), hydro: M.presetState(5),
    zero: (() => { const s = M.presetState(1); s.stress = { sx: 0, sy: 0, sz: 0, txy: 0, tyz: 0, tzx: 0 }; return s; })(),
    tiny: (() => { const s = M.presetState(6); for (const k of Object.keys(s.stress)) s.stress[k] *= 1e-9; return s; })(),
    huge: (() => { const s = M.presetState(6); for (const k of Object.keys(s.stress)) s.stress[k] *= 1e12; return s; })(),
  };
  for (const [name, s] of Object.entries(cases)) {
    for (const crit of M.CRITERIA) {
      s.failure.criterion = crit;
      const rep = M.report(s);
      noNaN(rep, `${name}/${crit}`);
      assert.ok(rep.failure.fos === "infinity" || Number.isFinite(rep.failure.fos));
    }
    const md = M.toMarkdown(s);
    assert.doesNotMatch(md, /NaN|Infinity/, `${name}: Markdown`);
  }
  assert.match(M.analyse(cases.equalBiaxial).warnings.map((w) => w.message).join(), /non-unique/);
  assert.match(M.analyse(cases.hydro).warnings.map((w) => w.message).join(), /Hydrostatic: all circles collapse/);
  assert.match(M.analyse(cases.zero).warnings.map((w) => w.message).join(), /Zero tensor/);
  cases.zero.failure.criterion = "tresca";
  assert.equal(M.report(cases.zero).failure.fos, "infinity");
  assert.equal(M.fosText(Infinity), "∞ (no failure under proportional loading)");
  assert.equal(M.fmt(1.23456e-9 * 1e3, 4), "1.235e-6");
  assert.equal(M.fmt(4.5e12, 4), "4.5e12");
  assert.equal(M.fmt(NaN), "—");
});

test("invalid material hides the derived tensor while the driven side keeps working", () => {
  const s = M.presetState(1);
  s.material.nu = 0.5;
  const r = M.analyse(s);
  assert.equal(r.E, null);
  assert.ok(r.stress && r.failure);
  assert.match(r.warnings.map((w) => w.message).join(), /Invalid material/);
  s.driver = "strain"; s.strain = { ex: 1e-3, ey: 0, ez: 0, exy: 0, eyz: 0, ezx: 0 };
  s.material = { E: -1, nu: 0.3 };
  const r2 = M.analyse(s);
  assert.equal(r2.S, null); assert.equal(r2.failure, null);
  rel(r2.strain.principal.values[0], 1e-3, "strain circle still works");
  noNaN(M.report(s), "invalid material report");
});

test("each failure criterion gives an envelope, a FoS and PASS/FAIL", () => {
  const s = M.presetState(1);
  const f = (crit, extra) => { s.failure = { ...s.failure, criterion: crit, ...extra }; return M.analyse(s); };
  let r = f("tresca", { sigmaY: 250 });
  rel(r.failure.fos, 250 / (2 * Math.sqrt(4500)), "Tresca FoS"); assert.equal(r.failure.pass, true);
  deq(r.envelope.map((e) => e.kind), ["hline"]); rel(r.envelope[0].tau, 125, "Tresca line");
  r = f("von-mises", { sigmaY: 100 });
  rel(r.failure.fos, 100 / Math.sqrt(13900), "von Mises FoS"); assert.equal(r.failure.pass, false);
  assert.equal(r.envelope[0].dashed, true); assert.match(r.envelope[0].label, /reference line, not a true envelope/);
  rel(r.envelope[0].tau, 100 / Math.sqrt(3), "von Mises reference");
  r = f("rankine", { sigmaT: 100, sigmaC: 40 });
  rel(r.failure.fos, 40 / (Math.sqrt(4500) - 20), "Rankine governed by compression"); assert.equal(r.failure.pass, false);
  deq(r.envelope.map((e) => e.sn), [100, -40]);
  r = f("mohr-coulomb", { c: 60, phiDeg: 30, tensionCutoff: null });
  const s1 = 20 + Math.sqrt(4500), s3 = 20 - Math.sqrt(4500), sp = 0.5;
  rel(r.failure.fos, (2 * 60 * Math.cos(Math.PI / 6)) / (s1 * (1 + sp) - s3 * (1 - sp)), "Mohr–Coulomb FoS");
  rel(r.envelope[0].from[0], 60 / Math.tan(Math.PI / 6), "apex c·cot φ");
  r = f("mohr-coulomb", { c: 60, phiDeg: 30, tensionCutoff: 50 });
  rel(r.failure.fos, Math.min(50 / s1, (2 * 60 * Math.cos(Math.PI / 6)) / (s1 * (1 + sp) - s3 * (1 - sp))), "cutoff governs when smaller");
  deq(r.envelope.map((e) => e.kind), ["ray", "segment"]);
  // A hydrostatic compression never fails under Mohr–Coulomb or Tresca.
  const h = M.presetState(5);
  h.failure = { ...h.failure, criterion: "mohr-coulomb", c: 10, phiDeg: 30 };
  assert.equal(M.analyse(h).failure.fos, Infinity);
  assert.equal(M.analyse(h).failure.pass, true);
  // Parameter validation (spec §13).
  const errs = (p) => M.checkFailureParams({ criterion: "mohr-coulomb", sigmaY: 250, c: 10, phiDeg: 30, tensionCutoff: null, sigmaT: 1, sigmaC: 1, ...p }).map((e) => e.field);
  deq(errs({ c: -1 }), ["failure.c"]);
  deq(errs({ phiDeg: 90 }), ["failure.phiDeg"]);
  deq(errs({ tensionCutoff: 100 }), ["failure.tensionCutoff"], "cutoff above the apex");
  deq(errs({ tensionCutoff: 10 }), []);
});

test("JSON export → import reproduces the state exactly, and Markdown does the same through its embedded block", () => {
  const states = [M.defaultState(), ...[2, 3, 4, 5, 6, 7, 8].map((id) => M.presetState(id))];
  const odd = M.presetState(6);
  Object.assign(odd, { units: { stress: "ksi", strain: "%" }, conventions: { normalSign: "compression-positive", shear2D: "B", strainShear: "tensor" }, entryMode: "principal" });
  odd.principal = { s1: 12.5, s2: -3.25, s3: 7 };
  odd.plane = { mode: "cosines", axis: "2", angleDeg: 0, l: 0.6, m: 0, n: 0.8 };
  odd.failure = { criterion: "mohr-coulomb", sigmaY: 250, c: 15, phiDeg: 25, tensionCutoff: 5, sigmaT: 250, sigmaC: 300 };
  odd.view.camera = { yawDeg: -120, pitchDeg: 60, zoom: 1.7 };
  odd.view.overlays.grid = true;
  const strainPrincipal = M.presetState(8);
  Object.assign(strainPrincipal, { entryMode: "principal", principalStrain: { e1: 1e-3, e2: -2e-4, e3: 5e-5 }, constraint: "general", units: { stress: "psi", strain: "mm/mm" } });
  states.push(odd, strainPrincipal);
  for (const s of states) {
    const json = M.toJSON(s);
    const back = M.importText(json);
    assert.equal(M.toJSON(back), json);
    deq(M.report(back), M.report(s));
    const md = M.toMarkdown(s, { timestamp: "2026-10-01T00:00:00Z" });
    assert.ok(md.includes("```json\n" + json + "\n```"));
    assert.equal(M.toJSON(M.importText(md)), json);
  }
  // The embedded block is the only thing read: a Markdown file with other json blocks first still imports.
  const md = "# notes\n\n```json\n{\"schema\":\"other\"}\n```\n\n" + M.toMarkdown(odd);
  assert.equal(M.toJSON(M.importText(md)), M.toJSON(odd));
});

test("malformed, wrong-schema and newer-version files are refused with every problem listed", () => {
  const good = M.toObject(M.defaultState());
  const refuse = (text, re) => {
    let err;
    try { M.importText(text); } catch (e) { err = e; }
    assert.ok(err, `refused: ${String(text).slice(0, 40)}`);
    assert.match(err.message, re);
    return err;
  };
  refuse("{", /Not valid JSON/);
  refuse("", /empty/);
  refuse("# report without a block", /no fenced/);
  refuse(JSON.stringify({ ...good, schema: "something-else" }), /Not a Mohr visualiser file/);
  refuse(JSON.stringify({ ...good, version: 2 }), /newer than the supported version 1/);
  refuse(JSON.stringify({ ...good, version: 0 }), /no migration/);
  const e = refuse(JSON.stringify({
    ...good, units: { stress: "furlongs", strain: "ue" },
    stress: { ...good.stress, sx: "80" }, material: { E: 200000, nu: 0.7 },
    failure: { ...good.failure, phiDeg: 95 }, plane: { ...good.plane, axis: "w" },
  }), /furlongs/);
  deq(e.errors.map((x) => x.field).sort(), ["failure.phiDeg", "material.nu", "plane.axis", "stress.sx", "units.stress"]);
  refuse(JSON.stringify({ ...good, plane: { ...good.plane, mode: "cosines", l: 0, m: 0, n: 0 } }), /all zero/);
});

test("switching entry mode or driver keeps the principal values under every constraint and sign convention", () => {
  const values = (r) => [r.stress.principal.values, r.strain.principal.values];
  const same = (got, want, label) => got.forEach((vs, q) => vs.forEach((v, i) => close(v, want[q][i], 1e-9 * Math.max(1, Math.abs(want[q][i])), `${label} ${["σ", "ε"][q]}${i + 1}`)));
  for (const constraint of ["general", "plane-stress", "plane-strain"]) for (const normalSign of ["tension-positive", "compression-positive"]) {
    const s = M.presetState(1);
    Object.assign(s, { constraint });
    s.conventions.normalSign = normalSign;
    if (constraint === "general") Object.assign(s.stress, { tyz: 7, tzx: -12, sz: 25 });
    M.seedShadows(s);
    const want = values(M.analyse(s));
    for (const driver of ["stress", "strain"]) {
      const label = `${constraint}, ${normalSign}, ${driver}-driven`;
      const t = M.clone(s);
      t.driver = driver; t.entryMode = "tensor";
      same(values(M.analyse(t)), want, `${label} tensor`);
      const r = M.analyse(t);
      if (driver === "stress") t.principal = M.principalSeed(r.S, t, "s"); else t.principalStrain = M.principalSeed(r.E, t, "e");
      t.entryMode = "principal";
      same(values(M.analyse(t)), want, `${label} principal`);
    }
  }
});

test("raw.json is the published metadata and default example of the page", async () => {
  const raw = JSON.parse(await readFile(new URL("../raw.json", import.meta.url), "utf8"));
  const { example, ...meta } = raw;
  deq(example, JSON.parse(M.toJSON(M.defaultState())));
  deq(meta, JSON.parse(JSON.stringify(M.META)));
});

test("the engine runs without DOM, storage, clock or randomness and is deterministic", () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`
    for (const name of ["document", "window", "localStorage", "location", "navigator"])
      Object.defineProperty(globalThis, name, { get() { throw new Error(name + " touched"); } });
    Math.random = () => { throw new Error("Math.random touched"); };
    Date = new Proxy(Date, { get() { throw new Error("Date touched"); }, construct() { throw new Error("Date touched"); } });
    var self = globalThis;`, ctx);
  const G = load(ctx);
  const run = (api) => JSON.stringify([api.report(api.presetState(6)), api.toMarkdown(api.presetState(8)), api.selfTests()]);
  assert.equal(run(G), run(G));
  assert.equal(run(G), run(M));
});

// Boots both page scripts against an inert DOM. Every way a page could reach the network is a trap
// that records the attempt, so tests can assert the page never tries.
const bootPage = () => {
  const inert = () => new Proxy(function () {}, {
    get: (t, k) => (k === "modelContext" ? undefined : k === Symbol.iterator ? [][Symbol.iterator] : k === Symbol.toPrimitive ? () => 0 : inert()),
    set: () => true, apply: () => inert(), construct: () => inert(),
  });
  const network = [];
  const trap = (name) => new Proxy(function () {}, {
    apply: () => { network.push(name); return inert(); },
    construct: () => { network.push(`new ${name}`); return inert(); },
  });
  const loaders = new Set(["script", "link", "img", "iframe", "audio", "video", "source", "object", "embed"]);
  const document = new Proxy(inert(), {
    get: (t, k) => (k === "createElement" ? (tag) => { if (loaders.has(String(tag).toLowerCase())) network.push(`createElement(${tag})`); return inert(); } : t[k]),
  });
  const tools = [];
  const ctx = vm.createContext({
    document, addEventListener() {}, requestAnimationFrame() {}, cancelAnimationFrame() {}, getComputedStyle: inert(),
    setTimeout() {}, clearTimeout() {}, console,
    navigator: { modelContext: { registerTool: (t) => tools.push(t) }, sendBeacon: trap("navigator.sendBeacon") },
    Blob: function () {}, URL: inert(),
    fetch: trap("fetch"), XMLHttpRequest: trap("XMLHttpRequest"), WebSocket: trap("WebSocket"), EventSource: trap("EventSource"),
    Image: trap("Image"), Worker: trap("Worker"), SharedWorker: trap("SharedWorker"), importScripts: trap("importScripts"),
  });
  ctx.self = ctx; ctx.window = ctx;
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  assert.deepEqual(scripts.map((m) => /id="([^"]+)"/.exec(m[0])?.[1]), ["site-theme", "mohr-engine", "mohr-beamdswitch", "mohr-ui"]);
  for (const m of scripts) vm.runInContext(m[1], ctx);
  return { tools, network };
};

test("booting the page and running every WebMCP tool makes no network request", async () => {
  const { tools, network } = bootPage();
  assert.ok(tools.length > 0);
  for (const t of tools) await t.execute({ constraint: "general", stress: { sx: 30, txy: 10, tyz: 20, tzx: 10 } });
  deq(network, []);
});

// The site checks these names against its catalogue stub (data/visuals/mohr.yaml); here they are listed.
const WEBMCP_TOOLS = ["get_metadata", "get_current_state", "analyze_stress_state", "run_self_tests"];

test("the page boots without a real DOM and registers its WebMCP tools", async () => {
  const { tools } = bootPage();
  deq(tools.map((t) => t.name), WEBMCP_TOOLS);
  const call = async (name, input) => JSON.parse((await tools.find((t) => t.name === name).execute(input)).content[0].text);
  const cur = await call("get_current_state", {});
  assert.equal(cur.state.schema, "mohr-visualiser");
  close(cur.results.stress.principal[0], 20 + Math.sqrt(4500), 1e-9, "current σ1");
  const a = await call("analyze_stress_state", { constraint: "general", stress: { sx: 30, sy: 0, sz: 0, txy: 10, tyz: 20, tzx: 10 } });
  a.stress.principal.forEach((v, i) => close(v, [40, 10, -20][i], 1e-9, `analyze σ${i + 1}`));
  const bad = await call("analyze_stress_state", { material: { E: 200000, nu: 0.9 } });
  assert.equal(bad.errors[0].field, "material.nu");
  const st = await call("run_self_tests", {});
  assert.equal(st.passed, st.total);
  assert.equal((await call("get_metadata", {})).schema, "mohr-visualiser");
});

test("the Markdown report and the beamdswitch deck write the same input components and failure parameters", () => {
  const params = { tresca: "σy = 250 MPa", "von-mises": "σy = 250 MPa", rankine: "σt = ", "mohr-coulomb": "tension cutoff " };
  for (const crit of Object.keys(params)) {
    const s = M.presetState(1);
    s.failure.criterion = crit;
    const md = M.toMarkdown(s), deck = JSON.stringify(M.beamdswitchReport(s));
    const row = md.split("\n").find((l) => l.startsWith(`| ${M.CRITERION_NAME[crit]} |`));
    const written = row.split(" | ")[1];
    assert.ok(written.includes(params[crit]), `${crit}: ${written}`);
    assert.ok(deck.includes(`${M.CRITERION_NAME[crit]}, ${written}`), `${crit}: the deck names the same parameters`);
  }
  // Strain-driven with engineering shear: both show γ names and doubled tensor shear.
  const s = M.presetState(8), md = M.toMarkdown(s), deck = JSON.stringify(M.beamdswitchReport(s));
  for (const n of ["εx", "εy", "εz", "γxy", "γyz", "γzx"]) {
    const cell = md.split("\n").find((l) => l.startsWith(`| ${n} |`));
    assert.ok(cell, `${n} in the Markdown report`);
    assert.ok(deck.includes(cell.replace(/ \|$/, "")), `${n}: the deck's component row matches`);
  }
});
