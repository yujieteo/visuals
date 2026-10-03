// Subsidy Atlas: the fuller section-28 checks. Four filters, a search box and
// a depth × lifecycle matrix narrow the catalogue; "Reset filters" clears
// them; the beamdswitch button saves the records shown as a narrated
// Markdown deck. The atlas keeps no URL state, history entries, command
// palette, JSON state file or Markdown export apart from the deck; those
// checks assert the canonical contract and are recorded as findings in
// manifest/subsidy-atlas.json.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @typedef {import("../../lib/full.js").Opened} Opened */

/**
 * Open the atlas, run `body`, check it stayed clean, and close it.
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
const count = (page) => page.locator("#count").innerText();
/** @param {import("playwright").Page} page */
const shown = (page) => page.locator("[data-product]:visible").count();
/** @param {import("playwright").Page} page */
const chooseCategory = (page) => page.getByLabel("Categories").selectOption("llm");

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

await fullSuite("subsidy-atlas", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    const before = await s.page.evaluate(() => location.href);
    await chooseCategory(s.page);
    await s.page.waitForFunction((n) => document.querySelector("#count")?.textContent?.startsWith(n), "2 of");
    const after = await s.page.evaluate(() => location.href);
    assert.notEqual(after, before, "choosing a category filter is reflected in the URL");
  }),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    const all = await count(s.page), entries = await s.page.evaluate(() => history.length);
    await chooseCategory(s.page);
    assert.notEqual(await count(s.page), all);
    assert.ok(await s.page.evaluate(() => history.length) > entries, "a filter change adds a history entry for Back to undo");
    await s.page.goBack();
    assert.equal(await count(s.page), all, "Back restores the unfiltered catalogue");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    const all = await shown(s.page);
    await s.page.getByLabel("Find a product").focus();
    await s.page.keyboard.type("gemini");
    await s.page.waitForFunction(() => document.querySelector("#count")?.textContent?.startsWith("1 of"));
    assert.equal(await shown(s.page), 1, "typing in the search box narrows the catalogue");
    await s.page.getByLabel("Find a product").fill("");
    const history = s.page.getByLabel(/Include historical evidence/);
    await history.focus();
    await s.page.keyboard.press("Space");
    assert.equal(await history.isChecked(), true, "Space ticks the focused checkbox");
    await s.page.waitForFunction((n) => document.querySelectorAll("[data-product]:not([hidden])").length > n, all);
    await s.page.keyboard.press("Space");
    const cell = s.page.locator("#matrix button:not([disabled])").first();
    await cell.focus();
    await s.page.keyboard.press("Enter");
    assert.equal(await cell.getAttribute("aria-pressed"), "true", "Enter on a matrix cell selects it");
    assert.ok(await shown(s.page) < all, "the selected cell narrows the catalogue");
    assert.equal(await s.page.evaluate(() => document.activeElement?.id), "catalogue", "selecting a cell moves focus to the catalogue");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    const palette = s.page.locator("[role=dialog]:visible, [role=combobox]:visible, dialog[open]");
    assert.ok(await palette.count() > 0, "Cmd/Ctrl+K opens a command palette");
  }),

  reset: (ctx) => using(ctx.open, async (s) => {
    const all = await count(s.page);
    await s.page.getByRole("button", { name: "Historical lessons" }).click();
    await s.page.getByLabel("Find a product").fill("x");
    assert.notEqual(await count(s.page), all);
    await s.page.getByRole("button", { name: "Reset filters" }).click();
    await s.page.waitForFunction((n) => document.querySelector("#count")?.textContent === n, all);
    assert.equal(await s.page.getByLabel("Find a product").inputValue(), "");
    assert.equal(await s.page.getByLabel("Stages").inputValue(), "");
    assert.equal(await s.page.getByLabel(/Include historical evidence/).isChecked(), false, "Reset hides historical evidence again");
  }),

  "json-round-trip": (ctx) => jsonRoundTrip(ctx.open, async (page) => {
    await chooseCategory(page);
    await page.getByLabel("Find a product").fill("gem");
  }, async (page) => [await count(page), await page.getByLabel("Find a product").inputValue(), await page.getByLabel("Categories").inputValue()]),

  "markdown-export": (ctx) => markdownExport(ctx.open, (page) => page.getByLabel("Find a product").fill("gemini"), "1 of 15", "#save-beamdswitch, #copy-beamdswitch"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    await chooseCategory(s.page);
    const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
    assertBeamdswitchDeck(file.text);
    assert.match(file.text, /^voice: bf_emma$/m);
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.getByRole("button", { name: "Free trials" }).click();
    await page.locator("details.product:visible summary").first().click();
  }),
});
