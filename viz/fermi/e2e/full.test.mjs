// Fermi estimator: the fuller section-28 checks. The estimate lives in the
// editor and in localStorage (no URL state); Reset restores the queue
// example; the estimate copies as Markdown and saves as a beamdswitch deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const best = (page) => page.locator("#best").innerText();
/**
 * Record clipboard writes in the page, so a copy can be read back in every browser.
 * @param {import("playwright").Page} page
 */
const recordClipboard = (page) => page.evaluate(() => {
  /** @type {string[]} */
  const copied = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (/** @type {string} */ t) => { copied.push(t); } } });
  Object.assign(window, { copiedTexts: copied });
});
/** @param {import("playwright").Page} page */
const copiedTexts = (page) => page.evaluate(() => /** @type {string[]} */ (/** @type {any} */ (window).copiedTexts));

await fullSuite("fermi", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      assert.equal(await best(s.page), "≈ 30 min", "the queue example estimates 30 minutes");
      await s.page.locator("#f0-best").focus();
      await s.page.keyboard.press("ControlOrMeta+a");
      await s.page.keyboard.type("24");
      await s.page.waitForFunction(() => document.querySelector("#best")?.textContent === "≈ 60 min");
      const chip = s.page.locator("[data-act=example][data-ex=travel]");
      await chip.focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await chip.getAttribute("aria-pressed"), "true", "Enter on an example chip loads it");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#f0-best").fill("24");
      await s.page.waitForFunction(() => document.querySelector("#best")?.textContent === "≈ 60 min");
      await s.page.locator("[data-act=reset]").click();
      assert.equal(await best(s.page), "≈ 30 min", "Reset restores the queue example");
      assert.match(await s.page.locator("#copy-status").innerText(), /Restored the restaurant queue example/);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await recordClipboard(s.page);
      await s.page.locator("#copy-md").click();
      await s.page.waitForFunction(() => /Copied the estimate as Markdown/.test(document.querySelector("#copy-status")?.textContent ?? ""));
      const [md] = await copiedTexts(s.page);
      assert.match(md, /^\*\*How long will this restaurant queue take\?\*\*/);
      assert.match(md, /```\n12 groups\n× 10 min\/cycle\n÷ 4 groups\/cycle\n≈ 30 min\n```/, "the Markdown carries the chain as the page shows it");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "fermi-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /Best estimate ≈ 30 min/);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("[data-act=add]").click();
  }),
});
