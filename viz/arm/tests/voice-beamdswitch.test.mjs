// Every page that exports a beamdswitch deck names its narrator: a deck with no voice in its front matter
// is not narrated. The shared template writes the report's meta.voice, or bf_emma (beamdswitch's default
// British female voice) when the report names none; this checks the page inlines that template.
import test from "node:test";
import assert from "node:assert/strict";
import { parseDeck } from "./fixtures/beamdswitch/deck.mjs";
import { SLUG, assertVoice, inlined, load, read } from "./finance-beamdswitch-checks.mjs";

/** @param {string} title */
const frame = (title) => ({ title, body: "A body.", narration: `This is ${title}.` });
/** @param {{ voice?: string }} meta */
const report = (meta) => ({
  meta: { title: "A report", ...meta }, narration: "A report.",
  setup: [frame("Set-up")], method: [frame("Method")], results: [frame("Results")], checks: [{ ...frame("Checks"), key: "The key." }],
});

test("the shared template defaults the voice to bf_emma and keeps one the report names", () => {
  const T = load(read("beamdswitch.js")).Beamdswitch;
  assert.equal(T.DEFAULT_VOICE, "bf_emma");
  for (const meta of [{}, { voice: "" }, { voice: "  " }]) assert.equal(parseDeck(T.deck(report(meta))).meta.voice, "bf_emma", JSON.stringify(meta));
  assert.equal(parseDeck(T.deck(report({ voice: "bf_isabella" }))).meta.voice, "bf_isabella");
  assert.equal(T.deck(report({})).match(/^voice:/gm).length, 1);
});

test(`${SLUG}: the page's inlined template writes a voice into every deck`, () => {
  const source = inlined(read("index.html"), "beamdswitch");
  assert.equal(source, read("beamdswitch.js"), `${SLUG} inlines the shared template`);
  assertVoice(parseDeck(load(source).Beamdswitch.deck(report({}))), SLUG);
});
