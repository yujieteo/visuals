import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { assertSharedTemplate, checkDeck, checkDeckPlots, parseDeck, standIn, Element } from "./beamdswitch-deck-checks.mjs";

const require = createRequire(import.meta.url);
const S = require("../engine.js");
const T = require("../beamdswitch.js");
S.setFigureData(require("../raw.json").figures);

const steel = { preset: "steel", E: 200000, Fcy: 520, nu: 0.29, n: 20 };
/* Every tab's defaults, plus the other choices each tab offers. */
const CASES = [
  ...S.TABS.map((tab) => [tab, S.defaults(tab), "defaults"]),
  ["column", { ...S.defaults("column"), tangent: true, kPreset: "custom", K: 1.7, L: 2000 }, "slender, custom K, tangent"],
  ["column", { ...S.defaults("column"), section: { ...S.defaults("column").section, shape: "rect", axis: "strong" }, L: 150, kPreset: "ff", K: 0.5 }, "stocky rectangle"],
  ["column", { ...S.defaults("column"), material: steel, section: { ...S.defaults("column").section, shape: "free" }, P: 60000 }, "free section, negative margin"],
  ["beamColumn", { ...S.defaults("beamColumn"), w: 0.5, M1: 20000, M2: -10000, kPreset: "fr", K: 2 }, "lateral load and end moments"],
  ["beamColumn", { ...S.defaults("beamColumn"), feMode: "springs", krA: 1e6, krB: 0, uB: "spring", ktB: 50 }, "end springs"],
  ["beamColumn", { ...S.defaults("beamColumn"), P: 20000 }, "above Pe"],
  ["beamColumn", { ...S.defaults("beamColumn"), e: 0, bow: 0, P: 2000 }, "squash"],
  ["shear", { ...S.defaults("shear"), edges: "clamped", plasticity: "table2", t: 3, a: 100, b: 400 }, "clamped, plastic"],
  ["diagonal", S.tn2661Case(1), "TN 2661 example 1"],
  ["diagonal", S.tn2661Case(2), "TN 2661 example 2, single uprights"],
  ["diagonal", { ...S.defaults("diagonal"), restraint: "user", Rh: 1.62, Rd: 1, S: 4000 }, "typed restraint, unbuckled web"],
].flatMap(([tab, inputs, label]) => ["SI", "US"].map((units) => ({ tab, inputs: S.normalise(tab, inputs), units, what: `${tab} ${label} ${units}` })));
const deckFor = ({ tab, inputs, units }) => T.deck(S.report(tab, inputs, { displayUnits: units }));
const showVal = (v, q, units) => (v === null || v === undefined ? "—" : typeof v === "string" ? v : `${S.fmt(S.toDisplay(v, q, units))}${S.unitLabel(q, units) ? " " + S.unitLabel(q, units) : ""}`);

test("the stability page inlines the site's shared beamdswitch template unchanged", () => {
  assertSharedTemplate();
});

test("every tab's deck opens in beamdswitch as the standard template, narrated on every slide", () => {
  for (const c of CASES) {
    const md = deckFor(c), { deck } = checkDeckPlots(md, c.what);
    assert.equal(deck.meta.title, `Stability analysis: ${S.TAB_LABELS[c.tab]}`, c.what);
    assert.match(md, /^::: key\n.+ Not for certification\.\n:::$/m, `${c.what}: the takeaway repeats the notice`);
  }
});

test("the deck's results table is the page's results table, in the page's digits and units", () => {
  for (const c of CASES) {
    const md = deckFor(c), r = S.solve(c.tab, c.inputs);
    for (const row of S.resultRows(c.tab, r)) assert.ok(md.includes(`| ${row.label} | ${showVal(row.value, row.q, c.units)} |`), `${c.what}: ${row.label}`);
    for (const w of r.warnings) assert.ok(md.includes(`- Warning: ${w}`), `${c.what}: ${w}`);
    const tests = S.selfTests();
    assert.ok(md.includes(`self-test ${tests.filter((t) => t.pass).length}/${tests.length} pass`), c.what);
  }
});

test("the plotted curves are the engine's own, in the display units", () => {
  const near = (got, want, what) => assert.ok(Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want)), `${what}: ${got} vs ${want}`);
  for (const c of CASES) {
    const { plots } = checkDeckPlots(deckFor(c), c.what), r = S.solve(c.tab, c.inputs), m = c.inputs.material;
    const at = (spec, f) => { for (let i = 0; i <= 40; i++) { const x = spec.x[0] + ((spec.x[1] - spec.x[0]) * i) / 40; f(x); } };
    if (c.tab === "column") {
      const [{ spec }] = plots;
      at(spec, (x) => {
        near(spec.curves[0].f(x), S.toDisplay(x > 0 ? S.columnStrength(m, x).sigmaCr : m.Fcy, "stress", c.units), `${c.what} σcr(${x})`);
        near(spec.curves[1].f(x), S.toDisplay(r.sigmaApplied, "stress", c.units), `${c.what} P/A`);
      });
    } else if (c.tab === "beamColumn") {
      if (!r.atP) { assert.equal(plots.length, 0, c.what); continue; }
      const [{ spec }] = plots, s = S.fromDisplay(1, "length", c.units), x0 = c.inputs, P = x0.P;
      const cfg = { l: r.l, EI: m.E * r.section.I, MA: x0.M1 + P * x0.e, MB: x0.M2 + P * x0.e, w: x0.w, d0: x0.bow };
      near(spec.x[1], S.toDisplay(r.l, "length", c.units), c.what);
      at(spec, (x) => {
        const st = S.beamColumnState(cfg, P, x * s), scale = Math.abs(S.toDisplay(r.atP.Mmax, "moment", c.units));
        assert.ok(Math.abs(spec.curves[0].f(x) - S.toDisplay(st.M, "moment", c.units)) <= 1e-8 * scale, `${c.what} M(${x})`);
        assert.ok(Math.abs(spec.curves[1].f(x) - S.toDisplay(st.Mlin, "moment", c.units)) <= 1e-8 * scale, `${c.what} Mlin(${x})`);
      });
      const peak = Math.max(...Array.from({ length: 2001 }, (_, i) => Math.abs(spec.curves[0].f((spec.x[1] * i) / 2000))));
      assert.ok(Math.abs(peak - Math.abs(S.toDisplay(r.atP.Mmax, "moment", c.units))) <= 1e-5 * peak, `${c.what}: the plotted peak is Mmax`);
    } else if (c.tab === "shear") {
      const [{ spec }] = plots;
      at(spec, (x) => { near(spec.curves[0].f(x), S.ksClosed("ss", x), c.what); near(spec.curves[1].f(x), S.ksClosed("clamped", x), c.what); });
      near(spec.curves[c.inputs.edges === "clamped" ? 1 : 0].f(r.ratio), r.ks, `${c.what}: k_s at the panel's ratio`);
    } else {
      const [{ spec }] = plots;
      at(spec, (x) => near(spec.curves[0].f(x), Math.tanh(0.5 * Math.log10(x)), c.what));
      if (r.loading > 1 && r.loading <= spec.x[1]) near(spec.curves[0].f(r.loading), r.k, `${c.what}: k at the web's τ/τcr`);
    }
  }
});

test("the headline numbers are the page's stats, and the narration says them in the display units", () => {
  const col = deckFor({ tab: "column", inputs: S.defaults("column"), units: "SI" }), r = S.solve("column", S.defaults("column"));
  const frames = parseDeck(col).frames, said = frames.map((f) => f.narration).join(" ");
  assert.ok(frames.some((f) => f.title === `KL/r = ${S.fmt(r.lambda)}: ${r.regime} regime (transition ${S.fmt(r.lambdaC)})`));
  assert.ok(frames.some((f) => f.title === `Margin of safety Pcr/P − 1 = ${r.MS >= 0 ? "+" : ""}${S.fmt(r.MS)}`));
  assert.ok(said.includes(`Its critical stress is ${S.fmt(r.sigmaCr)} megapascals, and the buckling load is ${S.fmt(r.Pcr)} newtons.`), said);
  assert.match(said, /The column is 800 millimetres long\. Its ends are pinned-pinned, so K is 1\./);

  const us = S.normalise("diagonal", S.tn2661Case(1)), d = S.solve("diagonal", us);
  const saidUS = parseDeck(deckFor({ tab: "diagonal", inputs: us, units: "US" })).frames.map((f) => f.narration).join(" ");
  assert.ok(saidUS.includes(`a diagonal-tension factor k of ${S.fmt(d.k)}`), saidUS);
  assert.ok(saidUS.includes(`The uprights carry a stress of minus ${S.fmt(Math.abs(S.toDisplay(d.sigmaU, "stress", "US")))} kips per square inch`), saidUS);
  assert.match(saidUS, /in pounds-force, inches and kips per square inch/);
});

test("a tab without a result has no deck to save", () => {
  assert.throws(() => S.report("diagonal", S.normalise("diagonal", { hc: 380, dc: 50, d: 60 }), {}), /kss unavailable/);
  assert.throws(() => S.report("column", S.normalise("column", { L: -1 }), {}), (e) => e instanceof S.InputError);
});

/* ---------- the page's buttons ---------- */
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
/* The plots look up their svg and tooltip inside the figure they just wrote. */
class PlotElement extends Element { querySelector() { return new PlotElement(); } }
function page(opts = {}) {
  const p = standIn({ ...opts, Node: PlotElement });
  p.run(html);
  p.status = () => p.$("io-status").textContent;
  return p;
}

test("the beamdswitch button saves the tab's deck, and Copy deck copies the same deck", async () => {
  const p = page();
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.status(), "Saved stability-column-beamdswitch.md: open it in beamdswitch.");
  const [file] = p.saved;
  assert.equal(file.name, "stability-column-beamdswitch.md");
  assert.equal(file.blob.type, "text/markdown");
  const md = await file.blob.text();
  assert.equal(checkDeck(md, "saved").meta.title, "Stability analysis: " + S.TAB_LABELS.column);
  assert.equal(md, deckFor({ tab: "column", inputs: S.normalise("column", S.defaults("column")), units: "SI" }));
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.status(), "Copied the beamdswitch deck: paste it into beamdswitch.");
  assert.equal(p.copied[0], md);
});

test("a blocked download or clipboard says so, and Copy deck is the fallback", async () => {
  const p = page({ saveFails: true, clipboardFails: true });
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.status(), "Could not save: downloads are blocked. Use Copy deck instead.");
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.status(), "Could not copy the beamdswitch deck: the clipboard is blocked here.");
  assert.equal(p.saved.length + p.copied.length, 0);
  const fallback = page({ saveFails: true });
  await fallback.$("save-beamdswitch").fire("click");
  await fallback.$("copy-beamdswitch").fire("click");
  checkDeck(fallback.copied[0], "copied");
});

test("only inputs without a result say to fix the inputs; any other failure says what went wrong", async () => {
  const p = page();
  const L = Object.assign(new Element("input"), { dataset: { key: "L", q: "length" }, value: "-5" });
  await p.$("inputs").fire("input", L);
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.status(), "Fix the inputs first: there is no result to save.");
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.status(), "Fix the inputs first: there is no result to copy.");

  const broken = page();
  broken.context.Beamdswitch = { deck() { throw new Error("narration is missing"); } };
  await broken.$("save-beamdswitch").fire("click");
  assert.equal(broken.status(), "Could not write the deck: narration is missing");
  await broken.$("copy-beamdswitch").fire("click");
  assert.equal(broken.status(), "Could not write the deck: narration is missing");
  assert.equal(p.saved.length + p.copied.length + broken.saved.length + broken.copied.length, 0);
});
