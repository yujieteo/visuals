// Social Values Survey: the fuller section-28 checks. Each point of the
// dumbbell chart is a focusable button that shows its mean, weighted sample
// and top-box share; the beamdswitch button saves the chart as a narrated deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

await fullSuite("social-values-surveydata", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      assert.equal(await s.page.locator("#tip").isVisible(), false);
      const marks = s.page.locator("#chart .mark");
      assert.ok(await marks.count() >= 14, "two points for each of seven age groups");
      await marks.first().focus();
      await s.page.locator("#tip").waitFor({ state: "visible" });
      const first = await s.page.locator("#tip").textContent();
      await s.page.keyboard.press("Tab");
      await s.page.waitForFunction((t) => document.getElementById("tip")?.textContent !== t, first);
      assert.match(await s.page.locator("#tip").textContent() ?? "", /\d\.\d\d/, "Tab moves to the next point and shows its mean");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "social-values-surveydata-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#chart .mark").first().focus();
  }),
});
