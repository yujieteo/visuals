import assert from "node:assert/strict";
import test from "node:test";
import { assertButtonsExport, assertDeckButtons, assertInlined, assertStandardDeck, assertTemplateCopy, load, openPage, read } from "./beamdswitch-decks.mjs";

const SLUG = "social-values-surveydata";
/** @type {BeamdswitchApi} */
const T = load(`beamdswitch.js`);
/** @type {typeof SocialValuesReport} */
const R = load(`report.js`);
const meta = JSON.parse(read(`meta.json`));
const html = read(`index.html`);
/** @param {RegExpExecArray | null} m a match the test needs */
const found = (m) => { assert.ok(m, "the pattern matches"); return m; };
/** @type {[string, number, number, number, number, number][]} */
const rows = JSON.parse(found(/,rows=(\[\[.*?\]\]),svg=/.exec(html))[1]);
const D = { rows, source_url: meta.source_url, fetched: meta.fetched };
const md = T.deck(R.report(D));

test("the site's shared beamdswitch template is the copy the page inlines", () => {
  assertTemplateCopy(SLUG);
  assertInlined(html, "beamdswitch", read(`beamdswitch.js`), SLUG);
  assertInlined(html, "report", read(`report.js`), SLUG);
  assertDeckButtons(html, SLUG);
  assert.ok(html.includes(`<h1>${R.HEADLINE}</h1>`), "the deck's takeaway is the page's headline");
  assert.ok(html.includes(R.CAVEAT), "the deck's caveat is the page's");
});

test("the beamdswitch button saves, and Copy deck copies, the chart's deck", async () => {
  await assertButtonsExport(await openPage(), SLUG, md);
});

test("the deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  const deck = assertStandardDeck(md, SLUG);
  assert.equal(deck.meta.title, "Connection rises as appetite to shape the future falls");
});

// The survey's weighted aggregates, recomputed from the committed respondent rows.
function aggregates() {
  const text = read(`raw.csv`).replace(/^﻿/, "");
  /** @type {string[][]} */
  const records = [];
  /** @type {string[]} */
  let record = [];
  let field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { record.push(field); field = ""; }
    else if (c === "\n") { record.push(field.replace(/\r$/, "")); records.push(record); record = []; field = ""; }
    else field += c;
  }
  if (field || record.length) { record.push(field); records.push(record); }
  const [head, ...body] = records, col = (/** @type {string} */ name) => head.indexOf(name);
  const score = (/** @type {string} */ v) => parseFloat(v.split(" ", 1)[0]);
  return rows.map(([group]) => {
    const g = body.filter((r) => r[col("age_2")].startsWith(group)), w = g.map((r) => +r[col("weight")]), n = w.reduce((s, x) => s + x, 0);
    const m = (/** @type {string} */ f) => g.reduce((s, r, i) => s + score(r[col(f)]) * w[i], 0) / n;
    const top = (/** @type {string} */ f) => g.reduce((s, r, i) => s + (score(r[col(f)]) >= 8 ? w[i] : 0), 0) / n;
    return /** @type {[string, number, number, number, number, number]} */ ([group, n, m("outcome_connection"), m("outcome_future"), top("outcome_connection"), top("outcome_future")]);
  });
}

test("every number in the deck is the survey's, in the chart's digits", () => {
  const fresh = aggregates();
  for (const [i, r] of fresh.entries()) {
    const age = r[0].replace("-", "–");
    assert.ok(md.includes(`| ${age} | ${r[1].toFixed(1)} |`), `${age} weighted respondents`);
    assert.ok(md.includes(`| ${age} | ${r[2].toFixed(2)} | ${(r[4] * 100).toFixed(1)}% |`), `${age} connection`);
    assert.ok(md.includes(`| ${age} | ${r[3].toFixed(2)} | ${(r[5] * 100).toFixed(1)}% |`), `${age} future`);
    assert.ok(md.includes(`| ${age} | ${r[2].toFixed(2)} | ${r[3].toFixed(2)} | ${(rows[i][2] - rows[i][3]).toFixed(2)} |`), `${age} gap`);
  }
  // The page's headline gaps.
  assert.ok(md.includes("## The gap grows from 0.09 points at ages 16–19 to 1.07 at 65–75"));
  assert.ok(md.includes("::: key\nOlder residents feel more connected, but less interested in shaping Singapore’s future. The gap grows from 0.09 points"));
  const total = fresh.reduce((s, r) => s + r[1], 0);
  const [, parts, sum] = found(/- Weighted respondents: ([\d. +]+) = ([\d.]+)\./.exec(md));
  const addends = parts.split(" + ");
  assert.deepEqual(addends, fresh.map((r) => r[1].toFixed(3)), "the check lists each group's weighted respondents");
  assert.equal(addends.reduce((s, x) => s + Math.round(+x * 1000), 0), Math.round(+sum * 1000), "the printed addends add up to the printed total");
  assert.equal((+sum).toFixed(1), total.toFixed(1), "the printed total is the survey's");
  assert.ok(md.includes(`## The 7 groups hold ${total.toFixed(1)} weighted respondents`));
});
