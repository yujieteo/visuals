/* Universal Data Workbench: the "Limits" section (step 7). The published limits (limits.json, embedded by build.py):
 * the desktop benchmark at 1 million rows by 50 columns, and what each tested device completed with "Measure this
 * device", emulated phones labelled as emulated; then the button that measures this device (src/measure.js), with
 * its result shown, copied as Markdown and saved as JSON.
 */
(function (root, factory) {
  root.DWLimits = factory(root.DWMeasure, root.DWPreflight);
})(typeof self !== "undefined" ? self : this, function (Measure, Preflight) {
  "use strict";

  /** @param {any} app the page's shared helpers: store, h, byId, busy, progress, refresh, ensureEngine, note, message, the engine's error tests, device, budget, data */
  function mount(app) {
    const { store, h, byId } = app;
    const L = app.data.limits ?? { devices: [], benchmark: [] };
    /** @type {any} */
    let result = null;
    const secs = Measure.secs;
    const rowsText = (n) => (n ? `${n.toLocaleString("en-US")} rows` : "none");

    /** The device as this browser reports it: no data, nothing that names the person. */
    function device() {
      const d = app.device;
      const coarse = matchMedia("(pointer: coarse)").matches;
      const screenText = `${screen.width} × ${screen.height} screen${coarse ? ", touch" : ""}`;
      const kind = d.kind === "desktop" ? "a desktop" : d.kind === "phone" ? "a phone" : "a device of unknown class";
      return { label: `${kind} (${screenText})`, kind: d.kind, userAgent: navigator.userAgent, deviceMemoryGiB: /** @type {any} */ (navigator).deviceMemory ?? null,
        cores: navigator.hardwareConcurrency ?? null, screen: [screen.width, screen.height], pixelRatio: devicePixelRatio, coarsePointer: coarse, budgetBasis: d.basis };
    }

    function measure() {
      if (store.tables.length || store.busy) return Promise.resolve();
      return app.busy("Measuring this device", async () => {
        app.progress("Starting the engine", 0, 0);
        let api;
        try { api = await app.ensureEngine(); } catch { return; }
        result = await Measure.run({ query: api.query, register: (name, bytes) => api.registerBytes(name, bytes) }, {
          budget: app.budget(), device: device(), engine: { duckdb: api.version, duckdbWasm: app.data.engine.duckdbWasm },
          stopped: () => store.stop, cancelled: app.cancelled, outOfMemory: app.outOfMemory, progress: app.progress,
        });
        app.note({ kind: "measured", table: "", text: `Measured this device: the largest table it completed is ${rowsText(result.largest)} of the planted example; stopped: ${result.stopped}.` });
      });
    }

    function save() {
      if (!result) return;
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(result, null, 2)}\n`], { type: "application/json" }));
      const a = h("a", { href: url, download: `data-workbench-device-${result.measured.slice(0, 10)}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    async function copy() {
      if (!result) return;
      const status = byId("measure-status");
      try {
        await navigator.clipboard.writeText(Measure.markdown(result));
        status.textContent = "Copied the result as Markdown.";
      } catch {
        status.textContent = "This browser did not allow copying; save the result as JSON instead.";
      }
    }

    function rungRows(rungs) {
      return rungs.map((x) => h("tr", {},
        h("th", { scope: "row", class: "num", text: x.rows.toLocaleString("en-US") }), h("td", { class: "num", text: Preflight.bytes(x.bytes) }),
        h("td", { text: x.status === "done" ? "done" : `${x.status}: ${x.reason}` }),
        ...[x.readMs, x.profileMs, x.firstMs, x.chartsMs, x.statsMs, x.allMs].map((v) => h("td", { class: "num", text: secs(v) }))));
    }

    const table = (label, head, body) => h("div", { class: "scroll", tabindex: "0", role: "region", "aria-label": `${label}, scrolls sideways` },
      h("table", { class: "grid" }, h("thead", {}, h("tr", {}, head.map((x) => h("th", { scope: "col", text: x })))), h("tbody", {}, body)));

    function draw() {
      const view = byId("limits-view");
      if (!view) return;
      const bench = L.benchmark.map((b) => h("tr", {},
        h("th", { scope: "row", text: b.where }), h("td", { text: b.file }),
        ...[b.readMs, b.profileMs, b.copyMs, b.firstMs, b.chartsMs, b.statsMs, b.allMs].map((v) => h("td", { class: "num", text: secs(v) })),
        h("td", { text: b.note ?? "" })));
      const devices = L.devices.map((d) => h("tr", { "data-limits-row": d.id },
        h("th", { scope: "row" }, d.device, d.how === "emulated" ? h("span", { class: "badge warn", text: "Emulated" }) : d.how === "pending" ? h("span", { class: "badge", text: "Not measured yet" }) : null),
        h("td", { text: d.browser }), h("td", { class: "num", text: d.budget ? Preflight.bytes(d.budget) : "–" }),
        h("td", { class: "num", text: d.largest === null ? "–" : rowsText(d.largest) }), h("td", { class: "num", text: secs(d.largestMs) }), h("td", { text: d.stopped })));
      const out = [
        h("h3", { text: "Desktop benchmark: 1,000,000 rows by 50 columns" }),
        h("p", { class: "note", text: L.benchmarkAbout ?? "" }),
        table("The desktop benchmark", ["Where", "File", "Read", "Profile", "Typed copy", "First figure", "Every chart", "Statistics", "All", "Note"], bench),
        h("h3", { text: "Tested devices" }),
        h("p", { class: "note", text: L.devicesAbout ?? "" }),
        table("Tested devices", ["Device", "Browser", "Memory budget", "Largest table completed", "Its time, import to statistics", "Stopped because"], devices),
        h("h3", { text: "Measure this device" }),
        h("p", { class: "note", text: `Tables of the planted example (${Measure.COLUMNS} columns) of ${Measure.LADDER.map((n) => n.toLocaleString("en-US")).join(", ")} rows, one after another, each checked against this device's memory budget, then read, profiled, charted and tested, until one does not fit, reaches the memory limit or takes longer than 2 minutes. It uses the whole budget, so it runs only before any table is imported, and it reads nothing of yours. Cancel stops it.` }),
        h("p", { class: "actions" },
          h("button", { type: "button", id: "measure-device", class: "primary", disabled: !!store.busy || store.tables.length > 0, onclick: () => measure(), text: "Measure this device" }),
          result ? h("button", { type: "button", id: "measure-copy", onclick: () => copy(), text: "Copy the result" }) : null,
          result ? h("button", { type: "button", id: "measure-save", onclick: () => save(), text: "Save the result (JSON)" }) : null),
        store.tables.length ? h("p", { class: "note", text: "Remove the imported tables first: the measurement needs the whole memory budget." }) : null,
        h("p", { id: "measure-status", class: "note", role: "status", "aria-live": "polite" }),
      ];
      if (result) {
        out.push(h("div", { id: "measure-result", "data-measured": String(result.largest) },
          h("p", {}, h("strong", { text: `This device completed ${rowsText(result.largest)}. ` }), `Stopped: ${result.stopped}. Memory budget ${Preflight.bytes(result.budget)}; ${result.device.label}.`),
          table("This device's result", ["Rows", "CSV", "Status", "Read", "Profile", "First figure", "Every chart", "Statistics", "All"], rungRows(result.rungs))));
      }
      view.replaceChildren(...out.filter(Boolean));
    }

    return { draw, measure, result: () => result };
  }

  return { mount };
});
