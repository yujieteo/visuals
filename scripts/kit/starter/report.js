/* {{title}}: the report adapter. This file is the visual's own: report(state, derived, data) turns the current
 * view into the plain-data report that the site's beamdswitch template (beamdswitch.js, Beamdswitch.deck) writes
 * as a narrated deck, and that the kit writes as the Markdown record (§14, §15). It reads only the state and
 * the values the page derives from it, so the deck and the page never disagree, and every number arrives already
 * formatted. Narration is plain spoken prose: no maths, markup or symbols.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Report = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  /**
   * @param {Record<string, any>} state
   * @param {any} d the values Model.derive returns for the state
   * @param {any} data the dataset
   */
  function report(state, d, data) {
    const t = d.text;
    const ten = d.tenPercent === null ? "The motion never falls below 10% of its amplitude." : `The motion falls below 10% of its amplitude after ${t.tenPercent}.`;
    const tenSaid = d.tenPercent === null ? "With no damping, the motion never falls below one tenth of its amplitude." : `The motion falls below one tenth of its amplitude after ${t.tenPercent.replace(" s", " seconds")}.`;
    return {
      meta: { title: "{{title}}", subtitle: `Amplitude ${t.amplitude}, damping ratio ${t.damping}`, voice: "bf_emma" },
      narration: `This deck reads the {{title}} view with amplitude ${t.amplitude} and damping ratio ${t.damping}.`,
      setup: [{
        title: `The oscillator: amplitude ${t.amplitude} m, damping ratio ${t.damping}`,
        body: `- Amplitude a = ${t.amplitude} m\n- Damping ratio ζ = ${t.damping}\n- Time from 0 to ${data.time.end.toFixed(1)} s, ${data.time.samples} samples\n- Envelope ${state.envelope ? "shown" : "hidden"}`,
        narration: `The oscillator starts at ${t.amplitude} metres. Its damping ratio is ${t.damping}.`,
      }],
      method: [{
        title: "Displacement is a cosine inside a decaying envelope",
        body: `$$x(t) = a\\,e^{-\\zeta t}\\cos t$$`,
        narration: "The displacement is a cosine of time, multiplied by an exponential envelope that the damping ratio sets.",
      }],
      results: [{
        title: `After one cycle: ${t.afterOneCycle} m`,
        body: `$$x(2\\pi) = ${t.afterOneCycle}\\ \\mathrm{m}$$\n\nEach cycle keeps ${t.decayPerCycle} of the amplitude. ${ten}`,
        plot: { x: [0, Number(data.time.end.toFixed(2))], xlabel: "Time t (s)", ylabel: "Displacement x (m)", curves: [`${t.amplitude}*exp(-${t.damping}*x)*cos(x)`] },
        narration: `After one cycle, the displacement is ${t.afterOneCycle} metres. Each cycle keeps ${t.decayPerCycle} of the amplitude. ${tenSaid}`,
      }],
      checks: [{
        title: "Takeaway",
        key: `The damping ratio ${t.damping} sets the decay: each cycle keeps ${t.decayPerCycle} of the amplitude.`,
        narration: `The damping ratio sets the decay. Each cycle keeps ${t.decayPerCycle} of the amplitude.`,
      }],
    };
  }

  return { report };
});
