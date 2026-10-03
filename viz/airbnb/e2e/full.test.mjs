// Airbnb cash conversion: the fuller section-28 checks. Two pressed-state
// buttons switch the bar chart between Revenue and Operating cash margin, and
// the beamdswitch and Copy deck buttons export a narrated deck of the measure
// shown. The page keeps no state in the URL and has no palette or Reset.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/**
 * @param {import("playwright").Page} page
 * @param {string} metric
 */
const metric = (page, metric) => page.locator(`button[data-metric="${metric}"]`);
/** @param {import("playwright").Page} page */
const chart = (page) => page.locator("#chart").innerHTML();

await fullSuite("airbnb", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const before = await chart(s.page);
      await metric(s.page, "cash_margin").focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await metric(s.page, "cash_margin").getAttribute("aria-pressed"), "true", "Enter on a measure selects it");
      assert.equal(await metric(s.page, "revenue").getAttribute("aria-pressed"), "false");
      assert.notEqual(await chart(s.page), before, "the chart redraws for the measure");
      await metric(s.page, "revenue").focus();
      await s.page.keyboard.press("Space");
      assert.equal(await metric(s.page, "revenue").getAttribute("aria-pressed"), "true", "Space selects it back");
      assert.equal(await chart(s.page), before, "and the chart returns to revenue");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const revenue = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(revenue.name, "airbnb-beamdswitch.md");
      assertBeamdswitchDeck(revenue.text);
      assert.match(await s.page.locator("#deck-status").innerText(), /^Saved airbnb-beamdswitch\.md/);
      await metric(s.page, "cash_margin").click();
      const margin = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assertBeamdswitchDeck(margin.text);
      assert.notEqual(margin.text, revenue.text, "the deck follows the measure shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await metric(page, "cash_margin").click();
  }),
});
