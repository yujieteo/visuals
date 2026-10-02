// The baseline for every visual the site publishes, in every selected browser
// project. Each check is its own test, so a known finding in the visual's
// manifest runs as a todo: reported, but not failing CI.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { runBaseline } from "../lib/baseline.js";
import { selectedProjects } from "../lib/browser.js";
import { BASELINE_CHECKS, checkOptions, loadManifest } from "../lib/manifest.js";
import { recordResult } from "../lib/results.js";
import { loadTargets } from "../lib/targets.js";

const targets = await loadTargets();
const concurrency = Number(process.env.E2E_CONCURRENCY ?? 4);
after(() => targets.close());

for (const project of selectedProjects()) {
  describe(project.name, { concurrency }, () => {
    /** @type {import("playwright").Browser} */
    let browser;
    before(async () => { browser = await project.browserType.launch(); });
    after(async () => { await browser?.close(); });

    for (const artifact of targets.artifacts) {
      test(artifact.slug, { timeout: 180_000 }, async (t) => {
        const manifest = loadManifest(artifact.slug);
        const outcomes = await runBaseline(browser, project, artifact, targets, manifest);
        for (const check of BASELINE_CHECKS) {
          const { outcome, evidence, ms } = outcomes[check];
          recordResult({ slug: artifact.slug, check, project: project.name, outcome, evidence, owner: artifact.visual.owner, ms });
          const options = outcome === "skip" ? { skip: evidence } : checkOptions(manifest, check, project.name);
          await t.test(check, options, () => {
            assert.notEqual(outcome, "fail", `${artifact.slug} ${check} in ${project.name}: ${evidence}`);
          });
        }
      });
    }
  });
}
