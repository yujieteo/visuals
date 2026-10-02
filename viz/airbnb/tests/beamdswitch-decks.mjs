// Shared checks for the visualisation's beamdswitch deck: the vendored copy of the site's standard report
// template (tests/fixtures/beamdswitch/beamdswitch.js, a copy of the site's templates/beamdswitch.js)
// and the narration voice every deck declares.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
export const read = (path) => readFileSync(new URL(path, root), "utf8");
export const TEMPLATE_PATH = "tests/fixtures/beamdswitch/beamdswitch.js";

// The copy matches a site checkout's templates/beamdswitch.js.
export function assertSiteTemplate(copy, sitePath, what) {
  assert.equal(copy, readFileSync(sitePath, "utf8"), `the site's templates/beamdswitch.js and ${what} must stay identical`);
}

// Every deck names its narrator, so beamdswitch never narrates in silence: a voice id such as bf_emma.
export function assertVoice(deck, what) {
  assert.match(deck.meta.voice ?? "", /^[a-z]{2}_[a-z]+$/, `${what}: declares a voice in its front matter`);
}
