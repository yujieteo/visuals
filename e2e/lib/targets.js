// Decide what the suite tests, from the environment:
//
//   E2E_VISUALS   the yujieteo/visuals checkout whose viz/*/ visuals are
//                 staged and tested (default: this repository)
//   E2E_BASE_URL  test already-served artifacts at <base>/<slug>/ instead,
//                 e.g. http://localhost:8000/visuals for a built site/
//   E2E_ARTIFACT  test one artifact: a folder holding index.html (such as a
//                 visual's own repository), an HTML file, or a URL; name it
//                 with E2E_SLUG when its folder name is not the slug
//   E2E_ONLY      comma-separated slugs to keep
//   E2E_SHARD     i/n: keep every n-th visual starting at the i-th (1-based)
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { discoverVisualsRepo } from "./catalogue.js";
import { serveArtifacts } from "./server.js";
import { stageVisual } from "./stage.js";

/** @typedef {import("./catalogue.js").Visual} Visual */

/**
 * @typedef {object} Artifact
 * @property {string} slug
 * @property {Visual} visual
 * @property {string | null} folder a local folder holding the artifact, when there is one
 * @property {string} entry the page's file name inside the folder
 * @property {string | null} remoteUrl the page's URL when the artifact is already served elsewhere
 * @property {string | null} stageError why the artifact could not be staged, if it could not
 */

/**
 * @typedef {object} Targets
 * @property {Artifact[]} artifacts
 * @property {(artifact: Artifact) => string} httpUrl the page over http(s)
 * @property {(artifact: Artifact) => string | null} fileUrl the page over file://, when it is local
 * @property {(artifact: Artifact) => string} origin the URL prefix every request of this artifact may use
 * @property {() => Promise<void>} close
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Keep the visuals named by E2E_ONLY, and the shard named by E2E_SHARD.
 * @template {{ slug: string }} T
 * @param {T[]} items
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {T[]}
 */
export function selectShard(items, env = process.env) {
  const only = (env.E2E_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let kept = only.length ? items.filter((item) => only.includes(item.slug)) : items;
  const shard = env.E2E_SHARD;
  if (shard) {
    const match = /^(\d+)\/(\d+)$/.exec(shard);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > Number(match[2])) throw new Error(`E2E_SHARD must be i/n with 1 <= i <= n: ${shard}`);
    const [i, n] = [Number(match[1]), Number(match[2])];
    kept = kept.filter((_, index) => index % n === i - 1);
  }
  return kept;
}

/**
 * A stand-in catalogue entry for an artifact given directly.
 * @param {string} slug
 * @param {string | null} folder
 * @returns {Visual}
 */
function adHocVisual(slug, folder) {
  const docs = folder ? ["README.md", "AGENTS.md"].map((n) => join(folder, n)).filter((p) => existsSync(p))
    .map((p) => readFileSync(p, "utf8")).join("\n") : "";
  return {
    slug, title: slug, summary: "", htmlPath: "", dataPath: null, assets: [],
    offlineClaim: /\boffline\b|\bfile:\/\/|no network access/i.test(docs),
    owner: process.env.E2E_OWNER ?? "https://github.com/yujieteo/visuals",
  };
}

/**
 * Resolve the artifacts under test and serve the local ones.
 * @param {{ only?: string[] }} [options] keep just these slugs, whatever E2E_ONLY and E2E_SHARD say
 * @returns {Promise<Targets>}
 */
export async function loadTargets(options = {}) {
  const visualsRepo = process.env.E2E_VISUALS ? resolve(process.env.E2E_VISUALS) : resolve(ROOT, "..");
  const visuals = existsSync(join(visualsRepo, "viz")) ? discoverVisualsRepo(visualsRepo) : [];
  const catalogue = visuals.length ? visuals : null;
  const bySlug = new Map((catalogue ?? []).map((v) => [v.slug, v]));
  /** @type {Artifact[]} */
  let artifacts;
  /** @type {string | null} */
  let stagingRoot = null;
  const single = process.env.E2E_ARTIFACT;
  if (single) {
    if (/^https?:\/\//.test(single)) {
      const slug = process.env.E2E_SLUG ?? basename(new URL(single).pathname.replace(/\/(index\.html)?$/, "")) ?? "artifact";
      artifacts = [{ slug, visual: bySlug.get(slug) ?? adHocVisual(slug, null), folder: null, entry: "", remoteUrl: single, stageError: null }];
    } else {
      const path = resolve(single.startsWith("file://") ? fileURLToPath(single) : single);
      const isDir = statSync(path).isDirectory();
      const folder = isDir ? path : dirname(path);
      const slug = process.env.E2E_SLUG ?? basename(folder);
      artifacts = [{ slug, visual: bySlug.get(slug) ?? adHocVisual(slug, folder), folder, entry: isDir ? "index.html" : basename(path), remoteUrl: null, stageError: null }];
    }
  } else {
    if (!catalogue) throw new Error(`No artifacts to test: no viz/ in ${visualsRepo}; set E2E_VISUALS, or E2E_ARTIFACT to one artifact.`);
    const base = process.env.E2E_BASE_URL?.replace(/\/$/, "");
    const tmpRoot = process.env.E2E_TMP ?? join(tmpdir(), "visuals-e2e");
    mkdirSync(tmpRoot, { recursive: true });
    stagingRoot = mkdtempSync(join(tmpRoot, "staging-"));
    const root = stagingRoot;
    const chosen = options.only ? catalogue.filter((v) => options.only?.includes(v.slug)) : selectShard(catalogue);
    artifacts = chosen.map((visual) => {
      /** @type {Artifact} */
      const artifact = { slug: visual.slug, visual, folder: null, entry: "index.html", remoteUrl: base ? `${base}/${visual.slug}/` : null, stageError: null };
      try {
        artifact.folder = stageVisual(visual, { visualsRepo, stagingRoot: root });
      } catch (error) {
        artifact.stageError = error instanceof Error ? error.message : String(error);
      }
      return artifact;
    });
  }
  const folders = new Map(artifacts.filter((a) => a.folder && !a.remoteUrl).map((a) => [a.slug, /** @type {string} */ (a.folder)]));
  const server = folders.size ? await serveArtifacts(folders) : null;
  return {
    artifacts,
    httpUrl: (a) => a.remoteUrl ?? `${server?.urlFor(a.slug)}${a.entry === "index.html" ? "" : a.entry}`,
    fileUrl: (a) => a.folder ? pathToFileURL(join(a.folder, a.entry)).href : null,
    origin: (a) => {
      const url = new URL(a.remoteUrl ?? /** @type {StaticServerLike} */ (server).urlFor(a.slug));
      return `${url.origin}${url.pathname.replace(/[^/]*$/, "")}`;
    },
    close: async () => {
      await server?.close();
      if (stagingRoot) rmSync(stagingRoot, { recursive: true, force: true });
    },
  };
}

/** @typedef {{ urlFor: (slug: string) => string }} StaticServerLike */
