// Kent (Words of Estimative Probability): the fuller section-28 checks. The
// claim, probability and confidence live in the query string (?q=…&p=…&c=…);
// the ruler and arrow keys move the probability; Cmd/Ctrl+K opens the command
// and concept palette, whose "Reset" command clears the estimate; the data
// panel exports and imports a JSON file, and the deck buttons save a
// beamdswitch deck.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, output, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const percent = (page) => page.locator("#p-input").inputValue();

/**
 * Run a palette command by typing its title.
 * @param {import("playwright").Page} page
 * @param {string} title
 */
async function command(page, title) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#palette").waitFor({ state: "visible" });
  await page.locator("#pal-in").fill(title);
  await page.locator("#pal-in").press("Enter");
}

await fullSuite("kent", {
  "url-state": async ({ open }) => {
    const s = await open("?q=It+rains+this+evening&p=72&c=high");
    try {
      assert.equal(await percent(s.page), "72%", "the link restores the probability");
      assert.equal(await s.page.locator("#claim").inputValue(), "It rains this evening", "the link restores the claim");
      assert.equal(await s.page.locator("[data-conf=high]").getAttribute("aria-pressed"), "true", "the link restores the confidence");
      await s.page.locator("#ruler").focus();
      await s.page.keyboard.press("ArrowRight");
      await s.page.waitForFunction(() => /[?&]p=73(&|$)/.test(location.search));
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open("?p=40");
    try {
      await s.page.locator("#ruler").focus();
      await s.page.keyboard.press("Shift+ArrowRight");
      await s.page.waitForFunction(() => /[?&]p=45(&|$)/.test(location.search));
      const here = s.page.url().split("?")[0];
      await s.page.goBack();
      assert.equal(s.page.url().split("?")[0], here, "Back stays in the visual and steps back to the previous estimate (spec section 12)");
      await s.page.waitForFunction(() => /[?&]p=40(&|$)/.test(location.search), undefined, { timeout: 5_000 });
      assert.equal(await percent(s.page), "40%", "Back restores the previous probability");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open("?p=50");
    try {
      await s.page.locator("#ruler").focus();
      await s.page.keyboard.press("ArrowRight");
      assert.equal(await percent(s.page), "51%", "ArrowRight adds one point");
      await s.page.keyboard.press("Shift+ArrowLeft");
      assert.equal(await percent(s.page), "46%", "Shift+ArrowLeft takes five");
      await s.page.keyboard.press("End");
      assert.equal(await percent(s.page), "100%", "End goes to certainty");
      assert.equal(await s.page.locator("#ruler").getAttribute("aria-valuenow"), "100", "the ruler reports its value");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open();
    try {
      await s.page.keyboard.press("ControlOrMeta+k");
      await s.page.locator("#palette").waitFor({ state: "visible" });
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "pal-in", "the palette focuses its search field");
      await s.page.locator("#pal-in").fill("Decision threshold");
      await s.page.locator("#pal-in").press("Enter");
      assert.equal(await s.page.locator("#palette").isVisible(), false, "choosing a command closes the palette");
      assert.equal(await s.page.locator("#tab-decision").getAttribute("aria-expanded"), "true", "the command opens the decision panel");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open("?q=The+bus+is+late&p=80");
    try {
      assert.equal(await percent(s.page), "80%");
      await command(s.page, "Reset");
      assert.equal(await percent(s.page), "50%", "Reset returns the probability to 50%");
      assert.equal(await s.page.locator("#claim").inputValue(), "", "Reset clears the claim");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open("?q=The+parcel+arrives+today&p=64&c=medium");
    let exported;
    try {
      await command(s.page, "Export, import or delete data");
      exported = await saved(s.page, () => s.page.locator("#data-export").click());
      assert.equal(exported.name, "kent-data.json");
      const data = JSON.parse(exported.text);
      assert.equal(data.format, "kent-visual");
      assert.equal(data.estimate.p, 64, "the export holds the probability");
      assert.equal(data.estimate.claim, "The parcel arrives today", "the export holds the claim");
      assertClean(s);
    } finally {
      await s.close();
    }
    const file = join(process.env.E2E_TMP ?? tmpdir(), `kent-import-${process.pid}.json`);
    await writeFile(file, exported.text);
    const t = await open();
    try {
      await command(t.page, "Export, import or delete data");
      await t.page.locator("#data-import").setInputFiles(file);
      await t.page.waitForFunction(() => /** @type {HTMLInputElement} */ (document.getElementById("p-input")).value === "64%");
      assert.equal(await t.page.locator("#claim").inputValue(), "The parcel arrives today", "importing restores the claim");
      const again = await saved(t.page, () => t.page.locator("#data-export").click());
      assert.deepEqual(JSON.parse(again.text).estimate, JSON.parse(exported.text).estimate, "export, import and export again gives the same estimate");
      assertClean(t);
    } finally {
      await t.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open("?q=The+parcel+arrives+today&p=64&c=medium");
    try {
      const copyMarkdown = s.page.getByRole("button", { name: /markdown|\.md\b/i }).and(s.page.locator(":not(#save-beamdswitch):not(#copy-beamdswitch)"));
      assert.ok(await copyMarkdown.count() > 0, "the page copies its session state as Markdown, separate from the beamdswitch deck (spec section 14)");
      const text = await output(s.page, copyMarkdown.first());
      assert.match(text, /^# /m, "the session is a Markdown document");
      assert.doesNotMatch(text, /^::: narration$/m, "the session Markdown is not the beamdswitch deck");
      assert.match(text, /The parcel arrives today/, "the session Markdown carries the claim on the page");
      assert.match(text, /64%/, "the session Markdown carries the page's probability");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open("?q=It+rains+this+evening&p=30");
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "kent-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /It rains this evening/, "the deck is about the claim on the page");
      assert.match(file.text, /30%/, "the deck carries the page's probability");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#ruler").focus();
    await page.keyboard.press("Shift+ArrowRight");
  }),
});
