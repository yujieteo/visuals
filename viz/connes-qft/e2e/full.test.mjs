// Connes QFT laboratory: the fuller section-28 checks. Each view has a hash
// route (#ladder, #birkhoff) that a link restores; Cmd/Ctrl+K opens the
// command palette; views with a reset action return to their start; the
// toolbar saves the view as Markdown and as a narrated beamdswitch deck. The
// lab rewrites the hash in place instead of adding history entries, and keeps
// no JSON state file; those checks assert the canonical contract and are
// recorded as findings in manifest/connes-qft.json.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, jsonRoundTrip, saved, using } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const title = (page) => page.locator("#s-title").innerText();
/**
 * Choose a view from the side list, opening its track's group first.
 * @param {import("playwright").Page} page
 * @param {string} id
 */
async function goTo(page, id) {
  const group = page.locator("#scenelist details").filter({ has: page.locator(`[data-scene="${id}"]`) });
  if (!(await group.evaluate((d) => /** @type {HTMLDetailsElement} */ (d).open))) await group.locator("summary").click();
  await page.locator(`#scenelist [data-scene="${id}"]`).click();
  await page.waitForFunction((h) => location.hash === h, `#${id}`);
}
/**
 * @param {import("playwright").Page} page
 * @param {string} act a data-act name
 */
const act = (page, act) => page.locator(`#controls [data-act="${act}"]`);

await fullSuite("connes-qft", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    assert.equal(await title(s.page), "Creation and annihilation operators", "#ladder opens the ladder view");
    await goTo(s.page, "birkhoff");
    const restored = await ctx.open("#birkhoff");
    try {
      assert.equal(await title(restored.page), await title(s.page), "the rewritten hash reopens the same view");
      assertClean(restored);
    } finally {
      await restored.close();
    }
  }, "#ladder"),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    await goTo(s.page, "birkhoff");
    await s.page.goBack();
    await s.page.waitForTimeout(300);
    assert.equal(await s.page.evaluate(() => location.hash), "#ladder", "Back returns to the previous view");
    assert.equal(await title(s.page), "Creation and annihilation operators");
  }, "#ladder"),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    await s.page.locator("#btn-present").click();
    await s.page.locator("#present").waitFor({ state: "visible" });
    const first = await s.page.evaluate(() => /** @type {any} */ (self).ConnesQFTApp.present().i);
    await s.page.keyboard.press("ArrowRight");
    assert.equal(await s.page.evaluate(() => /** @type {any} */ (self).ConnesQFTApp.present().i), first + 1, "ArrowRight advances the presentation");
    await s.page.keyboard.press("ArrowLeft");
    assert.equal(await s.page.evaluate(() => /** @type {any} */ (self).ConnesQFTApp.present().i), first, "ArrowLeft goes back");
    await s.page.keyboard.press("Escape");
    await s.page.locator("#present").waitFor({ state: "hidden" });
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    await s.page.locator("#palette").waitFor({ state: "visible" });
    assert.equal(await s.page.evaluate(() => document.activeElement?.id), "palette-input", "the palette focuses its search field");
    await s.page.keyboard.type("Birkhoff decomposition");
    await s.page.keyboard.press("Enter");
    await s.page.waitForFunction(() => location.hash === "#birkhoff");
    assert.equal(await s.page.locator("#palette").isVisible(), false, "choosing a command closes the palette");
  }),

  reset: (ctx) => using(ctx.open, async (s) => {
    const start = await s.page.locator("#quad").innerText();
    await act(s.page, "bcreate").click();
    await act(s.page, "bcreate").click();
    await act(s.page, "fcreate").click();
    assert.notEqual(await s.page.locator("#quad").innerText(), start);
    await act(s.page, "lreset").click();
    assert.equal(await s.page.locator("#quad").innerText(), start, "reset returns the ladder to the vacuum");
  }, "#ladder"),

  "json-round-trip": (ctx) => jsonRoundTrip(ctx.open, (page) => goTo(page, "birkhoff"), (page) => title(page)),

  "markdown-export": (ctx) => using(ctx.open, async (s) => {
    const file = await saved(s.page, () => s.page.locator("#btn-md").click());
    assert.equal(file.name, "connes-qft-birkhoff.md");
    assert.match(file.text, /^# Renormalization as Birkhoff decomposition$/m, "the Markdown is the view's write-up");
    assert.equal(file.text, await s.page.evaluate(() => /** @type {any} */ (self).ConnesQFTApp.markdown()), "and the same text the page builds");
  }, "#birkhoff"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
    assert.match(file.name, /\.md$/);
    assertBeamdswitchDeck(file.text);
    assert.match(file.text, /^voice: bf_emma$/m);
  }, "#birkhoff"),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await goTo(page, "birkhoff");
  }),
});
