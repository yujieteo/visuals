// The standalone contract: a visual that claims to work offline opens from file:// in an empty folder holding
// its index.html and its declared media assets (visual.json "assets"), with the browser offline, and its primary
// control still changes what the reader sees. The data file data.json is left out, so its data must be inline,
// and no site file is staged. Optional integrations such as WebMCP are absent
// in the test browser, so passing proves the core does not need them.
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, test } from "node:test";
import { fingerprint, markCandidate, operate } from "../lib/checks.js";
import { openSession, selectedProjects, settle } from "../lib/browser.js";
import { loadManifest } from "../lib/manifest.js";
import { loadTargets } from "../lib/targets.js";

const targets = await loadTargets();
const concurrency = Number(process.env.E2E_CONCURRENCY ?? 4);
const empty = mkdtempSync(join(tmpdir(), "visuals-standalone-"));
after(() => { targets.close(); rmSync(empty, { recursive: true, force: true }); });

for (const project of selectedProjects()) {
  describe(project.name, { concurrency }, () => {
    /** @type {import("playwright").Browser} */
    let browser;
    before(async () => { browser = await project.browserType.launch(project.launch); });
    after(async () => { await browser?.close(); });

    // WebKit refuses file:// navigation in an offline context, so there every http(s) request is refused and counted instead.
    const networkOff = project.browserType.name() !== "webkit";
    for (const artifact of targets.artifacts) {
      const manifest = loadManifest(artifact.slug);
      const offline = manifest.offline ?? artifact.visual.offlineClaim;
      const options = !offline ? { skip: "the visual does not claim to work offline" } : { timeout: 120_000 };
      test(artifact.slug, options, async () => {
        assert.ok(artifact.folder, `${artifact.slug} was not staged: ${artifact.stageError}`);
        const dir = mkdtempSync(join(empty, `${artifact.slug}-`));
        cpSync(artifact.folder, dir, { recursive: true, filter: (src) => !/[\\/]data\.json$/.test(src) });
        assert.ok(existsSync(join(dir, "index.html")) && !existsSync(join(dir, "data.json")));
        const url = pathToFileURL(join(dir, "index.html")).href;
        const session = await openSession(browser, project, url.replace(/[^/]*$/, ""), { offline: networkOff });
        try {
          await session.page.goto(url, { waitUntil: "load", timeout: 30_000 });
          await settle(session.page, manifest.ready);
          if (networkOff) assert.equal(await session.page.evaluate(() => navigator.onLine), false, "the browser is offline");
          assert.ok(await session.page.evaluate(() => document.body.innerText.trim().length > 0 || !!document.querySelector("canvas, svg, img")), "the page renders content");
          const before = await fingerprint(session.page);
          if (manifest.primary) {
            await operate(session.page, manifest.primary.selector, manifest.primary.action, manifest.primary.value);
          } else {
            /** @type {string[]} */
            const tried = [];
            let changed = false;
            for (let round = 0; round < 6 && !changed; round++) {
              const candidate = await markCandidate(session.page, tried).catch(() => null);
              if (!candidate) break;
              tried.push(candidate.name);
              await operate(session.page, "[data-e2e-candidate]", candidate.action, undefined).catch(() => {});
              await session.page.waitForTimeout(400);
              changed = before !== await fingerprint(session.page);
              await session.page.locator("[data-e2e-operated]").evaluateAll((els) => els.forEach((el) => el.removeAttribute("data-e2e-operated"))).catch(() => {});
            }
          }
          await session.page.waitForTimeout(400);
          assert.notEqual(before, await fingerprint(session.page), "the primary control changes the page");
          const o = session.observed;
          assert.deepEqual([...o.pageErrors, ...o.consoleErrors, ...o.unexpectedRequests, ...o.failedRequests], []);
        } finally {
          await session.close();
        }
      });
    }
  });
}
