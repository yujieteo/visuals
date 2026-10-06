// Scientific Modelling: the release gate of piece 9 (spec sections 10, 11 and 14). Every one of the 26 families of
// the build plan has a complete declaration whose standard example matches its declared dimensionless form and passes
// every acceptance check; the 23 heat-transfer examples of section 10 each run; and for every standard example the
// page's results, the Markdown record and the beamdswitch deck come from one model version with the same statuses.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assertStandardDeck } from "../../../scripts/kit/checks.mjs";

const require = createRequire(import.meta.url);
const R = require("../src/record.js");
const D = require("../src/declare.js");
const Model = require("../src/model.js");
const Report = require("../src/report.js");
const VisualKit = require("../../../scripts/kit/kit.js");
const Beamdswitch = require("../../../scripts/templates/beamdswitch.js");
const DATA = require("../raw.json");
const ENGINE = Model.engineData(DATA);

const state = (example) => VisualKit.normalize(Model.FIELDS, { example, tool: "regime" }).state;
const cache = new Map();
/** The page's derived data of an example's confirmed record, once per example. */
function derived(example) {
  if (!cache.has(example)) cache.set(example, Model.derive(state(example), DATA, R.confirm(R.fromExample(ENGINE, example))));
  return cache.get(example);
}

test("the build plan is complete: piece 9 is current, and all 26 families are built", () => {
  assert.equal(DATA.roadmap.current, 9);
  assert.equal(DATA.roadmap.families.length, 26);
  assert.ok(DATA.roadmap.families.every((f) => f.piece <= DATA.roadmap.current));
});

test("every family has a complete declaration whose standard example matches it exactly and passes every acceptance check", () => {
  const decls = D.declarations(DATA);
  for (const fam of DATA.roadmap.families) {
    const mine = decls.filter((d) => d.family === fam.id);
    assert.ok(mine.length >= 1, `${fam.name}: a declaration`);
    for (const decl of mine) {
      assert.deepEqual(D.problemsOf(decl), [], decl.id);
      const rg = derived(decl.acceptance.example).regime;
      assert.ok(rg.ready, `${decl.id}: ${rg.message ?? ""} ${(rg.problems ?? []).join(" ")}`);
      assert.equal(rg.declaration.id, decl.id);
      assert.ok(rg.acceptance.length >= 2, `${decl.id}: acceptance checks`);
      const failed = rg.acceptance.filter((a) => !a.passed);
      assert.deepEqual(failed.map((a) => a.title), [], `${decl.id}: failed acceptance checks`);
    }
  }
  // Section 10: all four analysis methods across the catalogue.
  for (const m of D.METHODS) assert.ok(decls.some((d) => d.methods[m.id].applies), m.id);
});

test("the 23 heat-transfer examples of section 10 each run with their declared model", () => {
  const ht = DATA.roadmap.heatExamples;
  assert.equal(ht.length, 23);
  assert.equal(new Set(ht.map((x) => x.example)).size, 23);
  for (const { name, example } of ht) {
    assert.ok(Model.EXAMPLES.some((e) => e.id === example), `${name}: the example ${example}`);
    const rg = derived(example).regime;
    assert.ok(rg.ready && rg.acceptance.every((a) => a.passed), `${name} (${example}): ${rg.message ?? ""}`);
  }
});

test("view, report and deck agree for every standard example: one model version, the same results and statuses", () => {
  const standard = DATA.examples.examples.filter((e) => e.group === "standard").map((e) => e.id);
  assert.ok(standard.length >= 46);
  for (const ex of standard) {
    const d = derived(ex);
    const report = Report.report(state(ex), d, DATA);
    const md = VisualKit.markdown(report);
    const deck = Beamdswitch.deck(report);
    assertStandardDeck(deck, ex);
    assert.ok(md.includes(`model version ${d.version}`) || md.includes(`version ${d.version}`), `${ex}: the model version`);
    for (const r of d.results) {
      const line = Report.resultLine(r);
      assert.ok(md.includes(line) && deck.includes(line), `${ex}: ${r.id}`);
    }
  }
});
