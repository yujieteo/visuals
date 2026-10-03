// Singapore haze, region by region: the fuller section-28 checks. A slider
// picks the hour (the arrow keys step it), the space bar plays and pauses the
// timeline, buttons switch the measure and jump to the first hour or the
// peak, and the deck buttons save a beamdswitch deck of the hour shown. The
// page keeps no state in the URL and has no command palette, Reset control,
// JSON export or session Markdown, which are recorded as findings.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const now = (page) => page.locator("#now").innerText();

/**
 * Click a control that saves a file or copies text, and return that text. The
 * clipboard is a stand-in, so no browser asks for permission.
 * @param {import("playwright").Page} page
 * @param {import("playwright").Locator} control
 */
async function output(page, control) {
  await page.evaluate(() => {
    const w = /** @type {Window & { __copied?: string }} */ (window);
    delete w.__copied;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (/** @type {string} */ t) => { w.__copied = t; } } });
  });
  const download = page.waitForEvent("download", { timeout: 5_000 });
  const copied = page.waitForFunction(() => /** @type {Window & { __copied?: string }} */ (window).__copied, undefined, { timeout: 5_000 });
  await control.click();
  const first = await Promise.any([download, copied]);
  download.catch(() => {});
  copied.catch(() => {});
  return "path" in first ? readFile(await first.path(), "utf8") : String(await first.jsonValue());
}

await fullSuite("haze-singapore", {
  "url-state": async ({ open }) => {
    const s = await open();
    try {
      const before = s.page.url();
      await s.page.locator("#peak").click();
      await s.page.locator("[data-metric=pm1]").click();
      assert.notEqual(s.page.url(), before, "choosing the hour and measure records them in the URL (spec section 12)");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#start").click();
      const first = await now(s.page);
      await s.page.locator("#peak").click();
      const here = s.page.url();
      await s.page.goBack();
      assert.equal(s.page.url().split("#")[0].split("?")[0], here.split("#")[0].split("?")[0], "Back stays in the visual and steps back through its states (spec section 12)");
      assert.equal(await now(s.page), first, "Back returns to the previous hour");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#start").click();
      const slider = s.page.locator("#slider");
      assert.equal(await slider.inputValue(), "0", "First hour moves the slider to the start");
      const first = await now(s.page);
      await slider.focus();
      await s.page.keyboard.press("ArrowRight");
      assert.equal(await slider.inputValue(), "1", "ArrowRight steps one hour");
      assert.notEqual(await now(s.page), first, "the readings follow the hour");
      // The space bar plays and pauses when nothing else has focus.
      await s.page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
      await s.page.keyboard.press(" ");
      assert.equal(await s.page.locator("#play").getAttribute("aria-pressed"), "true", "space starts playback");
      await s.page.keyboard.press(" ");
      assert.equal(await s.page.locator("#play").getAttribute("aria-pressed"), "false", "space pauses it");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open();
    try {
      await s.page.keyboard.press("ControlOrMeta+k");
      assert.ok(await s.page.getByRole("dialog").isVisible().catch(() => false), "Cmd/Ctrl+K opens a command palette (spec section 11)");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#peak").click();
      await s.page.locator("[data-metric=pm1]").click();
      const resetButton = s.page.getByRole("button", { name: /^reset/i });
      assert.ok(await resetButton.count() > 0, "the page has a Reset control (spec section 28)");
      await resetButton.first().click();
      assert.equal(await s.page.locator("[data-metric=psi]").getAttribute("aria-pressed"), "true", "Reset returns to the PSI view");
      const fresh = await open();
      try {
        assert.equal(await now(s.page), await now(fresh.page), "Reset returns to the hour the page opens on");
      } finally {
        await fresh.close();
      }
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    let exported;
    let hour;
    try {
      await s.page.locator("#peak").click();
      await s.page.locator("[data-metric=pm1]").click();
      hour = await now(s.page);
      const exportJson = s.page.getByRole("button", { name: /^(save|export|download|copy)\b.*\bjson\b/i });
      assert.ok(await exportJson.count() > 0, "the page exports and imports its view as JSON (spec section 14)");
      exported = await output(s.page, exportJson.first());
      JSON.parse(exported);
      assertClean(s);
    } finally {
      await s.close();
    }
    const t = await open();
    try {
      const importJson = t.page.getByRole("button", { name: /^(load|import|open)\b.*\bjson\b/i });
      assert.ok(await importJson.count() > 0, "the page imports its view from JSON (spec section 14)");
      const [chooser] = await Promise.all([t.page.waitForEvent("filechooser", { timeout: 5_000 }), importJson.first().click()]);
      await chooser.setFiles({ name: "haze-singapore.json", mimeType: "application/json", buffer: Buffer.from(exported) });
      await t.page.waitForFunction((h) => document.getElementById("now")?.innerText === h, hour, { timeout: 5_000 });
      assert.equal(await t.page.locator("[data-metric=pm1]").getAttribute("aria-pressed"), "true", "importing restores the measure");
      assert.deepEqual(JSON.parse(await output(t.page, t.page.getByRole("button", { name: /^(save|export|download|copy)\b.*\bjson\b/i }).first())), JSON.parse(exported), "export, import and export again gives the same view");
      assertClean(t);
    } finally {
      await t.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#peak").click();
      await s.page.locator("[data-metric=pm1]").click();
      const copyMarkdown = s.page.getByRole("button", { name: /markdown|\.md\b/i }).and(s.page.locator(":not(#save-beamdswitch):not(#copy-beamdswitch)"));
      assert.ok(await copyMarkdown.count() > 0, "the page copies its session state as Markdown, separate from the beamdswitch deck (spec section 14)");
      const text = await output(s.page, copyMarkdown.first());
      assert.match(text, /^# /m, "the session is a Markdown document");
      assert.doesNotMatch(text, /^::: narration$/m, "the session Markdown is not the beamdswitch deck");
      assert.ok(text.includes(await now(s.page)), "the session Markdown names the hour shown");
      assert.match(text, /PM2\.5/, "the session Markdown names the measure shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#peak").click();
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.match(file.name, /\.md$/);
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /Singapore haze, region by region/, "the deck has the visual's title");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#peak").click();
  }),
});
