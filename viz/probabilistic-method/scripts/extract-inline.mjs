// Copies the page's own inline <script> blocks out of template.html, in order, into .typecheck/inline/<id>.js so
// tsc can check them as global scripts. Skips the blocks build.mjs fills in: the engine and page code are
// checked at their sources in src/, and beamdswitch.js is a verbatim copy left out of the check.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".typecheck", "inline");
const html = readFileSync(join(root, "template.html"), "utf8");
const JS_TYPES = new Set(["", "text/javascript", "application/javascript"]);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attr = (/** @type {string} */ name) => new RegExp(`\\b${name}="([^"]*)"`).exec(m[1])?.[1];
  const id = attr("id"), type = (attr("type") ?? "").toLowerCase();
  if (!JS_TYPES.has(type) || /^\s*\/\*@[A-Z]+@\*\/\s*$/.test(m[2])) continue;
  if (!id) throw new Error("Every inline script in template.html needs an id to name its extracted copy.");
  const line = html.slice(0, /** @type {number} */ (m.index)).split("\n").length;
  writeFileSync(join(out, `${id}.js`), `// From template.html, <script id="${id}"> at line ${line}.\n${m[2]}\n`);
}
