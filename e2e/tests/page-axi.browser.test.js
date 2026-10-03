// page-axi end to end in headless Chromium, on two fixture pages: one that passes every check and one that
// fails each of them. CI runs it in the chromium-desktop browser jobs (npm run test:page-axi).
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { REPO } from "../lib/manifest.js";
import { main } from "../lib/page-axi.js";

const GOOD = fileURLToPath(new URL("fixtures/page-axi/good", import.meta.url));
const BAD = fileURLToPath(new URL("fixtures/page-axi/bad", import.meta.url));
const OUT = join(REPO, "build", "page-axi");
const TMP = mkdtempSync(join(tmpdir(), "page-axi-test-"));
after(() => rmSync(TMP, { recursive: true, force: true }));

/**
 * Run page-axi and capture what it prints.
 * @param {string[]} argv
 */
async function run(argv) {
  let out = "";
  const code = await main(argv, { write: (text) => { out += text; } });
  return { code, out };
}

/**
 * The check,status pairs of a TOON verdict's checks table.
 * @param {string} out
 */
function statuses(out) {
  const table = /checks\[\d+\]\{check,status,where,evidence\}:\n((?: {2}.*\n)+)/.exec(out);
  assert.ok(table, out);
  return Object.fromEntries(table[1].trim().split("\n").map((line) => line.trim().split(",").slice(0, 2)));
}

test("a clean page passes every check at each viewport and theme, with a screenshot of each and the log", async () => {
  const out = join(OUT, "good");
  const result = await run(["check", GOOD, "--viewport", "390,1280"]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /summary:\n {2}verdict: pass\n {2}pass: 7\n {2}fail: 0\n {2}skip: 0\n {2}loads: 4\n/);
  assert.deepEqual(Object.values(statuses(result.out)), Array(7).fill("pass"));
  assert.match(result.out, /webmcp-tools,pass,page,"3 registered: get_metadata get_state set_rate"/);
  for (const name of ["390-light", "1280-light", "390-dark", "1280-dark"]) assert.ok(existsSync(join(out, `${name}.png`)), name);
  const log = JSON.parse(readFileSync(join(out, "run.json"), "utf8"));
  assert.equal(log.loads.length, 4);
  assert.match(result.out, /log: (?:\S*\/)?build\/page-axi\/good\/run\.json\n/);
});

test("a broken page fails each check it breaks, failures first, exit 1, with the full evidence in the log", async () => {
  const out = join(OUT, "bad");
  const result = await run(["check", BAD, "--viewport", "390,1280", "--themes", "light"]);
  assert.equal(result.code, 1, result.out);
  assert.deepEqual(statuses(result.out), {
    console: "fail", network: "fail", overflow: "fail", "numeric-text": "fail", contrast: "fail", "webmcp-tools": "fail", opens: "pass",
  });
  assert.match(result.out, /overflow,fail,390\/light,"scrollWidth 600 > clientWidth 390 at 390 px: div\.wide/);
  assert.match(result.out, /network,fail,390\/light 1280\/light,"refused https:\/\/cdn\.example\.org\/data\.json"/);
  assert.match(result.out, /numeric-text,fail,limits,.*#count = \\"0\\".*Infinity/);
  assert.match(result.out, /Open .*390-light\.png to see the overflow at 390 px/);
  const log = JSON.parse(readFileSync(join(out, "run.json"), "utf8"));
  assert.deepEqual(log.loads[0].errors, ["console bad page: a console error"]);
});

test("a page whose folder and file names need URL encoding opens and passes", async () => {
  const folder = join(TMP, "my page #1");
  cpSync(GOOD, folder, { recursive: true });
  cpSync(join(folder, "index.html"), join(folder, "the page.html"));
  const result = await run(["check", join(folder, "the page.html"), "--viewport", "390", "--themes", "light"]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /loads: 1\n/);
});
