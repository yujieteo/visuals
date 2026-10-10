// The harness itself, without a browser: discovery, staging, the static
// server, sharding and manifest options.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isArtifactUrl } from "../lib/browser.js";
import { discoverVisuals, discoverVisualsRepo } from "../lib/catalogue.js";
import { checkOptions } from "../lib/manifest.js";
import { startResults } from "../lib/results.js";
import { serveArtifacts } from "../lib/server.js";
import { stageVisual } from "../lib/stage.js";
import { selectShard } from "../lib/targets.js";

const SITE = fileURLToPath(new URL("fixtures/site", import.meta.url));
const VISUALS = fileURLToPath(new URL("fixtures/visuals", import.meta.url));

test("discovery finds catalogued, pinned and uncatalogued visuals", () => {
  const visuals = discoverVisuals(SITE);
  assert.deepEqual(visuals.map((v) => v.slug), ["alpha", "beta", "gamma"]);
  const [alpha, beta, gamma] = visuals;
  assert.equal(alpha.source, "site");
  assert.equal(alpha.offlineClaim, true);
  assert.equal(alpha.owner, "https://github.com/yujieteo/alpha", "the first non-site repository AGENTS.md names");
  assert.deepEqual(alpha.assets, ["visuals/alpha/extra.csv"]);
  assert.equal(beta.source, "visuals");
  assert.equal(beta.pin, "0123456789abcdef0123456789abcdef01234567");
  assert.equal(beta.owner, "https://github.com/yujieteo/visuals");
  assert.equal(beta.offlineClaim, false);
  assert.equal(gamma.catalogued, false);
  assert.equal(gamma.owner, "https://github.com/yujieteo/site");
});

test("discovery reads every viz/<slug>/visual.json of a visuals checkout", () => {
  const visuals = discoverVisualsRepo(VISUALS);
  assert.deepEqual(visuals.map((v) => v.slug), ["delta"], "epsilon's page moved to the site, so it has no page to test");
  const [delta] = visuals;
  assert.deepEqual({ slug: delta.slug, source: delta.source, htmlPath: delta.htmlPath, dataPath: delta.dataPath, assets: delta.assets, pin: delta.pin },
    { slug: "delta", source: "visuals", htmlPath: "viz/delta/index.html", dataPath: "viz/delta/raw.json", assets: ["viz/delta/probly.csv"], pin: null });
  assert.equal(delta.offlineClaim, true);
  assert.equal(delta.owner, "https://github.com/yujieteo/visuals");
});

test("a visual of the visuals checkout stages from its folder as the site publishes it", () => {
  const root = mkdtempSync(join(tmpdir(), "visuals-e2e-harness-"));
  try {
    const out = stageVisual(discoverVisualsRepo(VISUALS)[0], { siteRoot: SITE, visualsRepo: VISUALS, stagingRoot: root });
    assert.match(readFileSync(join(out, "index.html"), "utf8"), /<title>Delta<\/title>/);
    assert.deepEqual(JSON.parse(readFileSync(join(out, "data.json"), "utf8")), { delta: true });
    assert.equal(readFileSync(join(out, "probly.csv"), "utf8"), "x\n1\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("staging publishes index.html, data.json and assets as the site does", () => {
  const root = mkdtempSync(join(tmpdir(), "visuals-e2e-harness-"));
  try {
    const [alpha, beta] = discoverVisuals(SITE);
    const out = stageVisual(alpha, { siteRoot: SITE, visualsRepo: null, stagingRoot: root });
    assert.match(readFileSync(join(out, "index.html"), "utf8"), /<title>Alpha<\/title>/);
    assert.deepEqual(JSON.parse(readFileSync(join(out, "data.json"), "utf8")), { alpha: true });
    assert.equal(readFileSync(join(out, "extra.csv"), "utf8"), "a,b\n1,2\n");
    assert.throws(() => stageVisual(beta, { siteRoot: SITE, visualsRepo: null, stagingRoot: root }), /no checkout of it/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the static server serves each artifact under its slug and nothing else", async () => {
  const server = await serveArtifacts(new Map([["alpha", join(SITE, "visuals", "alpha")]]));
  try {
    const page = await fetch(server.urlFor("alpha"));
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type") ?? "", /text\/html/);
    assert.equal((await fetch(`${server.origin}/alpha/extra.csv`)).status, 200);
    assert.equal((await fetch(`${server.origin}/alpha/missing.js`)).status, 404);
    assert.equal((await fetch(`${server.origin}/gamma/`)).status, 404);
    assert.notEqual((await fetch(`${server.origin}/alpha/%2e%2e/gamma/index.html`)).status, 200, "no escaping the artifact folder");
    assert.equal((await fetch(`${server.origin}/alpha/100%.png`)).status, 400, "a malformed escape is refused, not fatal");
    assert.equal((await fetch(server.urlFor("alpha"))).status, 200, "the server survives it");
  } finally {
    await server.close();
  }
});

test("sharding splits the visuals into disjoint batches that cover them all", () => {
  const items = ["a", "b", "c", "d", "e"].map((slug) => ({ slug }));
  const shards = [1, 2, 3].map((i) => selectShard(items, { E2E_SHARD: `${i}/3` }).map((x) => x.slug));
  assert.deepEqual(shards, [["a", "d"], ["b", "e"], ["c"]]);
  assert.deepEqual(selectShard(items, { E2E_ONLY: "c, e" }).map((x) => x.slug), ["c", "e"]);
  const sourced = [{ slug: "a", source: "visuals" }, { slug: "b", source: "site" }, { slug: "c", source: "site" }];
  assert.deepEqual(selectShard(sourced, { E2E_SOURCE: "site" }).map((x) => x.slug), ["b", "c"]);
  assert.deepEqual(selectShard(sourced, { E2E_SOURCE: "site", E2E_ONLY: "a,c" }).map((x) => x.slug), ["c"]);
  assert.throws(() => selectShard(items, { E2E_SHARD: "4/3" }), /E2E_SHARD/);
});

test("a known finding runs as a todo only in the projects it names", () => {
  const manifest = {
    skip: { "file-url": "no local copy" },
    findings: [
      { check: "network", projects: ["*"], status: /** @type {const} */ ("finding"), evidence: "CDN" },
      { check: "overflow-320", projects: ["webkit-desktop"], status: /** @type {const} */ ("flaky"), evidence: "wide table" },
    ],
  };
  assert.deepEqual(checkOptions(manifest, "network", "firefox-desktop"), { todo: "known finding: CDN" });
  assert.deepEqual(checkOptions(manifest, "overflow-320", "webkit-desktop"), { todo: "flaky: wide table" });
  assert.deepEqual(checkOptions(manifest, "overflow-320", "chromium-desktop"), {});
  assert.deepEqual(checkOptions(manifest, "file-url", "chromium-desktop"), { skip: "no local copy" });
});

test("only the artifact's own URLs count as its requests", () => {
  const prefix = "http://127.0.0.1:4000/alpha/";
  assert.equal(isArtifactUrl("http://127.0.0.1:4000/alpha/data.json", prefix), true);
  assert.equal(isArtifactUrl("data:image/png;base64,AAAA", prefix), true);
  assert.equal(isArtifactUrl("http://127.0.0.1:4000/beta/index.html", prefix), false);
  assert.equal(isArtifactUrl("https://cdn.jsdelivr.net/npm/d3", prefix), false);
});

test("a rerun replaces its own results and leaves other runs' alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "visuals-e2e-results-"));
  const saved = process.env.E2E_RESULTS;
  process.env.E2E_RESULTS = dir;
  try {
    const project = { name: "chromium-desktop" };
    /** @param {"pass" | "fail"} outcome */
    const result = (outcome) => ({ slug: "alpha", check: "opens", project: project.name, outcome, evidence: "", owner: "", ms: 1 });
    startResults("baseline", [project])(result("fail"));
    startResults("full-alpha", [project])(result("fail"));
    startResults("baseline", [project])(result("pass"));
    /** @param {string} name */
    const lines = (name) => readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).outcome);
    assert.deepEqual(readdirSync(dir).sort(), ["chromium-desktop.baseline.jsonl", "chromium-desktop.full-alpha.jsonl"]);
    assert.deepEqual(lines("chromium-desktop.baseline.jsonl"), ["pass"]);
    assert.deepEqual(lines("chromium-desktop.full-alpha.jsonl"), ["fail"]);
    startResults("baseline", [project], "1/2")(result("fail"));
    assert.deepEqual(lines("chromium-desktop.baseline.1of2.jsonl"), ["fail"]);
    assert.deepEqual(lines("chromium-desktop.baseline.jsonl"), ["pass"], "a sharded run leaves the unsharded file alone");
    startResults("baseline", [project]);
    assert.deepEqual(readdirSync(dir).sort(), ["chromium-desktop.baseline.jsonl", "chromium-desktop.full-alpha.jsonl"], "an unsharded run empties every shard's file");
    assert.deepEqual(lines("chromium-desktop.baseline.jsonl"), []);
  } finally {
    if (saved === undefined) delete process.env.E2E_RESULTS;
    else process.env.E2E_RESULTS = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recording findings keeps what a run did not retest and drops what now passes", () => {
  const root = mkdtempSync(join(tmpdir(), "visuals-e2e-record-"));
  try {
    const results = join(root, "results"), manifests = join(root, "viz", "alpha", "e2e");
    for (const d of [results, manifests]) mkdirSync(d, { recursive: true });
    const finding = (/** @type {string} */ check, /** @type {string[]} */ projects) => ({ check, projects, status: "finding", evidence: "old", owner: "o" });
    writeFileSync(join(manifests, "manifest.json"), JSON.stringify({ findings: [
      finding("console-errors", ["*"]),
      finding("file-url", ["chromium-desktop"]),
      finding("network", ["*"]),
      finding("opens", ["chromium-desktop", "firefox-desktop"]),
    ] }));
    /** @param {string} check @param {"pass" | "fail" | "skip"} outcome */
    const line = (check, outcome) => JSON.stringify({ slug: "alpha", check, project: "chromium-desktop", outcome, evidence: "new", owner: "o", ms: 1 });
    writeFileSync(join(results, "chromium-desktop.baseline.jsonl"), [
      line("console-errors", "fail"), line("file-url", "skip"), line("network", "pass"), line("opens", "pass"),
    ].join("\n"));
    execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/record-findings.js", import.meta.url)), results, root]);
    const findings = JSON.parse(readFileSync(join(manifests, "manifest.json"), "utf8")).findings;
    assert.deepEqual(Object.fromEntries(findings.map((/** @type {{ check: string, projects: string[] }} */ f) => [f.check, f.projects])), {
      "console-errors": ["*"],
      "file-url": ["chromium-desktop"],
      network: ["chromium-mobile", "firefox-desktop", "webkit-desktop", "webkit-mobile"],
      opens: ["firefox-desktop"],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
