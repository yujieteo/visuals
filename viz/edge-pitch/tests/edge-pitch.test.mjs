import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const E = require("../engine.js");
const raw = JSON.parse(await readFile(new URL("../raw.json", import.meta.url), "utf8"));

const close = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)), `${label}: ${actual} vs ${expected}`);
const byId = (list, id) => list.find((c) => c.id === id);
const messages = (list) => list.map((e) => e.message).join("\n");
const joint = (patch = {}) => {
  const x = E.example();
  for (const [path, v] of Object.entries(patch)) E.set(x, path, v);
  return x;
};

test("geometry checks match closed-form hand calculations", () => {
  const x = joint({ "geometry.eEnd": 8.4, "geometry.eSide": 11, "sheet.W": 118 });
  const { D, Dh } = x.fastener, { t } = x.sheet, { Ftu, Fsu, Fbru15, Fbru20 } = x.material;
  const { eEnd, eSide, p, rows, perRow } = x.geometry;
  const P = x.load.P, Pf = P / (rows * perRow);
  const r = E.solve(x);
  assert.equal(r.ok, true);
  const eD = eEnd / D; // 1.75
  close(byId(r.strength, "bearing").allowable, (Fbru15 + ((eD - 1.5) / 0.5) * (Fbru20 - Fbru15)) * D * t, 1e-12, "bearing");
  close(byId(r.strength, "bearing").applied, Pf, 1e-12, "bearing applied");
  close(byId(r.strength, "shearOut").allowable, 2 * (eEnd - Dh / 2) * t * Fsu, 1e-12, "shear-out");
  close(byId(r.strength, "netSection").allowable, Ftu * (p - Dh) * t, 1e-12, "net section");
  close(byId(r.strength, "netSection").applied, P / perRow, 1e-12, "net section strip load");
  close(byId(r.strength, "sideEdge").allowable, Ftu * (eSide - Dh / 2) * t, 1e-12, "side edge");
  close(byId(r.strength, "sideEdge").applied, P / perRow / 2, 1e-12, "side edge load");
  for (const c of r.strength) if (c.ms != null) close(c.ms, c.allowable / c.applied - 1, 1e-12, `${c.id} MS`);
  close(byId(r.geometric, "eEndD").ms, eD / x.rules.eDmin - 1, 1e-12, "e_end/D geometric MS");
  close(byId(r.geometric, "eSideD").ms, eSide / D / x.rules.eDmin - 1, 1e-12, "e_side/D geometric MS");
  close(byId(r.geometric, "pD").ms, p / D / x.rules.pDmin - 1, 1e-12, "p/D geometric MS");
  close(byId(r.geometric, "pD").ratioToTypical, p / D / x.rules.pDtyp, 1e-12, "p/D ÷ typical");
  close(byId(r.geometric, "gD").ms, x.geometry.g / D / x.rules.gDmin - 1, 1e-12, "g/D geometric MS");
  assert.equal(r.governing.id, r.strength.filter((c) => c.ms != null && c.governs !== false).sort((a, b) => a.ms - b.ms)[0].id);
});

test("staggered rows take the smaller of the straight and zig-zag net widths", () => {
  const x = joint({ "geometry.pattern": "staggered", "geometry.g": 8, "sheet.W": 127.2 });
  const { p, g } = x.geometry, Dh = x.fastener.Dh;
  const r = E.solve(x);
  assert.equal(r.ok, true);
  const net = byId(r.strength, "netSection");
  // Five per row: ten holes and nine diagonals over five pitch strips.
  close(net.zigzag, p - 2 * Dh + (9 / 10) * (g * g) / p, 1e-12, "zig-zag width, n_f = 5");
  close(net.width, 16.6, 1e-12, "zig-zag governs, n_f = 5");
  assert.match(net.path, /zig-zag/);
  // Two per row: four holes and three diagonals over two pitch strips.
  const two = byId(E.solve(joint({ "geometry.pattern": "staggered", "geometry.g": 8, "geometry.perRow": 2, "sheet.W": 55.2 })).strength, "netSection");
  close(two.zigzag, (2 * p - 4 * Dh + (3 * g * g) / (2 * p)) / 2, 1e-12, "zig-zag width, n_f = 2");
  close(two.width, 16.2, 1e-12, "zig-zag governs, n_f = 2");
  const diag = byId(r.geometric, "diagD");
  close(diag.actual, Math.hypot(g, p / 2) / x.fastener.D, 1e-12, "diagonal spacing");
  const wide = E.solve(joint({ "geometry.pattern": "staggered", "sheet.W": 127.2 }));
  assert.match(byId(wide.strength, "netSection").path, /straight/);
});

test("bearing interpolation reproduces the user's two F_bru values exactly and never extrapolates", () => {
  for (const [a, b] of [[600, 750], [812.3, 1043.9], [1000, 900]]) {
    assert.equal(E.fbru(1.5, a, b), a);
    assert.equal(E.fbru(2.0, a, b), b);
    close(E.fbru(1.75, a, b), (a + b) / 2, 1e-12, "midpoint");
    assert.equal(E.fbru(3, a, b), b);
    assert.equal(E.fbru(1.4999, a, b), null);
  }
  const r = E.solve(joint({ "geometry.eEnd": 6.5 }));
  const br = byId(r.strength, "bearing");
  assert.equal(br.allowable, null);
  assert.equal(br.ms, null);
  assert.equal(br.status, "outside tabulated range");
  assert.match(messages(r.warnings), /outside the tabulated range/);
  const at15 = E.solve(joint({ "geometry.eEnd": 1.5 * 4.8 }));
  close(byId(at15.strength, "bearing").allowable, 600 * 4.8 * 1.6, 1e-12, "bearing at e/D = 1.5");
});

test("SI/US unit round trips are exact to rounding", () => {
  close(E.toDisplay(25.4, "length", "US"), 1, 1e-15, "in");
  close(E.fromDisplay(1, "force", "US"), 4.4482216152605, 1e-15, "lbf");
  close(E.fromDisplay(1, "stress", "US"), 6.89475729316836, 1e-15, "ksi");
  for (const kind of ["length", "force", "stress"]) for (const v of [0.1, 7, 12345.678]) close(E.fromDisplay(E.toDisplay(v, kind, "US"), kind, "US"), v, 1e-14, kind);
  const x = E.example();
  const back = E.convertInputs(E.convertInputs(x, "US", "toDisplay"), "US", "fromDisplay");
  for (const f of E.FIELDS) {
    const v = E.get(x, f.path);
    if (typeof v === "number") close(E.get(back, f.path), v, 1e-14, f.path);
    else assert.equal(E.get(back, f.path), v);
  }
  // Exports are canonical SI whatever the toggle shows.
  const file = E.inputsJSON(x, "US");
  assert.equal(file.inputs.fastener.D, 4.8);
  assert.deepEqual(file.units, { length: "mm", force: "N", stress: "MPa" });
  assert.match(E.toMarkdown(x, "US"), /0\.189 in/);
});

test("inter-rivet buckling follows the shared column function on the Euler and Johnson branches", () => {
  const Ecol = 70000, Fcy = 300;
  const eu = E.columnStrength(Ecol, Fcy, 160, 1);
  assert.equal(eu.branch, "euler");
  close(eu.sigma, (Math.PI ** 2 * Ecol) / 160 ** 2, 1e-12, "Euler");
  const jo = E.columnStrength(Ecol, Fcy, 30, 1);
  assert.equal(jo.branch, "johnson");
  close(jo.sigma, Fcy - (Fcy ** 2 * 30 ** 2) / (4 * Math.PI ** 2 * Ecol), 1e-12, "Johnson");
  close(E.columnStrength(Ecol, Fcy, 0, 1).sigma, Fcy, 1e-12, "zero length");
  close(E.columnStrength(Ecol, Fcy, 200, 4).sigma, E.columnStrength(Ecol, Fcy, 100, 1).sigma, 1e-12, "fixity c = 4 halves the length");

  // Placeholder joint (Johnson), load across the rows: L = g, L/ρ = 19.2√12/1.6.
  const r = E.solve(E.example());
  const ir = byId(r.strength, "interRivet");
  const lr = (19.2 * Math.sqrt(12)) / 1.6;
  assert.equal(ir.branch, "johnson");
  close(ir.allowable, 300 - (300 ** 2 * lr ** 2) / (4 * Math.PI ** 2 * 70000), 1e-12, "σ_ir Johnson");
  close(ir.applied, 10000 / (115.2 * 1.6), 1e-12, "derived sheet stress");

  // Long pitch along the load (Euler) with an entered compressive stress and a failing margin.
  const x = joint({ "load.direction": "parallel", "geometry.p": 60, "sheet.W": 259.2, "load.sigmaSheet": 80 });
  const s = E.solve(x);
  const lr2 = (60 * Math.sqrt(12)) / 1.6;
  const irE = byId(s.strength, "interRivet");
  assert.equal(irE.branch, "euler");
  close(irE.allowable, (Math.PI ** 2 * 70000) / lr2 ** 2, 1e-12, "σ_ir Euler");
  assert.ok(irE.ms < 0);
  const mp = byId(s.strength, "maxPitch");
  close(E.columnStrength(70000, 300, mp.allowable / (1.6 / Math.sqrt(12)), 1).sigma, 80, 1e-9, "σ_ir(p_max) = σ");
  assert.ok(mp.ms < 0);
  assert.match(messages(s.warnings), /below the applied sheet stress/);
});

test("hard errors block the calculation with a field path", () => {
  const cases = [
    [{ "fastener.D": 0 }, "fastener.D", /positive/],
    [{ "sheet.t": "abc" }, "sheet.t", /not a number/],
    [{ "material.Fsu": null }, "material.Fsu", /missing/],
    [{ "material.Fbru15": -1 }, "material.Fbru15", /positive/],
    [{ "fastener.Dh": 24 }, "geometry.p", /smaller than the pitch/],
    [{ "geometry.eEnd": 2.45 }, "geometry.eEnd", /hole radius/],
    [{ "geometry.eSide": 2 }, "geometry.eSide", /hole radius/],
    [{ "sheet.W": 100 }, "sheet.W", /narrower than the pattern/],
    [{ "geometry.rows": 1.5 }, "geometry.rows", /whole number/],
    [{ "fastener.head": "countersunk", "fastener.csk": 1.6 }, "fastener.csk", /less than the thickness/],
    [{ "fastener.type": "screw" }, "fastener.type", /choose one/],
  ];
  for (const [patch, path, re] of cases) {
    const r = E.solve(joint(patch));
    assert.equal(r.ok, false, JSON.stringify(patch));
    const e = r.errors.find((q) => q.path === path);
    assert.ok(e, `${JSON.stringify(patch)} → ${messages(r.errors)}`);
    assert.match(e.message, re);
  }
});

test("field errors are reported before cross-field geometry errors, and either suppresses the warnings", () => {
  // A bad field and a bad geometry together: only the field error is reported.
  const both = E.validate(joint({ "fastener.D": 0, "sheet.W": 100 }));
  assert.deepEqual(both.errors.map((e) => e.path), ["fastener.D"]);
  assert.deepEqual(both.warnings, []);
  // A joint that would warn (e/D below 1.5) but is blocked by its width carries no warnings.
  const blocked = E.validate(joint({ "geometry.eEnd": 6, "sheet.W": 100 }));
  assert.deepEqual(blocked.errors.map((e) => e.path), ["sheet.W"]);
  assert.deepEqual(blocked.warnings, []);
  assert.deepEqual(E.validate(null), { errors: [{ path: null, message: "No input." }], warnings: [] });
});

test("conditional fields and default sources are shared by the page and the report", () => {
  const csk = E.FIELD["fastener.csk"], g = E.FIELD["geometry.g"];
  assert.equal(E.isShown(csk, joint()), false);
  assert.equal(E.isShown(csk, joint({ "fastener.head": "countersunk" })), true);
  assert.equal(E.isShown(g, joint({ "geometry.rows": 1 })), false);
  assert.equal(E.isShown(g, {}), true, "a malformed input shows the field instead of throwing");
  assert.equal(E.isShown(E.FIELD["fastener.D"], {}), true);
  assert.equal(E.defaultSource("material.Ftu"), E.DEFAULT_SOURCES["material.*"]);
  assert.equal(E.defaultSource("rules.eDmin").tag, "nasa");
  assert.equal(E.defaultSource("fastener.D"), null);
  // The report hides the countersink row for a protruding head and tags placeholder allowables.
  assert.doesNotMatch(E.toMarkdown(joint()), /\| Countersink depth \|/);
  assert.match(E.toMarkdown(joint({ "fastener.head": "countersunk" })), /\| Countersink depth \|/);
  assert.match(E.toMarkdown(joint()), /\| F_tu \| 400 MPa \| user allowable; default: unsourced default \|/);
});

test("soft warnings: e/D, p/D, countersink, stress above F_cy, too few rows or fasteners", () => {
  const w = (patch) => messages(E.solve(joint(patch)).warnings);
  assert.match(w({ "geometry.eEnd": 7 }), /below 1\.5, outside the tabulated range/);
  assert.match(w({ "geometry.p": 12, "sheet.W": 67.2 }), /p\/D = 2\.5 is below the entered minimum 3/);
  assert.match(w({ "fastener.head": "countersunk", "fastener.csk": 1.2 }), /Countersink depth is 0\.75·t/);
  assert.doesNotMatch(w({ "fastener.head": "countersunk", "fastener.csk": 0.8 }), /Countersink/);
  assert.match(w({ "load.sigmaSheet": 320 }), /above F_cy/);
  assert.match(w({ "geometry.rows": 1 }), /assumes at least two rows/);
  assert.match(w({ "geometry.perRow": 1, "sheet.W": 19.2 }), /Fewer than two fasteners per row/);
  assert.equal(E.solve(E.example()).warnings.length, 0);
});

test("exports carry the disclaimer, warnings and assumptions; import accepts either JSON", () => {
  const x = joint({ "geometry.eEnd": 7 });
  const md = E.toMarkdown(x, "SI");
  assert.match(md, /Not for certification/);
  assert.match(md, /outside the tabulated range/);
  assert.match(md, /Equal load share/);
  assert.match(md, /Niu \(confirm against your copy\)/);
  assert.match(md, /RP-1228/);
  assert.match(md, /unsourced default/);
  const res = E.resultsJSON(x, "US");
  assert.equal(res.schemaVersion, E.SCHEMA_VERSION);
  assert.equal(res.kind, "edge-pitch-results");
  assert.match(res.disclaimer, /Not for certification/);
  assert.ok(res.warnings.length > 0);
  assert.deepEqual(res.inputs, x);
  assert.deepEqual(res.assumptions, E.ASSUMPTIONS);
  const back = E.parseImport(JSON.stringify(res));
  assert.deepEqual(back.inputs, x);
  assert.equal(back.displayUnits, "US");
  const inp = E.parseImport(JSON.stringify(E.inputsJSON(x)));
  assert.deepEqual(inp.inputs, x);
  assert.equal(inp.displayUnits, "SI");
  // Partial inputs fill from the placeholders.
  assert.equal(E.parseImport({ inputs: { sheet: { t: 2 } } }).inputs.sheet.t, 2);
  assert.throws(() => E.parseImport("{"), /Not valid JSON/);
  assert.throws(() => E.parseImport({ kind: "other", inputs: {} }), /Unknown file kind/);
  assert.throws(() => E.parseImport({ schemaVersion: 99, inputs: {} }), /newer/);
  const blocked = E.resultsJSON(joint({ "fastener.D": 0 }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.results, null);
  assert.match(E.toMarkdown(joint({ "fastener.D": 0 })), /## Errors/);
});

test("user-supplied test vectors run through the same import path and join the self-test", () => {
  const vector = {
    kind: "edge-pitch-test-vector", schemaVersion: 1, name: "hand example",
    inputs: E.example(),
    expected: [
      { path: "strength.bearing.allowable", value: 5760, tol: 1e-9 },
      { path: "strength.shearOut.allowable", value: 5720, tol: 1e-9 },
      { path: "geometric.pD.actual", value: 5, tol: 1e-9 },
      { path: "strength.netSection.allowable", value: 99999 },
    ],
  };
  const got = E.parseImport(JSON.stringify(vector));
  assert.equal(got.kind, "edge-pitch-test-vector");
  const base = E.selfTests().length;
  const t = E.selfTests([got.vector]);
  assert.equal(t.length, base + 4);
  const mine = t.filter((q) => q.name.startsWith("hand example:"));
  assert.deepEqual(mine.map((q) => q.pass), [true, true, true, false]);
  assert.throws(() => E.parseImport({ kind: "edge-pitch-test-vector", inputs: {} }), /expected array/);
  const rejected = E.runVector({ name: "bad", inputs: { fastener: { D: -1 } }, expected: [{ path: "strength.bearing.allowable", value: 1 }] });
  assert.equal(rejected[0].pass, false);
  assert.match(rejected[0].detail, /inputs rejected/);
});

test("in-page self-test passes", () => {
  const t = E.selfTests();
  assert.ok(t.length >= 20);
  assert.deepEqual(t.filter((x) => !x.pass), []);
});

test("interior-row bearing at e/D = g/D enters the strength checks and can govern", () => {
  const x = joint({ "geometry.g": 7.5, "geometry.eSide": 20, "sheet.W": 136, "load.sigmaSheet": 10 });
  const r = E.solve(x);
  assert.equal(r.ok, true);
  const bi = byId(r.strength, "bearingInterior");
  const f = 600 + ((7.5 / 4.8 - 1.5) / 0.5) * 150;
  close(bi.allowable, f * 4.8 * 1.6, 1e-12, "interior bearing");
  close(bi.ms, (f * 4.8 * 1.6) / 1000 - 1, 1e-12, "interior bearing MS");
  assert.equal(r.governing.id, "bearingInterior");
  close(r.governing.ms, bi.ms, 1e-12, "governing MS");
  for (const h of r.holes.filter((q) => q.row === 1)) assert.equal(h.governing.id, "bearingInterior");
  assert.match(E.toMarkdown(x), /Governing strength mode: \*\*Bearing \(interior rows\)/);
  assert.equal(E.resultsJSON(x).results.governing.id, "bearingInterior");

  const low = E.solve(joint({ "geometry.g": 6.5 }));
  const out = byId(low.strength, "bearingInterior");
  assert.equal(out.allowable, null);
  assert.equal(out.ms, null);
  assert.equal(out.status, "outside tabulated range");
  assert.match(messages(low.warnings), /outside the tabulated range for interior-row bearing/);

  assert.equal(byId(E.solve(joint({ "geometry.rows": 1, "geometry.pattern": "single" })).strength, "bearingInterior"), undefined);
});

test("net section uses the spacing across the load and inter-rivet buckling the spacing along it", () => {
  const across = E.solve(E.example());
  const along = E.solve(joint({ "load.direction": "parallel" }));
  assert.equal(across.ok && along.ok, true);
  const { P } = E.example().load, { Dh } = E.example().fastener, t = 1.6, rows = 2, perRow = 5, p = 24, g = 19.2, eEnd = 9.6, W = 115.2;
  const johnson = (L) => 300 - (300 ** 2 * ((L * Math.sqrt(12)) / t) ** 2) / (4 * Math.PI ** 2 * 70000);

  // Across the rows: strip p across the load, buckling length g along it, σ = P/(W·t).
  close(byId(across.strength, "netSection").allowable, 400 * (p - Dh) * t, 1e-12, "net across");
  close(byId(across.strength, "netSection").applied, P / perRow, 1e-12, "strip across");
  close(byId(across.strength, "interRivet").slenderness, (g * Math.sqrt(12)) / t, 1e-12, "buckling length g");
  close(byId(across.strength, "interRivet").allowable, johnson(g), 1e-12, "σ_ir on g");
  close(across.derived.sigmaSheet, P / (W * t), 1e-12, "sheet stress on W");
  close(byId(across.strength, "maxPitch").applied, g, 1e-12, "maximum row spacing against g");
  assert.equal(byId(across.strength, "maxPitch").title, "Maximum row spacing");

  // Along the rows: strip g across the load, buckling length p along it, σ = P/((2·e_end + g)·t).
  close(byId(along.strength, "netSection").allowable, 400 * (g - Dh) * t, 1e-12, "net along");
  close(byId(along.strength, "netSection").applied, P / rows, 1e-12, "strip along");
  close(byId(along.strength, "interRivet").slenderness, (p * Math.sqrt(12)) / t, 1e-12, "buckling length p");
  close(byId(along.strength, "interRivet").allowable, johnson(p), 1e-12, "σ_ir on p");
  close(along.derived.sigmaSheet, P / ((2 * eEnd + g) * t), 1e-12, "sheet stress across the load");
  close(byId(along.strength, "interRivet").applied, P / ((2 * eEnd + g) * t), 1e-12, "applied σ along");
  close(byId(along.strength, "maxPitch").applied, p, 1e-12, "maximum pitch against p");
  assert.equal(byId(along.strength, "maxPitch").title, "Maximum pitch");

  close(across.governing.ms, johnson(g) / (P / (W * t)) - 1, 1e-12, "governing across");
  assert.equal(along.governing.id, "interRivet");
  close(along.governing.ms, johnson(p) / (P / ((2 * eEnd + g) * t)) - 1, 1e-12, "governing along");
  for (const id of ["bearing", "bearingInterior", "shearOut", "sideEdge"]) assert.equal(byId(along.strength, id).ms, byId(across.strength, id).ms, id);

  // Sweeping p moves net section across the rows and buckling along them.
  const flat = (list) => list.every((q) => Math.abs(q - list[0]) < 1e-12);
  const spA = E.sweepPitch(E.example(), 40), spL = E.sweepPitch(joint({ "load.direction": "parallel" }), 40);
  assert.ok(flat(spA.map((q) => q.interRivet)) && !flat(spA.map((q) => q.netSection)));
  assert.ok(flat(spL.map((q) => q.netSection)) && !flat(spL.map((q) => q.interRivet)));

  assert.match(E.toMarkdown(joint({ "load.direction": "parallel" })), /Load along the rows: net section uses g = 19\.2 mm across the load; inter-rivet buckling and maximum spacing use p = 24 mm along it/);
  assert.match(E.toMarkdown(E.example()), /Load across the rows: net section uses p = 24 mm across the load; inter-rivet buckling and maximum spacing use g = 19\.2 mm along it/);

  const one = E.solve(joint({ "load.direction": "parallel", "geometry.rows": 1, "geometry.pattern": "single" }));
  assert.equal(one.ok, false);
  assert.match(one.errors.find((e) => e.path === "load.direction").message, /at least two rows/);
});

test("staggered rows loaded along the rows account for the p/2 offset", () => {
  const Dh = 4.9;
  const zig = E.solve(joint({ "load.direction": "parallel", "geometry.pattern": "staggered", "sheet.W": 127.2 }));
  const n1 = byId(zig.strength, "netSection");
  // Two rows: one hole of two on a straight section; one diagonal over two strips.
  close(n1.straight, 19.2 - Dh / 2, 1e-12, "straight, rows = 2");
  close(n1.zigzag, (2 * 19.2 - 2 * Dh + 24 ** 2 / (16 * 19.2)) / 2, 1e-12, "zig-zag, rows = 2");
  close(n1.width, 15.2375, 1e-12, "zig-zag governs, rows = 2");
  // Three rows: two holes of three on a straight section; two diagonals over three strips.
  const three = byId(E.solve(joint({ "load.direction": "parallel", "geometry.pattern": "staggered", "geometry.rows": 3, "sheet.W": 127.2 })).strength, "netSection");
  close(three.straight, (3 * 19.2 - 2 * Dh) / 3, 1e-12, "straight, rows = 3");
  close(three.zigzag, (3 * 19.2 - 3 * Dh + 2 * 24 ** 2 / (16 * 19.2)) / 3, 1e-12, "zig-zag, rows = 3");
  close(three.width, three.zigzag, 1e-12, "zig-zag governs, rows = 3");
  const tight = byId(E.solve(joint({ "load.direction": "parallel", "geometry.pattern": "staggered", "geometry.rows": 3, "geometry.g": 8, "sheet.W": 127.2 })).strength, "netSection");
  close(tight.width, (3 * 8 - 2 * Dh) / 3, 1e-12, "straight governs, rows = 3");
  assert.match(tight.path, /^straight/);
});

test("one fastener along the load leaves inter-rivet buckling unevaluated with a warning", () => {
  for (const patch of [{ "geometry.rows": 1, "geometry.pattern": "single" }, { "load.direction": "parallel", "geometry.perRow": 1, "sheet.W": 19.2 }]) {
    const r = E.solve(joint(patch));
    assert.equal(r.ok, true, JSON.stringify(patch));
    for (const id of ["interRivet", "maxPitch"]) {
      assert.equal(byId(r.strength, id).allowable, null);
      assert.equal(byId(r.strength, id).ms, null);
      assert.equal(byId(r.strength, id).status, "one fastener along the load");
    }
    assert.match(messages(r.warnings), /Only one fastener along the load/);
    assert.notEqual(r.governing.id, "interRivet");
  }
});

test("holes are coloured by their own governing margin", () => {
  const r = E.solve(joint({ "geometry.eSide": 5, "sheet.W": 106 }));
  const edge = r.holes.filter((h) => h.index === 0 || h.index === 4);
  const inner = r.holes.filter((h) => h.index > 0 && h.index < 4);
  assert.equal(r.holes.length, 10);
  assert.ok(edge.every((h) => h.governing.id === "sideEdge"));
  assert.ok(inner.every((h) => h.governing.id !== "sideEdge"));
  const fail = E.solve(joint({ "load.P": 100000 }));
  assert.ok(fail.holes.every((h) => h.status === "fail"));
});

test("sweeps behind the plots agree with the solver at the operating point", () => {
  const x = E.example();
  const r = E.solve(x);
  const ed = E.sweepED(x, 40, 1, 3);
  const at2 = ed.find((p) => Math.abs(p.eD - 2) < 1e-9);
  close(at2.bearing, byId(r.strength, "bearing").ms, 1e-12, "bearing sweep");
  close(at2.shearOut, byId(r.strength, "shearOut").ms, 1e-12, "shear-out sweep");
  assert.ok(ed.filter((p) => p.eD < 1.5).every((p) => p.bearing === null));
  const sp = E.sweepPitch(x);
  assert.ok(sp[0].p > x.fastener.Dh);
  for (let i = 1; i < sp.length; i++) assert.ok(sp[i].interRivet <= sp[i - 1].interRivet + 1e-12);
  const ss = E.sweepSlenderness(x);
  assert.ok(ss.some((p) => p.branch === "euler") && ss.some((p) => p.branch === "johnson"));
});

test("raw.json matches the engine's disclaimer, assumptions and sources", () => {
  assert.equal(raw.disclaimer, E.DISCLAIMER);
  assert.deepEqual(raw.assumptions, E.ASSUMPTIONS);
  assert.deepEqual(raw.example.inputs, E.example());
  assert.deepEqual(raw.sources.map((s) => s.cite), E.SOURCES.map((s) => s.cite));
  assert.match(raw.sources[0].states.join(" "), /1\.5D/);
  // Niu is never cited by chapter or page.
  for (const s of [JSON.stringify(raw), JSON.stringify(E.FORMULAS), JSON.stringify(E.SOURCES)]) assert.doesNotMatch(s, /Niu[^"]{0,40}(chapter|ch\.|p\.|page|Fig|Table)\s*\d/i);
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
  const run = (api) => JSON.stringify([api.solve(api.example()), api.sweepED(api.example()), api.sweepPitch(api.example()), api.toMarkdown(api.example(), "US"), api.selfTests()]);
  const first = run(ctx.EdgePitch);
  assert.equal(run(ctx.EdgePitch), first);
  assert.equal(run(E), first);
});

test("built page is self-contained, carries the banner and registers its WebMCP tools", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+stylesheet|https?:\/\/cdn/);
  assert.match(html, /class="banner"/);
  assert.match(html, /prefers-color-scheme/);
  // The tools the page registers; the site's catalogue stub (data/visuals/edge-pitch.yaml in yujieteo/site) names the same set.
  const names = ["get_metadata", "get_current_joint", "solve_joint", "run_self_tests"];
  const inert = () => new Proxy(function () {}, {
    get: (t, k) => (k === "modelContext" ? undefined : k === Symbol.iterator ? [][Symbol.iterator] : k === Symbol.toPrimitive ? () => 0 : inert()),
    set: () => true, apply: () => inert(), construct: () => inert(),
  });
  const tools = [];
  const ctx = vm.createContext({
    document: inert(), addEventListener() {}, setTimeout() {},
    navigator: { modelContext: { registerTool: (t) => tools.push(t) } }, Blob: function () {}, URL: inert(),
  });
  ctx.self = ctx; ctx.window = ctx;
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
  assert.deepEqual(tools.map((t) => t.name), names);
  const call = async (name, input) => JSON.parse((await tools.find((t) => t.name === name).execute(input)).content[0].text);
  const solved = await call("solve_joint", { geometry: { eEnd: 8.4 } });
  close(byId(solved.strength, "bearing").allowable, 675 * 4.8 * 1.6, 1e-12, "solve_joint bearing");
  assert.match(solved.disclaimer, /Not for certification/);
  const bad = await call("solve_joint", { fastener: { Dh: 30 } });
  assert.match(messages(bad.errors), /smaller than the pitch/);
  const current = await call("get_current_joint", {});
  assert.equal(current.strength.length, 7);
  const tests = await call("run_self_tests", {});
  assert.equal(tests.passed, tests.total);
  const meta = await call("get_metadata", {});
  assert.match(meta.disclaimer, /Not for certification/);
  assert.equal(meta.test_vector_format.kind, "edge-pitch-test-vector");
});
