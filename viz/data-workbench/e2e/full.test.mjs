// Universal Data Workbench: the fuller browser checks, with the real engine. The shared harness stages pages
// without their downloads, so this file stages the page itself with the pinned engine files (runtime_files.py
// stage), as the site publishes it, and points the harness at that folder. Every check then imports and profiles
// real tables in each browser project: the examples, a CSV and a Parquet file chosen through the file input, a
// file too large for the budget, Cancel while reading, an approval by keyboard, the Markdown record and the deck,
// the charts: every candidate of the planted example, the full-size view, an edit with facets, a refused edit
// and a page of timeline events, with the time to the first figure; the findings: the family, both lists with
// their highlights explained, the highlight count, the study details and get_findings; and the publication figures:
// the Nature preset, and the PDF, PNG and SVG downloads read back with the page's own readers; and SQL and table
// algebra: a join by the visual controls with its diagnostics, a refused statement, a query's result analysed as its
// own table with its records cited by its charts, and the package that makes it again in a fresh page.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SLUG = "data-workbench";
const folder = fileURLToPath(new URL("..", import.meta.url));
const only = (process.env.E2E_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const selected = !only.length || only.includes(SLUG);
const tmp = mkdtempSync(join(process.env.E2E_TMP ?? tmpdir(), "dw-e2e-"));
if (selected && !process.env.E2E_ARTIFACT) {
  const out = join(tmp, SLUG);
  execFileSync("python3", [join(folder, "runtime_files.py"), "stage", out], { stdio: "inherit" });
  process.env.E2E_ARTIFACT = out;
  process.env.E2E_SLUG = SLUG;
}
const { assertBeamdswitchDeck, assertDarkMode, assertReducedMotion, blur, fullSuite, markdownExport, saved, using } = await import("../../../e2e/lib/full.js");
const { openSession, selectedProjects, settle } = await import("../../../e2e/lib/browser.js");
const { loadTargets } = await import("../../../e2e/lib/targets.js");
const { serveArtifacts } = await import("../../../e2e/lib/server.js");
const { parseDeck } = await import("../../../scripts/templates/beamdswitch/deck.mjs");

/** @param {import("playwright").Page} page */
const kitState = (page) => page.evaluate(() => /** @type {any} */ (window).VisualKit.app.state);

/**
 * Wait until a table is imported, every column profiled, its charts generated and its statistics run, and the page
 * is idle.
 * @param {import("playwright").Page} page @param {string} name
 */
const ready = (page, name) => page.waitForFunction((n) => {
  const tab = document.getElementById(`tab-${n}`);
  const charts = document.querySelector('#charts-view [data-accounting="complete"], #charts-view [data-accounting="incomplete"]');
  const findings = document.querySelector('#findings-view [data-family="complete"], #findings-view [data-family="incomplete"], #findings-view [data-family="failed"]');
  return !!tab && !/profiling|incomplete/.test(tab.textContent ?? "") && !!charts && !!findings && /** @type {HTMLElement} */ (document.getElementById("progress")).hidden;
}, name, { timeout: 180_000 });

/** The text of the selected table's view. @param {import("playwright").Page} page */
const view = (page) => page.locator("#table-view").innerText();

// 24 orders: amounts with a thousands separator and an NA marker, and one impossible date among valid ones.
const csv = ["id,city,amount,when", ...Array.from({ length: 24 }, (_, i) => `${i + 1},${["Oslo", "Lima", "Pune"][i % 3]},${i === 5 ? "NA" : `"${i + 1},${String(100 + i).slice(1)}0"`},${i === 7 ? "2026-02-30" : `2026-01-${String(i + 1).padStart(2, "0")}`}`)].join("\n");

await fullSuite(SLUG, {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    await ready(s.page, "messy");
    assert.deepEqual(await kitState(s.page), { example: "messy", highlights: 6 }, "the example in the URL opens");
    const text = await view(s.page);
    assert.match(text, /Line 19: too few fields/, "a short row is listed with its line");
    assert.match(text, /Line 20: too many fields/, "a long row is listed with its line");
    assert.match(text, /junk: 1 value does not read as integer/, "a parse failure is a suspected error");
    assert.match(text, /when: 1 date name no real day/, "an impossible date is a suspected error");
    assert.match(text, /Treat "NA" as missing in visits \(2 values\)/, "markers wait for approval");
  }, "#example=messy"),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    await s.page.locator('button[value="planted"]').click();
    await ready(s.page, "planted");
    assert.equal(await s.page.evaluate(() => location.hash), "#example=planted");
    await s.page.goBack();
    await s.page.waitForFunction(() => location.hash === "");
    assert.deepEqual(await kitState(s.page), { example: "none", highlights: 6 }, "Back restores the earlier view");
    await s.page.goForward();
    await s.page.waitForFunction(() => location.hash === "#example=planted");
    assert.deepEqual(await kitState(s.page), { example: "planted", highlights: 6 }, "Forward restores the later view");
    assert.equal(await s.page.locator('[role="tab"]').count(), 1, "the table is imported once");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    await s.page.locator('button[value="messy"]').focus();
    await s.page.keyboard.press("Enter");
    await ready(s.page, "messy");
    const approve = s.page.locator('[data-suggestion="temp::sentinel::-999"]');
    await approve.focus();
    await s.page.keyboard.press("Enter");
    await s.page.locator("#log").getByText("Approved: Treat -999 as missing in temp").waitFor({ timeout: 60_000 });
    await s.page.waitForFunction(() => /** @type {HTMLElement} */ (document.getElementById("progress")).hidden);
    assert.doesNotMatch(await view(s.page), /temp: 2 values are -999/, "the approved stand-in is no longer a suspected error");
    const summary = s.page.locator("details.column summary", { hasText: "temp" }).first();
    await summary.focus();
    await s.page.keyboard.press("Enter");
    assert.equal(await summary.evaluate((el) => /** @type {HTMLDetailsElement} */ (el.parentElement).open), true, "Enter opens a column's details");
    assert.match(await s.page.locator("details.column[open]").first().innerText(), /2 made missing by approval/);
    // An approved reading survives a later change of unit made through the column's form.
    await s.page.locator('[data-suggestion="mixed::layouts::dmy-slash"]').click();
    await s.page.locator("#log").getByText("Approved: Read mixed as dates").waitFor({ timeout: 60_000 });
    await s.page.waitForFunction(() => /** @type {HTMLElement} */ (document.getElementById("progress")).hidden);
    const mixed = s.page.locator("details.column", { has: s.page.locator("summary", { hasText: /^mixed/ }) });
    await mixed.locator("summary").click();
    await mixed.getByLabel("Unit (optional)").fill("day");
    await mixed.getByRole("button", { name: "Apply" }).click();
    await s.page.locator("#log").getByText("You set messy.mixed: unit day").waitFor({ timeout: 60_000 });
    assert.match(await s.page.locator("#log").innerText(), /You set messy\.mixed: unit day\. mixed reads as date \(YYYY-MM-DD and DD\/MM\/YYYY\)/, "the approved layouts stay");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await blur(s.page);
    await s.page.keyboard.press("ControlOrMeta+k");
    assert.ok(await s.page.locator("dialog#palette[open]").isVisible(), "Cmd/Ctrl+K opens the command palette");
    await s.page.keyboard.type("Daily weather");
    await s.page.keyboard.press("Enter");
    await ready(s.page, "weather");
    assert.match(await view(s.page), /366/, "the weather example has a row a day");
    assert.ok(!(await s.page.locator("dialog#palette[open]").count()), "running a command closes the palette");
  }),

  "markdown-export": (ctx) => markdownExport(ctx.open, async (page) => {
    await page.locator("#files").setInputFiles({ name: "orders 2026.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.locator("#queue").getByText("Fits the budget").waitFor({ timeout: 60_000 });
    await page.locator("#import").click();
    await ready(page, "orders_2026");
    const text = await view(page);
    assert.match(text, /amount\s+text\s+integer/, "the thousands separator is read");
    assert.match(text, /when: 1 date name no real day/);
  }, "orders_2026: 24 rows", "#save-beamdswitch"),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    const file = join(tmp, "typed.parquet");
    execFileSync(process.execPath, [join(folder, "tools", "write_parquet.mjs"), file], { stdio: "inherit" });
    await s.page.locator("#files").setInputFiles({ name: "typed.parquet", mimeType: "application/octet-stream", buffer: readFileSync(file) });
    await s.page.locator("#queue").getByText("Fits the budget").waitFor({ timeout: 60_000 });
    await s.page.locator("#import").click();
    await ready(s.page, "typed");
    const text = await view(s.page);
    assert.match(text, /Parquet with its own types/);
    assert.match(text, /nested\s+GROUP\s+not analysed/, "a nested column is excluded, with its Parquet type");
    const deck = await saved(s.page, () => s.page.locator("#save-beamdswitch").click());
    assertBeamdswitchDeck(deck.text);
    const parsed = parseDeck(deck.text);
    assert.deepEqual(parsed.frames.filter((/** @type {any} */ f) => f.kind === "section").map((/** @type {any} */ f) => f.title), ["Set-up", "Method", "Results", "Checks and takeaway"]);
    const titles = parsed.frames.map((/** @type {any} */ f) => f.title);
    assert.ok(titles.includes("typed: 40 rows"), `the deck has the table's results: ${titles.join(" / ")}`);
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await page.locator('button[value="planted"]').click();
    await ready(page, "planted");
  }),
});

const require = createRequire(import.meta.url);
// The page's readers and the vendored bundles load by a computed path: the harness's strict type check reads this
// file, not the page's modules or minified bundles, which the folder's own checks cover.
/** @param {string} path @returns {any} */
const load = (path) => require(fileURLToPath(new URL(`../${path}`, import.meta.url)));
const Pdf = load("src/pdf.js");
const Png = load("src/png.js");
const Fonts = load("src/fonts.js");
const Zip = load("src/zip.js");
const PDFLib = load("vendor/pdf-lib/pdf-lib.min.js");
const fontkit = load("vendor/fontkit/fontkit.umd.min.js");

/** The bytes of the file a click downloads. @param {import("playwright").Page} page @param {import("playwright").Locator} button */
async function download(page, button) {
  const [file] = await Promise.all([page.waitForEvent("download"), button.click()]);
  return { name: file.suggestedFilename(), bytes: new Uint8Array(readFileSync(/** @type {string} */ (await file.path()))) };
}

/**
 * Publication figures: the box plot of price under the general preset meets its checks; the Nature preset draws it
 * 183 mm wide with the title in the legend, and its PDF (MediaBox in millimetres, TrueType text), PNG (450 dpi in
 * pHYs) and SVG (its font inside) are the files the panel checked.
 * @param {import("playwright").Page} page
 */
async function publication(page) {
  await page.locator("#chart-kind").selectOption("box");
  await page.locator('[data-candidate="planted.box.price"]').click();
  const panel = page.locator("#viewer-publish");
  await panel.locator('[data-file="pdf"]').waitFor({ timeout: 60_000 });
  assert.match(await panel.locator("[data-verdict]").innerText(), /Meets every check of the General preset/);
  assert.equal(await panel.locator('[data-file="pdf"]').getAttribute("data-file-status"), "pass");
  await panel.locator('input[name="preset"][value="nature"]').check();
  await panel.locator("[data-verdict]", { hasText: "Nature" }).waitFor({ timeout: 60_000 });
  await panel.locator('[data-file="png"]').waitFor({ timeout: 60_000 });
  assert.match(await panel.locator("[data-verdict]").innerText(), /No compliance claim for the Nature preset/);
  assert.equal(await panel.locator('[data-check="font"]').getAttribute("data-status"), "unverified", "Liberation Sans is an Arial-metric substitute");
  assert.equal(await panel.locator('[data-check="grid"]').getAttribute("data-status"), "pass");
  const title = await page.locator("#viewer-title").innerText();
  assert.equal(await page.locator("#viewer-figure svg text[font-weight=bold]").count(), 0, "the title is in the legend, not the artwork");
  assert.ok((await panel.locator(".legend-text").innerText()).includes(title));
  const pdf = await download(page, panel.locator('[data-download="pdf"]'));
  assert.equal(pdf.name, "planted.box.price-nature.pdf");
  const read = await Pdf.read(PDFLib, pdf.bytes);
  assert.ok(Math.abs(read.mediaBoxMm[0] - 183) < 1e-6, `MediaBox ${read.mediaBoxMm}`);
  assert.ok(read.fonts.length > 0 && read.fonts.every((/** @type {any} */ f) => f.file === "FontFile2"), JSON.stringify(read.fonts));
  assert.ok(read.showText >= await page.locator("#viewer-figure svg text").count(), "every text of the figure is text in the PDF");
  const png = await download(page, panel.locator('[data-download="png"]'));
  const image = Png.read(png.bytes);
  assert.equal(image.width, Math.round((183 / 25.4) * 450));
  assert.ok(image.ppm === Math.round(450 / 0.0254) && image.crcs, "pHYs holds 450 dpi, in pixels a metre");
  assert.equal(await panel.locator('[data-file="png"]').getAttribute("data-file-status"), "fail", "Nature does not accept PNG for main figures");
  const svg = Fonts.readSvg(new TextDecoder().decode((await download(page, panel.locator('[data-download="svg"]'))).bytes), fontkit);
  assert.ok(Math.abs(svg.width - 183) < 1e-6 && svg.fontFaces >= 1 && !svg.unmapped.length && svg.texts >= 3, JSON.stringify(svg));
  // Back to the general preset, which the rest of the page's checks expect.
  await panel.locator('input[name="preset"][value="general"]').check();
  await panel.locator("[data-verdict]", { hasText: "General" }).waitFor({ timeout: 60_000 });
  await page.locator("#viewer-close").click();
}

// The resource policy and Cancel in each browser: a CSV larger than a 256 MiB budget allows is refused before it
// is imported, Cancel while reading keeps nothing, and the import of fewer columns then succeeds.
if (selected) {
  const big = join(tmp, "big.csv");
  const lines = ["id,region,amount,note"];
  for (let i = 0; i < 3_000_000; i++) lines.push(`${i + 1},${["North", "South", "East", "West"][i % 4]},${(i % 9973) * 1.25},note number ${i % 100003}`);
  writeFileSync(big, `${lines.join("\n")}\n`);
  const targets = await loadTargets({ only: [SLUG] });
  after(() => targets.close());
  const artifact = /** @type {any} */ (targets.artifacts.find((a) => a.slug === SLUG));
  for (const project of selectedProjects()) {
    describe(`${project.name} ${SLUG} resources`, () => {
      /** @type {import("playwright").Browser} */
      let browser;
      before(async () => { browser = await project.browserType.launch(project.launch); });
      after(async () => { await browser?.close(); });
      test("a file too large for the budget is refused before import; Cancel keeps nothing; fewer columns import", { timeout: 300_000 }, async () => {
        const s = await openSession(browser, project, targets.origin(artifact));
        try {
          await s.page.goto(targets.httpUrl(artifact), { waitUntil: "load" });
          await settle(s.page, 'html[data-ready="true"]');
          await s.page.locator("#budget").selectOption(String(256 * 2 ** 20));
          await s.page.locator("#files").setInputFiles(big);
          const choices = s.page.locator("fieldset.choices");
          await choices.waitFor({ timeout: 120_000 });
          assert.match(await choices.innerText(), /Too large for this device's budget/);
          assert.equal(await s.page.locator('[role="tab"]').count(), 0, "nothing is imported before a choice");
          assert.equal(await s.page.locator("#import").isDisabled(), true, "Import waits for a choice");
          await s.page.getByLabel(/^\s*Fewer columns/).check();
          for (const name of ["region", "amount", "note"]) {
            const box = s.page.locator(`fieldset.columns-pick input[value="${name}"]`);
            if (await box.isChecked()) await box.uncheck();
          }
          await s.page.locator("#import").click();
          await s.page.locator("#cancel").click();
          await s.page.locator("#queue").getByText("Cancelled while reading: nothing of this file was kept.").waitFor({ timeout: 120_000 });
          assert.equal(await s.page.locator('[role="tab"]').count(), 0, "a cancelled import leaves no table");
          await s.page.locator("#queue button", { hasText: "Remove from list" }).click();
          await s.page.locator("#files").setInputFiles(big);
          await choices.waitFor({ timeout: 120_000 });
          await s.page.getByLabel(/^\s*Fewer columns/).check();
          for (const name of ["region", "amount", "note"]) {
            const box = s.page.locator(`fieldset.columns-pick input[value="${name}"]`);
            if (await box.isChecked()) await box.uncheck();
          }
          const started = Date.now();
          await s.page.locator("#import").click();
          await ready(s.page, "big");
          const seconds = ((Date.now() - started) / 1000).toFixed(1);
          const text = await view(s.page);
          assert.match(text, /1 column kept/, "the table says only some columns were kept");
          assert.match(text, /3,000,000/, "every row of the kept column is imported");
          console.log(`${project.name}: one column of a ${(readFileSync(big).length / 2 ** 20).toFixed(0)} MiB CSV (3,000,000 rows) imported and profiled in ${seconds} s`);
          assert.deepEqual(s.observed.pageErrors, [], "no uncaught errors");
          assert.deepEqual(s.observed.unexpectedRequests, [], "no requests outside the artifact");
        } finally {
          await s.close();
        }
      });

      test("charts: every candidate of the planted example; the full-size view, an edit with facets, a refused edit, a page of events", { timeout: 300_000 }, async () => {
        const s = await openSession(browser, project, targets.origin(artifact));
        try {
          // A WebMCP host of the test's own, so get_findings can be called as an agent would.
          await s.page.addInitScript(() => {
            const tools = /** @type {Record<string, any>} */ ({});
            Object.defineProperty(document, "modelContext", { value: { registerTool: (/** @type {any} */ t) => { tools[t.name] = t; } }, configurable: true });
            /** @type {any} */ (window).__tools = tools;
          });
          await s.page.goto(targets.httpUrl(artifact), { waitUntil: "load" });
          await settle(s.page, 'html[data-ready="true"]');
          const started = Date.now();
          await s.page.locator('button[value="planted"]').click();
          await s.page.locator("#charts-view .figure-open img").first().waitFor({ timeout: 180_000 });
          const first = ((Date.now() - started) / 1000).toFixed(1);
          await ready(s.page, "planted");
          const all = ((Date.now() - started) / 1000).toFixed(1);
          const accounting = await s.page.locator("[data-accounting]").innerText();
          assert.match(accounting, /155 candidates of grammar v1: 155 valid, 0 excluded, 0 failed, 0 incomplete/, "every candidate accounted for");
          console.log(`${project.name}: planted example (2,000 rows): first figure ${first} s after the click, all 155 candidates and the statistics ${all} s`);
          await s.page.locator("details.scope summary").click();
          assert.match(await s.page.locator("details.scope").innerText(), /order_id\s+excluded\s+An identifier, never a measure/, "the scope lists each exclusion with its reason");
          // The full-size view: an edit with facets, recorded in the figure and the log.
          await s.page.locator("#chart-kind").selectOption("box-by-group");
          await s.page.locator('[data-candidate="planted.box-by-group.region.score"]').click();
          const figure = s.page.locator("#viewer-figure svg");
          await figure.waitFor({ timeout: 60_000 });
          assert.match(await figure.locator("title").first().textContent() ?? "", /score by region/);
          await s.page.locator("#edit-facet").selectOption("segment");
          await s.page.locator("#edit-title").fill("Score by region, each segment apart");
          await s.page.locator("#viewer-edit button[type=submit]").click();
          await s.page.locator("#log").getByText("Edited the chart planted.box-by-group.region.score").waitFor({ timeout: 60_000 });
          await s.page.locator("#viewer-figure svg").waitFor();
          const drawn = await s.page.locator("#viewer-figure svg").innerHTML();
          assert.match(drawn, /segment: A/, "one panel a segment");
          assert.match(drawn, /Score by region, each segment apart/);
          assert.match(await s.page.locator("#viewer-kind").innerText(), /edited/);
          // A change the grammar forbids is refused with its reason, and nothing changes.
          await s.page.locator("#viewer-close").click();
          await s.page.locator("#chart-kind").selectOption("scatter");
          await s.page.locator('[data-candidate="planted.scatter.dose.response"]').click();
          await s.page.locator("#viewer-figure svg").waitFor({ timeout: 60_000 });
          await s.page.locator("#edit-yScale").selectOption("log10");
          await s.page.locator("#viewer-edit button[type=submit]").click();
          await s.page.locator("#viewer-error").getByText(/a log scale needs every value above 0, and response has values at or below 0/).waitFor();
          await s.page.locator("#viewer-close").click();
          // A timeline holds 500 events a figure; the next page follows in time order.
          await s.page.locator("#chart-kind").selectOption("point-timeline");
          await s.page.locator('[data-candidate="planted.point-timeline.order_date.comment"]').click();
          await s.page.locator("#viewer-figure svg").waitFor({ timeout: 60_000 });
          await s.page.getByRole("button", { name: "Later events" }).click();
          await s.page.locator("#viewer-pages").getByText("Page 2 of 4").waitFor();
          await s.page.locator("#viewer-figure svg").waitFor({ timeout: 60_000 });
          assert.match(await s.page.locator("#viewer-figure svg").innerHTML(), /Events 501–1,000 of 2,000, page 2 of 4/);
          await s.page.locator("#viewer-close").click();
          await publication(s.page);
          // The findings: the family, both lists with distinct highlights explained, and the count of highlights.
          const findings = s.page.locator("#findings-view");
          assert.match(await findings.locator("[data-family]").innerText(), /Family planted, run 1: 80 hypotheses, 62 tested \(m\), 18 not tested; 2 with an adjusted p-value at or below 0\.05\./);
          const unusual = findings.locator('section[aria-labelledby="list-unusual"] .highlights > li');
          assert.equal(await unusual.count(), 6, "6 distinct highlights by default");
          assert.match(await unusual.first().innerText(), /1\. Rows by region[\s\S]*Observed[\s\S]*the rarest, Atlantis, holds 0\.5% of 2,000 rows[\s\S]*Why highlighted[\s\S]*Unusualness 1 = usefulness 1/i);
          const supported = findings.locator('section[aria-labelledby="list-supported"] .highlights > li');
          assert.equal(await supported.count(), 2, "fewer distinct supported patterns, stated");
          assert.match(await findings.locator('[data-highlights="supported"]').innerText(), /fewer than the 6 you asked for/);
          assert.match(await supported.nth(1).innerText(), /Welch's two-sample t-test \(T2\)[\s\S]*exploratory evidence[\s\S]*Independence assumed, not confirmed/);
          await s.page.locator("#highlight-count").fill("3");
          await s.page.locator("#highlight-count").dispatchEvent("change");
          await s.page.waitForFunction(() => document.querySelectorAll('section[aria-labelledby="list-unusual"] .highlights > li').length === 3);
          assert.match(await s.page.evaluate(() => location.hash), /highlights=3/, "the count is view state in the URL");
          // A highlight's picture opens the chart full size.
          await unusual.first().locator("button.thumb").click();
          await s.page.locator("#viewer-figure svg").waitFor({ timeout: 60_000 });
          assert.match(await s.page.locator("#viewer-title").innerText(), /Rows by region/);
          await s.page.locator("#viewer-close").click();
          // An agent reads the findings; no tool returns a row.
          const tool = await s.page.evaluate(async () => JSON.parse((await /** @type {any} */ (window).__tools.get_findings.execute({ table: "planted", list: "family" })).content[0].text));
          assert.equal(tool.hypotheses.length, 80);
          assert.equal(tool.family.m, 62);
          const one = await s.page.evaluate(async () => JSON.parse((await /** @type {any} */ (window).__tools.get_findings.execute({ table: "planted", id: "planted.scatter.dose.response" })).content[0].text));
          assert.equal(one.hypotheses[0].test, "T1");
          assert.ok(one.hypotheses[0].evidence, "the dose and response: exploratory evidence");
          // The study details decide the tests again: "not independent" turns off every test of independent rows.
          await findings.locator("details.study > summary").click();
          await s.page.locator("#study-independent").selectOption("no");
          await findings.locator("details.study button[type=submit]").click();
          await s.page.locator("#log").getByText("You set the study details of planted: independent observations: no").waitFor({ timeout: 60_000 });
          assert.match(await findings.locator("[data-family]").innerText(), /80 hypotheses, 14 tested \(m\), 66 not tested/);
          assert.match(await findings.locator('section[aria-labelledby="list-supported"]').innerText(), /No chart has a tested hypothesis with an adjusted p-value at or below 0\.05\./);
          assert.deepEqual(s.observed.pageErrors, [], "no uncaught errors");
          assert.deepEqual(s.observed.unexpectedRequests, [], "no requests outside the artifact");
        } finally {
          await s.close();
        }
      });

      test("SQL and table algebra: a join by the controls with its diagnostics, a refused statement, a result analysed as its own table, and a package that makes it again", { timeout: 600_000 }, async () => {
        const s = await openSession(browser, project, targets.origin(artifact));
        const zipPath = join(tmp, `${project.name}-sql-package.zip`);
        const idle = () => s.page.waitForFunction(() => /** @type {HTMLElement} */ (document.getElementById("progress")).hidden, null, { timeout: 240_000 });
        try {
          await s.page.addInitScript(() => {
            const tools = /** @type {Record<string, any>} */ ({});
            Object.defineProperty(document, "modelContext", { value: { registerTool: (/** @type {any} */ t) => { tools[t.name] = t; } }, configurable: true });
            /** @type {any} */ (window).__tools = tools;
          });
          await s.page.goto(targets.httpUrl(artifact), { waitUntil: "load" });
          await settle(s.page, 'html[data-ready="true"]');
          await s.page.locator("#files").setInputFiles(["orders.csv", "customers.csv"].map((f) => join(folder, "tests", "fixtures", "sql", f)));
          await s.page.waitForFunction(() => document.querySelectorAll("#queue .ok-text").length === 2, null, { timeout: 120_000 });
          await s.page.locator("#import").click();
          await s.page.waitForFunction(() => !!document.getElementById("tab-orders") && !!document.getElementById("tab-customers") && !document.querySelector("#queue li"), null, { timeout: 240_000 });
          await idle();
          // The controls: orders LEFT JOIN customers on customer, which customers repeats (c2) and orders lacks once.
          await s.page.locator("#q-source").selectOption("orders");
          await s.page.locator("#q-add").selectOption("join");
          await s.page.locator("#q-1-table").selectOption("customers");
          await s.page.locator("#q-1-l0").selectOption("customer");
          await s.page.locator("#q-1-r0").selectOption("customer");
          await s.page.locator(".step-sql", { hasText: "LEFT JOIN" }).waitFor({ timeout: 60_000 });
          assert.match(await s.page.locator(".step-sql").innerText(), /FROM "orders" AS l LEFT JOIN "customers" AS r ON l\."customer" = r\."customer"/, "the step shows its SQL");
          await s.page.locator("#q-run").click();
          await s.page.locator("[data-result]").waitFor({ timeout: 120_000 });
          assert.match(await s.page.locator("[data-result]").innerText(), /^8 rows, 11 columns\. In the order of __row, then __row_customers\./);
          const record = s.page.locator("[data-run-records] details").first();
          await record.locator("summary").click();
          const diag = record.locator(".join-diag");
          assert.equal(await diag.locator("[data-factor]").getAttribute("data-factor"), "1.5", "6 pairs from 4 matched orders: rows repeated");
          assert.match(await diag.innerText(), /"c9"[\s\S]*"c3"/, "an unmatched key of each side");
          // The editor refuses a statement that changes an import, and runs nothing.
          await s.page.locator('[data-mode="sql"]').click();
          await s.page.locator("#sql-editor").fill("SELECT 1; DELETE FROM orders");
          await s.page.locator("#sql-run").click();
          assert.match(await s.page.locator("[data-refusal]").innerText(), /Statement 2: DELETE changes the rows of a table\. Imported tables are read-only/);
          // A query's result analysed as a table of its own.
          await s.page.locator("#sql-editor").fill("SELECT o.order_id, o.city, c.name, c.tier\nFROM orders AS o JOIN customers AS c ON o.customer = c.customer");
          await s.page.locator("#sql-run").click();
          await s.page.locator("[data-result]", { hasText: "6 rows" }).waitFor({ timeout: 120_000 });
          await s.page.locator("#q-name").fill("joined");
          await s.page.locator("#q-analyse").click();
          await s.page.locator("#tab-joined").waitFor({ timeout: 120_000 });
          await s.page.waitForFunction(() => !!document.querySelector('#charts-view [data-accounting="complete"]') && document.getElementById("tab-joined")?.getAttribute("aria-selected") === "true", null, { timeout: 240_000 });
          await idle();
          const inspect = await view(s.page);
          assert.match(inspect, /Derived table/);
          assert.match(inspect, /Made from\s+the result of the SQL, by the transformation records t1, t2/);
          const call = (/** @type {string} */ name, /** @type {any} */ input) => s.page.evaluate(async ([n, i]) => (await /** @type {any} */ (window).__tools[n].execute(i)).content[0].text, [name, input]);
          const lineage = JSON.parse(await call("get_transforms", { table: "joined" }));
          assert.deepEqual(lineage.records.map((/** @type {any} */ r) => [r.id, r.kind]), [["t1", "query"], ["t2", "analyse"]]);
          assert.equal(lineage.records[0].joins[0].pairs, 6);
          const candidates = JSON.parse(await call("get_candidates", { table: "joined", outcome: "valid" }));
          const spec = JSON.parse(await call("get_candidates", { table: "joined", id: candidates.candidates[0].id })).spec;
          assert.deepEqual(spec.transform[0], { id: "records", op: "records", refs: ["t1", "t2"] }, "a derived table's chart starts from the records that made it");
          assert.match(await s.page.locator("#findings-view").innerText(), /Family joined, run 1/, "its own hypothesis family");
          // The package keeps the records and the SQL; a fresh page makes the derived table again and reproduces it.
          await s.page.locator("#export-sources").check();
          const [file] = await Promise.all([s.page.waitForEvent("download", { timeout: 300_000 }), s.page.locator("#export-package").click()]);
          await file.saveAs(zipPath);
          const zip = await Zip.open(new Blob([readFileSync(zipPath)]));
          const transforms = JSON.parse(await zip.text("transforms.json"));
          assert.deepEqual(transforms.records.map((/** @type {any} */ r) => r.id), ["t1", "t2"]);
          assert.deepEqual(JSON.parse(await zip.text("project.json")).derived.map((/** @type {any} */ d) => [d.name, d.kind, d.analysed]), [["joined", "table", true]]);
          assert.deepEqual(s.observed.pageErrors, [], "no uncaught errors");
          assert.deepEqual(s.observed.unexpectedRequests, [], "no requests outside the artifact");
        } finally {
          await s.close();
        }
        const r = await openSession(browser, project, targets.origin(artifact));
        try {
          await r.page.goto(targets.httpUrl(artifact), { waitUntil: "load" });
          await settle(r.page, 'html[data-ready="true"]');
          await r.page.locator("#reopen-file").setInputFiles(zipPath);
          await r.page.locator("#reopen-go").click();
          await r.page.locator("[data-reproduced]", { hasText: "joined:" }).waitFor({ timeout: 300_000 });
          const text = await r.page.locator("#export-view").innerText();
          assert.match(text, /joined: (\d+) of \1 SVG figures and (\d+) of \2 test results match the saved project\./, text);
          assert.deepEqual(await r.page.locator("[data-reproduced]").evaluateAll((els) => els.map((e) => e.getAttribute("data-reproduced"))), ["yes", "yes", "yes"], text);
          assert.match(await r.page.locator("#log").innerText(), /Made the derived table joined again from its SQL\./);
          assert.deepEqual(r.observed.pageErrors, [], "no uncaught errors");
        } finally {
          await r.close();
        }
      });

      test("the export package: one download (by touch on a phone), its deck's figures shown by beamdswitch, and the project reopened and reproduced", { timeout: 600_000 }, async () => {
        const touch = !!project.context.hasTouch;
        const press = (/** @type {import("playwright").Locator} */ l) => (touch ? l.tap() : l.click());
        const s = await openSession(browser, project, targets.origin(artifact));
        const zipPath = join(tmp, `${project.name}-package.zip`);
        try {
          await s.page.goto(targets.httpUrl(artifact), { waitUntil: "load" });
          await settle(s.page, 'html[data-ready="true"]');
          await press(s.page.locator('button[value="planted"]'));
          await ready(s.page, "planted");
          const plan = await s.page.locator("[data-export-plan]").innerText();
          assert.match(plan, /155 valid figures of 1 table \(158 with every page of each timeline\), as SVG, PDF, PNG/);
          assert.equal(await s.page.locator("[data-export-open]").count(), 0, "nothing left to finish");
          const started = Date.now();
          const [file] = await Promise.all([s.page.waitForEvent("download", { timeout: 300_000 }), press(s.page.locator("#export-package"))]);
          await file.saveAs(zipPath);
          console.log(`${project.name}: export package of the planted example in ${((Date.now() - started) / 1000).toFixed(1)} s`);
          assert.match(file.suggestedFilename(), /^data-workbench-export-\d{4}-\d{2}-\d{2}\.zip$/);
          assert.equal(await s.page.locator("[data-export-status]").getAttribute("data-export-status"), "complete");
          const zip = await Zip.open(new Blob([readFileSync(zipPath)]));
          const figures = zip.paths.filter((/** @type {string} */ p) => p.startsWith("figures/"));
          assert.equal(figures.length, 158 * 3, "every valid figure and timeline page as SVG, PDF and PNG");
          for (const name of ["report.md", "highlights.json", "specs/planted.json", "transforms.json", "stats.json", "validation.json", "deck.md", "project.json", "manifest.json"]) assert.ok(zip.has(name), name);
          const manifest = JSON.parse(await zip.text("manifest.json"));
          assert.equal(manifest.status, "complete");
          assert.equal(manifest.files.length, zip.paths.length - 1);
          assert.ok(Png.read(await zip.bytes(figures.find((/** @type {string} */ p) => p.endsWith(".png")))).dpi > 299, "a PNG holds its resolution");
          const pdf = await Pdf.read(PDFLib, await zip.bytes(figures.find((/** @type {string} */ p) => p.endsWith(".pdf"))));
          assert.ok(pdf.fonts.every((/** @type {any} */ f) => f.file === "FontFile2"), "a PDF embeds its fonts");
          assert.deepEqual(s.observed.pageErrors, [], "no uncaught errors");
          assert.deepEqual(s.observed.unexpectedRequests, [], "no requests outside the artifact");
          // The deck in beamdswitch itself, at the tested commit: its parser reads the frames and its slides show each figure.
          const deck = await zip.text("deck.md");
          const beam = JSON.parse(execFileSync("python3", [join(folder, "runtime_files.py"), "beamdswitch"], { encoding: "utf8" }));
          const site = join(tmp, `${project.name}-beamdswitch`);
          mkdirSync(site, { recursive: true });
          writeFileSync(join(site, "index.html"), readFileSync(beam.renderer));
          writeFileSync(join(site, "deck.md"), deck);
          const server = await serveArtifacts(new Map([["beamdswitch", site]]));
          const b = await openSession(browser, project, `${server.origin}/beamdswitch/`);
          try {
            await b.page.goto(`${server.origin}/beamdswitch/index.html?src=deck.md&view`, { waitUntil: "load" });
            await b.page.waitForFunction(() => /** @type {any} */ (window).beamdswitch?.deck, undefined, { timeout: 60_000 });
            const frames = await b.page.evaluate(() => /** @type {any} */ (window).beamdswitch.deck.frames.map((/** @type {any} */ f) => ({ title: f.title, steps: f.steps })));
            assert.deepEqual(frames.map((/** @type {any} */ f) => f.title), parseDeck(deck).frames.map((/** @type {any} */ f) => f.title), "the app's parser reads the frames the vendored parser reads");
            let shown = 0;
            for (const [i, f] of frames.entries()) {
              await b.page.evaluate(([k, step]) => /** @type {any} */ (window).beamdswitch.go(k, step), [i, f.steps - 1]);
              const images = await b.page.evaluate(async () => Promise.all([...document.querySelectorAll("#stage img")].map(async (img) => {
                await /** @type {HTMLImageElement} */ (img).decode().catch(() => {});
                const r = img.getBoundingClientRect();
                return { natural: /** @type {HTMLImageElement} */ (img).naturalWidth, width: r.width, height: r.height };
              })));
              for (const im of images) assert.ok(im.natural > 0 && im.width > 50 && im.height > 30, `${f.title}: the figure is drawn (${JSON.stringify(im)})`);
              shown += images.length;
            }
            assert.equal(shown, (deck.match(/data:image\/svg\+xml;base64,/g) ?? []).length, "every embedded figure is shown on its slide");
            assert.ok(shown >= 6);
            assert.deepEqual(b.observed.pageErrors, [], "beamdswitch shows the deck without an error");
          } finally {
            await b.close();
            await server.close();
          }
        } finally {
          await s.close();
        }
        // The package reopens in a fresh page: the source (a built-in example) is checked and every figure and test result reproduced.
        const r = await openSession(browser, project, targets.origin(artifact));
        try {
          await r.page.goto(targets.httpUrl(artifact), { waitUntil: "load" });
          await settle(r.page, 'html[data-ready="true"]');
          await r.page.locator("#reopen-file").setInputFiles(zipPath);
          await press(r.page.locator("#reopen-go"));
          await r.page.locator("[data-reproduced]").waitFor({ timeout: 300_000 });
          assert.equal(await r.page.locator("[data-reproduced]").getAttribute("data-reproduced"), "yes", await r.page.locator("[data-reproduced]").innerText());
          assert.match(await r.page.locator("[data-reproduced]").innerText(), /planted: 158 of 158 SVG figures and 62 of 62 test results match the saved project\./);
          assert.match(await r.page.locator("#log").innerText(), /Reopened planted from planted\.csv: its source matches/);
          assert.deepEqual(r.observed.pageErrors, [], "no uncaught errors");
          assert.deepEqual(r.observed.unexpectedRequests, [], "no requests outside the artifact");
        } finally {
          await r.close();
        }
      });
    });
  }
}
