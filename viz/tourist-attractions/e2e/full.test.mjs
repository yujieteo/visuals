// How Singapore attractions are marketed: the fuller section-28 checks. A
// search box and the word cloud filter the attractions on the map and in the
// results; Reset clears the filters; the beamdswitch button saves the view as
// a narrated Markdown deck. The page loads D3 from a CDN, which the suite
// refuses, so today nothing runs; and it keeps no URL state, history
// entries, command palette, JSON state file or Markdown export apart from
// the deck. Those checks assert the canonical contract and are recorded as
// findings in manifest/tourist-attractions.json.
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
