import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read } from "./finance-beamdswitch-checks.mjs";

const slug = "panw";
const HEAD = "fy|revenue_usd|operating_cash_flow_usd|cash_margin_pct";

// Run the page's WebMCP block against a stub modelContext and return the tools it registers.
function tools(html) {
  const rows = /const rows=(\[.*?\]),CASE=/.exec(html)[1];
  const block = html.split("\n").find((l) => l.startsWith("const result="));
  const registered = {};
  vm.runInNewContext(`const rows=${rows};${block}`, { document: { modelContext: { registerTool: (t) => (registered[t.name] = t) } }, navigator: {} });
  return { rows: JSON.parse(rows), registered };
}
const text = async (tool, input) => (await tool.execute(input)).content[0].text;
const line = (r) => `${r.fy}|${r.revenue}|${r.operating_cash_flow}|${r.cash_margin.toFixed(1)}`;

const { rows, registered } = tools(read(`index.html`));
const { get_data, query } = registered;

test(`${slug}: query is read-only and returns one fiscal year's row for a known fy`, async () => {
  assert.equal(query.annotations.readOnlyHint, true);
  const r = rows[1];
  assert.equal(await text(query, { fy: r.fy }), `${HEAD}\n${line(r)}\ntotal|1\nnext|compare revenue and cash margin`);
});

test(`${slug}: query names the available years for an unknown fy`, async () => {
  const years = rows.map((r) => r.fy).join(", ");
  assert.equal(await text(query, { fy: "1999" }), `${HEAD}\ntotal|0\nnext|unknown fiscal year; use one of ${years}`);
});

test(`${slug}: query without fy returns every row, in get_data's format`, async () => {
  const all = `${HEAD}\n${rows.map(line).join("\n")}\ntotal|${rows.length}`;
  for (const input of [{}, undefined]) assert.equal(await text(query, input), `${all}\nnext|compare revenue and cash margin`);
  assert.equal(await text(get_data, {}), `${all}\nnext|query a fiscal year`);
});
