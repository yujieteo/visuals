// Markdown Explorer: the fuller section-28 checks. The fragment holds only the
// place (#/tab/<id>/<slug> or #/tag/<name>), tabs live in localStorage, and a
// fresh context opens on the three demo tabs t1 (guide.md), t2 (links.md) and
// t3 (search.md), named after their files. Ctrl/Cmd+K or / opens search; Clear all resets to the demo.
import assert from "node:assert/strict";
import { assertClean, assertDarkMode, assertReducedMotion, fullSuite } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const selectedTab = (page) => page.locator("#tabstrip [role=tab][aria-selected=true]").textContent();
/**
 * Wait until the tab named name is the one shown: the route is applied, not just in the URL.
 * @param {import("playwright").Page} page @param {string} name
 */
const shown = (page, name) => page.locator("#tabstrip [role=tab][aria-selected=true]", { hasText: name }).waitFor();
/** @param {import("playwright").Page} page @param {string} name */
const openTab = async (page, name) => { await page.locator("#tabstrip [role=tab]", { hasText: name }).click(); await shown(page, name); };
/** @param {import("playwright").Page} page */
const readerHeading = (page) => page.locator("#doc .body :is(h1, h2, h3)").first().textContent();
/** @param {import("playwright").Page} page @param {string} hash */
const atHash = (page, hash) => page.waitForFunction((h) => location.hash === h, hash);
/**
 * On a phone the section tree and tags sit in a drawer opened from the top bar.
 * @param {import("playwright").Page} page
 */
const showSide = async (page) => { if (!(await page.locator("#tree").isVisible())) await page.locator("#open-side").click(); };
/** @param {import("playwright").Page} page */
const paletteOpen = (page) => page.locator("#palette-wrap").evaluate((el) => el.classList.contains("open"));

await fullSuite("md-explorer", {
  "url-state": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#tabstrip [role=tab]", { hasText: "search.md" }).click();
      await atHash(s.page, "#/tab/t3/search-and-shortcuts");
      await showSide(s.page);
      await s.page.locator("#tree").getByRole("link", { name: "Shortcuts", exact: true }).click();
      await atHash(s.page, "#/tab/t3/shortcuts");
      const restored = await open("#/tab/t3/shortcuts");
      try {
        assert.equal(await selectedTab(restored.page), "search.md", "the link selects the tab");
        assert.equal(await readerHeading(restored.page), "Shortcuts", "the link opens the section");
        assertClean(restored);
      } finally {
        await restored.close();
      }
      // A route to a missing section falls back to the tab's first section.
      const fallback = await open("#/tab/t2/no-such-section");
      try {
        await atHash(fallback.page, "#/tab/t2/links-and-backlinks");
        assertClean(fallback);
      } finally {
        await fallback.close();
      }
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#tabstrip [role=tab]", { hasText: "links.md" }).click();
      await atHash(s.page, "#/tab/t2/links-and-backlinks");
      await showSide(s.page);
      await s.page.locator("#tags a.tag", { hasText: "#docs" }).first().click();
      await atHash(s.page, "#/tag/docs");
      await s.page.locator("#doc .tagview").waitFor();
      assert.match(await s.page.locator("#doc").innerText(), /sections? in \d+ tabs?/, "the tag view lists the tagged sections");
      await s.page.goBack();
      await atHash(s.page, "#/tab/t2/links-and-backlinks");
      assert.equal(await selectedTab(s.page), "links.md", "Back returns to the tab");
      await s.page.goForward();
      await atHash(s.page, "#/tag/docs");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await s.page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
      await s.page.keyboard.press("/");
      assert.ok(await paletteOpen(s.page), "/ opens search outside text fields");
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "q", "search takes focus");
      await s.page.keyboard.press("Escape");
      assert.equal(await paletteOpen(s.page), false, "Escape closes search");
      // Tab in the editor indents by two spaces instead of leaving the field.
      await s.page.locator("#drawer-toggle").click();
      await s.page.locator("#editor").fill("# Indented");
      await s.page.locator("#editor").press("End");
      await s.page.locator("#editor").press("Tab");
      assert.equal(await s.page.locator("#editor").inputValue(), "# Indented  ");
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "editor", "focus stays in the editor");
      // Typing straight after + goes to the new tab, not the one it replaces:
      // the keystroke lands in the same task as the click, before hashchange.
      await s.page.evaluate(() => {
        /** @type {HTMLElement} */ (document.getElementById("add-tab")).click();
        document.execCommand("insertText", false, "# Fresh");
      });
      await openTab(s.page, "guide.md");
      assert.equal(await s.page.locator("#editor").inputValue(), "# Indented  ", "the previous tab keeps its own text");
      await openTab(s.page, "Fresh");
      assert.equal(await s.page.locator("#editor").inputValue(), "# Fresh", "the new tab gets the typed text");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "command-palette": async ({ open }) => {
    const s = await open();
    try {
      await s.page.keyboard.press("ControlOrMeta+k");
      assert.ok(await paletteOpen(s.page), "Ctrl/Cmd+K opens search");
      await s.page.keyboard.type("shortcuts");
      await s.page.locator("#results .hit").first().waitFor();
      await s.page.keyboard.press("Enter");
      await atHash(s.page, "#/tab/t3/shortcuts");
      assert.equal(await paletteOpen(s.page), false, "choosing a result closes search");
      assert.equal(await readerHeading(s.page), "Shortcuts", "the result's section opens");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("#add-tab").click();
      // Wait for the new tab's route so this checks reset; keyboard checks typing before it lands.
      await shown(s.page, "Untitled");
      await s.page.locator("#editor").fill("# Scratch");
      await s.page.locator("#tabstrip [role=tab]", { hasText: "Scratch" }).waitFor();
      assert.equal(await s.page.locator("#tabstrip [role=tab]").count(), 4);
      s.page.once("dialog", (d) => d.accept());
      await s.page.locator("#clear-all").click();
      await atHash(s.page, "#/tab/t1/");
      await s.page.waitForFunction(() => document.querySelectorAll("#tabstrip [role=tab]").length === 3);
      assert.deepEqual(await s.page.locator("#tabstrip [role=tab]").allTextContents(),
        ["guide.md", "links.md", "search.md"], "Clear all restores the demo tabs");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#drawer-toggle").click();
    await page.locator("#tabstrip [role=tab]", { hasText: "links.md" }).click();
  }),
});
