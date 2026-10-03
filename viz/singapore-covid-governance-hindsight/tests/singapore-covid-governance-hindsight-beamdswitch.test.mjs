import assert from "node:assert/strict";
import test from "node:test";
import { assertButtonsExport, assertDeckButtons, assertInlined, assertStandardDeck, assertTemplateCopy, load, openPage, read } from "./beamdswitch-decks.mjs";

const SLUG = "singapore-covid-governance-hindsight";
const T = load(`beamdswitch.js`);
const R = load(`report.js`);
const csv = read(`raw.csv`);
const fetched = JSON.parse(read(`meta.json`)).fetched;
const html = read(`index.html`);
const rows = JSON.parse(/const rows=(\[.*?\]),state=/.exec(html)[1].replace(/<\\\//g, "</"));
const D = { rows, fetched };

// Every filter, with each analysis selected and with none.
const VIEWS = Object.keys(R.FILTERS).flatMap((filter) => [null, ...rows.map((r) => r.id)].map((selectedId) => ({ filter, selectedId })));
const what = (v) => `${v.filter} selected=${v.selectedId}`;

test("the site's shared beamdswitch template is the copy the page inlines", () => {
  assertTemplateCopy(SLUG);
  assertInlined(html, "beamdswitch", read(`beamdswitch.js`), SLUG);
  assertInlined(html, "report", read(`report.js`), SLUG);
  assertDeckButtons(html, SLUG);
  assert.ok(html.includes(`<p class="method">${R.METHOD}</p>`), "the deck's method is the page's");
  assert.ok(html.includes(`<h1>${R.HEADLINE}</h1>`), "the deck's takeaway is the page's headline");
});

test("the beamdswitch button saves, and Copy deck copies, the deck of the filter and analysis shown", async () => {
  const page = await openPage();
  page.run('state.filter="policy overlap";state.selectedId="digital-trust";render()');
  // The selection is not in the filter, so the page falls back to the first match, as the deck does.
  assert.equal(page.run("state.selectedId"), "job-security");
  await assertButtonsExport(page, SLUG, T.deck(R.report(D, { filter: "policy overlap", selectedId: "job-security" })));
});

test("every view's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const v of VIEWS) {
    const deck = assertStandardDeck(T.deck(R.report(D, v)), what(v));
    assert.equal(deck.meta.title, "What did 2020 Singapore analyses say?", what(v));
  }
});

test("the deck states each shown pair as the data file records it", () => {
  // Check against the committed CSV, not the page's embedded copy.
  assert.equal(csv.trim().split("\n").length, rows.length + 1);
  for (const v of VIEWS) {
    const md = T.deck(R.report(D, v)), shown = rows.filter((r) => v.filter === "all" || r.evidence_class === v.filter);
    for (const r of rows) {
      assert.ok(md.includes(`| ${r.analyst} | ${r.published} | ${r.kind} | ${r.evidence_class} |`), `${what(v)}: ${r.id} in the data table`);
      assert.ok(csv.includes(r.published) && csv.includes(r.outcome_date), r.id);
      assert.equal(md.includes(`## ${r.analyst}, ${r.published}: ${r.evidence_class}`), shown.includes(r), `${what(v)}: ${r.id} frame`);
    }
    for (const r of shown) assert.ok(md.includes(`- Later record, ${r.outcome_date}: `) && md.includes(`(${r.outcome_source_url})`), `${what(v)}: ${r.id}`);
    const first = shown.find((r) => r.id === v.selectedId) || shown[0];
    assert.match(md, new RegExp(`# Results\\n\\n::: narration\\nPart 3\\. Results\\.\\n:::\\n\\n## ${first.analyst}, `), `${what(v)}: the selected pair leads`);
    assert.ok(md.includes(`## The classes add up: 1 + 1 + 1 + 1 = 4 pairs`), what(v));
    assert.ok(md.includes(`- Shown on the page: ${shown.length} of 4 analyses (filter: ${R.FILTERS[v.filter]}).`), what(v));
  }
});

test("narration reads the money and percentages aloud", () => {
  const md = T.deck(R.report(D, { filter: "all" }));
  assert.ok(md.includes("up to 6,000 Singapore dollars over six months"));
  assert.ok(md.includes("from 14.9 percent of GDP in 2019 to 18.6 percent in 2024"));
  assert.ok(md.includes("up to S\\$6,000"), "the slide keeps the page's S$ amount, escaped");
});
