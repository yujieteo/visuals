// Queue time: the fuller section-28 checks. A phone-first estimator for a
// queue you are standing in: steppers and pace pills drive the estimate, the
// mode is remembered in localStorage, Reset restores the opening queue, and
// the beamdswitch button saves the estimate as a narrated deck. It keeps no
// URL state and has no command palette (see the manifest's skips).
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const head = (page) => page.locator("#q-head").textContent();
/**
 * @param {import("playwright").Page} page
 * @param {string} id
 * @param {string} value
 */
const valueIs = (page, id, value) => page.waitForFunction(([i, v]) => /** @type {HTMLInputElement} */ (document.getElementById(i))?.value === v, [id, value]);

await fullSuite("queue-time", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      assert.equal(await s.page.locator("#a-people").inputValue(), "8");
      const before = await head(s.page);
      await s.page.getByRole("button", { name: "One more person ahead" }).focus();
      await s.page.keyboard.press("Enter");
      await s.page.keyboard.press("Space");
      await valueIs(s.page, "a-people", "10");
      assert.notEqual(await head(s.page), before, "the estimate follows the keyboard");
      await s.page.locator("#a-people").focus();
      await s.page.keyboard.press("ArrowUp");
      await valueIs(s.page, "a-people", "11");
      await s.page.locator("input[name=a-pace][value=slow]").focus();
      await s.page.keyboard.press("Space");
      await s.page.waitForFunction(() => /** @type {HTMLInputElement} */ (document.querySelector("input[name=a-pace][value=slow]"))?.checked);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const opening = await head(s.page);
      await s.page.getByRole("button", { name: "One more counter" }).click();
      await valueIs(s.page, "a-counters", "3");
      await s.page.locator("#mode-food").click();
      await s.page.locator("#food-panel").waitFor({ state: "visible" });
      await s.page.getByRole("button", { name: "Reset", exact: true }).click();
      await s.page.locator("#queue-panel").waitFor({ state: "visible" });
      assert.equal(await s.page.locator("#a-counters").inputValue(), "2", "Reset restores the counters");
      assert.equal(await head(s.page), opening, "Reset restores the opening estimate");
      assert.equal(await s.page.evaluate(() => localStorage.getItem("queue-time:mode")), "queue", "Reset forgets the remembered mode");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.getByRole("button", { name: "One more counter" }).click();
      await valueIs(s.page, "a-counters", "3");
      await s.page.getByText("More options").click();
      await s.page.getByText("Export a talk").click();
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "queue-time-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /^title: Queue time: 8 people ahead, 3 counters$/m, "the deck is of the queue as set");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.getByRole("button", { name: "One more person ahead" }).click();
    await valueIs(page, "a-people", "9");
  }),
});
