// The portable file writer: user text cannot end a block or start a comment, and only base64 and runtime
// names reach the data blocks.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const P = require("../src/portable.js");

const HOSTILE = "</script><script>alert(1)</script><!-- </SCRIPT > <!--> ]]>    ${x} `y` \\u003c";
const input = (over = {}) => ({
  csp: "default-src 'none'",
  headParts: ["<title data-pynb-part>T</title>"],
  bodyParts: ['<script data-pynb-part>var a = 1;</script>'],
  document: { name: HOSTILE, notebook: { cells: [{ source: HOSTILE }] }, files: [{ path: `${HOSTILE}.csv`, bytes: 3, sha256: "0" }] },
  data: [Buffer.from("a,b").toString("base64")],
  assets: [{ path: "runtime/pyodide.asm.wasm", base64: "AGFzbQ==" }],
  ...over,
});

test("hostile notebook text stays inside its JSON block and reads back the same", () => {
  const value = input();
  const html = P.write(value).join("");
  // The HTML tokenizer ends a script block at the first "</script" whatever follows; take what it would take.
  const start = html.indexOf('<script type="application/json" id="pynb-document">') + '<script type="application/json" id="pynb-document">'.length;
  const end = html.toLowerCase().indexOf("</script", start);
  assert.deepEqual(JSON.parse(html.slice(start, end)), value.document);
  const block = html.slice(start, end);
  assert.doesNotMatch(block, /<(!--|\/?script)/i);
  assert.equal(html.match(/<script\b/gi).length, 4, "the document, one data, one part and one asset block, and no other");
  assert.ok(!html.includes(HOSTILE), "the hostile text is nowhere in raw form");
  assert.match(html, /^<!doctype html>\n<html lang="en" data-pynb-form="portable">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'">/);
});

test("data blocks are named by index, and the writer refuses text that is not base64 or not a runtime name", () => {
  const html = P.write(input()).join("");
  assert.match(html, /<script type="application\/octet-stream" data-pynb-data="0">YSxi<\/script>/);
  assert.throws(() => P.write(input({ data: ["YSxi</script>"] })), /is not base64/);
  assert.throws(() => P.write(input({ data: [] })), /1 data files are listed and 0 are given/);
  assert.throws(() => P.write(input({ assets: [{ path: "runtime/../x", base64: "" }] })), /not a runtime file name/);
  assert.throws(() => P.write(input({ assets: [{ path: 'runtime/a"><script>', base64: "" }] })), /not a runtime file name/);
  assert.throws(() => P.write(input({ assets: [{ path: "runtime/a", base64: "AA== <" }] })), /is not base64/);
  assert.throws(() => P.write(input({ csp: "a\"><script>" })), /needs escaping/);
});

test("base64 of bytes matches Node's, on both the native and the fallback path, across the chunk size", () => {
  for (const size of [0, 1, 2, 3, 0x8000 - 1, 0x8000, 0x8000 * 3 + 7]) {
    const bytes = new Uint8Array(randomBytes(size));
    const expected = Buffer.from(bytes).toString("base64");
    assert.equal(P.toBase64(bytes), expected, `native ${size}`);
    const plain = Object.assign(new Uint8Array(bytes), { toBase64: undefined });
    assert.equal(P.toBase64(plain), expected, `fallback ${size}`);
    assert.deepEqual(P.fromBase64(expected), bytes, `back ${size}`);
  }
});
