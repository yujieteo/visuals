// The reference-device target is not a wall-clock gate on a shared CI runner.
// Keep both elapsed times and the target result visible; missing or invalid measurements still fail.
import assert from "node:assert/strict";

/** @param {number | null} firstMs @param {number} allMs */
export function chartTiming(firstMs, allMs) {
  assert.ok(firstMs !== null && Number.isFinite(firstMs) && firstMs >= 0, "a first valid figure was measured");
  assert.ok(Number.isFinite(allMs) && allMs >= firstMs, "all candidates finished after the first figure");
  const s = (/** @type {number} */ ms) => (ms / 1000).toFixed(2);
  return `first figure ${s(firstMs)} s after the import began, every candidate after ${s(allMs)} s; 2-minute target ${allMs < 120000 ? "met" : "exceeded"} (timing is informational on shared runners)`;
}
