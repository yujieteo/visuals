// Snake Lemma: the fuller section-28 checks. Every view has a stable hash
// route (#proof/lift, #example/integer?lifts=2, #exact/coker-alpha); the
// arrow keys step the guided proof; Cmd/Ctrl+K opens the command palette;
// Export writes a beamdswitch deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, at, blur, fullSuite, saved } from "../../../e2e/lib/full.js";

await fullSuite("snake-lemma", {
  "url-state": async ({ open }) => {
    const s = await open("#example/integer?lifts=2");
    try {
      assert.equal(await s.page.locator("[data-mode=example]").getAttribute("aria-pressed"), "true", "the link opens the example");
      assert.equal(await s.page.locator("#btn-fewer").isDisabled(), false, "the link restores the second lift");
      await s.page.locator("[data-mode=exact]").click();
      await s.page.waitForFunction(() => location.hash.startsWith("#exact"));
      assert.equal(await s.page.locator("[data-mode=exact]").getAttribute("aria-pressed"), "true");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("[data-mode=example]").click();
      await at(s.page, "#example/integer");
      await s.page.locator("[data-mode=exact]").click();
      await s.page.waitForFunction(() => location.hash.startsWith("#exact"));
      await s.page.goBack();
      await at(s.page, "#example/integer");
      assert.equal(await s.page.locator("[data-mode=example]").getAttribute("aria-pressed"), "true", "Back restores the example view");
      await s.page.goForward();
      await s.page.waitForFunction(() => location.hash.startsWith("#exact"));
      assert.equal(await s.page.locator("[data-mode=exact]").getAttribute("aria-pressed"), "true", "Forward restores the exactness view");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await blur(s.page);
      await s.page.keyboard.press("ArrowRight");
      await at(s.page, "#proof/lift");
      await s.page.keyboard.press("ArrowRight");
      await at(s.page, "#proof/down");
      await s.page.keyboard.press("ArrowLeft");
      await at(s.page, "#proof/lift");
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
      await s.page.keyboard.type("Exactness at coker");
      await s.page.keyboard.press("Enter");
      await at(s.page, "#exact/coker-alpha");
      assert.equal(await s.page.locator("#palette").isVisible(), false, "choosing a command closes the palette");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open("#example/integer");
    try {
      await s.page.locator("#btn-more").click();
      await at(s.page, "#example/integer?lifts=2");
      await s.page.getByRole("button", { name: "Reset lifts" }).click();
      await at(s.page, "#example/integer");
      assert.equal(await s.page.locator("#btn-fewer").isDisabled(), true, "Reset lifts returns to one lift");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: a Markdown copy of the session state, not the beamdswitch deck. If a candidate control
  // exists it must download Markdown that carries the state as set; a copy is not checked, since the clipboard
  // cannot be read in every browser. None exists at the time of writing.
  "markdown-export": async ({ open }) => {
    const s = await open("#example/integer?lifts=2");
    try {
      const candidate = s.page.getByRole("button", { name: /^(export|download|save)\b.*\bmarkdown\b/i }).filter({ hasNotText: /deck|slide|beamdswitch|course|sequence|talk/i });
      assert.ok(await candidate.count(), "no control exports the session state as Markdown (its Markdown controls are deck exports)");
      const { text } = await saved(s.page, () => candidate.first().click());
      assert.match(text, /lifts?\D{0,8}2/, "the Markdown carries the session state as set");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#btn-export").click();
      await s.page.locator("#export").waitFor({ state: "visible" });
      const shown = await s.page.locator("#export-text").inputValue();
      assertBeamdswitchDeck(shown);
      const file = await saved(s.page, () => s.page.locator("#btn-download-md").click());
      assert.match(file.name, /\.md$/);
      assert.equal(file.text, shown, "the saved deck is the deck shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await blur(page);
    await page.keyboard.press("ArrowRight");
    await at(page, "#proof/lift");
  }),
});
