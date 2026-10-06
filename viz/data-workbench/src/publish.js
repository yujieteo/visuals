/* Universal Data Workbench: publication figures in the full-size view.
 *
 * The settings hold for every figure of the page: the preset (General, Nature or Science), the width and height in
 * millimetres, the PNG resolution, whether the title and caption sit in the artwork or in the legend beside it, and
 * the font: Liberation Sans 2.1.5, bundled beside the page and read on first use, or the person's own TrueType or
 * OpenType files, which never leave the device. The open chart is drawn by them (src/figure.js, src/render.js);
 * its SVG, PDF and PNG are written at once (src/fonts.js, src/pdf.js, src/png.js), read back and checked, and each
 * download is the file that was checked. A file the page cannot write says why.
 */
(function (root, factory) {
  root.DWPublish = factory(root.DWFigure, root.DWFonts, root.DWPdf, root.DWPng, root.DWRender);
})(typeof self !== "undefined" ? self : this, function (Figure, Fonts, Pdf, Png, Render) {
  "use strict";

  const STATUS = { pass: "Pass", fail: "Fails", unverified: "Unverified", "n/a": "Does not apply" };

  /**
   * Mount the publication figures. `app` gives h(), note(), message() and refresh().
   * @param {any} app
   */
  function mount(app) {
    const { h } = app;
    const state = {
      settings: Figure.settingsOf({}),
      /** @type {any} the font set in use; null until the bundled font is read */
      fonts: null,
      /** @type {any} the bundled set, kept when the person loads their own */
      bundled: null,
      /** @type {Promise<any> | null} */
      loading: null,
      fontError: "",
      ownNote: "",
      /** @type {{ key: string, files: Record<string, any> } | null} the written files of the figure shown */
      written: null,
      turn: 0,
    };

    /* ---------- fonts ---------- */

    const bytesOf = async (response, name) => {
      if (!response.ok) throw new Error(`${name} could not be read (HTTP ${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    };

    /** Make faces usable by the page's SVG and canvas under the family the figure names. */
    async function register(set) {
      for (const f of [set.regular, set.bold].filter(Boolean)) {
        const ff = new FontFace(set.name, f.bytes, { weight: f === set.bold ? "700" : "400" });
        document.fonts.add(await ff.load());
      }
      if (!set.bold) {
        const ff = new FontFace(set.name, set.regular.bytes, { weight: "700" });
        document.fonts.add(await ff.load());
      }
    }

    /** The bundled font, read once from the files beside the page. */
    function ready() {
      if (state.fonts) return Promise.resolve(state.fonts);
      if (!state.loading) {
        state.loading = (async () => {
          const fontkit = /** @type {any} */ (window).fontkit;
          const [regular, bold] = await Promise.all([
            fetch("vendor/liberation-fonts/LiberationSans-Regular.ttf").then((r) => bytesOf(r, "Liberation Sans Regular")),
            fetch("vendor/liberation-fonts/LiberationSans-Bold.ttf").then((r) => bytesOf(r, "Liberation Sans Bold")),
          ]);
          const set = Fonts.set(Fonts.face(fontkit, regular, "LiberationSans-Regular.ttf"), Fonts.face(fontkit, bold, "LiberationSans-Bold.ttf"), "bundled");
          await register(set);
          state.bundled = set;
          state.fonts = state.fonts ?? set;
          return state.fonts;
        })().catch((error) => {
          state.fontError = `The bundled font could not be read, so the figure is drawn with Helvetica's widths and no file can be written: ${app.message(error)}`;
          state.loading = null;
          return null;
        });
      }
      return state.loading;
    }

    /** Use the person's own font files: one regular face, and a bold one when a file's weight is 600 or more. */
    async function useOwn(files, redraw) {
      const fontkit = /** @type {any} */ (window).fontkit;
      try {
        const faces = [];
        for (const file of files) faces.push(Fonts.face(fontkit, new Uint8Array(await file.arrayBuffer()), file.name));
        if (!faces.length) return;
        const regular = faces.find((f) => !f.bold) ?? faces[0];
        const bold = faces.find((f) => f.bold && f !== regular) ?? null;
        const set = Fonts.set(regular, bold, "own");
        await register(set);
        state.fonts = set;
        state.ownNote = `${set.name}: ${[regular, bold].filter(Boolean).map((f) => `${f.file} (${f.bold ? "bold" : "regular"}, ${f.outlines} outlines)`).join(", ")}${bold ? "" : "; no bold face, so bold text is set in the regular one"}.`;
        app.note({ kind: "publication", text: `Publication figures use your font ${set.name} (${faces.map((f) => f.file).join(", ")}); the files stay on this device.` });
      } catch (error) {
        state.ownNote = `Not used: ${app.message(error)}`;
      }
      redraw();
    }

    /* ---------- drawing ---------- */

    /** The chart drawn by the settings: at its final size, in the preset's style and the font's widths. */
    async function draw(spec, data) {
      const fonts = await ready();
      const sized = Figure.sized(spec, state.settings);
      const drawn = Render.render(sized, data, Figure.styleOf(state.settings, fonts ? { family: fonts.family, measure: fonts.measure } : {}));
      return { ...drawn, spec: sized };
    }

    const fontInfo = () => (state.fonts ? { name: state.fonts.name, kind: state.fonts.kind, bold: !!state.fonts.bold } : { name: "Helvetica's widths (no font file)", kind: "none", bold: true });

    /** Write the figure's three files, read each back, and keep them for the downloads. */
    async function writeFiles(drawn, key) {
      const files = {};
      const fonts = state.fonts;
      if (!fonts) {
        for (const f of ["svg", "pdf", "png"]) files[f] = { error: state.fontError || "The font is not read yet." };
        return files;
      }
      const P = /** @type {any} */ (window).PDFLib, fontkit = /** @type {any} */ (window).fontkit;
      try {
        const text = await Fonts.svgFile(drawn.svg, drawn.scene, fonts);
        files.svg = { ...Fonts.readSvg(text), blob: new Blob([text], { type: "image/svg+xml" }) };
      } catch (error) { files.svg = { error: `The SVG could not be written: ${app.message(error)}` }; }
      try {
        const bytes = await Pdf.write(P, fontkit, drawn.scene, fonts, { title: drawn.spec.annotation.title, subject: drawn.desc });
        files.pdf = { ...(await Pdf.read(P, bytes)), blob: new Blob([bytes], { type: "application/pdf" }) };
      } catch (error) { files.pdf = { error: `The PDF could not be written: ${app.message(error)}` }; }
      try {
        const size = Png.pixels(drawn.scene.width, drawn.scene.height, state.settings.dpi);
        if (!size.ok) throw new Error(size.reason);
        await document.fonts.load(`10px '${fonts.name}'`);
        await document.fonts.load(`bold 10px '${fonts.name}'`);
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("this browser gives no 2D canvas");
        Png.draw(ctx, drawn.scene, state.settings.dpi, fonts.family);
        const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("the browser could not encode the canvas"))), "image/png"));
        canvas.width = 0;
        const bytes = Png.withDpi(new Uint8Array(await blob.arrayBuffer()), state.settings.dpi);
        files.png = { ...Png.read(bytes), blob: new Blob([bytes], { type: "image/png" }) };
      } catch (error) { files.png = { error: `The PNG could not be written: ${app.message(error)}` }; }
      state.written = { key, files };
      return files;
    }

    /* ---------- the panel ---------- */

    function setSettings(change, redraw) {
      const before = state.settings;
      const next = change.preset && change.preset !== before.preset ? Figure.settingsOf({ preset: change.preset }) : Figure.settingsOf({ ...before, ...change });
      state.settings = next;
      if (next.preset !== before.preset) app.note({ kind: "publication", text: `Publication preset: ${Figure.PRESETS[next.preset].name} (${next.width ? `${next.width} mm wide` : "each chart's own width"}, ${next.dpi} dpi PNG).` });
      redraw();
    }

    const statusBadge = (status) => h("span", { class: `badge status-${status === "n/a" ? "na" : status}`, text: STATUS[status] });

    function checkList(checks, label) {
      return h("ul", { class: "checks", "aria-label": label }, checks.map((c) => h("li", { "data-check": c.id, "data-status": c.status },
        statusBadge(c.status), " ", h("strong", { text: `${c.label}: ` }), c.detail,
        c.rule ? h("span", { class: "note rule" }, ` Rule: ${c.rule.text}${c.rule.status === "workbench" ? " (the workbench's own rule)" : ""}; `,
          c.rule.source.url.startsWith("http") ? h("a", { href: c.rule.source.url, rel: "noopener", text: c.rule.source.title }) : c.rule.source.title,
          c.rule.source.read ? `, read ${c.rule.source.read}.` : ", not read.") : null)));
    }

    /**
     * Draw the publication panel of the chart open full size.
     * @param {HTMLElement} el @param {{ spec: any, drawn: any, name: string, redraw: () => void }} o
     */
    function panel(el, o) {
      const s = state.settings;
      const p = Figure.PRESETS[s.preset];
      const id = (x) => `pub-${x}`;
      const field = (key, label, control, note) => h("div", { class: "field" }, h("label", { for: id(key), text: label }), control, note ? h("p", { class: "note", text: note }) : null);
      const num = (key, value, min, max, placeholder) => h("input", { id: id(key), name: key, type: "number", min: String(min), max: String(max), step: "any", value: value ?? "", placeholder,
        onchange: (ev) => setSettings({ [key]: ev.target.value === "" ? null : Number(ev.target.value) }, o.redraw) });
      const size = Figure.sizeOf(o.spec, s);
      const settings = h("form", { class: "edit publish-settings", onsubmit: (ev) => ev.preventDefault() },
        h("fieldset", { class: "edit-group" }, h("legend", { text: "Preset" }),
          Object.values(Figure.PRESETS).map((x) => h("label", { class: "choice" },
            h("input", { type: "radio", name: "preset", value: x.id, checked: x.id === s.preset, onchange: () => setSettings({ preset: x.id }, o.redraw) }),
            h("span", {}, h("strong", { text: x.name }), h("span", { class: "note", text: x.id === "general" ? ": the workbench's rules" : x.id === "nature" ? ": Nature's figure guide, read 2026-10-06" : ": every rule unverified until its instructions are read" }))))),
        h("fieldset", { class: "edit-group" }, h("legend", { text: "Size and resolution" }),
          field("width", `Width (mm)${p.widths ? `: Nature prints ${p.widths.join(" or ")} mm` : ""}`, num("width", s.width, 40, 500, String(o.spec.layout.width)), s.width === null ? `Empty: each chart's own width, ${o.spec.layout.width} mm here.` : null),
          p.widths ? h("p", { class: "actions" }, p.widths.map((w) => h("button", { type: "button", "aria-pressed": String(s.width === w), onclick: () => setSettings({ width: w }, o.redraw), text: `${w} mm (${w === p.widths[0] ? "one column" : "two columns"})` }))) : null,
          field("height", `Height (mm)${p.maxHeight ? `: at most ${p.maxHeight}` : ""}`, num("height", s.height, 30, 500, String(size.height)), s.height === null ? `Empty: the chart's proportions, ${size.height} mm here.` : null),
          field("dpi", "PNG resolution (dpi)", num("dpi", s.dpi, 72, 1200, String(p.dpi)), `${Png.pixels(size.width, size.height, s.dpi).width} × ${Png.pixels(size.width, size.height, s.dpi).height} px for this chart.`)),
        h("fieldset", { class: "edit-group" }, h("legend", { text: "Text" }),
          h("label", { class: "choice" }, h("input", { type: "checkbox", name: "inFigure", checked: s.inFigure, onchange: (ev) => setSettings({ inFigure: ev.target.checked }, o.redraw) }), " Title and caption in the figure (otherwise in the legend below it)"),
          h("label", { class: "choice" }, h("input", { type: "radio", name: "font", value: "bundled", checked: state.fonts?.kind !== "own", onchange: () => { if (state.bundled) { state.fonts = state.bundled; o.redraw(); } } }), " Liberation Sans 2.1.5, bundled: Arial's widths, SIL Open Font License"),
          h("label", { class: "choice" }, h("input", { type: "radio", name: "font", value: "own", checked: state.fonts?.kind === "own", disabled: state.fonts?.kind !== "own" }), " Your font", state.fonts?.kind === "own" ? `: ${state.fonts.name}` : ""),
          h("div", { class: "field" }, h("label", { for: id("font-files"), text: "Load your font files (TTF or OTF; a regular and a bold face)" }),
            h("input", { id: id("font-files"), type: "file", accept: ".ttf,.otf,font/ttf,font/otf", multiple: true, onchange: (ev) => { useOwn([...ev.target.files], o.redraw); ev.target.value = ""; } }),
            state.ownNote ? h("p", { class: "note", text: state.ownNote }) : h("p", { class: "note", text: "Your files stay on this device; the PDF and SVG embed the subset the figure uses." }))),
        h("p", { class: "note", text: "These settings hold for every chart of the page." }));

      const result = Figure.check(o.drawn, { spec: o.drawn.spec, settings: s, font: fontInfo(), files: null });
      const legend = !s.inFigure ? h("div", { class: "legend-text" }, h("p", { class: "label", text: "Figure legend (outside the artwork)" }), h("p", {}, h("strong", { text: `${o.drawn.legend.title}. ` }), o.drawn.legend.caption)) : null;
      const filesBox = h("div", { class: "pub-files", "aria-live": "polite" }, h("p", { class: "note", text: "Writing the SVG, PDF and PNG and reading them back…" }));
      const sources = h("details", { class: "pub-sources" }, h("summary", { text: `Rules of the ${p.name} preset and their sources` }),
        p.journal ? h("p", { class: "note", text: `Journal: ${p.journal}. Stage: ${p.stage}.` }) : h("p", { class: "note", text: p.stage }),
        h("ul", {}, Figure.rulesOf(s.preset).map((r) => h("li", { "data-rule": r.id }, h("span", { class: `badge status-${r.status === "verified" ? "pass" : r.status === "unverified" ? "unverified" : "na"}`, text: r.status === "verified" ? "Verified" : r.status === "unverified" ? "Unverified" : "Workbench rule" }), " ",
          `${r.text}. `, h("span", { class: "note" }, r.url.startsWith("http") ? h("a", { href: r.url, rel: "noopener", text: r.sourceTitle }) : r.sourceTitle, r.read ? `, read ${r.read}.` : `. ${r.note}`)))),
        h("p", { class: "note", text: "Verified: read in its source on that date. Unverified: not read, so no check that rests on it can pass. Workbench rule: the workbench's own, not a journal's." }));
      el.replaceChildren(
        h("h3", { id: "viewer-publish-title", text: "Publication figure" }),
        h("p", { class: `verdict status-${result.verdict.status}`, "data-verdict": result.verdict.status, text: `The figure: ${result.verdict.text}` }),
        legend, settings,
        h("h4", { text: `Checks at the final size, ${size.width} × ${size.height} mm` }),
        checkList(result.checks, "Checks of the figure"),
        h("h4", { text: "Files" }), filesBox, sources);
      if (state.fontError) el.insertBefore(h("p", { class: "warn-text", role: "alert", text: state.fontError }), el.children[1]);

      // The files: written once a figure and settings, checked, then offered for download.
      const key = JSON.stringify([o.name, s, state.fonts?.name ?? "", o.drawn.svg.length, o.drawn.scene.items.length]);
      const turn = ++state.turn;
      const done = (files) => {
        if (turn !== state.turn) return;
        const r = Figure.check(o.drawn, { spec: o.drawn.spec, settings: s, font: fontInfo(), files });
        filesBox.replaceChildren(...["pdf", "svg", "png"].map((format) => {
          const f = r.files[format], file = files[format];
          const name = `${o.name}-${s.preset}.${format}`;
          return h("section", { class: "pub-file", "data-file": format, "data-file-status": f.verdict.status, "aria-label": format.toUpperCase() },
            h("p", { class: "actions" },
              h("button", { type: "button", class: format === "pdf" ? "primary" : "", disabled: !file?.blob, "data-download": format,
                onclick: () => save(file.blob, name), text: `Download ${format.toUpperCase()}` }),
              h("span", { class: `verdict status-${f.verdict.status}`, text: ` ${file?.blob ? `${(file.blob.size / 1024).toFixed(1)} KB. ` : ""}${f.verdict.text}` })),
            h("details", {}, h("summary", { text: `${format.toUpperCase()} checks` }), checkList(f.checks, `Checks of the ${format.toUpperCase()} file`)));
        }));
      };
      if (state.written?.key === key) done(state.written.files);
      else writeFiles(o.drawn, key).then(done);
    }

    function save(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      app.note({ kind: "publication", text: `Saved ${name}.` });
      app.refresh();
    }

    /** The settings and the preset's sources, for the snapshot (the record and get_state). */
    function summary() {
      const s = state.settings, p = Figure.PRESETS[s.preset];
      return { preset: p.name, journal: p.journal, stage: p.stage, width: s.width, height: s.height, dpi: s.dpi, titleAndCaptionInFigure: s.inFigure, font: fontInfo().name,
        rules: Figure.rulesOf(s.preset).map((r) => ({ rule: r.text, status: r.status, source: r.url, read: r.read })) };
    }

    return { draw, panel, ready, summary, settings: () => state.settings };
  }

  return { mount };
});
