// Turn the failures of a run into manifest findings. Run the suite with
// E2E_RESULTS=<folder>, then: node scripts/record-findings.js <folder>.
// Each failing check of a visual becomes (or replaces) one finding in
// manifest/<slug>.json listing the projects it failed in and the first
// evidence; a finding whose check now passes in every project it was seen
// in is dropped.
// Review the diff: mark a check that fails only sometimes "status": "flaky".
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECTS } from "../lib/browser.js";
import { MANIFEST_DIR, loadManifest } from "../lib/manifest.js";

const dir = process.argv[2];
if (!dir || !existsSync(dir)) throw new Error("usage: node scripts/record-findings.js <E2E_RESULTS folder>");

/** @type {import("../lib/results.js").CheckResult[]} */
const results = readdirSync(dir).filter((n) => n.endsWith(".jsonl"))
  .flatMap((n) => readFileSync(join(dir, n), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));

/** @type {Map<string, Map<string, import("../lib/results.js").CheckResult[]>>} */
const bySlug = new Map();
for (const r of results) {
  const checks = bySlug.get(r.slug) ?? new Map();
  checks.set(r.check, [...(checks.get(r.check) ?? []), r]);
  bySlug.set(r.slug, checks);
}

let written = 0;
for (const [slug, checks] of [...bySlug].sort(([a], [b]) => a.localeCompare(b))) {
  const manifest = loadManifest(slug);
  const projectsRun = new Set([...checks.values()].flat().map((r) => r.project));
  /** @type {import("../lib/manifest.js").Finding[]} */
  const kept = (manifest.findings ?? []).filter((f) => !checks.has(f.check));
  for (const [check, runs] of checks) {
    const previous = (manifest.findings ?? []).find((f) => f.check === check);
    // Projects this run did not cover keep what an earlier run found in them.
    const carried = previous && !previous.projects.includes("*") ? previous.projects.filter((p) => !projectsRun.has(p)) : [];
    let projects = [...new Set([...carried, ...runs.filter((r) => r.outcome === "fail").map((r) => r.project)])].sort();
    if (!projects.length) continue;
    if (PROJECTS.every((p) => projects.includes(p.name))) projects = ["*"];
    // The static server picks a free port per run; keep evidence stable across runs.
    const evidence = (runs.find((r) => r.outcome === "fail")?.evidence ?? previous?.evidence ?? "").replace(/http:\/\/127\.0\.0\.1:\d+/g, "http://127.0.0.1:<port>");
    /** @type {import("../lib/manifest.js").Finding} */
    const finding = { check, projects, status: previous?.status ?? "finding", evidence, owner: previous?.owner ?? runs[0].owner };
    kept.push(finding);
  }
  const before = JSON.stringify(manifest.findings ?? []);
  if (kept.length) manifest.findings = kept.sort((a, b) => a.check.localeCompare(b.check));
  else delete manifest.findings;
  if (JSON.stringify(manifest.findings ?? []) === before) continue;
  writeFileSync(join(MANIFEST_DIR, `${slug}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  written++;
}
console.log(`updated ${written} manifest(s) from ${results.length} results`);
