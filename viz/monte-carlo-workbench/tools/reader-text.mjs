// Print the reader text of the workbench as Markdown, one sentence group for each line, for the ASD-STE100 checker:
//   node tools/reader-text.mjs > ../../build/monte-carlo-workbench-reader.md
//   node <ste100 skill>/scripts/ste-axi.mjs check ../../build/monte-carlo-workbench-reader.md
// It reads raw.json and src/body.html: the catalogue texts and the page's own prose, without TeX, code or the
// owner's specification.
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../raw.json", import.meta.url), "utf8"));
const out = [];
/** @param {string} title @param {unknown[]} texts */
const section = (title, texts) => {
  out.push(`## ${title}`, "");
  for (const t of texts.flat()) if (typeof t === "string" && t.trim()) out.push(t.trim(), "");
};
const body = readFileSync(new URL("../src/body.html", import.meta.url), "utf8")
  .replace(/<code>[^<]*<\/code>/g, "CODE").replace(/<(script|style)[\s\S]*?<\/\1>/g, "").replace(/@@\w+@@/g, "")
  .replace(/<\/(p|li|h\d|summary|label|button|option|figcaption)>/g, ".\n").replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
section("Page", body.split("\n").map((l) => l.replace(/\s+/g, " ").replace(/\s+\./g, ".").trim()).filter((l) => /[a-z]{3}/.test(l)));
for (const l of data.laws) section(`Law: ${l.name}`, [l.convention, l.limits, l.moments.existence, l.links.map((/** @type {any} */ x) => x.relation), l.methods ?? [], Object.values(l.conditions ?? {}), Object.values(l.dependence ?? {})]);
for (const m of data.models) section(`${m.kind}: ${m.title}`, [m.title, m.observe, m.decision, m.reason, m.inputs, m.dependence, m.method, m.diagnostics, m.interpretation, m.data?.text]);
for (const m of data.methods) section(`Method: ${m.name}`, [m.estimatorText, m.assumptions, m.settings, m.suitable.text, m.failure.text, m.comparison.text]);
for (const t of data.theory) section(`Theory: ${t.title}`, [t.assumptions, t.proof, t.counterexample]);
section("Glossary", data.glossary.map((/** @type {any} */ g) => g.definition));
section("Datasets", data.datasets.map((/** @type {any} */ d) => `${d.title}. ${d.licence}`));
section("Groups", data.groups.map((/** @type {any} */ g) => g.content));
const iv = data.interview;
section("Interview: questions", iv.questions.map((/** @type {any} */ q) => [q.text, q.help, q.options.map((/** @type {any} */ o) => o.label)]));
section("Interview: rules", [iv.alerts, iv.rules.map((/** @type {any} */ r) => r.reason)]);
section("Interview: candidates", iv.candidates.map((/** @type {any} */ c) => [c.competing.map((/** @type {any} */ x) => x.text), c.tests, c.methods ?? ""]));
const rare = data.rare;
section("Rare events: problems", rare.problems.map((/** @type {any} */ p) => [p.title, p.statement, p.decision, p.reason, p.inputs, p.dependence, p.diagnostics, p.interpretation, p.data]));
section("Rare events: methods", rare.methods.map((/** @type {any} */ m) => [m.estimatorText, m.assumptions, m.settings, m.suitable.text, m.failure.text, m.comparison.text]));
section("Rare events: examples", rare.presets.map((/** @type {any} */ p) => [p.title, p.observe]));
process.stdout.write(`${out.join("\n")}\n`);
