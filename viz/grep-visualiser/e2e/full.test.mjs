// Grep Visualiser: the fuller section-28 checks. The presets are a radio
// group (arrow keys move between them), a typed command line applies its
// flags on Enter, and the pattern and input persist in localStorage. The page
// keeps no state in the URL and has no command palette, Reset control or file
// export, which are recorded as findings.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertClean, assertDarkMode, assertReducedMotion, fullSuite } from "../../lib/full.js";

/**
 * Type a pattern into the first pattern field and wait for the result to follow it.
 * @param {import("playwright").Page} page
 * @param {string} pattern
 */
async function search(page, pattern) {
  const before = await page.locator("#status").innerText();
  await page.locator("#pat-0").fill(pattern);
  await page.waitForFunction((b) => document.getElementById("status")?.innerText !== b, before, { timeout: 5_000 }).catch(() => {});
}

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

/**
 * The preset labels. Each radio is a 1px invisible input, so a user, and this
 * suite, clicks its label rather than the radio itself.
 * @param {import("playwright").Page} page
 */
const presets = (page) => page.locator("label:has(input[name=preset])");

/** @param {import("playwright").Page} page */
const exportJson = (page) => page.getByRole("button", { name: /^(save|export|download|copy)\b.*\bjson\b/i });

await fullSuite("grep-visualiser", {
  "url-state": async ({ open }) => {
    const s = await open();
    try {
      const before = s.page.url();
      await search(s.page, "fo+");
      assert.notEqual(s.page.url(), before, "editing the pattern records the state in the URL (spec section 12)");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open();
    try {
      const first = await s.page.locator("input[name=preset]:checked").getAttribute("value");
      await presets(s.page).nth(1).click();
      const here = s.page.url();
      await s.page.goBack();
      assert.equal(s.page.url().split("#")[0].split("?")[0], here.split("#")[0].split("?")[0], "Back stays in the visual and steps back through its states (spec section 12)");
      assert.equal(await s.page.locator("input[name=preset]:checked").getAttribute("value"), first, "Back restores the previous preset");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const radios = s.page.locator("input[name=preset]");
      await presets(s.page).first().click();
      await radios.first().focus();
      const engine = await s.page.locator("#model").innerText();
      await s.page.keyboard.press("ArrowRight");
      assert.equal(await radios.nth(1).isChecked(), true, "ArrowRight selects the next preset");
      await s.page.waitForFunction((e) => document.getElementById("model")?.innerText !== e, engine);
      // The typed command line applies its flags on Enter.
      await s.page.locator("#typed").fill("-i");
      await s.page.locator("#typed").press("Enter");
      assert.equal(await s.page.locator("#typed").inputValue(), "", "Enter applies the typed flags and clears the field");
      await s.page.waitForFunction(() => /\s-i\b/.test(document.getElementById("command")?.innerText ?? ""), undefined, { timeout: 5_000 });
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
      const initial = await s.page.locator("#pat-0").inputValue();
      await search(s.page, "zz+");
      const resetButton = s.page.getByRole("button", { name: /^reset/i });
      assert.ok(await resetButton.count() > 0, "the page has a Reset control (spec section 28)");
      await resetButton.first().click();
      assert.equal(await s.page.locator("#pat-0").inputValue(), initial, "Reset restores the starting pattern");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    let exported;
    try {
      await search(s.page, "fo+");
      assert.ok(await exportJson(s.page).count() > 0, "the page exports its state as JSON (spec section 14)");
      exported = await output(s.page, exportJson(s.page).first());
      JSON.parse(exported);
      assertClean(s);
    } finally {
      await s.close();
    }
    const t = await open();
    try {
      const importJson = t.page.getByRole("button", { name: /^(load|import|open)\b.*\bjson\b/i });
      assert.ok(await importJson.count() > 0, "the page imports its state from JSON (spec section 14)");
      const [chooser] = await Promise.all([t.page.waitForEvent("filechooser", { timeout: 5_000 }), importJson.first().click()]);
      await chooser.setFiles({ name: "grep-visualiser.json", mimeType: "application/json", buffer: Buffer.from(exported) });
      await t.page.waitForFunction(() => /** @type {HTMLInputElement | null} */ (document.getElementById("pat-0"))?.value === "fo+", undefined, { timeout: 5_000 });
      assert.deepEqual(JSON.parse(await output(t.page, exportJson(t.page).first())), JSON.parse(exported), "export, import and export again gives the same state");
      assertClean(t);
    } finally {
      await t.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await search(s.page, "fo+");
      const copyMarkdown = s.page.getByRole("button", { name: /markdown|\.md\b/i }).and(s.page.locator(":not(#save-beamdswitch):not(#copy-beamdswitch)"));
      assert.ok(await copyMarkdown.count() > 0, "the page copies its session state as Markdown (spec section 14)");
      const text = await output(s.page, copyMarkdown.first());
      assert.match(text, /^# /m, "the session is a Markdown document");
      assert.doesNotMatch(text, /^::: narration$/m, "the session Markdown is not the beamdswitch deck");
      assert.ok(text.includes("fo+"), "the session Markdown carries the pattern on the page");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await presets(page).nth(1).click();
  }),
});
