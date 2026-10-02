// Optional machine-readable results: with E2E_RESULTS set to a folder, every
// check appends one JSON line to <folder>/<project>.jsonl. Scripts turn the
// failures into manifest findings and FINDINGS.md.
import { appendFileSync, mkdirSync } from "node:fs";
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

/** @param {CheckResult} result */
export function recordResult(result) {
  const dir = process.env.E2E_RESULTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${result.project}.jsonl`), `${JSON.stringify(result)}\n`);
}
