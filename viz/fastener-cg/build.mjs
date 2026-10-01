/* Build the Fastener Pattern CG Tracker into one self-contained page.
 *
 * Inputs (checked in under src/):
 *   core/*.mjs     dependency-free calculation core (ES modules, also run by the tests)
 *   ui/*.mjs       page controller, canvas painter, storage and WebMCP tools
 *   template.html  markup and styles, with one /*@APP@*\/ marker in a <script>
 *
 * Outputs:
 *   index.html     the template with every module inlined; works offline from file://
 *   raw.json       published metadata: version, units, conventions, warnings
 *                  catalogue, example pattern and the verification case list
 *
 *   node build.mjs          write both outputs
 *   node build.mjs --check  exit 1 if either output is stale
 *
 * The bundler supports the module subset the sources use: named imports
 * from relative paths (`import { a, b as c } from "./x.mjs"`) and `export`
 * on function, const and class declarations. Anything else (default or
 * namespace imports, re-exports, `export let`, dynamic import) is rejected
 * so a source change cannot silently break the inlined page.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "src");
const ENTRY = join(SRC, "ui", "main.mjs");

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*["'](\.{1,2}\/[^"']+)["'];?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+(?:async\s+)?(function\*?|const|class)\s+([A-Za-z_$][\w$]*)/gm;

function fail(file, message) {
  throw new Error(`${relative(HERE, file)}: ${message}`);
}

function parseModule(file) {
  const source = readFileSync(file, "utf8");
  if (/<\/script/i.test(source)) fail(file, "must not contain </script");
  const imports = [];
  let body = source.replace(IMPORT_RE, (_, names, spec) => {
    const bindings = names.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
      const m = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(s);
      if (!m) fail(file, `unsupported import binding “${s}”`);
      return { name: m[1], local: m[2] || m[1] };
    });
    imports.push({ path: resolve(dirname(file), spec), bindings });
    return "";
  });
  if (/^\s*import[\s{*"']/m.test(body)) fail(file, "only `import { … } from \"./relative.mjs\"` is supported");
  if (/\bimport\s*\(/.test(body)) fail(file, "dynamic import() is not supported");
  const exports = [];
  body = body.replace(EXPORT_DECL_RE, (match, kind, name) => {
    exports.push(name);
    return match.replace(/^export\s+/, "");
  });
  if (/^\s*export\b/m.test(body)) fail(file, "only `export function|const|class name` is supported");
  return { file, imports, exports, body };
}

/* Modules in dependency order (dependencies first), starting from `entry`. */
function collect(entry) {
  const order = [], seen = new Map(), visiting = new Set();
  const visit = (file) => {
    if (seen.has(file)) return seen.get(file);
    if (visiting.has(file)) fail(file, "circular import");
    visiting.add(file);
    const mod = parseModule(file);
    for (const imp of mod.imports) {
      const dep = visit(imp.path);
      for (const b of imp.bindings) if (!dep.exports.includes(b.name)) fail(file, `${relative(HERE, imp.path)} has no export “${b.name}”`);
    }
    visiting.delete(file);
    seen.set(file, mod);
    order.push(mod);
    return mod;
  };
  visit(entry);
  return order;
}

export function bundle(entry = ENTRY) {
  const modules = collect(entry);
  const id = new Map(modules.map((m, i) => [m.file, `__m${i}`]));
  const parts = modules.map((m) => {
    const header = m.imports.map((imp) => `const { ${imp.bindings.map((b) => (b.local === b.name ? b.name : `${b.name}: ${b.local}`)).join(", ")} } = ${id.get(imp.path)};`).join("\n");
    return `/* ---- ${relative(SRC, m.file)} ---- */\nconst ${id.get(m.file)} = (() => {\n${header}${header ? "\n" : ""}${m.body.trim()}\n${m.exports.length ? `return { ${m.exports.join(", ")} };` : "return {};"}\n})();`;
  });
  return `(() => {\n"use strict";\n${parts.join("\n\n")}\n})();`;
}

export async function metadata() {
  const url = (p) => pathToFileURL(join(SRC, p)).href;
  const [meta, warnings, model, units, verify] = await Promise.all([
    import(url("core/meta.mjs")), import(url("core/warnings.mjs")), import(url("core/model.mjs")), import(url("core/units.mjs")), import(url("core/verify.mjs")),
  ]);
  return {
    title: meta.TOOL_NAME,
    version: meta.TOOL_VERSION,
    milestone: meta.MILESTONE,
    unitSystems: units.UNIT_LABELS,
    conventions: meta.CONVENTIONS,
    assumptions: meta.ASSUMPTIONS,
    warnings: Object.entries(warnings.CATALOG).map(([id, condition]) => ({ id, tier: warnings.tierOf(id), condition })),
    verification: { set: verify.VERIFICATION_SET, tolerance: verify.REL_TOL, cases: verify.ALL_CASES.map((c) => ({ id: c.id, title: c.title })) },
    examplePattern: model.examplePattern("N-mm"),
  };
}

export async function render() {
  const template = readFileSync(join(SRC, "template.html"), "utf8");
  const marker = "/*@APP@*/";
  if (template.split(marker).length !== 2) throw new Error(`template.html must contain ${marker} exactly once`);
  const html = template.replace(marker, () => bundle());
  const raw = JSON.stringify(await metadata(), null, 2) + "\n";
  return { "index.html": html, "raw.json": raw };
}

async function main() {
  const outputs = await render();
  const check = process.argv.includes("--check");
  let stale = false;
  for (const [name, content] of Object.entries(outputs)) {
    const path = join(HERE, name);
    if (check) {
      let current = null;
      try { current = readFileSync(path, "utf8"); } catch { /* missing */ }
      if (current !== content) { console.error(`${name} is stale; run node build.mjs`); stale = true; }
    } else {
      writeFileSync(path, content);
    }
  }
  if (stale) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
