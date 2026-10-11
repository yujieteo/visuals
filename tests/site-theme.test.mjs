// style_guide.THEME_SCRIPT, the site's theme lines that every page carries unchanged before its first <style> (the
// theme rule in scripts/rules.py checks each page): it copies the reader's stored family and Light or Dark choice to
// <html data-theme> and <html data-mode>, ignores any other mode, follows a change made in the site's header, and
// stays silent where storage is missing or blocked, as in a sandboxed frame.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";

const html = execFileSync("python3", ["-c", "from style_guide import THEME_SCRIPT; print(THEME_SCRIPT, end='')"],
  { cwd: new URL("../scripts/", import.meta.url), encoding: "utf8" });
const script = /^<script id="site-theme">([\s\S]*)<\/script>$/.exec(html)?.[1] ?? "";

/**
 * Runs the script against a fake page and storage; returns the dataset, the reads and the storage listener.
 * @param {Record<string, string | null>} stored
 * @param {Record<string, string>} [dataset]
 */
function run(stored, dataset = {}) {
  /** @type {string[]} */
  const reads = [];
  /** @type {((e: { key: string }) => void)[]} */
  const listeners = [];
  const localStorage = { getItem: (/** @type {string} */ key) => { reads.push(key); return stored[key] ?? null; } };
  vm.runInNewContext(script, { localStorage, addEventListener: (/** @type {string} */ _type, /** @type {(e: { key: string }) => void} */ fn) => listeners.push(fn), document: { documentElement: { dataset } } });
  return { dataset, reads, listeners };
}

test("the theme script applies a stored family and a light or dark mode and nothing else", () => {
  for (const [stored, expected] of /** @type {[Record<string, string | null>, Record<string, string>][]} */ ([
    [{ mode: "dark", theme: "gruvbox" }, { mode: "dark", theme: "gruvbox" }],
    [{ mode: "light" }, { mode: "light" }],
    [{ mode: "sepia" }, {}],
    [{ theme: "nord" }, { theme: "nord" }],
    [{}, {}],
  ])) {
    const { dataset, reads } = run(stored);
    assert.deepEqual(reads, ["mode", "theme"], JSON.stringify(stored));
    assert.deepEqual(dataset, expected, JSON.stringify(stored));
  }
});

test("the theme script follows a change made in the site's header", () => {
  const stored = /** @type {Record<string, string | null>} */ ({ mode: "dark", theme: "nord" });
  const { dataset, listeners } = run(stored);
  assert.equal(listeners.length, 1);
  Object.assign(stored, { mode: null, theme: "dracula" });
  listeners[0]({ key: "other" });
  assert.deepEqual(dataset, { mode: "dark", theme: "nord" }, "an unrelated key changes nothing");
  listeners[0]({ key: "mode" });
  assert.deepEqual(dataset, { theme: "dracula" }, "Auto removes the mode; the new family applies");
  stored.theme = null;
  listeners[0]({ key: "theme" });
  assert.deepEqual(dataset, {}, "the default family removes the attribute");
});

test("the theme script is silent when storage is missing or throws", () => {
  const dataset = {};
  vm.runInNewContext(script, { document: { documentElement: { dataset } } });
  vm.runInNewContext(script, { localStorage: { getItem() { throw new Error("blocked"); } }, document: { documentElement: { dataset } } });
  assert.deepEqual(dataset, {});
});
