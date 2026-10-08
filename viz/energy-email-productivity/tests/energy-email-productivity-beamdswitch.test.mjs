import test from "node:test";
import assert from "node:assert/strict";
import { assertButtonsExport, assertStandardDeck, openPage, read, require } from "./beamdswitch-decks.mjs";

const SLUG = "energy-email-productivity";
const T = require(`../beamdswitch.js`);
const R = require(`../report.js`);
const DATA = require(`../raw.json`);
const META = require(`../meta.json`);
const html = read(`index.html`);
const ORDER = JSON.parse(/,order=(\[[^\]]*\])/.exec(html)[1]);
const deckFor = (selected = null) => T.deck(R.report(DATA, { order: ORDER, selected, start: 8, end: 18, fetched: META.fetched }));
const VIEWS = [null, ...ORDER];

test("the beamdswitch button saves, and Copy deck copies, the deck of the page as shown", async () => {
  await assertButtonsExport(await openPage(SLUG), SLUG, deckFor());
  const page = await openPage(SLUG);
  page.run('show(byId["batch-3x"])');
  await assertButtonsExport(page, SLUG, deckFor("batch-3x"));
});

test("every view's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const v of VIEWS) {
    const deck = assertStandardDeck(deckFor(v), `selected=${v}`);
    assert.equal(deck.meta.title, "Your energy dips mid-afternoon. Your inbox doesn't.");
  }
});

test("each finding, number and citation is the page's own record, numbered as the page numbers it", () => {
  for (const v of VIEWS) {
    const md = deckFor(v);
    ORDER.forEach((id, i) => {
      const r = DATA.find((x) => x.id === id);
      assert.ok(md.includes(`${i + 1} · ${r.label}`), `${v}: point ${i + 1}`);
      assert.ok(md.includes(r.finding), `${v}: ${id} finding`);
      assert.ok(md.includes(`${r.study} ${r.venue} [Open source](${r.source_url})`), `${v}: ${id} citation`);
      if (r.value) assert.ok(md.includes(`**${r.value}**`), `${v}: ${id} value`);
    });
    const measured = DATA.filter((r) => r.role === "measured").length;
    assert.ok(md.includes(`## 6 numbered points: ${measured} measured, ${DATA.length - measured} behind the curve`), String(v));
    assert.ok(md.includes(`date: Sources retrieved ${META.fetched}`), String(v));
  }
});

test("a selected point leads the results, and the deck ends on the page's own takeaway", () => {
  for (const v of ORDER) {
    const md = deckFor(v), i = ORDER.indexOf(v), r = DATA.find((x) => x.id === v);
    assert.match(md, new RegExp(`# Results\\n\\n::: narration\\nPart 3\\. Results\\.\\n:::\\n\\n## Selected: ${i + 1} · `), v);
    assert.equal(md.split(`## ${i + 1} · ${r.label}`).length - 1, 0, `${v} appears once, as the selected point`);
  }
  assert.ok(html.includes(R.PITFALLS), "the takeaway is the page's default detail text");
  assert.match(deckFor(), /::: key\nPitfall one: your energy follows a circadian rhythm/);
});
