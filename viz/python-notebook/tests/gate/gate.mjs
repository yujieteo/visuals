// The product gate: the section 14 feasibility gate in a smaller form, run against the built page and the pinned
// runtime. It runs Python itself, so it is not part of check.py or the e2e baseline; run it after any change to
// the pins, the runtime patches, src/runtime.js, src/worker-boot.js or src/kernel.py, and before a release.
//
//   node tests/gate/gate.mjs [--browsers chromium,firefox] [--bytes N | --full] [--headed] [--chrome-channel chrome]
//
// Per browser, in fresh browser contexts:
//   site      open the website form, import the gate notebook, add the CSV, run the 11-package cell, run the
//             CSV workflow and compare it with the independent reference (tests/fixtures/ref_csv.py), download
//             totals.csv, Stop an infinite loop, Restart, edit a cell, Save HTML copy with the CSV included
//   copy 1    open the copy from file:// with the network off: Python starts from the embedded runtime, the
//             CSV workflow gives the same result and the CSV has the same SHA-256; Save HTML copy again
//   copy 2    open the copy of the copy the same way and check the CSV again
// Every request is recorded: the site may only ask 127.0.0.1, a copy only file:, blob: and data: URLs.
//
// The default CSV is 5,000,000 bytes, so a run takes about a minute per browser. --full uses the 100,000,000-byte
// fixture of the specification. Fixtures, staged files and results go to build/python-notebook-gate/ (ignored by
// Git). The result of each browser is build/python-notebook-gate/<browser>.json; the exit code is 1 if any check
// fails. Playwright drives a patched Firefox build, not a release Firefox: this harness cannot run the release
// check of the pins, which must be done by hand.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const HERE = dirname(fileURLToPath(import.meta.url));
const FOLDER = resolve(HERE, "../..");
const ROOT = resolve(FOLDER, "../..");
const OUT = join(ROOT, "build", "python-notebook-gate");
const { chromium, firefox } = createRequire(join(ROOT, "e2e", "package.json"))("playwright");

const { values: opts } = parseArgs({
  options: {
    browsers: { type: "string", default: "chromium,firefox" },
    bytes: { type: "string", default: "5000000" },
    full: { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
    "chrome-channel": { type: "string" },
  },
});
const BYTES = opts.full ? 100_000_000 : Number(opts.bytes);
const LIMIT = { start: 180_000, cell: opts.full ? 240_000 : 90_000, save: 300_000 };

function log(...parts) { console.log(...parts); }

/** The CSV fixture and its expected results: the generator's sums, checked against the independent reader. */
function fixture() {
  mkdirSync(OUT, { recursive: true });
  const csv = join(OUT, `sales-${BYTES}.csv`);
  const meta = join(OUT, `sales-${BYTES}.json`);
  if (!existsSync(csv) || !existsSync(meta) || statSync(csv).size !== BYTES) {
    const started = Date.now();
    writeFileSync(meta, execFileSync("python3", [join(FOLDER, "tests/fixtures/gen_csv.py"), csv, "--bytes", String(BYTES)], { maxBuffer: 1 << 24 }));
    log(`fixture ${csv}: ${BYTES} bytes in ${Date.now() - started} ms`);
  }
  const made = JSON.parse(readFileSync(meta, "utf8"));
  const ref = JSON.parse(execFileSync("python3", [join(FOLDER, "tests/fixtures/ref_csv.py"), csv], { maxBuffer: 1 << 24 }).toString());
  for (const key of Object.keys(ref)) assert.deepEqual(made[key], ref[key], `the generator and the reference disagree on ${key}`);
  const totalsCsv = execFileSync("python3", ["-c", "import json,sys;sys.path.insert(0,sys.argv[1]);import gen_csv;sys.stdout.write(gen_csv.totals_csv(json.load(open(sys.argv[2]))))",
    join(FOLDER, "tests/fixtures"), meta]).toString();
  return { csv, name: `sales-${BYTES}.csv`, expected: made, totalsCsv };
}

/** The gate notebook. Its cells are plain Python a user could write; GATE lines carry the results. */
function notebook(name) {
  const code = (id, source) => ({ cell_type: "code", id, metadata: {}, execution_count: null, outputs: [], source });
  return {
    nbformat: 4, nbformat_minor: 5, metadata: {},
    cells: [
      code("gate-packages", `import io, json
import numpy as np, pandas as pd, matplotlib.pyplot as plt, seaborn as sns, sympy as sp, openpyxl
import pyarrow as pa, pyarrow.parquet as pq, statsmodels.api as sm
from scipy import integrate, optimize
from sklearn.linear_model import LinearRegression
from PIL import Image, ImageOps
r = {"numpy": int(np.arange(1, 101).sum())}
frame = pd.DataFrame({"g": ["a", "b", "a", None], "v": [1.5, np.nan, 2.5, 4.0]})
r["pandas"] = [float(frame["v"].sum()), int(frame["v"].isna().sum()), int(frame["g"].isna().sum())]
x = sp.symbols("x")
r["sympy"] = str(sp.integrate(sp.sin(x) ** 2, (x, 0, sp.pi)))
r["scipy"] = [round(integrate.quad(np.exp, 0, 1)[0], 9), round(optimize.brentq(lambda t: t * t - 2, 0, 2), 9)]
rng = np.random.default_rng(0)
X = rng.normal(size=(50, 1)); y = 3 * X[:, 0] + 2
model = LinearRegression().fit(X, y)
r["sklearn"] = [round(float(model.coef_[0]), 6), round(float(model.intercept_), 6), round(float(model.predict([[1.0]])[0]), 6)]
r["statsmodels"] = [round(float(v), 6) for v in sm.OLS(y, sm.add_constant(X)).fit().params]
book = openpyxl.Workbook(); book.active["A1"] = 21; buf = io.BytesIO(); book.save(buf)
r["openpyxl"] = openpyxl.load_workbook(io.BytesIO(buf.getvalue())).active["A1"].value
buf = io.BytesIO(); pq.write_table(pa.table({"k": [1, 2, 3]}), buf)
r["pyarrow"] = pq.read_table(io.BytesIO(buf.getvalue())).column("k").to_pylist()
image = ImageOps.mirror(Image.new("RGB", (4, 2), (255, 0, 0)).rotate(90, expand=True)); image.save("red.png")
r["pillow"] = [list(Image.open("red.png").size), list(Image.open("red.png").getpixel((0, 0)))]
fig, ax = plt.subplots(figsize=(3, 2)); ax.plot([0, 1, 2], [0, 1, 4]); plt.show()
sns.histplot(pd.DataFrame({"v": rng.normal(size=200)}), x="v"); plt.show()
display(frame, image.resize((40, 80)))
print("GATE packages " + json.dumps(r))
sp.Integral(sp.sin(x) ** 2, (x, 0, sp.pi))`),
      code("gate-csv", `import hashlib, json, time
import pandas as pd, seaborn as sns, matplotlib.pyplot as plt
PATH = ${JSON.stringify(name)}
t0 = time.perf_counter()
df = pd.read_csv(PATH, dtype={"category": "string"})
t1 = time.perf_counter()
empty = {c: int(df[c].isna().sum()) for c in ("category", "value", "quantity")}
cents = (df["value"] * 100).round().astype("Int64")
kept = df[(df["date"] >= "2024-01-01") & (df["quantity"] >= 10) & df["category"].notna() & df["value"].notna()]
totals = (kept["value"] * 100).round().astype("int64").groupby(kept["category"]).agg(["sum", "count"]).sort_index()
with open("totals.csv", "w") as f:
    f.write("category,total,count\\n")
    for cat, row in totals.iterrows():
        f.write(f"{cat},{int(row['sum']) // 100}.{int(row['sum']) % 100:02d},{int(row['count'])}\\n")
t2 = time.perf_counter()
sns.barplot(x=totals.index, y=totals["sum"] / 100); plt.xticks(rotation=45); plt.show()
with open(PATH, "rb") as f:
    sha = hashlib.file_digest(f, "sha256").hexdigest()
print("GATE csv " + json.dumps({"rows": len(df), "empty": empty, "value_cents": int(cents.sum()), "kept": len(kept),
      "totals": {c: [int(r["sum"]), int(r["count"])] for c, r in totals.iterrows()}, "sha256": sha,
      "read_s": round(t1 - t0, 3), "work_s": round(t2 - t1, 3)}))`),
      code("gate-set", "x = 41"),
      code("gate-use", "print(x + 1)"),
      code("gate-loop", "while True:\n    pass"),
    ],
  };
}

const PACKAGES = {
  numpy: 5050, pandas: [8, 1, 1], sympy: "pi/2", scipy: [1.718281828, 1.414213562], sklearn: [3, 2, 5],
  statsmodels: [2, 3], openpyxl: 21, pyarrow: [1, 2, 3], pillow: [[2, 4], [255, 0, 0]],
};

async function freePort() {
  return new Promise((done, fail) => {
    const server = createServer().listen(0, "127.0.0.1", () => { const { port } = /** @type {any} */ (server.address()); server.close(() => done(port)); });
    server.on("error", fail);
  });
}

/** One browser context that records every request its pages make. @param {import("playwright").Browser} browser @param {RegExp} allowed */
async function context(browser, allowed, options = {}) {
  const ctx = await browser.newContext({ acceptDownloads: true, ...options });
  const outside = [];
  const errors = [];
  ctx.on("request", (r) => { if (!allowed.test(r.url())) outside.push(r.url()); });
  ctx.on("page", (page) => page.on("pageerror", (e) => errors.push(e.message)));
  const page = await ctx.newPage();
  return { ctx, page, outside, errors };
}

/** Run one cell by its Run button; resolve with its final state, its output text and its time. @param {import("playwright").Page} page @param {string} id */
async function run(page, id, limit = LIMIT.cell) {
  await page.evaluate((id) => {
    const node = document.querySelector(`.cell[data-id="${id}"]`);
    const seen = (/** @type {any} */ (window).__gateStates = []);
    new MutationObserver(() => seen.push(node.dataset.state)).observe(node, { attributes: true, attributeFilter: ["data-state"] });
  }, id);
  const started = Date.now();
  await page.click(`.cell[data-id="${id}"] [data-run]`);
  await page.waitForFunction(() => {
    const seen = /** @type {any} */ (window).__gateStates;
    return seen.includes("running") && ["done", "error"].includes(seen[seen.length - 1]);
  }, null, { timeout: limit, polling: 50 });
  const ms = Date.now() - started;
  const state = await page.getAttribute(`.cell[data-id="${id}"]`, "data-state");
  const text = await page.innerText(`.cell[data-id="${id}"] .outputs`);
  const images = await page.locator(`.cell[data-id="${id}"] .outputs img`).count();
  return { state, text, ms, images };
}

/** @param {string} text @param {string} name */
function gateLine(text, name) {
  const match = text.match(new RegExp(`GATE ${name} (\\{.*\\})`));
  assert.ok(match, `no GATE ${name} line in:\n${text.slice(0, 2000)}`);
  return JSON.parse(match[1]);
}

/** @param {any} got @param {any} expected @param {string} where */
function checkCsv(got, expected, where) {
  for (const key of ["rows", "empty", "value_cents", "kept", "totals", "sha256"]) assert.deepEqual(got[key], expected[key], `${where}: ${key}`);
}

/** Save HTML copy with every data file included; return its path, size and time. @param {import("playwright").Page} page @param {string} path */
async function saveCopy(page, path) {
  const started = Date.now();
  await page.click("#save-html");
  const save = page.locator("dialog[open] button.primary", { hasText: "Save" });
  await page.waitForSelector("dialog[open] button.primary:not([disabled])", { timeout: LIMIT.save });
  for (const box of await page.locator("dialog[open] input[type=checkbox]").all()) await box.check();
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: LIMIT.save }), save.click()]);
  await download.saveAs(path);
  return { path, bytes: statSync(path).size, ms: Date.now() - started };
}

/** Open a portable copy from file:// with the network off and check the CSV workflow. */
async function openCopy(browser, path, data, where) {
  const c = await context(browser, /^(file|blob|data):/, { offline: true });
  const started = Date.now();
  await c.page.goto(pathToFileURL(path).href);
  await c.page.waitForSelector("html[data-python=ready]", { timeout: LIMIT.start });
  const ready = Date.now() - started;
  const csv = await run(c.page, "gate-csv");
  assert.equal(csv.state, "done", `${where}: the CSV cell: ${csv.text.slice(0, 1000)}`);
  checkCsv(gateLine(csv.text, "csv"), { ...data.expected }, where);
  return { c, ready, csv };
}

async function gate(name) {
  const data = fixture();
  data.expected.sha256 = createHash("sha256").update(readFileSync(data.csv)).digest("hex");
  const site = join(OUT, "site");
  execFileSync("python3", [join(FOLDER, "runtime_files.py"), "stage", join(site, "visuals", "python-notebook")], { stdio: "inherit" });
  const port = await freePort();
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "-d", site], { stdio: "ignore" });
  const type = name === "firefox" ? firefox : chromium;
  const browser = await type.launch({ headless: !opts.headed, ...(name === "chromium" && opts["chrome-channel"] ? { channel: opts["chrome-channel"] } : {}) });
  const result = { browser: name, version: browser.version(), headed: opts.headed, bytes: BYTES, sha256: data.expected.sha256, ms: {}, sizes: {}, checks: [] };
  const pass = (check) => { result.checks.push(check); log(`  ok  ${check}`); };
  const contexts = [];
  try {
    await new Promise((r) => setTimeout(r, 500));
    const s = await context(browser, new RegExp(`^(blob:|data:|http://127\\.0\\.0\\.1:${port}/)`));
    contexts.push(s);
    let started = Date.now();
    await s.page.goto(`http://127.0.0.1:${port}/visuals/python-notebook/`);
    await s.page.waitForSelector("html[data-ready=true]");
    result.ms.site_open = Date.now() - started;
    await s.page.locator("#open-ipynb").setInputFiles({ name: "Gate.ipynb", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(notebook(data.name))) });
    await s.page.waitForFunction(() => document.querySelector("#nb-name")?.textContent === "Gate");
    started = Date.now();
    await s.page.locator("#file-input").setInputFiles(data.csv);
    await s.page.locator("#file-list").getByText(data.name).waitFor({ timeout: LIMIT.cell });
    result.ms.add_csv = Date.now() - started;

    const packages = await run(s.page, "gate-packages", LIMIT.start + LIMIT.cell);
    assert.equal(packages.state, "done", packages.text.slice(0, 2000));
    const got = gateLine(packages.text, "packages");
    for (const [key, value] of Object.entries(PACKAGES)) assert.deepEqual(got[key], value, `package ${key}`);
    assert.ok(packages.images >= 3, `the packages cell shows its 2 plots and the image (${packages.images} images)`);
    assert.ok(await s.page.locator('.cell[data-id="gate-packages"] .outputs table').count(), "the DataFrame shows as a table");
    assert.ok(await s.page.locator('.cell[data-id="gate-packages"] .outputs .katex').count(), "the SymPy result shows as mathematics");
    result.ms.start_and_packages = packages.ms;
    pass("site: Python starts and all 11 packages give their known results, with plots, image, table and mathematics");

    await s.page.evaluate(() => {
      const w = /** @type {any} */ (window);
      w.__gateGap = 0; let last = performance.now();
      w.__gateTimer = setInterval(() => { const now = performance.now(); w.__gateGap = Math.max(w.__gateGap, now - last); last = now; }, 50);
    });
    const csv = await run(s.page, "gate-csv");
    assert.equal(csv.state, "done", csv.text.slice(0, 2000));
    const out = gateLine(csv.text, "csv");
    checkCsv(out, data.expected, "site");
    result.ms.csv_cell = csv.ms;
    result.ms.csv_read_csv = Math.round(out.read_s * 1000);
    result.ms.csv_filter_totals = Math.round(out.work_s * 1000);
    result.ms.page_timer_gap = Math.round(await s.page.evaluate(() => /** @type {any} */ (window).__gateGap));
    assert.ok(csv.images >= 1, "the seaborn plot shows");
    const [totals] = await Promise.all([s.page.waitForEvent("download"), s.page.click('#py-files [aria-label="Download totals.csv"]')]);
    const totalsPath = join(OUT, `${name}-totals.csv`);
    await totals.saveAs(totalsPath);
    assert.equal(readFileSync(totalsPath, "utf8"), data.totalsCsv, "the downloaded totals.csv equals the reference");
    pass(`site: pandas reads all ${out.rows} rows; totals, empty values and SHA-256 equal the reference; totals.csv equals it byte for byte`);

    const before = await s.page.inputValue('.cell[data-id="gate-loop"] textarea');
    await s.page.click('.cell[data-id="gate-loop"] [data-run]');
    await s.page.waitForSelector('.cell[data-id="gate-loop"][data-state="running"]', { timeout: LIMIT.cell });
    await s.page.evaluate(() => { /** @type {any} */ (window).__gateGap = 0; });
    await s.page.waitForTimeout(1500);
    result.ms.page_timer_gap_in_loop = Math.round(await s.page.evaluate(() => /** @type {any} */ (window).__gateGap));
    assert.ok(result.ms.page_timer_gap_in_loop < 1000, `the page stays responsive while Python loops (${result.ms.page_timer_gap_in_loop} ms gap)`);
    started = Date.now();
    await s.page.click("#stop");
    await s.page.waitForSelector('.cell[data-id="gate-loop"]:not([data-state="running"])', { timeout: 10_000 });
    result.ms.stop = Date.now() - started;
    await s.page.waitForSelector("html[data-python=ready]", { timeout: LIMIT.start });
    result.ms.stop_to_ready = Date.now() - started;
    assert.equal(await s.page.inputValue('.cell[data-id="gate-loop"] textarea'), before, "the notebook text is kept");
    pass("site: Stop ends an infinite loop, the page stays responsive and Python starts again");

    assert.match((await run(s.page, "gate-set")).state, /done/);
    assert.match((await run(s.page, "gate-use")).text, /^42$/m);
    started = Date.now();
    await s.page.click("#restart");
    await s.page.waitForSelector("html[data-python=ready]", { timeout: LIMIT.start });
    await s.page.waitForFunction(() => document.querySelector("#py-status")?.textContent?.includes("ready"));
    result.ms.restart_to_ready = Date.now() - started;
    const gone = await run(s.page, "gate-use");
    assert.equal(gone.state, "error");
    assert.match(gone.text, /NameError/);
    await s.page.fill('.cell[data-id="gate-use"] textarea', `import os\nprint("size", os.path.getsize(${JSON.stringify(data.name)}))`);
    assert.match((await run(s.page, "gate-use")).text, new RegExp(`^size ${BYTES}$`, "m"));
    pass("site: Restart clears variables and keeps the saved file; an edited cell runs new code");

    const copy1 = await saveCopy(s.page, join(OUT, `${name}-copy-1.html`));
    result.ms.save_copy_1 = copy1.ms;
    result.sizes.copy_1 = copy1.bytes;
    assert.ok(copy1.bytes > BYTES, "the copy holds the CSV");
    assert.deepEqual(s.outside, [], "the site asked only 127.0.0.1");
    assert.deepEqual(s.errors, [], "no page errors on the site");
    pass(`site: Save HTML copy with the CSV, ${copy1.bytes} bytes; no request left 127.0.0.1`);

    const one = await openCopy(browser, copy1.path, data, "copy 1");
    contexts.push(one.c);
    result.ms.copy_1_ready = one.ready;
    result.ms.copy_1_csv_cell = one.csv.ms;
    const copy2 = await saveCopy(one.c.page, join(OUT, `${name}-copy-2.html`));
    result.ms.save_copy_2 = copy2.ms;
    result.sizes.copy_2 = copy2.bytes;
    assert.deepEqual(one.c.outside, [], "copy 1 made no network request");
    assert.deepEqual(one.c.errors, [], "no page errors in copy 1");
    pass(`copy 1: from file:// with the network off, Python is ready in ${one.ready} ms; CSV results equal; no request; saved again`);

    const two = await openCopy(browser, copy2.path, data, "copy 2");
    contexts.push(two.c);
    result.ms.copy_2_ready = two.ready;
    assert.deepEqual(two.c.outside, [], "copy 2 made no network request");
    assert.deepEqual(two.c.errors, [], "no page errors in copy 2");
    pass(`copy 2: a copy saved from a copy opens offline, and the CSV keeps its SHA-256`);
    result.pass = true;
  } catch (error) {
    result.pass = false;
    result.failure = String(error.stack || error);
    log(`  FAIL ${String(error.message || error).split("\n").slice(0, 6).join("\n       ")}`);
  } finally {
    for (const c of contexts) await c.ctx.close().catch(() => {});
    await browser.close();
    server.kill();
  }
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(result, null, 1) + "\n");
  return result;
}

let failed = false;
for (const name of opts.browsers.split(",")) {
  log(`${name}: ${BYTES} byte CSV${opts.headed ? ", headed" : ""}`);
  const result = await gate(name);
  log(`  ${result.browser} ${result.version}: ${result.pass ? "PASS" : "FAIL"}  ms ${JSON.stringify(result.ms)}  bytes ${JSON.stringify(result.sizes)}`);
  failed ||= !result.pass;
}
process.exit(failed ? 1 : 0);
