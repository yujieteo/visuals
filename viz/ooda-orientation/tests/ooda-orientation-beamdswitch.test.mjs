import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { parseDeck } from "./fixtures/beamdswitch/deck.mjs";
import { assertButtonsExport, assertStandardDeck, load, openPage, read } from "./beamdswitch-decks.mjs";

const SLUG = "ooda-orientation";
/** @type {import("./beamdswitch-template").BeamdswitchTemplate} */
const T = load(`beamdswitch.js`);
/** @type {typeof import("../report.js")} */
const R = load(`report.js`);
const html = read(`index.html`);
/** @param {string} id */
const script = (id) => /** @type {RegExpExecArray} */ (new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`).exec(html))[1];
/** @type {Orient.Data} */
const D = JSON.parse(script("oo-data").replace(/<\\\//g, "</"));
const context = vm.createContext({});
vm.runInContext(script("oo-logic"), context);
/** @type {Orient.Logic} */
const L = context.OrientLogic;
L.init(D);
/** @param {string} id @param {number} [upto] */
const state = (id, upto) => L.replay(/** @type {import("../src/ooda-orientation-logic.js").Example} */ (D.examples.find((e) => e.id === id)), upto).state;
/** @param {Orient.State} s */
const deckFor = (s) => T.deck(R.report(s, L, D));
/** @param {string} md */
const plainText = (md) => md.replace(/\\(.)/g, "$1");

test("a situation restored from storage is what beamdswitch saves and Copy deck copies", async () => {
  for (const id of ["stalled-project", "southwest"]) {
    const s = state(id);
    const stored = JSON.stringify(s);
    const localStorage = { getItem: (/** @type {string} */ k) => (k === L.KEY ? stored : null), setItem() {}, removeItem() {} };
    const page = await openPage(SLUG, { globals: { localStorage } });
    await assertButtonsExport(page, SLUG, deckFor(s));
  }
});

test("every worked example, at every step after its first orientation, parses as the standard narrated deck with the bf_emma voice", () => {
  for (const e of D.examples)
    for (let n = 1; n <= e.steps.length; n += 1) {
      const s = state(e.id, n);
      const deck = assertStandardDeck(deckFor(s), `${e.id} step ${n}`);
      assert.equal(deck.meta.voice, "bf_emma", `${e.id} step ${n}`);
      assert.equal(deck.meta.title, s.situation.title);
      assert.equal(deck.meta.subtitle, "An orientation record from Orient");
      assert.match(deckFor(s), /^---\ntitle: .*\nsubtitle: .*\nvoice: bf_emma\n---/);
    }
});

test("the deck walks the situation in the specified order", () => {
  const md = deckFor(state("stalled-project"));
  const titles = parseDeck(md).frames.filter((f) => f.kind === "frame").map((f) => f.title);
  assert.deepEqual(titles, ["The situation", "The reality ledger", "The original orientation, O0", "Contradictions", "Destruction: O0 to O1",
    "Fragments: kept, destroyed, created", "Candidate orientations", "Adopted orientation, O1", "The action", "The prediction", "What happened", "How far to trust this", "Current conclusion"]);
  const text = plainText(md);
  for (const s of ["Previous increases in planning did not improve delivery", "Negate an assumption", "Uncertainty is too high for a detailed long-range plan to be useful",
    "The result reveals which of the two possible directions is viable", "Frozen when the action started", "A two-day prototype showed one direction fails on real data",
    "No obvious reason to destroy this orientation yet. Test or exploit it."]) assert.ok(text.includes(s), s);
});

test("with several loops the deck follows the current lineage, naming rejected candidates only where they were contrasted", () => {
  const md = plainText(deckFor(state("southwest")));
  assert.ok(md.includes("O2 (rejected)"));
  assert.ok(md.includes("Short-distance transport for the same journey: cars, buses and airlines"));
  assert.equal((md.match(/^## Destruction: /gm) || []).length, 1);
  // A second reorientation adds its own destruction to the chain; an abandoned branch is not replayed.
  let s = state("stalled-project");
  s = L.apply(s, { do: "reorient" }).state;
  const r = L.apply(s, { do: "move", op: "b-widen", targets: [], replacement: { type: "boundary", text: "The project and the people waiting for it" } });
  assert.ok(r.error, "b-widen needs a boundary target");
  const add = L.apply(s, { do: "move", op: "i-absent", targets: [], replacement: { text: "Nobody has asked for the second direction" } });
  const c = L.apply(add.state, { do: "candidate", inside: "a demand problem", from: [add.id], move: "Ask the people waiting" });
  const a = L.apply(c.state, { do: "adopt", id: c.id }).state;
  const deck = plainText(deckFor(a));
  assert.equal((deck.match(/^## Destruction: /gm) || []).length, 2);
  assert.ok(deck.includes("## Destruction: O1 to O2"));
});

test("narration is plain speech even when the user's own words contain markup and symbols", () => {
  const s = L.apply(L.blank(), { do: "new", title: "Costs up 30% & *rising* <fast> #now | $5" }).state;
  const t = L.apply(s, { do: "item", type: "signal", text: "Revenue_fell by 2× in Q3 [draft] `code`" }).state;
  const md = deckFor(t);
  const deck = assertStandardDeck(md, "symbols");
  assert.equal(deck.meta.title, "Costs up 30% & *rising* <fast> #now | $5");
  assert.ok(md.includes("Revenue\\_fell by 2× in Q3 \\[draft\\] \\`code\\`"), "body text is escaped, not interpreted");
  assert.equal(R.speak("30% & *x* <y> 2×"), "30 percent and x y 2");
});
