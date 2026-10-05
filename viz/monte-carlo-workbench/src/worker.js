/* Monte Carlo Probability Workbench: the worker entry. The page builds each worker from its own inline rng,
 * special, expr, laws and engine scripts plus this file, so a worker runs exactly the page's engine. "init"
 * compiles the model of a job; "block" simulates one block and returns its statistics with the job id. */
/** @type {{ id: number, c: any, opts: any } | null} */
let job = null;
self.onmessage = (/** @type {MessageEvent} */ e) => {
  const m = e.data, Engine = /** @type {any} */ (self).MCEngine;
  try {
    if (m.type === "init") {
      const c = Engine.prepare(m.record, m.settings);
      if (!c.ok) {
        self.postMessage({ type: "error", id: m.id, message: c.errors.join(" ") });
        return;
      }
      job = { id: m.id, c, opts: m.opts };
    } else if (m.type === "block") {
      if (!job || job.id !== m.id) return;
      self.postMessage({ type: "block", id: m.id, block: m.block, stats: Engine.block(job.c, m.block, job.opts) });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
};
