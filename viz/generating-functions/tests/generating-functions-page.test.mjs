/* Generating Functions Lab: the page itself. Boots the built page against a stand-in DOM for every
   route, exercises the read-only WebMCP tools, and checks the hard constraints: one self-contained
   file, no network, no TeX library, a canonical URL, and an educational no-JavaScript fallback. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { standIn } from "./beamdswitch-deck-checks.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/* Boot the page at a hash; returns the stand-in and the WebMCP tools it registered. */
/** @param {string} [hash] */
function boot(hash = "") {
  /** @type {ModelContextTool[]} */
  const tools = [];
  const p = standIn({ globals: { navigator: { clipboard: { writeText: async () => {} }, modelContext: { registerTool: (/** @type {ModelContextTool} */ t) => tools.push(t) } }, CSS: { escape: (/** @type {string} */ s) => s }, Blob, URLSearchParams } });
  p.context.location.hash = hash;
  p.run(html);
  return { ...p, tools };
}

test("every lesson, problem and lab page renders from its deep link", () => {
  const { context } = boot();
  /** @type {typeof import("../lessons.js")} */
  const L = context.GFLab;
  const routes = [...L.LESSONS.map((l) => `#${l.hash}`), ...L.LESSONS.flatMap((l) => (l.aliases || []).map((a) => `#${a}`)), ...L.PROBLEMS.map((p) => `#problem-${p.k}`), "#problems", "#compare", ...L.COMPARISONS.map((c) => `#compare/${c.id}`), "#fourier", "#fourier?N=2", "#fourier?N=3", "#fourier?N=8", "#sandbox", "#map", "#techniques", "#confusions", "#coin-change?n=12&coins=2%2C%203", "#fibonacci?mode=guided&step=3", "#dft?N=8&n=5"];
  for (const h of routes) {
    const p = boot(h), view = p.$("view").innerHTML;
    assert.ok(view.length > 500, `${h} renders`);
    assert.doesNotMatch(view, /undefined|NaN|\[object /, `${h}: no undefined, NaN or [object] in the page`);
    if (h.startsWith("#problem-")) assert.doesNotMatch(view, /eyebrow">solution/, `${h}: the solution starts hidden`);
  }
  for (const l of L.LESSONS) for (const [k, spec] of Object.entries(l.params || {})) for (const v of spec.values) {
    const view = boot(`#${l.hash}?${k}=${encodeURIComponent(v)}`).$("view").innerHTML;
    assert.doesNotMatch(view, /undefined|NaN|\[object /, `${l.hash} ${k}=${v}`);
  }
  for (const l of L.LESSONS) for (const n of l.n ? [l.n.min, l.n.max] : []) {
    const view = boot(`#${l.hash}?n=${n}`).$("view").innerHTML;
    assert.ok(view.length > 500, `${l.hash} n=${n} renders`);
    assert.doesNotMatch(view, /undefined|NaN|\[object /, `${l.hash} n=${n}`);
  }
});

test("a lesson page synchronises the strip, the tape and the extraction on the selected coefficient", () => {
  const view = boot("#coin-change?n=12").$("view").innerHTML;
  assert.match(view, /data-act="n" data-v="12" aria-pressed="true"/);
  assert.match(view, /<span class="big">13<\/span>/);
  assert.match(view, /13 ways to make 12 from coins 1, 2, 5\./);
  assert.match(view, /the independent check agrees/);
  for (const s of ["Why this works", "Show objects", "Representations", "Show Fourier view", "Verify numerically", "When should I use this?", "Related techniques"]) assert.ok(view.includes(s), s);
  const fib = boot("#fibonacci?n=7").$("view").innerHTML;
  assert.match(fib, /F₇ = 13\./);
});

test("the WebMCP tools are read-only and answer from the engine", async () => {
  const { tools } = boot("#coin-change?n=12");
  const names = tools.map((t) => t.name);
  assert.deepEqual(names, ["get_metadata", "get_current_view", "extract_coefficient", "dft", "run_self_tests"]);
  for (const t of tools) assert.equal(t.annotations?.readOnlyHint, true, t.name);
  /** @param {string} name @param {object} [args] */
  const call = async (name, args = {}) => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) assert.fail(`no tool ${name}`);
    return JSON.parse((await tool.execute(args)).content[0].text);
  };
  assert.equal((await call("get_metadata")).levels.length, 34);
  const cur = await call("get_current_view");
  assert.equal(cur.coefficient, "13");
  assert.equal((await call("extract_coefficient", { lesson: "catalan", n: 5 })).value, "42");
  assert.equal((await call("extract_coefficient", { lesson: "coin-change", n: 12, params: { coins: "1, 5, 10" } })).value, "4");
  assert.ok((await call("extract_coefficient", { lesson: "nope" })).error);
  // A page that is not a lesson has no coefficient: the tool answers with an error rather than throwing.
  for (const lesson of ["problems", "compare/ogf-egf", "fourier", "problem-3"]) assert.ok((await call("extract_coefficient", { lesson })).error, lesson);
  assert.deepEqual((await call("dft", { vector: [1, 2, 3, 4] })).values.map((/** @type {{ exact: string }} */ v) => v.exact), ["10", "−2 − 2i", "−2", "−2 + 2i"]);
  assert.deepEqual((await call("dft", { vector: [1, 2, 3, 4] })).inverse, ["1", "2", "3", "4"]);
  const st = await call("run_self_tests");
  assert.equal(st.passed, st.total);
});

test("one self-contained file: no network, no external scripts or fonts, no TeX library, canonical URL", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/teoyujie\.org\/visuals\/generating-functions">/);
  const urls = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(urls, ["https://teoyujie.org/visuals/generating-functions"], "the only absolute URL attribute is the canonical link");
  for (const bad of [/\bfetch\(/, /XMLHttpRequest/, /new WebSocket/, /sendBeacon/, /EventSource/, /import\(/, /@import/, /MathJax/, /katex/i, /<link[^>]+stylesheet/, /<script[^>]+src=/]) assert.doesNotMatch(html, bad, String(bad));
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /<meta name="viewport"/);
});

test("without JavaScript the page still teaches: introduction, concept map, technique index, formulas, problems, the DFT link", () => {
  const nos = /** @type {RegExpExecArray} */ (/<noscript>([\s\S]*?)<\/noscript>/.exec(html))[1];
  const { context } = boot();
  /** @type {typeof import("../lessons.js")} */
  const L = context.GFLab;
  for (const l of L.LESSONS) assert.ok(nos.includes(l.title.replace(/'/g, "'")), `level ${l.level}: ${l.title}`);
  for (const t of L.TECHNIQUES) assert.ok(nos.includes(t), t);
  for (const p of L.PROBLEMS) assert.ok(nos.includes(p.title), `problem ${p.k}`);
  for (const h of ["Concept map", "Technique index", "Canonical formulas", "Worked problems", "Generating functions and the DFT"]) assert.ok(nos.includes(h), h);
  assert.ok(nos.includes("10, −2 − 2i, −2, −2 + 2i"));
});
