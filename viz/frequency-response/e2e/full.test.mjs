// Frequency-Response Visualiser: the fuller section-28 checks. The page has
// tabs (arrow keys move between them), a loop-gain field, JSON export and
// import of its inputs and a Markdown report; it keeps no state in the URL and
// has no Reset control or command palette, which are recorded as findings.
import assert from "node:assert/strict";
import { assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/**
 * Set the loop gain K and wait for the analysis to follow it.
 * @param {import("playwright").Page} page
 * @param {string} k
 */
async function setGain(page, k) {
  await page.locator("#in-K").fill(k);
  await page.locator("#in-K").dispatchEvent("change");
  await page.waitForFunction((v) => /** @type {HTMLInputElement} */ (document.getElementById("in-K")).value === v, k);
}

/** @param {import("playwright").Page} page */
const systemText = (page) => page.locator("#sys-stats").innerText();

await fullSuite("frequency-response", {
  "url-state": async ({ open }) => {
    const s = await open();
    try {
      const before = s.page.url();
      await s.page.locator("#set-domain").selectOption("discrete");
      assert.notEqual(s.page.url(), before, "choosing discrete time records the state in the URL (spec section 12)");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#tab-bode").click();
      await s.page.locator("#tab-nyq").click();
      const here = s.page.url();
      await s.page.goBack();
      assert.equal(s.page.url().split("#")[0].split("?")[0], here.split("#")[0].split("?")[0], "Back stays in the visual and steps back through its states (spec section 12)");
      assert.equal(await s.page.locator("#tab-bode").getAttribute("aria-selected"), "true", "Back returns to the Bode tab");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#tab-system").focus();
      await s.page.keyboard.press("ArrowRight");
      assert.equal(await s.page.locator("#tab-bode").getAttribute("aria-selected"), "true", "ArrowRight moves to the Bode tab");
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "tab-bode", "focus follows the selected tab");
      await s.page.keyboard.press("ArrowLeft");
      assert.equal(await s.page.locator("#tab-system").getAttribute("aria-selected"), "true", "ArrowLeft moves back");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open();
    try {
      await s.page.keyboard.press("ControlOrMeta+k");
      assert.ok(await s.page.getByRole("dialog").isVisible().catch(() => false), "Cmd/Ctrl+K opens a command palette (spec section 11)");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const initial = await systemText(s.page);
      await setGain(s.page, "6");
      assert.notEqual(await systemText(s.page), initial, "changing K changes the results");
      const resetButton = s.page.getByRole("button", { name: /^reset/i });
      assert.ok(await resetButton.count() > 0, "the page has a Reset control (spec section 28)");
      await resetButton.first().click();
      assert.equal(await systemText(s.page), initial, "Reset restores the default example");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    let exported;
    try {
      await setGain(s.page, "4.5");
      await s.page.locator("#set-domain").selectOption("discrete");
      await s.page.locator("#tab-report").click();
      exported = await saved(s.page, () => s.page.locator("[data-export=inputs]").click());
      assert.equal(exported.name, "frequency-response-inputs.json");
      const json = JSON.parse(exported.text);
      assert.equal(json.inputs.K, 4.5, "the export holds the edited gain");
      assert.equal(json.inputs.timeDomain, "discrete", "the export holds the time domain");
      assertClean(s);
    } finally {
      await s.close();
    }
    const t = await open();
    try {
      await t.page.locator("#tab-report").click();
      await t.page.locator("#import-text").fill(exported.text);
      await t.page.locator("#import-go").click();
      await t.page.locator("#tab-system").click();
      assert.equal(await t.page.locator("#in-K").inputValue(), "4.5", "importing restores the gain");
      assert.equal(await t.page.locator("#set-domain").inputValue(), "discrete", "importing restores the time domain");
      const again = await saved(t.page, async () => { await t.page.locator("#tab-report").click(); await t.page.locator("[data-export=inputs]").click(); });
      assert.deepEqual(JSON.parse(again.text).inputs, JSON.parse(exported.text).inputs, "export, import and export again gives the same inputs");
      assertClean(t);
    } finally {
      await t.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await setGain(s.page, "4.5");
      await s.page.locator("#tab-report").click();
      const file = await saved(s.page, () => s.page.locator("[data-export=md]").click());
      assert.equal(file.name, "frequency-response-report.md");
      assert.match(file.text, /^# Frequency-response report/m, "the report has its title");
      assert.match(file.text, /EXPLORATION ONLY/, "the report repeats the exploration-only disclaimer");
      assert.match(file.text, /^- Loop gain K: 4\.5$/m, "the report carries the edited loop gain");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#tab-bode").click();
  }),
});
