// TOTO ball frequency: the fuller section-28 checks. Window, sort and band
// chips redraw the grid of 49 balls; a ball opens its counts in every window;
// the beamdswitch button saves the window shown as a narrated Markdown deck.
// The page keeps no URL state, history entries, command palette, reset
// control, JSON state file or Markdown export apart from the deck; those
// checks assert the canonical contract and are recorded as findings in
// manifest/toto-frequency.json.
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
/**
 * @param {import("playwright").Page} page
 * @param {string} label
 */
const windowChip = (page, label) => page.locator("#window-chips button", { hasText: label });

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
