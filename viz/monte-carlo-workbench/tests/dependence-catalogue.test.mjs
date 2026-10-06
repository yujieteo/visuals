// The catalogue of group 5 as data: each copula and process entry agrees with its code (the same arguments), states
// its formula, its sampling methods, and either its dependence (Kendall's tau, tail coefficients, domain) or its five
// conditions (stationarity, stability, explosion, boundary, discretisation); every model of the group has at least one
// quantity with a reference value; every process model states its initial conditions and dynamics; every copula
// workflow takes its margins through u; and the multilevel examples are ready for the multilevel panel.
import assert from "node:assert/strict";
import test from "node:test";
import { En, M, Ml, data, recordOf } from "./helpers.mjs";

const mine = data.laws.filter((/** @type {any} */ l) => ["copula", "process", "conditional"].includes(l.type));

test("each copula and process entry agrees with its code and states its formula, methods, dependence or conditions", () => {
  assert.equal(mine.length, 15);
  for (const l of mine) {
    assert.ok(l.formula?.length > 10 && l.methods.length >= 2, `${l.id}: formula and methods`);
    if (l.type === "conditional") continue;
    const code = En.DEP[l.id];
    assert.ok(code, `${l.id} has code`);
    assert.deepEqual(code.params.map((/** @type {any} */ p) => p.name).filter((/** @type {string} */ n) => n !== "coarsen").sort(), l.params.map((/** @type {any} */ p) => p.name).sort(), `${l.id}: the same arguments`);
    if (l.type === "copula") for (const k of ["tau", "tails", "domain"]) assert.ok(l.dependence[k].length > 10, `${l.id}: dependence.${k}`);
    else for (const k of ["stationarity", "stability", "explosion", "boundary", "discretisation"]) assert.ok(l.conditions[k].length > 30, `${l.id}: conditions.${k}`);
  }
});

test("every model of group 5 has a quantity with a reference value, and the process models state their initial conditions and dynamics", () => {
  const models = data.models.filter((/** @type {any} */ m) => mine.some((/** @type {any} */ l) => l.id === m.law));
  assert.equal(models.length, 60);
  for (const m of models) {
    const rec = recordOf(m.id), c = En.prepare(rec, { seed: 1, method: m.settings?.method ?? "independent", overrides: {} });
    assert.ok(c.ok, `${m.id}: ${c.errors?.join(" ")}`);
    const refs = En.reference(c, En.momentStatus(c));
    assert.ok(refs.some((/** @type {any} */ r) => r.values.some((/** @type {number | null} */ v) => v !== null)), `${m.id} has a reference value`);
    const law = mine.find((/** @type {any} */ l) => l.id === m.law);
    if (law.type === "process") assert.ok(rec.initial !== "none" && rec.dynamics !== "none" && rec.initial && rec.dynamics, `${m.id}: initial and dynamics`);
    if (law.type === "copula" && m.kind === "workflow") assert.ok(rec.variables.some((/** @type {any} */ v) => v.args.u), `${m.id}: margins through u`);
    for (const k of Object.keys(m.settings ?? {})) assert.notEqual(M.FIELDS[k], undefined, `${m.id}: ${k} is a state field`);
  }
  for (const id of ["gbm-option-mlmc", "brownian-alarm-mlmc"]) assert.ok(Ml.ready(recordOf(id)), `${id} is ready for the multilevel panel`);
});
