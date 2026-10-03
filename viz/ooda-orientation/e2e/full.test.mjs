// Orient (ooda-orientation): the fuller section-28 checks. The situation lives
// in localStorage, not the URL; a fresh context opens on the landing page, and
// "Try an example" loads the stalled-project example. Ctrl/Cmd+K opens the
// search and command palette, Alt+Arrow moves between stages, Reset asks in a
// dialog, Export JSON and Import JSON go through dialogs, Copy Markdown copies
// and the deck downloads.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
async function loadExample(page) {
  await page.getByRole("button", { name: "Try an example" }).click();
  await page.locator("[data-act=stage][aria-current=step]").waitFor();
}
/** @param {import("playwright").Page} page */
const stage = (page) => page.locator("[data-act=stage][aria-current=step]").getAttribute("data-id");
/** @param {import("playwright").Page} page */
const situationTitle = (page) => page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /orient/i.test(k)) ?? "") ?? "null")?.situation?.title ?? null);

await fullSuite("ooda-orientation", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await loadExample(s.page);
      const first = await stage(s.page);
      await s.page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
      await s.page.keyboard.press("Alt+ArrowRight");
      await s.page.waitForFunction((f) => document.querySelector("[data-act=stage][aria-current=step]")?.getAttribute("data-id") !== f, first);
      const next = await stage(s.page);
      await s.page.keyboard.press("Alt+ArrowLeft");
      await s.page.waitForFunction((f) => document.querySelector("[data-act=stage][aria-current=step]")?.getAttribute("data-id") === f, first);
      assert.notEqual(next, first, "Alt+ArrowRight moves to the next stage and Alt+ArrowLeft back");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open();
    try {
      await loadExample(s.page);
      await s.page.keyboard.press("ControlOrMeta+k");
      await s.page.locator("#palette[open]").waitFor();
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "pal-input", "the palette focuses its search field");
      const all = await s.page.locator("#pal-count").textContent();
      await s.page.keyboard.type("reset");
      await s.page.waitForFunction((a) => document.getElementById("pal-count")?.textContent !== a, all);
      assert.ok(await s.page.locator("#pal-list li").count() > 0, "typing finds matching commands");
      await s.page.keyboard.press("Escape");
      await s.page.waitForFunction(() => !document.getElementById("palette")?.hasAttribute("open"));
      await s.page.keyboard.press("ControlOrMeta+k");
      await s.page.locator("#palette[open]").waitFor();
      await s.page.keyboard.press("ControlOrMeta+k");
      await s.page.waitForFunction(() => !document.getElementById("palette")?.hasAttribute("open"));
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      await loadExample(s.page);
      assert.ok(await situationTitle(s.page), "the example is saved in this browser");
      await s.page.getByRole("button", { name: "Reset", exact: true }).click();
      await s.page.locator("#dlg-yes").click();
      await s.page.locator("#h-land").waitFor();
      assert.equal(await s.page.locator("[data-act=stage]").count(), 0, "Reset returns to the landing page");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    try {
      await loadExample(s.page);
      const title = await situationTitle(s.page);
      await s.page.getByRole("button", { name: "Export JSON", exact: true }).click();
      const file = await saved(s.page, () => s.page.locator("#dlg-dl").click());
      assert.equal(file.name, "orient-situation.json");
      await s.page.locator("#dlg-close").click();
      await s.page.getByRole("button", { name: "Reset", exact: true }).click();
      await s.page.locator("#dlg-yes").click();
      await s.page.locator("#h-land").waitFor();
      await s.page.getByRole("button", { name: "Import JSON", exact: true }).click();
      await s.page.locator("#imp-text").fill(file.text);
      await s.page.locator("#imp-go").click();
      await s.page.locator("[data-act=stage][aria-current=step]").waitFor();
      assert.equal(await situationTitle(s.page), title, "the import restores the situation");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await loadExample(s.page);
      // Copy Markdown writes to the clipboard; record the write instead of asking each browser for clipboard access.
      await s.page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (/** @type {string} */ t) => { /** @type {any} */ (window).__copied = t; } } });
      });
      await s.page.getByRole("button", { name: "Copy Markdown", exact: true }).click();
      await s.page.waitForFunction(() => typeof (/** @type {any} */ (window).__copied) === "string");
      const md = /** @type {string} */ (await s.page.evaluate(() => /** @type {any} */ (window).__copied));
      assert.match(md, /^# /m, "the copy is a Markdown document");
      assert.ok(md.includes(/** @type {string} */ (await situationTitle(s.page))), "it names the situation on the page");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await loadExample(s.page);
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "ooda-orientation-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await loadExample(page);
    await page.keyboard.press("Alt+ArrowRight");
  }),
});
