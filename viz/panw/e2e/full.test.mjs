// Palo Alto Networks cash conversion (panw): the fuller section-28 checks. A static
// fact page from SEC filings: two measure buttons (aria-pressed) redraw the
// chart, and the measure shown downloads as a narrated beamdswitch deck. It has
// no URL state, history, palette, reset or JSON export.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page @param {string} metric */
const pressed = (page, metric) => page.locator(`button[data-metric=${metric}]`).getAttribute("aria-pressed");
/** @param {import("playwright").Page} page */
const chart = (page) => page.locator("#chart").innerHTML();

await fullSuite("panw", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const before = await chart(s.page);
      await s.page.locator("button[data-metric=cash_margin]").focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await pressed(s.page, "cash_margin"), "true", "Enter on a measure selects it");
      assert.equal(await pressed(s.page, "revenue"), "false", "and releases the other");
      assert.notEqual(await chart(s.page), before, "the chart redraws for the measure");
      await s.page.locator("button[data-metric=revenue]").focus();
      await s.page.keyboard.press("Space");
      assert.equal(await pressed(s.page, "revenue"), "true", "Space on the other measure selects it");
      assert.equal(await chart(s.page), before, "and the first chart comes back");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("button[data-metric=cash_margin]").click();
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "panw-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      const results = file.text.slice(file.text.indexOf("Part 3. Results."));
      assert.match(results, /\n## Operating cash margin/, "the measure shown leads the results");
      assert.match(await s.page.locator("#deck-status").textContent() ?? "", /^Saved panw-beamdswitch\.md/);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("button[data-metric=cash_margin]").click();
  }),
});
