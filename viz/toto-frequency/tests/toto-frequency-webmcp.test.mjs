// The page's read-only WebMCP tools, run in the stand-in DOM and checked against raw.json directly.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { openPage } from "./data-visuals-beamdswitch.mjs";

const D = createRequire(import.meta.url)("../raw.json");
const tools = new Map();
await openPage("toto-frequency", { modelContext: { registerTool: (t) => tools.set(t.name, t) } });
const call = async (name, input) => JSON.parse((await tools.get(name).execute(input)).content[0].text);
const plain = (x) => JSON.parse(JSON.stringify(x));

test("the page registers four read-only tools with closed input schemas", () => {
  assert.deepEqual([...tools.keys()], ["get_metadata", "get_ball_counts", "get_ball", "list_draws"]);
  for (const t of tools.values()) {
    assert.equal(t.annotations.readOnlyHint, true, t.name);
    assert.equal(t.inputSchema.additionalProperties, false, t.name);
  }
  assert.equal(tools.get("get_metadata").inputSchema.required, undefined);
  assert.deepEqual(plain(tools.get("get_ball_counts").inputSchema.required), ["window"]);
  assert.deepEqual(plain(tools.get("get_ball").inputSchema.required), ["number"]);
  assert.deepEqual(plain(tools.get("get_ball_counts").inputSchema.properties.window.enum), D.windows.map((w) => w.id));
});

test("get_metadata returns the dataset's windows, bands, method and sources", async () => {
  const m = await call("get_metadata", {});
  for (const key of ["title", "as_of", "latest_draw", "windows", "bands", "method", "random_note", "sources"]) assert.deepEqual(m[key], D[key], key);
});

test("get_ball_counts gives every ball's count in number order, or the most drawn first with shared ranks", async () => {
  for (const w of D.windows) {
    const byNumber = await call("get_ball_counts", { window: w.id });
    assert.equal(byNumber.returned, 49);
    assert.equal(byNumber.truncated, false);
    assert.deepEqual(byNumber.balls.map((b) => [b.number, b.count]), D.balls.map((b) => [b.number, b.counts[w.id]]));
    const most = await call("get_ball_counts", { window: w.id, sort: "most", limit: 10 });
    assert.equal(most.balls.length, 10);
    assert.equal(most.truncated, true);
    for (const [i, b] of most.balls.entries()) {
      // Rank 1 = most drawn; tied balls share a rank, and ties keep ball-number order.
      assert.equal(b.rank, 1 + D.balls.filter((x) => x.counts[w.id] > b.count).length);
      if (i) assert.ok(most.balls[i - 1].count > b.count || (most.balls[i - 1].count === b.count && most.balls[i - 1].number < b.number));
    }
  }
});

test("get_ball returns one ball's draws in the last year, and an error for a number off the grid", async () => {
  const r = await call("get_ball", { number: 7 });
  assert.deepEqual(r.ball, D.balls[6]);
  assert.deepEqual(r.draws.map((d) => d.draw_no), D.draws.filter((d) => d.winning.includes(7)).map((d) => d.draw_no));
  assert.deepEqual(await call("get_ball", { number: 50 }), { error: "number must be 1 to 49" });
});

test("list_draws lists a window's draws newest first, truncating at the limit", async () => {
  for (const w of D.windows) {
    const all = await call("list_draws", { window: w.id });
    assert.equal(all.total, w.draws);
    assert.equal(all.truncated, false);
    assert.deepEqual(all.draws, D.draws.filter((d) => d.date > w.after));
    const three = await call("list_draws", { window: w.id, limit: 3 });
    assert.deepEqual([three.returned, three.truncated, three.draws], [3, true, all.draws.slice(0, 3)]);
  }
});
