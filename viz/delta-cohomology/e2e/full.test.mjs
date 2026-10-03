// Delta-complex cohomology: the fuller section-28 checks. The space and the
// coefficients live in the URL fragment (#RP2, #RP2/F2); the canonical
// example is RP² over ℤ, whose H² is ℤ/2 and whose H¹ is 0, while over 𝔽₂
// both are 𝔽₂. Digits 1–3 choose the space and the arrow keys step the guided
// tour; Cmd/Ctrl+K opens the command palette; Reset restores the torus over
// ℤ; the beamdswitch button saves a narrated deck of the space shown.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const result = (page) => page.locator("#result").innerText();
/**
 * The group a result card states for H^k, such as "ℤ/2".
 * @param {string} text
 * @param {string} sup a superscript digit
 */
const group = (text, sup) => new RegExp(`^H${sup}\\([^)]*\\)\\n(.+)$`, "m").exec(text)?.[1];
/**
 * Whether the control for one choice (a space or the coefficients) is pressed.
 * @param {import("playwright").Page} page
 * @param {string} act
 * @param {string} v
 */
const pressed = (page, act, v) => page.locator(`[data-act="${act}"][data-v="${v}"]`).first().getAttribute("aria-pressed");

await fullSuite("delta-cohomology", {
  "url-state": async ({ open }) => {
    const s = await open("#RP2");
    try {
      const text = await result(s.page);
      assert.equal(group(text, "²"), "ℤ/2", "the link opens RP² over ℤ, whose H² is ℤ/2");
      assert.equal(group(text, "¹"), "0");
      await s.page.locator('[data-act="coef"][data-v="F2"]').click();
      await s.page.waitForFunction(() => location.hash === "#RP2/F2");
      const restored = await open("#RP2/F2");
      try {
        assert.equal(await pressed(restored.page, "coef", "F2"), "true", "the link restores the coefficients");
        const f2 = await result(restored.page);
        assert.equal(group(f2, "¹"), "𝔽₂", "over 𝔽₂ the degree-one class reappears");
        assert.equal(group(f2, "²"), "𝔽₂");
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
      await s.page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
      await s.page.keyboard.press("1");
      await s.page.waitForFunction(() => location.hash === "#S2");
      assert.equal(await pressed(s.page, "space", "S2"), "true", "1 chooses the sphere");
      await s.page.keyboard.press("3");
      await s.page.waitForFunction(() => location.hash === "#RP2");
      const guide = await s.page.locator("#guide").innerText();
      await s.page.keyboard.press("ArrowRight");
      await s.page.waitForFunction((g) => document.getElementById("guide")?.innerText !== g, guide);
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
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "palette-input", "the palette focuses its search field");
      await s.page.keyboard.type("projective");
      await s.page.keyboard.press("Enter");
      await s.page.waitForFunction(() => location.hash.startsWith("#RP2"));
      assert.equal(await s.page.locator("#palette").isVisible(), false, "choosing a command closes the palette");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open("#RP2/F3");
    try {
      await s.page.locator('[data-act="reset"]').click();
      await s.page.waitForFunction(() => location.hash === "#T2");
      assert.equal(await pressed(s.page, "space", "T2"), "true", "Reset returns to the torus");
      assert.equal(await pressed(s.page, "coef", "Z"), "true", "over ℤ");
      assert.equal(group(await result(s.page), "²"), "ℤ", "whose H² is ℤ");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open("#RP2");
    try {
      const deck = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.match(deck.name, /beamdswitch\.md$/);
      assertBeamdswitchDeck(deck.text);
      assert.match(deck.text, /RP/, "the deck is about the space shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: Copy Markdown of the session itself, distinct from the presentation deck.
  "markdown-export": async ({ open }) => {
    const s = await open("#RP2");
    try {
      await s.page.locator('[data-act="coef"][data-v="F2"]').click();
      await s.page.waitForFunction(() => location.hash === "#RP2/F2");
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
      assert.match(String(text), /RP/, "the copied Markdown is about the space shown");
      assert.match(String(text), /𝔽₂|F2/, "over the coefficients shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator('[data-act="space"][data-v="S2"]').first().click();
    await page.locator('[data-act="next"]').first().click();
  }),
});
