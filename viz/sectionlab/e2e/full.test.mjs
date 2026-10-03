// Sectionlab: the fuller section-28 checks. A model is shared as a link
// (#model=…); the section editor takes the keyboard (arrows move the selected
// part, Ctrl/Cmd+Z undoes); choosing a preset replaces the model; the Markdown
// report carries a YAML model block that imports back; beamdswitch saves a deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const stats = async (page) => (await page.locator("#stats").textContent() ?? "").replace(/\s+/g, " ").trim();
/**
 * @param {import("playwright").Page} page
 * @param {string} before
 */
const statsChange = (page, before) => page.waitForFunction((b) => (document.getElementById("stats")?.textContent ?? "").replace(/\s+/g, " ").trim() !== b, before);
/**
 * Load a preset by its value in the preset menu.
 * @param {import("playwright").Page} page
 * @param {string} id
 */
async function preset(page, id) {
  if (await page.locator("#preset").inputValue() === id) return;
  const before = await stats(page);
  await page.locator("#preset").selectOption(id);
  await statsChange(page, before);
}

await fullSuite("sectionlab", {
  "url-state": async ({ open }) => {
    const s = await open();
    try {
      await preset(s.page, "chs");
      const shown = await stats(s.page);
      await s.page.locator("#share").click();
      await s.page.waitForFunction(() => location.hash.startsWith("#model="));
      const hash = await s.page.evaluate(() => location.hash);
      const again = await open(hash);
      try {
        assert.equal(await stats(again.page), shown, "the share link reopens the same section");
        assertClean(again);
      } finally {
        await again.close();
      }
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await preset(s.page, "tee-hole");
      const before = await stats(s.page);
      await s.page.locator("#canvas").focus();
      await s.page.keyboard.press("]");
      await s.page.keyboard.press("Shift+ArrowUp");
      await statsChange(s.page, before);
      await s.page.keyboard.press("ControlOrMeta+z");
      await s.page.waitForFunction((b) => (document.getElementById("stats")?.textContent ?? "").replace(/\s+/g, " ").trim() === b, before);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // A Reset control must restore the opening state after a change; re-choosing a preset is not Reset.
  reset: async ({ open }) => {
    const s = await open();
    try {
      const opening = await stats(s.page);
      await s.page.locator("#canvas").focus();
      await s.page.keyboard.press("]");
      await s.page.keyboard.press("Shift+ArrowUp");
      await s.page.keyboard.press("Shift+ArrowRight");
      await statsChange(s.page, opening);
      const reset = s.page.getByRole("button", { name: /^(reset|start over|clear all)\b/i });
      assert.ok(await reset.count(), "the editor has no Reset control");
      await reset.first().click();
      await s.page.waitForFunction((b) => (document.getElementById("stats")?.textContent ?? "").replace(/\s+/g, " ").trim() === b, opening);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await preset(s.page, "angle");
      const shown = await stats(s.page);
      const file = await saved(s.page, () => s.page.locator("#dl-md").click());
      assert.match(file.name, /\.md$/);
      assert.match(file.text, /```ya?ml\n[\s\S]*sectionlab: 1[\s\S]*```/, "the report carries the YAML model block");
      await preset(s.page, "rhs");
      assert.notEqual(await stats(s.page), shown);
      await s.page.locator("#import-file").setInputFiles({ name: file.name, mimeType: "text/markdown", buffer: Buffer.from(file.text) });
      await s.page.waitForFunction((b) => (document.getElementById("stats")?.textContent ?? "").replace(/\s+/g, " ").trim() === b, shown);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.match(file.name, /\.md$/);
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await preset(page, "ipe");
  }),
});
