/* OKR Setter: the report adapter. This file is the visual's own: report(state, derived) turns the current
 * view into the plain-data report that the site's beamdswitch template (beamdswitch.js, Beamdswitch.deck) writes
 * as a narrated deck, and that the kit writes as the Markdown record (§14, §15). It reads only the state and
 * the values the page derives from it, so the deck and the page never disagree. Narration is plain spoken prose:
 * no maths, markup or symbols.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Report = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  /** @param {number} n @param {string} one @param {string} many */
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  /** @param {string} text the page's text with a percent sign */
  const spoken = (text) => text.replace(/(\d)%/g, "$1 percent");

  /**
   * @param {Record<string, any>} state
   * @param {any} d the values Model.derive returns for the state
   */
  function report(state, d) {
    const shown = d.objectives.filter((/** @type {any} */ ob) => ob.shown);
    const failed = d.objectives.flatMap((/** @type {any} */ ob) => ob.checks.concat(ob.krs.flatMap((/** @type {any} */ kr) => kr.checks.map((/** @type {any} */ c) => ({ ...c, label: `${kr.name}: ${c.label}` }))))).filter((/** @type {any} */ c) => !c.pass);
    const sizes = `${count(d.objectiveCount, "objective", "objectives")} and ${count(d.keyResultCount, "key result", "key results")}`;
    const overall = `Overall progress is ${d.text.progress}.`;
    return {
      meta: { title: "OKR Setter", subtitle: `${sizes}, ${d.text.progress}`, voice: "bf_emma" },
      narration: `This deck reads an OKR set with ${sizes}. ${spoken(overall)}`,
      setup: [{
        title: `The set: ${sizes}`,
        body: shown.length ? shown.map((/** @type {any} */ ob) => `- ${ob.title || "(untitled objective)"}: ${count(ob.krs.length, "key result", "key results")}`).join("\n") : "- No objectives are set.",
        narration: shown.length
          ? `The set has ${sizes}. ${shown.map((/** @type {any} */ ob) => `${ob.title || "An untitled objective"} has ${count(ob.krs.length, "key result", "key results")}.`).join(" ")}`
          : "No objectives are set yet.",
      }],
      method: [{
        title: "Progress is the share of the way from start to target",
        body: "- A key result: current minus start, divided by target minus start, held between 0 and 100%\n- A score key result does the same on the 0 to 1 scale\n- An objective: the mean of its key results that have progress",
        narration: "A key result measures the share of the way from its start value to its target. A score key result does the same on the scale from zero to one. An objective is the mean of its key results.",
      }],
      results: shown.length ? shown.map((/** @type {any} */ ob) => ({
        title: `${ob.title || "Untitled objective"}: ${ob.text.progress}`,
        body: `${ob.grade ? `${ob.grade}\n\n` : ""}${ob.krs.length ? ob.krs.map((/** @type {any} */ kr) => `- ${kr.name}: ${kr.text.current} of ${kr.text.target}, ${kr.text.progress}${kr.owner ? `, owner ${kr.owner}` : ""}${kr.due ? `, due ${kr.due}` : ""}`).join("\n") : "- No key results."}`,
        narration: `${ob.title || "This objective"}: progress is ${spoken(ob.text.progress)}. ${spoken(ob.grade ?? "")} ${ob.krs.map((/** @type {any} */ kr) => `${kr.name} is at ${spoken(kr.text.progress)}.`).join(" ")}`,
      })) : [{ title: "No objectives yet", body: "- Add an objective and its key results.", narration: "Add an objective and its key results to see progress." }],
      checks: [{
        title: `Checks: ${d.checks.passed} of ${d.checks.total} pass`,
        body: failed.length ? failed.map((/** @type {any} */ c) => `- ${c.label}: ${c.detail}`).join("\n") : "- Every check passes.",
        key: failed.length ? `Fix ${count(failed.length, "check", "checks")} before the set is ready.` : "Every check passes.",
        narration: failed.length ? `${count(failed.length, "check does not pass", "checks do not pass")}. Fix them before the set is ready.` : "Every check passes.",
      }],
    };
  }

  return { report };
});
