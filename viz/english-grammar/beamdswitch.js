/* The standard beamdswitch report template, shared by every visualisation.
 *
 * beamdswitch (https://teoyujie.org/visuals/beamdswitch/) turns one Markdown deck into slides, a
 * handout, narration and a video. `deck(report)` writes a report in its deck syntax, always in the
 * same order (templates/beamdswitch-report.md shows the skeleton):
 *
 *   front matter and title slide
 *   # Set-up               what was modelled, its units and conventions
 *   # Method               how the tool solved it
 *   # Results              the numbers, with key equations and plots
 *   # Checks and takeaway  what confirms the numbers, ending on one ::: key frame
 *
 * A report is plain data, so it can be built and tested without a page:
 *   { meta: { title, subtitle, author, date, voice }, narration, notes,
 *     setup, method, results, checks: [frame, ...] }
 * and each frame is
 *   { title, body, narration, notes, key, plot: { x: [a, b], xlabel, ylabel, curves: ["expr", ...] } }
 * `body` is Markdown (LaTeX maths in $...$ or $$...$$); `narration` is plain spoken prose, one
 * caption per sentence; `key`, `plot` and `notes` are optional. Every frame must be narrated, and
 * the last checks frame must carry a key. The visualisation supplies every number already
 * formatted, so the deck says exactly what its page shows.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Beamdswitch = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SECTIONS = [["setup", "Set-up"], ["method", "Method"], ["results", "Results"], ["checks", "Checks and takeaway"]];

  const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  /* Markdown lines that would end a frame or a div early are refused rather than written. */
  function block(text, what) {
    const s = String(text ?? "").replace(/\r\n?/g, "\n").trim();
    for (const line of s.split("\n"))
      if (/^#{1,2}\s/.test(line) || /^\s*:{3,}/.test(line)) throw new Error(`${what} must not contain a heading or a ::: line: ${line}`);
    return s;
  }
  /* Narration is read aloud: no maths, markup or line structure. */
  function spoken(text, what) {
    const s = oneLine(text);
    if (!s) throw new Error(`${what} needs a narration.`);
    if (/[$\\`*_#|<>]/.test(s)) throw new Error(`${what} narration must be plain spoken prose: ${s}`);
    return s;
  }
  const div = (name, text) => [`::: ${name}`, text, ":::"];

  function frame(f, where) {
    const title = oneLine(f.title), what = `Frame "${title}" in ${where}`;
    if (!title) throw new Error(`A frame in ${where} needs a title.`);
    const out = [`## ${title}`, ""];
    if (f.body) out.push(block(f.body, what), "");
    if (f.plot) {
      const p = f.plot, lines = [`x: ${p.x[0]}, ${p.x[1]}`];
      if (p.xlabel) lines.push(`xlabel: ${oneLine(p.xlabel)}`);
      if (p.ylabel) lines.push(`ylabel: ${oneLine(p.ylabel)}`);
      for (const c of p.curves) lines.push(`y = ${oneLine(c)}`);
      out.push(...div("plot", lines.join("\n")), "");
    }
    if (f.key) out.push(...div("key", block(f.key, what)), "");
    if (f.notes) out.push(...div("notes", block(f.notes, what)), "");
    out.push(...div("narration", spoken(f.narration, what)), "");
    return out;
  }

  function deck(report) {
    const meta = report.meta || {};
    if (!oneLine(meta.title)) throw new Error("The report needs a title.");
    const checks = report.checks || [];
    if (!checks.length || !checks.at(-1).key) throw new Error("The last checks frame must carry a ::: key.");
    const out = ["---"];
    for (const k of ["title", "subtitle", "author", "date", "voice"]) if (oneLine(meta[k])) out.push(`${k}: ${oneLine(meta[k])}`);
    out.push("---", "");
    if (report.notes) out.push(...div("notes", block(report.notes, "The title slide")), "");
    out.push(...div("narration", spoken(report.narration, "The title slide")), "");
    SECTIONS.forEach(([id, title], i) => {
      const frames = report[id] || [];
      if (!frames.length) throw new Error(`The ${title} section needs at least one frame.`);
      out.push(`# ${title}`, "", ...div("narration", `Part ${i + 1}. ${title}.`), "");
      for (const f of frames) out.push(...frame(f, title));
    });
    return out.join("\n");
  }

  return { SECTIONS, deck };
});
