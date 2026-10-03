// page-axi: one call that checks one page in a headless browser and prints one TOON verdict, for agents that
// would otherwise hand-write the same open, viewport, screenshot, console and overflow probes. It reuses the
// harness: the instrumented page (browser.js), the in-page probes (checks.js), staging (stage.js) and the
// static server (server.js), and runs scripts/page_rules.py for the contrast and WebMCP tools rules that
// scripts/check.py runs, so the agent and CI judge a page by one rule set.
//
// Each run launches one headless Chromium, loads the page once for each theme and viewport, saves a screenshot
// of each load, and closes the browser. Stdout gets the verdict only; the full evidence of every load goes to
// run.json beside the screenshots. Exit 0 when every check passes, 1 when one fails, 2 for a usage or
// environment error.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { discoverVisualsRepo } from "./catalogue.js";
import { REPO, loadManifest } from "./manifest.js";

/** @typedef {import("./catalogue.js").Visual} Visual */
/** @typedef {import("./manifest.js").Manifest} Manifest */

export const USAGE = `usage: page-axi check <slug|path|url> [--viewport 390,768,1440] [--themes light,dark] [--offline] [--out DIR]

  <slug>      a visual in viz/<slug>/, staged as the site publishes it (index.html, data.json, assets)
  <path>      a folder holding index.html, or an HTML file
  <url>       an http(s) page that is already served
  --viewport  comma-separated widths in px, 200 to 4000 (default 390,768,1440); --viewports is the same
  --themes    light, dark or both (default light,dark), as the reader's prefers-color-scheme
  --offline   open the page from file:// with no server, as a reader with no network would
  --out       where screenshots and run.json go (default build/page-axi/<name>/, which the run empties first)

Checks: opens, console (uncaught errors and console errors), network (requests outside the page's folder are
refused and counted), overflow (horizontal scroll), numeric-text (NaN, Infinity or undefined shown, also with
each number field and slider at its limits), contrast (scripts/rules.py on the colour tokens, both themes) and
webmcp-tools (the tools the page registers at run time, at least 3, against visual.json and SKILLS.md).
Exit 0 when every check passes, 1 when a check fails, 2 for a usage or environment error.`;

/** The checks, in the order they print when their status is the same. */
export const CHECKS = /** @type {const} */ (["opens", "console", "network", "overflow", "numeric-text", "contrast", "webmcp-tools"]);

/** The baseline check names in a manifest that each page-axi check corresponds to. */
const MANIFEST_NAMES = /** @type {Record<string, string[]>} */ ({
  opens: ["opens"],
  console: ["runtime-errors", "console-errors"],
  network: ["network"],
  overflow: ["overflow-320", "overflow-390"],
  "numeric-text": ["numeric-text"],
});

const DEFAULT_VIEWPORTS = [390, 768, 1440];
const THEMES = ["light", "dark"];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A usage or environment error: exit 2, with next-step hints. */
export class UsageError extends Error {
  /**
   * @param {string} message
   * @param {string[]} [help]
   */
  constructor(message, help = ["Run `node e2e/bin/page-axi.js --help` for the usage"]) {
    super(message);
    this.help = help;
  }
}

/**
 * @typedef {object} Options
 * @property {"check" | "help"} command
 * @property {string} target
 * @property {number[]} viewports
 * @property {("light" | "dark")[]} themes
 * @property {boolean} offline
 * @property {string | null} out
 */

/**
 * Parse the command line (without node and the script).
 * @param {string[]} argv
 * @returns {Options}
 */
export function parseArgs(argv) {
  /** @type {Options} */
  const options = { command: "check", target: "", viewports: DEFAULT_VIEWPORTS, themes: ["light", "dark"], offline: false, out: null };
  if (!argv.length || argv.includes("--help") || argv.includes("-h") || argv[0] === "help") return { ...options, command: "help" };
  const [command, ...rest] = argv;
  if (command !== "check") throw new UsageError(`unknown command "${command}"; the only command is check`);
  /** @type {string[]} */
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const [flag, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, null];
    const value = () => {
      const v = inline ?? rest[++i];
      if (v === undefined || v === "") throw new UsageError(`${flag} needs a value`);
      return v;
    };
    if (flag === "--viewport" || flag === "--viewports") {
      const raw = value();
      const widths = raw.split(",").map((s) => s.trim());
      if (widths.some((w) => !/^\d+$/.test(w) || Number(w) < 200 || Number(w) > 4000)) throw new UsageError(`--viewport takes widths from 200 to 4000 px, comma-separated: ${raw}`);
      options.viewports = [...new Set(widths.map(Number))];
    } else if (flag === "--themes" || flag === "--theme") {
      const raw = value();
      const themes = raw.split(",").map((s) => s.trim());
      if (themes.some((t) => !THEMES.includes(t))) throw new UsageError(`--themes takes light, dark or both: ${raw}`);
      options.themes = /** @type {("light" | "dark")[]} */ ([...new Set(themes)]);
    } else if (flag === "--offline") {
      if (inline !== null) throw new UsageError("--offline takes no value");
      options.offline = true;
    } else if (flag === "--out") {
      options.out = value();
    } else if (arg.startsWith("-")) {
      throw new UsageError(`unknown option ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) {
    throw new UsageError(positional.length ? `check takes one page, got ${positional.length}: ${positional.join(" ")}` : "check needs a page: a slug, a path or a URL");
  }
  options.target = positional[0];
  return options;
}

/**
 * @typedef {object} Target
 * @property {"slug" | "path" | "url"} kind
 * @property {string} name the slug, or the page's folder name
 * @property {Visual | null} visual the catalogue entry, for a visual in viz/
 * @property {string | null} folder the page's folder on disk
 * @property {string} entry the page's file name in the folder
 * @property {string | null} url the page's URL, for a page already served
 */

/**
 * Edit distance, for "did you mean".
 * @param {string} a
 * @param {string} b
 */
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/**
 * Turn the command line's page into a target: a slug in viz/, a folder or HTML file, or a URL. Anything
 * that names no page is a usage error, never an empty pass.
 * @param {string} raw
 * @param {{ repo?: string, cwd?: string, offline?: boolean }} [where]
 * @returns {Target}
 */
export function resolveTarget(raw, { repo = REPO, cwd = process.cwd(), offline = false } = {}) {
  const visuals = existsSync(join(repo, "viz")) ? discoverVisualsRepo(repo) : [];
  const bySlug = new Map(visuals.map((v) => [v.slug, v]));
  if (/^https?:\/\//.test(raw)) {
    if (offline) throw new UsageError("--offline opens a local page from file://; a URL has no local copy", ["Pass the visual's slug or its folder with --offline"]);
    const url = new URL(raw);
    const name = basename(url.pathname.replace(/\/(index\.html)?$/, "")) || url.hostname;
    return { kind: "url", name, visual: bySlug.get(name) ?? null, folder: null, entry: "", url: url.href };
  }
  if (SLUG.test(raw) && bySlug.has(raw)) return { kind: "slug", name: raw, visual: /** @type {Visual} */ (bySlug.get(raw)), folder: join(repo, "viz", raw), entry: "index.html", url: null };
  const path = resolve(cwd, raw.startsWith("file://") ? new URL(raw).pathname : raw);
  if (!existsSync(path)) {
    const near = visuals.map((v) => v.slug).filter((s) => distance(s, raw) <= Math.max(2, Math.floor(raw.length / 4)) || s.includes(raw)).slice(0, 5);
    throw new UsageError(SLUG.test(raw) ? `no visual viz/${raw}/ and no file or folder ${raw}` : `no file or folder ${raw}`, [
      ...near.length ? [`Did you mean ${near.join(", ")}?`] : [],
      "Run `fd -d 1 -t d . viz` to list the visuals",
    ]);
  }
  const isDir = statSync(path).isDirectory();
  if (isDir && !existsSync(join(path, "index.html"))) throw new UsageError(`${raw} is a folder with no index.html`, ["Pass the HTML file itself, or the folder that holds index.html"]);
  if (!isDir && !/\.html?$/i.test(path)) throw new UsageError(`${raw} is not an HTML file`);
  const folder = isDir ? path : dirname(path);
  const entry = isDir ? "index.html" : basename(path);
  // A visual's own folder (or its index.html) is that visual: stage it as the site publishes it.
  const inViz = relative(join(repo, "viz"), folder);
  if (entry === "index.html" && inViz && !inViz.includes(sep) && !inViz.startsWith("..") && bySlug.has(inViz)) {
    return { kind: "slug", name: inViz, visual: /** @type {Visual} */ (bySlug.get(inViz)), folder, entry, url: null };
  }
  return { kind: "path", name: basename(folder) || "page", visual: null, folder, entry, url: null };
}

// ---- TOON ------------------------------------------------------------------------------------------------

/**
 * One TOON scalar, quoted when it would otherwise read as something else.
 * @param {unknown} value
 */
export function scalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const s = String(value);
  if (s === "" || s !== s.trim() || /[,:"\\\n\r\t[\]{}#]/.test(s) || /^(true|false|null|-?\d+(\.\d+)?([eE][-+]?\d+)?)$/.test(s) || s.startsWith("-")) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;
  }
  return s;
}

/**
 * Encode an object as TOON: nested objects indent, arrays of objects become tables, arrays of scalars
 * a row each.
 * @param {Record<string, unknown>} object
 * @param {number} [depth]
 * @returns {string}
 */
export function toon(object, depth = 0) {
  const pad = "  ".repeat(depth);
  /** @type {string[]} */
  const lines = [];
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length && value.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
        const fields = Object.keys(value[0]);
        lines.push(`${pad}${key}[${value.length}]{${fields.join(",")}}:`);
        for (const row of value) lines.push(`${pad}  ${fields.map((f) => scalar(row[f])).join(",")}`);
      } else {
        lines.push(`${pad}${key}[${value.length}]:`);
        for (const item of value) lines.push(`${pad}  ${scalar(item)}`);
      }
    } else if (value && typeof value === "object") {
      lines.push(`${pad}${key}:`);
      lines.push(toon(/** @type {Record<string, unknown>} */ (value), depth + 1));
    } else {
      lines.push(`${pad}${key}: ${scalar(value)}`);
    }
  }
  return lines.join("\n");
}

// ---- the verdict -----------------------------------------------------------------------------------------

/**
 * @typedef {object} Load what one load of the page at one viewport and theme saw
 * @property {number} viewport
 * @property {string} theme
 * @property {string} url
 * @property {string | null} openError why the page did not open, or null
 * @property {string} title
 * @property {string[]} errors uncaught errors and console errors
 * @property {string[]} requests refused or failed requests
 * @property {{ scrollWidth: number, clientWidth: number, culprits: string[] } | null} overflow
 * @property {string[]} numbers NaN, Infinity or undefined shown as the page opened
 * @property {string[] | null} tools the WebMCP tool names the page registered, null before it opened
 * @property {string | null} shot the screenshot's path
 */

/**
 * @typedef {object} Row
 * @property {string} check
 * @property {"pass" | "fail" | "skip"} status
 * @property {string} where the loads it failed in ("390/dark 768/dark"), else what it covered
 * @property {string} evidence
 */

/**
 * @param {string[]} items
 * @param {number} [max]
 */
export const list = (items, max = 3) => {
  const unique = [...new Set(items)];
  return `${unique.slice(0, max).join("; ")}${unique.length > max ? ` (+${unique.length - max} more)` : ""}`;
};

/**
 * One row for a check that every load runs: it fails in each load where ``problems`` returns any.
 * @param {string} check
 * @param {Load[]} loads
 * @param {(load: Load) => string[]} problems
 * @param {string} passEvidence
 * @returns {Row}
 */
function perLoad(check, loads, problems, passEvidence) {
  const opened = loads.filter((l) => !l.openError);
  const target = check === "opens" ? loads : opened;
  if (!target.length) return { check, status: "fail", where: `${loads.length} load(s)`, evidence: "the page did not open" };
  const failing = target.map((l) => ({ l, p: problems(l) })).filter(({ p }) => p.length);
  if (!failing.length) return { check, status: "pass", where: `${target.length} load(s)`, evidence: passEvidence };
  return {
    check,
    status: "fail",
    where: failing.map(({ l }) => `${l.viewport}/${l.theme}`).join(" "),
    evidence: list(failing.flatMap(({ p }) => p)),
  };
}

/**
 * The rows of the verdict, failing first, from the loads, the numeric drive and the static rules.
 * @param {object} input
 * @param {Load[]} input.loads
 * @param {{ driven: number, broken: string[], errors: string[] } | null} input.drive
 * @param {{ contrast: string[], tools: string[] | null } | null} input.rules null when there is no local page
 * @param {string[] | null} input.declared visual.json webmcp_tools, null when there is no visual.json
 * @param {Manifest} [input.manifest]
 * @returns {Row[]}
 */
export function verdictRows({ loads, drive, rules, declared, manifest = {} }) {
  /** @type {Row[]} */
  const rows = [
    perLoad("opens", loads, (l) => l.openError ? [l.openError] : [], `title "${loads.find((l) => !l.openError)?.title ?? ""}"`),
    perLoad("console", loads, (l) => l.errors, "no uncaught errors and no console errors"),
    perLoad("network", loads, (l) => l.requests, "every request stayed inside the page's folder"),
    perLoad("overflow", loads, (l) => l.overflow && l.overflow.scrollWidth > l.overflow.clientWidth + 1
      ? [`scrollWidth ${l.overflow.scrollWidth} > clientWidth ${l.overflow.clientWidth} at ${l.viewport} px: ${list(l.overflow.culprits, 2)}`] : [],
    "nothing scrolls sideways"),
  ];
  const numbers = perLoad("numeric-text", loads, (l) => l.numbers.map((n) => `shown ${n}`), "");
  const driven = drive ? [...drive.broken, ...drive.errors.map((e) => `error ${e}`)] : [];
  if (numbers.evidence !== "the page did not open" && driven.length) {
    rows.push({ check: "numeric-text", status: "fail", where: numbers.status === "fail" ? `${numbers.where} limits` : "limits", evidence: list([...(numbers.status === "fail" ? [numbers.evidence] : []), ...driven]) });
  } else if (numbers.status === "pass") {
    rows.push({ ...numbers, evidence: `no NaN, Infinity or undefined shown; ${drive?.driven ?? 0} numeric input(s) driven to their limits` });
  } else {
    rows.push(numbers);
  }
  if (!rules) {
    rows.push({ check: "contrast", status: "skip", where: "tokens", evidence: "a URL has no local source to read the colour tokens from" });
  } else {
    rows.push(rules.contrast.length
      ? { check: "contrast", status: "fail", where: "tokens", evidence: list(rules.contrast) }
      : { check: "contrast", status: "pass", where: "tokens", evidence: "every colour token pair meets its WCAG ratio in both themes" });
  }
  const seen = loads.find((l) => l.tools);
  if (!seen?.tools) {
    rows.push({ check: "webmcp-tools", status: "fail", where: "page", evidence: "the page did not open" });
  } else {
    const registered = [...new Set(seen.tools)].sort();
    /** @type {string[]} */
    const problems = [];
    if (registered.length < 3) problems.push(`registers ${registered.length} tool(s) (${registered.join(", ") || "none"}); a visual registers at least 3`);
    if (declared) {
      const want = [...new Set(declared)].sort();
      const missing = want.filter((t) => !registered.includes(t)), extra = registered.filter((t) => !want.includes(t));
      if (missing.length) problems.push(`visual.json webmcp_tools names ${missing.join(", ")}, which the page did not register`);
      if (extra.length) problems.push(`the page registered ${extra.join(", ")}, which visual.json webmcp_tools does not name`);
    }
    problems.push(...(rules?.tools ?? []));
    rows.push(problems.length
      ? { check: "webmcp-tools", status: "fail", where: "page", evidence: list(problems) }
      : { check: "webmcp-tools", status: "pass", where: "page", evidence: `${registered.length} registered: ${registered.join(" ")}` });
  }
  for (const row of rows) {
    const names = MANIFEST_NAMES[row.check] ?? [];
    const known = (manifest.findings ?? []).filter((f) => names.includes(f.check) && (f.projects.includes("*") || f.projects.some((p) => p.startsWith("chromium"))));
    if (row.status === "fail" && known.length) row.evidence = `known ${known[0].check} finding in e2e/manifest.json; ${row.evidence}`;
  }
  const order = { fail: 0, skip: 1, pass: 2 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || CHECKS.indexOf(/** @type {any} */ (a.check)) - CHECKS.indexOf(/** @type {any} */ (b.check)));
}

/**
 * The next steps to print after the verdict.
 * @param {Row[]} rows
 * @param {{ target: Target, log: string, shots: { viewport: number, theme: string, path: string }[] }} run
 * @returns {string[]}
 */
export function hints(rows, { target, log, shots }) {
  const failed = new Set(rows.filter((r) => r.status === "fail").map((r) => r.check));
  /** @type {string[]} */
  const help = [];
  const overflow = rows.find((r) => r.check === "overflow" && r.status === "fail");
  if (overflow) {
    const [vp, theme] = overflow.where.split(" ")[0].split("/");
    const shot = shots.find((s) => String(s.viewport) === vp && s.theme === theme);
    if (shot) help.push(`Open ${shot.path} to see the overflow at ${vp} px`);
  }
  if (failed.has("console") || failed.has("network") || failed.has("numeric-text")) help.push(`Read ${log} for every error and request of each load`);
  if (failed.has("contrast") || failed.has("webmcp-tools")) {
    help.push(target.kind === "slug" ? `Run \`python3 scripts/check.py ${target.name}\` for the static checks with their full output` : `Read ${log} for the full contrast and tools problems`);
  }
  if (!failed.size) help.push(target.kind === "slug" ? `Run \`python3 scripts/check.py ${target.name}\` for the build, tests, types and the other static checks` : `Read the screenshots in ${dirname(log)}`);
  if (target.kind === "slug") help.push(`Run \`cd e2e && E2E_ONLY=${target.name} E2E_PROJECTS=chromium-desktop npm run test:baseline\` for the CI baseline`);
  return help;
}

// ---- the run ---------------------------------------------------------------------------------------------

/** Record every WebMCP tool the page registers, through either entry point it looks for. */
const MODEL_CONTEXT_STUB = () => {
  /** @type {string[]} */
  const names = [];
  /** @param {any} tool */
  const add = (tool) => { if (tool && typeof tool.name === "string") names.push(tool.name); };
  const context = {
    registerTool: (/** @type {any} */ tool) => { add(tool); return { unregister() {} }; },
    unregisterTool() {},
    provideContext: (/** @type {any} */ ctx) => { for (const tool of ctx?.tools ?? []) add(tool); },
    clearContext() {},
  };
  for (const host of [navigator, document]) {
    try { Object.defineProperty(host, "modelContext", { value: context, configurable: true }); } catch { /* read-only host */ }
  }
  Object.defineProperty(window, "__pageAxiTools", { value: names });
};

/**
 * @param {string} path
 * @param {string} cwd
 */
const shown = (path, cwd) => {
  const rel = relative(cwd, path);
  return rel && !rel.startsWith("..") ? rel : path;
};

/**
 * Run the static rules in scripts/page_rules.py on a local page.
 * @param {string} folder
 * @param {string} entry
 * @returns {{ contrast: string[], tools: string[] | null }}
 */
export function staticRules(folder, entry) {
  try {
    const out = execFileSync("python3", [join(REPO, "scripts", "page_rules.py"), folder, entry], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    return JSON.parse(out);
  } catch (error) {
    const e = /** @type {{ stderr?: string, message: string }} */ (error);
    throw new UsageError(`scripts/page_rules.py failed: ${(e.stderr || e.message).trim().split("\n").pop()}`, ["Check that python3 runs and that scripts/ is checked out"]);
  }
}

/**
 * @typedef {object} RunResult
 * @property {Record<string, unknown>} page
 * @property {{ verdict: string, pass: number, fail: number, skip: number, loads: number }} summary
 * @property {Row[]} checks
 * @property {{ viewport: number, theme: string, path: string }[]} shots
 * @property {string} log
 * @property {string[]} help
 */

/**
 * Check one page and return the verdict; writes the screenshots and run.json.
 * @param {Options} options
 * @param {{ repo?: string, cwd?: string }} [where]
 * @returns {Promise<RunResult>}
 */
export async function runCheck(options, { repo = REPO, cwd = process.cwd() } = {}) {
  const started = Date.now();
  const target = resolveTarget(options.target, { repo, cwd, offline: options.offline });
  const out = resolve(cwd, options.out ?? join(repo, "build", "page-axi", target.name));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const rules = target.folder ? staticRules(target.folder, target.entry) : null;
  const manifest = target.kind === "slug" ? loadManifest(target.name, repo) : {};

  // Imported here, so a missing playwright install is an environment error with a hint, not a crash.
  /** @type {typeof import("./browser.js")} */
  let browserLib;
  /** @type {typeof import("./checks.js")} */
  let checksLib;
  try {
    [browserLib, checksLib] = await Promise.all([import("./browser.js"), import("./checks.js")]);
  } catch (error) {
    throw new UsageError(`cannot load playwright: ${String(/** @type {Error} */ (error).message).split("\n")[0]}`, ["Run `cd e2e && npm ci && npx playwright install chromium`"]);
  }
  const { PROJECTS, openSession, settle } = browserLib;
  const { brokenNumbers, driveNumbers, overflow } = checksLib;
  const project = /** @type {import("./browser.js").Project} */ (PROJECTS.find((p) => p.name === "chromium-desktop"));

  // Stage a visual as the site publishes it; serve it unless the run is offline or the page is a URL.
  /** @type {string | null} */
  let staging = null;
  /** @type {import("./server.js").StaticServer | null} */
  let server = null;
  /** @type {import("playwright").Browser | null} */
  let browser = null;
  try {
    let folder = target.folder;
    if (target.kind === "slug" && target.visual) {
      const { stageVisual } = await import("./stage.js");
      staging = mkdtempSync(join(process.env.E2E_TMP ?? tmpdir(), "page-axi-"));
      folder = stageVisual(target.visual, { siteRoot: join(repo, "e2e", ".cache", "site"), visualsRepo: repo, stagingRoot: staging });
    }
    /** @type {string} */
    let url;
    /** @type {string} */
    let allowed;
    if (target.url) {
      url = target.url;
      allowed = url.replace(/[^/]*$/, "");
    } else if (options.offline) {
      url = pathToFileURL(join(/** @type {string} */ (folder), target.entry)).href;
      allowed = url.replace(/[^/]*$/, "");
    } else {
      const { serveArtifacts } = await import("./server.js");
      server = await serveArtifacts(new Map([[target.name, /** @type {string} */ (folder)]]));
      allowed = server.urlFor(target.name);
      url = allowed + (target.entry === "index.html" ? "" : target.entry);
    }

    try {
      browser = await project.browserType.launch({ ...project.launch, headless: true });
    } catch (error) {
      throw new UsageError(`cannot launch headless Chromium: ${String(/** @type {Error} */ (error).message).split("\n")[0]}`, ["Run `cd e2e && npx playwright install chromium`"]);
    }

    /** @type {Load[]} */
    const loads = [];
    /** @type {{ driven: number, broken: string[], errors: string[] } | null} */
    let drive = null;
    for (const theme of options.themes) {
      for (const viewport of options.viewports) {
        const session = await openSession(browser, project, allowed, { viewport: { width: viewport, height: viewport < 600 ? 844 : 900 }, colorScheme: /** @type {"light" | "dark"} */ (theme) });
        /** @type {Load} */
        const load = { viewport, theme, url, openError: null, title: "", errors: [], requests: [], overflow: null, numbers: [], tools: null, shot: null };
        try {
          await session.page.addInitScript(MODEL_CONTEXT_STUB);
          const response = await session.page.goto(url, { waitUntil: "load", timeout: 30_000 }).catch((e) => /** @type {Error} */ (e));
          if (response instanceof Error) load.openError = `navigation failed: ${response.message.split("\n")[0]}`;
          else if (response && !response.ok()) load.openError = `HTTP ${response.status()}`;
          else {
            await settle(session.page, manifest.ready).catch((e) => { load.openError = `did not settle: ${String(e.message).split("\n")[0]}`; });
          }
          if (!load.openError) {
            const content = await session.page.evaluate(() => !!document.body && (document.body.innerText.trim().length > 0 || !!document.body.querySelector("canvas, svg, img, video")));
            if (!content) load.openError = "the page rendered no text, canvas, SVG or image";
          }
          const path = join(out, `${viewport}-${theme}.png`);
          if (await session.page.screenshot({ path, timeout: 15_000 }).then(() => true, () => false)) load.shot = path;
          if (!load.openError) {
            load.title = await session.page.title();
            load.overflow = await overflow(session.page);
            load.numbers = await brokenNumbers(session.page);
            load.tools = await session.page.evaluate(() => [.../** @type {string[]} */ (/** @type {any} */ (window).__pageAxiTools ?? [])]);
            if (!drive) {
              // Driving the numeric inputs changes the page, so it runs once, after this load's other probes; the
              // errors it raises belong to numeric-text, not to console.
              const { pageErrors, consoleErrors } = session.observed;
              const [thrown, logged] = [pageErrors.length, consoleErrors.length];
              const result = await driveNumbers(session.page).catch((e) => ({ driven: 0, broken: [`could not drive the numeric inputs: ${String(e.message).split("\n")[0]}`] }));
              await session.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)))).catch(() => {});
              drive = { ...result, errors: [...pageErrors.splice(thrown), ...consoleErrors.splice(logged)] };
            }
          }
          await session.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)))).catch(() => {});
        } finally {
          const { pageErrors, consoleErrors, unexpectedRequests, failedRequests } = session.observed;
          load.errors = [...pageErrors.map((e) => `error ${e}`), ...consoleErrors.map((e) => `console ${e}`)];
          load.requests = [...unexpectedRequests.map((u) => `refused ${u}`), ...failedRequests.map((u) => `failed ${u}`)];
          await session.close();
        }
        loads.push(load);
      }
    }
    const declared = target.visual ? metadataTools(repo, target.name) : null;
    const checks = verdictRows({ loads, drive, rules, declared, manifest });
    const shots = loads.filter((l) => l.shot).map((l) => ({ viewport: l.viewport, theme: l.theme, path: shown(/** @type {string} */ (l.shot), cwd) }));
    const log = join(out, "run.json");
    const summary = {
      verdict: checks.some((c) => c.status === "fail") ? "fail" : "pass",
      pass: checks.filter((c) => c.status === "pass").length,
      fail: checks.filter((c) => c.status === "fail").length,
      skip: checks.filter((c) => c.status === "skip").length,
      loads: loads.length,
    };
    const page = {
      target: target.name,
      kind: target.kind,
      url: target.url ?? (options.offline ? `file://.../${target.entry}` : url),
      mode: options.offline ? "offline (file://)" : target.url ? "remote" : "served (localhost)",
      viewports: options.viewports.join(","),
      themes: options.themes.join(","),
      duration_ms: Date.now() - started,
    };
    writeFileSync(log, JSON.stringify({ page: { ...page, url }, summary, checks, loads, drive, rules, declared }, null, 2));
    const logShown = shown(log, cwd);
    return { page, summary, checks: checks.map((c) => ({ ...c, evidence: c.evidence.length > 240 ? `${c.evidence.slice(0, 237)}...` : c.evidence })), shots, log: logShown, help: hints(checks, { target, log: logShown, shots }) };
  } finally {
    await browser?.close();
    await server?.close();
    if (staging) rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * visual.json webmcp_tools of a visual in viz/.
 * @param {string} repo
 * @param {string} slug
 * @returns {string[]}
 */
function metadataTools(repo, slug) {
  const doc = JSON.parse(readFileSync(join(repo, "viz", slug, "visual.json"), "utf8"));
  return Array.isArray(doc.webmcp_tools) ? doc.webmcp_tools.map(String) : [];
}

/**
 * The whole command: parse, run, print TOON, and return the exit code.
 * @param {string[]} argv
 * @param {{ repo?: string, cwd?: string, write?: (text: string) => void }} [io]
 * @returns {Promise<number>}
 */
export async function main(argv, { repo = REPO, cwd = process.cwd(), write = (text) => process.stdout.write(text) } = {}) {
  try {
    const options = parseArgs(argv);
    if (options.command === "help") {
      write(`${USAGE}\n`);
      return 0;
    }
    const result = await runCheck(options, { repo, cwd });
    write(`${toon({ page: result.page, summary: result.summary, checks: result.checks, shots: result.shots, log: result.log, help: result.help })}\n`);
    return result.summary.verdict === "pass" ? 0 : 1;
  } catch (error) {
    if (error instanceof UsageError) {
      write(`${toon({ error: error.message, help: error.help })}\n`);
      return 2;
    }
    const e = /** @type {Error} */ (error);
    write(`${toon({ error: `page-axi crashed: ${String(e.message).split("\n")[0]}`, help: ["Rerun once; if it fails again, report the error with the command line"] })}\n`);
    return 2;
  }
}
