/* Fastener Pattern CG Tracker end to end: the built index.html in a real browser renders the hand
   calculations, follows the worked-fastener picker, and its Save Markdown, Copy Markdown, beamdswitch
   and Copy deck buttons hand over the same text the core writes, with the copy-by-hand fallback when
   the clipboard is blocked. */
import test from "node:test";
import assert from "node:assert/strict";
import { parseDeck } from "./fixtures/beamdswitch/deck.mjs";

// Run against an isolated Chrome started with --remote-debugging-port=9228 (CI starts a headless one):
// FASTENER_CG_BROWSER_URL=http://127.0.0.1:9228 node --test tests/fastener-cg-browser.test.mjs
const browser = process.env.FASTENER_CG_BROWSER_URL;

async function openPage() {
  const url = new URL("../index.html", import.meta.url).href;
  const target = await (await fetch(`${browser}/json/new?about:blank`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map(), errors = [];
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    const callbacks = pending.get(msg.id);
    if (!callbacks) return;
    pending.delete(msg.id);
    if (msg.error) callbacks.reject(new Error(msg.error.message));
    else callbacks.resolve(msg.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    assert.equal(response.exceptionDetails, undefined, response.exceptionDetails?.exception?.description);
    return response.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  // Downloads and clipboard writes are recorded on the page instead of leaving it.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__saved = []; window.__copied = []; window.__clipboardFails = false;
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__saved.push({ name: this.download, href: this.href }); };
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { if (window.__clipboardFails) throw new Error("blocked"); window.__copied.push(t); } } });
  ` });
  await send("Page.navigate", { url });
  await evaluate(`new Promise((resolve) => {
    const ready = () => document.querySelector("#trace h4") ? resolve() : setTimeout(ready, 20);
    ready();
  })`);
  const close = async () => { socket.close(); await fetch(`${browser}/json/close/${target.id}`); };
  return { evaluate, errors, close };
}

test("the built page works the hand calculations and exports them and the beamdswitch deck", { skip: !browser, timeout: 30000 }, async () => {
  const page = await openPage();
  try {
    const { evaluate } = page;
    const view = await evaluate(`(() => ({
      heading: document.getElementById("trace-h").textContent,
      sections: [...document.querySelectorAll("#trace h3")].map((h) => h.textContent),
      frames: document.querySelectorAll("#trace h4").length,
      rows: document.querySelectorAll("#trace tbody tr").length,
      options: [...document.querySelectorAll("#trace-fastener option")].map((o) => ({ value: o.value, text: o.textContent, selected: o.selected })),
      text: document.getElementById("trace").textContent,
    }))()`);
    assert.equal(view.heading, "Hand calculations");
    assert.ok(view.sections.length >= 3, `group and per-fastener sections: ${view.sections}`);
    assert.ok(view.frames >= 5 && view.rows >= 20, `${view.frames} steps with ${view.rows} rows`);
    assert.doesNotMatch(view.text, /NaN|undefined|Infinity/);
    const governing = view.options.find((o) => o.text.endsWith("(governing)"));
    assert.ok(governing && governing.selected, "the governing fastener is worked by default");
    assert.ok(view.options.length >= 2);

    // Picking another fastener reworks the calculation trace for it.
    const other = view.options.find((o) => o !== governing).value;
    const reworked = await evaluate(`(() => {
      const pick = document.getElementById("trace-fastener");
      pick.value = ${JSON.stringify(other)};
      pick.dispatchEvent(new Event("change", { bubbles: true }));
      return { selected: document.getElementById("trace-fastener").value, text: document.getElementById("trace").textContent };
    })()`);
    assert.equal(reworked.selected, other);
    assert.notEqual(reworked.text, view.text);
    assert.ok(reworked.text.includes(other));

    // Save Markdown and Copy Markdown hand over the same document; beamdswitch and Copy deck the same deck.
    const out = await evaluate(`(async () => {
      for (const id of ["hand-save", "hand-copy", "save-beamdswitch", "copy-beamdswitch"]) document.getElementById(id).click();
      await new Promise((r) => setTimeout(r, 50));
      const saved = await Promise.all(window.__saved.map(async (s) => ({ name: s.name, text: await (await fetch(s.href)).text() })));
      return { saved, copied: window.__copied, hand: document.getElementById("hand-msg").textContent, io: document.getElementById("io-msg").textContent };
    })()`);
    assert.equal(out.saved.length, 2);
    assert.match(out.saved[0].name, /-hand-calculations\.md$/);
    assert.match(out.saved[1].name, /-beamdswitch\.md$/);
    const [hand, deck] = out.saved.map((s) => s.text);
    assert.deepEqual(out.copied, [hand, deck], "Copy writes what Save saves");
    assert.match(out.hand, /^Copied the hand calculations/);
    assert.match(out.io, /^Copied the beamdswitch deck/);
    assert.ok(hand.includes(other), "the Markdown follows the picked fastener");
    const parsed = parseDeck(deck);
    assert.equal(parsed.meta.voice, "bf_emma");
    assert.deepEqual(parsed.frames.filter((f) => f.kind === "section").map((f) => f.title), ["Set-up", "Method", "Results", "Checks and takeaway"]);
    assert.ok(parsed.frames.length > 10);

    // With the clipboard blocked, the deck is shown selected for copying by hand.
    const fallback = await evaluate(`(async () => {
      window.__clipboardFails = true;
      document.getElementById("copy-beamdswitch").click();
      await new Promise((r) => setTimeout(r, 50));
      const ta = document.getElementById("fallback-text");
      return { hidden: document.getElementById("fallback").hidden, value: ta.value, focused: document.activeElement === ta, msg: document.getElementById("io-msg").className };
    })()`);
    assert.equal(fallback.hidden, false);
    assert.equal(fallback.value, deck);
    assert.equal(fallback.focused, true);
    assert.match(fallback.msg, /\bbad\b/);
    assert.deepEqual(page.errors, []);
  } finally {
    await page.close();
  }
});
