// {{title}}: the model's own fixtures (§36) and invariants (§37). This file is the visual's own: replace the
// starter oscillator's cases with the domain's known cases, computed independently of the page.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Model = require("../src/model.js");
const D = require("../raw.json");
const VisualKit = require("../../../scripts/kit/kit.js");
const at = (/** @type {Record<string, unknown>} */ patch) => Model.derive(VisualKit.normalize(Model.FIELDS, patch).state, D);

test("known cases: with no damping one cycle keeps the whole amplitude, and the motion never falls below 10%", () => {
  const d = at({ amplitude: 2, damping: 0 });
  assert.equal(d.afterOneCycle, 2);
  assert.equal(d.tenPercent, null);
  assert.equal(d.text.tenPercent, "never");
});

test("known cases: damping ratio 0.5 keeps e^(-pi) of the amplitude per cycle", () => {
  const d = at({ amplitude: 1, damping: 0.5 });
  assert.ok(Math.abs(d.decayPerCycle - Math.exp(-Math.PI)) < 1e-12);
  assert.ok(Math.abs(Number(d.tenPercent) - 2 * Math.log(10)) < 1e-12);
});

test("invariants: the curve stays inside its envelope, and changing the envelope toggle changes no number", () => {
  for (const example of Model.EXAMPLES) {
    const d = at(example.state);
    d.curve.forEach((/** @type {[number, number]} */ [t, x], /** @type {number} */ i) => {
      assert.equal(t, d.envelope[i][0]);
      assert.ok(Math.abs(x) <= d.envelope[i][1] + 1e-12, `${example.id} at t = ${t}`);
    });
    assert.deepEqual(at({ ...example.state, envelope: false }), d, `${example.id}: the envelope toggle changes no derived value`);
  }
});
