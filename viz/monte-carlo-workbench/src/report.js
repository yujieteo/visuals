/* Monte Carlo Probability Workbench: the report adapter. report(state, derived, data, run) turns the current view
 * and its last run into the plain-data report that the site's beamdswitch template writes as a narrated deck, and
 * that the kit writes as the Markdown record: the model and its assumptions, the method, the results with their
 * claim tags, and the diagnostics and limitations. Narration is plain spoken prose: no symbols or markup.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Report = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const METHOD_NAMES = /** @type {Record<string, string>} */ ({ independent: "independent sampling", inverse: "the inverse transform", rejection: "rejection sampling", stratified: "stratification", antithetic: "antithetic variables", control: "control variates" });

  /** The sampler of each method's laws: the variance-reduction methods use the inverse transform or the reference sampler. */
  const SAMPLER = /** @type {Record<string, string>} */ ({ independent: "independent", inverse: "inverse", rejection: "rejection", stratified: "inverse", antithetic: "inverse", control: "independent" });

  /** A number as text: at most 4 significant digits, never NaN or Infinity. @param {number | null | undefined} v */
  function num(v) {
    if (v === null || v === undefined || !Number.isFinite(v)) return "not available";
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-4 || a >= 1e7)) return v.toExponential(2);
    return String(+v.toPrecision(4));
  }
  const SUP = /** @type {Record<string, string>} */ ({ "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "minus " });
  /** Words that read as speech: names with underscores become spaces, and a superscript becomes "squared" or a power. @param {string} s */
  const say = (s) => String(s).replace(/_/g, " ").replace(/²(?![⁰¹²³⁴⁵⁶⁷⁸⁹])/g, " squared").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => ` to the power ${[...m].map((ch) => SUP[ch]).join("")}`)
    .replace(/[$\\`*#|<>×%&≈^]/g, " ").replace(/\s+/g, " ").trim();
  /** @param {string} s */
  const cell = (s) => String(s).replace(/\|/g, "/");

  /**
   * @param {Record<string, any>} state
   * @param {any} d the values Model.derive returns for the state
   * @param {any} data the catalogue
   * @param {any} [run] the last run: { status, n, summary, generator } or null
   */
  function report(state, d, data, run) {
    const entry = data.models.find((/** @type {any} */ m) => m.id === state.model) ?? null;
    const method = data.methods.find((/** @type {any} */ m) => m.id === state.method);
    const title = "Monte Carlo Probability Workbench";
    const name = d.model.title;
    const meta = { title, subtitle: `${name}: ${METHOD_NAMES[state.method]}, seed ${state.seed}, n = ${d.n}`, voice: "bf_emma" };
    if (!d.ok) {
      return {
        meta, narration: `This deck reads the model ${say(name)}, which has errors.`,
        setup: [{ title: `The model ${name}`, body: `\`\`\`text\n${d.text}\`\`\``, narration: `The model ${say(name)} has errors, so the page did not run it.` }],
        method: [{ title: "No method ran", body: d.errors.map((/** @type {string} */ e) => `- ${e}`).join("\n"), narration: "The page lists each error. Correct them in the editor, then run the model." }],
        results: [{ title: "No results", body: "The model has errors.", narration: "There are no results." }],
        checks: [{ title: "Takeaway", key: "Correct the model before you read any result.", narration: "Correct the model before you read any result." }],
      };
    }
    const setup = [{
      title: `The problem: ${name}`,
      body: [d.model.problem, entry?.decision ?? "", entry?.data?.kind === "real" ? `Data: ${data.datasets.find((/** @type {any} */ x) => x.id === entry.data.dataset)?.title}.` : entry?.data?.text ?? "Custom model."].filter(Boolean).join("\n\n"),
      narration: `The problem is: ${say(d.model.problem)}`,
    }, {
      title: "The model",
      body: `\`\`\`text\n${d.text}\`\`\`\n\n${d.equations.map((/** @type {string} */ t) => `$$${t}$$`).join("\n\n")}`,
      narration: `The model has ${d.variables.length} random ${d.variables.length === 1 ? "variable" : "variables"} and ${d.quantities.length} ${d.quantities.length === 1 ? "quantity" : "quantities"} to estimate, with ${d.alternatives.length} ${d.alternatives.length === 1 ? "alternative" : "alternatives"}.`,
    }];
    if (entry?.kind === "workflow") setup.push({
      title: "Assumptions",
      body: [`- Reason for the law: ${entry.reason}`, `- Parameters, units and data: ${entry.inputs}`, `- Dependence: ${entry.dependence}`].join("\n"),
      narration: say(entry.dependence),
    });
    const methodFrames = [{
      title: `Method: ${method.name}`,
      body: `$$${method.estimator}$$\n\n${method.estimatorText}\n\n- Number of replicates n = ${d.n} for each alternative\n- Seed ${state.seed}, generator Philox4x32-10, block size 1,024\n- Alternatives: ${state.streams === "common" ? "common random numbers" : "separate streams"}${d.design?.stratify ? `\n- Strata: ${d.design.stratify.K} equal strata of the uniform of ${d.design.stratify.name}` : ""}${d.design?.control && state.method === "control" ? `\n- Control variate: ${d.design.control.name} = ${d.design.control.expr}` : ""}\n- Comparison: ${state.compare === "none" ? "none" : METHOD_NAMES[state.compare]}\n- Assumption failure: ${state.failure === "none" ? "none" : d.failureNote}`,
      narration: `The run uses ${METHOD_NAMES[state.method]} with ${d.n} replicates for each alternative and the seed ${state.seed}.`,
    }, {
      title: "Samplers",
      body: d.samplers.map((/** @type {any} */ s) => `- ${s.variable}, ${s.name} law: ${s.methods ? `${s.methods[SAMPLER[state.method]].label} (${s.methods[SAMPLER[state.method]].exactness})` : "parameters change from replicate to replicate"}`).join("\n"),
      narration: "Each law names its sampler and whether that sampler is exact.",
    }];
    const sm = run?.summary?.[0];
    const results = [];
    if (!sm) results.push({ title: "No run yet", body: "Run the experiment to fill this frame. The reference values below need no run.\n\n" + refTable(d), narration: "The page has no run yet. The reference values need no run." });
    else {
      const rows = ["| Alternative | Quantity | Estimate | 95 % interval | Reference | Claim |", "| --- | --- | --- | --- | --- | --- |"];
      for (const alt of sm.alts) for (const q of alt.quantities) rows.push(`| ${cell(alt.label)} | ${cell(q.name)} | ${num(q.est)} | ${q.lo === null ? cell(q.how) : `${num(q.lo)} to ${num(q.hi)}`} | ${num(q.reference)} | finite-run observation |`);
      const first = sm.alts[0].quantities[0];
      results.push({
        title: `Results after ${run.n} replicates (${run.status})`,
        body: rows.join("\n"),
        narration: `After ${run.n} replicates, the estimate of ${say(first.name)} for ${say(sm.alts[0].label)} is ${num(first.est)}.${run.status === "done" ? "" : " The run is not complete, so these values are partial."}`,
      });
      const dec = sm.decision;
      results.push({
        title: "Decision",
        body: dec.best === null ? dec.text : `${sm.alts[dec.best].label} is the best admissible alternative${dec.separated ? ", and its paired intervals separate it from the others" : ", but the paired intervals do not separate it from every other alternative with this number of replicates"}.\n\n${dec.rows.map((/** @type {any} */ r) => `- ${r.label}: ${r.checks.length ? r.checks.map((/** @type {any} */ x) => `${x.quantity} ${x.op} ${x.value}: ${x.verdict}`).join(", ") : "no constraints"}`).join("\n")}`,
        narration: dec.best === null ? "The model states no objective, or no alternative meets the constraints." : `The best admissible alternative is ${say(sm.alts[dec.best].label)}.`,
      });
    }
    const checks = [{
      title: "Diagnostics",
      body: d.quantities.map((/** @type {any} */ q) => `- ${q.name}: mean ${q.status.twoSided ? "does not exist" : q.status.mean}, variance ${q.status.variance}. ${q.status.reason}`).join("\n") + (sm ? `\n- Rejection: ${sm.rejection.proposals ? `${sm.rejection.accepts} of ${sm.rejection.proposals} proposals accepted, ${sm.rejection.violations} envelope violations` : "not used"}` : ""),
      narration: "Each quantity states whether its mean and variance exist. An interval needs a finite variance.",
    }, {
      title: "Limitations and takeaway",
      body: [entry?.kind === "workflow" ? `- ${entry.interpretation}` : entry?.observe ? `- ${entry.observe}` : "- A custom model has no reviewed interpretation.",
        "- Each estimate is a finite-run observation. A finite sample variance is not a population guarantee.",
        "- The parameters are illustrative unless the data line names a real dataset."].join("\n"),
      key: entry?.kind === "workflow" ? entry.interpretation.split(". ")[0] + "." : "Read each estimate with its interval, its claim tag and the moment status of its quantity.",
      narration: "Each estimate is an observation of one finite run. Read it with its interval and the conditions of the model.",
    }];
    return { meta, narration: `This deck reads the workbench model ${say(name)}.`, setup, method: methodFrames, results, checks };
  }

  /** The reference values as a Markdown table. @param {any} d */
  function refTable(d) {
    const rows = ["| Alternative | Quantity | Reference |", "| --- | --- | --- |"];
    d.alternatives.forEach((/** @type {string} */ label, /** @type {number} */ a) => d.quantities.forEach((/** @type {any} */ q, /** @type {number} */ k) => rows.push(`| ${cell(label)} | ${cell(q.name)} | ${num(d.references[a].values[k])} |`)));
    return rows.join("\n");
  }

  return { report, num };
});
