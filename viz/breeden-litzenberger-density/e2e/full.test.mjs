// Breeden-Litzenberger density: the fuller section-28 checks. A strike slider
// and four butterfly half-width buttons set the read-out, which must agree
// with the cross-check: at K = 100 the finest butterfly reads within 1e-5 of
// the Black-Scholes density 0.019724. Reset restores K = 100, Δ = 2; the
// beamdswitch and Copy deck buttons export a deck of the strike shown.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const readout = (page) => page.locator("#readout").innerText();
/**
 * @param {import("playwright").Page} page
 * @param {string} d
 */
const width = (page, d) => page.locator(`.seg button[data-d="${d}"]`);
/** The butterfly and closed-form densities the read-out states. @param {string} text */
const densities = (text) => {
  const m = /butterfly density ([\d.]+).*Black[–-]Scholes density ([\d.]+)/.exec(text);
  assert.ok(m, `the read-out states both densities: ${text}`);
  return { est: Number(m[1]), pK: Number(m[2]) };
};

await fullSuite("breeden-litzenberger-density", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      assert.match(await readout(s.page), /^At K = 100 with Δ = 2:/);
      await s.page.locator("#strike").focus();
      await s.page.keyboard.press("ArrowRight");
      await s.page.keyboard.press("ArrowRight");
      assert.match(await readout(s.page), /^At K = 101 with Δ = 2:/, "two arrow steps of 0.5 move the strike to 101");
      await s.page.keyboard.press("Home");
      assert.match(await readout(s.page), /^At K = 65 with/, "Home goes to the lowest strike");
      await width(s.page, "0.5").focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await width(s.page, "0.5").getAttribute("aria-pressed"), "true");
      assert.match(await readout(s.page), /with Δ = 0\.5:/);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const initial = await readout(s.page);
      // The canonical example: at K = 100 the finest butterfly closes on the closed form.
      await width(s.page, "0.5").click();
      const fine = densities(await readout(s.page));
      assert.ok(Math.abs(fine.est - 0.019724) < 1e-5 && Math.abs(fine.pK - 0.019724) < 1e-5, `at K = 100, Δ = 0.5 both read about 0.019724: ${JSON.stringify(fine)}`);
      await s.page.locator("#strike").fill("130");
      assert.match(await readout(s.page), /^At K = 130 with Δ = 0\.5:/);
      await s.page.locator("#reset").click();
      assert.equal(await readout(s.page), initial, "Reset restores the opening read-out");
      assert.equal(await s.page.locator("#strike").inputValue(), "100");
      assert.equal(await width(s.page, "2").getAttribute("aria-pressed"), "true");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const at100 = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(at100.name, "breeden-litzenberger-density-beamdswitch.md");
      assertBeamdswitchDeck(at100.text);
      assert.match(at100.text, /^title: The risk-neutral density at K = 100$/m);
      await s.page.locator("#strike").fill("120");
      const at120 = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.match(at120.text, /^title: The risk-neutral density at K = 120$/m, "the deck follows the strike shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: Copy Markdown of the session itself, distinct from the presentation deck.
  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#strike").fill("120");
      await width(s.page, "0.5").click();
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
      assert.match(String(text), /K = 120/, "the copied Markdown is for the strike shown");
      assert.match(String(text), /Δ = 0\.5/, "and the half-width shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#strike").fill("120");
    await page.locator('.seg button[data-d="5"]').click();
  }),
});
