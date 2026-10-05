// Monte Carlo Probability Workbench: the fuller browser checks (§28). The view state lives in the kit (URL
// fragment, Back and Forward, Cmd/Ctrl+K, Reset, view JSON, Markdown record, deck); the run lives beside it.
// Beyond the kit's checks this file drives the run controls (Step, Run, Pause, Reset run, Space and "."), the
// cancel of a large run, which must not report a partial result as complete, and the round trip of the run
// record: save it, load it, replay it, and get identical estimates.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, blur, fullSuite, jsonRoundTrip, markdownExport, resetsToDefaults, saved, settlesTo, using } from "../../../e2e/lib/full.js";
import { kitState } from "../../../e2e/lib/kit.js";

/** @param {import("playwright").Page} page */
const run = (page) => page.evaluate(() => { const r = /** @type {any} */ (window).Workbench.run; return r ? { status: r.status, n: r.accum.n, target: r.target * 1024 } : null; });
/** @param {import("playwright").Page} page @param {string[]} states */
const runSettles = (page, states) => page.waitForFunction((s) => s.includes(/** @type {any} */ (window).Workbench.run?.status), states, { timeout: 60_000 });
/** @param {import("playwright").Page} page @param {RegExp} re */
const statusMatches = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById("run-status")?.textContent ?? ""), re.source, { timeout: 60_000 });
/** Change the view with a control that adds a Back entry: the method. @param {import("playwright").Page} page */
const change = (page) => page.locator("#method").selectOption("inverse");

await fullSuite("monte-carlo-workbench", {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    await s.page.locator('#example-list [data-open="poisson-spare-parts"]').click();
    const changed = await kitState(s.page);
    assert.equal(changed.model, "poisson-spare-parts");
    const hash = await s.page.evaluate(() => location.hash);
    assert.match(hash, /model=poisson-spare-parts/);
    const link = await ctx.open(hash);
    try {
      assert.deepEqual(await kitState(link.page), changed, "the URL restores the view");
      assert.equal(await link.page.locator("#model-title").innerText(), "Spare seals for a remote pump station");
      await link.page.goto(link.page.url().split("#")[0] + "#model=no-such-model");
      await link.page.reload();
      assert.match(await link.page.locator("#notice").innerText(), /not a valid value/, "a stale link resets with a notice");
    } finally {
      await link.close();
    }
  }),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    const initial = await kitState(s.page);
    await s.page.locator('#example-list [data-open="geometric-retries"]').click();
    const changed = await kitState(s.page);
    await s.page.goBack();
    await settlesTo(() => kitState(s.page), initial, "Back restores the earlier view");
    await s.page.goForward();
    await settlesTo(() => kitState(s.page), changed, "Forward restores the later view");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    const initial = await kitState(s.page);
    await s.page.locator("#size").focus();
    await s.page.keyboard.press("ArrowLeft");
    assert.equal((await kitState(s.page)).size, Number(initial.size) - 1, "an arrow key on the focused slider changes the sample size");
    await s.page.locator("#autorun").uncheck();
    await s.page.locator("#run-reset").click();
    assert.equal((await run(s.page))?.n, 0, "Reset run clears the result");
    await blur(s.page);
    await s.page.keyboard.press(".");
    await runSettles(s.page, ["paused", "done"]);
    assert.equal((await run(s.page))?.n, 1024, "the full stop key steps one block");
    await statusMatches(s.page, /Paused: the partial result is not complete: 1,024 of/);
    await blur(s.page);
    await s.page.keyboard.press("Space");
    await runSettles(s.page, ["done"]);
    assert.equal((await run(s.page))?.n, (await run(s.page))?.target, "Space runs to the full sample size");
    await s.page.locator("#reset").focus();
    await s.page.keyboard.press("Enter");
    await settlesTo(() => kitState(s.page), initial, "Enter on the focused Reset button resets the view");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    const initial = await kitState(s.page);
    await change(s.page);
    await s.page.keyboard.press("ControlOrMeta+k");
    assert.ok(await s.page.locator("dialog#palette[open]").isVisible(), "Cmd/Ctrl+K opens the command palette");
    await s.page.keyboard.type("Reset the view");
    await s.page.keyboard.press("Enter");
    await settlesTo(() => kitState(s.page), initial, "choosing Reset in the palette resets the view");
    await s.page.keyboard.press("ControlOrMeta+k");
    await s.page.keyboard.type("Open Was a year with 2 deaths");
    await s.page.keyboard.press("Enter");
    assert.equal((await kitState(s.page)).model, "poisson-horse-kicks", "the palette opens a workflow by its title");
  }),

  reset: (ctx) => resetsToDefaults(ctx.open, async (page) => {
    // A large run, then Pause: the run is cancelled, and the page reports the partial result as not complete.
    await page.locator("#size").fill("22");
    await page.waitForFunction(() => /** @type {any} */ (window).Workbench.run?.status === "running");
    await page.locator("#run-pause").click();
    await runSettles(page, ["paused"]);
    const r = await run(page);
    assert.ok(r && r.n < r.target, "the paused run stopped before its target");
    await statusMatches(page, /Paused: the partial result is not complete/);
    await page.waitForFunction(() => /Partial: the run is not complete/.test(document.querySelector("#results-table caption")?.textContent ?? ""));
  }, kitState),

  "json-round-trip": (ctx) => jsonRoundTrip(ctx.open, async (page) => {
    // The run record: save it, load it, replay it, and compare the estimates with the saved ones.
    await page.locator('#example-list [data-open="exp-geometric"]').click();
    await runSettles(page, ["done"]);
    const file = await saved(page, () => page.locator("#save-run").click());
    const doc = JSON.parse(file.text);
    assert.equal(doc.format, "monte-carlo-workbench/run");
    assert.equal(doc.generator.version, "philox4x32-10/1");
    assert.equal(doc.seed, 2026);
    assert.equal(doc.model.id, "exp-geometric");
    await page.locator("#load-run").setInputFiles({ name: file.name, mimeType: "application/json", buffer: Buffer.from(file.text) });
    await page.waitForFunction(() => /** @type {any} */ (window).Workbench.run?.status === "done" && /identical/.test(document.getElementById("replay-status")?.textContent ?? ""), null, { timeout: 60_000 });
    assert.match(await page.locator("#replay-status").innerText(), /Replay: 2 estimates identical, 0 equal up to the last digits, 0 different/);
    assert.equal((await kitState(page)).model, "custom");
  }, kitState),

  "markdown-export": (ctx) => markdownExport(ctx.open, async (page) => { await change(page); }, "Method: Inverse transform", "#save-beamdswitch, #copy-beamdswitch"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    await change(s.page);
    await runSettles(s.page, ["done"]);
    const file = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
    assert.equal(file.name, "monte-carlo-workbench-beamdswitch.md");
    assertBeamdswitchDeck(file.text);
    assert.ok(file.text.includes("Method: Inverse transform"), "the deck shows the current view");
    assert.match(file.text, /Results after 65536 replicates \(done\)/, "the deck holds the run's results");
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => { await change(page); }),
});
