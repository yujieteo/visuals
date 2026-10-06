import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
import { waitForDownloads } from "./download-checks.mjs";

const EXPECTED = ["diagonal-tension-beamdswitch.md", "diagonal-tension-model.json", "diagonal-tension-results.csv"];

/** @param {import("node:test").TestContext} t */
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "dt-download-check-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    write: (/** @type {string[]} */ names) => { for (const name of names) writeFileSync(join(directory, name), "export fixture"); },
  };
}

// Mock only time, not the filesystem: each poll sees real temporary files and renames.
test("finished exports ignore leftover Chrome .crdownload files", async (t) => {
  const { directory, write } = fixture(t);
  write([...EXPECTED, "downloads.html.crdownload", `${EXPECTED[0]}.crdownload`]);
  await waitForDownloads(directory, EXPECTED, new Set(EXPECTED));
});

test("exports wait for every completion event, even when all final files exist", async (t) => {
  const { directory, write } = fixture(t);
  write(EXPECTED);
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  // An unrelated completed download must not substitute for the third export.
  const completed = new Set([...EXPECTED.slice(0, 2), "downloads.html"]);
  let resolved = false;
  const waiting = waitForDownloads(directory, EXPECTED, completed).then(() => { resolved = true; });
  t.mock.timers.tick(6000); // slower than the old five-second loop
  await nextTurn();
  assert.equal(resolved, false, "the third export has not completed");
  completed.add(EXPECTED[2]);
  t.mock.timers.tick(25);
  await waiting;
  assert.equal(resolved, true);
});

test("exports wait for the final rename after Chrome reports completion", async (t) => {
  const { directory, write } = fixture(t);
  write([...EXPECTED.slice(0, 2), `${EXPECTED[2]}.crdownload`]);
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  let resolved = false;
  const waiting = waitForDownloads(directory, EXPECTED, new Set(EXPECTED)).then(() => { resolved = true; });
  t.mock.timers.tick(25);
  await nextTurn();
  assert.equal(resolved, false, "a partial file is not the final export");
  renameSync(join(directory, `${EXPECTED[2]}.crdownload`), join(directory, EXPECTED[2]));
  t.mock.timers.tick(25);
  await waiting;
  assert.equal(resolved, true);
});

test("unfinished exports time out with completion and directory diagnostics", async (t) => {
  const { directory, write } = fixture(t);
  write([...EXPECTED.slice(0, 2), `${EXPECTED[2]}.crdownload`]);
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const failure = assert.rejects(waitForDownloads(directory, EXPECTED, new Set(EXPECTED.slice(0, 2)), 100), {
    message: `timed out waiting for exports; incomplete: ${EXPECTED[2]}; missing: ${EXPECTED[2]}; directory: ${[...EXPECTED.slice(0, 2), `${EXPECTED[2]}.crdownload`].sort().join(", ")}`,
  });
  t.mock.timers.tick(100);
  await failure;
});

test("three completion events cannot pass without their final files", async (t) => {
  const { directory } = fixture(t);
  await assert.rejects(waitForDownloads(directory, EXPECTED, new Set(EXPECTED), 0), {
    message: `timed out waiting for exports; incomplete: none; missing: ${EXPECTED.join(", ")}; directory: empty`,
  });
});

test("existing files cannot pass without their completion events", async (t) => {
  const { directory, write } = fixture(t);
  write(EXPECTED);
  await assert.rejects(waitForDownloads(directory, EXPECTED, new Set(), 0), {
    message: `timed out waiting for exports; incomplete: ${EXPECTED.join(", ")}; missing: none; directory: ${EXPECTED.join(", ")}`,
  });
});

test("an unexpected finished file still fails the exact export list", async (t) => {
  const { directory, write } = fixture(t);
  write([...EXPECTED, "unexpected.json"]);
  await assert.rejects(waitForDownloads(directory, EXPECTED, new Set(EXPECTED)), {
    code: "ERR_ASSERTION",
    actual: [...EXPECTED, "unexpected.json"],
    expected: EXPECTED,
  });
});
