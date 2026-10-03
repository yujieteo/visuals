// The shared visual style guide (yujieteo/skills interactive-visual-spec/references/style-guide.md):
// a head script with id site-theme applies the reader's site-wide Light or Dark choice before paint.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("the site-theme script comes before every style and only reads the site's theme key", () => {
  const m = /<script id="site-theme">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, "site-theme script");
  assert.ok(m.index < html.indexOf("<style"), "site-theme precedes the first style");
  for (const [stored, expected] of /** @type {[string | null, string | undefined][]} */ ([["dark", "dark"], ["light", "light"], ["sepia", undefined], [null, undefined]])) {
    /** @type {unknown[][]} */
    const calls = [];
    /** @type {Record<string, string>} */
    const dataset = {};
    const localStorage = new Proxy({}, { get: (_, k) => (k === "getItem" ? (/** @type {string} */ key) => { calls.push(["getItem", key]); return stored; } : () => calls.push([k])) });
    vm.runInNewContext(m[1], { localStorage, document: { documentElement: { dataset } } });
    assert.deepEqual(calls, [["getItem", "theme"]]);
    assert.equal(dataset.theme, expected, String(stored));
  }
  vm.runInNewContext(m[1], { document: { documentElement: { dataset: {} } } }); // no storage at all: silent
});

// Every declaration under a selector, merged across all of the page's style blocks.
/** @param {string} selector @returns {Record<string, string>} */
const tokens = (selector) => {
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  /** @type {Record<string, string>} */
  const out = {};
  let at = css.indexOf(selector);
  while (at !== -1) {
    const open = css.indexOf("{", at), close = css.indexOf("}", open);
    for (const decl of css.slice(open + 1, close).split(";")) {
      const k = decl.indexOf(":");
      if (k > 0) out[decl.slice(0, k).trim()] = decl.slice(k + 1).trim();
    }
    at = css.indexOf(selector, close);
  }
  return out;
};

test("an explicit Dark choice gets exactly the system dark palette, and Light pins the light scheme", () => {
  const system = tokens(':root:not([data-theme="light"])');
  const { "color-scheme": scheme, ...explicit } = tokens(':root[data-theme="dark"]');
  assert.ok(system["--control"], "the dark palette sets --control");
  assert.deepEqual(explicit, Object.fromEntries(Object.entries(system).filter(([k]) => k !== "color-scheme")));
  assert.equal(scheme, "dark");
  assert.equal(tokens(':root[data-theme="light"]')["color-scheme"], "light");
});
