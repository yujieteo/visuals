/* Universal Data Workbench: draw a chart specification and its computed data as a figure.
 *
 * render(spec, data) lays the figure out in millimetres as a scene graph (rectangles, lines, paths, circles and
 * text, with sizes in points), then writes it as SVG with every label a <text> element, so the figure stays
 * editable. The same scene graph is what step 4 writes as PDF and PNG. Nothing here touches the page: the
 * gallery, the full-size view and the Node checks call the same function.
 *
 * The figure is paper: a white ground, near-black text, one blue for marks and a light-to-dark blue for counts,
 * in both page themes, because it is what an export holds. Text is 6 pt or larger and lines 0.5 pt or wider, the
 * general preset's minimums. Text widths come from Helvetica's metrics (an Arial-metric font draws the same widths),
 * so label collisions are counted the same way in the browser and in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWRender = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PT = 25.4 / 72;
  const FONT = "'Liberation Sans', Arimo, Arial, Helvetica, sans-serif";
  const COLOR = { paper: "#ffffff", ink: "#1a1a1a", muted: "#52514e", grid: "#e4e3df", axis: "#52514e", mark: "#2a78d6", markDark: "#1c5cab", fill: "#b7d3f6", other: "#76756f" };
  /* Light to dark blue, for counts: near zero recedes toward the paper. */
  const SEQUENTIAL = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
  const SIZE = { title: 9, label: 7, tick: 6.5, caption: 6.5, small: 6 };
  const LINE = { axis: 0.5, grid: 0.5, mark: 1, thin: 0.5 };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* Helvetica's advance widths for the characters from space (32) to ~ (126), in thousandths of the font size. */
  const WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

  /** The width of a text in millimetres at a size in points. */
  function textWidth(text, pt, bold = false) {
    let w = 0;
    for (const ch of String(text)) {
      const code = ch.codePointAt(0) ?? 0;
      w += code >= 32 && code <= 126 ? WIDTHS[code - 32] : 556;
    }
    return (w / 1000) * pt * PT * (bold ? 1.06 : 1);
  }

  /** A text cut to fit a width, with an ellipsis. */
  function fit(text, pt, width) {
    const s = String(text);
    if (textWidth(s, pt) <= width) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (textWidth(`${s.slice(0, mid)}…`, pt) <= width) lo = mid; else hi = mid - 1;
    }
    return `${s.slice(0, lo)}…`;
  }

  /** Words wrapped to lines no wider than `width`. */
  function wrap(text, pt, width) {
    const lines = [];
    for (const para of String(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (textWidth(next, pt) <= width || !line) line = next;
        else { lines.push(line); line = word; }
      }
      if (line) lines.push(line);
    }
    return lines.map((l) => fit(l, pt, width));
  }

  /* ---------- numbers and ticks ---------- */

  const whole = new Intl.NumberFormat("en-US");
  const count = (n) => whole.format(Math.round(n));

  /** A number at a tick step's precision. */
  function number(v, step = 0) {
    if (!Number.isFinite(v)) return "–";
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e9 || a < 1e-4)) return v.toExponential(1).replace("e+", "e");
    const digits = step > 0 ? Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9))) : a >= 100 ? 0 : a >= 1 ? 2 : 4;
    return v.toLocaleString("en-US", { minimumFractionDigits: step > 0 ? digits : 0, maximumFractionDigits: digits });
  }

  /** Ticks at 1, 2 or 5 times a power of ten across [lo, hi], about `target` of them. */
  function linearTicks(lo, hi, target = 5) {
    const span = hi - lo;
    if (!(span > 0)) return { ticks: [lo], step: 0 };
    const raw = span / Math.max(1, target);
    const pow = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
    const ticks = [];
    for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
    return { ticks, step };
  }

  /** A domain widened to its outer ticks (or by 5% each side), so marks do not touch the frame. */
  function niceDomain(lo, hi, target = 5, zero = false) {
    if (zero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    if (!(hi > lo)) { const d = Math.abs(lo) || 1; return [lo - d * 0.5, hi + d * 0.5]; }
    const { step } = linearTicks(lo, hi, target);
    return [zero && lo === 0 ? 0 : Math.floor(lo / step) * step, zero && hi === 0 ? 0 : Math.ceil(hi / step) * step];
  }

  /** Ticks of a log10 axis (values are logarithms): each power of ten, with 2 and 5 when the axis spans few decades. */
  function logTicks(lo, hi) {
    const ticks = [];
    const decades = hi - lo;
    for (let k = Math.floor(lo); k <= Math.ceil(hi); k++) {
      for (const m of decades < 2.5 ? [1, 2, 5] : [1]) {
        const v = k + Math.log10(m);
        if (v >= lo - 1e-9 && v <= hi + 1e-9) ticks.push(v);
      }
    }
    return ticks;
  }
  const logLabel = (v) => number(10 ** v, 10 ** Math.floor(v + 1e-9));

  const pad2 = (n) => String(n).padStart(2, "0");
  /** A time as text at a unit's precision (UTC fields of the value). */
  function timeLabel(t, unit) {
    const d = new Date(t * 1000);
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
    if (unit === "year") return String(y);
    if (unit === "quarter") return `Q${Math.floor(m / 3) + 1} ${y}`;
    if (unit === "month") return `${MONTHS[m]} ${y}`;
    if (unit === "hour") return `${y}-${pad2(m + 1)}-${pad2(day)} ${pad2(d.getUTCHours())}:00`;
    return `${y}-${pad2(m + 1)}-${pad2(day)}`;
  }

  const DAY = 86400;
  const STEPS = [["hour", 1], ["hour", 3], ["hour", 6], ["hour", 12], ["day", 1], ["day", 2], ["day", 7], ["day", 14], ["month", 1], ["month", 3], ["month", 6],
    ["year", 1], ["year", 2], ["year", 5], ["year", 10], ["year", 20], ["year", 50], ["year", 100], ["year", 200], ["year", 500], ["year", 1000]];

  /** Ticks of a time axis: the finest calendar step that gives at most `max` ticks. */
  function timeTicks(lo, hi, max = 6) {
    for (const [unit, n] of STEPS) {
      const ticks = [];
      if (unit === "hour" || unit === "day") {
        const size = (unit === "hour" ? 3600 : DAY) * n;
        for (let t = Math.ceil(lo / size) * size; t <= hi && ticks.length <= max; t += size) ticks.push(t);
      } else {
        const d = new Date(lo * 1000);
        let y = d.getUTCFullYear(), m = unit === "month" ? d.getUTCMonth() : 0;
        if (unit === "month") m = Math.ceil(m / n) * n;
        else y = Math.ceil(y / n) * n;
        for (;;) {
          const t = Date.UTC(y, m, 1) / 1000;
          if (t < lo) { if (unit === "month") m += n; else y += n; continue; }
          if (t > hi || ticks.length > max) break;
          ticks.push(t);
          if (unit === "month") m += n; else y += n;
        }
      }
      if (ticks.length <= max && ticks.length >= 2) return { ticks, unit: unit === "day" && n >= 7 ? "day" : unit, label: (t) => timeLabel(t, unit === "month" && n === 3 ? "month" : unit) };
    }
    return { ticks: [lo, hi], unit: "year", label: (t) => timeLabel(t, "year") };
  }

  /* ---------- scales ---------- */

  /** A continuous scale from a domain to a pixel range (in mm). */
  function linear(domain, range) {
    const [d0, d1] = domain, [r0, r1] = range;
    const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
    const f = (v) => r0 + (v - d0) * k;
    f.domain = domain;
    f.range = range;
    return f;
  }

  /** A band scale: each level gets a band; `inner` is the share of a step left between bands. */
  function band(levels, range, inner = 0.2) {
    const [r0, r1] = range;
    const stepSize = (r1 - r0) / Math.max(1, levels.length);
    const width = stepSize * (1 - inner);
    const f = (level) => r0 + levels.indexOf(level) * stepSize + (stepSize - width) / 2;
    f.width = width;
    f.step = stepSize;
    f.levels = levels;
    return f;
  }

  /** A sequential colour for a count between 1 and max. */
  function shade(n, max) {
    if (!(n > 0)) return COLOR.paper;
    const t = max > 1 ? (n - 1) / (max - 1) : 1;
    return SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.round(1 + t * (SEQUENTIAL.length - 2)))];
  }

  /** Relative luminance of a #rrggbb colour, and the text colour that reads on it. */
  function luminance(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  const inkOn = (hex) => ((1.05) / (luminance(hex) + 0.05) >= (luminance(hex) + 0.05) / (luminance(COLOR.ink) + 0.05) ? COLOR.paper : COLOR.ink);

  /* ---------- the scene ---------- */

  /** A scene in millimetres: the items, in drawing order, and what the layout had to give up. */
  function scene(width, height) {
    const items = [];
    const s = {
      width, height, items, collisions: 0, dropped: 0, hatch: false,
      rect: (x, y, w, h, o = {}) => items.push({ t: "rect", x, y, w: Math.max(0, w), h: Math.max(0, h), ...o }),
      line: (x1, y1, x2, y2, o = {}) => items.push({ t: "line", x1, y1, x2, y2, stroke: COLOR.axis, sw: LINE.thin, ...o }),
      path: (d, o = {}) => items.push({ t: "path", d, ...o }),
      circle: (cx, cy, r, o = {}) => items.push({ t: "circle", cx, cy, r, ...o }),
      text: (x, y, text, o = {}) => items.push({ t: "text", x, y, text: String(text), size: SIZE.tick, fill: COLOR.ink, ...o }),
    };
    return s;
  }

  const r3 = (v) => (Math.round(v * 1000) / 1000).toString();
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /** The scene as an SVG document: millimetre units, text as <text>, a <title> and <desc> for screen readers. */
  function toSvg(sc, title, desc, id) {
    const hatchId = `hatch-${id}`;
    const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${r3(sc.width)}mm" height="${r3(sc.height)}mm" viewBox="0 0 ${r3(sc.width)} ${r3(sc.height)}" role="img" aria-labelledby="${id}-t ${id}-d">`,
      `<title id="${id}-t">${esc(title)}</title>`, `<desc id="${id}-d">${esc(desc)}</desc>`];
    if (sc.hatch) out.push(`<defs><pattern id="${hatchId}" patternUnits="userSpaceOnUse" width="1.2" height="1.2" patternTransform="rotate(45)"><rect width="1.2" height="1.2" fill="${COLOR.paper}"/><line x1="0" y1="0" x2="0" y2="1.2" stroke="${COLOR.mark}" stroke-width="0.3"/></pattern></defs>`);
    out.push(`<rect width="${r3(sc.width)}" height="${r3(sc.height)}" fill="${COLOR.paper}"/>`);
    out.push(`<g font-family="${esc(FONT)}">`);
    for (const it of sc.items) {
      const tip = it.tip ? `<title>${esc(it.tip)}</title>` : "";
      const stroke = it.stroke ? ` stroke="${it.stroke}" stroke-width="${r3((it.sw ?? LINE.thin) * PT)}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ""}` : "";
      const fill = it.hatch ? `url(#${hatchId})` : it.fill ?? "none";
      const op = it.opacity !== undefined && it.opacity < 1 ? ` fill-opacity="${r3(it.opacity)}"` : "";
      const close = (tag, attrs) => (tip ? `<${tag} ${attrs}>${tip}</${tag}>` : `<${tag} ${attrs}/>`);
      if (it.t === "rect") out.push(close("rect", `x="${r3(it.x)}" y="${r3(it.y)}" width="${r3(it.w)}" height="${r3(it.h)}" fill="${fill}"${op}${stroke}`));
      else if (it.t === "line") out.push(close("line", `x1="${r3(it.x1)}" y1="${r3(it.y1)}" x2="${r3(it.x2)}" y2="${r3(it.y2)}"${stroke}`));
      else if (it.t === "path") out.push(close("path", `d="${it.d}" fill="${fill}"${op}${stroke}${it.cap ? ` stroke-linecap="${it.cap}" stroke-linejoin="round"` : ""}`));
      else if (it.t === "circle") out.push(close("circle", `cx="${r3(it.cx)}" cy="${r3(it.cy)}" r="${r3(it.r)}" fill="${fill}"${op}${stroke}`));
      else if (it.t === "text") {
        const rot = it.rotate ? ` transform="rotate(${it.rotate} ${r3(it.x)} ${r3(it.y)})"` : "";
        out.push(`<text x="${r3(it.x)}" y="${r3(it.y)}" font-size="${r3(it.size * PT)}"${it.anchor && it.anchor !== "start" ? ` text-anchor="${it.anchor}"` : ""}${it.weight ? ` font-weight="${it.weight}"` : ""} fill="${it.fill}"${rot}>${tip}${esc(it.text)}</text>`);
      }
    }
    out.push("</g>", "</svg>");
    return out.join("\n");
  }

  /* ---------- axes ---------- */

  /**
   * A numeric or time axis below (x) or left of (y) the plot: ticks, labels and grid lines. `kind` is "linear",
   * "log10" or "time"; `show` draws the tick labels (facets keep them on the outer panels).
   */
  function axis(sc, scale, kind, orient, plot, o = {}) {
    const [lo, hi] = scale.domain;
    let ticks, label;
    if (kind === "log10") { ticks = logTicks(lo, hi); label = logLabel; }
    else if (kind === "time") { const t = timeTicks(lo, hi, Math.max(2, Math.floor((orient === "x" ? plot.w : plot.h) / 22))); ticks = t.ticks; label = t.label; }
    else { const t = linearTicks(lo, hi, Math.max(2, Math.floor((orient === "x" ? plot.w : plot.h) / 14))); ticks = t.ticks; label = (v) => number(v, t.step); }
    const tick = 1.2;
    for (const v of ticks) {
      const p = scale(v);
      if (orient === "x") {
        if (o.grid) sc.line(p, plot.y, p, plot.y + plot.h, { stroke: COLOR.grid, sw: LINE.grid });
        sc.line(p, plot.y + plot.h, p, plot.y + plot.h + tick);
        if (o.show !== false) sc.text(p, plot.y + plot.h + tick + SIZE.tick * PT * 1.05, label(v), { anchor: "middle" });
      } else {
        if (o.grid !== false) sc.line(plot.x, p, plot.x + plot.w, p, { stroke: COLOR.grid, sw: LINE.grid });
        sc.line(plot.x - tick, p, plot.x, p);
        if (o.show !== false) sc.text(plot.x - tick - 0.6, p + SIZE.tick * PT * 0.35, label(v), { anchor: "end" });
      }
    }
    if (orient === "x") sc.line(plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h);
    else sc.line(plot.x, plot.y, plot.x, plot.y + plot.h);
    // Neighbouring tick labels that overlap count as collisions.
    if (orient === "x" && o.show !== false) {
      const spans = ticks.map((v) => { const w = textWidth(label(v), SIZE.tick); return [scale(v) - w / 2, scale(v) + w / 2]; });
      for (let i = 1; i < spans.length; i++) if (spans[i][0] < spans[i - 1][1]) sc.collisions += 1;
    }
    return { ticks, label };
  }

  /** The width the tick labels of a y axis need. */
  function yLabelWidth(scale, kind, h) {
    const [lo, hi] = scale.domain;
    const labels = kind === "log10" ? logTicks(lo, hi).map(logLabel) : kind === "band" ? scale.levels : (() => { const t = linearTicks(lo, hi, Math.max(2, Math.floor(h / 14))); return t.ticks.map((v) => number(v, t.step)); })();
    return Math.max(4, ...labels.map((l) => textWidth(l, SIZE.tick)));
  }

  /**
   * Category labels along a band axis. Below the plot (x): horizontal when they fit, else at −45°, cut to 18 mm;
   * left of it (y): cut to `room`. Labels that still overlap count as collisions.
   */
  function bandAxis(sc, scale, orient, plot, o = {}) {
    const size = SIZE.tick;
    const levels = scale.levels;
    if (orient === "x") {
      sc.line(plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h);
      if (o.show === false) return;
      const flat = levels.every((l) => textWidth(l, size) <= scale.step * 0.95);
      levels.forEach((level, i) => {
        const cx = scale(level) + scale.width / 2;
        if (flat) {
          sc.text(cx, plot.y + plot.h + 1.2 + size * PT * 1.05, fit(level, size, scale.step), { anchor: "middle", tip: level });
          if (o.sub) sc.text(cx, plot.y + plot.h + 1.2 + size * PT * 2.2, o.sub[i], { anchor: "middle", size: SIZE.small, fill: COLOR.muted });
        } else {
          const text = fit(level, size, 18);
          sc.text(cx + size * PT * 0.3, plot.y + plot.h + 1.6, o.sub ? `${text} (${o.sub[i]})` : text, { anchor: "end", rotate: -45, tip: level });
        }
      });
      if (!flat && scale.step < size * PT * 1.1) sc.collisions += Math.min(3, levels.length - Math.floor(plot.w / (size * PT * 1.1)));
      return;
    }
    sc.line(plot.x, plot.y, plot.x, plot.y + plot.h);
    if (o.show === false) return;
    levels.forEach((level) => {
      const cy = scale(level) + scale.width / 2;
      sc.text(plot.x - 1.2, cy + size * PT * 0.35, fit(level, size, o.room ?? 30), { anchor: "end", tip: level });
    });
    if (scale.step < size * PT * 1.05) sc.collisions += Math.min(3, levels.length - Math.floor(plot.h / (size * PT * 1.05)));
  }

  /** The height x-axis labels take below a band axis. */
  function bandAxisHeight(levels, step, sub) {
    const flat = levels.every((l) => textWidth(l, SIZE.tick) <= step * 0.95);
    if (flat) return 1.2 + SIZE.tick * PT * (sub ? 2.6 : 1.4);
    const longest = Math.max(...levels.map((l) => textWidth(fit(l, SIZE.tick, 18), SIZE.tick) + (sub ? textWidth(` (${sub})`, SIZE.tick) : 0)));
    return 2 + longest * Math.SQRT1_2 + SIZE.tick * PT;
  }

  /* ---------- marks of each kind ---------- */

  const isLog = (spec, ch) => spec.scale[ch]?.type === "log10";
  const kindOf = (spec, ch) => (spec.scale[ch]?.type === "log10" ? "log10" : spec.scale[ch]?.type === "time" ? "time" : "linear");
  const tipNumber = (spec, ch, v) => (isLog(spec, ch) ? number(10 ** v) : number(v));

  /** The y domain of box plots across every panel: whiskers and drawn outliers. */
  function boxDomain(data) {
    const vals = data.panels.flatMap((p) => (p.boxes ?? []).flatMap((b) => [b.wlo, b.whi, b.q1, b.q3, ...b.outliers.map((o) => o.x)])).filter(Number.isFinite);
    return [Math.min(...vals), Math.max(...vals)];
  }

  /** One Tukey box at x (left edge) with a width. */
  function drawBox(sc, b, x, w, y, spec, other = false) {
    const cx = x + w / 2;
    const tip = `n = ${count(b.n)}; median ${tipNumber(spec, "y", b.med)}; quartiles ${tipNumber(spec, "y", b.q1)} to ${tipNumber(spec, "y", b.q3)}; whiskers ${tipNumber(spec, "y", b.wlo)} to ${tipNumber(spec, "y", b.whi)}; ${count(b.outn)} beyond`;
    sc.line(cx, y(b.whi), cx, y(b.q3), { stroke: COLOR.ink, sw: LINE.thin });
    sc.line(cx, y(b.q1), cx, y(b.wlo), { stroke: COLOR.ink, sw: LINE.thin });
    sc.line(cx - w * 0.25, y(b.whi), cx + w * 0.25, y(b.whi), { stroke: COLOR.ink, sw: LINE.thin });
    sc.line(cx - w * 0.25, y(b.wlo), cx + w * 0.25, y(b.wlo), { stroke: COLOR.ink, sw: LINE.thin });
    sc.rect(x, y(b.q3), w, Math.max(0.2, y(b.q1) - y(b.q3)), { fill: other ? COLOR.grid : COLOR.fill, stroke: other ? COLOR.other : COLOR.markDark, sw: LINE.thin, tip });
    sc.line(x, y(b.med), x + w, y(b.med), { stroke: COLOR.ink, sw: 1.2 });
    for (const o of b.outliers) sc.circle(cx, y(o.x), 0.55, { fill: "none", stroke: COLOR.markDark, sw: LINE.thin, tip: `${tipNumber(spec, "y", o.x)}${o.n > 1 ? ` ×${count(o.n)}` : ""}` });
  }

  /**
   * Draw one panel of a chart into the plot rectangle. `shared` holds what every panel shares (domains, levels);
   * `edge` says whether the panel is on the left column and the bottom row, where tick labels are shown.
   */
  function drawPanel(sc, spec, data, panel, plot, shared, edge) {
    const xKind = kindOf(spec, "x"), yKind = kindOf(spec, "y");
    switch (spec.kind) {
      case "histogram": {
        const x = linear([data.x.lo, data.x.hi], [plot.x, plot.x + plot.w]);
        const y = linear(shared.y, [plot.y + plot.h, plot.y]);
        axis(sc, y, "linear", "y", plot, { show: edge.left });
        panel.counts.forEach((n, i) => {
          if (!n) return;
          const x0 = x(data.x.lo + i * data.x.width), x1 = x(data.x.lo + (i + 1) * data.x.width);
          const lo = isLog(spec, "x") ? number(10 ** (data.x.lo + i * data.x.width)) : number(data.x.lo + i * data.x.width);
          const hi = isLog(spec, "x") ? number(10 ** (data.x.lo + (i + 1) * data.x.width)) : number(data.x.lo + (i + 1) * data.x.width);
          sc.rect(x0, y(n), x1 - x0, y(0) - y(n), { fill: COLOR.mark, stroke: COLOR.paper, sw: 0.25, tip: `${lo} to ${hi}: ${count(n)} rows` });
        });
        axis(sc, x, xKind, "x", plot, { show: edge.bottom });
        return;
      }
      case "box": {
        const y = linear(shared.y, [plot.y + plot.h, plot.y]);
        axis(sc, y, yKind, "y", plot, { show: edge.left });
        const w = Math.min(28, plot.w * 0.3);
        for (const b of panel.boxes) drawBox(sc, b, plot.x + (plot.w - w) / 2, w, y, spec);
        sc.line(plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h);
        return;
      }
      case "bar": {
        const levels = panel.bars.map((b) => b.level);
        if (shared.horizontal) {
          const yb = band(levels, [plot.y, plot.y + plot.h], 0.25);
          const x = linear(shared.y, [plot.x, plot.x + plot.w]);
          axis(sc, x, "linear", "x", plot, { show: edge.bottom, grid: true });
          for (const b of panel.bars) sc.rect(x(0), yb(b.level), x(b.n) - x(0), yb.width, { fill: b.other ? COLOR.other : COLOR.mark, tip: `${b.level}: ${count(b.n)} rows` });
          bandAxis(sc, yb, "y", plot, { show: edge.left, room: shared.room });
        } else {
          const xb = band(levels, [plot.x, plot.x + plot.w], 0.25);
          const y = linear(shared.y, [plot.y + plot.h, plot.y]);
          axis(sc, y, "linear", "y", plot, { show: edge.left });
          for (const b of panel.bars) sc.rect(xb(b.level), y(b.n), xb.width, y(0) - y(b.n), { fill: b.other ? COLOR.other : COLOR.mark, tip: `${b.level}: ${count(b.n)} rows` });
          bandAxis(sc, xb, "x", plot, { show: edge.bottom });
        }
        return;
      }
      case "count-series": case "mean-series": {
        const x = linear(shared.x, [plot.x, plot.x + plot.w]);
        const y = linear(shared.y, [plot.y + plot.h, plot.y]);
        const yk = spec.kind === "count-series" ? "linear" : yKind;
        axis(sc, y, yk, "y", plot, { show: edge.left });
        const pts = panel.series;
        const half = (p) => (nextOf(p, data.unit) - p) / 2;
        const yv = (v) => (yk === "log10" ? Math.log10(v) : v);
        if (spec.kind === "mean-series") {
          // The 95% interval as a band, broken where a period has no interval.
          let run = [];
          const flush = () => {
            if (run.length > 1) sc.path(`M${run.map((p) => `${r3(x(p.p + half(p.p)))},${r3(y(yv(p.hi)))}`).join("L")}L${[...run].reverse().map((p) => `${r3(x(p.p + half(p.p)))},${r3(y(yv(p.lo)))}`).join("L")}Z`, { fill: COLOR.fill, opacity: 0.8 });
            run = [];
          };
          for (const p of pts) { if (p.lo !== null && p.hi !== null && (yk !== "log10" || p.lo > 0)) run.push(p); else flush(); }
          flush();
        }
        const value = (p) => (spec.kind === "count-series" ? p.n : p.value);
        let d = "", pen = false;
        for (const p of pts) {
          const v = value(p);
          if (v === null || v === undefined || (yk === "log10" && !(v > 0))) { pen = false; continue; }
          d += `${pen ? "L" : "M"}${r3(x(p.p + half(p.p)))},${r3(y(yv(v)))}`;
          pen = true;
        }
        if (d) sc.path(d, { stroke: COLOR.mark, sw: LINE.mark, cap: "round" });
        if (pts.length <= 60) for (const p of pts) {
          const v = value(p);
          if (v === null || v === undefined || (yk === "log10" && !(v > 0))) continue;
          sc.circle(x(p.p + half(p.p)), y(yv(v)), 0.6, { fill: COLOR.mark, tip: `${timeLabel(p.p, data.unit)}: ${spec.kind === "count-series" ? `${count(p.n)} rows` : `${number(v)} (n = ${count(p.n)})`}` });
        }
        axis(sc, x, "time", "x", plot, { show: edge.bottom });
        return;
      }
      case "scatter": {
        const x = linear(shared.x, [plot.x, plot.x + plot.w]);
        const y = linear(shared.y, [plot.y + plot.h, plot.y]);
        axis(sc, y, yKind, "y", plot, { show: edge.left });
        axis(sc, x, xKind, "x", plot, { show: edge.bottom, grid: true });
        // Mark size and opacity follow every point of the figure, so facets of one figure look alike.
        const n = shared.n;
        const r = n <= 500 ? 0.8 : n <= 5000 ? 0.55 : 0.35;
        const opacity = n <= 1000 ? 0.8 : n <= 10000 ? 0.45 : 0.25;
        for (let i = 0; i < panel.xs.length; i++) sc.circle(x(panel.xs[i]), y(panel.ys[i]), r, { fill: COLOR.mark, opacity });
        return;
      }
      case "binned-heatmap": {
        const x = linear([data.x.lo, data.x.hi], [plot.x, plot.x + plot.w]);
        const y = linear([data.y.lo, data.y.hi], [plot.y + plot.h, plot.y]);
        for (const c of panel.cells) {
          const x0 = x(data.x.lo + c.i * data.x.width), x1 = x(data.x.lo + (c.i + 1) * data.x.width);
          const y0 = y(data.y.lo + (c.j + 1) * data.y.width), y1 = y(data.y.lo + c.j * data.y.width);
          sc.rect(x0, y0, x1 - x0, y1 - y0, { fill: shade(c.n, data.max), tip: `${count(c.n)} rows` });
        }
        sc.rect(plot.x, plot.y, plot.w, plot.h, { stroke: COLOR.grid, sw: LINE.thin });
        axis(sc, y, yKind, "y", plot, { show: edge.left, grid: false });
        axis(sc, x, xKind, "x", plot, { show: edge.bottom });
        return;
      }
      case "box-by-group": {
        const xb = band(shared.groups, [plot.x, plot.x + plot.w], 0.35);
        const y = linear(shared.y, [plot.y + plot.h, plot.y]);
        axis(sc, y, yKind, "y", plot, { show: edge.left });
        for (const b of panel.boxes) drawBox(sc, b, xb(b.group), xb.width, y, spec, b.group === data.other);
        bandAxis(sc, xb, "x", plot, { show: edge.bottom });
        return;
      }
      case "mean-bar": {
        const xb = band(shared.groups, [plot.x, plot.x + plot.w], 0.3);
        const y = linear(shared.y, [plot.y + plot.h, plot.y]);
        axis(sc, y, "linear", "y", plot, { show: edge.left });
        for (const b of panel.bars) {
          const x0 = xb(b.group);
          const top = Math.min(y(0), y(b.value)), h = Math.abs(y(b.value) - y(0));
          sc.rect(x0, top, xb.width, h, { fill: b.group === data.other ? COLOR.other : COLOR.mark, tip: `${b.group}: ${data.fn} ${number(b.value)}, n = ${count(b.n)}${b.lo !== null ? `, 95% interval ${number(b.lo)} to ${number(b.hi)}` : ""}` });
          if (b.lo !== null && b.hi !== null) {
            const cx = x0 + xb.width / 2, cap = Math.min(2, xb.width * 0.2);
            sc.line(cx, y(b.lo), cx, y(b.hi), { stroke: COLOR.ink, sw: 0.75 });
            sc.line(cx - cap, y(b.lo), cx + cap, y(b.lo), { stroke: COLOR.ink, sw: 0.75 });
            sc.line(cx - cap, y(b.hi), cx + cap, y(b.hi), { stroke: COLOR.ink, sw: 0.75 });
          }
        }
        sc.line(plot.x, y(0), plot.x + plot.w, y(0), { stroke: COLOR.ink, sw: LINE.thin });
        const ns = shared.groups.map((g) => { const b = panel.bars.find((x) => x.group === g); return `n = ${b ? count(b.n) : 0}`; });
        bandAxis(sc, xb, "x", plot, { show: edge.bottom, sub: ns });
        return;
      }
      case "count-heatmap": case "period-heatmap": {
        const yb = band(shared.ylevels, [plot.y, plot.y + plot.h], 0.04);
        let place;
        if (spec.kind === "count-heatmap") {
          const xb = band(shared.xlevels, [plot.x, plot.x + plot.w], 0.04);
          place = (c) => [xb(c.x), xb.width];
          for (const c of panel.cells) {
            const [x0, w] = place(c);
            const fill = shade(c.n, data.max);
            sc.rect(x0, yb(c.y), w, yb.width, { fill, tip: `${c.x} and ${c.y}: ${count(c.n)} rows` });
            if (w >= textWidth(count(c.n), SIZE.small) + 1 && yb.width >= SIZE.small * PT * 1.2) sc.text(x0 + w / 2, yb(c.y) + yb.width / 2 + SIZE.small * PT * 0.35, count(c.n), { anchor: "middle", size: SIZE.small, fill: inkOn(fill) });
          }
          bandAxis(sc, xb, "x", plot, { show: edge.bottom });
        } else {
          const x = linear(shared.x, [plot.x, plot.x + plot.w]);
          for (const c of panel.cells) {
            const x0 = x(c.p), x1 = x(nextOf(c.p, data.unit));
            sc.rect(x0, yb(c.g), Math.max(0.15, x1 - x0), yb.width, { fill: shade(c.n, shared.max), tip: `${timeLabel(c.p, data.unit)}, ${c.g}: ${count(c.n)} rows` });
          }
          axis(sc, x, "time", "x", plot, { show: edge.bottom });
        }
        bandAxis(sc, yb, "y", plot, { show: edge.left, room: shared.room });
        return;
      }
      default: break;
    }
  }

  /** The start of the next period (as in src/charts.js), for drawing a period's width. */
  function nextOf(t, unit) {
    const d = new Date(t * 1000);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (unit === "year") return Date.UTC(y + 1, 0, 1) / 1000;
    if (unit === "quarter") return Date.UTC(y, m + 3, 1) / 1000;
    if (unit === "month") return Date.UTC(y, m + 1, 1) / 1000;
    if (unit === "week") return t + 7 * DAY;
    if (unit === "day") return t + DAY;
    return t + 3600;
  }

  /* ---------- timelines ---------- */

  const precisionUnit = (p) => (p === "year" ? "year" : p === "month" ? "month" : null);

  /**
   * Pack spans into lanes, first fit in order: each item takes the first lane whose last span ends before it
   * starts (with a gap). Items that find no lane among `max` are placed in the lane that frees first and marked
   * `crowded`, so their labels are left out.
   * @param {{ x0: number, x1: number }[]} items in drawing order @param {number} max @param {number} gap
   */
  function lanes(items, max, gap = 1) {
    const ends = [];
    return items.map((it) => {
      let lane = ends.findIndex((end) => end + gap <= it.x0);
      let crowded = false;
      if (lane < 0 && ends.length < max) { lane = ends.length; ends.push(-Infinity); }
      if (lane < 0) { lane = ends.indexOf(Math.min(...ends)); crowded = true; }
      ends[lane] = Math.max(ends[lane], it.x1);
      return { ...it, lane, crowded };
    });
  }

  /** The label of a timeline event: the label, the date as written, and how many rows it merges. */
  const eventLabel = (e, raw) => `${e.label} (${raw})${e.n > 1 ? ` ×${count(e.n)}` : ""}`;

  function drawTimeline(sc, spec, data, plot) {
    const LANE = 3.4, size = SIZE.small;
    const capacity = Math.max(1, Math.floor(plot.h / LANE));
    const point = spec.kind === "point-timeline";
    const span = (t, p) => { const u = precisionUnit(p); return u ? nextOf(t, u) : t; };
    const times = point ? data.events.flatMap((e) => [e.t, span(e.t, e.p)]) : [data.range.lo, data.range.hi];
    let lo = Math.min(...times), hi = Math.max(...times);
    if (!(hi > lo)) { lo -= DAY * 182; hi += DAY * 182; }
    const padT = (hi - lo) * 0.03;
    const x = linear([lo - padT, hi + padT], [plot.x, plot.x + plot.w]);
    axis(sc, x, "time", "x", plot, { grid: true });
    const right = plot.x + plot.w;
    // A label goes right of its mark, or left of it when it would leave the plot; an open end holds its label inside.
    const items = data.events.map((e) => {
      const m0 = point ? x(e.t) - 0.8 : e.s === null ? plot.x : x(e.s);
      const m1 = point ? Math.max(x(e.t) + 0.8, x(span(e.t, e.p))) : Math.max((e.e === null ? right : x(span(e.e, e.pe))), m0 + 0.8);
      const open = point ? "" : e.s === null ? " (start unknown)" : e.e === null ? " (end unknown)" : "";
      const text = fit(point ? eventLabel(e, e.raw) : `${e.label}${e.n > 1 ? ` ×${count(e.n)}` : ""}${open}`, size, 60);
      const w = textWidth(text, size) + 0.8;
      const inside = !point && e.e === null;
      const side = inside ? "inside" : m1 + w <= right ? "right" : "left";
      const x0 = side === "left" ? m0 - w : m0, x1 = side === "right" ? m1 + w : m1;
      return { e, x0, x1, mark: [m0, m1], text, side };
    });
    // When the lanes run out, the last lane becomes a strip of marks without labels.
    let placed = lanes(items, capacity);
    const rug = placed.some((p) => p.crowded) && capacity > 1;
    if (rug) placed = lanes(items, capacity - 1).map((p) => (p.crowded ? { ...p, lane: capacity - 1 } : p));
    // Few lanes spread out over the plot, at most 7 mm apart.
    const used = Math.max(1, ...placed.map((p) => p.lane + 1));
    const laneH = Math.min(7, Math.max(LANE, plot.h / used));
    if (rug) {
      const y = plot.y + laneH * (capacity - 1);
      sc.line(plot.x, y, plot.x + plot.w, y, { stroke: COLOR.grid, sw: LINE.thin });
    }
    for (const p of placed) {
      const cy = plot.y + laneH * (p.lane + 0.5);
      const e = p.e;
      if (point) {
        const u = precisionUnit(e.p);
        const tip = `${e.label}: ${e.raw}${e.n > 1 ? `, ${count(e.n)} rows` : ""}${u ? `, known to the ${u}` : ""}${e.q ? ", approximate" : ""}`;
        if (u) {
          sc.hatch = true;
          sc.rect(x(e.t), cy - LANE * 0.3, Math.max(0.8, x(nextOf(e.t, u)) - x(e.t)), LANE * 0.6, { hatch: true, stroke: COLOR.mark, sw: LINE.thin, dash: e.q ? "0.6 0.4" : undefined, tip });
        } else sc.circle(x(e.t), cy, 0.8, e.q ? { fill: COLOR.paper, stroke: COLOR.mark, sw: 0.75, tip } : { fill: COLOR.mark, tip });
        if (p.crowded) sc.dropped += 1;
        else if (p.side === "left") sc.text(p.mark[0] - 0.6, cy + size * PT * 0.35, p.text, { size, anchor: "end", tip });
        else sc.text(p.mark[1] + 0.6, cy + size * PT * 0.35, p.text, { size, tip });
        continue;
      }
      const [x0, x1] = p.mark;
      const tip = `${e.label}: ${e.sraw ?? "start unknown"} to ${e.eraw ?? "end unknown"}${e.n > 1 ? `, ${count(e.n)} rows` : ""}`;
      const h = LANE * 0.55;
      const us = precisionUnit(e.ps), ue = precisionUnit(e.pe);
      const solid0 = e.s !== null && us ? Math.min(x1, x(nextOf(e.s, us))) : x0;
      const solid1 = e.e !== null && ue ? Math.max(solid0, x(e.e)) : x1;
      if (e.s === null) sc.rect(x0, cy - h / 2, Math.max(0.4, solid1 - x0), h, { fill: COLOR.paper, stroke: COLOR.mark, sw: LINE.thin, dash: "0.8 0.5", tip: `${tip} (start unknown)` });
      else if (e.e === null) sc.rect(solid0, cy - h / 2, Math.max(0.4, x1 - solid0), h, { fill: COLOR.paper, stroke: COLOR.mark, sw: LINE.thin, dash: "0.8 0.5", tip: `${tip} (end unknown)` });
      else sc.rect(solid0, cy - h / 2, Math.max(0.4, solid1 - solid0), h, { fill: COLOR.mark, tip });
      if (e.s !== null && us) { sc.hatch = true; sc.rect(x0, cy - h / 2, Math.max(0.4, solid0 - x0), h, { hatch: true, stroke: COLOR.mark, sw: LINE.thin, dash: e.qs ? "0.6 0.4" : undefined, tip: `${tip} (start known to the ${us})` }); }
      if (e.e !== null && ue) { sc.hatch = true; sc.rect(solid1, cy - h / 2, Math.max(0.4, x1 - solid1), h, { hatch: true, stroke: COLOR.mark, sw: LINE.thin, dash: e.qe ? "0.6 0.4" : undefined, tip: `${tip} (end known to the ${ue})` }); }
      if (p.crowded) { sc.dropped += 1; continue; }
      const ty = cy + size * PT * 0.35;
      if (p.side === "inside") sc.text(Math.max(solid0, x0) + 0.8, ty, p.text, { size, tip });
      else if (p.side === "left") sc.text(x0 - 0.6, ty, p.text, { size, anchor: "end", tip });
      else sc.text(x1 + 0.6, ty, p.text, { size, tip });
    }
    if (!data.events.length) sc.text(plot.x + plot.w / 2, plot.y + plot.h / 2, "No events on this page.", { anchor: "middle", fill: COLOR.muted });
  }

  /* ---------- the figure ---------- */

  const KIND_LABEL = { histogram: "Histogram", box: "Box plot", bar: "Bar chart of counts", "count-series": "Count time series", scatter: "Scatter plot", "binned-heatmap": "Binned heatmap",
    "box-by-group": "Box plot by group", "mean-bar": "Mean bar chart", "count-heatmap": "Count heatmap", "mean-series": "Mean time series", "period-heatmap": "Period-by-category heatmap",
    "point-timeline": "Point timeline", "interval-timeline": "Interval timeline" };

  /** The automatic caption: how the figure was made, under the rules of grammar v1. */
  function autoCaption(spec, data) {
    const t = (id) => spec.transform.find((/** @type {any} */ x) => x.id === id);
    const unitWord = (u) => (u === "day" ? "day" : u);
    const levelsLine = (n, what) => `the ${n} most frequent ${what} kept, the rest as Other`;
    switch (spec.kind) {
      case "histogram": return `${data.x.bins} bins of equal width (${data.x.rule === "set" ? "set by you" : "the Freedman–Diaconis rule, kept within 5 to 100"})${isLog(spec, "x") ? ", on a log10 axis" : ""}.`;
      case "box": return "The box spans the quartiles with the median inside; whiskers reach the most extreme values within 1.5 × IQR of the box; values beyond are drawn as points (at most 200).";
      case "bar": return `Rows per level${data.facts.levelsOther ? `, ${levelsLine(t("top:x").n, "levels")}` : ""}.`;
      case "count-series": return `Rows per ${unitWord(data.unit)}${t("period:x").unit === "auto" ? " (the coarsest period giving at least 20)" : ""}.`;
      case "scatter": return data.facts.scatterSample ? `A seeded sample of ${count(data.facts.scatterSample.rows)} of ${count(data.facts.scatterSample.of)} points (seed ${data.facts.scatterSample.seed}).` : "Every point is drawn.";
      case "binned-heatmap": return "Rows per cell of a 40 × 40 grid; darker is more; empty cells are white.";
      case "box-by-group": return `One box a group${data.other ? ` (${levelsLine(t("top:x").n, "groups")})` : ""}: quartiles, median, whiskers within 1.5 × IQR, points beyond.`;
      case "mean-bar": return data.fn === "sum" ? "Bars show the sum per group from zero (a field you marked additive); n under each group." : "Bars show the mean per group from zero; lines show its 95% t interval; n under each group.";
      case "count-heatmap": return `Rows per pair of levels${data.other.x || data.other.y ? ` (${levelsLine(12, "levels")} on ${data.other.x && data.other.y ? "each axis" : data.other.x ? "the x axis" : "the y axis"})` : ""}; darker is more.`;
      case "mean-series": {
        const ns = data.panels.flatMap((p) => p.series.map((s) => s.n)).filter((n) => n > 0);
        return `${data.fn === "sum" ? "Sum" : "Mean"} per ${unitWord(data.unit)}${data.fn === "mean" ? " with its 95% t interval (band)" : ""}; n per ${unitWord(data.unit)} from ${count(Math.min(...ns))} to ${count(Math.max(...ns))}.`;
      }
      case "period-heatmap": return `Rows per ${unitWord(data.unit)} and level; darker is more.`;
      case "point-timeline": case "interval-timeline": {
        const first = (data.page.page - 1) * data.page.size + 1;
        const last = Math.min(data.page.events, data.page.page * data.page.size);
        const marks = spec.kind === "point-timeline" ? "Dots are dates to the day or time; hatched spans are dates known only to the year or month; open or dashed marks are dates written as approximate (c., ~, ?)." : "Bars run from start to end; hatched ends are dates known only to the year or month; dashed bars are open: the start or end is unknown.";
        return `${marks} The same label at the same date is one mark (×n). Events ${count(first)}–${count(last)} of ${count(data.page.events)}${data.page.pages > 1 ? `, page ${data.page.page} of ${data.page.pages} in time order` : ""}.`;
      }
      default: return "";
    }
  }

  /** The facts every caption states: rows used, rows left out, a sampled table. */
  function factsLine(spec, data) {
    const f = data.facts;
    const parts = [`${count(f.used)} of ${count(f.rows)} rows of ${spec.data.table}`];
    if (f.left) parts.push(`${count(f.left)} left out with a value missing or not read`);
    if (spec.data.sample) parts.push(`the table is a seeded sample of ${count(spec.data.sample.rows)} rows (seed ${spec.data.sample.seed})`);
    return `${parts.join("; ")}.`;
  }

  /** A one-sentence description for screen readers. */
  function describe(spec, data) {
    const base = `${KIND_LABEL[spec.kind]}: ${spec.annotation.title}.`;
    return `${base} ${factsLine(spec, data)} ${autoCaption(spec, data)}`.trim();
  }

  /** Shared domains and levels across panels. */
  function shared(spec, data) {
    const panels = data.panels;
    switch (spec.kind) {
      case "histogram": return { y: niceDomain(0, Math.max(1, ...panels.flatMap((p) => p.counts)), 5, true) };
      case "box": case "box-by-group": { const [lo, hi] = boxDomain(data); const pad = (hi - lo) * 0.05 || Math.abs(lo) * 0.05 || 1; return { y: [lo - pad, hi + pad], groups: data.groups }; }
      case "bar": {
        const levels = panels[0].bars.map((b) => b.level);
        const horizontal = spec.scale.x?.order !== "value";
        return { y: niceDomain(0, Math.max(1, ...panels.flatMap((p) => p.bars.map((b) => b.n))), 5, true), horizontal, room: Math.min(40, Math.max(...levels.map((l) => textWidth(l, SIZE.tick)))) };
      }
      case "count-series": case "mean-series": {
        const lo = data.periods[0], hi = nextOf(data.periods[data.periods.length - 1], data.unit);
        if (spec.kind === "count-series") return { x: [lo, hi], y: niceDomain(0, Math.max(1, ...panels.flatMap((p) => p.series.map((s) => s.n))), 5, true) };
        const log = isLog(spec, "y");
        const vals = panels.flatMap((p) => p.series.flatMap((s) => [s.value, s.lo, s.hi])).filter((v) => v !== null && Number.isFinite(v) && (!log || v > 0));
        const ys = log ? vals.map(Math.log10) : vals;
        return { x: [lo, hi], y: log ? [Math.min(...ys) - 0.05, Math.max(...ys) + 0.05] : niceDomain(Math.min(...ys), Math.max(...ys)) };
      }
      case "scatter": {
        const padX = (data.x.hi - data.x.lo) * 0.03 || 1, padY = (data.y.hi - data.y.lo) * 0.03 || 1;
        return { x: [data.x.lo - padX, data.x.hi + padX], y: [data.y.lo - padY, data.y.hi + padY], n: panels.reduce((a, p) => a + p.xs.length, 0) };
      }
      case "mean-bar": {
        const vals = panels.flatMap((p) => p.bars.flatMap((b) => [b.value, b.lo, b.hi])).filter((v) => v !== null && Number.isFinite(v));
        return { y: niceDomain(Math.min(0, ...vals), Math.max(0, ...vals), 5, true), groups: data.groups };
      }
      case "count-heatmap": return { xlevels: data.xlevels, ylevels: data.ylevels, room: Math.min(36, Math.max(...data.ylevels.map((l) => textWidth(l, SIZE.tick)))) };
      case "period-heatmap": return { x: [data.periods[0], nextOf(data.periods[data.periods.length - 1], data.unit)], ylevels: data.ylevels, max: Math.max(1, ...panels.flatMap((p) => p.cells.map((c) => c.n))), room: Math.min(36, Math.max(...data.ylevels.map((l) => textWidth(l, SIZE.tick)))) };
      default: return {};
    }
  }

  /** The room a panel needs left of and below its plot for tick labels. */
  function margins(spec, data, sh, plotH) {
    const yKind = kindOf(spec, "y");
    let left = 6, bottom = 1.2 + SIZE.tick * PT * 1.6;
    switch (spec.kind) {
      case "histogram": case "box": case "count-series": case "mean-series": case "scatter": case "box-by-group": case "mean-bar":
        left = yLabelWidth(linear(sh.y, [plotH, 0]), spec.kind === "count-series" || spec.kind === "histogram" || spec.kind === "mean-bar" ? "linear" : yKind, plotH) + 2.4;
        break;
      case "binned-heatmap": left = yLabelWidth(linear([data.y.lo, data.y.hi], [plotH, 0]), yKind, plotH) + 2.4; break;
      case "bar": left = sh.horizontal ? sh.room + 2 : yLabelWidth(linear(sh.y, [plotH, 0]), "linear", plotH) + 2.4; break;
      case "count-heatmap": case "period-heatmap": left = sh.room + 2; break;
      default: break;
    }
    if (spec.kind === "box-by-group" || spec.kind === "mean-bar" || spec.kind === "count-heatmap" || (spec.kind === "bar" && !sh.horizontal)) {
      const levels = spec.kind === "count-heatmap" ? sh.xlevels : spec.kind === "bar" ? data.panels[0].bars.map((b) => b.level) : sh.groups;
      bottom = bandAxisHeight(levels, 120 / Math.max(1, levels.length), spec.kind === "mean-bar" ? "n = 0000" : "");
    }
    return { left, bottom };
  }

  /**
   * Draw a specification with its computed data (src/charts.js compute). Returns the SVG, the scene and what the
   * layout gave up: label collisions and labels left out for lack of room.
   * @param {any} spec @param {any} data
   */
  function render(spec, data) {
    const W = spec.layout.width, H = spec.layout.height;
    const sc = scene(W, H);
    const pad = 4;
    const inner = W - 2 * pad;
    // Title, then the axis labels, the plot, the caption.
    const title = fit(spec.annotation.title, SIZE.title, inner);
    sc.text(pad, pad + SIZE.title * PT * 0.8, title, { size: SIZE.title, weight: "bold", tip: spec.annotation.title });
    let top = pad + SIZE.title * PT * 1.3;
    const sampled = spec.data.sample || data.facts.scatterSample;
    if (sampled) {
      const s = data.facts.scatterSample ? `Sample: ${count(data.facts.scatterSample.rows)} of ${count(data.facts.scatterSample.of)} points drawn (seed ${data.facts.scatterSample.seed})` : "";
      const t = spec.data.sample ? `Sample: the table holds a seeded sample of ${count(spec.data.sample.rows)} rows (seed ${spec.data.sample.seed})` : "";
      top += SIZE.small * PT * 1.1;
      sc.text(pad, top, fit([t, s].filter(Boolean).join("; "), SIZE.small, inner), { size: SIZE.small, fill: COLOR.muted, weight: "bold" });
    }
    top += 2;
    const caption = [spec.annotation.caption || autoCaption(spec, data), factsLine(spec, data), ...data.facts.notes, ...spec.annotation.notes].filter(Boolean).join(" ");
    let lines = wrap(caption, SIZE.caption, inner);
    const maxLines = Math.max(2, Math.floor((H * 0.3) / (SIZE.caption * PT * 1.25)));
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = fit(`${lines[maxLines - 1]} …`, SIZE.caption, inner); }
    const capH = lines.length * SIZE.caption * PT * 1.25 + 1.5;
    lines.forEach((l, i) => sc.text(pad, H - pad - capH + 1.5 + (i + 0.8) * SIZE.caption * PT * 1.25, l, { size: SIZE.caption, fill: COLOR.muted }));
    const labels = spec.annotation.labels;
    const zone = (ch) => (spec.scale[ch]?.zone === "utc" ? " (UTC)" : spec.scale[ch]?.zone === "unknown" ? " (zone unknown)" : "");
    const horizontal = spec.kind === "bar" && spec.scale.x?.order !== "value";
    const xTitle = spec.kind === "box" ? "" : horizontal ? labels.y : spec.kind === "interval-timeline" ? `${labels.x} to ${labels.x2}${zone("x")}` : `${labels.x ?? ""}${zone("x")}`;
    const yTitle = spec.kind === "box" ? labels.y : spec.kind.endsWith("timeline") ? "" : horizontal ? labels.x : labels.y ?? "";
    const legend = spec.kind.endsWith("heatmap") ? 16 : 0;
    const bottomTitle = SIZE.label * PT * 1.4;
    const leftTitle = yTitle ? SIZE.label * PT * 1.6 : 0;
    const area = { x: pad + leftTitle, y: top, w: inner - leftTitle - legend, h: H - pad - capH - top - (xTitle ? bottomTitle : 0) - 1 };
    if (spec.kind.endsWith("timeline")) {
      const plot = { x: area.x + 1, y: area.y, w: area.w - 2, h: area.h - SIZE.tick * PT * 2.2 };
      drawTimeline(sc, spec, data, plot);
    } else {
      const sh = shared(spec, data);
      const panels = data.panels;
      const cols = data.facets ? Math.min(panels.length, spec.layout.facet.columns) : 1;
      const rows = Math.ceil(panels.length / cols);
      const headH = data.facets ? SIZE.label * PT * 1.5 : 0;
      const cellW = area.w / cols, cellH = area.h / rows;
      const m = margins(spec, data, sh, cellH - headH);
      panels.forEach((panel, i) => {
        const c = i % cols, r = Math.floor(i / cols);
        const x0 = area.x + c * cellW, y0 = area.y + r * cellH;
        const plot = { x: x0 + m.left, y: y0 + headH + 1, w: Math.max(5, cellW - m.left - 2), h: Math.max(5, cellH - headH - m.bottom - 1) };
        if (data.facets) sc.text(plot.x, y0 + SIZE.label * PT * 1.05, fit(`${spec.layout.facet.field}: ${panel.facet}`, SIZE.label, cellW - 2), { size: SIZE.label, weight: "bold", tip: panel.facet });
        drawPanel(sc, spec, data, panel, plot, sh, { left: true, bottom: true });
      });
      if (legend) {
        const max = spec.kind === "period-heatmap" ? sh.max : data.max;
        const lx = area.x + area.w + 4, ly = area.y + 2, lh = Math.min(30, area.h * 0.6);
        sc.text(lx, ly, "Rows", { size: SIZE.small, fill: COLOR.muted });
        const steps = SEQUENTIAL.length - 1;
        for (let k = 0; k < steps; k++) sc.rect(lx, ly + 1.5 + (lh * (steps - 1 - k)) / steps, 3, lh / steps + 0.05, { fill: SEQUENTIAL[k + 1] });
        sc.text(lx + 4, ly + 1.5 + SIZE.small * PT * 0.8, count(max), { size: SIZE.small });
        sc.text(lx + 4, ly + 1.5 + lh, "1", { size: SIZE.small });
      }
    }
    if (xTitle) sc.text(area.x + area.w / 2, H - pad - capH - 0.6, fit(xTitle, SIZE.label, area.w), { size: SIZE.label, anchor: "middle", fill: COLOR.ink });
    if (yTitle) sc.text(pad + SIZE.label * PT * 0.9, area.y + area.h / 2, fit(yTitle, SIZE.label, area.h), { size: SIZE.label, anchor: "middle", rotate: -90 });
    if (sc.dropped) {
      sc.text(W - pad, top - 0.6, `${count(sc.dropped)} event${sc.dropped === 1 ? "" : "s"} drawn without a label, for lack of room (the bottom strip)`, { size: SIZE.small, anchor: "end", fill: COLOR.muted });
    }
    const id = String(spec.id).replace(/[^a-z0-9_-]+/gi, "-");
    const desc = describe(spec, data);
    return { svg: toSvg(sc, spec.annotation.title, desc, id), desc, collisions: sc.collisions, dropped: sc.dropped, marks: sc.items.length };
  }

  return { PT, COLOR, SEQUENTIAL, SIZE, LINE, WIDTHS, textWidth, fit, wrap, number, linearTicks, niceDomain, logTicks, timeTicks, timeLabel, shade, luminance, lanes, eventLabel, autoCaption, render, KIND_LABEL };
});
