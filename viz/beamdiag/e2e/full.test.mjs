// Beam diagram creator: the fuller section-28 checks. The canonical example: a
// 6 m pinned–pinned beam under a uniform 10 kN/m load stands on two 30 kN
// reactions. Support and load handles are keyboard sliders (arrow keys move
// them and the solution follows); the beamdswitch button saves a narrated
// deck and Save Markdown saves the hand calculations. The page keeps no state
// in the URL and has no palette or Reset.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../../e2e/lib/full.js";

/** The reactions list, one line per support. @param {import("playwright").Page} page */
const reactions = async (page) => (await page.locator("#reactions").innerText()).split("\n").map((l) => l.trim()).filter(Boolean);
/** The force a reaction line states, as a number. @param {string} line */
const force = (line) => Number(/: (−?[\d,.]+) /.exec(line)?.[1].replace(/,/g, "").replace("−", "-"));

await fullSuite("beamdiag", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#preset").selectOption("pin-pin-udl");
      await s.page.locator("#units").selectOption("kN-m");
      const before = await reactions(s.page);
      assert.equal(before.length, 2);
      assert.deepEqual(before.map(force), [30, 30], `two 30 kN reactions carry 10 kN/m over 6 m: ${before.join(" | ")}`);
      // Move the second support inwards from the keyboard: the reactions stop being equal.
      const handle = s.page.locator('.handle[data-key="s1"]');
      await handle.focus();
      const at = await handle.getAttribute("aria-valuenow");
      for (let i = 0; i < 5; i++) await s.page.keyboard.press("ArrowLeft");
      await s.page.waitForFunction((v) => document.querySelector('.handle[data-key="s1"]')?.getAttribute("aria-valuenow") !== v, at);
      const after = await reactions(s.page);
      assert.notEqual(force(after[0]), force(after[1]), `an overhang makes the reactions unequal: ${after.join(" | ")}`);
      assert.ok(Math.abs(force(after[0]) + force(after[1]) - 60) < 0.05, "they still carry the whole 60 kN");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#preset").selectOption("propped-cantilever");
      const file = await saved(s.page, () => s.page.locator("#save-hand").click());
      assert.equal(file.name, "beamdiag-hand-calculations.md");
      assert.match(file.text, /^# /m, "the hand calculations are a Markdown document");
      assert.match(file.text, /Propped cantilever/i, "for the beam on the page");
      assert.match(await s.page.locator("#hand-status").innerText(), /^Saved beamdiag-hand-calculations\.md/);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#preset").selectOption("fixed-fixed-udl");
      const deck = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(deck.name, "beamdiag-beamdswitch.md");
      assertBeamdswitchDeck(deck.text);
      assert.match(deck.text, /Indeterminate to degree 2/, "a fixed–fixed beam is indeterminate to degree 2");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#preset").selectOption("continuous");
  }),
});
