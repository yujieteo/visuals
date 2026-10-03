// How Singapore attractions are marketed: the fuller section-28 checks. A
// search box and the word cloud filter the attractions on the map and in the
// results; Reset clears the filters; the beamdswitch button saves the view as
// a narrated Markdown deck. The page loads D3 from a CDN, which the suite
// refuses, so today nothing runs; and it keeps no URL state, history
// entries, command palette, JSON state file or Markdown export apart from
// the deck. Those checks assert the canonical contract and are recorded as
// findings in manifest/tourist-attractions.json.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, jsonRoundTrip, markdownExport, saved } from "../../../e2e/lib/full.js";

/** @typedef {import("../../../e2e/lib/full.js").Opened} Opened */

/**
 * Open the page, run `body`, check it stayed clean, and close it.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @param {(s: Opened) => Promise<void>} body
 */
async function using(open, body) {
  const s = await open();
  try {
    assertClean(s);
    await body(s);
    assertClean(s);
  } finally {
    await s.close();
  }
}
/** @param {import("playwright").Page} page */
const count = (page) => page.locator("#count").innerText();
/** @param {import("playwright").Page} page */
const firstTerm = (page) => page.locator("#cloud button").first();

await fullSuite("tourist-attractions", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    const before = await s.page.evaluate(() => location.href);
    await firstTerm(s.page).click();
    assert.notEqual(await s.page.evaluate(() => location.href), before, "choosing a word is reflected in the URL");
  }),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    const entries = await s.page.evaluate(() => history.length);
    await firstTerm(s.page).click();
    assert.ok(await s.page.evaluate(() => history.length) > entries, "choosing a word adds a history entry for Back to undo");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    const all = await count(s.page);
    await s.page.locator("#search").focus();
    await s.page.keyboard.type("museum");
    await s.page.waitForFunction((n) => document.querySelector("#count")?.textContent !== n, all);
    await s.page.locator("#search").fill("");
    await firstTerm(s.page).focus();
    await s.page.keyboard.press("Enter");
    assert.equal(await firstTerm(s.page).getAttribute("aria-pressed"), "true", "Enter on a word filters by it");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    const palette = s.page.locator("[role=dialog]:visible, [role=combobox]:visible, dialog[open]");
    assert.ok(await palette.count() > 0, "Cmd/Ctrl+K opens a command palette");
  }),

  reset: (ctx) => using(ctx.open, async (s) => {
    const all = await count(s.page);
    await firstTerm(s.page).click();
    await s.page.locator("#search").fill("garden");
    assert.notEqual(await count(s.page), all);
    await s.page.locator("#reset").click();
    // Reset eases the map back to the full extent and redraws as the zoom transition runs.
    await assert.doesNotReject(s.page.waitForFunction((n) => document.querySelector("#count")?.textContent === n, all, { timeout: 5_000 }), "Reset clears the word and the search");
    assert.equal(await s.page.locator("#search").inputValue(), "");
  }),

  "json-round-trip": (ctx) => jsonRoundTrip(ctx.open, (page) => firstTerm(page).click(), (page) => count(page)),

  "markdown-export": (ctx) => markdownExport(ctx.open, (page) => page.locator("#search").fill("museum"), "21 of 109", "#save-beamdswitch, #copy-beamdswitch"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    await firstTerm(s.page).click();
    const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
    assertBeamdswitchDeck(file.text);
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await firstTerm(page).click();
  }),
});
