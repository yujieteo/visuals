/* End to end: the page in headless Chrome, from file://. These browser checks stand in for the technical
   E2E repository until it exists. The page loads with a passing self-test and makes no network request;
   the tabs, the URL fragment, Back, a deep link and the keyboard move between examples; the controls redraw
   the engine's numbers; the JSON export imports back; and nothing overflows a 320 px viewport. Chrome is
   driven over the DevTools protocol with Node's built-in WebSocket, so nothing is installed. Set
   CHROME_PATH to choose the browser; without one the test is skipped locally and fails in CI. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const PAGE = fileURLToPath(new URL("../index.html", import.meta.url));
const URL_ = pathToFileURL(PAGE).href;
const html = readFileSync(PAGE, "utf8");
const ctx = vm.createContext({});
ctx.self = ctx;
vm.runInContext(new RegExp('<script id="motives-periods-engine">([\\s\\S]*?)</script>').exec(html)[1], ctx);
const M = ctx.MotivesPeriods;

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Launch Chrome, open the page in a fresh tab, and return evaluate() plus the page's exceptions and requests. */
async function openPage(url = URL_) {
  const dir = mkdtempSync(join(tmpdir(), "motives-periods-page-"));
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "--no-first-run",
    "--no-default-browser-check", "--disable-gpu", "--disable-extensions", "about:blank"];
  if (process.platform === "linux") args.unshift("--no-sandbox");
  const proc = spawn(CHROME, args, { stdio: "ignore" });
  const portFile = join(dir, "DevToolsActivePort");
  for (let i = 0; i < 200 && !existsSync(portFile); i++) await sleep(50);
  await sleep(50);
  const [port, path] = readFileSync(portFile, "utf8").split("\n");
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map(), exceptions = [], requests = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    else if (msg.method === "Network.requestWillBeSent") requests.push(msg.params.request.url);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  await s("Runtime.enable"); await s("Page.enable"); await s("Network.enable");
  await s("Page.navigate", { url });
  const evaluate = async (expression) => {
    const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const until = async (expression, what) => {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await sleep(25); }
    assert.fail(`timed out waiting for ${what}`);
  };
  const key = async (k, code) => {
    await s("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37, n: 78, p: 80 }[k] });
    await s("Input.dispatchKeyEvent", { type: "keyUp", key: k, code });
  };
  const close = async () => {
    try { await send("Browser.close"); } catch { /* already gone */ }
    ws.close();
    await new Promise((r) => { if (proc.exitCode !== null) r(); else { proc.once("exit", r); setTimeout(() => { proc.kill("SIGKILL"); r(); }, 3000); } });
    rmSync(dir, { recursive: true, force: true });
  };
  return { evaluate, until, key, send: s, exceptions, requests, close };
}

const text = (id) => `document.getElementById(${JSON.stringify(id)}).textContent`;
const shown = (id) => `!document.getElementById(${JSON.stringify(id)}).hidden`;
const set = (id, value, event) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(String(value))}; e.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })); })()`;
const st = (raw) => M.normalize(raw).state;

test("the page works in a real browser from file://", { skip: !CHROME && "no Chrome found; set CHROME_PATH" }, async () => {
  const page = await openPage();
  try {
    const { evaluate, until, key } = page;
    await until(`document.readyState === "complete" && /pass|FAIL/.test(${text("selftest-run")})`, "the page and its self-test");
    assert.match(await evaluate(text("selftest-run")), /^Self-test: (\d+)\/\1 pass$/);
    assert.equal(await evaluate(`document.getElementById("nojs").hidden`), true, "the no-JavaScript text gives way to the lab");
    assert.equal(await evaluate(text("tate-sum")), M.analyse(st({})).tate.sumText);

    // Controls redraw the engine's numbers.
    await evaluate(set("tate-centre", 1.5, "input"));
    await until(`${text("tate-headline")}.includes("outside")`, "the loop to miss 0");
    assert.equal(await evaluate(text("tate-sum")), M.analyse(st({ tate: { centre: 1.5 } })).tate.sumText);
    assert.equal(await evaluate("location.hash"), "#example=tate&centre=1.5&turns=1&steps=16");
    await evaluate(set("tate-centre", 0, "input"));

    // Tabs push history; Back returns.
    await evaluate(`document.getElementById("tab-zeta").click()`);
    await until(shown("panel-zeta"), "the zeta panel");
    assert.equal(await evaluate(`document.getElementById("panel-tate").hidden`), true);
    assert.equal(await evaluate(`document.getElementById("tab-zeta").getAttribute("aria-selected")`), "true");
    await evaluate(`(() => { document.getElementById("zeta-input").value = "5, 3"; document.getElementById("zeta-apply").click(); })()`);
    const z = M.analyse(st({ zeta: { composition: [5, 3] } })).zeta;
    await until(`${text("zeta-headline")} === ${JSON.stringify(`ζ(5, 3) = ${z.valueText}`)}`, "ζ(5, 3)");
    assert.match(await evaluate(text("zeta-dual")), /^ζ\(2, 1, 2, 1, 1, 1\) = /);
    assert.equal(await evaluate(`document.querySelectorAll("[data-testid=zeta-letter]").length`), 8);
    await evaluate(`(() => { document.getElementById("zeta-input").value = "1, 2"; document.getElementById("zeta-apply").click(); })()`);
    assert.match(await evaluate(text("zeta-error")), /diverges/);
    assert.equal(await evaluate(text("zeta-headline")), `ζ(5, 3) = ${z.valueText}`, "a refused composition leaves the state alone");

    await evaluate(`document.getElementById("tab-feynman").click()`);
    await until(shown("panel-feynman"), "the Feynman panel");
    await evaluate(`document.querySelector("[data-graph=ws4]").click()`);
    await until(`${text("feyn-headline")}.includes("20ζ(5)")`, "WS₄");
    assert.equal(await evaluate(text("feyn-quad")), "written for K₄ only; choose WS₃ = K₄");
    await evaluate(`document.querySelector("[data-graph=ws3]").click()`);
    await evaluate(set("feyn-nodes", 80, "input"));
    const f = M.analyse(st({ feynman: { nodes: 80 } })).feynman;
    await until(`${text("feyn-quad")}.startsWith(${JSON.stringify(f.quadrature.valueText)})`, "the quadrature at 80 nodes");
    await evaluate(set("feyn-q", 7, "change"));
    await until(`${text("feyn-count")}.startsWith("17101 at q = 7")`, "the K₄ count at q = 7");

    await evaluate("history.back()");
    await until(shown("panel-zeta"), "Back to the zeta panel");
    assert.equal(await evaluate(text("zeta-headline")), `ζ(5, 3) = ${z.valueText}`, "Back restores the composition");

    // Keyboard: arrows on the focused tab, and N/P anywhere outside a field.
    await evaluate(`document.getElementById("tab-zeta").focus()`);
    await key("ArrowRight", "ArrowRight");
    await until(shown("panel-feynman"), "ArrowRight to Feynman");
    assert.equal(await evaluate("document.activeElement.id"), "tab-feynman");
    assert.match(await evaluate(text("feyn-count")), /^17101 at q = 7/, "switching examples keeps the Feynman settings");
    await evaluate("document.activeElement.blur()");
    await key("n", "KeyN");
    await until(shown("panel-tate"), "N wraps to the first example");

    // JSON export imports back.
    // The page's Content-Security-Policy forbids fetch, so keep each blob as it is handed to the link.
    await evaluate(`(() => {
      window.__saved = null; const blobs = {}, make = URL.createObjectURL;
      URL.createObjectURL = (b) => { const u = make(b); blobs[u] = b; return u; };
      HTMLAnchorElement.prototype.click = function () { const name = this.download; window.__saved = blobs[this.href].text().then((text) => ({ name, text })); };
    })()`);
    await evaluate(`document.getElementById("save-json").click()`);
    const saved = await evaluate("window.__saved");
    assert.equal(saved.name, "motives-periods-state.json");
    assert.equal(JSON.parse(saved.text).state.example, "tate");
    await evaluate(`document.getElementById("reset").click()`);
    await evaluate(`(() => { const s = JSON.parse(${JSON.stringify(saved.text)}); s.state.example = "zeta"; document.getElementById("import-text").value = JSON.stringify(s); document.getElementById("import").click(); })()`);
    await until(shown("panel-zeta"), "the imported state");
    assert.equal(await evaluate(text("msg")), "Imported the state.");

    // 320 px: no horizontal overflow on any example.
    await page.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
    for (const ex of ["tate", "zeta", "feynman"]) {
      await evaluate(`document.getElementById("tab-${ex}").click()`);
      await until(shown(`panel-${ex}`), ex);
      const w = await evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]");
      assert.ok(w[0] <= w[1], `${ex} overflows at 320 px: ${w}`);
    }

    assert.deepEqual(page.requests.filter((u) => !u.startsWith(URL_) && !u.startsWith("blob:") && !u.startsWith("data:")), [], "no network requests");
    assert.deepEqual(page.exceptions, [], "no uncaught exceptions on the page");
  } finally {
    await page.close();
  }
});

test("a deep link opens its example", { skip: !CHROME && "no Chrome found; set CHROME_PATH" }, async () => {
  const page = await openPage(`${URL_}#example=feynman&graph=ws5&nodes=40&q=3`);
  try {
    await page.until(`document.readyState === "complete" && !document.getElementById("panel-feynman").hidden`, "the deep-linked example");
    assert.equal(await page.evaluate(text("feyn-headline")), `P(WS₅) = 70ζ(7) = ${M.period(M.GRAPH.ws5).value.toFixed(12)}`);
    assert.equal(await page.evaluate(`document.getElementById("feyn-q").value`), "3");
    assert.equal(await page.evaluate(text("feyn-status")), "Not a φ⁴ graph: the hub has degree 5 > 4. Its period follows the same wheel formula.");
    assert.deepEqual(page.exceptions, []);
  } finally {
    await page.close();
  }
});

test("a malformed link reports itself and leaves a working lab", { skip: !CHROME && "no Chrome found; set CHROME_PATH" }, async () => {
  const page = await openPage(`${URL_}#example=zeta&s=%E0`);
  try {
    await page.until(`document.readyState === "complete" && /pass|FAIL/.test(${text("selftest-run")})`, "the page and its self-test");
    assert.match(await page.evaluate(text("msg")), /^From the link: .*not valid URL encoding/);
    assert.equal(await page.evaluate(`document.getElementById("panel-zeta").hidden`), false);
    assert.deepEqual(page.exceptions, []);
  } finally {
    await page.close();
  }
});
