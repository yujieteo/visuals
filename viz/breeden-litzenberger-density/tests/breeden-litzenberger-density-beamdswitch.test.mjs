import test from "node:test";
import assert from "node:assert/strict";
import { SLUG, assertBlockedSave, assertStandardDeck, load, openPage, read } from "./finance-beamdswitch-checks.mjs";

// The scripts as the page runs them, loaded into one context: the template and the report.
const context = load(read("beamdswitch.js"), read("report.js"));
const Beamdswitch = /** @type {typeof import("../beamdswitch.js")} */ (context.Beamdswitch);
const BLReport = /** @type {typeof import("../report.js")} */ (context.BLReport);
/** @typedef {Parameters<typeof BLReport.report>[0]} PageData */
const WIDTHS = [0.5, 1, 2, 5];
const controls = () => ({ ".seg button": WIDTHS.map((d) => ({ d: String(d) })) });
// The page's model, curves and cross-check table, as a run of the page holds them.
/** @type {PageData} */
const P = JSON.parse(JSON.stringify(openPage(controls()).run("P")));
const VIEWS = [65, 80.5, 100, 123, 145].flatMap((K) => WIDTHS.map((D) => ({ K, D })));
/** @typedef {{ K: number, D: number }} View */
const deckFor = (/** @type {View} */ v) => Beamdswitch.deck(BLReport.report(P, v));
const what = (/** @type {View} */ v) => `K=${v.K} D=${v.D}`;

// The closed-form Black-Scholes density, computed here from the model, not from the page.
/** @param {number} K @param {PageData["MODEL"]} model */
const density = (K, { S0, r, sigma, T }) => {
  const d2 = (Math.log(S0 / K) + (r - sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  return Math.exp(-d2 * d2 / 2) / Math.sqrt(2 * Math.PI) / (K * sigma * Math.sqrt(T));
};

test("every strike and half-width's deck parses in beamdswitch as the standard template, narrated on every slide", () => {
  for (const v of VIEWS) {
    const deck = assertStandardDeck(deckFor(v), what(v));
    assert.equal(deck.meta.title, `The risk-neutral density at K = ${v.K}`);
  }
});

test("the deck's numbers are the page's: its read-out, its cross-check table, and the closed form", () => {
  for (const v of VIEWS) {
    const md = deckFor(v), r = BLReport.reading(P, v.K, v.D);
    assert.ok(md.includes(`## At K = ${v.K} with Δ = ${v.D}: butterfly density ${r.est.toFixed(5)}, Black–Scholes density ${r.pK.toFixed(5)}`), what(v));
    assert.ok(Math.abs(r.pK - density(v.K, P.MODEL)) < 1e-6, `${what(v)}: the drawn density is the closed form`);
    // The plot's expression is the same closed form.
    const plotted = /y = (.+)/.exec(md)?.[1] ?? "";
    assert.ok(plotted.includes(`ln(${P.MODEL.S0}/x) + 0.03`) && plotted.includes("x*0.2*sqrt(2*pi)"), plotted);
    for (const x of P.XCHECK) assert.ok(md.includes(`| ${x.delta} | ${x.price} | ${x.est} |`), `${what(v)}: Δ = ${x.delta}`);
    assert.ok(md.includes(`$$ C(100) = 10.4506, \\quad C''(100) = 0.018762, \\quad e^{rT} C''(100) = 0.019724 $$`), what(v));
    assert.match(md, /::: key\nThe risk-neutral density is the curvature of the call-price curve/, what(v));
  }
  assert.deepEqual(P.XCHECK.map((x) => x.est), ["0.019623", "0.019708", "0.01972", "0.019723"]);
});

test("the beamdswitch button saves, and Copy deck copies, the deck of the strike and half-width shown", async () => {
  const page = openPage(controls());
  for (const v of [{ K: 100, D: 2 }, { K: 123.5, D: 0.5 }, { K: 70, D: 5 }]) {
    page.$("strike").value = String(v.K);
    await page.$("strike").fire("input");
    await page.click(page.pick(".seg button", "d", String(v.D)));
    const out = await page.exportDeck(), r = BLReport.reading(P, v.K, v.D);
    assert.equal(page.$("readout").textContent, `At K = ${v.K} with Δ = ${v.D}: butterfly density ${r.est.toFixed(5)} · Black–Scholes density ${r.pK.toFixed(5)}`);
    assert.deepEqual([out.name, out.text, out.copied], [`${SLUG}-beamdswitch.md`, deckFor(v), deckFor(v)], what(v));
  }
});

test("a blocked download points to Copy deck without touching the clipboard", () => assertBlockedSave(controls()));

test("at() hits grid strikes exactly, interpolates linearly between them and clamps outside the grid", () => {
  const C = P.CURVES, [lo, hi] = [C[0], C[C.length - 1]], i = C.length >> 1;
  for (const col of /** @type {const} */ ([1, 2])) {
    assert.equal(BLReport.at(C, C[i][0], col), C[i][col]);
    const mid = (C[i][0] + C[i + 1][0]) / 2;
    assert.ok(Math.abs(BLReport.at(C, mid, col) - (C[i][col] + C[i + 1][col]) / 2) < 1e-12, `column ${col} midpoint`);
    assert.equal(BLReport.at(C, lo[0] - 10, col), lo[col]);
    assert.equal(BLReport.at(C, hi[0] + 10, col), hi[col]);
  }
});
