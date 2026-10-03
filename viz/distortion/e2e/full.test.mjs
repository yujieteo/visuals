// Structural Distortion Explorer: the fuller section-28 checks. Each load is a
// native range slider whose read-out (#o-<load>) and aria-valuetext describe
// the load in words; presets set several loads at once; Reset clears every
// load; the beamdswitch button saves a narrated deck of the loads shown. On a
// phone the controls live in a bottom sheet the checks open first. The page
// keeps no state in the URL and has no palette.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/**
 * @param {import("playwright").Page} page
 * @param {string} load
 */
const said = (page, load) => page.locator(`#o-${load}`).innerText();
/** The five load sliders' values. @param {import("playwright").Page} page */
const loads = (page) => Promise.all(LOADS.map((k) => page.locator(`#s-${k}`).inputValue()));
const LOADS = ["axial", "shear", "torsion", "bending", "inplane"];
/** On a phone the controls sit in a bottom sheet: open it, as a reader would. @param {import("playwright").Page} page */
async function showControls(page) {
  const handle = page.locator("#sheet-handle");
  if (await handle.isVisible() && (await handle.getAttribute("aria-expanded")) !== "true") await handle.click();
}

await fullSuite("distortion", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await showControls(s.page);
      const slider = s.page.locator("#s-axial");
      const before = await said(s.page, "axial");
      await slider.focus();
      for (let i = 0; i < 30; i++) await s.page.keyboard.press("ArrowRight");
      assert.ok(Number(await slider.inputValue()) > 0.25, "the arrow keys raise the axial load");
      const after = await said(s.page, "axial");
      assert.notEqual(after, before, "and its read-out follows");
      assert.equal(await slider.getAttribute("aria-valuetext"), after, "so does what a screen reader hears");
      await s.page.keyboard.press("Home");
      assert.equal(await slider.inputValue(), await slider.getAttribute("min"), "Home goes to the end of the range");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      await showControls(s.page);
      const preset = s.page.locator('#presets button[data-preset="pure-shear"]');
      await preset.click();
      assert.equal(await preset.getAttribute("aria-pressed"), "true", "a preset shows as chosen");
      assert.ok((await loads(s.page)).some((v) => Number(v) !== 0), "the preset sets at least one load");
      await s.page.locator("#reset").click();
      const cleared = await loads(s.page);
      assert.ok(cleared.every((v) => Number(v) === 0), `Reset clears every load: ${cleared.join(", ")}`);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await showControls(s.page);
      await s.page.locator("#s-torsion").fill("0.8");
      const deck = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.match(deck.name, /beamdswitch\.md$/);
      assertBeamdswitchDeck(deck.text);
      assert.match(deck.text, /torsion/i, "the deck describes the torsion that is set");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: Copy Markdown of the session itself, distinct from the presentation deck.
  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await showControls(s.page);
      await s.page.locator("#s-torsion").fill("0.8");
      const copy = s.page.getByRole("button", { name: /copy markdown/i });
      assert.equal(await copy.count(), 1, "the page offers Copy Markdown of its session");
      await s.page.evaluate(() => {
        const w = /** @type {any} */ (window);
        w.__copied = [];
        navigator.clipboard.writeText = async (t) => { w.__copied.push(t); };
      });
      await copy.click();
      const text = await s.page.evaluate(() => /** @type {any} */ (window).__copied.at(-1));
      assert.match(String(text ?? ""), /^#/m, "the copied session is Markdown");
      assert.match(String(text), /torsion/i, "the copied Markdown describes the torsion that is set");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await showControls(page);
    await page.locator('#presets button[data-preset="torsion"]').click();
  }),
});
