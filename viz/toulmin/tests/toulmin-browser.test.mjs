import test from "node:test";
import assert from "node:assert/strict";

// Run against an isolated Chrome started with --remote-debugging-port=9227:
// TOULMIN_BROWSER_URL=http://127.0.0.1:9227 node --test tests/toulmin-browser.test.mjs
const browser = process.env.TOULMIN_BROWSER_URL;

test("at a 320 px phone width the page has no horizontal scroll (E4)", { skip: !browser, timeout: 15000 }, async () => {
  const url = new URL("../index.html", import.meta.url).href;
  const target = await (await fetch(`${browser}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const response = JSON.parse(data);
    const callbacks = pending.get(response.id);
    if (!callbacks) return;
    pending.delete(response.id);
    if (response.error) callbacks.reject(new Error(response.error.message));
    else callbacks.resolve(response.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    assert.equal(response.exceptionDetails, undefined);
    return response.result.value;
  };
  try {
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    await evaluate(`new Promise(resolve => {
      const ready = () => document.querySelectorAll('[role=tab]').length ? resolve() : setTimeout(ready, 20);
      ready();
    })`);
    const { inner, scroll } = await evaluate(`({ inner: innerWidth, scroll: document.documentElement.scrollWidth })`);
    assert.equal(inner, 320);
    assert.ok(scroll <= inner, `page is ${scroll} px wide at a ${inner} px viewport`);
  } finally {
    socket.close();
    await fetch(`${browser}/json/close/${target.id}`);
  }
});
