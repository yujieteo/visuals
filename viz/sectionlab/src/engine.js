/* Sectionlab engine entry point: validate a model and compute every result.
 *
 *   compute(input, { accuracy, plastic }) → { model, props, torsion, plastic, parts }
 *
 * `accuracy` is reference/torsion-accuracy.json (the page inlines it). Invalid
 * models throw section.ModelError; a plastic analysis that cannot be completed
 * is reported as { error } so the elastic results still show.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./geometry.js"), require("./shapes.js"), require("./section.js"), require("./torsion.js"), require("./plastic.js"), require("./yaml.js"), require("./report.js"));
  } else {
    const L = root.SectionLab;
    Object.assign(L, factory(L.geometry, L.shapes, L.section, L.torsion, L.plastic, L.yaml, L.report));
  }
})(typeof self !== "undefined" ? self : this, function (geometry, shapes, section, torsion, plastic, yaml, report) {
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

  return { geometry, shapes, section, torsion, plastic, yaml, report, compute, buildReport, VERSION: "1.0.0" };
});
