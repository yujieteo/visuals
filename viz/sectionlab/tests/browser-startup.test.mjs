/* Exercise the real browser-test runner with disposable Chrome stand-ins, not a live browser.
   A failure must end the runner, reap its child, and remove its profile and downloads. */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const browserTest = fileURLToPath(new URL("browser.test.mjs", import.meta.url));

const fixture = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const profile = process.argv.find(a => a.startsWith("--user-data-dir=")).slice("--user-data-dir=".length);
fs.writeFileSync(process.env.STARTUP_RECORD, JSON.stringify({ pid: process.pid, profile }));
if (process.env.STARTUP_MODE === "exit") process.exit(42);
if (process.env.STARTUP_MODE === "handshake") {
  // Publish a port and accept TCP, but never answer the WebSocket upgrade.
  const server = net.createServer(() => {});
  server.listen(0, "127.0.0.1", () => {
    fs.writeFileSync(path.join(profile, "DevToolsActivePort"), server.address().port + "\\n/devtools/browser/stalled\\n");
  });
} else {
  // Stay alive without publishing DevToolsActivePort, like the intermittent CI startup failure.
  setInterval(() => {}, 1000);
}
`;

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) {
    if (err.code === "ESRCH") return false;
    throw err;
  }
}

test("Chrome startup failures close the real browser-test runner and its resources", {
  concurrency: true, timeout: 35000, skip: process.platform === "win32" && "fixtures use POSIX executables and process groups",
}, async (t) => {
  await Promise.all(["port", "handshake", "exit", "spawn-error"].map((mode) => t.test(mode, async (t) => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "sectionlab-startup-"));
    const chrome = path.join(scratch, "chrome"), record = path.join(scratch, "record.json");
    fs.writeFileSync(chrome, mode === "spawn-error" ? "#!/sectionlab-missing-interpreter\n" : fixture, { mode: 0o755 });
    let proc, timer, forced = false;
    const start = Date.now();
    try {
      const env = { ...process.env, CHROME_PATH: chrome, TMPDIR: scratch, TMP: scratch, TEMP: scratch,
        STARTUP_MODE: mode, STARTUP_RECORD: record };
      // This is a new top-level runner, not a nested test in the current runner.
      delete env.NODE_TEST_CONTEXT;
      proc = spawn(process.execPath, ["--test", browserTest], {
        detached: true, env, stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      proc.stdout.on("data", (chunk) => { output += chunk; });
      proc.stderr.on("data", (chunk) => { output += chunk; });
      const result = await new Promise((resolve, reject) => {
        proc.once("error", reject);
        proc.once("close", (code, signal) => resolve({ code, signal }));
        timer = setTimeout(() => {
          forced = true;
          // Kill only this isolated fixture group if the regression would otherwise hang CI.
          process.kill(-proc.pid, "SIGKILL");
        }, 25000);
      });
      clearTimeout(timer);
      assert.equal(forced, false, `the runner needed its watchdog after ${Date.now() - start} ms:\n${output}`);
      assert.deepEqual(result, { code: 1, signal: null }, output);
      const expected = { port: /timed out waiting for Chrome's DevTools port/,
        handshake: /timed out waiting for Chrome's DevTools connection/,
        exit: /Chrome exited before connecting \(code 42/, "spawn-error": /ENOENT/ };
      assert.match(output, expected[mode], "the startup error is reported, not hidden by cleanup");
      if (mode !== "spawn-error") {
        const child = JSON.parse(fs.readFileSync(record, "utf8"));
        assert.equal(alive(child.pid), false, "the spawned Chrome process is gone");
        assert.equal(fs.existsSync(child.profile), false, "the Chrome profile is removed");
      }
      assert.deepEqual(fs.readdirSync(scratch).filter((name) => /^sectionlab-(chrome|downloads)-/.test(name)), [],
        "no profiles or downloads are left after startup failure");
      t.diagnostic(`${mode}: runner exited 1 in ${Date.now() - start} ms; no child, profile, or downloads remain`);
    } finally {
      clearTimeout(timer);
      if (proc && proc.exitCode === null && proc.signalCode === null) {
        try { process.kill(-proc.pid, "SIGKILL"); } catch (err) { if (err.code !== "ESRCH") throw err; }
      }
      if (fs.existsSync(record)) {
        const child = JSON.parse(fs.readFileSync(record, "utf8"));
        if (alive(child.pid)) process.kill(child.pid, "SIGKILL");
      }
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  })));
});
