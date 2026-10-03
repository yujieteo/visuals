/* {{title}}: the domain model. This file is the visual's own: replace the starter oscillator with the domain.
 *
 * FIELDS is the semantic state (§5): every field the view, the URL, the JSON file and the exports share. Change
 * SCHEMA_VERSION when a field changes meaning, so an old saved file is refused rather than read wrongly (§13).
 * EXAMPLES are named states with stable ids. derive(state, data) computes every derived value from the state and
 * the dataset alone, so the same state always gives the same numbers (§4). It touches no DOM, so node tests run it.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Model = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const SLUG = "{{slug}}";
  const SCHEMA_VERSION = 1;

  /** @type {Record<string, KitField>} */
  const FIELDS = {
    amplitude: { type: "number", label: "Amplitude a", default: 1, min: 0.5, max: 3, step: 0.1 },
    damping: { type: "number", label: "Damping ratio ζ", default: 0.2, min: 0, max: 1, step: 0.05 },
    envelope: { type: "boolean", label: "Show the envelope", default: true },
{{#three_d}}
    yaw: { type: "integer", label: "Camera yaw (degrees)", default: -35, min: -180, max: 180 },
    pitch: { type: "integer", label: "Camera pitch (degrees)", default: 20, min: -90, max: 90 },
{{/three_d}}
  };

  /** Named states with stable ids (§5, §18). @type {KitExample[]} */
  const EXAMPLES = [
    { id: "undamped", label: "No damping", state: { amplitude: 1, damping: 0 } },
    { id: "light", label: "Light damping", state: { amplitude: 1, damping: 0.2 } },
    { id: "heavy", label: "Heavy damping", state: { amplitude: 1.5, damping: 0.6 } },
  ];

  /** @param {number} x @param {number} [digits] */
  const fixed = (x, digits = 2) => x.toFixed(digits);

  /**
   * Every value the page shows, from the state and the dataset only.
   * @param {Record<string, any>} state @param {{ time: { end: number, samples: number } }} data
   */
  function derive(state, data) {
    const a = state.amplitude, z = state.damping;
    const n = data.time.samples, end = data.time.end;
    /** @type {[number, number][]} */
    const curve = [];
    /** @type {[number, number][]} */
    const envelope = [];
    for (let i = 0; i < n; i++) {
      const t = (end * i) / (n - 1);
      curve.push([t, a * Math.exp(-z * t) * Math.cos(t)]);
      envelope.push([t, a * Math.exp(-z * t)]);
    }
    const afterOneCycle = a * Math.exp(-z * 2 * Math.PI);
    // With no damping the motion never falls below 10% of its amplitude: null, never Infinity.
    const tenPercent = z > 0 ? Math.log(10) / z : null;
    return {
      curve,
      envelope,
      afterOneCycle,
      decayPerCycle: Math.exp(-z * 2 * Math.PI),
      tenPercent,
      text: {
        amplitude: fixed(a, 1),
        damping: fixed(z),
        afterOneCycle: fixed(afterOneCycle, 3),
        decayPerCycle: fixed(Math.exp(-z * 2 * Math.PI), 3),
        tenPercent: tenPercent === null ? "never" : `${fixed(tenPercent)} s`,
      },
    };
  }

  return { SLUG, SCHEMA_VERSION, FIELDS, EXAMPLES, derive };
});
