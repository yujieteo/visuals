// What did 2020 Singapore analyses say?: the fuller section-28 checks. Filter
// buttons narrow the four evidence pairs, a row button selects a pair for the
// detail panel, and the beamdswitch button saves the view as a narrated deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const count = async (page) => (await page.locator("#count").textContent() ?? "").trim();

await fullSuite("singapore-covid-governance-hindsight", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      assert.equal(await count(s.page), "4 of 4 analyses shown");
      await s.page.locator("#rows .row").nth(1).focus();
      await s.page.keyboard.press("Space");
      await s.page.waitForFunction(() => document.querySelectorAll("#rows .row")[1]?.getAttribute("aria-current") === "true");
      await s.page.locator('#controls [data-filter="policy overlap"]').focus();
      await s.page.keyboard.press("Enter");
      await s.page.waitForFunction(() => !/^4 of/.test(document.getElementById("count")?.textContent ?? ""));
      assert.equal(await s.page.locator('#controls [data-filter="policy overlap"]').getAttribute("aria-pressed"), "true", "Enter on a filter applies it");
      assertClean(s);
    } finally {
      await s.close();
    }
  },


  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator('#controls [data-filter="direct later outcome"]').click();
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "singapore-covid-governance-hindsight-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /^subtitle: Direct outcome: 1 of 4 analyses$/m, "the deck is of the view as set");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator('#controls [data-filter="consistent trend"]').click();
  }),
});
