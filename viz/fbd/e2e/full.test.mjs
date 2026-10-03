// FBD Drawer: the fuller section-28 checks. The drawing lives on the canvas
// and in localStorage (no URL state); the File menu opens the reference
// drawings, starts a new drawing (the reset), saves and reopens JSON, and
// saves Markdown and a beamdswitch deck; Escape returns to the Select tool.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/**
 * Choose a File menu item by its visible name, accepting any confirmation.
 * @param {import("playwright").Page} page
 * @param {string} name
 */
async function menu(page, name) {
  await page.locator("#file").click();
  await page.getByRole("menuitem", { name }).click();
}
/** @param {import("playwright").Page} page */
const acceptDialogs = (page) => page.on("dialog", (d) => { void d.accept(); });
/**
 * Open the first reference drawing and return its saved JSON.
 * @param {import("playwright").Page} page
 */
async function openCantilever(page) {
  acceptDialogs(page);
  await page.locator("#file").click();
  await page.getByRole("menuitem").filter({ hasText: /cantilever/i }).first().click();
  return (await saved(page, () => menu(page, "Save JSON"))).text;
}

await fullSuite("fbd", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const support = s.page.locator("[data-tool=support]");
      await support.focus();
      await s.page.keyboard.press("Enter");
      assert.equal(await support.getAttribute("aria-pressed"), "true", "Enter on a tool selects it");
      await s.page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
      await s.page.keyboard.press("Escape");
      assert.equal(await s.page.locator("[data-tool=select]").getAttribute("aria-pressed"), "true", "Escape returns to the Select tool");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  reset: async ({ open }) => {
    const s = await open();
    try {
      const drawing = JSON.parse(await openCantilever(s.page));
      assert.ok(drawing.geometry.bodies.length > 0, "the reference drawing has bodies");
      await menu(s.page, "New drawing");
      const fresh = JSON.parse((await saved(s.page, () => menu(s.page, "Save JSON"))).text);
      assert.deepEqual(fresh.geometry.bodies, [], "New drawing clears the bodies");
      assert.deepEqual(fresh.geometry.loads, [], "New drawing clears the loads");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    try {
      const text = await openCantilever(s.page);
      await menu(s.page, "New drawing");
      await s.page.locator("input[type=file]").setInputFiles({ name: "drawing.fbd.json", mimeType: "application/json", buffer: Buffer.from(text) });
      await s.page.waitForFunction(() => document.getElementById("toast")?.textContent === "Opened drawing.fbd.json");
      const again = await saved(s.page, () => menu(s.page, "Save JSON"));
      assert.equal(again.text, text, "saving the reopened drawing gives the same JSON");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      const drawing = JSON.parse(await openCantilever(s.page));
      const file = await saved(s.page, () => menu(s.page, "Save Markdown"));
      assert.match(file.name, /\.fbd\.md$/);
      assert.ok(file.text.startsWith(`# ${drawing.title}\n`), "the schedule is titled with the open drawing's title");
      for (const { id } of [...drawing.geometry.bodies, ...drawing.geometry.loads]) {
        assert.match(file.text, new RegExp(`^\\| ${id} \\|`, "m"), `the schedule lists ${id} from the open drawing`);
      }
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      await openCantilever(s.page);
      const file = await saved(s.page, () => menu(s.page, "Save beamdswitch deck"));
      assert.match(file.name, /-beamdswitch\.md$/);
      assertBeamdswitchDeck(file.text);
      assert.match(file.text, /Free body diagram:/);
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("[data-tool=support]").click();
  }),
});
