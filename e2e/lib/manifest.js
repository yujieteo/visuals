// Per-visual manifests: manifest/<slug>.json says how to drive one visual and
// which of its checks are known to fail. One file per visual, so workers who
// each own a batch of visuals never edit the same file or the shared code.
//
// {
//   "primary": { "selector": "#prior", "action": "range", "value": "0.3" },
//   "ready": "#selftest-badge.pass",
//   "offline": true,
//   "findings": [
//     { "check": "console-errors", "projects": ["webkit-desktop"], "status": "finding",
//       "evidence": "…", "owner": "https://github.com/yujieteo/…" }
//   ]
// }
//
// Every field is optional; a visual with no manifest gets the heuristics.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The checks every visual gets. */
export const BASELINE_CHECKS = /** @type {const} */ ([
  "opens", "runtime-errors", "console-errors", "network", "file-url", "overflow-320", "primary-control",
]);

/** The fuller section-28 checks, written per visual under tests/full/. */
export const FULL_CHECKS = /** @type {const} */ ([
  "url-state", "back-forward", "keyboard", "command-palette", "reset", "json-round-trip",
  "markdown-export", "beamdswitch-export", "dark-mode", "reduced-motion",
]);

/**
 * @typedef {object} PrimaryControl
 * @property {string} selector a stable selector (role, id or data-* attribute) for the control
 * @property {"click" | "fill" | "select" | "range" | "check" | "hover"} action how to operate it
 * @property {string} [value] the value to fill, select or set
 */

/**
 * @typedef {object} Finding
 * @property {string} check one of BASELINE_CHECKS or FULL_CHECKS
 * @property {string[]} projects browser projects it fails in, or ["*"]
 * @property {"finding" | "flaky"} status a reproducible failure, or one that comes and goes
 * @property {string} evidence what the check saw
 * @property {string} [owner] the repository that should fix it, when not the visual's owner
 */

/**
 * @typedef {object} Manifest
 * @property {PrimaryControl} [primary] the control that changes state; heuristics pick one otherwise
 * @property {string} [ready] a selector that appears once the page has booted
 * @property {boolean} [offline] overrides whether the visual claims to work offline and from file://
 * @property {Record<string, string>} [skip] check to the reason it does not apply to this visual
 * @property {Finding[]} [findings] known failures, reported but not failing CI
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_DIR = join(ROOT, "manifest");

/**
 * @param {string} slug
 * @returns {Manifest}
 */
export function loadManifest(slug) {
  const path = join(MANIFEST_DIR, `${slug}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

/** @returns {Map<string, Manifest>} */
export function loadAllManifests() {
  const out = new Map();
  for (const name of readdirSync(MANIFEST_DIR).filter((n) => n.endsWith(".json")).sort()) {
    out.set(name.replace(/\.json$/, ""), JSON.parse(readFileSync(join(MANIFEST_DIR, name), "utf8")));
  }
  return out;
}

/**
 * The node:test options for one check of one visual in one project: a known
 * finding or a flaky check runs as a todo, so it is reported without failing
 * the run; a check that does not apply is skipped.
 * @param {Manifest} manifest
 * @param {string} check
 * @param {string} project
 * @returns {{ todo?: string, skip?: string }}
 */
export function checkOptions(manifest, check, project) {
  const skip = manifest.skip?.[check];
  if (skip) return { skip };
  const finding = (manifest.findings ?? []).find((f) => f.check === check && (f.projects.includes("*") || f.projects.includes(project)));
  if (!finding) return {};
  return { todo: `${finding.status === "flaky" ? "flaky" : "known finding"}: ${finding.evidence}` };
}
