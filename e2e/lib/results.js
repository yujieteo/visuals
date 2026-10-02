// Optional machine-readable results: with E2E_RESULTS set to a folder, every
// check appends one JSON line to <folder>/<project>.<run>.jsonl. Each test
// entry point names its run and empties its own files when it starts, so a
// rerun into the same folder replaces that run's results without touching
// the other entry points' or shards'. Scripts turn the failures into
// manifest findings and FINDINGS.md.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
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
 * @returns {(result: CheckResult) => void}
 */
export function startResults(run, projects) {
  const dir = process.env.E2E_RESULTS;
  if (!dir) return () => {};
  const file = (/** @type {string} */ project) => join(dir, `${project}.${run.replace(/[^\w-]/g, "_")}.jsonl`);
  mkdirSync(dir, { recursive: true });
  for (const project of projects) writeFileSync(file(project.name), "");
  return (result) => appendFileSync(file(result.project), `${JSON.stringify(result)}\n`);
}
