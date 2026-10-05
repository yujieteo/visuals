/* Universal Data Workbench: the rules that read counts into types, roles, suspected errors and suggestions.
 *
 * Pure functions of the numbers DuckDB returns (src/sql.js), so each rule is tested on its own. The rules are the
 * agreed ones of spec.md ("Types and semantic roles"):
 *
 *   type     the most specific reading that at least 95% of the values present fit (THRESHOLD), in the order
 *            boolean, integer, decimal, ISO date, ISO date-time, time, one other date layout, dates known to the
 *            year, month or day (1850, c. 1850, 1850-03); else categorical
 *            (at most 1,000 levels and fewer than half the values distinct) or text. The share is the uncertainty.
 *   role     measure, identifier, category, ordered category, time, event label, interval start, interval end or
 *            unknown, each with its reasons. A storage type alone never makes a measure.
 *   errors   values that do not read, impossible dates and sentinel values, listed apart from unusual values.
 *   advice   corrections that change meaning (a date layout, a missing-value marker, a sentinel, a role) are
 *            suggested, never applied without approval.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sql.js"));
  else root.DWInfer = factory(root.DWSql);
})(typeof self !== "undefined" ? self : this, function (Sql) {
  "use strict";

  const THRESHOLD = 0.95;
  const NEAR = 0.5;
  const MAX_LEVELS = 1000;
  const UNIQUE = 0.95;
  const ID_WORDS = ["id", "key", "code", "uuid", "guid", "zip", "zipcode", "postal", "postcode", "sku", "isbn", "ssn", "phone", "tel"];
  const START_WORDS = ["start", "begin", "begins", "from", "since", "onset", "opened", "open"];
  const END_WORDS = ["end", "ends", "ended", "finish", "until", "to", "stop", "closed", "close"];
  const YEAR_WORDS = ["year", "yr", "years"];
  const DATE_FORMATS = Sql.DATE_FORMATS;
  const TYPE_LABEL = {
    integer: "integer", decimal: "decimal", boolean: "boolean", date: "date", datetime: "date-time", time: "time",
    categorical: "categorical", text: "text", empty: "no values", unsupported: "not analysed",
  };

  /** The words of a column name: split at separators and lower-to-upper case changes, in lower case. */
  function words(name) {
    return String(name).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }

  /** The analysis type of a typed (non-text) source column, from DuckDB's type name. */
  function sourceKind(type) {
    const t = String(type).toUpperCase();
    if (t === "BOOLEAN") return "boolean";
    if (/^(U?(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT))$/.test(t)) return "integer";
    if (/^(FLOAT|DOUBLE|REAL|DECIMAL.*)$/.test(t)) return "decimal";
    if (t === "DATE") return "date";
    if (t.startsWith("TIMESTAMP")) return "datetime";
    if (t === "TIME" || t === "TIME WITH TIME ZONE") return "time";
    if (t === "VARCHAR" || t === "UUID") return "text";
    return "unsupported";
  }

  /** Whether a source column holds text that the workbench reads (CSV, or a Parquet string). */
  const isTextSource = (type) => String(type).toUpperCase() === "VARCHAR";

  const pct = (share) => `${(Math.floor(share * 1000) / 10).toFixed(1)}%`;

  /**
   * The reading of a text column from its counts (sql.textStats). Returns the type, the reading, the share of
   * the values present that fit it (the uncertainty) and notes. Ambiguous and mixed date layouts stay text: they
   * become suggestions.
   * @param {Record<string, number>} s
   */
  function readText(s) {
    const valued = s.rows - s.nulls - s.blanks - s.markers;
    const base = { valued, notes: /** @type {string[]} */ ([]), ambiguous: /** @type {string[]} */ ([]), mixed: /** @type {string[]} */ ([]), near: /** @type {any[]} */ ([]) };
    if (valued <= 0) return { ...base, type: "empty", reading: { kind: "text" }, share: 0, fits: 0 };
    const share = (n) => n / valued;
    /** @param {string} type @param {any} reading @param {number} fits */
    const pick = (type, reading, fits) => ({ ...base, type, reading, share: share(fits), fits });
    // Yes or no in any letter case: Yes, YES and yes are one value (the reading compares in lower case).
    if (share(s.bool) >= THRESHOLD) return pick("boolean", { kind: "boolean" }, s.bool);
    // Any value written with thousands separators makes the reading remove them, so "1,234" beside "987" reads too.
    if (s.int_sep > 0 && share(s.int_plain + s.int_sep) >= THRESHOLD) {
      const r = pick("integer", { kind: "integer-sep" }, s.int_plain + s.int_sep);
      r.notes.push("Thousands separators (,) are removed to read the numbers.");
      return r;
    }
    if (share(s.int_plain) >= THRESHOLD) return pick("integer", { kind: "integer" }, s.int_plain);
    if (s.dec_sep > 0 && share(s.dec_plain + s.dec_sep) >= THRESHOLD) {
      const r = pick("decimal", { kind: "decimal-sep" }, s.dec_plain + s.dec_sep);
      r.notes.push("Thousands separators (,) are removed to read the numbers.");
      return r;
    }
    if (share(s.dec_plain) >= THRESHOLD) return pick("decimal", { kind: "decimal" }, s.dec_plain);
    if (share(s.date_iso) >= THRESHOLD) return pick("date", { kind: "date" }, s.date_iso);
    if (share(s.dt_zoned) >= THRESHOLD) {
      const r = pick("datetime", { kind: "datetime-zoned" }, s.dt_zoned);
      r.notes.push("Every value carries a zone offset: times are ordered in UTC.");
      return r;
    }
    if (share(s.dt_naive) >= THRESHOLD) {
      const r = pick("datetime", { kind: "datetime" }, s.dt_naive);
      r.notes.push("No value carries a zone: the zone is unknown and no time is shifted.");
      return r;
    }
    if (share(s.dt_naive + s.dt_zoned) >= THRESHOLD) {
      const zoned = s.dt_zoned >= s.dt_naive;
      const r = pick("datetime", { kind: zoned ? "datetime-zoned" : "datetime" }, zoned ? s.dt_zoned : s.dt_naive);
      r.notes.push(`${zoned ? s.dt_naive : s.dt_zoned} values ${zoned ? "carry no zone" : "carry a zone offset"} in a column that mostly ${zoned ? "does" : "does not"}; they count as values that do not read.`);
      return r;
    }
    if (share(s.time_iso) >= THRESHOLD) return pick("time", { kind: "time" }, s.time_iso);
    const layouts = DATE_FORMATS.map((f) => ({ ...f, n: s[`f_${f.id}`] ?? 0 })).filter((f) => share(f.n) >= THRESHOLD);
    if (layouts.length === 1) {
      const r = pick("date", { kind: "date-format", format: layouts[0].id }, layouts[0].n);
      r.notes.push(`Dates are read in the layout ${layouts[0].label}, the only layout that fits.`);
      return r;
    }
    if (!layouts.length && share(s.partial_date) >= THRESHOLD) {
      const r = pick("date", { kind: "date-partial" }, s.partial_date);
      r.notes.push("Dates are known to the year, the month or the day, as written: each keeps its precision, and qualifiers such as c. and ? are kept.");
      return r;
    }
    const text = textType(s, valued, base);
    if (layouts.length > 1) text.ambiguous = layouts.map((f) => f.id);
    else {
      // Every layout that fits beside ISO dates is offered: when day and month order both fit, the choice is the person's.
      text.mixed = DATE_FORMATS.map((f) => ({ ...f, n: s[`f_${f.id}`] ?? 0 }))
        .filter((f) => s.date_iso >= 0.05 * valued && f.n >= 0.05 * valued && share(s.date_iso + f.n) >= THRESHOLD)
        .sort((a, b) => b.n - a.n).map((f) => f.id);
      if (!text.mixed.length) {
        const numeric = Math.max(s.dec_plain + s.dec_sep, s.int_plain + s.int_sep);
        const best = DATE_FORMATS.map((f) => s[`f_${f.id}`] ?? 0).concat([s.date_iso]).reduce((a, b) => Math.max(a, b), 0);
        if (share(numeric) >= NEAR) text.near = [{ kind: s.int_plain + s.int_sep >= numeric ? (s.int_sep ? "integer-sep" : "integer") : (s.dec_sep ? "decimal-sep" : "decimal"), fits: numeric }];
        else if (share(best) >= NEAR) {
          text.near = [
            ...(s.date_iso === best ? [{ kind: "date", fits: best }] : []),
            ...DATE_FORMATS.filter((d) => (s[`f_${d.id}`] ?? 0) === best).map((d) => ({ kind: "date-format", format: d.id, fits: best })),
          ];
        }
      }
    }
    return text;
  }

  function textType(s, valued, base) {
    const ratio = s.distinct_values / valued;
    if (s.distinct_values <= MAX_LEVELS && ratio < 0.5) return { ...base, type: "categorical", reading: { kind: "text" }, share: 1, fits: valued };
    return { ...base, type: "text", reading: { kind: "text" }, share: 1, fits: valued };
  }

  /** The reading of a typed source column (Parquet), which needs no parsing. */
  function readSource(type, s) {
    const kind = sourceKind(type);
    const valued = s.rows - s.nulls;
    const base = { valued, notes: [], ambiguous: [], mixed: [], near: [], reading: { kind: "source" }, share: 1, fits: valued };
    if (kind === "unsupported") return { ...base, type: "unsupported", notes: [`${type} is a nested or binary type, which v1 does not analyse.`] };
    if (valued <= 0) return { ...base, type: "empty", share: 0 };
    if (kind === "text") return { ...textType(s, valued, base), reading: { kind: "source" } };
    const notes = /^TIMESTAMP WITH TIME ZONE$/i.test(type) ? ["Parquet stores these as UTC instants; the source offset is not stored."] : [];
    return { ...base, type: kind, notes };
  }

  /**
   * The semantic role of a column, with its reasons and how sure the rule is (certain, likely, possible).
   * @param {{ name: string, type: string, valued: number, distinct: number, zeroPadded?: number, uuid?: number,
   *   lenMin?: number, lenMax?: number, numeric?: { min: number, max: number, whole: number, n: number } | null, datesPending?: boolean }} c
   */
  function role(c) {
    const reasons = [];
    if (c.datesPending) return { role: "unknown", certainty: "possible", reasons: ["The values look like dates in more than one layout: approve a layout to read them as time."], possibleTime: false };
    if (c.type === "unsupported") return { role: "unknown", certainty: "certain", reasons: ["A nested or binary type: not analysed in v1."], possibleTime: false };
    if (c.type === "empty" || c.valued === 0) return { role: "unknown", certainty: "certain", reasons: ["Every value is missing."], possibleTime: false };
    if (c.distinct <= 1) return { role: "unknown", certainty: "certain", reasons: ["One value only: the column is constant."], possibleTime: false };
    const name = words(c.name);
    const idWord = name.find((w) => ID_WORDS.includes(w));
    const unique = c.distinct / c.valued;
    const signals = [];
    const idType = c.type === "integer" || c.type === "text" || c.type === "categorical";
    if (idWord && idType) signals.push(`The name contains "${idWord}".`);
    if ((c.zeroPadded ?? 0) > 0 && (c.zeroPadded ?? 0) >= 0.01 * c.valued && idType) signals.push(`${c.zeroPadded} values are numbers written with leading zeros, such as 007.`);
    if ((c.uuid ?? 0) >= THRESHOLD * c.valued) signals.push("The values are UUIDs.");
    const n = c.numeric;
    const yearWord = name.find((w) => YEAR_WORDS.includes(w));
    const yearLike = c.type === "integer" && !!n && n.n > 0 && n.min >= 1000 && n.max <= 2999 && n.whole === n.n;
    if (unique >= UNIQUE && c.valued >= 20 && !yearLike) {
      const dense = n && n.whole === n.n && n.max - n.min + 1 <= 2 * c.distinct;
      const fixed = c.type !== "integer" && c.lenMin !== undefined && c.lenMin === c.lenMax && (c.type === "text" || c.type === "categorical");
      const fixedDigits = c.type === "integer" && c.lenMin !== undefined && c.lenMin === c.lenMax && (c.lenMin ?? 0) >= 4;
      if (c.type === "integer" && (dense || fixedDigits)) signals.push(`${pct(unique)} of the values are distinct${dense ? " and they run nearly without gaps, like a row number" : ", all with the same number of digits"}.`);
      else if (fixed) signals.push(`${pct(unique)} of the values are distinct, all ${c.lenMin} characters long.`);
    }
    if (signals.length) return { role: "identifier", certainty: signals.length > 1 ? "likely" : "possible", reasons: signals, possibleTime: false };
    if (c.type === "date" || c.type === "datetime" || c.type === "time") {
      const start = name.find((w) => START_WORDS.includes(w)), end = name.find((w) => END_WORDS.includes(w));
      if (start && !end) return { role: "interval start", certainty: "possible", reasons: [`A time whose name contains "${start}".`], possibleTime: false };
      if (end && !start) return { role: "interval end", certainty: "possible", reasons: [`A time whose name contains "${end}".`], possibleTime: false };
      return { role: "time", certainty: "certain", reasons: [`The values read as ${TYPE_LABEL[c.type]}s.`], possibleTime: false };
    }
    if (c.type === "integer" || c.type === "decimal") {
      // Years: whole numbers from 1000 to 2999, named as years or spanning at most two centuries.
      const possibleTime = yearLike && (!!yearWord || (!!n && n.max - n.min <= 200));
      if (possibleTime) reasons.push(`Whole numbers from ${n.min} to ${n.max}${yearWord ? ` in a column named "${c.name}"` : ""}: these may be years.`);
      if (c.distinct <= 12) return { role: "ordered category", certainty: "possible", reasons: [`Numbers with ${c.distinct} distinct values: read as ordered levels.`, ...reasons], possibleTime };
      return { role: "measure", certainty: possibleTime ? "possible" : "likely", reasons: [`Numbers with ${c.distinct} distinct values.`, ...reasons], possibleTime };
    }
    if (c.type === "boolean") return { role: "category", certainty: "certain", reasons: ["Two values: true and false."], possibleTime: false };
    if (c.type === "categorical") return { role: "category", certainty: "likely", reasons: [`Text with ${c.distinct} levels, fewer than half of the values distinct.`], possibleTime: false };
    if (unique >= 0.5) return { role: "event label", certainty: "possible", reasons: [`Text, ${pct(unique)} of the values distinct: usable as a label.`], possibleTime: false };
    return { role: "unknown", certainty: "possible", reasons: [`Text with ${c.distinct} levels: too many for a category.`], possibleTime: false };
  }

  /**
   * A time column whose name marks a start pairs with one whose name marks an end; one without a partner is
   * plain time. Returns the columns' roles after pairing.
   * @param {{ name: string, role: string }[]} columns
   */
  function pairIntervals(columns) {
    const starts = columns.filter((c) => c.role === "interval start"), ends = columns.filter((c) => c.role === "interval end");
    return columns.map((c) => {
      if (c.role === "interval start" && !ends.length) return { ...c, role: "time", pairedNote: "No end column was found, so this is plain time." };
      if (c.role === "interval end" && !starts.length) return { ...c, role: "time", pairedNote: "No start column was found, so this is plain time." };
      return c;
    });
  }

  /**
   * Sentinel values in a numeric column (sql.sentinelCounts rows): negative stand-ins in a field whose other
   * values are all zero or more, and 999-like values at least ten times the field's other maximum.
   * @param {{ value: number, n: number, other_min: number | null, other_max: number | null }[]} rows
   */
  function sentinels(rows) {
    if (!rows.length) return [];
    const otherMin = rows[0].other_min, otherMax = rows[0].other_max;
    return rows.filter((r) => {
      if (r.value < 0) return otherMin !== null && otherMin >= 0;
      return r.value >= 999 && otherMax !== null && r.value >= 10 * Math.max(otherMax, 1e-9);
    }).map((r) => ({ value: r.value, n: r.n }));
  }

  /**
   * Suggested corrections for one profiled column, each applied only after approval. Each has a stable id, a
   * sentence, its kind and the change it makes to the column's reading or role.
   * @param {any} col a column profile (src/profile.js)
   */
  function suggestions(col) {
    const out = [];
    const id = (kind, detail = "") => `${col.name}::${kind}${detail ? `::${detail}` : ""}`;
    const r = col.reading;
    const missingText = r.missingText ?? [];
    const markers = (col.missing?.markerValues ?? []).filter((m) => !missingText.includes(String(m.value).toLowerCase()));
    if (markers.length) {
      const n = markers.reduce((a, m) => a + m.n, 0);
      out.push({ id: id("markers"), kind: "missing-text", text: `Treat ${markers.map((m) => `"${m.value}"`).join(", ")} as missing in ${col.name} (${n} values).`,
        change: { reading: { ...r, missingText: [...missingText, ...markers.map((m) => String(m.value).toLowerCase())] } } });
    }
    for (const s of col.sentinels ?? []) {
      if ((r.missingNumbers ?? []).includes(s.value)) continue;
      out.push({ id: id("sentinel", String(s.value)), kind: "missing-number", text: `Treat ${s.value} as missing in ${col.name} (${s.n} values): it looks like a stand-in for no value.`,
        change: { reading: { ...r, missingNumbers: [...(r.missingNumbers ?? []), s.value] } } });
    }
    if (col.type !== "date" && r.kind === "text") {
      for (const f of col.ambiguous ?? []) {
        const layout = DATE_FORMATS.find((d) => d.id === f);
        out.push({ id: id("layout", f), kind: "date-layout", text: `Read ${col.name} as dates in the layout ${layout?.label}. More than one layout fits every value, so the order of day and month is your choice.`,
          change: { type: "date", reading: { ...r, kind: "date-format", format: f } } });
      }
      const choice = (list) => (list.length > 1 ? " Another layout fits as well, so the order of day and month is your choice." : "");
      for (const f of col.mixed ?? []) {
        const layout = DATE_FORMATS.find((d) => d.id === f);
        out.push({ id: id("layouts", f), kind: "date-layouts", text: `Read ${col.name} as dates written in two layouts: YYYY-MM-DD and ${layout?.label}.${choice(col.mixed)}`,
          change: { type: "date", reading: { ...r, kind: "date-formats", format: f } } });
      }
      for (const near of col.near ?? []) {
        const kind = near.kind;
        const type = kind.startsWith("integer") ? "integer" : kind.startsWith("decimal") ? "decimal" : "date";
        const left = col.valued - near.fits;
        const layout = near.format ? ` in the layout ${DATE_FORMATS.find((d) => d.id === near.format)?.label}` : "";
        out.push({ id: id("type", near.format ? `${kind}::${near.format}` : kind), kind: "type", text: `Read ${col.name} as ${TYPE_LABEL[type]}s${layout}: ${pct(near.fits / col.valued)} of the values fit, and the other ${left} would become values that do not read.${choice(col.near)}`,
          change: { type, reading: { ...r, kind, ...(near.format ? { format: near.format } : {}) } } });
      }
    }
    if (col.possibleTime && col.role !== "time") {
      out.push({ id: id("year"), kind: "role", text: `Treat ${col.name} as time in years.`, change: { role: "time" } });
    }
    return out;
  }

  return { THRESHOLD, MAX_LEVELS, TYPE_LABEL, words, sourceKind, isTextSource, readText, readSource, role, pairIntervals, sentinels, suggestions, pct };
});
