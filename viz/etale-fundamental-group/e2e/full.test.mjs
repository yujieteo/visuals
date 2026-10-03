// Étale fundamental group: the fuller section-28 checks. The laboratory's
// views answer to g, c, f and a; Cmd/Ctrl+K opens the command palette; the
// presentation steps with the arrow keys and closes with Escape; the only
// export is the beamdswitch deck, under the "Export a narrated talk" disclosure.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/**
 * @param {import("playwright").Page} page
 * @param {string} view
 */
const viewPressed = (page, view) => page.locator(`#view-seg [data-view=${view}]`).getAttribute("aria-pressed");
/** @param {import("playwright").Page} page */
const blur = (page) => page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());

await fullSuite("etale-fundamental-group", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await blur(s.page);
      await s.page.keyboard.press("f");
      assert.equal(await viewPressed(s.page, "fibre"), "true", "f shows the fibre view");
      await s.page.keyboard.press("g");
      assert.equal(await viewPressed(s.page, "geometry"), "true", "g shows the geometry view");
      await s.page.locator("#open-present").click();
      await s.page.locator("#present").waitFor({ state: "visible" });
      const first = await s.page.locator("#present").innerText();
      await s.page.keyboard.press("ArrowRight");
      await s.page.waitForFunction((t) => /** @type {HTMLElement} */ (document.querySelector("#present")).innerText !== t, first);
      await s.page.keyboard.press("Escape");
      await s.page.locator("#present").waitFor({ state: "hidden" });
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
      await s.page.locator("#palette-input").fill("show fibre");
      await s.page.keyboard.press("Enter");
      assert.equal(await s.page.locator("#palette").isVisible(), false, "choosing a command closes the palette");
      assert.equal(await viewPressed(s.page, "fibre"), "true", "the command shows the fibre view");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#exp-h").click();
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "etale-fundamental-group-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": () => assert.fail("no Markdown export of the laboratory's state (object, view and sliders); its only Markdown export is the beamdswitch deck"),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#mono-play").click();
  }),
});
