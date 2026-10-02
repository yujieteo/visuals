// A minimal static server: GET /<slug>/<path> serves <folder>/<path> for each
// artifact folder it is given, the way the site serves /visuals/<slug>/.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const TYPES = /** @type {Record<string, string>} */ ({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
});

/**
 * @typedef {object} StaticServer
 * @property {string} origin e.g. http://127.0.0.1:53211
 * @property {(slug: string) => string} urlFor the artifact's index URL
 * @property {() => Promise<void>} close
 */

/**
 * Serve each artifact folder at /<slug>/ on a free localhost port.
 * @param {Map<string, string>} folders slug to folder
 * @returns {Promise<StaticServer>}
 */
export async function serveArtifacts(folders) {
  const server = createServer((req, res) => {
    let path;
    try {
      path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const [, slug, ...rest] = path.split("/");
    const root = folders.get(slug);
    if (!root || req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(404).end();
      return;
    }
    const file = normalize(join(root, rest.join("/") || "index.html"));
    if (!file.startsWith(normalize(root) + sep) && file !== normalize(root)) {
      res.writeHead(403).end();
      return;
    }
    let target = file;
    try {
      if (statSync(target).isDirectory()) target = join(target, "index.html");
      statSync(target);
    } catch {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(target)] ?? "application/octet-stream", "cache-control": "no-store" });
    if (req.method === "HEAD") res.end();
    else createReadStream(target).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("static server did not bind a port");
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    urlFor: (slug) => `${origin}/${slug}/`,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
