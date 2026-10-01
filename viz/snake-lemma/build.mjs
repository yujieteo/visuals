/* Build the Snake Lemma visual into one self-contained page.
 *
 *   src/template.html  markup and styles, with /*@ENGINE@*\/, /*@BEAMDSWITCH@*\/ and /*@UI@*\/ markers
 *   src/engine.js      the pure mathematical core (also loaded directly by the tests)
 *   src/ui.js          the page: rendering, routing, presentation, export, WebMCP
 *   beamdswitch.js     the site's report template, an unchanged copy of templates/beamdswitch.js
 *
 * Outputs index.html (every script inlined; works offline from file://) and raw.json (the engine's
 * catalogue, published as data.json).
 *
 *   node build.mjs          write both outputs
 *   node build.mjs --check  exit 1 if either output is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");

export function build() {
  const parts = { ENGINE: read("src/engine.js"), BEAMDSWITCH: read("beamdswitch.js"), UI: read("src/ui.js") };
  let html = read("src/template.html");
  for (const [name, src] of Object.entries(parts)) {
    if (/<\/script/i.test(src)) throw new Error(`${name} must not contain </script`);
    const marker = `/*@${name}@*/`;
    if (html.split(marker).length !== 2) throw new Error(`template.html needs exactly one ${marker}`);
    html = html.replace(marker, () => src);
  }
  const SL = createRequire(import.meta.url)(join(HERE, "src/engine.js"));
  const raw = JSON.stringify(SL.catalogue(), null, 2) + "\n";
  return { "index.html": html, "raw.json": raw };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = build(), check = process.argv.includes("--check");
  let stale = false;
  for (const [file, text] of Object.entries(out)) {
    let cur = null;
    try { cur = read(file); } catch { /* missing */ }
    if (cur === text) continue;
    if (check) { console.error(`${file} is stale: run node build.mjs`); stale = true; }
    else { writeFileSync(join(HERE, file), text); console.log(`wrote ${file}`); }
  }
  if (stale) process.exit(1);
}
