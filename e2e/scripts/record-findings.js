// Turn the failures of a run into manifest findings. Run the suite with
// E2E_RESULTS=<folder>, then: node scripts/record-findings.js <folder> [repository root].
// Each failing check of a visual becomes (or replaces) one finding in its
// manifest (viz/<slug>/e2e/manifest.json, or e2e/site/<slug>/) listing the projects it failed in and the
// first evidence. A project counts as retested for a check only when the
// check passed or failed there; a skip keeps what an earlier run found, and a
// finding whose check now passes in every project it was seen in is dropped.
// Review the diff: mark a check that fails only sometimes "status": "flaky".
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PROJECTS } from "../lib/browser.js";
import { REPO, loadManifest, manifestPath } from "../lib/manifest.js";

const dir = process.argv[2];
if (!dir || !existsSync(dir)) throw new Error("usage: node scripts/record-findings.js <E2E_RESULTS folder> [repository root]");
const repo = process.argv[3] ? resolve(process.argv[3]) : REPO;

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
  const manifest = loadManifest(slug, repo);
  /** @type {import("../lib/manifest.js").Finding[]} */
  const kept = (manifest.findings ?? []).filter((f) => !checks.has(f.check));
  for (const [check, runs] of checks) {
    const previous = (manifest.findings ?? []).find((f) => f.check === check);
    // Projects this run did not retest keep what an earlier run found in them.
    const retested = new Set(runs.filter((r) => r.outcome !== "skip").map((r) => r.project));
    const previousProjects = previous?.projects.includes("*") ? PROJECTS.map((p) => p.name) : previous?.projects ?? [];
    const carried = previousProjects.filter((p) => !retested.has(p));
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
  const path = manifestPath(slug, repo);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  written++;
}
console.log(`updated ${written} manifest(s) from ${results.length} results`);
