// Discover the visuals to test: discoverVisualsRepo reads every viz/<slug>/visual.json of a
// yujieteo/visuals checkout, the visuals' home.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {object} Visual
 * @property {string} slug
 * @property {string} title
 * @property {string} summary
 * @property {string} htmlPath the page, relative to the repository
 * @property {string | null} dataPath the visual.json "data" file, published as data.json
 * @property {string[]} assets extra files published beside index.html, relative to the repository
 * @property {boolean} offlineClaim whether the visual says it works offline or from file://
 * @property {string} owner the repository that owns the visual's source
 */

const OFFLINE_CLAIM = /\boffline\b|\bfile:\/\/|no network access|no network request/i;

/**
 * @param {string} folder
 * @returns {string}
 */
function readmeText(folder) {
  return ["README.md", "AGENTS.md"].map((name) => join(folder, name))
    .filter((path) => existsSync(path)).map((path) => readFileSync(path, "utf8")).join("\n");
}

/**
 * Enumerate every visual of a yujieteo/visuals checkout (its viz/<slug>/visual.json), sorted by slug. A visual
 * whose page moved to yujieteo/site (site_page in its visual.json) has no page here, so it is left out.
 * @param {string} visualsRoot
 * @returns {Visual[]}
 */
export function discoverVisualsRepo(visualsRoot) {
  const viz = join(visualsRoot, "viz");
  if (!existsSync(viz)) throw new Error(`not a checkout of yujieteo/visuals (no viz/): ${visualsRoot}`);
  const docs = readdirSync(viz).sort().filter((slug) => existsSync(join(viz, slug, "visual.json")))
    .map((slug) => ({ slug, doc: JSON.parse(readFileSync(join(viz, slug, "visual.json"), "utf8")) }));
  return docs.filter(({ doc }) => !doc.site_page).map(({ slug, doc }) => {
    const folder = `viz/${slug}/`;
    const summary = String(doc.summary ?? "");
    return {
      slug,
      title: String(doc.title ?? slug),
      summary,
      htmlPath: `${folder}index.html`,
      dataPath: doc.data ? folder + String(doc.data) : null,
      assets: Array.isArray(doc.assets) ? doc.assets.map((/** @type {unknown} */ asset) => folder + String(asset)) : [],
      offlineClaim: OFFLINE_CLAIM.test(summary) || OFFLINE_CLAIM.test(readmeText(join(viz, slug))),
      owner: "https://github.com/yujieteo/visuals",
    };
  });
}
