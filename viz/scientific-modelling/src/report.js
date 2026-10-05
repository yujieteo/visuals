/* Scientific Modelling: the report. report(state, derived, data) turns the derived data of one model version into
 * the plain-data report that the site's beamdswitch template (Beamdswitch.deck) writes as a narrated deck and the
 * kit writes as the Markdown record. It reads the same derived values and statuses as the page, so the three
 * outputs agree. The Method section holds the complete hand calculation (spec section 12, items 1 to 5), with
 * every row operation: an exported derivation is never cut short. Narration is plain spoken prose in ASD-STE100,
 * with no symbols; equations stay in the frame bodies.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./record.js"), require("./model.js"));
  else root.Report = factory(root.SM.R, root.Model);
})(typeof self !== "undefined" ? self : this, function (R, Model) {
  "use strict";

  const TITLE = "Scientific Modelling and Dimensional Analysis";
  const STATUS = R.STATUS;
  const status = (k) => `**${STATUS[k]}**`;
  /** Text for a Markdown table cell. */
  const cell = (x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const m = (tex) => `$${tex}$`;
  const dm = (tex) => `$$${tex}$$`;
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const words = (n) => NUMBER_WORDS[n] ?? String(n);
  /** Spoken text from record text: no symbols that the narration may not hold, subscripts read as plain words. */
  const say = (text) => String(text ?? "").replace(/_\{?([A-Za-z0-9∞]+)\}?/g, " $1").replace(/[$\\`*#|<>×%&≈]/g, " ")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, "").replace(/\s+/g, " ").trim();

  /** A result line: its status, its text, its inputs and whether a later edit invalidated it. */
  function resultLine(r) {
    const tex = r.tex ? ` ${m(r.tex)}` : "";
    const stale = r.valid ? "" : ` _Invalidated by the change of ${r.invalidatedBy.join(", ")}._`;
    return `- ${status(r.status)}: ${cell(r.title)}${tex}${r.tolerance ? ` Tolerance: ${r.tolerance}.` : ""}${r.next ? ` Next: ${r.next}` : ""}${stale}`;
  }
  /** The spoken name of a group: its familiar name, or its place in the list. */
  function spokenGroup(g, i) {
    const nm = (g.confirmed && g.names.find((x) => x.id === g.confirmed)) || g.names[0];
    if (!nm) return `group ${words(i + 1)}`;
    return `the ${nm.name.split(",")[0]}${nm.power < 0 ? " to the power minus one" : ""}`;
  }
  /** A spoken list in short sentences: "A, B and C." or "The first two are A and B. The others are C and D." */
  function spokenList(names) {
    const and = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] ?? "");
    return names.length <= 3 ? `In order, they are ${and(names)}.` : `The first two are ${and(names.slice(0, 2))}. The others are ${and(names.slice(2))}.`;
  }

  /** @param {Record<string, any>} state @param {any} d @param {any} data */
  function report(state, d, data) {
    const it = d.interp;
    const f = d.finder;
    const ok = f && f.ready;
    const sources = Object.fromEntries((data.sources?.sources ?? []).map((s) => [s.id, s]));
    const version = `version ${d.version}${d.confirmed ? ", confirmed" : d.confirmedVersion ? `, not confirmed (the analyses use confirmed version ${d.confirmedVersion})` : ", not confirmed"}`;
    const obs = it.variables.find((v) => v.id === it.observable);
    const errors = it.issues.filter((i) => i.severity === "error");

    /* ---------- set-up ---------- */
    const setup = [
      {
        title: `The question: ${d.title}`,
        body: [
          `**Question.** ${cell(it.purpose.question)}`, "",
          `**Model record:** ${cell(d.title)}, ${version}.`,
          `**Quantity of interest:** ${obs ? `${m(obs.tex)} (${cell(obs.meaning)})` : "not chosen"}.`,
          `**Intended calculation:** ${cell(it.calcs.find((c) => c.intended)?.name ?? "")}.`,
          `**Tool:** ${d.toolName}. **Model type:** ${it.model.type}.`, "",
          `**Interpretation:** ${status(d.confirmed ? "confirmed" : "proposed")}.`,
        ].join("\n"),
        narration: `This report follows one model record, ${say(d.title)}, at version ${d.version}. ${obs ? `The quantity of interest is the ${say(obs.meaning).toLowerCase()}.` : "The record names no quantity of interest."} ${d.confirmed ? "The researcher confirmed its interpretation." : "Its interpretation is not confirmed yet."}`,
      },
      {
        title: "Hand calculation 2: variables, dimensions and units",
        body: [
          "| Id | Symbol | Meaning | Kind | Unit | Dimension | Value (SI) | Pi set |",
          "| --- | --- | --- | --- | --- | --- | --- | --- |",
          ...it.variables.map((v) => `| ${v.id} | ${m(v.tex)} | ${cell(v.meaning)} | ${v.kind}${v.temperature ? `, ${v.temperature} temperature` : ""}${v.dimensionless ? `, ${v.dimensionless}` : ""} | ${cell(v.unit || "none")} | ${v.dimTex ? m(v.dimTex) : "unknown"} | ${cell(v.value ?? "none")} | ${v.pi ? "yes" : "no"} |`),
          ...it.variables.filter((v) => v.valueNote).map((v) => `\n${cell(v.valueNote)}`),
        ].join("\n"),
        narration: `The record has ${words(it.variables.length)} variables. ${words(it.variables.filter((v) => v.pi).length)} of them form the Pi set. The table gives the unit, the dimension and the value in SI units of each variable.`,
      },
      {
        title: "Hand calculation 1: physical set-up and assumptions",
        body: [
          `**Geometry:** ${cell(it.geometry.domain || "not stated")}. **Coordinates:** ${cell(it.geometry.coordinates || "not stated")}. **Interfaces:** ${cell(it.geometry.interfaces || "not stated")}.`, "",
          "**Assumptions:**", "",
          ...(it.assumptions.length ? it.assumptions.map((a) => `- ${a.id} (${a.kind}): ${cell(a.text)}${a.source ? ` Source: ${sources[a.source] ? `[${cell(sources[a.source].title)}](${sources[a.source].url})` : a.source}.` : ""}`) : ["- None stated."]), "",
          "**Equations:**", "",
          ...(it.equations.length ? it.equations.map((e) => `- ${e.id} (${e.kind}): ${e.tex ? m(e.tex) : `\`${cell(e.text)}\``}${e.domainText ? `, ${cell(e.domainText)}` : ""}${e.terms.length ? `. Term dimensions: ${e.terms.map((t) => `${m(t.tex)}: ${t.dimTex ? m(t.dimTex) : "unknown"}`).join(", ")}` : ""}.`) : ["- None: the Finder uses the variable list only."]), "",
          "**Conditions:**", "",
          ...(it.conditions.length ? it.conditions.map((c) => `- ${c.id} (${c.kind}): ${c.tex ? m(c.tex) : `\`${cell(c.text)}\``} at ${c.atTex ? m(c.atTex) : cell(c.at)}.`) : ["- None."]),
        ].join("\n"),
        narration: `The set-up lists the geometry, ${words(it.assumptions.length)} assumptions, ${words(it.equations.length)} equations and ${words(it.conditions.length)} conditions. Each assumption names its source.`,
      },
      {
        title: errors.length ? `Checks before analysis: ${count(errors.length, "failed check", "failed checks")}` : "Checks before analysis: no failed check",
        body: it.issues.length ? it.issues.map((i) => `- **${i.severity}** ${cell(i.message)} **Next:** ${cell(i.next)}${i.blocks.length ? ` Blocks: ${i.blocks.join(", ")}.` : ""}`).join("\n")
          : "The dimension check of every term, the units, the conditions, the closure and the domains pass. A dimensional check does not establish physical validity.",
        narration: errors.length ? `The checks before analysis found ${words(errors.length)} errors. Each one names the next useful action and the calculations that it blocks. Calculations that do not read the failed input still run.` : "The checks before analysis found no error. A dimensional check does not establish physical validity.",
      },
    ];

    /* ---------- method ---------- */
    const method = [];
    if (!ok) {
      method.push({
        title: d.confirmedVersion === null ? "The Finder waits for the confirmed interpretation" : "The Finder cannot run on this version",
        body: d.confirmedVersion === null ? "The researcher must confirm the interpretation of the variables, equations, geometry and conditions before the analysis. The checks before analysis above do not need the confirmation."
          : `The Finder is blocked: ${cell((f?.blockedBy ?? []).map((id) => it.issues.find((i) => i.id === id)?.message ?? id).join(" "))}`,
        narration: d.confirmedVersion === null ? "The Finder runs after the researcher confirms the interpretation. The checks before analysis do not wait for it." : "A failed check blocks the Finder. The report names the failed check and the next action.",
      });
    } else {
      const R0 = f.rows.map((r) => r.base).join(", ");
      method.push({
        title: `Hand calculation 3: the dimension matrix D, ${f.rows.length} × ${f.n}`,
        body: [`Columns in the order ${f.vars.map((v) => m(v.tex)).join(", ")}. Rows in the order ${R0}.`, "", dm(`D=${f.Dtex}`)].join("\n"),
        narration: `The dimension matrix has one column for each of the ${words(f.n)} variables and one row for each base dimension that occurs.`,
      });
      method.push({
        title: `Hand calculation 3: row reduction in ${count(f.rref.steps.length, "step", "steps")}`,
        body: [`Exact rational row operations. Rows are named by position.`, "",
          ...f.rref.steps.map((s) => `${s.n}. ${m(s.tex)}: ${cell(s.reason)}\n\n   ${dm(s.matrixTex)}`),
          "", `Reduced row echelon form, with pivots in the columns ${f.rref.pivots.join(", ") || "none"}:`, "", dm(`\\operatorname{rref}(D)=${f.rref.Rtex}`)].join("\n"),
        narration: `The row reduction takes ${words(f.rref.steps.length)} exact steps. Each step names its reason. The pivots give the rank.`,
      });
      method.push({
        title: `Hand calculation 3: rank ${f.r} and a kernel basis of ${f.m} vectors`,
        body: [`The rank is ${f.r}, so ${f.n} − ${f.r} = ${f.m} independent groups exist. The free columns ${f.rref.free.join(", ") || "none"} give the row-reduced kernel basis:`, "",
          ...f.kernel.map((g) => `- ${m(g.tex)}`), "", "This basis is not unique. The repeating-variable method below gives another basis of the same space."].join("\n"),
        narration: `The rank is ${words(f.r)}. Thus the variable set has ${words(f.m)} independent groups. The basis is not unique.`,
      });
      method.push({
        title: `Hand calculation 4: repeating variables ${f.repeating.labels.join(", ")}`,
        body: [
          ...f.repeating.reasons.map((r) => `- ${m(r.tex)}: ${cell(r.text)}`),
          ...f.repeating.excluded.map((e) => `- Not used: ${m(e.tex)}, because ${cell(e.reason)}.`),
          ...f.repeating.skipped.map((e) => `- Not used: ${m(e.tex)}, because ${cell(e.reason)}.`),
          ...(f.repeating.override ? [`- Researcher's set ${cell(f.repeating.override.ids.join(", "))}: ${f.repeating.override.error ? `refused, because ${cell(f.repeating.override.error)}. The automatic set stays.` : "accepted."}`] : []),
          ...d.zeroNote.map((z) => `- ${cell(z)}`),
          "", f.r ? dm(`D_R=${f.repeating.DRtex},\\qquad \\det D_R=${f.repeating.det}`) : "Rank 0: no repeating variables.",
          f.r ? `Rows of D_R: ${f.repeating.DRrows.join(", ")}.` : "",
        ].join("\n"),
        narration: `The Finder selects ${words(f.r)} repeating variables with independent dimension columns. The determinant of their matrix is not zero, so the selection is valid. Another valid selection gives an equivalent basis.`,
      });
      method.push({
        title: "Hand calculation 4: exponent equations",
        body: [`For each other variable ${m("q")}, ${m(`\\Pi_q=q\\,${f.repeating.texs.map((t, k) => `${t}^{${f.repeating.letters[k]}}`).join("\\,")}`)}. The table has one equation for each base dimension, in the order ${R0}.`, "",
          `| Variable | Exponent equations | Solution (${f.repeating.letters.join(", ")}) | Group |`, "| --- | --- | --- | --- |",
          ...f.exponentEquations.map((q) => `| ${m(q.tex)} | ${q.lines.map((l) => m(l.text)).join(", ")} | ${m(`(${q.solutionTex.join(",")})`)} | ${m(q.group)} |`)].join("\n"),
        narration: `For each other variable, the Finder solves ${words(f.rows.length)} exponent equations exactly. Each solution gives one group.`,
      });
      method.push({
        title: "Numerical procedure: none",
        body: `Every step uses exact rational arithmetic (BigInt fractions). Settings: ${cell(d.settings.arithmetic)}. Floating-point values appear only as decimal text of exact values, with a stated tolerance of ${cell(d.settings.tolerance)}.`,
        narration: "The Finder uses no numerical approximation. Every step is exact.",
      });
    }

    /* ---------- results ---------- */
    const results = [];
    if (ok) {
      results.push({
        title: `${count(f.m, "group", "groups")}: the repeating-variable basis`,
        body: f.groups.map((g, i) => {
          const names = g.names.map((nm) => `${m(nm.tex)} (${cell(nm.name)}, ${g.confirmed === nm.id ? STATUS.confirmed : STATUS.proposed})`).join(" or ");
          return `- ${m(`\\Pi_{${i + 1}}=${g.tex}`)}${names ? `: matches ${names}` : ": no familiar name"}${g.meaning ? `. Meaning kept: ${g.meaning}` : ""}${g.absolute.length ? `. Uses the absolute temperatures ${g.absolute.join(", ")}: values in K` : ""}.`;
        }).join("\n"),
        narration: `The repeating-variable basis has ${words(f.m)} groups. ${spokenList(f.groups.map(spokenGroup))} A recognized name is a proposed interpretation until the researcher confirms it.`,
      });
      if (f.familiar) {
        results.push({
          title: `An equivalent familiar basis: ${f.familiar.groups.map(Model.groupLabel).join(", ")}`,
          body: [...f.familiar.groups.map((g) => `- ${m(g.names[0] ? `${g.names[0].tex}=${g.tex}` : g.tex)}${g.fixed ? `, fixed by ${g.fixed}` : ""}${g.names[0] ? `. ${cell(g.names[0].reference)}` : ""}`),
            "", `Each familiar group is a product of powers of the repeating-variable groups. The columns of ${m("T")} give the exponents:`, "",
            dm(`T=${f.familiar.Ttex},\\qquad \\det T=${f.familiar.det}`),
            "", ...f.familiar.relations.map((rl) => `- ${m(`${rl.group}=${rl.combo || "1"}`)}`)].join("\n"),
          narration: `An equivalent basis uses familiar groups. ${spokenList(f.familiar.groups.map(spokenGroup))} The exponent matrix between the two bases has a determinant that is not zero, so both bases span the same groups.`,
        });
      }
      results.push({
        title: "The dimensionless relation and what it still needs",
        body: [f.correlation.relation ? dm(f.correlation.relation) : "No quantity of interest.", "",
          f.constraints.items.length ? `Constraints between inputs: ${f.constraints.items.map((c) => `${c.id} (${cell(c.text)})${c.monomial ? ` fixes ${m(`${c.group}=${c.value}`)}` : ": not a power law, counted as one constraint"}`).join(". ")}. Algebraically ${f.constraints.algebraic} exponent vectors are independent, but ${f.constraints.free} groups can vary independently.` : "The record states no constraint between the inputs of the Pi set.",
          "", "Before a physical correlation, the researcher must supply:", "",
          "- data or a solved model for the function f over the range of each group",
          `- the geometry and the definition of each reference length${it.geometry.domain ? ` (now: ${cell(it.geometry.domain)})` : ""}`,
          `- the statement that the quantity of interest is a local or a mean value${obs?.average ? ` (now: ${obs.average})` : ""}`,
          `- the type of boundary condition, such as wall temperature or wall heat flux${it.conditions.length ? "" : " (the record has no conditions)"}`,
          "- the reference temperature of the properties, and all further physics that adds variables",
          "", "Buckingham Pi analysis does not determine this correlation."].join("\n"),
        narration: "The quantity of interest is a function of the other groups. Buckingham Pi analysis does not give that function. Data or a solved model must supply it, with the geometry, the conditions and the property reference.",
      });
      const values = d.results.find((r) => r.id === "r-values");
      if (values) results.push({ title: "Group values from the entered values", body: [resultLine(values), ...d.results.filter((r) => r.id === "r-values-float").map(resultLine)].join("\n"), narration: "The entered values give a value for each group whose variables all have values. The arithmetic is exact." });
    }
    const unresolved = d.results.filter((r) => r.status === "unresolved");
    results.push({
      title: unresolved.length ? `${count(unresolved.length, "unresolved result", "unresolved results")}` : "No unresolved result",
      body: unresolved.length ? unresolved.map(resultLine).join("\n") : "Every requested calculation of this piece ran.",
      narration: unresolved.length ? `The report keeps ${words(unresolved.length)} unresolved results visible. Each one states the failed check or the piece that brings the calculation.` : "Every requested calculation of this piece ran.",
    });

    /* ---------- checks and takeaway ---------- */
    const checks = [];
    if (ok) {
      checks.push({
        title: "Hand calculation 5: dimensional cancellation and independence",
        body: [...f.groups.map((g) => dm(g.cancelTex)), "", ...f.checks.map((c) => `- ${status(c.status)}: ${c.passed ? "passed" : "FAILED"}. ${cell(c.title)}: ${cell(c.detail)}`)].join("\n"),
        narration: `Every group is dimensionless, and the ${words(f.checks.length)} exact checks ${f.checks.every((c) => c.passed) ? "pass" : "do not all pass"}. These checks use exact arithmetic, not a floating-point comparison.`,
      });
    }
    checks.push({
      title: "Results with their statuses and evidence",
      body: [...d.results.map(resultLine), "", "Status counts: " + Object.entries(d.counts).map(([k, n]) => `${STATUS[k]}: ${n}`).join(", ") + ".", "",
        "Sources:", "", ...(data.sources?.sources ?? []).filter((s) => d.results.some((r) => r.evidence.includes(s.id)) || it.assumptions.some((a) => a.source === s.id)).map((s) => `- ${s.id}: [${cell(s.title)}](${s.url}), read ${s.read}.`),
        ...(d.reference ? ["", `Independent reference: SymPy ${d.reference.versions.sympy} with mpmath ${d.reference.versions.mpmath} (tools/references.py).`] : []),
        "", "Limits: a dimensional check does not establish physical validity. A numerical check does not establish a mathematical proof. The basis is complete relative to the supplied variables only."].join("\n"),
      narration: "Each result carries one of the six statuses, its inputs and its evidence. A dimensional check does not establish physical validity, and a numerical check is not a proof.",
    });
    const key = ok
      ? `${f.n} variables, rank ${f.r}: ${f.m} independent groups${f.constraints.items.length ? `, of which ${f.constraints.free} vary independently` : ""}. ${f.correlation.relation ? `${m(f.correlation.relation)}.` : ""} Buckingham Pi analysis does not give the function f.`
      : d.confirmedVersion === null ? "Confirm the interpretation to run the Finder. The checks before analysis already ran." : `The Finder is blocked. ${cell(it.issues.find((i) => (f?.blockedBy ?? []).includes(i.id))?.next ?? "")}`;
    checks.push({
      title: "Takeaway",
      key,
      narration: ok ? `The variable set has ${words(f.m)} independent groups. ${f.constraints.items.length ? `Only ${words(f.constraints.free)} of them can vary independently. ` : ""}The quantity of interest is a function of the other groups, and data or a solved model must supply that function.`
        : "The Finder did not run on this version. The report names the reason and the next action.",
    });

    return {
      meta: { title: TITLE, subtitle: `${d.title}: model version ${d.version}${d.confirmed ? "" : " (not confirmed)"}`, voice: "bf_emma" },
      narration: `This report comes from the Dimensionless Number Finder, for model version ${d.version}. All arithmetic in it is exact.`,
      setup, method, results, checks,
    };
  }

  return { TITLE, report, resultLine };
});
