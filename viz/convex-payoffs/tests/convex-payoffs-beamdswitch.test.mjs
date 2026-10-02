import test from "node:test";
import assert from "node:assert/strict";
import { SLUG, assertBlockedSave, assertInlined, assertStandardDeck, assertTemplateCopy, load, openPage, read } from "./finance-beamdswitch-checks.mjs";

const html = read("index.html");
const { Beamdswitch, ConvexReport } = load(read("beamdswitch.js"), read("report.js"));
const DATA = JSON.parse(read("raw.json")), META = JSON.parse(read("meta.json"));
const IDS = DATA.map((q) => q.id);
const cells = () => ({ ".cell": IDS.map((id) => ({ id })) });
const strip = (s) => s.replace(/<[^>]+>/g, "");

// The page's data as its deck reads it, taken from a run of the page itself.
const page0 = openPage(cells());
const PAGE = JSON.parse(JSON.stringify(page0.run("PAGE")));
const deckFor = (id) => Beamdswitch.deck(ConvexReport.report(PAGE, { id }));

test("the site's beamdswitch template is the copy the page inlines, with its report", () => {
  assertTemplateCopy();
  assertInlined(html, "beamdswitch", read("beamdswitch.js"));
  assertInlined(html, "report", read("report.js"));
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
  const kickers = Object.fromEntries([...html.matchAll(/<button class="cell"[^>]*data-id="([\w-]+)"[^>]*><span class="kicker">([^<]+)<\/span>/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(kickers, Object.fromEntries(IDS.map((id) => { const { cost, change } = ConvexReport.axes(id); return [id, `${cost} · ${change}`]; })));
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
  const page = openPage(cells());
  let out = await page.exportDeck();
  assert.deepEqual([out.name, out.text, out.copied], [`${SLUG}-beamdswitch.md`, deckFor("reversible-upside"), deckFor("reversible-upside")]);
  for (const id of ["costly-flat", "reversible-flat", "costly-upside"]) {
    await page.click(page.pick(".cell", "id", id));
    out = await page.exportDeck();
    assert.deepEqual([out.text, out.copied], [deckFor(id), deckFor(id)], id);
    assert.equal(out.status, `Saved ${SLUG}-beamdswitch.md: open it in beamdswitch.`);
  }
});

test("a blocked download points to Copy deck without touching the clipboard", () => assertBlockedSave(cells()));
