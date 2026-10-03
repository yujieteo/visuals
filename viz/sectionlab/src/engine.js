/* Sectionlab engine entry point: validate a model and compute every result.
 *
 *   compute(input, { accuracy, plastic }) → { model, props, torsion, plastic, parts }
 *   buildBeamdswitch(result)              → the report for the standard beamdswitch template, with the
 *                                           hand calculations as the last Results slides
 *   buildHandMarkdown(result)             → the hand calculations as a Markdown document beamdswitch opens
 *
 * `accuracy` is reference/torsion-accuracy.json (the page inlines it). Invalid
 * models throw section.ModelError; a plastic analysis that cannot be completed
 * is reported as { error } so the elastic results still show.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./geometry.js"), require("./shapes.js"), require("./section.js"), require("./torsion.js"), require("./plastic.js"), require("./yaml.js"), require("./report.js"), require("./handcalc.js"));
  } else {
    const L = root.SectionLab;
    Object.assign(L, factory(L.geometry, L.shapes, L.section, L.torsion, L.plastic, L.yaml, L.report, L.handcalc));
  }
})(typeof self !== "undefined" ? self : this, function (geometry, shapes, section, torsion, plastic, yaml, report, handcalc) {
  "use strict";

  function compute(input, { accuracy = null, plastic: withPlastic = true, strips, points } = {}) {
    const model = section.normalize(input);
    const assembled = section.assemble(model);
    const props = section.properties(model, assembled);
    const tors = torsion.torsion(model, accuracy);
    let pl = null;
    if (withPlastic) {
      try { pl = plastic.analyse(model, assembled, props, { strips, points }); } catch (e) { if (e instanceof RangeError) pl = { error: e.message }; else throw e; }
    }
    const fills = new Map(model.materials.map((m, i) => [m.id, i]));
    const parts = assembled.parts.map((q) => ({ id: q.part.id, void: q.part.void, contours: q.contours, fillIndex: fills.get(q.material.id) }));
    return { model, props, torsion: tors, plastic: pl, parts };
  }

  const buildReport = (result) => report.build(result.model, { props: result.props, torsion: result.torsion, plastic: result.plastic, parts: result.parts });
  /* The shared template's sections are fixed, so the hand calculations close the Results section. */
  function buildBeamdswitch(result) {
    const rep = report.beamdswitch(buildReport(result), result.model, { shapes: shapes.SHAPES });
    return { ...rep, meta: { ...rep.meta, voice: handcalc.VOICE }, results: [...rep.results, ...handcalc.deckFrames(result)] };
  }
  const buildHandMarkdown = (result) => handcalc.markdown(result);

  return { geometry, shapes, section, torsion, plastic, yaml, report, handcalc, compute, buildReport, buildBeamdswitch, buildHandMarkdown, VERSION: "1.0.0" };
});
