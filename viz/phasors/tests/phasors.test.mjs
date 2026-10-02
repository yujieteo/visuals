import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const engineSrc = /<script id="ph-engine">([\s\S]*?)<\/script>/.exec(html)[1];
const load = (ctx = {}) => { vm.createContext(ctx); ctx.self = ctx; vm.runInContext(engineSrc, ctx); return ctx.Phasors; };
const P = load();

// Engine values come from another vm realm; compare them as plain JSON.
const J = (x) => JSON.parse(JSON.stringify(x));
const deq = (a, b, msg) => assert.deepEqual(J(a), J(b), msg);
const rel = (actual, expected, label, tol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)), `${label}: ${actual} vs ${expected}`);
const TAU = 2 * Math.PI;
const circuit = (o) => Object.assign(P.defaultInputs(), o);
const state = (inputs, tri = false, date = "") => ({ inputs: Object.assign(P.defaultInputs(), inputs), displayOptions: { powerTriangle: tri }, export: { date, voice: "bf_emma" } });
const f0 = (L, C) => 1 / (TAU * Math.sqrt(L * C));
const BAD = /NaN|Infinity|\d[eE][+-]?\d/;

test("the in-page self-tests (spec 12.1) all pass", () => {
  const t = P.selfTests();
  assert.equal(t.length, 10);
  assert.equal(t.filter((x) => !x.pass).map((x) => `${x.name}: ${x.detail}`).join("\n"), "");
});

test("the default state matches the hand calculation in spec section 8", () => {
  const i = P.defaultInputs();
  deq(i, { mode: "series", R_on: true, L_on: true, C_on: true, R: 100, L: 0.01, C: 1e-6, f: 2400, V: 10 });
  const r = P.compute(i), w = TAU * 2400, X = w * 0.01 - 1 / (w * 1e-6);
  rel(r.Z.re, 100, "R"); rel(r.Z.im, X, "X");
  assert.equal(P.si(r.Z.im, P.OHM), "84.5 Ω");
  assert.equal(P.si(r.Zmag, P.OHM), "131 Ω");
  assert.equal(P.ang(r.phi), "40.2");
  assert.equal(r.pfLabel, "lagging");
  assert.equal(P.si(r.I, "A"), "76.4 mA");
  const vl = r.parts.find((q) => q.k === "L");
  assert.equal(P.si(vl.mag, "V"), "11.5 V");
  assert.ok(vl.mag > i.V, "V_L exceeds the source voltage");
  assert.equal(P.sentence(r), "Current lags voltage by 40.2°: inductive.");
});

test("the five presets carry the exact values of spec section 8", () => {
  const want = {
    resistive: ["series", "R", 100, null, null, 1000, 10],
    inductive: ["series", "RL", 100, 0.01, null, 2000, 10],
    capacitive: ["series", "RC", 100, null, 1e-6, 1000, 10],
    "series-resonance": ["series", "RLC", 10, 0.01, 1e-6, 1591.55, 10],
    "parallel-resonance": ["parallel", "RLC", 1000, 0.01, 1e-6, 1591.55, 10],
  };
  deq(P.PRESETS.map((p) => p.id), Object.keys(want));
  for (const p of P.PRESETS) {
    const [mode, on, R, L, C, f, V] = want[p.id], i = p.inputs;
    assert.equal(i.mode, mode, p.id);
    for (const k of ["R", "L", "C"]) assert.equal(i[k + "_on"], on.includes(k), `${p.id} ${k}_on`);
    assert.equal(i.R, R); if (L !== null) assert.equal(i.L, L); if (C !== null) assert.equal(i.C, C);
    assert.equal(i.f, f); assert.equal(i.V, V);
    deq(P.validateInputs(i), []);
  }
  assert.equal(P.ang(P.compute(P.PRESETS[0].inputs).phi), "0.0");
  assert.ok(P.compute(P.PRESETS[1].inputs).phi > 0);
  assert.ok(P.compute(P.PRESETS[2].inputs).phi < 0);
  assert.equal(P.sentence(P.compute(P.PRESETS[3].inputs)), "Current is in phase with voltage: at resonance the inductive and capacitive parts cancel.");
  rel(P.compute(P.PRESETS[4].inputs).Zmag, 1000, "parallel resonance |Z| = R", 1e-6);
});

test("raw.json is the published metadata and default inputs of the page", async () => {
  const raw = JSON.parse(await readFile(new URL("../raw.json", import.meta.url), "utf8"));
  const { schemaVersion, example, ...meta } = raw;
  assert.equal(schemaVersion, P.SCHEMA_VERSION);
  deq(example, P.defaultInputs());
  deq(meta, P.META);
});

test("degenerate cases (spec section 4) behave exactly as tabled", () => {
  const L = 0.01, C = 1e-6, fr = f0(L, C);
  // Series, R off, at f0: current unbounded.
  const a = P.compute(circuit({ R_on: false, f: fr }));
  assert.equal(a.unbounded, "current");
  assert.ok(a.Zmag < 1e-9);
  assert.equal(a.I, null); assert.equal(a.phi, null); assert.equal(a.S, null); assert.equal(a.pf, null);
  assert.match(P.sentence(a), /^Resonance: current unbounded/);
  const rowsA = P.readoutRows(a);
  assert.ok(rowsA.some((r) => r[1] === "I" && r[2] === "unbounded"));
  assert.ok(rowsA.some((r) => r[1] === "V_L" && r[2] === "unbounded"));
  assert.equal(P.describe("impedance", a), "Impedance plane: Z is zero, current unbounded, angle undefined.");
  // Parallel, R off, at f0: impedance unbounded, total current 0.
  const b = P.compute(circuit({ mode: "parallel", R_on: false, f: fr }));
  assert.equal(b.unbounded, "impedance");
  assert.ok(b.Ymag < 1e-12);
  assert.equal(b.I, 0); assert.equal(b.Z, null);
  assert.match(P.sentence(b), /^Resonance: impedance unbounded/);
  assert.ok(P.readoutRows(b).some((r) => r[1] === "Z" && r[2] === "unbounded"));
  // With R on at resonance: normal numbers, Z = R in both modes.
  for (const mode of ["series", "parallel"]) {
    const r = P.compute(circuit({ mode, R: 47, f: fr }));
    assert.equal(r.unbounded, null); rel(r.Zmag, 47, `${mode} Z = R`, 1e-9); assert.ok(Math.abs(r.phi) < 1e-6);
  }
  // One element on: f0, Q_f and the resonance note read "needs L and C".
  for (const on of ["R", "L", "C"]) for (const mode of ["series", "parallel"]) {
    const r = P.compute(circuit({ mode, R_on: on === "R", L_on: on === "L", C_on: on === "C" }));
    assert.equal(r.f0, null); assert.equal(r.Qf, null); assert.equal(P.resonanceNote(r), "needs L and C");
    assert.ok(P.readoutRows(r).filter((x) => x[0] === "Resonance").every((x) => x[2] === "needs L and C"), `${mode} ${on}`);
  }
  // Q_f needs R, L and C.
  assert.equal(P.compute(circuit({ R_on: false })).Qf, null);
  rel(P.compute(circuit({})).Qf, Math.sqrt(0.01 / 1e-6) / 100, "series Q_f");
  rel(P.compute(circuit({ mode: "parallel", R: 1000 })).Qf, 1000 / Math.sqrt(0.01 / 1e-6), "parallel Q_f");
});

test("extreme values never produce NaN, infinity or exponent notation", () => {
  const R = P.RANGES, corners = [];
  for (const mode of ["series", "parallel"]) for (const on of ["RLC", "RL", "RC", "LC", "R", "L", "C"])
    for (const r of [R.R.min, R.R.max]) for (const l of [R.L.min, R.L.max]) for (const c of [R.C.min, R.C.max]) for (const f of [R.f.min, R.f.max]) for (const v of [R.V.min, R.V.max])
      corners.push({ mode, R_on: on.includes("R"), L_on: on.includes("L"), C_on: on.includes("C"), R: r, L: l, C: c, f, V: v });
  for (const i of corners) {
    const r = P.compute(i), res = P.results(r);
    for (const row of P.readoutRows(r)) assert.doesNotMatch(row[2], BAD, JSON.stringify(i) + " " + row[1]);
    JSON.stringify(res, (k, v) => { if (typeof v === "number") assert.ok(Number.isFinite(v), `${k} in ${JSON.stringify(i)}`); return v; });
    for (const s of [P.phasorScene(r, 37), P.impedanceScene(r), P.waveScene(r, 37), P.powerScene(r)].concat(i.mode === "parallel" ? [P.admittanceScene(r)] : []))
      assert.doesNotMatch(P.svgInner(s, true), /NaN|Infinity/, JSON.stringify(i));
  }
});

test("formatter boundary cases: ties, prefix edges, tiny and huge values", () => {
  const cases = [
    [0, "V", "0 V"], [1, "V", "1.00 V"], [1.005, "V", "1.01 V"], [1.0049, "V", "1.00 V"], [-1.005, "V", "-1.01 V"],
    [999.4, "V", "999 V"], [999.5, "V", "1.00 kV"], [999.5e-3, "V", "1.00 V"], [0.0009995, "A", "1.00 mA"],
    [1e-12, "A", "1.00 pA"], [1.234e-15, "W", "0.00123 pW"], [5e9, "Hz", "5.00 GHz"], [1.234e12, "VA", "1230 GVA"], [9.876e14, "var", "988000 Gvar"],
    [2400, "Hz", "2.40 kHz"], [1e-6, "H", "1.00 µH"], [84.48188775, "Ω", "84.5 Ω"],
  ];
  for (const [x, u, want] of cases) assert.equal(P.si(x, u), want, `si(${x})`);
  assert.equal(P.si(-2.5e-3, "A", { minus: "−" }), "−2.50 mA");
  assert.equal(P.si(1500, "Hz", { trim: true }), "1.5 kHz");
  // 12-significant-digit rounding absorbs last-bit noise before the 3-figure rounding.
  assert.equal(P.si(1.0049999999999999, "V"), P.si(1.005, "V"));
  for (const [x, want] of [[0, "0.0"], [40.25, "40.3"], [-40.25, "-40.3"], [-0.04, "0.0"], [180, "180.0"], [-180, "180.0"], [-179.96, "180.0"], [540, "180.0"], [359.9, "-0.1"], [-90, "-90.0"]])
    assert.equal(P.ang(x), want, `ang(${x})`);
  for (const [x, want] of [[0.00001, "0.00001"], [123456789012345, "123456789012000"], [-0.1, "-0.1"], [1 / 3, "0.333333333333"]]) assert.equal(P.plain(x), want);
  assert.equal(P.fixed(0.005, 2), "0.01"); assert.equal(P.fixed(-0.004, 2), "0.00"); assert.equal(P.fixed(0.0049, 2), "0.00");
});

test("number fields accept SI prefixes and units; ranges are enforced", () => {
  for (const [t, k, want] of [["4.7k", "R", 4700], ["4.7 kΩ", "R", 4700], ["10m", "L", 0.01], ["10 mH", "L", 0.01], ["2.2u", "C", 2.2e-6], ["2.2µF", "C", 2.2e-6], ["1M", "f", 1e6], ["1kHz", "f", 1000], ["230", "V", 230], [".5", "V", 0.5], ["1e3", "f", 1000]])
    assert.equal(P.parseSI(t, k), want, t);
  for (const t of ["", "abc", "1x", "k", "4.7 kHz"]) assert.ok(Number.isNaN(P.parseSI(t, "R")), t);
  assert.deepEqual(J(P.validateInputs(circuit({ R: 0.05 }))).map((e) => e.field), ["R"]);
  assert.deepEqual(J(P.validateInputs(circuit({ R_on: false, L_on: false, C_on: false }))).map((e) => e.field), ["R_on"]);
  assert.throws(() => P.analyze(circuit({ f: 2e6 })), /f must be between/);
});

test("JSON round trip is exact; wrong kind and newer schemaVersion are refused", () => {
  const states = [state({}), state({ mode: "parallel", R_on: false, R: 0.1, L: 9.99, C: 3.3e-9, f: 59.94, V: 0.1 }, true, "1 October 2026"), state(P.PRESETS[3].inputs, true)];
  for (const s of states) {
    const text = P.toJSON(s), back = P.fromJSON(text);
    assert.equal(P.toJSON(back), text);
    deq(back, s);
    assert.equal(P.buildReport(back), P.buildReport(s));
    assert.equal(P.buildDeck(back), P.buildDeck(s));
  }
  const text = P.toJSON(states[1]);
  assert.deepEqual(Object.keys(JSON.parse(text)), ["kind", "schemaVersion", "inputs", "displayOptions", "export"]);
  assert.deepEqual(Object.keys(JSON.parse(text).inputs), ["mode", "R_on", "L_on", "C_on", "R", "L", "C", "f", "V"]);
  assert.throws(() => P.fromJSON(text.replace('"phasors-circuit"', '"mohr-visualiser"')), /kind/);
  assert.throws(() => P.fromJSON(text.replace('"schemaVersion": 1', '"schemaVersion": 2')), /schemaVersion 2/);
  assert.throws(() => P.fromJSON(text.replace('"R": 0.1', '"R": 0.01')), /R must be between/);
  assert.throws(() => P.fromJSON(text.replace('"1 October 2026"', '"1 Octé"')), /export.date/);
  assert.throws(() => P.fromJSON("{"), /Not valid JSON/);
});

test("the URL hash round-trips and falls back per field with a note", () => {
  const s = state({ mode: "parallel", C_on: false, R: 4700, L: 0.0033, f: 59.94, V: 230 }, true);
  const h = P.toHash(s);
  assert.equal(h, "mode=parallel&R_on=1&L_on=1&C_on=0&R=4700&L=0.0033&C=0.000001&f=59.94&V=230&tri=1");
  const back = P.fromHash("#" + h);
  deq(back.fallback, []); deq(back.state.inputs, s.inputs); assert.equal(back.state.displayOptions.powerTriangle, true);
  const bad = P.fromHash("#mode=sideways&R_on=1&L_on=1&C_on=1&R=-5&L=0.02&f=2e7&V=12&tri=yes");
  deq(bad.fallback, ["mode", "R", "C", "f", "tri"]);
  assert.equal(bad.state.inputs.mode, "series"); assert.equal(bad.state.inputs.R, 100); assert.equal(bad.state.inputs.L, 0.02); assert.equal(bad.state.inputs.V, 12);
  const off = P.fromHash("#mode=series&R_on=0&L_on=0&C_on=0&R=100&L=0.01&C=1e-6&f=2400&V=10&tri=0");
  assert.ok(off.state.inputs.R_on && off.state.inputs.L_on && off.state.inputs.C_on);
  deq(P.fromHash("").fallback, []);
});

test("report and deck are deterministic, well formed and identical across engine instances", () => {
  const other = load({});
  const all = [];
  for (const p of P.PRESETS) for (const tri of [false, true]) all.push(state(p.inputs, tri));
  all.push(state({ R_on: false, f: f0(0.01, 1e-6) }, true), state({ mode: "parallel", R_on: false, f: f0(0.01, 1e-6) }, true), state({ mode: "parallel", L_on: false, C_on: false }, true, "Week 3"));
  for (const s of all) {
    const deck = P.buildDeck(s), rep = P.buildReport(s);
    assert.deepEqual(J(P.checkDeck(deck)), [], JSON.stringify(s.inputs));
    assert.deepEqual(J(P.checkReport(rep)), [], JSON.stringify(s.inputs));
    assert.equal(other.buildDeck(J(s)), deck); assert.equal(other.buildReport(J(s)), rep);
    assert.doesNotMatch(deck, /\\infty|NaN|Infinity/);
    assert.ok(!/[^\x09\x0a\x20-\x7e]/.test(deck), "deck is ASCII");
    for (const fence of ["::: notes", "::: narration"]) assert.equal(deck.split(fence).length - 1, deck.split(/\n## /).length - 1 + 1, `${fence} once per frame plus the title`);
  }
  const deck = P.buildDeck(state({}, true, "1 October 2026"));
  assert.match(deck, /^---\ntitle: Series RLC at 2\.40 kHz\nsubtitle: Steady-state phasor and impedance analysis\nauthor: Yu Jie Teo\ndate: 1 October 2026\nvoice: bf_emma\n---\n/);
  assert.doesNotMatch(P.buildDeck(state({})), /\ndate:/);
  for (const h of ["# Circuit", "## The circuit and its conventions", "# Impedance", "## Impedance of each element", "## Adding them up", "# Phasors", "## Phasor diagram", "## Impedance plane", "# Waveforms", "## Voltage and current over one cycle", "# Power", "## The power triangle", "# What to remember", "## Key results"])
    assert.ok(deck.includes("\n" + h + "\n"), h);
  assert.match(deck, /::: plot\nx: 0, 6\.283185\ny: -1\.2, 1\.2\nxlabel: omega t \(rad\)\nylabel: per unit of peak\ny = sin\(x\)\ny = sin\(x - 0\.70147\d\)\n:::/);
  assert.match(deck, /::: alert Check\n/);
  assert.match(P.buildDeck(state({ mode: "parallel" })), /\n## Admittance and impedance planes\n/);
  assert.doesNotMatch(P.buildDeck(state({})), /# Power/);
  assert.doesNotMatch(P.buildDeck(state({ L_on: false })), /::: alert Check/);
  // Snapshots: base64 SVG at omega t = 0, white background, decodable back to the same SVG.
  const img = /!\[Phasor diagram at omega t = 0\]\(data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)\)/.exec(deck);
  assert.ok(img);
  const svg = Buffer.from(img[1], "base64").toString("utf8");
  const r = P.compute(P.defaultInputs());
  assert.equal(svg, P.svgDoc(P.phasorScene(r, 0), P.describe("phasor", r), 1.3));
  assert.match(svg, /width="468" height="468"/);
  assert.match(svg, /<rect width="360" height="360" fill="#ffffff"\/>/);
  assert.equal(P.base64("Ω°"), Buffer.from("Ω°", "utf8").toString("base64"));
  assert.equal(P.base64("ab"), "YWI=");
  // Narration is speech: no LaTeX, no bare symbols, numbers with spelled-out units.
  for (const block of deck.split("::: narration\n").slice(1).map((b) => b.slice(0, b.indexOf("\n:::")))) {
    assert.doesNotMatch(block, /[$\\_^]|\bmA\b|\bkHz\b|[<>=]/, block);
  }
  assert.match(deck, /100 ohms/); assert.match(deck, /10\.0 millihenries/); assert.match(deck, /1\.00 microfarads/); assert.match(deck, /76\.4 milliamps/);
  const unb = P.buildDeck(state({ R_on: false, f: f0(0.01, 1e-6) }, true));
  assert.match(unb, /unbounded/); assert.doesNotMatch(unb, /\\infty/);
});

test("the report carries the circuit, every readout value and the sentence", () => {
  const rep = P.buildReport(state({}));
  assert.ok(rep.startsWith("# Phasor and impedance report: Series RLC at 2.40 kHz\n"));
  for (const s of ["| R | 100 Ω (100 Ω) |", "| φ | 40.2° |", "| I | 76.4 mA ∠ -40.2° |", "| V_L | 11.5 V ∠ 49.8° |", "Current lags voltage by 40.2°: inductive."]) assert.ok(rep.includes(s), s);
  assert.doesNotMatch(rep, /−/, "exports use ASCII minus");
});

test("the engine has no forbidden calls and runs without DOM, storage, clock or randomness", () => {
  const code = engineSrc.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  for (const bad of [/\bDate\b/, /Math\.random/, /\bIntl\b/, /toLocale\w*/, /localeCompare/, /\bbtoa\b/, /\bBuffer\b/, /\bdocument\b/, /\bwindow\b/, /localStorage|sessionStorage/, /\bfetch\b/, /Math\.hypot/, /Math\.log10/])
    assert.doesNotMatch(code, bad, String(bad));
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`
    for (const name of ["document", "window", "localStorage", "location", "navigator", "Intl"])
      Object.defineProperty(globalThis, name, { get() { throw new Error(name + " touched"); } });
    Math.random = () => { throw new Error("Math.random touched"); };
    Date = new Proxy(Date, { get() { throw new Error("Date touched"); }, construct() { throw new Error("Date touched"); }, apply() { throw new Error("Date touched"); } });
    String.prototype.localeCompare = Number.prototype.toLocaleString = () => { throw new Error("locale touched"); };`, ctx);
  const G = load(ctx);
  const s = state({}, true);
  const run = (api) => JSON.stringify([api.buildDeck(s), api.buildReport(s), api.selfTests()]);
  assert.equal(run(G), run(G));
  assert.equal(run(G), run(P));
});

// Boots both page scripts against an inert DOM. Every way a page could reach the network or storage is
// a trap that records the attempt, so tests can assert the page never tries.
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
    get: (t, k) => {
      if (k === "cookie") network.push("document.cookie");
      return k === "createElement" ? (tag) => { if (loaders.has(String(tag).toLowerCase())) network.push(`createElement(${tag})`); return inert(); } : t[k];
    },
    set: (t, k) => { if (k === "cookie") network.push("document.cookie"); return true; },
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
  for (const name of ["localStorage", "sessionStorage"]) Object.defineProperty(ctx, name, { get() { network.push(name); return inert(); } });
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  assert.deepEqual(scripts.map((m) => /id="([^"]+)"/.exec(m[0])?.[1]), ["site-theme", "ph-engine", "ph-ui"]);
  // The site-theme script only reads the reader's site-wide theme; its own test below checks that.
  for (const m of scripts) if (!m[0].includes('id="site-theme"')) vm.runInContext(m[1], ctx);
  return { tools, network };
};

test("the site-theme script only reads the site's theme key and applies light or dark", () => {
  const theme = /<script id="site-theme">([\s\S]*?)<\/script>/.exec(html)[1];
  for (const [stored, expected] of [["dark", "dark"], ["light", "light"], ["sepia", undefined], [null, undefined]]) {
    const calls = [];
    const dataset = {};
    const localStorage = new Proxy({}, { get: (_, k) => (k === "getItem" ? (key) => { calls.push(["getItem", key]); return stored; } : () => calls.push([k])) });
    vm.runInNewContext(theme, { localStorage, document: { documentElement: { dataset } } });
    deq(calls, [["getItem", "theme"]]);
    assert.equal(dataset.theme, expected, String(stored));
  }
  vm.runInNewContext(theme, { document: { documentElement: { dataset: {} } } }); // no storage at all: silent
});

test("the page boots without a real DOM, registers its WebMCP tools and makes no network request", async () => {
  const { tools, network } = bootPage();
  // The tools the page registers; the site's catalogue stub (data/visuals/phasors.yaml in yujieteo/site) names the same set.
  deq(tools.map((t) => t.name), ["get_metadata", "get_current_circuit", "analyze_circuit", "run_self_tests"]);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, true, t.name);
  const call = async (name, input) => {
    const text = (await tools.find((t) => t.name === name).execute(input)).content[0].text;
    assert.ok(text.endsWith("\n")); return JSON.parse(text);
  };
  assert.equal((await call("get_metadata", {})).schema, "phasors-circuit");
  const cur = await call("get_current_circuit", {});
  assert.equal(cur.kind, "phasors-circuit");
  assert.equal(cur.results.sentence, "Current lags voltage by 40.2°: inductive.");
  const a = await call("analyze_circuit", { mode: "parallel", R: 1000, f: f0(0.01, 1e-6) });
  rel(a.results.Zmag, 1000, "analyze |Z|", 1e-9);
  assert.equal(a.inputs.L, 0.01, "missing fields take the default state");
  const u = await call("analyze_circuit", { R_on: false, f: f0(0.01, 1e-6) });
  assert.equal(u.results.flags.unbounded, "current"); assert.equal(u.results.I, null);
  const bad = await call("analyze_circuit", { R: 1e6 });
  assert.equal(bad.errors[0].field, "R");
  const st = await call("run_self_tests", {});
  assert.equal(st.passed, st.total);
  deq(network, []);
});

// A minimal element model of the page: every start tag with its attributes and its text content.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
const decode = (v) => v.replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ENTITIES[k]);
const parsePage = (src) => [...src.matchAll(/<([a-z][a-z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)].map((m) => {
  const tag = m[1].toLowerCase(), attrs = {};
  for (const a of m[2].matchAll(/([a-z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gi)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? "");
  const close = src.indexOf(`</${tag}>`, m.index);
  const text = close < 0 ? "" : decode(src.slice(m.index + m[0].length, close).replace(/<[^>]*>/g, "")).trim();
  return { tag, attrs, text, inHead: m.index < src.indexOf("</head>") };
});

test("the page has the house head and header, and its markup loads nothing external", () => {
  const els = parsePage(html), head = els.filter((e) => e.inHead);
  const meta = (k, v) => head.filter((e) => e.tag === "meta" && e.attrs[k] === v).map((e) => e.attrs.content);
  const links = head.filter((e) => e.tag === "link").map((e) => [e.attrs.rel, e.attrs.href]);
  assert.equal(head.find((e) => e.tag === "meta" && "charset" in e.attrs).attrs.charset.toLowerCase(), "utf-8");
  deq(meta("name", "viewport"), ["width=device-width, initial-scale=1, viewport-fit=cover"]);
  deq(links, [["icon", "data:,"], ["canonical", "https://teoyujie.org/visuals/phasors"]]);
  deq(head.filter((e) => e.tag === "title").map((e) => e.text), ["Phasor and Impedance Visualiser"]);
  for (const [k, v] of [["name", "description"], ["property", "og:title"], ["property", "og:description"], ["property", "og:site_name"]]) {
    const c = meta(k, v); assert.equal(c.length, 1, v); assert.ok(c[0].trim(), v);
  }
  deq(meta("property", "og:type"), ["website"]);
  deq(meta("property", "og:url"), ["https://teoyujie.org/visuals/phasors"]);
  deq(meta("name", "twitter:card"), ["summary"]);
  deq(meta("property", "og:image"), []);

  const body = els.filter((e) => !e.inHead);
  const eyebrow = body.find((e) => e.tag === "p" && /\beyebrow\b/.test(e.attrs.class || ""));
  assert.ok(eyebrow, "eyebrow line");
  assert.ok(body.some((e) => e.tag === "a" && e.attrs.href === "../../visuals.html" && e.text === "Visuals"), "back-link to Visuals");
  assert.equal(eyebrow.text, "VisualsCircuitsWorks offline");
  const note = body.find((e) => e.attrs.role === "note");
  assert.ok(note && note.text, "role=note line");
  assert.equal(body.find((e) => e.attrs.id === "selftest-badge")?.tag, "button");
  deq(body.filter((e) => e.tag === "noscript").map((e) => e.text), ["This tool needs JavaScript."]);
  assert.ok(body.some((e) => e.attrs["aria-live"] === "polite" && e.attrs.id === "sentence"), "polite live sentence");
  assert.ok(body.some((e) => e.tag === "a" && e.attrs.href === "../beamdswitch/index.html" && e.text === "Open beamdswitch, then drop the file in"), "beamdswitch link");

  deq(els.filter((e) => "src" in e.attrs).map((e) => e.attrs.src), [], "no element loads a src");
  for (const e of els.filter((x) => x.tag === "style")) assert.doesNotMatch(e.text, /@import|url\(/i, "styles load nothing");
  assert.ok(Buffer.byteLength(html) < 120 * 1024, `index.html is ${Buffer.byteLength(html)} bytes`);
});
