// Structural stability: the fuller section-28 checks. Tabs choose the check
// (column, beam-column, shear panel, diagonal tension); the inputs, the SI/US
// switch and the material preset drive it; the inputs JSON round-trips through
// Import; the Markdown report and the beamdswitch deck save the tab as set.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const stats = async (page) => (await page.locator("#stats").textContent() ?? "").replace(/\s+/g, " ").trim();
/**
 * @param {import("playwright").Page} page
 * @param {string} before
 */
const statsChange = (page, before) => page.waitForFunction((b) => (document.getElementById("stats")?.textContent ?? "").replace(/\s+/g, " ").trim() !== b, before);
/** The first number field of the current tab's inputs. @param {import("playwright").Page} page */
const firstNumber = (page) => page.locator("#inputs input[type=number]").first();

await fullSuite("stability", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const before = await stats(s.page);
      await s.page.locator("[data-tab]").nth(1).focus();
      await s.page.keyboard.press("Enter");
      await s.page.waitForFunction(() => document.querySelectorAll("[data-tab][aria-selected=true]")[0]?.id === document.querySelectorAll("[data-tab]")[1]?.id);
      await statsChange(s.page, before);
      const tabStats = await stats(s.page);
      await firstNumber(s.page).focus();
      await s.page.keyboard.press("ArrowUp");
      await statsChange(s.page, tabStats);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // A Reset control must restore the opening inputs after a change; re-choosing a material preset is not Reset.
  reset: async ({ open }) => {
    const s = await open();
    try {
      const opening = await stats(s.page);
      const field = firstNumber(s.page);
      await field.fill(String(Number(await field.inputValue()) * 2));
      await field.dispatchEvent("input");
      await statsChange(s.page, opening);
      const reset = s.page.getByRole("button", { name: /^(reset|start over|clear all)\b/i });
      assert.ok(await reset.count(), "the page has no Reset control");
      await reset.first().click();
      await s.page.waitForFunction((b) => (document.getElementById("stats")?.textContent ?? "").replace(/\s+/g, " ").trim() === b, opening);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    try {
      const opening = await stats(s.page);
      const field = firstNumber(s.page);
      await field.fill(String(Number(await field.inputValue()) * 1.5));
      await field.dispatchEvent("input");
      await statsChange(s.page, opening);
      const shown = await stats(s.page);
      const file = await saved(s.page, () => s.page.locator("[data-exp=inputs][data-act=download]").click());
      assert.match(file.name, /\.json$/);
      const doc = JSON.parse(file.text);
      assert.equal(typeof doc, "object", "the inputs file is a JSON document");
      await field.fill(String(Number(await field.inputValue()) * 2));
      await field.dispatchEvent("input");
      await statsChange(s.page, shown);
      await s.page.locator("#file").setInputFiles({ name: file.name, mimeType: "application/json", buffer: Buffer.from(file.text) });
      await s.page.waitForFunction((b) => (document.getElementById("stats")?.textContent ?? "").replace(/\s+/g, " ").trim() === b, shown);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      const field = firstNumber(s.page), key = await field.getAttribute("data-k") ?? "";
      await field.fill("4321");
      await field.dispatchEvent("input");
      const file = await saved(s.page, () => s.page.locator("[data-exp=md][data-act=download]").click());
      assert.match(file.name, /^stability-.+\.md$/);
      assert.match(file.text, /^## Inputs$/m, "the report lists the inputs");
      assert.match(file.text, /\| 4321( [^|]*)? \|/, `the report has the input as set (field ${key})`);
      await s.page.locator("[data-exp=md][data-act=copy]").click();
      await s.page.waitForFunction(() => /** @type {HTMLTextAreaElement} */ (document.getElementById("paste")).value.length > 0);
      assert.equal(await s.page.locator("#paste").inputValue(), file.text, "Copy gives the same Markdown as the download");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.match(file.name, /^stability-.+-beamdswitch\.md$/);
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("[data-tab]").nth(2).click();
  }),
});
