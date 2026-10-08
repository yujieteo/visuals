import test from "node:test";
import assert from "node:assert/strict";
import { assertButtonsExport, assertStandardDeck, openPage, read, require } from "./beamdswitch-decks.mjs";

const SLUG = "fpl-expected-goals";
const T = require(`../beamdswitch.js`);
const R = require(`../report.js`);
const META = require(`../meta.json`);
const html = read(`index.html`);
const ROWS = JSON.parse(/const rows=(\[.*?\]);\n/.exec(html)[1]);
const FILTERS = ["all", "DEF", "MID", "FWD"];
const deckFor = (filter = "all") => T.deck(R.report(ROWS, { filter, fetched: META.fetched, gameweek: "5 of 2026/27", source: META.source_url }));

test("the beamdswitch button saves, and Copy deck copies, the deck of the position shown", async () => {
  await assertButtonsExport(await openPage(SLUG), SLUG, deckFor());
  const page = await openPage(SLUG);
  page.run("filter='FWD'");
  await assertButtonsExport(page, SLUG, deckFor("FWD"));
});

test("the page's position buttons set the filter the deck reads", async () => {
  for (const f of FILTERS) {
    const page = await openPage(SLUG);
    await page.press((c) => c.attr("data-pos") === f);
    await assertButtonsExport(page, SLUG, deckFor(f));
  }
  assert.ok(html.includes(`Fetched ${META.fetched}. Gameweek 5 of the 2026/27 season.`), "the deck's fetch date and gameweek are the page's");
});

test("every position's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const f of FILTERS) {
    const deck = assertStandardDeck(deckFor(f), f);
    assert.equal(deck.meta.title, "How much of the early FPL points are repeatable?", f);
  }
});

test("the deck's bands are the colours the page draws each player's point in", async () => {
  for (const f of FILTERS) {
    const page = await openPage(SLUG);
    await page.press((c) => c.attr("data-pos") === f);
    const points = page.run("document.getElementById('chart')").children.filter((c) => c.localName === "circle");
    const shown = ROWS.filter((r) => f === "all" || r.p === f);
    assert.equal(points.length, shown.length, f);
    const colour = { over: "ahead", under: "behind", even: "even" };
    for (const r of shown) {
      const point = points.find((c) => c.getAttribute("aria-label").startsWith(`${page.run("esc")(r.n)}, ${r.t}, `));
      assert.equal(R.band(r), colour[point.getAttribute("class").replace(/^pt /, "")], `${f}: ${r.n}`);
    }
  }
});

test("the deck's players, bands and totals are recounted from the page's rows, in the tooltip's digits", () => {
  for (const f of FILTERS) {
    const md = deckFor(f), shown = ROWS.filter((r) => f === "all" || r.p === f);
    // The page colours a point red above +0.25, blue below -0.25, grey otherwise.
    const g = (r) => r.gi - r.xgi;
    const ahead = shown.filter((r) => g(r) > 0.25).length, behind = shown.filter((r) => g(r) < -0.25).length;
    assert.ok(md.includes(`## ${ahead} ahead of expected, ${behind} behind, ${shown.length - ahead - behind} on the line`), f);
    const byGap = [...shown].sort((a, b) => g(b) - g(a));
    for (const r of [...byGap.slice(0, 5), ...byGap.slice(-5)]) {
      // As the tooltip writes them: GI, xGI to 2 places, the signed gap, cost to 1 place, points, minutes.
      const gap = (g(r) > 0 ? "+" : "") + g(r).toFixed(2);
      assert.ok(md.includes(`| ${r.n} | ${r.t} | ${r.p} | ${r.gi} | ${r.xgi.toFixed(2)} | ${gap} | £${r.c.toFixed(1)}m | ${r.pts} | ${r.m} |`), `${f}: ${r.n}`);
    }
    const gi = shown.reduce((s, r) => s + r.gi, 0), xgi = shown.reduce((s, r) => s + r.xgi, 0);
    assert.ok(md.includes(`## The gaps add up: ${gi} goal involvements against ${xgi.toFixed(2)} expected`), f);
    assert.match(md, /::: key\n[^\n]*This is descriptive information, not advice\.\n:::/, f);
  }
});

test("the page's one metadata record agrees with meta.json, the footer and the deck", async () => {
  const page = await openPage(SLUG);
  const meta = page.run("META");
  assert.equal(meta.source, META.source_url);
  assert.equal(meta.fetched, META.fetched);
  assert.ok(html.includes(`Fetched ${meta.fetched}. Gameweek ${meta.gameweek.replace(" of ", " of the ")} season.`), "footer");
  await page.click("save-beamdswitch");
  assert.equal(page.saved[0].text, deckFor());
});
