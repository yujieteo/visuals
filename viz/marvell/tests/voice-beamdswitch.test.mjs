// Every page that exports a beamdswitch deck names its narrator: a deck with no voice in its front matter
// is not narrated. The shared template writes the report's meta.voice, or bf_emma (beamdswitch's default
// British female voice) when the report names none; this sweep checks every exporting page inlines that template.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { parseDeck } from "./fixtures/beamdswitch/deck.mjs";
import { TEMPLATE_PATH, assertVoice, read } from "./beamdswitch-decks.mjs";

// This repository holds one page; the sweep upstream in yujieteo/visuals covers every exporting page.
const EXPORTING = ["marvell"];
const pages = ["marvell"];

const frame = (title) => ({ title, body: "A body.", narration: `This is ${title}.` });
const report = (meta) => ({
  meta: { title: "A report", ...meta }, narration: "A report.",
  setup: [frame("Set-up")], method: [frame("Method")], results: [frame("Results")], checks: [{ ...frame("Checks"), key: "The key." }],
});
const inlined = (html) => /<script id="beamdswitch">\n([\s\S]*?)<\/script>/.exec(html)?.[1];
function templateOf(source) {
  const context = vm.createContext({});
  context.self = context;
  vm.runInContext(source, context);
  return context.Beamdswitch;
}

test("the pages that export a beamdswitch deck are the known set", () => {
  assert.deepEqual(pages, EXPORTING);
});

test("the shared template defaults the voice to bf_emma and keeps one the report names", () => {
  const T = templateOf(read(TEMPLATE_PATH));
  assert.equal(T.DEFAULT_VOICE, "bf_emma");
  for (const meta of [{}, { voice: "" }, { voice: "  " }]) assert.equal(parseDeck(T.deck(report(meta))).meta.voice, "bf_emma", JSON.stringify(meta));
  assert.equal(parseDeck(T.deck(report({ voice: "bf_isabella" }))).meta.voice, "bf_isabella");
  assert.equal(T.deck(report({})).match(/^voice:/gm).length, 1);
});

for (const slug of pages) {
  test(`${slug}: the page's inlined template writes a voice into every deck`, () => {
    const source = inlined(read(`index.html`));
    assert.equal(source, read(TEMPLATE_PATH), `${slug} inlines the shared template`);
    assertVoice(parseDeck(templateOf(source).deck(report({}))), slug);
  });
}
