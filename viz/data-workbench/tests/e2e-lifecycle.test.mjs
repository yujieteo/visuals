// The lifecycle of the fuller browser checks (e2e/full.test.mjs) without a browser: run with a name filter that
// selects no check, the file still starts both local target servers, and the run must close them and exit. Stand-ins
// for playwright and yaml let the file load where they are not installed; no check launches a browser.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const folder = fileURLToPath(new URL("..", import.meta.url));

test("a name filter that selects no check closes both target servers and exits", { timeout: 120_000 }, async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "dw-lifecycle-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  writeFileSync(join(tmp, "playwright.mjs"), [
    "const type = (name) => ({ name: () => name, launch: async () => { throw new Error('no browser in this test'); } });",
    "export const chromium = type('chromium'), firefox = type('firefox'), webkit = type('webkit');",
    "export const devices = new Proxy({}, { get: () => ({ viewport: { width: 400, height: 800 }, defaultBrowserType: 'chromium' }) });",
  ].join("\n"));
  writeFileSync(join(tmp, "yaml.mjs"), "export const parse = () => { throw new Error('no catalogue in this test'); };\n");
  writeFileSync(join(tmp, "hooks.mjs"), [
    "export async function resolve(spec, context, next) {",
    "  if (spec === 'playwright' || spec === 'yaml') return { url: new URL(`./${spec}.mjs`, import.meta.url).href, shortCircuit: true };",
    "  return next(spec, context);",
    "}",
  ].join("\n"));
  writeFileSync(join(tmp, "register.mjs"), "import { register } from 'node:module';\nregister('./hooks.mjs', import.meta.url);\n");
  const empty = join(tmp, "empty");
  const env = {
    ...process.env,
    E2E_ARTIFACT: folder, E2E_SLUG: "data-workbench", E2E_ONLY: "", E2E_PROJECTS: "chromium-desktop",
    E2E_TMP: tmp, E2E_VISUALS: empty, E2E_SITE: empty, E2E_RESULTS: "",
  };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ["--import", join(tmp, "register.mjs"), "--test", "--test-timeout=45000", "--test-name-pattern=no check has this name", join(folder, "e2e", "full.test.mjs")], { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exit = await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve("still running after 60 s"); }, 60_000);
    child.on("exit", (code) => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(exit, 0, output);
});
