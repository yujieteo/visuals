/* One lesson of the grammar laboratory as a beamdswitch report.
 *
 * report(idx, L, conceptId) turns one concept page into the plain-data report that the standard
 * template (beamdswitch.js, `Beamdswitch.deck`) writes as a narrated Markdown deck. `L` is EGLogic and
 * `idx` its index of the page's data (L.index(D)). The deck uses only that concept's own content, as
 * its page shows it: name, orientation, the primary example with its analysis, the explanation, the
 * technical note, and the contrasts the page lists for it. The only book references are the concept's
 * own, which were checked against the publisher's contents pages; the analyses were not checked against
 * the book's text, and the deck says so.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EGReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const BOOK = "The Cambridge Grammar of the English Language";
  /* The page footer's note, word for word. */
  const HONEST = "Teaching examples and explanations are original illustrative examples written for this page; they are not taken from the book. " +
    "Analyses follow the book's framework as known to the author and have not yet been checked against the book's text.";

  const q = (s) => "“" + s + "”";
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const article = (s) => (/^[aeiou]/i.test(s) ? "an " : "a ") + s;
  const list = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
  const NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const refText = (r) => r.label + (r.page ? " (p. " + r.page + ")" : "");
  /* Markdown body text: the data's * (ungrammatical) and __ (gap) are literal, not emphasis. */
  const md = (s) => String(s).replace(/[\\`*_$<]/g, "\\$&");
  /* Narration is read aloud: a starred example is said as "not ...", and a gap as "a gap". */
  const speak = (s) => String(s).replace(/\s*\(__\)/g, "").replace(/__/g, "a gap").replace(/\(\*/g, "(not ")
    .replace(/&/g, " and ").replace(/[*$\\`_#|<>·]/g, "").replace(/\s+/g, " ").trim();
  /* A sentence named inside narration, without its final stop. */
  const bare = (s) => speak(s).replace(/[.!?]+$/, "");

  /* The inspector's fields for one constituent, as the page lists them. */
  function fields(d) {
    const rows = ["- Category: " + d.category + (d.level === "word" ? " (word level)" : d.level === "phrase" || d.level === "clause" ? " (" + d.level + " level)" : "")];
    rows.push(d.top ? "- Function: none at this level; this is the top-level unit of the example."
      : "- Function: **" + d.function + "** in the " + d.container.category.toLowerCase() + " " + q(md(d.container.text)));
    if (d.head) rows.push("- Head: " + q(md(d.head.text)) + " (" + d.head.category.toLowerCase() + ")");
    if (d.contains) rows.push("- Contains: " + d.contains.map((k) => k.function + ": " + k.category + " " + q(md(k.text))).join("; "));
    if (d.construction) rows.push("- Construction: " + md(d.construction));
    if (d.form) rows.push("- Form / feature: " + md(d.form));
    if (d.anchor) rows.push("- Anchor: supplement to " + q(md(d.anchor.text)) + "; it is not a dependent of it.");
    if (d.gap) rows.push("- Gap: not pronounced here; understood via " + q(md(d.gap.text)) + ".");
    if (d.fused) rows.push("- Fusion: one expression with two functions at once (" + d.function.toLowerCase() + ").");
    return rows.join("\n");
  }

  /* The text version of the tree, as the page's Tree view gives it. */
  function outline(idx, L, e, n, depth) {
    const d = L.describe(idx, e.id, n.id);
    const extra = (n.gap ? " — gap, understood via " + q(md(d.gap.text)) : "") + (n.anchor ? " — supplement anchored to " + q(md(d.anchor.text)) : "");
    const line = "  ".repeat(depth) + "- " + (d.top ? "" : d.function + ": ") + d.category + " " + q(md(d.text)) + extra;
    return [line].concat((n.children || []).map((k) => outline(idx, L, e, k, depth + 1))).join("\n");
  }

  const spokenPart = (k) => lower(k.function) + ", " + article(lower(k.category)) + (k.text === "__" ? "" : ", " + speak(k.text));

  function contrastFrame(idx, L, k) {
    const side = (s) => {
      const e = idx.examples.get(k[s].ex), d = L.describe(idx, e.id, k[s].node);
      return { e, d, line: "- " + md(e.text) + " " + q(md(d.text)) + " is " + (d.top ? "the top level" : "**" + d.function + "**") + " · " + d.category };
    };
    const a = side("a"), b = side("b");
    return {
      title: "Compare: " + a.e.text + " / " + b.e.text,
      body: [a.line, b.line, "", "**The difference.** " + md(k.explanation)].join("\n"),
      narration: "Compare " + bare(a.e.text) + ", with " + bare(b.e.text) + ". " + speak(k.explanation),
    };
  }

  function report(idx, L, conceptId) {
    const D = idx.D, c = idx.concepts.get(conceptId);
    if (!c) throw new Error("Unknown concept: " + conceptId);
    const item = L.primaryItem(idx, c.id, null), e = idx.examples.get(item.ex), d = L.describe(idx, e.id, item.node);

    const about = [md(c.orientation)];
    if (c.aliases) about.push("", "Familiar terms: " + md(c.aliases.join(", ")) + " (aliases, not the book's terms).");
    if (c.abbr) about.push("", "Abbreviation: " + md(c.abbr.join(", ")) + ".");
    about.push("", "CGEL reference: " + refText(c.references[0]) + ".");

    const example = ["**" + md(e.text) + "**"];
    if (e.context) example.push("", "Context: " + md(e.context));
    if (e.usage) example.push("", "Usage: " + md(e.usage));
    example.push("", "Selected " + (d.level === "gap" ? "gap" : d.level) + ": " + q(md(d.text)), "", fields(d));
    const role = d.top ? ", and it is the top-level unit of the example." : ", and its function is " + lower(d.function) + " in the " + d.container.category.toLowerCase() + " " + speak(d.container.text) + ".";

    const top = L.describe(idx, e.id, e.tree.id);
    const results = [{ title: "Why this analysis?", body: md(e.explanation), narration: speak(e.explanation) }];
    if (e.predict) results.push({ title: "Try it", body: md(e.predict.question) + "\n\n**Answer.** " + md(e.predict.answer),
      narration: "Try it yourself. " + speak(e.predict.question) + " " + speak(e.predict.answer) });
    if (c.note) results.push({ title: "Technical note", body: md(c.note) + (c.references.length > 1 ? "\n\nAlso: " + c.references.slice(1).map(refText).join("; ") + "." : ""),
      narration: speak(c.note) });

    const checks = D.contrasts.filter((k) => k.concepts.includes(c.id)).map((k) => contrastFrame(idx, L, k));
    checks.push({ title: "How far to trust this", body: HONEST + "\n\nTerminology and framework follow " + BOOK + " by " + D.book.authors + " (" + D.book.publisher + ", " + D.book.year + ").",
      narration: HONEST });
    checks.push({ title: "Takeaway", key: md(c.orientation), narration: "To sum up. " + speak(c.orientation) });

    return {
      meta: { title: c.name, subtitle: "A lesson from " + D.title },
      notes: HONEST,
      narration: speak(c.name) + ". A lesson from " + D.title + ", an interactive guide to the analysis in " + BOOK + ".",
      setup: [{ title: "What this lesson covers", body: about.join("\n"), narration: speak(c.orientation) }],
      method: [
        { title: "The example: " + e.text, body: example.join("\n"),
          narration: "The example sentence is: " + speak(e.text) + " Look at " + speak(d.text) + ". Its category is " + lower(d.category) + role +
            (d.head ? " Its head is " + speak(d.head.text) + "." : "") },
        { title: "The structure", body: outline(idx, L, e, e.tree, 0),
          narration: "Taken apart, the " + lower(top.category) + " " + bare(e.text) + " has " + (NUMBERS[top.contains.length] || top.contains.length) + (top.contains.length === 1 ? " part: " : " parts: ") +
            list(top.contains.map(spokenPart)) + "." },
      ],
      results,
      checks,
    };
  }

  return { HONEST, report, speak, md };
});
