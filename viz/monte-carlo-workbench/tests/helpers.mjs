// Shared helpers of the workbench's tests: the page's modules loaded as the page loads them (plain scripts through
// require), and a synchronous run of a model to n replicates with the engine.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** @type {typeof import("../src/rng.js")} */
export const Rng = require("../src/rng.js");
/** @type {typeof import("../src/special.js")} */
export const S = require("../src/special.js");
/** @type {typeof import("../src/expr.js")} */
export const X = require("../src/expr.js");
/** @type {typeof import("../src/continuous.js")} */
export const C = require("../src/continuous.js");
/** @type {typeof import("../src/laws.js")} */
export const L = require("../src/laws.js");
/** @type {typeof import("../src/custom.js")} */
export const Cu = require("../src/custom.js");
/** @type {typeof import("../src/constructed.js")} */
export const Co = require("../src/constructed.js");
/** @type {typeof import("../src/copulas.js")} */
export const Cop = require("../src/copulas.js");
/** @type {typeof import("../src/processes.js")} */
export const Pr = require("../src/processes.js");
/** @type {typeof import("../src/mlmc.js")} */
export const Ml = require("../src/mlmc.js");
/** @type {typeof import("../src/engine.js")} */
export const En = require("../src/engine.js");
/** @type {typeof import("../src/dsl.js")} */
export const D = require("../src/dsl.js");
/** @type {typeof import("../src/model.js")} */
export const M = require("../src/model.js");
/** @type {typeof import("../src/plots.js")} */
export const P = require("../src/plots.js");
/** @type {typeof import("../src/report.js")} */
export const Rep = require("../src/report.js");
/** @type {typeof import("../src/pool.js")} */
export const Pool = require("../src/pool.js");
/** @type {typeof import("../src/rare.js")} */
export const Ra = require("../src/rare.js");
/** @type {typeof import("../src/chains.js")} */
export const Ch = require("../src/chains.js");
/** @type {typeof import("../src/physics.js")} */
export const Ph = require("../src/physics.js");
/** @type {typeof import("../src/physics-plots.js")} */
export const PP = require("../src/physics-plots.js");
/** @type {any} */
export const data = require("../raw.json");

/** The model record of a catalogue entry. @param {string} id */
export function recordOf(id) {
  const entry = data.models.find((/** @type {any} */ m) => m.id === id);
  if (!entry) throw new Error(`no model ${id}`);
  const { record, errors } = D.parse(entry.dsl, id);
  if (errors.length) throw new Error(errors.join(" "));
  return record;
}

/**
 * Run a record to `blocks` blocks of 1,024 replicates, merged in order, and return the compiled model, the moment
 * status, the references, the merged statistics and the summary. `known` passes the status and references of an
 * earlier call with the same record and parameters, which do not depend on the seed or the method.
 * @param {any} record @param {any} settings @param {number} blocks @param {{ status: any[], refs: any[] }} [known]
 */
export function runModel(record, settings, blocks, known) {
  const c = En.prepare(record, { method: "independent", compare: "none", failure: "none", overrides: {}, ...settings });
  if (!c.ok) throw new Error(c.errors.join(" "));
  const status = known?.status ?? En.momentStatus(c), refs = known?.refs ?? En.reference(c, status);
  let acc = En.empty(c);
  for (let b = 0; b < blocks; b++) acc = En.merge(acc, En.block(c, b, { references: refs.map((/** @type {any} */ r) => r.values) }), c);
  return { c, status, refs, acc, summary: En.summary(c, acc, status, refs) };
}

/** The chi-square goodness-of-fit p-value of draws against a law, with cells pooled to an expected count ≥ 20. @param {any} law @param {any} p @param {Map<number, number>} counts @param {number} n */
export function gofPValue(law, p, counts, n) {
  const s = law.support(p);
  let chi = 0, df = 0, e = 0, o = 0, k = s.lo;
  for (; k <= s.hi; k++) {
    e += law.pmf(k, p) * n;
    o += counts.get(k) ?? 0;
    if (e >= 20) { chi += (o - e) ** 2 / e; df++; e = 0; o = 0; }
    if (law.sf(k, p) * n < 20) break;
  }
  let tailO = o, tailE = e + (k <= s.hi ? law.sf(k, p) * n : 0);
  for (const [x, c] of counts) if (x > k) tailO += c;
  if (tailE > 0) { chi += (tailO - tailE) ** 2 / tailE; df++; }
  return S.chiSquareSf(chi, Math.max(1, df - 1));
}
