#!/usr/bin/env node
// page-axi check <slug|path|url>: one headless page check, one TOON verdict. See lib/page-axi.js and
// `page-axi --help`. Exit 0 pass, 1 fail, 2 usage or environment error.
let main;
try {
  ({ main } = await import("../lib/page-axi.js"));
} catch (error) {
  process.stdout.write(`error: "cannot load page-axi: ${String(error instanceof Error ? error.message : error).split("\n")[0].replace(/["\\]/g, "\\$&")}"\nhelp[1]:\n  Run \`cd e2e && npm ci\` to install its dependencies\n`);
  process.exit(2);
}
process.exitCode = await main(process.argv.slice(2));
