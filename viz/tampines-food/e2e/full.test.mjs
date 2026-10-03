// Good food in Tampines: the fuller section-28 checks. Cuisine and mall chips
// filter the map, list, chart and table together; the floor directories open
// an outlet's details, which Escape closes; the beamdswitch button saves the
// places shown as a narrated Markdown deck. The page keeps no URL state,
// history entries, command palette, reset control, JSON state file or
// Markdown export apart from the deck; those checks assert the canonical
// contract and are recorded as findings in manifest/tampines-food.json.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, fullSuite, jsonRoundTrip, markdownExport, resetsToDefaults, saved, using } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const status = (page) => page.locator("#status").innerText();
/**
 * @param {import("playwright").Page} page
 * @param {string} key a chip's data-key, such as "cuisine:chinese"
 */
const chip = (page, key) => page.locator(`.chip[data-key="${key}"]`);

await fullSuite("tampines-food", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    const before = await s.page.evaluate(() => location.href);
    await chip(s.page, "cuisine:chinese").click();
    assert.equal(await chip(s.page, "cuisine:chinese").getAttribute("aria-pressed"), "true");
    assert.notEqual(await s.page.evaluate(() => location.href), before, "choosing a cuisine is reflected in the URL");
  }),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    const entries = await s.page.evaluate(() => history.length);
    await chip(s.page, "mall:tampines-1").click();
    assert.ok(await s.page.evaluate(() => history.length) > entries, "a filter change adds a history entry for Back to undo");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    const all = await status(s.page);
    await chip(s.page, "cuisine:western").focus();
    await s.page.keyboard.press("Enter");
    assert.notEqual(await status(s.page), all, "Enter on a cuisine chip filters the page");
    assert.equal(await s.page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement).dataset.key), "cuisine:western", "focus stays on the chip as the chips redraw");
    await s.page.keyboard.press("Space");
    assert.equal(await status(s.page), all, "pressing the chip again clears the filter");
    const outlet = s.page.locator(".map-rank").first();
    await outlet.focus();
    await s.page.keyboard.press("Enter");
    assert.equal(await outlet.getAttribute("aria-pressed"), "true", "Enter on a floor-directory entry opens its details");
    assert.ok((await s.page.locator("#map-detail").innerText()).length > 0);
    await s.page.keyboard.press("Escape");
    assert.equal(await s.page.locator("#map-detail").innerText(), "", "Escape closes the outlet details");
    const bar = s.page.locator(".bar-row").first();
    await bar.focus();
    await s.page.keyboard.press("Enter");
    assert.equal(await s.page.locator(".bar-row").first().getAttribute("aria-expanded"), "true", "Enter on a calorie bar opens its breakdown");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    const palette = s.page.locator("[role=dialog]:visible, [role=combobox]:visible, dialog[open]");
    assert.ok(await palette.count() > 0, "Cmd/Ctrl+K opens a command palette");
  }),

  reset: (ctx) => resetsToDefaults(ctx.open, (page) => chip(page, "cuisine:chinese").click(), async (page) => [await status(page), await page.locator(".chip[aria-pressed=true]").allInnerTexts()]),

  "json-round-trip": (ctx) => jsonRoundTrip(ctx.open, (page) => chip(page, "mall:tampines-1").click(), async (page) => [await status(page), await page.locator(".chip[aria-pressed=true]").allInnerTexts()]),

  "markdown-export": (ctx) => markdownExport(ctx.open, (page) => chip(page, "cuisine:japanese").click(), "7 of 50", "#save-beamdswitch, #copy-beamdswitch"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    await chip(s.page, "cuisine:malay").click();
    const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
    assertBeamdswitchDeck(file.text);
    assert.match(file.text, /^voice: bf_emma$/m);
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await chip(page, "cuisine:japanese").click();
    await page.locator(".bar-row").first().click();
  }),
});
