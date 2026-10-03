import test from "node:test";
import assert from "node:assert/strict";
import { L, FIXTURES, RAW } from "./helpers.mjs";

const Y = L.yaml;

test("every fixture and example model round-trips through the writer and reader", () => {
  for (const m of [...FIXTURES.cases.map((c) => c.model), ...RAW.presets.map((p) => p.model)]) {
    const text = Y.stringify(m);
    assert.deepEqual(Y.parse(text), m);
    assert.deepEqual(L.section.normalize(Y.parse(text)), L.section.normalize(m));
  }
});

test("the writer quotes strings that would read back as something else", () => {
  const tricky = {
    yes: "yes", no: "No", on: "on", nul: "null", tilde: "~", empty: "", num: "12", flt: "1.5", exp: "1.0e+5", date: "2026-09-30",
    colon: "a: b", hash: "a #b", dash: "- x", lead: " x", quote: '"q"', newline: "a\nb", tab: "a\tb", unicode: "σ0.2 — ε_lim", bracket: "[x]",
    brace: "{x}", star: "*x", amp: "&x", bang: "!x", pct: "%x", at: "@x", tick: "`x", pipe: "|x", gt: ">x", ok: "plain text",
  };
  assert.deepEqual(Y.parse(Y.stringify(tricky)), tricky);
  assert.match(Y.stringify({ a: "plain text" }), /^a: plain text\n$/);
});

test("numbers are written as YAML 1.1 floats and integers", () => {
  const nums = { i: 42, neg: -7, f: 2.5, small: 1e-9, big: 2.5e21, tiny: -3e-5, zero: 0, nzero: -0, whole: 1e20 };
  const text = Y.stringify(nums);
  assert.match(text, /^small: 1\.0e-9$/m);
  assert.match(text, /^big: 2\.5e\+21$/m);
  assert.match(text, /^f: 2\.5$/m);
  assert.match(text, /^i: 42$/m);
  const back = Y.parse(text);
  for (const k of Object.keys(nums)) assert.equal(back[k], nums[k] === 0 ? 0 : nums[k], k);
  assert.equal(Y.stringify({ x: NaN }), "x: .nan\n");
  assert.equal(Y.parse("x: .inf").x, Infinity);
});

test("the reader accepts the documented subset", () => {
  const text = [
    "# a comment", "---", "sectionlab: 1  # schema", "title: 'It''s \"quoted\"'", "list:", "  - a: 1", "    b: [1, -2.5, 'x', \"y\"]", "  - 2",
    "same_indent:", "- one", "- two", "nested:", "  deep:", "    deeper: ~", "empty_list: []", "empty_map: {}", "bools: [yes, No, on, OFF, true]",
    "\"quoted key\": 3", "...",
  ].join("\n");
  assert.deepEqual(Y.parse(text), {
    sectionlab: 1, title: `It's "quoted"`, list: [{ a: 1, b: [1, -2.5, "x", "y"] }, 2], same_indent: ["one", "two"],
    nested: { deep: { deeper: null } }, empty_list: [], empty_map: {}, bools: [true, false, true, false, true], "quoted key": 3,
  });
});

test("the reader rejects what the subset leaves out, naming the line", () => {
  const cases = [
    ["a: 1\nb: &x 2", /line 2: anchors/], ["a: *x", /aliases/], ["a: !!str 1", /tags/], ["a: |\n  text", /block scalars/],
    ["a: {b: 1}", /flow mappings/], ["a: 0x1F", /number or date form/], ["a: 1_000", /number or date form/], ["a: 1:30", /number or date form/],
    ["a: 012", /number or date form/], ["a: 2026-09-30", /number or date form/], ["a: 1\na: 2", /line 2: duplicate key/],
    ["a: 1\n---\nb: 2", /one document/], ["a:\n\tb: 1", /tabs/], ["a: [1, [2]]", /nested flow/], ["a: \"open", /unterminated/],
    ["a: b\n  c", /multi-line plain scalars/], ["a: 1\n   b: 2", /line 2: (multi-line plain scalars|unexpected indentation)/], ["a:\n  b: 1\n c: 2", /line 3: unexpected indentation/], ["<<: x", /merge keys/],
  ];
  for (const [text, re] of cases) assert.throws(() => Y.parse(text), (e) => e instanceof Y.YamlError && re.test(e.message), text);
});

test("empty and scalar documents", () => {
  assert.equal(Y.parse(""), null);
  assert.equal(Y.parse("# only a comment\n"), null);
  assert.equal(Y.parse("42"), 42);
  assert.equal(Y.stringify([]), "[]\n");
  assert.equal(Y.stringify({}), "{}\n");
});
