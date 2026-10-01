import assert from "node:assert/strict";
import test from "node:test";
import { assertButtonsExport, assertDeckButtons, assertInlined, assertStandardDeck, assertTemplateCopy, load, openPage, read } from "./singapore-beamdswitch.mjs";

const SLUG = "graduate-employment-survey";
const T = load(`viz/${SLUG}/beamdswitch.js`);
const R = load(`viz/${SLUG}/report.js`);
const meta = JSON.parse(read(`data/${SLUG}/meta.json`));
const html = read(`viz/${SLUG}/index.html`);
const rows = JSON.parse(/const rows=(\[\[.*?\]\]),medians=/.exec(html)[1].replace(/<\\\//g, "</"));
const medians = JSON.parse(/,medians=(\[\[.*?\]\]),svg=/.exec(html)[1]);
const md = T.deck(R.report({ rows, medians, source: meta.source, fetched: meta.fetched }));

test("the site's shared beamdswitch template is the copy the page inlines", () => {
  assertTemplateCopy(SLUG);
  assertInlined(html, "beamdswitch", read(`viz/${SLUG}/beamdswitch.js`), SLUG);
  assertInlined(html, "report", read(`viz/${SLUG}/report.js`), SLUG);
  assertDeckButtons(html, SLUG);
});

test("the beamdswitch button saves, and Copy deck copies, the chart's deck", async () => {
  await assertButtonsExport(await openPage(SLUG), SLUG, md);
});

test("the deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  const deck = assertStandardDeck(md, SLUG);
  assert.equal(deck.meta.title, "The computing salary premium widened");
});

// The premiums, recomputed from the committed survey CSV rather than the page's embedded rows.
function fromSource() {
  const lines = read(`data/${SLUG}/raw.csv`).replace(/^﻿/, "").trim().split(/\r?\n/);
  const split = (line) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"')).slice(0, 12);
  const head = split(lines[0]), records = lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
  const salary = (r) => (r.gross_monthly_median === "" || !Number.isFinite(+r.gross_monthly_median) ? null : +r.gross_monthly_median);
  const kept = records.filter((r) => salary(r) !== null), years = [...new Set(kept.map((r) => +r.year))].sort((a, b) => a - b);
  const base = Object.fromEntries(years.map((y) => [y, R.median(kept.filter((r) => +r.year === y).map(salary))]));
  const points = kept.map((r) => ({ year: +r.year, university: r.university, degree: r.degree, salary: salary(r), premium: (salary(r) / base[r.year] - 1) * 100, computing: /computing/i.test(r.degree) }));
  return { years, points, computingMedian: years.map((y) => [y, R.median(points.filter((p) => p.year === y && p.computing).map((p) => p.premium))]) };
}

test("every number in the deck is the survey's, in the chart's digits", () => {
  const { years, points, computingMedian } = fromSource();
  assert.equal(points.length, rows.length);
  assert.ok(md.includes(`## The data: ${points.length} degree salaries from ${years[0]} to ${years.at(-1)}`));
  assert.ok(md.includes(`- ${points.filter((p) => p.computing).length} of them are degrees whose name contains the word "computing".`));
  for (const [y, p] of computingMedian) {
    const all = points.filter((x) => x.year === y), comp = all.filter((x) => x.computing);
    assert.ok(md.includes(`| ${y} | ${R.pct(p)} | ${comp.length} | ${all.length} |`), `${y}`);
    assert.ok(md.includes(`| ${y} | +0.0% |`), `${y} is centred on its median`);
  }
  // The page's headline numbers.
  assert.ok(md.includes("## Computing titles moved from -0.6% in 2013 to +36.4% in 2024"));
  const top = points.filter((p) => p.year === 2024 && p.computing).sort((a, b) => b.premium - a.premium).slice(0, 5);
  for (const p of top) assert.ok(md.includes(`| ${p.degree} | ${p.university} | ${R.dollars(p.salary).replace("$", "\\$")} | ${R.pct(p.premium)} |`), p.degree);
});
