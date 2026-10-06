/* Universal Data Workbench: the fonts of the publication figures, and the SVG file with its font inside.
 *
 * The bundled font is Liberation Sans 2.1.5 (vendor/liberation-fonts, SIL Open Font License 1.1), Regular and
 * Bold, an Arial-metric font: its widths are Arial's, which are Helvetica's. The person may load their own TrueType
 * or OpenType files instead, such as Arial; a file whose weight is 600 or more is the bold face. fontkit reads each
 * file; the widths below are the sums of the glyphs' advance widths, with no kerning or ligatures, which is how
 * src/pdf.js sets text, so a label measured here takes the same room in every file.
 *
 * svgFile() adds the subset of each face that the figure's text uses to the SVG, as an @font-face, so the file
 * holds its font; readSvg() reads a written file back for the checks.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWFonts = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PT = 25.4 / 72;
  const FALLBACK = "Arimo, Arial, Helvetica, sans-serif";

  /**
   * One face read by fontkit.
   * @param {any} fontkit @param {Uint8Array} bytes @param {string} [file] the file name, for messages
   */
  function face(fontkit, bytes, file = "") {
    let font;
    try {
      font = fontkit.create(bytes);
    } catch (error) {
      throw new Error(`${file || "The file"} is not a font fontkit can read: ${String(/** @type {any} */ (error)?.message ?? error).slice(0, 120)}`);
    }
    if (font.fonts) throw new Error(`${file || "The file"} is a font collection; load one face of it.`);
    const weight = font["OS/2"]?.usWeightClass ?? 400;
    const outlines = font.directory?.tables?.glyf ? "TrueType" : font.directory?.tables?.["CFF "] ? "CFF" : "unknown";
    return { font, bytes, file, family: String(font.familyName ?? "Unnamed"), full: String(font.fullName ?? font.familyName ?? ""), postscript: String(font.postscriptName ?? ""), weight, bold: weight >= 600, outlines, unitsPerEm: font.unitsPerEm };
  }

  /** The advance width of a text in thousandths of the font size: glyphs one by one, unknown characters as .notdef. */
  function advance(f, text) {
    let w = 0;
    for (const ch of String(text)) w += f.font.glyphForCodePoint(ch.codePointAt(0) ?? 0).advanceWidth;
    return (w * 1000) / f.unitsPerEm;
  }

  /** Characters of a text the face has no glyph for. */
  function missing(f, text) {
    return [...new Set([...String(text)].filter((ch) => ch.trim() && f.font.glyphForCodePoint(ch.codePointAt(0) ?? 0).id === 0))];
  }

  /**
   * A font set: the regular face and, when there is one, the bold face; its name, the CSS family the SVG names and
   * measure(text, pt, bold) in millimetres for src/render.js.
   * @param {any} regular a face() @param {any} bold a face() or null @param {"bundled" | "own"} kind
   */
  function set(regular, bold, kind) {
    const family = regular.family;
    return {
      kind, regular, bold, name: family, bundled: kind === "bundled",
      family: `'${family.replace(/'/g, "")}', ${kind === "bundled" ? FALLBACK : `'Liberation Sans', ${FALLBACK}`}`,
      measure: (text, pt, isBold = false) => ((advance(isBold && bold ? bold : regular, text) / 1000) * pt * PT),
      faceOf: (isBold) => (isBold && bold ? bold : regular),
    };
  }

  /** The subset of a face holding the glyphs of a text, as font file bytes (TrueType outlines stay TrueType). */
  function subset(f, text) {
    const sub = f.font.createSubset();
    for (const ch of new Set(String(text))) sub.includeGlyph(f.font.glyphForCodePoint(ch.codePointAt(0) ?? 0));
    return new Promise((resolve, reject) => {
      /** @type {Uint8Array[]} */
      const parts = [];
      sub.encodeStream().on("data", (/** @type {Uint8Array} */ d) => parts.push(d)).on("end", () => {
        const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
        let at = 0;
        for (const p of parts) { out.set(p, at); at += p.length; }
        resolve(out);
      }).on("error", reject);
    });
  }

  function base64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
  }

  /**
   * The SVG file of a figure: the drawn SVG with the subsets of the faces its text uses in an @font-face, under the
   * family the text names, so the file holds its font. Only CFF-outlined faces go in as OpenType.
   * @param {string} svg Render.render's svg @param {any} scene its scene @param {any} fonts a set()
   */
  async function svgFile(svg, scene, fonts) {
    const texts = scene.items.filter((/** @type {any} */ it) => it.t === "text");
    /** @type {Map<any, string>} each face and the characters it sets */
    const chars = new Map();
    for (const it of texts) {
      const f = fonts.faceOf(it.weight === "bold");
      chars.set(f, (chars.get(f) ?? "") + it.text);
    }
    const rules = [];
    for (const [f, used] of chars) {
      const bytes = await subset(f, used);
      const type = f.outlines === "CFF" ? ["font/otf", "opentype"] : ["font/ttf", "truetype"];
      const src = `src:url(data:${type[0]};base64,${base64(bytes)}) format('${type[1]}')`;
      // Without a bold face, bold text is set in the regular one, as in the PDF.
      const weights = f === fonts.bold ? [700] : fonts.bold ? [400] : [400, 700];
      for (const w of weights) rules.push(`@font-face{font-family:'${fonts.name.replace(/'/g, "")}';font-weight:${w};${src}}`);
    }
    if (!rules.length) return svg;
    const style = `<defs><style>${rules.join("")}</style></defs>`;
    return svg.replace(/(<desc[^>]*>[\s\S]*?<\/desc>)/, `$1\n${style}`);
  }

  /** What a written SVG holds: its size in millimetres, its text elements, its embedded fonts and the family named. */
  function readSvg(text) {
    const root = /<svg\b[^>]*>/.exec(text)?.[0] ?? "";
    const mm = (name) => Number(new RegExp(`\\b${name}="([\\d.]+)mm"`).exec(root)?.[1] ?? NaN);
    return {
      width: mm("width"), height: mm("height"),
      texts: (text.match(/<text\b/g) ?? []).length,
      fontFaces: (text.match(/@font-face\{/g) ?? []).length,
      family: (/font-family="([^"]*)"/.exec(text)?.[1] ?? "").replace(/&#39;|&quot;|'/g, "").split(",")[0].trim(),
      bytes: new TextEncoder().encode(text).length,
    };
  }

  return { face, set, advance, missing, subset, svgFile, readSvg };
});
