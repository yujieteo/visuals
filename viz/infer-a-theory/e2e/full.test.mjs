// Infer a Theory: the fuller section-28 checks. Observations are typed in
// English and interpreted with Cmd/Ctrl+Enter, the scale ladder is a slider
// the arrow keys move, "Reset to the worked example" restores the example and
// the deck buttons, under "Export a talk", save a beamdswitch deck. The page keeps no state in the
// URL, has no command palette and no JSON file export, which are recorded as
// findings.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/**
 * Wait for the inference the page starts on load to finish ("Done: … theories").
 * @param {import("playwright").Page} page
 */
const inferred = (page) => page.waitForFunction(() => /^Done:/.test(document.getElementById("progress")?.textContent ?? ""), undefined, { timeout: 90_000 });

/** @param {import("playwright").Page} page */
const firstObservation = (page) => page.locator("#t-0").inputValue();

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

/** @param {import("playwright").Page} page */
const exportJson = (page) => page.getByRole("button", { name: /^(save|export|download|copy)\b.*\bjson\b/i });

await fullSuite("infer-a-theory", {
  "url-state": async ({ open }) => {
    const s = await open();
    try {
      const before = s.page.url();
      await s.page.locator("#load-binary").click();
      assert.notEqual(s.page.url(), before, "loading the binary example records the state in the URL (spec section 12)");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open();
    try {
      const first = await firstObservation(s.page);
      await s.page.locator("#load-binary").click();
      const here = s.page.url();
      await s.page.goBack();
      assert.equal(s.page.url().split("#")[0].split("?")[0], here.split("#")[0].split("?")[0], "Back stays in the visual and steps back through its states (spec section 12)");
      assert.equal(await firstObservation(s.page), first, "Back restores the worked example");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      // The scale ladder has its rungs once the first inference has run.
      await inferred(s.page);
      const slider = s.page.locator("#scale-slider");
      const before = await slider.inputValue();
      const reading = await s.page.locator("#scale-read").innerText();
      await slider.focus();
      await s.page.keyboard.press(Number(before) > 0 ? "ArrowLeft" : "ArrowRight");
      assert.notEqual(await slider.inputValue(), before, "the arrow keys move the scale ladder");
      await s.page.waitForFunction((r) => document.getElementById("scale-read")?.innerText !== r, reading);
      // Cmd/Ctrl+Enter in an observation interprets it.
      await s.page.locator("#t-0").fill("The values are usually positive.");
      await s.page.locator("#t-0").press("ControlOrMeta+Enter");
      await s.page.waitForFunction(() => /positive|location|mean|median|sign/i.test(document.querySelector("[data-card='0']")?.textContent ?? ""));
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
      const first = await firstObservation(s.page);
      await s.page.locator("#start-own").click();
      assert.equal(await s.page.locator("#t-0").count(), 0, "starting your own clears the example's observations");
      await s.page.locator("#reset").click();
      assert.equal(await firstObservation(s.page), first, "Reset restores the worked example");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    let exported;
    let binary;
    try {
      await s.page.locator("#load-binary").click();
      binary = await firstObservation(s.page);
      assert.ok(await exportJson(s.page).count() > 0, "the page exports and imports its state as JSON (spec section 14)");
      exported = await output(s.page, exportJson(s.page).first());
      JSON.parse(exported);
      assertClean(s);
    } finally {
      await s.close();
    }
    const t = await open();
    try {
      assert.notEqual(await firstObservation(t.page), binary, "a fresh page opens on the worked example");
      const importJson = t.page.getByRole("button", { name: /^(load|import|open)\b.*\bjson\b/i });
      assert.ok(await importJson.count() > 0, "the page imports its state from JSON (spec section 14)");
      const [chooser] = await Promise.all([t.page.waitForEvent("filechooser", { timeout: 5_000 }), importJson.first().click()]);
      await chooser.setFiles({ name: "infer-a-theory.json", mimeType: "application/json", buffer: Buffer.from(exported) });
      await t.page.waitForFunction((v) => /** @type {HTMLInputElement | null} */ (document.getElementById("t-0"))?.value === v, binary, { timeout: 5_000 });
      assert.deepEqual(JSON.parse(await output(t.page, exportJson(t.page).first())), JSON.parse(exported), "export, import and export again gives the same state");
      assertClean(t);
    } finally {
      await t.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#load-binary").click();
      await inferred(s.page);
      const copyMarkdown = s.page.getByRole("button", { name: /markdown|\.md\b/i }).and(s.page.locator(":not(#save-beamdswitch):not(#copy-beamdswitch)"));
      assert.ok(await copyMarkdown.count() > 0, "the page copies its session state as Markdown, separate from the beamdswitch deck (spec section 14)");
      const text = await output(s.page, copyMarkdown.first());
      assert.match(text, /^# /m, "the session is a Markdown document");
      assert.doesNotMatch(text, /^::: narration$/m, "the session Markdown is not the beamdswitch deck");
      assert.ok(text.includes(await firstObservation(s.page)), "the session Markdown carries the observations on the page");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await inferred(s.page);
      await s.page.locator("summary", { hasText: "Export a talk" }).click();
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "infer-a-theory-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await inferred(page);
    await page.locator("#rg-run").click();
  }),
});
