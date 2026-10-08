import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const Q = createRequire(import.meta.url)("../src/engine.js");

test("the laboratory's engine self-tests pass", () => {
  const results = Q.engine.selfTests();
  assert.ok(results.length > 0);
  assert.deepEqual(results.filter((result) => !result.pass), []);
});

test("the vacuum-polarization pipeline agrees with its Birkhoff factors", () => {
  for (const mu of [0.5, 1, 2]) {
    const view = Q.engine.vacuumPolarization({ mu });
    assert.equal(view.birkhoff.agreesWithMS, true);
    assert.ok(Number.isFinite(view.finite.MSbar));
  }
});
