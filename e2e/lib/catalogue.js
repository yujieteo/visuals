// Discover the visuals to test. discoverVisualsRepo reads every viz/<slug>/visual.json of a
// yujieteo/visuals checkout, the visuals' home. discoverVisuals reads a clone of yujieteo/site: its
// catalogue is data/visuals/*.yaml, a stub whose html_path starts with visuals/ is built in the site
// repository (visuals/<slug>/), and an older stub may still be pinned to a yujieteo/visuals commit by
// data/visuals/<slug>.pin. A folder visuals/<slug>/ without a stub is still discovered, so nothing the
// site ships can hide from the suite.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * @typedef {object} Visual
 * @property {string} slug
 * @property {string} title
 * @property {string} summary
 * @property {"site" | "visuals"} source where the page is built: visuals/<slug>/ in the site, or viz/<slug>/ in the visuals repository
 * @property {string} htmlPath html_path from the catalogue, relative to its repository
 * @property {string | null} dataPath data_path from the catalogue, published as data.json
 * @property {string[]} assets extra files published beside index.html, relative to their repository
 * @property {string | null} pin the visuals commit for a visual a site stub still pins; null to read the checkout
 * @property {boolean} catalogued whether data/visuals/<slug>.yaml exists
 * @property {boolean} offlineClaim whether the visual says it works offline or from file://
 * @property {string} owner the repository that owns the visual's source
 */

const OFFLINE_CLAIM = /\boffline\b|\bfile:\/\/|no network access|no network request/i;

/**
 * The repository that owns a site-built visual: the first yujieteo repository
 * other than the site that its AGENTS.md names, else the site itself.
 * @param {string} folder
 * @returns {string}
 */
function siteVisualOwner(folder) {
  const agents = join(folder, "AGENTS.md");
  if (existsSync(agents)) {
    for (const match of readFileSync(agents, "utf8").matchAll(/github\.com\/yujieteo\/([A-Za-z0-9._-]+)/g)) {
      const repo = match[1].replace(/\.git$/, "");
      if (repo !== "site") return `https://github.com/yujieteo/${repo}`;
    }
  }
  return "https://github.com/yujieteo/site";
}

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
      source: /** @type {const} */ ("visuals"),
      htmlPath: `${folder}index.html`,
      dataPath: doc.data ? folder + String(doc.data) : null,
      assets: Array.isArray(doc.assets) ? doc.assets.map((/** @type {unknown} */ asset) => folder + String(asset)) : [],
      pin: null,
      catalogued: true,
      offlineClaim: OFFLINE_CLAIM.test(summary) || OFFLINE_CLAIM.test(readmeText(join(viz, slug))),
      owner: "https://github.com/yujieteo/visuals",
    };
  });
}

/**
 * Enumerate every visual in a clone of yujieteo/site, sorted by slug.
 * @param {string} siteRoot
 * @returns {Visual[]}
 */
export function discoverVisuals(siteRoot) {
  const stubs = join(siteRoot, "data", "visuals");
  if (!existsSync(stubs)) throw new Error(`not a clone of yujieteo/site (no data/visuals/): ${siteRoot}`);
  /** @type {Map<string, Visual>} */
  const visuals = new Map();
  for (const name of readdirSync(stubs).filter((n) => n.endsWith(".yaml")).sort()) {
    const doc = parse(readFileSync(join(stubs, name), "utf8"));
    const slug = String(doc.slug ?? name.replace(/\.yaml$/, ""));
    const htmlPath = String(doc.html_path);
    const source = htmlPath.startsWith("visuals/") ? "site" : "visuals";
    const pinFile = join(stubs, `${slug}.pin`);
    const pin = source === "visuals" && existsSync(pinFile) ? readFileSync(pinFile, "utf8").trim() : null;
    const folder = join(siteRoot, "visuals", slug);
    const summary = String(doc.summary ?? "");
    visuals.set(slug, {
      slug,
      title: String(doc.title ?? slug),
      summary,
      source,
      htmlPath,
      dataPath: doc.data_path ? String(doc.data_path) : null,
      assets: Array.isArray(doc.assets) ? doc.assets.map(String) : [],
      pin,
      catalogued: true,
      offlineClaim: OFFLINE_CLAIM.test(summary) || (source === "site" && OFFLINE_CLAIM.test(readmeText(folder))),
      owner: source === "site" ? siteVisualOwner(folder) : "https://github.com/yujieteo/visuals",
    });
  }
  const folders = join(siteRoot, "visuals");
  if (existsSync(folders)) {
    for (const slug of readdirSync(folders).sort()) {
      const folder = join(folders, slug);
      if (visuals.has(slug) || !existsSync(join(folder, "index.html"))) continue;
      visuals.set(slug, {
        slug,
        title: slug,
        summary: "",
        source: "site",
        htmlPath: `visuals/${slug}/index.html`,
        dataPath: null,
        assets: [],
        pin: null,
        catalogued: false,
        offlineClaim: OFFLINE_CLAIM.test(readmeText(folder)),
        owner: siteVisualOwner(folder),
      });
    }
  }
  return [...visuals.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
