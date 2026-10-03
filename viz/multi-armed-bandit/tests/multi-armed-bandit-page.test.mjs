/* End to end: the page in headless Chrome, from file://. These browser checks stand in for the technical
   E2E repository until it exists. The page loads without exceptions or network requests; the tabs and their
   arrow keys move between the views; the hours tab starts blank, loads and clears the fictional example,
   recomputes the model's plan as its inputs change, keeps each input's error until that input is fixed,
   saves the Markdown plan, exports JSON that imports back, survives a reload through localStorage and
   starts blank again; the experiment tab is
   unchanged by it; and nothing overflows a 320 px viewport. Chrome is driven over the DevTools protocol with Node's built-in WebSocket, so nothing is
   installed. Run against an isolated Chrome started with --remote-debugging-port=9227 (CI starts a headless one through
   scripts/with_chrome.py): MULTI_ARMED_BANDIT_BROWSER_URL=http://127.0.0.1:9227 node --test tests/multi-armed-bandit-page.test.mjs.
   Without that variable the test is skipped, so a local check never drives a browser. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const PAGE = fileURLToPath(new URL("../index.html", import.meta.url));
const URL_ = pathToFileURL(PAGE).href;
const html = readFileSync(PAGE, "utf8");
/** @param {string} id */
const script = (id) => /** @type {RegExpExecArray} */ (new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`).exec(html))[1];
/** @type {import("../src/multi-armed-bandit-logic.js").PageData} */
const D = JSON.parse(script("mab-data").replace(/<\\\//g, "</"));
const ctx = vm.createContext({});
ctx.self = ctx;
vm.runInContext(script("mab-logic"), ctx);
vm.runInContext(script("hours-logic"), ctx);
/** @type {ReturnType<typeof import("../src/hours-logic.js")>} */
const H = ctx.HoursLogic;

const BROWSER = process.env.MULTI_ARMED_BANDIT_BROWSER_URL;

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Open the page in a fresh tab, in a browser context of its own, of the running Chrome, and return evaluate() plus the page's exceptions and requests. */
async function openPage(url = URL_) {
  const { webSocketDebuggerUrl } = await (await fetch(`${BROWSER}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  /** @type {Map<number, { resolve: (result: any) => void, reject: (error: Error) => void }>} */
  const pending = new Map();
  /** @type {string[]} */
  const exceptions = [];
  /** @type {string[]} */
  const requests = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = /** @type {{ resolve: (result: any) => void, reject: (error: Error) => void }} */ (pending.get(msg.id));
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    else if (msg.method === "Network.requestWillBeSent") requests.push(msg.params.request.url);
  };
  /** @param {string} method @param {object} [params] @param {string} [sessionId] @returns {Promise<any>} the DevTools protocol's reply, whatever shape that method returns */
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { browserContextId } = await send("Target.createBrowserContext");
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  /** @param {string} method @param {object} [params] */
  const s = (method, params) => send(method, params, sessionId);
  await s("Runtime.enable"); await s("Page.enable"); await s("Network.enable");
  await s("Page.navigate", { url });
  /** @param {string} expression */
  const evaluate = async (expression) => {
    const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  /** @param {string} expression @param {string} what */
  const until = async (expression, what) => {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await sleep(25); }
    assert.fail(`timed out waiting for ${what}`);
  };
  /** @param {"ArrowRight" | "ArrowLeft" | "n" | "p"} k @param {string} code */
  const key = async (k, code) => {
    await s("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37, n: 78, p: 80 }[k] });
    await s("Input.dispatchKeyEvent", { type: "keyUp", key: k, code });
  };
  const close = async () => {
    try { await send("Target.disposeBrowserContext", { browserContextId }); } catch { /* already gone */ }
    ws.close();
  };
  return { evaluate, until, key, send: s, exceptions, requests, close };
}

/** @param {string} id */
const text = (id) => `document.getElementById(${JSON.stringify(id)}).textContent`;
/** @param {string} id */
const shown = (id) => `!document.getElementById(${JSON.stringify(id)}).hidden`;
/** @param {string} id @param {string | number} value */
const set = (id, value) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(String(value))}; e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
/** @param {number} col */
const cells = (col) => `[...document.querySelectorAll("#ht-body tr")].map((tr) => tr.children[${col}].textContent)`;
const skip = !BROWSER && "set MULTI_ARMED_BANDIT_BROWSER_URL to a Chrome DevTools address";

test("the hours tab plans next week's hours in a real browser from file://", { skip }, async () => {
  const page = await openPage();
  try {
    const { evaluate, until, key } = page;
    await until(`document.readyState === "complete" && !document.getElementById("app").hidden`, "the page");
    assert.equal(await evaluate(`document.getElementById("nojs").hidden`), true, "the no-JavaScript text gives way to the tool");
    const before = await evaluate(text("ts-pick"));

    await evaluate(`document.getElementById("tab-hrs").click()`);
    await until(shown("panel-hrs"), "the hours panel");
    assert.equal(await evaluate("location.hash"), "", "tabs leave the URL alone");
    assert.equal(await evaluate(`document.getElementById("tab-hrs").getAttribute("aria-selected")`), "true");
    assert.equal(await evaluate(text("h-basis")), "Your own plan", "the hours tab starts blank");
    assert.equal(await evaluate(`document.querySelectorAll("#ht-body tr").length`), 2);
    assert.equal(await evaluate(`document.getElementById("h-clear").hidden`), true);
    await evaluate(`document.getElementById("h-example").click()`);
    await until(`document.querySelectorAll("#ht-body tr").length === 5`, "the loaded example");
    assert.equal(await evaluate(text("h-basis")), "Fictional example counts");
    assert.equal(await evaluate(text("h-note")), D.hours.note);
    assert.equal(await evaluate(`document.getElementById("h-clear").hidden`), false);
    let s = H.fromExample(D), V = H.view(s);
    assert.deepEqual(await evaluate(cells(7)), V.rows.map((r) => r.text.thompson), "Thompson hours as the model computes them");
    assert.deepEqual(await evaluate(cells(8)), V.rows.map((r) => r.text.ucb), "UCB1 hours as the model computes them");
    assert.equal(await evaluate(text("h-ts-why")), V.tsWhy);
    assert.equal(await evaluate(`document.querySelectorAll("#h-chart svg rect").length`), 10, "two bars per activity");

    // Inputs recompute the plan.
    await evaluate(set("hx-a4", 9));
    s = /** @type {import("../src/hours-logic.js").State} */ (H.setCount(s, 3, "notWorthwhile", "9").state); V = H.view(s);
    await until(`${text("h-ts-why")} === ${JSON.stringify(V.tsWhy)}`, "the plan after more not-worthwhile Notes blocks");
    assert.equal(await evaluate(text("h-basis")), "Fictional example, edited");
    await evaluate(set("h-hours", 35));
    s = /** @type {import("../src/hours-logic.js").State} */ (H.setHours(s, "35").state); V = H.view(s);
    await until(`${JSON.stringify(JSON.stringify(V.rows.map((r) => r.text.thompson)))} === JSON.stringify(${cells(7)})`, "35 hours");
    await evaluate(set("h-hours", 0));
    assert.match(await evaluate(text("e-hours")), /from 1 to 168/);
    assert.equal(await evaluate(`document.getElementById("h-hours").value`), "0", "an invalid entry stays while its error stands");
    await evaluate(set("h-hours", 35));

    // Each input keeps its own error while another input in the same row changes.
    await evaluate(set("hn-a4", "mathematics"));
    assert.match(await evaluate(text("herr-name-a4")), /unique/);
    await evaluate(set("hw-a4", 6));
    s = /** @type {import("../src/hours-logic.js").State} */ (H.setCount(s, 3, "worthwhile", "6").state); V = H.view(s);
    await until(`${text("h-ts-why")} === ${JSON.stringify(V.tsWhy)}`, "the plan after more worthwhile Notes blocks");
    assert.match(await evaluate(text("herr-name-a4")), /unique/, "the name's error stands");
    assert.equal(await evaluate(text("herr-w-a4")), "");
    assert.equal(await evaluate(`document.getElementById("hn-a4").value`), "mathematics");
    await evaluate(set("hw-a4", "x"));
    assert.match(await evaluate(text("herr-w-a4")), /Worthwhile blocks/);
    await evaluate(set("hx-a4", 8));
    s = /** @type {import("../src/hours-logic.js").State} */ (H.setCount(s, 3, "notWorthwhile", "8").state); V = H.view(s);
    await until(`${text("h-ts-why")} === ${JSON.stringify(V.tsWhy)}`, "the plan after fewer not-worthwhile Notes blocks");
    assert.match(await evaluate(text("herr-w-a4")), /Worthwhile blocks/, "the worthwhile error stands");
    assert.equal(await evaluate(`document.getElementById("hw-a4").value`), "x");
    await evaluate(set("hn-a4", "Notes"));
    assert.equal(await evaluate(text("herr-name-a4")), "");
    assert.match(await evaluate(text("herr-w-a4")), /Worthwhile blocks/, "the worthwhile error still stands");
    await evaluate(set("hw-a4", 6));
    assert.equal(await evaluate(text("herr-w-a4")), "");
    assert.equal(await evaluate(text("h-basis")), "Fictional example, edited");

    // Save plan and Export JSON hand their text to the link; the JSON imports back after a reset.
    await evaluate(`(() => {
      window.__saved = []; const blobs = {}, make = URL.createObjectURL;
      URL.createObjectURL = (b) => { const u = make(b); blobs[u] = b; return u; };
      HTMLAnchorElement.prototype.click = function () { const name = this.download; window.__saved.push(blobs[this.href].text().then((text) => ({ name, text }))); };
    })()`);
    await evaluate(`document.getElementById("h-save-md").click()`);
    await evaluate(`document.getElementById("h-export").click()`);
    const [md, json] = await evaluate("Promise.all(window.__saved)");
    assert.equal(md.name, "multi-armed-bandit-hours-plan.md");
    assert.match(md.text, /^# Next week's hours: a plan for 35 hours$/m);
    assert.equal(json.name, "multi-armed-bandit-hours.json");
    assert.equal(H.serialise(/** @type {import("../src/hours-logic.js").State} */ (H.parse(json.text).state)), H.serialise(s));
    await evaluate(`document.getElementById("h-clear").click()`);
    await until(shown("h-confirm"), "the clear confirmation");
    await evaluate(`document.getElementById("h-confirm-yes").click()`);
    await until(`document.querySelectorAll("#ht-body tr").length === 2 && document.getElementById("h-hours").value === "20"`, "the blank plan after clearing the example");
    assert.equal(await evaluate(text("h-basis")), "Your own plan");
    await evaluate(`(() => { const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(json.text)}], "plan.json", { type: "application/json" }));
      const i = document.getElementById("h-import"); i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await until(`document.getElementById("h-hours").value === "35"`, "the imported plan");
    assert.equal(await evaluate(text("h-store")), "Imported plan.json.");

    // A reload restores the autosaved plan.
    await new Promise((r) => setTimeout(r, 400));
    await page.send("Page.reload");
    await until(`document.readyState === "complete" && !document.getElementById("app").hidden && document.getElementById("h-hours").value === "35"`, "the restored plan");
    assert.equal(await evaluate(text("h-store")), "Restored your autosaved plan.");
    assert.equal(await evaluate(shown("panel-exp")), true, "the page opens on the experiment");
    await evaluate(`document.getElementById("tab-hrs").click()`);
    await until(shown("panel-hrs"), "the hours panel after reload");
    assert.deepEqual(await evaluate(cells(7)), JSON.parse(JSON.stringify(V.rows.map((r) => r.text.thompson))), "the restored plan");

    // Start blank: two activities with no blocks, no longer labelled as the example.
    await evaluate(`document.getElementById("h-blank").click()`);
    await until(shown("h-confirm"), "the start-blank confirmation");
    await evaluate(`document.getElementById("h-confirm-yes").click()`);
    await until(`document.querySelectorAll("#ht-body tr").length === 2`, "the blank plan");
    assert.equal(await evaluate(text("h-basis")), "Your own plan");
    assert.equal(await evaluate(text("h-note")), "");
    assert.equal(await evaluate(`document.getElementById("h-clear").hidden`), true);
    assert.equal(await evaluate("document.activeElement.id"), "hn-a1");

    // Keyboard: arrows move between the three tabs.
    await evaluate(`document.getElementById("tab-hrs").focus()`);
    await key("ArrowRight", "ArrowRight");
    await until(shown("panel-exp"), "ArrowRight wraps to the experiment");
    assert.equal(await evaluate("document.activeElement.id"), "tab-exp");
    assert.equal(await evaluate(text("ts-pick")), before, "the experiment is unchanged by the hours tab");
    await key("ArrowLeft", "ArrowLeft");
    await until(shown("panel-hrs"), "ArrowLeft to the hours");

    // 320 px: no horizontal overflow on any tab.
    await page.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
    for (const t of ["exp", "sim", "hrs"]) {
      await evaluate(`document.getElementById("tab-${t}").click()`);
      await until(shown(`panel-${t}`), t);
      const w = await evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth]");
      assert.ok(w[0] <= w[1], `${t} overflows at 320 px: ${w}`);
    }

    assert.deepEqual(page.requests.filter((u) => !u.startsWith(URL_) && !u.startsWith("blob:") && !u.startsWith("data:")), [], "no network requests");
    assert.deepEqual(page.exceptions, [], "no uncaught exceptions on the page");
  } finally {
    await page.close();
  }
});
