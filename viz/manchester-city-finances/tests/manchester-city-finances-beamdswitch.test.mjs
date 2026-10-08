import test from "node:test";
import assert from "node:assert/strict";
import { assertButtonsExport, assertStandardDeck, openPage, read, require } from "./beamdswitch-decks.mjs";

const SLUG = "manchester-city-finances";
const T = require(`../beamdswitch.js`);
const R = require(`../report.js`);
const META = require(`../meta.json`);
const html = read(`index.html`);
const ROWS = JSON.parse(/const rows=(\[.*?\]),svg=/.exec(html)[1]);
const LANES = [...new Set(ROWS.map((r) => r.lane))];
const deckFor = (active = "All", selected = null) => T.deck(R.report(ROWS, { active, selected, fetched: META.fetched }));
const VIEWS = ["All", ...LANES].flatMap((active) => [null, ...ROWS.map((r) => r.id)].map((selected) => ({ active, selected })));
const what = (v) => `${v.active} selected=${v.selected}`;

test("the beamdswitch button saves, and Copy deck copies, the deck of the lane and item shown", async () => {
  await assertButtonsExport(await openPage(SLUG), SLUG, deckFor());
  const page = await openPage(SLUG);
  await page.press((c) => c.text === "Filed accounts");
  page.run("show(rows.find(r=>r.id==='fy2025'))");
  await assertButtonsExport(page, SLUG, deckFor("Filed accounts", "fy2025"));
});

test("every view's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const v of VIEWS) {
    const deck = assertStandardDeck(deckFor(v.active, v.selected), what(v));
    assert.equal(deck.meta.title, "What Manchester City’s charges and accounts do and do not show", what(v));
  }
});

test("every date, amount and scope in the deck is the page's own row, amounts as the page writes them", async () => {
  const page = await openPage(SLUG), written = new Map();
  for (const r of ROWS.filter((x) => x.revenue_gbp_m)) {
    page.run(`show(rows.find(r=>r.id===${JSON.stringify(r.id)}))`);
    const amounts = page.run("detail").children[2].textContent.match(/£[^m]+m/g);
    assert.deepEqual(amounts, [`£${r.revenue_gbp_m}m`, `£${r.profit_gbp_m}m`], `${r.id}: the detail panel's amounts`);
    written.set(r.id, amounts);
  }
  for (const v of VIEWS) {
    const md = deckFor(v.active, v.selected);
    for (const r of ROWS) {
      const shown = v.active === "All" || r.lane === v.active;
      assert.equal(md.includes(r.detail), shown || r.id === "cas-2020", `${what(v)}: ${r.id} ${shown ? "shown" : "left out"}`);
      if (!shown) continue;
      assert.ok(md.includes(r.start === r.end ? r.start : `${r.start} to ${r.end}`), `${what(v)}: ${r.id} dates`);
      for (const amount of written.get(r.id) ?? []) assert.ok(md.includes(amount), `${what(v)}: ${r.id} ${amount}`);
    }
    assert.ok(md.includes(`date: Sources fetched ${META.fetched}`), what(v));
    assert.ok(html.includes(R.STATUS) && md.includes(R.STATUS), `${what(v)}: the page's status caveat`);
  }
});

test("a selected item in the lane shown leads the results, and the deck ends on the page's claim", () => {
  for (const v of VIEWS.filter((x) => x.selected)) {
    const r = ROWS.find((x) => x.id === v.selected), md = deckFor(v.active, v.selected);
    const leads = new RegExp(`Part 3\\. Results\\.\\n:::\\n\\n## Selected: ${r.label}`).test(md);
    assert.equal(leads, v.active === "All" || v.active === r.lane, what(v));
  }
  assert.ok(html.includes(R.CLAIM));
  assert.match(deckFor(), new RegExp(`::: key\\n${R.CLAIM.replace(/\./g, "\\.")}\\n:::`));
});

test("the set-up table and the periods slide span each lane from its earliest start to its latest end", () => {
  const md = deckFor();
  for (const lane of LANES) {
    const its = ROWS.filter((r) => r.lane === lane);
    const from = its.map((r) => r.start).reduce((a, b) => (a < b ? a : b)), to = its.map((r) => r.end).reduce((a, b) => (a > b ? a : b));
    assert.ok(md.includes(`| ${lane} | ${its.length} | ${from} to ${to} |`), `${lane}: set-up row`);
  }
  assert.match(md, /## 6 alleged periods, from 2009-07-01 to 2023-06-30\n/);
});
