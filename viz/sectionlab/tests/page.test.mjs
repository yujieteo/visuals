import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { L, RAW, compute } from "./helpers.mjs";

const HTML = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

/* Run the built page against an inert DOM with a stub navigator.modelContext, and collect its tools. */
function page(hash = "") {
  const inert = () => new Proxy(function () {}, {
    get: (t, k) => (k === "modelContext" || k === "then" ? undefined : k === Symbol.iterator ? [][Symbol.iterator] : k === Symbol.toPrimitive ? () => 0 : inert()),
    set: () => true, apply: () => inert(), construct: () => inert(),
  });
  const tools = [];
  const ctx = vm.createContext({
    document: inert(), location: { hash, href: `file:///index.html${hash}` }, history: inert(), CSS: inert(),
    matchMedia: () => inert(), getComputedStyle: () => inert(), addEventListener() {}, setTimeout, clearTimeout,
    ResizeObserver: function () { return inert(); }, MutationObserver: function () { return inert(); },
    TextEncoder, TextDecoder, atob, btoa, console,
    navigator: { modelContext: { registerTool: (t) => tools.push(t) } },
  });
  for (const m of HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
  const call = async (name, input = {}) => JSON.parse((await tools.find((t) => t.name === name).execute(input)).content[0].text);
  return { tools, call, ctx };
}

test("the page is fully built and carries the notice", () => {
  assert.match(HTML, /Verify independently/);
  assert.doesNotMatch(HTML, /\/\*@(DATA|ACCURACY|ENGINE|BEAMDSWITCH|UI)@\*\//);
  assert.doesNotMatch(HTML, /design[- ]code compliant/i);
});

test("the page registers its WebMCP tools and they agree with the engine", async () => {
  const p = page();
  assert.deepEqual(p.tools.map((t) => t.name), ["get_metadata", "get_current_section", "compute_section", "export_markdown"]);
  for (const t of p.tools) assert.equal(t.annotations.readOnlyHint, true);
  const meta = await p.call("get_metadata");
  assert.deepEqual(Object.keys(meta.shapes), Object.keys(L.shapes.SHAPES));
  assert.equal(meta.torsion_accuracy.circle.pass, true);
  const cur = await p.call("get_current_section");
  const expected = compute(RAW.presets[0].model);
  assert.deepEqual(cur.model, expected.model);
  assert.equal(cur.properties.Ix, expected.props.Ix);
  assert.equal(cur.plastic.M_lim, expected.plastic.limit.M);
  const viaYaml = await p.call("compute_section", { yaml: L.yaml.stringify(RAW.presets[1].model) });
  assert.equal(viaYaml.torsion.available, true);
  assert.equal(viaYaml.properties.A, compute(RAW.presets[1].model).props.A);
  const bad = await p.call("compute_section", { model: { ...RAW.presets[1].model, sectionlab: 9 } });
  assert.match(bad.error, /Unsupported schema/);
  assert.equal(bad.path, "sectionlab");
  const md = await p.call("export_markdown", {});
  assert.match(md.markdown, /```yaml\nsectionlab: 1/);
});

test("a share link in the address loads its model", async () => {
  const model = RAW.presets[2].model;
  const bytes = new TextEncoder().encode(L.yaml.stringify(model));
  const hash = "#model=" + Buffer.from(bytes).toString("base64url");
  const p = page(hash);
  const cur = await p.call("get_current_section");
  assert.deepEqual(cur.model, L.section.normalize(model));
});
