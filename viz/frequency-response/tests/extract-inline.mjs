// Copies the page's own inline <script> blocks, in order, into .typecheck/inline/ so tsc can check them as
// global scripts (later blocks see earlier declarations). Each copy keeps its source line numbers: a header
// names the source and blank lines pad the body down to the line it starts on, so tsc's line numbers are the
// page's. Blocks with src= and non-JavaScript types (JSON data) are left out.
//   node tests/extract-inline.mjs index.html
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const source = process.argv[2] ?? "index.html";
const out = ".typecheck/inline";
const html = readFileSync(source, "utf8");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let n = 0;
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = m[1], body = m[2];
  const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
  const type = /\btype="([^"]+)"/.exec(attrs)?.[1];
  if (/\bsrc=/.test(attrs) || (type && !/^(text|application)\/javascript$/.test(type))) continue;
  const line = html.slice(0, (m.index ?? 0) + m[0].indexOf(">") + 1).split("\n").length;
  const header = `// Extracted from ${source} line ${line} (<script${attrs}>) by tests/extract-inline.mjs; edit the page, not this copy.`;
  const name = `${String(++n).padStart(2, "0")}-${id ?? "script"}.js`;
  writeFileSync(`${out}/${name}`, header + "\n".repeat(Math.max(1, line - 1)) + body + "\n");
}
