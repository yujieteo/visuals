// Convexity Action Engine: the fuller section-28 checks. Every view has a hash
// route (#/now, #/avoid, #/compare, #/a/<action>); Cmd/Ctrl+K opens the action
// search, whose results the arrow keys and Enter choose from; Reset in the
// Adjust context panel restores the default context; the beamdswitch button saves a narrated
// deck of the view. Assertions avoid anything that depends on the clock, since
// the page reads the current time in Singapore.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const title = (page) => page.locator("#app h1, #app h2").first().innerText();
/**
 * @param {import("playwright").Page} page
 * @param {string} hash
 */
const at = (page, hash) => page.waitForFunction((h) => location.hash === h, hash);

await fullSuite("convexity-action-engine", {
  "url-state": async ({ open }) => {
    const s = await open("#/a/swim");
    try {
      assert.equal(await title(s.page), "Swim", "the link opens the action it names");
      await s.page.getByRole("link", { name: "COMPARE" }).click();
      await at(s.page, "#/compare");
      const restored = await open("#/a/play-badminton");
      try {
        assert.equal(await title(restored.page), "Play badminton", "another link opens another action");
        assertClean(restored);
      } finally {
        await restored.close();
      }
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open("#/now");
    try {
      await s.page.getByRole("link", { name: "AVOID" }).click();
      await at(s.page, "#/avoid");
      await s.page.getByRole("link", { name: "DATA" }).click();
      await at(s.page, "#/data");
      await s.page.goBack();
      await at(s.page, "#/avoid");
      await s.page.goBack();
      await at(s.page, "#/now");
      await s.page.goForward();
      await at(s.page, "#/avoid");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open("#/now");
    try {
      await s.page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
      await s.page.keyboard.press("/");
      await s.page.locator("#pal").waitFor({ state: "visible" });
      await s.page.keyboard.type("swim");
      await s.page.locator("#res [role=option]").first().waitFor();
      await s.page.keyboard.press("ArrowDown");
      await s.page.keyboard.press("ArrowUp");
      await s.page.keyboard.press("Enter");
      await at(s.page, "#/a/swim");
      assert.equal(await s.page.locator("#pal").isVisible(), false, "choosing a result closes the search");
      await s.page.keyboard.press("ControlOrMeta+k");
      await s.page.locator("#pal").waitFor({ state: "visible" });
      await s.page.keyboard.press("Escape");
      await s.page.locator("#pal").waitFor({ state: "hidden" });
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open("#/now");
    try {
      await s.page.keyboard.press("ControlOrMeta+k");
      await s.page.locator("#pal").waitFor({ state: "visible" });
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "q", "the search focuses its field");
      await s.page.keyboard.type("badminton");
      await s.page.locator("#res [role=option]").first().waitFor();
      await s.page.keyboard.press("Enter");
      await at(s.page, "#/a/play-badminton");
      // The view renders a moment after the hash changes, so wait for its heading.
      await s.page.locator("#app h1, #app h2").filter({ hasText: /^Play badminton$/ }).first().waitFor();
      assert.equal(await title(s.page), "Play badminton");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open("#/now");
    try {
      assert.equal(await s.page.locator("#t-60").getAttribute("aria-pressed"), "true", "the default context has an hour");
      await s.page.locator("#t-15").click();
      assert.equal(await s.page.locator("#t-15").getAttribute("aria-pressed"), "true");
      await s.page.locator("#ctxtoggle").click();
      await s.page.locator("#ctxreset").click();
      assert.equal(await s.page.locator("#t-60").getAttribute("aria-pressed"), "true", "reset restores the default context");
      assert.equal(await s.page.locator("#ctxreset").isVisible(), false, "and hides itself, with nothing left to reset");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open("#/a/swim");
    try {
      const deck = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.match(deck.name, /beamdswitch\.md$/);
      assertBeamdswitchDeck(deck.text);
      assert.match(deck.text, /Swim/, "the deck is about the action shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: Copy Markdown of the session itself, distinct from the presentation deck.
  "markdown-export": async ({ open }) => {
    const s = await open("#/a/swim");
    try {
      await s.page.locator("#t-15").click();
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
      assert.match(String(text), /Swim/, "the copied Markdown is about the action shown");
      assert.match(String(text), /15 ?min|15m/, "in the context set");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx, "#/now"),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.getByRole("link", { name: "COMPARE" }).click();
  }, "#/now"),
});
