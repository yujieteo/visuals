/* Fastener Pattern CG Tracker: the narrated beamdswitch deck, with the hand calculations as
   slides, and the page's Save Markdown, Copy Markdown, beamdswitch and Copy deck buttons. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { checkDeck, Element, parseDeck, standIn } from "./beamdswitch-deck-checks.mjs";
import { solve } from "../src/core/solve.mjs";
import { examplePattern, clone } from "../src/core/model.mjs";
import { convertPattern } from "../src/core/units.mjs";
import { rectangularArray } from "../src/core/generators.mjs";
import { fmt } from "../src/core/format.mjs";
import { runVerification } from "../src/core/verify.mjs";
import { handCalc, handCalcMarkdown } from "../src/core/handcalc.mjs";
import { deckReport } from "../src/core/deck.mjs";

const T = createRequire(import.meta.url)("../beamdswitch.js");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const VERIFY = runVerification();

const allow = (p) => { p.defaults.shearAllowable = 20000; p.defaults.tensionAllowable = 30000; return p; };
function variant(f) { const p = allow(examplePattern("N-mm")); f(p); return p; }
const CASES = {
  example: allow(examplePattern("N-mm")),
  "no allowables": examplePattern("N-mm"),
  "out of plane, in-lbf": convertPattern(variant((p) => { p.load = { ...p.load, point: { x: 150, y: 0, z: 20 }, Fz: 5000, Mx: 30000 }; }), "in-lbf"),
  "prying, preload and plates": variant((p) => {
    p.load = { ...p.load, point: { x: 0, y: 0, z: 0 }, Fy: -4000, Fz: 40000 };
    p.plates = [{ ...p.plates[0], thickness: 8, flangeStrength: 250, bearingAllowable: 300, shearOutAllowable: 180 }];
    p.defaults.prying = { b: 40, a: 35, p: 60, holeDiameter: 14, boltStrengthB: 40000, manualFactor: null };
    p.defaults.preload = { pMax: 20000, pMin: 16000, phi: 0.2 };
    p.settings.prying = { enabled: true }; p.settings.preload = { enabled: true };
  }),
  "contact edge": variant((p) => { p.load = { ...p.load, point: { x: 0, y: 40, z: 0 }, Fy: 0, Fz: 1000 }; p.settings.axialMethod = "contact-edge"; p.settings.contactEdge = { plateId: "P1", edge: "yMin" }; }),
  "ICR basis": variant((p) => { p.settings.icr = { enabled: true, model: "crawford-kulak" }; p.settings.designBasis = "icr"; p.defaults.icr = { ...p.defaults.icr, rult: 1000 }; }),
  "15 fasteners": variant((p) => {
    p.fasteners = rectangularArray({ nx: 5, ny: 3, sx: 30, sy: 30, cx: 0, cy: 0 }).map((q, i) => ({ id: `F${i + 1}`, label: "", x: q.x, y: q.y, overrides: {} }));
    p.plates = [];
  }),
  "with errors": variant((p) => { p.fasteners = []; }),
};
const deckOf = (p, opts = {}) => T.deck(deckReport(p, solve(p), { verification: VERIFY, ...opts }));

test("every pattern's deck opens in beamdswitch as the standard template, narrated on every slide, voice bf_emma", () => {
  for (const [what, p] of Object.entries(CASES)) {
    const deck = checkDeck(deckOf(p), what);
    assert.equal(deck.meta.voice, "bf_emma", what);
    assert.equal(deck.meta.title, `Fastener group analysis: ${p.name}`, what);
  }
});

test("the Results carry every hand-calculation slide, in order, and the equilibrium slide is a check", () => {
  for (const [what, p] of Object.entries(CASES)) {
    const r = solve(p), hc = handCalc(p, r, { precision: 4, slides: true }), deck = parseDeck(deckOf(p));
    const frames = (section) => deck.frames.filter((f) => f.kind === "frame" && f.section === section);
    const hand = hc.sections.flatMap((s) => s.frames.map((f) => ({ sec: s.title, title: f.title, narration: f.narration, notes: f.notes })));
    if (!r.ok) {
      assert.deepEqual(frames("Results").map((f) => f.title), ["No hand calculations: the pattern has errors"], what);
      continue;
    }
    const inResults = hand.filter((h) => h.sec !== "Equilibrium");
    assert.deepEqual(frames("Results").slice(1).map((f) => f.title), inResults.map((h) => h.title), what);
    assert.deepEqual(frames("Results").slice(1).map((f) => f.notes), inResults.map((h) => `Hand calculations: ${h.sec}.${h.notes ? `\n${h.notes.replace(/\*/g, "\\*")}` : ""}`), what);
    assert.deepEqual(frames("Results").slice(1).map((f) => f.narration), inResults.map((h) => h.narration), what);
    assert.equal(frames("Checks and takeaway")[0].title, hand.find((h) => h.sec === "Equilibrium").title, what);
    // The same steps as the Save Markdown document.
    const doc = parseDeck(handCalcMarkdown(p, r, { precision: 4 }));
    const body = (d, title) => d.frames.find((f) => f.title === title).children.filter((c) => c.type === "md").map((c) => c.text).join("\n");
    for (const h of hand) assert.equal(body(deck, h.title), body(doc, h.title), `${what}: ${h.title}`);
  }
});

test("the headline numbers are the solver's, in the page's units and digits", () => {
  for (const [what, p] of Object.entries(CASES)) {
    const r = solve(p), md = deckOf(p), deck = parseDeck(md), d = p.settings.precision;
    if (!r.ok) { assert.equal(deck.meta.subtitle, "The pattern has errors"); continue; }
    const L = p.unitSystem === "in-lbf" ? "in" : "mm", F = p.unitSystem === "in-lbf" ? "lbf" : "N", S = p.unitSystem === "in-lbf" ? "in²" : "mm²";
    const maxRs = Math.max(...r.fasteners.map((q) => (q.basisShear ?? q.shear).Rs));
    assert.ok(deck.frames.some((f) => f.title === `Cs = (${fmt(r.props.Cs.x, d)}, ${fmt(r.props.Cs.y, d)}) ${L}, J = ${fmt(r.props.J, d)} ${S}; largest Rs = ${fmt(maxRs, d)} ${F}`), what);
    const key = deck.frames.at(-1).children.find((c) => c.type === "div" && c.name === "key");
    const keyText = key.children.map((c) => c.text).join("");
    if (r.critical) {
      assert.equal(deck.meta.subtitle, `Critical fastener ${r.critical.id}, governing MS ${fmt(r.critical.ms, d)}`, what);
      assert.match(keyText, new RegExp(`^Critical fastener ${r.critical.id}: governing MS = ${fmt(r.critical.ms, d).replace(/[.+]/g, "\\$&")} `), what);
    } else {
      assert.match(keyText, /No margin evaluated|No finite margin/, what);
    }
    assert.ok(deck.frames.some((f) => f.title === `Verification: ${VERIFY.passed} of ${VERIFY.results.length} cases pass`), what);
    for (const i of r.issues) assert.ok(md.includes(`- ${i.id} ${i.title}`), `${what}: ${i.id}`);
  }
});

test("the narration reads the pattern and the takeaway in words", () => {
  const said = (p) => parseDeck(deckOf(p)).frames.map((f) => f.narration).join(" ");
  const ex = said(CASES.example);
  assert.match(ex, /The pattern Bracket A - 2x2 has 4 fasteners, spanning 100 millimetres\./);
  assert.match(ex, /The load is 0 newtons in x, minus 10000 newtons in y and 0 newtons in z, applied at x 150 millimetres/);
  assert.match(ex, /The critical fastener is F1, with a governing margin of safety of 1\.307 in shear-tension interaction\./);
  assert.match(said(CASES["out of plane, in-lbf"]), /pounds-force/);
});

/* ---------- the page's buttons ---------- */

/* The page's controller with a stand-in DOM: #id selectors reach getElementById, every other query finds nothing. */
class Node extends Element {
  get options() { return this.children; }
  get selectedOptions() { return []; }
  get offsetWidth() { return 600; }
  get offsetHeight() { return 400; }
  get clientWidth() { return 600; }
  get clientHeight() { return 400; }
  toBlob() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  showModal() {}
  close() {}
  insertAdjacentHTML() {}
}
function page(opts = {}) {
  let p;
  const store = new Map();
  p = standIn({
    ...opts, Node,
    select: (s) => (/^#[\w-]+$/.test(s) ? [p.document.getElementById(s.slice(1))] : []),
    globals: {
      performance: { now: () => 0 },
      localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; } },
      ResizeObserver: class { observe() {} disconnect() {} },
      confirm: () => true,
      CSS: { escape: (s) => String(s) },
    },
  });
  // Select boxes start on their first option, as the markup has them.
  p.$("gen-kind").value = "rect";
  p.run(html);
  return p;
}

test("Save Markdown and Copy Markdown give the hand calculations; beamdswitch and Copy deck give the narrated deck", async () => {
  const p = page();
  const pattern = examplePattern("N-mm");
  await p.$("hand-save").fire("click");
  const [hand] = p.saved;
  assert.equal(hand.name, "bracket-a-2x2-hand-calculations.md");
  assert.equal(hand.blob.type, "text/markdown");
  const md = await hand.blob.text();
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(md, handCalcMarkdown(pattern, solve(pattern), { precision: 4, date: today }));
  assert.equal(p.$("hand-msg").textContent, "Saved bracket-a-2x2-hand-calculations.md; beamdswitch also opens it as a deck.");
  await p.$("hand-copy").fire("click");
  assert.equal(p.copied[0], md);
  assert.equal(p.$("hand-msg").textContent, "Copied the hand calculations as Markdown.");

  await p.$("save-beamdswitch").fire("click");
  const deckFile = p.saved[1];
  assert.equal(deckFile.name, "bracket-a-2x2-beamdswitch.md");
  const deckMd = await deckFile.blob.text();
  assert.equal(deckMd, T.deck(deckReport(pattern, solve(pattern), { precision: 4, date: today, verification: VERIFY })));
  checkDeck(deckMd, "saved deck");
  assert.equal(p.$("io-msg").textContent, "Saved bracket-a-2x2-beamdswitch.md: open it in beamdswitch.");
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.copied[1], deckMd);
  assert.equal(p.$("io-msg").textContent, "Copied the beamdswitch deck: paste it into beamdswitch.");

  // The worked fastener follows the picker.
  p.$("trace-fastener").value = "F3";
  await p.$("trace-fastener").fire("change");
  await p.$("hand-copy").fire("click");
  assert.match(p.copied[2], /^## Worked shear, F3: /m);
  assert.match(p.$("trace").innerHTML, /<h4>Worked shear, F3: /);
});

test("a blocked download says to use Copy; a blocked clipboard shows the text to copy by hand", async () => {
  const p = page({ saveFails: true, clipboardFails: true });
  await p.$("hand-save").fire("click");
  assert.equal(p.$("hand-msg").textContent, "Could not save: downloads are blocked. Use Copy Markdown instead.");
  await p.$("save-beamdswitch").fire("click");
  assert.equal(p.$("io-msg").textContent, "Could not save: downloads are blocked. Use Copy deck instead.");
  assert.equal(p.saved.length, 0);
  await p.$("copy-beamdswitch").fire("click");
  assert.equal(p.$("fallback").hidden, false);
  assert.equal(p.$("fallback-label").textContent, "Clipboard access is blocked; the deck is selected below. Press Ctrl+C or ⌘C.");
  checkDeck(p.$("fallback-text").value, "fallback");
  await p.$("hand-copy").fire("click");
  assert.equal(p.$("fallback-label").textContent, "Clipboard access is blocked; the Markdown is selected below. Press Ctrl+C or ⌘C.");
  assert.equal(parseDeck(p.$("fallback-text").value).meta.voice, "bf_emma");
  assert.equal(p.copied.length, 0);
});

test("the page renders the hand calculations under their section headings", () => {
  const p = page();
  const out = p.$("trace").innerHTML;
  for (const h of ["Centroids", "Section properties", "Load reduction", "In-plane shear", "Out-of-plane tension", "Checks and margin", "Equilibrium"]) assert.ok(out.includes(`<h3>${h}</h3>`), h);
  assert.ok(out.includes("<h4>Polar moment J = 13600 mm² about Cs</h4>"));
  const r = solve(clone(examplePattern("N-mm")));
  assert.ok(out.includes(`<td class="num">${fmt(r.props.J, 6)}</td>`));
});
