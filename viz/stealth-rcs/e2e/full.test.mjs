// Stealth aircraft: public RCS evidence, the fuller section-28 checks. Aircraft chips, the evidence and
// result filters and the claim buttons drive the matrix and the argument; the frequency chips, trace
// boxes, zoom buttons and sample buttons drive the NASA model plot. The view lives in the URL fragment,
// Reset returns to the default view, the view saves and loads as JSON, and the page exports a Markdown
// record and a narrated beamdswitch deck.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, fullSuite, jsonRoundTrip, markdownExport, resetsToDefaults, saved, using } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const state = async (page) => [
  await page.locator("[aria-pressed=true]").allInnerTexts(),
  await page.locator("[data-argument]").getAttribute("data-argument"),
  await page.evaluate(() => location.hash),
];
/** @param {import("playwright").Page} page @param {string} id */
const chip = (page, id) => page.locator(`[data-aircraft-filter="${id}"]`);
/** @param {import("playwright").Page} page @param {string} id */
const freq = (page, id) => page.locator(`#plot-body [data-figure="${id}"]`).first();

await fullSuite("stealth-rcs", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    const before = await s.page.evaluate(() => location.href);
    await chip(s.page, "F22").click();
    assert.equal(await chip(s.page, "F22").getAttribute("aria-pressed"), "true");
    assert.notEqual(await s.page.evaluate(() => location.href), before, "the aircraft filter is in the URL");
    // A shared link restores the view: aircraft, claim, frequency, zoom and selected sample.
    const link = await ctx.open("#a=F117&c=F117-2&f=fig-5-12&z=181.50,183.00&s=fig-5-12:reconstructed:357");
    try {
      assert.equal(await chip(link.page, "F117").getAttribute("aria-pressed"), "true");
      assert.equal(await freq(link.page, "fig-5-12").getAttribute("aria-pressed"), "true");
      assert.match(await link.page.locator("#readout").innerText(), /182\.25°/);
      // A stale value resets with a notice.
      await link.page.goto(link.page.url().split("#")[0] + "#a=SR71");
      await link.page.reload();
      assert.match(await link.page.locator("#notice").innerText(), /not in this dataset/);
      assert.equal(await chip(link.page, "all").getAttribute("aria-pressed"), "true");
    } finally {
      await link.close();
    }
  }),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    const entries = await s.page.evaluate(() => history.length);
    await chip(s.page, "B2").click();
    assert.ok(await s.page.evaluate(() => history.length) > entries, "a filter change adds a history entry");
    await s.page.goBack();
    await s.page.waitForFunction(() => document.querySelector('[data-aircraft-filter="all"]')?.getAttribute("aria-pressed") === "true");
    await s.page.goForward();
    await s.page.waitForFunction(() => document.querySelector('[data-aircraft-filter="B2"]')?.getAttribute("aria-pressed") === "true");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    await chip(s.page, "F35").focus();
    await s.page.keyboard.press("Enter");
    assert.equal(await chip(s.page, "F35").getAttribute("aria-pressed"), "true", "Enter on a chip filters the matrix");
    await s.page.locator('[data-claim="F35-2"]').focus();
    await s.page.keyboard.press("Space");
    assert.equal(await s.page.locator("[data-argument]").getAttribute("data-argument"), "F35-2", "Space opens the argument");
    assert.match(await s.page.locator("[data-testid=empty-state]").innerText(), /No eligible curve for the F-35/);
    await s.page.locator("#show-model-curves").focus();
    await s.page.keyboard.press("Enter");
    await s.page.locator("#plot").focus();
    await s.page.keyboard.press("ArrowRight");
    assert.match(await s.page.locator("#readout").innerText(), /φ = \d{3}\.\d{2}°/, "an arrow key selects a sample on the focused plot");
    const first = await s.page.locator("#readout").innerText();
    await s.page.keyboard.press("ArrowRight");
    assert.notEqual(await s.page.locator("#readout").innerText(), first, "the next arrow moves to the next sample");
    await s.page.locator("#zoom-in").focus();
    await s.page.keyboard.press("Enter");
    assert.match(await s.page.evaluate(() => location.hash), /z=/, "the zoom button works from the keyboard");
    // "Next sample" reaches every sample of every trace in order, also where 2 dots share one azimuth.
    // WebKit stops URL updates after 100 history changes in one page, so the walk reloads the page every 90 steps.
    const base = s.page.url().split("#")[0];
    for (const figure of ["fig-5-10", "fig-5-11", "fig-5-12"]) for (const role of ["original", "reconstructed"]) {
      /** @type {{ i: number, phi: number }[]} */
      const walk = [];
      for (let start = 0; ; ) {
        await s.page.goto(`${base}#a=F117&f=${figure}&tr=${role}&s=${figure}:${role}:${start}`);
        await s.page.reload();
        await s.page.waitForSelector("#next-sample");
        const part = await s.page.evaluate(() => {
          /** @type {{ i: number, phi: number }[]} */
          const seen = [];
          for (let k = 0; k < 90; k++) {
            const i = Number((new URLSearchParams(location.hash.slice(1)).get("s") ?? "").split(":")[2]);
            if (seen.length && seen[seen.length - 1].i === i) break;
            seen.push({ i, phi: Number(/φ = (\d+\.\d+)°/.exec(/** @type {HTMLElement} */ (document.getElementById("readout")).innerText)?.[1]) });
            /** @type {HTMLButtonElement} */ (document.getElementById("next-sample")).click();
          }
          return seen;
        });
        walk.push(...(start ? part.slice(1) : part));
        if (part.length < 90) break;
        start = part[part.length - 1].i;
      }
      const count = await s.page.evaluate(([f, r]) => {
        const R = /** @type {any} */ (window).RcsReport;
        return R.ordered(R.seriesFor(JSON.parse(/** @type {HTMLElement} */ (document.getElementById("dataset")).textContent ?? ""), f, r)).length;
      }, [figure, role]);
      assert.deepEqual(walk.map((w) => w.i), [...Array(count).keys()], `${figure} ${role}: every sample once, in order`);
      assert.ok(walk.every((w, k) => !k || walk[k - 1].phi <= w.phi), `${figure} ${role}: azimuth never goes back`);
    }
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    const palette = s.page.locator("[role=dialog]:visible, [role=combobox]:visible, dialog[open]");
    assert.ok(await palette.count() > 0, "Cmd/Ctrl+K opens a command palette");
    await s.page.keyboard.type("B2-1");
    await s.page.keyboard.press("Enter");
    assert.equal(await s.page.locator("[data-argument]").getAttribute("data-argument"), "B2-1", "choosing a command runs it");
  }),

  reset: (ctx) => resetsToDefaults(ctx.open, async (page) => { await chip(page, "F22").click(); await page.locator("#evidence-filter").selectOption("official_statement"); }, state),

  "json-round-trip": (ctx) => jsonRoundTrip(ctx.open, async (page) => { await freq(page, "fig-5-10").click(); await page.locator("#next-sample").click(); }, state),

  "markdown-export": (ctx) => markdownExport(ctx.open, (page) => page.locator("#next-sample").click(), "centre of a printed dot", "#save-beamdswitch, #copy-beamdswitch"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
    assertBeamdswitchDeck(file.text);
    assert.match(file.text, /^voice: bf_emma$/m);
    assert.equal(file.name, "stealth-rcs-beamdswitch.md");
    for (const id of ["F117-1", "F117-2", "F22-1", "F22-2", "F35-1", "F35-2", "B2-1", "B2-2"]) assert.ok(file.text.includes(`${id}:`), id);
  }),

  // Rendering modes: the colour scheme, print, no script, and the short source titles of the summary views.
  "dark-mode": async (ctx) => {
    await assertDarkMode(ctx);
    await using(ctx.open, async (s) => {
      const title = await s.page.locator('[data-source="SRC-NASA-CR-191378"] strong').innerText();
      assert.equal(title, "A Very Efficient RCS Data Compression and Reconstruction Technique (NASA-CR-191378-VOL-4)", "the source panel shows the full title");
      const short = s.page.locator('#matrix-body [data-source-link="SRC-NASA-CR-191378"]').first();
      const shortText = await short.innerText();
      assert.ok(shortText.length < title.length && shortText.includes("…") && shortText.endsWith("(NASA-CR-191378-VOL-4)"), shortText);
      assert.match(await s.page.locator('[data-argument] [data-source-link="SRC-NASA-CR-191378"]').innerText(), /…/);
      const hash = await s.page.evaluate(() => location.hash);
      await short.click();
      assert.equal(await s.page.evaluate(() => document.activeElement?.id), "src-SRC-NASA-CR-191378", "a short title leads to the full title");
      assert.equal(await s.page.evaluate(() => location.hash), hash, "the view stays");
      assert.ok(!(await s.page.locator("#static-record").isVisible()), "with script, the screen shows the interactive page");
      await s.page.emulateMedia({ media: "print" });
      assert.ok(await s.page.locator("#static-record").isVisible(), "print shows every argument and source");
      assert.ok(!(await s.page.locator("#sources-section").isVisible()));
      assert.ok((await s.page.locator("#static-record").innerText()).includes(title), "print holds the full title");
      await s.page.emulateMedia({ media: "screen" });
      await s.page.evaluate(() => document.documentElement.classList.remove("js"));
      assert.ok(await s.page.locator("#static-record").isVisible(), "without script, the static record shows");
    });
  },

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await chip(page, "F117").click();
    await page.locator("#next-sample").click();
  }),
});
