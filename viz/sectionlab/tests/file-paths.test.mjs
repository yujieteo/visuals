import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("the browser test serves the exact page from a path with spaces, %, # and Unicode", async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), "sectionlab paths % # café-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  mkdirSync(join(scratch, "tests"));
  for (const file of ["helpers.mjs", "server.mjs"]) {
    cpSync(new URL(file, import.meta.url), join(scratch, "tests", file));
  }
  for (const file of ["src", "reference", "raw.json", "index.html"]) {
    cpSync(new URL(`../${file}`, import.meta.url), join(scratch, file), { recursive: true });
  }
  const { ROOT } = await import(pathToFileURL(join(scratch, "tests", "helpers.mjs")).href);
  assert.equal(readFileSync(join(ROOT, "index.html"), "utf8"), readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  const { serve } = await import(pathToFileURL(join(scratch, "tests", "server.mjs")).href);
  const server = await serve();
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const route of ["/", "/index.html?cache=1"]) {
      const response = await fetch(`${origin}${route}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
      assert.equal(await response.text(), readFileSync(new URL("../index.html", import.meta.url), "utf8"));
    }
    assert.equal((await fetch(`${origin}/not-a-page`)).status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
