// Riemann–Roch laboratory: the fuller section-28 checks. The geometry pane
// takes the keyboard (+/− change a point's multiplicity, [ ] choose a point);
// Cmd/Ctrl+K opens the command palette; the worked presets restore a known
// curve and divisor; the beamdswitch button saves the lab as a narrated deck.
// State is read through the page's documented RiemannRochPage handle.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/**
 * The analysis on the page: divisor, degree and ℓ(D).
 * @param {import("playwright").Page} page
 */
const lab = (page) => page.evaluate(() => {
  const a = /** @type {any} */ (self).RiemannRochPage.analysis();
  return { divisor: String(a.divisor), deg: Number(a.deg), ell: a.ell, curve: String(a.curveType) };
});

await fullSuite("riemann-roch", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      assert.deepEqual(await lab(s.page), { divisor: "3∞", deg: 3, ell: 4, curve: "P1" }, "the lab opens on P¹ with D = 3∞");
      await s.page.locator("#geo-svg").focus();
      await s.page.keyboard.press("+");
      await s.page.waitForFunction(() => /** @type {any} */ (self).RiemannRochPage.analysis().deg === 4);
      assert.equal((await lab(s.page)).ell, 5, "+ raises the multiplicity and ℓ(D) follows");
      await s.page.keyboard.press("-");
      await s.page.keyboard.press("-");
      await s.page.waitForFunction(() => /** @type {any} */ (self).RiemannRochPage.analysis().deg === 2);
      assert.equal((await lab(s.page)).ell, 3);
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
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "pal-q", "the palette focuses its search field");
      await s.page.keyboard.type("draw elliptic");
      await s.page.keyboard.press("Enter");
      await s.page.waitForFunction(() => /** @type {any} */ (self).RiemannRochPage.analysis().curveType === "elliptic");
      assert.equal(await s.page.locator("#palette").isVisible(), false, "choosing a command closes the palette");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // A Reset control must restore the opening state after a change; re-choosing a preset is not Reset.
  reset: async ({ open }) => {
    const s = await open();
    try {
      const state = () => s.page.evaluate(() => { const a = /** @type {any} */ (self).RiemannRochPage.analysis(); return `${a.curveType} ${a.divisor}`; });
      const opening = await state();
      await s.page.locator("#geo-svg").focus();
      await s.page.keyboard.press("+");
      await s.page.waitForFunction(() => /** @type {any} */ (self).RiemannRochPage.analysis().deg === 4);
      assert.notEqual(await state(), opening, "the change took effect");
      const reset = s.page.getByRole("button", { name: /^(reset|start over|clear all)\b/i });
      assert.ok(await reset.count(), "the lab has no Reset control");
      await reset.first().click();
      await s.page.waitForFunction((b) => { const a = /** @type {any} */ (self).RiemannRochPage.analysis(); return `${a.curveType} ${a.divisor}` === b; }, opening);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: a Markdown copy of the session state, not the beamdswitch deck. If a candidate control
  // exists it must download Markdown that carries the state as set; a copy is not checked, since the clipboard
  // cannot be read in every browser. None exists at the time of writing.
  "markdown-export": async ({ open }) => {
    const s = await open("");
    try {
      const candidate = s.page.getByRole("button", { name: /^(export|download|save)\b.*\bmarkdown\b/i }).filter({ hasNotText: /deck|slide|beamdswitch|course|sequence|talk/i });
      assert.ok(await candidate.count(), "no control exports the session state as Markdown (its Markdown controls are deck exports)");
      const { text } = await saved(s.page, () => candidate.first().click());
      assert.match(text, /3∞|3\\infty/, "the Markdown carries the session state as set");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("[data-preset=e-3o]").click();
      await s.page.getByText("Export a narrated talk").click();
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "riemann-roch-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /^## ℓ\(D\) = 3$/m, "the deck is of the lab as set");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("[data-preset=g2]").click();
    await page.waitForFunction(() => /** @type {any} */ (self).RiemannRochPage.analysis().g === 2);
  }),
});
