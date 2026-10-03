// Convex payoffs: the fuller section-28 checks. Four pressed-state quadrant
// buttons choose which payoff shape #detail explains, and the beamdswitch and
// Copy deck buttons export a narrated deck of the quadrant shown. The page
// keeps no state in the URL and has no palette or Reset.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

const QUADRANTS = ["reversible-upside", "reversible-flat", "costly-upside", "costly-flat"];
/**
 * @param {import("playwright").Page} page
 * @param {string} id
 */
const cell = (page, id) => page.locator(`button.cell[data-id="${id}"]`);
/** @param {import("playwright").Page} page */
const pressed = (page) => page.locator('button.cell[aria-pressed="true"]').getAttribute("data-id");

await fullSuite("convex-payoffs", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      assert.equal(await pressed(s.page), "reversible-upside", "the page opens on the reversible, upside quadrant");
      const seen = new Set();
      for (const id of QUADRANTS.slice(1)) {
        await cell(s.page, id).focus();
        await s.page.keyboard.press("Enter");
        assert.equal(await pressed(s.page), id, `Enter on ${id} selects it, and only it`);
        seen.add(await s.page.locator("#detail").innerText());
      }
      assert.equal(seen.size, 3, "each quadrant explains itself differently");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const first = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(first.name, "convex-payoffs-beamdswitch.md");
      assertBeamdswitchDeck(first.text);
      assert.match(await s.page.locator("#deck-status").innerText(), /^Saved convex-payoffs-beamdswitch\.md/);
      await cell(s.page, "costly-flat").click();
      const other = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assertBeamdswitchDeck(other.text);
      assert.notEqual(other.text, first.text, "the deck follows the quadrant shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await cell(page, "costly-upside").click();
  }),
});
