// Phasor and Impedance Visualiser: the fuller section-28 checks. The circuit
// lives in the URL fragment (written with replaceState, so it adds no history
// entries); each quantity has a text field and a logarithmic slider; JSON, a
// Markdown report and a beamdswitch deck download, and JSON imports back.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const sentence = (page) => page.locator("#sentence").textContent();
/**
 * The sentence is a polite live region that is rate-limited, so wait for it to say something other than `not`.
 * @param {import("playwright").Page} page @param {string | null} not
 */
const sentenceChanged = async (page, not) => {
  await page.waitForFunction((n) => { const t = document.getElementById("sentence")?.textContent; return !!t && t !== n; }, not);
  return sentence(page);
};
/** @param {import("playwright").Page} page @param {string} text */
const setFrequency = async (page, text) => {
  await page.locator("#in-f").fill(text);
  await page.locator("#in-f").press("Enter");
  await page.locator("#in-f").blur();
};

await fullSuite("phasors", {
  "url-state": async ({ open }) => {
    const s = await open();
    try {
      const first = await sentence(s.page);
      await setFrequency(s.page, "5k");
      await s.page.waitForFunction(() => location.hash.includes("f=5000&"));
      const said = await sentenceChanged(s.page, first), hash = await s.page.evaluate(() => location.hash);
      const restored = await open(hash);
      try {
        assert.equal(await restored.page.locator("#in-f").inputValue(), "5 kHz", "the link restores the frequency");
        assert.equal(await sentence(restored.page), said, "the link restores the result");
        assertClean(restored);
      } finally {
        await restored.close();
      }
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const before = await s.page.locator("#in-f").inputValue();
      await s.page.locator("#sl-f").focus();
      for (let i = 0; i < 20; i++) await s.page.keyboard.press("ArrowRight");
      await s.page.waitForFunction((b) => /** @type {HTMLInputElement} */ (document.getElementById("in-f")).value !== b, before);
      await s.page.waitForFunction(() => !location.hash.includes("f=2400&"));
      const raised = await s.page.locator("#in-f").inputValue();
      for (let i = 0; i < 40; i++) await s.page.keyboard.press("ArrowLeft");
      await s.page.waitForFunction((r) => /** @type {HTMLInputElement} */ (document.getElementById("in-f")).value !== r, raised);
      assert.notEqual(await s.page.locator("#in-f").inputValue(), raised, "ArrowLeft on the slider lowers the frequency");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    try {
      const first = await sentence(s.page);
      await setFrequency(s.page, "5k");
      await s.page.waitForFunction(() => location.hash.includes("f=5000&"));
      const said = await sentenceChanged(s.page, first);
      const file = await saved(s.page, () => s.page.locator("#dl-json").click());
      assert.equal(file.name, "phasors-circuit.json");
      assert.equal(JSON.parse(file.text).inputs.f, 5000);
      await setFrequency(s.page, "100");
      await s.page.waitForFunction(() => location.hash.includes("f=100&"));
      await sentenceChanged(s.page, said);
      await s.page.locator("#import").setInputFiles({ name: file.name, mimeType: "application/json", buffer: Buffer.from(file.text) });
      await s.page.waitForFunction(() => document.getElementById("io-msg")?.textContent === "Imported phasors-circuit.json.");
      assert.equal(await s.page.locator("#in-f").inputValue(), "5 kHz", "the import restores the frequency");
      await s.page.waitForFunction((t) => document.getElementById("sentence")?.textContent === t, said);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      const first = await sentence(s.page);
      await setFrequency(s.page, "5k");
      await sentenceChanged(s.page, first);
      const file = await saved(s.page, () => s.page.locator("#dl-md").click());
      assert.equal(file.name, "phasors-report.md");
      assert.match(file.text, /^# Phasor and impedance report: Series RLC at 5\.00 kHz$/m, "the report names the circuit shown");
      assert.ok(file.text.includes(await sentence(s.page) ?? "\u0000"), "the report carries the page's sentence");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#dl-deck").click());
      assert.equal(file.name, "phasors-deck.md");
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#presets button").first().click();
    await setFrequency(page, "3k");
  }),
});
