// Clone or update yujieteo/site into .cache/site, the default E2E_SITE, to also test the visuals the
// site keeps itself. Pass a site ref (branch, tag or commit) as the first argument to test something other
// than main. The visuals repository's own visuals need no fetch: they are this checkout's viz/.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cache = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), ".cache");
mkdirSync(cache, { recursive: true });

/**
 * @param {string} name
 * @param {string} ref
 */
function sync(name, ref) {
  const dir = join(cache, name);
  /** @param {string[]} args */
  const git = (args) => execFileSync("git", args, { cwd: existsSync(dir) ? dir : cache, stdio: "inherit" });
  if (!existsSync(dir)) git(["clone", "--quiet", "--filter=blob:none", `https://github.com/yujieteo/${name}.git`, name]);
  git(["fetch", "--quiet", "origin", ref]);
  git(["checkout", "--quiet", "--detach", "FETCH_HEAD"]);
  console.log(`${name}: ${execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim()}`);
}

sync("site", process.argv[2] ?? "main");
