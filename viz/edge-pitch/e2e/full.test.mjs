// Fastener edge margin and pitch visualiser: the fuller section-28 checks.
// The joint lives in the form (no URL state); Reset restores the placeholder
// joint; the inputs export as JSON and import back; the report exports as
// Markdown and as a beamdswitch deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

const END = "#in-geometry-eEnd";

await fullSuite("edge-pitch", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const before = await s.page.locator("#stats").textContent();
      await s.page.locator(END).focus();
      await s.page.keyboard.press("ControlOrMeta+a");
      await s.page.keyboard.type("8.4");
      await s.page.keyboard.press("Tab");
      await s.page.waitForFunction((b) => document.querySelector("#stats")?.textContent !== b, before);
      assert.equal(await s.page.locator(END).inputValue(), "8.4", "typing replaces the end distance");
      const us = s.page.locator("[data-units=US]");
      await us.focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await us.getAttribute("aria-pressed"), "true", "Enter on the US button switches units");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator(END).fill("8.4");
      await s.page.locator("#reset").click();
      assert.equal(await s.page.locator(END).inputValue(), "9.6", "Reset restores the placeholder end distance");
      assert.match(await s.page.locator("#status").innerText(), /Reset to the placeholder joint/);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator(END).fill("8.4");
      const file = await saved(s.page, () => s.page.locator("[data-dl=inputs]").click());
      assert.equal(file.name, "edge-pitch-inputs.json");
      assert.equal(JSON.parse(file.text).inputs.geometry.eEnd, 8.4, "the export carries the edited joint");
      await s.page.locator("#reset").click();
      await s.page.locator("#file").setInputFiles({ name: file.name, mimeType: "application/json", buffer: Buffer.from(file.text) });
      await s.page.waitForFunction(() => /Imported inputs JSON/.test(document.querySelector("#status")?.textContent ?? ""));
      assert.equal(await s.page.locator(END).inputValue(), "8.4", "importing the file restores the edited joint");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("[data-dl=md]").click());
      assert.equal(file.name, "edge-pitch-report.md");
      assert.match(file.text, /^# Fastener edge margin and pitch report/);
      assert.match(file.text, /Not for certification/, "the report repeats the disclaimer");
      assert.match(file.text, /\| End distance e_end \| 9\.6 mm \|/, "the report shows the page's inputs");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "edge-pitch-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /Not for certification/);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator(END).fill("8.4");
  }),
});
