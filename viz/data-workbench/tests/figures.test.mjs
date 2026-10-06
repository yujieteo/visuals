// Publication figures (step 4): the presets and their dated sources, the scene graph in each preset's style, the
// PDF written with pdf-lib and fontkit and read back (MediaBox in millimetres, TrueType fonts embedded, text as
// text), the SVG with its font inside, the PNG's pHYs chunk, and the checks failing where they must. The charts come
// from the planted example through the pinned engine, as the page draws them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { engine } from "./engine.mjs";

const require = createRequire(import.meta.url);
/** @type {any} */ const Profile = require("../src/profile.js");
/** @type {any} */ const Examples = require("../src/examples.js");
/** @type {any} */ const ChartSpec = require("../src/chartspec.js");
/** @type {any} */ const Charts = require("../src/charts.js");
/** @type {any} */ const Render = require("../src/render.js");
/** @type {any} */ const Figure = require("../src/figure.js");
/** @type {any} */ const Fonts = require("../src/fonts.js");
/** @type {any} */ const Pdf = require("../src/pdf.js");
/** @type {any} */ const Png = require("../src/png.js");
/** @type {any} */ const PDFLib = require("../vendor/pdf-lib/pdf-lib.min.js");
/** @type {any} */ const fontkit = require("../vendor/fontkit/fontkit.umd.min.js");

const folder = new URL("../", import.meta.url);
const font = (name) => readFileSync(new URL(`vendor/liberation-fonts/${name}`, folder));
const fonts = Fonts.set(Fonts.face(fontkit, font("LiberationSans-Regular.ttf")), Fonts.face(fontkit, font("LiberationSans-Bold.ttf")), "bundled");
const bundled = { name: fonts.name, kind: "bundled", bold: true, missing: fonts.missing };

// One chart of every kind the planted example has, computed once.
const e = await engine();
const path = e.register("planted.csv", new TextEncoder().encode(Examples.planted()));
const imported = await Profile.importFile(e.query, { kind: "csv", path, table: "planted", n: 1 });
const profile = await Profile.profileTable(e.query, { table: "planted", rowColumn: imported.rowColumn, columns: imported.columns });
const t = Charts.prepare({ name: "planted", rowColumn: imported.rowColumn, rows: imported.rows, sample: null, columns: profile.columns });
/** @type {{ spec: any, data: any }[]} */
const charts = [];
for (const c of t.plan.candidates) {
  if (charts.some((x) => x.spec.kind === c.kind)) continue;
  const spec = ChartSpec.make(c, t.ctx);
  const data = await Charts.compute(e.query, spec, t.ctx);
  if (!data.excluded) charts.push({ spec, data });
}

/** A chart drawn and checked by a preset, with its PDF and SVG written and read back. */
async function publish(chart, preset, extra = {}) {
  const settings = Figure.settingsOf({ preset, ...extra });
  const spec = Figure.sized(chart.spec, settings);
  const drawn = Render.render(spec, chart.data, Figure.styleOf(settings, { family: fonts.family, measure: fonts.measure }));
  const pdfBytes = await Pdf.write(PDFLib, fontkit, drawn.scene, fonts, { title: spec.annotation.title, date: new Date(Date.UTC(2026, 9, 6)) });
  const pdf = await Pdf.read(PDFLib, pdfBytes);
  const svgText = await Fonts.svgFile(drawn.svg, drawn.scene, fonts);
  const svg = Fonts.readSvg(svgText, fontkit);
  const result = Figure.check(drawn, { spec, settings, font: bundled, files: { pdf, svg } });
  return { settings, spec, drawn, pdf, pdfBytes, svg, svgText, result };
}

const status = (r, id) => r.checks.find((/** @type {any} */ c) => c.id === id)?.status;

test("every preset rule names its journal stage, source and date; Nature's are read, Science's are not", () => {
  const nature = Figure.rulesOf("nature");
  assert.ok(nature.length >= 10);
  for (const r of nature) {
    assert.equal(r.status, "verified", r.id);
    assert.equal(r.journal, "Nature");
    assert.match(r.url, /^https:\/\/research-figure-guide\.nature\.com\/figures\//);
    assert.equal(r.read, "2026-10-06");
    assert.ok(r.stage.length > 10);
  }
  for (const r of Figure.rulesOf("science")) {
    assert.equal(r.status, "unverified", r.id);
    assert.equal(r.read, null, "the Science page was not read");
    assert.match(r.note, /403/);
  }
  for (const r of Figure.rulesOf("general")) assert.equal(r.status, "workbench");
  assert.deepEqual(Figure.PRESETS.nature.widths, [89, 183]);
  assert.equal(Figure.PRESETS.nature.maxHeight, 170);
  assert.deepEqual(Figure.PRESETS.nature.text, { min: 5, max: 7 });
  assert.deepEqual(Figure.settingsOf({}), { preset: "general", width: null, height: null, dpi: 300, inFigure: true });
  assert.deepEqual(Figure.settingsOf({ preset: "nature" }), { preset: "nature", width: 183, height: null, dpi: 450, inFigure: false });
  assert.equal(Figure.settingsOf({ preset: "general", width: 9999 }).width, 500, "sizes are held to their limits");
});

test("Liberation Sans has Helvetica's widths, so the general figure is drawn as step 2 drew it", () => {
  for (let c = 32; c <= 126; c++) {
    const ch = String.fromCharCode(c);
    assert.equal(Math.round(Fonts.advance(fonts.regular, ch)), Render.WIDTHS[c - 32], ch);
  }
  for (const chart of charts.filter((x) => !x.spec.kind.endsWith("timeline"))) {
    assert.equal(Render.render(chart.spec, chart.data, Figure.styleOf(Figure.settingsOf({}))).svg, Render.render(chart.spec, chart.data).svg, chart.spec.id);
  }
});

test("the general preset: every chart kind meets its checks as PDF and SVG, translucent scatter points stay unverified", async () => {
  assert.ok(charts.length >= 12, `${charts.length} kinds`);
  for (const chart of charts) {
    const { result, pdf, svg, drawn } = await publish(chart, "general");
    const texts = drawn.scene.items.filter((/** @type {any} */ it) => it.t === "text").length;
    // The PDF: one page, the MediaBox the size in millimetres, every font a TrueType subset embedded, every text shown as text.
    assert.equal(pdf.pages, 1);
    assert.ok(Math.abs(pdf.mediaBoxMm[0] - 180) < 1e-6 && Math.abs(pdf.mediaBoxMm[1] - chart.spec.layout.height) < 1e-6, `${chart.spec.id} ${pdf.mediaBoxMm}`);
    assert.ok(pdf.fonts.length >= 1 && pdf.fonts.every((/** @type {any} */ f) => f.file === "FontFile2" && f.subtype === "Type0/CIDFontType2"), JSON.stringify(pdf.fonts));
    assert.ok(pdf.showText >= texts, `${pdf.showText} text operators for ${texts} texts`);
    assert.equal(pdf.cmyk, false);
    assert.equal(svg.texts, texts, "every text an SVG <text>");
    assert.ok(svg.fontFaces >= 1, "the SVG holds its font");
    assert.deepEqual(svg.unmapped, [], "the embedded font maps every character of the text to a glyph");
    const notPassing = [...result.checks, ...result.files.pdf.checks, ...result.files.svg.checks].filter((c) => c.status !== "pass" && c.status !== "n/a");
    if (chart.spec.kind === "scatter") {
      assert.deepEqual(notPassing.map((c) => [c.id, c.status]), [["contrast-marks", "unverified"]], "2,000 translucent points: one alone is below 3:1");
      assert.equal(result.files.pdf.verdict.status, "unverified");
    } else {
      assert.deepEqual(notPassing.map((c) => `${c.id}: ${c.detail}`), [], chart.spec.id);
      assert.equal(result.files.pdf.verdict.status, "pass");
      assert.match(result.files.pdf.verdict.text, /^Meets every check of the General preset as PDF/);
    }
  }
});

test("the Nature preset: 183 mm, text 5 to 7 pt in black, no gridlines or patterns, and no compliance claim with an Arial substitute", async () => {
  for (const chart of charts) {
    const { result, drawn, pdf } = await publish(chart, "nature");
    const texts = drawn.scene.items.filter((/** @type {any} */ it) => it.t === "text");
    assert.ok(Math.abs(pdf.mediaBoxMm[0] - 183) < 1e-6);
    assert.ok(drawn.scene.height <= 170);
    assert.ok(texts.every((/** @type {any} */ it) => it.size >= 5 && it.size <= 7), chart.spec.id);
    assert.ok(texts.every((/** @type {any} */ it) => it.fill === "#000000" || it.fill === "#ffffff"), "black or white text");
    assert.equal(drawn.scene.items.filter((/** @type {any} */ it) => it.role === "grid" || it.hatch).length, 0);
    assert.ok(!texts.some((/** @type {any} */ it) => it.text === chart.spec.annotation.title && it.weight === "bold"), "the title goes to the legend");
    assert.equal(drawn.legend.title, chart.spec.annotation.title);
    for (const id of ["size", "height", "text", "grid", "patterns", "colour-text", "collisions", "clipping", "contrast-text"]) assert.equal(status(result, id), "pass", `${chart.spec.id} ${id}`);
    assert.equal(status(result, "font"), "unverified", "Liberation Sans is an Arial-metric substitute");
    assert.notEqual(result.files.pdf.verdict.status, "pass");
    assert.equal(result.files.png.checks.find((/** @type {any} */ c) => c.id === "format").status, "fail", "Nature does not accept PNG for main figures");
  }
  // Arial by name passes the font rule; a measure with a unit passes the axis rule; 89 mm passes, 120 mm fails.
  const box = charts.find((x) => x.spec.kind === "box");
  const withUnit = { ...box, spec: { ...box.spec, annotation: { ...box.spec.annotation, units: { y: "USD" }, labels: { y: "price (USD)" } } } };
  const settings = Figure.settingsOf({ preset: "nature", width: 89 });
  const drawn = Render.render(Figure.sized(withUnit.spec, settings), withUnit.data, Figure.styleOf(settings, fonts));
  const r = Figure.check(drawn, { spec: Figure.sized(withUnit.spec, settings), settings, font: { name: "Arial", kind: "own", bold: true }, files: null });
  assert.equal(status(r, "font"), "pass");
  assert.equal(status(r, "axes"), "pass");
  assert.equal(status(r, "size"), "pass");
  const wide = Figure.settingsOf({ preset: "nature", width: 120 });
  const w = Render.render(Figure.sized(box.spec, wide), box.data, Figure.styleOf(wide, fonts));
  assert.equal(status(Figure.check(w, { spec: Figure.sized(box.spec, wide), settings: wide, font: bundled }), "size"), "fail");
  assert.equal(status(Figure.check(w, { spec: Figure.sized(box.spec, wide), settings: wide, font: bundled }), "axes"), "unverified", "no unit is ever invented");
});

test("the Science preset: every Science rule unverified, so no figure claims compliance", async () => {
  const { result } = await publish(charts[0], "science");
  const science = result.checks.filter((/** @type {any} */ c) => c.id.startsWith("science-"));
  assert.equal(science.length, Figure.PRESETS.science.rules.length);
  assert.ok(science.every((/** @type {any} */ c) => c.status === "unverified"));
  for (const f of ["svg", "pdf", "png"]) assert.equal(result.files[f].verdict.status, "unverified");
  assert.match(result.verdict.text, /^No compliance claim for the Science preset/);
});

test("the checks fail on small or coloured text, thin lines, clipping, overlaps, low contrast and red with green", () => {
  const sc = { width: 100, height: 60, items: /** @type {any[]} */ ([]) };
  const text = (x, y, s, o = {}) => ({ t: "text", x, y, text: s, size: 7, fill: "#1a1a1a", w: Render.textWidth(s, 7), ...o });
  sc.items.push(text(10, 10, "Overlapping label"), text(12, 10.5, "Another label"), text(95, 30, "Past the edge"), text(10, 40, "Tiny", { size: 4, w: Render.textWidth("Tiny", 4) }),
    text(10, 50, "Pale", { fill: "#cccccc" }), { t: "line", x1: 0, y1: 20, x2: 50, y2: 20, stroke: "#52514e", sw: 0.2 },
    { t: "rect", x: 60, y: 40, w: 5, h: 5, fill: "#d62728" }, { t: "rect", x: 70, y: 40, w: 5, h: 5, fill: "#2ca02c" });
  const r = Figure.check({ scene: sc, dropped: 0 }, { spec: { kind: "bar", encoding: {}, annotation: {} }, settings: Figure.settingsOf({}), font: bundled });
  for (const id of ["collisions", "clipping", "text", "lines", "contrast-text", "palette"]) assert.equal(status(r, id), "fail", id);
  assert.equal(r.verdict.status, "fail");
  assert.match(r.checks.find((/** @type {any} */ c) => c.id === "collisions").detail, /"Overlapping label" and "Another label"/);
});

test("the PDF keeps rotated, anchored and bold text as text in two embedded faces, and its MediaBox is millimetres", async () => {
  const bar = charts.find((x) => x.spec.kind === "mean-bar");
  const out = await publish(bar, "general", { width: 120, height: 90 });
  assert.ok(Math.abs(out.pdf.mediaBox[2] - (120 * 72) / 25.4) < 1e-6 && Math.abs(out.pdf.mediaBox[3] - (90 * 72) / 25.4) < 1e-6);
  assert.equal(out.pdf.fonts.length, 2, "regular and bold faces");
  assert.ok(out.pdf.fonts.every((/** @type {any} */ f) => /LiberationSans/.test(f.name)));
  assert.equal(out.result.files.pdf.checks.find((/** @type {any} */ c) => c.id === "file-size").status, "pass");
  // Text is in the file as text: pdf-lib reads the title back from the document information, and the page's text
  // operators are as many as the scene's texts.
  const again = await PDFLib.PDFDocument.load(out.pdfBytes);
  assert.equal(again.getTitle(), bar.spec.annotation.title);
});

test("the SVG's font passes only when read back it maps every character: a subset with no character map fails", async () => {
  const bar = charts.find((x) => x.spec.kind === "mean-bar");
  const out = await publish(bar, "general");
  assert.equal(out.result.files.svg.checks.find((/** @type {any} */ c) => c.id === "embedded").status, "pass");
  // fontkit's subsets hold no cmap table: such a font in the @font-face maps no character.
  const sub = fonts.regular.font.createSubset();
  for (const ch of "Mean") sub.includeGlyph(fonts.regular.font.glyphForCodePoint(ch.codePointAt(0)));
  const bytes = await new Promise((resolve) => { const parts = []; sub.encodeStream().on("data", (d) => parts.push(d)).on("end", () => resolve(Buffer.concat(parts))); });
  const broken = out.svgText.replace(/base64,[A-Za-z0-9+/=]+/g, `base64,${bytes.toString("base64")}`);
  const svg = Fonts.readSvg(broken, fontkit);
  assert.ok(svg.unmapped.length > 0, JSON.stringify(svg.unmapped));
  const r = Figure.check(out.drawn, { spec: out.spec, settings: out.settings, font: bundled, files: { svg } });
  assert.equal(r.files.svg.checks.find((/** @type {any} */ c) => c.id === "embedded").status, "fail");
  assert.equal(r.files.svg.verdict.status, "fail");
});

test("characters the font has no glyph for fail the glyph check and every file's verdict", async () => {
  const bar = charts.find((x) => x.spec.kind === "mean-bar");
  const spec = { ...bar.spec, annotation: { ...bar.spec.annotation, title: "血圧 by group" } };
  const out = await publish({ ...bar, spec }, "general");
  const glyphs = out.result.checks.find((/** @type {any} */ c) => c.id === "glyphs");
  assert.equal(glyphs.status, "fail");
  assert.match(glyphs.detail, /"血" \(U\+8840\), "圧" \(U\+5727\)/);
  for (const f of ["svg", "pdf", "png"]) assert.equal(out.result.files[f].verdict.status, "fail", f);
  assert.equal(out.result.files.svg.checks.find((/** @type {any} */ c) => c.id === "embedded").status, "fail", "the SVG's font maps no glyph to them");
});

test("the Nature axis-unit check reads the drawn axis title: a unit cut off with … fails", () => {
  const box = charts.find((x) => x.spec.kind === "box");
  const settings = Figure.settingsOf({ preset: "nature", width: 89 });
  const long = { ...box.spec, annotation: { ...box.spec.annotation, units: { y: "mmHg" }, labels: { y: "Systolic blood pressure at the enrolment visit of every participant (mmHg)" } } };
  const spec = Figure.sized(long, settings);
  const drawn = Render.render(spec, box.data, Figure.styleOf(settings, fonts));
  const title = drawn.scene.items.find((/** @type {any} */ it) => it.axis === "y");
  assert.ok(title.text.endsWith("…") && !title.text.includes("(mmHg)"), title.text);
  const r = Figure.check(drawn, { spec, settings, font: bundled, files: null });
  assert.equal(status(r, "axes"), "fail");
});

/** A small RGB PNG made here: IHDR, one IDAT of deflated rows, IEND. */
function tinyPng(width, height, extra = []) {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, "latin1"); data.copy(out, 8);
    out.writeUInt32BE(Png.crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), ...extra.map(([type, data]) => chunk(type, data)), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]));
}

test("PNG: pHYs holds the resolution after IHDR, replaces the browser's, and every CRC holds", () => {
  const old = Buffer.alloc(9); old.writeUInt32BE(2835, 0); old.writeUInt32BE(2835, 4); old[8] = 1;
  const png = Png.withDpi(tinyPng(4, 3, [["pHYs", old]]), 300);
  const r = Png.read(png);
  assert.deepEqual([r.width, r.height, r.colorType, r.ppm, r.physBeforeData, r.crcs], [4, 3, 2, 11811, true, true]);
  assert.ok(Math.abs(r.dpi - 300) < 0.01);
  assert.equal(Png.chunks(png).filter((/** @type {any} */ c) => c.type === "pHYs").length, 1);
  assert.equal(Png.chunks(png)[1].type, "pHYs");
  // Pixels at a resolution, and the 16.7 megapixel limit.
  assert.deepEqual(Png.pixels(183, 111.8, 450), { width: 3242, height: 1981, ok: true, reason: "" });
  const big = Png.pixels(500, 500, 600);
  assert.equal(big.ok, false);
  assert.match(big.reason, /more than the 16\.7/);
  // The checks read the file: the right pixels and pHYs pass, a missing pHYs fails.
  const sc = { width: 25.4 * 4 / 300, height: 25.4 * 3 / 300, items: [] };
  const settings = Figure.settingsOf({ preset: "general", dpi: 300 });
  const ok = Figure.check({ scene: sc }, { spec: { kind: "bar", encoding: {}, annotation: {} }, settings, font: bundled, files: { png: r } });
  assert.equal(ok.files.png.checks.find((/** @type {any} */ c) => c.id === "phys").status, "pass");
  assert.equal(ok.files.png.checks.find((/** @type {any} */ c) => c.id === "pixels").status, "pass");
  const bare = Figure.check({ scene: sc }, { spec: { kind: "bar", encoding: {}, annotation: {} }, settings, font: bundled, files: { png: Png.read(tinyPng(4, 3)) } });
  assert.equal(bare.files.png.checks.find((/** @type {any} */ c) => c.id === "phys").status, "fail");
});

test("a timeline in the Nature style draws dates known to the year as light spans, not a pattern", async () => {
  const fixture = readFileSync(new URL("tests/fixtures/timeline.csv", folder));
  const p2 = e.register("timeline.csv", fixture);
  const imp = await Profile.importFile(e.query, { kind: "csv", path: p2, table: "timeline_pub", n: 2 });
  const prof = await Profile.profileTable(e.query, { table: "timeline_pub", rowColumn: imp.rowColumn, columns: imp.columns });
  const tt = Charts.prepare({ name: "timeline_pub", rowColumn: imp.rowColumn, rows: imp.rows, sample: null, columns: prof.columns });
  const cand = tt.plan.candidates.find((/** @type {any} */ c) => c.kind === "point-timeline");
  const spec = ChartSpec.make(cand, tt.ctx);
  const data = await Charts.compute(e.query, spec, tt.ctx);
  const general = Render.render(spec, data);
  assert.ok(general.scene.items.some((/** @type {any} */ it) => it.hatch), "the general style hatches dates known to the year");
  const settings = Figure.settingsOf({ preset: "nature" });
  const nature = Render.render(Figure.sized(spec, settings), data, Figure.styleOf(settings, fonts));
  assert.equal(nature.scene.items.filter((/** @type {any} */ it) => it.hatch).length, 0);
  assert.match(nature.legend.caption, /light spans are dates known only to the year or month/);
  const pdf = await Pdf.read(PDFLib, await Pdf.write(PDFLib, fontkit, general.scene, fonts));
  assert.equal(pdf.pages, 1, "a hatched timeline writes as PDF too");
});
