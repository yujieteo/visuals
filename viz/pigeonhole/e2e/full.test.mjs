// Pigeonhole → Averages: the fuller section-28 checks. Every scene has a hash
// route (#general, #lab, #synthesis); the stage takes the arrow keys (↑ drops
// an object into the chosen box); Cmd/Ctrl+K opens the command palette, whose
// Reset command restores the opening scene; the beamdswitch button saves the
// scene as a narrated deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, at, fullSuite, saved } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const title = async (page) => (await page.locator("#scene-title").textContent()) ?? "";
/**
 * Run one command from the palette.
 * @param {import("playwright").Page} page
 * @param {string} name
 */
async function command(page, name) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#palette").waitFor({ state: "visible" });
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
}

await fullSuite("pigeonhole", {
  "url-state": async ({ open }) => {
    const s = await open("#minimax");
    try {
      assert.equal(await title(s.page), "Minimax balancing", "the link opens its scene");
      await s.page.locator("[data-act=go][data-id=constructor]").click();
      await at(s.page, "#constructor");
      assert.equal(await title(s.page), "Theorem constructor");
      await s.page.reload();
      assert.equal(await title(s.page), "Theorem constructor", "reload keeps the scene in the URL");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open("#pigeonhole");
    try {
      await s.page.locator("#next").click();
      await at(s.page, "#general");
      await s.page.locator("#next").click();
      await at(s.page, "#threshold");
      await s.page.goBack();
      await at(s.page, "#general");
      assert.equal(await title(s.page), "Generalised pigeonhole", "Back restores the previous scene");
      await s.page.goForward();
      await at(s.page, "#threshold");
      assert.equal(await title(s.page), "Balanced configuration and the threshold line", "Forward restores the next scene");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open("#general");
    try {
      const placed = async () => (await s.page.locator("#stats").textContent()) ?? "";
      assert.match(await placed(), /placed0 of 23/);
      await s.page.locator("#stage").focus();
      await s.page.keyboard.press("ArrowRight");
      await s.page.keyboard.press("ArrowUp");
      await s.page.keyboard.press("ArrowUp");
      await s.page.waitForFunction(() => /placed2 of 23/.test(document.getElementById("stats")?.textContent ?? ""));
      assert.match(await s.page.locator("#live").textContent() ?? "", /^2: 2/, "the live region reads the chosen box");
      await s.page.keyboard.press("ArrowDown");
      await s.page.waitForFunction(() => /placed1 of 23/.test(document.getElementById("stats")?.textContent ?? ""));
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open("#pigeonhole");
    try {
      await s.page.keyboard.press("ControlOrMeta+k");
      await s.page.locator("#palette").waitFor({ state: "visible" });
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "pal-input", "the palette focuses its search field");
      await s.page.keyboard.type("graph example");
      await s.page.keyboard.press("Enter");
      await at(s.page, "#graph");
      assert.equal(await s.page.locator("#palette").isVisible(), false, "choosing a command closes the palette");
      assert.equal(await title(s.page), "Graph degrees");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open("#minimax");
    try {
      await s.page.getByRole("button", { name: "One balancing move" }).click();
      await s.page.waitForFunction(() => /→/.test(document.querySelector(".trail")?.textContent ?? ""));
      await command(s.page, "Reset");
      await at(s.page, "#pigeonhole");
      assert.equal(await title(s.page), "Ordinary pigeonhole", "Reset returns to the opening scene");
      await s.page.locator("[data-act=mode][data-id=loads]").click();
      await s.page.locator("[data-act=go][data-id=minimax]").click();
      await at(s.page, "#minimax");
      assert.doesNotMatch(await s.page.locator(".trail").textContent() ?? "", /→/, "Reset clears the balancing trail");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open("#general");
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "pigeonhole-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /^title: Pigeonhole to averages: Generalised pigeonhole$/m, "the deck is of the scene as set");
      assert.match(file.text, /^## Average 4\.6, so some box has at least 5$/m);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx, "#general"),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.getByRole("button", { name: "Distribute as evenly as possible" }).click();
    await page.waitForFunction(() => /max5/.test(document.getElementById("stats")?.textContent ?? ""));
  }, "#general"),
});
