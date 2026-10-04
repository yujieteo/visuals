// style_guide.THEME_SCRIPT, the site's theme line that every page carries unchanged before its first <style> (the
// theme rule in scripts/rules.py checks each page): it applies the reader's stored Light or Dark choice, ignores
// any other value, and stays silent where storage is missing or blocked, as in a sandboxed frame.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";

const html = execFileSync("python3", ["-c", "from style_guide import THEME_SCRIPT; print(THEME_SCRIPT, end='')"],
  { cwd: new URL("../scripts/", import.meta.url), encoding: "utf8" });
const script = /^<script id="site-theme">([\s\S]*)<\/script>$/.exec(html)?.[1] ?? "";

test("the theme script applies a stored light or dark choice and nothing else", () => {
  for (const [stored, expected] of [["dark", "dark"], ["light", "light"], ["sepia", undefined], [null, undefined]]) {
    /** @type {unknown[][]} */
    const calls = [];
    /** @type {Record<string, string>} */
    const dataset = {};
    const localStorage = { getItem: (/** @type {string} */ key) => { calls.push(["getItem", key]); return stored; } };
    vm.runInNewContext(script, { localStorage, document: { documentElement: { dataset } } });
    assert.deepEqual(calls, [["getItem", "theme"]], String(stored));
    assert.equal(dataset.theme, expected, String(stored));
  }
});

test("the theme script is silent when storage is missing or throws", () => {
  const dataset = {};
  vm.runInNewContext(script, { document: { documentElement: { dataset } } });
  vm.runInNewContext(script, { localStorage: { getItem() { throw new Error("blocked"); } }, document: { documentElement: { dataset } } });
  assert.deepEqual(dataset, {});
});
