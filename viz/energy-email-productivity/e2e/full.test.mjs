// Your energy dips mid-afternoon. Your inbox doesn't.: the fuller section-28
// checks. Six numbered evidence points on a workday timeline open their
// finding in the detail panel by click, Enter or Space; Reset view (or
// Escape) returns to the default panel; the only export is the deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const detail = (page) => page.locator("#detail").innerText();
/** @param {import("playwright").Page} page */
const firstPoint = (page) => page.locator("#chart [role=button]").first();

await fullSuite("energy-email-productivity", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const initial = await detail(s.page);
      await firstPoint(s.page).focus();
      await s.page.keyboard.press("Enter");
      const opened = await detail(s.page);
      assert.notEqual(opened, initial, "Enter on a point opens its finding");
      assert.match(opened, /^1 · /, "the panel names the point's number");
      await s.page.keyboard.press("Escape");
      assert.equal(await detail(s.page), initial, "Escape returns to the default panel");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const initial = await detail(s.page);
      await s.page.locator("#chart [role=button]").nth(2).click();
      assert.notEqual(await detail(s.page), initial);
      await s.page.locator("#reset").click();
      assert.equal(await detail(s.page), initial, "Reset view returns to the default panel");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#chart [role=button]").nth(1).click();
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "energy-email-productivity-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /^## Selected: 2 · /m, "the deck leads with the selected point");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await firstPoint(page).click();
  }),
});
