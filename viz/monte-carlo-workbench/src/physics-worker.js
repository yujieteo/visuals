/* Monte Carlo Probability Workbench: the worker entry of the statistical-physics lab (group 9). The page builds
 * each worker from its own inline rng, special and physics scripts plus this file, so a
 * worker runs exactly the page's engine. "init" compiles a job; "block" runs one block on its named streams and returns
 * its statistics. */
/** @type {{ id: number, c: any, opts: any } | null} */
let physJob = null;
self.onmessage = (/** @type {MessageEvent} */ e) => {
  const m = e.data, Ph = /** @type {any} */ (self).MCPhysics;
  try {
    if (m.type === "init") {
      const c = Ph.prepare(m.record, m.settings);
      if (!c.ok) {
        self.postMessage({ type: "error", id: m.id, message: c.errors.join(" ") });
        return;
      }
      physJob = { id: m.id, c, opts: m.opts };
    } else if (m.type === "block") {
      if (!physJob || physJob.id !== m.id) return;
      self.postMessage({ type: "block", id: m.id, block: m.block, stats: Ph.block(physJob.c, m.block) });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
};
