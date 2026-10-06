// Monte Carlo Probability Workbench: the fuller browser checks (§28). The view state lives in the kit (URL
// fragment, Back and Forward, Cmd/Ctrl+K, Reset, view JSON, Markdown record, deck); the run lives beside it.
// Beyond the kit's checks this file drives the run controls (Step, Run, Pause, Reset run, Space and "."), the
// cancel of a large run, which must not report a partial result as complete, the round trip of the run record (save
// it, load it, replay it, and get identical estimates), and the variance-reduction methods of group 2: a link to a
// stratified run with its gain, and the common-random-numbers card that switches to separate streams; and group 3:
// the tail plot of a heavy tail, the GEV fit of the rainfall series, and the observed names of a censored model.
import assert from "node:assert/strict";
import { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, blur, fullSuite, jsonRoundTrip, markdownExport, resetsToDefaults, saved, settlesTo, using } from "../../../e2e/lib/full.js";
import { kitState } from "../../../e2e/lib/kit.js";

/** @param {import("playwright").Page} page */
const run = (page) => page.evaluate(() => { const r = /** @type {any} */ (window).Workbench.run; return r ? { status: r.status, n: r.accum.n, target: r.target * 1024 } : null; });
/** @param {import("playwright").Page} page @param {string[]} states */
const runSettles = (page, states) => page.waitForFunction((s) => s.includes(/** @type {any} */ (window).Workbench.run?.status), states, { timeout: 60_000 });
/** @param {import("playwright").Page} page @param {RegExp} re */
const statusMatches = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById("run-status")?.textContent ?? ""), re.source, { timeout: 60_000 });
/** The run of the rare-event lab (group 7). @param {import("playwright").Page} page */
const rareRun = (page) => page.evaluate(() => { const r = /** @type {any} */ (window).MCRareView.run; return r ? { status: r.status, reps: r.acc?.blocks ?? 0, target: r.c.R } : null; });
/** @param {import("playwright").Page} page @param {string[]} states */
const rareSettles = (page, states) => page.waitForFunction((s) => s.includes(/** @type {any} */ (window).MCRareView.run?.status), states, { timeout: 90_000 });
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
      // Group 6: a link with the interview's answers, a rule switched off and a pick restores the interview.
      await link.page.goto(`${link.page.url().split("#")[0]}#nav=interview&iv=${encodeURIComponent("k=ext;ge=max;t=lgt;q=mx;m=95;sd=30")}&iv_off=x3&iv_pick=gev`);
      await link.page.reload();
      await link.page.waitForFunction(() => /ranks the GEV|ranks the generalised extreme value/i.test(document.getElementById("iv-status")?.textContent ?? ""));
      assert.equal(await link.page.locator("#iv-q-ge").inputValue(), "max");
      assert.equal(await link.page.locator("#iv-rule-x3").isChecked(), false, "the rule switched off stays off");
      assert.ok(await link.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "the open interview does not scroll sideways");
    } finally {
      await link.close();
    }
    // Group 2: a variance-reduction link restores its method, comparison and strata, and the run shows the gain.
    const vr = await ctx.open("#model=exp-cuniform&method=stratified&compare=independent&strata=4");
    try {
      await runSettles(vr.page, ["done"]);
      const state = await kitState(vr.page);
      assert.deepEqual([state.method, state.compare, state.strata], ["stratified", "independent", 4]);
      assert.ok(await vr.page.locator("#strata-field").isVisible(), "the strata controls show for stratification");
      const ratio = await vr.page.evaluate(() => /** @type {any} */ (window).Workbench.summary()[0].alts[0].quantities[0].gain.ratio);
      assert.ok(ratio > 20, `16 strata of a smooth integrand: variance ratio ${ratio}`);
      assert.match(await vr.page.locator("#compare-table").innerText(), /ratio/, "the comparison table shows the variance ratio");
    } finally {
      await vr.close();
    }
    // Common random numbers hurt when the alternatives move apart; the card's button switches to separate streams.
    const crn = await ctx.open("#model=normal-festival-stall");
    try {
      await runSettles(crn.page, ["done"]);
      const ratio = () => crn.page.evaluate(() => /** @type {any} */ (window).Workbench.summary()[0].diffs[0].quantities[0].crn);
      assert.ok((await ratio()) < 0.7, "the paired difference of the two stalls loses with common random numbers");
      await crn.page.locator('#crn-card [data-streams="separate"]').click();
      await crn.page.waitForFunction(() => /** @type {any} */ (window).Workbench.run?.status === "done" && /streams=separate/.test(location.hash), null, { timeout: 60_000 });
      const sep = await ratio();
      assert.ok(sep > 0.8 && sep < 1.25, `separate streams give a ratio near 1: ${sep}`);
    } finally {
      await crn.close();
    }
    // Group 3: a link to the tail plot of a heavy-tailed experiment draws its log–log plot with the slope guide; the
    // rainfall workflow shows its GEV fit and probability plot; a censoring workflow names its observed variables.
    const tail = await ctx.open("#model=exp-pareto1&plot=tail");
    try {
      await runSettles(tail.page, ["done"]);
      assert.match(await tail.page.locator("#dist-plot svg").getAttribute("aria-label") ?? "", /Tail plot .* log–log axes.*slope/);
      assert.ok(await tail.page.locator("#dist-plot .tail-dots circle").count() > 10, "the run's tail draws as dots");
      assert.match(await tail.page.locator("#dist-note").innerText(), /regularly varying tail with index α = /);
    } finally {
      await tail.close();
    }
    const rain = await ctx.open("#model=gev-rainfall&panel=diagnostics");
    try {
      await runSettles(rain.page, ["done"]);
      const panel = await rain.page.locator("#panel-diagnostics").innerText();
      assert.match(panel, /128 annual maxima, 1896 to 2025/);
      assert.match(panel, /Deviance test of ξ = 0/);
      assert.ok(await rain.page.locator("#panel-diagnostics svg[aria-label^=\"Probability plot\"]").count() === 1, "the probability plot of the fit");
    } finally {
      await rain.close();
    }
    const cens = await ctx.open("#model=exp-censoring&panel=assumptions");
    try {
      assert.match(await cens.page.locator("#panel-assumptions").innerText(), /the model observes T_obs and the event indicator T_event/);
      assert.match(await cens.page.locator("#law-card").innerText(), /Observation mechanism/i);
    } finally {
      await cens.close();
    }
    // Group 4: a custom input example shows its checks with their statuses, its sampling labels and the alerts; an
    // input that fails a check shows the failed check and no run; a constructed workflow shows its law card.
    const input = await ctx.open("#model=input-mgf");
    try {
      await runSettles(input.page, ["done"]);
      const card = await input.page.locator("#custom-card").innerText();
      assert.match(card, /An MGF need not exist/);
      assert.match(card, /Numerical checks do not prove/);
      assert.match(card, /Existence near 0\s+checked/);
      assert.match(card, /An MGF of a law\s+unverified/);
      assert.match(card, /approximate sampling/);
    } finally {
      await input.close();
    }
    const fails = await ctx.open("#model=input-pdf-fails");
    try {
      assert.match(await fails.page.locator("#custom-card").innerText(), /Normalisation\s+failed/);
      assert.match(await fails.page.locator("#model-errors").innerText(), /∫f = 0\.5, not 1/);
      assert.equal(await fails.page.evaluate(() => /** @type {any} */ (window).Workbench.run), null, "no run of a law that fails a check");
    } finally {
      await fails.close();
    }
    const mix = await ctx.open("#model=mixture-call-centre");
    try {
      await runSettles(mix.page, ["done"]);
      const law = await mix.page.locator("#law-card").innerText();
      assert.match(law, /The Finite mixture law/);
      assert.match(law, /Parameters of the code: Mixture of Poisson laws/);
      assert.ok(await mix.page.locator("#custom-card").isHidden(), "no custom-law card without a law line");
    } finally {
      await mix.close();
    }
    // Group 5: a process shows its sample paths with the run's ensemble bands and first passages, and a passage
    // probability has a continuous-time reference; a copula shows its scatter; the conditions of a process follow its
    // parameters; the multilevel panel runs to its bias test and keeps the bias apart from the Monte Carlo error, and
    // its Cancel stops a run without a complete result.
    const bm = await ctx.open("#model=exp-brownian");
    try {
      await runSettles(bm.page, ["done"]);
      assert.ok(await bm.page.locator("#fig-paths").isVisible(), "the paths figure shows for a process");
      assert.equal(await bm.page.locator("#paths-plot .sample-paths path").count(), 12, "12 sample paths");
      assert.ok(await bm.page.locator("#paths-plot path.band").count() >= 1, "the ensemble bands of the run");
      assert.ok(await bm.page.locator("#paths-plot .passage circle").count() >= 1, "first passages at the level");
      assert.match(await bm.page.locator("#results-table").innerText(), /continuous-time closed form/);
      assert.ok(await bm.page.locator("#fig-scatter").isHidden(), "no scatter without a copula");
    } finally {
      await bm.close();
    }
    const cop = await ctx.open("#model=exp-claytoncopula");
    try {
      await runSettles(cop.page, ["done"]);
      assert.ok(await cop.page.locator("#scatter-plot .scatter circle").count() >= 1000, "the copula scatter");
      assert.match(await cop.page.locator("#scatter-note").innerText(), /Kendall's tau of these points: [\d.]+.*of the copula: 0\.5/s);
      assert.match(await cop.page.locator("#law-card").innerText(), /Clayton copula/);
    } finally {
      await cop.close();
    }
    const ou = await ctx.open("#model=exp-ou&method=euler&panel=assumptions");
    try {
      assert.match(await ou.page.locator("#panel-assumptions").innerText(), /Stability\s+not stable/);
    } finally {
      await ou.close();
    }
    const ml = await ctx.open("#model=gbm-option-mlmc&method=euler&mlmc_eps=0.2");
    try {
      await runSettles(ml.page, ["done"]);
      await ml.page.locator("#mlmc-run").click();
      await ml.page.waitForFunction(() => ["done", "stopped"].includes(/** @type {any} */ (window).MCDepView.result()?.status), null, { timeout: 90_000 });
      const r = await ml.page.evaluate(() => /** @type {any} */ (window).MCDepView.result());
      assert.equal(r.status, "done", r.message);
      assert.ok(r.summary.levels.length >= 3 && r.summary.bias !== null && r.summary.se > 0);
      assert.ok(Math.abs(r.summary.est - r.reference) < 4.5 * r.summary.se + 0.2, `the estimate ${r.summary.est} against the Black–Scholes value ${r.reference}`);
      const text = await ml.page.locator("#mlmc-result").innerText();
      assert.match(text, /Monte Carlo error/);
      assert.match(text, /Discretisation bias/);
      assert.match(text, /the interval above does not include it/);
      await ml.page.locator("#mlmc-eps").fill("0.005");
      await ml.page.locator("#mlmc-eps").press("Enter");
      await ml.page.locator("#mlmc-run").click();
      await ml.page.locator("#mlmc-stop").click();
      assert.equal(await ml.page.evaluate(() => /** @type {any} */ (window).MCDepView.result().status), "cancelled");
      await ml.page.waitForFunction(() => /Cancelled.*not complete/.test(document.getElementById("mlmc-status")?.textContent ?? ""), null, { timeout: 10_000 });
    } finally {
      await ml.close();
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
    // Group 6: the guided interview by keyboard. It starts with "insufficient evidence", proposes a candidate from the
    // answers, follows a rule switched off and a pick, and makes the same model record as the editor.
    await s.page.locator('[data-field="nav"][value="interview"]').focus();
    await s.page.keyboard.press("Enter");
    await s.page.waitForFunction(() => /Insufficient evidence/.test(document.getElementById("iv-status")?.textContent ?? ""));
    await s.page.locator("#iv-q-k").focus();
    await s.page.locator("#iv-q-k").selectOption("cnt");
    await s.page.locator("#iv-q-g").selectOption("het");
    await s.page.locator("#iv-q-v").selectOption("gt");
    await s.page.waitForFunction(() => /ranks the negative binomial law first/.test(document.getElementById("iv-status")?.textContent ?? ""));
    assert.match(String((await kitState(s.page)).iv), /k=cnt;g=het;v=gt/, "the answers are in the state");
    await s.page.locator("#iv-rule-c14").focus();
    await s.page.keyboard.press("Space");
    await s.page.waitForFunction(() => /** @type {any} */ (window).MCInterviewView.result()?.off.includes("c14"));
    await s.page.locator("#iv-pick").selectOption("poisson");
    await s.page.waitForFunction(() => /** @type {any} */ (window).MCInterviewView.result()?.chosen === "poisson");
    await s.page.locator("#iv-pick").selectOption("");
    await s.page.locator("#iv-make").focus();
    await s.page.keyboard.press("Enter");
    await s.page.waitForFunction(() => /model=custom/.test(location.hash) && /nav=editor/.test(location.hash));
    const same = await s.page.evaluate(() => {
      const w = /** @type {any} */ (window), text = /** @type {HTMLTextAreaElement} */ (document.getElementById("editor-text")).value;
      return { text, equal: JSON.stringify(w.MCDsl.parse(text, "custom").record) === JSON.stringify(w.Model.getCustom()) };
    });
    assert.ok(same.equal, "the editor reads the same record from the text that the interview applied");
    assert.match(same.text, /X ~ mixture_poisson\(/, "with the rule c14 off, the finite mixture is the top candidate");
    // Group 7: the rare-event lab by keyboard: open the tab, step one replication with ".", then run with Space.
    await s.page.locator('[data-field="nav"][value="rare"]').focus();
    await s.page.keyboard.press("Enter");
    await s.page.locator("#rare-autorun").uncheck();
    await s.page.locator("#rare-reset").click();
    assert.equal((await rareRun(s.page))?.reps, 0, "Reset run clears the rare-event result");
    await blur(s.page);
    await s.page.keyboard.press(".");
    await rareSettles(s.page, ["paused", "done"]);
    assert.equal((await rareRun(s.page))?.reps, 1, "the full stop key steps one replication");
    await s.page.waitForFunction(() => /Paused: the partial result is not complete: 1 of 16 replications/.test(document.getElementById("rare-status")?.textContent ?? ""));
    await blur(s.page);
    await s.page.keyboard.press("Space");
    await rareSettles(s.page, ["done"]);
    assert.equal((await rareRun(s.page))?.reps, 16, "Space runs every replication");
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
    // Group 7: a large rare-event run, then Pause: the lab reports the partial result as not complete.
    await page.locator('[data-field="nav"][value="rare"]').click();
    await page.locator("#rare-reps").fill("64");
    await page.locator("#rare-reps").blur();
    await page.locator("#rare-size").fill("16");
    await page.locator("#rare-size").blur();
    await page.waitForFunction(() => /** @type {any} */ (window).MCRareView.run?.status === "running" && /** @type {any} */ (window).MCRareView.run.c.N === 65536);
    await page.locator("#rare-pause").click();
    await rareSettles(page, ["paused", "done"]);
    const rr = await rareRun(page);
    assert.ok(rr && rr.reps < rr.target, "the paused rare-event run stopped before its last replication");
    await page.waitForFunction(() => /Partial: the run is not complete/.test(document.querySelector("#rare-results caption")?.textContent ?? ""));
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
    // Group 4: a model record with a custom law line saves and loads with the law, and the page checks it again.
    await page.locator('#example-list [data-open="input-quantile"]').click();
    await runSettles(page, ["done"]);
    const model = await saved(page, () => page.locator("#save-model").click());
    const rec = JSON.parse(model.text);
    assert.equal(rec.laws[0].kind, "quantile");
    await page.locator("#load-model").setInputFiles({ name: model.name, mimeType: "application/json", buffer: Buffer.from(model.text) });
    await page.waitForFunction(() => /model=custom/.test(location.hash) && /Monotonicity\s+checked/.test(document.getElementById("custom-card")?.innerText ?? ""), null, { timeout: 60_000 });
    assert.match(await page.locator("#model-text").textContent() ?? "", /law Wq\(k, lam\) quantile\(u\) = /, "the loaded model holds its law line");
    // Group 7: the rare-event run record: save it, load it, replay it, and get identical estimates.
    await page.locator('[data-field="nav"][value="rare"]').click();
    await page.locator('#rare-list [data-rare-open="ruin-exp-siegmund"]').click();
    await rareSettles(page, ["done"]);
    const rare = await saved(page, () => page.locator("#rare-save-run").click());
    const rdoc = JSON.parse(rare.text);
    assert.equal(rdoc.format, "monte-carlo-workbench/rare-run");
    assert.deepEqual([rdoc.record.problem, rdoc.settings.method, rdoc.settings.compare, rdoc.replications], ["ruin", "tilting", "direct", 16]);
    await page.locator('#rare-list [data-rare-open="sum-exp-splitting"]').click();
    await rareSettles(page, ["done"]);
    await page.locator("#rare-load-run").setInputFiles({ name: rare.name, mimeType: "application/json", buffer: Buffer.from(rare.text) });
    await page.waitForFunction(() => /** @type {any} */ (window).MCRareView.run?.status === "done" && /Replay: \d+ estimates identical, 0 equal up to the last digits, 0 different/.test(document.getElementById("rare-replay")?.textContent ?? ""), null, { timeout: 90_000 });
    assert.equal((await kitState(page)).r_problem, "ruin");
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
