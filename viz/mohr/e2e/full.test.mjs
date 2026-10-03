// Mohr's Circle Visualiser: the fuller section-28 checks. One view with no URL
// state; θ is set in its field, by its slider or with the arrow keys on a
// focused 2D circle; JSON, Markdown and a beamdswitch deck download, and the
// JSON imports back through the paste box.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const theta = (page) => page.locator("#theta").inputValue();
/** @param {import("playwright").Page} page */
const results = (page) => page.locator("#tbl-results").innerText();
/**
 * @param {import("playwright").Page} page
 * @param {string} value
 */
async function setTheta(page, value) {
  await page.locator("#theta").fill(value);
  await page.locator("#theta").press("Enter");
  await page.locator("#theta").blur();
  await page.waitForFunction((v) => /** @type {HTMLInputElement} */ (document.getElementById("theta")).value === v, value);
}

await fullSuite("mohr", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await setTheta(s.page, "10");
      await s.page.locator("#cv-2d-stress").focus();
      await s.page.keyboard.press("ArrowRight");
      await s.page.waitForFunction(() => /** @type {HTMLInputElement} */ (document.getElementById("theta")).value !== "10");
      assert.ok(Number(await theta(s.page)) > 10, "ArrowRight on the 2D circle turns the plane forward");
      const before = await theta(s.page);
      await s.page.keyboard.press("ArrowLeft");
      await s.page.waitForFunction((v) => /** @type {HTMLInputElement} */ (document.getElementById("theta")).value !== v, before);
      assert.equal(await theta(s.page), "10", "ArrowLeft turns it back");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    try {
      await setTheta(s.page, "30");
      const shown = await results(s.page);
      const file = await saved(s.page, () => s.page.locator("[data-download=json]").click());
      assert.equal(file.name, "mohr-state.json");
      assert.equal(JSON.parse(file.text).plane.angleDeg, 30, "the file holds the plane angle shown");
      await setTheta(s.page, "0");
      assert.notEqual(await results(s.page), shown, "changing θ changes the results");
      await s.page.locator("#import-text").fill(file.text);
      await s.page.locator("#import-go").click();
      await s.page.waitForFunction(() => /** @type {HTMLInputElement} */ (document.getElementById("theta")).value === "30");
      assert.equal(await results(s.page), shown, "the import restores every result");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await setTheta(s.page, "30");
      const file = await saved(s.page, () => s.page.locator("[data-download=md]").click());
      assert.equal(file.name, "mohr-report.md");
      assert.match(file.text, /^# Mohr's Circle Visualiser report$/m);
      assert.match(file.text, /rotation θ = 30° about z/, "the report names the plane shown");
      assert.match(file.text, /```json\n\{[\s\S]*"schema"/, "the report embeds the state for import");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "mohr-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#preset").selectOption({ index: 2 });
    await setTheta(page, "15");
  }),
});
