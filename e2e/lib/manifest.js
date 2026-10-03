// Per-visual manifests: viz/<slug>/e2e/manifest.json (e2e/site/<slug>/manifest.json
// for a visual the site keeps) says how to drive one visual and which of its checks
// are known to fail. One file per visual, in its own folder, so workers who each
// own a visual never edit the same file or the shared code.
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

/** The fuller section-28 checks, written per visual in its e2e/full.test.js. */
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

/** The repository root: e2e/ holds the harness, viz/ the visuals. */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Where a visual's manifest lives: its own folder in viz/, or e2e/site/ for a visual the site keeps.
 * @param {string} slug
 * @param {string} [repo]
 * @returns {string}
 */
export function manifestPath(slug, repo = REPO) {
  const own = join(repo, "viz", slug, "e2e", "manifest.json");
  return existsSync(join(repo, "viz", slug)) ? own : join(repo, "e2e", "site", slug, "manifest.json");
}

/**
 * @param {string} slug
 * @param {string} [repo]
 * @returns {Manifest}
 */
export function loadManifest(slug, repo = REPO) {
  const path = manifestPath(slug, repo);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

/**
 * Every manifest, by slug.
 * @param {string} [repo]
 * @returns {Map<string, Manifest>}
 */
export function loadAllManifests(repo = REPO) {
  const out = new Map();
  const slugs = [
    ...readdirSync(join(repo, "viz")).filter((slug) => existsSync(join(repo, "viz", slug, "e2e", "manifest.json"))),
    ...(existsSync(join(repo, "e2e", "site")) ? readdirSync(join(repo, "e2e", "site")) : []),
  ];
  for (const slug of slugs.sort()) {
    const path = manifestPath(slug, repo);
    if (existsSync(path)) out.set(slug, JSON.parse(readFileSync(path, "utf8")));
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
