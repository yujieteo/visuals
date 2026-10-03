// Find dead and duplicated JavaScript in visuals, with the pinned tsc and no network: unused locals and
// imports, unreachable code, unused labels, and a let, const or class declared twice in one scope (in a page,
// the inline scripts share one global scope, as the browser runs them, where the second throws). tsc accepts a
// function declared twice in JavaScript, so review still looks for that.
// For each viz/<slug>/: copy the inline scripts of index.html (less the byte-identical beamdswitch template,
// vendored blocks (data-vendor) and blocks holding only a build placeholder) into viz/<slug>/.typecheck/deadcode/ (ignored by Git) beside
// a generated tsconfig.json that also includes the folder's own tests/*.test.mjs, tests/*.mjs and
// tests/*.cjs, run tsc with noUnusedLocals and allowUnreachableCode: false, and report only the diagnostics
// in CODES. Type errors are scripts/typecheck.mjs's, for the visuals that opt in with a tsconfig.json.
// A finding the visual keeps on purpose is listed in visual.json "allow": {"deadcode": ["<file>: <message>"]}, where
// <file> is the page or test file and <message> tsc's text, such as "index.html: 'unused' is declared but
// its value is never read.". An entry names no line, so an edit elsewhere does not break it, and allows one
// finding: list it twice to allow two. An entry that matches no finding fails, so the list cannot go stale.
// Usage: node scripts/deadcode.mjs SLUG...   (after npm ci; scripts/check.py runs it per visual)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extract } from "./typecheck.mjs";

const ROOT = new URL("../", import.meta.url);

/** tsc diagnostics that mean dead or duplicated code, never a type error. */
export const CODES = new Map([
  [6133, "unused"], // 'x' is declared but its value is never read.
  [6192, "unused"], // All imports in import declaration are unused.
  [6196, "unused"], // 'x' is declared but never used.
  [6198, "unused"], // All destructured elements are unused.
  [6199, "unused"], // All variables are unused.
  [7027, "unreachable"], // Unreachable code detected.
  [7028, "unused"], // Unused label.
  [2300, "duplicate"], // Duplicate identifier 'x'.
  [2451, "duplicate"], // Cannot redeclare block-scoped variable 'x'.
]);

const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/;

/**
 * The diagnostics in tsc's output that CODES names, as { file, line, code, kind, message }.
 * @param {string} output
 */
export function findings(output) {
  const out = [];
  for (const line of output.split("\n")) {
    const m = DIAGNOSTIC.exec(line.trim());
    if (!m || !CODES.has(Number(m[4]))) continue;
    // tsc reads require("x") in JavaScript as an import, so the `require` that createRequire made looks unread.
    if (m[5].startsWith("'require' is declared")) continue;
    out.push({ file: m[1], line: Number(m[2]), code: Number(m[4]), kind: CODES.get(Number(m[4])), message: m[5] });
  }
  return out;
}

/**
 * Where an extracted file's line is in the page: its header names the page line of its <script> tag.
 * @param {string} text the extracted file
 * @param {number} line its 1-based line
 */
export function pageLine(text, line) {
  const start = Number(/^\/\/ [^:]+:(\d+),/.exec(text)?.[1] ?? 0);
  return start + line - 2;
}

/**
 * The folder's own test modules, relative to it: tests/*.test.mjs, tests/*.mjs and tests/*.cjs, not fixtures.
 * @param {URL} folder
 */
function testFiles(folder) {
  const tests = new URL("tests/", folder);
  if (!existsSync(tests)) return [];
  return readdirSync(tests).filter((name) => /\.(?:mjs|cjs)$/.test(name)).sort().map((name) => `tests/${name}`);
}

/**
 * Run the dead-code pass on one visual; return the number of unexpected findings and stale allowances.
 * @param {string} slug
 * @param {URL} [root] the repository root, holding viz/, tsconfig.base.json and node_modules/
 */
export function deadcode(slug, root = ROOT) {
  const folder = new URL(`viz/${slug}/`, root);
  const meta = JSON.parse(readFileSync(new URL("visual.json", folder), "utf8"));
  /** @type {string[]} */
  const allowed = meta.allow?.deadcode ?? [];
  const template = existsSync(new URL("beamdswitch.js", folder)) ? [readFileSync(new URL("beamdswitch.js", folder), "utf8").trim()] : [];
  const blocks = extract(readFileSync(new URL("index.html", folder), "utf8"), "index.html", [], template);
  const out = new URL(".typecheck/deadcode/", folder);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(new URL("inline/", out), { recursive: true });
  for (const { name, text } of blocks) writeFileSync(new URL(`inline/${name}`, out), text);
  const tests = testFiles(folder);
  const config = {
    extends: fileURLToPath(new URL("tsconfig.base.json", root)),
    compilerOptions: {
      strict: false,
      noImplicitAny: false,
      noUnusedLocals: true,
      allowUnreachableCode: false,
      allowUnusedLabels: false,
      // Only the language: a page's globals then never collide with the DOM's (a page's own `status` is not
      // window.status), and missing names, which are type errors, are not reported here.
      lib: ["ES2023"],
      types: [],
      module: "esnext",
    },
    include: ["inline/*.js", ...tests.map((file) => `../../${file}`)],
  };
  writeFileSync(new URL("tsconfig.json", out), `${JSON.stringify(config, null, 2)}\n`);
  const tsc = fileURLToPath(new URL("node_modules/.bin/tsc", root));
  const run = spawnSync(tsc, ["-p", fileURLToPath(new URL("tsconfig.json", out)), "--pretty", "false"], { encoding: "utf8", cwd: fileURLToPath(out) });
  if (run.error) throw run.error;
  // tsc names a file relative to the project, or absolutely when the temporary folder sits behind a symlink.
  const outDir = realpathSync(fileURLToPath(out)), folderDir = realpathSync(fileURLToPath(folder));
  const texts = new Map(blocks.map(({ name, text }) => [resolve(outDir, "inline", name), text]));
  const unused = [...allowed];
  let problems = 0;
  for (const f of findings(run.stdout)) {
    const named = resolve(outDir, f.file), file = existsSync(named) ? realpathSync(named) : named;
    const inline = texts.get(file);
    const name = inline ? "index.html" : relative(folderDir, file);
    const line = inline ? pageLine(inline, f.line) : f.line;
    const entry = unused.indexOf(`${name}: ${f.message}`);
    if (entry !== -1) {
      unused.splice(entry, 1);
      continue;
    }
    problems++;
    console.error(`viz/${slug}/${name}:${line}: ${f.kind}: ${f.message} (TS${f.code})`);
  }
  for (const key of unused) {
    problems++;
    console.error(`viz/${slug}/visual.json: allow.deadcode lists "${key}", which tsc no longer reports; remove it`);
  }
  console.log(`viz/${slug}: ${blocks.length} inline script(s), ${tests.length} test module(s), ${problems} dead-code problem(s)`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const slugs = process.argv.slice(2);
  if (!slugs.length) throw new Error("usage: node scripts/deadcode.mjs SLUG...");
  process.exitCode = slugs.map((slug) => deadcode(slug)).some((count) => count !== 0) ? 1 : 0;
}
