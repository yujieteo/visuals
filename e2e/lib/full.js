// The fuller section-28 checks for one visual: URL state, Back and Forward,
// keyboard, Cmd/Ctrl+K, Reset, JSON round trip, Markdown and beamdswitch
// export, dark mode and reduced motion. A visual's file under tests/full/
// supplies one function per check that drives that visual through its
// stable, user-visible interface; this module runs them across the browser
// matrix with the same manifest findings, skips and results as the baseline.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { after, before, describe, test } from "node:test";
import { openSession, selectedProjects, settle } from "./browser.js";
import { FULL_CHECKS, checkOptions, loadManifest } from "./manifest.js";
import { startResults } from "./results.js";
import { loadTargets } from "./targets.js";

/**
 * @typedef {object} Opened
 * @property {import("playwright").BrowserContext} context
 * @property {import("playwright").Page} page
 * @property {import("./browser.js").Observed} observed
 * @property {() => Promise<void>} close
 */

/**
 * @typedef {object} FullContext
 * @property {import("./browser.js").Project} project
 * @property {(suffix?: string, extra?: import("playwright").BrowserContextOptions) => Promise<Opened>} open
 *   open the artifact with a URL suffix (a fragment or query) in a fresh context
 */

/** @typedef {(ctx: FullContext) => Promise<void>} FullCheck */

/**
 * Run the given checks for one visual in every selected project. A check left
 * out must be named in the manifest's skip map with the reason it does not
 * apply, so every visual answers for all of FULL_CHECKS.
 * @param {string} slug
 * @param {Partial<Record<typeof FULL_CHECKS[number], FullCheck>>} checks
 */
export async function fullSuite(slug, checks) {
  const recordResult = startResults(`full-${slug}`, selectedProjects());
  const only = (process.env.E2E_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (only.length && !only.includes(slug) || process.env.E2E_ARTIFACT && (process.env.E2E_SLUG ?? "") !== slug) {
    test(`${slug} full checks`, { skip: "not selected by E2E_ONLY or E2E_ARTIFACT" }, () => {});
    return;
  }
  const targets = await loadTargets({ only: [slug] });
  after(() => targets.close());
  const artifact = targets.artifacts.find((a) => a.slug === slug);
  if (!artifact || artifact.stageError && !artifact.remoteUrl) {
    test(`${slug} full checks`, () => assert.fail(`cannot stage ${slug}: ${artifact?.stageError ?? "not in the catalogue"}`));
    return;
  }
  const manifest = loadManifest(slug);
  for (const check of FULL_CHECKS) {
    if (!checks[check] && !manifest.skip?.[check]) throw new Error(`${slug}: write the ${check} check, or skip it in manifest/${slug}.json with a reason`);
  }
  const allowed = targets.origin(artifact);
  const downloadsPath = join(process.env.E2E_TMP ?? join(tmpdir(), "technical-e2e"), "downloads");

  for (const project of selectedProjects()) {
    describe(`${project.name} ${slug}`, () => {
      /** @type {import("playwright").Browser} */
      let browser;
      before(async () => { browser = await project.browserType.launch({ ...project.launch, downloadsPath }); });
      after(async () => { await browser?.close(); });

      /** @type {FullContext} */
      const ctx = {
        project,
        open: async (suffix = "", extra = {}) => {
          const session = await openSession(browser, project, allowed, { acceptDownloads: true, ...extra });
          await session.page.goto(targets.httpUrl(artifact) + suffix, { waitUntil: "load", timeout: 30_000 });
          await settle(session.page, manifest.ready);
          return session;
        },
      };

      for (const check of FULL_CHECKS) {
        const run = checks[check];
        const options = run ? checkOptions(manifest, check, project.name) : { skip: manifest.skip?.[check] };
        test(check, { ...options, timeout: 120_000 }, async () => {
          const started = Date.now();
          try {
            await /** @type {FullCheck} */ (run)(ctx);
            recordResult({ slug, check, project: project.name, outcome: "pass", evidence: "", owner: artifact.visual.owner, ms: Date.now() - started });
          } catch (error) {
            const evidence = String(error instanceof Error ? error.message : error).split("\n").slice(0, 3).join(" ").slice(0, 400);
            recordResult({ slug, check, project: project.name, outcome: "fail", evidence, owner: artifact.visual.owner, ms: Date.now() - started });
            throw error;
          }
        });
      }
    });
  }
}

/**
 * Click something that saves a file and return the file's name and text.
 * @param {import("playwright").Page} page
 * @param {() => Promise<unknown>} trigger
 * @returns {Promise<{ name: string, text: string }>}
 */
export async function saved(page, trigger) {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 10_000 }), trigger()]);
  return { name: download.suggestedFilename(), text: await readFile(await download.path(), "utf8") };
}

/**
 * Assert that text is a beamdswitch deck in the site's report format: YAML
 * front matter naming a narration voice, several `##` slides, and narration.
 * @param {string} text
 */
export function assertBeamdswitchDeck(text) {
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(front, "a deck opens with YAML front matter");
  assert.match(front[1], /^voice:\s*\S+/m, "the front matter names a narration voice");
  assert.ok((text.match(/^## /gm) ?? []).length >= 2, "a deck has several ## slides");
  assert.match(text, /^::: narration$/m, "a deck carries narration");
}

/**
 * The page as painted under the light and the dark preference: the mean
 * luminance of the viewport must be lower in dark. It reads pixels rather
 * than computed styles, which some engines report as transparent for a page
 * whose colours come from custom properties.
 * @param {FullContext} ctx
 * @param {string} [suffix]
 */
export async function assertDarkMode(ctx, suffix = "") {
  /** @param {"light" | "dark"} colorScheme */
  const luminance = async (colorScheme) => {
    const s = await ctx.open(suffix, { colorScheme });
    try {
      const png = await s.page.screenshot({ type: "png" });
      const blank = await s.context.newPage();
      try {
        return await blank.evaluate(async (bytes) => {
          const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
          const canvas = new OffscreenCanvas(64, 64);
          const g = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext("2d"));
          g.drawImage(bitmap, 0, 0, 64, 64);
          const data = g.getImageData(0, 0, 64, 64).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          return Math.round(sum / (data.length / 4));
        }, [...png]);
      } finally {
        await blank.close();
      }
    } finally {
      await s.close();
    }
  };
  const light = await luminance("light");
  const dark = await luminance("dark");
  assert.ok(dark < light - 20, `the dark preference paints no darker than light (mean luminance ${dark} vs ${light} of 255)`);
}

/**
 * Under prefers-reduced-motion: reduce, after `act` nothing animates: no CSS
 * transition or animation is longer than 10 ms and no Web Animation is running.
 * @param {FullContext} ctx
 * @param {(page: import("playwright").Page) => Promise<void>} act something that would otherwise move
 * @param {string} [suffix]
 */
export async function assertReducedMotion(ctx, act, suffix = "") {
  const s = await ctx.open(suffix, { reducedMotion: "reduce" });
  try {
    await act(s.page);
    const moving = await s.page.evaluate(() => {
      const seconds = (/** @type {string} */ v) => Math.max(...v.split(",").map((d) => parseFloat(d) * (d.trim().endsWith("ms") ? 0.001 : 1)));
      /** @type {string[]} */
      const out = [];
      for (const el of document.querySelectorAll("*")) {
        const style = getComputedStyle(el);
        const transition = style.transitionProperty !== "none" ? seconds(style.transitionDuration) : 0;
        const animation = style.animationName !== "none" ? seconds(style.animationDuration) : 0;
        if (transition > 0.01 || animation > 0.01) out.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} ${transition > 0.01 ? `transition ${style.transitionDuration}` : `animation ${style.animationDuration}`}`);
      }
      const running = document.getAnimations().filter((a) => a.playState === "running").length;
      if (running) out.push(`${running} running Web Animation(s)`);
      return out;
    });
    assert.deepEqual(moving.slice(0, 5), [], `still moves under reduced motion: ${moving.slice(0, 5).join("; ")}`);
  } finally {
    await s.close();
  }
}

/**
 * Assert that a session saw no uncaught errors and requested nothing outside the artifact.
 * @param {Opened} s
 */
export function assertClean(s) {
  assert.deepEqual(s.observed.pageErrors, [], "no uncaught errors");
  assert.deepEqual(s.observed.unexpectedRequests, [], "no requests outside the artifact");
}
