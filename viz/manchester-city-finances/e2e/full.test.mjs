// What Manchester City's charges and accounts do and do not show: the fuller
// section-28 checks. Lane buttons (aria-pressed) filter the timeline; every
// item is a focusable mark (role=button) that opens its scope and source in
// the detail panel; the lane and item shown download as a beamdswitch deck.
// It has no URL state, history, palette, reset, JSON or Markdown export.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, exportedMarkdown, fullSuite, saved } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const detailTitle = (page) => page.locator("#detail h2").textContent();
/** @param {import("playwright").Page} page */
const items = (page) => page.locator("#chart [role=button]");
/** @param {import("playwright").Page} page @param {string} lane */
const lane = (page, lane) => page.locator("#controls button", { hasText: lane });

await fullSuite("manchester-city-finances", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const all = await items(s.page).count();
      await lane(s.page, "Filed accounts").focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await lane(s.page, "Filed accounts").getAttribute("aria-pressed"), "true", "Enter on a lane selects it");
      assert.ok(await items(s.page).count() < all, "the timeline keeps only that lane");
      const first = items(s.page).first();
      await first.focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await detailTitle(s.page), await first.getAttribute("aria-label"), "Enter on a mark opens it in the detail panel");
      await items(s.page).last().focus();
      await s.page.keyboard.press(" ");
      assert.equal(await detailTitle(s.page), await items(s.page).last().getAttribute("aria-label"), "Space opens a mark too");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: a Markdown export of the lane and item shown, separate from the beamdswitch deck.
  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await lane(s.page, "Filed accounts").click();
      const label = /** @type {string} */ (await items(s.page).last().getAttribute("aria-label"));
      await items(s.page).last().click();
      const text = await exportedMarkdown(s.page);
      assert.ok(text.includes(label), "the export carries the selected item");
      assert.match(text, /Filed accounts/, "the export carries the lane shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await lane(s.page, "Filed accounts").click();
      const label = /** @type {string} */ (await items(s.page).last().getAttribute("aria-label"));
      await items(s.page).last().click();
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "manchester-city-finances-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.ok(file.text.includes(`## Selected: ${label}`), "the selected item leads the results");
      assert.ok(!file.text.includes("## 6 alleged periods"), "a lane filter leaves the other lanes' slides out");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await lane(page, "Separate UEFA case").click();
    await items(page).first().click();
  }),
});
