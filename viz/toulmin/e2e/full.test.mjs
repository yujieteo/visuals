// Toulmin argument builder: the fuller section-28 checks. Arguments sit in
// ARIA tabs that the arrow, Home and End keys move between; "Restore
// template" resets the essay after an inline confirmation; Export saves the
// essay as a narrated beamdswitch Markdown deck and as JSON that imports back.
// The builder keeps its draft in localStorage, not the URL, and has no
// command palette or Markdown export apart from the deck; those checks
// assert the canonical contract and are recorded as findings in
// manifest/toulmin.json.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @typedef {import("../../lib/full.js").Opened} Opened */

/**
 * Open the builder, run `body`, check it stayed clean, and close it.
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
 * @param {string} act a data-act name
 */
const act = (page, act) => page.locator(`[data-act="${act}"]`);
/** @param {import("playwright").Page} page */
const claim = (page) => page.locator("#f-claim");
/** @param {import("playwright").Page} page */
const openExport = async (page) => {
  await act(page, "toggle-export").click();
  await page.locator("#export").waitFor({ state: "visible" });
};
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

await fullSuite("toulmin", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    const before = await s.page.evaluate(() => location.href);
    await s.page.getByRole("tab").nth(1).click();
    assert.equal(await s.page.getByRole("tab").nth(1).getAttribute("aria-selected"), "true");
    assert.notEqual(await s.page.evaluate(() => location.href), before, "the open argument is reflected in the URL");
  }),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    const entries = await s.page.evaluate(() => history.length);
    await s.page.getByRole("tab").nth(2).click();
    assert.ok(await s.page.evaluate(() => history.length) > entries, "opening another argument adds a history entry for Back to undo");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    const tabs = s.page.getByRole("tab");
    await tabs.first().focus();
    await s.page.keyboard.press("ArrowRight");
    assert.equal(await s.page.evaluate(() => document.activeElement?.getAttribute("role")), "tab");
    assert.equal(await tabs.nth(1).getAttribute("tabindex"), "0", "ArrowRight moves the roving tab stop to the next argument");
    await s.page.keyboard.press("Enter");
    assert.equal(await tabs.nth(1).getAttribute("aria-selected"), "true", "Enter opens the focused argument");
    await s.page.keyboard.press("End");
    assert.equal(await tabs.last().getAttribute("tabindex"), "0", "End moves to the last argument");
    await s.page.keyboard.press("Home");
    assert.equal(await tabs.first().getAttribute("tabindex"), "0", "Home moves to the first argument");
    await act(s.page, "toggle-examples").click();
    await s.page.locator("#examples-menu").waitFor({ state: "visible" });
    await s.page.keyboard.press("Escape");
    assert.equal(await s.page.locator("#examples-menu").isVisible(), false, "Escape closes the examples menu");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    const palette = s.page.locator("[role=dialog]:visible, [role=combobox]:visible, dialog[open]");
    assert.ok(await palette.count() > 0, "Cmd/Ctrl+K opens a command palette");
  }),

  reset: (ctx) => using(ctx.open, async (s) => {
    const original = await claim(s.page).inputValue();
    await claim(s.page).fill("Something else entirely.");
    await act(s.page, "restore").click();
    await act(s.page, "confirm-yes").click();
    await s.page.locator("#toast").getByText("Template restored.").waitFor();
    assert.equal(await claim(s.page).inputValue(), original, "Restore template brings back the template's claim");
  }),

  "json-round-trip": (ctx) => using(ctx.open, async (s) => {
    await s.page.locator("#e-title").fill("Round trip essay");
    await claim(s.page).fill("A claim that must survive the trip.");
    await openExport(s.page);
    const file = await saved(s.page, () => act(s.page, "dl-json").click());
    assert.equal(file.name, "round-trip-essay.json");
    const json = JSON.parse(file.text);
    assert.equal(json.format, "toulmin-essay");
    await s.page.getByRole("button", { name: "New essay" }).click();
    await act(s.page, "confirm-yes").click();
    assert.equal(await claim(s.page).inputValue(), "", "a new essay starts empty");
    await s.page.locator("#x-import").setInputFiles({ name: file.name, mimeType: "application/json", buffer: Buffer.from(file.text) });
    await s.page.locator("#toast").getByText("Essay imported.").waitFor();
    assert.equal(await s.page.locator("#e-title").inputValue(), "Round trip essay");
    assert.equal(await claim(s.page).inputValue(), "A claim that must survive the trip.", "importing the saved JSON restores the essay");
    const again = await saved(s.page, () => act(s.page, "dl-json").click());
    assert.deepEqual(JSON.parse(again.text), json, "the re-exported JSON is identical");
  }),

  "markdown-export": (ctx) => markdownExport(ctx.open, (page) => claim(page).fill("A marker claim for the export."), "A marker claim for the export.", '[data-act="dl-md"], [data-act="copy-md"]'),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    await openExport(s.page);
    await s.page.locator("#x-voice").selectOption("bm_george");
    const file = await saved(s.page, () => act(s.page, "dl-md").click());
    assertBeamdswitchDeck(file.text);
    assert.match(file.text, /^voice: "bm_george"$/m, "the deck uses the chosen voice");
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.getByRole("tab").nth(1).click();
    await act(page, "toggle-outline").click();
  }),
});
