// beamdswitch: the fuller section-28 checks. The fragment names the frame and
// overlay step (#3, #3.2) and reopens there; the arrow keys step through the
// deck and O or / opens the searchable overview; Save writes the deck's
// Markdown and Article its article-mode Markdown. The player rewrites the
// fragment in place instead of adding history entries, and has no command
// palette, Reset control or JSON state file; those
// checks assert the canonical contract and are recorded as findings in
// manifest/beamdswitch.json.
import assert from "node:assert/strict";
import { settle } from "../../lib/browser.js";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, blur, fullSuite, jsonRoundTrip, resetsToDefaults, saved, using } from "../../lib/full.js";

/** @typedef {import("../../lib/full.js").Opened} Opened */
/** @typedef {import("../../lib/full.js").FullContext} FullContext */

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

await fullSuite("beamdswitch", {
  "url-state": (ctx) => using(ready(ctx.open), async (s) => {
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

  "back-forward": (ctx) => using(ready(ctx.open), async (s) => {
    const entries = await s.page.evaluate(() => history.length);
    await s.page.locator("#b-next").click();
    assert.ok(await s.page.evaluate(() => history.length) > entries, "moving to another frame adds a history entry for Back to undo");
  }, "#2"),

  keyboard: (ctx) => using(ready(ctx.open), async (s) => {
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

  "command-palette": (ctx) => using(ready(ctx.open), async (s) => {
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

  "markdown-export": (ctx) => using(ready(ctx.open), async (s) => {
    const src = await s.page.locator("#src").inputValue();
    await s.page.locator("#src").fill(src.replace(/^title: .*$/m, "title: A marker title for the export"));
    await s.page.waitForTimeout(400);
    await s.page.locator("#b-article").click();
    const file = await saved(s.page, () => s.page.locator("#a-md").click());
    assert.match(file.name, /-article\.md$/);
    assert.match(file.text, /A marker title for the export/, "the article reflects the deck as edited");
    assert.doesNotMatch(file.text, /^::: /m, "and has no deck blocks: it is continuous Markdown");
  }),

  "beamdswitch-export": (ctx) => using(ready(ctx.open), async (s) => {
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
