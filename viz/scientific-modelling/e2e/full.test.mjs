// Scientific Modelling: the fuller browser checks (§28). The example, tool, repeating set, row-reduction step, basis
// and detail level live in the URL fragment through the kit; the model record lives in the page and its own JSON.
// Besides the shared checks, these drive the main path a researcher takes: confirm the interpretation, step through
// the row reduction with the keyboard, see the MathJax output in the Fira font, open the Nondimensionalizer, choose
// another scale as a new version of the model, draw and inspect the regime map of a declared model, browse the
// model catalogue, read the stability and bifurcation analysis of a declared model and of a custom ODE system, and
// compare the page's results with the Markdown record and the deck, all with no request.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, blur, fullSuite, jsonRoundTrip, markdownExport, resetsToDefaults, saved, settlesTo, using } from "../../../e2e/lib/full.js";

/** @param {import("playwright").Page} page */
const kitState = (page) => page.evaluate(() => /** @type {any} */ (window).VisualKit.app.state);
/** @param {import("playwright").Page} page @param {string} id */
const choose = (page, id) => page.locator("#example").selectOption(id);
/** @param {import("playwright").Page} page */
const nondim = (page) => page.evaluate(() => /** @type {any} */ (window).VisualKit.app.derived.nondim);
/** @param {import("playwright").Page} page */
const regime = (page) => page.evaluate(() => /** @type {any} */ (window).VisualKit.app.derived.regime);
/** @param {import("playwright").Page} page */
const stability = (page) => page.evaluate(() => /** @type {any} */ (window).VisualKit.app.derived.stability);
/** The view fields of the regime map and the catalogue, at their defaults. */
const MAP_DEFAULTS = { map_x: "", map_y: "", x_scale: "auto", y_scale: "auto", fixed: "", tolerance: "1e-2", layers: "approximation,balance,stability,bifurcation,empirical,limits", shade: "", point: "", pick: "", family: "" };
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
      assert.deepEqual(await kitState(link.page), { example: "transient-slab", tool: "finder", repeating: "", step: 2, basis: "direct", detail: "full", ...MAP_DEFAULTS });
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
    // The regime map's view is in the URL: a 1D diagram at the tolerance 0.001 opens as one.
    const map = await ctx.open("#example=volumetric-source&tool=regime&map_y=none&tolerance=1e-3");
    try {
      await map.page.locator("#regime-gate button[data-confirm]").click();
      await map.page.waitForSelector("#regime-main:not([hidden]) .map-svg .strips");
      assert.equal(await map.page.locator("#map-y").inputValue(), "none");
      assert.equal(await map.page.locator('select[data-field="tolerance"]').inputValue(), "1e-3");
      const rg = await regime(map.page);
      assert.deepEqual(rg.exactBoundaries, { uniform: "2/999", "surface-temperature": "1998", source: "2" }, "the exact boundaries at the URL's tolerance");
    } finally {
      await map.close();
    }
    const cat = await ctx.open("#tool=catalogue&family=fin");
    try {
      assert.equal(await cat.page.locator('#catalogue button[data-catalogue="fin"]').getAttribute("aria-pressed"), "true", "the URL's declaration is the one shown");
      assert.equal(await cat.page.locator("#catalogue .declaration h4").count(), 6, "the six parts of section 10");
    } finally {
      await cat.close();
    }
    // A custom ODE system from the URL: the regime tab says why it has no map and draws the stability analysis.
    const ode = await ctx.open("#example=custom-lorenz&tool=regime");
    try {
      await ode.page.locator("#regime-gate button[data-confirm]").click();
      await ode.page.waitForSelector("#stability-panel #st-ode-branches svg");
      assert.match(await ode.page.locator("#regime-gate").innerText(), /custom ODE system/);
      const panel = await ode.page.locator("#stability-panel").innerText();
      assert.match(panel, /Branch point: supercritical pitchfork/);
      assert.match(panel, /Hopf point: subcritical/);
      const st = await stability(ode.page);
      assert.ok(Math.abs(st.analysis.branches.flatMap((/** @type {any} */ b) => b.special).find((/** @type {any} */ x) => x.kind === "hopf").mu - 470 / 19) < 1e-8, "the Hopf point at r = 470/19");
      await ode.page.waitForFunction(() => document.querySelectorAll("#stability-panel mjx-container").length > 0, null, { timeout: 20_000 });
    } finally {
      await ode.close();
    }
    // Piece 5, the Euler column from the URL (anchor test 4): the critical eigenvalue, the modes and the explicit
    // separation from post-buckling claims; then the elastica's branch diagram with its pitchfork and coverage.
    const col = await ctx.open("#example=euler-column&tool=regime");
    try {
      await col.page.locator("#confirm").click();
      await col.page.waitForSelector("#stability-panel #st-euler-modes svg");
      const panel = await col.page.locator("#stability-panel").innerText();
      assert.match(panel, /λ = PL²\/\(EI\) = 9\/4/);
      assert.match(panel, /λ_cr = π²/);
      assert.match(panel, /It gives no deflection after buckling/);
      const st = await stability(col.page);
      assert.equal(st.analysis.model, "euler-column");
      assert.ok(st.analysis.figures[0].series[0].pts.every((/** @type {number[]} */ [x, y]) => Math.abs(y - Math.sin(Math.PI * x)) < 1e-6), "mode 1 is sin(πX)");
    } finally {
      await col.close();
    }
    const ela = await ctx.open("#example=elastica&tool=regime");
    try {
      await ela.page.locator("#confirm").click();
      await ela.page.waitForSelector("#stability-panel #st-elastica-branches svg");
      const panel = await ela.page.locator("#stability-panel").innerText();
      assert.match(panel, /supercritical pitchfork/);
      assert.match(panel, /does not claim that it found all branches/);
      await ela.page.waitForSelector("#regime-map svg");
    } finally {
      await ela.close();
    }
    // Piece 6, the nozzle from the URL (anchor test 3): the sonic throat, the choked mass flow and the shock range
    // as an unresolved region; then the pipe flow with its exact Nusselt number.
    const noz = await ctx.open("#example=nozzle-flow&tool=regime");
    try {
      await noz.page.locator("#confirm").click();
      await noz.page.waitForSelector("#stability-panel #st-fl-nozzle-air-flux svg");
      const panel = await noz.page.locator("#stability-panel").innerText();
      assert.match(panel, /area–Mach relation and the sonic throat/);
      assert.match(panel, /choked value ṁ = 2\.33356 kg\/s/);
      const trace = await noz.page.locator("#trace").innerText();
      assert.match(trace, /dF\/dM is exactly 1 − M²/, "the sonic condition is an exact result");
      assert.match(trace, /points of the map are unresolved: Shock range/);
      await noz.page.waitForSelector("#regime-map svg");
    } finally {
      await noz.close();
    }
    const pipe = await ctx.open("#example=pipe-flow&tool=regime");
    try {
      await pipe.page.locator("#confirm").click();
      await pipe.page.waitForSelector("#stability-panel #st-fl-pipe-poiseuille-profile svg");
      assert.match(await pipe.page.locator("#trace").innerText(), /Nu = 48\/11 = 4\.36364 exactly/);
    } finally {
      await pipe.close();
    }
    // Piece 7, the plate: a file without provenance is refused; the sample results with their provenance are compared
    // with the named correlation inside its range only, and the map draws the empirical boundaries.
    const plate = await ctx.open("#example=plate-convection&tool=regime");
    try {
      await plate.page.locator("#load-results").setInputFiles({ name: "bare.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ schema: "scientific-modelling/numerical-results", schemaVersion: 1, example: "plate-convection", points: [{ Pr: 1, NuRe: 0.332 }] })) });
      await settlesTo(() => plate.page.locator("#model-status").innerText().then((t) => /bare\.json was not loaded.*no provenance/s.test(t)), true, "a file without provenance is refused");
      await plate.page.locator("#sample-results").click();
      await settlesTo(() => plate.page.locator("#model-status").innerText().then((t) => /Imported 8 numerical results/.test(t)), true, "the sample file is imported as a new version");
      await plate.page.locator("#confirm").click();
      await plate.page.waitForSelector("#stability-panel #st-cv-plate-correlation-pl-pr svg");
      const trace = await plate.page.locator("#trace").innerText();
      assert.match(trace, /7 of 8 points are inside the range of the correlation/);
      assert.match(trace, /Nu_x = 82\.924/, "the laminar correlation at the record's station");
      await plate.page.waitForSelector("#regime-map svg");
      assert.match(await plate.page.locator("#regime-legend").innerText(), /Empirical boundary \(cited data\): State of the layer/);
    } finally {
      await plate.close();
    }
    const tc = await ctx.open("#example=thermocapillary-flow&tool=regime");
    try {
      await tc.page.locator("#confirm").click();
      await tc.page.waitForSelector("#stability-panel #st-cv-thermocapillary-layer-tc-profiles svg");
      const trace = await tc.page.locator("#trace").innerText();
      assert.match(trace, /The surface moves toward −x, the colder side, where the surface tension is higher/);
      assert.match(trace, /1 \+ Ma_d²\/1680 = 1\.19525/);
    } finally {
      await tc.close();
    }
    // Piece 8, from the URL: the balanced counterflow exchanger with its exact limit; the pool-boiling failure example,
    // where the page refuses the correlation outside its domain; the absorbing slab with the Rosseland boundary on its map.
    const hx = await ctx.open("#example=hx-counterflow&tool=regime");
    try {
      await hx.page.locator("#confirm").click();
      await hx.page.waitForSelector("#stability-panel #st-tr-hx-counterflow-hx-eps svg");
      const trace = await hx.page.locator("#trace").innerText();
      assert.match(trace, /ε = NTU\/\(1 \+ NTU\) = 3\/5 exactly/);
      assert.match(trace, /ε = 3\/5 \+ 9\/50\(1 − C_r\)/, "the exact series about C_r = 1");
    } finally {
      await hx.close();
    }
    const boil = await ctx.open("#example=fail-boiling-domain&tool=regime");
    try {
      await boil.page.locator("#confirm").click();
      await boil.page.waitForSelector("#stability-panel #st-tr-rohsenow-water-bo-curve svg");
      const trace = await boil.page.locator("#trace").innerText();
      assert.match(trace, /refuses Rohsenow's correlation here: the surface, the pressure, the regime/);
      assert.match(trace, /"aluminium" has no value of C_sf/);
    } finally {
      await boil.close();
    }
    const slab = await ctx.open("#example=absorbing-slab&tool=regime");
    try {
      await slab.page.locator("#confirm").click();
      await slab.page.waitForSelector("#stability-panel #st-tr-absorbing-slab-sl-emissivity svg");
      await slab.page.waitForSelector("#regime-map svg");
      assert.match(await slab.page.locator("#trace").innerText(), /outside the assumption τ ≫ 1/);
      assert.match(await slab.page.locator("#regime-legend").innerText(), /Rosseland diffusion/);
    } finally {
      await slab.close();
    }
    // Piece 9, from the URL: the typical section with both methods, the flutter boundary on the map, the release state
    // (no preview label), and the page's result statuses in the same order in the Markdown record and the deck.
    const fl = await ctx.open("#example=flutter&tool=regime");
    try {
      assert.equal(await fl.page.locator(".preview, #roadmap").count(), 0, "the release has no preview label");
      await fl.page.locator("#confirm").click();
      await fl.page.waitForSelector("#stability-panel #st-fsi-damping svg");
      await fl.page.waitForSelector("#stability-panel #st-fsi-response svg");
      const trace = await fl.page.locator("#trace").innerText();
      assert.match(trace, /Method 1, Theodorsen \(k method\): flutter at V_F = 1\.87376/);
      assert.match(trace, /Method 2, R\. T\. Jones state space: flutter at V = 1\.86142/);
      assert.match(trace, /V_D² = μr²\/\(1 \+ 2a\) = 16\/3 exactly/);
      assert.match(trace, /The page gives no oscillation amplitude above the onset/);
      await fl.page.waitForSelector("#regime-map svg");
      assert.match(await fl.page.locator("#regime-legend").innerText(), /Flutter and divergence/);
      const chips = await fl.page.evaluate(() => [...document.querySelectorAll("#trace .result-list > li > .chip")].map((c) => c.textContent));
      const deck = await saved(fl.page, () => fl.page.locator("#save-beamdswitch").click());
      assertBeamdswitchDeck(deck.text);
      const record = await saved(fl.page, () => fl.page.locator("#save-markdown").click());
      for (const text of [record.text, deck.text]) {
        assert.ok(text.includes("Hand calculation 9: flutter onset by two methods"), "the flutter panel in the export");
        const frame = text.split(/^#{2,3} Results with their statuses and evidence$/m)[1].split(/^#{1,3} /m)[0];
        assert.deepEqual([...frame.matchAll(/^- \*\*(.+?)\*\*: /gm)].map((m) => m[1]), chips, "the flutter results agree with the page");
      }
    } finally {
      await fl.close();
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
    // The Regime Map Builder by keyboard: a record without a declared model offers the standard examples; Enter loads
    // one, Enter confirms it, and the arrow keys on the focused map move the inspected point.
    await s.page.locator("#tab-regime").focus();
    await s.page.keyboard.press("Enter");
    await s.page.locator('#regime-gate button[data-load-example="transient-slab"]').focus();
    await s.page.keyboard.press("Enter");
    await settlesTo(() => kitState(s.page).then((x) => [x.example, x.tool]), ["transient-slab", "regime"], "Enter loads the transient slab in the Regime Map Builder");
    await s.page.locator("#regime-gate button[data-confirm]").focus();
    await s.page.keyboard.press("Enter");
    await s.page.waitForSelector("#regime-main:not([hidden]) .map-svg .curve");
    await s.page.locator(".map-svg").focus();
    await s.page.keyboard.press("ArrowRight");
    await settlesTo(() => kitState(s.page).then((x) => x.point !== ""), true, "an arrow key on the focused map moves the inspected point");
    assert.match(await s.page.locator("#regime-inspect").innerText(), /Inspected point/);
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
    // The model JSON keeps the regime map of a declared model with its boundaries.
    await using(() => ctx.open("#example=transient-sphere&tool=regime"), async (s) => {
      await s.page.locator("#regime-gate button[data-confirm]").click();
      await s.page.waitForSelector("#regime-main:not([hidden]) .map-svg .curve");
      const doc = JSON.parse((await saved(s.page, () => s.page.locator("#save-model").click())).text);
      assert.equal(doc.regimeMap.declaration, "sphere-convection");
      assert.ok(doc.regimeMap.layers.find((/** @type {any} */ l) => l.id === "one-mode").curves.length >= 1);
      assert.ok(doc.regimeMap.unresolved.points > 0, "the unresolved corner of the sphere map is in the file");
    });
    // The model JSON keeps the stability and bifurcation analysis.
    await using(() => ctx.open("#example=custom-ignition&tool=regime"), async (s) => {
      await s.page.locator("#regime-gate button[data-confirm]").click();
      await s.page.waitForSelector("#stability-panel #st-ode-two svg");
      const doc = JSON.parse((await saved(s.page, () => s.page.locator("#save-model").click())).text);
      assert.equal(doc.stability.kind, "custom");
      assert.equal(doc.stability.analysis.hysteresis.length, 1, "the hysteresis interval is in the file");
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
    // The regime analyses of the transient slab: hand calculation 8 and anchor test 1 in both exports, and the
    // result lines in the page's order and statuses.
    await using(() => ctx.open("#example=transient-slab&tool=regime"), async (r) => {
      await r.page.locator("#regime-gate button[data-confirm]").click();
      await r.page.waitForSelector("#regime-main:not([hidden]) .map-svg .curve");
      const chips = await r.page.evaluate(() => [...document.querySelectorAll("#trace .result-list > li > .chip")].map((c) => c.textContent));
      const deck2 = await saved(r.page, () => r.page.locator("#save-beamdswitch").click());
      assertBeamdswitchDeck(deck2.text);
      const record2 = await saved(r.page, () => r.page.locator("#save-markdown").click());
      for (const text of [record2.text, deck2.text]) {
        for (const title of ["Hand calculation 8: dominant balance", "Hand calculation 8: asymptotic analysis", "Regime map of Transient conduction in a slab", "Acceptance checks of the declared model and anchor test 1"]) assert.ok(text.includes(title), title);
        const frame = text.split(/^#{2,3} Results with their statuses and evidence$/m)[1].split(/^#{1,3} /m)[0];
        assert.deepEqual([...frame.matchAll(/^- \*\*(.+?)\*\*: /gm)].map((m) => m[1]), chips, "the regime results agree with the page");
      }
    });
    // The Rayleigh–Bénard anchor: hand calculation 9 in both exports, with the page's statuses and the published values.
    await using(() => ctx.open("#example=rayleigh-benard&tool=regime"), async (r) => {
      await r.page.locator("#regime-gate button[data-confirm]").click();
      await r.page.waitForSelector("#stability-panel #st-branch svg", { timeout: 60_000 });
      const chips = await r.page.evaluate(() => [...document.querySelectorAll("#trace .result-list > li > .chip")].map((c) => c.textContent));
      const st = await stability(r.page);
      assert.ok(st.analysis.branch.compare.every((/** @type {any} */ c) => c.rel < 1e-4), "Nu within 1e-4 of Table 1S");
      const deck3 = await saved(r.page, () => r.page.locator("#save-beamdswitch").click());
      assertBeamdswitchDeck(deck3.text);
      const record3 = await saved(r.page, () => r.page.locator("#save-markdown").click());
      for (const text of [record3.text, deck3.text]) {
        for (const title of ["Hand calculation 9: base state and perturbation equations", "Hand calculation 9: eigenvalue problem and onset", "Hand calculation 9: steady roll branch, amplitude equation and classification"]) assert.ok(text.includes(title), title);
        for (const c of st.analysis.branch.compare) assert.ok(text.includes(c.ref.toFixed(6)), `Table 1S: ${c.ref}`);
        const frame = text.split(/^#{2,3} Results with their statuses and evidence$/m)[1].split(/^#{1,3} /m)[0];
        assert.deepEqual([...frame.matchAll(/^- \*\*(.+?)\*\*: /gm)].map((m) => m[1]), chips, "the stability results agree with the page");
      }
    });
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => { await choose(page, "transient-slab"); await confirm(page); }),
});
