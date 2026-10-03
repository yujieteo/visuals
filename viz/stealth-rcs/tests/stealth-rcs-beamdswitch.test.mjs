// The narrated export: the site's unchanged template, decks that parse in beamdswitch, every argument
// narrated with all 6 Toulmin components, frames in the specified order, and every claim and source in
// the export whatever the filters.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assertInlined, assertStandardDeck, assertTemplateCopy, read } from "./beamdswitch-helpers.mjs";
import { parseDeck } from "./fixtures/beamdswitch/deck.mjs";

const require = createRequire(import.meta.url);
const T = require("../beamdswitch.js");
const R = require("../report.js");
const D = require("../raw.json");
const base = R.defaults(D);
const sampleAt = (figure, role, x) => ({ figure, role, index: R.ordered(R.seriesFor(D, figure, role)).findIndex((p) => p[0] === x) });
const VIEWS = [
  base,
  { ...base, aircraft: "F35", claim: "F35-2" },
  { ...base, aircraft: "B2", evidence: "official_statement", result: "supported", claim: "B2-2" },
  { ...base, frequency: "fig-5-12", compare: "condition", compare_frequency: "fig-5-10", traces: ["reconstructed"], zoom: [181.5, 183], sample: sampleAt("fig-5-12", "reconstructed", 182.25) },
  { ...base, traces: ["original"], sample: { figure: "fig-5-11", role: "original", index: R.ordered(R.seriesFor(D, "fig-5-11", "original")).indexOf(R.seriesFor(D, "fig-5-11", "original").segments[2][0]) } },
  { ...base, result: "cannot_verify" },
];
const deckFor = (v) => T.deck(R.report(D, v));

test("the site's shared beamdswitch template is the copy the page inlines", () => {
  assertTemplateCopy("stealth-rcs");
  const html = read("index.html");
  assertInlined(html, "beamdswitch", read("beamdswitch.js"), "stealth-rcs");
  assertInlined(html, "report", read("report.js"), "stealth-rcs");
});

test("every view's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  VIEWS.forEach((v, i) => {
    const deck = assertStandardDeck(deckFor(v), `view ${i}`);
    assert.equal(deck.meta.title, "Stealth aircraft: public RCS evidence");
    assert.equal(deck.meta.voice, "bf_emma");
  });
});

test("frames run overview, 4 aircraft groups, selected view, then sources and credits", () => {
  const titles = parseDeck(deckFor(base)).frames.filter((f) => f.kind === "frame").map((f) => f.title);
  assert.match(titles[0], /^Overview/);
  const groups = ["F-117", "F-22", "F-35", "B-2"].map((n) => titles.findIndex((t) => t.startsWith(`${n === "F-117" ? "F-117 Nighthawk" : n === "F-22" ? "F-22 Raptor" : n === "F-35" ? "F-35 Lightning II" : "B-2 Spirit"}: design features`)));
  assert.ok(groups.every((g, i) => g > 0 && (i === 0 || g > groups[i - 1])), `aircraft groups in order: ${groups}`);
  const view = titles.findIndex((t) => t.startsWith("Selected view"));
  assert.ok(view > groups[3]);
  assert.deepEqual(titles.slice(-3), ["Sources", "Rights and image credits", "Takeaway: support stays within each source's limits"]);
});

test("each narrated argument holds all 6 components with its qualifier and rebuttal, not strengthened", () => {
  const deck = parseDeck(deckFor(base));
  for (const c of D.claims) {
    const f = deck.frames.find((x) => x.title.includes(`${c.id}:`));
    assert.ok(f, c.id);
    for (const k of ["Claim", "Grounds", "Warrant", "Backing", "Qualifier", "Rebuttal", "Result"]) assert.ok(f.narration.includes(`${k}.`), `${c.id} narration names ${k}`);
    for (const k of ["claim", "qualifier", "rebuttal"]) assert.ok(f.narration.includes(R.say(c[k]).replace(/\.$/, "")), `${c.id}: the ${k} is narrated as written`);
    assert.doesNotMatch(f.narration, /\b(proves?|confirms?|definitely|certainly)\b/i, c.id);
  }
});

test("no # or ## heading and no ::: line inside notes or narration", () => {
  const md = deckFor(VIEWS[3]);
  let inDiv = false;
  for (const line of md.split("\n")) {
    if (/^::: (notes|narration)$/.test(line)) inDiv = true;
    else if (line === ":::") inDiv = false;
    else if (inDiv) assert.doesNotMatch(line, /^#{1,2}\s/, line);
  }
});

test("filters never remove evidence from the deck or the Markdown record", () => {
  for (const v of VIEWS) {
    for (const out of [deckFor(v), R.markdown(D, v)]) {
      for (const c of D.claims) assert.ok(out.includes(R.md(c.claim)), `${c.id} in the export`);
      for (const s of D.sources) assert.ok(out.includes(s.url), `${s.id} in the export`);
      for (const im of D.images) assert.ok(out.includes(im.virin), `${im.id} credit`);
      assert.ok(out.includes("does not imply or constitute DoW endorsement"));
    }
  }
});

test("the selected view: its sample table, units, reference and the clipped gap", () => {
  const md = deckFor(VIEWS[3]);
  assert.match(md, /## Selected view: NASA F-117 model/);
  assert.match(md, /Condition comparison: the changed condition is the frequency, 17 GHz and 4 GHz/);
  assert.match(md, /φ = 182\.25° \(exact sample position\), magnitude −\d+\.\d dB ± \d\.\d dB extraction error/);
  assert.match(md, /Reference not stated/);
  assert.match(md, /\| 182\.27 to 182\.29 \| No value \| \| Gap: the line meets the frame/);
  assert.doesNotMatch(md, /dBsm/);
  // An aircraft without a curve: the record, the reason and the link; no replacement curve.
  const f35 = deckFor(VIEWS[1]);
  assert.match(f35, /## Selected view: no eligible curve for the F-35/);
  assert.ok(f35.includes("https://iris.unibas.it/retrieve/"));
  assert.doesNotMatch(f35, /## Sample table/);
  // A dotted trace's sample is the centre of a printed dot, in the deck and in the Markdown record.
  for (const text of [deckFor(VIEWS[4]), R.markdown(D, VIEWS[4])]) {
    assert.match(text, /\(centre of a printed dot\), magnitude/);
    assert.doesNotMatch(text, /exact sample position/);
  }
});

test("narration keeps the qualifier of the visible text", () => {
  const takeaway = R.report(D, base).checks.at(-1);
  assert.match(takeaway.body, /cannot be verified from public evidence/);
  assert.match(takeaway.narration, /cannot be verified from public evidence/);
});

test("both exports hold the full title of every source and no double full stop", () => {
  for (const text of [deckFor(base), R.markdown(D, base)]) {
    for (const s of D.sources) assert.ok(text.includes(R.md(s.title)), s.id);
    assert.doesNotMatch(text, /[^.]\.\.(\s|$)/);
  }
});

test("the Markdown record uses the same frames without narration", () => {
  const md = R.markdown(D, base);
  assert.match(md, /^# Stealth aircraft: public RCS evidence$/m);
  assert.match(md, /^### Overview: 4 aircraft, 8 sourced claims, no ranking$/m);
  assert.doesNotMatch(md, /::: narration/);
  assert.match(md, /^## Sources and credits$/m);
});
