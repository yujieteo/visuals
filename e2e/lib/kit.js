// The fuller section-28 checks of a visual that scripts/new_visual.py generated, through the controls the shared
// kit (scripts/kit/kit.js) gives every such page: the URL fragment, Back and Forward, the Cmd/Ctrl+K palette,
// Reset, "Save view JSON" and "Load view JSON", the Markdown record and the beamdswitch deck. The visual names
// only how to change its view (a control that adds a Back entry), the text that change puts in the Markdown
// record, and a slider for the keyboard check. The state each check compares is the kit's semantic state.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, fullSuite, jsonRoundTrip, markdownExport, resetsToDefaults, saved, settlesTo, using } from "./full.js";

/**
 * The kit's semantic state of the page.
 * @param {import("playwright").Page} page
 * @returns {Promise<Record<string, unknown>>}
 */
export const kitState = (page) => page.evaluate(() => /** @type {any} */ (window).VisualKit.app.state);

/**
 * @typedef {object} KitVisual
 * @property {(page: import("playwright").Page) => Promise<unknown>} change change the view with a control that adds a Back entry
 * @property {string} marker text the changed view's Markdown record holds and the default page does not show
 * @property {string} slider a selector for a range input that names a state field
 */

/**
 * Run every full check for one generated visual.
 * @param {string} slug
 * @param {KitVisual} visual
 */
export async function kitSuite(slug, visual) {
  const deck = "#save-beamdswitch, #copy-beamdswitch";
  await fullSuite(slug, {
    "url-state": (ctx) => using(ctx.open, async (s) => {
      await visual.change(s.page);
      const changed = await kitState(s.page);
      const hash = await s.page.evaluate(() => location.hash);
      assert.notEqual(hash, "", "the changed view is in the URL fragment");
      const link = await ctx.open(hash);
      try {
        assert.deepEqual(await kitState(link.page), changed, "the URL restores the view");
        await link.page.goto(link.page.url().split("#")[0] + "#unknown_field=1");
        await link.page.reload();
        assert.match(await link.page.locator("#notice").innerText(), /is not part of this view/, "a stale link resets with a notice");
      } finally {
        await link.close();
      }
    }),

    "back-forward": (ctx) => using(ctx.open, async (s) => {
      const initial = await kitState(s.page);
      const entries = await s.page.evaluate(() => history.length);
      await visual.change(s.page);
      const changed = await kitState(s.page);
      assert.ok(await s.page.evaluate(() => history.length) > entries, "the change adds a history entry");
      await s.page.goBack();
      await settlesTo(() => kitState(s.page), initial, "Back restores the earlier view");
      await s.page.goForward();
      await settlesTo(() => kitState(s.page), changed, "Forward restores the later view");
    }),

    keyboard: (ctx) => using(ctx.open, async (s) => {
      const initial = await kitState(s.page);
      await s.page.locator(visual.slider).focus();
      await s.page.keyboard.press("ArrowRight");
      assert.notDeepEqual(await kitState(s.page), initial, "an arrow key on the focused slider changes the state");
      await s.page.locator("#reset").focus();
      await s.page.keyboard.press("Enter");
      await settlesTo(() => kitState(s.page), initial, "Enter on the focused Reset button resets the view");
    }),

    "command-palette": (ctx) => using(ctx.open, async (s) => {
      const initial = await kitState(s.page);
      await visual.change(s.page);
      await s.page.keyboard.press("ControlOrMeta+k");
      assert.ok(await s.page.locator("dialog#palette[open]").isVisible(), "Cmd/Ctrl+K opens the command palette");
      await s.page.keyboard.type("Reset the view");
      await s.page.keyboard.press("Enter");
      await settlesTo(() => kitState(s.page), initial, "choosing Reset in the palette resets the view");
      assert.ok(!(await s.page.locator("dialog#palette[open]").count()), "running a command closes the palette");
    }),

    reset: (ctx) => resetsToDefaults(ctx.open, async (page) => { await visual.change(page); }, kitState),

    "json-round-trip": (ctx) => jsonRoundTrip(ctx.open, async (page) => { await visual.change(page); }, kitState),

    "markdown-export": (ctx) => markdownExport(ctx.open, async (page) => { await visual.change(page); }, visual.marker, deck),

    "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
      await visual.change(s.page);
      const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
      assert.equal(file.name, `${slug}-beamdswitch.md`);
      assertBeamdswitchDeck(file.text);
      assert.ok(file.text.includes(visual.marker), "the deck shows the current view");
    }),

    "dark-mode": (ctx) => assertDarkMode(ctx),

    "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => { await visual.change(page); }),
  });
}
