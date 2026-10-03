// Information gain: the fuller section-28 checks. Example pills load a
// scenario, Reset returns to the restaurant example, "Copy analysis" copies a
// Markdown summary and the beamdswitch buttons save or copy a deck. The page
// keeps its scenario in localStorage, not the URL, and has no command palette
// or JSON file export, which are recorded as findings.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

/** @param {import("playwright").Page} page */
const hypothesis = (page) => page.locator("#hyp").inputValue();

/**
 * Click a control that saves a file or copies text, and return that text. The
 * clipboard is a stand-in, so no browser asks for permission.
 * @param {import("playwright").Page} page
 * @param {import("playwright").Locator} control
 */
async function output(page, control) {
  await page.evaluate(() => {
    const w = /** @type {Window & { __copied?: string }} */ (window);
    delete w.__copied;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (/** @type {string} */ t) => { w.__copied = t; } } });
  });
  const download = page.waitForEvent("download", { timeout: 5_000 });
  const copied = page.waitForFunction(() => /** @type {Window & { __copied?: string }} */ (window).__copied, undefined, { timeout: 5_000 });
  await control.click();
  const first = await Promise.any([download, copied]);
  download.catch(() => {});
  copied.catch(() => {});
  return "path" in first ? readFile(await first.path(), "utf8") : String(await first.jsonValue());
}

/** @param {import("playwright").Page} page */
const exportJson = (page) => page.getByRole("button", { name: /^(save|export|download|copy)\b.*\bjson\b/i });

await fullSuite("information-gain", {
  "url-state": async ({ open }) => {
    const s = await open();
    try {
      const before = s.page.url();
      await s.page.locator("[data-act=example][data-ex=parcel]").click();
      assert.notEqual(s.page.url(), before, "choosing an example records the scenario in the URL (spec section 12)");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "back-forward": async ({ open }) => {
    const s = await open();
    try {
      const first = await hypothesis(s.page);
      await s.page.locator("[data-act=example][data-ex=parcel]").click();
      const here = s.page.url();
      await s.page.goBack();
      assert.equal(s.page.url().split("#")[0].split("?")[0], here.split("#")[0].split("?")[0], "Back stays in the visual and steps back through its states (spec section 12)");
      assert.equal(await hypothesis(s.page), first, "Back restores the previous example");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  keyboard: async ({ open }) => {
    const s = await open();
    try {
      const pill = s.page.locator("[data-act=example][data-ex=phishing]");
      await pill.focus();
      await s.page.keyboard.press("Enter");
      await s.page.waitForFunction(() => document.querySelector("[data-act=example][data-ex=phishing]")?.getAttribute("aria-pressed") === "true");
      assert.equal(await hypothesis(s.page), "This email is phishing.", "Enter on an example pill loads it");
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
      const first = await hypothesis(s.page);
      await s.page.locator("[data-act=example][data-ex=project]").click();
      assert.notEqual(await hypothesis(s.page), first);
      await s.page.locator("[data-act=reset]").click();
      assert.equal(await hypothesis(s.page), first, "Reset returns to the restaurant example");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "json-round-trip": async ({ open }) => {
    const s = await open();
    let exported;
    let parcel;
    try {
      await s.page.locator("[data-act=example][data-ex=parcel]").click();
      parcel = await hypothesis(s.page);
      assert.ok(await exportJson(s.page).count() > 0, "the page exports and imports its scenario as JSON (spec section 14)");
      exported = await output(s.page, exportJson(s.page).first());
      JSON.parse(exported);
      assertClean(s);
    } finally {
      await s.close();
    }
    const t = await open();
    try {
      assert.notEqual(await hypothesis(t.page), parcel, "a fresh page opens on the restaurant example");
      const importJson = t.page.getByRole("button", { name: /^(load|import|open)\b.*\bjson\b/i });
      assert.ok(await importJson.count() > 0, "the page imports its scenario from JSON (spec section 14)");
      const [chooser] = await Promise.all([t.page.waitForEvent("filechooser", { timeout: 5_000 }), importJson.first().click()]);
      await chooser.setFiles({ name: "information-gain.json", mimeType: "application/json", buffer: Buffer.from(exported) });
      await t.page.waitForFunction((v) => /** @type {HTMLInputElement | null} */ (document.getElementById("hyp"))?.value === v, parcel, { timeout: 5_000 });
      assert.deepEqual(JSON.parse(await output(t.page, exportJson(t.page).first())), JSON.parse(exported), "export, import and export again gives the same scenario");
      assertClean(t);
    } finally {
      await t.close();
    }
  },

  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await s.page.locator("[data-act=example][data-ex=parcel]").click();
      const text = await output(s.page, s.page.locator("#copy-analysis"));
      assert.match(text, /^# Information gain analysis/m, "the analysis has its title");
      assert.match(text, new RegExp(`## Question\\n${(await hypothesis(s.page)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "the analysis states the page's question");
      assert.match(text, /## Most information overall\n\S/, "the analysis names the most informative check");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "beamdswitch-export": async ({ open }) => {
    const s = await open();
    try {
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, "information-gain-beamdswitch.md");
      assertBeamdswitchDeck(file.text);
      assert.equal(await output(s.page, s.page.locator("#copy-beamdswitch")), file.text, "Copy deck copies the same deck that was saved");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("[data-act=example][data-ex=shopping]").click();
  }),
});
