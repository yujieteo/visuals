import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("deck helpers load modules and check a sibling site in paths with spaces, %, # and Unicode", (t) => {
  const scratch = mkdtempSync(join(tmpdir(), "deck paths % # café-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const visual = join(scratch, "visuals", "viz", "fixture");
  mkdirSync(visual, { recursive: true });
  cpSync(new URL("./", import.meta.url), join(visual, "tests"), { recursive: true });
  cpSync(new URL("../beamdswitch.js", import.meta.url), join(visual, "beamdswitch.js"));
  const siteTemplate = join(scratch, "site", "templates", "beamdswitch.js");
  mkdirSync(join(scratch, "site", "templates"), { recursive: true });
  writeFileSync(siteTemplate, "a different site template");
  const { SITE_REPO: _siteRepo, ...env } = process.env;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import { readFileSync, writeFileSync } from "node:fs";
    const helper = await import("./tests/beamdswitch-decks.mjs");
    if (helper.load) {
      assert.equal(typeof helper.load("beamdswitch.js").deck, "function");
    }
    assert.throws(() => helper.assertTemplateCopy("fixture"), /the site's templates/);
    writeFileSync(${JSON.stringify(siteTemplate)}, readFileSync("beamdswitch.js"));
    helper.assertTemplateCopy("fixture");
  `], { cwd: visual, env, encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
