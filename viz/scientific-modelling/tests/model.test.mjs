// Scientific Modelling: the shared model record (versions, previous version, confirmation, invalidation, import),
// the checks before analysis on each failure example with its next action, the six statuses, and the agreement of
// the page's derived data, the Markdown report and the beamdswitch deck rendered from one model version.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assertStandardDeck } from "../../../scripts/kit/checks.mjs";

const require = createRequire(import.meta.url);
const R = require("../src/record.js");
const C = require("../src/check.js");
const Model = require("../src/model.js");
const Report = require("../src/report.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const Beamdswitch = require("../../../scripts/templates/beamdswitch.js");
const DATA = require("../raw.json");
const ENGINE = Model.engineData(DATA);
const state = (example, patch = {}) => VisualKit.normalize(Model.FIELDS, { example, ...patch }).state;
const issues = (example) => C.interpret(R.inputs(R.fromExample(ENGINE, example)), ENGINE).issues;

test("the record holds the ten items of section 2 with stable ids, and every edit is a new version that keeps the previous one", () => {
  const rec = R.fromExample(ENGINE, "straight-fin");
  assert.deepEqual(R.ITEMS, ["Purpose", "Variables", "Equations", "Geometry", "Conditions", "Assumptions", "Scales", "Analyses", "Evidence", "History"]);
  for (const key of ["purpose", "variables", "equations", "geometry", "conditions", "assumptions", "scales", "evidence", "history"]) assert.ok(key in rec, key);
  const ids = [...rec.variables, ...rec.equations, ...rec.conditions, ...rec.assumptions].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  const v2 = R.edit(rec, (inp) => { inp.variables.find((v) => v.id === "v-h").value = "30"; }, "Changed h.");
  assert.equal(v2.version, 2);
  assert.equal(v2.previous.version, 1);
  assert.equal(v2.previous.inputs.variables.find((v) => v.id === "v-h").value, "25", "the previous version stays for comparison");
  assert.deepEqual(v2.history.at(-1), { version: 2, change: "Changed h.", changed: ["v-h"] });
  assert.equal(R.edit(v2, () => {}, "nothing"), v2, "an edit that changes nothing makes no version");
  assert.deepEqual(R.diff(v2.previous.inputs, R.inputs(v2)).changed, ["v-h"]);
});

test("invalidation: after confirmation, an edit invalidates exactly the results that read the changed input", () => {
  const rec = R.confirm(R.fromExample(ENGINE, "straight-fin"));
  const base = Model.derive(state("straight-fin"), DATA, rec);
  assert.ok(base.confirmed && base.results.every((r) => r.valid));
  // T_inf is not in the Pi set: the Finder's results stay valid; the definition check reads it and runs on the current version.
  const edited = R.edit(rec, (inp) => { inp.variables.find((v) => v.id === "v-Tinf").value = "25"; }, "Changed T_inf.");
  const d = Model.derive(state("straight-fin"), DATA, edited);
  assert.equal(d.confirmed, false);
  assert.equal(d.confirmedVersion, 1);
  assert.ok(d.results.filter((r) => r.kind === "group").every((r) => r.valid), "the groups do not read T_inf");
  assert.match(d.results.find((r) => r.id === "r-def-e-dT").title, /do not satisfy/, "the current version's definition check sees the new value");
  // h is in the Pi set: every Finder result that reads it is invalidated until the researcher confirms again.
  const edited2 = R.edit(rec, (inp) => { inp.variables.find((v) => v.id === "v-h").unit = "W/(m^2*K)"; inp.variables.find((v) => v.id === "v-h").value = "40"; }, "Changed h.");
  const d2 = Model.derive(state("straight-fin"), DATA, edited2);
  const stale = d2.results.filter((r) => !r.valid);
  assert.ok(stale.some((r) => r.id === "r-rank") && stale.every((r) => r.invalidatedBy.includes("v-h")));
  const again = Model.derive(state("straight-fin"), DATA, R.confirm(edited2));
  assert.ok(again.results.every((r) => r.valid), "confirming the new version runs the Finder on it");
  assert.equal(again.finder.groups.find((g) => g.label === "hL/k").value.lo, "1/100");
});

test("invalidation: a new Pi variable, a variable that joins the Pi set and a new relation between Pi variables invalidate the Finder", () => {
  const rec = R.confirm(R.fromExample(ENGINE, "heat-transfer-pi"));
  const finder = ["r-rank", "r-group-g1", "r-basis", "r-relation"];
  const staleAfter = (r, mutate) => Model.derive(state("heat-transfer-pi"), DATA, R.edit(r, mutate, "Edited.")).results.filter((x) => !x.valid).map((x) => x.id);
  const gravity = (pi) => (inp) => { inp.variables.push(R.variable({ id: "v-g", symbol: "g", meaning: "Gravity", quantity: "acceleration", unit: "m/s^2", pi })); };
  assert.deepEqual(finder.filter((x) => !staleAfter(rec, gravity(true)).includes(x)), [], "a new Pi variable");
  assert.deepEqual(finder.filter((x) => staleAfter(rec, gravity(false)).includes(x)), [], "a new variable outside the Pi set");
  assert.deepEqual(finder.filter((x) => !staleAfter(rec, (inp) => { inp.equations.push({ id: "e-x", kind: "constraint", text: "U = mu/(rho*L)" }); }).includes(x)), [], "a new relation between Pi variables");
  const g = R.confirm(R.edit(rec, gravity(false), "Added g."));
  assert.deepEqual(finder.filter((x) => !staleAfter(g, (inp) => { inp.variables.find((v) => v.id === "v-g").pi = true; }).includes(x)), [], "a variable that joins the Pi set");
});

test("confirmation gates the analysis: before it, only the checks before analysis run; the six statuses are separate", () => {
  const d = Model.derive(state("heat-transfer-pi"), DATA);
  assert.equal(d.finder, null);
  assert.deepEqual(d.results.map((r) => [r.id, r.status]), [["r-interpretation", "proposed"]]);
  const c = Model.derive(state("straight-fin"), DATA, R.confirm(R.fromExample(ENGINE, "straight-fin")));
  assert.deepEqual(Object.keys(R.STATUS), ["proposed", "confirmed", "exact", "numerical", "evidence", "unresolved"]);
  const seen = new Set(c.results.map((r) => r.status));
  for (const k of ["proposed", "confirmed", "exact", "numerical", "evidence"]) assert.ok(seen.has(k), `the fin shows a ${k} result`);
  assert.ok(Model.derive(state("fail-unsupported"), DATA, R.confirm(R.fromExample(ENGINE, "fail-unsupported"))).results.some((r) => r.status === "unresolved"));
  const name = c.results.find((r) => r.kind === "name");
  const confirmed = R.confirmInterpretation(R.confirm(R.fromExample(ENGINE, "straight-fin")), name.key, name.name, true);
  assert.equal(Model.derive(state("straight-fin"), DATA, confirmed).results.find((r) => r.id === name.id).status, "confirmed", "a recognized name becomes researcher-confirmed only on the researcher's choice");
});

test("failure examples: each failed check names the next useful action, and calculations that do not read the failed input still run", () => {
  const dim = issues("fail-dimensions").find((i) => i.code === "dimension-mismatch");
  assert.deepEqual(dim.terms.map((t) => [t.text, t.dim]), [["rho*c_p*d(T,t)", "M L^-1 T^-3"], ["k*d(T,x)", "M T^-3"]]);
  assert.match(dim.next, /order of each derivative/);
  assert.ok(dim.blocks.includes("nondimensionalize") && !dim.blocks.includes("pi-groups"));
  const missing = issues("fail-conditions").filter((i) => i.code === "missing-conditions");
  assert.deepEqual(missing.map((i) => i.subject.join(",")).sort(), ["T,t", "T,x"]);
  assert.ok(missing.every((i) => i.next.startsWith("Add")));
  const entry = issues("fail-entry");
  assert.ok(entry.some((i) => i.code === "undefined-symbol" && /h_c/.test(i.message) && /correct the name/.test(i.next)));
  assert.ok(entry.some((i) => i.code === "unit-conflict" && /M L T⁻² Θ⁻¹/.test(i.message)));
  assert.ok(entry.some((i) => i.code === "incomplete-closure" && /Fourier's law/.test(i.next)));
  const unsupported = issues("fail-unsupported").find((i) => i.code === "unsupported-analysis");
  assert.match(unsupported.message, /custom PDE is outside the supported set/);
  assert.match(unsupported.next, /finite ODE system/);
  for (const ex of ["fail-dimensions", "fail-conditions", "fail-unsupported", "fail-zero-scale", "fail-dependent"]) {
    const d = Model.derive(state(ex), DATA, R.confirm(R.fromExample(ENGINE, ex)));
    assert.ok(d.finder.ready, `${ex}: the Finder still runs`);
  }
  const blocked = Model.derive(state("fail-entry"), DATA, R.confirm(R.fromExample(ENGINE, "fail-entry")));
  assert.equal(blocked.finder.ready, false, "a unit conflict of a Pi variable blocks the Finder");
  assert.match(blocked.results.find((r) => r.id === "r-calc-pi-groups").next, /Correct the unit/);
});

test("absolute temperatures: °C values convert to K, definitions check exactly, and groups with absolute temperatures say so", () => {
  const it = C.interpret(R.inputs(R.fromExample(ENGINE, "straight-fin")), ENGINE);
  assert.equal(it.variables.find((v) => v.symbol === "T_b").value.text, "353.15");
  assert.deepEqual(it.definitionChecks.map((c) => [c.id, c.ok]), [["e-dT", true]], "ΔT = T_b − T_∞ holds exactly: 60 K = 353.15 K − 293.15 K");
  const conflict = C.interpret({ ...R.inputs(R.fromExample(ENGINE, "straight-fin")), variables: R.fromExample(ENGINE, "straight-fin").variables.map((v) => (v.id === "v-dT" ? { ...v, unit: "degC" } : v)) }, ENGINE);
  assert.ok(conflict.issues.some((i) => i.code === "unit-conflict" && /delta_degC/.test(i.next)), "a lone °C cannot be a temperature difference");
  const f = Model.derive(state("fail-unsupported"), DATA, R.confirm(R.fromExample(ENGINE, "fail-unsupported"))).finder;
  assert.deepEqual(f.groups.find((g) => g.label === "T_max/T_w").absolute, ["T_max", "T_w"]);
});

test("import: a model JSON round trip keeps the inputs, and a wrong file is refused with its reasons", () => {
  const rec = R.edit(R.fromExample(ENGINE, "transient-slab"), (inp) => { inp.title = "My slab"; }, "Renamed.");
  const back = R.validate(JSON.parse(JSON.stringify(rec)));
  assert.deepEqual(back.errors, []);
  assert.deepEqual(R.inputs(back.record), R.inputs(rec));
  assert.equal(back.record.confirmed, null, "an imported record needs a new confirmation");
  assert.match(R.validate({ schema: "other" }).errors[0], /not a model record/);
  assert.match(R.validate({ ...rec, schemaVersion: 2 }).errors[0], /schema version 2/);
  const dup = R.validate({ ...rec, variables: [...rec.variables, { ...rec.variables[0] }] });
  assert.ok(dup.errors.some((e) => /occurs twice/.test(e)));
  const bad = R.validate({ ...rec, variables: rec.variables.map((v, i) => (i ? v : { ...v, kind: "magic" })) });
  assert.ok(bad.errors.some((e) => /kind "magic"/.test(e)));
});

test("agreement: the page's derived data, the Markdown report and the deck of one version show the same values, definitions and statuses", () => {
  for (const ex of Model.EXAMPLES.map((e) => e.id)) {
    const s = state(ex);
    const d = Model.derive(s, DATA, R.confirm(R.fromExample(ENGINE, ex)));
    const report = Report.report(s, d, DATA);
    const md = VisualKit.markdown(report);
    const deck = Beamdswitch.deck(report);
    assertStandardDeck(deck, ex);
    for (const r of d.results) {
      const line = Report.resultLine(r);
      assert.ok(md.includes(line) && deck.includes(line), `${ex}: result ${r.id} with its status appears in both outputs`);
    }
    if (d.finder.ready) {
      for (const g of d.finder.groups) assert.ok(md.includes(g.tex) && deck.includes(g.tex), `${ex}: group ${g.label}`);
      for (const step of d.finder.rref.steps) assert.ok(md.includes(step.matrixTex), `${ex}: row step ${step.n} is in the report, not cut short`);
      for (const q of d.finder.exponentEquations) for (const l of q.lines) assert.ok(md.includes(`$${l.text}$`), `${ex}: exponent equation ${l.text}`);
      for (const v of d.interp.variables.filter((x) => x.value)) assert.ok(md.includes(v.value), `${ex}: the value of ${v.symbol}`);
      for (const item of ["Hand calculation 1", "Hand calculation 2", "Hand calculation 3", "Hand calculation 4", "Hand calculation 5"]) assert.ok(md.includes(item), `${ex}: ${item}`);
    }
    assert.match(deck, /^voice: bf_emma$/m);
  }
});

test("the URL state: the tool, the basis and the detail level change the view, never the model", () => {
  const rec = R.confirm(R.fromExample(ENGINE, "heat-transfer-pi"));
  const a = Model.derive(state("heat-transfer-pi"), DATA, rec);
  const b = Model.derive(state("heat-transfer-pi", { basis: "kernel", detail: "full", tool: "nondim", step: 3 }), DATA, rec);
  assert.deepEqual(b.results, a.results);
  assert.deepEqual(b.basisGroups.map((g) => g.label), ["μc_p/k", "kρU/(hμ)", "hL/k"]);
  assert.equal(b.shownStep, 3);
  assert.equal(Model.derive(state("heat-transfer-pi", { step: 60 }), DATA, rec).shownStep, a.finder.rref.steps.length, "the step clamps to the last one");
});

test("a variable's own TeX is limited to letters, accents and fonts: a link or a package load falls back to the default form", () => {
  const rec = R.fromExample(ENGINE, "heat-transfer-pi");
  const inp = R.inputs(rec);
  inp.variables.find((v) => v.id === "v-h").tex = "\\href{javascript:alert(1)}{h}";
  inp.variables.find((v) => v.id === "v-k").tex = "k_{\\mathrm{f}}";
  const it = C.interpret(inp, ENGINE);
  assert.equal(it.variables.find((v) => v.id === "v-h").tex, "h");
  assert.ok(it.issues.some((i) => i.code === "tex-refused" && i.subject[0] === "v-h"));
  assert.equal(it.variables.find((v) => v.id === "v-k").tex, "k_{\\mathrm{f}}", "an allowed font command stays");
});
