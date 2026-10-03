// Motives and periods: the fuller section-28 checks. Three examples on tabs;
// the URL fragment holds the example and its parameters; JSON, Markdown and
// a beamdswitch deck export; N and P step between examples.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/**
 * @param {import("playwright").Page} page
 * @param {string} id
 * @param {string} value
 */
const slide = (page, id, value) => page.locator(`#${id}`).evaluate((el, v) => {
  const input = /** @type {HTMLInputElement} */ (el);
  input.value = v;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}, value);

/**
 * @param {import("playwright").Page} page
 * @param {"tate" | "zeta" | "feynman"} example
 */
const showing = (page, example) => page.getByTestId(`panel-${example}`).waitFor({ state: "visible" });

await fullSuite("motives-periods", {
  "url-state": async ({ open }) => {
    const s = await open();
    try {
      await slide(s.page, "tate-centre", "1.5");
      await s.page.waitForFunction(() => location.hash.includes("centre=1.5"));
      const headline = await s.page.getByTestId("tate-headline").textContent();
      assert.match(headline ?? "", /outside/, "moving the centre past 0 says the loop misses it");
      const restored = await open(await s.page.evaluate(() => location.hash));
      try {
        assert.equal(await restored.page.locator("#tate-centre").inputValue(), "1.5");
        assert.equal(await restored.page.getByTestId("tate-headline").textContent(), headline, "the link restores the result");
        assertClean(restored);
      } finally {
        await restored.close();
      }
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open();
    try {
      await s.page.getByRole("tab", { name: /ζ|zeta/i }).click();
      await showing(s.page, "zeta");
      await s.page.getByRole("tab", { name: /Feynman/i }).click();
      await showing(s.page, "feynman");
      await s.page.goBack();
      await showing(s.page, "zeta");
      assert.equal(await s.page.getByTestId("panel-feynman").isVisible(), false, "Back leaves the Feynman panel");
      await s.page.goForward();
      await showing(s.page, "feynman");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#tab-tate").focus();
      await s.page.keyboard.press("ArrowRight");
      await showing(s.page, "zeta");
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "tab-zeta", "ArrowRight moves focus with the tab");
      await s.page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
      await s.page.keyboard.press("n");
      await showing(s.page, "feynman");
      await s.page.keyboard.press("p");
      await showing(s.page, "zeta");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open("#example=zeta&s=5,3");
    try {
      await showing(s.page, "zeta");
      await s.page.getByRole("button", { name: "Reset", exact: true }).click();
      await showing(s.page, "tate");
      assert.equal(await s.page.locator("#tate-centre").inputValue(), "0", "Reset restores the default centre");
      assert.equal(await s.page.locator("#msg").textContent(), "Reset to the defaults.");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    try {
      await slide(s.page, "tate-centre", "1.5");
      const before = await s.page.getByTestId("tate-headline").textContent();
      const file = await saved(s.page, () => s.page.locator("#save-json").click());
      assert.equal(file.name, "motives-periods-state.json");
      assert.equal(JSON.parse(file.text).state.example, "tate");
      await s.page.getByRole("button", { name: "Reset", exact: true }).click();
      assert.notEqual(await s.page.getByTestId("tate-headline").textContent(), before, "Reset changed the state");
      await s.page.locator("#import-text").fill(file.text);
      await s.page.locator("#import").click();
      await s.page.waitForFunction(() => document.getElementById("msg")?.textContent === "Imported the state.");
      assert.equal(await s.page.locator("#tate-centre").inputValue(), "1.5", "the import restores the centre");
      assert.equal(await s.page.getByTestId("tate-headline").textContent(), before, "the import restores the result");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open("#example=zeta&s=5,3");
    try {
      await showing(s.page, "zeta");
      const file = await saved(s.page, () => s.page.locator("#save-md").click());
      assert.equal(file.name, "motives-periods.md");
      assert.match(file.text, /^# /m, "the export is a Markdown document");
      assert.match(file.text, /ζ\(5, 3\)/, "the export carries the composition on the page");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#save-deck").click());
      assert.equal(file.name, "motives-periods-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#tab-zeta").click();
    await showing(page, "zeta");
  }),
});
