/* Visual skeleton: the generator's example: the views. This file is the visual's own: it draws the page from the state (§5) and adds the
 * domain's controls, WebMCP tools and palette commands. The kit (VisualKit.start) owns the state, the URL, Back
 * and Forward, Reset, the JSON, Markdown and beamdswitch exports, the command palette and the shared WebMCP tools.
 */
(function () {
  "use strict";

  const D = JSON.parse(/** @type {HTMLElement} */ (document.getElementById("dataset")).textContent ?? "{}");
  const SVG = "http://www.w3.org/2000/svg";
  const H = 260, PAD = { left: 48, right: 16, top: 24, bottom: 28 };
  /** @param {string} id @returns {any} */
  const $ = (id) => document.getElementById(id);

  /**
   * An SVG element with attributes; colours come from CSS classes on the style tokens, never from attributes.
   * @param {string} tag @param {Record<string, string | number>} attrs @param {string} [text]
   */
  function svg(tag, attrs, text) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /** @param {[number, number][]} points @param {(p: [number, number]) => [number, number]} at */
  const path = (points, at) => points.map((p, i) => `${i ? "L" : "M"}${at(p).map((v) => v.toFixed(1)).join(" ")}`).join("");

  /** The time chart: x(t) and, when shown, its envelope. It draws at its measured width, so its text keeps the
   * style guide's size on a phone. @param {Record<string, any>} state @param {any} d */
  function drawChart(state, d) {
    const chart = $("chart");
    const W = Math.max(280, Math.round(chart.getBoundingClientRect().width) || 640);
    chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const top = 3.2, end = D.time.end;
    /** @param {[number, number]} p @returns {[number, number]} */
    const at = ([t, y]) => [PAD.left + (t / end) * (W - PAD.left - PAD.right), PAD.top + ((top - y) / (2 * top)) * (H - PAD.top - PAD.bottom)];
    const g = [svg("g", { class: "grid" }), svg("g", { class: "axis" }), svg("g", { class: "tick" })];
    for (const y of [-3, -1.5, 0, 1.5, 3]) {
      const [, py] = at([0, y]);
      g[0].append(svg("line", { x1: PAD.left, x2: W - PAD.right, y1: py, y2: py }));
      g[2].append(svg("text", { x: PAD.left - 6, y: py + 4, "text-anchor": "end" }, y.toFixed(1)));
    }
    const [x0, y0] = at([0, 0]);
    g[1].append(svg("line", { class: "zero", x1: x0, x2: W - PAD.right, y1: y0, y2: y0 }));
    g[2].append(svg("text", { x: W - PAD.right, y: H - 8, "text-anchor": "end" }, `${end.toFixed(1)} s`));
    const marks = [svg("path", { class: "series", d: path(d.curve, at) })];
    if (state.envelope) marks.push(svg("path", { class: "ref", d: path(d.envelope, at) }));
    const label = svg("text", { class: "axis-title", x: PAD.left, y: PAD.top - 4 }, "Displacement x (m)");
    chart.replaceChildren(...g, ...marks, label);
  }

  /** The phase path (t, x, dx/dt) in 3D, turned by the camera in the state. @param {Record<string, any>} state @param {any} d */
  function drawSpace(state, d) {
    const space = $("space");
    const camera = { yaw: state.yaw, pitch: state.pitch };
    /** @param {[number, number, number]} p @returns {[number, number]} */
    const at = (p) => {
      const [u, v] = View3D.project(p, camera);
      return [180 + u * 36, 130 + v * 36];
    };
    /** @type {[number, number, number][]} */
    const points = d.curve.map((/** @type {[number, number]} */ [t, x], /** @type {number} */ i) => {
      const next = d.curve[Math.min(i + 1, d.curve.length - 1)], prev = d.curve[Math.max(i - 1, 0)];
      return [t / 2 - 3, x, (next[1] - prev[1]) / (next[0] - prev[0] || 1)];
    });
    /** @type {[[number, number, number], [number, number, number]][]} */
    const ends = [[[-3, 0, 0], [3.5, 0, 0]], [[-3, -2, 0], [-3, 2, 0]], [[-3, 0, -2], [-3, 0, 2]]];
    const axes = ends.map(([a, b]) => {
      const [x1, y1] = at(a), [x2, y2] = at(b);
      return svg("line", { x1, y1, x2, y2 });
    });
    const line = points.map((p, i) => `${i ? "L" : "M"}${at(p).map((v) => v.toFixed(1)).join(" ")}`).join("");
    space.replaceChildren(svg("g", { class: "axis" }), svg("path", { class: "series", d: line }));
    /** @type {SVGGElement} */ (space.firstChild).append(...axes);
    $("camera").textContent = `yaw ${state.yaw}°, pitch ${state.pitch}°`;
  }

  /** Draw everything from the state. @param {Record<string, any>} state @param {any} d */
  function render(state, d) {
    drawChart(state, d);
    drawSpace(state, d);
    $("amplitude-value").textContent = d.text.amplitude;
    $("damping-value").textContent = d.text.damping;
    $("after-one-cycle").textContent = d.text.afterOneCycle;
    $("decay-per-cycle").textContent = d.text.decayPerCycle;
    $("ten-percent").textContent = d.text.tenPercent;
    $("formula").setAttribute("data-tex", `x(t) = ${d.text.amplitude}\\,e^{-${d.text.damping}\\,t}\\cos t`);
    for (const b of document.querySelectorAll("[data-example]")) {
      const example = Model.EXAMPLES.find((/** @type {KitExample} */ e) => e.id === b.getAttribute("data-example"));
      b.setAttribute("aria-pressed", String(example !== undefined && Object.entries(example.state).every(([k, v]) => state[k] === v)));
    }
  }

  /** The domain's read-only WebMCP tools; the kit adds get_metadata, get_state and get_markdown. @type {KitTool[]} */
  const tools = [
    { name: "get_example", description: "Return one named example: its id, label, state and the values the page derives from it.",
      inputSchema: { type: "object", properties: { id: { type: "string", enum: Model.EXAMPLES.map((/** @type {KitExample} */ e) => e.id) } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (/** @type {{ id?: string }} */ input = {}) => {
        const example = Model.EXAMPLES.find((/** @type {KitExample} */ e) => e.id === input.id);
        if (!example) return { content: [{ type: "text", text: JSON.stringify({ error: "unknown example id" }) }] };
        const state = VisualKit.normalize(Model.FIELDS, example.state).state;
        const { curve, envelope, ...values } = Model.derive(state, D);
        return { content: [{ type: "text", text: JSON.stringify({ ...example, state, derived: values }, null, 2) }] };
      } },
  ];

  const app = VisualKit.start({
    slug: Model.SLUG,
    title: document.title,
    summary: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    schemaVersion: Model.SCHEMA_VERSION,
    fields: Model.FIELDS,
    derive: (state) => Model.derive(state, D),
    render,
    report: (state, d) => Report.report(state, d, D),
    tools,
    commands: Model.EXAMPLES.map((/** @type {KitExample} */ e) => ({ label: `Example: ${e.label}`, run: () => app.set(e.state) })),
    bind(app) {
      for (const b of document.querySelectorAll("[data-example]")) {
        const example = Model.EXAMPLES.find((/** @type {KitExample} */ e) => e.id === b.getAttribute("data-example"));
        if (example) b.addEventListener("click", () => app.set(example.state));
      }
      View3D.attach($("space"), app, { yaw: "yaw", pitch: "pitch" });
    },
  });
})();
