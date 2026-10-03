// Entropy Methods in Combinatorics Lab: the fuller section-28 checks. Every
// view has a hash route (#chain-rule, #guided/chain-rule, #problems/2,
// #projection); Cmd/Ctrl+K opens the command palette; P starts the
// presentation and the arrow keys step it; each laboratory has Reset
// example; the BeamMD Switch menu exports decks of the current lesson.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, at, blur, fullSuite, saved } from "../../lib/full.js";

/**
 * @param {import("playwright").Page} page
 * @param {string} mode
 */
const showing = (page, mode) => page.locator(`[data-mode=${mode}][aria-pressed=true]`).waitFor();

await fullSuite("entropy-combinatorics", {
  "url-state": async ({ open }) => {
    const s = await open("#guided/chain-rule");
    try {
      await showing(s.page, "guided");
      assert.match(await s.page.locator("#main h1").innerText(), /chain rule/i, "the link opens the chain rule lesson");
      await s.page.locator("[data-mode=problems]").click();
      await at(s.page, "#problems/1");
      await showing(s.page, "problems");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open("#chain-rule");
    try {
      await s.page.locator("[data-mode=guided]").click();
      await at(s.page, "#guided/chain-rule");
      await s.page.locator("[data-mode=compare]").click();
      await s.page.waitForFunction(() => location.hash.startsWith("#compare/"));
      await s.page.goBack();
      await at(s.page, "#guided/chain-rule");
      await showing(s.page, "guided");
      await s.page.goForward();
      await s.page.waitForFunction(() => location.hash.startsWith("#compare/"));
      await showing(s.page, "compare");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open("#chain-rule");
    try {
      await blur(s.page);
      await s.page.keyboard.press("p");
      await s.page.locator("#present").waitFor({ state: "visible" });
      const first = await s.page.locator("#present").innerText();
      await s.page.keyboard.press("ArrowRight");
      await s.page.waitForFunction((t) => /** @type {HTMLElement} */ (document.querySelector("#present")).innerText !== t, first);
      await s.page.keyboard.press("Escape");
      await s.page.locator("#present").waitFor({ state: "hidden" });
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
      await s.page.locator("#pal-q").fill("Open Shearer");
      await s.page.keyboard.press("Enter");
      await at(s.page, "#shearer");
      assert.equal(await s.page.locator("#palette").isVisible(), false, "choosing a command closes the palette");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open("#projection");
    try {
      const main = s.page.locator("#main");
      const initial = await main.innerText();
      await s.page.locator('#main [data-act=preset][data-arg="all"], #main [data-act=fill]').first().click();
      assert.notEqual(await main.innerText(), initial, "a laboratory control changes the example");
      await s.page.locator("[data-tool=reset]").click();
      assert.equal(await main.innerText(), initial, "Reset example restores it");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open("#chain-rule");
    try {
      await s.page.locator("#beam-btn").click();
      await s.page.locator("[data-beam=proof]").click();
      await s.page.locator("#export").waitFor({ state: "visible" });
      const shown = await s.page.locator("#export-text").inputValue();
      assertBeamdswitchDeck(shown);
      const file = await saved(s.page, () => s.page.locator("#export-download").click());
      assert.equal(file.name, "entropy-proof-chain-rule.md");
      assert.equal(file.text, shown, "the saved deck is the deck shown");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": () => assert.fail("no Copy Markdown of the reader's session state (revealed hints, solved problems, laboratory settings); Copy Markdown in the BeamMD Switch menu copies a presentation deck"),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("[data-mode=guided]").click();
  }),
});
