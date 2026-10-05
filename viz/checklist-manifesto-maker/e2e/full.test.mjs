// Checklist Manifesto Maker: the fuller browser checks (§28), then this visual's own workflows. The page keeps its
// semantic state in localStorage (the library) and only a view or an example in the URL, so the checks read the
// saved library for state and drive the page through its stable data-key controls, roles and names.
//
//   url-state, back-forward   a view and a bundled example in the fragment, never content or progress
//   keyboard                  the whole workflow from the keyboard: draft, edit, review, Run, reload and confirm
//   command-palette, reset    Cmd/Ctrl+K; Reset Run, Delete checklist and Delete all saved data, each confirmed
//   markdown-export           Export and Copy Markdown, lossless re-import with progress, refusal of an edited file,
//                             inert unsafe content, the 1 MiB limit and the print view
//   beamdswitch-export        the deck in the site's report format and its lossless re-import
//   workflows                 touch at phone size with 44 px targets, 320 px layout, offline, file://, an iframe and a
//                             sandboxed iframe without storage
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import { openSession, selectedProjects, settle } from "../../../e2e/lib/browser.js";
import { assertBeamdswitchDeck, assertClean, assertDarkMode, assertReducedMotion, at, fullSuite, output, saved, settlesTo, using } from "../../../e2e/lib/full.js";
import { loadManifest } from "../../../e2e/lib/manifest.js";
import { loadTargets } from "../../../e2e/lib/targets.js";

const SLUG = "checklist-manifesto-maker";
const KEY = "checklist-manifesto-maker";
const UNSAFE = readFileSync(new URL("../tests/fixtures/unsafe.md", import.meta.url), "utf8");

/** @typedef {import("playwright").Page} Page */
/** @typedef {import("playwright").Frame} Frame */

/**
 * The saved library: the page's semantic state on this device.
 * @param {Page} page
 * @returns {Promise<any>}
 */
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), KEY);

/**
 * The current checklist entry of the saved library.
 * @param {Page} page
 * @returns {Promise<any>}
 */
async function current(page) {
  const lib = await stored(page);
  return lib?.checklists.find((/** @type {any} */ e) => e.checklist.id === lib.active) ?? null;
}

/**
 * The control with a data-key.
 * @param {Page | Frame} page
 * @param {string} key
 */
const control = (page, key) => page.locator(`[data-key="${key}"]`);

/**
 * Click a control, then the confirmation dialog's action.
 * @param {Page} page
 * @param {string} key
 */
async function confirmed(page, key) {
  await control(page, key).click();
  await page.locator("dialog#confirm[open]").waitFor();
  await page.locator("#confirm-ok").click();
}

/**
 * The view's heading text.
 * @param {Page | Frame} page
 */
const title = (page) => page.locator("#view-title").innerText();

/**
 * Review the draft and start a Run, with clicks.
 * @param {Page} page
 */
async function reviewAndStart(page) {
  await page.locator('nav [data-view="review"]').click();
  await control(page, "review:mark").click();
  await page.locator('[data-key="review:start"]:not([disabled])').waitFor();
  await control(page, "review:start").click();
  await page.locator('[data-view-panel="run"]').waitFor();
}

/**
 * Wait until a toggle shows its pressed state.
 * @param {Page | Frame} page
 * @param {string} key
 */
const pressed = (page, key) => page.locator(`[data-key="${key}"][aria-pressed="true"]`).waitFor();

/**
 * The results of the current Run, as item id to value.
 * @param {Page} page
 * @returns {Promise<Record<string, string>>}
 */
async function results(page) {
  const e = await current(page);
  return Object.fromEntries(Object.entries(e?.run?.results ?? {}).map(([k, v]) => [k, /** @type {any} */ (v).value]));
}

/**
 * The embedded state of an export.
 * @param {string} text
 */
const payload = (text) => JSON.parse(text.slice(text.indexOf("<!-- checklist-manifesto-maker:state") + 37, text.lastIndexOf("\n-->")));

/**
 * Put a file into one of the page's file inputs.
 * @param {Page} page
 * @param {string} id
 * @param {string} name
 * @param {string | Buffer} body
 */
async function upload(page, id, name, body) {
  await page.locator('nav [data-view="files"]').click();
  await page.locator(`#${id}`).setInputFiles({ name, mimeType: "text/markdown", buffer: Buffer.isBuffer(body) ? body : Buffer.from(body) });
}

await fullSuite(SLUG, {
  "url-state": (ctx) => using(ctx.open, async (s) => {
    assert.equal(await title(s.page), "Exercises", "#view=exercises opens the Exercises view");
    const example = await ctx.open("#example=static-page");
    try {
      assert.equal(await title(example.page), "Start");
      assert.match(await example.page.locator('[data-example-card="static-page"]').getAttribute("class") ?? "", /chosen/, "the fragment identifies the bundled example");
      assert.equal(await stored(example.page), null, "a fragment never creates or changes saved work");
      await control(example.page, "example:static-page").click();
      await reviewAndStart(example.page);
      await control(example.page, "run:s1:done").click();
      await pressed(example.page, "run:s1:done");
      assert.equal(await example.page.evaluate(() => location.hash), "#view=run", "content and progress stay out of the URL");
      assertClean(example);
    } finally {
      await example.close();
    }
    const stale = await ctx.open("#view=nonsense&step=4");
    try {
      assert.equal(await title(stale.page), "Start", "an unknown view falls back to Start");
    } finally {
      await stale.close();
    }
  }, "#view=exercises"),

  "back-forward": (ctx) => using(ctx.open, async (s) => {
    await s.page.locator('nav [data-view="exercises"]').click();
    await at(s.page, "#view=exercises");
    await s.page.locator('nav [data-view="files"]').click();
    await at(s.page, "#view=files");
    await s.page.goBack();
    await settlesTo(() => title(s.page), "Exercises", "Back restores the earlier view");
    await s.page.goBack();
    await settlesTo(() => title(s.page), "Start", "Back again restores Start");
    await s.page.goForward();
    await settlesTo(() => title(s.page), "Exercises", "Forward restores the later view");
  }),

  keyboard: (ctx) => using(ctx.open, async (s) => {
    const { page } = s;
    /** @param {string} selector @param {string} [key] */
    const press = async (selector, key = "Enter") => {
      await page.locator(selector).focus();
      await page.keyboard.press(key);
    };
    await press('[data-example="static-page"]');
    await settlesTo(() => title(page), "Edit", "Enter on an example opens its draft in Edit");
    const id = (await current(page)).checklist.id;
    await page.locator(`[data-key="f:${id}:title"]`).focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Publish my page");
    await page.keyboard.press("Tab");
    await settlesTo(async () => [(await current(page)).checklist.title, (await current(page)).checklist.revision], ["Publish my page", 2], "a committed edit makes revision 2");
    await press('nav [data-view="review"]');
    await press('[data-key="review:mark"]');
    await page.locator('[data-key="review:start"]:not([disabled])').waitFor();
    await press('[data-key="review:start"]');
    await page.locator('[data-view-panel="run"]').waitFor();
    for (const item of ["s1", "s2", "s3"]) {
      await press(`[data-key="run:${item}:done"]`, " ");
      await pressed(page, `run:${item}:done`);
    }
    await press('[data-key="run:c1:passed"]');
    await pressed(page, "run:c1:passed");
    await press('[data-key="run:c2:not-applicable"]');
    await page.locator('[data-key="run:c2:reason"]').focus();
    await page.keyboard.type("The site is new.");
    await press('[data-key="run:c2:na-save"]');
    await pressed(page, "run:c2:not-applicable");
    await press('[data-key="run:s4:done"]', " ");
    await pressed(page, "run:s4:done");
    await press('[data-key="run:advance"]');
    await settlesTo(async () => (await current(page)).run.current, "p2", "the open gate continues to the next pause point");
    await press('[data-key="run:s5:done"]', " ");
    await pressed(page, "run:s5:done");
    await page.reload();
    await settle(page, 'html[data-ready="true"]');
    assert.equal(await title(page), "Run: Publish my page", "a reload restores the view");
    assert.match(await page.locator(".exception.hold").innerText(), /Restored from this device\. Confirm that you are at After publication/);
    assert.equal(await page.locator('[data-key="run:s6:done"]').isDisabled(), true, "nothing can be recorded before the pause point is confirmed");
    assert.equal((await results(page)).s5, "done", "progress survives the reload without advancing");
    await press('[data-key="run:confirm"]');
    await page.locator(".exception.hold").waitFor({ state: "detached" });
    await press('[data-key="run:reset"]');
    await page.locator("dialog#confirm[open]").waitFor();
    await page.keyboard.press("Escape");
    await page.locator("dialog#confirm[open]").waitFor({ state: "detached" });
    assert.equal((await results(page)).s5, "done", "Escape dismisses the confirmation and keeps the Run");
  }),

  "command-palette": (ctx) => using(ctx.open, async (s) => {
    await s.page.keyboard.press("ControlOrMeta+k");
    assert.ok(await s.page.locator("dialog#palette[open]").isVisible(), "Cmd/Ctrl+K opens the command palette");
    await s.page.keyboard.type("Use example: Publish");
    await s.page.keyboard.press("Enter");
    await settlesTo(() => title(s.page), "Edit", "choosing an example in the palette opens its draft");
    assert.equal((await current(s.page)).checklist.title, "Publish a static page");
    assert.equal(await s.page.locator("dialog#palette[open]").count(), 0, "running a command closes the palette");
    await s.page.keyboard.press("ControlOrMeta+k");
    await s.page.keyboard.type("Edit item: Run the publish");
    await s.page.keyboard.press("Enter");
    await settlesTo(() => s.page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.closest("[data-id]")?.getAttribute("data-id") ?? ""), "s4", "an item found in the palette is focused in Edit");
  }),

  reset: (ctx) => using(ctx.open, async (s) => {
    const { page } = s;
    await control(page, "example:static-page").click();
    await reviewAndStart(page);
    await control(page, "run:s1:done").click();
    await pressed(page, "run:s1:done");
    await control(page, "run:reset").click();
    await page.locator("#confirm-cancel").click();
    assert.equal((await results(page)).s1, "done", "Cancel keeps the Run");
    await confirmed(page, "run:reset");
    await settlesTo(async () => [(await current(page)).run.id, (await results(page)).s1], ["run2", "pending"], "Reset Run starts the same revision with fresh results");
    await page.locator('nav [data-view="start"]').click();
    await control(page, "example:day-trip").click();
    assert.equal((await stored(page)).checklists.length, 2, "an example adds a draft and keeps saved work");
    await page.locator('nav [data-view="files"]').click();
    await confirmed(page, "delete:one");
    await settlesTo(async () => (await stored(page)).checklists.map((/** @type {any} */ e) => e.checklist.title), ["Publish a static page"], "Delete checklist removes only the current one");
    await page.locator('nav [data-view="files"]').click();
    await confirmed(page, "delete:all");
    await settlesTo(() => stored(page), null, "Delete all saved data leaves nothing saved");
    assert.equal(await page.evaluate(() => localStorage.getItem("theme")), null, "the site's theme key is not touched");
  }),

  "markdown-export": (ctx) => using(ctx.open, async (s) => {
    const { page } = s;
    await control(page, "example:static-page").click();
    await reviewAndStart(page);
    await control(page, "run:s1:done").click();
    await pressed(page, "run:s1:done");
    await control(page, "run:c1:failed").click();
    await page.locator('[data-testid="exception"]').waitFor();
    await page.locator('nav [data-view="files"]').click();
    const file = await saved(page, () => control(page, "export:md").click());
    assert.equal(file.name, "publish-a-static-page.md");
    assert.match(file.text, /^# Publish a static page$/m);
    assert.match(file.text, /^- \[ \] \*\*Critical check:\*\* Confirm the intended page and destination\.$/m);
    assert.equal(await output(page, control(page, "export:copy")), file.text, "Copy Markdown copies the same text");
    const before = payload(file.text);
    const fresh = await ctx.open();
    try {
      await control(fresh.page, "example:day-trip").click();
      const kept = await stored(fresh.page);
      const edited = file.text.replace("- [ ] Open the page in the local preview.", "- [ ] Open the page in a browser.");
      await upload(fresh.page, "import-md", "edited.md", edited);
      assert.match(await fresh.page.locator('[data-testid="import-error"]').innerText(), /disagree at line \d+/);
      assert.deepEqual((await stored(fresh.page)).checklists, kept.checklists, "a refused import changes nothing");
      await control(fresh.page, "import:as-plain").click();
      assert.match(await fresh.page.locator('[data-testid="import-preview"]').innerText(), /plain Markdown as a new draft/);
      await control(fresh.page, "import:cancel").click();
      await upload(fresh.page, "import-md", "big.md", Buffer.alloc(1048577, 120));
      assert.match(await fresh.page.locator('[data-testid="import-error"]').innerText(), /the limit is 1 MiB/);
      await upload(fresh.page, "import-md", file.name, file.text);
      assert.match(await fresh.page.locator('[data-testid="import-preview"]').innerText(), /restored exactly[\s\S]*run1 on revision 1, in progress/);
      assert.equal(await control(fresh.page, "import:copy").isDisabled(), true, "restore or a fresh Run must be chosen");
      await control(fresh.page, "import:restore").check();
      await control(fresh.page, "import:copy").click();
      await fresh.page.locator('[data-view-panel="run"]').waitFor();
      assert.match(await fresh.page.locator(".exception.hold").innerText(), /Restored from an imported file/);
      const back = await current(fresh.page);
      assert.equal((await stored(fresh.page)).checklists.length, 2, "Create copy keeps the existing checklist");
      assert.deepEqual([back.checklist.title, back.checklist.revision, back.run.results, back.run.current], [before.checklist.title, before.checklist.revision, before.run.results, before.run.current], "the import restores the same state");
      assertClean(fresh);
    } finally {
      await fresh.close();
    }
    const unsafe = await ctx.open();
    try {
      /** @type {string[]} */
      const dialogs = [];
      unsafe.page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
      await upload(unsafe.page, "import-md", "unsafe.md", UNSAFE);
      await control(unsafe.page, "import:copy").click();
      await settlesTo(() => title(unsafe.page), "Edit", "the unsafe checklist opens in Edit");
      assert.equal(await unsafe.page.locator(`[data-key$=":title"]`).first().inputValue(), "Trip <script>alert(1)</script> --> <!-- x -->");
      assert.equal(await unsafe.page.locator("#app script, #app img, #print-view script, #print-view img").count(), 0, "imported markup is never rendered");
      assert.match(await unsafe.page.locator("#preview-sheet").innerText(), /Pack \[water\]\(javascript:alert\(1\)\) and <img src=x onerror=alert\(1\)>/);
      assert.equal(await unsafe.page.locator('#app a[href^="javascript"]').count(), 0, "an imported link is text, not a link");
      assert.deepEqual(dialogs, [], "no imported script ran");
      await unsafe.page.emulateMedia({ media: "print" });
      assert.equal(await unsafe.page.locator("#app").isVisible(), false, "print hides the controls");
      assert.match(await unsafe.page.locator("#print-view").innerText(), /Pause point 1: Before departure[\s\S]*Passed ☐ Failed ☐ Unknown ☐[\s\S]*Recovery routes/, "print shows the complete checklist");
      assertClean(unsafe);
    } finally {
      await unsafe.close();
    }
  }),

  "beamdswitch-export": (ctx) => using(ctx.open, async (s) => {
    await control(s.page, "example:day-trip").click();
    await s.page.locator('nav [data-view="files"]').click();
    const file = await saved(s.page, () => control(s.page, "export:deck").click());
    assert.equal(file.name, "pack-a-bag-for-a-day-trip.beamdswitch.md");
    assertBeamdswitchDeck(file.text);
    assert.match(file.text, /^## Pause point 1: Before departure \(Do–Confirm\)$/m);
    assert.match(file.text, /^::: key$/m);
    const fresh = await ctx.open();
    try {
      await upload(fresh.page, "import-deck", file.name, file.text);
      assert.match(await fresh.page.locator('[data-testid="import-preview"]').innerText(), /Beam MD Switch file from this tool, restored exactly/);
      await control(fresh.page, "import:copy").click();
      await settlesTo(() => title(fresh.page), "Edit", "the imported deck opens as a draft");
      assert.deepEqual((await current(fresh.page)).checklist, payload(file.text).checklist, "the deck restores the same checklist");
      assertClean(fresh);
    } finally {
      await fresh.close();
    }
  }),

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await control(page, "example:static-page").click();
    await page.locator('nav [data-view="review"]').click();
  }),
});

/* This visual's own workflows: touch, 320 px, offline, file:// and frames, in every selected browser project. */
const only = (process.env.E2E_ONLY ?? "").split(",").map((x) => x.trim()).filter(Boolean);
if ((only.length && !only.includes(SLUG)) || (process.env.E2E_ARTIFACT && process.env.E2E_SLUG !== SLUG)) {
  test(`${SLUG} workflows`, { skip: "not selected by E2E_ONLY or E2E_ARTIFACT" }, () => {});
} else {
  const targets = await loadTargets({ only: [SLUG] });
  after(() => targets.close());
  const artifact = targets.artifacts.find((a) => a.slug === SLUG);
  if (!artifact) throw new Error(`cannot stage ${SLUG}`);
  const manifest = loadManifest(SLUG);
  const http = targets.httpUrl(artifact);
  for (const project of selectedProjects()) {
    describe(`${project.name} ${SLUG} workflows`, () => {
      /** @type {import("playwright").Browser} */
      let browser;
      before(async () => { browser = await project.browserType.launch(project.launch); });
      after(async () => { await browser?.close(); });
      /** @param {import("playwright").BrowserContextOptions} [extra] */
      const open = async (extra = {}) => {
        const s = await openSession(browser, project, targets.origin(artifact), extra);
        await s.page.goto(http, { waitUntil: "load" });
        await settle(s.page, manifest.ready);
        return s;
      };
      const touch = Boolean(project.context.hasTouch);

      test("touch: a whole Run by tap, a reported stop with no recovery route ends the Run; targets are 44 px", { timeout: 120_000 }, async () => {
        const s = await open();
        const { page } = s;
        try {
          /** @param {string} key */
          const tap = (key) => (touch ? control(page, key).tap() : control(page, key).click());
          await tap("example:day-trip");
          await tap("nav:review");
          await tap("review:mark");
          await tap("review:start");
          await page.locator('[data-view-panel="run"]').waitFor();
          for (const item of ["s1", "s2", "s3", "s5"]) {
            await tap(`run:${item}:done`);
            await pressed(page, `run:${item}:done`);
          }
          for (const item of ["c1", "c2"]) {
            await tap(`run:${item}:passed`);
            await pressed(page, `run:${item}:passed`);
          }
          if (touch) {
            const small = await page.evaluate(() => [...document.querySelectorAll("#app button, #app select, #app input:not([type=checkbox]):not([type=radio]), #app summary, #app label.tick, nav.views button")]
              .filter((el) => el instanceof HTMLElement && el.offsetParent !== null)
              .map((el) => ({ el, r: el.getBoundingClientRect() }))
              .filter(({ r }) => r.height < 43.5 || r.width < 43.5)
              .map(({ el, r }) => `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`));
            assert.deepEqual(small, [], "every touch target is at least 44 x 44 CSS px");
          }
          await tap("run:advance");
          await settlesTo(async () => (await current(page)).run.current, "p2", "the Run continues");
          await tap("run:report-open");
          await tap("run:report:x2");
          await page.locator("#confirm-ok").tap().catch(() => page.locator("#confirm-ok").click());
          const exception = page.locator('[data-testid="exception"]');
          await exception.waitFor();
          assert.match(await exception.innerText(), /Stop condition reported: The return transport is cancelled\.[\s\S]*Stay at a safe, staffed place[\s\S]*Ask: Your named emergency contact\.[\s\S]*No recovery route is authored for this\. The Run stays stopped\./);
          assert.equal(await control(page, "run:advance").isDisabled(), true, "an active stop blocks normal progress");
          await tap("run:end:x2");
          await page.locator("#confirm-ok").click();
          await settlesTo(async () => (await current(page)).run.status, "ended", "End Run ends a stopped Run");
          assertClean(s);
        } finally {
          await s.close();
        }
      });

      test("320 px: every view fits without sideways scrolling and keeps the full item text", { timeout: 120_000 }, async () => {
        const s = await open({ viewport: { width: 320, height: 640 } });
        const { page } = s;
        try {
          const wide = () => page.evaluate(() => document.documentElement.scrollWidth);
          assert.ok(await wide() <= 320, "Start");
          await control(page, "example:static-page").click();
          assert.ok(await wide() <= 320, "Edit");
          await page.locator('nav [data-view="review"]').click();
          assert.ok(await wide() <= 320, "Review");
          await control(page, "review:mark").click();
          await control(page, "review:start").click();
          await control(page, "run:c1:failed").click();
          await control(page, "run:recover:r1").click();
          await page.locator('[data-testid="recovery"]').waitFor();
          assert.ok(await wide() <= 320, "Run with a failure and a recovery route");
          assert.equal(await page.locator('[data-item="c1"] .item-text').innerText(), "Confirm the intended page and destination.", "item text is never truncated");
          await page.locator('nav [data-view="files"]').click();
          await page.locator("#import-plain").setInputFiles({ name: "o.md", mimeType: "text/markdown", buffer: Buffer.from("# A title\n\n## One (Read–Do)\n\n- A very long step text that has to wrap onto several lines at this narrow width.\n") });
          await page.locator('[data-testid="import-preview"]').waitFor();
          assert.ok(await wide() <= 320, "Files with an import preview");
          await page.locator('nav [data-view="exercises"]').click();
          assert.ok(await wide() <= 320, "Exercises");
          assertClean(s);
        } finally {
          await s.close();
        }
      });

      test("offline: after load, with the network denied, the workflow, exports and imports need no request", { timeout: 120_000 }, async () => {
        const s = await open({ acceptDownloads: true });
        const { page } = s;
        /** @type {string[]} */
        const denied = [];
        try {
          await s.context.route("**/*", (route) => {
            denied.push(route.request().url());
            return route.abort();
          });
          await control(page, "example:appointment").click();
          await reviewAndStart(page);
          await control(page, "run:c1:passed").click();
          await pressed(page, "run:c1:passed");
          await page.locator('nav [data-view="files"]').click();
          const file = await saved(page, () => control(page, "export:md").click());
          await page.locator("#import-md").setInputFiles({ name: file.name, mimeType: "text/markdown", buffer: Buffer.from(file.text) });
          await page.locator('[data-testid="import-preview"]').waitFor();
          assertClean(s);
          assert.deepEqual(denied, [], "the page made no request once loaded");
        } finally {
          await s.close();
        }
      });

      test("file:// and frames: the saved page works from disk, in an iframe, and says when storage is unavailable", { timeout: 120_000 }, async () => {
        const fileUrl = targets.fileUrl(artifact);
        assert.ok(fileUrl, "a local copy of the page");
        const local = await openSession(browser, project, fileUrl.replace(/[^/]*$/, ""));
        try {
          await local.page.goto(fileUrl, { waitUntil: "load" });
          await settle(local.page, manifest.ready);
          await control(local.page, "example:static-page").click();
          await settlesTo(() => title(local.page), "Edit", "an example opens from file://");
          const status = await local.page.locator('[data-testid="save-status"]').innerText();
          assert.match(status, /Saved on this device|Progress is not saved/);
          await local.page.reload();
          await settle(local.page, manifest.ready);
          const restored = await local.page.locator("#status").innerText();
          if (/Saved on this device/.test(status)) assert.match(restored, /Publish a static page/, "a saved draft is restored from file://");
          assert.deepEqual(local.observed.pageErrors, []);
          assert.deepEqual(local.observed.unexpectedRequests, []);
        } finally {
          await local.close();
        }
        const framed = await openSession(browser, project, targets.origin(artifact));
        try {
          await framed.page.setContent(`<iframe id="plain" src="${http}" style="width:390px;height:700px"></iframe><iframe id="sandboxed" sandbox="allow-scripts" src="${http}" style="width:390px;height:700px"></iframe>`);
          const plain = /** @type {Frame} */ (await (await framed.page.waitForSelector("#plain")).contentFrame());
          await plain.waitForSelector('html[data-ready="true"]');
          await control(plain, "example:day-trip").click();
          await plain.waitForSelector('[data-view-panel="edit"]');
          const sandboxed = /** @type {Frame} */ (await (await framed.page.waitForSelector("#sandboxed")).contentFrame());
          await sandboxed.waitForSelector('html[data-ready="true"]');
          assert.match(await sandboxed.locator('[data-testid="save-status"]').innerText(), /Progress is not saved/, "without storage the page never claims a save");
          await control(sandboxed, "example:day-trip").click();
          await sandboxed.waitForSelector('[data-view-panel="edit"]');
          assert.match(await sandboxed.locator("#status").innerText(), /Pack a bag for a day trip[\s\S]*Progress is not saved/, "the session continues in memory");
          assert.deepEqual(framed.observed.pageErrors, []);
          assert.deepEqual(framed.observed.unexpectedRequests, []);
        } finally {
          await framed.close();
        }
      });
    });
  }
}
