import test from "node:test";
import assert from "node:assert/strict";

// Run against an isolated Chrome started with --remote-debugging-port=9227:
// TOULMIN_BROWSER_URL=http://127.0.0.1:9227 node --test tests/toulmin-browser.test.mjs
const browser = process.env.TOULMIN_BROWSER_URL;

async function withPage(width, height, run) {
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
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    await evaluate(`new Promise(resolve => {
      const ready = () => document.querySelectorAll('[role=tab]').length ? resolve() : setTimeout(ready, 20);
      ready();
    })`);
    await run(evaluate);
  } finally {
    socket.close();
    await fetch(`${browser}/json/close/${target.id}`);
  }
}

test("at a 320 px phone width the page has no horizontal scroll (E4)", { skip: !browser, timeout: 15000 }, async () => {
  await withPage(320, 800, async (evaluate) => {
    const { inner, scroll } = await evaluate(`({ inner: innerWidth, scroll: document.documentElement.scrollWidth })`);
    assert.equal(inner, 320);
    assert.ok(scroll <= inner, `page is ${scroll} px wide at a ${inner} px viewport`);
  });
});

test("desktop diagram: Warrant and Backing sit under Qualifier however tall Grounds or Rebuttal grow, and no cards overlap", { skip: !browser, timeout: 15000 }, async () => {
  await withPage(1280, 900, async (evaluate) => {
    const measure = () => evaluate(`(() => {
      const box = (key) => { const r = document.querySelector('.part-' + key).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
      const keys = ['claim', 'grounds', 'warrant', 'backing', 'qualifier', 'rebuttal'];
      return { rowGap: parseFloat(getComputedStyle(document.querySelector('.grid')).rowGap), boxes: Object.fromEntries(keys.map(k => [k, box(k)])) };
    })()`);
    const check = ({ rowGap, boxes }, label) => {
      const slack = rowGap + 48;
      const { qualifier, warrant, backing, grounds, claim, rebuttal } = boxes;
      assert.ok(warrant.top - qualifier.bottom <= slack, `${label}: Warrant starts ${warrant.top - qualifier.bottom} px below Qualifier`);
      assert.ok(backing.top - warrant.bottom <= slack, `${label}: Backing starts ${backing.top - warrant.bottom} px below Warrant`);
      assert.ok(grounds.right <= qualifier.left && qualifier.right <= claim.left, `${label}: Grounds, Qualifier and Claim run left to right`);
      assert.ok(Math.abs(warrant.left - qualifier.left) < 1 && Math.abs(backing.left - qualifier.left) < 1, `${label}: Warrant and Backing share Qualifier's column`);
      assert.ok(Math.abs(rebuttal.left - claim.left) < 1 && rebuttal.top >= claim.bottom, `${label}: Rebuttal sits under Claim`);
      const entries = Object.entries(boxes);
      for (const [i, [a, p]] of entries.entries()) for (const [b, q] of entries.slice(i + 1)) {
        const overlap = p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
        assert.ok(!overlap, `${label}: ${a} overlaps ${b}`);
      }
    };
    check(await measure(), "template essay");
    await evaluate(`document.querySelector('.part-grounds').style.minHeight = '2400px'; document.querySelector('.part-rebuttal').style.minHeight = '1600px'`);
    check(await measure(), "tall Grounds and Rebuttal");
  });
});
