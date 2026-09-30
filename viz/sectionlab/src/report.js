/* Sectionlab report: one report object drives every export.
 *
 *   build(model, results)       → report data (tables, notes, figure data)
 *   markdown(report, model)     → Markdown with readable tables and a fenced YAML block of the model
 *   modelFromText(text)         → the model in a Markdown export (its ```yaml block) or a YAML file
 *   html(report)                → HTML for the print view
 *   sectionSvg / curveSvg       → standalone SVG figures (PNG export draws these on a canvas)
 *   pdf(report)                 → a PDF 1.4 file as a binary string: vector figures, standard
 *                                 Helvetica (not embedded), ASCII text
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./geometry.js"), require("./yaml.js"));
  else (root.SectionLab = root.SectionLab || {}).report = factory(root.SectionLab.geometry, root.SectionLab.yaml);
})(typeof self !== "undefined" ? self : this, function (G, Y) {
  "use strict";

  const NOTICE = "Verify independently. These results come from this page's own calculation and are not a design-code compliance check.";
  const UNITS = "Units: mm, MPa (N/mm²), N, N·mm. Properties are about the centroid; composite values are transformed to E_base.";

  /* Six significant figures, plain where readable and with an exponent otherwise. */
  function fmt(x, digits = 6) {
    if (x === null || x === undefined) return "n/a";
    if (typeof x !== "number") return String(x);
    if (!Number.isFinite(x)) return "n/a";
    if (x === 0 || Math.abs(x) < 1e-300) return "0";
    const a = Math.abs(x);
    if (a >= 1e-3 && a < 1e7) return String(+x.toPrecision(digits)).replace("-", "−");
    const [m, e] = x.toExponential(digits - 1).split("e");
    return `${String(+m).replace("-", "−")}e${e.replace("+", "")}`.replace("e-", "e−");
  }
  const pct = (x) => (x === null || x === undefined ? "n/a" : `${+(x * 100).toPrecision(2)}%`);

  const AXIS_LABEL = { x: "x axis", y: "y axis", major: "major principal axis", minor: "minor principal axis" };
  const SOLVE_LABEL = { "zero-cross": "(b) neutral axis rotates for zero cross moment", "fixed-axis": "(a) neutral axis parallel to the bending axis" };

  function build(model, results) {
    const { props: p, torsion: t, plastic: pl, parts } = results;
    const sections = [];
    sections.push({
      title: "Parts",
      columns: ["Part", "Shape", "Dimensions (mm)", "Corner radii (mm)", "x, y (mm)", "Turn", "Material", "n"],
      align: "lllllllr",
      rows: model.parts.map((q, i) => [
        q.name === q.id ? q.id : `${q.name} (${q.id})`, q.void ? `${q.shape} (void)` : q.shape,
        Object.entries(q.dims).map(([k, v]) => `${k} ${fmt(v)}`).join(", "),
        q.radii.length ? q.radii.map((r) => fmt(r)).join(", ") : "–",
        `${fmt(q.x)}, ${fmt(q.y)}`, `${q.orientation}°`,
        q.void ? `host ${p ? p.parts[i].host : "?"}` : q.material, p ? fmt(p.parts[i].n, 4) : "",
      ]),
    });
    sections.push({
      title: "Materials",
      columns: ["Material", "E (MPa)", "σ0.2 (MPa)", "n", "ε_lim", "Compression law"],
      align: "lrrrrl",
      rows: model.materials.map((m) => [
        m.name === m.id ? m.id : `${m.name} (${m.id})`, fmt(m.E), fmt(m.sigma02), fmt(m.n), fmt(m.eps_lim),
        m.compression ? `E ${fmt(m.compression.E)}, σ0.2 ${fmt(m.compression.sigma02)}, n ${fmt(m.compression.n)}, ε_lim ${fmt(m.compression.eps_lim)}` : "same as tension",
      ]),
    });
    if (p) {
      const row = (q, s, v, u) => [q, s, fmt(v), u];
      sections.push({
        title: "Section properties",
        note: `About the centroid. E_base = ${fmt(p.E_base)} MPa.`,
        columns: ["Quantity", "Symbol", "Value", "Unit"], align: "llrl",
        rows: [
          row("Area", "A", p.A, "mm²"),
          row("Centroid", "x_c", p.cx, "mm"), row("", "y_c", p.cy, "mm"),
          row("Second moment about x", "I_x", p.Ix, "mm⁴"), row("Second moment about y", "I_y", p.Iy, "mm⁴"),
          row("Product moment", "I_xy", p.Ixy, "mm⁴"),
          row("Major principal", "I_1", p.I1, "mm⁴"), row("Minor principal", "I_2", p.I2, "mm⁴"),
          row("Principal angle, x to axis 1", "θ", p.thetaDeg, "°"),
          row("Section modulus, top", "S_x+", p.Sx_top, "mm³"), row("Section modulus, bottom", "S_x−", p.Sx_bottom, "mm³"),
          row("Section modulus, right", "S_y+", p.Sy_right, "mm³"), row("Section modulus, left", "S_y−", p.Sy_left, "mm³"),
          row("Radius of gyration", "r_x", p.rx, "mm"), row("", "r_y", p.ry, "mm"),
          row("Polar moment", "I_p", p.Ip, "mm⁴"), row("Polar radius of gyration", "r_p", p.rp, "mm"),
          row("First moment above the x axis", "Q_x", p.Qx, "mm³"), row("First moment beside the y axis", "Q_y", p.Qy, "mm³"),
        ],
      });
    }
    if (t) {
      sections.push(t.available
        ? { title: "Torsion", columns: ["Quantity", "Value"], align: "lr", rows: [
          ["Torsion constant J (mm⁴)", fmt(t.J)], ["Method", t.method], ["Formula", t.text],
          ["Stated accuracy vs Prandtl reference", `within ${pct(t.stated)}`], ["Largest error measured", pct(t.measured)],
        ] }
        : { title: "Torsion", columns: ["Quantity", "Value"], align: "lr", rows: [["Torsion constant J", "n/a"], ["Why", t.reason]] });
    }
    if (pl && !pl.error) {
      const L = pl.limit;
      sections.push({
        title: "Plastic bending",
        note: `Bending about the ${AXIS_LABEL[pl.axis]} (${fmt(pl.alphaDeg)}° from x), ${SOLVE_LABEL[pl.solve]}, N = ${fmt(pl.N)} N.`,
        columns: ["Quantity", "Value", "Unit"], align: "lrl",
        rows: [
          ["Allowable moment at ε_lim, M_lim", fmt(L.M), "N·mm"],
          ["Curvature at ε_lim, κ_lim", fmt(L.kappa), "1/mm"],
          ["Governing fibre", `${L.governing.part}, ${L.governing.fibre}, ε = ${fmt(L.governing.strain, 4)}`, ""],
          ["Cross moment at ε_lim", fmt(L.Mcross), "N·mm"],
          ["Neutral-axis rotation at ε_lim, φ", fmt((L.phi * 180) / Math.PI, 4), "°"],
          ["First-yield moment at N = 0 (elastic, σ0.2), M_el", fmt(pl.Mel), "N·mm"],
          ["Fully plastic moment at N = 0 (σ0.2 stress block), M_p", fmt(pl.Mp), "N·mm"],
          ["Plastic modulus, Z_p = M_p / σ0.2", pl.Zp === null ? `n/a (${pl.ZpNote})` : fmt(pl.Zp), pl.Zp === null ? "" : "mm³"],
          ["Shape factor, M_p / M_el", fmt(pl.shapeFactor, 4), ""],
          ...(pl.N === 0 ? [] : [
            ["First-yield moment at the applied axial force N, M_el(N)", pl.MelN === null ? "n/a (N alone reaches σ0.2)" : fmt(pl.MelN), pl.MelN === null ? "" : "N·mm"],
            ["Fully plastic moment at the applied axial force N, M_p(N)", pl.MpN === null ? "n/a (N exceeds the fully plastic axial capacity)" : fmt(pl.MpN), pl.MpN === null ? "" : "N·mm"],
          ]),
        ],
      });
      const step = Math.max(1, Math.round((pl.curve.length - 1) / 8));
      const pts = pl.curve.filter((_, i) => i % step === 0 || i === pl.curve.length - 1);
      sections.push({
        title: "M–κ curve",
        columns: ["κ (1/mm)", "M (N·mm)", "Cross moment (N·mm)", "φ (°)", "ε_max", "ε_min"], align: "rrrrrr",
        rows: pts.map((s) => [fmt(s.kappa, 5), fmt(s.M, 5), fmt(s.Mcross, 3), fmt((s.phi * 180) / Math.PI, 4), fmt(s.epsMax, 4), fmt(s.epsMin, 4)]),
      });
    } else if (pl && pl.error) {
      sections.push({ title: "Plastic bending", columns: ["Quantity", "Value"], align: "ll", rows: [["Result", "n/a"], ["Why", pl.error]] });
    }
    return {
      title: model.title || "Section",
      notice: NOTICE, units: UNITS, sections,
      figures: {
        parts: parts || [],
        materials: model.materials.map((m, i) => ({ name: m.name || m.id, fillIndex: i })).filter((m) => (parts || []).some((q) => !q.void && q.fillIndex === m.fillIndex)),
        centroid: p ? [p.cx, p.cy] : null,
        theta: p ? p.theta : 0,
        curve: pl && !pl.error ? pl : null,
      },
    };
  }

  /* ---------- Markdown ---------- */
  const mdCell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
  function mdTable(sec) {
    const widths = sec.columns.map((c, i) => Math.max(c.length, ...sec.rows.map((r) => String(r[i]).length), 3));
    const pad = (s, i) => (sec.align[i] === "r" ? mdCell(s).padStart(widths[i]) : mdCell(s).padEnd(widths[i]));
    const line = (r) => `| ${r.map(pad).join(" | ")} |`;
    const rule = `| ${widths.map((w, i) => (sec.align[i] === "r" ? "-".repeat(w - 1) + ":" : "-".repeat(w))).join(" | ")} |`;
    return [line(sec.columns), rule, ...sec.rows.map(line)].join("\n");
  }

  function markdown(report, model) {
    const out = [`# ${report.title}`, "", `> **${report.notice}**`, "", report.units, ""];
    for (const s of report.sections) {
      out.push(`## ${s.title}`, "");
      if (s.note) out.push(s.note, "");
      out.push(mdTable(s), "");
    }
    out.push("## Model", "", "Import this file into Sectionlab to rebuild the section; the YAML block below is the whole model.", "", "```yaml", Y.stringify(model).trimEnd(), "```", "");
    return out.join("\n");
  }

  /* The model in a Markdown export (its fenced yaml block) or in plain YAML text. */
  function modelFromText(text) {
    const blocks = [...String(text).matchAll(/^(`{3,}|~{3,})[ \t]*ya?ml[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/gm)];
    if (blocks.length > 1) {
      const models = blocks.filter((b) => /^\s*sectionlab\s*:/m.test(b[2]));
      if (models.length !== 1) throw new Y.YamlError("the file has several YAML blocks; keep only the model block");
      return Y.parse(models[0][2]);
    }
    if (blocks.length === 1) return Y.parse(blocks[0][2]);
    if (/^\s*#\s/m.test(text) && /```/.test(text)) throw new Y.YamlError("no ```yaml block found in this Markdown file");
    return Y.parse(String(text));
  }

  /* ---------- HTML (print view) ---------- */
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function html(report, figures = "") {
    let out = `<h1>${esc(report.title)}</h1><p class="notice"><strong>${esc(report.notice)}</strong></p><p>${esc(report.units)}</p>${figures}`;
    for (const s of report.sections) {
      out += `<h2>${esc(s.title)}</h2>`;
      if (s.note) out += `<p>${esc(s.note)}</p>`;
      out += `<table><thead><tr>${s.columns.map((c, i) => `<th class="${s.align[i] === "r" ? "num" : ""}">${esc(c)}</th>`).join("")}</tr></thead><tbody>`;
      out += s.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${s.align[i] === "r" ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("");
      out += "</tbody></table>";
    }
    return out;
  }

  /* ---------- SVG figures ---------- */
  const LIGHT = { bg: "#ffffff", fg: "#1d1d1f", muted: "#6e6e73", grid: "#e8e8ed", fill: "#c9d7ee", stroke: "#2a5ca8", void: "#ffffff", axis: "#eb6834", curve: "#2a78d6", ref: "#6e6e73", mark: "#1d1d1f" };
  const MATERIAL_FILLS = ["#c9d7ee", "#f3d2c1", "#cfe8d9", "#e6d5f0", "#f5e6b8", "#d6e4e8"];

  function figureBox(parts) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of parts) { const b = G.bbox(q.contours); x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1); }
    return { x0, x1, y0, y1 };
  }

  /* parts: [{ contours, void, fillIndex }]; returns an SVG string. */
  function sectionSvg(report, { width = 480, height = 400, colors = LIGHT, font = "Helvetica, Arial, sans-serif" } = {}) {
    const parts = report.figures.parts;
    if (!parts.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
    const b = figureBox(parts);
    const pad = 28;
    const s = Math.min((width - 2 * pad) / Math.max(b.x1 - b.x0, 1e-9), (height - 2 * pad - 30) / Math.max(b.y1 - b.y0, 1e-9));
    const ox = (width - s * (b.x1 - b.x0)) / 2 - s * b.x0, oy = (height + 2 - 14 + s * (b.y1 - b.y0)) / 2 + s * b.y0; // room for the title above and the key below
    const map = (x, y) => [ox + s * x, oy - s * y];
    let body = "";
    for (const q of parts.filter((p) => !p.void)) {
      body += `<path d="${G.svgPath(q.contours, map, s)}" fill="${MATERIAL_FILLS[q.fillIndex % MATERIAL_FILLS.length]}" fill-rule="evenodd" stroke="${colors.stroke}" stroke-width="1.2"/>`;
    }
    for (const q of parts.filter((p) => p.void)) {
      body += `<path d="${G.svgPath(q.contours, map, s)}" fill="${colors.void}" stroke="${colors.stroke}" stroke-width="1" stroke-dasharray="4 3"/>`;
    }
    const c = report.figures.centroid;
    if (c) {
      const [px, py] = map(c[0], c[1]);
      const L = Math.max(width, height);
      const th = report.figures.theta;
      const ax = (a, dash) => `<line x1="${(px - L * Math.cos(a)).toFixed(1)}" y1="${(py + L * Math.sin(a)).toFixed(1)}" x2="${(px + L * Math.cos(a)).toFixed(1)}" y2="${(py - L * Math.sin(a)).toFixed(1)}" stroke="${colors.axis}" stroke-width="1" ${dash ? 'stroke-dasharray="6 4"' : ""}/>`;
      body += `<g clip-path="url(#clip)">${ax(th, false)}${ax(th + Math.PI / 2, true)}</g>`;
      body += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${colors.bg}" stroke="${colors.axis}" stroke-width="1.5"/>`;
    }
    const title = `<text x="${pad}" y="20" font-family="${font}" font-size="13" font-weight="600" fill="${colors.fg}">${esc(report.title)}: section</text>`;
    let legend = `<text x="${pad}" y="${height - 8}" font-family="${font}" font-size="10" fill="${colors.muted}">Centroid ○, principal axes (1 solid, 2 dashed). Width ${fmt(b.x1 - b.x0, 4)} mm, height ${fmt(b.y1 - b.y0, 4)} mm.</text>`;
    // Material key: swatches with names, so identity never rests on colour alone.
    let lx = pad;
    for (const m of report.figures.materials || []) {
      legend += `<rect x="${lx}" y="${height - 31}" width="10" height="10" rx="2" fill="${MATERIAL_FILLS[m.fillIndex % MATERIAL_FILLS.length]}" stroke="${colors.stroke}"/><text x="${lx + 14}" y="${height - 22}" font-family="${font}" font-size="10" fill="${colors.fg}">${esc(m.name)}</text>`;
      lx += 24 + 5.6 * m.name.length;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><clipPath id="clip"><rect x="${pad / 2}" y="${pad}" width="${width - pad}" height="${height - 2 * pad}"/></clipPath></defs><rect width="100%" height="100%" fill="${colors.bg}"/>${title}${body}${legend}</svg>`;
  }

  /* Nice ticks for [0, max]. */
  function ticks(max, count = 5) {
    if (!(max > 0)) return [0];
    const raw = max / count, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw);
    const out = [];
    for (let v = 0; v <= max * (1 + 1e-9); v += step) out.push(+v.toPrecision(12));
    return out;
  }
  const tickLabel = (v) => (v === 0 ? "0" : Math.abs(v) >= 1e4 || Math.abs(v) < 1e-2 ? v.toExponential(1).replace("e+", "e").replace("e-", "e−") : String(+v.toPrecision(4)));

  /* M_p and M_el at the curve's own axial force. */
  const curveRefs = (pl) => (pl.N === 0 ? [pl.Mp, pl.Mel] : [pl.MpN, pl.MelN]);

  /* The M–κ curve with the ε_lim point, M_p and M_el. Colours may be CSS values (the page passes variables). */
  function curveSvg(report, { width = 480, height = 320, colors = LIGHT, font = "Helvetica, Arial, sans-serif", title = true } = {}) {
    const pl = report.figures.curve;
    if (!pl) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"></svg>`;
    const left = 64, right = 16, top = title ? 34 : 14, bottom = 42;
    const kmax = pl.limit.kappa;
    const Ms = pl.curve.map((p) => p.M);
    const [mp, mel] = curveRefs(pl);
    const mmax = Math.max(...Ms, mp || 0, mel || 0) * 1.08;
    const X = (k) => left + ((width - left - right) * k) / kmax, Yv = (m) => height - bottom - ((height - top - bottom) * m) / mmax;
    let g = "";
    for (const t of ticks(mmax)) g += `<line x1="${left}" x2="${width - right}" y1="${Yv(t).toFixed(1)}" y2="${Yv(t).toFixed(1)}" stroke="${colors.grid}"/><text x="${left - 6}" y="${(Yv(t) + 3.5).toFixed(1)}" text-anchor="end" font-family="${font}" font-size="10" fill="${colors.muted}">${tickLabel(t)}</text>`;
    for (const t of ticks(kmax, 4)) g += `<text x="${X(t).toFixed(1)}" y="${height - bottom + 14}" text-anchor="middle" font-family="${font}" font-size="10" fill="${colors.muted}">${tickLabel(t)}</text>`;
    g += `<line x1="${left}" x2="${width - right}" y1="${height - bottom}" y2="${height - bottom}" stroke="${colors.muted}"/>`;
    g += `<text x="${(left + width - right) / 2}" y="${height - 8}" text-anchor="middle" font-family="${font}" font-size="10.5" fill="${colors.muted}">curvature κ (1/mm)</text>`;
    g += `<text transform="translate(12 ${(top + height - bottom) / 2}) rotate(-90)" text-anchor="middle" font-family="${font}" font-size="10.5" fill="${colors.muted}">moment M (N·mm)</text>`;
    // Reference lines are labelled where the curve is not: M_p (reached late) on the left, M_el (passed early) on the right.
    const ref = (m, label, atLeft) => (m ? `<line x1="${left}" x2="${width - right}" y1="${Yv(m).toFixed(1)}" y2="${Yv(m).toFixed(1)}" stroke="${colors.ref}" stroke-dasharray="5 4"/><text x="${atLeft ? left + 6 : width - right - 4}" y="${(Yv(m) - 4).toFixed(1)}" text-anchor="${atLeft ? "start" : "end"}" font-family="${font}" font-size="10" fill="${colors.fg}">${label}</text>` : "");
    const at = pl.N === 0 ? "" : "(N)";
    g += ref(mp, `M_p${at} (σ0.2 block)`, true);
    g += ref(mel, `M_el${at} (first yield)`, false);
    const d = pl.curve.map((p, i) => `${i ? "L" : "M"}${X(p.kappa).toFixed(2)} ${Yv(p.M).toFixed(2)}`).join("");
    g += `<path d="${d}" fill="none" stroke="${colors.curve}" stroke-width="2" stroke-linejoin="round"/>`;
    const L = pl.limit;
    g += `<circle cx="${X(L.kappa).toFixed(1)}" cy="${Yv(L.M).toFixed(1)}" r="5" fill="${colors.curve}" stroke="${colors.bg}" stroke-width="2"/><text x="${(X(L.kappa) - 4).toFixed(1)}" y="${(Yv(L.M) + 18).toFixed(1)}" text-anchor="end" font-family="${font}" font-size="10.5" font-weight="600" fill="${colors.fg}">ε_lim</text>`;
    const head = title ? `<text x="${left}" y="20" font-family="${font}" font-size="13" font-weight="600" fill="${colors.fg}">${esc(report.title)}: M–κ</text>` : "";
    const plot = JSON.stringify({ left, top, width: width - left - right, height: height - top - bottom, kmax, mmax });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-plot='${plot}'><rect width="100%" height="100%" fill="${colors.bg}"/>${head}${g}</svg>`;
  }

  /* ---------- PDF ---------- */
  // Helvetica advance widths (1/1000 em) for ASCII 32–126, from the standard AFM.
  const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const ASCII_MAP = { "²": "^2", "³": "^3", "⁴": "^4", "σ": "sigma", "ε": "eps", "κ": "kappa", "φ": "phi", "α": "alpha", "θ": "theta", "π": "pi", "√": "sqrt", "Σ": "Sum", "·": "*", "−": "-", "–": "-", "—": "-", "×": "x", "≤": "<=", "≥": ">=", "°": " deg", "ᵢ": "i", "₀": "0", "…": "...", "“": '"', "”": '"', "‘": "'", "’": "'", "○": "o", "→": "->" };
  const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, (c) => (c in ASCII_MAP ? ASCII_MAP[c] : "?"));
  const textWidth = (s, size, bold) => ascii(s).split("").reduce((w, c) => w + HW[c.charCodeAt(0) - 32], 0) * size / 1000 * (bold ? 1.06 : 1);
  const pdfStr = (s) => `(${ascii(s).replace(/[\\()]/g, (c) => "\\" + c)})`;
  const n2 = (x) => (Math.abs(x) < 1e-6 ? "0" : String(+x.toFixed(2)));

  function arcBeziers(s, map) {
    const out = [];
    const sweep = s.t1 - s.t0, k = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
    const d = sweep / k, h = (4 / 3) * Math.tan(d / 4);
    for (let i = 0; i < k; i++) {
      const a = s.t0 + i * d, b = a + d;
      const p1 = [s.c[0] + s.r * (Math.cos(a) - h * Math.sin(a)), s.c[1] + s.r * (Math.sin(a) + h * Math.cos(a))];
      const p2 = [s.c[0] + s.r * (Math.cos(b) + h * Math.sin(b)), s.c[1] + s.r * (Math.sin(b) - h * Math.cos(b))];
      const p3 = [s.c[0] + s.r * Math.cos(b), s.c[1] + s.r * Math.sin(b)];
      out.push(`${[p1, p2, p3].map((p) => map(p).map(n2).join(" ")).join(" ")} c`);
    }
    return out;
  }
  function pdfPath(contours, map) {
    const ops = [];
    for (const k of contours) {
      ops.push(`${map(G.segStart(k[0])).map(n2).join(" ")} m`);
      for (const s of k) {
        if (s.type === "line") ops.push(`${map(s.b).map(n2).join(" ")} l`);
        else ops.push(...arcBeziers(s, map));
      }
      ops.push("h");
    }
    return ops.join("\n");
  }
  const rgb = (hex) => [1, 3, 5].map((i) => +(parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");

  function pdf(report) {
    const W = 595.28, H = 841.89, M = 48;
    const pages = [];
    let ops = [], y = H - M;
    const newPage = () => { if (ops.length) pages.push(ops.join("\n")); ops = []; y = H - M; };
    const text = (s, x, yy, size = 9, bold = false, color = "#1d1d1f") => ops.push(`BT ${rgb(color)} rg /${bold ? "F2" : "F1"} ${size} Tf ${n2(x)} ${n2(yy)} Td ${pdfStr(s)} Tj ET`);
    const need = (h) => { if (y - h < M) newPage(); };
    const wrap = (s, size, width, bold) => {
      const words = ascii(s).split(/\s+/), lines = [];
      let cur = "";
      for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (textWidth(t, size, bold) > width && cur) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur);
      return lines;
    };
    const para = (s, size = 9, bold = false, color) => { for (const l of wrap(s, size, W - 2 * M, bold)) { need(size * 1.4); y -= size * 1.4; text(l, M, y, size, bold, color); } };

    y -= 18; text(report.title, M, y, 18, true);
    y -= 8;
    para(`Sectionlab report. ${report.units}`, 8.5, false, "#6e6e73");
    y -= 6;
    // Notice box.
    const nl = wrap(report.notice, 9.5, W - 2 * M - 16, true);
    const bh = nl.length * 13 + 10;
    ops.push(`${rgb("#c4261d")} RG 1 w ${n2(M)} ${n2(y - bh)} ${n2(W - 2 * M)} ${n2(bh)} re S`);
    nl.forEach((l, i) => text(l, M + 8, y - 16 - i * 13, 9.5, true, "#c4261d"));
    y -= bh + 12;

    // Figures side by side: section and M–κ curve.
    const fh = 200, fw = (W - 2 * M - 16) / 2;
    need(fh + 20);
    const parts = report.figures.parts;
    if (parts.length) {
      const b = figureBox(parts), pad = 10;
      const s = Math.min((fw - 2 * pad) / Math.max(b.x1 - b.x0, 1e-9), (fh - 2 * pad) / Math.max(b.y1 - b.y0, 1e-9));
      const ox = M + fw / 2 - (s * (b.x0 + b.x1)) / 2, oy = y - fh / 2 - (s * (b.y0 + b.y1)) / 2;
      const map = (p) => [ox + s * p[0], oy + s * p[1]];
      ops.push(`q ${n2(M)} ${n2(y - fh)} ${n2(fw)} ${n2(fh)} re W n`);
      for (const q of parts.filter((p) => !p.void)) ops.push(`${rgb(MATERIAL_FILLS[q.fillIndex % MATERIAL_FILLS.length])} rg ${rgb(LIGHT.stroke)} RG 0.8 w\n${pdfPath(q.contours, map)}\nB*`);
      for (const q of parts.filter((p) => p.void)) ops.push(`1 1 1 rg ${rgb(LIGHT.stroke)} RG 0.6 w [3 2] 0 d\n${pdfPath(q.contours, map)}\nB* [] 0 d`);
      const c = report.figures.centroid;
      if (c) {
        const [px, py] = map(c), L = fw + fh, th = report.figures.theta;
        for (const [a, dash] of [[th, false], [th + Math.PI / 2, true]]) ops.push(`${rgb(LIGHT.axis)} RG 0.6 w ${dash ? "[4 3] 0 d" : "[] 0 d"} ${n2(px - L * Math.cos(a))} ${n2(py - L * Math.sin(a))} m ${n2(px + L * Math.cos(a))} ${n2(py + L * Math.sin(a))} l S [] 0 d`);
        ops.push(`1 1 1 rg ${rgb(LIGHT.axis)} RG 1 w ${n2(px - 3)} ${n2(py - 3)} 6 6 re B`);
      }
      ops.push("Q");
      ops.push(`${rgb("#d2d2d7")} RG 0.5 w ${n2(M)} ${n2(y - fh)} ${n2(fw)} ${n2(fh)} re S`);
      text("Section (centroid square, principal axes)", M + 4, y - fh - 11, 7.5, false, "#6e6e73");
      let lx = M + 4;
      for (const m of report.figures.materials || []) {
        ops.push(`${rgb(MATERIAL_FILLS[m.fillIndex % MATERIAL_FILLS.length])} rg ${rgb(LIGHT.stroke)} RG 0.5 w ${n2(lx)} ${n2(y - fh - 22)} 6 6 re B`);
        text(m.name, lx + 9, y - fh - 21.5, 7);
        lx += 16 + textWidth(m.name, 7);
      }
    }
    const pl = report.figures.curve;
    if (pl) {
      const x0 = M + fw + 16, left = 44, bottom = 22, top = 8, right = 8;
      const [mp, mel] = curveRefs(pl), at = pl.N === 0 ? "" : "(N)";
      const kmax = pl.limit.kappa, mmax = Math.max(...pl.curve.map((p) => p.M), mp || 0, mel || 0) * 1.08;
      const X = (k) => x0 + left + ((fw - left - right) * k) / kmax, Yv = (m) => y - fh + bottom + ((fh - top - bottom) * m) / mmax;
      ops.push(`${rgb("#d2d2d7")} RG 0.5 w ${n2(x0)} ${n2(y - fh)} ${n2(fw)} ${n2(fh)} re S`);
      for (const t of ticks(mmax, 4)) { ops.push(`${rgb(LIGHT.grid)} RG 0.4 w ${n2(x0 + left)} ${n2(Yv(t))} m ${n2(x0 + fw - right)} ${n2(Yv(t))} l S`); text(tickLabel(t), x0 + left - 4 - textWidth(tickLabel(t), 6.5), Yv(t) - 2, 6.5, false, "#6e6e73"); }
      for (const t of ticks(kmax, 3)) text(tickLabel(t), X(t) - textWidth(tickLabel(t), 6.5) / 2, y - fh + bottom - 9, 6.5, false, "#6e6e73");
      for (const [m, label] of [[mp, `M_p${at}`], [mel, `M_el${at}`]]) if (m) { ops.push(`${rgb(LIGHT.ref)} RG 0.5 w [3 2] 0 d ${n2(x0 + left)} ${n2(Yv(m))} m ${n2(x0 + fw - right)} ${n2(Yv(m))} l S [] 0 d`); text(label, x0 + fw - right - textWidth(label, 7) - 2, Yv(m) + 2, 7); }
      ops.push(`${rgb(LIGHT.curve)} RG 1.4 w ${pl.curve.map((p, i) => `${n2(X(p.kappa))} ${n2(Yv(p.M))} ${i ? "l" : "m"}`).join(" ")} S`);
      ops.push(`${rgb(LIGHT.curve)} rg ${n2(X(pl.limit.kappa) - 3)} ${n2(Yv(pl.limit.M) - 3)} 6 6 re f`);
      text("M-kappa: M (N*mm) against kappa (1/mm); square = eps_lim", x0 + 4, y - fh - 11, 7.5, false, "#6e6e73");
    }
    y -= fh + 30;

    for (const sec of report.sections) {
      need(40);
      y -= 16; text(sec.title, M, y, 12, true);
      if (sec.note) { y -= 2; para(sec.note, 8.5, false, "#6e6e73"); }
      const size = 8, lh = 11.5, avail = W - 2 * M;
      const natural = sec.columns.map((c, i) => Math.max(textWidth(c, size, true), ...sec.rows.map((r) => textWidth(r[i], size))) + 10);
      const total = natural.reduce((a, b) => a + b, 0);
      const widths = natural.map((w) => (w * Math.min(1, avail / total)));
      const cells = (row, bold) => row.map((c, i) => wrap(String(c), size, widths[i] - 8, bold));
      const drawRow = (row, bold) => {
        const lines = cells(row, bold), h = Math.max(...lines.map((l) => l.length)) * lh + 3;
        need(h);
        let x = M;
        lines.forEach((ls, i) => {
          ls.forEach((l, k) => {
            const tx = sec.align[i] === "r" ? x + widths[i] - 4 - textWidth(l, size, bold) : x + 4;
            text(l, tx, y - lh * (k + 1) + 2, size, bold);
          });
          x += widths[i];
        });
        y -= h;
        ops.push(`${rgb("#e8e8ed")} RG 0.4 w ${n2(M)} ${n2(y)} m ${n2(M + widths.reduce((a, b) => a + b, 0))} ${n2(y)} l S`);
      };
      y -= 4;
      drawRow(sec.columns, true);
      for (const r of sec.rows) drawRow(r, false);
    }
    newPage();

    // Assemble: 1 catalog, 2 pages, 3 F1, 4 F2, then per page a page object and its content.
    const objs = [];
    const kids = pages.map((_, i) => `${5 + 2 * i} 0 R`).join(" ");
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
    objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    pages.forEach((content, i) => {
      const footer = `BT 0.43 0.43 0.45 rg /F1 7.5 Tf ${n2(M)} 24 Td ${pdfStr(`${report.title} - Sectionlab - page ${i + 1} of ${pages.length} - verify independently`)} Tj ET`;
      const stream = `${content}\n${footer}`;
      objs[5 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`;
      objs[6 + 2 * i] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });
    let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
    const offsets = [];
    for (let i = 1; i < objs.length; i++) { offsets[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
    const xref = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info << /Producer (Sectionlab) /Title ${pdfStr(report.title)} >> >>\nstartxref\n${xref}\n%%EOF\n`;
    return out;
  }

  return { NOTICE, UNITS, LIGHT, fmt, build, markdown, modelFromText, html, sectionSvg, curveSvg, pdf, ascii };
});
