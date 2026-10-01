/* Build the Entropy Methods in Combinatorics Lab into one self-contained page.
 *
 * Inputs (checked in next to this file):
 *   template.html     page markup, with the markers below
 *   src/style.css     styles
 *   src/engine.js     the pure maths: exact counts, entropies, bounds (EntropyLab)
 *   src/lessons.js    the lessons, problems, comparisons, decks and self-tests (EntropyLessons)
 *   src/render.js     the small Markdown and TeX-subset renderer (EntropyRender)
 *   src/widgets.js    the interactive pictures (EntropyWidgets)
 *   src/ui.js         routing, modes, palette, BeamMD Switch, presentation, WebMCP tools
 *
 * Outputs:
 *   index.html        the template with everything inlined, and the no-JavaScript reference
 *                     rendered from the lessons now, so its numbers are the engine's
 *   raw.json          catalogue data, published as data.json
 *
 *   node build.mjs          write index.html and raw.json
 *   node build.mjs --check  exit 1 if either is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf8");
const require = createRequire(import.meta.url);
const E = require("./src/engine.js"), Ls = require("./src/lessons.js"), R = require("./src/render.js");

const md = (t) => R.md(t);
const m = (t) => `<span class="math" role="math">${R.tex(t)}</span>`;

/* The no-JavaScript reference (spec §76): intro, concept map, inequalities, the binomial proof,
   Shearer, Loomis–Whitney, Bregman's proof architecture, techniques, problems, master workflow. */
export function fallback() {
  const lesson = (id) => Ls.byId(id);
  const proof = (l) => `<ol class="proof">${l.proof.map((s) => `<li><div>${md(s.md)}</div><span class="tag">${R.esc(s.why)}</span></li>`).join("")}</ol>`;
  const section = (id, title, body) => `<section class="card" id="${id}"><h2>${R.esc(title)}</h2>${body}</section>`;
  const theoremBlock = (id) => { const l = lesson(id); return `${md(l.problem)}${md(l.theorem)}${proof(l)}<div class="clever"><b>Clever move.</b> ${md(l.clever)}</div>${md(l.example(E).md)}`; };
  const flow = (steps) => `<ol class="flowline">${steps.map((s) => `<li>${R.esc(s)}</li>`).join("")}</ol>`;
  return `<article class="lesson nojs">
<p class="eyebrow">Reference edition: turn on JavaScript for the interactive lab, problems, comparisons and presentation.</p>
<h1 tabindex="-1">Entropy Methods in Combinatorics</h1>
${section("intro", "Entropy as a counting technology", `<p>To count a finite family ${m("\\mathcal F")}, choose an object ${m("X")} uniformly at random. Then ${m("H(X)=\\log_2|\\mathcal F|")}: the count is an information budget. Encode ${m("X")} by coordinates, bound the information they carry with entropy inequalities, and exponentiate.</p>` +
    flow(["COMBINATORIAL FAMILY", "sample uniformly → RANDOM OBJECT X", "choose coordinates → (X₁,…,Xₙ)", "information inequality → ENTROPY BOUND", "H(X) = log |𝓕| → COUNTING BOUND"]))}
${section("concept-map", "Concept map", `<pre>${R.esc(`                    COMBINATORIAL FAMILY 𝓕
                            │
                  SAMPLE X UNIFORMLY:  H(X) = log |𝓕|
                            │
                    CHOOSE COORDINATES
          ┌─────────────────┼─────────────────┐
       SUPPORT           CONDITIONING      PROJECTIONS
       BOUNDS               │                 │
          │             CHAIN RULE          SHEARER
          │                 │                 │
          │          RANDOM REVEAL      LOOMIS–WHITNEY
          │                 │
   BINOMIAL BOUNDS       BREGMAN
          │
        TYPES → ASYMPTOTIC COUNTING`)}</pre>`)}
${section("inequalities", "Fundamental entropy inequalities", `<ul>${Ls.ATLAS.map((a) => `<li><b>${R.esc(a.name)}:</b> ${m(a.tex)}</li>`).join("")}</ul>`)}
${section("binomial", "Entropy proof of the binomial bound", theoremBlock("binomial"))}
${section("shearer", "Shearer's inequality", theoremBlock("shearer"))}
${section("loomis-whitney", "Loomis–Whitney", theoremBlock("loomis-whitney"))}
${section("bregman", "Bregman's theorem: proof architecture", `${md(lesson("bregman").theorem)}<p>Random reveal ordering:</p>${flow(Ls.architecture(lesson("random-reveal")))}${proof(lesson("bregman"))}${md(lesson("bregman").example(E).md)}`)}
${section("techniques", "Technique index", `<ul class="tindex">${Ls.TECHNIQUES.map((t) => `<li>${R.esc(t)}</li>`).join("")}</ul>`)}
${section("problems", "Problem ladder", `<ol>${Ls.PROBLEMS.map((p) => `<li>${R.esc(p.title)} <span class="muted">(${R.esc(p.technique)})</span></li>`).join("")}</ol>`)}
${section("workflow", "The master workflow", flow(["COUNT", "RANDOMIZE", "ENCODE", "DECOMPOSE INFORMATION", "THROW AWAY ONLY THE DEPENDENCE YOU CAN AFFORD", "BOUND LOCAL UNCERTAINTY", "ADD INFORMATION COSTS", "EXPONENTIATE"]) +
    `<p>The three reusable moves: <b>chain rule</b> (reveal an object progressively), <b>Shearer</b> (bound an object through overlapping partial views) and <b>random reveal order</b> (make local conditional uncertainty average to something tractable).</p>`)}
</article>`;
}
const NAV = `<h2>Reference</h2><ul>${[["intro", "Entropy as counting"], ["concept-map", "Concept map"], ["inequalities", "Inequalities"], ["binomial", "Binomial bound"], ["shearer", "Shearer"], ["loomis-whitney", "Loomis–Whitney"], ["bregman", "Bregman"], ["techniques", "Techniques"], ["problems", "Problems"], ["workflow", "Workflow"]].map(([id, l]) => `<li><a href="#${id}"><span class="dot" aria-hidden="true"></span>${l}</a></li>`).join("")}</ul>`;

export function buildPage() {
  const parts = {
    "/*@STYLE@*/": read("src/style.css"),
    "/*@ENGINE@*/": read("src/engine.js"),
    "/*@LESSONS@*/": read("src/lessons.js"),
    "/*@RENDER@*/": read("src/render.js"),
    "/*@WIDGETS@*/": read("src/widgets.js"),
    "/*@UI@*/": read("src/ui.js"),
    "<!--@NAV@-->": NAV,
    "<!--@FALLBACK@-->": fallback(),
  };
  let html = read("template.html");
  for (const [marker, text] of Object.entries(parts)) {
    if (/<\/script/i.test(text)) throw new Error(`${marker} source must not contain </script`);
    if (html.split(marker).length !== 2) throw new Error(`template.html must contain ${marker} exactly once`);
    html = html.replace(marker, () => text);
  }
  return html;
}

/* Catalogue data: what the lab teaches and the finite checks it reports, from the engine. */
export function buildData() {
  const big = (k, v) => (typeof v === "bigint" ? v.toString() : typeof v === "number" && !Number.isFinite(v) ? null : v);
  const data = {
    title: "Entropy Methods in Combinatorics Lab",
    url: "https://teoyujie.org/visuals/entropy-combinatorics/",
    note: "Generated by build.mjs from src/; the page never fetches this file. Counts are exact integers written as strings; bounds are floating point.",
    lessons: Ls.LESSONS.map((l) => ({ id: l.id, title: l.title, group: l.group, technique: l.technique, difficulty: l.difficulty, prerequisites: l.prereq, related: l.related, theorem: l.theorem, check: l.example(E).rows })),
    labs: Ls.LABS.map((l) => ({ id: l.id, title: l.title, lesson: l.lesson })),
    problems: Ls.PROBLEMS,
    comparisons: Ls.COMPARISONS.map((c) => ({ id: c.id, title: c.title, lesson: c.lesson, numbers: c.numbers() })),
    presets: { matchings: Ls.MATCHINGS, points3: Object.fromEntries(Object.entries(Ls.POINTS3).map(([k, v]) => [k, { label: v.label, points: v.pts() }])), covers4: Ls.COVERS4, cover_candidates: Ls.COVER_CANDIDATES, hyperedges: Ls.HYPEREDGES },
    self_tests: Ls.selfTests().map(({ name, pass }) => ({ name, pass })),
  };
  return JSON.stringify(data, big, 1) + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outputs = [["index.html", buildPage()], ["raw.json", buildData()]];
  if (process.argv.includes("--check")) {
    let stale = false;
    for (const [name, text] of outputs) {
      let current = "";
      try { current = read(name); } catch { /* missing counts as stale */ }
      if (current !== text) { console.error(`visuals/entropy-combinatorics/${name} is stale: run node visuals/entropy-combinatorics/build.mjs`); stale = true; }
    }
    if (stale) process.exit(1);
  } else for (const [name, text] of outputs) writeFileSync(join(HERE, name), text);
}
