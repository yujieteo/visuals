/* Monte Carlo Probability Workbench: the worker entry of the Markov chain, sequential and quasi-Monte Carlo lab
 * (group 8). The page builds each worker from its own inline rng, special and chains scripts plus this file, so a
 * worker runs exactly the page's engine. "init" compiles the record and settings of a job with the reference that
 * the evidence quantities need; "block" runs one independent run and returns it. */
/** @type {{ id: number, c: any, opts: any } | null} */
let chainJob = null;
self.onmessage = (/** @type {MessageEvent} */ e) => {
  const m = e.data, Ch = /** @type {any} */ (self).MCChains;
  try {
    if (m.type === "init") {
      const c = Ch.prepare(m.record, m.settings);
      if (!c.ok) {
        self.postMessage({ type: "error", id: m.id, message: c.errors.join(" ") });
        return;
      }
      chainJob = { id: m.id, c, opts: m.opts };
    } else if (m.type === "block") {
      if (!chainJob || chainJob.id !== m.id) return;
      self.postMessage({ type: "block", id: m.id, block: m.block, stats: Ch.block(chainJob.c, m.block, chainJob.opts) });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: m.id, message: err instanceof Error ? err.message : String(err) });
  }
};
