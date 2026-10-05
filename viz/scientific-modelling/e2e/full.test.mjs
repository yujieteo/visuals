// Scientific Modelling: the fuller browser checks (§28). The example, tool, repeating set, row-reduction step, basis
// and detail level live in the URL fragment through the kit; the model record lives in the page and its own JSON.
// Besides the shared checks, these drive the main path a researcher takes: confirm the interpretation, step through
// the row reduction with the keyboard, see the MathJax output in the Fira font, open the Nondimensionalizer, choose
// another scale as a new version of the model, and compare the page's results with the Markdown record and the
// deck, all with no request.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, blur, fullSuite, jsonRoundTrip, markdownExport, resetsToDefaults, saved, settlesTo, using } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const kitState = (page) => page.evaluate(() => /** @type {any} */ (window).VisualKit.app.state);
/** @param {import("playwright").Page} page @param {string} id */
const choose = (page, id) => page.locator("#example").selectOption(id);
/** @param {import("playwright").Page} page */
const nondim = (page) => page.evaluate(() => /** @type {any} */ (window).VisualKit.app.derived.nondim);
/** @param {import("playwright").Page} page */
async function confirm(page) {
  await page.locator("#confirm").click();
  await page.waitForSelector("#finder-main:not([hidden]) .group-card");
}

await fullSuite("scientific-modelling", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    await choose(s.page, "straight-fin");
    assert.match(await s.page.evaluate(() => location.hash), /example=straight-fin/, "the example is in the URL");
    const link = await ctx.open("#example=transient-slab&basis=direct&step=2&detail=full");
    try {
      assert.deepEqual(await kitState(link.page), { example: "transient-slab", tool: "finder", repeating: "", step: 2, basis: "direct", detail: "full" });
      assert.equal(await link.page.locator("#example").inputValue(), "transient-slab");
      assert.equal(await link.page.locator('[data-field="basis"][value="direct"]').getAttribute("aria-pressed"), "true");
      await confirm(link.page);
      assert.match(await link.page.locator("#step-value").innerText(), /^2 of \d+$/, "the URL's step is the stepper's step");
    } finally {
      await link.close();
    }
    const tool = await ctx.open("#example=transient-slab&tool=nondim");
    try {
      assert.equal(await tool.page.locator("#tab-nondim").getAttribute("aria-selected"), "true", "the URL's tool is the open tab");
      assert.match(await tool.page.locator("#nondim-gate").innerText(), /runs on a confirmed interpretation/);
      await tool.page.locator("#confirm").click();
      await tool.page.waitForSelector("#nondim-main:not([hidden]) .model-list li");
      assert.match(await tool.page.locator("#nondim-summary").innerText(), /3 dimensionless variables, 1 independent parameter: Bi/);
    } finally {
      await tool.close();
    }
    const stale = await ctx.open("#example=no-such-model");
    try {
      assert.match(await stale.page.locator("#notice").innerText(), /not a valid value/);
      assert.equal(await stale.page.locator("#example").inputValue(), "heat-transfer-pi", "a stale example falls back to the default");
    } finally {
      await stale.close();
    }
  }),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    await choose(s.page, "fail-dependent");
    await s.page.locator('[data-field="tool"][value="nondim"]').click();
    await s.page.goBack();
    await settlesTo(() => kitState(s.page).then((x) => [x.example, x.tool]), ["fail-dependent", "finder"], "Back restores the tool");
    await s.page.goBack();
    await settlesTo(() => kitState(s.page).then((x) => x.example), "heat-transfer-pi", "Back restores the example");
    await s.page.goForward();
    await settlesTo(() => kitState(s.page).then((x) => x.example), "fail-dependent", "Forward restores the later example");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    await s.page.locator("#confirm").focus();
    await s.page.keyboard.press("Enter");
    await s.page.waitForSelector("#finder-main:not([hidden]) .group-card");
    assert.match(await s.page.locator("#finder-summary").innerText(), /7 variables, rank 4: 3 independent groups/, "Enter on the focused button confirms and runs the Finder");
    await s.page.locator("#sec-matrix > summary").focus();
    await s.page.keyboard.press("Enter");
    await s.page.locator("#step").focus();
    await s.page.keyboard.press("ArrowRight");
    await settlesTo(() => kitState(s.page).then((x) => x.step), 1, "an arrow key on the focused slider moves to step 1");
    assert.match(await s.page.locator("#step-detail").innerText(), /Step 1: .*Clear h in the other rows/s);
    // The MathJax display check: version 4.1.3 in its Fira font, SVG output, with assistive MathML for each formula.
    await s.page.waitForFunction(() => document.querySelectorAll("#finder-main mjx-container").length > 10, null, { timeout: 20_000 });
    const mj = await s.page.evaluate(() => { const M = /** @type {any} */ (window).MathJax; return { version: M.version, font: M.startup.output.font.constructor.NAME, jax: document.querySelector("mjx-container")?.getAttribute("jax"), mml: document.querySelectorAll("mjx-container mjx-assistive-mml").length, n: document.querySelectorAll("mjx-container").length }; });
    assert.deepEqual([mj.version, mj.font, mj.jax], ["4.1.3", "MathJaxFira", "SVG"]);
    assert.equal(mj.mml, mj.n, "every formula carries assistive MathML");
    // The Nondimensionalizer tab by keyboard: Enter on the focused tab opens it on the same confirmed record.
    await s.page.locator("#tab-nondim").focus();
    await s.page.keyboard.press("Enter");
    await settlesTo(() => kitState(s.page).then((x) => x.tool), "nondim", "Enter on the focused tab opens the Nondimensionalizer");
    assert.match(await s.page.locator("#nondim-gate").innerText(), /no equation to nondimensionalize/, "a model of variables only names what the Nondimensionalizer needs");
    await blur(s.page);
    await s.page.locator("#reset").focus();
    await s.page.keyboard.press("Enter");
    await settlesTo(() => kitState(s.page).then((x) => x.step), 0, "Enter on the focused Reset button resets the view");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    assert.ok(await s.page.locator("dialog#palette[open]").isVisible(), "Cmd/Ctrl+K opens the command palette");
    await s.page.keyboard.type("Example: Straight fin");
    await s.page.keyboard.press("Enter");
    await settlesTo(() => kitState(s.page).then((x) => x.example), "straight-fin", "the palette selects an example");
    await s.page.keyboard.press("ControlOrMeta+k");
    await s.page.keyboard.type("Confirm the interpretation");
    await s.page.keyboard.press("Enter");
    await s.page.waitForSelector("#finder-main:not([hidden]) .group-card");
    assert.ok(!(await s.page.locator("dialog#palette[open]").count()), "running a command closes the palette");
  }),

  reset: (ctx) => resetsToDefaults(ctx.open, async (page) => { await choose(page, "fail-zero-scale"); }, kitState),

  "json-round-trip": async (ctx) => {
    await jsonRoundTrip(ctx.open, async (page) => { await choose(page, "transient-slab"); await page.locator('[data-field="tool"][value="regime"]').click(); }, kitState);
    // The model record has its own JSON: an edit, saved and loaded into a fresh page, comes back with its version.
    await using(ctx.open, async (s) => {
      await s.page.locator("#editor > summary").click();
      const title = s.page.locator('input[data-path="title"]');
      await title.fill("My convection model");
      await title.press("Tab");
      await s.page.waitForFunction(() => /Version 2/.test(document.getElementById("record-status")?.textContent ?? ""));
      const file = await saved(s.page, () => s.page.locator("#save-model").click());
      assert.equal(file.name, "scientific-modelling-model-heat-transfer-pi-v2.json");
      const doc = JSON.parse(file.text);
      assert.equal(doc.title, "My convection model");
      assert.deepEqual(doc.items, ["Purpose", "Variables", "Equations", "Geometry", "Conditions", "Assumptions", "Scales", "Analyses", "Evidence", "History"]);
      const fresh = await ctx.open();
      try {
        await fresh.page.locator("#load-model").setInputFiles({ name: file.name, mimeType: "application/json", buffer: Buffer.from(file.text) });
        await fresh.page.waitForFunction(() => /My convection model/.test(document.getElementById("record-status")?.textContent ?? ""));
        assert.match(await fresh.page.locator("#record-status").innerText(), /Version 2, not confirmed/);
        await fresh.page.locator("#load-model").setInputFiles({ name: "wrong.json", mimeType: "application/json", buffer: Buffer.from('{"schema":"other"}') });
        await fresh.page.waitForFunction(() => /was not loaded/.test(document.getElementById("model-status")?.textContent ?? ""));
        assert.match(await fresh.page.locator("#record-status").innerText(), /My convection model/, "a refused file keeps the current record");
      } finally {
        await fresh.close();
      }
    });
    // A chosen scale is a new version of the model: "Use this scale", confirm, and the model JSON keeps the choice.
    await using(() => ctx.open("#example=transient-slab&tool=nondim&detail=full"), async (s) => {
      await s.page.locator("#confirm").click();
      await s.page.waitForSelector("#nondim-main:not([hidden]) button[data-use-scale]");
      await s.page.locator('[data-scale-var="v-x"] button[data-use-scale]').first().click();
      await s.page.waitForFunction(() => /Version 2, not confirmed/.test(document.getElementById("record-status")?.textContent ?? ""));
      assert.match(await s.page.locator("#nondim-gate").innerText(), /Version 2 is not confirmed/, "the results of the old scale show as invalidated");
      await s.page.locator("#nondim-gate button[data-confirm]").click();
      await s.page.waitForFunction(() => /Version 2, confirmed/.test(document.getElementById("record-status")?.textContent ?? ""));
      const nd = await nondim(s.page);
      assert.equal(nd.scales.find((/** @type {any} */ x) => x.name === "x").status, "confirmed", "the chosen scale is the researcher's");
      assert.equal(nd.equations.find((/** @type {any} */ e) => e.id === "c-surface").at.plain, "L*h*k^(-1)", "the surface now sits at X = hL/k");
      const file = await saved(s.page, () => s.page.locator("#save-model").click());
      const doc = JSON.parse(file.text);
      assert.equal(doc.scales[0].for, "v-x");
      assert.ok(doc.nondimensionalization.equations.some((/** @type {any} */ e) => e.id === "c-surface"), "the model JSON holds the dimensionless forms");
    });
  },

  "markdown-export": (ctx) => markdownExport(ctx.open, async (page) => { await choose(page, "straight-fin"); await confirm(page); }, "the complete Pi basis", "#save-beamdswitch, #copy-beamdswitch"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    await choose(s.page, "straight-fin");
    await confirm(s.page);
    const deck = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
    assert.equal(deck.name, "scientific-modelling-beamdswitch.md");
    assertBeamdswitchDeck(deck.text);
    const record = await saved(s.page, () => s.page.locator("#save-markdown").click());
    // The page, the record and the deck agree: the same groups and the same count of each status.
    const page = await s.page.evaluate(() => ({
      chips: [...document.querySelectorAll("#trace .result-list > li > .chip")].map((c) => c.textContent),
      groups: [...document.querySelectorAll("#finder-groups .group-card")].length,
    }));
    for (const text of [record.text, deck.text]) {
      const frame = text.split(/^#{2,3} Results with their statuses and evidence$/m)[1].split(/^#{1,3} /m)[0];
      const lines = [...frame.matchAll(/^- \*\*(.+?)\*\*: /gm)].map((m) => m[1]);
      assert.deepEqual(lines, page.chips, "each result line has the page's status, in the page's order");
      assert.ok(text.includes("\\frac{h\\,P\\,L^{2}}{k\\,A_{c}}") || text.includes("hPL²/(kA_c)"), "the fin parameter group");
    }
    assert.equal(page.groups, 4, "4 groups for the fin");
    // The Nondimensionalizer's hand calculation is in both exports, with the same dimensionless forms as the page.
    const nd = await nondim(s.page);
    for (const text of [record.text, deck.text]) {
      assert.match(text, /Hand calculation 6: 2 scales/);
      for (const e of nd.equations) assert.ok(text.includes(e.dimensionlessTex), `${e.id}: ${e.dimensionlessTex}`);
    }
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => { await choose(page, "transient-slab"); await confirm(page); }),
});
