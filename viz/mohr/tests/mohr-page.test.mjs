/* End to end: the page in headless Chrome. It loads with a passing self-test, the Hand calculations
   section shows the engine's own steps, follows the controls (θ, sign convention, preset), and Save
   Markdown and Copy Markdown hand over the hand calculations as a deck beamdswitch opens. Chrome is
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
import { checkDeck } from "./beamdswitch-deck-checks.mjs";

const PAGE = fileURLToPath(new URL("../index.html", import.meta.url));
const html = readFileSync(PAGE, "utf8");
const script = (id) => new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`).exec(html)[1];
const ctx = vm.createContext({});
ctx.self = ctx;
vm.runInContext(script("mohr-engine"), ctx);
vm.runInContext(script("mohr-beamdswitch"), ctx);
const M = ctx.Mohr, T = ctx.Beamdswitch;

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

/* Launch Chrome, open the page in a fresh tab, and return evaluate() plus the page's exceptions. */
async function openPage() {
  const dir = mkdtempSync(join(tmpdir(), "mohr-page-"));
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "--no-first-run",
    "--no-default-browser-check", "--disable-gpu", "--disable-extensions", "about:blank"];
  if (process.platform === "linux") args.unshift("--no-sandbox");
  const proc = spawn(CHROME, args, { stdio: "ignore" });
  const portFile = join(dir, "DevToolsActivePort");
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
  const pending = new Map(), exceptions = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Runtime.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await send("Page.navigate", { url: pathToFileURL(PAGE).href }, sessionId);
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const until = async (expression, what) => {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await sleep(25); }
    assert.fail(`timed out waiting for ${what}`);
  };
  const close = async () => {
    try { await send("Browser.close"); } catch { /* already gone */ }
    ws.close();
    await new Promise((r) => { if (proc.exitCode !== null) r(); else { proc.once("exit", r); setTimeout(() => { proc.kill("SIGKILL"); r(); }, 3000); } });
    rmSync(dir, { recursive: true, force: true });
  };
  return { evaluate, until, exceptions, close };
}

// The section as rendered: each step's heading, words and equations.
const READ_HAND = `[...document.querySelectorAll("#hand-body article.calc")].map((a) => ({
  h: a.querySelector("h3").textContent,
  p: [...a.querySelectorAll("p")].map((p) => p.textContent),
  eq: [...a.querySelectorAll(".eq")].map((e) => e.textContent),
}))`;
const expected = (st) => M.handCalc(st).steps.map((s, i) => ({ h: `${i + 1}. ${s.title}`, p: [...s.text], eq: s.eqs.map((e) => e.text) }));
const plain = (x) => JSON.parse(JSON.stringify(x));

test("the page's Hand calculations section, controls and Markdown export work in a real browser", { skip: !CHROME && "no Chrome found; set CHROME_PATH" }, async () => {
  const page = await openPage();
  try {
    const { evaluate, until } = page;
    await until(`document.readyState === "complete" && document.querySelectorAll("#hand-body article.calc").length > 0`, "the page to load");

    // Loads on preset 1 with a passing self-test, and the section shows the engine's steps.
    await until(`/\\bpass\\b/.test(document.getElementById("selftest-badge").className)`, "the self-test badge to pass");
    assert.deepEqual(await evaluate(READ_HAND), plain(expected(M.defaultState())));
    const shown = await evaluate(READ_HAND);
    assert.equal(shown.length, 6);
    assert.match(shown[1].h, /C = 20, R = 67\.08 MPa/);
    assert.match(shown[2].h, /σmax = 87\.08, σmin = −47\.08 MPa, θp = 13\.28°/);
    assert.match(shown[5].h, /σ1 = 87\.08, σ2 = 0, σ3 = −47\.08 MPa; τmax = 67\.08 MPa/);

    // Typing θ, switching the sign convention and loading a preset each redraw the section.
    await evaluate(`(() => { const t = document.getElementById("theta"); t.value = "30"; t.dispatchEvent(new Event("change")); })()`);
    const at30 = M.defaultState(); at30.plane.angleDeg = 30;
    await until(`document.querySelectorAll("#hand-body article.calc")[4].querySelector("h3").textContent.includes("θ = 30°")`, "the rotated element at θ = 30°");
    assert.deepEqual(await evaluate(READ_HAND), plain(expected(at30)));

    await evaluate(`(() => { const c = document.getElementById("c-sign"); c.value = "compression-positive"; c.dispatchEvent(new Event("change")); })()`);
    at30.conventions.normalSign = "compression-positive";
    const wantCp = plain(expected(at30));
    await until(`JSON.stringify(${READ_HAND}) === ${JSON.stringify(JSON.stringify(wantCp))}`, "the compression-positive hand calculations");

    await evaluate(`(() => { const p = document.getElementById("preset"); p.value = "6"; p.dispatchEvent(new Event("change")); })()`);
    // The page loads a preset as presetState(id, current state) with its shadows seeded.
    const st = M.presetState(6, at30);
    M.seedShadows(st);
    const want6 = plain(expected(st));
    assert.deepEqual(await evaluate(READ_HAND), want6);
    assert.ok(want6[5].p.some((t) => /characteristic cubic|carries no shear/.test(t)), "preset 6 reaches the 3D principal values");

    // Save Markdown downloads mohr-hand-calculations.md; Copy Markdown copies the same text.
    await evaluate(`(() => {
      window.__saved = null; window.__copied = null;
      HTMLAnchorElement.prototype.click = function () { const name = this.download; window.__saved = fetch(this.href).then((r) => r.text()).then((text) => ({ name, text })); };
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
    })()`);
    await evaluate(`document.getElementById("save-hand").click()`);
    const saved = await evaluate("window.__saved");
    assert.equal(saved.name, "mohr-hand-calculations.md");
    assert.match(await evaluate(`document.getElementById("hand-msg").textContent`), /^Saved mohr-hand-calculations\.md\./);
    assert.equal(saved.text, T.deck(M.handReport(st)));
    const deck = checkDeck(saved.text, "saved hand calculations");
    assert.ok(deck.frames.some((f) => /^Hand calculation 1: /.test(f.title)), "the deck carries the hand calculation slides");
    assert.match(saved.text, /\$\$ /, "equations are written as TeX");

    await evaluate(`document.getElementById("copy-hand").click()`);
    await until("window.__copied !== null", "Copy Markdown");
    assert.equal(await evaluate("window.__copied"), saved.text);
    assert.equal(await evaluate(`document.getElementById("hand-msg").textContent`), "Copied the hand calculations as Markdown.");

    assert.deepEqual(page.exceptions, [], "no uncaught exceptions on the page");
  } finally {
    await page.close();
  }
});
