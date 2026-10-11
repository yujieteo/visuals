// Materialise each visual as the standalone artifact the site would publish at
// /visuals/<slug>/: index.html, data.json and any assets, in a folder of its
// own. The suite then tests that folder over http:// and file:// without
// building or deploying the site.
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** @typedef {import("./catalogue.js").Visual} Visual */

/**
 * Stage one visual of the visuals checkout into <stagingRoot>/<slug>/ and return that folder.
 * @param {Visual} visual
 * @param {{ visualsRepo: string, stagingRoot: string }} where
 * @returns {string}
 */
export function stageVisual(visual, { visualsRepo, stagingRoot }) {
  const out = join(stagingRoot, visual.slug);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  copyFileSync(join(visualsRepo, visual.htmlPath), join(out, "index.html"));
  if (visual.dataPath) copyFileSync(join(visualsRepo, visual.dataPath), join(out, "data.json"));
  const folder = dirname(join(visualsRepo, visual.htmlPath));
  for (const asset of visual.assets) {
    const target = join(out, relative(folder, join(visualsRepo, asset)));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(visualsRepo, asset), target);
  }
  return out;
}
