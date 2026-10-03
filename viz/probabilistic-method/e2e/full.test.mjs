// Probabilistic Method Atlas: the fuller section-28 checks. Every lab has a
// hash route carrying its parameters and seed (#first-moment/ramsey?n=12&seed=17);
// the arrow keys walk the proof and the labs; Cmd/Ctrl+K opens the search
// palette; "Reset to defaults" restores a lab; the Export menu copies or saves
// slide, technique and course decks for beamdswitch.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, blur, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const title = (page) => page.locator("#lab-title").textContent();
/**
 * @param {import("playwright").Page} page
 * @param {(hash: string) => boolean} test
 */
const hashIs = (page, test) => page.waitForFunction(`(${test})(location.hash)`);

await fullSuite("probabilistic-method", {
  "url-state": async ({ open }) => {
    const s = await open("#first-moment/ramsey?n=12&k=6&seed=42");
    try {
      assert.equal(await title(s.page), "Basic method and first moment", "the link opens its lab");
      assert.equal(await s.page.locator("#p-n").inputValue(), "12", "the link restores n");
      assert.match(await s.page.locator("#lab-seed").textContent() ?? "", /seed: 42/, "the link restores the seed");
      await s.page.locator("#p-n").fill("9");
      await hashIs(s.page, (h) => h.includes("n=9"));
      const hash = await s.page.evaluate(() => location.hash);
      const again = await open(hash);
      try {
        assert.equal(await again.page.locator("#p-n").inputValue(), "9", "the written state reopens as set");
        assertClean(again);
      } finally {
        await again.close();
      }
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open("#first-moment/ramsey");
    try {
      await s.page.locator("#mode-atlas").click();
      await hashIs(s.page, (h) => h === "#atlas");
      await s.page.goBack();
      await hashIs(s.page, (h) => h.startsWith("#first-moment/ramsey"));
      assert.equal(await title(s.page), "Basic method and first moment", "Back returns to the lab");
      await s.page.goForward();
      await hashIs(s.page, (h) => h === "#atlas");
      assert.equal(await s.page.locator("#lab-title").count(), 0, "Forward returns to the atlas");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open("#first-moment/ramsey");
    try {
      await blur(s.page);
      await s.page.keyboard.press("ArrowRight");
      await s.page.locator(".proof li.active").waitFor();
      await s.page.keyboard.press("ArrowDown");
      await hashIs(s.page, (h) => h.startsWith("#linearity/"));
      await s.page.keyboard.press("p");
      await s.page.waitForFunction(() => document.body.classList.contains("proof-lens"));
      assert.equal(await s.page.locator("#mode-proof").getAttribute("aria-pressed"), "true", "P turns on the proof lens");
      await s.page.keyboard.press("Escape");
      await s.page.waitForFunction(() => !document.body.classList.contains("proof-lens"));
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open("");
    try {
      await s.page.keyboard.press("ControlOrMeta+k");
      await s.page.locator("#overlay").waitFor({ state: "visible" });
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "pal-input", "the palette focuses its search field");
      await s.page.keyboard.type("local lemma");
      await s.page.keyboard.press("Enter");
      await hashIs(s.page, (h) => h.startsWith("#local-lemma/"));
      assert.equal(await s.page.locator("#overlay").count(), 0, "choosing a result closes the palette");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open("#first-moment/ramsey?n=12&k=6&seed=42");
    try {
      await s.page.getByRole("button", { name: "Reset to defaults" }).click();
      await hashIs(s.page, (h) => !h.includes("n=12"));
      assert.equal(await s.page.locator("#p-n").inputValue(), "10", "Reset restores n");
      assert.equal(await s.page.locator("#p-k").inputValue(), "5", "Reset restores k");
      assert.match(await s.page.locator("#lab-seed").textContent() ?? "", /seed: 42/, "Reset keeps the chosen seed");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: a Markdown copy of the session state, not the beamdswitch deck. If a candidate control
  // exists it must download Markdown that carries the state as set; a copy is not checked, since the clipboard
  // cannot be read in every browser. None exists at the time of writing.
  "markdown-export": async ({ open }) => {
    const s = await open("#first-moment/ramsey?n=12&seed=42");
    try {
      const candidate = s.page.getByRole("button", { name: /^(export|download|save)\b.*\bmarkdown\b/i }).filter({ hasNotText: /deck|slide|beamdswitch|course|sequence|talk/i });
      assert.ok(await candidate.count(), "no control exports the session state as Markdown (its Markdown controls are deck exports)");
      const { text } = await saved(s.page, () => candidate.first().click());
      assert.match(text, /n\D{0,12}12[\s\S]*seed\D{0,4}42/, "the Markdown carries the session state as set");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open("#first-moment/ramsey?n=12");
    try {
      await s.page.locator("#export-toggle").click();
      const file = await saved(s.page, () => s.page.getByRole("menuitem", { name: "Download current technique .md" }).click());
      assert.equal(file.name, "probabilistic-method-first-moment-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /first-moment\/ramsey\?n=12/, "the deck reproduces the lab as set");
      await s.page.locator("#act-deck").click();
      await s.page.locator("#deck-root").waitFor({ state: "visible" });
      const fromDeck = await saved(s.page, () => s.page.locator("[data-deck=save]").click());
      assert.equal(fromDeck.text, file.text, "deck mode saves the same deck");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx, "#first-moment/ramsey"),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await blur(page);
    await page.keyboard.press("ArrowRight");
    await page.locator(".proof li.active").waitFor();
  }, "#first-moment/ramsey"),
});
