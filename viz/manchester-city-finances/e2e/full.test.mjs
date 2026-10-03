// What Manchester City's charges and accounts do and do not show: the fuller
// section-28 checks. Lane buttons (aria-pressed) filter the timeline; every
// item is a focusable mark (role=button) that opens its scope and source in
// the detail panel; the lane and item shown download as a beamdswitch deck.
// It has no URL state, history, palette, reset, JSON or Markdown export.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const detailTitle = (page) => page.locator("#detail h2").textContent();
/** @param {import("playwright").Page} page */
const items = (page) => page.locator("#chart [role=button]");
/** @param {import("playwright").Page} page @param {string} lane */
const lane = (page, lane) => page.locator("#controls button", { hasText: lane });
/**
 * The Markdown the page exports of its own state, saved as a file or copied:
 * the first button or link named for Markdown or .md that is not the
 * beamdswitch deck.
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
async function markdownExport(page) {
  const name = /^(?!.*(deck|beamdswitch)).*(markdown|\.md\b)/i;
  const control = page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();
  assert.ok(await control.count() > 0, "the page offers a Markdown export of its state, separate from the beamdswitch deck");
  await page.evaluate(() => {
    if (navigator.clipboard) navigator.clipboard.writeText = async (text) => { /** @type {Window & { e2eCopied?: string }} */ (window).e2eCopied = text; };
  });
  const download = page.waitForEvent("download", { timeout: 10_000 }).then(async (d) => readFile(await d.path(), "utf8"));
  const copied = page.waitForFunction(() => /** @type {Window & { e2eCopied?: string }} */ (window).e2eCopied, null, { timeout: 10_000 })
    .then((h) => /** @type {Promise<string>} */ (h.jsonValue()));
  await control.click();
  const text = await Promise.any([download, copied]).catch(() => assert.fail("the Markdown export neither saved a file nor copied text"));
  assert.match(text, /^#{1,3} \S/m, "the export is Markdown with a heading");
  return text;
}

await fullSuite("manchester-city-finances", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const all = await items(s.page).count();
      await lane(s.page, "Filed accounts").focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await lane(s.page, "Filed accounts").getAttribute("aria-pressed"), "true", "Enter on a lane selects it");
      assert.ok(await items(s.page).count() < all, "the timeline keeps only that lane");
      const first = items(s.page).first();
      await first.focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await detailTitle(s.page), await first.getAttribute("aria-label"), "Enter on a mark opens it in the detail panel");
      await items(s.page).last().focus();
      await s.page.keyboard.press(" ");
      assert.equal(await detailTitle(s.page), await items(s.page).last().getAttribute("aria-label"), "Space opens a mark too");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: a Markdown export of the lane and item shown, separate from the beamdswitch deck.
  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await lane(s.page, "Filed accounts").click();
      const label = /** @type {string} */ (await items(s.page).last().getAttribute("aria-label"));
      await items(s.page).last().click();
      const text = await markdownExport(s.page);
      assert.ok(text.includes(label), "the export carries the selected item");
      assert.match(text, /Filed accounts/, "the export carries the lane shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await lane(s.page, "Filed accounts").click();
      const label = /** @type {string} */ (await items(s.page).last().getAttribute("aria-label"));
      await items(s.page).last().click();
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "manchester-city-finances-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.ok(file.text.includes(`## Selected: ${label}`), "the selected item leads the results");
      assert.ok(!file.text.includes("## 6 alleged periods"), "a lane filter leaves the other lanes' slides out");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await lane(page, "Separate UEFA case").click();
    await items(page).first().click();
  }),
});
