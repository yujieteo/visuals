// How English Grammar Works: the fuller section-28 checks. Every concept,
// example and view has a hash route (#concept/example/tree); Ctrl/Cmd+K
// jumps to the concept search; the arrow keys walk a sentence's
// constituents; the only export is the beamdswitch deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, at, fullSuite, saved } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const concept = (page) => page.locator("#concept-h").innerText();

await fullSuite("english-grammar", {
  "url-state": async ({ open }) => {
    const start = await open();
    try {
      await start.page.locator("#start-h").waitFor();
      assertClean(start);
    } finally {
      await start.close();
    }
    const s = await open("#constituent-structure");
    let hash, example;
    try {
      assert.equal(await concept(s.page), "Constituent structure", "the link opens its concept");
      await s.page.locator("#content [data-node]").first().waitFor();
      const choice = s.page.locator(".rail-btn:not([aria-current=true])").first();
      example = await choice.getAttribute("data-ex");
      await choice.click();
      await s.page.locator(".disc[data-view=tree] > summary").click();
      await at(s.page, `#constituent-structure/${example}/tree`);
      hash = await s.page.evaluate(() => location.hash);
      assertClean(s);
    } finally {
      await s.close();
    }
    const again = await open(hash);
    try {
      assert.equal(await concept(again.page), "Constituent structure", "the written hash reopens the concept");
      assert.equal(await again.page.locator(".rail-btn[aria-current=true]").getAttribute("data-ex"), example, "and the chosen example");
      assert.equal(await again.page.locator(".disc[data-view=tree]").getAttribute("open"), "", "and the tree view");
      assertClean(again);
    } finally {
      await again.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open("#category-and-function");
    try {
      await s.page.goto(s.page.url().replace(/#.*$/, "#heads-and-dependents"));
      await at(s.page, "#heads-and-dependents");
      await s.page.waitForFunction(() => document.querySelector("#concept-h")?.textContent === "Heads and dependents");
      await s.page.goBack();
      await at(s.page, "#category-and-function");
      await s.page.waitForFunction(() => document.querySelector("#concept-h")?.textContent === "Category and function");
      await s.page.goForward();
      await at(s.page, "#heads-and-dependents");
      await s.page.waitForFunction(() => document.querySelector("#concept-h")?.textContent === "Heads and dependents");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open("#category-and-function");
    try {
      const selected = s.page.locator("#content [data-node].selected").first();
      await selected.focus();
      const before = await selected.getAttribute("data-node");
      await s.page.keyboard.press("ArrowDown");
      const after = await s.page.evaluate(() => document.activeElement?.getAttribute("data-node"));
      assert.ok(after && after !== before, `ArrowDown moves to a part of the constituent (${before} → ${after})`);
      await s.page.keyboard.press("ArrowUp");
      assert.equal(await s.page.evaluate(() => document.activeElement?.getAttribute("data-node")), before, "ArrowUp returns to the containing constituent");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open();
    try {
      await s.page.keyboard.press("ControlOrMeta+k");
      await s.page.waitForFunction(() => document.activeElement?.id === "q");
      await s.page.keyboard.type("determiner");
      const first = s.page.locator("#results a").first();
      await first.waitFor();
      const target = await first.getAttribute("data-concept");
      await s.page.keyboard.press("ArrowDown");
      await s.page.keyboard.press("Enter");
      await s.page.waitForFunction((c) => location.hash.startsWith(`#${c}`), target);
      assert.ok((await concept(s.page)).length > 0, "choosing the first result opens its concept");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open("#category-and-function");
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.match(file.name, /\.md$/);
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#content [data-node]").nth(1).click();
  }),
});
