// Lug and pin joint: the fuller section-28 checks. The whole input lives in
// the URL fragment (#s=<json>) and a changed fragment reloads it; Save JSON and
// Load JSON round-trip the input; the deck buttons save a beamdswitch deck.
// The page has no command palette, Reset control or session Markdown, and it
// replaces its history entry rather than adding one, so Back does not step
// through edits; these are recorded as findings.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, output, saved } from "../../../e2e/lib/full.js";

/**
 * Set a numeric input and let the page recompute.
 * @param {import("playwright").Page} page
 * @param {string} id
 * @param {string} value
 */
async function setField(page, id, value) {
  await page.locator(`#${id}`).fill(value);
  await page.locator(`#${id}`).dispatchEvent("change");
}

/** @param {import("playwright").Page} page */
const summary = (page) => page.locator("#summary").innerText();

/** @param {import("playwright").Page} page */
const stateInHash = (page) => page.evaluate(() => JSON.parse(decodeURIComponent(location.hash.replace(/^#s=/, ""))));

await fullSuite("lug-joint", {
  "url-state": async ({ open }) => {
    const s = await open();
    let hash;
    try {
      await setField(s.page, "f-load-alpha", "35");
      await s.page.waitForFunction(() => location.hash.startsWith("#s="));
      const state = await stateInHash(s.page);
      assert.equal(state.load.alpha, 35, "the fragment holds the edited load angle");
      hash = new URL(s.page.url()).hash;
      assertClean(s);
    } finally {
      await s.close();
    }
    const t = await open(hash);
    try {
      assert.equal(await t.page.locator("#f-load-alpha").inputValue(), "35", "the link restores the load angle");
      assertClean(t);
    } finally {
      await t.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open();
    try {
      await setField(s.page, "f-load-alpha", "20");
      await s.page.waitForFunction(() => location.hash.startsWith("#s="));
      await setField(s.page, "f-load-alpha", "60");
      await s.page.waitForFunction(() => decodeURIComponent(location.hash).includes('"alpha":60'));
      const here = s.page.url().split("#")[0];
      await s.page.goBack();
      assert.equal(s.page.url().split("#")[0], here, "Back stays in the visual and steps back to the previous input (spec section 12)");
      await s.page.waitForFunction(() => decodeURIComponent(location.hash).includes('"alpha":20'), undefined, { timeout: 5_000 });
      assert.equal(await s.page.locator("#f-load-alpha").inputValue(), "20", "Back restores the previous load angle");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const before = await summary(s.page);
      await s.page.locator("#f-load-alpha").focus();
      await s.page.keyboard.press("ArrowUp");
      await s.page.locator("#f-load-alpha").dispatchEvent("change");
      assert.notEqual(await summary(s.page), before, "ArrowUp in the load angle changes the result");
      await s.page.locator("#example").focus();
      await s.page.keyboard.press("ArrowDown");
      assert.notEqual(await s.page.locator("#example").inputValue(), "", "the Example menu is operable from the keyboard");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open();
    try {
      await s.page.keyboard.press("ControlOrMeta+k");
      assert.ok(await s.page.getByRole("dialog").isVisible().catch(() => false), "Cmd/Ctrl+K opens a command palette (spec section 11)");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const initial = await summary(s.page);
      await setField(s.page, "f-load-alpha", "70");
      assert.notEqual(await summary(s.page), initial, "changing the load angle changes the result");
      const resetButton = s.page.getByRole("button", { name: /^reset/i });
      assert.ok(await resetButton.count() > 0, "the page has a Reset control (spec section 28)");
      await resetButton.first().click();
      assert.equal(await summary(s.page), initial, "Reset restores the default inputs and result");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    let exported;
    try {
      await setField(s.page, "f-load-alpha", "45");
      exported = await saved(s.page, () => s.page.locator("#save").click());
      assert.equal(exported.name, "lug-joint.json");
      assert.equal(JSON.parse(exported.text).load.alpha, 45, "the file holds the edited load angle");
      assertClean(s);
    } finally {
      await s.close();
    }
    const file = join(process.env.E2E_TMP ?? tmpdir(), `lug-joint-import-${process.pid}.json`);
    await writeFile(file, exported.text);
    const t = await open();
    try {
      await t.page.locator("#file").setInputFiles(file);
      await t.page.waitForFunction(() => /** @type {HTMLInputElement} */ (document.getElementById("f-load-alpha")).value === "45");
      const again = await saved(t.page, () => t.page.locator("#save").click());
      assert.deepEqual(JSON.parse(again.text), JSON.parse(exported.text), "save, load and save again gives the same file");
      assertClean(t);
    } finally {
      await t.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await setField(s.page, "f-load-alpha", "45");
      const copyMarkdown = s.page.getByRole("button", { name: /markdown|\.md\b/i }).and(s.page.locator(":not(#save-beamdswitch):not(#copy-beamdswitch)"));
      assert.ok(await copyMarkdown.count() > 0, "the page copies its session state as Markdown, separate from the beamdswitch deck (spec section 14)");
      const text = await output(s.page, copyMarkdown.first());
      assert.match(text, /^# /m, "the session is a Markdown document");
      assert.doesNotMatch(text, /^::: narration$/m, "the session Markdown is not the beamdswitch deck");
      assert.match(text, /45\s*°/, "the session Markdown carries the edited load angle");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      // The worked example is an axial load; an oblique angle would need the transverse coefficients it leaves blank.
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "lug-joint-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /axial load at α = 0°/, "the deck is for the page's joint");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await setField(page, "f-load-alpha", "50");
  }),
});
