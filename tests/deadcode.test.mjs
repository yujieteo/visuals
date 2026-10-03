// scripts/deadcode.mjs: which tsc diagnostics count as dead or duplicated code, where they are in the page, and
// a run over a small visual with the pinned tsc (skipped until npm ci has installed it).
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { deadcode, findings, pageLine } from "../scripts/deadcode.mjs";

const REPO = new URL("../", import.meta.url);

test("only the unused, unreachable and duplicate diagnostics are findings, never type errors", () => {
  const output = [
    "inline/engine.js(4,9): error TS6133: 'k' is declared but its value is never read.",
    "inline/engine.js(9,3): error TS7027: Unreachable code detected.",
    "inline/ui.js(2,7): error TS2451: Cannot redeclare block-scoped variable 'total'.",
    "../../tests/page.test.mjs(3,7): error TS6133: 'require' is declared but its value is never read.",
    "inline/ui.js(5,1): error TS2304: Cannot find name 'document'.",
  ].join("\n");
  assert.deepEqual(findings(output).map((f) => [f.file, f.line, f.kind]), [
    ["inline/engine.js", 4, "unused"],
    ["inline/engine.js", 9, "unreachable"],
    ["inline/ui.js", 2, "duplicate"],
  ]);
});

test("a finding's line in an extracted block maps back to the page", () => {
  assert.equal(pageLine('// index.html:40, <script id="engine">: extracted for type checking only.\nconst a = 1;\n', 2), 40);
});

const tsc = existsSync(new URL("node_modules/.bin/tsc", REPO));

test("a visual's unused local and twice-declared constant fail until its allow list names them", { skip: !tsc && "run npm ci first" }, () => {
  const root = mkdtempSync(join(tmpdir(), "deadcode-"));
  try {
    const folder = join(root, "viz", "alpha");
    mkdirSync(join(folder, "tests"), { recursive: true });
    copyFileSync(new URL("tsconfig.base.json", REPO), join(root, "tsconfig.base.json"));
    symlinkSync(new URL("node_modules", REPO), join(root, "node_modules"));
    writeFileSync(join(folder, "index.html"), [
      "<script>const total = (xs) => { const unused = 1; return xs.length; };</script>",
      "<script>const total = (xs) => xs.length + 1;</script>",
    ].join("\n"));
    writeFileSync(join(folder, "tests", "page.test.mjs"), 'import { readFileSync } from "node:fs";\nexport const n = 1;\n');
    const allow = (/** @type {string[]} */ entries) => writeFileSync(join(folder, "visual.json"), JSON.stringify({ allow: { deadcode: entries } }));
    const rootUrl = pathToFileURL(`${root}/`);
    allow([]);
    assert.equal(deadcode("alpha", rootUrl), 4);
    allow([
      "index.html: 'unused' is declared but its value is never read.",
      "index.html: Cannot redeclare block-scoped variable 'total'.",
      "tests/page.test.mjs: 'readFileSync' is declared but its value is never read.",
    ]);
    assert.equal(deadcode("alpha", rootUrl), 0);
    allow(["index.html: 'gone' is declared but its value is never read."]);
    assert.equal(deadcode("alpha", rootUrl), 5, "the four findings, and the allow entry that matches none");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
