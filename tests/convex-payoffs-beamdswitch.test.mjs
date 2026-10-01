import test from "node:test";
import assert from "node:assert/strict";
import { assertInlined, assertStandardDeck, assertTemplateCopy, load, openPage, read } from "./finance-beamdswitch-checks.mjs";

const SLUG = "convex-payoffs";
const html = read(`viz/${SLUG}/index.html`);
const { Beamdswitch, ConvexReport } = load(read(`viz/${SLUG}/beamdswitch.js`), read(`viz/${SLUG}/report.js`));
const DATA = JSON.parse(read(`data/${SLUG}/raw.json`)), META = JSON.parse(read(`data/${SLUG}/meta.json`));
const IDS = DATA.map((q) => q.id);
const strip = (s) => s.replace(/<[^>]+>/g, "");

// The page's data as its deck reads it, taken from a run of the page itself.
const page0 = openPage(SLUG, { ".cell": IDS.map((id) => ({ id })) });
const PAGE = JSON.parse(JSON.stringify(page0.run("PAGE")));
const deckFor = (id) => Beamdswitch.deck(ConvexReport.report(PAGE, { id }));

test("the site's beamdswitch template is the copy the page inlines, with its report", () => {
  assertTemplateCopy(SLUG);
  assertInlined(html, "beamdswitch", read(`viz/${SLUG}/beamdswitch.js`), SLUG);
  assertInlined(html, "report", read(`viz/${SLUG}/report.js`), SLUG);
});

test("the deck's words are the page's: its quadrants, message, caveat and research basis", () => {
  // Every row the deck reads is the committed data, and every sentence it quotes is on the page.
  assert.deepEqual(PAGE.rows.map((r) => r[0]), IDS);
  for (const q of DATA) {
    const row = PAGE.rows.find((r) => r[0] === q.id);
    assert.deepEqual(row, [q.id, q.label, q.action, q.test, q.why, q.verdict, q.examples]);
  }
  for (const text of [PAGE.lede, PAGE.message, PAGE.caveat, ...PAGE.sources.flatMap((s) => [s.cite, s.text])]) assert.ok(strip(html).includes(text), text);
  assert.deepEqual(PAGE.sources.map((s) => s.url), META.sources.map((s) => s.url));
  assert.equal(PAGE.fetched, META.fetched);
  for (const id of IDS) {
    const { cost, change } = ConvexReport.axes(id);
    assert.ok(html.includes(`data-id="${id}" aria-pressed="${id === "reversible-upside"}"><span class="kicker">${cost} · ${change}</span>`), id);
  }
});

test("every quadrant's deck parses in beamdswitch as the standard template, narrated on every slide", () => {
  for (const q of DATA) {
    const md = deckFor(q.id), deck = assertStandardDeck(md, q.id);
    assert.equal(deck.meta.title, "Find a convex 15-minute bet");
    assert.ok(md.includes(`## ${q.label}: ${q.verdict}`), q.id);
    for (const e of q.examples) assert.ok(md.includes(`- ${e}`), `${q.id}: ${e}`);
    assert.match(md, new RegExp(`::: key\\n${PAGE.message.replace(/[.]/g, "\\.")}\\n:::`), q.id);
  }
});

test("the beamdswitch button saves, and Copy deck copies, the deck of the quadrant shown", async () => {
  const page = openPage(SLUG, { ".cell": IDS.map((id) => ({ id })) });
  let out = await page.exportDeck();
  assert.deepEqual([out.name, out.text, out.copied], [`${SLUG}-beamdswitch.md`, deckFor("reversible-upside"), deckFor("reversible-upside")]);
  for (const id of ["costly-flat", "reversible-flat", "costly-upside"]) {
    await page.click(page.pick(".cell", "id", id));
    out = await page.exportDeck();
    assert.deepEqual([out.text, out.copied], [deckFor(id), deckFor(id)], id);
    assert.equal(out.status, `Saved ${SLUG}-beamdswitch.md: open it in beamdswitch.`);
  }
  assert.doesNotMatch(html, /if the download does not arrive|as saving is blocked/);
});
