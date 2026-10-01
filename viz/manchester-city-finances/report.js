/* The manchester-city-finances page's timeline as a beamdswitch report.
 *
 * report(rows, view) turns the page's timeline rows and its current view ({ active, selected,
 * fetched }) into the plain-data report that the standard template (beamdswitch.js,
 * `Beamdswitch.deck`) writes as a narrated Markdown deck. Every date, amount and description is the
 * row's own text, and amounts read as the page shows them (£715.0m); nothing is computed.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ManCityReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TITLE = "What Manchester City’s charges and accounts do and do not show";
  const CLAIM = "The charges concern historical allegations. The newest accounts are a separate, current snapshot.";
  const STATUS = "No final Premier League award is shown because none was located on the League’s official site as of 28 September 2026.";

  const sayDate = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const money = (m) => `£${m}m`;
  const sayMoney = (m) => (String(m).startsWith("-") ? `minus ${String(m).slice(1)}` : m) + " million pounds";
  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  /* Narration is read aloud: amounts become words and markup characters are dropped. */
  const say = (s) => String(s ?? "")
    .replace(/£(-?)([\d.]+)m\b/g, (_, neg, n) => sayMoney(neg + n)).replace(/EUR([\d.]+)m\b/g, "$1 million euro")
    .replace(/&/g, " and ").replace(/[“”"]/g, "").replace(/[$\\`*_#|<>[\]]/g, " ").replace(/\s+/g, " ").trim();
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
  const span = (r) => (r.start === r.end ? r.start : `${r.start} to ${r.end}`);

  function report(rows, view = {}) {
    const lanes = [...new Set(rows.map((r) => r.lane))];
    const active = lanes.includes(view.active) ? view.active : "All";
    const shown = lanes.filter((l) => active === "All" || l === active);
    const inLane = (l) => rows.filter((r) => r.lane === l);
    const chosen = rows.find((r) => r.id === view.selected);
    const accounts = rows.filter((r) => r.revenue_gbp_m);
    const events = rows.filter((r) => r.start === r.end && !r.revenue_gbp_m);
    const fetched = view.fetched;

    const setup = [{
      title: `Three lanes, ${plural(rows.length, "sourced item")}`,
      body: [
        "| Lane | Items | Dates |",
        "| --- | ---: | --- |",
        ...lanes.map((l) => { const its = inLane(l); return `| ${md(l)} | ${its.length} | ${its.map((r) => r.start).sort()[0]} to ${its.map((r) => r.end).sort().at(-1)} |`; }),
        "",
        `- ${md(STATUS)}`,
        `- ${active === "All" ? "Shown: all lanes." : `Shown: the ${md(active)} lane only.`}`,
      ].join("\n"),
      notes: `Sources: Premier League referral, CAS media release, and Manchester City financial reports. Fetched ${md(fetched)}.`,
      narration: `The timeline holds ${rows.length} sourced items in three lanes: ${list(lanes.map((l) => `${inLane(l).length} in ${l}`))}. ${say(STATUS)}${active === "All" ? "" : ` This talk follows the ${active} lane, as selected on the page.`}`,
    }];

    const method = [{
      title: "Lanes keep the allegations, the CAS case and the accounts apart",
      body: [
        "- The timeline keeps the Premier League referral, the 2020 CAS decision in a separate UEFA case, and filed financial results distinct.",
        "- Bars show the alleged Premier League periods. A point marks the separate 2020 CAS UEFA decision. Two financial points show revenue and net result.",
        "- Each item opens its precise scope and primary source.",
      ].join("\n"),
      narration: `Each lane is drawn on its own row, so the allegations, the CAS case and the accounts never share a mark. Bars span the alleged periods, and points mark the single-date items: ${list([...events.map((r) => r.label), ...accounts.map((r) => r.label)])}.`,
    }];

    const periods = (its) => ({
      title: `${plural(its.length, "alleged period")}, from ${its.map((r) => r.start).sort()[0]} to ${its.map((r) => r.end).sort().at(-1)}`,
      body: ["| Item | Period | Scope |", "| --- | --- | --- |", ...its.map((r) => `| ${md(r.label)} | ${span(r)} | ${md(r.detail)} |`)].join("\n"),
      notes: `Primary source: ${its[0].source_url}`,
      narration: `The ${its[0].lane} lane holds ${plural(its.length, "period")}: ${list(its.map((r) => r.label))}. These are allegations, spanning ${sayDate(its.map((r) => r.start).sort()[0])} to ${sayDate(its.map((r) => r.end).sort().at(-1))}.`,
    });
    const filed = (its) => ({
      title: `Filed accounts: revenue ${list(its.map((r) => money(r.revenue_gbp_m)))}`,
      body: ["| Accounts | Year end | Revenue | Net result |", "| --- | --- | ---: | ---: |", ...its.map((r) => `| ${md(r.label)} | ${r.end} | ${money(r.revenue_gbp_m)} | ${money(r.profit_gbp_m)} |`), "", ...its.map((r) => `- ${md(r.detail)}`)].join("\n"),
      notes: its.map((r) => `${md(r.label)}: ${r.source_url}`).join("\n"),
      narration: its.map((r) => `${say(r.label)}: ${say(r.detail)}`).join(" "),
    });
    const single = (r, picked) => ({
      title: `${picked ? "Selected: " : ""}${md(r.label)}, ${span(r)}`,
      body: [md(r.detail), ...(r.revenue_gbp_m ? ["", `Revenue ${money(r.revenue_gbp_m)}. Net result ${money(r.profit_gbp_m)}.`] : []), "", `[Open primary source](${r.source_url})`].join("\n"),
      narration: `${picked ? "The item selected on the page is " : ""}${say(r.label)}, ${r.start === r.end ? `dated ${sayDate(r.start)}` : `from ${sayDate(r.start)} to ${sayDate(r.end)}`}. ${say(r.detail)}`,
    });
    // A selected item that the lane filter still shows leads the results; each lane then follows without it.
    const pick = chosen && shown.includes(chosen.lane) ? chosen : null;
    const laneFrames = (l) => {
      const its = inLane(l).filter((r) => r !== pick);
      if (!its.length) return [];
      if (its.every((r) => r.start !== r.end)) return [periods(its)];
      if (its.every((r) => r.revenue_gbp_m)) return [filed(its)];
      return its.map((r) => single(r, false));
    };
    const results = [...(pick ? [single(pick, true)] : []), ...shown.flatMap(laneFrames)];

    const cas = events.find((r) => r.id === "cas-2020") || events[0];
    const checks = [{
      title: "The CAS decision is not a decision on the Premier League allegations",
      body: [`- ${md(cas.detail)}`, `- ${md(STATUS)}`].join("\n"),
      notes: `CAS media release: ${cas.source_url}`,
      narration: `${say(cas.detail)} And ${say(STATUS.charAt(0).toLowerCase() + STATUS.slice(1))}`,
    }, {
      title: "Takeaway",
      key: md(CLAIM),
      narration: `${say(CLAIM)} Read the bars as allegations and the accounts as a separate snapshot.`,
    }];

    return {
      meta: { title: TITLE, subtitle: CLAIM, date: `Sources fetched ${fetched}` },
      narration: "This talk keeps three things apart: the Premier League's alleged rule breaches, the separate 2020 CAS decision in a UEFA case, and Manchester City's newest filed accounts.",
      notes: md(STATUS),
      setup, method, results, checks,
    };
  }

  return { TITLE, CLAIM, STATUS, report };
});
