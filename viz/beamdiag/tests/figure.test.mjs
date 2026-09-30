import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { page } from "./page-harness.mjs";

const value = (p, name) => String(p.document.querySelector(`[data-field="${name}"]`).value);
const texts = (node, out = []) => {
  if (node.tag === "text") out.push(node);
  for (const c of node.children || []) texts(c, out);
  return out;
};
const svgOf = (p) => p.document.getElementById("plots").children[0];
/* Most checks read values in kN and m; the unit convention's own test covers the others. */
const kNm = async () => { const p = await page(); p.choose("units", "kN-m"); return p; };

test("measuring x from mid-span changes only the positions typed and shown, never the solution", async () => {
  const left = await kNm(), mid = await kNm();
  mid.choose("origin", "mid");
  for (const p of [left, mid]) p.buttons[0].dispatch("click"); // a point force at mid-span
  assert.deepEqual(await mid.current(), await left.current());

  // Existing entries are converted: ends at ∓L/2, the new load at 0.
  assert.deepEqual(["supports.0.x", "supports.1.x", "loads.0.x1", "loads.0.x2", "loads.1.x"].map((f) => value(mid, f)), ["-3", "3", "-3", "3", "0"]);
  assert.deepEqual(["supports.0.x", "supports.1.x", "loads.1.x"].map((f) => value(left, f)), ["0", "6", "3"]);

  // The same physical position typed in either convention gives the identical beam and results.
  left.field("loads.1.x", 4.2);
  mid.field("loads.1.x", 1.2);
  left.field("supports.1.x", 5.1);
  mid.field("supports.1.x", 2.1);
  const a = await left.current(), b = await mid.current();
  assert.equal(b.model.loads[1].x, 4.2);
  assert.equal(b.model.supports[1].x, 5.1);
  assert.deepEqual(b, a);

  // Results are listed in the chosen convention.
  mid.choose("preset", "pin-pin-udl");
  assert.equal(mid.document.getElementById("table").children[0].children[0].textContent, "−3.000");
  const stats = mid.document.getElementById("stats").children.map((li) => li.children[1].textContent);
  assert.ok(stats.includes("largest moment (sagging), at x = 0 m"), stats.join(" | "));
  assert.match(mid.document.getElementById("reactions").children[0].children[1].textContent, /^Pin at −3 m: /);

  // Changing the length keeps the ends at the ends and everything else where it was typed.
  mid.buttons[0].dispatch("click");
  mid.input("length", "");
  mid.input("length", 8);
  const beam = (await mid.current()).model;
  assert.deepEqual(beam.supports.map((s) => s.x), [0, 8]);
  assert.deepEqual([beam.loads[0].x1, beam.loads[0].x2, beam.loads[1].x], [0, 8, 4]);
  assert.deepEqual(["supports.0.x", "supports.1.x", "loads.1.x"].map((f) => value(mid, f)), ["-4", "4", "0"]);

  // Solver messages quote positions in the chosen convention.
  mid.field("supports.1.x", 5);
  mid.field("supports.0.kind", "pin", "change");
  assert.equal(mid.document.getElementById("error").children[1].textContent, "Support 2 position must lie on the beam, between −4 m and 4 m.");

  // Switching back shows the model's own positions again.
  mid.field("supports.1.x", 4);
  mid.choose("origin", "left");
  assert.deepEqual(["supports.0.x", "supports.1.x", "loads.1.x"].map((f) => value(mid, f)), ["0", "8", "4"]);
});

test("typing a length one keystroke at a time keeps loads where they were typed and the ends at the ends", async () => {
  for (const [origin, typedAt, x] of [["mid", -0.5, 4.5], ["mid", 0.5, 5.5], ["left", 1, 1]]) {
    const p = await kNm();
    p.choose("origin", origin);
    p.buttons[0].dispatch("click");
    p.field("loads.1.x", typedAt);
    p.type("length", 1, 10);
    const beam = (await p.current()).model;
    assert.equal(beam.length, 10);
    assert.deepEqual(beam.supports.map((s) => s.x), [0, 10], origin);
    assert.deepEqual([beam.loads[0].x1, beam.loads[0].x2], [0, 10], origin);
    assert.equal(beam.loads[1].x, x, `${origin} ${typedAt}`);
    assert.equal(value(p, "loads.1.x"), String(typedAt));
  }
});

test("every diagram has labelled x and y axes with arrowheads, ticked in the chosen convention", async () => {
  const p = await kNm();
  for (const origin of ["left", "mid"]) {
    p.choose("origin", origin);
    const svg = svgOf(p), labels = texts(svg).map((t) => t.textContent);
    assert.equal(labels.filter((t) => t === "x (m)").length, 4, "beam, shear, moment and deflection each have an x axis");
    assert.equal(labels.filter((t) => t === "y").length, 1);
    for (const title of ["SHEAR FORCE V (kN)", "BENDING MOMENT M (kN·m) · SAGGING +", "DEFLECTION v (m)"]) assert.ok(labels.includes(title), title);
    const arrows = (node, out = []) => { if (node.tag === "path" && /^rotate\(90 /.test(node.attrs.transform || "")) out.push(node); for (const c of node.children || []) arrows(c, out); return out; };
    assert.equal(arrows(svg).length, 4);
    const beam = svg.children.flatMap((g) => g.children || []).find((e) => e.tag === "rect" && e.attrs.fill === "var(--surface)");
    const tick = (label) => texts(svg).filter((t) => t.attrs.class === "tick" && t.attrs["text-anchor"] === "middle" && t.textContent === label).map((t) => t.attrs.x);
    const ends = origin === "mid" ? ["−3", "3"] : ["0", "6"];
    assert.equal(tick(ends[0]).length, 4);
    for (const x of tick(ends[0])) assert.equal(x, beam.attrs.x);
    for (const x of tick(ends[1])) assert.ok(Math.abs(x - beam.attrs.x - beam.attrs.width) < 1e-9);
    for (const x of tick(origin === "mid" ? "0" : "3")) assert.ok(Math.abs(x - beam.attrs.x - beam.attrs.width / 2) < 1e-9);
  }
});

const REQUIRED = ["SHEAR FORCE V (kN)", "BENDING MOMENT M (kN·m) · SAGGING +", "DEFLECTION v (m)", "x (m)", "Beam diagram results",
  "Units SI: kN, m, kPa.", "Length L = 6 m; x runs from 0 m to 6 m", "Support 1: pin at x = 0 m", "Load 1: distributed −10 kN/m from x = 0 m to 6 m",
  "Section: Solid rectangle b × h", "Width b = 0.1 m, Depth h = 0.2 m", "Material: Structural steel, E = 2×10⁸ kPa, ν = 0.3",
  "30 kN: largest shear, at x = 0 m", "45 kN·m: largest moment (sagging), at x = 3 m", "−0.01266 m: largest deflection, at x = 3 m (L/474)",
  "67500 kPa: peak bending stress |M|·c / I", "Pin at 6 m: 30.00 kN", "VALUES AT SUPPORTS AND LOADS", "left end, pin support, distributed load starts"];

test("the figure saves as a self-contained SVG and PNG with the diagrams and every result", async () => {
  const p = await kNm();
  p.choose("image-format", "svg");
  assert.equal(await p.save("save-image"), "Saved beamdiag.svg.");
  const svg = p.saved[0];
  assert.equal(svg.name, "beamdiag.svg");
  assert.equal(svg.blob.type, "image/svg+xml");
  const text = await svg.blob.text();
  assert.match(text, /^<\?xml [^>]*\?>\n<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  for (const s of REQUIRED) assert.ok(text.includes(s.replace(/&/g, "&amp;")), s);
  // Nothing the file would have to fetch, and no page styles it would lose.
  assert.doesNotMatch(text.replace('xmlns="http://www.w3.org/2000/svg"', ""), /https?:|href|url\(|var\(--|tabindex|aria-/);

  p.choose("image-format", "png");
  assert.equal(await p.save("save-image"), "Saved beamdiag.png.");
  const png = p.saved[1];
  assert.equal(png.name, "beamdiag.png");
  assert.equal(png.blob.type, "image/png");
  const [canvas] = p.canvases, [drawn] = canvas.drawn;
  assert.equal(canvas.width, 1920, "drawn at twice the figure's width");
  assert.ok(drawn.src.startsWith("data:image/svg+xml;charset=utf-8,"), "drawn from inline data, not a URL");
  assert.equal(decodeURIComponent(drawn.src.slice(drawn.src.indexOf(",") + 1)), text);
});

test("the PDF is one page holding the figure as a lossless image", async () => {
  const p = await kNm();
  p.choose("origin", "mid");
  assert.equal(await p.save("save-pdf"), "Saved beamdiag.pdf.");
  const { name, blob } = p.saved[0];
  assert.equal(name, "beamdiag.pdf");
  assert.equal(blob.type, "application/pdf");
  const bytes = Buffer.from(await blob.arrayBuffer()), pdf = bytes.toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4\n") && pdf.endsWith("%%EOF\n"));
  const xref = Number(pdf.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.ok(pdf.startsWith("xref\n0 7\n", xref));
  [...pdf.slice(xref).matchAll(/(\d{10}) 00000 n /g)].forEach((m, i) => assert.ok(pdf.startsWith(`${i + 1} 0 obj\n`, Number(m[1])), `object ${i + 1} offset`));

  const { width, height } = p.canvases[0];
  const image = pdf.match(/<< \/Type \/XObject \/Subtype \/Image \/Width (\d+) \/Height (\d+) \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/);
  assert.deepEqual([Number(image[1]), Number(image[2])], [width, height]);
  const start = image.index + image[0].length, pixels = inflateSync(bytes.subarray(start, start + Number(image[3])));
  assert.equal(pixels.length, width * height * 3);
  const [, pw, ph] = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/).map(Number);
  assert.ok(Math.abs(pw / ph - width / height) < 2e-3, "page has the figure's proportions");

  assert.match(pdf, /\/Resources << \/XObject << \/Im1 4 0 R >> >> \/Contents 5 0 R >>/);
  assert.match(pdf, /\/Root 1 0 R \/Info 6 0 R >>/);

  const content = pdf.match(/5 0 obj\n<< \/Length (\d+) >>\nstream\n/);
  assert.equal(pdf.substr(content.index + content[0].length, Number(content[1])), `q ${pw} 0 0 ${ph} 0 0 cm /Im1 Do Q\n`, "the page draws the image and nothing else");
});

test("nothing is saved while the beam cannot be solved", async () => {
  const p = await kNm();
  p.field("supports.1.x", 9);
  assert.equal(await p.save("save-pdf"), "Fix the beam first: there is no solution to save.");
  assert.equal(await p.save("save-image"), "Fix the beam first: there is no solution to save.");
  assert.deepEqual(p.saved, []);
});

test("axes, titles and saved files follow the unit convention", async () => {
  const p = await page(); // N, mm, MPa by default
  p.choose("origin", "mid");
  let labels = texts(svgOf(p)).map((t) => t.textContent);
  assert.equal(labels.filter((t) => t === "x (mm)").length, 4);
  for (const title of ["SHEAR FORCE V (N)", "BENDING MOMENT M (N·mm) · SAGGING +", "DEFLECTION v (mm)"]) assert.ok(labels.includes(title), title);
  for (const tick of ["−3000", "0", "3000"]) assert.ok(labels.includes(tick), tick);
  assert.deepEqual(["supports.0.x", "supports.1.x"].map((f) => value(p, f)), ["-3000", "3000"]);
  p.field("supports.1.x", 2000);
  assert.equal((await p.current()).model.supports[1].x, 5);
  p.field("supports.1.x", 3000);

  p.choose("units", "lbf-in");
  labels = texts(svgOf(p)).map((t) => t.textContent);
  assert.ok(labels.includes("x (in)") && labels.includes("SHEAR FORCE V (lbf)"));
  p.choose("image-format", "svg");
  assert.equal(await p.save("save-image"), "Saved beamdiag.svg.");
  const svg = await p.saved[0].blob.text();
  for (const s of ["Units US customary: lbf, in, psi.", "x runs from −118.1 in to 118.1 in", "E = 2.901e+7 psi", "M x⁻ (lbf·in)", "θ (rad)"]) assert.ok(svg.includes(s) || svg.includes(s.replace("2.901e+7", "2.901×10⁷")), s);
});
