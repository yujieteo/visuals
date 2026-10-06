// The final gate of step 7: spec.md section 13, the acceptance table, row by row (acceptance.json). Runs every test
// file the table names once, the Node checks and the browser checks (in each project of E2E_PROJECTS, all five by
// default), and passes a row only when each piece of its evidence matched at least one test that passed, and none
// that failed; browser evidence must pass in every project it names, or in every project that ran.
//
//   node tools/acceptance.mjs [--node-only] [--out FILE]    exit 0 when every row passes
//
// The browser checks need e2e/'s Playwright and its browsers (e2e/README.md); --node-only leaves them out, and the
// rows that need them then fail as not run.
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, relative } from "node:path";
import { run } from "node:test";
import { fileURLToPath } from "node:url";

const folder = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const nodeOnly = args.includes("--node-only");
const table = JSON.parse(readFileSync(join(folder, "acceptance.json"), "utf8"));
const PROJECT = /^(chromium|firefox|webkit)-(desktop|mobile)\b/;

/**
 * Run test files and return every test's result with its file and, for browser checks, the project its suite names.
 * Children report before their suite, so each level's results wait for the suite above them.
 * @param {string[]} files @param {number} concurrency
 */
async function results(files, concurrency) {
  /** @type {{ file: string, name: string, ok: boolean, skipped: boolean, project: string | null }[]} */
  const done = [];
  /** @type {any[][]} */
  const waiting = [];
  const stream = run({ files, concurrency, timeout: 4 * 3600_000 });
  stream.on("test:stdout", (d) => process.stdout.write(d.message));
  stream.on("test:stderr", (d) => process.stderr.write(d.message));
  for await (const event of stream) {
    if (event.type !== "test:pass" && event.type !== "test:fail") continue;
    const d = event.data;
    const children = waiting[d.nesting + 1] ?? [];
    waiting[d.nesting + 1] = [];
    const project = PROJECT.exec(d.name)?.[0] ?? null;
    for (const c of children) if (!c.project) c.project = project;
    // A test registered by a module the file imports (e2e/step7.mjs, the harness's lib/full.js) belongs to the file run.
    const file = files.length === 1 ? files[0] : d.file ?? "";
    const item = { file: relative(folder, file), name: d.name, ok: event.type === "test:pass", skipped: !!(d.skip || d.todo), project: null, suite: d.details?.type === "suite" };
    (waiting[d.nesting] ??= []).push(item, ...children);
  }
  for (const level of waiting) for (const r of level ?? []) if (!r.suite) done.push(r);
  return done;
}

const files = [...new Set(table.rows.flatMap((r) => r.tests.map((t) => t.file)))];
const nodeFiles = files.filter((f) => f.startsWith("tests/"));
const browserFiles = files.filter((f) => f.startsWith("e2e/"));
const projects = (process.env.E2E_PROJECTS || "chromium-desktop,firefox-desktop,webkit-desktop,chromium-mobile,webkit-mobile").split(",").map((s) => s.trim());
const started = Date.now();
const all = [...await results(nodeFiles.map((f) => join(folder, f)), Math.max(2, Math.floor(availableParallelism() / 2)))];
if (!nodeOnly && browserFiles.length) {
  process.env.E2E_ONLY = "data-workbench";
  process.env.E2E_PROJECTS = projects.join(",");
  all.push(...await results(browserFiles.map((f) => join(folder, f)), 1));
}

const rows = table.rows.map((row) => {
  const evidence = row.tests.map((t) => {
    const re = new RegExp(t.name);
    const matched = all.filter((r) => r.file === t.file && re.test(r.name) && !r.skipped);
    const failed = matched.filter((r) => !r.ok);
    const need = t.file.startsWith("e2e/") ? (t.projects ?? projects) : [null];
    const missing = need.filter((p) => !matched.some((r) => r.ok && (p === null || r.project === p)));
    const ok = matched.length > 0 && !failed.length && !missing.length;
    return { file: t.file, name: t.name, ok, passed: matched.filter((r) => r.ok).length, failed: failed.map((r) => `${r.project ? `${r.project}: ` : ""}${r.name}`),
      missing: missing.map((p) => p ?? "no test of this name ran") };
  });
  return { area: row.area, evidence: row.evidence, ok: evidence.every((e) => e.ok), tests: evidence };
});

const report = { checked: new Date().toISOString(), node: process.version, projects: nodeOnly ? [] : projects, minutes: +((Date.now() - started) / 60000).toFixed(1),
  passed: rows.filter((r) => r.ok).length, rows };
console.log(`\nSection 13 acceptance: ${report.passed} of ${rows.length} rows pass (${report.minutes} min; browser projects: ${report.projects.join(", ") || "none"})`);
for (const r of rows) {
  console.log(`${r.ok ? "pass" : "FAIL"}  ${r.area}: ${r.tests.reduce((a, t) => a + t.passed, 0)} passing tests`);
  for (const t of r.tests.filter((x) => !x.ok)) console.log(`      ${t.file} /${t.name}/: ${[...t.failed.map((f) => `failed ${f}`), ...t.missing.map((m) => `missing ${m}`)].join("; ")}`);
}
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.passed === rows.length ? 0 : 1;
