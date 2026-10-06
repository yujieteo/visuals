/* End to end: the built index.html in headless Chrome, driven over the DevTools protocol with
   nothing but Node (no package.json, no Puppeteer). It opens the hand calculations, checks what
   the page draws against the engine, saves the Markdown through a real download, copies it
   through the real clipboard, and checks a phone-width page does not scroll sideways.
   Chrome is found from CHROME_PATH or the usual install paths; without one the test is skipped
   locally and fails under CI, where ubuntu-latest has google-chrome. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { L, RAW, compute } from "./helpers.mjs";
import { serve } from "./server.mjs";

const fmt = L.report.fmt;

function findChrome() {
  const named = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"].filter(Boolean).find((p) => fs.existsSync(p));
  if (named) return named;
  for (const cmd of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { return execFileSync("which", [cmd], { encoding: "utf8" }).trim(); } catch { /* next */ }
  }
  return null;
}

const until = async (what, fn, ms = 20000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};

/* A minimal DevTools client: one browser socket, flattened sessions per page. */
async function launch(chrome) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sectionlab-chrome-"));
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--disable-gpu", "--disable-extensions", "about:blank"];
  if (process.platform === "linux") args.push("--no-sandbox");
  const proc = spawn(chrome, args, { stdio: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  let ws;
  try {
    const [port, wsPath] = (await until("Chrome's DevTools port", () => fs.existsSync(portFile) && fs.readFileSync(portFile, "utf8").trim().split("\n").length === 2 && fs.readFileSync(portFile, "utf8").trim().split("\n")));
    ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
    await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  } catch (err) {
    proc.kill("SIGKILL"); // a Chrome left running keeps the test process alive until the job times out
    throw err;
  }
  let id = 0;
  const pending = new Map(), listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, bad } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? bad(new Error(`${msg.error.message} ${msg.error.data || ""}`)) : ok(msg.result);
    } else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, bad) => {
    pending.set(++id, { ok, bad });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const close = async () => {
    try { await send("Browser.close"); } catch { /* already gone */ }
    ws.close();
    await new Promise((r) => (proc.exitCode !== null ? r() : proc.once("exit", r)));
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return { send, on: (l) => listeners.push(l), close };
}

const chrome = findChrome();

test("in Chrome, the page draws the hand calculations, saves and copies their Markdown, and fits a phone", {
  skip: !chrome && !process.env.CI && "no Chrome found (set CHROME_PATH)", timeout: 120000,
}, async () => {
  assert.ok(chrome, "CI needs Chrome for the end-to-end test; set CHROME_PATH");
  const server = await serve(), origin = `http://127.0.0.1:${server.address().port}`;
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "sectionlab-downloads-"));
  const b = await launch(chrome);
  try {
    const errors = [], done = new Set();
    b.on((m) => {
      if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
      if (m.method === "Browser.downloadProgress" && m.params.state === "completed") done.add(m.params.guid);
    });
    await b.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: downloads, eventsEnabled: true });
    await b.send("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
    const { targetId } = await b.send("Target.createTarget", { url: "about:blank" });
    const { sessionId: s } = await b.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => b.send(method, params, s);
    const run = async (expr) => {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error(`${expr}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    };
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url: `${origin}/` });
    await until("the page to load", () => run(`document.readyState === "complete" && !!document.getElementById("hand-details")`));

    const first = RAW.presets[0], result = compute(first.model), frames = L.handcalc.frames(result);
    const expected = L.buildHandMarkdown(result);
    assert.equal(await run(`document.getElementById("hand-steps").children.length`), 0, "nothing is drawn while the details are closed");

    // Open the details as a reader would, by clicking the summary.
    await run(`document.querySelector("#hand-details > summary").click()`);
    const drawn = await until("the steps to draw", () => run(`(() => {
      const box = document.getElementById("hand-steps");
      return box.children.length && [...box.children].map((c) => ({ title: c.querySelector("h4")?.textContent || "", eqs: c.querySelectorAll(".eq").length }));
    })()`));
    assert.equal(drawn.length, frames.length, "one card per hand-calculation step");
    const area = `Area A = ${fmt(result.props.A)} mm²`;
    assert.ok(drawn.some((c) => c.title === area), `a card titled "${area}"`);
    assert.ok(drawn.filter((c) => c.eqs > 0).length >= 5, "the cards carry drawn equations");
    const tex = await run(`(() => { const box = document.getElementById("hand-steps");
      return { fracs: box.querySelectorAll(".frac").length, subs: box.querySelectorAll("sub").length, raw: /\\\\(frac|sqrt|sum|cdot)/.test(box.textContent) }; })()`);
    assert.ok(tex.fracs > 0 && tex.subs > 0, "fractions and subscripts are drawn as HTML");
    assert.equal(tex.raw, false, "no raw TeX commands are left in the page");

    // Save Markdown: a real download, byte for byte the engine's document.
    await run(`document.getElementById("save-hand").click()`);
    const name = `${first.model.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-hand-calculations.md`;
    assert.equal(await run(`document.getElementById("hand-status").textContent`), `Saved ${name}: it opens in beamdswitch too.`);
    const guid = await until("the download to finish", () => [...done][0]);
    assert.equal(fs.readFileSync(path.join(downloads, guid), "utf8"), expected, "the saved file is the hand-calculation Markdown");

    // Copy Markdown: the real clipboard holds the same document.
    await run(`document.getElementById("copy-hand").click()`);
    await until("the copy to finish", async () => (await run(`document.getElementById("hand-status").textContent`)).startsWith("Copied"));
    assert.equal(await run(`navigator.clipboard.readText()`), expected, "the clipboard holds the same Markdown");

    // A phone-width page with every step open does not scroll sideways.
    await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
    await until("the phone layout", () => run(`innerWidth === 375`));
    assert.ok(await run(`document.documentElement.scrollWidth <= innerWidth`), "no horizontal page scroll at 375 px");

    assert.deepEqual(errors, [], "no script errors in the page");
  } finally {
    await b.close();
    server.close();
    fs.rmSync(downloads, { recursive: true, force: true });
  }
});
