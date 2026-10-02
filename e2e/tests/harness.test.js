// The harness itself, without a browser: discovery, staging, the static
// server, sharding and manifest options.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isArtifactUrl } from "../lib/browser.js";
import { discoverVisuals } from "../lib/catalogue.js";
import { checkOptions } from "../lib/manifest.js";
import { serveArtifacts } from "../lib/server.js";
import { stageVisual } from "../lib/stage.js";
import { selectShard } from "../lib/targets.js";

const SITE = fileURLToPath(new URL("fixtures/site", import.meta.url));

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

test("staging publishes index.html, data.json and assets as the site does", () => {
  const root = mkdtempSync(join(tmpdir(), "technical-e2e-harness-"));
  try {
    const [alpha, beta] = discoverVisuals(SITE);
    const out = stageVisual(alpha, { siteRoot: SITE, visualsRepo: null, stagingRoot: root });
    assert.match(readFileSync(join(out, "index.html"), "utf8"), /<title>Alpha<\/title>/);
    assert.deepEqual(JSON.parse(readFileSync(join(out, "data.json"), "utf8")), { alpha: true });
    assert.equal(readFileSync(join(out, "extra.csv"), "utf8"), "a,b\n1,2\n");
    assert.throws(() => stageVisual(beta, { siteRoot: SITE, visualsRepo: null, stagingRoot: root }), /E2E_VISUALS/);
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
  } finally {
    await server.close();
  }
});

test("sharding splits the visuals into disjoint batches that cover them all", () => {
  const items = ["a", "b", "c", "d", "e"].map((slug) => ({ slug }));
  const shards = [1, 2, 3].map((i) => selectShard(items, { E2E_SHARD: `${i}/3` }).map((x) => x.slug));
  assert.deepEqual(shards, [["a", "d"], ["b", "e"], ["c"]]);
  assert.deepEqual(selectShard(items, { E2E_ONLY: "c, e" }).map((x) => x.slug), ["c", "e"]);
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
