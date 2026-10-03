// From Packets to Playback: the fuller section-28 checks. One calculator with
// no URL state: number fields with sliders, radio pills for the coarse labels
// and a Reset button; Show why unfolds the derivation; the decision downloads
// as a narrated beamdswitch deck.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const recommendation = (page) => page.locator("#rec-sub").textContent();
/** @param {import("playwright").Page} page @param {string | null} not */
const recommendationChanged = (page, not) => page.waitForFunction((n) => document.getElementById("rec-sub")?.textContent !== n, not);
/** @param {import("playwright").Page} page */
const variability = (page) => page.locator("input[name=variability]:checked").getAttribute("value");
/**
 * The Markdown the page exports of its own state, saved as a file or copied:
 * the first button or link named for Markdown or .md that is not the
 * beamdswitch deck.
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
async function markdownExport(page) {
  const name = /^(?!.*(deck|beamdswitch)).*(markdown|\.md\b)/i;
  const control = page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();
  assert.ok(await control.count() > 0, "the page offers a Markdown export of its state, separate from the beamdswitch deck");
  await page.evaluate(() => {
    if (navigator.clipboard) navigator.clipboard.writeText = async (text) => { /** @type {Window & { e2eCopied?: string }} */ (window).e2eCopied = text; };
  });
  const download = page.waitForEvent("download", { timeout: 10_000 }).then(async (d) => readFile(await d.path(), "utf8"));
  const copied = page.waitForFunction(() => /** @type {Window & { e2eCopied?: string }} */ (window).e2eCopied, null, { timeout: 10_000 })
    .then((h) => /** @type {Promise<string>} */ (h.jsonValue()));
  await control.click();
  const text = await Promise.any([download, copied]).catch(() => assert.fail("the Markdown export neither saved a file nor copied text"));
  assert.match(text, /^#{1,3} \S/m, "the export is Markdown with a heading");
  return text;
}

await fullSuite("packets-to-playback", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const start = await variability(s.page), before = await recommendation(s.page);
      await s.page.locator("input[name=variability]:checked").focus();
      await s.page.keyboard.press("ArrowRight");
      await s.page.waitForFunction((v) => document.querySelector("input[name=variability]:checked")?.getAttribute("value") !== v, start);
      assert.equal(await variability(s.page), "high", "ArrowRight moves the variability pill from moderate to high");
      await recommendationChanged(s.page, before);
      await s.page.keyboard.press("ArrowLeft");
      await s.page.waitForFunction((v) => document.querySelector("input[name=variability]:checked")?.getAttribute("value") === v, start);
      assert.equal(await recommendation(s.page), before, "ArrowLeft returns to the original decision");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const buffer = await s.page.locator("#in-buffer").inputValue(), before = await recommendation(s.page);
      await s.page.locator("#in-buffer").fill("0.5");
      await s.page.locator("#in-buffer").press("Enter");
      await recommendationChanged(s.page, before);
      await s.page.locator("[data-act=reset]").click();
      await s.page.waitForFunction((b) => /** @type {HTMLInputElement} */ (document.getElementById("in-buffer")).value === b, buffer);
      assert.equal(await recommendation(s.page), before, "Reset restores the default decision");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: a Markdown export of the visual's own state, separate from the beamdswitch deck.
  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      const before = await recommendation(s.page);
      await s.page.locator("#in-buffer").fill("0.5");
      await s.page.locator("#in-buffer").press("Enter");
      await recommendationChanged(s.page, before);
      const shown = /** @type {string} */ (await recommendation(s.page)).trim();
      const text = await markdownExport(s.page);
      assert.ok(text.includes(shown), "the export carries the recommendation shown");
      assert.match(text, /\b0\.5\b/, "the export carries the buffer entered");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      if (!(await s.page.locator("#save-beamdswitch").isVisible())) {
        if (!(await s.page.getByText("Export a talk", { exact: true }).isVisible())) await s.page.locator("#show-why").click();
        await s.page.getByText("Export a talk", { exact: true }).click();
      }
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "packets-to-playback-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /Recommended: /, "the deck carries the page's recommendation");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#show-why").click();
    await page.locator("#in-buffer").fill("3");
    await page.locator("#in-buffer").press("Enter");
  }),
});
