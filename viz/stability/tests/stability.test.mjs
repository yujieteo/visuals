import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const S = require("../engine.js");
const RAW = JSON.parse(await readFile(new URL("../raw.json", import.meta.url), "utf8"));
S.setFigureData(RAW.figures);
const KSI = S.fromDisplay(1, "stress", "US"), IN = S.fromDisplay(1, "length", "US");

const within = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol * Math.abs(expected), `${label}: ${actual} vs ${expected} (±${tol * 100}%)`);

test("the self-test passes and covers the spec's verification list", () => {
  const t = S.selfTests();
  assert.deepEqual(t.filter((x) => !x.pass).map((x) => x.name), []);
  const names = t.map((x) => x.name).join("\n");
  for (const k of S.K_PRESETS) assert.match(names, new RegExp(`FE Pcr = π²EI/\\(KL\\)², ${k.label}`));
  assert.match(names, /k = 1: angle from eq\. \(30c\) equals Wagner eq\. \(15\)/);
  assert.match(names, /k_s simply supported → 5\.34/);
  assert.match(names, /k_s clamped → 8\.98/);
  assert.match(names, /SI → US → SI round-trip/);
  assert.match(names, /TN 2661 example 1/);
  assert.match(names, /TN 2661 example 2/);
  assert.ok(t.every((x) => x.tolerance), "every check states its tolerance");
});

test("TN 2661 example 1 (thin-web beam I-40-4Da) reproduces the report", () => {
  const r = S.solveDiagonal(S.tn2661Case(1));
  within(r.tau / KSI, 18.8, 0.01, "τ");
  within(r.tauCr / KSI, 0.416, 0.02, "τcr");
  within(r.k, 0.68, 0.01, "k");
  within(Math.abs(r.sigmaU) / KSI, 16.9, 0.03, "σU");
  within(r.Le / IN, 28.0, 0.01, "Le");
  within(r.checks[0].allowable / KSI, 16.5, 0.01, "column allowable");
  within(r.sigmaUmax / r.sigmaU, 1.14, 0.02, "σUmax/σU");
  within(r.tauMaxPrime / KSI, 19.2, 0.02, "τ'max");
  assert.equal(r.checks[0].regime, "Euler");
});

test("the k = 1 limit of incomplete diagonal tension is pure Wagner diagonal tension", () => {
  for (const [AUedt, twoAFht] of [[0.1, 1], [0.5, 4], [2, 50]]) {
    const args = { tau: 50, E: 70000, nu: 0.3, AUedt, twoAFht, heavyFlanges: false };
    const a = S.idtAngle({ ...args, k: 1 }), w = S.wagner(args);
    assert.ok(a.converged);
    assert.ok(Math.abs(a.alpha - w.alpha) < 1e-9, `α ${a.alpha} vs ${w.alpha}`);
  }
  // As τ/τcr grows the web stress approaches the Wagner line.
  const x = S.defaults("diagonal");
  const r = S.solveDiagonal({ ...x, S: x.S * 1e6 });
  assert.ok(r.k > 0.99);
  within(r.sigma1, r.pdt.sigma, 0.02, "σ1 → Wagner σ");
});

test("shared column-strength function: Euler, Johnson and the transition", () => {
  const m = { E: 72400, Fcy: 270, nu: 0.33, n: 15 };
  const lc = Math.PI * Math.sqrt(2 * m.E / m.Fcy);
  assert.equal(S.columnStrength(m, lc * 0.5).regime, "Johnson");
  assert.equal(S.columnStrength(m, lc * 2).regime, "Euler");
  within(S.columnStrength(m, 150).sigmaCr, Math.PI ** 2 * m.E / 150 ** 2, 1e-12, "Euler");
  const tm = S.columnStrength(m, 60, { tangent: true }).tangent.value;
  within(tm, Math.PI ** 2 * S.roModuli(m, tm).Et / 60 ** 2, 1e-8, "tangent modulus fixed point");
  const r = S.solveColumn(S.defaults("column"));
  within(r.Pcr, r.sigmaCr * r.section.A, 1e-12, "Pcr = σcr A");
  within(r.MS, r.Pcr / 5000 - 1, 1e-12, "MS");
});

test("beam-column: FE Pcr matches Euler, springs bracket the fixity cases, and the first-yield root is consistent", () => {
  const x = { ...S.defaults("beamColumn"), bow: 0, e: 2 };
  const r = S.solveBeamColumn(x);
  within(r.fe.Pcr, r.Pe, 1e-4, "FE vs π²EI/L²");
  const at = S.solveBeamColumn({ ...x, P: r.Pfy });
  within(at.atP.sigmaMax, x.material.Fcy, 1e-6, "σmax(Pfy) = Fcy");
  const soft = S.solveBeamColumn({ ...x, feMode: "springs", krA: 1e3, krB: 1e3, uB: "fixed" });
  const stiff = S.solveBeamColumn({ ...x, feMode: "springs", krA: 1e11, krB: 1e11, uB: "fixed" });
  assert.ok(soft.fe.Pcr > r.Pe && soft.fe.Pcr < stiff.fe.Pcr && stiff.fe.Pcr < 4.001 * r.Pe);
  const mech = S.solveBeamColumn({ ...x, feMode: "springs", krA: 0, krB: 0, uB: "free" });
  assert.equal(mech.fe.Pcr, null);
  assert.match(mech.fe.error, /mechanism/);
  // End moments: equal moments M0 give M0 sec(kL/2) at midspan.
  const em = S.solveBeamColumn({ ...x, e: 0, M1: 1e5, M2: 1e5, P: 5000 });
  const k = Math.sqrt(5000 / (x.material.E * em.section.I));
  within(em.atP.Mmax, 1e5 / Math.cos(k * x.L / 2), 1e-6, "equal end moments");
  // Above Pe the second-order state is undefined and flagged.
  const over = S.solveBeamColumn({ ...x, P: 2 * r.Pe });
  assert.equal(over.atP, null);
  assert.match(over.warnings.join("\n"), /at or above the elastic buckling load/);
});

test("shear buckling: closed-form k_s, plasticity and warnings", () => {
  const x = S.defaults("shear");
  const r = S.solveShear(x);
  within(r.ks, 5.34 + 4 / 4, 1e-12, "k_s at a/b = 2");
  within(r.tauE, r.ks * Math.PI ** 2 * x.material.E / (12 * (1 - x.material.nu ** 2)) * (x.t / x.b) ** 2, 1e-12, "τcr,e");
  const thick = S.solveShear({ ...x, t: 6 });
  assert.ok(thick.eta < 0.9 && thick.tauCr < x.material.Fcy / 2 * 1.2);
  const t2 = S.solveShear({ ...x, t: 6, plasticity: "table2" });
  assert.ok(t2.tauCr <= thick.tauCr, "table 2 factor is not above eq. (A5)");
  assert.match(S.solveShear({ ...x, a: 1000, b: 150 }).warnings.join("\n"), /outside 1 to 5/);
  assert.match(S.solveShear({ ...x, a: 100, b: 300 }).warnings.join("\n"), /a < b/);
});

test("chart relations outside their figure are unavailable, never extrapolated silently", () => {
  assert.match(S.c2Fig18(4.5).unavailable, /unavailable: chart data not sourced/);
  assert.match(S.smaxRatioFig15(0.5, 1.4).unavailable, /unavailable: chart data not sourced/);
  const x = { ...S.defaults("diagonal"), d: 600, dc: 590 };
  const r = S.solveDiagonal(x);
  assert.equal(r.sigmaUmax, null);
  assert.match(r.warnings.join("\n"), /unavailable: chart data not sourced/);
  assert.equal(S.c2Fig18(0.8).value, 0);
});

test("kss beyond fig. 12(a) makes the web buckling stress and everything after it unavailable", () => {
  const x = { ...S.defaults("diagonal"), he: 2000, hc: 1980, hU: 1990 };
  const r = S.solveDiagonal(x);
  assert.match(r.error, /kss unavailable: chart data not sourced for hc\/dc = 10\.4/);
  assert.match(r.warnings.join("\n"), /kss unavailable: chart data not sourced/);
  for (const q of ["kss", "tauCrElastic", "tauCr", "k", "sigmaU", "checks"]) assert.ok(r[q] === null || r[q] === undefined, q);
  assert.ok(r.sources.some((s) => s.id === "kssFit") && r.sources.some((s) => s.id === "tcr32"));
  const doc = S.exportJSON("diagonal", x);
  assert.equal(doc.results["τcr"], null);
  assert.ok(doc.sources.length > 0);
  assert.equal(S.diagonalCurves(x, 10).web.length, 0);
  assert.ok(S.solveDiagonal({ ...x, he: 950, hc: 940, hU: 945 }).tauCr > 0, "hc/dc just under 5 is still solved");
});

test("section 4.2 note 2 is reported unchecked and τcr is eq. (32) with the uprights", () => {
  const x = S.defaults("diagonal");
  const r = S.solveDiagonal(x);
  assert.equal(r.tauCrElasticNoUprights, null);
  assert.match(r.noUprightsUnavailable, /unavailable: chart data not sourced - TN 2661 gives no kss for the uprights-disregarded \(infinitely long\) panel/);
  assert.match(r.warnings.join("\n"), /note 2 .*could not be checked/);
  const eq32 = r.kss * x.material.E * (x.t / x.dc) ** 2 * (r.Rh + 0.5 * (r.Rd - r.Rh) * (x.dc / x.hc) ** 3);
  within(r.tauCrElastic, eq32, 1e-12, "τcr,elastic from eq. (32)");
  const wide = S.solveDiagonal({ ...x, hc: 190, he: 200, hU: 195, d: 800, dc: 790 });
  assert.equal(wide.tauCrElasticNoUprights, null);
});

test("fig. 12(b) beyond t/t = 3 is held at the end value and tagged with the TN 2661 section 7 source", () => {
  const hold = "Hold of fig. 12(b) beyond t/t = 3 at the end value, as applied in NACA TN 2661 section 7, example 1, p. 57: tU/t = 3.20 and tF/t large give Rh = Rd = 1.62";
  assert.equal(S.SOURCES.rHold.kind, "NASA");
  assert.equal(S.SOURCES.rHold.text, hold);
  const x = { ...S.defaults("diagonal"), tU: 3.2, tF: 2.5 };
  const r = S.solveDiagonal(x);
  assert.equal(r.Rh, S.restraintFig12b(3, "upper").value);
  assert.ok(r.sources.some((s) => s.id === "rHold" && s.text === hold));
  assert.ok(r.warnings.some((w) => w.startsWith("Rh:") && w.includes(hold)));
  assert.ok(!S.solveDiagonal({ ...x, tU: 1.6 }).sources.some((s) => s.id === "rHold"));
  assert.ok(!S.solveDiagonal({ ...x, restraint: "user" }).sources.some((s) => s.id === "rHold"));
  const ex1 = S.solveDiagonal(S.tn2661Case(1));
  assert.ok(ex1.sources.some((s) => s.id === "rHold"), "example 1 runs through the sourced hold");
  assert.ok(Math.abs(ex1.Rh - 1.62) < 0.02);
});

test("figure fits stay within their stated error of the digitised NASA points", () => {
  const e = S.fitErrors();
  assert.ok(e.kss.maxRel < 0.02, `kss ${e.kss.maxRel}`);
  assert.ok(e.rUpper.maxAbs < 0.03 && e.rLower.maxAbs < 0.03, `R ${e.rUpper.maxAbs} ${e.rLower.maxAbs}`);
  assert.ok(e.smax.maxRel < 0.01, `σUmax/σU ${e.smax.maxRel}`);
  assert.ok(e.c2.maxAbs < 0.02, `C2 ${e.c2.maxAbs}`);
  for (const k of Object.keys(e)) assert.ok(e[k].n >= 40, `${k} has ${e[k].n} points`);
});

test("every formula source is tagged NASA, classical or fit, and NASA tags cite a report", () => {
  for (const [id, s] of Object.entries(S.SOURCES)) {
    assert.ok(["NASA", "classical", "fit"].includes(s.kind), id);
    if (s.kind !== "classical") assert.match(s.text, /NACA TN \d+/, id);
  }
  for (const tab of S.TABS) assert.ok(S.solve(tab, S.defaults(tab)).sources.length > 0);
});

test("hard errors block the calculation with field messages", () => {
  const bad = { ...S.defaults("column"), L: -1, P: "x" };
  assert.throws(() => S.solveColumn(bad), (e) => e.errors.some((q) => q.field === "L") && e.errors.some((q) => q.field === "P"));
  assert.throws(() => S.solveShear({ ...S.defaults("shear"), material: { E: 70000, Fcy: 300, nu: 0.6, n: 10 } }), /ν must be < 0.5/);
  assert.throws(() => S.solveDiagonal({ ...S.defaults("diagonal"), dc: 500 }), /dc must be ≤ d/);
  assert.throws(() => S.solveColumn({ ...S.defaults("column"), section: { shape: "tube", D: 10, t: 6 } }), /≤ D\/2/);
});

test("exports: JSON round-trips in canonical SI and Markdown carries disclaimer, warnings and sources", () => {
  for (const tab of S.TABS) {
    const x = S.defaults(tab);
    const doc = S.exportJSON(tab, x, { displayUnits: "US" });
    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.units, "SI");
    assert.equal(doc.notForCertification, true);
    assert.ok(Array.isArray(doc.warnings) && Array.isArray(doc.sources) && doc.results);
    const back = S.importJSON(JSON.stringify(doc));
    assert.equal(back.tab, tab);
    assert.equal(back.displayUnits, "US");
    assert.deepEqual(back.inputs, S.normalise(tab, x));
    const inputsOnly = S.exportJSON(tab, x, { withResults: false });
    assert.equal(inputsOnly.results, undefined);
    assert.deepEqual(S.importJSON(inputsOnly).inputs, S.normalise(tab, x));
    const md = S.exportMarkdown(tab, x, { displayUnits: "US" });
    assert.match(md, /Not for certification/);
    assert.match(md, /## Warnings/);
    assert.match(md, /## Formula sources/);
    assert.match(md, /ksi|lbf|in/);
  }
  assert.throws(() => S.importJSON("{"), /Not valid JSON/);
  assert.throws(() => S.importJSON({ schemaVersion: 2, tab: "column", units: "SI", inputs: {} }), /schemaVersion/);
  assert.throws(() => S.importJSON({ schemaVersion: 1, tab: "nope", units: "SI", inputs: {} }), /Unknown tab/);
  const blocked = S.exportJSON("column", { ...S.defaults("column"), L: 0 });
  assert.equal(blocked.results, null);
  assert.ok(blocked.errors.length);
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
  const run = (api) => JSON.stringify([api.TABS.map((t) => api.solve(t, api.defaults(t))), api.selfTests()]);
  const first = run(ctx.Stability);
  assert.equal(run(ctx.Stability), first);
  assert.equal(run(S), first);
});

test("built page is self-contained, carries the banner and registers its WebMCP tools", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+stylesheet|https?:\/\/cdn/);
  assert.match(html, /class="banner"[^>]*><b>Not for certification\.<\/b>/);
  const names = ["get_metadata", "get_current_analysis", "solve_stability", "run_self_tests"];
  const inert = () => new Proxy(function () {}, {
    get: (t, k) => (k === "modelContext" ? undefined : k === Symbol.iterator ? [][Symbol.iterator] : k === Symbol.toPrimitive ? () => 0 : inert()),
    set: () => true, apply: () => inert(), construct: () => inert(),
  });
  const tools = [];
  const ctx = vm.createContext({
    document: inert(), location: { hash: "" }, addEventListener() {}, setTimeout() {},
    navigator: { modelContext: { registerTool: (t) => tools.push(t) } }, Blob: function () {}, URL: inert(), FileReader: function () {},
  });
  ctx.self = ctx; ctx.window = ctx;
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
  assert.deepEqual(tools.map((t) => t.name), names);
  const call = async (name, input) => JSON.parse((await tools.find((t) => t.name === name).execute(input)).content[0].text);
  const solved = await call("solve_stability", { tab: "shear", inputs: { t: 1.2 } });
  assert.equal(solved.tab, "shear");
  assert.equal(solved.notForCertification, true);
  assert.ok(solved.results["τcr"] > 0);
  assert.match((await call("solve_stability", { tab: "column", inputs: { L: -5 } })).errors[0].message, /Length L/);
  assert.match((await call("solve_stability", { tab: "x" })).errors[0].message, /tab must be one of/);
  const current = await call("get_current_analysis", {});
  assert.equal(current.tab, "column");
  const tests = await call("run_self_tests", {});
  assert.equal(tests.passed, tests.total);
  const meta = await call("get_metadata", {});
  assert.match(meta.disclaimer, /Not for certification/);
  assert.ok(meta.fit_errors.kss.n > 0);
});
