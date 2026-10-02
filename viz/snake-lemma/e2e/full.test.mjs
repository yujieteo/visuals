// Snake Lemma: the fuller section-28 checks. Every view has a stable hash
// route (#proof/lift, #example/integer?lifts=2, #exact/coker-alpha); the
// arrow keys step the guided proof; Cmd/Ctrl+K opens the command palette;
// Export writes a beamdswitch deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const blur = (page) => page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
/**
 * @param {import("playwright").Page} page
 * @param {string} hash
 */
const at = (page, hash) => page.waitForFunction((h) => location.hash === h, hash);

await fullSuite("snake-lemma", {
  "url-state": async ({ open }) => {
    const s = await open("#example/integer?lifts=2");
    try {
      assert.equal(await s.page.locator("[data-mode=example]").getAttribute("aria-pressed"), "true", "the link opens the example");
      assert.equal(await s.page.locator("#btn-fewer").isDisabled(), false, "the link restores the second lift");
      await s.page.locator("[data-mode=exact]").click();
      await s.page.waitForFunction(() => location.hash.startsWith("#exact"));
      assert.equal(await s.page.locator("[data-mode=exact]").getAttribute("aria-pressed"), "true");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("[data-mode=example]").click();
      await at(s.page, "#example/integer");
      await s.page.locator("[data-mode=exact]").click();
      await s.page.waitForFunction(() => location.hash.startsWith("#exact"));
      await s.page.goBack();
      await at(s.page, "#example/integer");
      assert.equal(await s.page.locator("[data-mode=example]").getAttribute("aria-pressed"), "true", "Back restores the example view");
      await s.page.goForward();
      await s.page.waitForFunction(() => location.hash.startsWith("#exact"));
      assert.equal(await s.page.locator("[data-mode=exact]").getAttribute("aria-pressed"), "true", "Forward restores the exactness view");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await blur(s.page);
      await s.page.keyboard.press("ArrowRight");
      await at(s.page, "#proof/lift");
      await s.page.keyboard.press("ArrowRight");
      await at(s.page, "#proof/down");
      await s.page.keyboard.press("ArrowLeft");
      await at(s.page, "#proof/lift");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open();
    try {
      await s.page.keyboard.press("ControlOrMeta+k");
      await s.page.locator("#palette").waitFor({ state: "visible" });
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "palette-input", "the palette focuses its search field");
      await s.page.keyboard.type("Exactness at coker");
      await s.page.keyboard.press("Enter");
      await at(s.page, "#exact/coker-alpha");
      assert.equal(await s.page.locator("#palette").isVisible(), false, "choosing a command closes the palette");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open("#example/integer");
    try {
      await s.page.locator("#btn-more").click();
      await at(s.page, "#example/integer?lifts=2");
      await s.page.getByRole("button", { name: "Reset lifts" }).click();
      await at(s.page, "#example/integer");
      assert.equal(await s.page.locator("#btn-fewer").isDisabled(), true, "Reset lifts returns to one lift");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#btn-export").click();
      await s.page.locator("#export").waitFor({ state: "visible" });
      const shown = await s.page.locator("#export-text").inputValue();
      assertBeamdswitchDeck(shown);
      const file = await saved(s.page, () => s.page.locator("#btn-download-md").click());
      assert.match(file.name, /\.md$/);
      assert.equal(file.text, shown, "the saved deck is the deck shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await blur(page);
    await page.keyboard.press("ArrowRight");
    await at(page, "#proof/lift");
  }),
});
