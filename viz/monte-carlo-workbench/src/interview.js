/* Monte Carlo Probability Workbench: the guided interview, the third entry point. The rule graph is data
 * (data/interview.json, in the catalogue): questions that the page asks when earlier answers make them relevant,
 * candidates over the whole agreed catalogue, and rules from answers to candidates. A rule supports or excludes
 * candidates with a weight, records an unresolved assumption, or returns "insufficient evidence"; each rule states
 * its reason and whether a theorem or a modelling assumption gives it. evaluate() reads the answers, the rules the
 * reader switched off and the candidate the reader picked, and returns plain data: the evidence, the status, the
 * ranked candidates with their reasons, competing explanations, rejection tests and sampling methods, the
 * unresolved assumptions and the rule path. build() writes a candidate as model text and reads it with the
 * editor's parser, so the interview makes the same model record as the editor.
 */
/** @param {any} root the global object @param {(D: any, En: any, X: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCDsl ?? require("./dsl.js"), root.MCEngine ?? require("./engine.js"), root.MCExpr ?? require("./expr.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCInterview = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./dsl.js")} */ D, /** @type {typeof import("./engine.js")} */ En, /** @type {typeof import("./expr.js")} */ X) {
  "use strict";

  /** The least score of a candidate with strong support. */
  const STRONG = 2;
  /** Evidence names in the order the model text declares them. */
  const EVIDENCE = ["m", "sd", "lim", "c"];

  /** @typedef {Record<string, string[]>} Conj */
  /** @param {Conj | Conj[] | null | undefined} w @returns {Conj[]} */
  const conjs = (w) => (w ? (Array.isArray(w) ? w : [w]) : []);
  /** True when one conjunction of the condition holds: each named question has one of the listed values. @param {Conj | Conj[] | null} w @param {Record<string, string>} v */
  const holds = (w, v) => !w || conjs(w).some((c) => Object.entries(c).every(([q, opts]) => opts.includes(v[q] ?? "-")));

  /**
   * Read the answer text of the state, such as "k=cnt;g=evt;m=4.2", into answers and evidence. Unknown names,
   * unknown options and values that are not numbers in their range give notices and are left out.
   * @param {string} text @param {any} spec the interview data
   */
  function parse(text, spec) {
    /** @type {Record<string, string>} */
    const answers = {};
    /** @type {Record<string, number>} */
    const evidence = {};
    /** @type {string[]} */
    const notices = [];
    for (const part of String(text ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
      const m = /^([a-z]+)=(.+)$/.exec(part);
      const q = m ? spec.questions.find((/** @type {any} */ x) => x.id === m[1]) : null;
      const e = m ? spec.evidence.find((/** @type {any} */ x) => x.id === m[1]) : null;
      if (q && m) {
        if (m[2] === "?" || q.options.some((/** @type {any} */ o) => o.id === m[2])) answers[q.id] = m[2];
        else notices.push(`The interview answer "${part.slice(0, 30)}" names no option of that question.`);
      } else if (e && m) {
        const v = Number(m[2]);
        if (Number.isFinite(v) && v >= e.min && v <= e.max && (!e.integer || Number.isInteger(v)) && !(e.id === "sd" && v <= 0)) evidence[e.id] = v;
        else notices.push(`The value "${part.slice(0, 30)}" is not a valid ${e.label.toLowerCase()}.`);
      } else notices.push(`"${part.slice(0, 30)}" is not an answer of the interview.`);
    }
    return { answers, evidence, notices };
  }

  /**
   * The values of all questions for these answers: the option id or "?" (asked, not answered or not known), or
   * "-" (not asked, because an earlier answer makes it irrelevant). Questions are asked in data order.
   * @param {any} spec @param {Record<string, string>} answers
   */
  function values(spec, answers) {
    /** @type {Record<string, string>} */
    const v = {};
    for (const q of spec.questions) v[q.id] = holds(q.ask, v) ? answers[q.id] ?? "?" : "-";
    return v;
  }

  /**
   * The answer text in its canonical form: questions, then evidence, in data order, without answers to questions
   * that are not asked and without evidence fields that are not asked.
   * @param {any} spec @param {Record<string, string>} answers @param {Record<string, number>} evidence
   */
  function format(spec, answers, evidence) {
    const v = values(spec, answers), out = [];
    for (const q of spec.questions) if (v[q.id] !== "-" && answers[q.id] !== undefined) out.push(`${q.id}=${answers[q.id]}`);
    for (const e of spec.evidence) if (evidence[e.id] !== undefined && holds(e.ask, v)) out.push(`${e.id}=${+evidence[e.id].toPrecision(8)}`);
    return out.join(";");
  }

  /** The candidates that a target of a rule names, inside the pool or among the components. @param {string} t @param {any[]} pool @param {any[]} comps */
  function resolve(t, pool, comps) {
    const m = /^(!?)tail:([a-z]+)$/.exec(t);
    if (m) return pool.filter((c) => c.tails && (m[1] ? !c.tails.includes(m[2]) : c.tails.includes(m[2])));
    if (t === "continuous") return pool.filter((c) => c.discrete === false);
    return [...pool, ...comps].filter((c) => c.id === t);
  }

  /** The name of a candidate inside a sentence: lower case, except a name that starts with a person's name. @param {any} c */
  const prose = (c) => (/^(Bernoulli|Poisson|Zipf|Erlang|Dirichlet|Student|F$|Laplace|Weibull|Gompertz|Pareto|Burr|Fréchet|Cauchy|Lévy|Gumbel|Gaussian|Clayton|Frank|Ornstein|Hawkes|Brownian)/.test(c.name) ? c.name : c.name[0].toLowerCase() + c.name.slice(1));

  /** The template of a candidate for a kind of value: its own, or the one of byKind for the kind or for "*". @param {any} c @param {string} kind */
  const templateOf = (c, kind) => (c.template?.byKind ? c.template.byKind[kind] ?? c.template.byKind["*"] : c.template) ?? null;

  /** Is a candidate a law with a template for the model text, from a group on this page? @param {any} c @param {Set<number>} here */
  const available = (c, here) => c.role === "law" && !!c.template && here.has(c.group);

  /**
   * Evaluate the interview. Input: the answer text, the rules switched off (comma-separated ids) and the picked
   * candidate id. Returns plain data.
   * @param {any} data the catalogue, with data.interview and data.groups
   * @param {{ iv?: string, off?: string, pick?: string }} input
   */
  function evaluate(data, input) {
    const spec = data.interview;
    const { answers, evidence, notices } = parse(input.iv ?? "", spec);
    const v = values(spec, answers);
    const ruleIds = new Set(spec.rules.map((/** @type {any} */ r) => r.id));
    const offList = String(input.off ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const id of offList) if (!ruleIds.has(id)) notices.push(`"${id.slice(0, 20)}" names no rule of the rule graph.`);
    const off = new Set(offList.filter((id) => ruleIds.has(id)));
    const here = new Set(data.groups.filter((/** @type {any} */ g) => g.status === "here").map((/** @type {any} */ g) => g.piece));
    const order = new Map(spec.candidates.map((/** @type {any} */ c, /** @type {number} */ i) => [c.id, i]));
    const kind = v.k;
    const laws = spec.candidates.filter((/** @type {any} */ c) => c.role === "law");
    const pool = kind === "?" ? laws : laws.filter((/** @type {any} */ c) => c.kinds.includes(kind));
    const comps = spec.candidates.filter((/** @type {any} */ c) => c.role === "component");
    /** @type {Map<string, number>} */
    const score = new Map([...pool, ...comps].map((c) => [c.id, 0]));
    /** @type {Map<string, { rule: string, delta: number }[]>} */
    const why = new Map([...pool, ...comps].map((c) => [c.id, []]));
    const q = (/** @type {string} */ id) => spec.questions.find((/** @type {any} */ x) => x.id === id);
    const optLabel = (/** @type {string} */ id, /** @type {string} */ val) => (val === "?" ? (answers[id] === "?" ? "I do not know" : "not answered") : q(id).options.find((/** @type {any} */ o) => o.id === val)?.label ?? val);

    /** @type {any[]} */
    const path = [];
    /** @type {{ rule: string, reason: string }[]} */
    const insufficient = [];
    /** @type {{ from: string, text: string }[]} */
    const assumptions = [];
    const describe = (/** @type {any} */ r) => (r.when === "weak" ? [] : Object.entries(conjs(r.when).find((c) => Object.entries(c).every(([qq, opts]) => opts.includes(v[qq] ?? "-"))) ?? {})
      .map(([qq]) => ({ question: qq, text: q(qq).text, short: q(qq).short, value: v[qq], label: optLabel(qq, v[qq]) })));
    for (const r of spec.rules) {
      if (r.when === "weak" || !holds(r.when, v)) continue;
      /** @type {{ id: string, name: string, delta: number }[]} */
      const targets = [];
      if (r.effect === "for" || r.effect === "against") {
        const seen = new Set();
        for (const t of r.targets) for (const c of resolve(t, pool, comps)) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          targets.push({ id: c.id, name: c.name, delta: r.effect === "for" ? r.weight : -r.weight });
        }
        if (!targets.length) continue;
      }
      const isOff = off.has(r.id);
      path.push({ id: r.id, effect: r.effect, weight: r.weight ?? null, basis: r.basis, source: r.source, reason: r.reason, when: describe(r), targets, off: isOff });
      if (isOff) continue;
      for (const t of targets) {
        score.set(t.id, /** @type {number} */ (score.get(t.id)) + t.delta);
        /** @type {any[]} */ (why.get(t.id)).push({ rule: r.id, delta: t.delta });
      }
      if (r.effect === "insufficient") insufficient.push({ rule: r.id, reason: r.reason });
      if (r.effect === "assume") assumptions.push({ from: r.id, text: r.reason });
    }
    const ranked = [...pool].sort((a, b) => /** @type {number} */ (score.get(b.id)) - /** @type {number} */ (score.get(a.id)) || /** @type {number} */ (order.get(a.id)) - /** @type {number} */ (order.get(b.id)));
    const best = ranked.length ? /** @type {number} */ (score.get(ranked[0].id)) : 0;
    const weak = spec.rules.find((/** @type {any} */ r) => r.when === "weak");
    if (weak && kind !== "?" && best < STRONG) {
      const isOff = off.has(weak.id);
      path.push({ id: weak.id, effect: weak.effect, weight: null, basis: weak.basis, source: weak.source, reason: weak.reason, when: [], targets: [], off: isOff });
      if (!isOff) insufficient.push({ rule: weak.id, reason: weak.reason });
    }
    const open = spec.questions.filter((/** @type {any} */ qq) => v[qq.id] === "?").map((/** @type {any} */ qq) => ({ from: `question:${qq.id}`, text: `${answers[qq.id] === "?" ? "Not known" : "Not answered"}: ${qq.text}` }));
    assumptions.unshift(...open);

    const status = insufficient.length ? "insufficient" : "candidates";
    const top = status === "candidates" && ranked.length ? ranked[0].id : null;
    const tie = top ? ranked.filter((c) => score.get(c.id) === best).map((c) => c.id) : [];
    let chosen = top, picked = false;
    if (input.pick) {
      if (pool.some((/** @type {any} */ c) => c.id === input.pick)) { chosen = input.pick; picked = input.pick !== top; }
      else notices.push(`The picked candidate "${String(input.pick).slice(0, 30)}" is not a law for this kind of value.`);
    }
    const name = (/** @type {string} */ id) => spec.candidates.find((/** @type {any} */ c) => c.id === id)?.name ?? id;
    /** @param {any} c @param {number} i */
    const card = (c, i) => ({
      id: c.id, name: c.name, prose: prose(c), role: c.role, kind: c.kind ?? "law", law: c.law, group: c.group, groupHere: here.has(c.group), available: available(c, here), example: c.example ?? null,
      rank: i + 1, score: score.get(c.id), supported: /** @type {number} */ (score.get(c.id)) > 0, excluded: /** @type {number} */ (score.get(c.id)) < 0,
      rules: why.get(c.id), reasons: /** @type {any[]} */ (why.get(c.id)).map((x) => {
        const r = spec.rules.find((/** @type {any} */ y) => y.id === x.rule);
        return { rule: r.id, delta: x.delta, basis: r.basis, source: r.source, text: r.reason };
      }),
      competing: c.competing.map((/** @type {any} */ x) => ({ id: x.id, name: name(x.id), text: x.text, score: score.get(x.id) ?? null, inPool: score.has(x.id) })),
      tests: c.tests, methods: c.methods ?? null, path: c.path,
    });
    const candidates = ranked.map(card);
    const components = [...comps].sort((a, b) => /** @type {number} */ (score.get(b.id)) - /** @type {number} */ (score.get(a.id)) || /** @type {number} */ (order.get(a.id)) - /** @type {number} */ (order.get(b.id)))
      .filter((c) => /** @type {number} */ (score.get(c.id)) > 0).map(card);
    const kq = q("k");
    return {
      status, insufficient, notices, assumptions, path, tie, top, chosen, picked,
      answers: spec.questions.filter((/** @type {any} */ x) => v[x.id] !== "-").map((/** @type {any} */ x) => ({ id: x.id, topic: x.topic, text: x.text, short: x.short, value: v[x.id], label: optLabel(x.id, v[x.id]), answered: answers[x.id] !== undefined && answers[x.id] !== "?" })),
      evidence: spec.evidence.filter((/** @type {any} */ e) => holds(e.ask, v)).map((/** @type {any} */ e) => ({ id: e.id, label: e.label, value: evidence[e.id] ?? null })),
      pool: { kind, label: kind === "?" ? "every law of the catalogue" : kq.options.find((/** @type {any} */ o) => o.id === kind).label, noun: kind === "?" ? "quantity" : kq.options.find((/** @type {any} */ o) => o.id === kind).noun, size: pool.length },
      candidates, components, off: [...off],
      canonical: format(spec, answers, evidence),
    };
  }

  /** The value of an expression of named numbers. @param {string} src @param {Record<string, number>} env */
  function valueOf(src, env) {
    const names = Object.keys(env), slots = new Map(names.map((n, i) => [n, i]));
    const v = X.build(src, slots).fn(names.map((n) => env[n]));
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${src} is not a finite number.`);
    return v;
  }
  /** A number for the model text: at most 8 significant digits. @param {number} v */
  const num = (v) => String(+v.toPrecision(8));

  const LABELS = /** @type {Record<string, string>} */ ({ m: "mean", sd: "standard deviation", lim: "upper limit n", c: "threshold of the decision" });

  /**
   * Write one candidate of an evaluation as model text, then read it with the editor's parser and check it with the
   * engine. Returns { ok, text, record, errors, moments, methods, illustrative }. A candidate whose law is not in the
   * code of this page, or evidence that does not fit the law, gives ok: false with the reason.
   * @param {any} data the catalogue @param {any} result an evaluation @param {string} [id] the candidate, by default the chosen one
   */
  function build(data, result, id = result.chosen) {
    const spec = data.interview;
    const c = spec.candidates.find((/** @type {any} */ x) => x.id === id);
    if (!c) return { ok: false, errors: [id ? `"${String(id).slice(0, 30)}" is not a candidate.` : "The interview has no candidate to write as a model."] };
    const here = new Set(data.groups.filter((/** @type {any} */ g) => g.status === "here").map((/** @type {any} */ g) => g.piece));
    if (!available(c, here)) return { ok: false, errors: [c.role === "law" ? `The ${prose(c)} law comes in group ${c.group}, which is not on this page yet. Choose a candidate from this page, or write the model in the editor.` : `The ${prose(c)} is a model component of group ${c.group}. The model record of this page cannot hold it yet.`] };
    const t = templateOf(c, result.pool.kind);
    if (!t) return { ok: false, errors: [`The ${prose(c)} law has no model template for a ${result.pool.noun}. Write the model in the editor.`] };
    const law = t.law ?? c.law;
    /** @type {Record<string, number>} */
    const given = {};
    for (const e of result.evidence) if (e.value !== null) given[e.id] = e.value;
    const quantities = t.quantities ?? (result.answers.find((/** @type {any} */ a) => a.id === "q")?.value === "avg"
      ? ["mean average = X \"mean value\"", "prob exceed = X > c \"probability above the threshold c\""]
      : ["prob exceed = X > c \"probability above the threshold c\"", "mean average = X \"mean value\""]);
    const needC = t.quantities ? t.quantities.some((/** @type {string} */ s) => /\bc\b/.test(s)) : true;
    const uses = [...EVIDENCE.filter((n) => t.uses.includes(n)), ...(needC ? ["c"] : [])];
    /** @type {Record<string, number>} */
    const env = {};
    /** @type {string[]} */
    const illustrative = [];
    /** @type {string[]} */
    const errors = [];
    const lines = [];
    for (const n of uses) {
      let v;
      try {
        if (given[n] !== undefined) v = given[n];
        else { v = valueOf(n === "c" ? t.c : t.defaults[n], env); illustrative.push(n); }
      } catch (e) {
        errors.push(`The ${LABELS[n]} has no value: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      if (n === "lim") v = Math.round(v);
      env[n] = v;
      lines.push(`param ${n} = ${num(v)} "${LABELS[n]}${given[n] !== undefined ? ", from the interview" : ": an illustrative value, because the interview has none"}"`);
    }
    if (errors.length) return { ok: false, errors };
    for (const r of t.requires ?? []) {
      let met = false;
      try { met = valueOf(`if(${r.expr}, 1, 0)`, env) === 1; } catch { met = false; }
      if (!met) errors.push(`The evidence does not fit the ${prose(c)} law. ${r.text}`);
    }
    if (errors.length) return { ok: false, errors };
    for (const [n, expr, note] of t.extra ?? []) lines.push(`param ${n} = ${expr} "${note}"`);
    const args = Object.entries(t.args).map(([k, e]) => `${k} = ${e}`).join(", ");
    const noun = result.pool.noun;
    const mech = result.answers.find((/** @type {any} */ a) => ["g", "gt", "gs", "gp", "ge", "gm"].includes(a.id) && a.answered);
    const unknown = result.answers.filter((/** @type {any} */ a) => a.value === "?").map((/** @type {any} */ a) => a.short);
    const problem = [
      `From the guided interview: one value is a ${noun}.`,
      mech ? `Mechanism: ${mech.label[0].toLowerCase()}${mech.label.slice(1).replace(/[.]$/, "")}.` : "",
      result.status === "insufficient" ? `The interview returned insufficient evidence, and the reader chose the ${prose(c)} law.` : result.picked ? `The rule graph ranks the ${result.candidates[0].prose} law first, but the reader chose the ${prose(c)} law.` : `The rule graph ranks the ${prose(c)} law first.`,
      unknown.length ? `Unresolved: ${unknown.join(", ")}.` : "",
    ].filter(Boolean).join(" ");
    const text = [`title: Interview: the ${prose(c)} law for the ${noun}`, `problem: ${problem}`, ...lines,
      `X ~ ${law}(${args}) "candidate from the guided interview"`, ...quantities,
      `focus ${t.focus ?? "X"}`].join("\n") + "\n";
    const parsed = D.parse(text, "custom");
    if (parsed.errors.length) return { ok: false, text, errors: parsed.errors };
    const compiled = En.prepare(parsed.record, { seed: 1, method: "independent", overrides: {} });
    if (!compiled.ok) return { ok: false, text, errors: compiled.errors.map((/** @type {string} */ e) => `The evidence does not fit the ${prose(c)} law. ${e}`) };
    const node = compiled.nodes.find((/** @type {any} */ n) => n.type === "var" && n.name === "X");
    const p = En.argsAt(node, compiled.alternatives[0].values).params;
    const mo = node.law.moments?.(p) ?? {};
    const fin = (/** @type {any} */ x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
    /** @param {any} s */
    const show = (s) => ("unavailable" in s ? { label: "Not available", exactness: s.unavailable } : { label: s.label, exactness: s.exactness });
    return {
      ok: true, text, record: parsed.record, errors: [], illustrative, params: p,
      moments: { mean: fin(mo.mean), variance: fin(mo.variance), component: node.law.dim ? 1 : null },
      methods: { independent: show(node.law.reference(p)), inverse: show(node.law.inverse(p)), rejection: show(node.law.rejection(p, 1)) },
    };
  }

  return { STRONG, parse, values, format, evaluate, build, templateOf, prose };
});
