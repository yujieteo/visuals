/* The Tampines hub food map: the page's embedded ranking, calorie estimates and metadata against the
   committed data (raw.json, sgfoodid.json, meta.json), the page's single-file rules, and its three
   read-only WebMCP tools run in Node against a stand-in modelContext. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const html = read("index.html");
const RAW = JSON.parse(read("raw.json"));
const SG = JSON.parse(read("sgfoodid.json"));
const META = JSON.parse(read("meta.json"));
const MALLS = ["Tampines Mall", "Century Square", "Tampines 1"];
const TOP_N = 20;

const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
const lines = script.split("\n");
// The first statement declares the embedded data (D, META) and the page's element handles; the tools
// are registered at the end, after the map and card code that needs a real DOM.
const head = lines.find((l) => l.startsWith("const D="));
const tools = script.slice(script.indexOf("const result="));

function loadPage() {
  const registered = new Map();
  const ctx = vm.createContext({
    document: { querySelector: () => null, modelContext: { registerTool: (t) => registered.set(t.name, t) } },
    matchMedia: () => ({ matches: false }),
  });
  vm.runInContext(`${head}\n${tools}\nthis.D = D; this.PAGE_META = META;`, ctx);
  return { D: plain(ctx.D), PAGE_META: plain(ctx.PAGE_META), registered };
}
const plain = (x) => JSON.parse(JSON.stringify(x)); // strip the VM realm's prototypes
const { D, PAGE_META, registered } = loadPage();
const call = async (name, args) => JSON.parse((await registered.get(name).execute(args)).content[0].text);

// The builder rounds in Python, whose ties can fall either way in binary floating point, so a shown
// value is checked to be its exact value rounded to the shown digits, within half a unit.
const rounded = (shown, exact, digits, name) => {
  assert.equal(shown, Math.round(shown * 10 ** digits) / 10 ** digits, `${name}: ${shown} has more than ${digits} decimals`);
  assert.ok(Math.abs(shown - exact) <= 0.5 / 10 ** digits + 1e-9, `${name}: ${shown} is not ${exact} rounded`);
};
const nutrient = (v) => (v == null || v < 0 ? 0 : v); // SGFoodID writes -1 for trace or no data

test("the page ranks the top 20 open guide picks by rating, then guide count, then name", () => {
  const eligible = RAW.places.filter((p) => p.status === "open" && p.rating != null);
  const ranked = [...eligible].sort((a, b) => b.rating - a.rating || b.guides.length - a.guides.length || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  assert.deepEqual(D.places.map((p) => p.id), ranked.slice(0, TOP_N).map((p) => p.id));
  assert.deepEqual(D.places.map((p) => p.rank), Array.from({ length: TOP_N }, (_, i) => i + 1));
  const closed = RAW.places.filter((p) => p.status !== "open").map((p) => p.id);
  assert.ok(closed.length > 0);
  assert.ok(D.places.every((p) => !closed.includes(p.id)), "a closed place is ranked");
  for (const p of D.places) {
    const raw = RAW.places.find((r) => r.id === p.id);
    assert.equal(p.rating, raw.rating, p.id);
    assert.equal(p.guide_count, raw.guides.length, p.id);
    assert.ok(MALLS.includes(p.mall), p.id);
    assert.match(p.maps_url, /^https:\/\/www\.google\.com\/maps\?cid=\d+$/, p.id);
  }
});

test("each main's kcal and macros are its HPB SGFoodID servings, with shares summing to 100", () => {
  for (const p of D.places) {
    const raw = RAW.places.find((r) => r.id === p.id);
    assert.equal(p.dishes.length, raw.dishes.length, p.id);
    p.dishes.forEach((d, i) => {
      const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      for (const { crId, servings } of raw.dishes[i].sgfoodid) {
        const n = SG[crId].calculatedFoodNutrients;
        t.kcal += nutrient(n.energy) * servings;
        t.protein += nutrient(n.protein) * servings;
        t.carbs += nutrient(n.carbohydrate) * servings;
        t.fat += nutrient(n.fat) * servings;
      }
      const name = `${p.id}: ${d.name}`;
      rounded(d.kcal, t.kcal, 0, `${name} kcal`);
      rounded(d.protein_g, t.protein, 1, `${name} protein`);
      rounded(d.carbs_g, t.carbs, 1, `${name} carbs`);
      rounded(d.fat_g, t.fat, 1, `${name} fat`);
      assert.ok(d.kcal >= 50 && d.kcal <= 2000, name);
      assert.equal(d.pct.protein + d.pct.carbs + d.pct.fat, 100, name);
      assert.ok(["direct", "proxy"].includes(d.match), name);
    });
  }
  const used = new Set(RAW.places.flatMap((p) => (p.dishes || []).flatMap((d) => d.sgfoodid.map((x) => x.crId))));
  assert.deepEqual([...used].sort(), Object.keys(SG).sort(), "sgfoodid.json has unused or missing items");
});

test("meta.json's coverage matches the page, and the page embeds the same metadata", () => {
  const kcals = D.places.flatMap((p) => p.dishes.map((d) => d.kcal)).sort((a, b) => a - b);
  const mid = kcals.length / 2;
  const median = kcals.length % 2 ? kcals[Math.floor(mid)] : (kcals[mid - 1] + kcals[mid]) / 2;
  rounded(META.coverage.median_kcal, median, 0, "median kcal");
  assert.deepEqual(META.coverage, {
    places: TOP_N, dishes: kcals.length, median_kcal: META.coverage.median_kcal,
    by_mall: Object.fromEntries(MALLS.map((m) => [m, D.places.filter((p) => p.mall === m).length])),
  });
  assert.equal(META.slug, "tampines-food-map");
  assert.equal(PAGE_META.title, "Where to eat in Tampines hub");
  assert.match(PAGE_META.claim, new RegExp(`about ${META.coverage.median_kcal.toLocaleString("en-US")} kcal`));
});

test("the page is one self-contained file", () => {
  assert.equal(html.match(/<script/g).length, 1);
  assert.equal(html.match(/<h1>/g).length, 1);
  assert.equal(html.match(/class="card"/g).length, TOP_N);
  assert.doesNotMatch(html, /<(?:script|img|iframe|link)[^>]+(?:src|href)=["']https?:\/\//, "external asset");
  assert.ok(!html.includes("fetch(") && !html.includes("XMLHttpRequest"));
  assert.doesNotMatch(html, /\/(?:Users|home)\//, "local path leaked");
});

test("the page registers three read-only WebMCP tools", async () => {
  assert.deepEqual([...registered.keys()], ["get_data", "get_metadata", "query"]);
  for (const t of registered.values()) assert.equal(t.annotations.readOnlyHint, true, t.name);
  const all = await call("get_data", {});
  assert.equal(all.total, TOP_N);
  assert.deepEqual(all.rows, D.places);
  assert.deepEqual(await call("get_metadata", {}), PAGE_META);
  const t1 = await call("query", { mall: "Tampines 1" });
  assert.equal(t1.total, META.coverage.by_mall["Tampines 1"]);
  const light = await call("query", { max_kcal: 400 });
  assert.ok(light.rows.every((p) => p.dishes.some((d) => d.kcal <= 400)));
  assert.equal(light.total, D.places.filter((p) => p.dishes.some((d) => d.kcal <= 400)).length);
  const none = await call("query", { max_kcal: 1 });
  assert.deepEqual([none.total, none.next_steps], [0, ["Relax max_kcal or drop a filter."]]);
});
