import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const L = require("../engine.js");
const LBF = L.UNITS.force.lbf;

const within = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol * Math.abs(expected), `${label}: ${actual} vs ${expected} (±${tol * 100}%)`);
const example = () => L.example96();
const messages = (list) => list.map((e) => e.message).join("\n");

test("Sec. 9.6 worked example in SI reproduces its consistent governing lines at 1%", () => {
  const r = L.solve(example());
  within(r.members.female.Pbru / LBF, 28600, 0.01, "female bearing Pbru.L.1");
  within(r.members.male.PuB / LBF, 44000, 0.01, "male bushing Pu.B.2");
  within(r.joint.Pus / LBF, 72400, 0.01, "pin shear Pus.P");
  within(r.joint.Pub / LBF, 30100, 0.01, "pin bending Pub.P");
  within(r.joint.Pall / LBF, 37900, 0.01, "joint Pall");
  assert.equal(r.joint.weakPin, true);
  assert.equal(r.joint.PallEq, "9-19b");
  assert.equal(r.controlling.ultimate.id, "pin-bending-2");
  // Female bearing takes Eq. 9-2a with the cap (9-3b); the male lug-bushing is the bushing.
  assert.equal(r.members.female.capBr, true);
  assert.equal(r.members.male.PuLB, r.members.male.PuB);
});

test("the two non-governing net-tension lines follow the chapter's equations, not the printed example", () => {
  const r = L.solve(example());
  // Printed 57,898 lbs is the pair of legs; Eq. 9-6b for one leg is half of that.
  within(r.members.female.Pnu / LBF, 57898 / 2, 0.001, "female Pnu.L per leg (Eq. 9-6b)");
  // Ftu ≤ 1.304·Fty, so Eq. 9-6a applies (the example printed 9-6b: 112,313 lbs).
  assert.equal(r.members.male.capNet, false);
  within(r.members.male.Pnu / LBF, 0.87 * 77000 * 2.0 * 0.75, 0.001, "male Pnu.L (Eq. 9-6a)");
});

test("a weak pin whose load-shift result exceeds the lug-bushing strength is capped at Pu.L.B with a warning", () => {
  const x = example();
  x.pin.FtuP = 175 * L.UNITS.stress.ksi;
  const r = L.solve(x);
  const J = r.joint;
  assert.equal(J.weakPin, true);
  assert.ok(J.Pubmax > J.PuLB, `Pub.P.max ${J.Pubmax} should exceed Pu.L.B ${J.PuLB}`);
  assert.ok(J.Pall <= J.PuLB);
  assert.equal(J.Pall, J.PuLB);
  within(J.Pall / LBF, 44000, 0.01, "Pall = Pu.L.B");
  assert.match(J.PallMode, /lug-bushing/);
  assert.ok(J.b1min <= r.members.female.t && J.b2min2 <= r.members.male.t);
  assert.match(messages(r.warnings), /exceeds the full-thickness lug-bushing strength/);
  assert.doesNotMatch(messages(L.solve(example()).warnings), /exceeds the full-thickness/);
});

test("in-page self-tests all pass", () => {
  const t = L.selfTests();
  assert.ok(t.length >= 10);
  assert.deepEqual(t.filter((x) => !x.pass), []);
});

test("Eq. 9-31 interaction: end points, a known interior point and the FS form", () => {
  within(L.obliqueAllowable(1234, 567, 0), 1234, 1e-12, "α = 0");
  within(L.obliqueAllowable(1234, 567, 90), 567, 1e-12, "α = 90°");
  within(L.obliqueAllowable(1, 1, 45), Math.pow(2, -0.125), 1e-12, "equal allowables at 45°");
  // α = 60°, Pax = 2, Ptr = 1: P = [(cos60/2)^1.6 + sin60^1.6]^(−1/1.6).
  const p60 = Math.pow(Math.pow(0.25, 1.6) + Math.pow(Math.sqrt(3) / 2, 1.6), -1 / 1.6);
  within(L.obliqueAllowable(2, 1, 60), p60, 1e-12, "α = 60° interior point");
  within(L.obliqueFS(0.3, 0.4, 1, 1), Math.pow(Math.pow(0.3, 1.6) + Math.pow(0.4, 1.6), -0.625), 1e-12, "FS power 0.625");
});

test("joint at α = 0 and 90° uses the axial and transverse allowables", () => {
  const x = example();
  for (const m of ["female", "male"]) Object.assign(x[m], { havD: 0.6, Ktru: 1.0, Ktry: 0.9 });
  const r0 = L.solve(x);
  within(r0.members.female.Palpha, r0.members.female.PuL, 1e-12, "female α = 0");
  x.load.alpha = 90;
  const r90 = L.solve(x);
  within(r90.members.female.Palpha, r90.members.female.Ptru, 1e-12, "female α = 90°");
  within(r90.members.male.Palpha, r90.members.male.Ptru, 1e-12, "male α = 90°");
  assert.ok(!r90.rows.some((r) => r.id === "female-bearing"), "no axial rows at 90°");
  x.load.alpha = 30;
  const r30 = L.solve(x);
  const f = r30.members.female, a = Math.PI / 6;
  within(Math.pow((f.Palpha * Math.cos(a)) / f.PuL, 1.6) + Math.pow((f.Palpha * Math.sin(a)) / f.Ptru, 1.6), 1, 1e-12, "on the curve");
  const oblique = r30.rows.find((r) => r.id === "female-oblique");
  within(oblique.FSu, L.obliqueFS(r30.loads.Pu_ax / 2, r30.loads.Pu_tr / 2, f.PuL, f.Ptru), 1e-12, "row FS = Eq. 9-31 FS");
  // Tangs take the axial component only.
  assert.equal(r30.rows.find((r) => r.id === "tang-male").ultLoad, r30.loads.Pu_ax);
});

test("load factors: ultimate FS uses P·ff·af, yield FS uses P/uf·ff·af", () => {
  const x = example();
  x.load.af = 1.25;
  const r = L.solve(x), P = x.load.P;
  const row = r.rows.find((q) => q.id === "male-bushing");
  within(row.ultLoad, P * 1.15 * 1.25, 1e-12, "factored ultimate");
  within(row.yieldLoad, (P / 1.5) * 1.15 * 1.25, 1e-12, "factored yield");
  within(row.FSu, (1.5 / 1.15) * x.male.FcyB * x.geometry.DP * x.male.t / (P * 1.15 * 1.25), 1e-12, "FSu");
  within(row.FSy, x.male.FcyB * x.geometry.DP * x.male.t / ((P / 1.5) * 1.15 * 1.25), 1e-12, "FSy uncapped");
  within(row.MSu, row.FSu - 1, 1e-12, "MS");
  assert.equal(r.rows.find((q) => q.id === "pin-shear").FSy, null, "pin has ultimate only");
});

test("blocking errors: impossible geometry, missing coefficients for an active mode, α out of range", () => {
  const bad = (mutate) => {
    const x = example();
    mutate(x);
    const v = L.validate(x);
    assert.throws(() => L.solve(x), L.InputError);
    return messages(v.errors);
  };
  assert.match(bad((x) => { x.female.w = x.geometry.D; }), /w must exceed D/);
  assert.match(bad((x) => { x.geometry.DP = x.geometry.D * 1.1; }), /pin D_P is larger than the hole/);
  assert.match(bad((x) => { x.geometry.DP = x.geometry.D; }), /bushing needs D_P smaller/);
  assert.match(bad((x) => { x.male.t = 0; }), /Male lug: t must be greater than zero/);
  assert.match(bad((x) => { x.female.K = null; }), /coefficient K \(axial/);
  assert.match(bad((x) => { x.load.alpha = 45; }), /Ktru \(transverse/);
  assert.match(bad((x) => { x.load.alpha = -1; }), /between 0° and 90°/);
  assert.match(bad((x) => { x.load.alpha = 91; }), /between 0° and 90°/);
  assert.match(bad((x) => { x.male.FcyB = null; }), /Fcy\.B/);
  // Transverse coefficients are not needed for a purely axial load, nor K and Kn at 90°.
  const x = example();
  assert.deepEqual(L.validate(x).errors, []);
  Object.assign(x.female, { K: null, Kn: null, Ktru: 1, Ktry: 0.9 });
  Object.assign(x.male, { K: null, Kn: null, Ktru: 1, Ktry: 0.9 });
  x.load.alpha = 90;
  assert.deepEqual(L.validate(x).errors, []);
  // An unbushed member needs no bushing allowable, and D_P may equal D.
  const y = example();
  y.female.bushed = false; y.male.bushed = false; y.female.FcyB = null; y.male.FcyB = null; y.geometry.DP = y.geometry.D;
  assert.deepEqual(L.validate(y).errors, []);
});

test("warnings still compute: D/t > 5, e/D < 1.5, εu < 5% without B, the cap, the e/D = 2.0 bearing limit", () => {
  const x = example();
  x.female.t = x.geometry.D / 6;
  x.male.eu = 0.03;
  x.male.Fbru = 300; // MPa, below the male Fbru.L so the e/D = 2.0 limit bites
  const r = L.solve(x), w = messages(r.warnings);
  assert.match(w, /Female leg: D\/t = 6 > 5/);
  assert.match(w, /Female leg: e\/D = 1\.25 < 1\.5/);
  assert.match(w, /Male lug: εu = 0\.03 < 5% but B and B0\.05 are not entered/);
  assert.match(w, /Female leg: Ftux > cap·Ftyx, so the yield cap governs bearing/);
  assert.match(w, /Male lug: axial bearing stress capped at the e\/D = 2\.0 allowables/);
  within(r.members.male.Pbru, 300 * x.geometry.D * x.male.t, 1e-12, "capped bearing load");
});

test("εu < 5% with B and B0.05 scales bearing allowables by B/B0.05", () => {
  const x = example();
  const base = L.solve(x).members.male;
  Object.assign(x.male, { eu: 0.03, B: 0.8, B005: 1.0 });
  const r = L.solve(x);
  within(r.members.male.Fbru_L, base.Fbru_L * 0.8, 1e-12, "Fbru.L");
  within(r.members.male.Pbru, base.Pbru * 0.8, 1e-12, "Pbru.L");
  assert.equal(r.members.male.Pnu, base.Pnu, "net section unchanged (Sec. 9.15.2)");
  assert.doesNotMatch(messages(r.warnings), /B and B0\.05 are not entered/);
});

test("unit switching round-trips every unit and keeps the canonical input", () => {
  for (const [kind, units] of Object.entries(L.UNITS)) {
    for (const u of Object.keys(units)) {
      for (const v of [0, 1, 25.4, 123.456, 6.89475729316836, 1e5]) {
        within(L.toCanonical(L.fromCanonical(v, kind, u), kind, u) || 0, v || 0, 1e-12, `${kind} ${u} ${v}`);
      }
    }
  }
  within(L.toCanonical(1, "length", "in"), 25.4, 0, "in");
  within(L.toCanonical(1, "stress", "ksi"), 6.894757293168361, 1e-12, "ksi");
  within(L.toCanonical(1, "force", "kip"), 4448.2216152605, 1e-12, "kip");
  within(L.toCanonical(1e6, "stress", "Pa"), 1, 1e-12, "Pa");
  within(L.toCanonical(0.001, "length", "m"), 1, 1e-12, "m");
  assert.equal(L.fromCanonical(0.5, "none", "anything"), 0.5);
  // Presets and mixed units change only the display; the stored input is identical.
  const x = example();
  const results = [];
  for (const p of L.PRESETS) {
    x.units = { ...p.units };
    results.push(L.solve(L.parse(L.serialize(x))).joint.Pall);
  }
  x.units = { force: "kN", length: "mm", stress: "ksi" };
  assert.equal(L.presetOf(x.units), null);
  results.push(L.solve(L.fromHash(L.toHash(x))).joint.Pall);
  for (const v of results) assert.equal(v, results[0]);
  assert.deepEqual(L.fromHash(L.toHash(x)).units, x.units);
});

test("JSON and hash round-trips preserve every field, and partial files fill from the example", () => {
  const x = example();
  x.refs = { "9-12": "Bruhn D1.x (to confirm)" };
  x.female.bushed = false;
  x.female.B = null;
  assert.deepEqual(L.parse(L.serialize(x)), L.normalise(x));
  assert.deepEqual(L.fromHash(L.toHash(x)), L.normalise(x));
  assert.equal(L.fromHash("#other"), null);
  const partial = L.parse(JSON.stringify({ load: { alpha: 30 }, units: { force: "lbf", length: "furlong" } }));
  assert.equal(partial.load.alpha, 30);
  assert.equal(partial.units.force, "lbf");
  assert.equal(partial.units.length, "mm", "unknown unit falls back to the default");
  assert.equal(partial.male.K, example().male.K);
  assert.throws(() => L.parse("[]x"));
});

test("trace carries AFFDL equations and flags formulas without a Bruhn/Niu reference", () => {
  const x = example();
  let r = L.solve(x);
  assert.ok(r.trace.length > 20);
  assert.ok(r.trace.every((t) => t.affdl && t.ref === "" && t.crossChecked === false));
  assert.ok(r.trace.some((t) => t.quantity === "Pub.P.max" && t.affdl === "Eq. 9-16"));
  x.refs["9-12"] = "Niu 9.x";
  r = L.solve(x);
  const shear = r.trace.find((t) => t.quantity === "Pus.P");
  assert.equal(shear.ref, "Niu 9.x");
  assert.equal(shear.crossChecked, true);
  assert.ok(L.FORMULAS.every((f) => f.id && f.affdl && f.text));
});

test("sweep covers 0° to 90° when every coefficient is present and explains what is missing otherwise", () => {
  const x = example();
  const missing = L.sweep(x, 10);
  assert.equal(missing.points.length, 0);
  assert.match(missing.error.join(" "), /Ktru/);
  for (const m of ["female", "male"]) Object.assign(x[m], { havD: 0.6, Ktru: 1.0, Ktry: 0.9 });
  const s = L.sweep(x, 10);
  assert.equal(s.error, null);
  assert.deepEqual(s.points.map((p) => p.alpha), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.equal(s.points[0].Pall, L.solve(x).joint.Pall);
});

test("the calculation core runs without DOM, storage, clock or randomness and is deterministic", async () => {
  const src = await readFile(new URL("../engine.js", import.meta.url), "utf8");
  const ctx = vm.createContext({});
  vm.runInContext(`
    for (const name of ["document", "window", "localStorage", "location", "navigator"])
      Object.defineProperty(globalThis, name, { get() { throw new Error(name + " touched"); } });
    Math.random = () => { throw new Error("Math.random touched"); };
    Date = new Proxy(Date, { get() { throw new Error("Date touched"); }, construct() { throw new Error("Date touched"); } });
    var self = globalThis;`, ctx);
  vm.runInContext(src, ctx);
  const run = (api) => {
    const x = api.example96();
    const swept = api.example96();
    for (const m of ["female", "male"]) Object.assign(swept[m], { havD: 0.6, Ktru: 1.0, Ktry: 0.9 });
    return JSON.stringify([api.solve(x), api.sweep(swept, 10), api.selfTests()]);
  };
  const first = run(ctx.LugJoint);
  assert.equal(run(ctx.LugJoint), first);
  assert.equal(run(L), first);
});

test("built page is self-contained and registers its WebMCP tools", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+stylesheet/);
  assert.match(html, /Preliminary/);
  // The tools the page registers; the site's catalogue stub (data/visuals/lug-joint.yaml in yujieteo/site) names the same set.
  const names = ["get_metadata", "get_current_joint", "solve_joint", "run_self_tests"];
  const inert = () => new Proxy(function () {}, {
    get: (t, k) => (k === "modelContext" ? undefined : k === Symbol.iterator ? [][Symbol.iterator] : k === Symbol.toPrimitive ? () => 0 : inert()),
    set: () => true, apply: () => inert(), construct: () => inert(),
  });
  const tools = [];
  const ctx = vm.createContext({
    document: inert(), location: { hash: "" }, history: { replaceState() {} }, addEventListener() {},
    navigator: { modelContext: { registerTool: (t) => tools.push(t) } }, Blob: function () {}, URL: inert(),
  });
  ctx.self = ctx; ctx.window = ctx;
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
  assert.deepEqual(tools.map((t) => t.name), names);
  const call = async (name, input) => JSON.parse((await tools.find((t) => t.name === name).execute(input)).content[0].text);
  const solved = await call("solve_joint", {});
  within(solved.joint.Pall / LBF, 37900, 0.01, "solve_joint Pall");
  assert.equal(solved.controlling.ultimate.eq, "9-16 to 9-18");
  const bad = await call("solve_joint", { load: { alpha: 120 } });
  assert.match(bad.errors[0].message, /between 0° and 90°/);
  const current = await call("get_current_joint", {});
  assert.ok(current.rows.length > 5);
  const tests = await call("run_self_tests", {});
  assert.equal(tests.passed, tests.total);
  const meta = await call("get_metadata", {});
  assert.match(meta.disclaimer, /Preliminary/);
});

test("reference cases added to REFERENCE_CASES run inside the self-tests", () => {
  const before = L.selfTests().length;
  L.REFERENCE_CASES.push({ name: "probe", input: {}, expect: [{ path: "joint.Pus", value: 72400 * LBF, tol: 0.01 }, { path: "joint.Pall", value: 1, tol: 0.01 }] });
  try {
    const t = L.selfTests();
    assert.equal(t.length, before + 2);
    assert.equal(t.find((x) => x.name === "probe: joint.Pus").pass, true);
    assert.equal(t.find((x) => x.name === "probe: joint.Pall").pass, false);
  } finally {
    L.REFERENCE_CASES.pop();
  }
});
