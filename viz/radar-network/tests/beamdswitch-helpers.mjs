// Shared checks for the beamdswitch deck (as stealth-rcs carries them). The deck is parsed with beamdswitch's
// own parser, vendored read-only in tests/fixtures/beamdswitch/, and the folder's beamdswitch.js is compared
// against the vendored copy of the site's templates/beamdswitch.js there.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDeck, splitSentences } from "./fixtures/beamdswitch/deck.mjs";

const root = new URL("../", import.meta.url);
export const read = (path) => readFileSync(new URL(path, root), "utf8");
const skeleton = read("tests/fixtures/beamdswitch/report-template.md");
export const SECTIONS = [...skeleton.matchAll(/^# (.+)$/gm)].map((m) => m[1]);

export function assertInlined(html, id, source, what) {
  const m = new RegExp(`<script id="${id}">\\n([\\s\\S]*?)</script>`).exec(html);
  assert.ok(m, `${what}: the page has a <script id="${id}"> block`);
  assert.equal(m[1], source, `${what}: the page inlines ${id} unchanged`);
}

const divs = (children, name, out = []) => {
  for (const c of children) if (c.type === "div") { if (c.name === name) out.push(c); divs(c.children, name, out); }
  return out;
};

export function assertStandardDeck(md, what) {
  const deck = parseDeck(md);
  assert.equal(deck.frames[0].kind, "title", what);
  assert.match(deck.meta.voice ?? "", /^[a-z]{2}_[a-z]+$/, `${what}: names its narration voice`);
  assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), SECTIONS, what);
  assert.equal(md.match(/^::: narration$/gm).length, deck.frames.length, `${what}: one ::: narration per slide`);
  for (const f of deck.frames) {
    assert.ok(splitSentences(f.narration).length > 0, `${what}: "${f.title}" is narrated`);
    assert.doesNotMatch(f.narration, /[$\\`*_#|<>×⁰¹²³⁴⁵⁶⁷⁸⁹⁻%&≈]/, `${what}: "${f.title}" reads as speech: ${f.narration}`);
  }
  for (const s of SECTIONS) assert.ok(deck.frames.some((f) => f.kind === "frame" && f.section === s), `${what}: ${s} has a frame`);
  const last = deck.frames.at(-1);
  assert.equal(last.section, SECTIONS.at(-1), what);
  assert.equal(divs(last.children, "key").length, 1, `${what}: ends on a ::: key`);
  return deck;
}
