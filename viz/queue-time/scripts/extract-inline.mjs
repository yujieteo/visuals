// Copies the page's own inline <script> blocks out of index.html, in order, into .typecheck/inline/<id>.js
// so tsc can check them as global scripts. Skips the verbatim beamdswitch copy and non-JavaScript blocks.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".typecheck", "inline");
const html = readFileSync(join(root, "index.html"), "utf8");
const JS_TYPES = new Set(["", "text/javascript", "application/javascript"]);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attr = (/** @type {string} */ name) => new RegExp(`\\b${name}="([^"]*)"`).exec(m[1])?.[1];
  const id = attr("id"), type = (attr("type") ?? "").toLowerCase();
  if (id === "beamdswitch" || !JS_TYPES.has(type)) continue;
  if (!id) throw new Error("Every inline script in index.html needs an id to name its extracted copy.");
  const line = html.slice(0, /** @type {number} */ (m.index)).split("\n").length;
  writeFileSync(join(out, `${id}.js`), `// From index.html, <script id="${id}"> at line ${line}.\n${m[2]}\n`);
}
