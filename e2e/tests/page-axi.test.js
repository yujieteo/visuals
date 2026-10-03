// page-axi without a browser: the command line, the page it resolves (every target that names no page is a
// usage error, exit 2, never an empty pass), the verdict rows and the TOON output.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { REPO } from "../lib/manifest.js";
import { UsageError, hints, main, parseArgs, resolveTarget, scalar, toon, verdictRows } from "../lib/page-axi.js";

const VISUALS = fileURLToPath(new URL("fixtures/visuals", import.meta.url));
const GOOD = fileURLToPath(new URL("fixtures/page-axi/good", import.meta.url));

/** @typedef {import("../lib/page-axi.js").Load} Load */

/**
 * A load that saw nothing wrong, with ``extra`` replacing fields.
 * @param {Partial<Load>} [extra]
 * @returns {Load}
 */
const load = (extra = {}) => ({
  viewport: 390, theme: "light", url: "http://127.0.0.1/x/", openError: null, title: "T", errors: [], requests: [],
  overflow: { scrollWidth: 390, clientWidth: 390, culprits: [] }, numbers: [], tools: ["a", "b", "c"], shot: null, ...extra,
});
const RULES = { contrast: [], tools: [] };
const DRIVE = { driven: 2, broken: [], errors: [] };

/**
 * Run main and capture what it prints.
 * @param {string[]} argv
 * @param {{ repo?: string, cwd?: string }} [where]
 */
async function run(argv, where = {}) {
  let out = "";
  const code = await main(argv, { ...where, write: (text) => { out += text; } });
  return { code, out };
}

test("the command line: defaults, both options and every malformed value", () => {
  assert.deepEqual(parseArgs(["check", "mohr"]), { command: "check", target: "mohr", viewports: [390, 768, 1440], themes: ["light", "dark"] });
  assert.deepEqual(parseArgs(["check", "--viewport=320,390,320", "mohr", "--themes", "dark"]),
    { command: "check", target: "mohr", viewports: [320, 390], themes: ["dark"] });
  assert.equal(parseArgs([]).command, "help");
  assert.equal(parseArgs(["check", "--help"]).command, "help");
  for (const argv of [["check"], ["check", "a", "b"], ["frob", "a"], ["check", "a", "--viewport"], ["check", "a", "--viewport", "10"],
    ["check", "a", "--viewport", "390,wide"], ["check", "a", "--themes", "sepia"], ["check", "a", "--bogus"], ["check", "a", "--viewports", "390"],
    ["check", "a", "--theme", "dark"], ["check", "a", "--offline"], ["check", "a", "--out", "o"]]) {
    assert.throws(() => parseArgs(argv), UsageError, argv.join(" "));
  }
});

test("a slug, a visual's folder or index.html, another folder, an HTML file and a URL each resolve to their page", () => {
  const cwd = VISUALS;
  assert.deepEqual((({ kind, name, entry }) => ({ kind, name, entry }))(resolveTarget("delta", { repo: VISUALS, cwd })), { kind: "slug", name: "delta", entry: "index.html" });
  assert.equal(resolveTarget("viz/delta", { repo: VISUALS, cwd }).kind, "slug");
  assert.equal(resolveTarget("viz/delta/index.html", { repo: VISUALS, cwd }).kind, "slug");
  const path = resolveTarget(GOOD, { repo: VISUALS, cwd });
  assert.deepEqual([path.kind, path.name, path.entry, path.visual], ["path", "good", "index.html", null]);
  const file = resolveTarget(join(GOOD, "index.html"), { repo: VISUALS, cwd });
  assert.deepEqual([file.kind, file.entry], ["path", "index.html"]);
  const spaced = mkdtempSync(join(tmpdir(), "page-axi-"));
  try {
    mkdirSync(join(spaced, "my page"));
    writeFileSync(join(spaced, "my page", "index.html"), "<p>x</p>\n");
    const fromUrl = resolveTarget(pathToFileURL(join(spaced, "my page", "index.html")).href, { repo: VISUALS, cwd });
    assert.deepEqual([fromUrl.kind, fromUrl.name, fromUrl.entry], ["path", "my page", "index.html"]);
  } finally {
    rmSync(spaced, { recursive: true, force: true });
  }
  const url = resolveTarget("https://example.org/visuals/delta/", { repo: VISUALS, cwd });
  assert.deepEqual([url.kind, url.name, url.url, url.visual?.slug], ["url", "delta", "https://example.org/visuals/delta/", "delta"]);
});

test("no false pass: an unknown slug, a missing path, a folder without a page, and a non-HTML file are usage errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "page-axi-"));
  try {
    writeFileSync(join(dir, "notes.md"), "# notes\n");
    const cases = [
      ["deltaa", /no visual viz\/deltaa\/ and no file or folder deltaa/],
      ["missing/page.html", /no file or folder missing\/page.html/],
      [dir, /is a folder with no index.html/],
      [join(dir, "notes.md"), /is not an HTML file/],
    ];
    for (const [raw, message] of cases) {
      assert.throws(() => resolveTarget(/** @type {string} */ (raw), { repo: VISUALS, cwd: VISUALS }), (e) => e instanceof UsageError && /** @type {RegExp} */ (message).test(e.message), String(raw));
    }
    assert.throws(() => resolveTarget("deltaa", { repo: VISUALS, cwd: VISUALS }), (e) => e instanceof UsageError && e.help[0] === "Did you mean delta?");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main exits 2 with a TOON error and a hint for a page that does not exist, before it launches a browser", async () => {
  const { code, out } = await run(["check", "no-such-visual-anywhere"], { repo: REPO, cwd: REPO });
  assert.equal(code, 2);
  assert.match(out, /^error: no visual viz\/no-such-visual-anywhere\/ and no file or folder no-such-visual-anywhere\nhelp\[1\]:\n {2}Run `ls viz` to list the visuals\n$/);
  assert.equal((await run(["check", "--viewport", "1"])).code, 2);
  const help = await run(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.out, /^usage: page-axi check <slug\|path\|url>/);
});

test("every check passes when no load saw a problem", () => {
  const rows = verdictRows({ loads: [load(), load({ theme: "dark" })], drive: DRIVE, rules: RULES, declared: ["a", "b", "c"] });
  assert.deepEqual(rows.map((r) => [r.check, r.status, r.where]), [
    ["opens", "pass", "2 load(s)"], ["console", "pass", "2 load(s)"], ["network", "pass", "2 load(s)"], ["overflow", "pass", "2 load(s)"],
    ["numeric-text", "pass", "2 load(s)"], ["contrast", "pass", "tokens"], ["webmcp-tools", "pass", "page"],
  ]);
  assert.match(rows[4].evidence, /2 numeric input\(s\) driven/);
});

test("failures come first and name the loads they failed in", () => {
  const rows = verdictRows({
    loads: [
      load({ errors: ["console boom"], overflow: { scrollWidth: 420, clientWidth: 390, culprits: ["table.wide (right 420 px)"] } }),
      load({ viewport: 1440, errors: ["console boom"] }),
      load({ theme: "dark", requests: ["refused https://cdn.example.org/x.js"], numbers: ['"x: NaN"'] }),
    ],
    drive: { driven: 1, broken: ['#n = "0": "Infinity"'], errors: ["TypeError: x"] },
    rules: { contrast: ["light: --fg on --bg is 1.61:1, below 4.5:1 for text"], tools: [] },
    declared: ["a", "b", "c"],
  });
  assert.deepEqual(rows.map((r) => [r.check, r.status, r.where]), [
    ["console", "fail", "390/light 1440/light"], ["network", "fail", "390/dark"], ["overflow", "fail", "390/light"],
    ["numeric-text", "fail", "390/dark limits"], ["contrast", "fail", "tokens"],
    ["opens", "pass", "3 load(s)"], ["webmcp-tools", "pass", "page"],
  ]);
  assert.equal(rows[0].evidence, "console boom", "a repeated error shows once");
  assert.equal(rows[3].evidence, 'shown "x: NaN"; #n = "0": "Infinity"; error TypeError: x');
});

test("no false pass: a page that never opens fails every browser check, not only opens", () => {
  const rows = verdictRows({ loads: [load({ openError: "HTTP 404", tools: null, overflow: null })], drive: null, rules: RULES, declared: ["a", "b", "c"] });
  const failed = rows.filter((r) => r.status === "fail").map((r) => r.check);
  assert.deepEqual(failed, ["opens", "console", "network", "overflow", "numeric-text", "webmcp-tools"]);
  assert.equal(rows.find((r) => r.check === "console")?.evidence, "the page did not open");
});

test("webmcp-tools: at least 3, exactly what visual.json declares, and the static tools problems", () => {
  /** @param {string[]} tools @param {string[] | null} declared @param {string[]} [statics] */
  const tools = (tools, declared, statics = []) => verdictRows({ loads: [load({ tools })], drive: DRIVE, rules: { contrast: [], tools: statics }, declared }).find((r) => r.check === "webmcp-tools");
  assert.equal(tools(["a", "b"], null)?.evidence, "registers 2 tool(s) (a, b); a visual registers at least 3");
  assert.match(String(tools(["a", "b", "c"], ["a", "b", "d"])?.evidence), /names d, which the page did not register; the page registered c, which visual.json webmcp_tools does not name/);
  assert.equal(tools(["a", "b", "c", "a"], ["c", "b", "a"])?.status, "pass", "a tool registered twice counts once");
  assert.equal(tools(["a", "b", "c"], null, ["SKILLS.md documents [] != registered ['a', 'b', 'c']"])?.status, "fail");
});

test("a URL has no local tokens, so contrast is a counted skip", () => {
  const rows = verdictRows({ loads: [load()], drive: DRIVE, rules: null, declared: null });
  assert.deepEqual(rows.filter((r) => r.status === "skip").map((r) => r.check), ["contrast"]);
});

test("a failure the manifest records as a known finding says so and still fails", () => {
  const manifest = { findings: [{ check: "network", projects: ["*"], status: /** @type {const} */ ("finding"), evidence: "photos from a CDN" }] };
  const row = verdictRows({ loads: [load({ requests: ["refused https://cdn.example.org/p.jpg"] })], drive: DRIVE, rules: RULES, declared: null, manifest })[0];
  assert.deepEqual([row.check, row.status], ["network", "fail"]);
  assert.match(row.evidence, /^known network finding in e2e\/manifest.json; refused/);
});

test("a known overflow finding labels only an overflow at the width it names", () => {
  const manifest = { findings: [{ check: "overflow-390", projects: ["*"], status: /** @type {const} */ ("finding"), evidence: "a wide table" }] };
  const overflowAt = (/** @type {number} */ viewport) => verdictRows({ loads: [load({ viewport, overflow: { scrollWidth: viewport + 100, clientWidth: viewport, culprits: [] } })], drive: DRIVE, rules: RULES, declared: null, manifest })[0];
  assert.match(overflowAt(390).evidence, /^known overflow-390 finding/);
  const wide = overflowAt(768);
  assert.deepEqual([wide.check, wide.status], ["overflow", "fail"]);
  assert.match(wide.evidence, /^scrollWidth 868 > clientWidth 768/);
});

test("hints point at the screenshot of the first overflow and at the log", () => {
  const rows = verdictRows({ loads: [load(), load({ viewport: 768, theme: "dark", overflow: { scrollWidth: 800, clientWidth: 768, culprits: [] }, errors: ["console x"] })], drive: DRIVE, rules: RULES, declared: null });
  const target = { kind: /** @type {const} */ ("slug"), name: "mohr", visual: null, folder: null, entry: "index.html", url: null };
  const help = hints(rows, { target, log: "build/page-axi/mohr/run.json", shots: [{ viewport: 768, theme: "dark", path: "build/page-axi/mohr/768-dark.png" }] });
  assert.deepEqual(help.slice(0, 2), ["Open build/page-axi/mohr/768-dark.png to see the overflow at 768 px", "Read build/page-axi/mohr/run.json for every error and request of each load"]);
});

test("TOON: scalars quote only what would read as something else, and tables carry their counts", () => {
  assert.deepEqual(["plain text", "", " x", "a,b", "a: b", 'say "hi"', "true", "12", "-x", 3, null].map(scalar),
    ["plain text", '""', '" x"', '"a,b"', '"a: b"', '"say \\"hi\\""', '"true"', '"12"', '"-x"', "3", "null"]);
  assert.equal(toon({ page: { target: "mohr", ms: 5 }, rows: [{ a: 1, b: "x,y" }, { a: 2, b: "z" }], help: ["Run it"] }),
    'page:\n  target: mohr\n  ms: 5\nrows[2]{a,b}:\n  1,"x,y"\n  2,z\nhelp[1]:\n  Run it');
});
