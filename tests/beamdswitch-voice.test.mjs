// scripts/templates/beamdswitch.js, the report template that every deck-exporting page inlines unchanged
// (the template rule in scripts/rules.py checks that each page inlines its copy unchanged): a deck with no voice in its front
// matter is not narrated, so the template writes the report's meta.voice, or bf_emma (beamdswitch's default
// British female voice) when the report names none. The deck is parsed with beamdswitch's own parser.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { parseDeck } from "../scripts/templates/beamdswitch/deck.mjs";

/** @type {typeof import("../scripts/templates/beamdswitch.js")} */
const Beamdswitch = createRequire(import.meta.url)("../scripts/templates/beamdswitch.js");

/** @param {string} title */
const frame = (title) => ({ title, body: "A body.", narration: `This is ${title}.` });
/** @param {{ voice?: string }} meta */
const report = (meta) => ({
  meta: { title: "A report", ...meta }, narration: "A report.",
  setup: [frame("Set-up")], method: [frame("Method")], results: [frame("Results")], checks: [{ ...frame("Checks"), key: "The key." }],
});

test("the shared template defaults the voice to bf_emma and keeps one the report names", () => {
  assert.equal(Beamdswitch.DEFAULT_VOICE, "bf_emma");
  for (const meta of [{}, { voice: "" }, { voice: "  " }]) assert.equal(parseDeck(Beamdswitch.deck(report(meta))).meta.voice, "bf_emma", JSON.stringify(meta));
  assert.equal(parseDeck(Beamdswitch.deck(report({ voice: "bf_isabella" }))).meta.voice, "bf_isabella");
  assert.equal(Beamdswitch.deck(report({})).match(/^voice:/gm)?.length, 1);
});
