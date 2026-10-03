// Radar network visualiser, the fuller section-28 checks. The example, selected link, time and tab live in the
// URL fragment; the link table, the time controls and Cmd/Ctrl+K drive the state; Reset restores the scene;
// the scenario saves and loads as JSON; the page exports a Markdown record and a narrated beamdswitch deck;
// calculations typeset with the embedded MathJax and a sampled dwell runs, all with no request.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, blur, fullSuite, jsonRoundTrip, markdownExport, resetsToDefaults, saved, using } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const selected = (page) => page.evaluate(() => /** @type {any} */ (window).RadarNet.app.scn.view.selectedLink);
/** @param {import("playwright").Page} page */
const state = (page) => page.evaluate(() => { const R = /** @type {any} */ (window).RadarNet; return [R.state.modelDigest(R.app.scn), R.app.scn.view.example, R.app.scn.view.time_s]; });
/** @param {import("playwright").Page} page */
async function editPower(page) {
  await page.evaluate(() => { for (const d of document.querySelectorAll("#controls details")) /** @type {HTMLDetailsElement} */ (d).open = true; });
  const input = page.locator("#f-radars_R1_tx_power_W");
  await input.fill("50");
  await input.press("Enter");
  await input.evaluate((el) => el.dispatchEvent(new Event("change")));
}

await fullSuite("radar-network", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    await s.page.locator('[data-toggle="R2>R3:T4"]').click();
    assert.match(await s.page.evaluate(() => location.hash), /link=R2%3ER3%3AT4/, "the selected link is in the URL");
    const link = await ctx.open("#ex=equal-delay&link=S1%3ES2%3AB&t=5&tab=checks");
    try {
      assert.equal(await selected(link.page), "S1>S2:B");
      assert.equal(await link.page.locator("#example-select").inputValue(), "equal-delay");
      assert.equal(await link.page.locator("#time-num").inputValue(), "5");
      assert.equal(await link.page.locator("#tab-checks").getAttribute("aria-selected"), "true");
    } finally {
      await link.close();
    }
    const stale = await ctx.open("#ex=no-such-example");
    try {
      assert.match(await stale.page.locator("#notice").innerText(), /not in this page/);
      assert.equal(await stale.page.locator("#link-body tr.link-row").count(), 36, "a stale example falls back to the initial scene");
    } finally {
      await stale.close();
    }
  }),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    const first = await selected(s.page);
    await s.page.locator('[data-toggle="R3>R1:T2"]').click();
    assert.equal(await selected(s.page), "R3>R1:T2");
    await s.page.goBack();
    await s.page.waitForFunction((id) => /** @type {any} */ (window).RadarNet.app.scn.view.selectedLink === id, first);
    await s.page.goForward();
    await s.page.waitForFunction(() => /** @type {any} */ (window).RadarNet.app.scn.view.selectedLink === "R3>R1:T2");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    await blur(s.page);
    await s.page.keyboard.press("Space");
    assert.equal(await s.page.locator("#play").getAttribute("aria-pressed"), "true", "Space plays outside text fields");
    await s.page.waitForTimeout(400);
    await blur(s.page);
    await s.page.keyboard.press("Space");
    assert.equal(await s.page.locator("#play").getAttribute("aria-pressed"), "false");
    assert.ok(Number(await s.page.locator("#time-num").inputValue()) > 0, "time advanced while playing");
    await s.page.locator('[data-toggle="R1>R2:T3"]').focus();
    await s.page.keyboard.press("Enter");
    assert.equal(await s.page.locator('[data-toggle="R1>R2:T3"]').getAttribute("aria-expanded"), "true", "Enter opens the calculation");
    await s.page.waitForSelector("tr.calc-row mjx-container", { timeout: 20_000 });
    assert.ok(await s.page.locator("tr.calc-row mjx-container").count() >= 10, "the embedded MathJax typesets the calculation");
    await blur(s.page);
    await s.page.keyboard.press("d");
    assert.equal(await s.page.locator('[data-toggle="R1>R2:T3"]').getAttribute("aria-expanded"), "false", "D closes the selected calculation");
    await s.page.locator("#scene").focus();
    const yaw = await s.page.evaluate(() => /** @type {any} */ (window).RadarNet.app.scn.view.camera.yaw_deg);
    await s.page.keyboard.press("ArrowLeft");
    assert.notEqual(await s.page.evaluate(() => /** @type {any} */ (window).RadarNet.app.scn.view.camera.yaw_deg), yaw, "arrow keys rotate the focused scene");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    assert.ok(await s.page.locator("dialog[open]").count() > 0, "Cmd/Ctrl+K opens the search");
    await s.page.keyboard.type("link R2>R3:T4");
    await s.page.keyboard.press("Enter");
    assert.equal(await selected(s.page), "R2>R3:T4", "choosing a result runs it");
    assert.equal(await s.page.locator('[data-toggle="R2>R3:T4"]').getAttribute("aria-expanded"), "true");
  }),

  reset: (ctx) => resetsToDefaults(ctx.open, async (page) => { await editPower(page); await page.locator("#time-num").fill("30"); await page.locator("#time-num").press("Enter"); }, state),

  "json-round-trip": (ctx) => jsonRoundTrip(ctx.open, editPower, (page) => page.evaluate(() => { const R = /** @type {any} */ (window).RadarNet; return R.state.modelDigest(R.app.scn); })),

  "markdown-export": (ctx) => markdownExport(ctx.open, async (page) => { await page.locator("#example-select").selectOption("equal-delay"); }, "S1>S2:B", "#report-download, #report-copy"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    const file = await saved(s.page, () => s.page.locator("#report-download").click());
    assertBeamdswitchDeck(file.text);
    assert.match(file.text, /^voice: bf_emma$/m);
    assert.equal(file.name, "radar-network-beamdswitch.md");
    for (const tx of ["R1", "R2", "R3"]) for (const rx of ["R1", "R2", "R3"]) for (const tg of ["T1", "T2", "T3", "T4"]) assert.ok(file.text.includes(`## ${tx}>${rx}:${tg}:`), `${tx}>${rx}:${tg}`);
    const again = await saved(s.page, () => s.page.locator("#report-download").click());
    assert.equal(again.text, file.text, "an identical state gives an identical deck");
    // A sampled dwell runs in the page (worker or main thread) and the deck then carries it.
    await s.page.locator("#tab-rd").click();
    await s.page.getByRole("button", { name: "Calculate dwell" }).click();
    await s.page.waitForSelector(".rd-canvas", { timeout: 60_000 });
    const withDwell = await saved(s.page, () => s.page.locator("#report-download").click());
    assert.match(withDwell.text, /## Sampled dwell: R1 with the R1 filter/);
    // A model edit makes the stored dwell stale until it is recalculated.
    await editPower(s.page);
    await s.page.locator("#tab-rd").click();
    assert.match(await s.page.locator("#panel-rd .stale").innerText(), /Result from previous parameters/);
    const staleDeck = await saved(s.page, () => s.page.locator("#report-download").click());
    assert.match(staleDeck.text, /\(previous parameters\)/);
    // A running calculation cancels and leaves the controls responsive.
    await s.page.getByRole("button", { name: "Calculate all channels" }).click();
    await s.page.getByRole("button", { name: "Cancel" }).first().click();
    await s.page.waitForFunction(() => /cancelled|calculated/i.test(document.getElementById("notice")?.textContent ?? ""));
    await s.page.locator("#play").click();
    assert.equal(await s.page.locator("#play").getAttribute("aria-pressed"), "true", "the scene controls still respond");
    await s.page.locator("#play").click();
  }),

  "dark-mode": async (ctx) => {
    await assertDarkMode(ctx);
    await using(ctx.open, async (s) => {
      await s.page.emulateMedia({ media: "print" });
      assert.ok(!(await s.page.locator(".toolbar").isVisible()), "print removes the controls");
      assert.ok(await s.page.locator("#link-table").isVisible(), "print keeps the link table");
      await s.page.emulateMedia({ media: "screen" });
    });
  },

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator("#play").click();
    await page.waitForTimeout(300);
    await page.locator("#play").click();
  }),
});
