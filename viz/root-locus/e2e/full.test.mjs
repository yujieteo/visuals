// Root locus: the fuller section-28 checks. A loop is typed as transfer
// functions; K moves along the locus by slider or box; the plot takes the
// keyboard (arrows pan, +/− zoom, F fits); Reset reloads the first example;
// the Markdown record round-trips through Import; beamdswitch saves a deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const badges = async (page) => (await page.locator("#badges").textContent()) ?? "";
/**
 * Set K in the box and wait for the readout to show it.
 * @param {import("playwright").Page} page
 * @param {string} k
 */
async function setK(page, k) {
  await page.locator("#kBox").fill(k);
  await page.locator("#kBox").press("Enter");
  await page.waitForFunction((v) => (document.getElementById("badges")?.textContent ?? "").includes(`K = ${v}`), k);
}
/** @param {import("playwright").Page} page */
const openDrawer = (page) => page.evaluate(() => { /** @type {HTMLDetailsElement} */ (document.getElementById("ioSec")).open = true; });

await fullSuite("root-locus", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#kBox").focus();
      await s.page.keyboard.press("ControlOrMeta+a");
      await s.page.keyboard.type("7");
      await s.page.keyboard.press("Enter");
      await s.page.waitForFunction(() => (document.getElementById("badges")?.textContent ?? "").includes("K = 7"));
      assert.match(await badges(s.page), /Unstable/, "K = 7 destabilises the third-order example");
      await s.page.locator("#plot").focus();
      const box = await s.page.locator("#plot").boundingBox();
      assert.ok(box, "the plot is laid out");
      const y = box.y + box.height / 2;
      /** @param {number} x */
      const readout = async (x) => {
        await s.page.mouse.move(x + 1, y);
        await s.page.mouse.move(x, y);
        return await s.page.locator("#tip").isVisible() ? await s.page.locator("#tip").textContent() : null;
      };
      let x = box.x + 8, before = null;
      for (; x < box.x + box.width && !before; x += 8) before = await readout(x);
      x -= 8;
      assert.ok(before, "hovering the real axis reads a locus point");
      await s.page.keyboard.press("+");
      await s.page.keyboard.press("ArrowLeft");
      let after = await readout(x);
      for (const until = Date.now() + 5_000; after === before && Date.now() < until; after = await readout(x)) await s.page.waitForTimeout(100);
      assert.notEqual(after, before, "+ and the arrows zoom and pan the plot, so the same screen point reads another locus point");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const opening = await s.page.locator("#fG").inputValue();
      await s.page.locator("#examples").selectOption({ label: "Zero at −3: breakaway and break-in" });
      await s.page.waitForFunction(() => /** @type {HTMLTextAreaElement} */ (document.getElementById("fG")).value.includes("s + 3"));
      await setK(s.page, "4");
      await s.page.locator("#resetBtn").click();
      await s.page.waitForFunction((g) => /** @type {HTMLTextAreaElement} */ (document.getElementById("fG")).value === g, opening);
      assert.match(await badges(s.page), /K = 1\b/, "Reset restores the first example's K");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#examples").selectOption({ label: "PI control with damping and settling requirements" });
      await s.page.waitForFunction(() => /** @type {HTMLTextAreaElement} */ (document.getElementById("fC")).value.includes("s + 0.5"));
      await setK(s.page, "2.5");
      await openDrawer(s.page);
      const record = await saved(s.page, () => s.page.locator("#exportBtn").click());
      const json = /```json\n([\s\S]*?)\n```/.exec(record.text);
      assert.ok(json, "the record carries its JSON block");
      const state = JSON.parse(json[1]);
      assert.equal(state.inputs?.k ?? state.k, 2.5, "the JSON block holds K as set");
      await s.page.locator("#resetBtn").click();
      await s.page.waitForFunction(() => !/** @type {HTMLTextAreaElement} */ (document.getElementById("fC")).value.includes("s + 0.5"));
      await openDrawer(s.page);
      await s.page.locator("#importText").fill(json[1]);
      await s.page.locator("#importBtn").click();
      await s.page.waitForFunction(() => /** @type {HTMLTextAreaElement} */ (document.getElementById("fC")).value.includes("s + 0.5"));
      assert.match(await badges(s.page), /K = 2\.5\b/, "importing the JSON restores the loop and K");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await setK(s.page, "3");
      await openDrawer(s.page);
      const file = await saved(s.page, () => s.page.locator("#exportBtn").click());
      assert.equal(file.name, "root-locus-check.md");
      assert.match(file.text, /Verdict at K = 3\b/, "the record is of the loop as set");
      assert.match(file.text, /^#+ Warnings$/m);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await openDrawer(s.page);
      const file = await saved(s.page, () => s.page.locator("#saveDeckBtn").click());
      assert.equal(file.name, "root-locus-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await setK(page, "5");
  }),
});
