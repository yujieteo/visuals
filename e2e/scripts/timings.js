// Summarise per-test timings from E2E_RESULTS folders as Markdown: the
// wall time each visual took per project, slowest first, and the slowest
// single checks. CI appends it to the job summary.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** @type {import("../lib/results.js").CheckResult[]} */
const results = [];
for (const dir of process.argv.slice(2).filter((d) => existsSync(d))) {
  const files = statSync(dir).isDirectory() ? readdirSync(dir).filter((n) => n.endsWith(".jsonl")).map((n) => join(dir, n)) : [dir];
  for (const file of files) results.push(...readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
}
/** @type {Map<string, number>} */
const perVisual = new Map();
for (const r of results) perVisual.set(`${r.slug}\t${r.project}`, (perVisual.get(`${r.slug}\t${r.project}`) ?? 0) + r.ms);
const total = [...perVisual.values()].reduce((a, b) => a + b, 0);
const s = (/** @type {number} */ ms) => (ms / 1000).toFixed(1);
console.log(`### Timings\n\n${results.length} checks, ${perVisual.size} visual runs, ${s(total)} s of check time.\n`);
console.log("| Visual | Project | Seconds |\n| --- | --- | ---: |");
for (const [key, ms] of [...perVisual].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  const [slug, project] = key.split("\t");
  console.log(`| ${slug} | ${project} | ${s(ms)} |`);
}
console.log("\n| Slowest checks | Project | Seconds |\n| --- | --- | ---: |");
for (const r of [...results].sort((a, b) => b.ms - a.ms).slice(0, 10)) console.log(`| ${r.slug} ${r.check} | ${r.project} | ${s(r.ms)} |`);
