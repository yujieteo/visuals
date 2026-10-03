// Good food in Tampines: the fuller section-28 checks. Cuisine and mall chips
// filter the map, list, chart and table together; the floor directories open
// an outlet's details, which Escape closes; the beamdswitch button saves the
// places shown as a narrated Markdown deck. The page keeps no URL state,
// history entries, command palette, reset control, JSON state file or
// Markdown export apart from the deck; those checks assert the canonical
// contract and are recorded as findings in manifest/tampines-food.json.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @typedef {import("../../lib/full.js").Opened} Opened */

/**
 * Open the page, run `body`, check it stayed clean, and close it.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @param {(s: Opened) => Promise<void>} body
 */
async function using(open, body) {
  const s = await open();
  try {
    await body(s);
    assertClean(s);
  } finally {
    await s.close();
  }
}
/** @param {import("playwright").Page} page */
const status = (page) => page.locator("#status").innerText();
/**
 * @param {import("playwright").Page} page
 * @param {string} key a chip's data-key, such as "cuisine:chinese"
 */
const chip = (page, key) => page.locator(`.chip[data-key="${key}"]`);

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
/**
 * Section 14's Markdown export of the view's own state, exercised: change the view, then a control that
 * names Markdown (never the beamdswitch deck's controls, which `deck` excludes) must save or copy
 * Markdown that carries `marker`, a sign of the changed state that the default view does not show.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @param {(page: import("playwright").Page) => Promise<void>} change
 * @param {string} marker
 * @param {string} deck a selector for the deck controls, which do not count
 */
async function markdownExport(open, change, marker, deck) {
  const s = await open();
  try {
    assert.ok(!(await s.page.innerText("body")).includes(marker), `the default view does not show ${marker}`);
    await change(s.page);
    await s.page.evaluate(() => {
      const w = /** @type {any} */ (window), clip = navigator.clipboard;
      if (clip) clip.writeText = async (text) => { w.__copiedMarkdown = text; };
    });
    const control = s.page.getByRole("button", { name: /\bmarkdown\b/i }).and(s.page.locator(`:not(${deck})`)).first();
    const download = s.page.waitForEvent("download", { timeout: 5_000 }).then(async (d) => readFile(/** @type {string} */ (await d.path()), "utf8"), () => null);
    await control.click({ timeout: 5_000 });
    const copied = await s.page.waitForFunction(() => /** @type {any} */ (window).__copiedMarkdown, null, { timeout: 5_000 }).then((h) => h.jsonValue(), () => null);
    const text = (await download) ?? copied;
    assert.ok(typeof text === "string" && text.length > 0, "the Markdown control saves or copies Markdown");
    assert.ok(text.includes(marker), `the Markdown reflects the current view (${marker})`);
    assertClean(s);
  } finally {
    await s.close();
  }
}
/**
 * Reset, exercised: change the view, press the control named Reset, and the view's state must be its
 * initial state again. Re-choosing an example does not count.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @param {(page: import("playwright").Page) => Promise<void>} change
 * @param {(page: import("playwright").Page) => Promise<unknown>} state
 */
async function resetsToDefaults(open, change, state) {
  const s = await open();
  try {
    const initial = await state(s.page);
    await change(s.page);
    assert.notDeepEqual(await state(s.page), initial, "the change is visible before Reset");
    await s.page.getByRole("button", { name: /^reset\b/i }).first().click({ timeout: 5_000 });
    await settlesTo(() => state(s.page), initial, "Reset returns the view to its initial state");
    assertClean(s);
  } finally {
    await s.close();
  }
}

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
