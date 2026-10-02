// Loads the FBD Drawer core (every <script data-core> in index.html) into a
// fresh VM context, for the tests and the example builder. The core touches
// no DOM, so nothing else is needed.
import fs from "node:fs";
import vm from "node:vm";

export const HTML_URL = new URL("../index.html", import.meta.url);
export function coreScripts(html = fs.readFileSync(HTML_URL, "utf8")) {
  return [...html.matchAll(/<script\b[^>]*\bdata-core\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}
export function loadCore() {
  const ctx = vm.createContext({});
  for (const src of coreScripts()) vm.runInContext(src, ctx);
  return ctx.FBD;
}
