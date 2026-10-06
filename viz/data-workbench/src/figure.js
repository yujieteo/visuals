/* Universal Data Workbench: the publication presets and the checks of a figure at its final size.
 *
 * A preset is a set of rules, each with where it comes from: the general preset's rules are the workbench's own
 * (spec.md sections 9 and 15); Nature's come from its research figure guide, read on 2026-10-06, each with the page
 * and the date; Science's page could not be read (science.org answered HTTP 403 to automated reads), so every
 * Science rule is unverified until the captain's saved copy of it is read (spec.md, answer 6).
 *
 * settings → style and size: what src/render.js draws. check(drawn, ...) reads the scene graph the renderer drew
 * and, for each file, what src/pdf.js and src/png.js wrote and read back: each check passes, fails, is unverified
 * or does not apply, and names its rule. A figure meets a preset only when every check that applies passes; while
 * one is unverified there is no compliance claim. Pure functions: the page and the Node checks call the same ones.
 */
(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./render.js") : root.DWRender);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWFigure = api;
})(typeof self !== "undefined" ? self : this, function (Render) {
  "use strict";

  const PT = Render.PT;
  const READ = "2026-10-06";
  /** Where each rule comes from. */
  const SOURCES = {
    workbench: { title: "The workbench's own rules: spec.md, sections 9 and 15 (the agreed plan)", url: "spec.md", read: "2026-10-05" },
    natureSpecs: { title: "Nature research figure guide: Preparing figures – our specifications", url: "https://research-figure-guide.nature.com/figures/preparing-figures-our-specifications/", read: READ },
    natureBuild: { title: "Nature research figure guide: Building and exporting figure panels", url: "https://research-figure-guide.nature.com/figures/building-and-exporting-figure-panels/", read: READ },
    science: { title: "Science: instructions for preparing revised research articles", url: "https://www.science.org/content/page/instructions-authors-revised-research-articles", read: null,
      note: "Not read: science.org answered HTTP 403 to automated reads on 2026-10-05 and 2026-10-06. Every Science rule stays unverified until the captain's saved copy of the page is read." },
  };

  /* Text sizes in points by role; Nature's keep every text between 5 and 7 pt. */
  const NATURE_SIZES = { title: 7, label: 7, tick: 6, caption: 6, small: 5.5 };

  /**
   * The presets. Each rule: id, what it asks, the source, and its status: "verified" (read in the source on its
   * date), "unverified" (not read) or "workbench" (the workbench's own rule, not a journal's).
   */
  const PRESETS = {
    general: {
      id: "general", name: "General", journal: null, stage: "Any publication: the workbench's own rules",
      defaults: { width: null, height: null, dpi: 300, inFigure: true },
      widths: null, maxHeight: null, text: { min: 6, max: null }, line: 0.5, dpi: 300,
      style: {},
      formats: { svg: "accepted", pdf: "accepted", png: "accepted" },
      rules: [
        { id: "size", text: "180 mm wide unless you set another width; 300 dpi PNG", source: "workbench", status: "workbench" },
        { id: "text", text: "Text at least 6 pt at final size", source: "workbench", status: "workbench" },
        { id: "lines", text: "Lines at least 0.5 pt at final size", source: "workbench", status: "workbench" },
        { id: "fonts", text: "Fonts embedded, text kept as text (never outlined) in SVG and PDF", source: "workbench", status: "workbench" },
        { id: "colour", text: "RGB, a palette that stays readable with colour blindness; text contrast at least 4.5:1, marks at least 3:1", source: "workbench", status: "workbench" },
        { id: "layout", text: "Nothing clipped at the page edge; no labels that overlap", source: "workbench", status: "workbench" },
      ],
    },
    nature: {
      id: "nature", name: "Nature", journal: "Nature", stage: "Figures of primary research content prepared for publication (the guide names no submission stage)",
      defaults: { width: 183, height: null, dpi: 450, inFigure: false },
      widths: [89, 183], maxHeight: 170, text: { min: 5, max: 7 }, line: 0.5, dpi: 450,
      style: { sizes: NATURE_SIZES, ink: "#000000", muted: "#000000", grid: false, hatch: false },
      formats: { svg: "acceptable", pdf: "preferred", png: "not accepted" },
      rules: [
        { id: "width", text: "Printed widths: 89 mm (single column) or 183 mm (double column)", source: "natureBuild", status: "verified" },
        { id: "height", text: "Maximum height 170 mm, so that the legend fits below", source: "natureBuild", status: "verified" },
        { id: "text", text: "All text between 5 pt and 7 pt; panel labels 8 pt bold, upright, lowercase a, b, c", source: "natureSpecs", status: "verified" },
        { id: "font", text: "Standard sans-serif fonts, preferably Helvetica or Arial", source: "natureSpecs", status: "verified" },
        { id: "embed", text: "Do not outline text; embed fonts (TrueType 2 or 42, not Type 3); keep editing capabilities", source: "natureSpecs", status: "verified" },
        { id: "colour-text", text: "Avoid coloured text: black or white text with contrast above 4.5:1", source: "natureBuild", status: "verified" },
        { id: "palette", text: "An accessible colour palette; avoid red and green together and rainbow scales", source: "natureSpecs", status: "verified" },
        { id: "grid", text: "Avoid background gridlines", source: "natureSpecs", status: "verified" },
        { id: "patterns", text: "Avoid patterns", source: "natureSpecs", status: "verified" },
        { id: "axes", text: "Axis lines and tick marks; every axis labelled with its unit in parentheses", source: "natureSpecs", status: "verified" },
        { id: "rgb", text: "RGB colour space, not CMYK", source: "natureSpecs", status: "verified" },
        { id: "formats", text: "Main figures as vector files: PDF, EPS or AI preferred; SVG acceptable; PNG not accepted", source: "natureBuild", status: "verified" },
        { id: "resolution", text: "Images at least 450 dpi in exported artwork", source: "natureSpecs", status: "verified" },
        { id: "file", text: "Files of at most 50 MB where possible, every component embedded", source: "natureBuild", status: "verified" },
      ],
    },
    science: {
      id: "science", name: "Science", journal: "Science", stage: "Revised research articles (the page named in the specification)",
      defaults: { width: null, height: null, dpi: 300, inFigure: true },
      widths: null, maxHeight: null, text: { min: 6, max: null }, line: 0.5, dpi: 300,
      style: {},
      formats: { svg: "unverified", pdf: "unverified", png: "unverified" },
      rules: ["Figure widths and maximum height", "Text sizes and fonts", "Accepted file formats", "Raster resolution", "Colour and line weights"]
        .map((text, i) => ({ id: `science-${i + 1}`, text, source: "science", status: "unverified" })),
    },
  };

  const LIMITS = { width: [40, 500], height: [30, 500], dpi: [72, 1200], pixels: 16_777_216 };

  /** Settings with the preset's defaults filled in and every number held to its limits. */
  function settingsOf(s = {}) {
    const preset = PRESETS[s.preset] ? s.preset : "general";
    const d = PRESETS[preset].defaults;
    const num = (v, [lo, hi], fallback) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? fallback : Math.min(hi, Math.max(lo, Number(v))));
    return {
      preset,
      width: num(s.width, LIMITS.width, d.width),
      height: num(s.height, LIMITS.height, d.height),
      dpi: Math.round(num(s.dpi, LIMITS.dpi, d.dpi)),
      inFigure: typeof s.inFigure === "boolean" ? s.inFigure : d.inFigure,
    };
  }

  /**
   * The final size of a chart in millimetres: the set width (or the chart's own), and the set height (or the chart's
   * height scaled with its width), held under the preset's maximum height.
   */
  function sizeOf(spec, settings) {
    const s = settingsOf(settings);
    const p = PRESETS[s.preset];
    const width = s.width ?? spec.layout.width;
    let height = s.height ?? Math.round((spec.layout.height * width) / spec.layout.width * 10) / 10;
    if (p.maxHeight) height = Math.min(height, p.maxHeight);
    height = Math.max(LIMITS.height[0], height);
    return { width, height };
  }

  /** The specification at its final size: a copy whose layout holds the size; nothing else changes. */
  function sized(spec, settings) {
    const { width, height } = sizeOf(spec, settings);
    if (width === spec.layout.width && height === spec.layout.height) return spec;
    return { ...spec, layout: { ...spec.layout, width, height } };
  }

  /**
   * The style src/render.js draws with: the preset's, with the title and caption in the figure or in the legend, and
   * the font's family and widths.
   * @param {any} settings @param {{ family?: string, measure?: Function | null }} [font]
   */
  function styleOf(settings, font = {}) {
    const s = settingsOf(settings);
    return { ...PRESETS[s.preset].style, title: s.inFigure, caption: s.inFigure, family: font.family ?? Render.FONT, measure: font.measure ?? null };
  }

  /* ---------- colour ---------- */

  const hex = (c) => {
    const m = /^#([0-9a-f]{6})$/i.exec(String(c ?? "").trim());
    return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255) : null;
  };
  const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const fromLinear = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  const lum = (rgb) => { const [r, g, b] = rgb.map(toLinear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  /** WCAG contrast ratio of two sRGB colours (0–1). */
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /** A colour drawn at an opacity over another. */
  const over = (top, a, under) => top.map((v, i) => v * a + under[i] * (1 - a));
  /* Dichromat simulations in linear RGB (Viénot, Brettel and Mollon 1999). */
  const CVD = {
    protanopia: [[0.11238, 0.88762, 0], [0.11238, 0.88762, 0], [0.00401, -0.00401, 1]],
    deuteranopia: [[0.29275, 0.70725, 0], [0.29275, 0.70725, 0], [-0.02234, 0.02234, 1]],
  };
  const simulate = (rgb, m) => { const l = rgb.map(toLinear); return m.map((row) => fromLinear(Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])))); };
  /** CIE L*a*b* of an sRGB colour (D65). */
  function lab(rgb) {
    const [r, g, b] = rgb.map(toLinear);
    const xyz = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883];
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const [fx, fy, fz] = xyz.map(f);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
  const grey = (rgb) => Math.max(...rgb) - Math.min(...rgb) < 0.02;

  /* ---------- geometry of the scene ---------- */

  /** The corners of a text item's box in millimetres: its width from the font, 0.75 em above the baseline, 0.21 below. */
  function textBox(it) {
    const em = it.size * PT;
    const x0 = it.x - (it.anchor === "middle" ? it.w / 2 : it.anchor === "end" ? it.w : 0);
    const corners = [[x0, it.y - 0.75 * em], [x0 + it.w, it.y - 0.75 * em], [x0 + it.w, it.y + 0.21 * em], [x0, it.y + 0.21 * em]];
    if (!it.rotate) return corners;
    const a = (it.rotate * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return corners.map(([x, y]) => [it.x + (x - it.x) * c - (y - it.y) * s, it.y + (x - it.x) * s + (y - it.y) * c]);
  }

  const bounds = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) });

  /** Whether two convex polygons overlap by more than `tol` mm along every axis (separating-axis test). */
  function overlap(a, b, tol = 0.05) {
    for (const poly of [a, b]) {
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const n = [-(y2 - y1) / len, (x2 - x1) / len];
        const proj = (p) => p.map(([x, y]) => x * n[0] + y * n[1]);
        const pa = proj(a), pb = proj(b);
        if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= tol) return false;
      }
    }
    return true;
  }

  /** The extent of a drawn item, for clipping. */
  function extent(it) {
    const half = (it.stroke && !it.gap ? (it.sw ?? 0.5) * PT : 0) / 2;
    switch (it.t) {
      case "rect": return { x0: it.x - half, y0: it.y - half, x1: it.x + it.w + half, y1: it.y + it.h + half };
      case "line": return { x0: Math.min(it.x1, it.x2) - half, y0: Math.min(it.y1, it.y2) - half, x1: Math.max(it.x1, it.x2) + half, y1: Math.max(it.y1, it.y2) + half };
      case "circle": return { x0: it.cx - it.r - half, y0: it.cy - it.r - half, x1: it.cx + it.r + half, y1: it.cy + it.r + half };
      case "path": { const pts = pathPoints(it.d); return pts.length ? { ...bounds(pts), x0: bounds(pts).x0 - half, y0: bounds(pts).y0 - half, x1: bounds(pts).x1 + half, y1: bounds(pts).y1 + half } : null; }
      case "text": return bounds(textBox(it));
      default: return null;
    }
  }

  /** The points of a path of M, L and Z commands (the only ones src/render.js writes). */
  function pathPoints(d) {
    const pts = [];
    for (const m of String(d).matchAll(/[ML]\s*(-?[\d.]+(?:e-?\d+)?)[,\s]+(-?[\d.]+(?:e-?\d+)?)/gi)) pts.push([Number(m[1]), Number(m[2])]);
    return pts;
  }

  /** The colour under a point: the last filled rectangle drawn before item `index` that holds it, or the paper. */
  function backgroundAt(items, index, x, y) {
    let bg = hex(Render.COLOR.paper);
    for (let i = 0; i < index; i++) {
      const it = items[i];
      if (it.t !== "rect" || !it.fill || it.fill === "none" || it.hatch) continue;
      if (x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) {
        const c = hex(it.fill);
        if (c) bg = it.opacity !== undefined && it.opacity < 1 ? over(c, it.opacity, bg) : c;
      }
    }
    return bg;
  }

  /* ---------- checks ---------- */

  const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("en-US");
  const plural = (n, one, many) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

  /** The facts a check reads from a scene, measured once. */
  function measure(scene) {
    const items = scene.items;
    const texts = items.map((it, i) => ({ it, i })).filter(({ it }) => it.t === "text");
    const sizes = texts.map(({ it }) => it.size);
    // Lines a reader sees: every stroke that is not a gap in the paper colour.
    const strokes = items.filter((it) => it.stroke && it.stroke !== "none" && !it.gap && it.stroke.toLowerCase() !== Render.COLOR.paper);
    const boxes = texts.map(({ it, i }) => ({ i, poly: textBox(it), b: bounds(textBox(it)) }));
    let overlaps = 0;
    const pairs = [];
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a].b, B = boxes[b].b;
        if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue;
        if (overlap(boxes[a].poly, boxes[b].poly)) { overlaps += 1; if (pairs.length < 3) pairs.push([items[boxes[a].i].text, items[boxes[b].i].text]); }
      }
    }
    const outside = [];
    for (const it of items) {
      const e = extent(it);
      if (e && (e.x0 < -0.01 || e.y0 < -0.01 || e.x1 > scene.width + 0.01 || e.y1 > scene.height + 0.01)) outside.push(it.t === "text" ? `"${it.text}"` : it.t);
    }
    const shortened = texts.filter(({ it }) => it.text.endsWith("…")).length;
    const paper = hex(Render.COLOR.paper);
    let lowText = [];
    for (const { it, i } of texts) {
      const fg = hex(it.fill);
      if (!fg) continue;
      const cx = (bounds(textBox(it)).x0 + bounds(textBox(it)).x1) / 2, cy = it.y - 0.3 * it.size * PT;
      const r = ratio(fg, backgroundAt(items, i, cx, cy));
      if (r < 4.5) lowText.push({ text: it.text, ratio: r });
    }
    // Marks that carry a value alone (not colour scales, supporting areas, grid lines or frames): their stronger of
    // fill and outline against the paper.
    const marks = items.filter((it) => it.t !== "text" && (it.role ?? (it.t === "line" ? "axis" : "mark")) === "mark");
    let lowMarks = 0, translucent = 0, lowest = Infinity;
    for (const it of marks) {
      const fill = hex(it.fill), stroke = it.stroke && !it.gap ? hex(it.stroke) : null;
      const a = it.opacity ?? 1;
      const best = Math.max(fill ? ratio(a < 1 ? over(fill, a, paper) : fill, paper) : 1, stroke ? ratio(stroke, paper) : 1, it.hatch ? ratio(hex(Render.COLOR.mark), paper) : 1);
      if (best < 3) { if (a < 1 && fill && ratio(fill, paper) >= 3) translucent += 1; else lowMarks += 1; }
      lowest = Math.min(lowest, best);
    }
    const lines = items.filter((it) => it.t === "line" && it.role !== "grid" && it.role !== "frame");
    const lowLines = lines.filter((it) => ratio(hex(it.stroke) ?? [0, 0, 0], paper) < 3).length;
    // The palette: each distinct fill of the marks, and the order of the colour scale, as people with protanopia
    // and deuteranopia see them.
    const fills = [...new Set(marks.map((it) => it.fill).filter((c) => hex(c) && c.toLowerCase() !== Render.COLOR.paper))];
    const close = [];
    for (let a = 0; a < fills.length; a++) for (let b = a + 1; b < fills.length; b++) {
      for (const [name, m] of [["normal vision", null], ...Object.entries(CVD)]) {
        const ca = m ? simulate(hex(fills[a]), m) : hex(fills[a]), cb = m ? simulate(hex(fills[b]), m) : hex(fills[b]);
        if (deltaE(ca, cb) < 10) close.push(`${fills[a]} and ${fills[b]} with ${name}`);
      }
    }
    const scale = [...new Set(items.filter((it) => it.role === "scale").map((it) => it.fill))].filter((c) => Render.SEQUENTIAL.includes(c)).sort((a, b) => Render.SEQUENTIAL.indexOf(a) - Render.SEQUENTIAL.indexOf(b));
    const unordered = Object.entries(CVD).filter(([, m]) => scale.some((c, i) => i > 0 && lum(simulate(hex(c), m)) >= lum(simulate(hex(scale[i - 1]), m)))).map(([n]) => n);
    const hues = fills.filter((c) => !grey(hex(c)));
    const redGreen = hues.some((c) => { const [r, g, b] = hex(c); return r > 0.5 && g < 0.4 && b < 0.4; }) && hues.some((c) => { const [r, g, b] = hex(c); return g > 0.5 && r < 0.4 && b < 0.5; });
    return {
      texts: texts.length, minText: sizes.length ? Math.min(...sizes) : null, maxText: sizes.length ? Math.max(...sizes) : null,
      minLine: strokes.length ? Math.min(...strokes.map((it) => it.sw ?? 0.5)) : null, thin: strokes.filter((it) => (it.sw ?? 0.5) < 0.5 - 1e-9).length,
      overlaps, pairs, outside, shortened, lowText, lowMarks, translucent, lowest, lowLines, close, unordered, redGreen, scaleSteps: scale.length,
      grid: items.filter((it) => it.role === "grid").length, patterns: items.filter((it) => it.hatch).length,
      textColours: [...new Set(texts.map(({ it }) => String(it.fill).toLowerCase()))],
    };
  }

  /** Which channels of a chart show a measure on an axis, their unit when the source or the person gave one, and the axis title as drawn. */
  function measureAxes(spec, scene) {
    const axes = [];
    for (const ch of ["x", "y"]) {
      const enc = spec.encoding[ch];
      if (!enc || enc.class !== "Q") continue;
      if (spec.kind === "count-heatmap") continue;
      const drawn = scene.items.find((/** @type {any} */ it) => it.t === "text" && it.axis === ch);
      axes.push({ channel: ch, field: enc.field, unit: spec.annotation.units?.[ch] ?? "", label: drawn?.text ?? "" });
    }
    return axes;
  }

  /**
   * The checks of one figure: the scene at its final size, and for each file written (svg, pdf, png) what reading
   * it back found. Returns { checks: [{ id, group, label, status, detail, rule }], files: { svg, pdf, png } each with
   * its checks and verdict, verdict } where status is "pass", "fail", "unverified" or "n/a".
   * @param {{ scene: any, dropped?: number }} drawn what Render.render returned
   * @param {{ spec: any, settings: any, font: { name: string, family: string, kind: string, bold: boolean, missing?: (text: string, bold: boolean) => string[] }, files?: Record<string, any> }} o
   */
  function check(drawn, o) {
    const s = settingsOf(o.settings);
    const p = PRESETS[s.preset];
    const sc = drawn.scene;
    const m = measure(sc);
    const rule = (id) => {
      const r = p.rules.find((x) => x.id === id) ?? PRESETS.general.rules.find((x) => x.id === id);
      return r ? { text: r.text, status: r.status, source: SOURCES[r.source] } : null;
    };
    const general = (id) => { const r = PRESETS.general.rules.find((x) => x.id === id); return { text: r.text, status: "workbench", source: SOURCES.workbench }; };
    const nature = p.id === "nature";
    const out = [];
    const add = (id, label, status, detail, r) => out.push({ id, label, status, detail, rule: r });

    // Size.
    const W = sc.width, H = sc.height;
    if (nature) {
      add("size", "Width", p.widths.includes(W) ? "pass" : "fail", p.widths.includes(W) ? `${fmt(W)} mm, ${W === 89 ? "one column" : "two columns"}.` : `${fmt(W)} mm; Nature prints figures 89 mm or 183 mm wide.`, rule("width"));
      add("height", "Height", H <= p.maxHeight ? "pass" : "fail", `${fmt(H)} mm${H <= p.maxHeight ? `, within ${p.maxHeight} mm` : `; at most ${p.maxHeight} mm`}.`, rule("height"));
    } else {
      add("size", "Size", "pass", `${fmt(W)} × ${fmt(H)} mm, as set.`, general("size"));
    }
    // Text size at final size.
    const tooSmall = m.minText !== null && m.minText < p.text.min - 1e-9;
    const tooLarge = p.text.max !== null && m.maxText !== null && m.maxText > p.text.max + 1e-9;
    add("text", "Text size", m.texts === 0 ? "n/a" : tooSmall || tooLarge ? "fail" : "pass",
      m.texts === 0 ? "No text." : `${plural(m.texts, "text", "texts")} from ${fmt(m.minText)} to ${fmt(m.maxText)} pt; the preset asks for ${p.text.max ? `${p.text.min} to ${p.text.max} pt` : `at least ${p.text.min} pt`}.`,
      nature ? rule("text") : general("text"));
    // Font.
    const named = /^(arial|helvetica)\b/i.test(o.font.name);
    if (nature) {
      add("font", "Font", named ? "pass" : "unverified", named ? `${o.font.name}.` : `${o.font.name} ${o.font.kind === "bundled" ? "is an Arial-metric substitute: it has Arial's widths, but Nature names Arial or Helvetica" : "is not Arial or Helvetica; whether Nature counts it as standard is not known"}. Load Arial or Helvetica to pass.`, rule("font"));
    } else if (p.id === "science") {
      add("font", "Font", "unverified", `${o.font.name}: Science's font rule is not known.`, rule("science-2"));
    } else {
      add("font", "Font", "pass", `${o.font.name}${o.font.kind === "bundled" ? ", bundled with the workbench (SIL Open Font License 1.1)" : ", your font"}.`, general("fonts"));
    }
    if (!o.font.bold && sc.items.some((it) => it.t === "text" && it.weight === "bold")) {
      add("bold", "Bold text", "unverified", "Your font has no bold face, so bold text is set in its regular face. Load the bold file too.", general("fonts"));
    }
    // Glyphs.
    const texts = sc.items.filter((/** @type {any} */ it) => it.t === "text");
    if (typeof o.font.missing === "function") {
      const lacking = [...new Set(texts.flatMap((/** @type {any} */ it) => o.font.missing(it.text, it.weight === "bold")))];
      add("glyphs", "Glyphs", lacking.length ? "fail" : "pass", lacking.length ? `${o.font.name} has no glyph for ${lacking.slice(0, 8).map((ch) => `"${ch}" (U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")})`).join(", ")}${lacking.length > 8 ? ` and ${lacking.length - 8} more` : ""}: the files would show empty boxes. Load a font that has them, or change the text.` : `${o.font.name} has a glyph for every character of the figure.`, general("fonts"));
    } else if (texts.length) {
      add("glyphs", "Glyphs", "unverified", "No font file is read, so whether the font has every character of the figure is not known.", general("fonts"));
    }
    // Lines.
    add("lines", "Line widths", m.minLine === null ? "n/a" : m.thin ? "fail" : "pass",
      m.minLine === null ? "No lines." : m.thin ? `${plural(m.thin, "line is", "lines are")} thinner than 0.5 pt.` : `Every line at least ${fmt(m.minLine, 2)} pt.`, general("lines"));
    // Colour.
    const palette = !m.close.length && !m.unordered.length && !m.redGreen;
    add("palette", "Colour-blind safety", palette ? "pass" : "fail",
      palette ? `${m.close.length || "Every"} mark colour stays distinct with protanopia and deuteranopia${m.scaleSteps ? `, and the ${m.scaleSteps}-step colour scale keeps its order of lightness` : ""}; no red and green together.`
        : [m.redGreen ? "red and green together" : "", m.close.length ? `colours too close: ${m.close.slice(0, 2).join("; ")}` : "", m.unordered.length ? `the colour scale loses its order with ${m.unordered.join(" and ")}` : ""].filter(Boolean).join("; "),
      nature ? rule("palette") : general("colour"));
    add("contrast-text", "Text contrast", m.lowText.length ? "fail" : "pass",
      m.lowText.length ? `${plural(m.lowText.length, "text is", "texts are")} below 4.5:1, such as "${m.lowText[0].text}" at ${fmt(m.lowText[0].ratio, 2)}:1.` : "Every text at least 4.5:1 against what is under it.", nature ? rule("colour-text") : general("colour"));
    const markStatus = m.lowMarks || m.lowLines ? "fail" : m.translucent ? "unverified" : "pass";
    add("contrast-marks", "Mark contrast", markStatus,
      m.lowMarks || m.lowLines ? `${plural(m.lowMarks + m.lowLines, "mark or line is", "marks or lines are")} below 3:1 against the paper.`
        : m.translucent ? `${plural(m.translucent, "point is", "points are")} drawn translucent so that overlaps show density: one point alone is below 3:1, overlapping points reach it. Judge it at final size.`
          : "Every mark at least 3:1 against the paper; colour scales are read with their key.", general("colour"));
    // Layout.
    add("clipping", "Clipping", m.outside.length ? "fail" : "pass",
      m.outside.length ? `${plural(m.outside.length, "item reaches", "items reach")} past the page edge, such as ${m.outside[0]}.` : `Nothing reaches past the page edge.${m.shortened ? ` ${plural(m.shortened, "label is", "labels are")} shortened with … to fit; the full text is in the specification.` : ""}`, general("layout"));
    add("collisions", "Label collisions", m.overlaps ? "fail" : "pass",
      m.overlaps ? `${plural(m.overlaps, "pair of texts overlaps", "pairs of texts overlap")}, such as "${m.pairs[0][0]}" and "${m.pairs[0][1]}".` : `No texts overlap.${drawn.dropped ? ` ${plural(drawn.dropped, "event label is", "event labels are")} left out for lack of room and counted on the figure.` : ""}`,
      nature ? { text: "Avoid overlapping text", status: "verified", source: SOURCES.natureSpecs } : general("layout"));
    // Nature's own rules on the drawing.
    if (nature) {
      add("grid", "Background gridlines", m.grid ? "fail" : "pass", m.grid ? `${plural(m.grid, "gridline", "gridlines")}.` : "None.", rule("grid"));
      add("patterns", "Patterns", m.patterns ? "fail" : "pass", m.patterns ? `${plural(m.patterns, "patterned mark", "patterned marks")}.` : "None: dates known only to the year or month are light spans.", rule("patterns"));
      const coloured = m.textColours.filter((c) => c !== "#000000" && c !== "#ffffff");
      add("colour-text", "Coloured text", coloured.length ? "fail" : "pass", coloured.length ? `Text in ${coloured.join(", ")}.` : "Every text is black or white.", rule("colour-text"));
      const axes = measureAxes(o.spec, sc);
      const unknown = axes.filter((a) => !a.unit);
      const hidden = axes.filter((a) => a.unit && !a.label.includes(`(${a.unit})`));
      add("axes", "Axis units", !axes.length ? "n/a" : hidden.length ? "fail" : unknown.length ? "unverified" : "pass",
        !axes.length ? "No axis shows a measure: counts, categories and dates need no unit."
          : hidden.length ? `The drawn axis title of ${hidden.map((a) => `${a.field} ("${a.label}")`).join(" and ")} does not show its unit: write it as "label (unit)" or shorten the label so it fits.`
            : unknown.length ? `No unit is known for ${unknown.map((a) => a.field).join(" and ")}. The workbench never invents a unit: give one in Inspect if the field has one.` : `Every measure's axis shows its unit: ${axes.map((a) => a.label).join("; ")}.`,
        rule("axes"));
      add("panels", "Panel labels", "n/a", "One chart a figure: no panel letters. Facets are labelled with their level.", rule("text"));
    }
    if (p.id === "science") {
      for (const r of p.rules) add(r.id, r.text, "unverified", "Science's rule is not known: its instructions page was not read.", rule(r.id));
    }
    // The files.
    const files = {};
    for (const format of ["svg", "pdf", "png"]) files[format] = fileChecks(format, o.files?.[format] ?? null, { p, s, W, H, nature, rule, general, expectedTexts: m.texts });
    const scene = verdictOf(out, p);
    for (const f of Object.values(files)) f.verdict = verdictOf([...out, ...f.checks], p, f.format);
    return { preset: p.id, checks: out, files, verdict: scene };
  }

  /** The checks of one written file, from what reading it back found (null while it is not written yet). */
  function fileChecks(format, file, c) {
    const { p, s, W, H, nature, rule, general } = c;
    const out = [];
    const add = (id, label, status, detail, r) => out.push({ id, label, status, detail, rule: r });
    const acceptance = p.formats[format];
    if (nature) add("format", "Format", acceptance === "not accepted" ? "fail" : "pass", acceptance === "not accepted" ? "Nature does not accept PNG for main figures: send the PDF." : `${format.toUpperCase()} is ${acceptance} for main figures.`, rule("formats"));
    if (p.id === "science") add("format", "Format", "unverified", "Science's accepted formats are not known.", rule("science-3"));
    if (!file) { add("written", "Written and read back", "unverified", "Not written yet.", general("fonts")); return { format, checks: out }; }
    if (file.error) { add("written", "Written and read back", "fail", file.error, general("fonts")); return { format, checks: out }; }
    const mm = (v) => Math.abs(v - W) <= 0.01;
    if (format === "svg") {
      add("file-size", "Size in the file", mm(file.width) && Math.abs(file.height - H) <= 0.01 ? "pass" : "fail", `width="${fmt(file.width, 3)}mm" height="${fmt(file.height, 3)}mm".`, general("size"));
      add("text-as-text", "Text as text", file.texts === c.expectedTexts ? "pass" : "fail", `${plural(file.texts, "<text> element", "<text> elements")} for ${plural(c.expectedTexts, "text", "texts")}; no text drawn as outlines.`, nature ? rule("embed") : general("fonts"));
      const held = file.fontFaces > 0 && !file.unmapped.length;
      add("embedded", "Font embedded", held ? "pass" : "fail", !file.fontFaces ? "The file names its font but does not hold a font that reads." : file.unmapped.length ? `${plural(file.fontFaces, "font", "fonts")} in an @font-face of the file, but they map no glyph to ${file.unmapped.slice(0, 8).map((ch) => `"${ch}"`).join(", ")}.` : `${plural(file.fontFaces, "font", "fonts")} in an @font-face of the file, read back: every character of the text maps to a glyph; the text names ${file.family}. Drawing programs that ignore @font-face use an installed font of that name.`, nature ? rule("embed") : general("fonts"));
    }
    if (format === "pdf") {
      const box = file.mediaBoxMm;
      add("file-size", "Page size (MediaBox)", box && mm(box[0]) && Math.abs(box[1] - H) <= 0.01 ? "pass" : "fail", box ? `${fmt(box[0], 2)} × ${fmt(box[1], 2)} mm (${fmt(file.mediaBox[2], 2)} × ${fmt(file.mediaBox[3], 2)} pt).` : "No MediaBox.", general("size"));
      const embeddedAll = file.fonts.length > 0 && file.fonts.every((f) => f.file === "FontFile2" || f.file === "FontFile3");
      add("embedded", "Fonts embedded", embeddedAll && !file.type3 ? "pass" : "fail", file.fonts.length ? `${file.fonts.map((f) => `${f.name}: ${f.subtype}${f.file ? `, ${f.file === "FontFile2" ? "TrueType outlines embedded (FontFile2)" : f.file === "FontFile3" ? "CFF outlines embedded (FontFile3)" : f.file}` : ", not embedded"}`).join("; ")}${file.type3 ? "; a Type 3 font" : ""}.` : "No font.", nature ? rule("embed") : general("fonts"));
      add("text-as-text", "Text as text", file.showText >= c.expectedTexts ? "pass" : "fail", `${plural(file.showText, "text-showing operator", "text-showing operators")} for ${plural(c.expectedTexts, "text", "texts")}, in the embedded fonts: ${file.showText >= c.expectedTexts ? "no text is drawn as outlines, so it stays editable" : "some text is missing"}.`, nature ? rule("embed") : general("fonts"));
      add("rgb", "Colour space", file.cmyk ? "fail" : "pass", file.cmyk ? "CMYK colour operators." : "RGB only (DeviceRGB).", nature ? rule("rgb") : general("colour"));
      if (nature) add("file", "File size", file.bytes <= 50 * 2 ** 20 ? "pass" : "fail", `${fmt(file.bytes / 1024, 1)} KB; fonts embedded, nothing linked.`, rule("file"));
    }
    if (format === "png") {
      const want = [Math.round((W / 25.4) * s.dpi), Math.round((H / 25.4) * s.dpi)];
      add("pixels", "Pixels", file.width === want[0] && file.height === want[1] ? "pass" : "fail", `${file.width} × ${file.height} px; ${fmt(W)} × ${fmt(H)} mm at ${s.dpi} dpi is ${want[0]} × ${want[1]}.`, general("size"));
      const dpi = file.dpi ?? 0;
      add("phys", "Resolution in the file (pHYs)", Math.abs(dpi - s.dpi) < 0.5 ? "pass" : "fail", file.dpi ? `${fmt(dpi, 1)} dpi (${file.ppm} pixels a metre).` : "No pHYs chunk.", general("size"));
      const min = p.dpi;
      add("dpi", "Raster resolution", p.id === "science" ? "unverified" : s.dpi >= min ? "pass" : "fail", p.id === "science" ? "Science's resolution rule is not known." : `${s.dpi} dpi; the preset asks for at least ${min} dpi.`, nature ? rule("resolution") : p.id === "science" ? rule("science-4") : general("size"));
      add("rgb", "Colour space", file.colorType === 2 || file.colorType === 6 ? "pass" : "fail", `PNG colour type ${file.colorType} (${file.colorType === 6 ? "RGB with alpha" : file.colorType === 2 ? "RGB" : "not RGB"}).`, nature ? rule("rgb") : general("colour"));
    }
    return { format, checks: out };
  }

  /** The verdict over checks: meets only when every check that applies passes. */
  function verdictOf(checks, p, format) {
    const fail = checks.filter((c) => c.status === "fail").length;
    const unverified = checks.filter((c) => c.status === "unverified").length;
    const what = `the ${p.name} preset${format ? ` as ${format.toUpperCase()}` : ""}`;
    if (fail) return { status: "fail", fail, unverified, text: `Does not meet ${what}: ${plural(fail, "check fails", "checks fail")}${unverified ? `, ${unverified} unverified` : ""}.` };
    if (unverified) return { status: "unverified", fail, unverified, text: `No compliance claim for ${what}: ${plural(unverified, "check is", "checks are")} unverified.` };
    return { status: "pass", fail, unverified, text: `Meets every check of ${what}.` };
  }

  /** Every rule of a preset with its source, for the page and the record. */
  function rulesOf(id) {
    const p = PRESETS[id];
    return p.rules.map((r) => ({ ...r, journal: p.journal ?? "None (the workbench's own rule)", stage: p.stage, sourceTitle: SOURCES[r.source].title, url: SOURCES[r.source].url, read: SOURCES[r.source].read, note: SOURCES[r.source].note ?? "" }));
  }

  return { PRESETS, SOURCES, LIMITS, READ, settingsOf, sizeOf, sized, styleOf, check, rulesOf, measure, textBox, overlap, ratio, simulate, deltaE, lab, hex, CVD };
});
