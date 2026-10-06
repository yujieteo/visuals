import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

/** Wait for both Chrome's completion events and the final filenames before reading exports.
    Other Chrome downloads may leave temporary files in the same directory.
    @param {string} directory
    @param {readonly string[]} expected
    @param {ReadonlySet<string>} completed filenames from Browser.downloadProgress
    @param {number} [timeoutMs] */
export async function waitForDownloads(directory, expected, completed, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const entries = readdirSync(directory).sort();
    const files = entries.filter((name) => !name.endsWith(".crdownload"));
    const incomplete = expected.filter((name) => !completed.has(name));
    const missing = expected.filter((name) => !files.includes(name));
    if (!incomplete.length && !missing.length) {
      assert.deepEqual(files, [...expected].sort(), "only the expected finished exports");
      return;
    }
    if (Date.now() >= deadline) {
      assert.fail(`timed out waiting for exports; incomplete: ${incomplete.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}; directory: ${entries.join(", ") || "empty"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
