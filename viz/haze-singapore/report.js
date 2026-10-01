/* The haze map's readings as a beamdswitch report.
 *
 * report(D, view) turns the page's data (D: { start, n, regions, peak, m: { psi, pm24, pm1 }, bands, sources })
 * and its current view ({ metric: "psi" | "pm1", t: hour index, sel: region or null }) into the plain-data
 * report that the standard template (beamdswitch.js, `Beamdswitch.deck`) writes as a narrated Markdown
 * deck. Every reading is the official value the map shows for that region and hour, formatted as the
 * page's readout and tooltip show it; the summary counts are recounted from the same hourly readings.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HazeReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const n0 = (v) => v.toLocaleString("en-US");
  const plural = (n, one, many = one + "s") => `${n0(n)} ${n === 1 ? one : many}`;
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

  /* Hour i in Singapore time, as the page's sgt() and fmt() write it. */
  function sgt(D, i) {
    const d = new Date(Date.parse(D.start) + i * 36e5 + 8 * 36e5);
    return { dow: d.getUTCDay(), d: d.getUTCDate(), mon: d.getUTCMonth(), y: d.getUTCFullYear(), h: String(d.getUTCHours()).padStart(2, "0"), iso: d.toISOString().slice(0, 10) };
  }
  const fmt = (D, i) => { const s = sgt(D, i); return `${DAYS[s.dow]} ${s.d} ${MON[s.mon]} ${s.y}, ${s.h}:00`; };
  const sayTime = (D, i) => { const s = sgt(D, i); return `${s.h}:00 on ${DAY_NAMES[s.dow]} ${s.d} ${MONTHS[s.mon]} ${s.y}`; };
  const sayDay = (D, i) => { const s = sgt(D, i); return `${s.d} ${MONTHS[s.mon]} ${s.y}`; };

  const METRICS = {
    psi: { name: "PSI (24-hour)", spoken: "24-hour PSI", bands: "psi", unit: "", sayUnit: "" },
    pm1: { name: "PM2.5 (1-hour)", spoken: "1-hour PM2.5", bands: "pm", unit: " µg/m³", sayUnit: " micrograms per cubic metre" },
  };
  function bandOf(D, metric, v) {
    if (v == null) return null;
    const b = D.bands[METRICS[metric].bands];
    for (let i = 0; i < b.length; i++) if (b[i].max == null || v <= b[i].max) return i;
  }

  /* The headline's numbers, recounted from the hourly 24-hour PSI as the builder counts them. */
  function story(D) {
    const R = D.regions, psi = D.m.psi;
    const hourMax = Array.from({ length: D.n }, (_, i) => R.reduce((m, r) => (psi[r][i] != null && (m == null || psi[r][i] > m) ? psi[r][i] : m), null));
    const unhealthy = hourMax.flatMap((v, i) => (v != null && v > 100 ? [i] : []));
    const days = [...new Set(unhealthy.map((i) => sgt(D, i).iso))];
    const peak = D.peak, peakPsi = hourMax[peak], peakRegion = R.reduce((a, r) => ((psi[r][peak] ?? -1) > (psi[a][peak] ?? -1) ? r : a));
    const hours = Object.fromEntries(R.map((r) => [r, psi[r].filter((v) => v != null && v > 100).length]));
    const first = unhealthy[0], before = Math.max(...hourMax.slice(0, first).filter((v) => v != null));
    const missing = Object.fromEntries(["psi", "pm24", "pm1"].map((k) => [k, R.reduce((s, r) => s + D.m[k][r].filter((v) => v == null).length, 0)]));
    return { hourMax, unhealthy, days, peak, peakPsi, peakRegion, hours, first, before, missing };
  }
  function headline(D, s = story(D)) {
    return `Haze hit Singapore in ${MONTHS[sgt(D, s.first).mon]}: ${s.days.length} days above PSI 100, peaking at ${s.peakPsi} in ${cap(s.peakRegion)}`;
  }

  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  const reading = (D, metric, v) => (v == null ? "–" : v + METRICS[metric].unit);
  const sayReading = (D, metric, v) => (v == null ? "no reading" : `${v}${METRICS[metric].sayUnit}`);
  const bandText = (D, metric, v) => { const b = bandOf(D, metric, v); return b == null ? "No reading" : `${D.bands[METRICS[metric].bands][b].label} · ${D.bands[METRICS[metric].bands][b].range}`; };

  function report(D, view = {}) {
    const R = D.regions, metric = METRICS[view.metric] ? view.metric : "psi", M = METRICS[metric], bands = D.bands[M.bands];
    const t = Math.max(0, Math.min(D.n - 1, Math.round(view.t ?? D.peak))), sel = R.includes(view.sel) ? view.sel : null;
    const s = story(D), head = headline(D, s), last = D.n - 1;
    const at = (r) => D.m[metric][r][t];
    const shown = R.filter((r) => at(r) != null), top = shown.reduce((a, r) => (a == null || at(r) > at(a) ? r : a), null);
    const worst = R.reduce((a, r) => (s.hours[r] > s.hours[a] ? r : a)), least = R.reduce((a, r) => (s.hours[r] < s.hours[a] ? r : a));
    const totalMissing = s.missing.psi + s.missing.pm24 + s.missing.pm1;

    const setup = [{
      title: `The data: ${n0(D.n)} hourly readings for ${R.length} NEA regions, ${fmt(D, 0).split(",")[0]} to ${fmt(D, last).split(",")[0]}`,
      body: [
        `- Hourly 24-hour PSI, 24-hour PM2.5 and 1-hour PM2.5 for the ${list(R.map(cap))} regions, from ${md(fmt(D, 0))} to ${md(fmt(D, last))} (Singapore time).`,
        `- Sources: ${D.sources.map((x) => `[${md(x.label)}](${x.url})`).join(", ")}.`,
      ].join("\n"),
      notes: `Missing readings: ${n0(totalMissing)} of ${n0(D.n * R.length * 3)} region-hours across the three measures.`,
      narration: `The data are ${n0(D.n)} hourly readings from the National Environment Agency for Singapore's ${R.length} regions, ${list(R.map(cap))}, from ${sayDay(D, 0)} to ${sayDay(D, last)}. Each hour carries the 24-hour PSI, the 24-hour PM2.5 and the 1-hour PM2.5.`,
    }];

    const method = [{
      title: `Colours are the NEA bands for ${M.name}`,
      body: [
        `| Band | ${md(M.name)} |`,
        "| --- | ---: |",
        ...bands.map((b) => `| ${md(b.label)} | ${b.range} |`),
      ].join("\n"),
      narration: `Each region is coloured by the National Environment Agency's band for its ${M.spoken}: ${list(bands.map((b) => `${b.label} from ${b.range.replace("–", " to ").replace(/\+$/, " and above")}`))}.`,
    }, {
      title: "One official reading per region, not a surface",
      body: [
        "- NEA publishes one reading per region, so a whole region coloured one band does not mean every street reads the same.",
        "- The data carry no region polygons: each URA planning area is assigned to the NEA region whose label point is nearest its centroid, so the shapes approximate NEA's.",
        "- The 24-hour PSI averages the previous 24 hours, so it lags conditions; the 1-hour PM2.5 reacts faster.",
      ].join("\n"),
      narration: "The agency publishes one reading per region, not a surface, so the map colours each whole region one band. Region shapes are built from planning areas and only approximate the agency's regions. The 24-hour PSI averages the past day, so it lags; the 1-hour PM2.5 reacts faster.",
    }];

    const results = [{
      title: `${fmt(D, t)}: ${M.name}${top ? `, highest in ${cap(top)} at ${reading(D, metric, at(top))}` : ""}`,
      body: [
        `| Region | ${md(M.name)} | Band |`,
        "| --- | ---: | --- |",
        ...R.map((r) => `| ${cap(r)} | ${reading(D, metric, at(r))} | ${md(bandText(D, metric, at(r)))} |`),
      ].join("\n"),
      notes: `Hour ${n0(t + 1)} of ${n0(D.n)} on the page's timeline.`,
      narration: `At ${sayTime(D, t)}, the ${M.spoken} read ${list(R.map((r) => `${sayReading(D, metric, at(r))} in ${cap(r)}`))}.${top ? ` The highest band was ${bands[bandOf(D, metric, at(top))].label}, in ${cap(top)}.` : ""}`,
    }];
    if (sel) {
      const pv = D.m.psi[sel][t], p1 = D.m.pm1[sel][t], p24 = D.m.pm24[sel][t], bp = bandOf(D, "psi", pv);
      results.push({
        title: `${cap(sel)} at ${fmt(D, t)}: all three readings`,
        body: [
          `- PSI (24-hour): ${pv == null ? "–" : `${pv} ${md(D.bands.psi[bp].label)}`}`,
          `- PM2.5 (1-hour): ${p1 == null ? "–" : `${p1} µg/m³`}`,
          `- PM2.5 (24-hour): ${p24 == null ? "–" : `${p24} µg/m³`}`,
        ].join("\n"),
        narration: `In ${cap(sel)}, the selected region, at that hour, the 24-hour PSI was ${pv == null ? "not reported" : `${pv}, ${D.bands.psi[bp].label}`}; the 1-hour PM2.5 was ${p1 == null ? "not reported" : `${p1} micrograms per cubic metre`}; and the 24-hour PM2.5 was ${p24 == null ? "not reported" : `${p24} micrograms per cubic metre`}.`,
      });
    }
    results.push({
      title: `Peak: PSI ${s.peakPsi} in ${cap(s.peakRegion)} at ${md(fmt(D, s.peak))}`,
      body: [
        `- The highest 24-hour PSI in the data: ${s.peakPsi} (${md(bandText(D, "psi", s.peakPsi))}) in ${cap(s.peakRegion)}.`,
        `- ${s.peak === last ? "It is the latest reading in the data." : "Jump to peak on the page shows this hour."}`,
      ].join("\n"),
      narration: `The highest 24-hour PSI in the data is ${s.peakPsi}, ${D.bands.psi[bandOf(D, "psi", s.peakPsi)].label}, in ${cap(s.peakRegion)} at ${sayTime(D, s.peak)}.${s.peak === last ? " It is the latest reading in the data." : ""}`,
    }, {
      title: `${s.days.length} days above PSI 100 since ${md(fmt(D, s.first).split(",")[0])}`,
      body: [
        `- Until ${md(fmt(D, s.first))}, no region's 24-hour PSI passed 100; the highest was ${s.before}.`,
        `- Since then, at least one region was Unhealthy (above 100) in ${n0(s.unhealthy.length)} of ${n0(D.n)} hours, on ${s.days.length} days.`,
        "",
        "| Region | Hours above PSI 100 |",
        "| --- | ---: |",
        ...R.map((r) => `| ${cap(r)} | ${n0(s.hours[r])} |`),
      ].join("\n"),
      narration: `No region's 24-hour PSI passed 100 until ${sayTime(D, s.first)}; the highest before then was ${s.before}. Since then, at least one region was unhealthy in ${n0(s.unhealthy.length)} hours, on ${s.days.length} days. ${cap(worst)} was unhealthy for ${plural(s.hours[worst], "hour")}, ${cap(least)} for only ${plural(s.hours[least], "hour")}.`,
    });

    const checks = [{
      title: `The peak is the highest of all ${n0(D.n * R.length)} region-hours of PSI`,
      body: [
        `- Highest 24-hour PSI of any region in any hour: ${Math.max(...s.hourMax.filter((v) => v != null))}, the peak above.`,
        `- Hours with at least one region above 100 (${n0(s.unhealthy.length)}) are at least the most in any one region (${n0(s.hours[worst])}, ${cap(worst)}).`,
        `- Missing readings: PSI ${n0(s.missing.psi)}, PM2.5 24-hour ${n0(s.missing.pm24)}, PM2.5 1-hour ${n0(s.missing.pm1)}, out of ${n0(D.n * R.length)} each.`,
      ].join("\n"),
      narration: `The peak of ${s.peakPsi} is the largest of all ${n0(D.n * R.length)} regional PSI readings. The ${n0(s.unhealthy.length)} unhealthy hours for Singapore as a whole are at least the ${n0(s.hours[worst])} of the worst region, as they must be. Missing readings are counted, not filled in.`,
    }, {
      title: "Takeaway",
      key: `${md(head)}. The map shows official regional readings, not a surface.`,
      narration: `${head}. The map shows one official reading per region, not a surface.`,
    }];

    return {
      meta: { title: "Singapore haze, region by region", subtitle: `${M.name} at ${fmt(D, t)}`, date: `Data to ${fmt(D, last)}` },
      narration: `This talk follows Singapore's haze region by region, hour by hour, using the National Environment Agency's readings. It opens on ${sayTime(D, t)}, read in the ${M.spoken}.`,
      setup, method, results, checks,
    };
  }

  return { METRICS, fmt, story, headline, bandOf, report };
});
