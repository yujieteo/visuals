/* Monte Carlo Probability Workbench: the worker entry of the rare-event lab. The page builds each worker from its own
 * inline rng, special, expr, continuous, copulas and rare scripts plus this file, so a worker runs exactly the page's
 * rare-event engine. "init" compiles the record and settings of a job; "block" runs one replication and returns it. */
/** @type {{ id: number, c: any } | null} */
let rareJob = null;
self.onmessage = (/** @type {MessageEvent} */ e) => {
  const m = e.data, Ra = /** @type {any} */ (self).MCRare;
  try {
    if (m.type === "init") {
      const c = Ra.prepare(m.record, m.settings);
      if (!c.ok) {
        self.postMessage({ type: "error", id: m.id, message: c.errors.join(" ") });
        return;
      }
      rareJob = { id: m.id, c };
    } else if (m.type === "block") {
      if (!rareJob || rareJob.id !== m.id) return;
      self.postMessage({ type: "block", id: m.id, block: m.block, stats: Ra.block(rareJob.c, m.block) });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
};
