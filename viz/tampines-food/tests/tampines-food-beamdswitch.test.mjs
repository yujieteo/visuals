import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { assertButtonsExport, assertInlined, assertStandardDeck, assertTemplateCopy, openPage, read } from "./data-visuals-beamdswitch.mjs";

const require = createRequire(import.meta.url);
const T = require("../beamdswitch.js");
const R = require("../report.js");
const D = require("../raw.json");

// Every cuisine and mall filter (including combinations with no places), both chart orders, and an
// opened bar for an estimated dish and for a dish that is not estimable.
const estimated = D.outlets.find((o) => R.kcalOf(o) != null), unknown = D.outlets.find((o) => R.kcalOf(o) == null);
const VIEWS = [null, ...D.cuisines.map((c) => c.id)].flatMap((cuisine) => [null, ...D.malls.map((m) => m.id)].flatMap((mall) =>
  ["energy", "rank"].flatMap((sort) => [null, estimated.id, unknown.id].map((open) => ({ cuisine, mall, sort, open })))));
const deckFor = (view) => T.deck(R.report(D, view));
const what = (v) => `cuisine=${v.cuisine} mall=${v.mall} sort=${v.sort} open=${v.open}`;
const shownIn = (v) => D.outlets.filter((o) => (!v.cuisine || o.cuisine === v.cuisine) && (!v.mall || o.mall === v.mall));

test("the site's shared beamdswitch template is the copy the Tampines food page inlines", () => {
  assertTemplateCopy("tampines-food");
  const html = read("index.html");
  assertInlined(html, "beamdswitch", read("beamdswitch.js"), "tampines-food");
  assertInlined(html, "report", read("report.js"), "tampines-food");
});

test("the beamdswitch button saves, and Copy deck copies, the deck of the places filtered", async () => {
  const page = await openPage("tampines-food"), cuisine = estimated.cuisine;
  await page.press((c) => c.attr("data-key") === `cuisine:${cuisine}`);
  await assertButtonsExport(page, "tampines-food", deckFor({ cuisine, mall: null, sort: "energy", open: null }));
});

test("every filter's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  assert.ok(VIEWS.some((v) => shownIn(v).length === 0), "an empty selection is covered");
  for (const v of VIEWS) assertStandardDeck(deckFor(v), what(v));
});

test("the deck's places, ranks and calories are the dataset's, in the page's digits", () => {
  for (const v of VIEWS) {
    const md = deckFor(v), shown = shownIn(v);
    assert.ok(md.includes(`## The list: ${shown.length} of ${D.outlets.length} places`), what(v));
    // The ranked table: rank, publishers and calories as the page's list shows them.
    for (const o of shown.slice(0, 10)) {
      const kcal = o.nutrition.energy_kcal, cal = R.kcalOf(o) == null ? "not estimable" : `≈${kcal} kcal`;
      assert.ok(new RegExp(`^\\| ${o.rank} \\| [^\\n]* \\| ${o.publishers} \\| ${cal} \\|$`, "m").test(md), `${what(v)}: #${o.rank}`);
    }
    if (shown.length) assert.ok(md.includes(`## Most recommended: #${shown[0].rank} ${shown[0].name}, ${shown[0].publishers} publisher`), what(v));
    // The calorie table carries each dish's energy and grams, highest energy first unless sorted by rank.
    const est = shown.filter((o) => R.kcalOf(o) != null);
    const order = [...est].sort(v.sort === "rank" ? (a, b) => a.rank - b.rank : (a, b) => R.kcalOf(b) - R.kcalOf(a) || a.rank - b.rank);
    for (const o of order.slice(0, 8)) {
      const n = o.nutrition;
      assert.ok(md.includes(` | ${n.energy_kcal} | ${n.carbohydrate_g} | ${n.protein_g} | ${n.fat_g} |`), `${what(v)}: ${o.dish}`);
    }
    if (est.length && v.sort !== "rank") {
      const top = order[0];
      assert.ok(md.includes(`energy runs from ${Math.min(...est.map(R.kcalOf))} to ${top.nutrition.energy_kcal} kilocalories`) || est.length === 1, what(v));
    }
    const missing = shown.filter((o) => R.kcalOf(o) == null);
    if (missing.length) assert.ok(md.includes(`## Not estimable: ${missing.length} dish`), what(v));
    // An opened bar adds its macronutrient split; a dish that is not estimable has no bar to open.
    const opened = shown.find((o) => o.id === v.open && R.kcalOf(o) != null);
    if (opened) for (const k of ["carbohydrate", "protein", "fat"]) assert.ok(md.includes(` | ${opened.nutrition[k + "_g"]} | ${opened.nutrition.kcal_from[k]} |`), what(v));
    // Directory checks are counted from the dataset.
    const listed = shown.filter((o) => o.presence.checked_by !== "guides").length;
    assert.ok(md.includes(`## Still there: ${listed} found in a mall directory, ${shown.length - listed} dated by the guides`), what(v));
  }
});
