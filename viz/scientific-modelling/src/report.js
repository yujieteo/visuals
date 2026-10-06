/* Scientific Modelling: the report. report(state, derived, data) turns the derived data of one model version into
 * the plain-data report that the site's beamdswitch template (Beamdswitch.deck) writes as a narrated deck and the
 * kit writes as the Markdown record. It reads the same derived values and statuses as the page, so the three
 * outputs agree. The Method section holds the complete hand calculation (spec section 12, items 1 to 9), with
 * every row operation, every substitution and every order of each asymptotic expansion: an exported derivation is
 * never cut short. The regime map is large numerical data, so the report gives its aggregates and the get_regime_map
 * tool gives every point. Narration is plain spoken prose in ASD-STE100, with no symbols; equations stay in the
 * frame bodies.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./record.js"), require("./model.js"), require("./stabreport.js"));
  else root.Report = factory(root.SM.R, root.Model, root.StabReport);
})(typeof self !== "undefined" ? self : this, function (R, Model, StabReport) {
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
  const SPOKEN = { "ν": "nu", "μ": "mu", "ρ": "rho", "α": "alpha", "Δ": "delta", "θ": "theta", "λ": "lambda", "τ": "tau", "∞": "infinity", "−": "minus", "=": "equals", "/": "over" };
  /** Spoken text from model text: Greek letters and signs as words, no symbols that the narration may not hold. */
  const say = (text) => String(text ?? "").replace(/_\{?([A-Za-z0-9∞]+)\}?/g, " $1").replace(/[νμραΔθλτ∞−=/]/g, (c) => ` ${SPOKEN[c]} `).replace(/:/g, ",").replace(/[$\\`*#|<>×%&≈]/g, " ")
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, "").replace(/\s+/g, " ").trim();
  /** "1 equation", "2 equations", "no equations", with the number as a word. */
  const n = (k, one, many) => (k === 0 ? `no ${many}` : `${words(k)} ${k === 1 ? one : many}`);
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  /** A result line: its status, its text, its inputs and whether a later edit invalidated it. */
  function resultLine(r) {
    const tex = r.tex ? ` ${m(r.tex)}` : "";
    const stale = r.valid ? "" : ` _Invalidated by the change of ${r.invalidatedBy.join(", ")}._`;
    return `- ${status(r.status)}: ${cell(r.title)}${tex}${r.tolerance ? ` Tolerance: ${r.tolerance}.` : ""}${r.next ? ` Next: ${r.next}` : ""}${stale}`;
  }
  /** The spoken name of a group: its familiar name, or the group of its one variable that is not repeating. */
  function spokenGroup(g, vars = [], repeating = []) {
    if (g.fixed) return "the group that the relation fixes at one";
    const nm = (g.confirmed && g.names.find((x) => x.id === g.confirmed)) || g.names[0];
    if (!nm) {
      const own = vars.find((v) => v.id === g.contains.find((id) => !repeating.includes(id)));
      return own ? `the group of the ${say(own.meaning.split(",")[0]).toLowerCase()}` : "a group with no familiar name";
    }
    return nm.power < 0 ? `the reciprocal of the ${nm.name.split(",")[0]}` : `the ${nm.name.split(",")[0]}`;
  }
  /** Spoken names of a list of groups; a name that occurs twice adds the variable that makes the groups differ. */
  function spokenGroups(groups, vars, repeating = []) {
    const names = groups.map((g) => spokenGroup(g, vars, repeating));
    return names.map((nm, i) => {
      if (names.filter((x) => x === nm).length < 2) return nm;
      const others = groups.filter((g, j) => j !== i && names[j] === nm).flatMap((g) => g.contains);
      const own = groups[i].contains.find((id) => !others.includes(id));
      const v = vars.find((x) => x.id === own);
      return v ? `${nm} with the ${v.meaning.toLowerCase()}` : nm;
    });
  }
  /** A spoken list in short sentences: "A, B and C." or "The first two are A and B. The others are C and D." */
  function spokenList(names) {
    const and = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] ?? "");
    const one = `In order, they are ${and(names)}.`;
    if (names.length <= 3 && one.split(" ").length <= 22) return one;
    const head = names.length <= 3 ? 1 : 2;
    // The rest in sentences of at most two names, so that no sentence of the narration is long.
    const rest = names.slice(head), parts = [];
    for (let i = 0; i < rest.length; i += 2) parts.push(rest.slice(i, i + 2));
    const lead = (p, i) => {
      if (i < parts.length - 1) return "Then come";
      if (parts.length === 1) return p.length === 1 ? "The other is" : "The others are";
      return p.length === 1 ? "The last is" : "The last are";
    };
    const tail = parts.map((p, i) => `${lead(p, i)} ${and(p)}.`).join(" ");
    return `${head === 1 ? `The first is ${names[0]}` : `The first two are ${and(names.slice(0, 2))}`}. ${tail}`;
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
          `**Model:** ${cell(d.title)}, ${version}.`,
          `**Quantity of interest:** ${obs ? `${m(obs.tex)} (${cell(obs.meaning)})` : "not chosen"}.`,
          `**Intended calculation:** ${cell(it.calcs.find((c) => c.intended)?.name ?? "")}.`,
          `**Tool:** ${d.toolName}. **Model type:** ${it.model.type}.`, "",
          `**Interpretation:** ${status(d.confirmed ? "confirmed" : "proposed")}.`,
        ].join("\n"),
        narration: `This report follows version ${d.version} of one model. Its title is ${say(d.title)}. ${obs ? `The quantity of interest is the ${say(obs.meaning.split(",")[0]).toLowerCase()}.` : "The model names no quantity of interest."} ${d.confirmed ? "The researcher confirmed its interpretation." : "Its interpretation is not confirmed yet."}`,
      },
      {
        title: "Hand calculation 1: physical set-up and assumptions",
        body: [
          `**Geometry:** ${cell(it.geometry.domain || "not stated")}. **Coordinates:** ${cell(it.geometry.coordinates || "not stated")}. **Interfaces:** ${cell(it.geometry.interfaces || "not stated")}.`, "",
          "**Assumptions:**", "",
          ...(it.assumptions.length ? it.assumptions.map((a) => `- ${a.id} (${a.kind}): ${cell(a.text)}${a.source ? ` Source: ${sources[a.source] ? `[${cell(sources[a.source].title)}](${sources[a.source].url})` : a.source}.` : ""}`) : ["- None stated."]), "",
          "**Equations:**", "",
          ...(it.equations.length ? it.equations.map((e) => `- ${e.id} (${e.kind}): ${e.tex ? m(e.tex) : `\`${cell(e.text)}\``}${e.domainText ? `, ${cell(e.domainText)}` : ""}${e.terms.length ? `. Term dimensions: ${e.terms.map((t) => `${m(t.tex)}: ${t.dimTex ? m(t.dimTex) : "unknown"}`).join(", ")}` : ""}.`) : ["- None. The Finder uses the Pi variables only."]), "",
          "**Conditions:**", "",
          ...(it.conditions.length ? it.conditions.map((c) => `- ${c.id} (${c.kind}): ${c.tex ? m(c.tex) : `\`${cell(c.text)}\``} at ${c.atTex ? m(c.atTex) : cell(c.at)}.`) : ["- None."]),
        ].join("\n"),
        narration: `The set-up lists the geometry, ${n(it.assumptions.length, "assumption", "assumptions")}, ${n(it.equations.length, "equation", "equations")} and ${n(it.conditions.length, "condition", "conditions")}. Each assumption names its source.`,
      },
      {
        title: "Hand calculation 2: variables, dimensions and units",
        body: [
          "| Id | Symbol | Meaning | Kind | Unit | Dimension | Value (SI) | Pi set |",
          "| --- | --- | --- | --- | --- | --- | --- | --- |",
          ...it.variables.map((v) => `| ${v.id} | ${m(v.tex)} | ${cell(v.meaning)} | ${v.kind}${v.temperature ? `, ${v.temperature} temperature` : ""}${v.dimensionless ? `, ${v.dimensionless}` : ""} | ${cell(v.unit || "none")} | ${v.dimTex ? m(v.dimTex) : "unknown"} | ${cell(v.value ?? "none")} | ${v.pi ? "yes" : "no"} |`),
          ...it.variables.filter((v) => v.valueNote).map((v) => `\n${cell(v.valueNote)}`),
        ].join("\n"),
        narration: `The model has ${n(it.variables.length, "variable", "variables")}. ${it.variables.every((v) => v.pi) ? "All of them are Pi variables." : `${cap(n(it.variables.filter((v) => v.pi).length, "of them is a Pi variable", "of them are Pi variables"))}.`} The table gives the unit, the dimension and the value in SI units of each variable.`,
      },
      {
        title: errors.length ? `Checks before analysis: ${count(errors.length, "failed check", "failed checks")}` : "Checks before analysis: no failed check",
        body: it.issues.length ? it.issues.map((i) => `- **${i.severity}** ${cell(i.message)} **Next:** ${cell(i.next)}${i.blocks.length ? ` Blocks: ${i.blocks.join(", ")}.` : ""}`).join("\n")
          : "The dimension check of every term, the units, the conditions, the closure and the domains pass. A dimensional check does not establish physical validity.",
        narration: errors.length ? `The checks before analysis found ${n(errors.length, "error", "errors")}. Each one names the next useful action and the calculations that it blocks. Calculations that do not read the failed input still run.` : "The checks before analysis found no error. A dimensional check does not establish physical validity.",
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
        narration: `The row reduction takes ${n(f.rref.steps.length, "exact step", "exact steps")}. Each step names its reason. The number of pivots is the rank.`,
      });
      method.push({
        title: `Hand calculation 3: rank ${f.r} and a kernel basis of ${f.m} vectors`,
        body: [`The rank is ${f.r}, so ${f.n} − ${f.r} = ${f.m} independent groups exist. The free columns ${f.rref.free.join(", ") || "none"} give the row-reduced kernel basis:`, "",
          ...f.kernel.map((g) => `- ${m(g.tex)}`), "", "This basis is not unique. The repeating-variable method below gives another basis of the same space."].join("\n"),
        narration: `The rank is ${words(f.r)}. Thus the Pi variables give ${n(f.m, "independent group", "independent groups")}. The basis is not unique.`,
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
        body: [`For each Pi variable ${m("q")} that is not a repeating variable, ${m(`\\Pi_q=q\\,${f.repeating.texs.map((t, k) => `${/[-+]/.test(t) ? `\\left(${t}\\right)` : t}^{${f.repeating.letters[k]}}`).join("\\,")}`)}. The table has one equation for each base dimension, in the order ${R0}.`, "",
          `| Variable | Exponent equations | Solution (${f.repeating.letters.join(", ")}) | Group |`, "| --- | --- | --- | --- |",
          ...f.exponentEquations.map((q) => `| ${m(q.tex)} | ${q.lines.map((l) => m(l.text)).join(", ")} | ${m(`(${q.solutionTex.join(",")})`)} | ${m(q.group)} |`)].join("\n"),
        narration: `For each Pi variable that is not a repeating variable, the Finder solves ${n(f.rows.length, "exponent equation", "exponent equations")} exactly. Each solution gives one group.`,
      });
      method.push({
        title: "Numerical procedure: none",
        body: `Every step uses exact rational arithmetic (BigInt fractions). Settings: ${cell(d.settings.arithmetic)}. Floating-point values appear only as decimal text of exact values, with a stated tolerance of ${cell(d.settings.tolerance)}.`,
        narration: "The Finder uses no numerical approximation. Every step is exact.",
      });
    }

    /* ---------- method: the Nondimensionalizer (hand calculation items 6 and 7) ---------- */
    const nd = d.nondim;
    const ndOk = nd && nd.ready;
    const where = (e) => (e.at ? `\\quad\\text{at }${e.at.tex}` : e.domainTex ? `,\\quad ${e.domainTex}` : "");
    if (d.confirmedVersion !== null && nd && !nd.ready) {
      const why = nd.reason === "blocked" ? nd.blockedBy.map((id) => it.issues.find((i) => i.id === id)?.message ?? id).join(" ") : nd.message;
      method.push({
        title: nd.reason === "no-equations" ? "The Nondimensionalizer: no equation to transform" : "The Nondimensionalizer cannot run on this version",
        body: `${cell(why)}${nd.next ? ` **Next:** ${cell(nd.next)}` : ""}`,
        narration: nd.reason === "no-equations" ? "The model has no equation, so the Nondimensionalizer has nothing to transform. The Finder result stays valid." : "A failed check blocks the Nondimensionalizer. The report names the failed check and the next action.",
      });
    }
    if (ndOk) {
      const others = nd.scales.flatMap((sc) => sc.candidates.filter((c) => !c.chosen).map((c) => ({ sc, c })));
      method.push({
        title: `Hand calculation 6: ${count(nd.scales.length, "scale", "scales")}`,
        body: [
          "| Variable | Dimensionless | Scale | Offset | Status | Reason |", "| --- | --- | --- | --- | --- | --- |",
          ...nd.scales.map((sc) => `| ${m(sc.tex)} | ${m(sc.hatTex)} | ${m(sc.chosen.tex)}${sc.chosen.value ? ` (${cell(sc.chosen.value)} in SI units)` : ""} | ${m(sc.offsetTex)} | ${STATUS[sc.status]} | ${cell(sc.chosen.reason)} |`),
          "", "Other candidates:", "",
          ...(others.length ? others.map(({ sc, c }) => `- ${m(sc.tex)}: ${m(c.tex ?? "?")}. ${cell(c.reason)}${c.valid ? "" : ` Refused: ${cell(c.signWhy || c.error || c.dimWhy)}.`}${c.ratio ? ` Ratio of the chosen scale to this one: ${m(c.ratio.tex)}${c.ratio.names.length ? ` = ${c.ratio.names.map((x) => m(x.tex)).join(", ")}, ${cell(c.ratio.names.map((x) => x.name).join(", "))} (a proposed name)` : ""}.` : ""}`)
            : ["- None: no other mechanism or prescribed value gives a scale."]),
          ...nd.scales.filter((sc) => sc.changed).map((sc) => `\n**${STATUS.unresolved}:** ${cell(sc.changed)}`),
        ].join("\n"),
        narration: `The Nondimensionalizer chooses a scale for each coordinate and field, ${words(nd.scales.length)} in all. Each scale comes from your entry, the domain or the geometry, a prescribed value, or a balance of two terms. No scale can be zero.${nd.scales.some((sc) => sc.changed) ? " One natural scale is zero, so the tool uses another scale and states the changed meaning." : ""}`,
      });
      method.push({
        title: "Hand calculation 6: dimensionless variables and derivative transformations",
        body: [
          ...nd.variables.map((v) => `- ${m(v.defTex)}, and the inverse ${m(v.invTex)}: ${v.inverseOk ? "each map is the inverse of the other (exact)" : "the maps do not compose to the identity"}.`),
          "", ...nd.derivatives.map((x) => `${dm(x.tex)}\n\n${cell(x.reason)}\n`),
        ].join("\n"),
        narration: "Each variable becomes an offset plus its scale times a dimensionless variable. A derivative takes the scale of the field. It divides by the scale of its coordinate once for each order. The page checks that each map is the inverse of the other.",
      });
      method.push({
        title: `Hand calculation 7: substitution and common factors in ${count(nd.equations.length, "equation or condition", "equations and conditions")}`,
        body: nd.equations.map((e) => [`**${e.id}** (${e.kind}${e.output ? `, defines ${e.output}` : ""}):`, "", dm(e.originalTex), e.domainText ? `Holds ${cell(/^at /.test(e.domainText) ? e.domainText : `for ${e.domainText}`)}.` : "",
          "", "Substitute:", "", dm(e.substitutedTex), "", "Simplify:", "", dm(e.simplifiedTex), "",
          `Divide by the common factor ${m(e.factorTex)}, the coefficient of the term for ${cell(e.reference || "the first term")}:`, "",
          dm(`${e.dimensionlessTex}${where(e)}`), ""].join("\n")).join("\n"),
        narration: `The tool substitutes the new variables into each of the ${words(nd.equations.length)} equations and conditions. Then it simplifies each one and divides it by its common factor. That factor is the coefficient of the term with the highest derivative of a field.`,
      });
    }

    /* ---------- method: the regime analyses (hand calculation item 8) ---------- */
    const rg = d.regime;
    const rgOk = rg && rg.ready;
    if (d.confirmedVersion !== null && rg && !rg.ready && rg.reason !== "no-declaration" && rg.reason !== "blocked") {
      method.push({ title: "The regime analyses cannot run on this version", body: [cell(rg.message), ...(rg.problems ?? []).map((x) => `- ${cell(x)}`), "", `**Next:** ${cell(rg.next)}`].join("\n"),
        narration: "The record names a declared model, but its dimensionless model is not the declared one. The report lists each difference and the next action." });
    }
    if (rgOk) {
      const an = rg.analysis;
      method.push({
        title: `Hand calculation 8: the declared model, ${rg.declaration.title}`,
        body: [`${cell(rg.declaration.summary)}`, "", `The Nondimensionalizer's result equals the declared dimensionless model exactly (canonical forms). ${status("exact")}`, "",
          "| Record item | Declared dimensionless form |", "| --- | --- |",
          ...rg.match.equations.map((e) => `| ${e.record} | ${m(e.tex)} |`), ...rg.match.conditions.map((c) => `| ${c.record} | ${m(`${c.tex}\\quad\\text{at }${c.atTex}`)} |`), "",
          "| Parameter | Meaning | Domain | Record value |", "| --- | --- | --- | --- |",
          ...rg.params.map((p) => `| ${m(p.tex)} | ${cell(p.label)} | ${p.min} to ${p.max} | ${p.exact ?? (p.record === null ? "none" : p.record)} |`)].join("\n"),
        narration: `The record follows the declared model of the ${say(rg.declaration.title).toLowerCase()}. Its dimensionless equations and conditions are the declared ones, exactly. The table gives the domain of each parameter and its value in the record.`,
      });
      method.push({
        title: "Hand calculation 8: dominant balance",
        body: [cell(an.balance.intro), "",
          "| Term | Meaning | Estimate | Why |", "| --- | --- | --- | --- |", ...an.balance.terms.map((t) => `| ${m(t.tex)} | ${cell(t.label)} | ${m(t.scale)} | ${cell(t.why)} |`), "",
          ...an.balance.balances.flatMap((b) => [`**${cell(b.title)}** when ${m(b.when)}. ${cell(b.derivation)}`, "",
            `- Reduced model: ${m(b.reduced)}. Neglected: ${cell(b.neglected)}.${b.assumptions.length ? ` Assumes: ${cell(b.assumptions.join(" "))}` : ""}`,
            `- Residual in the full equations: ${m(b.residual.tex)}, ${cell(b.residual.order)}. ${status(b.residual.status)}. ${cell(b.residual.note ?? "")}`, ""]),
          "**Balance crossovers:**", "", ...an.balance.crossovers.map((c) => `- ${m(c.criterion)}: ${cell(c.text)} ${status(c.status)}.`), "", cell(an.balance.note)].join("\n"),
        narration: `${an.balance.estimated ? `The dominant balance compares the terms with their estimated scales.` : "The dominant balance compares exact terms."} It gives ${n(an.balance.balances.length, "candidate balance", "candidate balances")}, each with a reduced model, the neglected terms and the residual in the full equations. Where the terms are equal, the map draws a balance crossover. It is not a transition.`,
      });
      method.push({
        title: "Hand calculation 8: asymptotic analysis",
        body: [...(an.note ? [cell(an.note), ""] : []), ...an.asymptotic.limits.flatMap((L) => [
          `**${m(L.parameter)}**: ${cell(L.path)}${L.coupled ? ", a coupled limit" : ""}. Kind: ${cell(L.kind.charAt(0).toLowerCase() + L.kind.slice(1))}. Fixed: ${cell(L.fixed)}.`, "", dm(L.setup), "",
          ...L.orders.map((o) => `${o.n}. Order ${o.n}: ${m(o.equation)}${o.conditions.length ? `, ${o.conditions.map(m).join(", ")}` : ""}${o.particular && o.particular !== "0" ? `. Particular part ${m(o.particular)}` : ""}${o.solvability ? `. Solvability ${m(o.solvability)}: ${cell(o.solvabilityWhy)}` : ""}${o.matching ? `. Matching ${m(o.matching)}` : ""}${o.why ? `. ${cell(o.why)}` : ""}. Result ${m(o.result)}${o.checks ? `. ${status(o.checks.equation && o.checks.surface && o.checks.solvability ? "exact" : "unresolved")}: the result satisfies its equation, conditions and solvability condition` : ""}.`),
          "", ...(L.heatFlow ? [`Base heat flow: ${m(L.heatFlow)}.`] : []),
          `- Order and conditions: ${cell(L.orderLoss)}`,
          ...(L.inner ? [`- Inner region ${m(L.inner.variable)}: ${m(L.inner.equation)}, ${m(L.inner.solution)}; matching ${m(L.inner.matching)}. ${cell(L.inner.why)}`] : []),
          ...(L.residual ? [`- Residual of the truncated sum: ${m(L.residual.tex)}, ${cell(L.residual.order)}. ${status(L.residual.status)}.`] : []),
          ...(L.crossCheck ? [`- ${status("exact")}: ${cell(L.crossCheck.text)}`] : []),
          `- Error. Formal: ${cell(L.error.formal)} Estimated remainder: ${cell(L.error.estimated)} Proved bound: ${cell(L.error.proved ?? "none for this limit.")}`,
          `- Validity: ${cell(L.validity)}`, ""]),
          `**Overlap.** ${cell(an.asymptotic.overlap)}`, "", `**Gaps.** ${cell(an.asymptotic.gaps)}`].join("\n"),
        narration: `The asymptotic analysis takes ${n(an.asymptotic.limits.length, "limit", "limits")}. For each one it states the limit path, the equations and conditions of each order, the solvability conditions and any inner region with its matching. ${an.asymptotic.limits.some((L) => L.coupled) ? "Some limits need a coupled change of two parameters, and the frame says which. " : ""}It keeps a formal expansion, an estimated remainder and a proved bound apart.`,
      });
    }

    // Hand calculation 9: stability and bifurcation (src/stabreport.js).
    const stab = StabReport.frames(d);
    method.push(...stab.method);

    /* ---------- results ---------- */
    const results = [];
    if (rgOk) {
      const xy = rg.axes.y ? `${rg.axes.x.id} and ${rg.axes.y.id}` : rg.axes.x.id;
      results.push({
        title: `Regime map of ${rg.declaration.title}: ${rg.axes.y ? "a 2D slice" : "a 1D diagram"} in ${xy}`,
        body: [`Axes: ${m(rg.axes.x.tex)} from ${rg.axes.x.min} to ${rg.axes.x.max} (${rg.axes.x.log ? "logarithmic" : "linear"})${rg.axes.y ? `, ${m(rg.axes.y.tex)} from ${rg.axes.y.min} to ${rg.axes.y.max} (${rg.axes.y.log ? "logarithmic" : "linear"})` : ""}. The map has ${rg.grid.xs.length}${rg.axes.y ? ` × ${rg.grid.ys.length}` : ""} points. Tolerance ${rg.tolerance}.`, "",
          `Fixed: ${rg.fixed.length ? rg.fixed.map((x) => `${m(x.tex)} = ${x.value} (${x.source})`).join(", ") : "none"}. Derived at the inspected point: ${rg.derived.map((x) => `${m(x.tex)} = ${x.value}`).join(", ")}.`, "",
          "| Layer | Boundary type | Criterion | Status | Boundaries | Regions |", "| --- | --- | --- | --- | --- | --- |",
          ...rg.layers.map((l) => `| ${cell(l.title)} | ${l.boundary} | ${cell(l.criterion)} | ${STATUS[l.status]} | ${l.curves.length ? l.curves.map((c) => (rg.axes.y ? `${count(c.points.length, "point", "points")} with ${rg.axes.x.id} from ${Math.min(...c.points.map((q) => q[0]))} to ${Math.max(...c.points.map((q) => q[0]))}` : `${rg.axes.x.id} = ${c.points[0][0]}`)).join(", ") : "none"} | ${l.regions.map((r) => `${cell(r.label)}: ${r.intervals ? r.intervals.map((iv) => `${iv[0]} to ${iv[1]}`).join(", ") || "none" : count(r.count, "point", "points")}`).join(". ")}. |`), "",
          `**Unresolved:** ${rg.unresolved.count} points${rg.unresolved.reasons.length ? `: ${rg.unresolved.reasons.map((r) => `${r.count} because ${cell(r.reason)}`).join(" ")}` : ""}. No boundary crosses an unresolved point.`,
          `**No approximation meets the tolerance:** ${rg.gap.count} points${rg.gap.intervals ? ` (${rg.gap.intervals.map((iv) => `${iv[0]} to ${iv[1]}`).join(", ") || "none"})` : ""}.`,
          `**Intersections:** ${rg.intersections.length ? "" : "none."}`, ...rg.intersections.map((x) => `- ${cell(x.aLabel)} and ${cell(x.bLabel)} at (${x.x}, ${x.y}).`), "",
          "**Limit paths:**", ...rg.limits.map((L) => `- ${cell(L.label)}${L.coupled ? ", a coupled limit" : ""}. ${cell(L.note)}`), "",
          ...(rg.exactBoundaries ? ["", `**Exact boundaries at the tolerance ${rg.tolerance}:** ${Object.entries(rg.exactBoundaries).map(([k, v]) => `${k}: ${rg.axes.x.id} = ${v}`).join(", ")}. ${status("exact")}.`] : []),
          "", "Every boundary point of the map is in the page's table view and in the get_regime_map tool."].join("\n"),
        narration: `The map has ${n(rg.layers.reduce((sum, l) => sum + l.curves.length, 0), "boundary", "boundaries")} in ${n(rg.layers.length, "layer", "layers")}. ${rg.unresolved.count ? `It shows ${n(rg.unresolved.count, "unresolved point", "unresolved points")} and does not draw a boundary across them. ` : ""}${rg.gap.count ? "In part of the map no approximation meets the tolerance, so only the full solution is accurate there. " : ""}Each boundary states its type and its criterion.`,
      });
      const pt = rg.point;
      const det = pt.detail ?? {};
      results.push({
        title: `The inspected point: ${Object.entries(pt.p).filter(([k]) => rg.params.some((q) => q.id === k)).map(([k, v]) => `${k} = ${v}`).join(", ")}`,
        body: [pt.ok ? "" : `${status("unresolved")}: ${cell(pt.reason)}`,
          "| Layer | Value | Here |", "| --- | --- | --- |", ...pt.layers.map((l) => `| ${cell(l.title)} | ${l.value ?? "unresolved"} | ${l.kind === "approximation" ? (l.meets ? "meets the tolerance" : "does not meet it") : cell(l.region ?? "")} |`), "",
          `**Applicable reduced models:** ${pt.reduced.length ? pt.reduced.map((r) => `${cell(r.label)} ${m(r.tex)}`).join(", ") : "none: only the full solution is accurate here"}.`, "",
          ...(det.values ?? []).map((v) => `- ${m(v.tex)} = ${v.exact ?? v.value}: ${cell(v.label)}`),
          ...(det.checks ?? []).map((c) => `- ${status(c.passed ? c.status : "unresolved")}: ${cell(c.title)}. ${cell(c.detail)}`), "",
          "**Dimensional reconstruction.** The record's other variables keep their values. Temperatures are in K.", "",
          ...((det.reconstruction ?? []).length ? det.reconstruction.map((r) => `- ${m(r.tex)} = ${r.exact ?? r.value} ${cell(r.unit ?? "")}: ${cell(r.label)}`) : ["- The record has no values for this point."])].join("\n"),
        narration: pt.ok ? `At the inspected point, ${pt.reduced.length ? `${n(pt.reduced.length, "approximation meets", "approximations meet")} the tolerance` : "no approximation meets the tolerance"}. The frame gives the value of each layer, the checks at the point, and the dimensional values that the point means for this record.` : "The inspected point is unresolved, and the frame says why.",
      });
    }
    if (ndOk) {
      const params = nd.parameters.filter((p) => p.role === "parameter" && p.independent);
      const spokenParams = (ps) => {
        // A name that two parameters share is said once, with its count: "the two Biot numbers".
        const counts = new Map();
        for (const p of ps.filter((x) => x.names[0])) { const nm = p.names[0].name.split(",")[0]; counts.set(nm, (counts.get(nm) ?? 0) + 1); }
        const named = [...counts].map(([nm, k]) => (k === 1 ? `the ${nm}` : `the ${words(k)} ${nm.replace(/number$/, "numbers")}`));
        const unnamed = ps.filter((p) => !p.names[0]).length;
        const parts = [...named, ...(unnamed ? [unnamed === 1 ? "a group with no familiar name" : `${words(unnamed)} groups with no familiar name`] : [])];
        return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
      };
      const named = nd.parameters.filter((p) => p.role !== "output" && p.names.length);
      results.push({
        title: `Hand calculation 7: the dimensionless model, ${count(params.length, "independent parameter", "independent parameters")}`,
        body: [...nd.equations.filter((e) => !e.output).map((e) => `- ${e.id}: ${m(`${e.namedTex}${where(e)}`)}`),
          ...nd.equations.filter((e) => e.output).map((e) => `- ${e.id}, defines ${e.output}: ${m(`${e.namedTex}${where(e)}`)}`),
          "", named.length ? `The page proposes these names, each a ${STATUS.proposed.toLowerCase()} until the researcher confirms it: ${named.map((p) => `${m(`${p.names[0].tex}=${p.tex}`)} (${cell(p.names[0].name)}${p.confirmed === p.names[0].id ? `, ${STATUS.confirmed}` : ""})`).join(", ")}.` : "No group of the model has a familiar name."].join("\n"),
        narration: params.length ? `The dimensionless model has ${n(params.length, "independent parameter", "independent parameters")}. ${cap(spokenParams(params))} ${params.length > 1 ? "are the only physical inputs" : "is the only physical input"} left in the equations and conditions.`
          : "The dimensionless model has no parameter. Its solution is the same for every value of the physical parameters.",
      });
      const pi = nd.pi;
      results.push({
        title: "Parameters, fields, coordinates and the Pi basis",
        body: [
          "| Kind | Group | Names | Value | In |", "| --- | --- | --- | --- | --- |",
          ...nd.parameters.map((p) => `| ${p.role}${p.dependent ? `, dependent: ${cell(p.dependent)}` : ""} | ${m(p.tex)} | ${p.names.map((x) => `${m(x.tex)} ${cell(x.name)}`).join(", ") || "none"} | ${p.value ? cell(Model.valueText(p.value)) : "no values"} | ${cell(p.where.join(", "))} |`),
          "", `**Solution fields:** ${nd.fields.map((f) => m(`${f.tex}\\left(${f.of.join(",")}\\right)`)).join(", ") || "none"}. **Coordinates:** ${nd.coordinates.map((c) => m(c.tex)).join(", ") || "none"}. **Prescribed data:** ${nd.prescribed.length ? nd.prescribed.map((x) => `${m(x.tex)} in ${x.id}`).join(", ") : "none"}.`,
          "", pi ? `**Pi basis.** The Finder found ${pi.m} independent groups; the dimensionless model uses ${pi.rank} of them.` : "**Pi basis.** The Finder did not run on this version.",
          ...(pi ? pi.rows.map((r) => `- ${m(r.tex)} (${r.what}): ${r.inPi ? m(`=${r.comboTex}`) : cell(r.note ?? "")}`) : []),
          ...(pi && pi.absent.length ? ["", "Pi groups that the model does not use:", "", ...pi.absent.map((a) => `- ${m(a.tex)}: ${cell(a.why)}`), "", cell(pi.absentWhy)] : []),
          "", "**Where each physical parameter enters:**", "",
          ...nd.enters.map((e) => `- ${cell(e.label)}: ${e.hidden ? "**does not enter the dimensionless model**" : cell(e.where.join(", "))}`),
        ].join("\n"),
        narration: `The parameters stay apart from the dimensionless fields and coordinates. ${pi ? `${pi.rank === pi.m ? `The model uses all ${words(pi.m)} Pi groups.` : `The model uses ${words(pi.rank)} of the ${words(pi.m)} Pi groups. ${pi.m - pi.rank === 1 ? "The other one does not appear" : "The others do not appear"} in the model, and the frame says why.`}` : "The Finder did not run, so the frame has no comparison."} ${nd.enters.every((e) => !e.hidden) ? "Every physical parameter enters a scale, a coefficient or a condition." : "A physical parameter does not enter the dimensionless model, and the frame names it."}`,
      });
    }
    if (ok) {
      results.push({
        title: `${count(f.m, "group", "groups")}: the repeating-variable basis`,
        body: f.groups.map((g, i) => {
          const names = g.names.map((nm) => `${m(nm.tex)} (${cell(nm.name)}, ${g.confirmed === nm.id ? STATUS.confirmed : STATUS.proposed})`).join(" or ");
          return `- ${m(`\\Pi_{${i + 1}}=${g.tex}`)}${names ? `: matches ${names}` : ": no familiar name"}${g.meaning ? `. Meaning kept: ${g.meaning}` : ""}${g.absolute.length ? `. Uses the absolute temperatures ${g.absolute.join(", ")}: values in K` : ""}.`;
        }).join("\n"),
        narration: `The repeating-variable basis has ${n(f.m, "group", "groups")}. ${spokenList(spokenGroups(f.groups, it.variables, f.repeating.ids))} A recognized name is a proposed interpretation until the researcher confirms it.`,
      });
      if (f.familiar) {
        results.push({
          title: `An equivalent familiar basis: ${f.familiar.groups.map(Model.groupLabel).join(", ")}`,
          body: [...f.familiar.groups.map((g) => `- ${m(g.names[0] ? `${g.names[0].tex}=${g.tex}` : g.tex)}${g.fixed ? `, fixed by ${g.fixed}` : ""}${g.names[0] ? `. ${cell(g.names[0].reference)}` : ""}`),
            "", `Each familiar group is a product of powers of the repeating-variable groups. The columns of ${m("T")} give the exponents:`, "",
            dm(`T=${f.familiar.Ttex},\\qquad \\det T=${f.familiar.det}`),
            "", ...f.familiar.relations.map((rl) => `- ${m(`${rl.group}=${rl.combo || "1"}`)}`)].join("\n"),
          narration: f.familiar.named ? `An equivalent basis uses familiar groups. ${spokenList(spokenGroups(f.familiar.groups, it.variables))} The determinant of the exponent matrix is not zero. Thus each group of one basis is a product of powers of the groups of the other basis.`
            : "No group has a familiar name, so the familiar basis is the repeating-variable basis.",
        });
      }
      results.push({
        title: "The dimensionless relation and what it still needs",
        body: [f.correlation.relation ? dm(f.correlation.relation) : "No quantity of interest.", "",
          f.constraints.items.length ? `Relations between Pi variables: ${f.constraints.items.map((c) => `${c.id} (${c.tex ? m(c.tex) : cell(c.text)})${c.monomial ? ` fixes ${m(`${c.group}=${c.value}`)}` : ", not a power law, so it counts as one relation"}`).join(". ")}. The ${f.constraints.algebraic} groups are algebraically independent, but only ${f.constraints.free} of them can vary.` : "The model states no relation between the Pi variables.",
          "", "Before a physical correlation, the researcher must supply:", "",
          "- data or a solved model for the function f over the range of each group",
          `- the geometry and the definition of each reference length${it.geometry.domain ? ` (now: ${cell(it.geometry.domain)})` : ""}`,
          `- the statement that the quantity of interest is a local or a mean value${obs?.average ? ` (now: ${obs.average})` : ""}`,
          `- the type of boundary condition, such as wall temperature or wall heat flux${it.conditions.length ? "" : " (the model has no conditions)"}`,
          "- the reference temperature of the properties, and all further physics that adds variables",
          "", "Buckingham Pi analysis does not determine this correlation."].join("\n"),
        narration: "The group that contains the quantity of interest is a function of the other groups. Buckingham Pi analysis does not give that function. Data or a solved model must supply it, with the geometry, the conditions and the reference temperature of the properties.",
      });
      const values = d.results.find((r) => r.id === "r-values");
      if (values) results.push({ title: "Group values from the entered values", body: [resultLine(values), ...d.results.filter((r) => r.id === "r-values-float").map(resultLine)].join("\n"), narration: "The entered values give a value for each group whose variables all have values. The arithmetic is exact." });
    }
    results.push(...stab.results);
    const unresolved = d.results.filter((r) => r.status === "unresolved");
    results.push({
      title: unresolved.length ? `${count(unresolved.length, "unresolved result", "unresolved results")}` : "No unresolved result",
      body: unresolved.length ? unresolved.map(resultLine).join("\n") : "The Finder ran every requested calculation.",
      narration: unresolved.length ? `The report keeps ${n(unresolved.length, "unresolved result", "unresolved results")} visible. ${unresolved.length === 1 ? "It names" : "Each one names"} the failed check, or the later piece of the build plan that adds the calculation.` : "The Finder ran every requested calculation.",
    });

    /* ---------- checks and takeaway ---------- */
    const checks = [];
    if (ok) {
      checks.push({
        title: "Hand calculation 5: dimensional cancellation and independence",
        body: [...f.groups.map((g) => dm(g.cancelTex)), "", ...f.checks.map((c) => `- ${status(c.status)}: ${c.passed ? "passed" : "FAILED"}. ${cell(c.title)}: ${cell(c.detail)}`)].join("\n"),
        narration: `Every group is dimensionless, and ${f.checks.every((c) => c.passed) ? `all ${words(f.checks.length)} exact checks pass` : `not all ${words(f.checks.length)} exact checks pass`}. These checks use exact arithmetic, not a floating-point comparison.`,
      });
    }
    if (ndOk) {
      checks.push({
        title: "Reverse substitution and the checks of the Nondimensionalizer",
        body: nd.checks.map((c) => `- ${status(c.status)}: ${c.passed ? "passed" : "FAILED"}. ${cell(c.title)}: ${cell(c.detail)}`).join("\n"),
        narration: `${nd.checks.every((c) => c.passed) ? `All ${words(nd.checks.length)} exact checks of the Nondimensionalizer pass.` : `Not all ${words(nd.checks.length)} exact checks of the Nondimensionalizer pass.`} ${nd.checks.find((c) => c.id === "x-nd-reverse")?.passed ? "The reverse substitution gives back each dimensional equation and condition." : "The reverse substitution does not give back every dimensional form, and the frame names the failed check."}${nd.checks.find((c) => c.id === "x-nd-coefficients")?.passed ? " Each coefficient is dimensionless." : ""}`,
      });
    }
    if (rgOk) {
      const acc = rg.acceptance;
      const anchor = rg.declaration.id === "slab-convection";
      checks.push({
        title: `Acceptance checks of the declared model${anchor ? " and anchor test 1" : ""}`,
        body: [...acc.map((c) => `- ${status(c.passed ? c.status : "unresolved")}: ${c.passed ? "passed" : "FAILED"}. ${cell(c.title)}. ${cell(c.detail)}${c.tolerance ? ` Tolerance ${c.tolerance}.` : ""}`),
          ...(anchor ? ["", "**Anchor test 1, transient slab conduction (section 11):**", "",
            `- Hand derivation: hand calculations 6 and 7 above, with the reverse substitution. ${status(nd && nd.ready ? "exact" : "unresolved")}.`,
            `- Dimensionless conditions: ${rg.match.conditions.map((c) => m(`${c.tex}\\ \\text{at}\\ ${c.atTex}`)).join(", ")}. ${status("exact")}.`,
            `- Reference temperature solution: the series of modes against mpmath within 10^-9. ${status(acc.every((c) => c.passed) ? "numerical" : "unresolved")}.`,
            `- Approximation error map: the regime map above, with ${rg.layers.filter((l) => l.kind === "approximation").length} approximations at the tolerance ${rg.tolerance}. ${status("numerical")}.`] : [])].join("\n"),
        narration: `${acc.every((c) => c.passed) ? `All ${words(acc.length)} acceptance checks of the declared model pass on this record.` : "Some acceptance checks of the declared model fail, and the frame names them."}${anchor ? " Anchor test one has its four required results: the hand derivation, the dimensionless conditions, the reference temperature solution and the approximation error map." : ""}`,
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
      ? `${f.n} Pi variables, rank ${f.r}: ${f.m} independent groups.${f.constraints.items.length ? ` A relation fixes ${f.m - f.constraints.free}, so ${f.constraints.free} can vary.` : ""} ${f.correlation.relation ? `${m(f.correlation.relation)}.` : ""} Buckingham Pi analysis does not give the function f.`
      : d.confirmedVersion === null ? "Confirm the interpretation to run the Finder. The checks before analysis already ran." : `The Finder is blocked. ${cell(it.issues.find((i) => (f?.blockedBy ?? []).includes(i.id))?.next ?? "")}`;
    const indep = ndOk ? nd.parameters.filter((p) => p.role === "parameter" && p.independent) : [];
    const ndKey = ndOk ? ` The dimensionless model has ${count(indep.length, "independent parameter", "independent parameters")}${indep.length ? `: ${indep.map((p) => m(p.names[0] ? `${p.names[0].tex}=${p.tex}` : p.tex)).join(", ")}` : ""}${nd.checks.every((c) => c.passed) ? ", and the reverse substitution recovers every equation and condition." : "."}` : "";
    const rgKey = rgOk ? ` For the declared model, ${rg.point.reduced.length ? `${rg.point.reduced.map((r) => r.label.toLowerCase()).join(", ")} ${rg.point.reduced.length > 1 ? "meet" : "meets"}` : "no approximation meets"} the tolerance ${rg.tolerance} at the inspected point.` : "";
    checks.push({
      title: "Takeaway",
      key: `${key}${ndKey}${rgKey}`,
      narration: ok ? `The Pi variables give ${n(f.m, "algebraically independent group", "algebraically independent groups")}. ${f.constraints.items.length ? `A relation fixes some of them, so only ${words(f.constraints.free)} can vary. ` : ""}The group that contains the quantity of interest is a function of the other groups. Data or a solved model must supply that function.`
        : "The Finder did not run on this version. The report names the reason and the next action.",
    });

    return {
      meta: { title: TITLE, subtitle: `${d.title}: model version ${d.version}${d.confirmed ? "" : " (not confirmed)"}`, voice: "bf_emma" },
      narration: `This report comes from the Dimensionless Number Finder, the Model Nondimensionalizer, the Regime Map Builder and the stability and bifurcation analysis, for model version ${d.version}. The algebra is exact, and each numerical result states its tolerance.`,
      setup, method, results, checks,
    };
  }

  return { TITLE, report, resultLine };
});
