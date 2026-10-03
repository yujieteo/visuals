import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const require = createRequire(import.meta.url);
const T = require("../beamdswitch.js");
const R = require("../report.js");
const D = require("../raw.json");

// Every window, with no band and each band highlighted, with no ball and a few balls opened.
const VIEWS = D.windows.flatMap((w) => [null, ...D.bands.map((b) => b.id)].flatMap((band) =>
  [null, 1, 7, 49].map((open) => ({ window: w.id, band, open }))));
const deckFor = (view) => T.deck(R.report(D, view));
const what = (v) => `${v.window} band=${v.band} ball=${v.open}`;

test("the site's shared beamdswitch template is the copy the TOTO page inlines", () => {
  assertTemplateCopy("toto-frequency");
  const html = read("index.html");
  assertInlined(html, "beamdswitch", read("beamdswitch.js"), "toto-frequency");
  assertInlined(html, "report", read("report.js"), "toto-frequency");
});

test("the beamdswitch button saves, and Copy deck copies, the deck of the window shown", async () => {
  const page = await openPage("toto-frequency"), band = D.bands[1];
  await page.press((c) => c.text.startsWith("Last 1 year"));
  await page.press((c) => c.attr("title") === `${R.bandText(band)} times`);
  await page.press((c) => c.attr("data-ball") === "7");
  await assertButtonsExport(page, "toto-frequency", deckFor({ window: "1y", sort: "number", band: band.id, open: 7 }));
});

test("every view's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const v of VIEWS) {
    const deck = assertStandardDeck(deckFor(v), what(v));
    const w = D.windows.find((x) => x.id === v.window);
    assert.equal(deck.meta.title, `TOTO ball frequency: the last ${w.label}`, what(v));
  }
});

test("the deck's counts are recounted from the published draws, in the page's digits", () => {
  for (const v of VIEWS) {
    const md = deckFor(v), w = D.windows.find((x) => x.id === v.window), latest = D.draws[0].date;
    // Recount from the draws themselves, not from the dataset's per-ball counts.
    const inside = D.draws.filter((d) => d.date > w.after);
    assert.equal(inside.length, w.draws, what(v));
    const count = new Map(D.balls.map((b) => [b.number, 0]));
    for (const d of inside) for (const n of d.winning) count.set(n, count.get(n) + 1);
    const most = Math.max(...count.values()), best = [...count].filter(([, c]) => c === most).map(([n]) => n);
    assert.match(md, new RegExp(`^## Drawn most: balls? ${best.join(", ")}, ${most} times? each$`, "m"), what(v));
    const zero = [...count.values()].filter((c) => c === 0).length;
    assert.ok(md.includes(`- Balls not drawn at all in this window: ${zero}.`), what(v));
    const total = [...count.values()].reduce((s, c) => s + c, 0);
    assert.equal(total, 6 * w.draws, what(v));
    assert.ok(md.includes(`## The counts add up: ${total} = 6 × ${w.draws} draws`), what(v));
    assert.ok(md.includes(`\\frac{6 \\times ${w.draws}}{49} \\approx ${(6 * w.draws / 49).toFixed(1)}`), what(v));
    assert.ok(md.includes(`to draw ${D.draws[0].draw_no} (${R.fmtDate(latest)})`), what(v));
    // The top rows of the ranked table: rank, ball and count as the page's count table shows them.
    for (const r of R.ranked(D, w.id).filter((x) => x.rank <= 5)) {
      assert.equal(r.count, count.get(r.ball.number), what(v));
      assert.ok(md.includes(`| ${r.rank} | ${r.ball.number} | ${r.count} |`), `${what(v)}: ball ${r.ball.number}`);
    }
    if (v.open) {
      assert.ok(md.includes(`## Ball ${v.open}: drawn ${count.get(v.open)} time`), what(v));
    }
    if (v.band) {
      const b = D.bands.find((x) => x.id === v.band);
      const n = [...count.values()].filter((c) => c >= b.min && (b.max == null || c <= b.max)).length;
      assert.ok(md.includes(`## Highlighted: ${n} ball${n === 1 ? "" : "s"} drawn`), what(v));
    }
  }
});

test("the deck keeps the page's warning that past draws do not predict future ones", () => {
  for (const v of VIEWS) assert.match(deckFor(v), /::: key\n[^\n]*Past counts do not predict future draws\.\n:::/, what(v));
});
