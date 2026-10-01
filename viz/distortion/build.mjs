/* Build the Structural Distortion Explorer into one self-contained page.
 *
 * Inputs (checked in next to this file):
 *   template.html        markup, styles and page code, with the markers below
 *   kinematics.js        the pure kinematics (also run by the tests)
 *   raw.json             published metadata: effects, presets, three.js version
 *   vendor/three.min.js  three.js r186 with OrbitControls (MIT), see README.md
 *
 * Output:
 *   index.html           the template with all three inlined; works offline
 *
 *   node build.mjs          write index.html
 *   node build.mjs --check  exit 1 if index.html is stale
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf8");

export function buildPage() {
  const parts = {
    "/*@THREE@*/": read("vendor/three.min.js"),
    "/*@KINEMATICS@*/": read("kinematics.js"),
    "/*@DATA@*/": JSON.stringify(JSON.parse(read("raw.json"))).replace(/</g, "\\u003c"),
  };
  let html = read("template.html");
  for (const [marker, text] of Object.entries(parts)) {
    if (/<\/script/i.test(text)) throw new Error(`${marker} source must not contain </script`);
    if (html.split(marker).length !== 2) throw new Error(`template.html must contain ${marker} exactly once`);
    html = html.replace(marker, () => text);
  }
  return html;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const html = buildPage(), out = join(HERE, "index.html");
  if (process.argv.includes("--check")) {
    let current = "";
    try { current = readFileSync(out, "utf8"); } catch { /* missing counts as stale */ }
    if (current !== html) { console.error("visuals/distortion/index.html is stale: run node visuals/distortion/build.mjs"); process.exit(1); }
  } else writeFileSync(out, html);
}
