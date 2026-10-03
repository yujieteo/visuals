// Clone or update yujieteo/site and yujieteo/visuals into .cache/, the
// default E2E_SITE and E2E_VISUALS. Pass a site ref (branch, tag or commit)
// as the first argument to test something other than main.
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
sync("visuals", "main");
