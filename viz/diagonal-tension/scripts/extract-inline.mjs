// Copies the page's own inline <script> blocks, in order, into .typecheck/inline/ (gitignored) so tsc can check
// them as global scripts: later blocks see earlier declarations, as they do in the page. Run by `npm run typecheck`.
// Usage: node scripts/extract-inline.mjs <page.html> [id of a block to skip ...]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const [page, ...skip] = process.argv.slice(2);
if (!page) throw new Error("usage: node scripts/extract-inline.mjs <page.html> [skipped block id ...]");
const html = readFileSync(page, "utf8");
const out = new URL("../.typecheck/inline/", import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let n = 0;
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = m[1], id = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? `script-${n}`;
  if (/\bsrc=/.test(attrs) || /type="(?!text\/plain|text\/javascript|module)/.test(attrs) || skip.includes(id)) continue;
  // Line k of the copy is line (line + k - 2) of the page, so tsc's line numbers map straight back.
  const line = html.slice(0, (m.index ?? 0) + m[0].indexOf(">") + 1).split("\n").length;
  const name = `${String(++n).padStart(2, "0")}-${id}.js`;
  writeFileSync(new URL(name, out), `// ${page}:${line}, <script${attrs}>: extracted for type checking only.\n${m[2]}`);
}
console.log(`extracted ${n} inline scripts from ${page} into .typecheck/inline/`);
