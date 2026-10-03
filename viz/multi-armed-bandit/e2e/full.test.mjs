// Multi-armed Bandit: the fuller section-28 checks. Three tabs (experiment,
// simulation, next week's hours) moved by the arrow keys; the experiment and
// the hours plan autosave; Reset and an import ask before replacing an edited
// experiment; JSON, the hours plan in Markdown and a beamdswitch deck download.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const firstSuccesses = (page) => page.locator("#vt-body input[id^='s-']").first();
/** @param {import("playwright").Page} page */
const firstTrials = (page) => page.locator("#vt-body input[id^='n-']").first();
/** @param {import("playwright").Page} page @param {string} id */
const selected = (page, id) => page.locator(`#${id}`).getAttribute("aria-selected");
/** @param {import("playwright").Page} page @param {RegExp} text */
const status = (page, text) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById("store-status")?.textContent ?? ""), text.source);

/**
 * Confirm the replace prompt when the experiment has edits; nothing to do otherwise.
 * @param {import("playwright").Page} page
 */
async function confirmIfAsked(page) {
  const prompt = page.locator("#confirm");
  await page.waitForTimeout(100);
  if (await prompt.isVisible()) await page.locator("#confirm-yes").click();
}

await fullSuite("multi-armed-bandit", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#tab-exp").focus();
      await s.page.keyboard.press("ArrowRight");
      assert.equal(await selected(s.page, "tab-sim"), "true", "ArrowRight selects the next tab");
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "tab-sim", "and moves focus with it");
      assert.ok(await s.page.locator("#panel-sim").isVisible(), "the simulation panel shows");
      await s.page.keyboard.press("End");
      assert.equal(await selected(s.page, "tab-hrs"), "true", "End selects the last tab");
      await s.page.keyboard.press("Home");
      assert.equal(await selected(s.page, "tab-exp"), "true", "Home selects the first tab");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const trials = await firstTrials(s.page).inputValue();
      await s.page.locator("#ts-select").click();
      await s.page.locator("#btn-success").click();
      await s.page.waitForFunction(() => /\d/.test(document.getElementById("record-status")?.textContent ?? ""));
      await s.page.locator("#reset").click();
      await s.page.locator("#confirm").waitFor({ state: "visible" });
      await s.page.locator("#confirm-yes").click();
      await status(s.page, /^Reset to the website conversions example\./);
      assert.equal(await firstTrials(s.page).inputValue(), trials, "Reset restores the example's counts");
      assert.equal(await s.page.locator("#template").inputValue(), "website");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    try {
      await firstSuccesses(s.page).fill("20");
      await firstSuccesses(s.page).press("Tab");
      const file = await saved(s.page, () => s.page.locator("#export-json").click());
      assert.equal(file.name, "multi-armed-bandit-experiment.json");
      await s.page.locator("#reset").click();
      await confirmIfAsked(s.page);
      await status(s.page, /^Reset/);
      assert.notEqual(await firstSuccesses(s.page).inputValue(), "20", "Reset changed the experiment");
      await s.page.locator("#import-json").setInputFiles({ name: file.name, mimeType: "application/json", buffer: Buffer.from(file.text) });
      await confirmIfAsked(s.page);
      await status(s.page, /^Imported multi-armed-bandit-experiment\.json/);
      assert.equal(await firstSuccesses(s.page).inputValue(), "20", "the import restores the counts");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#tab-hrs").click();
      await s.page.locator("#h-example").click();
      await s.page.locator("#h-hours").fill("12");
      await s.page.locator("#h-hours").press("Tab");
      const file = await saved(s.page, () => s.page.locator("#h-save-md").click());
      assert.equal(file.name, "multi-armed-bandit-hours-plan.md");
      assert.match(file.text, /^# /m, "the plan is a Markdown document");
      assert.match(file.text, /\b12\b/, "the plan carries the hours on the page");
      assert.match(file.text, /Mathematics/, "the plan names the example's activities");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "multi-armed-bandit-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#tab-sim").click();
    await page.locator("#sim-step").click();
  }),
});
