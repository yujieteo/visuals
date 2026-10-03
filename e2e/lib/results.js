// Optional machine-readable results: with E2E_RESULTS set to a folder, every
// check appends one JSON line to <folder>/<project>.<run>[.<shard>].jsonl.
// Each test entry point names its run and empties its own files when it
// starts, so a rerun into the same folder replaces that run's results without
// touching the other entry points'. A sharded run empties only its own shard's
// file; an unsharded run empties every shard's file of the run. Scripts turn
// the failures into manifest findings and FINDINGS.md.
import { appendFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {object} CheckResult
 * @property {string} slug
 * @property {string} check
 * @property {string} project
 * @property {"pass" | "fail" | "skip"} outcome
 * @property {string} evidence
 * @property {string} owner
 * @property {number} ms how long the check's work took
 */

/**
 * Start a run's results: empty its file for each project, and return the
 * function that records one check.
 * @param {string} run e.g. "baseline" or "full-snake-lemma"
 * @param {{ name: string }[]} projects
 * @param {string} [shard] E2E_SHARD's i/n, when the run is one shard
 * @returns {(result: CheckResult) => void}
 */
export function startResults(run, projects, shard = "") {
  const dir = process.env.E2E_RESULTS;
  if (!dir) return () => {};
  const prefix = (/** @type {string} */ project) => `${project}.${run.replace(/[^\w-]/g, "_")}.`;
  const file = (/** @type {string} */ project) => join(dir, `${prefix(project)}${shard ? `${shard.replace(/\D+/g, "of")}.` : ""}jsonl`);
  mkdirSync(dir, { recursive: true });
  for (const project of projects) {
    if (!shard) for (const name of readdirSync(dir).filter((n) => n.startsWith(prefix(project.name)) && n.endsWith(".jsonl"))) rmSync(join(dir, name));
    writeFileSync(file(project.name), "");
  }
  return (result) => appendFileSync(file(result.project), `${JSON.stringify(result)}\n`);
}
