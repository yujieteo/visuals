// Subsidy Atlas: the fuller section-28 checks. Four filters, a search box and
// a depth × lifecycle matrix narrow the catalogue; "Reset filters" clears
// them; the beamdswitch button saves the records shown as a narrated
// Markdown deck. The atlas keeps no URL state, history entries, command
// palette, JSON state file or Markdown export apart from the deck; those
// checks assert the canonical contract and are recorded as findings in
// manifest/subsidy-atlas.json.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, fullSuite, jsonRoundTrip, markdownExport, saved, using } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const count = (page) => page.locator("#count").innerText();
/** @param {import("playwright").Page} page */
const shown = (page) => page.locator("[data-product]:visible").count();
/** @param {import("playwright").Page} page */
const chooseCategory = (page) => page.getByLabel("Categories").selectOption("llm");

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
