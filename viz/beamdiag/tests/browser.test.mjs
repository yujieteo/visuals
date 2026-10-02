import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

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

/* beamdswitch's page, vendored unchanged from yujieteo/beamdswitch (beamdswitch.html at commit
   fbd1cf6bf1dea9de65b385b72c2f046167a8d8e8, the build yujieteo/site serves at /visuals/beamdswitch/
   with this sha256 in its raw.json). */
const BEAMDSWITCH = new URL("./fixtures/beamdswitch/beamdswitch.html", import.meta.url);
const BEAMDSWITCH_SHA256 = "12d680a542a8d66a1444fe27814f0129c5c98b6bbbc0301791c00ccdd8eaf1b2";

test("the vendored beamdswitch page is the pinned upstream build", () => {
  assert.equal(createHash("sha256").update(readFileSync(BEAMDSWITCH)).digest("hex"), BEAMDSWITCH_SHA256);
});

/* An open tab on the isolated Chrome: evaluate(expression) runs in the page and returns its value. */
async function tab(url) {
  const target = await (await fetch(`${browser}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const response = JSON.parse(data), callbacks = pending.get(response.id);
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
    assert.equal(response.exceptionDetails, undefined, JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  await send("Page.enable");
  await send("Page.navigate", { url });
  const close = async () => { socket.close(); await fetch(`${browser}/json/close/${target.id}`); };
  return { evaluate, close };
}

/* Opens the deck in beamdswitch and lays out every slide as beamdswitch does (1280 × 720 px, text
   shrunk from 30 px to at worst 18 px until the body fits), reporting how each one came out. */
const LAYOUT = `(async (md) => {
  const app = window.beamdswitch, src = document.getElementById("src");
  // Decks of one beam share a title, so a placeholder in between shows when this one has been read.
  const open = async (text) => {
    const title = text.match(/^title: (.*)$/m)[1];
    src.value = text;
    src.dispatchEvent(new Event("input"));
    await new Promise((resolve) => { const ready = () => (app.deck && app.deck.meta.title === title ? resolve() : setTimeout(ready, 20)); ready(); });
  };
  await open("---\\ntitle: placeholder " + Math.random() + "\\n---\\n");
  await open(md);
  const box = document.getElementById("measure"), out = [];
  for (const f of app.deck.frames) {
    const slide = app.buildSlide(f, app.deck, box), scale = app.fitBody(slide), body = slide.querySelector(".fbody"), head = slide.querySelector(".fhead");
    out.push({
      title: f.title, section: f.section, scale,
      wide: body ? body.scrollWidth - body.clientWidth : 0,
      tall: slide.scrollHeight - slide.clientHeight,
      overlap: body && head ? head.getBoundingClientRect().bottom - body.getBoundingClientRect().top : 0,
    });
  }
  box.innerHTML = "";
  return out;
})`;

test("every slide of every preset's deck fits beamdswitch's slide, and every hand-calculation slide at full size", { skip: !browser, timeout: 240000 }, async () => {
  const require = createRequire(import.meta.url);
  const B = require("../engine.js"), H = require("../handcalc.js"), raw = require("../raw.json");
  const page = await tab(BEAMDSWITCH.href);
  try {
    await page.evaluate(`new Promise((resolve) => { const ready = () => (window.beamdswitch && window.MathJax && MathJax.tex2svg ? resolve() : setTimeout(ready, 20)); ready(); })`);
    for (const p of raw.presets) for (const units of Object.keys(B.UNIT_SYSTEMS)) for (const origin of ["left", "mid"]) {
      const material = raw.materials.find((m) => m.id === p.material);
      const r = B.solve({ length: p.length, material, section: B.sectionProperties(p.section), supports: p.supports, loads: p.loads });
      r.extremes = B.extremes(r);
      const md = H.deck(H.beamReport(r, { units, origin, at: p.length / 3, title: p.label, material: { label: material.label } }));
      for (const s of await page.evaluate(`${LAYOUT}(${JSON.stringify(md)})`)) {
        const what = `${p.id} ${units} ${origin}: "${s.title}"`;
        assert.ok(s.scale > 0, `${what} overflows even at beamdswitch's smallest text`);
        assert.ok(s.wide <= 1, `${what} is ${s.wide} px too wide`);
        assert.ok(s.tall <= 1, `${what} is ${s.tall} px too tall`);
        if (s.section !== "Hand calculations") continue;
        // The hand calculations are split to be read at (nearly) full size, under a one-line title.
        assert.ok(s.scale >= 0.9, `${what} shrinks its text to ${Math.round(30 * s.scale)} px`);
        assert.ok(s.overlap <= 0, `${what}: the title runs ${s.overlap} px into the body`);
      }
    }
  } finally {
    await page.close();
  }
});
