import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { assertButtonsExport, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const require = createRequire(import.meta.url);
const T = require("../beamdswitch.js");
const A = require("../engine.js");
const D = require("../raw.json");

// No filter, each value of each filter, with and without historical evidence, a search, and a
// search that matches nothing.
const KEYS = ["category", "subsidiser", "depth", "stage"];
const VIEWS = [false, true].flatMap((includeHistorical) => [
  {}, { q: "grab" }, { q: "no such product" }, { q: "$", category: "cloud" },
  ...KEYS.flatMap((key) => Object.keys(D.vocabulary[key]).map((id) => ({ [key]: id }))),
].map((f) => ({ ...f, includeHistorical: includeHistorical || f.stage === "historical" })));
const deckFor = (filters) => T.deck(A.report(D, filters));
const what = (f) => JSON.stringify(f);

test("the site's shared beamdswitch template is the copy the Subsidy Atlas page inlines", () => {
  assertTemplateCopy("subsidy-atlas");
  const html = read("index.html");
  assert.ok(html.includes(`<script id="beamdswitch">\n${read("beamdswitch.js")}</script>`), "the page inlines beamdswitch.js unchanged");
  assert.ok(html.includes(`<script>${read("engine.js")}</script>`), "the page inlines engine.js unchanged");
});

test("the beamdswitch button saves, and Copy deck copies, the deck of the records the filters show", async () => {
  const page = await openPage("subsidy-atlas");
  page.run(`const f = document.getElementById("filters").elements; f.namedItem("q").value = "grab"; f.namedItem("includeHistorical").checked = true;`);
  await assertButtonsExport(page, "subsidy-atlas", deckFor({ q: "grab", category: "", subsidiser: "", depth: "", stage: "", includeHistorical: true }));
});

test("every filter's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const f of VIEWS) assertStandardDeck(deckFor(f), what(f));
});

test("the deck holds exactly the records the catalogue shows, with their sourced claims and counts", () => {
  for (const f of VIEWS) {
    const md = deckFor(f), entries = A.filterEntries(D, f);
    const current = entries.filter((e) => e.stage !== "historical").length;
    assert.ok(md.includes(`subtitle: ${entries.length} of ${D.entries.length} records · ${current} current programmes / reported incentives`), what(f));
    const cards = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]).filter((t) => D.entries.some((e) => t === `${e.name}: ${e.metric}`));
    assert.deepEqual(cards, entries.map((e) => `${e.name}: ${e.metric}`), what(f));
    for (const e of entries) {
      // Claims are the dataset's own text, and every source the card cites is linked.
      for (const key of ["evidence", "duration", "caution"]) {
        assert.ok(md.includes(e[key].text.replace(/[\\$*_`|<>[\]]/g, "\\$&")), `${what(f)}: ${e.id} ${key}`);
        for (const id of e[key].sources) assert.ok(md.includes(`](${D.sources[id].url}) (${D.sources[id].published || "undated; accessed " + D.sources[id].accessed})`), `${what(f)}: ${id}`);
      }
    }
    // The matrix: each lifecycle row counts the records in each depth band, as the overview does.
    const cells = A.matrix(D, A.filterEntries(D, { ...f, depth: "", stage: "" }));
    for (const stage of Object.keys(D.vocabulary.stage)) {
      const row = `| ${D.vocabulary.stage[stage]} | ${Object.keys(D.vocabulary.depth).map((depth) => cells.find((c) => c.stage === stage && c.depth === depth).ids.length || "—").join(" | ")} |`;
      assert.equal(md.includes(row), stage !== "historical" || !!f.includeHistorical, `${what(f)}: ${row}`);
    }
    if (!entries.length) assert.match(md, /^## No matches$/m, what(f));
  }
});

test("prices are written so beamdswitch shows them as text, not maths, and narrates them as words", () => {
  const md = deckFor({ includeHistorical: true });
  assert.ok(md.includes("US\\$100 at signup"), "dollar signs in claims are escaped");
  // beamdswitch's inline-maths rule in its Markdown renderer: $...$ with no space inside the delimiters and no digit after.
  const inline = /(?<!\\)\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/;
  for (const line of md.split("\n")) if (!/^\$\$/.test(line)) assert.doesNotMatch(line, inline, `no inline maths: ${line}`);
  assert.ok(md.includes("1.268 billion US dollars consumer incentives, FY2025."), "US$1.268B is read as words");
  assert.ok(md.includes("capped at 7,500 Singapore dollars"), "S$7,500 is read as words");
});
