// Type-check visuals, each as its own tsc project, so one visual's globals and errors never reach another's.
// For each viz/<slug>/ with a tsconfig.json (which extends ../../tsconfig.base.json): copy the page's own
// inline <script> blocks, in page order, into viz/<slug>/.typecheck/inline/<id>.js (ignored by Git), where that
// tsconfig.json includes them (".typecheck/inline/*.js") as global scripts, then run the pinned tsc on it.
// visual.json "typecheck" says what to read and what to leave out: "page" is the HTML the scripts come
// from (index.html when absent; a builder's template when the page inlines src/ files tsc checks directly),
// and "skip" names blocks by id, or by a folder file whose inlined copy is left out (an entry ending in .js,
// such as the beamdswitch template that must stay byte-identical to the site's). A block holding only a
// build placeholder, such as @@ENGINE@@ or /*@UI@*/, and a vendored block (data-vendor, such as the MathJax that
// scripts/visual_build.py embeds; scripts/rules.py checks it is unchanged) are always left out.
// Usage: node scripts/typecheck.mjs [SLUG...]   (after npm ci; scripts/check.py runs it per visual; with no
// slug it checks the shared tooling, tsconfig.json, which is `npm run typecheck`)
//        node scripts/typecheck.mjs --summary [SLUG...] [--file PATH] [--since REF] [--scoped] [--first N]
// --summary runs tsc --pretty false on the shared tooling and every visual with a tsconfig.json (or only the
// named ones), writes tsc's full output to build/logs/, and prints one TOON verdict: totals, errors by code
// and by file, the first N errors in a stable order, and next steps. An error in an extracted inline script
// is reported at its page line. --file and --since filter the errors shown; the verdict and the exit code
// still count every error in every project unless --scoped, and then the output says how much lies outside.
// Exit 0: no error counted; 1: an error counted, or projects left out without --scoped; 2: usage or
// environment error (no tsc, a missing path, an unknown ref, a filter or slug that matches nothing).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);

/** A block holding only a builder's placeholder for an inlined source file. */
const PLACEHOLDER = /^\s*(?:@@[A-Z_]+@@|\/\*@[A-Z_]+@\*\/)\s*$/;

/**
 * The page's own inline scripts, in page order, as files to type-check, each named after its block's id,
 * or script-<n> for the n-th <script> tag when it has none, so tests and .d.ts files can import one by
 * name. Left out: blocks with a src, a data type (anything but text/javascript, application/javascript,
 * text/plain or module), a data-vendor attribute, a skipped id, text identical to a skipped file's (``files``,
 * trimmed), or only a placeholder. Each file starts with a one-line header naming the page line of its <script> tag, start;
 * its line k is page line start + k - 2.
 * @param {string} html
 * @param {string} page the page's name, for the header comment
 * @param {string[]} [skip] ids of blocks to leave out
 * @param {string[]} [files] trimmed texts of folder files whose inlined copies are left out
 * @returns {{ name: string, text: string }[]}
 */
export function extract(html, page, skip = [], files = []) {
  /** @type {{ name: string, text: string }[]} */
  const out = [];
  let n = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1], body = m[2];
    n++;
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? `script-${n}`;
    if (/\bsrc=/.test(attrs) || /\bdata-vendor=/.test(attrs) || /\btype="(?!text\/plain"|text\/javascript"|application\/javascript"|module")/.test(attrs)) continue;
    if (skip.includes(id) || files.includes(body.trim()) || PLACEHOLDER.test(body)) continue;
    const line = html.slice(0, (m.index ?? 0) + m[0].indexOf(">") + 1).split("\n").length;
    out.push({ name: `${id}.js`, text: `// ${page}:${line}, <script${attrs}>: extracted for type checking only.\n${body}` });
  }
  return out;
}

/**
 * Copy one visual's inline scripts to viz/<slug>/.typecheck/inline/; return how many and from which page.
 * @param {string} slug
 */
function prepare(slug) {
  const folder = new URL(`viz/${slug}/`, ROOT);
  const meta = JSON.parse(readFileSync(new URL("visual.json", folder), "utf8"));
  const page = meta.typecheck?.page ?? "index.html";
  /** @type {string[]} */
  const skip = meta.typecheck?.skip ?? [];
  const skipFiles = skip.filter((entry) => entry.endsWith(".js")).map((file) => readFileSync(new URL(file, folder), "utf8").trim());
  const files = extract(readFileSync(new URL(page, folder), "utf8"), page, skip, skipFiles);
  const out = new URL(".typecheck/inline/", folder);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const { name, text } of files) writeFileSync(new URL(name, out), text);
  return { count: files.length, page };
}

const TSC = fileURLToPath(new URL("node_modules/.bin/tsc", ROOT));

/**
 * Extract one visual's inline scripts and run tsc on its tsconfig.json; return tsc's exit status.
 * @param {string} slug
 */
function typecheck(slug) {
  if (!existsSync(new URL(`viz/${slug}/tsconfig.json`, ROOT))) {
    console.error(`viz/${slug}/tsconfig.json is missing`);
    return 1;
  }
  const { count, page } = prepare(slug);
  console.log(`viz/${slug}: ${count} inline script(s) from ${page}`);
  return spawnSync(TSC, ["-p", fileURLToPath(new URL(`viz/${slug}/tsconfig.json`, ROOT))], { stdio: "inherit" }).status ?? 1;
}

/** @typedef {{ file: string, line: number, col: number, code: string, message: string }} TscError */

/**
 * The errors in one project's `tsc --pretty false` output; a message's indented continuation lines join its
 * first line. An error that names no file (error TS18003: No inputs were found ...) is put at the project, and
 * a non-zero exit with no error found becomes one, so a failed tsc run never counts as clean.
 * @param {string} output
 * @param {string} [project] the tsconfig.json the output is from
 * @param {number | null} [status] tsc's exit status (null when a signal stopped it)
 * @returns {TscError[]}
 */
export function parse(output, project = "tsconfig.json", status = 0) {
  /** @type {TscError[]} */
  const errors = [];
  for (const line of output.split(/\r?\n/)) {
    const m = /^(?:(.+?)\((\d+),(\d+)\): )?error (TS\d+): (.*)$/.exec(line);
    if (m) errors.push({ file: m[1]?.replaceAll("\\", "/") ?? project, line: Number(m[2] ?? 0), col: Number(m[3] ?? 0), code: m[4], message: m[5] });
    else if (errors.length && /^\s+\S/.test(line)) errors[errors.length - 1].message += ` ${line.trim()}`;
  }
  if (status !== 0 && !errors.length) errors.push({ file: project, line: 0, col: 0, code: "exit", message: `tsc exited ${status ?? "on a signal"} with no error it could parse; read the log` });
  return errors;
}

/**
 * Move an error in viz/<slug>/.typecheck/inline/<block>.js to its page line, read from the block's header
 * ("// <page>:<start>, ..."): line k of the block is page line start + k - 2.
 * @param {TscError} error
 * @param {(file: string) => string | undefined} header the first line of a file, when it exists
 * @returns {TscError}
 */
export function toPage(error, header) {
  const m = /^(viz\/[^/]+\/)\.typecheck\/inline\/[^/]+\.js$/.exec(error.file);
  const start = m && /^\/\/ (.+?):(\d+), /.exec(header(error.file) ?? "");
  if (!m || !start || error.line < 2) return error;
  return { ...error, file: m[1] + start[1], line: Number(start[2]) + error.line - 2 };
}

/** @param {TscError} a @param {TscError} b */
const byPlace = (a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || a.col - b.col || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

/**
 * One value of a TOON row: quoted when it holds a separator, a quote, or space at its ends.
 * @param {string | number} value
 */
export function cell(value) {
  const text = String(value);
  return /[,"\n:]|^\s|\s$|^$/.test(text) ? JSON.stringify(text) : text;
}

/**
 * A TOON table: name[n]{fields}: and one indented row per item.
 * @param {string} name
 * @param {string[]} fields
 * @param {(string | number)[][]} rows
 */
export function table(name, fields, rows) {
  return [`${name}[${rows.length}]{${fields.join(",")}}:`, ...rows.map((row) => `  ${row.map(cell).join(",")}`)].join("\n");
}

/**
 * The summary of every error: counts by code and by file (most first, then by name), the first `first` in
 * place order, and the scope: `shown` keeps the errors a filter selects. The verdict counts every error
 * unless `scoped`, and an unchecked project fails it unless `scoped`.
 * @param {TscError[]} errors
 * @param {{ shown?: (e: TscError) => boolean, first?: number, scoped?: boolean, filter?: string, projects: number, total: number, log: string }} opts
 */
export function summarize(errors, { shown = () => true, first = 20, scoped = false, filter = "", projects, total, log }) {
  const all = [...errors].sort(byPlace);
  const kept = all.filter(shown);
  const counted = scoped ? kept : all;
  const unchecked = total - projects;
  const fail = counted.length > 0 || (!scoped && unchecked > 0);
  /** @param {TscError[]} list @param {(e: TscError) => string} key */
  const tally = (list, key) => {
    /** @type {Map<string, TscError[]>} */
    const groups = new Map();
    for (const e of list) groups.set(key(e), [...(groups.get(key(e)) ?? []), e]);
    return [...groups].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
  };
  const byFile = tally(kept, (e) => e.file);
  const lines = [
    `verdict: ${fail ? "fail" : "pass"}${scoped ? " (scoped: counts only the errors the filter selects)" : ""}`,
    `scope{filter,errors_shown,errors_total,projects_checked,projects_total,outside_scope}:`,
    `  ${[filter || "none", kept.length, all.length, projects, total, all.length - kept.length].map(cell).join(",")}`,
    `totals{errors,files}:`,
    `  ${counted.length},${new Set(counted.map((e) => e.file)).size}`,
    table("by_code", ["code", "count", "example"], tally(kept, (e) => e.code).map(([code, list]) => [code, list.length, list[0].message])),
    table("by_file", ["file", "count"], byFile.map(([file, list]) => [file, list.length])),
    table("first", ["file_line", "code", "message"], kept.slice(0, first).map((e) => [`${e.file}:${e.line}`, e.code, e.message])),
    `log: ${log}`,
  ];
  /** @type {string[]} */
  const help = [];
  if (byFile.length > 1) help.push(`Run \`npm run typecheck -- --summary --file ${byFile[0][0]}\` to see only the file with the most errors`);
  if (kept.length > first) help.push(`Run with --first ${kept.length} to list every shown error, or read ${log}`);
  if (!scoped && unchecked > 0) help.push(`${unchecked} project(s) were not checked; run without slugs for the full verdict, or pass --scoped to accept a verdict on the named ones only`);
  if (!scoped && kept.length < all.length) help.push(`${all.length - kept.length} error(s) lie outside the filter and still fail the verdict; pass --scoped to count only the filtered ones`);
  if (!fail) help.push("No type errors counted; run `python3 scripts/check.py --toon --changed --scoped` for the other checks");
  lines.push(table("help", ["next"], help.map((h) => [h])));
  return { text: lines.join("\n"), code: fail ? 1 : 0 };
}

/** The slugs of the visuals with a tsconfig.json, sorted. */
function typedVisuals() {
  return readdirSync(new URL("viz/", ROOT), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(new URL(`viz/${d.name}/tsconfig.json`, ROOT)))
    .map((d) => d.name)
    .sort();
}

/** @param {string[]} args */
function git(args) {
  return spawnSync("git", args, { cwd: fileURLToPath(ROOT), encoding: "utf8" });
}

/**
 * The --summary command; returns the exit code. Throws UsageError for a usage or environment error.
 * @param {string[]} argv the arguments after --summary
 */
function summary(argv) {
  /** @type {string[]} */
  const slugs = [];
  let file = "", since = "", scoped = false, first = 20;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--scoped") scoped = true;
    else if (arg === "--file" || arg === "--since" || arg === "--first") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`${arg} needs a value`);
      if (arg === "--file") file = value.replace(/^\.\//, "");
      else if (arg === "--since") since = value;
      else if (!/^\d+$/.test(value)) throw new UsageError("--first needs a whole number");
      else first = Number(value);
    } else if (arg.startsWith("--")) throw new UsageError(`unknown option ${arg}`);
    else slugs.push(arg);
  }
  if (!existsSync(TSC)) throw new UsageError("typescript is not installed; run npm ci at the repository root");
  const typed = typedVisuals();
  const unknown = slugs.filter((slug) => !typed.includes(slug));
  if (unknown.length) throw new UsageError(`no viz/<slug>/tsconfig.json for: ${unknown.join(", ")}`);
  const projects = slugs.length ? slugs.map((slug) => `viz/${slug}/tsconfig.json`) : ["tsconfig.json", ...typed.map((slug) => `viz/${slug}/tsconfig.json`)];
  const total = typed.length + 1;
  if (file && !existsSync(new URL(file, ROOT))) throw new UsageError(`--file ${file} does not exist (paths are relative to the repository root)`);
  /** @type {Set<string> | null} */
  let changed = null;
  if (since) {
    if (git(["rev-parse", "--verify", "--quiet", `${since}^{commit}`]).status !== 0) throw new UsageError(`--since ${since} is not a known ref`);
    const base = git(["merge-base", since, "HEAD"]).stdout.trim() || since;
    const names = [git(["diff", "--name-only", base]).stdout, git(["ls-files", "--others", "--exclude-standard"]).stdout].join("\n");
    changed = new Set(names.split("\n").filter(Boolean));
    if (!changed.size) throw new UsageError(`--since ${since}: no file changed since ${base.slice(0, 12)}, so the filter matches nothing`);
  }
  for (const project of projects) if (project !== "tsconfig.json") prepare(project.split("/")[1]);
  let output = "";
  /** @type {TscError[]} */
  const found = [];
  for (const project of projects) {
    const run = spawnSync(TSC, ["-p", project, "--pretty", "false"], { cwd: fileURLToPath(ROOT), encoding: "utf8", maxBuffer: 1 << 28 });
    if (run.error) throw new UsageError(`tsc did not run: ${run.error.message}`);
    output += `### tsc -p ${project} (exit ${run.status})\n${run.stdout}${run.stderr}`;
    found.push(...parse(`${run.stdout}\n${run.stderr}`, project, run.status));
  }
  if (file) {
    const listed = projects.flatMap((project) => spawnSync(TSC, ["-p", project, "--listFilesOnly"], { cwd: fileURLToPath(ROOT), encoding: "utf8", maxBuffer: 1 << 28 }).stdout.split("\n"));
    const want = fileURLToPath(new URL(file, ROOT));
    const inline = /^viz\/[^/]+\//.exec(file);
    const inProject = projects.includes(file) || listed.some((path) => path.trim() === want || (inline && path.trim().startsWith(fileURLToPath(new URL(`${inline[0]}.typecheck/inline/`, ROOT)))));
    if (!inProject) throw new UsageError(`--file ${file} is in none of the checked tsc projects, so the filter matches nothing`);
  }
  const header = (/** @type {string} */ path) => {
    const url = new URL(path, ROOT);
    return existsSync(url) ? readFileSync(url, "utf8").split("\n", 1)[0] : undefined;
  };
  const errors = found.map((error) => toPage(error, header));
  mkdirSync(new URL("build/logs/", ROOT), { recursive: true });
  const log = `build/logs/typecheck-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
  writeFileSync(new URL(log, ROOT), output);
  const filter = [file && `file=${file}`, since && `since=${since}`, slugs.length && `slugs=${slugs.join(" ")}`].filter(Boolean).join(" ");
  /** @param {TscError} e */
  const shown = (e) => (!file || e.file === file) && (!changed || changed.has(e.file));
  const result = summarize(errors, { shown, first, scoped, filter, projects: projects.length, total, log });
  console.log(result.text);
  return result.code;
}

class UsageError extends Error {}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--summary")) {
    try {
      process.exitCode = summary(args.filter((arg) => arg !== "--summary"));
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      console.log(`verdict: error\nerror: ${error.message}\n${table("help", ["next"], [["Run `npm run typecheck -- --summary` with no filter for the full verdict"]])}`);
      process.exitCode = 2;
    }
  } else if (!args.length) {
    process.exitCode = spawnSync(TSC, ["-p", "tsconfig.json"], { cwd: fileURLToPath(ROOT), stdio: "inherit" }).status ?? 1;
  } else {
    process.exitCode = args.map(typecheck).some((status) => status !== 0) ? 1 : 0;
  }
}
