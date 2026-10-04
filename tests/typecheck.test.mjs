// scripts/typecheck.mjs: which inline scripts the shared extractor copies out for tsc, and where their lines map.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cell, extract, listedFiles, parse, summarize, toPage } from "../scripts/typecheck.mjs";

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

test("a vendored block (data-vendor) is left out: scripts/rules.py checks it is the vendored bundle instead", () => {
  const html = ['<script id="mathjax" data-vendor="mathjax-4.1.3">window.MathJax = {};</script>', '<script id="own">ownCode();</script>'].join("\n");
  assert.deepEqual(extract(html, "index.html").map((f) => f.name), ["own.js"]);
});

const OUTPUT = [
  "viz/b/tests/x.mjs(3,5): error TS2339: Property 'foo' does not exist on type '1'.",
  "scripts/a.mjs(9,1): error TS7006: Parameter 'q' implicitly has an 'any' type.",
  "scripts/a.mjs(2,4): error TS2322: Type 'string' is not assignable to type 'number'.",
  "  The expected type comes from property 'n'.",
  "viz/b/.typecheck/inline/engine.js(4,1): error TS2304: Cannot find name 'zz'.",
  "Found 4 errors.",
].join("\n");

test("tsc --pretty false output parses into errors, continuation lines joined", () => {
  const errors = parse(OUTPUT);
  assert.equal(errors.length, 4);
  assert.deepEqual(errors[2], { file: "scripts/a.mjs", line: 2, col: 4, code: "TS2322", message: "Type 'string' is not assignable to type 'number'. The expected type comes from property 'n'." });
});

test("an error that names no file, or a failed run with no error found, is counted at its project", () => {
  const errors = parse("error TS18003: No inputs were found in config file 'viz/b/tsconfig.json'.\n", "viz/b/tsconfig.json", 2);
  assert.deepEqual(errors, [{ file: "viz/b/tsconfig.json", line: 0, col: 0, code: "TS18003", message: "No inputs were found in config file 'viz/b/tsconfig.json'." }]);
  const [crash] = parse("RangeError: Maximum call stack size exceeded\n", "tsconfig.json", 1);
  assert.deepEqual([crash.file, crash.code], ["tsconfig.json", "exit"]);
  assert.deepEqual(parse("", "tsconfig.json", 0), []);
  for (const list of [errors, [crash]]) assert.match(summarize(list, base).text, /^verdict: fail\n/);
});

test("an error in an extracted inline script moves to its page line; other errors stay", () => {
  const [, , , inline] = parse(OUTPUT);
  const header = () => '// index.html:40, <script id="engine">: extracted for type checking only.';
  assert.deepEqual(toPage(inline, header), { ...inline, file: "viz/b/index.html", line: 42 });
  const [first] = parse(OUTPUT);
  assert.equal(toPage(first, header), first);
});

const base = { projects: 3, total: 3, log: "build/logs/t.log" };

test("the summary counts by code and file, most first, and lists the first errors in place order", () => {
  const { text, code } = summarize(parse(OUTPUT), { ...base, first: 2 });
  assert.equal(code, 1);
  assert.match(text, /^verdict: fail\n/);
  assert.match(text, /\ntotals\{errors,files\}:\n {2}4,3\n/);
  assert.match(text, /\nby_file\[3\]\{file,count\}:\n {2}scripts\/a\.mjs,2\n {2}viz\/b\/\.typecheck\/inline\/engine\.js,1\n/);
  assert.match(text, /\nfirst\[2\]\{file_line,code,message\}:\n {2}"scripts\/a\.mjs:2",TS2322,.*\n {2}"scripts\/a\.mjs:9",TS7006,/);
  assert.match(text, /\nlog: build\/logs\/t\.log\n/);
});

test("a filter shows only its errors, but the verdict counts every error and says how many lie outside", () => {
  const shown = (/** @type {{ file: string }} */ e) => e.file === "viz/b/tests/x.mjs";
  const errors = parse(OUTPUT);
  const filtered = summarize(errors, { ...base, shown, filter: "file=viz/b/tests/x.mjs" });
  assert.equal(filtered.code, 1);
  assert.match(filtered.text, /^verdict: fail\n/);
  assert.match(filtered.text, /\n {2}file=viz\/b\/tests\/x\.mjs,1,4,3,3,0\n/);
  assert.match(filtered.text, /3 error\(s\) lie outside the filter and still fail the verdict/);
  assert.equal(summarize(errors.slice(1), { ...base, shown, filter: "file=viz/b/tests/x.mjs" }).code, 1);
});

test("a filter never hides an error that names no file", () => {
  const errors = [...parse("", "viz/x/tsconfig.json", 1), ...parse("error TS18003: No inputs were found in config file 'viz/y/tsconfig.json'.\n", "viz/y/tsconfig.json", 2)];
  const shown = (/** @type {{ file: string }} */ e) => e.file === "viz/x/index.html";
  const { text, code } = summarize(errors, { ...base, shown, failedRuns: 2, filter: "file=viz/x/index.html" });
  assert.equal(code, 1);
  assert.match(text, /^verdict: fail\n/);
  assert.match(text, /\ntotals\{errors,files\}:\n {2}2,2\n/);
  assert.match(text, /\n {2}"viz\/x\/tsconfig\.json:0",exit,/);
});

test("a tsc run that exited non-zero fails the verdict even with no error parsed and a filter that shows nothing", () => {
  const { text, code } = summarize([], { ...base, shown: () => false, failedRuns: 1, filter: "file=scripts/a.mjs" });
  assert.equal(code, 1);
  assert.match(text, /^verdict: fail\n/);
  assert.match(text, /\n {2}file=scripts\/a\.mjs,0,0,3,3,1\n/);
  assert.match(text, /tsc exited non-zero 1 time\(s\) with no error it could parse/);
});

test("named projects give a verdict on them, and the verdict line says how many were not checked", () => {
  const partial = summarize([], { ...base, projects: 1 });
  assert.equal(partial.code, 0);
  assert.match(partial.text, /^verdict: pass \(on 1 of 3 projects; 2 not checked\)\n/);
  assert.match(partial.text, /2 project\(s\) were not checked/);
  assert.equal(summarize([], base).code, 0);
  assert.match(summarize([], base).text, /^verdict: pass\n/);
});

test("a TOON value with a separator, a colon or space at its ends is quoted", () => {
  assert.deepEqual(["TS2339", "a:1", "x, y", " a", ""].map(cell), ["TS2339", '"a:1"', '"x, y"', '" a"', '""']);
});

const script = fileURLToPath(new URL("../scripts/typecheck.mjs", import.meta.url));
const installed = existsSync(new URL("../node_modules/.bin/tsc", import.meta.url));

test("a missing path, an unknown ref, an unknown visual or option is a usage error, exit 2", { skip: !installed && "npm ci not run" }, () => {
  /** @type {[string[], string][]} */
  const cases = [
    [["--file", "no/such/file.mjs"], "--file no/such/file.mjs does not exist"],
    [["--since", "no-such-ref-anywhere"], "--since no-such-ref-anywhere is not a known ref"],
    [["no-such-visual"], "no viz/<slug>/tsconfig.json for: no-such-visual"],
    [["--bogus"], "unknown option --bogus"],
    [["--first", "x"], "--first needs a whole number"],
    [["airbnb", "--file", "README.md"], "--file README.md is in none of the checked tsc projects, so the filter matches nothing"],
    [["--scoped"], "unknown option --scoped"],
    [["work-lanyards", "--file", "viz/work-lanyards/data.json"], "--file viz/work-lanyards/data.json is in none of the checked tsc projects"],
  ];
  const clean = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" }).stdout === "";
  if (clean) cases.push([["--since", "HEAD"], "--since HEAD: no file changed since"]);
  for (const [args, message] of cases) {
    const run = spawnSync(process.execPath, [script, "--summary", ...args], { encoding: "utf8" });
    assert.equal(run.status, 2, args.join(" "));
    assert.ok(run.stdout.startsWith(`verdict: error\nerror: ${message}`), run.stdout);
  }
});

test("--file finds a page's inline scripts when the repository is reached through a symlink", { skip: !installed && "npm ci not run" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "typecheck-"));
  const link = join(dir, "repo");
  symlinkSync(fileURLToPath(new URL("../", import.meta.url)), link);
  try {
    const args = ["scripts/typecheck.mjs", "--summary", "work-lanyards", "--file", "viz/work-lanyards/index.html"];
    const run = spawnSync(process.execPath, args, { cwd: link, env: { ...process.env, PWD: link }, encoding: "utf8" });
    assert.notEqual(run.status, 2, run.stdout);
    assert.match(run.stdout, /^verdict: (pass|fail)\b/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--listFilesOnly output gives the real paths of its files and drops the errors tsc writes beside them", () => {
  const stdout = ["a.js(1,9): error TS1109: Expression expected.", "error TS18003: No inputs were found in config file 'tsconfig.json'.", `  ${script}`, ""].join("\n");
  assert.deepEqual(listedFiles(stdout), [realpathSync(script)]);
});

test("a filtered summary fails, exit 1, when tsc fails: on an error outside the filter, and on a tsc run with no file", { skip: !installed && "npm ci not run" }, () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "typecheck-fail-")));
  const at = (/** @type {string} */ path) => join(dir, path);
  try {
    mkdirSync(at("scripts"));
    mkdirSync(at("viz/broken"), { recursive: true });
    symlinkSync(fileURLToPath(new URL("../node_modules", import.meta.url)), at("node_modules"));
    copyFileSync(script, at("scripts/typecheck.mjs"));
    writeFileSync(at("tsconfig.json"), JSON.stringify({ compilerOptions: { allowJs: true, checkJs: true, noEmit: true, strict: true }, include: ["scripts/ok.mjs", "scripts/bad.mjs"] }));
    writeFileSync(at("scripts/ok.mjs"), "export const ok = 1;\n");
    writeFileSync(at("scripts/bad.mjs"), "export const bad = 1;\nbad.nothing();\n");
    // A visual whose tsconfig.json includes nothing: tsc exits non-zero with TS18003 and names no file.
    writeFileSync(at("viz/broken/visual.json"), "{}");
    writeFileSync(at("viz/broken/index.html"), "<!doctype html>");
    writeFileSync(at("viz/broken/tsconfig.json"), JSON.stringify({ compilerOptions: { allowJs: true, noEmit: true }, include: ["none/*.mjs"] }));
    const git = (/** @type {string[]} */ ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.org", "-c", "commit.gpgsign=false", ...args], { cwd: dir });
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    writeFileSync(at("scripts/ok.mjs"), "export const ok = 2;\n");
    for (const args of [["--file", "scripts/ok.mjs"], ["--since", "HEAD"], ["broken", "--file", "viz/broken/tsconfig.json"]]) {
      const run = spawnSync(process.execPath, [at("scripts/typecheck.mjs"), "--summary", ...args], { cwd: dir, encoding: "utf8" });
      assert.equal(run.status, 1, `${args.join(" ")}\n${run.stdout}`);
      assert.match(run.stdout, /^verdict: fail\b/, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
