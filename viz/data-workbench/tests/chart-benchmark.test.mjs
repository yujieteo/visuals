import assert from "node:assert/strict";
import test from "node:test";
import { chartTiming } from "./chart-benchmark.mjs";

for (const [elapsed, target] of [[119999, "met"], [120000, "exceeded"], [120610, "exceeded"], [122660, "exceeded"]]) {
  test(`chart benchmark reports ${elapsed} ms without a shared-runner timing failure`, () => {
    const report = chartTiming(9640, elapsed);
    assert.equal(report, `first figure 9.64 s after the import began, every candidate after ${(elapsed / 1000).toFixed(2)} s; 2-minute target ${target} (timing is informational on shared runners)`);
    console.log(`simulated timing: ${report}`);
  });
}

test("chart benchmark still rejects missing, non-finite or out-of-order measurements", () => {
  for (const first of [null, NaN, Infinity, -1]) assert.throws(() => chartTiming(first, 120610), /a first valid figure was measured/);
  for (const done of [NaN, Infinity, -1, 9639]) assert.throws(() => chartTiming(9640, done), /all candidates finished after the first figure/);
});
