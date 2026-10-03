// Generating Functions Lab: the fuller section-28 checks. Lessons live in the
// URL fragment (#coin-change?n=15), modes push history, Cmd/Ctrl+K opens the
// command palette and the BeamMD Switch menu exports Markdown decks.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, output } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const heading = (page) => page.locator("main h1, main h2").first().textContent();
/** @param {import("playwright").Page} page */
const coefficient = async (page) => /\[x\^?(\d+)\]/.exec(await page.locator("main").innerText())?.[1];

await fullSuite("generating-functions", {
  "url-state": async ({ open }) => {
    const s = await open("#coin-change");
    try {
      await s.page.locator("#n-input").fill("15");
      await s.page.locator("#n-input").press("Tab");
      await s.page.waitForFunction(() => location.hash.includes("n=15"));
      const hash = await s.page.evaluate(() => location.hash);
      const restored = await open(hash);
      try {
        assert.equal(await heading(restored.page), "Coin change");
        assert.equal(await restored.page.locator("#n-input").inputValue(), "15", "the link restores n");
        assert.equal(await coefficient(restored.page), "15", "the restored state reads [x^15]");
        assertClean(restored);
      } finally {
        await restored.close();
      }
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open("#coin-change");
    try {
      await s.page.getByRole("button", { name: "Problems", exact: true }).first().click();
      await s.page.waitForFunction(() => location.hash === "#problems");
      await s.page.goBack();
      await s.page.waitForFunction(() => location.hash === "#coin-change");
      assert.equal(await heading(s.page), "Coin change", "Back returns to the lesson");
      await s.page.goForward();
      await s.page.waitForFunction(() => location.hash === "#problems");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open("#coin-change");
    try {
      await s.page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
      await s.page.keyboard.press("e");
      await assert.doesNotReject(s.page.locator("#beam-menu").waitFor({ state: "visible", timeout: 5_000 }), "E opens the export menu");
      await s.page.keyboard.press("Escape");
      await s.page.locator("#beam-menu").waitFor({ state: "hidden", timeout: 5_000 });
      await s.page.keyboard.press("p");
      await assert.doesNotReject(s.page.locator("#present, .present, [aria-label=Presentation]").first().waitFor({ state: "visible", timeout: 5_000 }), "P starts the presentation");
      await s.page.keyboard.press("Escape");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open("");
    try {
      await s.page.keyboard.press("ControlOrMeta+k");
      await s.page.locator("#palette").waitFor({ state: "visible", timeout: 5_000 });
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "pal-input", "the palette focuses its search field");
      await s.page.keyboard.type("dft");
      await s.page.keyboard.press("Enter");
      await s.page.waitForFunction(() => location.hash === "#fourier");
      assert.equal(await s.page.locator("#palette").isVisible(), false, "choosing a result closes the palette");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open("#coin-change?n=15");
    try {
      assert.equal(await coefficient(s.page), "15");
      await s.page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
      await s.page.keyboard.press("r");
      await s.page.waitForFunction(() => !location.hash.includes("n=15"));
      assert.equal(await s.page.locator("#n-input").inputValue(), "12", "R resets n to the lesson default");
      assert.equal(await coefficient(s.page), "12");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Spec section 14: Markdown of the session state, separate from the section 15 deck (beamdswitch-export).
  "markdown-export": async ({ open }) => {
    const s = await open("#coin-change?n=15");
    try {
      assert.equal(await coefficient(s.page), "15");
      await s.page.locator("#beam-btn").click();
      const copyMarkdown = s.page.getByRole("menuitem", { name: "Copy Markdown", exact: true });
      const text = await output(s.page, copyMarkdown);
      assert.match(text, /Coin change/i, "the Markdown is about the current lesson");
      assert.match(text, /\bn\b\s*[:=]\s*15\b/, "the Markdown carries the page's n");
      assert.doesNotMatch(text, /^::: narration$/m, "Copy Markdown copies the session state, not the beamdswitch deck (spec section 14)");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open("#coin-change");
    try {
      await s.page.locator("#beam-btn").click();
      await s.page.getByRole("menuitem", { name: "Export full core deck" }).click();
      await s.page.locator("#export").waitFor({ state: "visible" });
      assertBeamdswitchDeck(await s.page.locator("#export-text").inputValue());
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx, "#coin-change"),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
    await page.keyboard.press("ArrowRight");
  }, "#coin-change"),
});
