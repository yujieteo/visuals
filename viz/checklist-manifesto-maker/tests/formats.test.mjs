// The formats of Checklist Manifesto Maker: the lossless Markdown profile and Beam MD Switch deck (both round
// trips, parsed with beamdswitch's own parser), plain Markdown and arbitrary-deck drafts, and refusal of oversized,
// malformed, unsupported, duplicated, broken, edited and unsafe files. The canonical fixtures are the exports of
// tests/scenario.mjs; `UPDATE_FIXTURES=1 node --test tests/formats.test.mjs` rewrites them after a deliberate
// format change.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { parseDeck, splitSentences } from "../../../scripts/templates/beamdswitch/deck.mjs";
import { D, F, M, failedCheckScenario, fromExample, unsafeEntry } from "./scenario.mjs";

const Beamdswitch = createRequire(import.meta.url)("../beamdswitch.js");
const fixture = (/** @type {string} */ name) => new URL(`fixtures/${name}`, import.meta.url);
const read = (/** @type {string} */ name) => readFileSync(fixture(name), "utf8");
/** The section headings of the site's beamdswitch report template, in order. */
const SECTIONS = [...readFileSync(new URL("../../../scripts/templates/beamdswitch/report-template.md", import.meta.url), "utf8").matchAll(/^# (.+)$/gm)].map((m) => m[1]);

/** Every fixture this file derives from the scenarios, by name. */
function derived() {
  const canonical = F.toMarkdown(failedCheckScenario());
  const [readable, comment] = canonical.split(F.MARKER);
  const payload = (/** @type {(doc: any) => void} */ change) => {
    const doc = JSON.parse(comment.slice(0, comment.lastIndexOf("-->")));
    change(doc);
    return `${readable}${F.MARKER}\n${JSON.stringify(doc, null, 2)}\n-->\n`;
  };
  return {
    "canonical.md": canonical,
    "canonical.beamdswitch.md": F.toDeck(failedCheckScenario()),
    "unsafe.md": F.toMarkdown(unsafeEntry()),
    "edited-readable.md": canonical.replace("- [ ] Open the page in the local preview.", "- [ ] Open the page in a browser."),
    "malformed-json.md": canonical.replace(`"format": "checklist-manifesto-maker",`, `"format": "checklist-manifesto-maker"`),
    "unsupported-schema.md": payload((doc) => { doc.schemaVersion = 2; }),
    "duplicate-ids.md": payload((doc) => { doc.checklist.pausePoints[1].items[0].id = "s1"; }),
    "broken-reference.md": payload((doc) => { doc.checklist.recoveryRoutes[0].triggers = ["c9"]; }),
  };
}

if (process.env.UPDATE_FIXTURES) for (const [name, text] of Object.entries(derived())) writeFileSync(fixture(name), text);

test("the canonical fixtures are exactly what the scenarios export: equal states give equal bytes", () => {
  for (const [name, text] of Object.entries(derived())) assert.equal(text, read(name), `${name} is current; rerun with UPDATE_FIXTURES=1 after a deliberate change`);
  const e = failedCheckScenario();
  const reverse = (/** @type {any} */ v) => (Array.isArray(v) ? v.map(reverse) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)])) : v);
  const shuffled = reverse(e);
  assert.notEqual(JSON.stringify(shuffled), JSON.stringify(e));
  assert.equal(F.toMarkdown(M.canonicalEntry(shuffled)), F.toMarkdown(e), "key order does not change an export");
  assert.equal(F.toDeck(e), F.toDeck(failedCheckScenario()));
});

test("Markdown round trip: import of an export restores the same semantic state, for every example and the scenario", () => {
  const entries = [...D.examples.map((/** @type {any} */ x) => M.active(fromExample(x.id))), failedCheckScenario(), unsafeEntry()];
  for (const e of entries) {
    const back = F.parseFile(F.toMarkdown(e), "markdown");
    assert.equal(back.kind, "lossless");
    assert.equal(back.profile, "markdown");
    assert.deepEqual(back.entry, M.canonicalEntry(e), e.checklist.title);
    assert.equal(F.toMarkdown(back.entry), F.toMarkdown(e), "export → import → export is stable");
  }
  const fromFile = F.parseFile(read("canonical.md").replace(/\n/g, "\r\n"), "markdown");
  assert.equal(fromFile.summary.revision, 2);
  assert.match(fromFile.summary.progress, /^run1 on revision 1, in progress, at Pause point 1: Before publication$/);
  assert.equal(fromFile.entry.run.results.c1.value, "pending", "the restarted check is pending, never passed");
});

test("Beam MD Switch round trip: the deck parses as the site's report template and restores the same state", () => {
  for (const e of [...D.examples.map((/** @type {any} */ x) => M.active(fromExample(x.id))), failedCheckScenario(), unsafeEntry()]) {
    const text = F.toDeck(e);
    const back = F.parseFile(text, "deck");
    assert.equal(back.kind, "lossless");
    assert.equal(back.profile, "deck");
    assert.deepEqual(back.entry, M.canonicalEntry(e));
    const deck = parseDeck(text);
    const bare = parseDeck(Beamdswitch.deck(F.report(e)));
    assert.equal(deck.frames.length, bare.frames.length, "the payload comment adds no frame");
    assert.equal(deck.frames[0].kind, "title");
    assert.equal(deck.meta.voice, "bf_emma");
    assert.equal(deck.meta.title, e.checklist.title.replace(/\s+/g, " ").trim().replace(/^(["'])(.*)\1$/, "$2"));
    assert.deepEqual(deck.frames.filter((f) => f.kind === "section").map((f) => f.title), SECTIONS);
    for (const s of SECTIONS) assert.ok(deck.frames.some((f) => f.kind === "frame" && f.section === s), `${s} has a frame`);
    assert.equal((text.match(/^::: narration$/gm) ?? []).length, deck.frames.length, "every slide has a narration block");
    for (const f of deck.frames) {
      assert.ok(splitSentences(f.narration).length > 0, `${f.title} is narrated`);
      assert.doesNotMatch(f.narration, /[$\\`*_#|<>]/, `${f.title}: narration is plain speech`);
    }
    assert.equal(deck.frames.at(-1)?.section, SECTIONS.at(-1));
    assert.equal((text.match(/^::: key$/gm) ?? []).length, 1, "one key block, on the last frame");
    assert.ok(deck.frames.at(-1)?.children.some((c) => c.type === "div" && c.name === "key"));
  }
});

test("each pause point is one Results frame, in order, with its mode, critical checks and stop conditions visible", () => {
  const e = M.active(fromExample("day-trip"));
  const frames = parseDeck(F.toDeck(e)).frames.filter((f) => f.kind === "frame" && f.section === "Results");
  assert.deepEqual(frames.map((f) => f.title), ["Pause point 1: Before departure (Do–Confirm)", "Pause point 2: Before return (Read–Do)"]);
  const body = (/** @type {any} */ f) => f.children.map((/** @type {any} */ c) => c.text ?? "").join("\n");
  assert.match(body(frames[0]), /\*\*Critical check:\*\* Confirm the required travel documents are present\./);
  assert.match(body(frames[0]), /\*\*Stop:\*\* The required travel documents are missing\./);
  assert.match(body(frames[1]), /\*\*Stop:\*\* The return transport is cancelled\./);
  assert.doesNotMatch(body(frames[1]), /documents are missing/, "a stop condition shows only where it applies");
});

test("an arbitrary deck becomes a plain draft preview: frames are pause points, blocks and sections are listed", () => {
  const r = F.parseFile(read("arbitrary-deck.md"), "deck");
  assert.equal(r.kind, "plain");
  assert.equal(r.recognized.title, "Morning routine");
  assert.deepEqual(r.recognized.pausePoints, [
    { title: "Wake up", mode: "", items: ["Turn off the alarm.", "Open the curtains."] },
    { title: "Breakfast", mode: "read-do", items: ["Make tea.", "Eat something."] },
  ]);
  const unsupported = r.unsupported.map((/** @type {any} */ u) => u.text).join("\n");
  assert.match(unsupported, /section: # Getting ready/);
  assert.match(unsupported, /block: - not a step either/);
  assert.match(unsupported, /front matter: subtitle/);
  const def = F.draftFromPlain(r.recognized, "cl5", r.text);
  assert.ok(M.items(def).every((/** @type {any} */ i) => i.kind === "step"));
});

test("plain Markdown: headings and task lists become a draft; ticks, labels and other text are never read as state", () => {
  const r = F.parseFile(read("ordinary.md"), "markdown");
  assert.equal(r.kind, "plain");
  assert.equal(r.recognized.title, "Close the workshop");
  assert.deepEqual(r.recognized.pausePoints.map((/** @type {any} */ p) => [p.title, p.mode, p.items.length]), [["Before leaving the bench", "do-confirm", 4], ["Before locking up", "read-do", 3]]);
  assert.deepEqual(r.recognized.pausePoints[0].items, ["Put the hand tools on the wall.", "Sweep the floor.", "Critical check: Confirm the soldering iron is unplugged.", "Close the parts drawers."]);
  assert.equal(r.recognized.pausePoints[1].items[2], "See [the guide](https://example.org/guide) <b>now</b>.", "a link and markup stay literal text");
  assert.match(r.notes.join(" "), /1 ticked box was imported as not done/);
  assert.match(r.notes.join(" "), /1 item is labelled “Critical check”/);
  const lines = r.unsupported.map((/** @type {any} */ u) => `${u.line} ${u.text}`);
  for (const expected of [/^3 Some introductory prose/, /^10 - Details:/, /^19 ### A third-level heading/, /^21 \| a table/, /^25 code: code that is not a step/, /^28 not a pause point: ## Stop conditions/, /^30 - \*\*Stop:\*\* Smoke/, /^32 not a pause point: ## Run progress/]) {
    assert.ok(lines.some((l) => expected.test(l)), `unsupported lists ${expected}: ${lines.join(" | ")}`);
  }
  const def = F.draftFromPlain(r.recognized, "cl7", r.text);
  assert.ok(M.items(def).every((/** @type {any} */ i) => i.kind === "step" && i.required), "no critical status is inferred");
  assert.deepEqual([def.stopConditions, def.recoveryRoutes, def.none], [[], [], { stop: false, escalation: false, recovery: false }], "no condition or route is invented");
  assert.equal(def.originalText, r.text);
  const stripped = F.parseFile(read("canonical.md").split(F.MARKER)[0], "markdown");
  assert.equal(stripped.kind, "plain", "an export without its payload is a plain draft");
  assert.deepEqual(stripped.recognized.pausePoints.map((/** @type {any} */ p) => p.title), ["Before publication", "After publication"]);
});

test("refusals change nothing: oversized, malformed, unsupported, duplicated, broken and edited files", () => {
  const refuse = (/** @type {string} */ text, /** @type {RegExp} */ why, /** @type {boolean} */ plain) => {
    assert.throws(() => F.parseFile(text, "markdown"), (/** @type {any} */ e) => {
      assert.match(e.message, why);
      assert.equal(e.plain, plain, `${why}: the plain draft import is ${plain ? "" : "not "}offered`);
      return true;
    });
  };
  refuse("x".repeat(F.MAX_BYTES + 1), /1,048,577 bytes; the limit is 1 MiB \(1,048,576 bytes\)\. Nothing was imported or truncated/, false);
  assert.doesNotThrow(() => F.checkSize(F.MAX_BYTES), "exactly 1 MiB is accepted");
  refuse(`${"é".repeat(F.MAX_BYTES / 2)}x`, /1,048,577 bytes/, false);
  refuse(read("malformed-json.md"), /not valid JSON/, true);
  refuse(read("unsupported-schema.md"), /schema version 2; this page reads version 1/, true);
  refuse(read("duplicate-ids.md"), /duplicate id s1/, true);
  refuse(read("broken-reference.md"), /names "c9", which is not a critical check or a stop condition/, true);
  refuse(read("edited-readable.md"), /disagree at line 22: the state gives “- \[ \] Open the page in the local preview\.”, the file has “- \[ \] Open the page in a browser\.”/, true);
  const canonical = read("canonical.md");
  refuse(canonical + canonical.slice(canonical.indexOf(F.MARKER)), /more than one embedded checklist state/, true);
  refuse(canonical.replace(/\n-->\n$/, "\n"), /has no end/, true);
  refuse(`${canonical}\nA line added after the state.\n`, /text after the embedded checklist state/, true);
  assert.equal(F.parseFile(read("edited-readable.md").split(F.MARKER)[0], "markdown").kind, "plain", "the edited text can still come in as a plain draft");
});

test("unsafe text stays inert: escaped in the readable part, \\u003c and \\u003e in the payload, exact after import", () => {
  const text = read("unsafe.md");
  const at = text.indexOf(F.MARKER);
  const readable = text.slice(0, at), comment = text.slice(at);
  assert.doesNotMatch(readable, /(?<!\\)<|[^\\\n]>|<!--|-->|(?<!\\)\]\(/, "every <, >, comment delimiter and link bracket of user text is escaped");
  assert.match(readable, /^# Trip \\<script\\>alert\(1\)\\<\/script\\> --\\> \\<\\!-- x --\\>$/m);
  assert.match(readable, /^- \[ \] Pack \\\[water\\\]\(javascript:alert\(1\)\) and \\<img src=x onerror=alert\(1\)\\>$/m);
  assert.equal((comment.match(/-->/g) ?? []).length, 1, "only the payload's own end closes the comment");
  assert.doesNotMatch(comment.slice(F.MARKER.length, comment.lastIndexOf("\n-->")), /[<>]/, "the payload holds no < or >");
  const back = F.parseFile(text, "markdown").entry;
  assert.equal(back.checklist.title, "Trip <script>alert(1)</script> --> <!-- x -->");
  assert.equal(M.find(back.checklist, "s2").node.details, "# not a heading\n::: narration\n## nor a frame\n-->");
  assert.equal(M.find(back.checklist, "x1").node.instruction, "Stop --!> now");
  const deck = F.toDeck(back);
  assert.doesNotThrow(() => parseDeck(deck));
  assert.equal(parseDeck(deck).frames.length, parseDeck(Beamdswitch.deck(F.report(back))).frames.length, "user text adds no frame or block to the deck");
});

test("text that starts with ::: stays inert: both exports build and import back losslessly", () => {
  const e = M.edit(M.active(fromExample("day-trip")), (/** @type {any} */ def) => {
    M.setField(def, "p1", "details", "::: warning");
    M.setField(def, "s1", "text", "::: warning pack water");
    M.setField(def, "s1", "details", "Two litres.");
  });
  for (const [text, profile] of /** @type {const} */ ([[F.toMarkdown(e), "markdown"], [F.toDeck(e), "deck"]])) {
    assert.doesNotMatch(text.slice(0, text.indexOf(F.MARKER)), /^\s*:::\s*warning/m, profile);
    const back = F.parseFile(text, profile);
    assert.equal(back.kind, "lossless");
    assert.equal(back.profile, profile);
    assert.deepEqual(back.entry, M.canonicalEntry(e));
    const draft = F.plain(text.slice(0, text.indexOf(F.MARKER)), profile).recognized;
    const lines = [draft.title, ...draft.pausePoints.flatMap((/** @type {any} */ p) => [p.title, ...p.items])];
    assert.ok(lines.includes("::: warning pack water"), `${profile}: the plain draft keeps the text without the added backslash`);
    assert.ok(lines.every((/** @type {string} */ l) => !l.includes("\\:")), profile);
  }
});
