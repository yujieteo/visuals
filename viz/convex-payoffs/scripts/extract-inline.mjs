// Copies each of a page's own inline <script> blocks, in order, into .typecheck/inline/ (ignored by Git) so
// that tsc checks them as global scripts: later blocks see what earlier ones declare, as in the browser.
// Usage: node scripts/extract-inline.mjs <page.html>... [--skip <id or file>,...]
// Left out: blocks with a src, blocks of a non-JavaScript type (such as embedded JSON) and the blocks --skip
// names, by id or by the file of this repository they inline verbatim (checked, or left out, on their own).
// Each copy keeps the page's line numbers (a header comment, then blank lines down to the block), so tsc's
// errors point at the page's own lines.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2), at = args.indexOf("--skip");
const pages = at < 0 ? args : args.slice(0, at), skip = at < 0 ? [] : (args[at + 1] ?? "").split(",");
const ids = new Set(skip.filter((s) => !s.endsWith(".js"))), files = skip.filter((s) => s.endsWith(".js")).map((f) => readFileSync(f, "utf8").trim());
const out = new URL("../.typecheck/inline/", import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const page of pages) {
  const html = readFileSync(page, "utf8");
  let n = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1], id = /\bid="([^"]+)"/.exec(attrs)?.[1], type = /\btype="([^"]+)"/.exec(attrs)?.[1];
    if (/\bsrc=/.test(attrs) || (type && type !== "module" && !/javascript/.test(type))) continue;
    if ((id && ids.has(id)) || files.includes(m[2].trim())) continue;
    const line = html.slice(0, m.index).split("\n").length;
    const header = `/* Extracted from ${page}, line ${line}${id ? `, <script id="${id}">` : ""}, by scripts/extract-inline.mjs: edit the page's source, not this copy. */`;
    const name = `${basename(page, ".html")}-${String(++n).padStart(2, "0")}${id ? `-${id}` : ""}.${type === "module" ? "mjs" : "js"}`;
    writeFileSync(new URL(name, out), header + (line > 1 ? "\n".repeat(line - 1) : "") + m[2]);
  }
}
