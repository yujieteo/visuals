// VGC turn lab (Win the turn: Protect, Fake Out and pivots): the fuller
// section-28 checks. Position tabs load a lab position, which a solver in a
// worker analyses; "Play the turn" resolves a turn into the battle log and
// "Reset position" returns to the position's start. The lab keeps no URL
// state, history entries, command palette, JSON state file or Markdown or
// beamdswitch export; those checks assert the canonical contract and are
// recorded as findings in manifest/vgc-protect-fakeout-pivot-trainer.json.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

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
