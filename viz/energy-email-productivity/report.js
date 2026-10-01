/* The energy-email-productivity page's evidence as a beamdswitch report.
 *
 * report(data, view) turns the page's six evidence records and its current view
 * ({ order, selected, start, end, fetched }) into the plain-data report that the standard template
 * (beamdswitch.js, `Beamdswitch.deck`) writes as a narrated Markdown deck. Every finding, value and
 * citation is the record's own text, as the page's detail panel shows it; nothing is computed.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EnergyEmailReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TITLE = "Your energy dips mid-afternoon. Your inbox doesn't.";
  /* The page's default detail panel, word for word. */
  const PITFALLS = "Pitfall one: your energy follows a circadian rhythm with a mid-afternoon dip. Pitfall two: email keeps interrupting on its own schedule — most of it answered within seconds, each one costing about a minute to recover. The fix in the studies: check email a few fixed times a day instead of reacting all day.";

  const sayDate = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const hour = (h) => `${h}:00`;
  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  /* Narration is read aloud: symbols become words and markup characters are dropped. */
  const say = (s) => String(s ?? "")
    .replace(/(\d)\s?%/g, "$1 percent").replace(/&/g, " and ").replace(/×/g, " times ")
    .replace(/[“”"]/g, "").replace(/[$\\`*_#|<>[\]]/g, " ").replace(/\s+/g, " ").trim();
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

  function report(data, view = {}) {
    const order = view.order || data.map((r) => r.id);
    const byId = Object.fromEntries(data.map((r) => [r.id, r]));
    const points = order.map((id, i) => ({ n: i + 1, r: byId[id] }));
    const measured = points.filter((p) => p.r.role === "measured"), curve = points.filter((p) => p.r.role === "curve");
    const studies = [...new Map(data.map((r) => [r.source_url, r])).values()];
    const start = view.start ?? 8, end = view.end ?? 18;
    const chosen = points.find((p) => p.r.id === view.selected);
    const label = (p) => `${p.n} · ${md(p.r.label)}`;

    const setup = [{
      title: `The page: a stylised alertness curve from ${hour(start)} to ${hour(end)}, and an email strip`,
      body: [
        `- The red curve is a **stylised summary** of published circadian findings, not one dataset: alertness rises through the morning, dips in the early-to-mid afternoon, and peaks again in the late afternoon.`,
        `- The blue strip is the measured email reflex from a workplace study: inboxes left to auto-check roughly every five minutes.`,
        `- Chronotype shifts this timing earlier or later by person.`,
      ].join("\n"),
      narration: `The page draws a stylised alertness curve across a workday from ${hour(start)} to ${hour(end)}, with a strip of email checks every five minutes beneath it. The curve summarises published circadian findings; it is not one dataset, and chronotype shifts its timing by person.`,
    }, {
      title: `${plural(points.length, "numbered point")}: ${measured.length} measured, ${curve.length} behind the curve`,
      body: [
        "| Point | Kind | Study |",
        "| ---: | --- | --- |",
        ...points.map((p) => `| ${label(p)} | ${p.r.role === "measured" ? "measured" : "curve source"} | ${md(p.r.study)} |`),
      ].join("\n"),
      notes: `Sources retrieved ${md(view.fetched)}.`,
      narration: `${plural(points.length, "numbered point")} carry the evidence. ${measured.length} are numbers measured in workplace studies of email, and ${curve.length} are the circadian sources the curve summarises, from ${plural(studies.length, "cited study", "cited studies")} in all.`,
    }];

    const method = [{
      title: "Each numbered point opens one finding and its source",
      body: [
        "- Select a numbered point on the page to read the measured number and its source.",
        `- Energy points sit on the curve: ${list(curve.map(label))}.`,
        `- Email points sit on the auto-check strip: ${list(measured.map(label))}.`,
      ].join("\n"),
      narration: `Each point opens one finding, its number where the study gives one, and its citation. The ${curve.length} energy points sit on the curve and the ${measured.length} email points sit on the strip, in workday order.`,
    }];

    const frame = (p, picked) => ({
      title: `${picked ? "Selected: " : ""}${label(p)}`,
      body: [
        md(p.r.finding),
        ...(p.r.value ? ["", `**${md(p.r.value)}**`] : []),
        "",
        `${md(p.r.study)} ${md(p.r.venue)} [Open source](${p.r.source_url})`,
      ].join("\n"),
      narration: `${picked ? "The point selected on the page is" : "Point"} ${p.n}, ${say(p.r.label)}. ${say(p.r.finding)}`,
    });
    const results = [...(chosen ? [frame(chosen, true)] : []), ...points.filter((p) => p !== chosen).map((p) => frame(p, false))];

    const checks = [{
      title: "Every number is the cited study's own",
      body: [
        "| Point | Number shown | Study | Venue |",
        "| ---: | --- | --- | --- |",
        ...points.map((p) => `| ${label(p)} | ${p.r.value ? md(p.r.value) : "—"} | ${md(p.r.study)} | ${md(p.r.venue)} |`),
      ].join("\n"),
      notes: `Sources retrieved ${md(view.fetched)}. The curve's shape is stylised; only the cited findings are measured.`,
      narration: `Every number in this talk is quoted from the study the page cites for it, retrieved on ${sayDate(view.fetched)}. Only the shape of the curve is stylised.`,
    }, {
      title: "Takeaway: two pitfalls, one fix",
      key: md(PITFALLS),
      narration: say(PITFALLS),
    }];

    return {
      meta: { title: TITLE, subtitle: `${plural(points.length, "cited finding")} on a workday timeline`, date: `Sources retrieved ${view.fetched}` },
      narration: `This talk pairs a stylised alertness curve across the workday with measured numbers on how email interrupts it. ${points.length} numbered points each carry one finding from a cited study.`,
      notes: "The curve is a stylised summary of published circadian findings, not one dataset; chronotype shifts its timing by person.",
      setup, method, results, checks,
    };
  }

  return { TITLE, PITFALLS, report };
});
