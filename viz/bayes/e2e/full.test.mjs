// Bayes: the fuller section-28 checks. The canonical example: a 26.5%
// starting estimate ("probably not") with evidence 70% likely if true and 20%
// if false updates to ≈56%. Sliders step by 10 with Shift+Arrow, the scenario
// persists in localStorage across a reload, Reset asks before discarding it,
// and the beamdswitch button (under “Export a talk”) saves a narrated deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const after = (page) => page.locator("#r-after").innerText();

await fullSuite("bayes", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      assert.equal(await after(s.page), "≈56%", "the opening example updates 27% to ≈56%");
      const range = s.page.locator("#a-range");
      await range.focus();
      const start = Number(await range.inputValue());
      await s.page.keyboard.press("Shift+ArrowRight");
      assert.equal(Number(await range.inputValue()), Math.min(100, start + 10), "Shift+Right steps the slider by 10");
      assert.equal(await s.page.locator("#a-num").inputValue(), String(Math.min(100, start + 10)), "the number field follows");
      await s.page.keyboard.press("ArrowLeft");
      assert.equal(Number(await range.inputValue()), Math.min(100, start + 10) - 1, "Left steps it by 1");
      assert.notEqual(await after(s.page), "≈56%", "the posterior follows the evidence");
      // A phrase typed and confirmed with Enter is read from the calibration data.
      await s.page.locator("#prior-phrase").fill("likely");
      await s.page.locator("#prior-phrase").press("Enter");
      assert.match(await s.page.locator("#prior-basis").innerText(), /70%/, "Enter reads “likely” as its 70% survey median");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#hyp").fill("The bus is late.");
      await s.page.locator("#b-num").fill("5");
      await s.page.locator("#b-num").press("Tab");
      const changed = await after(s.page);
      assert.notEqual(changed, "≈56%");
      // The scenario persists across a reload.
      await s.page.reload();
      assert.equal(await s.page.locator("#hyp").inputValue(), "The bus is late.", "the hypothesis persists across a reload");
      assert.equal(await after(s.page), changed, "and so does the result");
      // Reset asks first, then restores the first example and forgets the saved scenario.
      await s.page.locator("#reset").click();
      await s.page.locator("#confirm").waitFor({ state: "visible" });
      await s.page.locator("#confirm-yes").click();
      assert.equal(await after(s.page), "≈56%", "Reset restores the opening example");
      await s.page.reload();
      assert.equal(await after(s.page), "≈56%", "and the reset survives a reload");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#hyp").fill("The bus will arrive within 10 minutes.");
      await s.page.getByText("Export a talk", { exact: true }).click();
      const deck = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(deck.name, "bayes-beamdswitch.md");
      assertBeamdswitchDeck(deck.text);
      assert.match(deck.text, /^title: "?Bayesian update: The bus will arrive within 10 minutes\./m, "the deck is about the hypothesis as set");
      assert.match(deck.text, /≈27% → ≈56%/, "and carries the update the page shows");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: Copy Markdown of the session itself, distinct from the presentation deck.
  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#hyp").fill("The bus will arrive within 10 minutes.");
      await s.page.getByText("Export a talk", { exact: true }).click();
      const copy = s.page.getByRole("button", { name: /copy markdown/i });
      assert.equal(await copy.count(), 1, "the page offers Copy Markdown of its session");
      await s.page.evaluate(() => {
        const w = /** @type {any} */ (window);
        w.__copied = [];
        navigator.clipboard.writeText = async (t) => { w.__copied.push(t); };
      });
      await copy.click();
      const text = await s.page.evaluate(() => /** @type {any} */ (window).__copied.at(-1));
      assert.match(String(text ?? ""), /^#/m, "the copied session is Markdown");
      assert.ok(String(text).includes("The bus will arrive within 10 minutes."), "the copied Markdown carries the hypothesis as set");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#a-range").fill("90");
    await page.locator('[data-act="xpick"][data-ph="almost certainly not"]').click();
  }),
});
