import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { assertButtonsExport, assertDeckButtons, assertInlined, assertStandardDeck, assertTemplateCopy, load, openPage, read } from "./beamdswitch-decks.mjs";

const SLUG = "tourist-attractions";
const T = load(`beamdswitch.js`);
const R = load(`report.js`);
const meta = JSON.parse(read(`meta.json`));

// The page inlines d3 7.9.0 (<script id="d3">). Its CSV parser and formatter run for real; every drawing call goes to
// a stand-in, as the stand-in DOM cannot lay out an SVG.
const realD3 = vm.runInContext(/<script id="d3">\n([\s\S]*?)<\/script>/.exec(read("index.html"))[1] + ";d3", vm.createContext({}));
// Every other d3 call returns the same chainable stand-in, as d3 selections and scales chain.
const chain = new Proxy(function () {}, {
  get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : key === Symbol.iterator ? [][Symbol.iterator].bind([]) : key === "then" ? undefined : chain),
  set: () => true,
  apply: () => chain,
  construct: () => chain,
});
// csvParse returns this realm's array, so the page's rows compare with plain arrays.
const csvParse = (text, row) => Array.from(realD3.csvParse(text, row));
const d3 = new Proxy({ csvParse, csvFormat: realD3.csvFormat }, { get: (t, k) => (k in t ? t[k] : chain) });
const page = await openPage(SLUG, { globals: { d3 }, skip: ["d3"] });
const html = page.html;
const D = { rows: page.run("rows"), terms: page.run("terms"), medianLon: page.run("medianLon"), medianLat: page.run("medianLat"), described: 106, source: meta.source, fetched: meta.fetched };

// No filter, each of a few words, a search, a search with a word, and each with and without a selected attraction.
const WORDS = [null, "museum", "heritage", D.terms.at(-1).term];
const VIEWS = WORDS.flatMap((term) => ["", "garden", "zzz-no-match"].flatMap((query) => [null, ...R.matches(D.rows, { term, query }).slice(0, 2).map((d) => d.id), "1001"].map((selection) => ({ term, query, selection }))));
const what = (v) => `term=${v.term} query=${v.query} selection=${v.selection}`;
const deckFor = (v) => T.deck(R.report(D, v));
// Deck text escapes the characters beamdswitch reads as maths or markup.
const esc = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]#]/g, "\\$&");

test("the site's shared beamdswitch template is the copy the page inlines", () => {
  assertTemplateCopy(SLUG);
  assertInlined(html, "beamdswitch", read(`beamdswitch.js`), SLUG);
  assertInlined(html, "report", read(`report.js`), SLUG);
  assertDeckButtons(html, SLUG);
});

test("the beamdswitch button saves, and Copy deck copies, the deck of the word, search and attraction shown", async () => {
  page.run('state.query="art";selectTerm("heritage")');
  const id = page.run("filteredRows()[0].id");
  page.run(`selectRow(${JSON.stringify(id)})`);
  assert.equal(page.run("state.selection"), id);
  await assertButtonsExport(page, SLUG, deckFor({ query: "art", term: "heritage", selection: id }));
});

test("every view's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const v of VIEWS) {
    const deck = assertStandardDeck(deckFor(v), what(v));
    assert.equal(deck.meta.title, "How Singapore attractions are marketed", what(v));
  }
});

test("the deck's counts are the page's, recounted from the committed GeoJSON", () => {
  const raw = JSON.parse(read(`raw.json`)), byId = new Map(raw.features.map((f) => [String(f.properties.OBJECTID_1), f]));
  assert.equal(D.rows.length, raw.features.length);
  for (const v of VIEWS) {
    const md = deckFor(v), visible = page.run(`filteredRows({text:${JSON.stringify(v.query)},marketing_term:${JSON.stringify(v.term ?? "")}})`);
    assert.deepEqual(R.matches(D.rows, v).map((d) => d.id), [...visible].map((d) => d.id), `${what(v)}: the page's filter`);
    const c = { NW: 0, NE: 0, SW: 0, SE: 0 };
    for (const d of visible) c[d.region]++;
    const regions = `NW ${c.NW}, NE ${c.NE}, SW ${c.SW}, SE ${c.SE}`;
    assert.ok(md.includes(`## ${visible.length} of ${raw.features.length} attractions shown${v.term ? ` for “${v.term}”` : ""}`), what(v));
    assert.ok(md.includes(v.term ? `${v.term} appears in ${visible.length} matching descriptions. ${regions}.` : `The full map shows ${visible.length} attractions. ${regions}.`), what(v));
    for (const [i, d] of [...visible].slice(0, 6).entries()) {
      assert.equal(byId.get(d.id).geometry.coordinates[0], d.longitude, `${what(v)}: ${d.id}`);
      assert.ok(md.includes(`\n${i + 1}. ${esc(d.title)} · ${esc(d.address) || "Address not provided"}\n`), `${what(v)}: ${d.id} listed ${i + 1}`);
    }
    // A beamdswitch slide fits six attractions; the rest are counted, not listed.
    assert.ok(!md.includes("\n7. "), `${what(v)}: at most six attractions on the slide`);
    assert.equal(md.includes(`And ${visible.length - 6} more on the page.`), visible.length > 6, what(v));
    const selected = visible.find((d) => d.id === v.selection);
    if (selected) assert.ok(md.includes(`- Coordinates: ${selected.latitude.toFixed(6)}, ${selected.longitude.toFixed(6)}`), what(v));
    else assert.ok(!md.includes("- Coordinates: "), `${what(v)}: no attraction frame unless one is selected and shown`);
  }
  // The page's documented word counts: museum in 14 descriptions (5, 6, 2, 1), heritage in 12.
  const museum = deckFor({ term: "museum" });
  assert.ok(museum.includes("| museum | 14 | 5 | 6 | 2 | 1 |"));
  assert.ok(museum.includes("## The quadrants add up: “museum” 5 + 6 + 2 + 1 = 14"));
  assert.ok(deckFor({}).includes("| heritage | 12 |"));
  // Tied words are named together, not ranked by spelling.
  const top = Math.max(...D.terms.map((t) => t.documents)), tied = D.terms.filter((t) => t.documents === top).map((t) => `“${t.term}”`);
  assert.ok(tied.length > 1 && deckFor({}).includes(`## Most frequent words: ${tied.slice(0, -1).join(", ")} and ${tied.at(-1)}, in ${top} of 106 descriptions each`));
});
