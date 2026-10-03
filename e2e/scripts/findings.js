// Print the findings recorded in every visual's manifest as one Markdown list, generated and never
// committed: the manifests, one per visual, are the source of truth. CI writes it to the job summary;
// `node scripts/findings.js > findings.md` writes it locally.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllManifests } from "../lib/manifest.js";

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
    "Failures the browser checks have found in the visuals, generated from the `findings` in each visual's `e2e/manifest.json`. Each runs as a todo test, so it is reported on every run without failing CI. When a fix lands in the visual's folder, delete the finding from its manifest (or rerun `scripts/record-findings.js` on a fresh run).",
    "",
    `${rows.length} finding${rows.length === 1 ? "" : "s"} across ${visuals.size} visual${visuals.size === 1 ? "" : "s"}${flaky ? `, ${flaky} marked flaky` : ""}.`,
    "",
    "| Visual | Check | Browsers | Status | Evidence | Owner |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(render());
