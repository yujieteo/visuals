// How much of the early FPL points are repeatable?: the fuller section-28
// checks. A scatter of players with position filters and focusable points;
// the only export is the beamdswitch deck of the players shown.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const points = (page) => page.locator("#chart circle.pt").count();

await fullSuite("fpl-expected-goals", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const all = await points(s.page);
      const fwd = s.page.locator("button[data-pos=FWD]");
      await fwd.focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await fwd.getAttribute("aria-pressed"), "true", "Enter on Forwards filters the chart");
      assert.ok((await points(s.page)) < all, "the filter leaves fewer points");
      await s.page.locator("#chart circle.pt").first().focus();
      assert.equal(await s.page.locator("#tip").getAttribute("aria-hidden"), "false", "focusing a point opens its tooltip");
      assert.match(await s.page.locator("#tip").innerText(), /xGI \d+\.\d\d/);
      await s.page.keyboard.press("Tab");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const all = await points(s.page);
      await s.page.locator("button[data-pos=FWD]").click();
      assert.ok((await points(s.page)) < all, "the filter leaves fewer points");
      const reset = s.page.locator("button[data-pos=all]");
      await reset.click();
      assert.equal(await points(s.page), all, "All shows every point again");
      assert.equal(await reset.getAttribute("aria-pressed"), "true", "All is the pressed filter");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("button[data-pos=MID]").click();
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "fpl-expected-goals-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /Midfielders after Gameweek 5/, "the deck is of the position shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("button[data-pos=DEF]").click();
  }),
});
