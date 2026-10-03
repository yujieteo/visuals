// The baseline every visual gets, in every browser project: it opens, throws
// nothing, logs no console error, requests nothing outside itself, works from
// file:// when it says it works offline, does not overflow 320 px or 390 px, its
// primary control changes what the reader sees, and no number it shows reads NaN,
// Infinity or undefined, even with each number field and slider at its limits.
import { brokenNumbers, driveNumbers, fingerprint, markCandidate, operate, overflow } from "./checks.js";
import { BASELINE_CHECKS } from "./manifest.js";
import { openSession, settle } from "./browser.js";

/** @typedef {import("./targets.js").Artifact} Artifact */
/** @typedef {import("./targets.js").Targets} Targets */
/** @typedef {import("./manifest.js").Manifest} Manifest */
/** @typedef {import("./browser.js").Project} Project */
/** @typedef {{ outcome: "pass" | "fail" | "skip", evidence: string, ms: number }} Outcome */

/**
 * @param {string[]} items
 * @param {number} [max]
 */
const list = (items, max = 3) => items.length ? `${[...new Set(items)].slice(0, max).join("; ")}${items.length > max ? ` (+${items.length - max} more)` : ""}` : "";

/**
 * @param {import("playwright").Page} page
 */
async function hasContent(page) {
  return page.evaluate(() => {
    const body = document.body;
    if (!body) return false;
    return body.innerText.trim().length > 0 || !!body.querySelector("canvas, svg, img, video");
  });
}

/**
 * @param {import("playwright").Page} page
 */
async function pause(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 400)))).catch(() => {});
}

/**
 * Run every baseline check for one artifact in one project.
 * @param {import("playwright").Browser} browser
 * @param {Project} project
 * @param {Artifact} artifact
 * @param {Targets} targets
 * @param {Manifest} manifest
 * @returns {Promise<Record<string, Outcome>>}
 */
export async function runBaseline(browser, project, artifact, targets, manifest) {
  /** @type {Record<string, Outcome>} */
  const out = {};
  if (artifact.stageError && !artifact.remoteUrl) {
    for (const check of BASELINE_CHECKS) {
      out[check] = { outcome: "fail", evidence: `could not stage the artifact: ${artifact.stageError}`, ms: 0 };
    }
    return out;
  }
  const allowed = targets.origin(artifact);

  // One load over http(s): opens, then the primary control, then the errors and requests from both.
  const main = await openSession(browser, project, allowed);
  try {
    let t = Date.now();
    const response = await main.page.goto(targets.httpUrl(artifact), { waitUntil: "load", timeout: 30_000 }).catch((e) => e);
    if (response instanceof Error) {
      out.opens = { outcome: "fail", evidence: `navigation failed: ${response.message.split("\n")[0]}`, ms: Date.now() - t };
    } else if (response && !response.ok()) {
      out.opens = { outcome: "fail", evidence: `HTTP ${response.status()}`, ms: Date.now() - t };
    } else {
      await settle(main.page, manifest.ready).catch((e) => { out.opens = { outcome: "fail", evidence: `did not settle: ${String(e.message).split("\n")[0]}`, ms: Date.now() - t }; });
      if (!out.opens) {
        const content = await hasContent(main.page);
        out.opens = content
          ? { outcome: "pass", evidence: `title "${await main.page.title()}"`, ms: Date.now() - t }
          : { outcome: "fail", evidence: "the page rendered no text, canvas, SVG or image", ms: Date.now() - t };
      }
    }

    t = Date.now();
    if (out.opens.outcome !== "pass") {
      out["primary-control"] = { outcome: "fail", evidence: "the page did not open", ms: 0 };
    } else if (manifest.primary) {
      const { selector, action, value } = manifest.primary;
      try {
        const before = await fingerprint(main.page);
        await operate(main.page, selector, action, value);
        await pause(main.page);
        const changed = before !== await fingerprint(main.page);
        out["primary-control"] = { outcome: changed ? "pass" : "fail", evidence: `${action} ${selector}${changed ? " changed the page" : " left the page unchanged"}`, ms: Date.now() - t };
      } catch (e) {
        out["primary-control"] = { outcome: "fail", evidence: `${action} ${selector} failed: ${String(/** @type {Error} */ (e).message).split("\n")[0]}`, ms: Date.now() - t };
      }
    } else {
      /** @type {string[]} */
      const tried = [];
      /** @type {string[]} */
      const notes = [];
      for (let round = 0; round < 6; round++) {
        const candidate = await markCandidate(main.page, tried).catch(() => null);
        if (!candidate) break;
        tried.push(candidate.name);
        try {
          const before = await fingerprint(main.page);
          await operate(main.page, "[data-e2e-candidate]", candidate.action, undefined);
          await pause(main.page);
          const after = await fingerprint(main.page);
          await main.page.locator("[data-e2e-operated]").evaluateAll((els) => els.forEach((el) => el.removeAttribute("data-e2e-operated")));
          if (before !== after) {
            out["primary-control"] = { outcome: "pass", evidence: `${candidate.action} "${candidate.name}" changed the page`, ms: Date.now() - t };
            break;
          }
          notes.push(`${candidate.action} "${candidate.name}": no change`);
        } catch (e) {
          notes.push(`${candidate.action} "${candidate.name}": ${String(/** @type {Error} */ (e).message).split("\n")[0].slice(0, 120)}`);
        }
      }
      out["primary-control"] ??= {
        outcome: "fail",
        evidence: tried.length ? `no control changed the page (${list(notes, 6)})` : "found no visible control to operate",
        ms: Date.now() - t,
      };
    }

    // Numbers: none broken as the page opens or after its primary control, nor with each numeric input at
    // its minimum, maximum, 0 and (a number field) empty.
    t = Date.now();
    if (out.opens.outcome !== "pass") {
      out["numeric-text"] = { outcome: "fail", evidence: "the page did not open", ms: 0 };
    } else {
      const errors = main.observed.pageErrors.length, logged = main.observed.consoleErrors.length;
      try {
        const shown = await brokenNumbers(main.page);
        const { driven, broken } = await driveNumbers(main.page);
        // An error the driving raises belongs to this check, not to the page's load in runtime-errors.
        const thrown = [...main.observed.pageErrors.splice(errors), ...main.observed.consoleErrors.splice(logged)];
        const problems = [...shown.map((s) => `shown ${s}`), ...broken, ...thrown.map((e) => `error ${e}`)];
        out["numeric-text"] = problems.length
          ? { outcome: "fail", evidence: list(problems, 4), ms: Date.now() - t }
          : { outcome: "pass", evidence: `no NaN, Infinity or undefined shown, ${driven} numeric input(s) driven to their limits`, ms: Date.now() - t };
      } catch (e) {
        out["numeric-text"] = { outcome: "fail", evidence: `could not drive the numeric inputs: ${String(/** @type {Error} */ (e).message).split("\n")[0]}`, ms: Date.now() - t };
      }
    }

    await pause(main.page);
    const { pageErrors, consoleErrors, unexpectedRequests, failedRequests } = main.observed;
    out["runtime-errors"] = pageErrors.length
      ? { outcome: "fail", evidence: list(pageErrors), ms: 0 }
      : { outcome: "pass", evidence: "no uncaught errors", ms: 0 };
    out["console-errors"] = consoleErrors.length
      ? { outcome: "fail", evidence: list(consoleErrors), ms: 0 }
      : { outcome: "pass", evidence: "no console errors", ms: 0 };
    out.network = unexpectedRequests.length || failedRequests.length
      ? { outcome: "fail", evidence: list([...unexpectedRequests.map((u) => `unexpected ${u}`), ...failedRequests.map((u) => `failed ${u}`)]), ms: 0 }
      : { outcome: "pass", evidence: "every request stayed inside the artifact", ms: 0 };
  } finally {
    await main.close();
  }

  // file:// for a visual that says it works offline.
  const offline = manifest.offline ?? artifact.visual.offlineClaim;
  const fileUrl = targets.fileUrl(artifact);
  let t = Date.now();
  if (!offline) {
    out["file-url"] = { outcome: "skip", evidence: "the visual does not claim to work offline", ms: 0 };
  } else if (!fileUrl) {
    out["file-url"] = { outcome: "skip", evidence: artifact.stageError ? `no local copy of the artifact: could not stage it: ${artifact.stageError}` : "no local copy of the artifact", ms: 0 };
  } else {
    const local = await openSession(browser, project, fileUrl.replace(/[^/]*$/, ""));
    try {
      const response = await local.page.goto(fileUrl, { waitUntil: "load", timeout: 30_000 }).catch((e) => e);
      if (response instanceof Error) {
        out["file-url"] = { outcome: "fail", evidence: `navigation failed: ${response.message.split("\n")[0]}`, ms: Date.now() - t };
      } else {
        await settle(local.page, manifest.ready).catch(() => {});
        await pause(local.page);
        const problems = [
          ...local.observed.pageErrors.map((e) => `error ${e}`),
          ...local.observed.consoleErrors.map((e) => `console ${e}`),
          ...local.observed.unexpectedRequests.map((u) => `request ${u}`),
          ...local.observed.failedRequests.map((u) => `failed ${u}`),
        ];
        if (!await hasContent(local.page)) problems.unshift("rendered nothing");
        out["file-url"] = problems.length
          ? { outcome: "fail", evidence: list(problems), ms: Date.now() - t }
          : { outcome: "pass", evidence: "loads and runs from file:// with no errors or requests", ms: Date.now() - t };
      }
    } finally {
      await local.close();
    }
  }

  // 320 px wide, then 390 px.
  t = Date.now();
  const narrow = await openSession(browser, project, allowed, { viewport: { width: 320, height: 640 } });
  try {
    const response = await narrow.page.goto(targets.httpUrl(artifact), { waitUntil: "load", timeout: 30_000 }).catch((e) => e);
    if (response instanceof Error) {
      out["overflow-320"] = out["overflow-390"] = { outcome: "fail", evidence: `navigation failed: ${response.message.split("\n")[0]}`, ms: Date.now() - t };
    } else {
      await settle(narrow.page, manifest.ready).catch(() => {});
      for (const width of [320, 390]) {
        // 390 px is a common phone width, where a layout between its breakpoints can overflow though 320 px does not.
        if (width !== 320) {
          t = Date.now();
          await narrow.page.setViewportSize({ width, height: 844 });
          await pause(narrow.page);
        }
        const o = await overflow(narrow.page);
        out[`overflow-${width}`] = o.scrollWidth > o.clientWidth + 1
          ? { outcome: "fail", evidence: `scrollWidth ${o.scrollWidth} > clientWidth ${o.clientWidth}: ${list(o.culprits, 4)}`, ms: Date.now() - t }
          : { outcome: "pass", evidence: `scrollWidth ${o.scrollWidth} <= clientWidth ${o.clientWidth}`, ms: Date.now() - t };
      }
    }
  } finally {
    await narrow.close();
  }
  return out;
}
