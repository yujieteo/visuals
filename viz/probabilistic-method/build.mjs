/* Build the Probabilistic Method Atlas into one self-contained page.
 *
 * Inputs (checked in next to this file):
 *   template.html     markup and styles, with the markers below
 *   src/engine/*.js   the pure engine (numbers, modules, decks, exports, self-tests), concatenated in name order
 *   src/ui/*.js       the page code (drawing, views, events, WebMCP), concatenated in name order
 *   beamdswitch.js    the site's standard beamdswitch report template, inlined unchanged
 *
 * Output:
 *   raw.json          the catalogue (published as data.json): every module's parameters and the complete inventory
 *   index.html        everything inlined; works offline, from file:// and in an iframe; the no-JavaScript
 *                     fallback (worked example and full inventory) is rendered here from the engine itself
 *
 *   node build.mjs          write index.html
 *   node build.mjs --check  exit 1 if index.html is stale
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf8");
const concat = (dir) => readdirSync(join(HERE, dir)).filter((f) => f.endsWith(".js")).sort().map((f) => read(join(dir, f))).join("\n");

export const engineSource = () => `(function () {\n"use strict";\n${concat("src/engine")}\n})();\n`;
export const uiSource = () => `(function () {\n"use strict";\nconst PM = self.PM;\n${concat("src/ui")}\n})();\n`;

/* Load the engine (with the template) in a fresh context, as the page and the tests do. */
export function loadEngine() {
  const ctx = {}; ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(read("beamdswitch.js"), ctx);
  vm.runInContext(engineSource(), ctx);
  return ctx.PM;
}

function staticHtml(PM) {
  const e = PM.escapeHtml, mod = PM.moduleById("first-moment"), E = PM.evaluate(mod, PM.defaults(mod)), A = E.A;
  const rows = PM.INVENTORY.map((t) => `<tr><td>${t.n}</td><td>${e(t.title)}</td><td>${e(t.problem)}</td><td>${t.module ? `lab: ${e(PM.moduleById(t.module).title)}` : "not yet built"}</td></tr>`).join("\n");
  return `<p><a href="../">teoyujie.org / visuals</a></p>
<h1>Probabilistic Method Atlas</h1>
<p>A visual laboratory for the probabilistic method. The interactive labs, proof lens, deck mode and Markdown export need JavaScript; this is the static summary.</p>
<p><b>The universal proof machine:</b> random experiment → observable → dependency → inequality → deterministic consequence.</p>
<h2>Worked example: the first moment and Ramsey numbers</h2>
<ol>${mod.proof(E.P, A).map((s) => `<li>${e(s.text)}</li>`).join("")}</ol>
<p>With n = ${E.P.n} and k = ${E.P.k}: E[X] = ${e(PM.fmt(A.EX))} &lt; 1, so some red/blue colouring of K<sub>${E.P.n}</sub> has no monochromatic K<sub>${E.P.k}</sub>. A simulation could only illustrate this; the inequality proves it.</p>
<h2>Labs in this release</h2>
<ul>${PM.MODULES.map((m) => `<li><b>${e(m.title)}</b> — ${e(m.intuition)}</li>`).join("")}</ul>
<h2>Complete technique inventory</h2>
<table><thead><tr><th>#</th><th>technique</th><th>archetypal problem</th><th>status</th></tr></thead><tbody>
${rows}
</tbody></table>`;
}

/* The catalogue: what the page contains, read from the engine so it cannot drift. */
export function catalogue(PM = loadEngine()) {
  return {
    title: "Probabilistic Method Atlas", slug: "probabilistic-method", url: PM.URL_BASE, fetched: "2026-10-01",
    description: "Catalogue data for the Probabilistic Method Atlas. The page never fetches this file: it is generated from the page's own engine. Every lab (module) with its route and parameters, the complete technique inventory with stable ids (numbers 1-91 from the specification; 92 is dependent random choice, which the specification names without a number) and which lab demonstrates each, and the guided course order. Simulations in the page illustrate; the proofs rest on the displayed inequalities.",
    default_seed: PM.DEFAULT_SEED,
    modules: PM.MODULES.map((m) => ({ id: m.id, route: m.route, title: m.title, family: m.family, archetype: m.archetype, bound: m.boundTex,
      params: m.params.filter((p) => !p.hidden).map((p) => (p.options ? { key: p.key, label: p.label, default: p.def, options: p.options.map((o) => o[0]) } : { key: p.key, label: p.label, default: p.def, min: p.min, max: p.max, step: p.step })) })),
    families: PM.FAMILIES,
    inventory: PM.INVENTORY,
    course: PM.COURSE,
  };
}
export const catalogueText = () => JSON.stringify(catalogue(), null, 2) + "\n";

export function buildPage() {
  const engine = engineSource(), ui = uiSource(), beam = read("beamdswitch.js");
  const parts = { "/*@BEAMDSWITCH@*/": beam, "/*@ENGINE@*/": engine, "/*@UI@*/": ui, "<!--@STATIC@-->": staticHtml(loadEngine()) };
  let html = read("template.html");
  for (const [marker, text] of Object.entries(parts)) {
    if (marker.startsWith("/*") && /<\/script/i.test(text)) throw new Error(`${marker} source must not contain </script`);
    if (html.split(marker).length !== 2) throw new Error(`template.html must contain ${marker} exactly once`);
    html = html.replace(marker, () => text);
  }
  return html;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outputs = { "index.html": buildPage(), "raw.json": catalogueText() };
  for (const [name, text] of Object.entries(outputs)) {
    const out = join(HERE, name);
    if (process.argv.includes("--check")) {
      let current = "";
      try { current = readFileSync(out, "utf8"); } catch { /* missing counts as stale */ }
      if (current !== text) { console.error(`${name} is stale: run node build.mjs`); process.exit(1); }
    } else writeFileSync(out, text);
  }
}
