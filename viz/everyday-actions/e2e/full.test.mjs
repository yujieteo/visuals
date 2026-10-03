// How ordinary activities feel, and how often people do them: the fuller
// section-28 checks. The chart's axes, population and partial-match toggle
// live in the query string (?x=…&y=…&pop=…), replaced rather than pushed;
// the reconsideration ledger lives in localStorage and Restore examples
// resets it; the only export is the beamdswitch deck of the charts as set.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const query = (page) => page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));

await fullSuite("everyday-actions", {
  "url-state": async ({ open }) => {
    const s = await open("?x=atus_participation&y=drm_tired&pop=weekend");
    try {
      assert.equal(await s.page.locator("#x-axis").inputValue(), "atus_participation", "the link restores the x axis");
      assert.equal(await s.page.locator("#y-axis").inputValue(), "drm_tired", "the link restores the y axis");
      assert.equal(await s.page.locator("#population").inputValue(), "weekend", "the link restores the population");
      await s.page.locator("#y-axis").selectOption("drm_competent");
      assert.equal((await query(s.page)).y, "drm_competent", "changing an axis updates the URL");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const preset = s.page.locator("#presets button").nth(2);
      await preset.focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await preset.getAttribute("aria-pressed"), "true", "Enter on a preset applies it");
      assert.deepEqual([(await query(s.page)).x, (await query(s.page)).y], ["atus_participation", "atus_minutes_when_performed"], "the preset's axes reach the URL");
      const rows = s.page.locator("#ledger tbody tr"), n = await rows.count();
      await s.page.locator("#ledger-add").focus();
      await s.page.keyboard.press("Space");
      assert.equal(await rows.count(), n + 1, "Space on Add a row adds a ledger row");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const rows = s.page.locator("#ledger tbody tr");
      const examples = await rows.count();
      await s.page.locator("#ledger-add").click();
      assert.equal(await rows.count(), examples + 1, "Add a row adds a ledger row");
      await s.page.locator("#ledger-reset").click();
      assert.equal(await rows.count(), examples, "Restore examples resets the ledger");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open("?x=drm_tired&y=drm_positive_affect");
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "everyday-actions-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /Tired while doing it \(0–6\) by Positive affect while doing it/, "the deck is of the axes shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": () => assert.fail("no Markdown export of the reconsideration ledger, the page's own session state; its only Markdown export is the beamdswitch deck of the charts"),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#y-axis").selectOption("drm_tired");
  }),
});
