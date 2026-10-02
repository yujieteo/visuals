// Write FINDINGS.md from the findings recorded in manifest/*.json, or with
// --check fail when FINDINGS.md is stale. The manifests are the source of
// truth; FINDINGS.md is the readable list for the owners who fix them.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllManifests } from "../lib/manifest.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "FINDINGS.md");

/** @param {string} s */
const cell = (s) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export function render() {
  /** @type {string[]} */
  const rows = [];
  const visuals = new Set();
  let flaky = 0;
  for (const [slug, manifest] of loadAllManifests()) {
    for (const f of manifest.findings ?? []) {
      visuals.add(slug);
      if (f.status === "flaky") flaky++;
      const owner = f.owner ? f.owner.replace("https://github.com/", "") : "";
      rows.push(`| ${slug} | ${f.check} | ${f.projects.join(", ")} | ${f.status} | ${cell(f.evidence)} | ${owner} |`);
    }
  }
  return [
    "# Findings",
    "",
    "Failures the suite has found in the visuals, generated from the `findings` in `manifest/*.json` by `npm run findings`; do not edit by hand. Each runs as a todo test, so it is reported on every run without failing CI. The owner repository fixes the visual; when a fix lands there and reaches the site, delete the finding from the manifest (or rerun `scripts/record-findings.js` on a fresh run) and regenerate this file.",
    "",
    `${rows.length} finding${rows.length === 1 ? "" : "s"} across ${visuals.size} visual${visuals.size === 1 ? "" : "s"}${flaky ? `, ${flaky} marked flaky` : ""}.`,
    "",
    "| Visual | Check | Browsers | Status | Evidence | Owner |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = render();
  if (process.argv.includes("--check")) {
    if (readFileSync(OUT, "utf8") !== text) {
      console.error("FINDINGS.md is stale: run npm run findings");
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, text);
  }
}
