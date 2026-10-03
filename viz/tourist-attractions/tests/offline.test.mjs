// The page is one self-contained file: it requests nothing from the network, so it works offline and from
// file://. index.html is the generated public artifact, read here as that contract.
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { read } from "./beamdswitch-decks.mjs";

const html = read("index.html");

test("every script, stylesheet and image is inline: the page loads nothing from another origin", () => {
  const tags = [...html.matchAll(/<(script|link|img|iframe|source)\b[^>]*>/gi)].map((m) => m[0]);
  for (const tag of tags) {
    const ref = /\b(?:src|href)="([^"]*)"/i.exec(tag)?.[1];
    assert.ok(ref === undefined || ref.startsWith("data:") || ref.startsWith("#"), `no external resource: ${tag}`);
  }
});

test("the inlined d3 is version 7.9.0 and provides what the page calls", () => {
  const d3 = vm.runInContext(/<script id="d3">\n([\s\S]*?)<\/script>/.exec(html)[1] + ";d3", vm.createContext({}));
  assert.equal(d3.version, "7.9.0");
  for (const name of ["csvParse", "csvFormat", "select", "scaleLinear", "scaleSqrt", "extent", "zoom", "zoomIdentity", "axisBottom", "axisLeft", "min", "max"]) {
    assert.ok(d3[name], `d3.${name}`);
  }
  assert.deepEqual(Array.from(d3.csvParse("a,b\n1,\"x,y\"\n"), (r) => ({ ...r })), [{ a: "1", b: "x,y" }]);
});
