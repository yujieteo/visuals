// The page is one self-contained file that works offline and from file://: it inlines d3, and the requests rule
// in scripts/rules.py checks that it requests nothing from the network. index.html is the generated public artifact.
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { read } from "./beamdswitch-decks.mjs";

const html = read("index.html");

test("the inlined d3 is version 7.9.0 and provides what the page calls", () => {
  const d3 = vm.runInContext(/<script id="d3">\n([\s\S]*?)<\/script>/.exec(html)[1] + ";d3", vm.createContext({}));
  assert.equal(d3.version, "7.9.0");
  for (const name of ["csvParse", "csvFormat", "select", "scaleLinear", "scaleSqrt", "extent", "zoom", "zoomIdentity", "axisBottom", "axisLeft", "min", "max"]) {
    assert.ok(d3[name], `d3.${name}`);
  }
  assert.deepEqual(Array.from(d3.csvParse("a,b\n1,\"x,y\"\n"), (r) => ({ ...r })), [{ a: "1", b: "x,y" }]);
});
