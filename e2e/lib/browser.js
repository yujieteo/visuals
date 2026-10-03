// The browser matrix and an instrumented page: every uncaught error, console
// error and request the page makes is recorded, and requests outside the
// artifact are refused, so a visual that quietly depends on a CDN or an API
// fails rather than passes on a networked machine.
import { chromium, devices, firefox, webkit } from "playwright";

/**
 * @typedef {object} Project
 * @property {string} name
 * @property {import("playwright").BrowserType} browserType
 * @property {import("playwright").LaunchOptions} launch
 * @property {import("playwright").BrowserContextOptions} context
 */

/** @type {import("playwright").LaunchOptions} */
const FIREFOX = {
  // Firefox otherwise holds navigator.clipboard.readText() on its own Paste
  // prompt, which automation cannot answer; Chromium and WebKit settle the read.
  firefoxUserPrefs: { "dom.events.testing.asyncClipboard": true },
};

/** @type {Project[]} */
export const PROJECTS = [
  { name: "chromium-desktop", browserType: chromium, launch: {}, context: { viewport: { width: 1280, height: 800 } } },
  { name: "firefox-desktop", browserType: firefox, launch: FIREFOX, context: { viewport: { width: 1280, height: 800 } } },
  { name: "webkit-desktop", browserType: webkit, launch: {}, context: { viewport: { width: 1280, height: 800 } } },
  { name: "chromium-mobile", browserType: chromium, launch: {}, context: { ...devices["Pixel 7"] } },
  { name: "webkit-mobile", browserType: webkit, launch: {}, context: { ...devices["iPhone 15"] } },
];

/**
 * The projects named by E2E_PROJECTS (comma-separated), or all of them.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Project[]}
 */
export function selectedProjects(env = process.env) {
  const names = (env.E2E_PROJECTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!names.length) return PROJECTS;
  const unknown = names.filter((n) => !PROJECTS.some((p) => p.name === n));
  if (unknown.length) throw new Error(`unknown E2E_PROJECTS ${unknown.join(", ")}; choose from ${PROJECTS.map((p) => p.name).join(", ")}`);
  return PROJECTS.filter((p) => names.includes(p.name));
}

/**
 * @typedef {object} Observed
 * @property {string[]} pageErrors uncaught exceptions and unhandled rejections
 * @property {string[]} consoleErrors console.error and other error-level console messages
 * @property {string[]} unexpectedRequests requests outside the artifact (refused)
 * @property {string[]} failedRequests requests inside the artifact that failed or returned >= 400
 */

/**
 * @typedef {object} Session
 * @property {import("playwright").BrowserContext} context
 * @property {import("playwright").Page} page
 * @property {Observed} observed
 * @property {() => Promise<void>} close
 */

/**
 * Whether a URL is part of the artifact (or needs no network at all).
 * @param {string} url
 * @param {string} allowedPrefix
 */
export function isArtifactUrl(url, allowedPrefix) {
  if (/^(data|blob|about|javascript):/.test(url)) return true;
  return url.startsWith(allowedPrefix);
}

/**
 * Open a fresh context and page that record what the page does.
 * @param {import("playwright").Browser} browser
 * @param {Project} project
 * @param {string} allowedPrefix requests starting with this are the artifact's own
 * @param {import("playwright").BrowserContextOptions} [extra] context options layered over the project's
 * @returns {Promise<Session>}
 */
export async function openSession(browser, project, allowedPrefix, extra = {}) {
  const options = { ...project.context, ...extra };
  if (project.browserType === firefox) delete options.isMobile;
  const context = await browser.newContext(options);
  context.setDefaultTimeout(10_000);
  /** @type {Observed} */
  const observed = { pageErrors: [], consoleErrors: [], unexpectedRequests: [], failedRequests: [] };
  await context.route(/^https?:\/\//, (route) => {
    const url = route.request().url();
    if (isArtifactUrl(url, allowedPrefix)) return route.continue();
    observed.unexpectedRequests.push(url);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => observed.pageErrors.push(String(error.stack ?? error.message ?? error).split("\n").slice(0, 3).join(" | ")));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // A refused request already counts under network; its console echo is not a second failure.
    if (/Failed to load resource|net::ERR_BLOCKED_BY_CLIENT|blocked by client/i.test(text) && observed.unexpectedRequests.length) return;
    observed.consoleErrors.push(text.slice(0, 400));
  });
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("file:") && !isArtifactUrl(url, allowedPrefix)) observed.unexpectedRequests.push(url);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    const reason = request.failure()?.errorText ?? "failed";
    // A request cut short by a reload or by closing the page is not a broken one.
    if (/cancel|abort/i.test(reason)) return;
    if (isArtifactUrl(url, allowedPrefix) && !/^(data|blob):/.test(url)) observed.failedRequests.push(`${url} (${reason})`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && isArtifactUrl(response.url(), allowedPrefix)) observed.failedRequests.push(`${response.url()} (HTTP ${response.status()})`);
  });
  return { context, page, observed, close: () => context.close() };
}

/**
 * Wait for a page to finish loading and settle: load event, fonts, two frames
 * and a short quiet period for boot-time scripts. A page may reload itself
 * while booting (a cross-origin-isolation service worker does, several times
 * in Firefox), so a navigation during the wait starts it again, for up to 30 s,
 * and a page that loads coi-serviceworker in a secure context is not settled
 * until the worker controls it and it is cross-origin isolated, since until
 * then a reload is still to come.
 * @param {import("playwright").Page} page
 * @param {string} [ready] a selector that marks the page as booted
 */
export async function settle(page, ready) {
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await page.waitForLoadState("load", { timeout: 30_000 });
      if (ready) await page.waitForSelector(ready, { timeout: 15_000 });
      await page.waitForFunction(() => !document.querySelector('script[src$="coi-serviceworker.js"]') || !isSecureContext || !!navigator.serviceWorker?.controller && crossOriginIsolated, null, { timeout: 15_000 });
      await page.evaluate(() => new Promise((resolve) => {
        const fonts = /** @type {any} */ (document).fonts;
        const frames = () => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150)));
        if (fonts?.ready) fonts.ready.then(frames, frames); else frames();
      }));
      return;
    } catch (error) {
      if (Date.now() > deadline || !/context was destroyed|navigat/i.test(String(error))) throw error;
    }
  }
}
