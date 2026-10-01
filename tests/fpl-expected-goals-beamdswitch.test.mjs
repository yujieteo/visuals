import test from "node:test";
import assert from "node:assert/strict";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read, require } from "./beamdswitch-decks.mjs";

const SLUG = "fpl-expected-goals";
const T = require(`../viz/${SLUG}/beamdswitch.js`);
const R = require(`../viz/${SLUG}/report.js`);
const META = require(`../data/${SLUG}/meta.json`);
const html = read(`viz/${SLUG}/index.html`);
const ROWS = JSON.parse(/const rows=(\[.*?\]);\n/.exec(html)[1]);
const FILTERS = ["all", "DEF", "MID", "FWD"];
const deckFor = (filter = "all") => T.deck(R.report(ROWS, { filter, fetched: META.fetched, gameweek: "5 of 2026/27", source: META.source_url }));

test("the site's shared beamdswitch template is the copy the FPL page inlines", () => {
  assertTemplateCopy(SLUG);
  assertInlined(html, "beamdswitch", read(`viz/${SLUG}/beamdswitch.js`), SLUG);
  assertInlined(html, "report", read(`viz/${SLUG}/report.js`), SLUG);
});

test("the beamdswitch button saves, and Copy deck copies, the deck of the position shown", async () => {
  await assertButtonsExport(await openPage(SLUG), SLUG, deckFor());
  const page = await openPage(SLUG);
  page.run("filter='FWD'");
  await assertButtonsExport(page, SLUG, deckFor("FWD"));
});

test("the page's position buttons set the filter the deck reads", () => {
  for (const f of FILTERS) assert.ok(html.includes(`data-pos="${f}"`), f);
  assert.ok(html.includes("filter=b.dataset.pos") && html.includes("FplReport.report(rows,{filter,"));
  assert.ok(html.includes(`Fetched ${META.fetched}. Gameweek 5 of the 2026/27 season.`), "the deck's fetch date and gameweek are the page's");
});

test("every position's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const f of FILTERS) {
    const deck = assertStandardDeck(deckFor(f), f);
    assert.equal(deck.meta.title, "How much of the early FPL points are repeatable?", f);
  }
});

test("the deck's players, bands and totals are recounted from the page's rows, in the tooltip's digits", () => {
  for (const f of FILTERS) {
    const md = deckFor(f), shown = ROWS.filter((r) => f === "all" || r.p === f);
    // The page colours a point red above +0.25, blue below -0.25, grey otherwise.
    const g = (r) => r.gi - r.xgi;
    const ahead = shown.filter((r) => g(r) > 0.25).length, behind = shown.filter((r) => g(r) < -0.25).length;
    assert.ok(md.includes(`## ${ahead} ahead of expected, ${behind} behind, ${shown.length - ahead - behind} on the line`), f);
    assert.ok(html.includes("g>0.25?'over':(g<-0.25?'under':'even')"), "the page's colour rule");
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
