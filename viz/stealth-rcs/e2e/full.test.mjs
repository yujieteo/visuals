// Stealth aircraft: public RCS evidence, the fuller section-28 checks. Aircraft chips, the evidence and
// result filters and the claim buttons drive the matrix and the argument; the frequency chips, trace
// boxes, zoom buttons and sample buttons drive the NASA model plot. The view lives in the URL fragment,
// Reset returns to the default view, the view saves and loads as JSON, and the page exports a Markdown
// record and a narrated beamdswitch deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, fullSuite, jsonRoundTrip, markdownExport, resetsToDefaults, saved, using } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const state = async (page) => [
  await page.locator("[aria-pressed=true]").allInnerTexts(),
  await page.locator("[data-argument]").getAttribute("data-argument"),
  await page.evaluate(() => location.hash),
];
/** @param {import("playwright").Page} page @param {string} id */
const chip = (page, id) => page.locator(`[data-aircraft-filter="${id}"]`);
/** @param {import("playwright").Page} page @param {string} id */
const freq = (page, id) => page.locator(`#plot-body [data-figure="${id}"]`).first();

await fullSuite("stealth-rcs", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    const before = await s.page.evaluate(() => location.href);
    await chip(s.page, "F22").click();
    assert.equal(await chip(s.page, "F22").getAttribute("aria-pressed"), "true");
    assert.notEqual(await s.page.evaluate(() => location.href), before, "the aircraft filter is in the URL");
    // A shared link restores the view: aircraft, claim, frequency, zoom and selected sample.
    const link = await ctx.open("#a=F117&c=F117-2&f=fig-5-12&z=181.50,183.00&s=fig-5-12:reconstructed:182.25");
    try {
      assert.equal(await chip(link.page, "F117").getAttribute("aria-pressed"), "true");
      assert.equal(await freq(link.page, "fig-5-12").getAttribute("aria-pressed"), "true");
      assert.match(await link.page.locator("#readout").innerText(), /182\.25°/);
      // A stale value resets with a notice.
      await link.page.goto(link.page.url().split("#")[0] + "#a=SR71");
      await link.page.reload();
      assert.match(await link.page.locator("#notice").innerText(), /not in this dataset/);
      assert.equal(await chip(link.page, "all").getAttribute("aria-pressed"), "true");
    } finally {
      await link.close();
    }
  }),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    const entries = await s.page.evaluate(() => history.length);
    await chip(s.page, "B2").click();
    assert.ok(await s.page.evaluate(() => history.length) > entries, "a filter change adds a history entry");
    await s.page.goBack();
    await s.page.waitForFunction(() => document.querySelector('[data-aircraft-filter="all"]')?.getAttribute("aria-pressed") === "true");
    await s.page.goForward();
    await s.page.waitForFunction(() => document.querySelector('[data-aircraft-filter="B2"]')?.getAttribute("aria-pressed") === "true");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    await chip(s.page, "F35").focus();
    await s.page.keyboard.press("Enter");
    assert.equal(await chip(s.page, "F35").getAttribute("aria-pressed"), "true", "Enter on a chip filters the matrix");
    await s.page.locator('[data-claim="F35-2"]').focus();
    await s.page.keyboard.press("Space");
    assert.equal(await s.page.locator("[data-argument]").getAttribute("data-argument"), "F35-2", "Space opens the argument");
    assert.match(await s.page.locator("[data-testid=empty-state]").innerText(), /No eligible curve for the F-35/);
    await s.page.locator("#show-model-curves").focus();
    await s.page.keyboard.press("Enter");
    await s.page.locator("#plot").focus();
    await s.page.keyboard.press("ArrowRight");
    assert.match(await s.page.locator("#readout").innerText(), /φ = \d{3}\.\d{2}°/, "an arrow key selects a sample on the focused plot");
    const first = await s.page.locator("#readout").innerText();
    await s.page.keyboard.press("ArrowRight");
    assert.notEqual(await s.page.locator("#readout").innerText(), first, "the next arrow moves to the next sample");
    await s.page.locator("#zoom-in").focus();
    await s.page.keyboard.press("Enter");
    assert.match(await s.page.evaluate(() => location.hash), /z=/, "the zoom button works from the keyboard");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    const palette = s.page.locator("[role=dialog]:visible, [role=combobox]:visible, dialog[open]");
    assert.ok(await palette.count() > 0, "Cmd/Ctrl+K opens a command palette");
    await s.page.keyboard.type("B2-1");
    await s.page.keyboard.press("Enter");
    assert.equal(await s.page.locator("[data-argument]").getAttribute("data-argument"), "B2-1", "choosing a command runs it");
  }),

  reset: (ctx) => resetsToDefaults(ctx.open, async (page) => { await chip(page, "F22").click(); await page.locator("#evidence-filter").selectOption("official_statement"); }, state),

  "json-round-trip": (ctx) => jsonRoundTrip(ctx.open, async (page) => { await freq(page, "fig-5-10").click(); await page.locator("#next-sample").click(); }, state),

  "markdown-export": (ctx) => markdownExport(ctx.open, (page) => page.locator("#next-sample").click(), "exact sample position", "#save-beamdswitch, #copy-beamdswitch"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
    assertBeamdswitchDeck(file.text);
    assert.match(file.text, /^voice: bf_emma$/m);
    assert.equal(file.name, "stealth-rcs-beamdswitch.md");
    for (const id of ["F117-1", "F117-2", "F22-1", "F22-2", "F35-1", "F35-2", "B2-1", "B2-2"]) assert.ok(file.text.includes(`${id}:`), id);
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await chip(page, "F117").click();
    await page.locator("#next-sample").click();
  }),
});
