// Universal Data Workbench: the fuller browser checks, with the real engine. The shared harness stages pages
// without their downloads, so this file stages the page itself with the pinned engine files (runtime_files.py
// stage), as the site publishes it, and points the harness at that folder. Every check then imports and profiles
// real tables in each browser project: the examples, a CSV and a Parquet file chosen through the file input, a
// file too large for the budget, Cancel while reading, an approval by keyboard, the Markdown record and the deck.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
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
const { parseDeck } = await import("../../../scripts/templates/beamdswitch/deck.mjs");

/** @param {import("playwright").Page} page */
const kitState = (page) => page.evaluate(() => /** @type {any} */ (window).VisualKit.app.state);

/** Wait until a table is imported and every column profiled, and the page is idle. @param {import("playwright").Page} page @param {string} name */
const ready = (page, name) => page.waitForFunction((n) => {
  const tab = document.getElementById(`tab-${n}`);
  return !!tab && !/profiling|incomplete/.test(tab.textContent ?? "") && /** @type {HTMLElement} */ (document.getElementById("progress")).hidden;
}, name, { timeout: 120_000 });

/** The text of the selected table's view. @param {import("playwright").Page} page */
const view = (page) => page.locator("#table-view").innerText();

// 24 orders: amounts with a thousands separator and an NA marker, and one impossible date among valid ones.
const csv = ["id,city,amount,when", ...Array.from({ length: 24 }, (_, i) => `${i + 1},${["Oslo", "Lima", "Pune"][i % 3]},${i === 5 ? "NA" : `"${i + 1},${String(100 + i).slice(1)}0"`},${i === 7 ? "2026-02-30" : `2026-01-${String(i + 1).padStart(2, "0")}`}`)].join("\n");

await fullSuite(SLUG, {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    await ready(s.page, "messy");
    assert.deepEqual(await kitState(s.page), { example: "messy" }, "the example in the URL opens");
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
    assert.deepEqual(await kitState(s.page), { example: "none" }, "Back restores the earlier view");
    await s.page.goForward();
    await s.page.waitForFunction(() => location.hash === "#example=planted");
    assert.deepEqual(await kitState(s.page), { example: "planted" }, "Forward restores the later view");
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
    });
  }
}
