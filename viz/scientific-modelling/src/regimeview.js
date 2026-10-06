/* Scientific Modelling: the views of piece 3, in the browser only. RegimeView.render draws the Regime Map Builder
 * from derive()'s regime data: the controls, the 2D slice or the 1D diagram as an SVG at the measured width of its
 * container (so its text keeps its size on a phone), the legend, the fixed items beside the map, the inspection of a
 * point or a boundary, the dominant-balance and asymptotic derivations (hand calculation item 8), the table view
 * and the declaration with its acceptance checks. RegimeView.catalogue draws the Model catalogue tab. Every value
 * that a tooltip shows is also in the inspection or the table view. Text that comes from the record goes through
 * the escaping helper of view.js; the SVG labels are set with textContent.
 */
(function () {
  "use strict";

  const SVG = "http://www.w3.org/2000/svg";
  /** The hue of each group of approximations, in fixed order; a fifth group and later ones are muted, with labels. */
  const HUES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];
  const LAYER_KINDS = ["approximation", "balance", "stability", "bifurcation", "empirical", "limits"];
  const KIND_NAMES = { approximation: "Approximation error", balance: "Balances", stability: "Stability", bifurcation: "Bifurcations", empirical: "Empirical boundaries", limits: "Limit paths" };
  /** The line of a boundary: a stability boundary is solid, a bifurcation boundary dashed and an empirical boundary dotted, all in the text colour. @param {any} l */
  const lineStyle = (l) => (l.kind === "stability" ? { stroke: "var(--fg)", dash: null } : l.kind === "bifurcation" ? { stroke: "var(--fg)", dash: "6 4" } : l.kind === "empirical" ? { stroke: "var(--fg)", dash: "2 4" } : null);
  /** @type {any} */
  let H = null;
  /** @type {any} */
  let app = null;

  /** @param {number | null | undefined} x */
  function fmt(x) {
    if (x === null || x === undefined || !Number.isFinite(x)) return "–";
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e5) return String(Number(x.toPrecision(4)));
    const [m, e] = x.toExponential(2).split("e");
    return `${Number(m)}×10^${Number(e)}`;
  }
  /** Tick text of a decade: 0.001, 0.01, …, 1000, then 10^k. @param {number} k */
  const decade = (k) => (k >= -4 && k <= 5 ? String(Number((10 ** k).toPrecision(1))) : `1e${k}`);
  /** @param {string} tex */
  const uniLabel = (tex) => SM.F.uni(String(tex).replace(/\\ell/g, "ℓ"));

  /** @param {string} tag @param {Record<string, any>} attrs @param {string} [text] */
  function el(tag, attrs = {}, text) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /** The hue of each layer: approximation groups take c1…c4 in order of first appearance. @param {any[]} layers */
  function hues(layers) {
    const groups = [];
    for (const l of layers) if (l.kind === "approximation" && !groups.includes(l.hue)) groups.push(l.hue);
    /** @type {Record<string, string>} */
    const out = {};
    for (const l of layers) out[l.id] = l.kind === "approximation" ? (HUES[groups.indexOf(l.hue)] ?? "var(--muted)") : "var(--muted)";
    return out;
  }
  /** Is a member of its group the lower order, drawn thinner? @param {any[]} layers @param {any} l */
  const secondary = (layers, l) => layers.filter((x) => x.kind === "approximation" && x.hue === l.hue).indexOf(l) > 0;
  /** @param {Record<string, any>} state */
  const shownKinds = (state) => String(state.layers ?? "").split(",").map((s) => s.trim()).filter((s) => LAYER_KINDS.includes(s));

  /* ---------- the scales of a plot ---------- */

  /** @param {any} axis @param {number} a @param {number} b */
  function scaleOf(axis, a, b) {
    const log = Boolean(axis.log);
    const u = (/** @type {number} */ x) => (log ? Math.log10(x) : x);
    const u0 = u(axis.min), u1 = u(axis.max);
    return { log, map: (/** @type {number} */ x) => a + ((u(x) - u0) / (u1 - u0)) * (b - a), inv: (/** @type {number} */ p) => { const v = u0 + ((p - a) / (b - a)) * (u1 - u0); return log ? 10 ** v : v; }, u0, u1 };
  }
  /** Ticks: decades on a log axis, about five round values on a linear one. @param {any} s @param {any} axis */
  function ticks(s, axis) {
    if (s.log) {
      const out = [];
      for (let k = Math.ceil(s.u0 - 1e-9); k <= Math.floor(s.u1 + 1e-9); k++) out.push({ v: 10 ** k, t: decade(k) });
      return out;
    }
    const span = axis.max - axis.min, step0 = span / 5, mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((x) => x >= step0) ?? step0;
    const out = [];
    for (let v = Math.ceil(axis.min / step) * step; v <= axis.max + 1e-12; v += step) out.push({ v, t: fmt(Number(v.toPrecision(6))) });
    return out;
  }

  /** The axes, gridlines and titles of a plot. @param {SVGElement} svg @param {any} box @param {any} sx @param {any} sy @param {any} ax @param {any} ay */
  function axes(svg, box, sx, sy, ax, ay) {
    const grid = el("g", { class: "grid" }), axis = el("g", { class: "axis" }), tickG = el("g", { class: "tick" });
    for (const t of ticks(sx, ax)) {
      const x = sx.map(t.v);
      grid.append(el("line", { x1: x, x2: x, y1: box.t, y2: box.t + box.h }));
      tickG.append(el("text", { x, y: box.t + box.h + 16, "text-anchor": "middle" }, t.t));
    }
    if (ay) for (const t of ticks(sy, ay)) {
      const y = sy.map(t.v);
      grid.append(el("line", { x1: box.l, x2: box.l + box.w, y1: y, y2: y }));
      tickG.append(el("text", { x: box.l - 6, y: y + 4, "text-anchor": "end" }, t.t));
    }
    axis.append(el("line", { x1: box.l, x2: box.l + box.w, y1: box.t + box.h, y2: box.t + box.h }), el("line", { x1: box.l, x2: box.l, y1: box.t, y2: box.t + box.h }));
    svg.append(grid, axis, tickG);
    const title = (/** @type {any} */ a) => `${a.tex ? `${uniLabel(a.tex)}: ` : ""}${a.label}${a.log ? " (log)" : ""}`;
    svg.append(el("text", { class: "axis-title", x: box.l + box.w / 2, y: box.t + box.h + 34, "text-anchor": "middle" }, title(ax)));
    if (ay) svg.append(el("text", { class: "axis-title", transform: `translate(14 ${box.t + box.h / 2}) rotate(-90)`, "text-anchor": "middle" }, title(ay)));
  }

  /** A hatch pattern for unresolved points. @param {SVGElement} svg */
  function defs(svg) {
    const d = el("defs");
    const p = el("pattern", { id: "rm-hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    p.append(el("rect", { width: 6, height: 6, fill: "var(--surface)" }), el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: "var(--faint)", "stroke-width": 2 }));
    const arrow = el("marker", { id: "rm-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    arrow.append(el("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--muted)" }));
    d.append(p, arrow);
    svg.append(d);
  }

  /* ---------- the 2D slice ---------- */

  /** @param {any} rg @param {Record<string, any>} state @param {HTMLElement} host */
  function slice(rg, state, host) {
    const W = Math.max(300, Math.round(host.clientWidth || 640));
    const box = { l: W < 480 ? 48 : 60, r: 18, t: 12, h: 0, w: 0 };
    box.w = W - box.l - box.r;
    box.h = Math.round(Math.min(440, Math.max(240, box.w * 0.62)));
    const Hh = box.t + box.h + 44;
    const svg = el("svg", { class: "chart map-svg", viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: "img", tabindex: 0,
      "aria-label": `Regime map of ${rg.declaration.title}: ${uniLabel(rg.axes.x.tex)} across, ${uniLabel(rg.axes.y.tex)} up. Arrow keys move the inspected point; the table view below lists every boundary.` });
    defs(svg);
    const sx = scaleOf(rg.axes.x, box.l, box.l + box.w), sy = scaleOf(rg.axes.y, box.t + box.h, box.t);
    const xs = rg.grid.xs, ys = rg.grid.ys, nx = xs.length;
    const kinds = shownKinds(state);
    const hue = hues(rg.layers);
    // The shading: the field of the shaded layer, in bins of its thresholds.
    const shadeL = rg.layers.find((/** @type {any} */ l) => l.id === rg.shade);
    const cells = el("g", { class: "cells" });
    const edge = (/** @type {number[]} */ vals, /** @type {any} */ s, /** @type {number} */ i) => (i <= 0 ? s.map(vals[0]) : i >= vals.length ? s.map(vals[vals.length - 1]) : (s.map(vals[i - 1]) + s.map(vals[i])) / 2);
    const unresolved = rg.unresolved.mask ?? "";
    for (let iy = 0; iy < ys.length; iy++) for (let ix = 0; ix < nx; ix++) {
      const k = iy * nx + ix;
      const x0 = edge(xs, sx, ix), x1 = edge(xs, sx, ix + 1), y0 = edge(ys, sy, iy), y1 = edge(ys, sy, iy + 1);
      let fill = null, op = 0;
      if (unresolved[k] === "1") fill = "url(#rm-hatch)", op = 1;
      else if (shadeL) {
        const v = shadeL.field ? shadeL.field[k] : null;
        if (shadeL.kind === "approximation" && v !== null) {
          const lt = Math.log10(rg.tolerance);
          op = v <= lt ? 0 : v <= lt + 1 ? 0.1 : v <= lt + 2 ? 0.22 : 0.36;
          fill = "var(--fg)";
        } else {
          const r = shadeL.regions.findIndex((/** @type {any} */ x) => x.mask && x.mask[k] === "1");
          fill = r === 0 ? "var(--c1)" : r === shadeL.regions.length - 1 ? "var(--c2)" : r > 0 ? "var(--faint)" : null;
          op = r === 0 || r === shadeL.regions.length - 1 ? 0.16 : 0.12;
        }
      }
      if (fill && op) cells.append(el("rect", { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0) + 0.5, height: Math.abs(y1 - y0) + 0.5, fill, "fill-opacity": op === 1 ? null : op }));
    }
    svg.append(cells);
    axes(svg, box, sx, sy, rg.axes.x, rg.axes.y);
    // Limit paths, under the boundaries.
    const limits = el("g", { class: "limits" });
    for (const L of kinds.includes("limits") ? rg.limits : []) {
      if (!L.onSlice || L.points.length < 2) continue;
      const d = L.points.map((/** @type {number[]} */ p, /** @type {number} */ i) => `${i ? "L" : "M"}${sx.map(p[0]).toFixed(1)},${sy.map(p[1]).toFixed(1)}`).join("");
      limits.append(el("path", { d, fill: "none", stroke: "var(--muted)", "stroke-width": 1, "stroke-opacity": 0.55, "marker-end": "url(#rm-arrow)" }));
    }
    svg.append(limits);
    // Boundaries: approximation boundaries in their hue, balance crossovers as reference lines.
    const lines = el("g", { class: "boundaries" });
    const labels = el("g", { class: "labels" });
    // Direct labels go where they overlap no other label and no marker; a label with no free place is left to the legend.
    const placed = [{ x: sx.map(rg.point.p[rg.axes.x.id]) - 10, y: sy.map(rg.point.p[rg.axes.y.id]) - 10, w: 20, h: 20 }];
    if (rg.record) placed.push({ x: sx.map(rg.record[0]) - 8, y: sy.map(rg.record[1]) - 8, w: 16, h: 16 });
    for (const p of rg.intersections) placed.push({ x: sx.map(p.x) - 6, y: sy.map(p.y) - 6, w: 12, h: 12 });
    const free = (/** @type {any} */ b) => b.x >= box.l && b.x + b.w <= box.l + box.w && b.y >= box.t && b.y + b.h <= box.t + box.h && placed.every((q) => b.x > q.x + q.w || b.x + b.w < q.x || b.y > q.y + q.h || b.y + b.h < q.y);
    const label = (/** @type {number[][]} */ pts, /** @type {string} */ text) => {
      const w = text.length * 7 + 6, h = 14;
      for (const f of [0.97, 0.03, 0.85, 0.15, 0.7, 0.3, 0.5]) {
        const at = pts[Math.min(pts.length - 1, Math.floor(pts.length * f))];
        const x = sx.map(at[0]), y = sy.map(at[1]);
        for (const [dx, dy] of [[4, -6], [-w - 4, -6], [4, h + 4], [-w - 4, h + 4]]) {
          const b = { x: x + dx, y: y + dy - h, w, h };
          if (!free(b)) continue;
          placed.push(b);
          labels.append(el("text", { x: b.x + 3, y: b.y + h - 3, class: "direct-label map-label" }, text));
          return;
        }
      }
    };
    rg.layers.forEach((/** @type {any} */ l) => {
      if (!kinds.includes(l.kind)) return;
      for (const c of l.curves) {
        if (c.points.length < 2) continue;
        const d = c.points.map((/** @type {number[]} */ p, /** @type {number} */ i) => `${i ? "L" : "M"}${sx.map(p[0]).toFixed(1)},${sy.map(p[1]).toFixed(1)}`).join("");
        const picked = state.pick === c.id;
        const g = el("g", { class: "curve", "data-pick": c.id });
        g.append(el("path", { d, fill: "none", stroke: "transparent", "stroke-width": 14 }));
        const ls = lineStyle(l);
        g.append(el("path", { d, fill: "none", class: l.kind === "balance" ? "ref" : "series", stroke: l.kind === "balance" ? null : ls ? ls.stroke : hue[l.id], "stroke-dasharray": ls?.dash ?? null,
          "stroke-width": picked ? 3.5 : l.kind === "balance" ? 1.5 : ls ? 2 : secondary(rg.layers, l) ? 1.5 : 2.5 }));
        lines.append(g);
        if (c.points.length >= 4) label(c.points, l.title);
      }
    });
    svg.append(lines, labels);
    // Intersections, the record's point and the inspected point.
    const marks = el("g", { class: "marks" });
    for (const p of rg.intersections) marks.append(el("rect", { x: sx.map(p.x) - 3.5, y: sy.map(p.y) - 3.5, width: 7, height: 7, transform: `rotate(45 ${sx.map(p.x)} ${sy.map(p.y)})`, fill: "var(--muted)", stroke: "var(--bg)", "stroke-width": 2 }));
    if (rg.record) marks.append(el("circle", { cx: sx.map(rg.record[0]), cy: sy.map(rg.record[1]), r: 5, class: "hl", stroke: "var(--bg)", "stroke-width": 2 }));
    const pt = rg.point.p;
    const px = sx.map(pt[rg.axes.x.id]), py = sy.map(pt[rg.axes.y.id]);
    marks.append(el("circle", { cx: px, cy: py, r: 7, fill: "none", stroke: "var(--fg)", "stroke-width": 2 }));
    svg.append(marks);
    // The hover cell and the tooltip.
    const hover = el("rect", { width: 0, height: 0, fill: "none", stroke: "var(--fg)", "stroke-width": 1, visibility: "hidden" });
    svg.append(hover);
    host.replaceChildren(svg);
    const tip = document.createElement("div");
    tip.className = "tip map-tip";
    tip.hidden = true;
    host.append(tip);
    const nearest = (/** @type {number} */ x, /** @type {number} */ y) => {
      let ix = 0, iy = 0, bx = Infinity, by = Infinity;
      xs.forEach((v, i) => { const d = Math.abs(sx.map(v) - x); if (d < bx) { bx = d; ix = i; } });
      ys.forEach((v, i) => { const d = Math.abs(sy.map(v) - y); if (d < by) { by = d; iy = i; } });
      return { ix, iy };
    };
    const local = (/** @type {PointerEvent | MouseEvent} */ e) => { const r = svg.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * Hh }; };
    svg.addEventListener("pointermove", (e) => {
      const { x, y } = local(e);
      if (x < box.l || x > box.l + box.w || y < box.t || y > box.t + box.h) { tip.hidden = true; hover.setAttribute("visibility", "hidden"); return; }
      const { ix, iy } = nearest(x, y);
      const k = iy * nx + ix;
      const cx = sx.map(xs[ix]), cy = sy.map(ys[iy]);
      hover.setAttribute("x", String(cx - 4)); hover.setAttribute("y", String(cy - 4)); hover.setAttribute("width", "8"); hover.setAttribute("height", "8"); hover.setAttribute("visibility", "visible");
      const rows = [`${uniLabel(rg.axes.x.tex)} = ${fmt(xs[ix])}, ${uniLabel(rg.axes.y.tex)} = ${fmt(ys[iy])}`];
      if (unresolved[k] === "1") rows.push("Unresolved");
      else {
        if (shadeL?.field && shadeL.field[k] !== null) rows.push(`${shadeL.title}: ${shadeL.scale === "log" ? fmt(10 ** shadeL.field[k]) : fmt(shadeL.field[k])}`);
        for (const l of rg.layers) {
          if (l.kind === "approximation") rows.push(`${l.title}: ${l.regions[0].mask[k] === "1" ? "meets the tolerance" : "does not meet it"}`);
          else { const r = l.regions.find((/** @type {any} */ x) => x.mask[k] === "1"); if (r) rows.push(`${l.title}: ${r.label}`); }
        }
      }
      tip.replaceChildren(...rows.map((t, i) => { const p = document.createElement(i ? "div" : "strong"); p.textContent = t; return p; }));
      tip.hidden = false;
      const hr = host.getBoundingClientRect(), sr = svg.getBoundingClientRect();
      const left = (cx / W) * sr.width + sr.left - hr.left, top = (cy / Hh) * sr.height + sr.top - hr.top;
      tip.style.left = `${Math.min(Math.max(0, left + 12), hr.width - 220)}px`;
      tip.style.top = `${top + 12}px`;
    });
    svg.addEventListener("pointerleave", () => { tip.hidden = true; hover.setAttribute("visibility", "hidden"); });
    svg.addEventListener("click", (e) => {
      const target = /** @type {Element} */ (e.target).closest("[data-pick]");
      if (target) { app.set({ pick: target.getAttribute("data-pick") ?? "" }); return; }
      const { x, y } = local(e);
      if (x < box.l || x > box.l + box.w || y < box.t || y > box.t + box.h) return;
      app.set({ point: `${Number(sx.inv(x).toPrecision(4))},${Number(sy.inv(y).toPrecision(4))}`, pick: "" });
    });
    svg.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (!step) return;
      e.preventDefault();
      const { ix, iy } = nearest(px, py);
      const jx = Math.min(nx - 1, Math.max(0, ix + step[0])), jy = Math.min(ys.length - 1, Math.max(0, iy + step[1]));
      app.set({ point: `${Number(xs[jx].toPrecision(4))},${Number(ys[jy].toPrecision(4))}`, pick: "" }, "replace");
    });
    return { kinds, hue };
  }

  /* ---------- the 1D diagram ---------- */

  /** @param {any} rg @param {Record<string, any>} state @param {HTMLElement} host */
  function diagram(rg, state, host) {
    const W = Math.max(300, Math.round(host.clientWidth || 640));
    const kinds = shownKinds(state);
    const hue = hues(rg.layers);
    // Errors and term ratios share the logarithmic axis; stability and bifurcation layers are strips of their regions.
    const shown = rg.layers.filter((/** @type {any} */ l) => kinds.includes(l.kind) && (l.kind === "approximation" || l.kind === "balance"));
    const regionRows = rg.layers.filter((/** @type {any} */ l) => kinds.includes(l.kind) && (l.kind === "stability" || l.kind === "bifurcation" || l.kind === "empirical"));
    const box = { l: W < 480 ? 54 : 72, r: 18, t: 12, w: 0, h: Math.round(Math.min(300, Math.max(200, W * 0.42))) };
    box.w = W - box.l - box.r;
    const strip = 30, stripTop = box.t + box.h + 66;
    const rows = [...rg.layers.filter((/** @type {any} */ l) => l.kind === "approximation"), ...(rg.approximations.length ? [{ id: "gap", title: "No approximation meets the tolerance" }] : []),
      ...regionRows.map((/** @type {any} */ l) => ({ id: l.id, title: l.title, layer: l })), ...(rg.unresolved.count ? [{ id: "unresolved", title: "Unresolved" }] : [])];
    const Hh = stripTop + rows.length * strip + 8;
    const svg = el("svg", { class: "chart map-svg", viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: "img", tabindex: 0,
      "aria-label": `1D regime diagram of ${rg.declaration.title} along ${uniLabel(rg.axes.x.tex)}: the error of each approximation and the ratio of each balance, and below it the intervals where each approximation meets the tolerance. Arrow keys move the inspected point.` });
    defs(svg);
    const sx = scaleOf(rg.axes.x, box.l, box.l + box.w);
    // A model without approximation layers draws its ratio-valued stability measures here, such as Ra/Ra_c.
    const ratios = rg.approximations.length ? [] : regionRows.filter((/** @type {any} */ l) => l.kind === "stability" && l.scale === "log");
    const ay = rg.approximations.length || !ratios.length ? { min: 1e-6, max: 1e3, log: true, tex: "", label: "error or term ratio" } : { min: 0.01, max: 100, log: true, tex: "", label: "ratio to the neutral value" };
    const sy = scaleOf(ay, box.t + box.h, box.t);
    axes(svg, box, sx, sy, rg.axes.x, ay);
    const clampY = (/** @type {number} */ v) => sy.map(Math.min(ay.max, Math.max(ay.min, v)));
    const refs = el("g");
    if (rg.approximations.length) refs.append(el("line", { class: "ref", x1: box.l, x2: box.l + box.w, y1: sy.map(rg.tolerance), y2: sy.map(rg.tolerance) }), el("text", { x: box.l + box.w - 4, y: sy.map(rg.tolerance) - 4, "text-anchor": "end", class: "direct-label" }, `tolerance ${rg.tolerance}`));
    if (ratios.length) refs.append(el("line", { class: "ref", x1: box.l, x2: box.l + box.w, y1: sy.map(1), y2: sy.map(1) }), el("text", { x: box.l + 4, y: sy.map(1) - 4, class: "direct-label" }, "neutral (ratio 1)"));
    if (kinds.includes("balance") && rg.layers.some((/** @type {any} */ l) => l.kind === "balance")) refs.append(el("line", { class: "ref", x1: box.l, x2: box.l + box.w, y1: sy.map(1), y2: sy.map(1) }), el("text", { x: box.l + 4, y: sy.map(1) - 4, class: "direct-label" }, "terms equal (ratio 1)"));
    svg.append(refs);
    const g = el("g");
    /** @type {number[]} */
    const taken = [sy.map(rg.tolerance) - 4];
    for (const l of [...shown, ...ratios]) {
      const pts = l.series.map((/** @type {number | null} */ v, /** @type {number} */ i) => (v === null ? null : [sx.map(rg.grid.xs[i]), clampY(v)]));
      let d = "", pen = false;
      for (const p of pts) { if (!p) { pen = false; continue; } d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`; pen = true; }
      const ls = lineStyle(l);
      g.append(el("path", { d, fill: "none", class: l.kind === "balance" ? "ref" : "series", stroke: l.kind === "balance" ? null : ls ? ls.stroke : hue[l.id], "stroke-dasharray": ls?.dash ?? null, "stroke-width": l.kind === "balance" ? 1.5 : secondary(rg.layers, l) ? 1.5 : 2 }));
      const last = pts.filter(Boolean).at(-1);
      if (last) {
        let y = Math.max(box.t + 12, last[1] - 4);
        while (taken.some((t) => Math.abs(t - y) < 14) && y < box.t + box.h) y += 14;
        taken.push(y);
        g.append(el("text", { x: box.l + box.w - 4, y, "text-anchor": "end", class: "direct-label map-label" }, l.title));
      }
    }
    svg.append(g);
    // The strips: where each approximation meets the tolerance, where none does, and the unresolved intervals.
    const s = el("g", { class: "strips" });
    svg.append(el("text", { x: box.l, y: stripTop - 4, class: "axis-title" }, rg.approximations.length ? `Where each approximation meets the tolerance ${rg.tolerance}` : "The regions of the stability and bifurcation layers"));
    rows.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
      const y = stripTop + i * strip + 14;
      s.append(el("text", { x: box.l, y: y - 3, class: "direct-label strip-label" }, r.title));
      s.append(el("rect", { x: box.l, y, width: box.w, height: strip - 18, fill: "var(--surface)" }));
      if (r.layer) {
        // Each region of a stability or bifurcation layer: the first and last in their hues, the others muted, with labels.
        r.layer.regions.forEach((/** @type {any} */ reg, /** @type {number} */ k) => {
          const fill = k === 0 ? "var(--c1)" : k === r.layer.regions.length - 1 ? "var(--c2)" : "var(--faint)";
          for (const [a, b] of reg.intervals ?? []) {
            const x0 = sx.map(a), x1 = sx.map(b);
            const rect = el("rect", { x: x0, y, width: Math.max(2, x1 - x0), height: strip - 18, rx: 2, fill, "fill-opacity": 0.45 });
            rect.append(el("title", {}, reg.label));
            s.append(rect);
          }
        });
        return;
      }
      const iv = r.id === "gap" ? rg.gap.intervals : r.id === "unresolved" ? rg.unresolved.intervals : r.regions.find((/** @type {any} */ x) => x.id === "meets").intervals;
      for (const [a, b] of iv) {
        const x0 = sx.map(a), x1 = sx.map(b);
        s.append(el("rect", { x: x0, y, width: Math.max(2, x1 - x0), height: strip - 18, rx: 2,
          fill: r.id === "gap" ? "var(--fg)" : r.id === "unresolved" ? "url(#rm-hatch)" : hue[r.id], "fill-opacity": r.id === "gap" ? 0.18 : r.id === "unresolved" ? null : 0.55 }));
      }
    });
    svg.append(s);
    const pt = rg.point.p;
    const px = sx.map(pt[rg.axes.x.id]);
    svg.append(el("line", { x1: px, x2: px, y1: box.t, y2: box.t + box.h, stroke: "var(--fg)", "stroke-width": 1.5 }), el("line", { x1: px, x2: px, y1: stripTop + 10, y2: stripTop + rows.length * strip, stroke: "var(--fg)", "stroke-width": 1.5 }));
    if (rg.record) svg.append(el("circle", { cx: sx.map(rg.record[0]), cy: box.t + box.h, r: 5, class: "hl", stroke: "var(--bg)", "stroke-width": 2 }));
    const cross = el("line", { y1: box.t, y2: box.t + box.h, stroke: "var(--axis)", "stroke-width": 1, visibility: "hidden" });
    svg.append(cross);
    host.replaceChildren(svg);
    const tip = document.createElement("div");
    tip.className = "tip map-tip";
    tip.hidden = true;
    host.append(tip);
    const local = (/** @type {PointerEvent | MouseEvent} */ e) => { const r = svg.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * Hh }; };
    const nearest = (/** @type {number} */ x) => { let i = 0, bd = Infinity; rg.grid.xs.forEach((/** @type {number} */ v, /** @type {number} */ k) => { const d = Math.abs(sx.map(v) - x); if (d < bd) { bd = d; i = k; } }); return i; };
    svg.addEventListener("pointermove", (e) => {
      const { x } = local(e);
      if (x < box.l || x > box.l + box.w) { tip.hidden = true; cross.setAttribute("visibility", "hidden"); return; }
      const i = nearest(x);
      const cx = sx.map(rg.grid.xs[i]);
      cross.setAttribute("x1", String(cx)); cross.setAttribute("x2", String(cx)); cross.setAttribute("visibility", "visible");
      const lines = [`${uniLabel(rg.axes.x.tex)} = ${fmt(rg.grid.xs[i])}`, ...rg.layers.map((/** @type {any} */ l) => `${l.title}: ${fmt(l.series[i])}`)];
      tip.replaceChildren(...lines.map((t, k) => { const p = document.createElement(k ? "div" : "strong"); p.textContent = t; return p; }));
      tip.hidden = false;
      const hr = host.getBoundingClientRect(), sr = svg.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(0, (cx / W) * sr.width + sr.left - hr.left + 12), hr.width - 220)}px`;
      tip.style.top = `${box.t + 8}px`;
    });
    svg.addEventListener("pointerleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
    svg.addEventListener("click", (e) => {
      const { x } = local(e);
      if (x < box.l || x > box.l + box.w) return;
      app.set({ point: `${Number(sx.inv(x).toPrecision(4))}`, pick: "" });
    });
    svg.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const i = Math.min(rg.grid.xs.length - 1, Math.max(0, nearest(px) + step));
      app.set({ point: `${Number(rg.grid.xs[i].toPrecision(4))}`, pick: "" }, "replace");
    });
    return { kinds, hue };
  }

  /* ---------- a small profile chart for the inspection ---------- */

  /** @param {any} rg @param {any} profile @param {HTMLElement} host */
  function profileChart(rg, profile, host) {
    const W = Math.max(280, Math.round(host.clientWidth || 520));
    const box = { l: 48, r: 12, t: 10, w: W - 60, h: 170 };
    const Hh = box.t + box.h + 40;
    const keys = Object.keys(profile.curves);
    const max = Math.max(1e-12, ...keys.flatMap((k) => profile.curves[k].filter((/** @type {any} */ v) => v !== null)));
    const ax = { min: 0, max: 1, log: false, tex: "X", label: "position from the centre" };
    const ay = { min: 0, max: Number((max * 1.05).toPrecision(2)), log: false, tex: "\\theta", label: "dimensionless temperature" };
    const svg = el("svg", { class: "chart profile-svg", viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, role: "img", "aria-label": "Profile at the inspected point: the reference solution and each approximation. The table beside it lists the values." });
    const sx = scaleOf(ax, box.l, box.l + box.w), sy = scaleOf(ay, box.t + box.h, box.t);
    axes(svg, box, sx, sy, ax, ay);
    const hue = hues(rg.layers);
    for (const k of keys) {
      const ys = profile.curves[k];
      const d = profile.xs.map((/** @type {number} */ x, /** @type {number} */ i) => `${i ? "L" : "M"}${sx.map(x).toFixed(1)},${sy.map(Math.min(ay.max, Math.max(0, ys[i] ?? 0))).toFixed(1)}`).join("");
      svg.append(el("path", { d, fill: "none", class: "series", stroke: k === "exact" ? "var(--fg)" : hue[k] ?? "var(--muted)", "stroke-width": k === "exact" ? 2.5 : 1.5 }));
    }
    const legend = document.createElement("ul");
    legend.className = "map-legend";
    for (const k of keys) {
      const li = document.createElement("li");
      const key = document.createElement("span");
      key.className = "key key-line";
      key.style.setProperty("--key", k === "exact" ? "var(--fg)" : hue[k] ?? "var(--muted)");
      key.style.setProperty("--w", k === "exact" ? "2.5px" : "1.5px");
      li.append(key, document.createTextNode(k === "exact" ? "Reference solution" : rg.layers.find((/** @type {any} */ l) => l.id === k)?.title ?? k));
      legend.append(li);
    }
    const cap = document.createElement("p");
    cap.className = "note";
    cap.textContent = profile.note || "The profile at the inspected point: the reference solution and each approximation.";
    host.replaceChildren(svg, legend, cap);
  }

  /* ---------- the panel ---------- */

  /** @param {Record<string, any>} state @param {any} d */
  function render(state, d) {
    const { esc, ti, td, chip, sourceLink } = H;
    const gate = byId("regime-gate"), main = byId("regime-main");
    const rg = d.regime;
    if (d.confirmedVersion === null) {
      gate.innerHTML = `<div class="callout"><p><strong>The Regime Map Builder runs on a confirmed interpretation.</strong> Read the interpretation of version ${d.version}. Then select "Confirm the interpretation".</p><p><button type="button" class="primary" data-confirm>Confirm version ${d.version}</button></p></div>`;
      main.hidden = true;
      return;
    }
    if (!rg || !rg.ready) {
      const r = rg ?? { reason: "no-declaration", message: "", next: "" };
      const blocked = r.reason === "blocked" ? (r.blockedBy ?? []).map((/** @type {string} */ id) => d.interp.issues.find((/** @type {any} */ i) => i.id === id)).filter(Boolean) : [];
      if (r.reason === "no-declaration" && d.stability?.kind === "custom") {
        gate.innerHTML = `<div class="callout"><p><strong>This record is a custom ODE system.</strong> The regime map needs a declared model. The stability and bifurcation analysis below runs on the custom system.</p></div>`;
        main.hidden = true;
        return;
      }
      gate.innerHTML = `<div class="callout ${r.reason === "no-declaration" ? "" : "bad"}"><p><strong>${r.reason === "no-declaration" ? "This record names no declared model." : r.reason === "blocked" ? "A failed check blocks the regime map." : r.reason === "mismatch" ? "The record's dimensionless model is not the declared model." : "The regime map cannot run on this record."}</strong> ${esc(r.message)}</p>
        ${blocked.map((/** @type {any} */ i) => `<p>${esc(i.message)} <span class="next">Next: ${esc(i.next)}</span></p>`).join("")}
        ${(r.problems ?? []).length ? `<ul class="issue-list">${r.problems.map((/** @type {string} */ p) => `<li>${chip("unresolved")} ${esc(p)}</li>`).join("")}</ul>` : ""}
        ${r.next ? `<p class="next">Next: ${esc(r.next)}</p>` : ""}
        <p>Standard examples with a declared model: ${["transient-slab", "transient-cylinder", "transient-sphere", "lumped-body", "volumetric-source", "multilayer-wall", "straight-fin", "rayleigh-benard", "enclosure-convection", "lumped-radiation", "surface-radiation", "convection-radiation", "euler-column", "beam-deflection", "elastica", "damped-oscillator", "beam-modes", "navier-plate", "cylindrical-shell", "thermal-rod", "thermal-plate"].map((id) => `<button type="button" data-load-example="${id}">${esc(Model.EXAMPLES.find((/** @type {any} */ e) => e.id === id)?.label ?? id)}</button>`).join(" ")}</p></div>`;
      main.hidden = true;
      return;
    }
    const stale = d.results.filter((/** @type {any} */ r) => !r.valid && r.id.startsWith("r-rm-"));
    gate.innerHTML = d.confirmed ? "" : `<div class="callout warn"><p><strong>Version ${d.version} is not confirmed.</strong> The map comes from confirmed version ${d.confirmedVersion}.</p><p>${stale.length ? `${stale.length} of its results read a changed input and show as invalidated.` : "No result of the map reads a changed input."}</p><p><button type="button" class="primary" data-confirm>Confirm version ${d.version}</button></p></div>`;
    main.hidden = false;

    const acc = rg.acceptance;
    const accOk = acc.every((/** @type {any} */ c) => c.passed);
    const meets = rg.point.layers.filter((/** @type {any} */ l) => l.meets);
    byId("regime-summary").innerHTML = [
      `<p class="summary-line"><strong>${esc(rg.declaration.title)}</strong>. ${chip("exact")} The record's dimensionless model equals the declared model.</p>`,
      `<ul class="model-list">${rg.match.equations.map((/** @type {any} */ e) => `<li>${td(texOfPlain(e.text))}<span class="ids">${esc(e.record)}</span></li>`).join("")}${rg.match.conditions.map((/** @type {any} */ c) => `<li>${td(`${texOfPlain(c.text)}\\quad\\text{at }${texOfPlain(c.at)}`)}<span class="ids">${esc(c.record)}</span></li>`).join("")}</ul>`,
      `<p>${chip(accOk ? acc[0]?.status ?? "exact" : "unresolved")} ${accOk ? `The declaration's ${acc.length} acceptance checks pass on this record.` : `${acc.filter((/** @type {any} */ c) => !c.passed).length} acceptance checks fail.`} ${!rg.approximations.length ? "This model has no approximation layers: the map shows its stability and bifurcation layers." : meets.length ? `At the inspected point, ${meets.length === 1 ? "this approximation meets" : "these approximations meet"} the tolerance ${rg.tolerance}: ${esc(meets.map((/** @type {any} */ l) => l.title.toLowerCase()).join(", "))}.` : `At the inspected point, no approximation meets the tolerance ${rg.tolerance}.`}</p>`,
      ...rg.notices.map((/** @type {string} */ n) => `<div class="callout warn"><p>${esc(n)}</p></div>`),
    ].join("\n");

    // The controls that depend on the declaration.
    const axisOptions = rg.params.filter((/** @type {any} */ p) => p.kind !== "choice");
    setOptions(byId("map-x"), axisOptions.map((/** @type {any} */ p) => [p.id, `${uniLabel(p.tex)}: ${p.label}`]), rg.axes.x.id);
    setOptions(byId("map-y"), [["none", "None: a 1D diagram"], ...axisOptions.filter((/** @type {any} */ p) => p.id !== rg.axes.x.id).map((/** @type {any} */ p) => [p.id, `${uniLabel(p.tex)}: ${p.label}`])], rg.axes.y ? rg.axes.y.id : "none");
    setOptions(byId("map-shade"), rg.layers.map((/** @type {any} */ l) => [l.id, `${l.title}${l.kind === "approximation" ? ": error" : ": regions"}`]), rg.shade);
    byId("y-scale-group").hidden = !rg.axes.y;
    if (document.activeElement !== byId("map-fixed")) /** @type {HTMLInputElement} */ (byId("map-fixed")).value = state.fixed;
    const kinds = shownKinds(state);
    byId("map-layers").innerHTML = [...LAYER_KINDS.filter((k) => k !== "limits" || rg.axes.y).map((k) => `<label class="check"><input type="checkbox" data-layer="${k}"${kinds.includes(k) ? " checked" : ""}> ${/** @type {Record<string, string>} */ (KIND_NAMES)[k]}</label>`),
      ...rg.layerKinds.filter((/** @type {any} */ k) => !LAYER_KINDS.includes(k.id)).map((/** @type {any} */ k) => `<label class="check muted"><input type="checkbox" disabled> ${esc(k.name)} (piece ${k.piece})</label>`)].join(" ");

    // The map.
    const host = byId("regime-map");
    const drawn = rg.axes.y ? slice(rg, state, host) : diagram(rg, state, host);
    const shadeL = rg.layers.find((/** @type {any} */ l) => l.id === rg.shade);
    byId("regime-caption").textContent = rg.axes.y
      ? `${uniLabel(rg.axes.x.tex)} across and ${uniLabel(rg.axes.y.tex)} up, ${rg.grid.xs.length} × ${rg.grid.ys.length} points. The grey shades show ${shadeL ? (shadeL.kind === "approximation" ? `the error of ${shadeL.title.toLowerCase()}. The plain background meets the tolerance ${rg.tolerance}. Three deeper shades are more than 1, 10 and 100 times it` : shadeL.kind === "balance" ? `the regions of the ${shadeL.title.toLowerCase()}: blue where the first term controls, grey where the terms are comparable, orange where the other term controls` : `the regions of the ${shadeL.title.toLowerCase()}: ${shadeL.regions.map((/** @type {any} */ r, /** @type {number} */ k) => `${k === 0 ? "blue" : k === shadeL.regions.length - 1 ? "orange" : "grey"} for ${r.label.charAt(0).toLowerCase()}${r.label.slice(1)}`).join(", ")}`) : "nothing"}. Coloured lines are approximation boundaries, dashed lines are balance crossovers, and dotted lines are empirical boundaries of cited correlations. Grey arrows are limit paths and diamonds are intersections. The red dot is the record's point, and the ring is the inspected point.`
      : `${uniLabel(rg.axes.x.tex)} across, ${rg.grid.xs.length} points. Coloured lines are the error of each approximation and dashed lines the term ratio of each balance, on a log scale. Values below 10⁻⁶ sit on the bottom edge. The strips show where each approximation meets the tolerance ${rg.tolerance}.`;
    const legendItems = [
      ...rg.layers.filter((/** @type {any} */ l) => l.kind === "approximation" && drawn.kinds.includes("approximation")).map((/** @type {any} */ l) => `<li><span class="key key-line" style="--key:${drawn.hue[l.id]};--w:${secondary(rg.layers, l) ? 1.5 : 2.5}px"></span>${esc(l.title)}</li>`),
      ...(drawn.kinds.includes("empirical") && rg.layers.some((/** @type {any} */ l) => l.kind === "empirical") ? [`<li><span class="key key-emp"></span>Empirical boundary (cited data): ${esc(rg.layers.filter((/** @type {any} */ l) => l.kind === "empirical").map((/** @type {any} */ l) => l.title).join(", "))}</li>`] : []),
      ...(drawn.kinds.includes("balance") ? [`<li><span class="key key-ref"></span>Balance crossover (terms equal): ${esc(rg.layers.filter((/** @type {any} */ l) => l.kind === "balance").map((/** @type {any} */ l) => l.title).join(", "))}</li>`] : []),
      `<li><span class="key key-hatch"></span>Unresolved (${rg.unresolved.count} points)</li>`,
      rg.axes.y ? `<li><span class="key key-shade"></span>Shades: ${esc(shadeL?.title ?? "")}</li>` : `<li><span class="key key-gap"></span>No approximation meets the tolerance (${rg.gap.count} points)</li>`,
      `<li><span class="key key-dot"></span>The record's point</li>`, `<li><span class="key key-ring"></span>The inspected point</li>`,
      ...(rg.axes.y ? [`<li><span class="key key-diamond"></span>Intersection of two boundaries (${rg.intersections.length})</li>`, ...(drawn.kinds.includes("limits") ? [`<li><span class="key key-arrow"></span>Limit path</li>`] : [])] : []),
    ];
    byId("regime-legend").innerHTML = `<p class="label">Legend: a coloured line is an approximation boundary, where the error equals the tolerance</p><ul class="map-legend">${legendItems.join("")}</ul>
      <div class="scroll"><table class="data"><caption>The boundary types of section 9</caption><thead><tr><th scope="col">Boundary type</th><th scope="col">Required criterion</th><th scope="col">On this map</th></tr></thead><tbody>${rg.boundaryTypes.map((/** @type {any} */ b) => {
        const ls = rg.layers.filter((/** @type {any} */ l) => l.boundary === b.id);
        /** @type {Map<string, string[]>} */
        const by = new Map();
        for (const l of ls) by.set(l.criterion, [...(by.get(l.criterion) ?? []), l.title]);
        return `<tr><td>${esc(b.name)}</td><td>${esc(b.criterion)}</td><td>${ls.length ? [...by].map(([c, names]) => `<strong>${esc(names.join(", "))}:</strong> ${esc(c)}`).join("<br>") : `<span class="muted">none for this model</span>`}</td></tr>`;
      }).join("")}</tbody></table></div>`;

    // Beside the map: the fixed parameters, the derived parameters, assumptions, geometry and conditions.
    const declAssumptions = H.data.catalogue.declarations.find((/** @type {any} */ x) => x.id === rg.declaration.id)?.domain.assumptions ?? [];
    byId("regime-beside").innerHTML = `<div class="beside-grid">
      <div><h4>Fixed parameters</h4>${rg.fixed.length ? `<ul class="plain-list">${rg.fixed.map((/** @type {any} */ f) => `<li>${ti(f.tex)} = ${esc(fmt(f.value))} <span class="note">${esc(f.label)}${f.source === "condition" ? "" : `. From ${f.source === "you" ? "your fixed values" : f.source === "record" ? "the record" : "the middle of the domain"}`}</span></li>`).join("")}</ul>` : "<p class=\"muted\">None: both parameters are on the axes.</p>"}
        <h4>Derived parameters at the inspected point</h4><ul class="plain-list">${rg.derived.map((/** @type {any} */ x) => `<li>${ti(x.tex)} = ${esc(fmt(x.value))} <span class="note">${esc(x.label)}</span></li>`).join("")}</ul>
        ${rg.constraints.length ? `<p class="sev-error">${esc(rg.constraints.join(" "))}</p>` : ""}</div>
      <div><h4>Assumptions</h4><ul class="plain-list">${declAssumptions.map((/** @type {any} */ a) => `<li>${esc(a.text)}</li>`).join("")}${d.interp.assumptions.map((/** @type {any} */ a) => `<li>${esc(a.text)} <span class="ids">${esc(a.id)}</span></li>`).join("")}</ul>
        <h4>Geometry</h4><p>${esc(d.interp.geometry.domain || "not stated")}</p>
        <h4>Conditions</h4><ul class="plain-list">${rg.match.conditions.map((/** @type {any} */ c) => `<li>${ti(`${texOfPlain(c.text)}\\ \\text{at}\\ ${texOfPlain(c.at)}`)}</li>`).join("")}</ul></div>
    </div>`;

    // The inspection of the point, or of the picked boundary.
    const b = rg.boundary;
    const insp = b ? b.point : rg.point;
    const det = insp.detail ?? {};
    const pText = Object.entries(insp.p).filter(([k]) => rg.params.some((/** @type {any} */ q) => q.id === k)).map(([k, v]) => `${uniLabel(rg.params.find((/** @type {any} */ q) => q.id === k).tex)} = ${fmt(/** @type {number} */ (v))}`).join(", ");
    const boundaryOptions = rg.layers.flatMap((/** @type {any} */ l) => l.curves.map((/** @type {any} */ c) => [c.id, `${l.title}: ${c.label}`]));
    byId("regime-inspect").innerHTML = `<h3>${b ? `Inspected boundary: ${esc(b.title)}` : "Inspected point"}</h3>
      <div class="inline inspect-controls"><label class="field-inline">Inspect a boundary <select id="map-pick"><option value="">None: the point</option>${boundaryOptions.map(([id, label]) => `<option value="${esc(id)}"${state.pick === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
      <button type="button" data-map-record>Inspect the record's point</button></div>
      ${b ? `<p>${chip(b.status)} ${esc(b.label)}. <strong>${esc(rg.boundaryTypes.find((/** @type {any} */ x) => x.id === b.boundary)?.name ?? b.boundary)}.</strong> Criterion: ${esc(b.criterion)}. ${b.refined ? `Brent's method refines the point on the boundary. The residual of the criterion there is ${esc(fmt(b.residual))} (log scale).` : "The point is the nearest drawn point of the boundary."} Evidence: ${b.evidence.map(sourceLink).join(", ")}.</p>${b.boundary === "balance-crossover" ? `<p class="note">${esc(rg.analysis.balance.note)}</p>` : ""}` : ""}
      <p><strong>${esc(pText)}</strong>${insp.ok ? "" : ` ${chip("unresolved")} ${esc(insp.reason)}`}</p>
      ${insp.ok ? `<div class="scroll"><table class="data"><caption class="visually-hidden">Layers at the inspected point</caption><thead><tr><th scope="col">Layer</th><th scope="col">Value</th><th scope="col">Here</th></tr></thead><tbody>${insp.layers.map((/** @type {any} */ l) => `<tr><td>${esc(l.title)}</td><td class="num">${esc(fmt(l.value))}</td><td>${l.kind === "approximation" ? (l.meets ? "meets the tolerance" : "does not meet it") : esc(l.region ?? "")}</td></tr>`).join("")}</tbody></table></div>
      <h4>Applicable reduced models</h4>${insp.reduced.length ? `<ul class="plain-list">${insp.reduced.map((/** @type {any} */ r) => `<li>${esc(r.label)}: ${ti(r.tex)} <span class="note">${esc(r.limit)}</span></li>`).join("")}</ul>` : !rg.approximations.length ? `<p class="muted">This declared model has no reduced models: the stability and bifurcation analysis is below the map.</p>` : `<p>${chip("unresolved")} No approximation meets the tolerance here: only the full solution is accurate.</p>`}
      <div id="regime-profile"></div>
      ${(det.values ?? []).length ? `<h4>Values</h4><ul class="plain-list">${det.values.map((/** @type {any} */ v) => `<li>${ti(v.tex)} = ${esc(v.exact ?? fmt(v.value))} <span class="note">${esc(v.label)}</span></li>`).join("")}</ul>` : ""}
      ${(det.nodes ?? []).length ? `<h4>Temperatures along the path (θ = 1 at fluid 1, 0 at fluid 2)</h4><ul class="plain-list">${det.nodes.map((/** @type {any} */ n) => `<li>${esc(n.at)}: θ = ${esc(fmt(n.theta))}</li>`).join("")}</ul>` : ""}
      ${(det.checks ?? []).length ? `<h4>Checks</h4><ul class="plain-list">${det.checks.map((/** @type {any} */ c) => `<li>${chip(c.passed ? c.status : "unresolved")} ${c.passed ? "Passed" : "<strong>Failed</strong>"}: ${esc(c.title)}. <span class="note">${esc(c.detail)}${c.tolerance ? ` Tolerance ${esc(c.tolerance)}.` : ""}</span></li>`).join("")}</ul>` : ""}
      <h4>Dimensional reconstruction</h4>${(det.reconstruction ?? []).length ? `<ul class="plain-list">${det.reconstruction.map((/** @type {any} */ r) => `<li>${ti(r.tex)} = ${esc(r.exact ? `${r.exact} (${fmt(r.value)})` : fmt(r.value))} ${esc(r.unit || "")} <span class="note">${esc(r.label)}</span></li>`).join("")}</ul><p class="note">Each value holds the record's other variables at their values. Temperatures are in K.</p>` : `<p class="muted">The record has no values for the variables that this point needs.</p>`}` : ""}`;
    if (insp.ok && det.profile) profileChart(rg, det.profile, byId("regime-profile"));

    // Hand calculation 8: dominant balance and asymptotic analysis.
    const an = rg.analysis;
    byId("regime-balance").innerHTML = `<p>${esc(an.balance.intro)}</p>
      <div class="scroll"><table class="data"><caption>Terms and their scale estimates</caption><thead><tr><th scope="col">Term</th><th scope="col">Meaning</th><th scope="col">Estimate</th><th scope="col">Why</th></tr></thead><tbody>${an.balance.terms.map((/** @type {any} */ t) => `<tr><td>${ti(t.tex)}</td><td>${esc(t.label)}</td><td>${ti(t.scale)}</td><td>${esc(t.why)}</td></tr>`).join("")}</tbody></table></div>
      ${an.balance.balances.map((/** @type {any} */ x) => `<div class="group-card"><p><strong>${esc(x.title)}</strong> when ${ti(x.when)}</p><p class="note">${esc(x.derivation)}</p>
        <p>Reduced model: ${ti(x.reduced)}. Neglected: ${esc(x.neglected)}.${x.assumptions.length ? ` Assumes: ${esc(x.assumptions.join(" "))}` : ""}</p>
        <p>${chip(x.residual.status)} Residual in the full equations: ${ti(x.residual.tex)}, ${esc(x.residual.order)}. <span class="note">${esc(x.residual.note ?? "")}</span></p></div>`).join("")}
      <h4>Balance crossovers</h4><ul class="plain-list">${an.balance.crossovers.map((/** @type {any} */ c) => `<li>${chip(c.status)} ${ti(c.criterion)}: ${esc(c.text)}</li>`).join("")}</ul><p class="note">${esc(an.balance.note)}</p>`;
    byId("regime-asymptotic").innerHTML = `${an.note ? `<p>${esc(an.note)}</p>` : ""}${an.asymptotic.limits.map((/** @type {any} */ L) => `<div class="group-card"><p><strong>${ti(L.parameter)}</strong>: ${esc(L.path)}. ${L.coupled ? "<strong>A coupled limit.</strong> " : ""}<span class="note">Kind: ${esc(L.kind.charAt(0).toLowerCase() + L.kind.slice(1))}. Fixed: ${esc(L.fixed)}.</span></p>
        ${td(L.setup)}
        <ol class="step-list">${L.orders.map((/** @type {any} */ o) => `<li>Order ${o.n}: ${ti(o.equation)}${o.conditions.length ? `, ${o.conditions.map(ti).join(", ")}` : ""}${o.particular && o.particular !== "0" ? `<br>Particular part: ${ti(o.particular)}` : ""}${o.solvability ? `<br>Solvability: ${ti(o.solvability)} <span class="note">${esc(o.solvabilityWhy)}</span>` : ""}${o.matching ? `<br>Matching: ${ti(o.matching)}` : ""}${o.why ? ` <span class="note">${esc(o.why)}</span>` : ""}<br>${ti(o.result)}${o.checks ? ` ${chip(o.checks.equation && o.checks.surface && o.checks.solvability ? "exact" : "unresolved")} <span class="note">The result satisfies the equation, the conditions and the solvability condition of its order exactly.</span>` : ""}</li>`).join("")}</ol>
        ${L.heatFlow ? `<p>Base heat flow: ${ti(L.heatFlow)}</p>` : ""}
        <p><strong>Order and conditions.</strong> ${esc(L.orderLoss)}</p>
        ${L.inner ? `<p><strong>Inner region.</strong> ${ti(L.inner.variable)}: ${ti(L.inner.equation)}, ${ti(L.inner.solution)}. Matching: ${ti(L.inner.matching)}. <span class="note">${esc(L.inner.why)}</span></p>` : ""}
        ${L.residual ? `<p>${chip(L.residual.status)} Residual of the truncated sum: ${ti(L.residual.tex)}, ${esc(L.residual.order)}.</p>` : ""}
        ${L.crossCheck ? `<p>${chip("exact")} ${esc(L.crossCheck.text)}</p>` : ""}
        <p><strong>Error.</strong> Formal: ${esc(L.error.formal)} Estimated remainder: ${esc(L.error.estimated)} Proved bound: ${esc(L.error.proved ?? "none for this limit.")}</p>
        <p><strong>Validity.</strong> ${esc(L.validity)}</p></div>`).join("")}
      <p><strong>Overlap.</strong> ${esc(an.asymptotic.overlap)}</p><p><strong>Gaps.</strong> ${esc(an.asymptotic.gaps)} On this map: ${rg.gap.count} points.</p>
      <h4>Limit paths through the inspected point</h4><ul class="plain-list">${rg.limits.map((/** @type {any} */ L) => `<li>${L.coupled ? "<strong>Coupled:</strong> " : ""}${esc(L.label)}. <span class="note">${esc(L.note)}${L.onSlice ? "" : " The path leaves this slice, so the map does not draw it."}</span></li>`).join("")}</ul>`;

    // The table view of the boundaries, intersections and unresolved points.
    byId("regime-table").innerHTML = [
      ...rg.layers.map((/** @type {any} */ l) => `<h4>${esc(l.title)}</h4><p class="note">${chip(l.status)} ${esc(l.criterion)}</p>
        ${l.curves.length ? l.curves.map((/** @type {any} */ c) => `<details><summary>${esc(c.label)}: ${c.points.length} point${c.points.length === 1 ? "" : "s"}</summary><div class="scroll"><table class="data"><thead><tr><th scope="col">${esc(uniLabel(rg.axes.x.tex))}</th>${rg.axes.y ? `<th scope="col">${esc(uniLabel(rg.axes.y.tex))}</th>` : ""}</tr></thead><tbody>${c.points.map((/** @type {any[]} */ p) => `<tr><td class="num">${esc(fmt(p[0]))}</td>${rg.axes.y ? `<td class="num">${esc(fmt(p[1]))}</td>` : ""}</tr>`).join("")}</tbody></table></div></details>`).join("") : "<p class=\"muted\">No boundary of this layer crosses the map.</p>"}
        <p class="note">${l.regions.map((/** @type {any} */ r) => `${esc(r.label)}: ${r.intervals ? r.intervals.map((/** @type {number[]} */ iv) => `${fmt(iv[0])} to ${fmt(iv[1])}`).join(", ") || "none" : `${r.count} points`}`).join(". ")}.</p>`),
      `<h4>Intersections</h4>${rg.intersections.length ? `<ul class="plain-list">${rg.intersections.map((/** @type {any} */ x) => `<li>${esc(x.aLabel)} and ${esc(x.bLabel)} at ${esc(uniLabel(rg.axes.x.tex))} = ${esc(fmt(x.x))}, ${esc(uniLabel(rg.axes.y.tex))} = ${esc(fmt(x.y))}</li>`).join("")}</ul>` : "<p class=\"muted\">None on this map.</p>"}`,
      `<h4>Unresolved points</h4>${rg.unresolved.count ? `<ul class="plain-list">${rg.unresolved.reasons.map((/** @type {any} */ r) => `<li>${r.count} points: ${esc(r.reason)}</li>`).join("")}</ul><p class="note">No boundary crosses an unresolved point: the map does not interpolate across them.</p>` : "<p class=\"muted\">None.</p>"}`,
    ].join("\n");

    // The declaration with its acceptance checks, and anchor test 1 for the slab.
    const anchor = rg.declaration.id === "slab-convection";
    byId("regime-declaration").innerHTML = `<p>${esc(rg.declaration.summary)} <button type="button" data-catalogue="${esc(rg.declaration.id)}">Open in the Model catalogue</button></p>
      <h4>Acceptance checks on this record</h4><ul class="plain-list">${acc.map((/** @type {any} */ c) => `<li>${chip(c.passed ? c.status : "unresolved")} ${c.passed ? "Passed" : "<strong>Failed</strong>"}: ${esc(c.title)}. <span class="note">${esc(c.detail)}${c.tolerance ? ` Tolerance ${esc(c.tolerance)}.` : ""}</span></li>`).join("")}</ul>
      ${anchor ? `<h4>Anchor test 1: transient slab conduction (section 11)</h4><ul class="plain-list">
        <li>${chip(d.nondim?.ready ? "exact" : "unresolved")} Hand derivation: hand calculations 6 and 7 of the Nondimensionalizer, with the reverse substitution.</li>
        <li>${chip("exact")} Dimensionless conditions: ${rg.match.conditions.map((/** @type {any} */ c) => ti(`${texOfPlain(c.text)}\\ \\text{at}\\ ${texOfPlain(c.at)}`)).join(", ")}, equal to the declared model.</li>
        <li>${chip(acc.every((/** @type {any} */ c) => c.passed) ? "numerical" : "unresolved")} Reference temperature solution: the series of modes against mpmath, within 10⁻⁹.</li>
        <li>${chip("numerical")} Approximation error map: the map above, with the error of five approximations and their boundaries at the tolerance ${rg.tolerance}.</li></ul>` : ""}`;
  }

  /** Plain equation text of the declaration as TeX, with the dimensionless names. @param {string} text */
  const texOfPlain = (text) => SM.RM.texOf(text);

  /** @param {HTMLSelectElement} sel @param {string[][]} options @param {string} value */
  function setOptions(sel, options, value) {
    const key = options.map((o) => o.join("=")).join("|");
    if (sel.dataset.key !== key) {
      sel.replaceChildren(...options.map(([v, label]) => { const o = document.createElement("option"); o.value = v; o.textContent = label; return o; }));
      sel.dataset.key = key;
    }
    sel.value = value;
  }

  /* ---------- the Model catalogue ---------- */

  /** @param {Record<string, any>} state @param {any} d */
  function catalogue(state, d) {
    const { esc, ti, td, chip, sourceLink } = H;
    const cat = d.catalogue;
    const decl = cat.declaration;
    const built = cat.families.filter((/** @type {any} */ f) => f.declarations.length);
    const later = cat.families.filter((/** @type {any} */ f) => !f.declarations.length);
    const pieces = [...new Set(later.map((/** @type {any} */ f) => f.piece))];
    const roleTex = (/** @type {string} */ text) => { const r = SM.E.read(text); return r.error ? text : SM.E.tex(r.ast); };
    const acc = cat.acceptance;
    byId("catalogue").innerHTML = `<p>The catalogue of section 10. ${["None", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][built.length] ?? built.length} of the ${cat.families.length} families have declared models now. Each declaration has the six required parts. A record follows a declared model when its purpose names it and its dimensionless model equals the declared one.</p>
      <div class="catalogue-list">${built.map((/** @type {any} */ f) => `<div><h4>${esc(f.name)}</h4><ul class="plain-list">${f.declarations.map((/** @type {string} */ id) => { const x = cat.declarations.find((/** @type {any} */ y) => y.id === id); return `<li><button type="button" data-catalogue="${esc(id)}" aria-pressed="${id === cat.selected}">${esc(x.title)}</button></li>`; }).join("")}</ul></div>`).join("")}</div>
      ${decl ? `<section class="declaration" aria-labelledby="decl-title"><h3 id="decl-title">${esc(decl.title)}</h3><p class="ids">${esc(decl.id)}, family ${esc(decl.family)}, piece ${decl.piece}</p>
        <p>${esc(decl.model.summary)}</p>
        <h4>1. ${esc(cat.parts[0].name)}</h4>
        <ul class="model-list">${decl.model.equations.map((/** @type {any} */ e) => `<li>${td(roleTex(e.text))}<span class="ids">${esc(e.id)}, ${esc(e.kind)}, ${esc(e.domain ?? "")}</span></li>`).join("")}${decl.model.conditions.map((/** @type {any} */ c) => `<li>${td(`${roleTex(c.text)}\\quad\\text{at }${roleTex(c.at)}`)}<span class="ids">${esc(c.id)}: ${esc(c.meaning)}${c.alternatives?.length ? `; or ${esc(c.alternatives.map((/** @type {any} */ a) => `${a.text} (${a.meaning})`).join(". Or "))}` : ""}</span></li>`).join("")}</ul>
        <p><strong>Closures.</strong> ${esc(decl.model.closures.join(" "))} <strong>Geometry.</strong> ${esc(decl.model.geometry)}</p>
        <p><strong>Declared dimensionless form.</strong> Variables ${decl.model.dimensionless.variables.map((/** @type {any} */ v) => ti(`${v.tex}=\\frac{${roleTex(v.of)}${v.offset !== "0" ? `-${roleTex(v.offset)}` : ""}}{${roleTex(v.scale)}}`)).join(", ")}. Parameters ${decl.model.dimensionless.parameters.filter((/** @type {any} */ p) => p.def).map((/** @type {any} */ p) => ti(`${p.tex}=${roleTex(p.def)}`)).join(", ")}.</p>
        <ul class="model-list">${decl.model.dimensionless.equations.map((/** @type {any} */ e) => `<li>${td(texOfPlain(e.text))}</li>`).join("")}${decl.model.dimensionless.conditions.map((/** @type {any} */ c) => `<li>${td(`${texOfPlain(c.text)}\\quad\\text{at }${texOfPlain(c.at)}`)}</li>`).join("")}</ul>
        <h4>2. ${esc(cat.parts[1].name)}</h4>
        <div class="scroll"><table class="data"><thead><tr><th scope="col">Parameter</th><th scope="col">Meaning</th><th scope="col">Domain</th><th scope="col">Axis</th></tr></thead><tbody>${decl.domain.parameters.map((/** @type {any} */ p) => `<tr><td>${ti(p.tex)}</td><td>${esc(p.label)}</td><td class="num">${esc(fmt(p.min))} to ${esc(fmt(p.max))}</td><td>${p.log ? "logarithmic" : "linear"}${p.kind === "coordinate" ? ", a coordinate" : ""}</td></tr>`).join("")}</tbody></table></div>
        <ul class="plain-list">${decl.domain.assumptions.map((/** @type {any} */ a) => `<li>${esc(a.text)} <span class="note">${sourceLink(a.source)}</span></li>`).join("")}</ul>
        <h4>3. ${esc(cat.parts[2].name)}</h4><p><strong>Symbolic:</strong></p><ul class="plain-list">${decl.operations.symbolic.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul><p><strong>Numerical:</strong></p><ul class="plain-list">${decl.operations.numerical.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <h4>4. ${esc(cat.parts[3].name)}</h4>
        <div class="scroll"><table class="data"><thead><tr><th scope="col">Method</th><th scope="col">Applies</th><th scope="col">Why</th></tr></thead><tbody>${cat.methods.map((/** @type {any} */ m) => `<tr><td>${esc(m.name)}</td><td>${decl.methods[m.id].applies ? "Yes" : "No"}</td><td>${esc(decl.methods[m.id].reason)}</td></tr>`).join("")}</tbody></table></div>
        <p><strong>Limitations.</strong></p><ul class="plain-list">${decl.limitations.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <h4>5. ${esc(cat.parts[4].name)}</h4><p>Standard example: <button type="button" data-load-example="${esc(decl.acceptance.example)}">${esc(Model.EXAMPLES.find((/** @type {any} */ e) => e.id === decl.acceptance.example)?.label ?? decl.acceptance.example)}</button>. Reference: ${esc(decl.acceptance.reference)} Tolerance: ${esc(decl.acceptance.tolerance)}</p>
        <ul class="plain-list">${decl.acceptance.checks.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join("")}</ul>
        ${acc ? `<p><strong>Result on the standard example:</strong></p><ul class="plain-list">${acc.checks.map((/** @type {any} */ c) => `<li>${chip(c.passed ? c.status : "unresolved")} ${c.passed ? "Passed" : "<strong>Failed</strong>"}: ${esc(c.title)}. <span class="note">${esc(c.detail)}</span></li>`).join("")}${acc.problems.map((/** @type {string} */ p) => `<li>${chip("unresolved")} ${esc(p)}</li>`).join("")}</ul>` : ""}
        <h4>6. ${esc(cat.parts[5].name)}</h4><ul class="plain-list">${["method", "discretization", "convergence", "reproducibility"].map((k) => `<li><strong>${esc(k.charAt(0).toUpperCase() + k.slice(1))}:</strong> ${esc(decl.solver[k])}</li>`).join("")}</ul>
      </section>` : ""}
      <details><summary>The ${later.length} families still to come</summary><div class="roadmap-grid">${pieces.map((n) => `<div><h4>Piece ${n}</h4><ul>${later.filter((/** @type {any} */ f) => f.piece === n).map((/** @type {any} */ f) => `<li>${esc(f.name)}</li>`).join("")}</ul></div>`).join("")}</div></details>`;
  }

  /** @param {string} id @returns {any} */
  const byId = (id) => document.getElementById(id);

  /** Connect the controls of the map and the catalogue. @param {any} a @param {any} helpers */
  function bind(a, helpers) {
    app = a;
    H = helpers;
    byId("map-x").addEventListener("change", (/** @type {Event} */ e) => app.set({ map_x: /** @type {HTMLSelectElement} */ (e.target).value, point: "", pick: "" }));
    byId("map-y").addEventListener("change", (/** @type {Event} */ e) => app.set({ map_y: /** @type {HTMLSelectElement} */ (e.target).value, point: "", pick: "" }));
    byId("map-shade").addEventListener("change", (/** @type {Event} */ e) => app.set({ shade: /** @type {HTMLSelectElement} */ (e.target).value }));
    byId("map-fixed").addEventListener("change", (/** @type {Event} */ e) => app.set({ fixed: /** @type {HTMLInputElement} */ (e.target).value.slice(0, 200), point: "", pick: "" }));
    byId("map-layers").addEventListener("change", () => {
      const on = [...document.querySelectorAll("#map-layers input[data-layer]")].filter((x) => /** @type {HTMLInputElement} */ (x).checked).map((x) => x.getAttribute("data-layer"));
      app.set({ layers: on.join(",") });
    });
    const panel = byId("tool-regime");
    panel.addEventListener("change", (/** @type {Event} */ e) => {
      const t = /** @type {HTMLSelectElement} */ (e.target);
      if (t.id === "map-pick") app.set({ pick: t.value });
    });
    const clicks = (/** @type {Event} */ e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t.closest("button[data-confirm]")) { byId("confirm").click(); return; }
      const ex = t.closest("button[data-load-example]")?.getAttribute("data-load-example");
      if (ex) { app.set({ example: ex, tool: "regime", point: "", pick: "", map_x: "", map_y: "", fixed: "", shade: "" }); return; }
      const cat = t.closest("button[data-catalogue]")?.getAttribute("data-catalogue");
      if (cat) { app.set({ tool: "catalogue", family: cat }); return; }
      if (t.closest("button[data-map-record]")) app.set({ point: "", pick: "" });
    };
    panel.addEventListener("click", clicks);
    byId("tool-catalogue").addEventListener("click", clicks);
  }

  /** @type {any} */ (window).RegimeView = { render, catalogue, bind };
})();
