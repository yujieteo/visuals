import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const Q = createRequire(import.meta.url)("../src/engine.js");
const reference = JSON.parse(readFileSync(new URL("../reference/reference.json", import.meta.url), "utf8"));

test("vacuum polarization agrees with the independent Python reference", () => {
  for (const row of reference.vacuum_polarization) {
    const actual = Q.engine.vacuumPolarization({ Q2: row.Q2, mu: row.mu });
    for (const [value, expected] of [[actual.residue, row.a_minus1], [actual.finite.MS, row.a0],
      [actual.finite.MSbar, row.msbar], [Q.laurent.coef(actual.series, 1), row.a1]]) {
      assert.ok(Math.abs(value - expected) < 1e-11, `${value} vs ${expected}`);
    }
  }
});
