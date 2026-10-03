// Calibrator: the fuller section-28 checks. A pasted session opens on question
// 1 with no probability; arrow keys choose a value without saving, Enter saves
// it and moves on; the session survives a reload (localStorage); the export
// sheet saves the answered session as TOON; and pasting another session over
// an unfinished one asks first. The page keeps no state in the URL and has no
// Reset: answers are immutable by design.
import assert from "node:assert/strict";
import { assertClean, assertDarkMode, assertReducedMotion, fullSuite, saved } from "../../lib/full.js";

// A two-question session in the Calibrator session TOON schema (the first two
// questions of the repository's sample-session.toon).
const SESSION = [
  "format: calibrator-session",
  "version: 1",
  "session:",
  "  session_id: e2e-two",
  '  generated_at: "2026-10-02T08:00:00Z"',
  "questions[2]{question_id,session_id,proposition,context,high_action,low_action,origin,info_gain,action_impact,novelty,adversariality,relevance,explore_exploit,resolution_rule,resolution_horizon,resolution_status,outcome,resolution_evidence,generated_at}:",
  '  q-2026-10-02-001,e2e-two,Will spending two hours this week prototyping the smallest proof-agent experiment be higher-value than reading two more papers on it?,A recent open-source release makes small theorem-proving agents cheap to run locally.,prototype the experiment this week,keep reading first,news,82,90,70,65,88,exploit,Resolved true if a later note or repository shows the prototype ran and was judged more useful than the reading.,2026-10-16,unresolved,null,null,"2026-10-02T08:00:00Z"',
  '  q-2026-10-02-002,e2e-two,Should I stop project X before investing another ten hours in it?,The last three notes on X record no measurable progress.,stop X and write down why,continue X for ten more hours,notes,75,85,40,92,80,exploit,Resolved true if X is stopped within the horizon and no later note regrets it.,2026-11-01,unresolved,null,null,"2026-10-02T08:00:00Z"',
  "sources[3]{question_id,source_id,title,url,published_at,retrieved_at}:",
  '  q-2026-10-02-001,s1,Example release notes for a small proof agent,"https://example.org/proof-agent-release",2026-09-30,"2026-10-02T07:40:00Z"',
  '  q-2026-10-02-001,s2,Notes,"https://teoyujie.org/notes.html",null,"2026-10-02T07:40:00Z"',
  '  q-2026-10-02-002,s1,Notes,"https://teoyujie.org/notes.html",null,"2026-10-02T07:40:00Z"',
  "claims[3]{question_id,source_id,claim}:",
  "  q-2026-10-02-001,s1,The release runs on a laptop GPU in under an hour per problem.",
  '  q-2026-10-02-001,s2,"A note lists proof agents as a current interest, tagged #agents."',
  "  q-2026-10-02-002,s1,Three consecutive notes on X report no measurable progress.",
].join("\n");

/**
 * Paste a session through the page's own paste box (the clipboard read is refused, as in a locked-down browser).
 * @param {import("playwright").Page} page
 * @param {string} [toon]
 */
async function paste(page, toon = SESSION) {
  await page.evaluate(() => { navigator.clipboard.readText = async () => { throw new Error("blocked"); }; });
  await page.locator("#paste").click();
  await page.locator("#manual-text").fill(toon);
  await page.locator("#manual-load").click();
}
/** @param {import("playwright").Page} page */
const count = (page) => page.locator("#count").innerText();
/** @param {import("playwright").Page} page */
const value = (page) => page.locator("#value").innerText();

await fullSuite("calibrator", {
  keyboard: async ({ open }) => {
    const s = await open();
    try {
      await paste(s.page);
      await s.page.locator("#ask").waitFor({ state: "visible" });
      assert.equal(await count(s.page), "1 / 2");
      assert.equal(await value(s.page), "Unanswered", "an untouched question has no probability");
      await s.page.locator("#range").focus();
      await s.page.keyboard.press("ArrowRight");
      assert.equal(await value(s.page), "50%", "the first arrow key reveals the thumb at 50%");
      await s.page.keyboard.press("PageUp");
      assert.equal(await value(s.page), "60%", "Page Up adds 10");
      assert.equal(await count(s.page), "1 / 2", "choosing neither saves nor moves on");
      await s.page.keyboard.press("Enter");
      await s.page.waitForFunction(() => document.getElementById("count")?.textContent === "2 / 2");
      assert.equal(await value(s.page), "Unanswered", "Enter saves and moves to the next question");
      await s.page.locator("#back").click();
      assert.equal(await value(s.page), "60%", "Back shows the saved answer");
      await s.page.reload();
      await s.page.locator("#ask").waitFor({ state: "visible" });
      assert.equal(await value(s.page), "60%", "the answer persists across a reload");
      // The export sheet saves the answered session as the TOON it previews.
      await s.page.locator("#export-open").click();
      assert.equal(await s.page.locator("#n-answered").innerText(), "1");
      assert.equal(await s.page.locator("#n-unseen").innerText(), "1");
      const file = await saved(s.page, () => s.page.locator("#download").click());
      assert.equal(file.name, "e2e-two-answered.toon");
      assert.equal(file.text, await s.page.locator("#preview").textContent(), "the saved file is the preview");
      assert.match(file.text, /^ {2}q-2026-10-02-001,answered,60,60,0,/m, "the response records 60% first and final, unrevised");
      assert.match(file.text, /^ {2}q-2026-10-02-002,unseen,/m, "the untouched question stays unseen");
      // A different session over this unfinished one (a question is still unseen) asks before replacing it.
      await s.page.locator("#new").click();
      await s.page.locator("#start").waitFor({ state: "visible" });
      await paste(s.page, SESSION.replaceAll("e2e-two", "e2e-other"));
      await s.page.locator("#guard").waitFor({ state: "visible" });
      await s.page.locator("#guard-replace").click();
      await s.page.locator("#ask").waitFor({ state: "visible" });
      assert.equal(await count(s.page), "1 / 2", "Replace starts the new session at question 1");
      assert.equal(await value(s.page), "Unanswered");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  // Section 14: Copy Markdown of the session itself, distinct from the presentation deck.
  "markdown-export": async ({ open }) => {
    const s = await open();
    try {
      await paste(s.page);
      await s.page.locator("#ask").waitFor({ state: "visible" });
      await s.page.locator("#skip").click();
      if (!(await s.page.getByRole("button", { name: /copy markdown/i }).count())) await s.page.locator("#export-open").click();
      const copy = s.page.getByRole("button", { name: /copy markdown/i });
      assert.equal(await copy.count(), 1, "the page offers Copy Markdown of its session");
      await s.page.evaluate(() => {
        const w = /** @type {any} */ (window);
        w.__copied = [];
        navigator.clipboard.writeText = async (t) => { w.__copied.push(t); };
      });
      await copy.click();
      const text = await s.page.evaluate(() => /** @type {any} */ (window).__copied.at(-1));
      assert.match(String(text ?? ""), /^#/m, "the copied session is Markdown");
      assert.ok(String(text).includes("e2e-two"), "the copied Markdown is the loaded session");
      assert.match(String(text), /skipped/i, "and records the skipped question");
      assertClean(s);
    } finally {
      await s.close();
    }
  },

  "dark-mode": (ctx) => assertDarkMode(ctx),

  "reduced-motion": (ctx) => assertReducedMotion(ctx, async (page) => {
    await paste(page);
    await page.locator("#ask").waitFor({ state: "visible" });
    await page.locator("#skip").click();
  }),
});
