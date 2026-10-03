/* Radar network visualiser: worker entry. The page builds this worker from its own inline numerics, detector,
 * model and signal scripts plus this file, so the worker runs exactly the page's processing code. */
self.onmessage = async (e) => {
  const m = e.data, G = self.RadarNet.signal;
  try {
    let result;
    if (m.type === "channel") {
      const plan = G.planChannel(m.scn, m.rx, m.tx, m.t0);
      if (!plan.ok) result = { ok: false, reasons: plan.reasons };
      else result = await G.runChannel(plan, { progress: (done, total) => self.postMessage({ id: m.id, type: "progress", done, total }) }, m.opts);
    } else if (m.type === "combine") result = G.combineSites(m.scn, m.t0, m.opts);
    else throw new Error(`unknown job ${m.type}`);
    const transfer = result && result.power ? [result.power.buffer, result.cplxRe.buffer, result.cplxIm.buffer] : [];
    self.postMessage({ id: m.id, type: "result", result }, transfer);
  } catch (err) {
    self.postMessage({ id: m.id, type: "error", message: err && err.message ? err.message : String(err) });
  }
};
