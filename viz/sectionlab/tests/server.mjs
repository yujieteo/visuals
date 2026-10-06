import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { ROOT } from "./helpers.mjs";

// The browser test and path regression use the same page-serving interface.
export function serve() {
  const server = http.createServer((req, res) => {
    if (req.url.split("?")[0] !== "/" && req.url.split("?")[0] !== "/index.html") { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(fs.readFileSync(path.join(ROOT, "index.html")));
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}
