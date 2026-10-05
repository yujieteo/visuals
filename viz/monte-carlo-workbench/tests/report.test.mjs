// The report of a view with a run: the deck opens in beamdswitch as the standard template, every slide is narrated
// as speech, the results frame holds each estimate with its interval, reference and claim tag, and a partial run
// says that it is partial.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assertStandardDeck } from "../../../scripts/kit/checks.mjs";
import { M, Rep, data, recordOf, runModel } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const Beamdswitch = require("../../../scripts/templates/beamdswitch.js");
const VisualKit = require("../../../scripts/kit/kit.js");

/** @param {string} model @param {number} blocks @param {string} status */
function reportOf(model, blocks, status) {
  const state = { ...VisualKit.defaults(M.FIELDS), ...M.exampleState(data.models.find((/** @type {any} */ m) => m.id === model)) };
  const d = M.derive(state, data), r = runModel(recordOf(model), { seed: state.seed }, blocks);
  return { r, report: Rep.report(state, d, data, { status, n: r.acc.n, summary: r.summary }) };
}

test("a workflow with a complete run: a standard deck, its results table and its decision", () => {
  const { r, report } = reportOf("binomial-overbooking", 8, "done");
  const md = Beamdswitch.deck(report);
  assertStandardDeck(md, "overbooking");
  const record = VisualKit.markdown(report);
  assert.match(record, /\| Sell 186 \| any_bumped \| /);
  assert.match(record, /finite-run observation/);
  assert.match(record, /Sell 186 is the best admissible alternative/);
  assert.match(record, new RegExp(`Results after ${r.acc.n} replicates \\(done\\)`));
});

test("a partial run says so in the narration", () => {
  const { report } = reportOf("exp-zipf", 2, "paused");
  assertStandardDeck(Beamdswitch.deck(report), "zipf");
  assert.match(report.results[0].narration, /not complete/);
  assert.match(VisualKit.markdown(report), /no interval|not available/);
});

test("a model with errors still gives a standard deck that names the errors", () => {
  const state = { ...VisualKit.defaults(M.FIELDS), model: "exp-poisson", params: "l1=-2" };
  const d = M.derive(state, data);
  assert.equal(d.ok, false);
  const report = Rep.report(state, d, data, null);
  assertStandardDeck(Beamdswitch.deck(report), "errors");
  assert.match(VisualKit.markdown(report), /lambda = -2 is outside/);
});
