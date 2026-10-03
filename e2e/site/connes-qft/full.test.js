// Connes QFT laboratory: the fuller section-28 checks. Each view has a hash
// route (#ladder, #birkhoff) that a link restores; Cmd/Ctrl+K opens the
// command palette; views with a reset action return to their start; the
// toolbar saves the view as Markdown and as a narrated beamdswitch deck. The
// lab rewrites the hash in place instead of adding history entries, and keeps
// no JSON state file; those checks assert the canonical contract and are
// recorded as findings in manifest/connes-qft.json.
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @typedef {import("../../lib/full.js").Opened} Opened */

/**
 * Open the lab at `suffix`, run `body`, check it stayed clean, and close it.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @param {(s: Opened) => Promise<void>} body
 * @param {string} [suffix]
 */
async function using(open, body, suffix = "") {
  const s = await open(suffix);
  try {
    await body(s);
    assertClean(s);
  } finally {
    await s.close();
  }
}
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

/**
 * Read `state` until it deep-equals `expected` or five seconds pass, then assert it does.
 * @param {() => Promise<unknown>} state
 * @param {unknown} expected
 * @param {string} message
 */
async function settlesTo(state, expected, message) {
  let actual = await state();
  for (const end = Date.now() + 5_000; !isDeepStrictEqual(actual, expected) && Date.now() < end;) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    actual = await state();
  }
  assert.deepEqual(actual, expected, message);
}
/**
 * Section 14's JSON round trip, exercised: change the view, export it with a control that names JSON,
 * import the file into a fresh page through a JSON file input, and compare the view's state.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @param {(page: import("playwright").Page) => Promise<void>} change
 * @param {(page: import("playwright").Page) => Promise<unknown>} state
 */
async function jsonRoundTrip(open, change, state) {
  const s = await open();
  try {
    await change(s.page);
    const before = await state(s.page);
    const file = await saved(s.page, () => s.page.getByRole("button", { name: /\bjson\b/i }).first().click({ timeout: 5_000 }));
    JSON.parse(file.text);
    const fresh = await open();
    try {
      assert.notDeepEqual(await state(fresh.page), before, "the change is visible before the import");
      await fresh.page.locator('input[type="file"][accept*="json"]').first().setInputFiles({ name: file.name, mimeType: "application/json", buffer: Buffer.from(file.text) }, { timeout: 5_000 });
      await settlesTo(() => state(fresh.page), before, "importing the exported JSON restores the view");
      assertClean(fresh);
    } finally {
      await fresh.close();
    }
    assertClean(s);
  } finally {
    await s.close();
  }
}

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
