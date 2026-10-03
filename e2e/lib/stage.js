// Materialise each visual as the standalone artifact the site would publish at
// /visuals/<slug>/: index.html, data.json and any assets, in a folder of its
// own. The suite then tests that folder over http:// and file:// without
// building or deploying the site.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** @typedef {import("./catalogue.js").Visual} Visual */

/**
 * @param {string} repo
 * @param {string[]} args
 * @returns {Buffer}
 */
function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Read a file from the visuals repository at a pinned commit, fetching the
 * commit first when the clone lacks it.
 * @param {string} visualsRepo
 * @param {string} pin
 * @param {string} path
 * @returns {Buffer}
 */
function pinnedFile(visualsRepo, pin, path) {
  try {
    git(visualsRepo, ["cat-file", "-e", `${pin}^{commit}`]);
  } catch {
    git(visualsRepo, ["fetch", "--quiet", "--no-tags", "origin", pin]);
  }
  return git(visualsRepo, ["show", `${pin}:${path}`]);
}

/**
 * Stage one visual into <stagingRoot>/<slug>/ and return that folder.
 * @param {Visual} visual
 * @param {{ siteRoot: string, visualsRepo: string | null, stagingRoot: string }} where
 * @returns {string}
 */
export function stageVisual(visual, { siteRoot, visualsRepo, stagingRoot }) {
  const out = join(stagingRoot, visual.slug);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  if (visual.source === "site") {
    const folder = join(siteRoot, "visuals", visual.slug);
    copyFileSync(join(siteRoot, visual.htmlPath), join(out, "index.html"));
    if (visual.dataPath) copyFileSync(join(siteRoot, visual.dataPath), join(out, "data.json"));
    for (const asset of visual.assets) {
      const target = join(out, relative(folder, join(siteRoot, asset)));
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(siteRoot, asset), target);
    }
  } else {
    if (!visualsRepo) throw new Error(`${visual.slug} lives in yujieteo/visuals; no checkout of it was found`);
    /** @param {string} path */
    const read = (path) => visual.pin ? pinnedFile(visualsRepo, visual.pin, path) : readFileSync(join(visualsRepo, path));
    writeFileSync(join(out, "index.html"), read(visual.htmlPath));
    if (visual.dataPath) writeFileSync(join(out, "data.json"), read(visual.dataPath));
    const folder = dirname(join(visualsRepo, visual.htmlPath));
    for (const asset of visual.assets) {
      const target = join(out, relative(folder, join(visualsRepo, asset)));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, read(asset));
    }
  }
  return out;
}
