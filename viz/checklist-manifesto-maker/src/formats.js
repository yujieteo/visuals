/* Checklist Manifesto Maker: the formats. Pure: no DOM, storage, clock or network.
 *
 *   EXPORT   the Markdown profile (a readable checklist, then one versioned semantic-state payload in an HTML
 *            comment) and the Beam MD Switch deck (the site's beamdswitch template, then the same payload)
 *   IMPORT   size, syntax, schema, ids and references checked before anything changes; readable text that
 *            disagrees with its payload is refused; a file without a payload is read as a plain draft
 *   DRAFTS   pasted process text and plain Markdown become draft normal steps, deterministically
 *
 * Both exports are functions of the state alone, so one state always gives the same bytes. Imported text is never
 * run or rendered as HTML: the page shows it as text. README.md documents the profile.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./model.js"), require("../beamdswitch.js"));
  else root.ChecklistFormats = factory(root.ChecklistModel, root.Beamdswitch);
})(typeof self !== "undefined" ? self : this, function (Model, Beamdswitch) {
  "use strict";

  const MARKER = `<!-- ${Model.FORMAT}:state`;
  const MAX_BYTES = 1048576;
  const RESERVED = ["checklist details", "stop conditions", "escalation conditions", "recovery routes", "trial notes", "run progress"];
  const RUN_STATUS = { active: "in progress", complete: "complete", ended: "ended before completion" };

  /* ---------- EXPORT ---------- */

  /** Multi-line text on one line. @param {string} s */
  const oneLine = (s) => String(s ?? "").replace(/\s*\n\s*/g, " / ").replace(/[ \t]+/g, " ").trim();
  /** User text as inert Markdown: every character that could start markup is escaped. @param {string} s */
  const md = (s) => oneLine(s).replace(/[\\`*_[\]<>|~#&$!]/g, "\\$&").replace(/^:/, "\\:");
  /** User text as narration: plain spoken prose without markup characters. @param {string} s */
  const speak = (s) => oneLine(s).replace(/[$\\`*_#|<>~[\]{}^=&%+@]/g, " ").replace(/[–—]/g, " ").replace(/\s+/g, " ").trim();
  /** @param {number} n @param {string} one @param {string} many */
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  /** @param {string} s @param {string} fallback */
  const or = (s, fallback) => (s.trim() ? s : fallback);

  /** A file name from a title. @param {string} title */
  function fileName(title) {
    const base = title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 60).replace(/-+$/, "");
    return base || "checklist";
  }

  /** @param {any} def @param {string} id */
  const pauseLabel = (def, id) => {
    const n = def.pausePoints.findIndex((/** @type {any} */ p) => p.id === id);
    return n < 0 ? "(no pause point)" : `Pause point ${n + 1}: ${or(def.pausePoints[n].title, "untitled")}`;
  };
  /** @param {any} def @param {string[]} at */
  const where = (def, at) => (at.length ? at.map((p) => pauseLabel(def, p)).map(md).join("; ") : "every pause point");

  /** @param {any} def @param {string} id */
  function triggerText(def, id) {
    const hit = Model.find(def, id);
    if (!hit) return id;
    return hit.type === "item" ? `critical check “${md(hit.node.text)}” fails` : `stop condition “${md(hit.node.text)}” is reported`;
  }

  /**
   * The readable part of the Markdown profile: the checklist as a person reads or prints it. A projection of the
   * state; the payload after it carries everything.
   * @param {any} entry
   */
  function readable(entry) {
    const def = entry.checklist;
    const out = [`# ${md(or(def.title, "Untitled checklist"))}`, ""];
    if (def.example) out.push("> **Example — adapt and review before use.** It is not an approved procedure.", "");
    out.push(`Checklist Manifesto Maker Markdown, schema version ${Model.SCHEMA_VERSION}. Checklist ${def.id}, revision ${def.revision}.`, "");
    out.push("## Checklist details", "");
    const d = def.details;
    out.push(`- Intended users: ${md(or(d.intendedUsers, "not given"))}`);
    out.push(`- Equipment: ${md(or(d.equipment, "not given"))}`);
    out.push(`- Applicability: ${md(or(d.applicability, "not given"))}`);
    out.push(`- Source references: ${md(or(d.sources, "not given"))}`);
    if (d.notes.trim()) out.push(`- Notes: ${md(d.notes)}`);
    out.push(`- Reviewer record required before a Run: ${def.requiresReview ? "yes" : "no"}`);
    out.push(`- Author review: ${entry.reviewedRevision === def.revision ? `revision ${def.revision} reviewed` : `revision ${def.revision} not reviewed yet`}`);
    if (entry.reviewers.length) {
      out.push("- Reviewer records (user supplied; the app does not verify qualifications or approval):");
      for (const r of entry.reviewers) out.push(`  - ${md(r.name)}, revision ${r.revision}, ${r.date}${r.note ? `: ${md(r.note)}` : ""} (${r.revision === def.revision ? "current" : "stale"})`);
    } else out.push("- Reviewer records: none");
    out.push("");
    def.pausePoints.forEach((/** @type {any} */ p, /** @type {number} */ n) => {
      out.push(`## Pause point ${n + 1}: ${md(or(p.title, "untitled"))} (${Model.MODE_LABEL[p.mode]})`, "");
      out.push(Model.MODE_HELP[p.mode], "");
      if (p.details.trim()) out.push(`Details: ${md(p.details)}`, "");
      if (!p.items.length) out.push("No items yet.", "");
      for (const i of p.items) {
        const optional = i.required ? "" : " (optional)";
        out.push(i.kind === "check" ? `- [ ] **Critical check:** ${md(or(i.text, "(no text)"))}${optional}` : `- [ ] ${md(or(i.text, "(no text)"))}${optional}`);
        if (i.details.trim()) out.push(`  - Details: ${md(i.details)}`);
        if (i.kind === "check") {
          out.push(`  - Not applicable when: ${i.applicability.trim() ? md(i.applicability) : "never (no applicability rule)"}`);
          if (i.ifFailed.trim()) out.push(`  - If it fails: ${md(i.ifFailed)}`);
        }
        if (i.dependsOn.length) out.push(`  - Depends on: ${i.dependsOn.map((/** @type {string} */ c) => `“${md(Model.nameOf(def, c))}”`).join(", ")}`);
      }
      const stops = Model.conditionsAt(def, "stop", p.id);
      out.push("", `Stop conditions here: ${stops.length ? stops.map((/** @type {any} */ c) => `“${md(c.text)}”`).join(", ") : "none."}`, "");
    });
    out.push("## Stop conditions", "");
    if (def.none.stop) out.push("None specified.");
    else if (!def.stopConditions.length) out.push("Not written yet.");
    for (const c of def.stopConditions) {
      out.push(`- **Stop:** ${md(or(c.text, "(no text)"))}`, `  - Stop instruction: ${md(or(c.instruction, "not written yet"))}`);
      if (c.escalation) out.push(`  - Escalation: “${md(Model.nameOf(def, c.escalation))}”`);
      out.push(`  - Applies at: ${where(def, c.at)}`);
    }
    out.push("", "## Escalation conditions", "");
    if (def.none.escalation) out.push("None specified.");
    else if (!def.escalationConditions.length) out.push("Not written yet.");
    for (const c of def.escalationConditions) {
      out.push(`- **Escalate:** ${md(or(c.text, "(no text)"))}`, `  - Named person or role: ${md(or(c.contact, "not named yet"))}`, `  - Escalation action: ${md(or(c.action, "not written yet"))}`, `  - Applies at: ${where(def, c.at)}`);
    }
    out.push("", "## Recovery routes", "");
    if (def.none.recovery) out.push("None specified.", "");
    else if (!def.recoveryRoutes.length) out.push("Not written yet.", "");
    for (const r of def.recoveryRoutes) {
      out.push(`### Recovery route: ${md(or(r.title, "untitled"))}`, "");
      out.push(`- Trigger: ${r.triggers.length ? r.triggers.map((/** @type {string} */ t) => triggerText(def, t)).join("; ") : "not linked yet"}`);
      out.push("- Recovery steps:", ...(r.steps.length ? r.steps.map((/** @type {any} */ s, /** @type {number} */ k) => `  ${k + 1}. ${md(or(s.text, "(no text)"))}`) : ["  - none yet"]));
      out.push("- Restart checks:", ...(r.restartChecks.length ? r.restartChecks.map((/** @type {any} */ s) => `  - [ ] ${md(or(s.text, "(no text)"))}`) : ["  - none yet"]));
      out.push(`- Restart at: ${r.restartAt ? md(pauseLabel(def, r.restartAt)) : "not chosen yet"}`, "");
    }
    if (entry.trialNotes.trim()) out.push("## Trial notes", "", md(entry.trialNotes), "");
    out.push("## Run progress", "");
    const run = entry.run;
    if (!run) out.push("No Run is recorded.");
    else {
      const rd = run.checklist;
      out.push(`- ${run.id} on revision ${run.revision}: ${RUN_STATUS[/** @type {keyof RUN_STATUS} */ (run.status)]}.`);
      out.push(`- Current pause point: ${md(pauseLabel(rd, run.current))}. Confirmed: ${run.completed.length ? run.completed.map((/** @type {string} */ p) => md(pauseLabel(rd, p))).join("; ") : "none"}.`);
      if (run.hold) out.push(`- Waiting for confirmation: ${md(run.hold.text)}`);
      out.push("- Results:");
      for (const i of Model.items(rd)) {
        const r = run.results[i.id];
        out.push(`  - ${md(or(i.text, "(no text)"))} (${md(pauseLabel(rd, i.pausePoint))}): ${Model.RESULT_LABEL[r.value]}${r.reason ? `, because ${md(r.reason)}` : ""}`);
      }
      if (run.reports.length) {
        out.push("- Reported conditions:");
        for (const r of run.reports) out.push(`  - “${md(Model.nameOf(rd, r.condition))}” at ${md(pauseLabel(rd, r.at))}: ${r.status}`);
      }
      if (run.recovery) {
        const route = rd.recoveryRoutes.find((/** @type {any} */ x) => x.id === run.recovery.route);
        out.push(`- Recovery in progress: “${md(route.title)}”, ${run.recovery.done.length} of ${route.steps.length} steps done, ${run.recovery.confirmed.length} of ${route.restartChecks.length} restart checks confirmed.`);
      }
      out.push("- Log:", ...run.log.map((/** @type {string} */ line, /** @type {number} */ k) => `  ${k + 1}. ${md(line)}`));
    }
    return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
  }

  /**
   * The payload: the entry's semantic state as JSON in one HTML comment. "<" and ">" are written as \u003c and
   * \u003e, so no user text can end the comment or open another one.
   * @param {any} entry
   */
  function payload(entry) {
    const json = JSON.stringify(Model.payloadOf(entry), null, 2).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
    return `${MARKER}\n${json}\n-->\n`;
  }

  /** Export Markdown: the readable checklist, then the payload. @param {any} entry */
  const toMarkdown = (entry) => `${readable(entry)}\n${payload(entry)}`;

  /**
   * The beamdswitch report of a checklist (the site's template writes it): Set-up, Method, Results with one frame
   * per pause point (its critical checks and stop conditions visible on it), Checks and takeaway ending on a key.
   * It presents the checklist; it is not a Run.
   * @param {any} entry
   */
  function report(entry) {
    const def = entry.checklist;
    const title = or(oneLine(def.title), "Untitled checklist");
    const d = Model.deriveDraft(entry);
    const n = def.pausePoints.length;
    const details = def.details;
    const setup = [
      def.example ? "- Example — adapt and review before use. It is not an approved procedure." : "",
      `- Intended users: ${md(or(details.intendedUsers, "not given"))}`,
      `- Equipment: ${md(or(details.equipment, "not given"))}`,
      `- Applicability: ${md(or(details.applicability, "not given"))}`,
      `- Source references: ${md(or(details.sources, "not given"))}`,
      `- Reviewer: ${md(d.reviewer.text)}`,
    ].filter(Boolean).join("\n");
    const pauses = def.pausePoints.map((/** @type {any} */ p, /** @type {number} */ k) => {
      const steps = p.items.filter((/** @type {any} */ i) => i.kind === "step");
      const checks = p.items.filter((/** @type {any} */ i) => i.kind === "check");
      const stops = Model.conditionsAt(def, "stop", p.id);
      const lines = [Model.MODE_HELP[p.mode], ""];
      for (const i of p.items) {
        lines.push(i.kind === "check" ? `- [ ] **Critical check:** ${md(or(i.text, "(no text)"))}` : `- [ ] ${md(or(i.text, "(no text)"))}${i.required ? "" : " (optional)"}`);
        if (i.kind === "check" && i.ifFailed.trim()) lines.push(`  - If it fails: ${md(i.ifFailed)}`);
      }
      if (!p.items.length) lines.push("- No items yet.");
      for (const c of stops) lines.push(`- **Stop:** ${md(or(c.text, "(no text)"))} ${md(c.instruction)}`.trimEnd());
      const notes = [p.details, ...p.items.filter((/** @type {any} */ i) => i.details.trim()).map((/** @type {any} */ i) => `${i.text}: ${i.details}`)].filter((s) => s.trim()).map(md).join("\n\n");
      const mode = p.mode === "read-do" ? "read do" : p.mode === "do-confirm" ? "do confirm" : "without a chosen mode";
      return {
        title: `Pause point ${k + 1}: ${md(or(p.title, "untitled"))} (${Model.MODE_LABEL[p.mode]})`,
        body: lines.join("\n"),
        notes,
        narration: speak(`Pause point ${k + 1}, ${or(p.title, "untitled")}, is ${mode}. It has ${count(steps.length, "normal step", "normal steps")} and ${count(checks.length, "critical check", "critical checks")}.${checks.length ? ` The critical checks are: ${checks.map((/** @type {any} */ i) => or(i.text, "untitled").replace(/[.]+$/, "")).join("; ")}.` : ""}${stops.length ? ` Stop if ${stops.map((/** @type {any} */ c) => or(c.text, "untitled").replace(/[.]+$/, "").toLowerCase()).join(", or if ")}.` : ""}`),
      };
    });
    const stopLines = [
      ...(def.none.stop ? ["- Stop conditions: none specified."] : def.stopConditions.map((/** @type {any} */ c) => `- **Stop:** ${md(or(c.text, "(no text)"))} Instruction: ${md(or(c.instruction, "not written yet"))}`)),
      ...(def.none.escalation ? ["- Escalation conditions: none specified."] : def.escalationConditions.map((/** @type {any} */ c) => `- **Escalate:** ${md(or(c.text, "(no text)"))} Ask ${md(or(c.contact, "a named person or role"))}: ${md(or(c.action, "not written yet"))}`)),
    ];
    const routeLines = def.none.recovery ? ["- Recovery routes: none specified. A failed check or a reported stop keeps the Run stopped."] : def.recoveryRoutes.flatMap((/** @type {any} */ r) => [
      `- **Recovery route:** ${md(or(r.title, "untitled"))}. Trigger: ${r.triggers.length ? r.triggers.map((/** @type {string} */ t) => triggerText(def, t)).join("; ") : "not linked yet"}.`,
      ...r.steps.map((/** @type {any} */ s, /** @type {number} */ k) => `  ${k + 1}. ${md(or(s.text, "(no text)"))}`),
      ...r.restartChecks.map((/** @type {any} */ s) => `  - Restart check: ${md(or(s.text, "(no text)"))}`),
      `  - Restart at: ${r.restartAt ? md(pauseLabel(def, r.restartAt)) : "not chosen yet"}`,
    ]);
    return {
      meta: { title, subtitle: `Revision ${def.revision}, ${count(n, "pause point", "pause points")}${def.example ? ", an example to adapt and review" : ""}`, voice: "bf_emma" },
      narration: speak(`This deck presents the checklist ${title}, revision ${def.revision}, with ${count(n, "pause point", "pause points")}. A checklist supplements a procedure; it does not replace it.`),
      setup: [{
        title: "The checklist and who uses it",
        body: setup,
        narration: speak(`The checklist is ${title}. ${details.intendedUsers.trim() ? `It is for ${details.intendedUsers.trim().replace(/[.]+$/, "")}.` : "Its intended users are not given yet."} ${def.example ? "It is an example: adapt it and review it before use." : ""} Reviewer records are supplied by the user and are not verified.`),
      }],
      method: [{
        title: "How each pause point is used",
        body: [
          "- Read–Do: read each item, do the action, then record its result.",
          "- Do–Confirm: complete the work, then confirm the required items.",
          "- A normal step is marked done; a critical check records passed, failed, unknown or not applicable.",
          "- Not applicable needs an authored rule and a recorded reason.",
        ].join("\n"),
        narration: "Each pause point is read do or do confirm. Normal steps are marked done. Critical checks record passed, failed, unknown, or not applicable with a reason. Nothing is marked automatically.",
      }],
      results: pauses.length ? pauses : [{ title: "No pause points yet", body: "- Add a pause point in Edit.", narration: "The checklist has no pause points yet." }],
      checks: [
        {
          title: "Stop and escalation conditions",
          body: stopLines.length ? stopLines.join("\n") : "- Stop and escalation conditions are not written yet.",
          narration: speak(`${def.none.stop ? "No stop condition is specified." : `There ${def.stopConditions.length === 1 ? "is one stop condition" : `are ${def.stopConditions.length} stop conditions`}. A reported stop blocks normal progress.`} ${def.none.escalation ? "No escalation condition is specified." : `${count(def.escalationConditions.length, "escalation condition names", "escalation conditions name")} a person or role to ask for help.`}`),
        },
        {
          title: "Recovery and restart",
          body: routeLines.length ? routeLines.join("\n") : "- Recovery routes are not written yet.",
          narration: speak(def.none.recovery ? "No recovery route is specified, so a failed check or a reported stop keeps the run stopped until it is ended." : `There ${def.recoveryRoutes.length === 1 ? "is one recovery route" : `are ${def.recoveryRoutes.length} recovery routes`}. A restart needs every restart check confirmed, and it clears the results that depend on the failure.`),
        },
        {
          title: "Takeaway",
          body: "- Normal progress needs a valid result for every required item at the pause point.\n- Test the checklist with its intended users on a representative task, then revise it.",
          key: "A failed or unknown critical check, or a reported stop condition, blocks normal progress. Completed boxes do not prove that the work is correct.",
          narration: "A failed or unknown critical check, or a reported stop condition, blocks normal progress. Test the checklist with its intended users before relying on it.",
        },
      ],
    };
  }

  /** Export Beam MD Switch: the deck the site's template writes, then the same payload. @param {any} entry */
  const toDeck = (entry) => `${Beamdswitch.deck(report(entry))}\n${payload(entry)}`;

  /* ---------- IMPORT ---------- */

  /**
   * An import error. `plain` says a plain-Markdown draft import is still offered for the same text.
   * @param {string} message @param {boolean} plain
   */
  function failure(message, plain) {
    const e = /** @type {Error & { plain: boolean }} */ (new Error(message));
    e.plain = plain;
    return e;
  }

  /** @param {string} text */
  const bytes = (text) => new TextEncoder().encode(text).length;
  /** @param {string} text */
  const normalise = (text) => text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  /** Refuse a file over 1 MiB, by its size in bytes. @param {number} size */
  function checkSize(size) {
    if (size > MAX_BYTES) throw failure(`The file is ${size.toLocaleString("en")} bytes; the limit is 1 MiB (${MAX_BYTES.toLocaleString("en")} bytes). Nothing was imported or truncated.`, false);
  }

  /** The first line where two texts differ, for an error a person can act on. @param {string} a @param {string} b */
  function firstDifference(a, b) {
    const x = a.split("\n"), y = b.split("\n");
    for (let k = 0; k < Math.max(x.length, y.length); k++) {
      if (x[k] !== y[k]) return { line: k + 1, expected: (x[k] ?? "(end of text)").slice(0, 80), found: (y[k] ?? "(end of text)").slice(0, 80) };
    }
    return null;
  }

  /**
   * Read a file's text: a lossless import when it carries this tool's payload, else a plain draft. Nothing changes
   * here; the page shows the preview this returns and applies it only on the person's choice.
   * @param {string} raw @param {"markdown" | "deck"} expect which import the person chose
   */
  function parseFile(raw, expect) {
    checkSize(bytes(raw));
    const text = normalise(raw);
    const at = text.indexOf(MARKER);
    if (at < 0) return plain(text, expect === "deck" || /^---\n/.test(text) ? "deck" : "markdown");
    if (text.indexOf(MARKER, at + 1) >= 0) throw failure("The file holds more than one embedded checklist state. Nothing was imported.", true);
    const end = text.indexOf("\n-->", at);
    if (end < 0) throw failure("The embedded checklist state has no end (-->). Nothing was imported.", true);
    if (text.slice(end + 4).trim()) throw failure("The file has text after the embedded checklist state, so it is not an unedited export. Nothing was imported.", true);
    /** @type {any} */
    let doc;
    try {
      doc = JSON.parse(text.slice(at + MARKER.length, end));
    } catch (e) {
      throw failure(`The embedded checklist state is not valid JSON (${e instanceof Error ? e.message : String(e)}). Nothing was imported.`, true);
    }
    /** @type {any} */
    let entry;
    try {
      entry = Model.readChecklist(doc);
    } catch (e) {
      throw failure(`${e instanceof Error ? e.message : String(e)} Nothing was imported.`, true);
    }
    const before = text.slice(0, at);
    /** @type {[string, string][]} */
    let profiles;
    try {
      profiles = [["markdown", `${readable(entry)}\n`], ["deck", `${Beamdswitch.deck(report(entry))}\n`]];
    } catch (e) {
      throw failure(`The embedded checklist state cannot be exported again (${e instanceof Error ? e.message : String(e)}). Nothing was imported.`, true);
    }
    const match = profiles.find(([, expected]) => expected === before);
    if (!match) {
      const [, expected] = profiles.find(([name]) => name === (/^---\n/.test(before) ? "deck" : "markdown")) ?? profiles[0];
      const diff = firstDifference(expected, before);
      throw failure(`The readable checklist and the embedded state disagree${diff ? ` at line ${diff.line}: the state gives “${diff.expected}”, the file has “${diff.found}”` : ""}. Nothing was imported. Use the plain Markdown draft import to keep the readable text instead.`, true);
    }
    return { kind: "lossless", profile: match[0], entry, summary: summary(entry) };
  }

  /** What an import preview shows: title, revision, pause points, reviewers and whether it holds Run progress. @param {any} entry */
  function summary(entry) {
    const def = entry.checklist;
    const run = entry.run;
    return {
      title: def.title,
      revision: def.revision,
      example: def.example,
      pausePoints: def.pausePoints.map((/** @type {any} */ p) => ({ title: p.title, mode: p.mode, steps: p.items.filter((/** @type {any} */ i) => i.kind === "step").length, checks: p.items.filter((/** @type {any} */ i) => i.kind === "check").length })),
      reviewers: entry.reviewers.length,
      progress: run ? `${run.id} on revision ${run.revision}, ${RUN_STATUS[/** @type {keyof RUN_STATUS} */ (run.status)]}, at ${pauseLabel(run.checklist, run.current)}` : "",
    };
  }

  /** Markdown escapes and emphasis removed, so imported text reads as plain text. @param {string} s */
  const clean = (s) => s.replace(/\*\*|__/g, "").replace(/\\([\\`*_[\]<>|~#&$!.()+\-{}:])/g, "$1").replace(/\s+/g, " ").trim();

  /** A pause point from a documented heading: "Pause point N:" is dropped and a mode in brackets is read. @param {string} heading */
  function pauseFromHeading(heading) {
    let title = clean(heading).replace(/^pause point \d+\s*[:.–-]\s*/i, "");
    let mode = "";
    const m = /\s*\((read\s*[–-]\s*do|do\s*[–-]\s*confirm)\)\s*$/i.exec(title);
    if (m) {
      mode = /^read/i.test(m[1]) ? "read-do" : "do-confirm";
      title = title.slice(0, m.index).trim();
    }
    return { title, mode, items: /** @type {string[]} */ ([]) };
  }

  /**
   * Plain Markdown (or an arbitrary deck): "#" is the title (a deck's front matter title), "##" a pause point
   * except the reserved headings, and list or task-list entries are draft normal steps. Everything else is listed
   * as unsupported. Ticked boxes and "Critical check:" labels are kept as text, never read as results or status.
   * @param {string} text @param {"markdown" | "deck"} profile
   */
  function plain(text, profile) {
    let body = text;
    let title = "";
    /** @type {{ line: number, text: string }[]} */
    const unsupported = [];
    let offset = 0;
    if (profile === "deck") {
      const fm = /^---\n([\s\S]*?)\n(?:---|\.\.\.)\s*(?:\n|$)/.exec(text);
      if (fm) {
        for (const line of fm[1].split("\n")) {
          const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
          if (kv && kv[1].toLowerCase() === "title") title = clean(kv[2].replace(/^(["'])(.*)\1$/, "$2"));
          else if (line.trim()) unsupported.push({ line: 0, text: `front matter: ${line.trim().slice(0, 100)}` });
        }
        offset = fm[0].split("\n").length - (fm[0].endsWith("\n") ? 1 : 0);
        body = text.slice(fm[0].length);
      }
    }
    /** @type {{ title: string, mode: string, items: string[] }[]} */
    const pausePoints = [];
    /** @type {{ title: string, mode: string, items: string[] } | null} */
    let current = null;
    let reserved = false, fence = "", div = 0, comment = false, checked = 0, labelled = 0;
    body.split("\n").forEach((raw, k) => {
      const n = k + 1 + offset;
      const line = raw.replace(/\s+$/, "");
      if (!line.trim()) return;
      const note = (/** @type {string} */ why) => unsupported.push({ line: n, text: `${why}${line.trim().slice(0, 100)}` });
      if (comment) { note("comment: "); if (line.includes("-->")) comment = false; return; }
      const f = /^\s*(```+|~~~+)/.exec(line);
      if (f || fence) {
        note("code: ");
        if (f && !fence) fence = f[1][0];
        else if (f && f[1][0] === fence) fence = "";
        return;
      }
      if (/^\s*<!--/.test(line)) { note("comment: "); if (!line.includes("-->")) comment = true; return; }
      if (profile === "deck" && /^\s*:{3,}/.test(line)) {
        note("block: ");
        if (/^\s*:{3,}\s*\S/.test(line)) div++;
        else div = Math.max(0, div - 1);
        return;
      }
      if (div) { note("block: "); return; }
      let m = /^#\s+(.*?)\s*#*$/.exec(line);
      if (m) {
        if (profile === "markdown" && !title) title = clean(m[1]);
        else note(profile === "deck" ? "section: " : "heading: ");
        return;
      }
      m = /^##\s+(.*?)\s*#*$/.exec(line);
      if (m) {
        reserved = RESERVED.includes(clean(m[1]).toLowerCase());
        if (reserved) { note("not a pause point: "); current = null; return; }
        current = pauseFromHeading(m[1]);
        pausePoints.push(current);
        return;
      }
      m = /^(?:[-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line);
      if (m && !reserved) {
        let item = m[1];
        const box = /^\[([ xX])\]\s+(.*)$/.exec(item);
        if (box) { if (box[1] !== " ") checked++; item = box[2]; }
        const value = clean(item);
        if (!value) return;
        if (/^critical check\s*:/i.test(value)) labelled++;
        if (!current) { current = { title: "", mode: "", items: [] }; pausePoints.push(current); }
        current.items.push(value);
        return;
      }
      note("");
    });
    const notes = [];
    if (checked) notes.push(`${count(checked, "ticked box was", "ticked boxes were")} imported as not done: plain imports start with fresh progress.`);
    if (labelled) notes.push(`${count(labelled, "item is", "items are")} labelled “Critical check”: plain imports make every item a normal step, so classify them in Edit.`);
    notes.push("Plain imports set no critical status, recovery route, reviewer record or completed work.");
    return { kind: "plain", profile, recognized: { title, pausePoints }, unsupported, notes, text };
  }

  /* ---------- DRAFTS ---------- */

  /** A draft definition from recognized plain content: every item a normal step, no category inferred. @param {{ title: string, pausePoints: { title: string, mode: string, items: string[] }[] }} recognized @param {string} id @param {string} original */
  function draftFromPlain(recognized, id, original) {
    const def = Model.blank(id);
    def.title = recognized.title;
    def.originalText = original;
    for (const p of recognized.pausePoints) {
      const pid = Model.addPausePoint(def, p.title);
      def.pausePoints.at(-1).mode = p.mode;
      for (const text of p.items) Model.addItem(def, pid, "step", text);
    }
    return Model.definition(def);
  }

  /**
   * Pasted process text as draft normal steps, deterministically: each list entry (with its indented continuation
   * lines) or, without list markers, each non-empty line is one step. Nothing is summarised, inferred or invented.
   * @param {string} text
   */
  function pasteSteps(text) {
    const lines = normalise(text).split("\n");
    const marker = /^\s*(?:[-*+•]|\d{1,9}[.)]|\[[ xX]\])\s+/;
    const listed = lines.some((l) => marker.test(l));
    /** @type {string[]} */
    const out = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      if (listed && !marker.test(line) && /^\s{2,}|^\t/.test(line) && out.length) {
        out[out.length - 1] = `${out[out.length - 1]} ${line.trim()}`;
        continue;
      }
      const stripped = line.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*>\s?/, "").replace(marker, "").replace(/^\[[ xX]\]\s+/, "").replace(/\s+/g, " ").trim();
      if (stripped) out.push(stripped);
    }
    return out;
  }

  /** A draft from pasted text: one pause point of normal steps, the original text kept for review. @param {string} text @param {string} title @param {string} id */
  function draftFromText(text, title, id) {
    const steps = pasteSteps(text);
    if (!steps.length) throw new Error("The pasted text has no lines to turn into steps.");
    return draftFromPlain({ title: title.trim(), pausePoints: [{ title: "", mode: "", items: steps }] }, id, normalise(text));
  }

  return { MARKER, MAX_BYTES, RESERVED, md, speak, fileName, readable, payload, toMarkdown, report, toDeck, checkSize, parseFile, summary, plain, draftFromPlain, pasteSteps, draftFromText };
});
