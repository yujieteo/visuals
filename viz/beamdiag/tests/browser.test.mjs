import test from "node:test";
import assert from "node:assert/strict";

// Run against an isolated Chrome started with --remote-debugging-port=9227 (CI starts a headless one):
// BEAMDIAG_BROWSER_URL=http://127.0.0.1:9227 node --test tests/browser.test.mjs
const browser = process.env.BEAMDIAG_BROWSER_URL;

test("mouse dragging a point-force handle through the section cursor reaches the endpoint", { skip: !browser, timeout: 15000 }, async () => {
  const url = new URL("../index.html", import.meta.url).href;
  const target = await (await fetch(`${browser}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
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
    await send("Page.navigate", { url });
    await evaluate(`new Promise(resolve => {
      const ready = () => document.querySelector('[data-key="s1"]') ? resolve() : setTimeout(ready, 20);
      ready();
    })`);
    await evaluate(`document.querySelector('[data-add="point"]').click()`);
    const coords = await evaluate(`(() => {
      const h = document.querySelector('[data-key="l1"]');
      h.scrollIntoView({ block: 'center' });
      const r = h.getBoundingClientRect();
      const end = document.querySelector('[data-key="s1"]').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, end: end.x + end.width / 2 };
    })()`);
    // Moving first places the section cursor directly over the handle, as in real use.
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: coords.x, y: coords.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: coords.x, y: coords.y, button: "left", clickCount: 1 });
    for (let step = 1; step <= 20; step++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: coords.x + (coords.end - coords.x) * step / 20, y: coords.y, buttons: 1 });
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: coords.end, y: coords.y, button: "left", clickCount: 1 });
    // Compared with the length field, so it holds in whichever unit convention the page opens in.
    const [position, length] = await evaluate(`[document.querySelector('[data-field="loads.1.x"]').value, document.getElementById('length').value].map(Number)`);
    assert.equal(position, length, "the dragged force must move from midspan to the beam endpoint");
  } finally {
    socket.close();
    await fetch(`${browser}/json/close/${target.id}`);
  }
});
