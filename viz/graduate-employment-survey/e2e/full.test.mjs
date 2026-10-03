// Graduate Employment Survey: the fuller section-28 checks. The page is one
// fixed chart whose only interaction is reading a point: the dots form a roving
// tab stop that the arrow keys, Home and End move, each showing its source
// value. It has no editable state, so the URL, history, Reset, JSON and
// palette checks do not apply; the deck buttons save and copy a beamdswitch deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const tip = (page) => page.locator("#tip").innerText();

await fullSuite("graduate-employment-survey", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const first = s.page.locator("#chart [tabindex='0']").first();
      await first.focus();
      await s.page.locator("#tip").waitFor({ state: "visible" });
      const a = await tip(s.page);
      await s.page.keyboard.press("ArrowRight");
      const b = await tip(s.page);
      assert.notEqual(b, a, "ArrowRight moves to the next degree and shows its value");
      await s.page.keyboard.press("ArrowLeft");
      assert.equal(await tip(s.page), a, "ArrowLeft moves back");
      await s.page.keyboard.press("End");
      assert.notEqual(await tip(s.page), a, "End moves to the last degree");
      assert.equal(await s.page.locator("#chart [tabindex='0']").count(), 1, "exactly one dot is in the tab order");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.match(file.name, /\.md$/);
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /computing salary premium/i, "the deck is about the chart's claim");
      assert.match(file.text, /\+36\.4%/, "the deck carries the chart's headline number");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#chart [tabindex='0']").first().focus();
    await page.keyboard.press("ArrowRight");
  }),
});
