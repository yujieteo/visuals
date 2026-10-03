// The built page: one file with every module, the template, the data, MathJax 4.1.3 and the Fira font inlined
// unchanged, no external resource, and the data file published beside it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { assertInlined, read } from "./beamdswitch-helpers.mjs";

const html = read("index.html");
const root = new URL("../", import.meta.url);
const bytes = (p) => readFileSync(new URL(p, root));
const sha = (b) => createHash("sha256").update(b).digest("hex");

test("the page inlines each source module and the template unchanged", () => {
  for (const m of ["numerics", "detector", "model", "state", "signal", "calc", "checks", "report", "scene3d", "ui", "views", "app"]) assertInlined(html, `src-${m}`, read(`src/${m}.js`), m);
  assertInlined(html, "beamdswitch", read("beamdswitch.js"), "beamdswitch template");
  assert.ok(html.includes(`<script id="worker-glue" type="text/plain">\n${read("src/worker.js")}</script>`));
});

test("MathJax 4.1.3 and the Fira font are embedded from the checked vendor files", () => {
  const manifest = JSON.parse(read("vendor/manifest.json"));
  assert.deepEqual(manifest.packages.map((p) => `${p.name}@${p.version}`), ["mathjax@4.1.3", "@mathjax/mathjax-fira-font@4.1.3"]);
  for (const p of manifest.packages) for (const f of p.files) assert.equal(sha(bytes(`vendor/${f.path}`)), f.sha256, f.path);
  assertInlined(html, "mathjax-core", read("vendor/mathjax/tex-chtml-nofont.js"), "MathJax core");
  const woff = JSON.parse(/<script type="application\/json" id="mathjax-woff2">(.*?)<\/script>/s.exec(html)[1]);
  const files = manifest.packages[1].files.filter((f) => f.path.endsWith(".woff2"));
  assert.equal(Object.keys(woff).length, files.length);
  for (const f of files) assert.equal(woff[f.path.split("/").pop()], `data:font/woff2;base64,${bytes(`vendor/${f.path}`).toString("base64")}`);
  assert.ok(html.includes("Apache License"), "MathJax licence in the page");
  assert.ok(html.includes("SIL OPEN FONT LICENSE"), "Fira Math licence in the page");
});

test("no external runtime resource", () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i, "no external script");
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i, "no external stylesheet");
  assert.doesNotMatch(html, /url\(\s*["']?https?:/i, "no remote CSS resource");
  assert.doesNotMatch(html, /@import/);
  // The vendored MathJax names its default CDN in a string; the page overrides every loader path, and the
  // browser checks count requests. Outside the vendored blocks no CDN name appears at all.
  const own = html.replace(/<script id="mathjax-(files|core)">[\s\S]*?<\/script>/g, "");
  assert.doesNotMatch(own, /cdnjs|jsdelivr|unpkg|googleapis/);
});

test("the MathJax configuration uses the Fira font and loads only embedded files", () => {
  const loaded = [];
  const window = { MathJaxEmbedded: { "mathjax-fira/chtml.js": () => loaded.push("fira") } };
  vm.runInNewContext(/<script id="mathjax-config">([\s\S]*?)<\/script>/.exec(html)[1], { window });
  const { loader, output } = window.MathJax;
  assert.equal(output.font, "mathjax-fira");
  for (const path of Object.values(loader.paths)) assert.match(path, /^embedded:/);
  loader.require("embedded:mathjax-fira/chtml.js");
  assert.deepEqual(loaded, ["fira"]);
  assert.throws(() => loader.require("https://cdn.jsdelivr.net/npm/mathjax@4/input/tex/extensions/ams.js"), /not embedded in this page/);
});

test("metadata, theme script, no-JavaScript content and the data file", () => {
  assert.match(html, /<title>Radar network: the range equation in a moving 3D scene<\/title>/);
  assert.match(html, /<meta name="description"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/teoyujie.org\/visuals\/radar-network\/">/);
  assert.match(html, /<script id="site-theme">/);
  assert.match(html, /<noscript>/);
  assert.equal((html.match(/<tr class="link-row" data-link=/g) || []).length, 36, "the static table has the 36 initial links");
  const data = JSON.parse(/<script type="application\/json" id="radar-data">(.*?)<\/script>/s.exec(html)[1].replace(/<\\\//g, "</"));
  assert.deepEqual(data, JSON.parse(read("raw.json")));
  assert.match(html, /href="\.\.\/\.\.\/visuals\.html"/, "a link back to Visuals");
});
