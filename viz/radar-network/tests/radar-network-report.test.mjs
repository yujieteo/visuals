// The narrated export: the site's unchanged template, a deck that parses in beamdswitch in the standard order,
// every link present (also invalid ones, with their reasons), the calculation snapshot's own numbers, stale
// sampled results labelled, and identical decks from identical state.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { assertStandardDeck } from "./beamdswitch-helpers.mjs";
import { CA, CK, M, RP, S, evidence, examples, fresh, json, preset, references } from "./helpers.mjs";

const require = createRequire(import.meta.url);
const T = require("../beamdswitch.js");
const sources = json("data/sources.json");

const deckFor = (scn, extra = {}) => T.deck(RP.report(scn, {
  snapshot: CA.snapshot(scn, scn.view.time_s, { digest: S.modelDigest(scn) }),
  references: CK.references(references), invariants: CK.invariants(preset, examples, evidence), detectorChecks: CK.detectorChecks(), ...extra,
}));

test("the template's source records the site commit it came from", () => {
  assert.match(sources.beamdswitch.commit, /^[0-9a-f]{40}$/);
});

test("the deck parses as the standard template, voice bf_emma, with all 36 links", () => {
  const md = deckFor(fresh());
  const deck = assertStandardDeck(md, "initial scene");
  assert.equal(deck.meta.voice, "bf_emma");
  assert.equal(deck.meta.date, "2026-10-03");
  for (const id of M.linkIds(fresh())) assert.ok(deck.frames.some((f) => f.kind === "frame" && f.section === "Results" && f.title.startsWith(`${id}:`)), `${id} has a frame`);
  assert.match(md, /Published MathWorks cases: 5 of 5 within tolerance/);
  assert.match(md, /Domain invariants: 13 of 13 hold/);
});

test("deck numbers come from the calculation snapshot", () => {
  const scn = fresh(), snap = CA.snapshot(scn, 0);
  const md = deckFor(scn);
  const l = snap.links.find((x) => x.id === "R1>R1:T3");
  assert.match(md, new RegExp(`R1>R1:T3: monostatic, margin ${CA.fixed(l.margin_dB, 2)} dB`));
  assert.ok(md.includes(`P_r=${CA.tex(l.Pr)}`), "the power result in the page's digits");
});

test("invalid links appear with their reasons; stale sampled results are labelled", () => {
  const scn = fresh();
  scn.radars[1].tx.carrier_Hz = 4e9;
  const md = deckFor(scn, { sampled: { rx: "R1", tx: "R1", t0: 0, stale: true, digest: "abc", pulses: 64, Nw: 20000, window: "Hann", noise: 1, eta: 13.8, detections: 3, cellsTotal: 1280000, cells: [] } });
  assertStandardDeck(md, "incompatible carriers");
  assert.match(md, /R1>R2:T3: bistatic, incompatible/);
  assert.match(md, /receives at 4 GHz/);
  assert.match(md, /\(previous parameters\)/);
  assert.match(md, /previous parameter snapshot, digest abc/);
});

test("repeated exports from identical state match; every example gives a valid deck", () => {
  assert.equal(deckFor(fresh()), deckFor(fresh()));
  for (const ex of examples.examples) assertStandardDeck(deckFor(S.applyExample(preset, examples, ex.id)), ex.id);
});
