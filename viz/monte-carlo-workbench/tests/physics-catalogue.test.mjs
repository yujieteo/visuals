// Group 9's catalogue as data: each example of the statistical-physics lab with its parts and settings that the state
// can hold and that compile and run; each method with its 6 parts and examples that open runnable settings; the theory
// panels of the group with their linked examples; the statement on universality classes; and a glossary entry for each
// technical term of the group's reader text. Also the report of the lab, as the deck and the Markdown record use it.
import assert from "node:assert/strict";
import test from "node:test";
import { M, Ph, data } from "./helpers.mjs";

const lab = data.physics;
/** The state of an example with optional settings, as the page opens it. @param {any} x @param {Record<string, any>} [extra] */
const stateOf = (x, extra = {}) => ({ ...Object.fromEntries(Object.keys(M.FIELDS).filter((k) => k.startsWith("ph_")).map((k) => [k, M.FIELDS[k].default])), seed: 1, ph_example: x.id, ...x.settings, ...extra });
/** A state's job made small, so one block runs fast. @param {Record<string, any>} s */
function small(s) {
  /** @type {any} */
  const job = Ph.jobOf(s);
  if (job.kind === "sandpile") return { ...job, sizes: job.sizes.map((/** @type {number} */ L) => Math.min(L, 16)), drives: 256 };
  if (job.kind === "metastability") return { ...job, reps: 16, steps: 2 ** 16 };
  return { ...job, steps: Math.min(job.steps ?? 0, 4096), sweeps: Math.min(job.sweeps ?? 0, 256), reps: Math.min(job.reps, 16) };
}
/** @param {Record<string, any>} s */
function runsOneBlock(s) {
  for (const [k, v] of Object.entries(s)) {
    const F = /** @type {any} */ (M.FIELDS[k]);
    assert.ok(F, `${k} is a state field`);
    if (F.values) assert.ok(F.values.includes(v), `${k} = ${v}`);
    else assert.ok(v >= F.min && v <= F.max, `${k} = ${v} in [${F.min}, ${F.max}]`);
  }
  const c = Ph.prepare(small(s), { seed: 1 });
  assert.ok(c.ok, c.errors?.join(" "));
  assert.equal(Ph.block(c, 0).error, "");
  return c;
}

test("each example has its parts, a family, settings the state can hold, and a job that compiles and runs a block", () => {
  assert.deepEqual(lab.examples.map((/** @type {any} */ x) => x.id), M.PHYS_IDS, "the state's example ids are the catalogue's");
  for (const x of lab.examples) {
    assert.equal(x.kind, "experiment");
    assert.equal(Ph.FAMILY[x.id], x.family, `${x.id}: family`);
    assert.ok(x.title.length > 20 && x.problem.length > 80 && x.observe.length > 150, `${x.id}: title, problem and what to observe`);
    for (const k of ["assumptions", "diagnostics", "interpretation"]) assert.ok(x[k].length > 80, `${x.id}: ${k}`);
    assert.match(x.interpretation, /Reject/, `${x.id}: rejection conditions`);
    assert.ok(M.FIELDS.ph_plot.values?.includes(x.settings.ph_plot), `${x.id}: a figure`);
    runsOneBlock(stateOf(x));
  }
});

test("the sandpile examples state their dynamics, boundary rule, drive and dissipation", () => {
  for (const x of lab.examples.filter((/** @type {any} */ e) => e.family === "sandpile")) {
    const lines = Ph.dynamics(Ph.jobOf(stateOf(x))).join(" ");
    for (const word of ["topples", "boundary", "drive", "dissipation", "time step"]) assert.match(lines, new RegExp(word, "i"), `${x.id}: ${word}`);
  }
  const closed = Ph.dynamics({ rule: "manna", boundary: "closed", drive: "centre", grains: 4, eps: 0.1 }).join(" ");
  assert.match(closed, /Manna rule.*Closed boundary.*4 grains at the central site.*probability ε = 0.1/s);
});

test("each method has its estimator, assumptions, settings, suitable example, failure example and comparison, each runnable", () => {
  assert.deepEqual(lab.methods.map((/** @type {any} */ m) => m.id), ["annealing", "tempering", "sandpile", "coarse", "fss"]);
  assert.deepEqual([...new Set(lab.methods.map((/** @type {any} */ m) => m.family))], ["Optimisation", "Critical systems"]);
  for (const m of lab.methods) {
    assert.ok(m.estimator.length > 20 && m.estimatorText.length > 80, `${m.id}: estimator`);
    assert.ok(m.assumptions.length >= 3 && m.settings.length >= 3, `${m.id}: assumptions and settings`);
    assert.ok(m.comparison.with !== m.id && lab.methods.some((/** @type {any} */ y) => y.id === m.comparison.with), `${m.id}: compared with another method`);
    for (const part of ["suitable", "failure", "comparison"]) {
      const p = m[part], x = lab.examples.find((/** @type {any} */ e) => e.id === p.example);
      assert.ok(x && p.text.length > 60, `${m.id}: the ${part} example exists`);
      runsOneBlock(stateOf(x, p.settings));
    }
  }
});

test("the theory panels of group 9 have their 6 parts and open lab examples", () => {
  const mine = data.theory.filter((/** @type {any} */ t) => t.experiment.physics);
  assert.deepEqual(mine.map((/** @type {any} */ t) => t.id), ["metastability", "annealing", "scaling", "soc"]);
  for (const t of mine) {
    for (const k of ["title", "statement", "proof", "reference", "counterexample"]) assert.ok(t[k].length > 40, `${t.id}: ${k}`);
    assert.ok(t.assumptions.length >= 3 && t.counterexample.length > 150, `${t.id}: assumptions and a counterexample`);
    const x = lab.examples.find((/** @type {any} */ e) => e.id === t.experiment.physics);
    assert.ok(x, `${t.id} → ${t.experiment.physics}`);
    runsOneBlock(stateOf(x, t.experiment.settings));
  }
  assert.match(data.theory.find((/** @type {any} */ t) => t.id === "soc").counterexample, /interpretation, not a general theorem/);
});

test("the page states that a finite lattice does not establish a universality class, in the lab and in its report", () => {
  assert.match(lab.statement, /^A finite lattice does not establish a universality class\./);
  const x = lab.examples.find((/** @type {any} */ e) => e.id === "finite-size");
  assert.match(x.interpretation, /No finite lattice can establish one/);
  /** @type {any} */
  const rep = Ph.report({ example: x, state: stateOf(x), summary: null, status: "idle", errors: [] });
  assert.equal(rep.meta.voice, "bf_emma");
  assert.equal(rep.checks[0].key, "A finite lattice does not establish a universality class.");
  for (const part of ["setup", "method", "results", "checks"]) assert.ok(rep[part].length >= 1 && rep[part].every((/** @type {any} */ f) => f.title && f.narration), part);
});

test("the coarse settings of the lab: the published limits hold and the fields bound every input", () => {
  const lim = data.limits.physics;
  assert.ok(lim && lim.how.length > 60, "the limits are measured and say how");
  assert.ok(Number(M.FIELDS.ph_lmax.values?.at(-1)) <= lim.maxL && /** @type {number} */ (M.FIELDS.ph_l.max) <= lim.maxL, "the largest lattice is published");
});

test("every technical term of the group's reader text has a glossary entry", () => {
  const glossary = new Set(data.glossary.map((/** @type {any} */ g) => g.term));
  for (const term of ["energy landscape", "metastable state", "stability level", "exit time", "Arrhenius law", "Boltzmann law", "simulated annealing", "cooling schedule", "Hajek's depth", "parallel tempering",
    "swap move", "round trip", "minimax route", "sandpile", "toppling", "avalanche", "BTW rule", "Manna rule", "slow drive", "bulk dissipation", "recurrent configuration", "burning test", "toppling matrix",
    "abelian property", "finite-size scaling", "data collapse", "moment analysis", "multiscaling", "cutoff", "coarse-graining", "box counting", "universality class", "self-organised criticality", "critical point",
    "Metropolis–Hastings", "tempering", "detailed balance", "stationary law"]) assert.ok(glossary.has(term), `the glossary defines ${term}`);
  assert.equal(glossary.size, data.glossary.length, "no term is defined twice");
});
