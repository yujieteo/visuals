// TOTO ball frequency: the fuller section-28 checks. Window, sort and band
// chips redraw the grid of 49 balls; a ball opens its counts in every window;
// the beamdswitch button saves the window shown as a narrated Markdown deck.
// The page keeps no URL state, history entries, command palette, reset
// control, JSON state file or Markdown export apart from the deck; those
// checks assert the canonical contract and are recorded as findings in
// manifest/toto-frequency.json.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, fullSuite, jsonRoundTrip, markdownExport, resetsToDefaults, saved, using } from "../../../e2e/lib/full.js";

/**
 * @param {import("playwright").Page} page
 * @param {string} label
 */
const windowChip = (page, label) => page.locator("#window-chips button", { hasText: label });

await fullSuite("toto-frequency", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    const before = await s.page.evaluate(() => location.href);
    await windowChip(s.page, "Last 1 year").click();
    assert.equal(await windowChip(s.page, "Last 1 year").getAttribute("aria-pressed"), "true");
    assert.notEqual(await s.page.evaluate(() => location.href), before, "choosing a window is reflected in the URL");
  }),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    const entries = await s.page.evaluate(() => history.length);
    await windowChip(s.page, "Last 6 months").click();
    assert.ok(await s.page.evaluate(() => history.length) > entries, "a window change adds a history entry for Back to undo");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    const ball = s.page.locator('[data-ball="7"]');
    await ball.focus();
    await s.page.keyboard.press("Enter");
    assert.equal(await s.page.locator('[data-ball="7"]').getAttribute("aria-pressed"), "true", "Enter on a ball opens it");
    assert.match(await s.page.locator("#detail").innerText(), /^Ball 7/, "the detail panel shows the ball");
    assert.equal(await s.page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement).dataset.ball), "7", "focus stays on the ball as the grid redraws");
    await s.page.keyboard.press("Space");
    assert.equal(await s.page.locator('[data-ball="7"]').getAttribute("aria-pressed"), "false", "pressing it again closes it");
    const most = s.page.locator("#sort-chips button", { hasText: "Most drawn first" });
    await most.focus();
    await s.page.keyboard.press("Enter");
    assert.equal(await s.page.locator("#sort-chips button", { hasText: "Most drawn first" }).getAttribute("aria-pressed"), "true", "Enter on a sort chip sorts the grid");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    const palette = s.page.locator("[role=dialog]:visible, [role=combobox]:visible, dialog[open]");
    assert.ok(await palette.count() > 0, "Cmd/Ctrl+K opens a command palette");
  }),

  reset: (ctx) => resetsToDefaults(ctx.open, (page) => windowChip(page, "Last 1 year").click(), async (page) => [await page.locator("#status").innerText(), await page.locator("#window-chips button[aria-pressed=true], #sort-chips button[aria-pressed=true]").allInnerTexts()]),

  "json-round-trip": (ctx) => jsonRoundTrip(ctx.open, (page) => windowChip(page, "Last 6 months").click(), async (page) => [await page.locator("#status").innerText(), await page.locator("#window-chips button[aria-pressed=true], #sort-chips button[aria-pressed=true]").allInnerTexts()]),

  "markdown-export": (ctx) => markdownExport(ctx.open, (page) => windowChip(page, "Last 1 year").click(), "12.9", "#save-beamdswitch, #copy-beamdswitch"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
    assertBeamdswitchDeck(file.text);
    assert.match(file.text, /^voice: bf_emma$/m);
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await windowChip(page, "Last 1 year").click();
    await page.locator('[data-ball="12"]').click();
  }),
});
