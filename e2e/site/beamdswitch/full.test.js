// beamdswitch: the fuller section-28 checks. The fragment names the frame and
// overlay step (#3, #3.2) and reopens there; the arrow keys step through the
// deck and O or / opens the searchable overview; Save writes the deck's
// Markdown and Article its article-mode Markdown. The player rewrites the
// fragment in place instead of adding history entries, and has no command
// palette, Reset control or JSON state file; those
// checks assert the canonical contract and are recorded as findings in
// manifest/beamdswitch.json.
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { settle } from "../../lib/browser.js";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @typedef {import("../../lib/full.js").Opened} Opened */
/** @typedef {import("../../lib/full.js").FullContext} FullContext */

/**
 * Open the player at `suffix`, run `body`, check it stayed clean, and close it.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @param {(s: Opened) => Promise<void>} body
 * @param {string} [suffix]
 */
async function using(open, body, suffix = "") {
  const s = await ready(open)(suffix);
  try {
    await body(s);
    assertClean(s);
  } finally {
    await s.close();
  }
}
/**
 * `open` for a player ready to use: its counter shows a frame and the
 * narration notice is dismissed.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @returns {(suffix?: string) => Promise<Opened>}
 */
const ready = (open) => async (suffix = "") => {
  const s = await open(suffix);
  try {
    await s.page.waitForFunction(() => /^\d+ \/ \d+/.test(document.querySelector("#count")?.textContent ?? ""));
    await dismissNote(s.page);
  } catch (error) {
    await s.close();
    throw error;
  }
  return s;
};
/** The current frame number, from "3 / 17 · 1/2". @param {import("playwright").Page} page */
const frame = async (page) => Number(/^(\d+)/.exec(await page.locator("#count").innerText())?.[1]);
/**
 * Dismiss the site copy's narration notice, as a reader would: it is fixed
 * over the bottom-right corner and covers the player's buttons on a phone.
 * @param {import("playwright").Page} page
 */
const dismissNote = async (page) => {
  const dismiss = page.getByRole("note").getByRole("button", { name: "Dismiss" });
  if (await dismiss.count()) await dismiss.click();
};
/** @param {import("playwright").Page} page */
const blur = (page) => page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
/**
 * `ctx` whose pages keep their colour scheme. `settle` waits until the site
 * copy's coi-serviceworker has reloaded the page under its control, but
 * Firefox drops the context's colour scheme on that cross-origin-isolated
 * reload, and the player reads the scheme as it boots, so the scheme is
 * applied again and the page reloaded.
 * @param {FullContext} ctx
 * @returns {FullContext}
 */
const controlled = (ctx) => ({
  ...ctx,
  open: async (suffix, extra) => {
    const s = await ctx.open(suffix, extra);
    await s.page.emulateMedia({ colorScheme: extra?.colorScheme });
    await s.page.reload();
    await settle(s.page, "#count");
    return s;
  },
});

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

await fullSuite("beamdswitch", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    assert.equal(await frame(s.page), 3, "#3 opens the third frame");
    await s.page.locator("#b-next").click();
    await s.page.waitForFunction(() => location.hash !== "#3");
    const hash = await s.page.evaluate(() => location.hash);
    const at = await s.page.locator("#count").innerText();
    const restored = await ctx.open(hash);
    try {
      await restored.page.waitForFunction((t) => document.querySelector("#count")?.textContent === t, at);
      assertClean(restored);
    } finally {
      await restored.close();
    }
  }, "#3"),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    const entries = await s.page.evaluate(() => history.length);
    await s.page.locator("#b-next").click();
    assert.ok(await s.page.evaluate(() => history.length) > entries, "moving to another frame adds a history entry for Back to undo");
  }, "#2"),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    await blur(s.page);
    await s.page.keyboard.press("End");
    const last = await frame(s.page);
    assert.ok(last > 3, "End goes to the last frame");
    await s.page.keyboard.press("Home");
    assert.equal(await frame(s.page), 1, "Home goes to the first frame");
    const first = await s.page.locator("#count").textContent();
    await s.page.keyboard.press("ArrowRight");
    await assert.doesNotReject(s.page.waitForFunction((t) => document.querySelector("#count")?.textContent !== t, first, { timeout: 5_000 }), "ArrowRight steps forward");
    await s.page.keyboard.press("ArrowLeft");
    await assert.doesNotReject(s.page.waitForFunction((t) => document.querySelector("#count")?.textContent === t, first, { timeout: 5_000 }), "ArrowLeft steps back");
    await s.page.keyboard.press("/");
    await s.page.locator("#overview.on").waitFor();
    await assert.doesNotReject(s.page.waitForFunction(() => document.activeElement?.id === "q", null, { timeout: 5_000 }), "/ opens the overview with its search focused");
    await s.page.keyboard.type("compatibility");
    const match = Number(await s.page.locator("#grid > a:visible").first().getAttribute("data-i")) + 1;
    await s.page.keyboard.press("Enter");
    await s.page.locator("#overview.on").waitFor({ state: "detached" });
    assert.equal(await frame(s.page), match, "Enter jumps to the first matching frame");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await blur(s.page);
    await s.page.keyboard.press("ControlOrMeta+k");
    const palette = s.page.locator("[role=dialog]:visible, [role=combobox]:visible, dialog[open]");
    assert.ok(await palette.count() > 0, "Cmd/Ctrl+K opens a command palette");
  }),

  reset: (ctx) => resetsToDefaults(ready(ctx.open), async (page) => {
    await page.locator("#b-next").click();
    await page.locator("#b-next").click();
  }, async (page) => [await page.locator("#count").innerText(), await page.locator("#src").inputValue()]),

  "json-round-trip": (ctx) => jsonRoundTrip(ready(ctx.open), (page) => page.locator("#b-next").click(), (page) => page.locator("#count").innerText()),

  "markdown-export": (ctx) => using(ctx.open, async (s) => {
    const src = await s.page.locator("#src").inputValue();
    await s.page.locator("#src").fill(src.replace(/^title: .*$/m, "title: A marker title for the export"));
    await s.page.waitForTimeout(400);
    await s.page.locator("#b-article").click();
    const file = await saved(s.page, () => s.page.locator("#a-md").click());
    assert.match(file.name, /-article\.md$/);
    assert.match(file.text, /A marker title for the export/, "the article reflects the deck as edited");
    assert.doesNotMatch(file.text, /^::: /m, "and has no deck blocks: it is continuous Markdown");
  }),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    const file = await saved(s.page, () => s.page.locator("#b-save").click());
    assert.match(file.name, /\.md$/);
    assertBeamdswitchDeck(file.text);
    assert.equal(file.text, await s.page.locator("#src").inputValue(), "Save writes the deck in the editor");
  }),

  "dark-mode": (ctx) => assertDarkMode(controlled(ctx)),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await dismissNote(page);
    await page.locator("#b-next").click();
    await page.locator("#b-over").click();
  }),
});
