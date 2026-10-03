// scripts/typecheck.mjs: which inline scripts the shared extractor copies out for tsc, and where their lines map.
import assert from "node:assert/strict";
import test from "node:test";
import { extract } from "../scripts/typecheck.mjs";

const page = [
  "<!doctype html><head>",
  '<script src="x.js"></script>',
  '<script type="application/json" id="data">{"a":1}</script>',
  '<script id="engine">',
  "const a = 1;",
  "</script>",
  '<script id="beamdswitch">const deck = 1;</script>',
  "<script>a + 1;</script>",
  '<script type="module" id="ui">export {};</script>',
].join("\n");

test("only the page's own JavaScript blocks are extracted, in page order, minus skipped ids, named by id or position", () => {
  const files = extract(page, "index.html", ["beamdswitch"]);
  assert.deepEqual(files.map((f) => f.name), ["engine.js", "script-5.js", "ui.js"]);
  assert.match(files[0].text, /^\/\/ index\.html:4, <script id="engine">: extracted for type checking only\.\n\nconst a = 1;\n$/);
});

test("line k of an extracted file is line (start + k - 2) of the page", () => {
  const [engine] = extract(page, "index.html");
  const lines = engine.text.split("\n"), pageLines = page.split("\n");
  assert.equal(lines[2], pageLines[4 + 3 - 2 - 1]);
});

test("a block identical to a skipped folder file, or holding only a build placeholder, is left out", () => {
  const html = [
    "<script>const shared = 1;</script>",
    "<script>@@ENGINE@@</script>",
    "<script>/*@UI@*/</script>",
    '<script type="application/javascript">ownCode();</script>',
  ].join("\n");
  const files = extract(html, "src/template.html", [], ["const shared = 1;"]);
  assert.deepEqual(files.map((f) => f.name), ["script-4.js"]);
  assert.match(files[0].text, /^\/\/ src\/template\.html:4, <script type="application\/javascript">: [^\n]*\nownCode\(\);$/);
});
