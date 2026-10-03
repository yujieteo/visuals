/* The convex 15-minute bet page as a beamdswitch report.
 *
 * report(P, view) turns the page's data (P: its four quadrant rows, key message, caveat and research
 * basis) and its current view ({ id: the quadrant selected }) into the plain-data report that the
 * standard template (beamdswitch.js, `Beamdswitch.deck`) writes as a narrated Markdown deck. Every
 * line is the page's own wording; nothing is scored or estimated.
 */
// root is the global object: self in the page, where the report publishes itself for the page script.
(function (/** @type {any} */ root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ConvexReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** @typedef {[id: string, label: string, action: string, test: string, why: string, verdict: string, examples: string[]]} Row */
  /**
   * The page's data: its four quadrant rows, key message, caveat and research basis.
   * @typedef {{ title: string, lede: string, message: string, caveat: string, fetched: string, rows: Row[], sources: { cite: string, url: string, text: string }[] }} PageData
   */

  /* A quadrant's place on the page's two axes, from its id ("reversible-upside" and so on). */
  /** @type {Record<string, string>} */
  const COST = { reversible: "Nearly free failure", costly: "Costly failure" };
  /** @type {Record<string, string>} */
  const CHANGE = { upside: "more change", flat: "little change" };
  /** @param {string} id */
  const axes = (id) => { const [cost, change] = id.split("-"); return { cost: COST[cost], change: CHANGE[change] }; };
  const ORDER = ["reversible-flat", "reversible-upside", "costly-flat", "costly-upside"];

  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  const md = (/** @type {unknown} */ s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  /* Narration is read aloud: markup characters are dropped. */
  const say = (/** @type {unknown} */ s) => String(s ?? "").replace(/&/g, " and ").replace(/[“”"]/g, "").replace(/[$\\`*_#|<>[\]]/g, " ").replace(/\s+/g, " ").trim();
  const lower = (/** @type {string} */ s) => s.charAt(0).toLowerCase() + s.slice(1);
  const end = (/** @type {string} */ s) => (/[.!?]$/.test(s) ? s : s + ".");

  /** @param {PageData} P @param {{ id?: string }} [view] @returns {import("./beamdswitch.js").Report} */
  function report(P, view = {}) {
    const byId = new Map(P.rows.map((r) => [r[0], r]));
    // The page always has the reversible-upside quadrant, its default.
    const row = /** @type {Row} */ (byId.get(/** @type {string} */ (view.id)) || byId.get("reversible-upside"));
    const [id, label, action, test, why, verdict, examples] = row, at = axes(id);

    const setup = [{
      title: "Two axes: what failure costs, and how much it could change tomorrow",
      body: [
        "- Down the side: failure cost, from nearly free to costly.",
        "- Across: potential to change tomorrow, from little change to more change.",
        "- Each 15-minute action lands in one of four quadrants.",
        `- ${md(P.lede)}`,
      ].join("\n"),
      narration: `The page sorts a 15-minute action on two axes: how much it costs if it fails, and how much it could change tomorrow if it works. ${say(P.lede)}`,
    }];

    const method = [{
      title: "Four quadrants, four verdicts",
      body: [
        "| Failure cost | Change | Quadrant | Verdict |",
        "| --- | --- | --- | --- |",
        ...ORDER.map((q) => { const r = /** @type {Row} */ (byId.get(q)), a = axes(q); return `| ${a.cost} | ${a.change} | ${md(r[1])} | ${md(r[5])} |`; }),
      ].join("\n"),
      notes: "A convex bet has a capped downside and an open upside: the reversible probe quadrant.",
      narration: ORDER.map((q) => { const r = /** @type {Row} */ (byId.get(q)), a = axes(q); return `${a.cost} with ${a.change}: ${lower(say(r[1]))}, verdict ${lower(end(say(r[5])))}`; }).join(" "),
    }];

    const results = [{
      title: `${md(label)}: ${md(verdict)}`,
      body: [
        `- Quadrant: ${at.cost.toLowerCase()}, ${at.change}.`,
        `- 15-minute move: ${md(action)}`,
        `- Success looks like: ${md(test)}`,
        `- Reason: ${md(why)}`,
      ].join("\n"),
      notes: "This is the quadrant selected on the page.",
      narration: `The selected quadrant is ${lower(at.cost)} with ${at.change}: ${lower(say(label))}. The 15-minute move: ${lower(end(say(action)))} Success looks like this: ${lower(end(say(test)))} The reason: ${lower(end(say(why)))} Verdict: ${lower(end(say(verdict)))}`,
    }, {
      title: `Examples: ${md(lower(label))}`,
      body: examples.map((e) => `- ${md(e)}`).join("\n"),
      narration: `${examples.length === 1 ? "An example." : "Some examples."} ${examples.map((e) => end(say(e))).join(" ")}`,
    }];

    const checks = [{
      title: "The research basis behind the heuristic",
      body: [
        ...P.sources.map((s) => `- [${md(s.cite)}](${s.url}) ${md(s.text)}`),
        "",
        `${md(P.caveat)}`,
      ].join("\n"),
      narration: `${P.sources.map((s) => say(s.text)).join(" ")} ${say(P.caveat)}`,
    }, {
      title: "Takeaway",
      key: md(P.message),
      narration: say(P.message),
    }];

    return {
      meta: { title: P.title, subtitle: `${label}: ${verdict}`, date: `Sources checked ${P.fetched}` },
      narration: `This talk walks through a four-quadrant guide to choosing a 15-minute action that costs little if it fails and opens a meaningful path if it works. It focuses on the quadrant selected: ${lower(say(label))}.`,
      setup, method, results, checks,
    };
  }

  return { axes, report };
});
