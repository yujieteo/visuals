// Type-check visuals, each as its own tsc project, so one visual's globals and errors never reach another's.
// For each viz/<slug>/ with a tsconfig.json (which extends ../../tsconfig.base.json): copy the page's own
// inline <script> blocks, in page order, into viz/<slug>/.typecheck/inline/ (ignored by Git), where that
// tsconfig.json includes them (".typecheck/inline/*.js") as global scripts, then run the pinned tsc on it.
// visual.json "typecheck" names the page (index.html when absent) and the ids of blocks to leave out: a
// builder's inlined copies of src/*.js, which tsc checks from src/ instead, and the beamdswitch and report
// templates that must stay byte-identical to the site's.
// Usage: node scripts/typecheck.mjs SLUG...   (after npm ci; scripts/check.py runs it per visual)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);

/**
 * The page's own inline scripts, in page order, as files to type-check: blocks with a src, a data type
 * (anything but text/javascript, text/plain or module) or a skipped id are left out. Each file starts with
 * a one-line header naming the page line of its <script> tag, start; its line k is page line start + k - 2.
 * @param {string} html
 * @param {string} page the page's name, for the header comment
 * @param {string[]} [skip] ids of blocks to leave out
 * @returns {{ name: string, text: string }[]}
 */
export function extract(html, page, skip = []) {
  /** @type {{ name: string, text: string }[]} */
  const files = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1];
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? `script-${files.length + 1}`;
    if (/\bsrc=/.test(attrs) || /\btype="(?!text\/plain"|text\/javascript"|module")/.test(attrs) || skip.includes(id)) continue;
    const line = html.slice(0, (m.index ?? 0) + m[0].indexOf(">") + 1).split("\n").length;
    const name = `${String(files.length + 1).padStart(2, "0")}-${id}.js`;
    files.push({ name, text: `// ${page}:${line}, <script${attrs}>: extracted for type checking only.\n${m[2]}` });
  }
  return files;
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
  const files = extract(readFileSync(new URL(page, folder), "utf8"), page, meta.typecheck?.skip);
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
