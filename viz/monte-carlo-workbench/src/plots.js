/* Monte Carlo Probability Workbench: the linked visuals as SVG text. Each function takes plain data and returns
 * the markup of one <svg class="chart"> with axes, ticks, direct labels, a <title> and an aria-label, so the page,
 * the SVG and PNG exports and the tests draw the same figure. Colours come from the style guide's tokens through
 * classes; the exports copy the computed colours. Linear and log axes share one scale function.
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCPlots = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const W = 640, H = 300, M = { l: 64, r: 20, t: 18, b: 46 };

  /** @param {string} s */
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /** A number for a tick or a label: short, never NaN or Infinity. @param {number} v */
  function fmt(v) {
    if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : "–";
    const a = Math.abs(v);
    if (a === 0) return "0";
    if (a >= 1e5 || a < 1e-3) {
      const e = Math.floor(Math.log10(a)), m = v / 10 ** e;
      return `${Math.abs(m - Math.round(m)) < 1e-9 ? Math.round(m) : m.toFixed(1)}e${e}`.replace("-", "−");
    }
    return String(+v.toPrecision(4)).replace("-", "−");
  }

  /** A tick label with as many digits as the tick step needs. @param {number} v @param {number} step */
  function tickLabel(v, step) {
    const a = Math.abs(v);
    if (v === 0 || !(step > 0) || a >= 1e5 || a < 1e-3) return fmt(v);
    const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return v.toFixed(Math.min(decimals, 10)).replace("-", "−");
  }

  /** Round tick values for [lo, hi]. @param {number} lo @param {number} hi @param {number} [count] */
  function ticks(lo, hi, count = 5) {
    if (!(hi > lo)) return [lo];
    const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
    const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }

  /** Powers of 10 inside [lo, hi], for a log axis. @param {number} lo @param {number} hi */
  function logTicks(lo, hi) {
    const out = [];
    const few = Math.log10(hi / lo) < 2.5;
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of few ? [1, 2, 5] : [1]) { const v = m * 10 ** e; if (v >= lo && v <= hi) out.push(v); }
    if (out.length > 8) return out.filter((_, i) => i % Math.ceil(out.length / 8) === 0);
    return out.length ? out : [lo];
  }

  /**
   * A scale from data to pixels. A log scale needs lo > 0; values at or below 0 map to the lower edge.
   * @param {number} lo @param {number} hi @param {number} a @param {number} b @param {boolean} log
   */
  function scale(lo, hi, a, b, log) {
    if (log) {
      const l0 = Math.log10(lo), l1 = Math.log10(hi);
      return (/** @type {number} */ v) => (v <= 0 ? a : a + ((Math.log10(v) - l0) / (l1 - l0 || 1)) * (b - a));
    }
    return (/** @type {number} */ v) => a + ((v - lo) / (hi - lo || 1)) * (b - a);
  }

  /**
   * The frame of a plot: grid, axes, ticks and axis titles. Returns the scales and the markup.
   * @param {{ x: [number, number], y: [number, number], xlog?: boolean, ylog?: boolean, xlabel: string, ylabel: string, xint?: boolean }} o
   */
  function frame(o) {
    const sx = scale(o.x[0], o.x[1], M.l, W - M.r, !!o.xlog), sy = scale(o.y[0], o.y[1], H - M.b, M.t, !!o.ylog);
    const xt = (o.xlog ? logTicks(o.x[0], o.x[1]) : ticks(o.x[0], o.x[1], 6)).filter((v) => !o.xint || Number.isInteger(v));
    const yt = o.ylog ? logTicks(o.y[0], o.y[1]) : ticks(o.y[0], o.y[1], 5);
    const parts = ['<g class="grid">'];
    for (const v of yt) parts.push(`<line x1="${M.l}" x2="${W - M.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/>`);
    parts.push("</g>", '<g class="axis">');
    parts.push(`<line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}"/><line x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${H - M.b}"/>`);
    parts.push("</g>", '<g class="tick">');
    const xs = xt.length > 1 ? xt[1] - xt[0] : 0, ys = yt.length > 1 ? yt[1] - yt[0] : 0;
    for (const v of xt) parts.push(`<line class="axis" x1="${sx(v).toFixed(1)}" x2="${sx(v).toFixed(1)}" y1="${H - M.b}" y2="${H - M.b + 4}"/><text x="${sx(v).toFixed(1)}" y="${H - M.b + 17}" text-anchor="middle">${esc(o.xlog ? fmt(v) : tickLabel(v, xs))}</text>`);
    for (const v of yt) parts.push(`<text x="${M.l - 6}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end">${esc(o.ylog ? fmt(v) : tickLabel(v, ys))}</text>`);
    parts.push("</g>");
    parts.push(`<text class="axis-title" x="${(M.l + W - M.r) / 2}" y="${H - 8}" text-anchor="middle">${esc(o.xlabel)}</text>`);
    parts.push(`<text class="axis-title" transform="translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">${esc(o.ylabel)}</text>`);
    return { sx, sy, markup: parts.join("") };
  }

  /** @param {string} label @param {string} body */
  const svg = (label, body) => `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><title>${esc(label)}</title>${body}</svg>`;

  /** @param {number[]} xs @param {number[]} ys @param {(v: number) => number} sx @param {(v: number) => number} sy */
  const path = (xs, ys, sx, sy) => xs.map((x, i) => `${i ? "L" : "M"}${sx(x).toFixed(1)} ${sy(ys[i]).toFixed(1)}`).join("");
  /** A right-continuous step function through (x_i, y_i). @param {number[]} xs @param {number[]} ys @param {(v: number) => number} sx @param {(v: number) => number} sy @param {number} xmax */
  function steps(xs, ys, sx, sy, xmax) {
    let d = "";
    xs.forEach((x, i) => {
      const next = i + 1 < xs.length ? xs[i + 1] : xmax;
      d += `${i ? "L" : "M"}${sx(x).toFixed(1)} ${sy(ys[i]).toFixed(1)}H${sx(next).toFixed(1)}`;
    });
    return d;
  }

  /**
   * A linear range around the values with a margin. A range narrower than 10^-6 of the values' size widens to 1 %
   * of that size, so rounding does not draw as a slope.
   * @param {number[]} vals @param {number} margin @returns {[number, number]}
   */
  function padRange(vals, margin) {
    let y0 = Math.min(...vals), y1 = Math.max(...vals);
    const size = Math.max(Math.abs(y0), Math.abs(y1));
    if (y1 - y0 <= size * 1e-6) {
      const mid = (y0 + y1) / 2, half = size * 0.01 || 1;
      return [mid - half, mid + half];
    }
    const p = (y1 - y0) * margin;
    return [y0 - p, y1 + p];
  }

  /** The y range of positive values for a log axis. @param {number[]} vals */
  function logRange(vals) {
    const pos = vals.filter((v) => v > 0 && Number.isFinite(v));
    if (!pos.length) return /** @type {[number, number]} */ ([1e-6, 1]);
    return /** @type {[number, number]} */ ([10 ** Math.floor(Math.log10(Math.min(...pos))), 10 ** Math.ceil(Math.log10(Math.max(...pos)))]);
  }

  /**
   * The law of the focus variable: the PMF (or the PDF of a continuous law), CDF, survival function or quantile
   * function, with the reference law as a line and the run's frequencies as bars or steps. A continuous law draws its
   * run as a histogram of densities, with bins of the given width, and its reference law as a smooth line.
   * @param {{ kind: "pmf" | "cdf" | "survival" | "quantile", ylog: boolean, xlabel: string, theory: { x: number[], y: number[] } | null,
   *   empirical: { x: number[], y: number[] } | null, n: number, note?: string, continuous?: boolean, width?: number }} o
   */
  function distribution(o) {
    const cont = !!o.continuous;
    const names = { pmf: cont ? "PDF" : "PMF", cdf: "CDF", survival: "Survival function", quantile: "Quantile function" };
    const label = `${names[o.kind]} of ${o.xlabel}: ${o.theory ? "reference law as a line" : "no reference law"}${o.empirical ? `, frequencies of ${o.n.toLocaleString("en-US")} draws as ${o.kind === "pmf" ? "bars" : "steps"}` : ""}`;
    const all = [...(o.theory?.x ?? []), ...(o.empirical?.x ?? [])];
    const allY = [...(o.theory?.y ?? []), ...(o.empirical?.y ?? [])];
    if (!all.length) return svg(label, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">No values to draw yet.</text>`);
    const xq = o.kind === "quantile";
    let x0 = xq ? 0 : Math.min(...all), x1 = xq ? 1 : Math.max(...all);
    if (!xq && x0 === x1) { x0 -= 1; x1 += 1; }
    const ylog = o.ylog && !xq && o.kind !== "cdf";
    // A support that spans more than 3 decades from 1 or more, such as a zeta tail, reads on a log x axis.
    const xlog = !xq && x0 >= 1 && x1 / x0 > 1000;
    const yr = ylog ? logRange(allY) : xq ? /** @type {[number, number]} */ ([Math.min(...allY), Math.max(...allY) || 1]) : /** @type {[number, number]} */ ([0, Math.max(...allY, 1e-12) * (o.kind === "pmf" ? 1.1 : 1)]);
    if (xq && yr[0] === yr[1]) { yr[0] -= 1; yr[1] += 1; }
    const pad = cont ? (o.kind === "pmf" ? (o.width ?? 0) / 2 : 0) : !xq && !xlog && Number.isInteger(x0) ? 0.5 : 0;
    const f = frame({ x: [x0 - pad, x1 + pad], y: yr, xlog, ylog, xlabel: xq ? "u" : `${o.xlabel}${xlog ? " (log axis)" : ""}`, ylabel: xq ? o.xlabel : names[o.kind], xint: !cont && !xq && pad > 0 });
    const parts = [f.markup];
    if (o.empirical) {
      const e = o.empirical;
      if (o.kind === "pmf" && cont) {
        // A histogram: each bar spans its bin, centred on x.
        const half = (o.width ?? 0) / 2;
        parts.push('<g class="bars">');
        e.x.forEach((x, i) => {
          if (!(e.y[i] > 0)) return;
          const l = f.sx(x - half), r = f.sx(x + half), top = f.sy(e.y[i]), base = f.sy(ylog ? yr[0] : 0);
          parts.push(`<rect x="${l.toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(0.5, r - l).toFixed(1)}" height="${Math.max(0, base - top).toFixed(1)}"/>`);
        });
        parts.push("</g>");
      } else if (o.kind === "pmf") {
        const w = Math.max(1, Math.min(18, (f.sx(x0 + 1) - f.sx(x0)) * 0.7));
        parts.push('<g class="bars">');
        e.x.forEach((x, i) => {
          if (!(e.y[i] > 0)) return;
          const top = f.sy(e.y[i]), base = f.sy(ylog ? yr[0] : 0);
          parts.push(`<rect x="${(f.sx(x) - w / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, base - top).toFixed(1)}"/>`);
        });
        parts.push("</g>");
      } else parts.push(`<path class="series s1" d="${steps(e.x, e.y, f.sx, f.sy, xq ? 1 : x1 + pad)}"/>`);
    }
    if (o.theory) {
      const t = o.theory;
      if (cont && !xq) {
        const keep = t.x.map((_, i) => i).filter((i) => !ylog || t.y[i] > 0);
        parts.push(`<path class="series s2 ref-law" d="${path(keep.map((i) => t.x[i]), keep.map((i) => t.y[i]), f.sx, f.sy)}"/>`);
      } else if (o.kind === "pmf") {
        parts.push('<g class="pmf-ref">');
        t.x.forEach((x, i) => { if (!ylog || t.y[i] > 0) parts.push(`<circle cx="${f.sx(x).toFixed(1)}" cy="${f.sy(t.y[i]).toFixed(1)}" r="2.6"/>`); });
        parts.push("</g>");
      } else parts.push(`<path class="series s2 ref-law" d="${steps(t.x, t.y, f.sx, f.sy, xq ? 1 : x1 + pad)}"/>`);
    }
    const key = [o.empirical ? (o.kind === "pmf" ? (cont ? "bars: histogram of the run" : "bars: frequencies in the run") : "blue steps: the run") : "", o.theory ? (o.kind === "pmf" ? (cont ? "orange: reference PDF" : "dots: reference PMF") : "orange: reference law") : ""].filter(Boolean).join(" · ");
    parts.push(`<text class="direct-label" x="${W - M.r}" y="${M.t - 4}" text-anchor="end">${esc(key)}</text>`);
    return svg(label, parts.join(""));
  }

  /**
   * The estimate after each block, with its 95 % interval as a band and the reference value as a dashed line, on a
   * log axis of the sample count.
   * @param {{ trace: { n: number, est: number | null, lo: number | null, hi: number | null }[], reference: number | null, ylabel: string, ylog?: boolean, note?: string }} o
   */
  function convergence(o) {
    const pts = o.trace.filter((p) => p.est !== null && Number.isFinite(/** @type {number} */ (p.est)));
    const label = `Estimate of ${o.ylabel} against the sample count n on a log axis${o.reference !== null ? ", with the reference value as a dashed line" : ""}`;
    if (!pts.length) return svg(label, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Run the experiment to draw the estimate.</text>`);
    const ns = pts.map((p) => p.n);
    const vals = [...pts.map((p) => /** @type {number} */ (p.est)), ...pts.flatMap((p) => [p.lo, p.hi]).filter((v) => v !== null && Number.isFinite(v)).map(Number), ...(o.reference !== null ? [o.reference] : [])];
    let [y0, y1] = o.ylog ? logRange(vals) : padRange(vals, 0.06);
    const x0 = Math.min(...ns), x1 = Math.max(...ns) > x0 ? Math.max(...ns) : x0 * 2;
    const f = frame({ x: [x0, x1], y: [y0, y1], xlog: true, ylog: !!o.ylog, xlabel: "Sample count n (log axis)", ylabel: o.ylabel });
    const parts = [f.markup];
    const band = pts.filter((p) => p.lo !== null && p.hi !== null);
    if (band.length > 1) {
      const top = band.map((p) => `${f.sx(p.n).toFixed(1)} ${f.sy(Math.min(y1, /** @type {number} */ (p.hi))).toFixed(1)}`), bottom = band.slice().reverse().map((p) => `${f.sx(p.n).toFixed(1)} ${f.sy(Math.max(y0, /** @type {number} */ (p.lo))).toFixed(1)}`);
      parts.push(`<path class="band" d="M${top.join("L")}L${bottom.join("L")}Z"/>`);
    }
    if (o.reference !== null) parts.push(`<line class="ref" x1="${M.l}" x2="${W - M.r}" y1="${f.sy(o.reference).toFixed(1)}" y2="${f.sy(o.reference).toFixed(1)}"/><text class="direct-label" x="${W - M.r}" y="${(f.sy(o.reference) - 5).toFixed(1)}" text-anchor="end">reference ${esc(fmt(o.reference))}</text>`);
    parts.push(`<path class="series s1" d="${path(ns, pts.map((p) => /** @type {number} */ (p.est)), f.sx, f.sy)}"/>`);
    return svg(label, parts.join(""));
  }

  /**
   * Estimates of one quantity by several methods or alternatives, each with its interval, and the time and the
   * variance for each replicate.
   * @param {{ rows: { label: string, est: number | null, lo: number | null, hi: number | null, reference?: number | null }[], ylabel: string }} o
   */
  function comparison(o) {
    const rows = o.rows.filter((r) => r.est !== null);
    const label = `Estimates of ${o.ylabel} with 95 % intervals: ${rows.map((r) => `${r.label} ${fmt(/** @type {number} */ (r.est))}`).join(", ")}`;
    if (!rows.length) return svg(label, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">No estimates yet.</text>`);
    const vals = rows.flatMap((r) => [r.est, r.lo, r.hi, r.reference ?? null]).filter((v) => v !== null && Number.isFinite(v)).map(Number);
    const [y0, y1] = padRange(vals, 0.1);
    const sy = scale(y0, y1, H - M.b, M.t, false), yt = ticks(y0, y1, 5), ystep = yt.length > 1 ? yt[1] - yt[0] : 0;
    const band = (W - M.l - M.r) / rows.length;
    const parts = ['<g class="grid">', ...yt.map((v) => `<line x1="${M.l}" x2="${W - M.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}"/>`), '</g><g class="axis">',
      `<line x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${H - M.b}"/></g><g class="tick">`, ...yt.map((v) => `<text x="${M.l - 6}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end">${esc(tickLabel(v, ystep))}</text>`), "</g>",
      `<text class="axis-title" transform="translate(14 ${(M.t + H - M.b) / 2}) rotate(-90)" text-anchor="middle">${esc(o.ylabel)}</text>`];
    rows.forEach((r, i) => {
      const cx = M.l + band * (i + 0.5);
      if (r.lo !== null && r.hi !== null) parts.push(`<line class="series s${(i % 4) + 1}" x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${sy(r.lo).toFixed(1)}" y2="${sy(r.hi).toFixed(1)}"/>`);
      parts.push(`<circle class="dot s${(i % 4) + 1}" cx="${cx.toFixed(1)}" cy="${sy(/** @type {number} */ (r.est)).toFixed(1)}" r="5"/>`);
      if (r.reference !== null && r.reference !== undefined) parts.push(`<line class="ref" x1="${(cx - band * 0.3).toFixed(1)}" x2="${(cx + band * 0.3).toFixed(1)}" y1="${sy(r.reference).toFixed(1)}" y2="${sy(r.reference).toFixed(1)}"/>`);
      parts.push(`<text class="direct-label" x="${cx.toFixed(1)}" y="${H - M.b + 18}" text-anchor="middle">${esc(r.label.length > 28 ? `${r.label.slice(0, 27)}…` : r.label)}</text>`);
    });
    parts.push(`<text x="${W - M.r}" y="${M.t - 4}" text-anchor="end">dashed: reference value</text>`);
    return svg(label, parts.join(""));
  }

  /**
   * A sweep: the estimate of one quantity against one parameter, with intervals and the reference values.
   * @param {{ x: number[], est: (number | null)[], lo: (number | null)[], hi: (number | null)[], ref: (number | null)[], xlabel: string, ylabel: string }} o
   */
  function sweep(o) {
    const label = `Sweep of ${o.xlabel}: estimate of ${o.ylabel} at ${o.x.length} values, with 95 % intervals${o.ref.some((v) => v !== null) ? " and reference values" : ""}`;
    const vals = [...o.est, ...o.lo, ...o.hi, ...o.ref].filter((v) => v !== null && Number.isFinite(v)).map(Number);
    if (!vals.length || o.x.length < 2) return svg(label, `<text x="${W / 2}" y="${H / 2}" text-anchor="middle">Run a sweep to draw it.</text>`);
    const [y0, y1] = padRange(vals, 0.06);
    const f = frame({ x: [Math.min(...o.x), Math.max(...o.x)], y: [y0, y1], xlabel: o.xlabel, ylabel: o.ylabel });
    const parts = [f.markup];
    o.x.forEach((x, i) => {
      const lo = o.lo[i], hi = o.hi[i], e = o.est[i];
      if (lo !== null && hi !== null) parts.push(`<line class="series s1" x1="${f.sx(x).toFixed(1)}" x2="${f.sx(x).toFixed(1)}" y1="${f.sy(lo).toFixed(1)}" y2="${f.sy(hi).toFixed(1)}"/>`);
      if (e !== null) parts.push(`<circle class="dot s1" cx="${f.sx(x).toFixed(1)}" cy="${f.sy(e).toFixed(1)}" r="3.5"/>`);
    });
    const rx = o.x.filter((_, i) => o.ref[i] !== null), ry = o.ref.filter((v) => v !== null).map(Number);
    if (rx.length > 1) parts.push(`<path class="series s2 ref-law" d="${path(rx, ry, f.sx, f.sy)}"/>`);
    parts.push(`<text class="direct-label" x="${W - M.r}" y="${M.t - 4}" text-anchor="end">blue: estimates · orange: reference</text>`);
    return svg(label, parts.join(""));
  }

  /**
   * The dependency graph of a model: parameters, random variables, definitions and quantities in layers, with an
   * arrow from each name to each name that reads it.
   * @param {{ nodes: { id: string, kind: "param" | "var" | "def" | "quantity", label: string, sub?: string }[], edges: [string, string][] }} g
   */
  function graph(g) {
    const depth = new Map(g.nodes.map((n) => [n.id, 0]));
    for (let pass = 0; pass < g.nodes.length; pass++) for (const [a, b] of g.edges) depth.set(b, Math.max(/** @type {number} */ (depth.get(b)), /** @type {number} */ (depth.get(a)) + 1));
    const layers = /** @type {string[][]} */ ([]);
    for (const n of g.nodes) (layers[/** @type {number} */ (depth.get(n.id))] ??= []).push(n.id);
    const rowH = 64, h = Math.max(140, layers.length * rowH + 30), pos = new Map();
    layers.forEach((ids, d) => ids.forEach((id, i) => pos.set(id, { x: (W * (i + 1)) / (ids.length + 1), y: 34 + d * rowH })));
    const label = `Dependency graph: ${g.nodes.length} names in ${layers.length} layers. An arrow points from a name to each name that reads it`;
    const parts = ['<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="arrowhead"/></marker></defs>'];
    for (const [a, b] of g.edges) {
      const p = pos.get(a), q = pos.get(b);
      if (!p || !q) continue;
      parts.push(`<line class="edge" x1="${p.x.toFixed(1)}" y1="${(p.y + 14).toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${(q.y - 16).toFixed(1)}" marker-end="url(#arrow)"/>`);
    }
    for (const n of g.nodes) {
      const p = pos.get(n.id), w = Math.min(150, 18 + n.label.length * 7.2);
      const shape = n.kind === "var" ? `<ellipse cx="${p.x.toFixed(1)}" cy="${p.y}" rx="${(w / 2).toFixed(1)}" ry="14"/>`
        : n.kind === "def" ? `<rect x="${(p.x - w / 2).toFixed(1)}" y="${p.y - 14}" width="${w.toFixed(1)}" height="28" rx="4"/>`
          : n.kind === "quantity" ? `<rect x="${(p.x - w / 2).toFixed(1)}" y="${p.y - 14}" width="${w.toFixed(1)}" height="28" rx="14"/>`
            : `<rect x="${(p.x - w / 2).toFixed(1)}" y="${p.y - 14}" width="${w.toFixed(1)}" height="28"/>`;
      parts.push(`<g class="node ${n.kind}"><title>${esc(n.sub ?? n.label)}</title>${shape}<text x="${p.x.toFixed(1)}" y="${p.y + 4}" text-anchor="middle">${esc(n.label.length > 20 ? `${n.label.slice(0, 19)}…` : n.label)}</text></g>`);
    }
    return `<svg class="chart graph" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><title>${esc(label)}</title>${parts.join("")}</svg>`;
  }

  return { fmt, tickLabel, padRange, ticks, logTicks, scale, distribution, convergence, comparison, sweep, graph, W, H };
});
