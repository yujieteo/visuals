import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";
import { assertButtonsExport, assertStandardDeck, openPage } from "./data-visuals-beamdswitch.mjs";

// engine.js loads as in tests/convexity-action-engine.test.mjs: the model without the page shell.
const require = createRequire(import.meta.url);
const T = require("../beamdswitch.js");
const dir = new URL("../", import.meta.url);
const raw = JSON.parse(await readFile(new URL("raw.json", dir), "utf8"));
const meta = JSON.parse(await readFile(new URL("meta.json", dir), "utf8"));
const data = {
  sources: raw.sources, modifiers: raw.modifiers, actions: raw.actions, observed: raw.observed, drm: raw.drm, studies: raw.studies,
  categories: Object.fromEntries(Object.entries(raw.categories).map(([k, v]) => [k, { label: v.label, prior: v.prior }])),
  fetched: meta.fetched, assumptions: meta.assumptions, instances: 0,
};
const source = (await readFile(new URL("engine.js", dir), "utf8")).replace("%%DATA%%", JSON.stringify(data));
function load() {
  const store = new Map();
  const context = vm.createContext({ Intl, navigator: {}, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } });
  vm.runInContext(`${source}\n;globalThis.E={deckReport,withCtx,inst,nameOf,defaultSet,topOf,ev,fitL,fmtMin,mins,lv,lvc,lensWords,confidence,nowPicks,avoidNow,LBY,TIERL,CLS,CLSL,C};`, context);
  return context.E;
}
const E = load();

// Action pages (ordinary, with a noted tail, an action to avoid, a timed instance), comparisons,
// and NOW, each at several hours and under several lenses.
const avoid = raw.actions.find((a) => a.cat === "avoid").id;
const ROUTES = [
  { name: "a", id: "swim" }, { name: "a", id: "go-to-the-gym" }, { name: "a", id: avoid }, { name: "a", id: "swim@tonight" },
  { name: "compare", actions: ["swim", "go-to-the-gym", "do-nothing"] }, { name: "compare", actions: ["swim"] },
  { name: "now" }, { name: "avoid" }, { name: "a", id: "no-such-action" },
];
const CASES = ROUTES.flatMap((r) => [7, 13, 22.5].flatMap((h) => ["convex", "eu", "ruin", "robust"].map((lens) => ({ r, h, lens }))));
const deckFor = ({ r, h, lens }) => E.withCtx({ h, lens }, () => ({ md: T.deck(E.deckReport(r)), ...check(r) }));
const check = (r) => {
  const o = r.name === "a" ? E.inst(r.id) : r.name === "compare" ? E.inst(r.actions[0]) : null;
  const S = r.name === "a" && o ? E.defaultSet(o) : r.name === "compare" ? r.actions.map(E.inst) : null;
  const top = S && E.topOf(S, E.C.lens);
  return { o, S, top, words: S && E.lensWords(S, E.C.lens), cf: S && E.confidence(S), lens: E.LBY[E.C.lens].name,
    rows: S && S.map((x) => [E.nameOf(x), E.fitL(E.ev(x)) + (E.ev(x).fits ? "" : " · too long"), E.fmtMin(E.mins(x.f)), E.lv(E.ev(x).up), E.lv(x.f.tail), E.lvc(x.f.dn), E.TIERL[E.ev(x).r.tier]]),
    ruin: o && `## Ruin screen for ${E.nameOf(o)}: ${E.TIERL[E.ev(o).r.tier]}`, topName: S && E.nameOf(top),
    picks: !S && E.nowPicks(), avoid: !S && E.avoidNow()[0] };
};
const what = (c) => `${JSON.stringify(c.r)} h=${c.h} lens=${c.lens}`;
const esc = (s) => String(s).replace(/[\\$*_`|<>[\]]/g, "\\$&");

test("the beamdswitch button saves, and Copy deck copies, the deck of the page the route shows", async () => {
  const page = await openPage("convexity-action-engine", { hash: "#/a/swim" });
  const expected = page.run(`Beamdswitch.deck(deckReport({ name: "a", id: "swim" }))`);
  assert.notEqual(expected, page.run(`Beamdswitch.deck(deckReport({ name: "now" }))`));
  await assertButtonsExport(page, "convexity-action-engine", expected);
});

test("every page's deck parses in beamdswitch into the standard template, narrated on every slide", () => {
  for (const c of CASES) assertStandardDeck(deckFor(c).md, what(c));
});

test("an action or comparison deck carries the page's lens words and spec values for every option", () => {
  for (const c of CASES) {
    // Names and values are read in the deck's own context: an instance's name depends on the hour.
    const { md, S, topName, words, rows, cf, lens, ruin } = deckFor(c);
    if (!S) continue;
    assert.ok(md.includes(`## Under ${lens}: ${topName} comes top of ${S.length} options`), what(c));
    rows.forEach(([name, ...cells], i) => {
      const re = (x) => esc(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const row = new RegExp(`^\\| ${re(name)} \\| [^|]+ \\| ${re(words[i])} \\| ${cells.map(re).join(" \\| ")} \\|$`, "m");
      assert.match(md, row, `${what(c)}: ${name}`);
    });
    assert.ok(md.includes(`| Overall comparison | ${esc(cf.overall)} |`), what(c));
    assert.ok(md.includes(ruin), what(c));
  }
});

test("the NOW deck lists the page's class leaders and the action to avoid", () => {
  for (const c of CASES.filter((x) => !["a", "compare"].includes(x.r.name) || (x.r.name === "a" && !E.inst(x.r.id)))) {
    const { md, picks, avoid: top } = deckFor(c);
    for (const k of E.CLS.slice(0, 6)) {
      const [a] = picks[k];
      assert.ok(md.includes(`| ${E.CLSL[k]} | ${a ? esc(E.nameOf(a)) : "—"} |`), `${what(c)}: ${k}`);
    }
    assert.ok(md.includes(`## Avoid: ${E.nameOf(top)}, ${top.f.ruin.kind}`), what(c));
  }
});
