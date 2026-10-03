// The kit's contract as node tests, which every generated visual runs from its tests/<slug>-kit.test.mjs: the
// versioned state (§5, §13), the URL fragment (§12), JSON import and export (§14), the Markdown record and the
// narrated beamdswitch deck of every example (§15), parsed with beamdswitch's own parser. Each test runs the
// visual's code and asserts on what it returns; none reads a page's source text.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { parseDeck, splitSentences } from "../templates/beamdswitch/deck.mjs";
import { compile } from "../templates/beamdswitch/plot.mjs";

// Loaded as plain CommonJS, as the page loads them as plain scripts.
const load = createRequire(import.meta.url);
const VisualKit = load("./kit.js");
/** @type {typeof import("../templates/beamdswitch.js")} */
const Beamdswitch = load("../templates/beamdswitch.js");

/** The sections every deck has, in order: the # headings of the site's templates/beamdswitch-report.md. */
const SECTIONS = [...readFileSync(new URL("../templates/beamdswitch/report-template.md", import.meta.url), "utf8").matchAll(/^# (.+)$/gm)].map((m) => m[1]);

/**
 * A deck in the standard template: title slide, the four sections in order, a voice, every slide narrated in plain
 * spoken prose, every plot curve an expression beamdswitch can draw, and one ::: key on the last frame.
 * @param {string} md @param {string} what
 */
export function assertStandardDeck(md, what) {
  const deck = parseDeck(md);
  assert.equal(deck.frames[0].kind, "title", what);
  assert.match(deck.meta.voice ?? "", /^[a-z]{2}_[a-z]+$/, `${what}: names its narration voice`);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), SECTIONS, what);
  assert.equal((md.match(/^::: narration$/gm) ?? []).length, deck.frames.length, `${what}: one ::: narration per slide`);
  for (const f of deck.frames) {
    assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
    assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻%&≈]/, `${what}: "${f.title}" reads as speech: ${f.narration}`);
  }
  for (const s of SECTIONS) assert.ok(deck.frames.some((f) => f.kind === "frame" && f.section === s), `${what}: ${s} has a frame`);
  for (const m of md.matchAll(/^y = (.+)$/gm)) {
    const y = compile(m[1]);
    assert.ok(Number.isFinite(y(1)), `${what}: the plot curve ${m[1]} is finite at x = 1`);
  }
  const last = deck.frames.at(-1);
  assert.equal(last?.section, SECTIONS.at(-1), what);
  assert.equal((md.match(/^::: key$/gm) ?? []).length, 1, `${what}: ends on one ::: key`);
  return deck;
}

/**
 * Register the kit's contract tests for one visual.
 * @param {{ slug: string, title: string, model: any, report: any, data: any }} visual
 */
export function kitTests({ slug, title, model, report, data }) {
  const spec = { slug, schemaVersion: model.SCHEMA_VERSION, fields: model.FIELDS };
  const base = VisualKit.defaults(model.FIELDS);
  /** @type {[string, Record<string, any>][]} */
  const states = [["defaults", base], ...model.EXAMPLES.map((/** @type {KitExample} */ e) => [`example ${e.id}`, VisualKit.normalize(model.FIELDS, e.state).state])];

  test("the state schema: the model names this visual, every field has a label and a valid default, and every example is valid", () => {
    assert.equal(model.SLUG, slug);
    assert.ok(Number.isInteger(model.SCHEMA_VERSION) && model.SCHEMA_VERSION >= 1, "a positive integer schema version");
    for (const [key, field] of Object.entries(model.FIELDS)) {
      assert.match(key, /^[a-z][a-z0-9_]*$/, `${key}: a URL-safe field name`);
      assert.ok(field.label, `${key} has a label`);
      assert.equal(VisualKit.coerce(field, field.default), field.default, `${key}: its default is valid`);
    }
    const ids = model.EXAMPLES.map((/** @type {KitExample} */ e) => e.id);
    assert.equal(new Set(ids).size, ids.length, "example ids are unique");
    for (const e of model.EXAMPLES) assert.deepEqual(VisualKit.normalize(model.FIELDS, e.state).notices, [], `${e.id} is a valid state`);
  });

  test("the URL fragment: the default view has none, and every state survives fragment -> state -> fragment", () => {
    assert.equal(VisualKit.toHash(model.FIELDS, base), "");
    for (const [name, state] of states) {
      const back = VisualKit.fromHash(model.FIELDS, VisualKit.toHash(model.FIELDS, state));
      assert.deepEqual(back, { state, notices: [] }, name);
    }
  });

  test("a stale or unknown URL value resets to its default with a notice, and keeps the valid ones", () => {
    const [key, field] = Object.entries(model.FIELDS)[0];
    const bad = field.type === "enum" ? "not-a-value" : field.type === "boolean" ? "maybe" : field.type === "string" ? "x".repeat(201) : String((field.max ?? 1e9) + 1);
    const read = VisualKit.fromHash(model.FIELDS, `#${key}=${encodeURIComponent(bad)}&unknown_field=1`);
    assert.deepEqual(read.state, base);
    assert.equal(read.notices.length, 2, read.notices.join(" "));
    assert.doesNotMatch(read.notices.join(" "), /NaN|undefined|Infinity/);
  });

  test("JSON export and import: the same state back, and a file of another visual or schema version is refused", () => {
    for (const [name, state] of states) {
      const json = VisualKit.toJson(spec, state);
      assert.equal(json, VisualKit.toJson(spec, { ...state }), `${name}: export is deterministic`);
      assert.deepEqual(JSON.parse(json), { schemaVersion: model.SCHEMA_VERSION, visual: slug, state }, name);
      assert.deepEqual(VisualKit.fromJson(spec, json), { state, notices: [] }, name);
    }
    const doc = JSON.parse(VisualKit.toJson(spec, base));
    assert.throws(() => VisualKit.fromJson(spec, JSON.stringify({ ...doc, schemaVersion: model.SCHEMA_VERSION + 1 })), /schema version/);
    assert.throws(() => VisualKit.fromJson(spec, JSON.stringify({ ...doc, visual: "another-visual" })), /not of/);
    assert.throws(() => VisualKit.fromJson(spec, "{"), /not JSON/);
  });

  test("derive is deterministic and its values are plain data", () => {
    for (const [name, state] of states) {
      const d = model.derive(state, data);
      assert.deepEqual(model.derive({ ...state }, data), d, name);
      assert.deepEqual(JSON.parse(JSON.stringify(d)), d, `${name}: derived values survive JSON, with no NaN or Infinity`);
    }
  });

  test("every state's deck opens in beamdswitch as the standard template, narrated on every slide", () => {
    for (const [name, state] of states) {
      const r = report.report(state, model.derive(state, data), data);
      const md = Beamdswitch.deck(r);
      assert.equal(assertStandardDeck(md, name).meta.title, title);
      assert.equal(md, Beamdswitch.deck(report.report(state, model.derive(state, data), data)), `${name}: the deck is deterministic`);
    }
  });

  test("the Markdown record holds the deck's frames, in order, without narration", () => {
    for (const [name, state] of states) {
      const r = report.report(state, model.derive(state, data), data);
      const record = VisualKit.markdown(r);
      const frames = parseDeck(Beamdswitch.deck(r)).frames.filter((f) => f.kind === "frame").map((f) => f.title);
      const headings = [...record.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
      assert.deepEqual(headings, frames, name);
      assert.match(record, new RegExp(`^# ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
      assert.doesNotMatch(record, /::: narration/);
    }
  });
}
