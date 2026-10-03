/* End to end in a real browser. This is the interim stand-in for the dedicated technical-E2E
   repository, which does not exist yet; when it does, this test moves there.
   A fresh headless Chrome profile is taken offline before the file is opened from file://. The page
   then meshes, solves in its Blob Web Worker, compares, refines, cancels, keeps inputs on errors, marks
   results stale, runs its self-check and exports JSON, CSV and the beamdswitch deck, with no network
   request. Downloads go to /tmp/diagonal-tension-v1/downloads (or DT_DOWNLOAD_DIR), never to the
   user's folders. Chrome is driven over the DevTools protocol with Node's built-in WebSocket, so
   nothing is installed. Set CHROME_PATH to choose the browser; without one the test is skipped locally
   and fails in CI. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { checkDeck } from "./beamdswitch-deck-checks.mjs";

const PAGE = fileURLToPath(new URL("../diagonal-tension.html", import.meta.url));
const html = readFileSync(PAGE, "utf8");
/** @type {{ self?: object, DiagonalTension?: Engine }} */
const ctx = vm.createContext({});
ctx.self = ctx;
vm.runInContext(/** @type {RegExpExecArray} */ (/<script id="dt-engine">([\s\S]*?)<\/script>/.exec(html))[1], ctx);
const DT = /** @type {Engine} */ (ctx.DiagonalTension);

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (existsSync(mac)) return mac;
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { return execFileSync("which", [name], { encoding: "utf8" }).trim(); } catch { /* next */ }
  }
  return null;
}
const CHROME = findChrome();
if (!CHROME && process.env.CI) throw new Error("no Chrome found for the end-to-end page test; set CHROME_PATH");
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** @param {string} downloads */
async function openBrowser(downloads) {
  const dir = mkdtempSync(join(tmpdir(), "dt-page-"));
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-extensions", "about:blank"];
  if (process.platform === "linux") args.unshift("--no-sandbox");
  const proc = spawn(/** @type {string} */ (CHROME), args, { stdio: "ignore" });
  const portFile = join(dir, "DevToolsActivePort");
  /** @type {WebSocket} */
  let ws;
  try {
    for (let i = 0; i < 600 && !existsSync(portFile); i++) await sleep(50);
    await sleep(50);
    const [port, path] = readFileSync(portFile, "utf8").split("\n");
    ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  } catch (err) {
    proc.kill("SIGKILL"); // a Chrome left running keeps the test process alive until the job times out
    throw err;
  }
  let id = 0;
  /** @type {Map<number, { resolve(result: any): void, reject(err: Error): void }>} */
  const pending = new Map();
  /** @type {string[]} */
  const exceptions = [];
  /** @type {string[]} */
  const requests = [];
  /** @type {string[]} */
  const done = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = /** @type {{ resolve(result: any): void, reject(err: Error): void }} */ (pending.get(msg.id));
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    else if (msg.method === "Network.requestWillBeSent") requests.push(msg.params.request.url);
    else if (msg.method === "Browser.downloadProgress" && msg.params.state === "completed") done.push(msg.params.guid);
  };
  /** A DevTools protocol command; its result's shape depends on the method, so it is left open.
      @param {string} method @param {object} [params] @param {string} [sessionId] @returns {Promise<any>} */
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Runtime.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await send("Network.enable", {}, sessionId);
  // Offline before the file is opened.
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sessionId);
  await send("Page.navigate", { url: pathToFileURL(PAGE).href }, sessionId);
  /** @param {string} expression @returns {Promise<any>} the value, returned by value */
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  /** @param {string} expression @param {string} what */
  const until = async (expression, what, ms = 20000) => {
    for (let t = 0; t < ms; t += 25) { if (await evaluate(expression)) return; await sleep(25); }
    assert.fail(`timed out waiting for ${what}: ${await evaluate(`document.getElementById("status").textContent`)}`);
  };
  const metrics = (/** @type {number} */ width) => send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
  const close = async () => {
    try { await send("Browser.close"); } catch { /* already gone */ }
    ws.close();
    await new Promise((/** @type {(v?: unknown) => void} */ r) => { if (proc.exitCode !== null) r(); else { proc.once("exit", r); setTimeout(() => { proc.kill("SIGKILL"); r(); }, 3000); } });
    rmSync(dir, { recursive: true, force: true });
  };
  return { evaluate, until, metrics, exceptions, requests, done, close };
}

const $v = (/** @type {string} */ id) => `document.getElementById(${JSON.stringify(id)})`;
const setField = (/** @type {string} */ field, /** @type {unknown} */ value) => `(() => { const el = document.querySelector('#inputs input[data-field="${field}"]'); el.value = ${JSON.stringify(String(value))}; el.dispatchEvent(new Event("input", { bubbles: true })); })()`;
const STATUS = `${$v("status")}.textContent`;
const TABLE = `[...document.querySelectorAll("#cmp-table tbody tr")].map((tr) => [...tr.cells].map((c) => c.textContent))`;
const expectedTable = (/** @type {State} */ s) => /** @type {Comparison} */ (DT.runComparison(s)).rows.map((r) => [`${r.label} (${r.unit})`, DT.fmtSigned(r.a), DT.fmtSigned(r.b), r.delta === 0 ? "0" : `${r.delta > 0 ? "+" : "−"}${DT.fmt(Math.abs(r.delta))}`, DT.fmtPct(r.pct)]);
const plain = (/** @type {unknown} */ x) => JSON.parse(JSON.stringify(x));

test("offline from file://, a fresh browser meshes, solves, compares and exports (interim technical E2E)", { skip: !CHROME && "no Chrome found; set CHROME_PATH" }, async () => {
  const downloads = join(process.env.DT_DOWNLOAD_DIR || "/tmp/diagonal-tension-v1/downloads", `page-test-${process.pid}`);
  rmSync(downloads, { recursive: true, force: true });
  mkdirSync(downloads, { recursive: true });
  const page = await openBrowser(downloads);
  try {
    const { evaluate, until } = page;
    await page.metrics(1280);
    // Loads and runs the demonstration example in the worker.
    await until(`${$v("status")}.className === "ok" && document.querySelectorAll("#cmp-table tbody tr").length > 0`, "the first comparison");
    assert.match(await evaluate(STATUS), /^Solved A in \d+ and B in \d+ conjugate-gradient iterations on 651 nodes/);
    assert.deepEqual(await evaluate(TABLE), plain(expectedTable(DT.defaultState())));
    assert.equal(await evaluate(`typeof Worker`), "function");
    assert.equal(await evaluate(`navigator.onLine`), false, "the browser is offline");

    // The probe follows a tap on the B view.
    await evaluate(`(() => { const c = ${$v("view-B")}, r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); })()`);
    const px = Number(await evaluate(`${$v("probe-x")}.value`));
    assert.ok(Math.abs(px - 300) < 30, `probe x ${px}`);
    const probeRows = await evaluate(`[...document.querySelectorAll("#probe-table tbody tr")].map((tr) => tr.cells[0].textContent)`);
    for (const want of ["Gauss point x, y (mm)", "Element ID", "Thickness (mm)", "σx (MPa)", "τxy (MPa)", "σ1 (MPa)", "von Mises (MPa)"]) assert.ok(probeRows.includes(want), want);

    // The self-check passes in the worker.
    await evaluate(`${$v("selftest")}.click()`);
    await until(`/checks pass/.test(${$v("selftest-badge")}.textContent)`, "the self-check", 60000);
    assert.equal(await evaluate(`${$v("selftest-badge")}.textContent`), "12 of 12 checks pass.");

    // Changing an input marks the results stale and holds back their exports.
    await evaluate(setField("doubler.t", 2));
    assert.equal(await evaluate(`${$v("lab")}.classList.contains("is-stale")`), true);
    assert.equal(await evaluate(`${$v("save-beamdswitch")}.disabled`), true);
    await evaluate(`${$v("export-results")}.click()`);
    assert.match(await evaluate(STATUS), /stale/);

    // An invalid input stops the run and is kept as typed.
    await evaluate(setField("material.nu", "0.6"));
    await evaluate(`${$v("run")}.click()`);
    assert.match(await evaluate(STATUS), /^Fix 1 input first; nothing was solved\./);
    assert.equal(await evaluate(`document.querySelector('#inputs input[data-field="material.nu"]').value`), "0.6");
    assert.equal(await evaluate(`document.querySelector('#inputs input[data-field="material.nu"]').getAttribute("aria-invalid")`), "true");
    await evaluate(setField("material.nu", "0.33"));
    await evaluate(`${$v("run")}.click()`);
    await until(`${$v("status")}.className === "ok"`, "the run with a 2 mm doubler");
    const twoMm = { ...DT.defaultState(), doubler: { x0: 200, y0: 100, Lx: 200, Ly: 200, t: 2 } };
    assert.deepEqual(await evaluate(TABLE), plain(expectedTable(twoMm)));
    assert.equal(await evaluate(`${$v("lab")}.classList.contains("is-stale")`), false);

    // Refine mesh halves the element size and reruns.
    await evaluate(`${$v("refine")}.click()`);
    await until(`/on 2501 nodes/.test(${STATUS})`, "the refined run");
    assert.equal(await evaluate(`document.querySelector('#inputs input[data-field="mesh.h"]').value`), "10");

    // An edit made while the worker solves leaves the answer, for the old inputs, marked stale.
    await evaluate(`(() => { ${$v("run")}.click(); ${setField("doubler.t", 3)}; })()`);
    await until(`${$v("status")}.className === "ok"`, "the run edited mid-solve");
    assert.equal(await evaluate(`${$v("lab")}.classList.contains("is-stale")`), true);
    assert.equal(await evaluate(`${$v("save-beamdswitch")}.disabled`), true);

    // Cancel terminates a long solve; the inputs stay and no partial result is shown.
    const before = await evaluate(TABLE);
    await evaluate(setField("mesh.h", "2.5"));
    await evaluate(`${$v("run")}.click()`);
    await until(`!${$v("cancel")}.disabled`, "the solve to start");
    await evaluate(`${$v("cancel")}.click()`);
    assert.match(await evaluate(STATUS), /^Cancelled\./);
    assert.equal(await evaluate(`${$v("run")}.disabled`), false);
    assert.equal(await evaluate(`document.querySelector('#inputs input[data-field="mesh.h"]').value`), "2.5");
    assert.deepEqual(await evaluate(TABLE), before, "the earlier table is kept, marked stale");
    assert.equal(await evaluate(`${$v("lab")}.classList.contains("is-stale")`), true);

    // Reset restores the example and reruns; then export the model, the results and the deck.
    await evaluate(`${$v("reset")}.click()`);
    await until(`/on 651 nodes/.test(${STATUS})`, "the reset run");
    assert.deepEqual(await evaluate(TABLE), plain(expectedTable(DT.defaultState())));
    for (const id of ["export-model", "export-results", "save-beamdswitch"]) await evaluate(`${$v(id)}.click()`);
    for (let i = 0; i < 200 && page.done.length < 3; i++) await sleep(25);
    assert.deepEqual(readdirSync(downloads).sort(), ["diagonal-tension-beamdswitch.md", "diagonal-tension-model.json", "diagonal-tension-results.csv"]);
    const model = JSON.parse(readFileSync(join(downloads, "diagonal-tension-model.json"), "utf8"));
    assert.equal(model.units.stress, "MPa");
    assert.equal(model.mesh.nodes, 651);
    assert.ok(model.diagnostics.B.iterations > 0);
    const r = DT.runComparison(DT.defaultState());
    assert.equal(readFileSync(join(downloads, "diagonal-tension-results.csv"), "utf8"), DT.resultsCSV(/** @type {Comparison} */ (r)));
    const deck = readFileSync(join(downloads, "diagonal-tension-beamdswitch.md"), "utf8");
    assert.equal(checkDeck(deck, "the saved deck").meta.voice, "bf_emma");

    // Layers, theme and a 320 px viewport redraw without errors or horizontal overflow.
    for (const f of ["txy", "vm", "none", "s1"]) await evaluate(`document.querySelector('button[data-field="${f}"]').click()`);
    for (const id of ["lay-dirs", "lay-disp"]) await evaluate(`${$v(id)}.click()`);
    assert.match(await evaluate(`${$v("view-note")}.textContent`), /Displaced shape: displacements × [\d,]+\./);
    await evaluate(`document.documentElement.dataset.theme = "dark"`);
    await page.metrics(320);
    await sleep(100);
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= 320`), "no horizontal overflow at 320 px");

    assert.deepEqual(page.exceptions, [], "no uncaught exceptions");
    const external = page.requests.filter((u) => !/^(file|blob|data):/.test(u));
    assert.deepEqual(external, [], "no network requests");
  } finally {
    await page.close();
    rmSync(downloads, { recursive: true, force: true });
  }
});
