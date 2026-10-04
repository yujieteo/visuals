// Bundle the third-party JavaScript of the notebook into vendor/: PyScript (with polyscript), KaTeX and
// marked, at the versions that tools/vendor/package-lock.json pins with their npm integrity.
//
// This and tools/pin_runtime.py are the only code of this visual that uses the network (npm ci). The
// bundle is an ES module that exports nothing: it puts { PyWorker, katex, marked, versions } on
// globalThis.pynbVendor and dispatches "pynb-vendor". vendor/katex.css holds KaTeX's CSS with its fonts as
// data: URLs, so the page requests no font. vendor/manifest.json records the version, licence, SHA-256 and
// byte count of every vendored file; build.py checks each file against it, so the page builds offline.
//
// Change a version only together with a new gate run (tests/gate/): the three runtime patches of
// src/runtime-patches.js depend on the exact minified worker source of PyScript and polyscript.
//
// Usage: (cd tools/vendor && npm ci) && node tools/vendor_js.mjs
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOLS = join(HERE, "tools", "vendor");
const VENDOR = join(HERE, "vendor");
const require = createRequire(join(TOOLS, "package.json"));
const { build } = require("esbuild");

const ENTRY = `
import { PyWorker } from "@pyscript/core";
import katex from "katex";
import { marked } from "marked";
const versions = ${JSON.stringify(Object.fromEntries(["@pyscript/core", "polyscript", "katex", "marked"].map((name) => [name, require(`${name}/package.json`).version])))};
globalThis.pynbVendor = Object.freeze({ PyWorker, katex, marked, versions });
globalThis.dispatchEvent(new Event("pynb-vendor"));
`;

/** @param {string | Uint8Array} data */
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// PyScript's editor, terminal and zip plugins load these only for <py-editor>, <py-terminal> and zip files,
// which the notebook does not use. Each resolves to an empty module, so the bundle holds none of them.
const ABSENT = /^(?:codemirror|@codemirror\/.*|string-width|@zip\.js\/zip\.js)$/;
/** @type {import("esbuild").Plugin} */
const absent = {
  name: "absent",
  setup(b) {
    b.onResolve({ filter: ABSENT }, (args) => ({ path: args.path, namespace: "absent" }));
    b.onLoad({ filter: /.*/, namespace: "absent" }, () => ({ contents: "export {};", loader: "js" }));
  },
};

const result = await build({
  stdin: { contents: ENTRY, resolveDir: TOOLS, loader: "js" },
  bundle: true,
  format: "esm",
  minify: true,
  legalComments: "none",
  charset: "ascii",
  target: ["chrome120", "firefox120"],
  write: false,
  logLevel: "warning",
  plugins: [absent],
});
const js = result.outputFiles[0].text;

// KaTeX's stylesheet, with every url(fonts/...) replaced by a data: URL of the woff2 file.
const katexDir = dirname(require.resolve("katex/package.json"));
const katexCss = readFileSync(join(katexDir, "dist", "katex.min.css"), "utf8")
  .replace(/src:url\(fonts\/([^)]+?\.woff2)\) format\("woff2"\),url\([^)]+\) format\("woff"\),url\([^)]+\) format\("truetype"\)/g,
    (_, file) => `src:url(data:font/woff2;base64,${readFileSync(join(katexDir, "dist", "fonts", file)).toString("base64")}) format("woff2")`);
if (/url\((?!data:)/.test(katexCss)) throw new Error("katex.css still names a font file");

mkdirSync(join(VENDOR, "licenses"), { recursive: true });
/** @type {Record<string, string>} */
const files = { "runtime.js": js, "katex.css": katexCss };
const packages = [];
for (const name of ["@pyscript/core", "polyscript", "katex", "marked"]) {
  const dir = dirname(require.resolve(`${name}/package.json`));
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const licence = `licenses/${name.replace("@", "").replace("/", "-")}.txt`;
  files[licence] = readFileSync(join(dir, "LICENSE"), "utf8");
  packages.push({ name, version: pkg.version, license: pkg.license, licence_file: licence });
}
// The bundle also holds polyscript's own dependencies; list each with its version and licence.
const lock = JSON.parse(readFileSync(join(TOOLS, "package-lock.json"), "utf8"));
const bundled = Object.entries(lock.packages)
  .filter(([path, entry]) => path && !entry.dev && !/esbuild/.test(path))
  .map(([path, entry]) => ({ name: path.replace(/^.*node_modules\//, ""), version: entry.version, license: entry.license, integrity: entry.integrity }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

for (const [path, text] of Object.entries(files)) writeFileSync(join(VENDOR, path), text);
const manifest = {
  note: "Written by tools/vendor_js.mjs. build.py checks every file against this list.",
  esbuild: require("esbuild/package.json").version,
  packages,
  bundled,
  files: Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.byteLength(text), sha256: sha256(text) })),
};
writeFileSync(join(VENDOR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`vendor_js.mjs: runtime.js ${Buffer.byteLength(js).toLocaleString("en")} bytes, katex.css ${Buffer.byteLength(katexCss).toLocaleString("en")} bytes`);
