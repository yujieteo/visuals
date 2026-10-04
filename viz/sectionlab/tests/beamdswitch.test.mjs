import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkDeck, checkDeckPlots, parseDeck, standIn, textOf, Element } from "./beamdswitch-deck-checks.mjs";

const require = createRequire(import.meta.url);
const L = require("../src/engine.js");
const T = require("../beamdswitch.js");
const RAW = require("../raw.json");
const ACCURACY = require("../reference/torsion-accuracy.json");
const R = L.report, fmt = R.fmt;

const clone = (x) => JSON.parse(JSON.stringify(x));
/* Every preset, plus bending about other axes, the fixed-axis mode and a polygon. */
const CASES = [
  ...RAW.presets.map((p) => [p.id, p.model]),
  ["ipe about y, fixed axis", { ...clone(RAW.presets.find((p) => p.id === "ipe").model), plastic: { axis: "y", N: 0, solve: "fixed-axis" } }],
  ["ipe with an axial force past ε_lim", { ...clone(RAW.presets.find((p) => p.id === "ipe").model), plastic: { axis: "x", N: 1e12, solve: "zero-cross" } }],
  ["angle about the major axis", { ...clone(RAW.presets.find((p) => p.id === "angle").model), plastic: { axis: "major", N: 0, solve: "zero-cross" } }],
  ["turned hexagon", { sectionlab: 1, title: "Hexagon", materials: [clone(RAW.materials[2])], E_base: RAW.materials[2].E,
    parts: [{ id: "hex", shape: "polygon", dims: { n: 6, d: 100 }, x: 10, y: -5, orientation: 90, material: RAW.materials[2].id }] }],
].map(([what, model]) => {
  const result = L.compute(model, { accuracy: ACCURACY });
  return { what, result, md: T.deck(L.buildBeamdswitch(result)) };
});

test("every section's deck opens in beamdswitch as the standard template, narrated on every slide", () => {
  for (const { what, result, md } of CASES) {
    const { deck } = checkDeckPlots(md, what);
    assert.equal(deck.meta.title, `Section analysis: ${result.model.title || "Section"}`, what);
  }
});

test("the numbers are the report object's, so the deck agrees with the page's tables and the other exports", () => {
  for (const { what, result, md } of CASES) {
    const rep = L.buildReport(result), markdown = R.markdown(rep, result.model);
    // Every table in the deck is a table of the Markdown export, row for row (the section
    // properties are split over three slides, so only their values are compared, below).
    for (const s of rep.sections.filter((x) => x.title !== "M–κ curve")) {
      const rows = markdown.split(`## ${s.title}\n`)[1].split("\n## ")[0].split("\n").filter((l) => l.startsWith("| ") && !/^\| -/.test(l)).slice(1);
      for (const row of rows) assert.ok(md.includes(`${row}\n`) || s.title === "Section properties", `${what}: ${s.title}: ${row}`);
    }
    const p = result.props;
    assert.ok(parseDeck(md).frames.some((f) => f.title === `Area A = ${fmt(p.A)} mm², centroid (${fmt(p.cx)}, ${fmt(p.cy)}) mm`), `${what}: area frame`);
    for (const sym of ["Ix", "Iy", "Ixy", "I1", "I2", "Ip", "Sx_top", "Sx_bottom", "rx", "ry", "Qx", "Qy"]) assert.ok(md.includes(` ${fmt(p[sym])} | mm`), `${what}: ${sym}`);
    const t = result.torsion;
    assert.ok(md.includes(t.available ? `## Torsion constant J = ${fmt(t.J)} mm⁴` : "## Torsion constant J: n/a"), `${what}: torsion`);
    const pl = result.plastic;
    if (pl && !pl.error) assert.ok(md.includes(`## Allowable moment M_lim = ${fmt(pl.limit.M)} N·mm at κ_lim = ${fmt(pl.limit.kappa)} 1/mm`), `${what}: M_lim`);
  }
});

test("the plotted M–κ curve passes through every point the engine computed", () => {
  for (const { what, result, md } of CASES) {
    const pl = result.plastic;
    const { plots } = checkDeckPlots(md, what);
    if (!pl || pl.error) { assert.equal(plots.length, 0, what); continue; }
    const [{ spec }] = plots, scale = Math.max(...pl.curve.map((s) => Math.abs(s.M)));
    assert.equal(spec.x[1], +pl.limit.kappa.toPrecision(12), what);
    for (const s of pl.curve) assert.ok(Math.abs(spec.curves[0].f(s.kappa) - s.M) <= 1e-9 * scale, `${what}: M(${s.kappa}) = ${spec.curves[0].f(s.kappa)} vs ${s.M}`);
  }
});

test("a moment–curvature analysis that fails has its own slide saying why", () => {
  const { result, md } = CASES.find((c) => c.what === "ipe with an axial force past ε_lim");
  assert.match(result.plastic.error, /The axial force alone strains the section past ε_lim/);
  const frame = parseDeck(md).frames.find((f) => f.title === "Plastic bending: n/a");
  assert.ok(frame, "the Plastic bending: n/a slide");
  assert.equal(frame.section, "Results");
  assert.ok(textOf(frame).includes(result.plastic.error), "the reason is on the slide");
});

test("the narration names the parts and reads the numbers in mm, N and MPa", () => {
  const said = (id) => parseDeck(CASES.find((c) => c.what === id).md).frames.map((f) => f.narration).join(" ");
  const tee = said("tee-hole");
  assert.match(tee, /The section is built from two parts, with one hole cut out\./);
  assert.match(tee, /Flange, a rectangle in Carbon steel S355, with width 200 millimetres and height 20 millimetres, centred at x 0 millimetres and y 110 millimetres\./);
  assert.match(tee, /A circle void, hole, with diameter 6 millimetres, at x 0 millimetres and y minus 40 millimetres\./);
  assert.match(tee, /second moment of area is 2\.59209 times ten to the 7 millimetres to the fourth about x/);
  assert.match(said("rhs"), /The torsion constant is .+ millimetres to the fourth, from the Bredt–Batho \(thin wall\) formula/);
  assert.match(said("turned hexagon"), /with 6 sides and across corners 100 millimetres, centred at x 10 millimetres and y minus 5 millimetres, turned 90 degrees\./);
});

/* ---------- the page's buttons ---------- */
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
/* The M–κ chart reads its plot geometry back from the svg it just wrote. */
class ChartElement extends Element {
  querySelector(sel) {
    const e = new ChartElement(), plot = new RegExp(`<${sel}\\b[^>]*data-plot='([^']*)'`).exec(this.innerHTML);
    if (plot) e.dataset.plot = plot[1];
    return e;
  }
}
function page(opts = {}) {
  const p = standIn({ ...opts, Node: ChartElement, globals: { ResizeObserver: class { observe() {} }, MutationObserver: class { observe() {} }, TextEncoder, TextDecoder, atob, btoa } });
  p.run(html);
  p.status = () => p.$("export-status").textContent;
  return p;
}

test("the beamdswitch button saves the section's deck, and Copy deck copies the same deck", async () => {
  const p = page(), first = RAW.presets[0];
  await p.$("save-beamdswitch").fire("click");
  const name = `${first.model.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-beamdswitch.md`;
  assert.equal(p.status(), `Saved ${name}: open it in beamdswitch.`);
  const [file] = p.saved;
  assert.equal(file.name, name);
  assert.equal(file.blob.type, "text/markdown");
  const md = await file.blob.text();
  assert.equal(checkDeck(md, "saved").meta.title, `Section analysis: ${first.model.title}`);
  assert.equal(md, T.deck(L.buildBeamdswitch(L.compute(first.model, { accuracy: ACCURACY }))));
  await p.$("copy-beamdswitch").fire("click");
  await new Promise((r) => setImmediate(r));
  assert.equal(p.status(), "Copied the beamdswitch deck: paste it into beamdswitch.");
  assert.equal(p.copied[0], md);
});

test("a blocked download says to use Copy deck, and a blocked clipboard says so", async () => {
  const p = page({ saveFails: true, clipboardFails: true });
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.status(), "Could not save: downloads are blocked. Use Copy deck instead.");
  await p.$("copy-beamdswitch").fire("click");
  await new Promise((r) => setImmediate(r));
  assert.equal(p.status(), "Could not copy the beamdswitch deck: the clipboard is blocked here.");
  assert.equal(p.saved.length + p.copied.length, 0);
});

/* ---------- the hand calculations ---------- */
test("the deck's Results end on the hand calculations, narrated, in the bf_emma voice", () => {
  for (const { what, result, md } of CASES) {
    const deck = parseDeck(md), hand = L.handcalc.deckFrames(result);
    assert.equal(deck.meta.voice, "bf_emma", what);
    const results = deck.frames.filter((f) => f.kind === "frame" && f.section === "Results");
    assert.deepEqual(results.slice(-hand.length).map((f) => f.title), hand.map((f) => f.title), what);
    assert.ok(hand.length >= 10, what);
  }
});

test("the hand-calculation Markdown opens in beamdswitch as one narrated section with reveals", () => {
  for (const { what, result } of CASES) {
    const md = L.buildHandMarkdown(result), deck = parseDeck(md);
    assert.equal(deck.meta.voice, "bf_emma", what);
    assert.equal(deck.meta.title, `Hand calculations: ${result.model.title || "Section"}`, what);
    assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), ["Hand calculations"], what);
    assert.equal(md.match(/^::: narration$/gm).length, deck.frames.length, `${what}: one narration per slide`);
    for (const f of deck.frames) {
      assert.ok(f.narration, `${what}: "${f.title}" is narrated`);
      assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻·∠°σ]/, `${what}: "${f.title}" reads as speech`);
    }
    const area = deck.frames.find((f) => f.title === `Hand calculation: area A = ${fmt(result.props.A)} mm²`);
    assert.ok(area, `${what}: the area frame`);
    assert.ok(area.steps > 1, `${what}: the area frame reveals its steps one by one`);
  }
});

test("the page shows the hand calculations, and Save Markdown and Copy Markdown hand over the same document", async () => {
  const p = page(), first = RAW.presets[0], expected = L.buildHandMarkdown(L.compute(first.model, { accuracy: ACCURACY }));
  const box = p.$("hand-steps");
  assert.equal(box.children.length, 0, "nothing is drawn while the details are closed");
  p.$("hand-details").open = true;
  await p.$("hand-details").fire("toggle");
  assert.equal(box.children.length, L.handcalc.frames(L.compute(first.model, { accuracy: ACCURACY })).length);
  assert.equal(box.children[1].children[0].textContent, `Area A = ${fmt(L.compute(first.model, { accuracy: ACCURACY }).props.A)} mm²`);
  await p.$("save-hand").fire("click");
  const name = `${first.model.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-hand-calculations.md`;
  assert.equal(p.$("hand-status").textContent, `Saved ${name}: it opens in beamdswitch too.`);
  const [file] = p.saved;
  assert.equal(file.name, name);
  assert.equal(await file.blob.text(), expected);
  await p.$("copy-hand").fire("click");
  await new Promise((r) => setImmediate(r));
  assert.equal(p.$("hand-status").textContent, "Copied the hand calculations as Markdown.");
  assert.equal(p.copied[0], expected);
  const blocked = page({ clipboardFails: true });
  await blocked.$("copy-hand").fire("click");
  await new Promise((r) => setImmediate(r));
  assert.equal(blocked.$("hand-status").textContent, "Could not copy the hand calculations: the clipboard is blocked here.");
});
