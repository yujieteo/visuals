// VGC turn lab (Win the turn: Protect, Fake Out and pivots): the fuller
// section-28 checks. Position tabs load a lab position, which a solver in a
// worker analyses; "Play the turn" resolves a turn into the battle log and
// "Reset position" returns to the position's start. The lab keeps no URL
// state, history entries, command palette, JSON state file or Markdown or
// beamdswitch export; those checks assert the canonical contract and are
// recorded as findings in manifest/vgc-protect-fakeout-pivot-trainer.json.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, jsonRoundTrip, markdownExport, saved } from "../../lib/full.js";

/** @typedef {import("../../lib/full.js").Opened} Opened */

/**
 * Open the lab, wait for the first analysis, run `body`, check it stayed clean, and close it.
 * @param {(suffix?: string, extra?: import("playwright").BrowserContextOptions) => Promise<Opened>} open
 * @param {(s: Opened) => Promise<void>} body
 * @param {import("playwright").BrowserContextOptions} [extra]
 */
async function using(open, body, extra = {}) {
  const s = await open("", extra);
  try {
    await analysed(s.page);
    await body(s);
    assertClean(s);
  } finally {
    await s.close();
  }
}
/** The solver has finished when Play is enabled again. @param {import("playwright").Page} page */
const analysed = (page) => page.waitForFunction(() => !(/** @type {HTMLButtonElement} */ (document.querySelector("#play"))).disabled, null, { timeout: 60_000 });
/** @param {import("playwright").Page} page */
const turn = (page) => page.locator("#arena .turn").innerText();
/**
 * @param {import("playwright").Page} page
 * @param {number} i
 */
const tab = (page, i) => page.locator("#tabs button").nth(i);

await fullSuite("vgc-protect-fakeout-pivot-trainer", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    const before = await s.page.evaluate(() => location.href);
    await tab(s.page, 1).click();
    assert.equal(await tab(s.page, 1).getAttribute("aria-pressed"), "true");
    assert.notEqual(await s.page.evaluate(() => location.href), before, "the chosen position is reflected in the URL");
  }),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    const entries = await s.page.evaluate(() => history.length);
    await tab(s.page, 2).click();
    assert.ok(await s.page.evaluate(() => history.length) > entries, "choosing a position adds a history entry for Back to undo");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    await tab(s.page, 1).focus();
    await s.page.keyboard.press("Enter");
    assert.equal(await tab(s.page, 1).getAttribute("aria-pressed"), "true", "Enter on a position tab loads it");
    await analysed(s.page);
    const cell = s.page.locator("#heat td").nth(1);
    const label = await cell.getAttribute("aria-label");
    await cell.focus();
    await s.page.keyboard.press("Enter");
    assert.ok(label && (await s.page.locator("#force").innerText()).startsWith("João will play: "), "Enter on a payoff cell forces João's reply");
    await s.page.locator("#play").focus();
    await s.page.keyboard.press("Enter");
    await s.page.waitForFunction(() => document.querySelector("#arena .turn")?.textContent === "Turn 2", null, { timeout: 60_000 });
  }, { reducedMotion: "reduce" }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    const palette = s.page.locator("[role=dialog]:visible, [role=combobox]:visible, dialog[open]");
    assert.ok(await palette.count() > 0, "Cmd/Ctrl+K opens a command palette");
  }),

  reset: (ctx) => using(ctx.open, async (s) => {
    assert.equal(await turn(s.page), "Turn 1");
    await s.page.locator("#play").click();
    await s.page.waitForFunction(() => document.querySelector("#arena .turn")?.textContent === "Turn 2", null, { timeout: 60_000 });
    await analysed(s.page);
    await s.page.getByRole("button", { name: "Reset position" }).click();
    assert.equal(await turn(s.page), "Turn 1", "Reset position returns to the position's first turn");
    assert.doesNotMatch(await s.page.locator("#log").innerText(), /^Turn 1: Justin/m, "and clears the played turn from the log");
  }, { reducedMotion: "reduce" }),

  "json-round-trip": (ctx) => jsonRoundTrip(ctx.open, async (page) => { await tab(page, 1).click(); await analysed(page); }, async (page) => [await page.locator("#tabs button[aria-pressed=true]").innerText(), await page.locator("#tension").innerText()]),

  "markdown-export": (ctx) => markdownExport(ctx.open, async (page) => { await tab(page, 2).click(); await analysed(page); }, "Kingambit + Lycanroc", "#save-beamdswitch"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    const file = await saved(s.page, () => s.page.getByRole("button", { name: /beamdswitch/i }).first().click({ timeout: 5_000 }));
    assertBeamdswitchDeck(file.text);
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await analysed(page);
    await page.locator("#useeq").click();
  }),
});
