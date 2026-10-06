// Universal Data Workbench, step 7, in each browser project (e2e/full.test.mjs registers these in its describe of
// each project): the whole workflow by touch on the phones, from a file chosen to the package downloaded, with every
// control at least 44 px tall and nothing wider than the screen; "Measure this device" with Cancel and its saved
// result; and Cancel while the charts are drawn, which keeps the figures done, says what is incomplete, writes a
// package that says so, and lets the rest be drawn.
//
// DW_MEASURE_FULL=1 runs the whole ladder of "Measure this device" instead (the chromium-mobile project with its
// CPU slowed 4 times), and saves each project's result as E2E_TMP/dw-limits/<project>.json, from which limits.json
// is written; it is a measurement, run by hand, not a check of CI. So is DW_BENCH_FILES (paths of the benchmark
// table as CSV and as Parquet, written by tools/bench_data.mjs): each file is imported through the file input in the
// desktop projects and timed to its first figure, every chart and its statistics, and the times are saved as
// E2E_TMP/dw-limits/bench-<project>-<file>.json.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * @param {{ project: any, browser: () => import("playwright").Browser, targets: any, artifact: any, tmp: string, ready: (page: any, name: string) => Promise<any>,
 *   view: (page: any) => Promise<string>, Zip: any, openSession: any, settle: any }} c
 */
export function step7(c) {
  const { project, targets, artifact, tmp } = c;
  const touch = !!project.context.hasTouch;
  const press = (/** @type {import("playwright").Locator} */ l) => (touch ? l.tap() : l.click());
  const open = async () => {
    const s = await c.openSession(c.browser(), project, targets.origin(artifact));
    await s.page.goto(targets.httpUrl(artifact), { waitUntil: "load" });
    await c.settle(s.page, 'html[data-ready="true"]');
    return s;
  };
  const idle = (/** @type {import("playwright").Page} */ page) => page.waitForFunction(() => /** @type {HTMLElement} */ (document.getElementById("progress")).hidden, null, { timeout: 240_000 });

  /**
   * Every visible control shorter than 44 px, by its text, on a touch screen. A checkbox or radio button is tapped
   * through its label, so its label is measured.
   * @param {import("playwright").Page} page
   */
  const small = (page) => page.evaluate(() => [...document.querySelectorAll("button, select, input:not([type=hidden]):not(.visually-hidden), summary, label.btn, a.btn")]
    .map((el) => (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") && el.closest("label") ? /** @type {Element} */ (el.closest("label")) : el))
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("dialog:not([open])"); })
    .filter((el) => el.getBoundingClientRect().height < 43.5)
    .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute("aria-label") || el.id || "").trim().slice(0, 40)}" ${el.getBoundingClientRect().height.toFixed(0)} px`));
  /** Whether anything is wider than the screen. @param {import("playwright").Page} page */
  const wide = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

  // 30 orders: an NA marker in amount, which waits for approval, three cities, a date and a measure.
  const csv = ["id,city,amount,when,score", ...Array.from({ length: 30 }, (_, i) => `${i + 1},${["Oslo", "Lima", "Pune"][i % 3]},${i === 5 ? "NA" : 100 + ((i * 37) % 51)},2026-01-${String(i + 1).padStart(2, "0")},${(50 + ((i * 13) % 29) / 2).toFixed(1)}`)].join("\n");

  test(`${touch ? "by touch: " : ""}the whole workflow: a file chosen, imported, inspected, a correction approved, a chart at full size and zoomed, its findings, a SQL query, and the package downloaded`, { timeout: 600_000 }, async () => {
    const s = await open();
    try {
      await s.page.locator("#files").setInputFiles({ name: "orders.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
      await s.page.locator("#queue").getByText("Fits the budget").waitFor({ timeout: 120_000 });
      await press(s.page.locator("#import"));
      await c.ready(s.page, "orders");
      assert.match(await c.view(s.page), /30/, "the table is imported");
      // Inspect: a column's details open on a tap, and a correction is approved by a tap.
      const amount = s.page.locator("details.column", { has: s.page.locator("summary", { hasText: /^amount/ }) });
      await press(amount.locator("summary"));
      assert.equal(await amount.evaluate((/** @type {Element} */ el) => /** @type {HTMLDetailsElement} */ (el).open), true, "a tap opens a column's details");
      await press(s.page.locator('[data-suggestion^="amount::"]').first());
      await s.page.locator("#log").getByText(/Approved: .*amount/).waitFor({ timeout: 120_000 });
      await c.ready(s.page, "orders");
      // Charts: a figure opens full size on a tap, and zooms to twice its printed size, which scrolls in its frame.
      await press(s.page.locator("#charts-view .figure-open").first());
      const figure = s.page.locator("#viewer-figure svg");
      await figure.waitFor({ timeout: 60_000 });
      await press(s.page.locator('#viewer-nav [data-zoom="200"]'));
      const zoomed = await s.page.locator("#viewer-figure").evaluate((/** @type {Element} */ el) => ({ scroll: el.scrollWidth, width: el.clientWidth, touch: getComputedStyle(el).touchAction }));
      assert.ok(zoomed.scroll > zoomed.width, `200% is wider than the frame and scrolls in it (${JSON.stringify(zoomed)})`);
      // "pan-x pan-y pinch-zoom" computes as "manipulation" in Chromium.
      assert.match(zoomed.touch, /pinch-zoom|manipulation/, "the frame lets a pinch zoom the figure");
      await press(s.page.locator("#viewer-close"));
      // Findings: the family ran and both lists are shown.
      assert.match(await s.page.locator("#findings-view").innerText(), /Family orders, run \d/);
      // SQL in the plain text area.
      await press(s.page.locator('[data-mode="sql"]'));
      await s.page.locator("#sql-editor").fill("SELECT city, count(*) AS n FROM orders GROUP BY city ORDER BY city");
      await press(s.page.locator("#sql-run"));
      await s.page.locator("[data-result]", { hasText: "3 rows" }).waitFor({ timeout: 120_000 });
      await idle(s.page);
      if (touch) assert.deepEqual(await small(s.page), [], "every control is at least 44 px tall on a touch screen");
      assert.ok(await wide(s.page) <= 0, "nothing is wider than the screen");
      // The package, by a tap, through a blob download.
      const [file] = await Promise.all([s.page.waitForEvent("download", { timeout: 300_000 }), press(s.page.locator("#export-package"))]);
      const path = join(tmp, `${project.name}-workflow.zip`);
      await file.saveAs(path);
      const zip = await c.Zip.open(new Blob([readFileSync(path)]));
      const manifest = JSON.parse(await zip.text("manifest.json"));
      assert.equal(manifest.status, "complete", JSON.stringify(manifest.remaining));
      const figures = zip.paths.filter((/** @type {string} */ p) => p.startsWith("figures/orders/"));
      const valid = Number(/(\d+) valid/.exec(await s.page.locator("[data-accounting]").innerText())?.[1]);
      assert.ok(valid >= 8 && figures.length === 3 * valid, `every valid chart as SVG, PDF and PNG: ${valid} valid, ${figures.join(", ")}`);
      assert.match(await zip.text("report.md"), /Approved: .*amount/, "the report keeps the approval");
      assert.equal(JSON.parse(await zip.text("manifest.json")).preview, null, "the first complete version is no preview");
      assert.deepEqual(s.observed.pageErrors, [], "no uncaught errors");
      assert.deepEqual(s.observed.unexpectedRequests, [], "no requests outside the artifact");
    } finally {
      await s.close();
    }
  });

  test("Measure this device: the ladder with Cancel, its result shown and saved, nothing of it kept as a table", { timeout: process.env.DW_MEASURE_FULL ? 3_600_000 : 600_000 }, async () => {
    const s = await open();
    try {
      if (process.env.DW_MEASURE_FULL && project.name === "chromium-mobile") {
        const cdp = await s.context.newCDPSession(s.page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      }
      if (touch) assert.deepEqual(await small(s.page), [], "every control is at least 44 px tall on a touch screen");
      assert.match(await s.page.locator('[data-limits-row="real-phone"]').innerText(), /Not measured yet/);
      await press(s.page.locator("#measure-device"));
      if (!process.env.DW_MEASURE_FULL) {
        // The first rung, 10,000 rows, completes; Cancel during the second keeps it.
        await s.page.locator("#progress-text", { hasText: "Measuring 100,000 rows" }).waitFor({ timeout: 300_000 });
        await press(s.page.locator("#cancel"));
      }
      const result = s.page.locator("#measure-result");
      await result.waitFor({ timeout: process.env.DW_MEASURE_FULL ? 3_600_000 : 300_000 });
      const text = await result.innerText();
      const [file] = await Promise.all([s.page.waitForEvent("download"), press(s.page.locator("#measure-save"))]);
      const saved = JSON.parse(readFileSync(await file.path(), "utf8"));
      assert.equal(saved.device.kind, touch ? "phone" : "desktop", "the device class as the page sees it");
      assert.equal(saved.budget, touch ? 512 * 2 ** 20 : 2 * 2 ** 30, "the budget of its class");
      assert.equal(saved.rungs[0].status, "done", saved.rungs[0].reason);
      assert.equal(saved.rungs[0].valid, 155);
      if (process.env.DW_MEASURE_FULL) {
        mkdirSync(join(process.env.E2E_TMP ?? tmp, "dw-limits"), { recursive: true });
        writeFileSync(join(process.env.E2E_TMP ?? tmp, "dw-limits", `${project.name}.json`), `${JSON.stringify({ project: project.name, throttle: project.name === "chromium-mobile" ? 4 : 1, ...saved }, null, 2)}\n`);
        console.log(`${project.name}: largest ${saved.largest} rows; ${saved.stopped}`);
      } else {
        assert.match(text, /This device completed 10,000 rows\. Stopped: 100,000 rows: you cancelled\./);
        assert.equal(saved.largest, 10000);
        assert.equal(saved.rungs[1].status, "cancelled");
      }
      assert.equal(await s.page.locator('[role="tab"]').count(), 0, "the measurement imports no table of the person's");
      assert.deepEqual(s.observed.pageErrors, [], "no uncaught errors");
      assert.deepEqual(s.observed.unexpectedRequests, [], "no requests outside the artifact");
    } finally {
      await s.close();
    }
  });

  test("Cancel while the charts are drawn keeps the figures done and says what is incomplete, in the page and the package; the rest can be drawn", { timeout: 600_000 }, async () => {
    const s = await open();
    try {
      await press(s.page.locator('button[value="planted"]'));
      await s.page.locator("#charts-view .figure-open img").first().waitFor({ timeout: 180_000 });
      await s.page.waitForFunction(() => /Charts of planted: \d+ of/.test(document.getElementById("progress-text")?.textContent ?? ""), null, { timeout: 60_000 });
      await press(s.page.locator("#cancel"));
      await idle(s.page);
      const accounting = s.page.locator("[data-accounting]");
      assert.equal(await accounting.getAttribute("data-accounting"), "incomplete");
      const text = await accounting.innerText();
      const m = /155 candidates of grammar v1: (\d+) valid, (\d+) excluded, 0 failed, (\d+) incomplete/.exec(text);
      assert.ok(m, text);
      assert.ok(Number(m[1]) > 0 && Number(m[3]) > 0 && Number(m[1]) + Number(m[2]) + Number(m[3]) === 155, `every candidate has an outcome: ${text}`);
      assert.match(text, /Incomplete: you cancelled/);
      assert.ok(await s.page.locator("#charts-view .figure-open").count() > 0, "the figures done are kept");
      // The package written now says it is incomplete and what remains.
      const [file] = await Promise.all([s.page.waitForEvent("download", { timeout: 300_000 }), press(s.page.locator("#export-package"))]);
      const zip = await c.Zip.open(new Blob([readFileSync(await file.path())]));
      const manifest = JSON.parse(await zip.text("manifest.json"));
      assert.equal(manifest.status, "incomplete");
      assert.ok(manifest.remaining.some((/** @type {string} */ r) => /planted/.test(r) && /chart/i.test(r)), JSON.stringify(manifest.remaining));
      assert.equal(await s.page.locator("[data-export-status]").getAttribute("data-export-status"), "incomplete");
      // The rest is drawn on request, and then every candidate is valid.
      await press(s.page.getByRole("button", { name: "Generate the remaining charts" }));
      await c.ready(s.page, "planted");
      assert.match(await accounting.innerText(), /155 candidates of grammar v1: 155 valid, 0 excluded, 0 failed, 0 incomplete/);
      assert.deepEqual(s.observed.pageErrors, [], "no uncaught errors");
    } finally {
      await s.close();
    }
  });

  const bench = (process.env.DW_BENCH_FILES ?? "").split(",").map((f) => f.trim()).filter(Boolean);
  for (const path of project.name.endsWith("-desktop") ? bench : []) {
    test(`benchmark: ${path.split("/").pop()} imported and timed to its first figure, every chart and its statistics`, { timeout: 3_600_000 }, async () => {
      const s = await open();
      try {
                const started = Date.now();
        await s.page.locator("#files").setInputFiles(path);
        await s.page.locator("#queue").getByText("Fits the budget").waitFor({ timeout: 600_000 });
        const checked = Date.now();
        await s.page.locator("#import").click();
        await s.page.locator("#charts-view .figure-open img").first().waitFor({ timeout: 1_800_000 });
        const first = Date.now();
        await s.page.locator('#charts-view [data-accounting="complete"]').waitFor({ timeout: 3_600_000 });
        const charts = Date.now();
        // The statistics of 1,908 charts take minutes: longer than the other checks' ready() waits.
        await s.page.locator('#findings-view [data-family="complete"]').waitFor({ timeout: 3_600_000 });
        await s.page.waitForFunction(() => /** @type {HTMLElement} */ (document.getElementById("progress")).hidden, null, { timeout: 600_000 });
        const all = Date.now();
        const page = {
          timing: await s.page.locator("#charts-view [data-timing]").innerText(),
          accounting: await s.page.locator("[data-accounting]").innerText(),
          family: await s.page.locator("#findings-view [data-family]").first().getAttribute("data-family"),
          budget: await s.page.locator("#budget-note").innerText(),
        };
        const out = { project: project.name, file: path.split("/").pop(), bytes: readFileSync(path).length, measured: new Date().toISOString(),
          checkMs: checked - started, firstMs: first - checked, chartsMs: charts - checked, allMs: all - checked, page };
        mkdirSync(join(process.env.E2E_TMP ?? tmp, "dw-limits"), { recursive: true });
        writeFileSync(join(process.env.E2E_TMP ?? tmp, "dw-limits", `bench-${project.name}-${out.file}.json`), `${JSON.stringify(out, null, 2)}\n`);
        console.log(JSON.stringify(out));
        assert.equal(page.family, "complete");
        assert.deepEqual(s.observed.pageErrors, [], "no uncaught errors");
      } finally {
        await s.close();
      }
    });
  }
}
