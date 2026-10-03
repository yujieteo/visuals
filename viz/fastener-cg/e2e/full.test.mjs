// Fastener Pattern CG Tracker: the fuller section-28 checks. The pattern
// lives in the editor and the browser library (no URL state); the canvas
// answers to n and p (next and previous fastener) and the arrow keys (move
// it); New from example resets the pattern; the pattern exports as JSON
// and imports back; the report exports as Markdown and a beamdswitch deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const results = (page) => page.locator("#results").innerText();
// Once a solve takes over 50 ms the page debounces recomputing by 120 ms, so
// wait for the results to settle instead of reading them straight after a click.
/**
 * @param {import("playwright").Page} page
 * @param {string} text
 * @param {boolean} equal wait until the results equal text (true) or differ from it (false)
 */
const settled = async (page, text, equal) => {
  await page.waitForFunction(([t, eq]) => (/** @type {HTMLElement} */ (document.querySelector("#results")).innerText === t) === eq, /** @type {const} */ ([text, equal])).catch(() => {});
  return results(page);
};

await fullSuite("fastener-cg", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const before = await results(s.page);
      await s.page.locator("#canvas").focus();
      await s.page.keyboard.press("n");
      await s.page.waitForFunction(() => /Selected /.test(document.querySelector("#canvas-status")?.textContent ?? ""));
      await s.page.keyboard.press("Shift+ArrowRight");
      await s.page.waitForFunction((b) => /** @type {HTMLElement} */ (document.querySelector("#results")).innerText !== b, before);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const example = await results(s.page);
      await s.page.locator("#add-fastener").click();
      assert.notEqual(await settled(s.page, example, false), example, "adding a fastener changes the results");
      await s.page.locator("#new-example").click();
      assert.equal(await settled(s.page, example, true), example, "New from example restores the example's results");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    try {
      const example = await results(s.page);
      await s.page.locator("#add-fastener").click();
      const edited = await settled(s.page, example, false);
      const file = await saved(s.page, () => s.page.locator("#export-json").click());
      assert.match(file.name, /\.json$/);
      await s.page.locator("#new-example").click();
      assert.notEqual(await settled(s.page, edited, false), edited, "New from example replaces the edited pattern");
      await s.page.locator("#import-file").setInputFiles({ name: file.name, mimeType: "application/json", buffer: Buffer.from(file.text) });
      await s.page.waitForFunction((t) => /** @type {HTMLElement} */ (document.querySelector("#results")).innerText === t, edited);
      const again = await saved(s.page, () => s.page.locator("#export-json").click());
      assert.equal(again.text, file.text, "the imported pattern exports the same JSON");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      const example = await results(s.page);
      const before = await saved(s.page, () => s.page.locator("#export-md").click());
      await s.page.locator("#add-fastener").click();
      await settled(s.page, example, false);
      const ids = JSON.parse((await saved(s.page, () => s.page.locator("#export-json").click())).text).fasteners.map((/** @type {{ id: string }} */ f) => f.id);
      const added = ids.at(-1);
      assert.doesNotMatch(before.text, new RegExp(`^\\| ${added} \\|`, "m"), "the earlier report does not list the fastener added later");
      const file = await saved(s.page, () => s.page.locator("#export-md").click());
      assert.match(file.name, /\.md$/);
      assert.match(file.text, /Preliminary sizing/, "the report carries the preliminary-sizing line");
      for (const id of ids) assert.match(file.text, new RegExp(`^\\| ${id} \\|`, "m"), `the report lists ${id} from the current pattern`);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.match(file.name, /-beamdswitch\.md$/);
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#add-fastener").click();
  }),
});
