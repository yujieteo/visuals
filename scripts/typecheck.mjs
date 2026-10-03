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
// Usage: node scripts/typecheck.mjs SLUG...   (after npm ci; scripts/check.py runs it per visual)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
 * Extract one visual's inline scripts and run tsc on its tsconfig.json; return tsc's exit status.
 * @param {string} slug
 */
function typecheck(slug) {
  const folder = new URL(`viz/${slug}/`, ROOT);
  if (!existsSync(new URL("tsconfig.json", folder))) {
    console.error(`viz/${slug}/tsconfig.json is missing`);
    return 1;
  }
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
  console.log(`viz/${slug}: ${files.length} inline script(s) from ${page}`);
  const tsc = fileURLToPath(new URL("node_modules/.bin/tsc", ROOT));
  return spawnSync(tsc, ["-p", fileURLToPath(new URL("tsconfig.json", folder))], { stdio: "inherit" }).status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const slugs = process.argv.slice(2);
  if (!slugs.length) throw new Error("usage: node scripts/typecheck.mjs SLUG...");
  process.exitCode = slugs.map(typecheck).some((status) => status !== 0) ? 1 : 0;
}
