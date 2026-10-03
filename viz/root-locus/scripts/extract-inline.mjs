// Copies the page's own inline <script> blocks out of index.html, in order, into .typecheck/inline/ so tsc can
// check them as global scripts: a block with an id as <id>.js, one without as script-<n>.js (n counts from 1).
// Skips the verbatim beamdswitch.js copy and non-JavaScript blocks.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".typecheck", "inline");
const html = readFileSync(join(root, "index.html"), "utf8");
const JS_TYPES = new Set(["", "text/javascript", "application/javascript"]);
const beamdswitch = readFileSync(join(root, "beamdswitch.js"), "utf8").trim();

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let n = 0;
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  n++;
  const attr = (/** @type {string} */ name) => new RegExp(`\\b${name}="([^"]*)"`).exec(m[1])?.[1];
  const id = attr("id"), type = (attr("type") ?? "").toLowerCase();
  if (!JS_TYPES.has(type) || m[2].trim() === beamdswitch) continue;
  const name = id ?? `script-${n}`;
  const line = html.slice(0, /** @type {number} */ (m.index)).split("\n").length;
  writeFileSync(join(out, `${name}.js`), `// From index.html, <script${id ? ` id="${id}"` : ""}> at line ${line}.\n${m[2]}\n`);
}
