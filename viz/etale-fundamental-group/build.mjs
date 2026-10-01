// Build index.html and raw.json from src/: inline the stylesheet, the engine, the shared beamdswitch template and
// the page script (src/ui/*.js, in name order) into src/template.html, and write the no-JavaScript dictionary, Szamuely map and
// results table from the engine's own data so the static page and the laboratory never disagree.
//   node build.mjs          writes index.html
//   node build.mjs --check  exits 1 when index.html is stale
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const here = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(here(p), "utf8");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* What the page recomputes for each row of the results table when it loads (see ui.js, runChecks). */
export const CHECKS = {
  "spec-c": "every ℂ[x]/(f) splits into deg f separate points",
  "spec-r": "conjugation swaps the roots ±i of x² + 1",
  "spec-fq": "the Frobenius orbit of a generator α of the field with 2ⁿ elements closes after exactly n steps",
  p1: "Riemann–Hurwitz: an unramified connected degree-d cover would have genus 1 − d < 0",
  a1: "z ↦ zⁿ still collides over 0 ∈ 𝔸¹: one point, not n",
  gm: "lifting the loop round 0 through xⁿ = t gives an n-cycle",
  "p1-3": "lifted loops satisfy γ₀γ₁γ∞ = 1; the S₃ Schreier graph is transitive on 6 points",
  "genus-g": "the 4g-gon glues to one vertex: χ = 2 − 2g",
  "punctured-g": "free rank 2g + r − 1 = 1 − χ",
  elliptic: "|E[n]| = n² and n·E[n] ⊂ Λ",
  abelian: "|A[n]| = n²ᵍ",
  "a1-p": "∂/∂y(yᵖ − y − t) = −1; Frobenius acts on the fibre as y ↦ y + t",
  ordinary: "Hasse invariant ≢ 0 (≡ a_p mod p): T_p ≅ ℤ_p, rank 1",
  supersingular: "Hasse invariant ≡ 0 (≡ a_p mod p): étale T_p = 0",
};

/* The catalogue data published as data.json: the computations, objects, dictionary and references. */
export function raw() {
  const E = createRequire(import.meta.url)("./src/engine.js");
  const data = {
    title: "Étale Fundamental Group — From Loops to Covers to Galois Symmetry",
    schema: "etale-fundamental-group",
    version: 1,
    reference: { book: "Tamás Szamuely, Galois Groups and Fundamental Groups", series: "Cambridge Studies in Advanced Mathematics 117", publisher: "Cambridge University Press", year: 2009, chapters: E.SZAMUELY.map(({ chapter, title, topics }) => ({ chapter, title, topics })), note: "Chapter-level citations only." },
    results: E.RESULTS.map((r) => ({ ...r, checked_here: CHECKS[r.id] })),
    extra_pictures: E.EXTRA_PICTURES,
    objects: E.OBJECTS,
    dictionary: { columns: ["field theory", "topology", "algebraic geometry"], rows: E.DICTIONARY },
    progression: E.PROGRESSION,
    characteristic_p: {
      "A1": "π₁ᵉᵗ(𝔸¹) in characteristic p is not finitely generated; the page shows its Artin–Schreier ℤ/p quotients only.",
      elliptic: "Prime-to-p Tate modules T_ℓ have rank 2; the étale T_p has rank 1 (ℤ_p) for an ordinary curve and rank 0 for a supersingular one.",
    },
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function build() {
  const engine = read("src/engine.js"), require = createRequire(import.meta.url);
  const E = require("./src/engine.js");
  const dict = [
    '<table class="dict">',
    "<thead><tr><th>Field theory</th><th>Topology</th><th>Algebraic geometry</th></tr></thead>",
    "<tbody>",
    ...E.DICTIONARY.map((row) => `<tr>${row.map((c) => `<td class="m">${esc(c)}</td>`).join("")}</tr>`),
    "</tbody></table>",
  ].join("\n");
  const results = [
    "<table>",
    "<thead><tr><th>X</th><th>Assumptions</th><th>π₁ᵉᵗ</th><th>Picture</th><th>Checked here</th></tr></thead>",
    "<tbody>",
    ...E.RESULTS.map((r) => `<tr id="res-${r.id}"><td class="m">${esc(r.X)}</td><td>${esc(r.assumptions)}</td><td class="m">${esc(r.answer)}</td><td>${esc(r.picture)} <span class="badge ${r.kind}">${r.kind === "literal" ? "literal" : r.kind === "analogy" ? "model" : "schematic"}</span></td><td>${esc(CHECKS[r.id])} <span class="chk" id="chk-${r.id}"></span></td></tr>`),
    "</tbody></table>",
  ].join("\n");
  const szam = [
    '<div class="cmap">',
    ...E.SZAMUELY.map((c) => `<div class="card" data-ch="${c.chapter}"><h3>Chapter ${c.chapter}: ${esc(c.title)}</h3><ul>${c.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><div class="anchors js-only">${c.anchors.map((a) => `<button type="button" data-anchor="${a}">${esc(E.OBJECTS[a]?.name ?? (a === "fibre" ? "fibre functor" : "monodromy"))}</button>`).join("")}</div></div>`),
    "</div>",
  ].join("\n");
  const fill = { STYLE: read("src/style.css").trimEnd(), DICTIONARY: dict, RESULTS: results, SZAMUELY: szam, ENGINE: engine, BEAMDSWITCH: read("beamdswitch.js"), UI: readdirSync(here("src/ui/")).filter((f) => f.endsWith(".js")).sort().map((f) => read(`src/ui/${f}`)).join("") };
  return read("src/template.html").replace(/@([A-Z]+)@/g, (m, k) => (k in fill ? fill[k] : m));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = build(), data = raw();
  if (process.argv.includes("--check")) {
    if (read("index.html") !== html || read("raw.json") !== data) { console.error("index.html or raw.json is stale: run node build.mjs"); process.exit(1); }
  } else { writeFileSync(here("index.html"), html); writeFileSync(here("raw.json"), data); }
}
