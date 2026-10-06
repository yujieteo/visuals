/* Monte Carlo Probability Workbench: the figures of the statistical-physics test as plain functions. chart() draws
 * one SVG of lines, dots with intervals and reference lines on linear or log axes, with a key of swatches;
 * surface() projects an energy landscape for a view turned about the vertical axis and tilted, back to front, so the
 * page can fill the quadrilaterals on a canvas (or write them as SVG) with no 3D library. Colours come from the
 * style guide's tokens through classes, or from the caller for a canvas.
 */
/** @param {any} root the global object @param {(P: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCPlots ?? require("./plots.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCPhysicsPlots = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (/** @type {typeof import("./plots.js")} */ P) {
  "use strict";

  const W = 640, H = 300, M = { l: 64, r: 20, t: 30, b: 46 };
  /** @param {unknown} s */
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  /** @param {number} v */
  const f1 = (v) => v.toFixed(1);

  /**
   * @typedef {{ label: string, x: number[], y: (number | null)[], lo?: (number | null)[], hi?: (number | null)[],
   *   mark?: "line" | "dots" | "both", cls?: string, dash?: boolean }} Series
   * @typedef {{ label?: string, x0: number, y0: number, x1: number, y1: number }} Guide
   */

  /** The range of positive finite values for a log axis, in whole decades. @param {number[]} vals @returns {[number, number]} */
  function logRange(vals) {
    const pos = vals.filter((v) => v > 0 && Number.isFinite(v));
    if (!pos.length) return [1, 10];
    const lo = 10 ** Math.floor(Math.log10(Math.min(...pos))), hi = 10 ** Math.ceil(Math.log10(Math.max(...pos)));
    return [lo, hi > lo ? hi : lo * 10];
  }

  /**
   * One chart: series of lines or dots (with interval bars when lo and hi are given), guide lines (a reference
   * value, a slope), a key of the series at the top, axis titles with units, and a title and aria-label for readers
   * who do not see it.
   * @param {{ title: string, xlabel: string, ylabel: string, xlog?: boolean, ylog?: boolean, series: Series[], guides?: Guide[],
   *   x?: [number, number], y?: [number, number], empty?: string }} o
   */
  function chart(o) {
    const label = `${o.title}. ${o.series.map((s) => s.label).join("; ")}`;
    const xs = o.series.flatMap((s) => s.x.filter((_, i) => s.y[i] !== null && Number.isFinite(/** @type {number} */ (s.y[i]))));
    const ys = o.series.flatMap((s) => [...s.y, ...(s.lo ?? []), ...(s.hi ?? [])]).filter((v) => v !== null && Number.isFinite(v)).map(Number);
    const gx = (o.guides ?? []).flatMap((g) => [g.x0, g.x1]), gy = (o.guides ?? []).flatMap((g) => [g.y0, g.y1]);
    const svg = (/** @type {string} */ body) => `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><title>${esc(label)}</title>${body}</svg>`;
    if (!xs.length) return svg(`<text x="${W / 2}" y="${H / 2}" text-anchor="middle">${esc(o.empty ?? "Run the experiment to draw this figure.")}</text>`);
    const xr = o.x ?? (o.xlog ? logRange([...xs, ...gx]) : P.padRange([...xs, ...gx], 0.04));
    const yr = o.y ?? (o.ylog ? logRange([...ys, ...gy]) : P.padRange([...ys, ...gy], 0.08));
    const sx = P.scale(xr[0], xr[1], M.l, W - M.r, !!o.xlog), sy = P.scale(yr[0], yr[1], H - M.b, M.t, !!o.ylog);
    const xt = o.xlog ? P.logTicks(xr[0], xr[1]) : P.ticks(xr[0], xr[1], 6), yt = o.ylog ? P.logTicks(yr[0], yr[1]) : P.ticks(yr[0], yr[1], 5);
    const xstep = xt.length > 1 ? xt[1] - xt[0] : 0, ystep = yt.length > 1 ? yt[1] - yt[0] : 0;
    const inX = (/** @type {number} */ v) => v >= xr[0] - 1e-12 * Math.abs(xr[0]) && v <= xr[1] + 1e-12 * Math.abs(xr[1]) && (!o.xlog || v > 0);
    const inY = (/** @type {number} */ v) => Number.isFinite(v) && (!o.ylog || v > 0);
    const clampY = (/** @type {number} */ v) => Math.min(H - M.b, Math.max(M.t, sy(v)));
    const parts = ['<g class="grid">', ...yt.map((v) => `<line x1="${M.l}" x2="${W - M.r}" y1="${f1(sy(v))}" y2="${f1(sy(v))}"/>`), "</g>",
      `<g class="axis"><line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/><line x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${H - M.b}"/></g><g class="tick">`,
      ...xt.map((v) => `<line class="axis" x1="${f1(sx(v))}" x2="${f1(sx(v))}" y1="${H - M.b}" y2="${H - M.b + 4}"/><text x="${f1(sx(v))}" y="${H - M.b + 17}" text-anchor="middle">${esc(o.xlog ? P.fmt(v) : P.tickLabel(v, xstep))}</text>`),
      ...yt.map((v) => `<text x="${M.l - 6}" y="${f1(sy(v) + 4)}" text-anchor="end">${esc(o.ylog ? P.fmt(v) : P.tickLabel(v, ystep))}</text>`), "</g>",
      `<text class="axis-title" x="${(M.l + W - M.r) / 2}" y="${H - 8}" text-anchor="middle">${esc(o.xlabel)}</text>`,
      `<text class="axis-title" transform="translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">${esc(o.ylabel)}</text>`];
    for (const g of o.guides ?? []) {
      if (!(inY(g.y0) && inY(g.y1) && (!o.xlog || (g.x0 > 0 && g.x1 > 0)))) continue;
      parts.push(`<line class="ref" x1="${f1(sx(g.x0))}" y1="${f1(clampY(g.y0))}" x2="${f1(sx(g.x1))}" y2="${f1(clampY(g.y1))}"/>`);
      if (g.label) parts.push(`<text class="direct-label" x="${f1(Math.min(W - M.r, sx(g.x1)))}" y="${f1(clampY(g.y1) - 5)}" text-anchor="end">${esc(g.label)}</text>`);
    }
    o.series.forEach((s, k) => {
      const cls = s.cls ?? `s${(k % 4) + 1}`, mark = s.mark ?? "line";
      const pts = /** @type {[number, number][]} */ (s.x.map((x, i) => [x, s.y[i]]).filter(([x, y]) => y !== null && inX(/** @type {number} */ (x)) && inY(/** @type {number} */ (y))));
      if (mark !== "dots" && pts.length > 1) parts.push(`<path class="series ${cls}"${s.dash ? ' stroke-dasharray="6 4"' : ""} d="${pts.map(([x, y], i) => `${i ? "L" : "M"}${f1(sx(x))} ${f1(sy(/** @type {number} */ (y)))}`).join("")}"/>`);
      s.x.forEach((x, i) => {
        const lo = s.lo?.[i], hi = s.hi?.[i];
        if (lo !== null && lo !== undefined && hi !== null && hi !== undefined && inX(x) && inY(hi)) parts.push(`<line class="series ${cls}" x1="${f1(sx(x))}" x2="${f1(sx(x))}" y1="${f1(clampY(o.ylog && lo <= 0 ? yr[0] : lo))}" y2="${f1(clampY(hi))}"/>`);
      });
      if (mark !== "line") for (const [x, y] of pts) parts.push(`<circle class="dot ${cls}" cx="${f1(sx(x))}" cy="${f1(sy(/** @type {number} */ (y)))}" r="3.5"/>`);
    });
    // The key: a swatch and a label for each series, left to right, in the top margin.
    let kx = M.l;
    o.series.forEach((s, k) => {
      const cls = s.cls ?? `s${(k % 4) + 1}`, text = s.label.length > 34 ? `${s.label.slice(0, 33)}…` : s.label;
      if (kx + 26 + text.length * 6.2 > W - M.r) return;
      parts.push(`<line class="series ${cls}" x1="${kx}" x2="${kx + 16}" y1="${M.t - 14}" y2="${M.t - 14}"${s.dash ? ' stroke-dasharray="6 4"' : ""}/>${s.mark === "dots" ? `<circle class="dot ${cls}" cx="${kx + 8}" cy="${M.t - 14}" r="3.5"/>` : ""}<text class="direct-label" x="${kx + 20}" y="${M.t - 10}">${esc(text)}</text>`);
      kx += 30 + text.length * 6.2;
    });
    return svg(parts.join(""));
  }

  /**
   * The surface of a landscape seen from azimuth az and elevation el (degrees; 90 is the view from above), fitted in
   * a w x h box. Energies above `cap` are drawn at the cap. Returns the quadrilaterals from back to front, each with its
   * 4 screen points, its mean energy t in [0, 1] of the drawn range and a Lambert shade, and a function that places a
   * grid node on the screen.
   * @param {any} land @param {number} az @param {number} el @param {number} w @param {number} h @param {number} [step]
   */
  function surface(land, az, el, w, h, step = 1) {
    const g = land.g, V = land.V, lo = land.vmin;
    const cap = Math.min(land.vmax, lo + 2.2 * (land.route.barrier - lo));
    const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
    const zs = 0.9 / (cap - lo || 1);
    /** World coordinates of a node: x and y in [-1, 1], height z from 0. @param {number} s */
    const world = (s) => { const i = s % g, j = Math.floor(s / g); return [(2 * i) / (g - 1) - 1, (2 * j) / (g - 1) - 1, (Math.min(cap, V[s]) - lo) * zs]; };
    const view = (/** @type {number[]} */ p) => {
      const xr = p[0] * ca - p[1] * sa, yr = p[0] * sa + p[1] * ca;
      return [xr, -(yr * se + p[2] * ce), -yr * ce + p[2] * se];
    };
    // Fit the projected corners of the box into the canvas with a margin.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const cx of [-1, 1]) for (const cy of [-1, 1]) for (const cz of [0, 0.9]) {
      const [px, py] = view([cx, cy, cz]);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    const k = Math.min((w - 24) / (x1 - x0 || 1), (h - 24) / (y1 - y0 || 1)), ox = (w - k * (x1 + x0)) / 2, oy = (h - k * (y1 + y0)) / 2;
    const screen = (/** @type {number[]} */ p) => { const [px, py, d] = view(p); return [ox + k * px, oy + k * py, d]; };
    const light = [-0.45, 0.35, 0.82], ln = Math.hypot(...light);
    /** @type {{ pts: number[][], t: number, shade: number, depth: number }[]} */
    const quads = [];
    for (let j = 0; j + step < g; j += step) for (let i = 0; i + step < g; i += step) {
      const ids = [i + g * j, i + step + g * j, i + step + g * (j + step), i + g * (j + step)];
      const wp = ids.map(world), sp = wp.map(screen);
      const u = [wp[1][0] - wp[0][0], wp[1][1] - wp[0][1], wp[1][2] - wp[0][2]], v = [wp[3][0] - wp[0][0], wp[3][1] - wp[0][1], wp[3][2] - wp[0][2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const lam = Math.abs(n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / ((Math.hypot(...n) || 1) * ln);
      const mean = ids.reduce((t, s) => t + Math.min(cap, V[s]), 0) / 4;
      quads.push({ pts: sp.map((p) => [p[0], p[1]]), t: (mean - lo) / (cap - lo || 1), shade: 0.55 + 0.45 * lam, depth: sp.reduce((t, p) => t + p[2], 0) / 4 });
    }
    quads.sort((p, q) => p.depth - q.depth);
    return { quads, cap, point: (/** @type {number} */ s) => { const p = screen(world(s)); return [p[0], p[1]]; } };
  }

  /** The [r, g, b] of a CSS colour in #rgb, #rrggbb or rgb() form. @param {string} css */
  function parseColour(css) {
    const s = css.trim();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (hex) {
      const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(s);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [128, 128, 128];
  }

  /** The colour a fraction t of the way from a to b, times a shade. @param {number[]} a @param {number[]} b @param {number} t @param {number} [shade] */
  function mix(a, b, t, shade = 1) {
    const u = Math.min(1, Math.max(0, t));
    return `rgb(${a.map((v, i) => Math.round(Math.min(255, (v + (b[i] - v) * u) * shade))).join(" ")})`;
  }

  /**
   * The quadrilaterals of a surface as SVG polygons, with literal fills, for the SVG export of the 3D view.
   * @param {ReturnType<typeof surface>} surf @param {number} w @param {number} h @param {number[]} low @param {number[]} high @param {string} label
   */
  function surfaceSvg(surf, w, h, low, high, label) {
    const polys = surf.quads.map((q) => `<polygon points="${q.pts.map((p) => `${f1(p[0])},${f1(p[1])}`).join(" ")}" fill="${mix(low, high, q.t, q.shade)}"/>`).join("");
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><title>${esc(label)}</title>${polys}</svg>`;
  }

  return { W, H, chart, surface, parseColour, mix, surfaceSvg, logRange };
});
