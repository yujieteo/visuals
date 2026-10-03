// The fuller section-28 checks for one visual: URL state, Back and Forward,
// keyboard, Cmd/Ctrl+K, Reset, JSON round trip, Markdown and beamdswitch
// export, dark mode and reduced motion. A visual's file under tests/full/
// supplies one function per check that drives that visual through its
// stable, user-visible interface; this module runs them across the browser
// matrix with the same manifest findings, skips and results as the baseline.
// It also exports the helpers those functions share, so each lives once here
// rather than copied into every visual's test.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";
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
 * Click a control that saves a file or copies text, and return that text. The
 * clipboard is a stand-in, so no browser asks for permission.
 * @param {import("playwright").Page} page
 * @param {import("playwright").Locator} control
 */
export async function output(page, control) {
  await page.evaluate(() => {
    const w = /** @type {Window & { __copied?: string }} */ (window);
    delete w.__copied;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (/** @type {string} */ t) => { w.__copied = t; } } });
  });
  const download = page.waitForEvent("download", { timeout: 5_000 });
  const copied = page.waitForFunction(() => /** @type {Window & { __copied?: string }} */ (window).__copied, undefined, { timeout: 5_000 });
  await control.click();
  const first = await Promise.any([download, copied]);
  download.catch(() => {});
  copied.catch(() => {});
  return "path" in first ? readFile(await first.path(), "utf8") : String(await first.jsonValue());
}

/**
 * The control that saves, exports, downloads or copies the view as JSON.
 * @param {import("playwright").Page} page
 */
export const exportJson = (page) => page.getByRole("button", { name: /^(save|export|download|copy)\b.*\bjson\b/i });

/**
 * Move focus off the focused element, so page-level keys reach the page.
 * @param {import("playwright").Page} page
 */
export const blur = (page) => page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());

/**
 * Wait until the URL's fragment is `hash`.
 * @param {import("playwright").Page} page
 * @param {string} hash
 */
export const at = (page, hash) => page.waitForFunction((h) => location.hash === h, hash);

/**
 * Read `state` until it deep-equals `expected` or five seconds pass, then assert it does.
 * @param {() => Promise<unknown>} state
 * @param {unknown} expected
 * @param {string} message
 */
export async function settlesTo(state, expected, message) {
  let actual = await state();
  for (const end = Date.now() + 5_000; !isDeepStrictEqual(actual, expected) && Date.now() < end;) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    actual = await state();
  }
  assert.deepEqual(actual, expected, message);
}

/**
 * Open the page at `suffix`, run `body`, check it stayed clean, and close it.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @param {(s: Opened) => Promise<void>} body
 * @param {string} [suffix]
 */
export async function using(open, body, suffix = "") {
  const s = await open(suffix);
  try {
    await body(s);
    assertClean(s);
  } finally {
    await s.close();
  }
}

/**
 * Reset, exercised: change the view, press the control named Reset, and the view's state must be its
 * initial state again. Re-choosing an example does not count.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @param {(page: import("playwright").Page) => Promise<void>} change
 * @param {(page: import("playwright").Page) => Promise<unknown>} state
 */
export async function resetsToDefaults(open, change, state) {
  const s = await open();
  try {
    const initial = await state(s.page);
    await change(s.page);
    assert.notDeepEqual(await state(s.page), initial, "the change is visible before Reset");
    await s.page.getByRole("button", { name: /^reset\b/i }).first().click({ timeout: 5_000 });
    await settlesTo(() => state(s.page), initial, "Reset returns the view to its initial state");
    assertClean(s);
  } finally {
    await s.close();
  }
}

/**
 * Section 14's JSON round trip, exercised: change the view, export it with a control that names JSON,
 * import the file into a fresh page through a JSON file input, and compare the view's state.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @param {(page: import("playwright").Page) => Promise<void>} change
 * @param {(page: import("playwright").Page) => Promise<unknown>} state
 */
export async function jsonRoundTrip(open, change, state) {
  const s = await open();
  try {
    await change(s.page);
    const before = await state(s.page);
    const file = await saved(s.page, () => s.page.getByRole("button", { name: /\bjson\b/i }).first().click({ timeout: 5_000 }));
    JSON.parse(file.text);
    const fresh = await open();
    try {
      assert.notDeepEqual(await state(fresh.page), before, "the change is visible before the import");
      await fresh.page.locator('input[type="file"][accept*="json"]').first().setInputFiles({ name: file.name, mimeType: "application/json", buffer: Buffer.from(file.text) }, { timeout: 5_000 });
      await settlesTo(() => state(fresh.page), before, "importing the exported JSON restores the view");
      assertClean(fresh);
    } finally {
      await fresh.close();
    }
    assertClean(s);
  } finally {
    await s.close();
  }
}

/**
 * Section 14's Markdown export of the view's own state, exercised: change the view, then a control that
 * names Markdown (never the beamdswitch deck's controls, which `deck` excludes) must save or copy
 * Markdown that carries `marker`, a sign of the changed state that the default view does not show.
 * @param {(suffix?: string) => Promise<Opened>} open
 * @param {(page: import("playwright").Page) => Promise<void>} change
 * @param {string} marker
 * @param {string} deck a selector for the deck controls, which do not count
 */
export async function markdownExport(open, change, marker, deck) {
  const s = await open();
  try {
    assert.ok(!(await s.page.innerText("body")).includes(marker), `the default view does not show ${marker}`);
    await change(s.page);
    await s.page.evaluate(() => {
      const w = /** @type {any} */ (window), clip = navigator.clipboard;
      if (clip) clip.writeText = async (text) => { w.__copiedMarkdown = text; };
    });
    const control = s.page.getByRole("button", { name: /\bmarkdown\b/i }).and(s.page.locator(`:not(${deck})`)).first();
    const download = s.page.waitForEvent("download", { timeout: 5_000 }).then(async (d) => readFile(/** @type {string} */ (await d.path()), "utf8"), () => null);
    await control.click({ timeout: 5_000 });
    const copied = await s.page.waitForFunction(() => /** @type {any} */ (window).__copiedMarkdown, null, { timeout: 5_000 }).then((h) => h.jsonValue(), () => null);
    const text = (await download) ?? copied;
    assert.ok(typeof text === "string" && text.length > 0, "the Markdown control saves or copies Markdown");
    assert.ok(text.includes(marker), `the Markdown reflects the current view (${marker})`);
    assertClean(s);
  } finally {
    await s.close();
  }
}

/**
 * The Markdown the page exports of its own state, saved as a file or copied:
 * the first button or link named for Markdown or .md that is not the
 * beamdswitch deck.
 * @param {import("playwright").Page} page
 * @returns {Promise<string>}
 */
export async function exportedMarkdown(page) {
  const name = /^(?!.*(deck|beamdswitch)).*(markdown|\.md\b)/i;
  const control = page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();
  assert.ok(await control.count() > 0, "the page offers a Markdown export of its state, separate from the beamdswitch deck");
  await page.evaluate(() => {
    if (navigator.clipboard) navigator.clipboard.writeText = async (text) => { /** @type {Window & { e2eCopied?: string }} */ (window).e2eCopied = text; };
  });
  const download = page.waitForEvent("download", { timeout: 10_000 }).then(async (d) => readFile(await d.path(), "utf8"));
  const copied = page.waitForFunction(() => /** @type {Window & { e2eCopied?: string }} */ (window).e2eCopied, null, { timeout: 10_000 })
    .then((h) => /** @type {Promise<string>} */ (h.jsonValue()));
  await control.click();
  const text = await Promise.any([download, copied]).catch(() => assert.fail("the Markdown export neither saved a file nor copied text"));
  assert.match(text, /^#{1,3} \S/m, "the export is Markdown with a heading");
  return text;
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
