/* Monte Carlo Probability Workbench: the statistical-physics test (group 9). Pure functions, and the job engine that
 * the page's physics pool runs in its workers:
 *
 *   landscapes  energy functions on a 61 x 61 grid of [-2, 2]^2 and their exact analysis: the local minima, the
 *               basins of steepest descent, the stability level of each minimum, Hajek's depth d* and a minimax path
 *   Metropolis  the chain on the grid (one of the 4 neighbours, each with probability 1/4), its exact stationary law
 *               (the Boltzmann law, a finite sum) and its exact mean exit time (a banded GTH elimination)
 *   annealing   4 cooling schedules on paired streams; parallel tempering beside one chain at T_min
 *   sandpiles   the BTW and Manna rules with open, closed or periodic boundaries, random or centre drive, g grains for
 *               each drive and a bulk dissipation epsilon; avalanche size, area and duration; the exact mean size from
 *               Dhar's identity E[n] = Delta^-1 E[added] (conjugate gradients); Dhar's burning test
 *   scale       log-binned densities, moment analysis, block coarse-graining and box counting
 *
 * A job is plain data, { kind, ... }. prepare(job, settings) checks and compiles it, block(c, b) runs block b on its
 * own named streams, and merge() and summary() combine the blocks in block order, so the result does not depend on
 * the number of workers. Node tests load this file with require(); the page and its workers run it as a plain script.
 */
/** @param {any} root the global object @param {(Rng: any, S: any) => any} factory */
(function (root, factory) {
  const api = factory(root.MCRng ?? require("./rng.js"), root.MCSpecial ?? require("./special.js"));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MCPhysics = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function (
  /** @type {typeof import("./rng.js")} */ Rng, /** @type {typeof import("./special.js")} */ S) {
  "use strict";

  const FORMAT = "monte-carlo-workbench/physics-run", VERSION = 1;
  const GRID = 61, LO = -2, HI = 2, H = (HI - LO) / (GRID - 1);
  /** Replicates in one block of the landscape jobs. */
  const REPS = 16;
  /** The checkpoints of the annealing traces, and the points kept of one path. */
  const CHECKPOINTS = 64, PATH = 600;
  /** Bins for each factor of 2 in the log-binned histograms, and their count (sizes up to 2^40). */
  const PER_OCTAVE = 4, BINS = 160;
  /** The moment orders of the moment analysis. */
  const ORDERS = [1, 1.5, 2, 2.5, 3];
  /** The block sizes of the coarse-graining and of the box counting. */
  const SCALES = [1, 2, 4, 8, 16];
  /** The greatest number of topplings in one avalanche: past it the run stops with an error. */
  const MAX_TOPPLINGS = 2 ** 28;
  const SCHEDULES = ["log", "geometric", "linear", "quench"];
  /** The exact single-site height probabilities of the BTW sandpile on the infinite square lattice, heights 0 to 3
   * (1 to 4 in the papers): Priezzhev (1994); proofs by Jeng, Piroux and Ruelle (2006) and Poghosyan, Priezzhev and
   * Ruelle (2011). Their mean is 17/8. */
  const PI = Math.PI;
  const BTW_HEIGHTS = [2 / PI ** 2 - 4 / PI ** 3, 1 / 4 - 1 / (2 * PI) - 3 / PI ** 2 + 12 / PI ** 3, 3 / 8 + 1 / PI - 12 / PI ** 3, 3 / 8 - 1 / (2 * PI) + 1 / PI ** 2 + 4 / PI ** 3];

  /* ---------- landscapes ---------- */

  /** @type {Record<string, { title: string, tex: string, text: string, f: (x: number, y: number) => number }>} */
  const LANDSCAPES = {
    "double-well": {
      title: "Tilted double well",
      tex: "V(x, y) = (x^2 - 1)^2 - \\tfrac{1}{4}\\,x + \\tfrac{1}{2}\\,y^2",
      text: "Two wells on the x axis. The tilt makes the right well deeper, so the left well is metastable.",
      f: (x, y) => (x * x - 1) ** 2 - 0.25 * x + 0.5 * y * y,
    },
    "three-wells": {
      title: "Three wells: deep and narrow, shallow and wide",
      tex: "V(x, y) = 0.15\\,|p|^2 - \\sum_{k=1}^{3} d_k \\exp\\!\\left(-\\frac{|p - c_k|^2}{2 w_k^2}\\right)",
      text: "A narrow deep well at (1.1, −0.7), a medium well at (−1.1, −0.6) and a wide shallow well at (0, 1.1). At a high temperature the wide well holds the most probability; at a low temperature the narrow deep well does.",
      f: (x, y) => 0.15 * (x * x + y * y)
        - 1.3 * Math.exp(-((x - 1.1) ** 2 + (y + 0.7) ** 2) / (2 * 0.22 ** 2))
        - 1.0 * Math.exp(-((x + 1.1) ** 2 + (y + 0.6) ** 2) / (2 * 0.35 ** 2))
        - 0.8 * Math.exp(-(x * x + (y - 1.1) ** 2) / (2 * 0.55 ** 2)),
    },
    rugged: {
      title: "Rugged bowl",
      tex: "V(x, y) = 0.2\\,|p - (0.3, -0.25)|^2 - 0.2\\,[\\cos(2.5\\pi x) + \\cos(2.5\\pi y)] - 0.6\\,e^{-|p - (-1.6, 1.6)|^2 / 0.18}",
      text: "A bowl with a square lattice of small wells and one deep well near the corner (−1.6, 1.6), far from the bottom of the bowl.",
      f: (x, y) => 0.2 * ((x - 0.3) ** 2 + (y + 0.25) ** 2) - 0.2 * (Math.cos(2.5 * PI * x) + Math.cos(2.5 * PI * y))
        - 0.6 * Math.exp(-((x + 1.6) ** 2 + (y - 1.6) ** 2) / 0.18),
    },
  };

  /** The 4 neighbours of node s on a g x g grid, or -1 off the grid: +x, -x, +y, -y. @param {number} g */
  function gridNeighbours(g) {
    const nb = new Int32Array(4 * g * g);
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
      const s = i + g * j;
      nb[4 * s] = i + 1 < g ? s + 1 : -1;
      nb[4 * s + 1] = i > 0 ? s - 1 : -1;
      nb[4 * s + 2] = j + 1 < g ? s + g : -1;
      nb[4 * s + 3] = j > 0 ? s - g : -1;
    }
    return nb;
  }

  /**
   * The exact analysis of an energy V on a g x g grid with 4-neighbour moves. Nodes are ordered by (V, index), so ties
   * have a fixed order. A local minimum is a node below its 4 neighbours. Its basin is the set of nodes whose path of
   * steepest descent ends at it. Its stability level is the least barrier on a path to a node with a strictly lower
   * energy (Infinity for the global minimum), from a union-find over the nodes in increasing order. Hajek's depth d*
   * is the greatest stability level of a minimum that is not global; the "trap" is that minimum.
   * @param {Float64Array} V @param {number} g
   */
  function analyse(V, g) {
    const n = g * g, nb = gridNeighbours(g);
    const less = (/** @type {number} */ a, /** @type {number} */ b) => V[a] < V[b] || (V[a] === V[b] && a < b);
    const down = new Int32Array(n);
    for (let s = 0; s < n; s++) {
      let best = s;
      for (let d = 0; d < 4; d++) { const t = nb[4 * s + d]; if (t >= 0 && less(t, best)) best = t; }
      down[s] = best;
    }
    /** @type {number[]} */
    const minima = [];
    const index = new Int32Array(n).fill(-1);
    for (let s = 0; s < n; s++) if (down[s] === s) { index[s] = minima.length; minima.push(s); }
    const basin = new Int32Array(n).fill(-1);
    for (let s = 0; s < n; s++) {
      /** @type {number[]} */
      const trail = [];
      let t = s;
      while (basin[t] < 0 && down[t] !== t) { trail.push(t); t = down[t]; }
      const k = basin[t] >= 0 ? basin[t] : index[t];
      basin[t] = k;
      for (const u of trail) basin[u] = k;
    }
    const order = Array.from({ length: n }, (_, s) => s).sort((a, b) => (less(a, b) ? -1 : less(b, a) ? 1 : 0));
    const parent = new Int32Array(n).fill(-1), low = new Int32Array(n);
    const find = (/** @type {number} */ x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const stability = new Float64Array(minima.length).fill(Infinity);
    for (const u of order) {
      parent[u] = u;
      low[u] = u;
      for (let d = 0; d < 4; d++) {
        const w = nb[4 * u + d];
        if (w < 0 || parent[w] < 0) continue;
        const ru = find(u), rw = find(w);
        if (ru === rw) continue;
        const a = low[ru], b = low[rw], hi = less(a, b) ? b : a, lo = hi === a ? b : a;
        if (V[lo] < V[hi] && stability[index[hi]] === Infinity) stability[index[hi]] = V[u] - V[hi];
        const [top, under] = hi === a ? [ru, rw] : [rw, ru];
        parent[top] = under;
        low[under] = lo;
      }
    }
    const global = index[order[0]];
    let trap = -1;
    for (let k = 0; k < minima.length; k++) if (k !== global && (trap < 0 || stability[k] > stability[trap])) trap = k;
    let vmin = Infinity, vmax = -Infinity;
    for (let s = 0; s < n; s++) { vmin = Math.min(vmin, V[s]); vmax = Math.max(vmax, V[s]); }
    return { g, n, V, nb, vmin, vmax, minima, basin, stability, global, trap, dstar: trap < 0 ? 0 : stability[trap] };
  }

  /**
   * A path from node a to node b whose highest energy is the least possible (a bottleneck Dijkstra), with the energy
   * along it. @param {any} land @param {number} a @param {number} b
   */
  function minimaxPath(land, a, b) {
    const { V, nb, n } = land;
    const cost = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    cost[a] = V[a];
    /** @type {[number, number][]} */
    const heap = [[V[a], a]];
    const push = (/** @type {[number, number]} */ x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = /** @type {[number, number]} */ (heap.pop()); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [c, u] = pop();
      if (done[u]) continue;
      done[u] = 1;
      if (u === b) break;
      for (let d = 0; d < 4; d++) {
        const w = nb[4 * u + d];
        if (w < 0 || done[w]) continue;
        const cw = Math.max(c, V[w]);
        if (cw < cost[w]) { cost[w] = cw; from[w] = u; push([cw, w]); }
      }
    }
    /** @type {number[]} */
    const path = [];
    for (let u = b; u >= 0; u = from[u]) { path.push(u); if (u === a) break; }
    path.reverse();
    return { path, energy: path.map((u) => V[u]), barrier: cost[b] };
  }

  /** @type {Map<string, any>} */
  const cache = new Map();
  /** The analysed landscape of a preset id, computed once. @param {string} id */
  function landscape(id) {
    const hit = cache.get(id);
    if (hit) return hit;
    const def = LANDSCAPES[id];
    if (!def) throw new Error(`No landscape has the id "${String(id).slice(0, 40)}".`);
    const V = new Float64Array(GRID * GRID);
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) V[i + GRID * j] = def.f(LO + i * H, LO + j * H);
    const land = { id, ...def, lo: LO, h: H, ...analyse(V, GRID) };
    const trapNode = land.minima[land.trap], globalNode = land.minima[land.global];
    const out = { ...land, trapNode, globalNode, route: minimaxPath(land, trapNode, globalNode) };
    cache.set(id, out);
    return out;
  }

  /** The (x, y) coordinates of a node. @param {any} land @param {number} s */
  const coords = (land, s) => [land.lo + (s % land.g) * land.h, land.lo + Math.floor(s / land.g) * land.h];

  /**
   * The Boltzmann law exp(-V/T)/Z on the grid, which is the stationary law of the Metropolis chain: the probability
   * of each basin, of the global minimum node, and the mean energy. An exact finite sum.
   * @param {any} land @param {number} T
   */
  function boltzmann(land, T) {
    const { V, n, basin, minima, vmin } = land;
    const p = new Float64Array(minima.length);
    let z = 0, e = 0;
    for (let s = 0; s < n; s++) { const w = Math.exp(-(V[s] - vmin) / T); z += w; e += w * V[s]; p[basin[s]] += w; }
    return { basins: Array.from(p, (x) => x / z), atMinimum: Math.exp(-(V[minima[land.global]] - vmin) / T) / z, energy: e / z };
  }

  /** The probability that the Metropolis chain at temperature T moves from s to its neighbour t. @param {Float64Array} V @param {number} s @param {number} t @param {number} T */
  const move = (V, s, t, T) => 0.25 * Math.min(1, Math.exp(-(V[t] - V[s]) / T));

  /**
   * The exact mean exit time E_s[tau], tau = the first step at which the energy is below V(s), of the Metropolis chain
   * at temperature T. It solves (I - P) h = 1 on the nodes at or above V(s), h = 0 below, by a banded elimination in
   * the form of Grassmann, Taksar and Heyman: each pivot is a sum of positive terms, so no subtraction loses digits.
   * @param {any} land @param {number} T @param {number} start
   */
  function meanExitTime(land, T, start) {
    const { V, n, g, nb } = land, level = V[start], W = 2 * g + 1;
    const off = new Float64Array(n * W), leak = new Float64Array(n), rhs = new Float64Array(n), piv = new Float64Array(n), out = new Uint8Array(n);
    for (let s = 0; s < n; s++) out[s] = V[s] < level ? 1 : 0;
    for (let s = 0; s < n; s++) {
      if (out[s]) continue;
      rhs[s] = 1;
      for (let d = 0; d < 4; d++) {
        const t = nb[4 * s + d];
        if (t < 0) continue;
        const p = move(V, s, t, T);
        if (out[t]) leak[s] += p;
        else off[s * W + t - s + g] = p;
      }
    }
    for (let k = 0; k < n; k++) {
      if (out[k]) continue;
      const rk = k * W, top = Math.min(n - 1, k + g);
      let p = leak[k];
      for (let j = k + 1; j <= top; j++) p += off[rk + j - k + g];
      piv[k] = p;
      for (let i = k + 1; i <= top; i++) {
        if (out[i]) continue;
        const ri = i * W, fik = off[ri + k - i + g];
        if (fik === 0) continue;
        const m = fik / p;
        leak[i] += m * leak[k];
        rhs[i] += m * rhs[k];
        for (let j = k + 1; j <= top; j++) if (j !== i) { const fkj = off[rk + j - k + g]; if (fkj !== 0) off[ri + j - i + g] += m * fkj; }
        off[ri + k - i + g] = 0;
      }
    }
    const h = new Float64Array(n);
    for (let k = n - 1; k >= 0; k--) {
      if (out[k]) continue;
      let s = rhs[k];
      const rk = k * W, top = Math.min(n - 1, k + g);
      for (let j = k + 1; j <= top; j++) s += off[rk + j - k + g] * h[j];
      h[k] = s / piv[k];
    }
    return h[start];
  }

  /**
   * Metropolis steps at inverse temperature beta from node x: each step proposes one of the 4 neighbours with
   * probability 1/4 (a proposal off the grid is refused) and accepts it with probability min(1, exp(-beta dV)).
   * @param {any} land @param {number} x @param {number} steps @param {number} beta @param {any} st
   */
  function walk(land, x, steps, beta, st) {
    const V = land.V, nb = land.nb;
    let v = V[x];
    for (let k = 0; k < steps; k++) {
      const y = nb[4 * x + (st.u32() & 3)];
      if (y < 0) continue;
      const dv = V[y] - v;
      if (dv <= 0 || st.uniform() < Math.exp(-beta * dv)) { x = y; v = V[y]; }
    }
    return x;
  }

  /** The temperature of a cooling schedule at step k of K. @param {string} kind @param {number} k @param {any} c */
  function temperature(kind, k, c) {
    const { t0, tend, steps } = c.job, f = steps > 1 ? k / (steps - 1) : 1;
    if (kind === "log") return Math.min(t0, c.logC / Math.log(k + 2));
    if (kind === "geometric") return t0 * (tend / t0) ** f;
    if (kind === "linear") return t0 + (tend - t0) * f;
    return tend;
  }

  /* ---------- sandpiles ---------- */

  /**
   * The lattice of a sandpile: for each site its 4 targets (+x, -x, +y, -y). Open: a grain sent off the lattice is
   * lost (-1). Closed: it stays on the site that toppled. Periodic: it wraps around.
   * @param {number} L @param {string} boundary
   */
  function lattice(L, boundary) {
    const nb = new Int32Array(4 * L * L);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const s = i + L * j;
      const at = (/** @type {number} */ x, /** @type {number} */ y) => {
        if (x >= 0 && x < L && y >= 0 && y < L) return x + L * y;
        if (boundary === "periodic") return ((x + L) % L) + L * ((y + L) % L);
        return boundary === "closed" ? s : -1;
      };
      nb[4 * s] = at(i + 1, j);
      nb[4 * s + 1] = at(i - 1, j);
      nb[4 * s + 2] = at(i, j + 1);
      nb[4 * s + 3] = at(i, j - 1);
    }
    return nb;
  }

  /**
   * x = Delta^-1 b by conjugate gradients, for Delta = 4I - (1 - eps)(A + R): A moves one grain to each target of a
   * site, and R keeps the grains that a closed boundary sends back. Delta is symmetric and positive definite when grains
   * can leave: through an open boundary, or with eps > 0. Stops at a relative residual of 1e-12.
   * @param {number} L @param {string} boundary @param {number} eps @param {Float64Array} b
   */
  function solveDelta(L, boundary, eps, b) {
    const n = L * L, nb = lattice(L, boundary), keep = 1 - eps;
    const apply = (/** @type {Float64Array} */ v, /** @type {Float64Array} */ out) => {
      for (let s = 0; s < n; s++) {
        let t = 0;
        for (let d = 0; d < 4; d++) { const u = nb[4 * s + d]; if (u >= 0) t += v[u]; }
        out[s] = 4 * v[s] - keep * t;
      }
    };
    const x = new Float64Array(n), r = Float64Array.from(b), p = Float64Array.from(b), q = new Float64Array(n);
    const dot = (/** @type {Float64Array} */ a, /** @type {Float64Array} */ c) => { let t = 0; for (let i = 0; i < n; i++) t += a[i] * c[i]; return t; };
    const b2 = dot(b, b);
    let rr = b2, it = 0;
    for (; it < 20 * L + 2000 && rr > 1e-24 * b2; it++) {
      apply(p, q);
      const alpha = rr / dot(p, q);
      for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * q[i]; }
      const next = dot(r, r);
      for (let i = 0; i < n; i++) p[i] = r[i] + (next / rr) * p[i];
      rr = next;
    }
    return { x, iterations: it, residual: Math.sqrt(rr / b2) };
  }

  /**
   * The exact mean number of topplings for each drive in the stationary state (Dhar 1990): the toppling vector n
   * satisfies z' = z + added - Delta n in mean, and stationarity gives Delta E[n] = E[added]. The Manna rule moves 2
   * grains to random targets, so its Delta is half the BTW one and its mean is twice as large.
   * @param {any} job @param {number} L
   */
  function meanSize(job, L) {
    const n = L * L, b = new Float64Array(n).fill(1), { x, residual } = solveDelta(L, job.boundary, job.eps, b);
    const centre = Math.floor(L / 2) + L * Math.floor(L / 2);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += x[i];
    mean /= n;
    const factor = (job.rule === "manna" ? 2 : 1) * job.grains;
    return { value: factor * (job.drive === "centre" ? x[centre] : mean), residual };
  }

  /**
   * Dhar's burning test for the BTW rule with an open boundary: add to each site one grain for each of its targets off
   * the lattice and relax. A stable configuration is recurrent, so in the support of the stationary law, exactly when
   * every site then topples once. @param {Int32Array} z @param {number} L
   */
  function recurrent(z, L) {
    const n = L * L, nb = lattice(L, "open"), h = Int32Array.from(z), count = new Int32Array(n);
    /** @type {number[]} */
    const stack = [];
    for (let s = 0; s < n; s++) {
      for (let d = 0; d < 4; d++) if (nb[4 * s + d] < 0) h[s]++;
      if (h[s] >= 4) stack.push(s);
    }
    while (stack.length) {
      const s = /** @type {number} */ (stack.pop());
      if (h[s] < 4) continue;
      h[s] -= 4;
      count[s]++;
      if (count[s] > 1) return false;
      for (let d = 0; d < 4; d++) { const t = nb[4 * s + d]; if (t >= 0 && ++h[t] >= 4) stack.push(t); }
      if (h[s] >= 4) stack.push(s);
    }
    return count.every((c) => c === 1);
  }

  /** The log bin of a positive size: PER_OCTAVE bins for each factor of 2. @param {number} v */
  const binOf = (v) => Math.min(BINS - 1, Math.floor(PER_OCTAVE * Math.log2(v) + 1e-9));
  /** The integers in log bin k: [lo, hi]. @param {number} k */
  function binRange(k) {
    const lo = Math.ceil(2 ** (k / PER_OCTAVE) - 1e-9), hi = Math.ceil(2 ** ((k + 1) / PER_OCTAVE) - 1e-9) - 1;
    return [lo, hi];
  }

  /**
   * One sandpile chain: burn-in, then `drives` recorded drives, each followed by a relaxation with the parallel update
   * (every site unstable at the start of a time step topples once in that step). Returns its statistics.
   * @param {any} job @param {number} L @param {number} chain @param {number} seed @param {boolean} display
   */
  function sandpileChain(job, L, chain, seed, display) {
    const n = L * L, nb = lattice(L, job.boundary), manna = job.rule === "manna", th = manna ? 2 : 4, eps = job.eps;
    const st = Rng.stream(seed, "phys/sandpile", chain, L);
    const z = new Int32Array(n), mark = new Int32Array(n), cnt = new Int32Array(n);
    const bufA = new Int32Array(Math.max(64, n)), bufB = new Int32Array(Math.max(64, n));
    /** @type {number[]} */
    const touched = [];
    const centre = Math.floor(L / 2) + L * Math.floor(L / 2), atCentre = job.drive === "centre", grains = job.grains;
    let stamp = 0, lostEdge = 0, lostBulk = 0, added = 0, steps = 0;
    const scales = SCALES.filter((b) => b <= L / 2 && L % b === 0);
    const boxes = scales.map((b) => new Int32Array((L / b) * (L / b)));
    let boxStamp = 0;

    /** Add g grains and relax with the parallel update. Returns the size; `touched` holds the sites that toppled and
     * `steps` the duration. A site enters the next step's list once (the mark), so a list never holds more than n. */
    const drive = () => {
      let cur = bufA, nxt = bufB, len = 0, mk = ++stamp, size = 0, edge = 0, bulk = 0;
      steps = 0;
      for (let k = 0; k < grains; k++) {
        const s = atCentre ? centre : st.below(n);
        z[s]++;
        if (z[s] >= th && mark[s] !== mk) { mark[s] = mk; cur[len++] = s; }
      }
      added += grains;
      while (len > 0) {
        mk++;
        let m = 0, toppled = false;
        for (let q = 0; q < len; q++) {
          const s = cur[q];
          if (z[s] < th) continue;
          z[s] -= th;
          toppled = true;
          size++;
          if (cnt[s]++ === 0) touched.push(s);
          const base = 4 * s;
          for (let k = 0; k < th; k++) {
            if (eps > 0 && st.uniform() < eps) { bulk++; continue; }
            const t = nb[base + (manna ? st.u32() & 3 : k)];
            if (t < 0) { edge++; continue; }
            if (++z[t] >= th && mark[t] !== mk) { mark[t] = mk; nxt[m++] = t; }
          }
          if (z[s] >= th && mark[s] !== mk) { mark[s] = mk; nxt[m++] = s; }
        }
        if (toppled) steps++;
        if (size > MAX_TOPPLINGS) throw new Error(`An avalanche passed ${MAX_TOPPLINGS} topplings at L = ${L}: the dynamics may not stop.`);
        const swap = cur; cur = nxt; nxt = swap; len = m;
      }
      stamp = mk;
      lostEdge += edge;
      lostBulk += bulk;
      return size;
    };
    const clear = () => { for (let k = 0; k < touched.length; k++) cnt[touched[k]] = 0; touched.length = 0; };

    const burn = Math.ceil((4 * n) / grains);
    for (let k = 0; k < burn; k++) { drive(); clear(); }
    const recurrentAfterBurn = !manna && job.boundary === "open" && eps === 0 ? recurrent(z, L) : null;
    let mass0 = 0;
    for (let s = 0; s < n; s++) mass0 += z[s];
    added = 0; lostEdge = 0; lostBulk = 0;

    // The heights of the central sites every 16 drives, the mean height every 64, the block variances 64 times in
    // all, and the box counts of each avalanche with an area of at least n/16.
    const D = job.drives, coarseEvery = Math.max(1, Math.floor(D / 64));
    const sHist = new Float64Array(BINS), aHist = new Float64Array(BINS), tHist = new Float64Array(BINS);
    const moments = new Float64Array(ORDERS.length), heights = new Float64Array(th);
    const box = new Float64Array(scales.length), blockVar = new Float64Array(scales.length);
    let zero = 0, sum = 0, sum2 = 0, sumA = 0, sumT = 0, maxS = 0, densFirst = 0, densSecond = 0, nFirst = 0, nSecond = 0, nBox = 0, nVar = 0;
    const lo = Math.floor(L / 4), hi = lo + Math.max(1, Math.floor(L / 2));
    /** @type {Int32Array | null} */
    let footprint = null;
    const minBoxArea = Math.max(16, Math.floor(n / 16));
    for (let k = 0; k < D; k++) {
      const s = drive(), a = touched.length, T = steps;
      sum += s;
      sum2 += s * s;
      if (s === 0) zero++;
      else {
        sHist[binOf(s)]++;
        aHist[binOf(a)]++;
        tHist[binOf(T)]++;
        sumA += a;
        sumT += T;
        for (let q = 0; q < ORDERS.length; q++) moments[q] += s ** ORDERS[q];
        if (display && s > maxS) { footprint = new Int32Array(n); for (const u of touched) footprint[u] = cnt[u]; }
        if (a >= minBoxArea && scales.length > 1) {
          boxStamp++;
          for (let i = 0; i < scales.length; i++) {
            const b = scales[i], w = L / b, seen = boxes[i];
            let c = 0;
            for (const u of touched) { const id = Math.floor((u % L) / b) + w * Math.floor(Math.floor(u / L) / b); if (seen[id] !== boxStamp) { seen[id] = boxStamp; c++; } }
            box[i] += Math.log(c);
          }
          nBox++;
        }
        maxS = Math.max(maxS, s);
      }
      clear();
      if (k % 16 === 0) for (let j = lo; j < hi; j++) for (let i = lo; i < hi; i++) heights[z[i + L * j]]++;
      if (k % 64 === 0) {
        let dens = 0;
        for (let u = 0; u < n; u++) dens += z[u];
        if (k < D / 2) { densFirst += dens / n; nFirst++; } else { densSecond += dens / n; nSecond++; }
      }
      if (k % coarseEvery === 0 && scales.length > 1) {
        for (let i = 0; i < scales.length; i++) {
          const b = scales[i], w = L / b, m = new Float64Array(w * w);
          for (let u = 0; u < n; u++) m[Math.floor((u % L) / b) + w * Math.floor(Math.floor(u / L) / b)] += z[u];
          let mu = 0, m2 = 0;
          for (let v = 0; v < m.length; v++) { const x = m[v] / (b * b); mu += x; m2 += x * x; }
          mu /= m.length;
          // The variance between blocks with the divisor m − 1, so a few large blocks give no bias.
          blockVar[i] += m.length > 1 ? ((m2 / m.length - mu * mu) * m.length) / (m.length - 1) : 0;
        }
        nVar++;
      }
    }
    let mass = 0;
    for (let s = 0; s < n; s++) mass += z[s];
    return {
      L, chain, drives: D, zero, sum, sum2, sumA, sumT, maxS, moments: Array.from(moments),
      sHist: Array.from(sHist), aHist: Array.from(aHist), tHist: Array.from(tHist), heights: Array.from(heights),
      density: [nFirst ? densFirst / nFirst : null, nSecond ? densSecond / nSecond : null],
      added, lostEdge, lostBulk, massChange: mass - mass0, recurrent: recurrentAfterBurn, burn,
      scales, box: nBox ? Array.from(box, (v) => v / nBox) : null, nBox, blockVar: nVar ? Array.from(blockVar, (v) => v / nVar) : null,
      final: display ? Array.from(z) : null, footprint: footprint ? Array.from(footprint) : null,
    };
  }

  /* ---------- jobs ---------- */

  /** @param {number} v @param {number} lo @param {number} hi */
  const within = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  /** @param {number} v */
  const pow2 = (v) => Number.isInteger(v) && v > 0 && (v & (v - 1)) === 0;

  /**
   * Check and compile a job. Returns { ok, errors } and, when ok, the job, its seed, its number of blocks and what the
   * blocks need.
   * @param {any} job @param {{ seed: number }} settings @returns {any}
   */
  function prepare(job, settings) {
    /** @type {string[]} */
    const errors = [];
    const seed = settings?.seed;
    if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) errors.push("The seed must be an integer from 0 to 2^32 − 1.");
    const kind = job?.kind;
    if (kind === "metastability" || kind === "annealing" || kind === "tempering") {
      if (!LANDSCAPES[job.landscape]) errors.push(`No landscape has the id "${String(job.landscape).slice(0, 40)}".`);
      if (!pow2(job.reps) || job.reps > 4096) errors.push("The number of replicates or chains must be a power of 2 up to 4,096.");
    }
    if (kind === "metastability") {
      if (!Array.isArray(job.temps) || job.temps.length < 2 || job.temps.length > 8 || !job.temps.every((/** @type {number} */ t) => within(t, 0.02, 5))) errors.push("The temperatures must be 2 to 8 values from 0.02 to 5.");
      if (!within(job.steps, 1, 2 ** 24) || !Number.isInteger(job.steps)) errors.push("The step limit must be an integer from 1 to 2^24.");
    } else if (kind === "annealing") {
      if (!within(job.t0, 0.02, 5) || !within(job.tend, 0.01, 5) || !(job.tend < job.t0)) errors.push("The schedule needs 0.01 ≤ T_end < T_0 ≤ 5.");
      if (!within(job.kappa, 0.05, 4)) errors.push("The constant c/d* of the logarithmic schedule must be from 0.05 to 4.");
      if (!Number.isInteger(job.steps) || !within(job.steps, 2, 2 ** 22)) errors.push("The number of steps must be an integer from 2 to 2^22.");
    } else if (kind === "tempering") {
      if (!within(job.tmin, 0.02, 5) || !within(job.tmax, 0.02, 5) || !(job.tmax > job.tmin)) errors.push("Parallel tempering needs 0.02 ≤ T_min < T_max ≤ 5.");
      if (!Number.isInteger(job.replicas) || !within(job.replicas, 2, 16)) errors.push("The number of temperatures must be an integer from 2 to 16.");
      if (!Number.isInteger(job.sweeps) || !within(job.sweeps, 8, 2 ** 20)) errors.push("The number of sweeps must be an integer from 8 to 2^20.");
      if (!Number.isInteger(job.inner) || !within(job.inner, 1, 256)) errors.push("The Metropolis steps in each sweep must be an integer from 1 to 256.");
      if (!["trap", "spread"].includes(job.start)) errors.push("The start must be \"trap\" or \"spread\".");
    } else if (kind === "sandpile") {
      if (!["btw", "manna"].includes(job.rule)) errors.push("The rule must be \"btw\" or \"manna\".");
      if (!["open", "closed", "periodic"].includes(job.boundary)) errors.push("The boundary must be open, closed or periodic.");
      if (!["random", "centre"].includes(job.drive)) errors.push("The drive must be random or centre.");
      if (!Number.isInteger(job.grains) || !within(job.grains, 1, 64)) errors.push("The grains for each drive must be an integer from 1 to 64.");
      if (!within(job.eps, 0, 0.5)) errors.push("The bulk dissipation ε must be from 0 to 0.5.");
      if (job.boundary !== "open" && job.eps === 0) errors.push(`With a ${job.boundary} boundary and ε = 0 no grain can leave the lattice, so an avalanche can go on for ever. Set ε above 0, or use the open boundary.`);
      if (!Array.isArray(job.sizes) || !job.sizes.length || job.sizes.length > 6 || !job.sizes.every((/** @type {number} */ L) => Number.isInteger(L) && L >= 2 && L <= 256)) errors.push("The lattice sizes must be 1 to 6 integers from 2 to 256.");
      if (!pow2(job.drives) || job.drives > 2 ** 20) errors.push("The recorded drives of each chain must be a power of 2 up to 2^20.");
      if (!pow2(job.chains) || job.chains > 64 || job.chains < 2) errors.push("The number of chains must be a power of 2 from 2 to 64.");
    } else errors.push(`No physics job has the kind "${String(kind).slice(0, 40)}".`);
    if (errors.length) return { ok: false, errors };
    const c = { ok: true, errors, job, seed, kind, blocks: 0, land: /** @type {any} */ (null), logC: 0 };
    if (kind === "sandpile") c.blocks = job.sizes.length * job.chains;
    else {
      c.land = landscape(job.landscape);
      c.logC = job.kappa * c.land.dstar;
      c.blocks = kind === "metastability" ? job.temps.length * Math.max(1, job.reps / REPS) : kind === "annealing" ? Math.max(1, job.reps / REPS) : job.reps;
    }
    return c;
  }

  /** The statistics of block b. @param {any} c @param {number} b */
  function block(c, b) {
    try {
      if (c.kind === "metastability") return exitBlock(c, b);
      if (c.kind === "annealing") return annealBlock(c, b);
      if (c.kind === "tempering") return temperBlock(c, b);
      const L = c.job.sizes[Math.floor(b / c.job.chains)], chain = b % c.job.chains;
      const stats = sandpileChain(c.job, L, chain, c.seed, chain === 0);
      return { block: b, error: "", kind: "sandpile", ...stats, reference: chain === 0 ? meanSize(c.job, L) : null };
    } catch (e) {
      return { block: b, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Exit times at one temperature for REPS replicates. @param {any} c @param {number} b */
  function exitBlock(c, b) {
    const { job, land, seed } = c, nT = job.temps.length, t = b % nT, group = Math.floor(b / nT), T = job.temps[t], beta = 1 / T;
    const reps = Math.min(REPS, job.reps), V = land.V, nb = land.nb, level = V[land.trapNode];
    const st = Rng.stream(seed, "phys/exit", 0, t);
    const hist = new Float64Array(BINS);
    let n = 0, sum = 0, sum2 = 0, censored = 0, longest = 0;
    /** @type {number[] | null} */
    let path = null;
    for (let r = 0; r < reps; r++) {
      const i = group * reps + r;
      st.reset(i, t);
      let x = land.trapNode, v = level, tau = 0;
      const keep = i === 0 ? new Int32Array(PATH) : null;
      for (; tau < job.steps; tau++) {
        if (keep) keep[tau % PATH] = x;
        const y = nb[4 * x + (st.u32() & 3)];
        if (y < 0) continue;
        const dv = V[y] - v;
        if (dv <= 0 || st.uniform() < Math.exp(-beta * dv)) { x = y; v = V[y]; if (v < level) { tau++; break; } }
      }
      if (keep) {
        const m = Math.min(tau, PATH);
        path = Array.from({ length: m }, (_, k) => keep[(tau - m + k) % PATH]);
        path.push(x);
      }
      if (v >= level) censored++;
      n++;
      sum += tau;
      sum2 += tau * tau;
      longest = Math.max(longest, tau);
      hist[binOf(Math.max(1, tau))]++;
    }
    return { block: b, error: "", kind: "metastability", t, n, sum, sum2, censored, longest, hist: Array.from(hist), path, reference: group === 0 ? meanExitTime(land, T, land.trapNode) : null };
  }

  /** REPS replicates of each schedule on the same streams. @param {any} c @param {number} b */
  function annealBlock(c, b) {
    const { job, land, seed } = c, reps = Math.min(REPS, job.reps), V = land.V, nb = land.nb, K = job.steps;
    const st = Rng.stream(seed, "phys/anneal", 0, 0);
    const checks = Array.from({ length: CHECKPOINTS }, (_, k) => Math.max(0, Math.floor(((k + 1) * K) / CHECKPOINTS) - 1));
    const out = SCHEDULES.map(() => ({ n: 0, success: 0, atMin: 0, sumE: 0, sumE2: 0, sumBest: 0, trace: new Float64Array(CHECKPOINTS), basins: new Float64Array(land.minima.length) }));
    const wins = new Uint8Array(reps * SCHEDULES.length);
    /** @type {number[][] | null} */
    let paths = null;
    for (let r = 0; r < reps; r++) {
      const i = b * reps + r;
      SCHEDULES.forEach((kind, s) => {
        st.reset(i, 0);
        let x = land.trapNode, v = V[x], best = v, cp = 0;
        const keep = i === 0 ? /** @type {number[]} */ ([]) : null;
        const every = Math.max(1, Math.floor(K / 300));
        for (let k = 0; k < K; k++) {
          const T = temperature(kind, k, c);
          const y = nb[4 * x + (st.u32() & 3)];
          if (y >= 0) {
            const dv = V[y] - v;
            if (dv <= 0 || st.uniform() < Math.exp(-dv / T)) { x = y; v = V[y]; if (v < best) best = v; }
          }
          if (k === checks[cp]) { out[s].trace[cp] += v; cp++; }
          if (keep && k % every === 0) keep.push(x);
        }
        const o = out[s], win = land.basin[x] === land.global;
        o.n++;
        if (win) o.success++;
        if (x === land.globalNode) o.atMin++;
        o.sumE += v;
        o.sumE2 += v * v;
        o.sumBest += best;
        o.basins[land.basin[x]]++;
        wins[r * SCHEDULES.length + s] = win ? 1 : 0;
        if (keep) (paths ??= []).push([...keep, x]);
      });
    }
    // Paired counts for each pair of schedules: (1, 0) and (0, 1) outcomes on the same streams.
    const pairs = [];
    for (let a = 0; a < SCHEDULES.length; a++) for (let d = a + 1; d < SCHEDULES.length; d++) {
      let n10 = 0, n01 = 0;
      for (let r = 0; r < reps; r++) { const x = wins[r * SCHEDULES.length + a], y = wins[r * SCHEDULES.length + d]; if (x && !y) n10++; else if (y && !x) n01++; }
      pairs.push({ a, b: d, n10, n01 });
    }
    return { block: b, error: "", kind: "annealing", schedules: out.map((o) => ({ ...o, trace: Array.from(o.trace), basins: Array.from(o.basins) })), pairs, paths };
  }

  /** One chain of parallel tempering and one chain at T_min with the same cost. @param {any} c @param {number} b */
  function temperBlock(c, b) {
    const { job, land, seed } = c, K = job.replicas, V = land.V, nm = land.minima.length;
    const temps = Array.from({ length: K }, (_, r) => job.tmin * (job.tmax / job.tmin) ** (r / (K - 1)));
    const betas = temps.map((t) => 1 / t);
    const start = job.start === "trap" ? land.trapNode : land.minima[b % nm];
    const pt = Rng.stream(seed, "phys/tempering", b, 0), one = Rng.stream(seed, "phys/single", b, 0);
    const x = new Int32Array(K).fill(start), label = Int32Array.from({ length: K }, (_, r) => r);
    const visitedTop = new Uint8Array(K), attempts = new Float64Array(K - 1), accepts = new Float64Array(K - 1);
    const occPT = new Float64Array(nm), occOne = new Float64Array(nm);
    let trips = 0, y = start, records = 0, sumV = 0, sumVOne = 0;
    const burn = Math.floor(job.sweeps / 4), every = Math.max(1, Math.floor(job.sweeps / 256));
    const trace = b === 0 ? /** @type {number[][]} */ ([]) : null, cold = b === 0 ? /** @type {number[]} */ ([]) : null, coldOne = b === 0 ? /** @type {number[]} */ ([]) : null;
    for (let w = 0; w < job.sweeps; w++) {
      for (let r = 0; r < K; r++) x[r] = walk(land, x[r], job.inner, betas[r], pt);
      for (let r = w % 2; r + 1 < K; r += 2) {
        attempts[r]++;
        const delta = (betas[r] - betas[r + 1]) * (V[x[r]] - V[x[r + 1]]);
        if (delta >= 0 || pt.uniform() < Math.exp(delta)) {
          accepts[r]++;
          [x[r], x[r + 1]] = [x[r + 1], x[r]];
          [label[r], label[r + 1]] = [label[r + 1], label[r]];
        }
      }
      if (visitedTop[label[0]]) { trips++; visitedTop[label[0]] = 0; }
      visitedTop[label[K - 1]] = 1;
      y = walk(land, y, job.inner * K, betas[0], one);
      if (w >= burn) {
        occPT[land.basin[x[0]]]++;
        occOne[land.basin[y]]++;
        sumV += V[x[0]];
        sumVOne += V[y];
        records++;
      }
      if (trace && w % every === 0) {
        const slots = new Array(K);
        for (let r = 0; r < K; r++) slots[label[r]] = r;
        trace.push(slots);
        /** @type {number[]} */ (cold).push(x[0]);
        /** @type {number[]} */ (coldOne).push(y);
      }
    }
    return {
      block: b, error: "", kind: "tempering", records, occPT: Array.from(occPT), occOne: Array.from(occOne), sumV, sumVOne,
      attempts: Array.from(attempts), accepts: Array.from(accepts), trips, start, trace, cold, coldOne,
    };
  }

  /* ---------- merge ---------- */

  /** The empty accumulator of a compiled job. @param {any} c */
  function empty(c) {
    return { kind: c.kind, blocks: 0, error: "", parts: /** @type {any[]} */ ([]) };
  }

  /**
   * Merge the statistics of the next block into the accumulator. Blocks arrive in block order. The accumulator keeps
   * each block's statistics, which are small, so the summary can form intervals between chains or replicate groups.
   * @param {any} acc @param {any} stats
   */
  function merge(acc, stats) {
    if (stats.error) return { ...acc, error: stats.error };
    return { ...acc, blocks: acc.blocks + 1, parts: [...acc.parts, stats] };
  }

  /* ---------- summary ---------- */

  /** The Student t quantile for probability p > 0.5 with nu degrees of freedom. @param {number} p @param {number} nu */
  function tQuantile(p, nu) {
    if (nu > 1e6) return S.normalQuantile(p);
    const x = S.ibetaInv(2 * (1 - p), nu / 2, 0.5);
    return Math.sqrt((nu * (1 - x)) / x);
  }

  /**
   * The mean of values from independent chains and its 95 % t interval, cut to [0, 1] for a probability.
   * @param {number[]} xs @param {boolean} [probability]
   */
  function between(xs, probability = false) {
    const k = xs.length;
    if (!k) return { est: null, lo: null, hi: null, se: null, how: "no chains" };
    const mean = xs.reduce((a, b) => a + b, 0) / k;
    if (k < 2) return { est: mean, lo: null, hi: null, se: null, how: "one chain: no interval" };
    const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (k - 1), se = Math.sqrt(v / k), q = tQuantile(0.975, k - 1);
    if (se === 0) return { est: mean, lo: null, hi: null, se: null, how: `no interval: every one of the ${k} chains gave the same value, so the spread between chains shows no uncertainty, and a bias that every chain shares stays possible` };
    let lo = mean - q * se, hi = mean + q * se, how = `t interval over ${k} independent chains, 95 %`;
    if (probability && (lo < 0 || hi > 1)) { lo = Math.max(0, lo); hi = Math.min(1, hi); how += ", cut to [0, 1]"; }
    return { est: mean, lo, hi, se, how };
  }

  /** The Wilson interval of k hits in n trials, with the exact zero-hit and all-hit bounds. @param {number} k @param {number} n */
  function proportion(k, n) {
    if (!n) return { est: null, lo: null, hi: null, se: null, how: "no replicates" };
    const est = k / n;
    if (k === 0) return { est, lo: 0, hi: S.zeroHitBound(n, 0.025), se: 0, how: "zero hits: exact one-sided 97.5 % bound, the end of a two-sided 95 % interval" };
    if (k === n) return { est, lo: 1 - S.zeroHitBound(n, 0.025), hi: 1, se: 0, how: "all hits: exact one-sided 97.5 % bound, the end of a two-sided 95 % interval" };
    const [lo, hi] = S.wilson(k, n, 1.959963984540054);
    return { est, lo, hi, se: Math.sqrt((est * (1 - est)) / n), how: "Wilson score interval, 95 %" };
  }

  /** The mean of n independent values from their sum and sum of squares, with the CLT interval. @param {number} n @param {number} sum @param {number} sum2 */
  function clt(n, sum, sum2) {
    if (!n) return { est: null, lo: null, hi: null, se: null, how: "no replicates" };
    const mean = sum / n;
    if (n < 2) return { est: mean, lo: null, hi: null, se: null, how: "one replicate" };
    const se = Math.sqrt(Math.max(0, (sum2 - n * mean * mean) / (n - 1)) / n);
    return { est: mean, lo: mean - 1.959963984540054 * se, hi: mean + 1.959963984540054 * se, se, how: "CLT interval, 95 %, asymptotic" };
  }

  /**
   * The least-squares line of y on x with equal weights: slope, intercept, and, when each y has a standard error, the
   * standard error of the slope that these errors give and a 95 % interval. That interval holds the Monte Carlo error
   * of the points only, not the error of a straight-line model.
   * @param {number[]} xs @param {number[]} ys @param {(number | null)[]} [ses]
   */
  function fitLine(xs, ys, ses) {
    const k = xs.length;
    if (k < 2) return null;
    const mx = xs.reduce((a, x) => a + x, 0) / k, my = ys.reduce((a, y) => a + y, 0) / k;
    let sxx = 0, sxy = 0;
    xs.forEach((x, i) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (ys[i] - my); });
    if (!(sxx > 0)) return null;
    const slope = sxy / sxx, se = ses && ses.every((v) => v !== null && Number.isFinite(v)) ? Math.sqrt(xs.reduce((a, x, i) => a + ((x - mx) / sxx) ** 2 * /** @type {number} */ (ses[i]) ** 2, 0)) : null;
    return { slope, intercept: my - slope * mx, se, lo: se === null ? null : slope - 1.959963984540054 * se, hi: se === null ? null : slope + 1.959963984540054 * se };
  }

  /**
   * The summary of the merged blocks: rows of results, each with its interval, its reference and its claim tags, and
   * the data of the figures. `complete` is false until every block is merged; then each row says it is partial.
   * @param {any} c @param {{ blocks: number, error: string, parts: any[] }} acc @returns {any}
   */
  function summary(c, acc) {
    const complete = acc.blocks === c.blocks && !acc.error;
    const base = { kind: c.kind, complete, blocks: acc.blocks, of: c.blocks, error: acc.error };
    if (c.kind === "metastability") return { ...base, ...exitSummary(c, acc) };
    if (c.kind === "annealing") return { ...base, ...annealSummary(c, acc) };
    if (c.kind === "tempering") return { ...base, ...temperSummary(c, acc) };
    return { ...base, ...sandpileSummary(c, acc) };
  }

  /** @param {any} c @param {{ blocks: number, error: string, parts: any[] }} acc */
  function exitSummary(c, acc) {
    const { job, land } = c;
    const temps = job.temps.map((/** @type {number} */ T, /** @type {number} */ t) => {
      const parts = acc.parts.filter((/** @type {any} */ p) => p.t === t);
      const n = parts.reduce((a, /** @type {any} */ p) => a + p.n, 0), censored = parts.reduce((a, /** @type {any} */ p) => a + p.censored, 0);
      const sum = parts.reduce((a, /** @type {any} */ p) => a + p.sum, 0), sum2 = parts.reduce((a, /** @type {any} */ p) => a + p.sum2, 0);
      const ref = parts.find((/** @type {any} */ p) => p.reference !== null)?.reference ?? null;
      const hist = new Array(BINS).fill(0);
      for (const p of parts) p.hist.forEach((/** @type {number} */ v, /** @type {number} */ k) => { hist[k] += v; });
      const iv = censored ? { est: n ? sum / n : null, lo: null, hi: null, se: null, how: `a lower bound: ${censored} of ${n} replicates did not leave by the step limit` } : clt(n, sum, sum2);
      return { T, n, censored, ...iv, reference: ref, hist, path: parts.find((/** @type {any} */ p) => p.path)?.path ?? null };
    });
    const usable = temps.filter((/** @type {any} */ x) => x.est > 0 && !x.censored);
    const fit = usable.length >= 2 ? fitLine(usable.map((/** @type {any} */ x) => 1 / x.T), usable.map((/** @type {any} */ x) => Math.log(x.est)), usable.map((/** @type {any} */ x) => (x.se ? x.se / x.est : null))) : null;
    // The exact slope uses the same temperatures as the slope of the run, so the two compare.
    const refs = usable.filter((/** @type {any} */ x) => x.reference > 0);
    const exactFit = refs.length >= 2 ? fitLine(refs.map((/** @type {any} */ x) => 1 / x.T), refs.map((/** @type {any} */ x) => Math.log(x.reference))) : null;
    const rows = temps.map((/** @type {any} */ x) => ({
      label: `Mean exit time at T = ${x.T}`, unit: "steps", est: x.est, lo: x.lo, hi: x.hi, how: x.how, n: x.n,
      reference: x.reference, refHow: "exact: a linear solve of (I − P) h = 1, rounding error only", tags: ["observation", "numerical"],
    }));
    rows.push({ label: "Slope of log E[τ] against 1/T, from the run", unit: "energy", est: fit?.slope ?? null, lo: fit?.lo ?? null, hi: fit?.hi ?? null, how: fit ? "least squares of the log means; the 95 % interval holds their Monte Carlo error only" : "needs 2 temperatures with no censored replicate", n: usable.length,
      reference: land.dstar, refHow: "the stability level V_m of the trap: the limit of T log E[τ] as T → 0", tags: ["observation", "theorem"] });
    rows.push({ label: "Slope of log E[τ] against 1/T, from the exact values", unit: "energy", est: exactFit?.slope ?? null, lo: null, hi: null, how: "least squares of the exact log means: at a finite T the slope is not yet V_m", n: refs.length,
      reference: land.dstar, refHow: "the stability level V_m of the trap: the limit of T log E[τ] as T → 0, not the slope at these temperatures", tags: ["numerical", "theorem"] });
    return { rows, temps, fit, exactFit, level: land.dstar };
  }

  /** @param {any} c @param {{ blocks: number, error: string, parts: any[] }} acc */
  function annealSummary(c, acc) {
    const { job, land } = c;
    const sched = SCHEDULES.map((kind, s) => {
      const parts = acc.parts.map((/** @type {any} */ p) => p.schedules[s]);
      const n = parts.reduce((a, /** @type {any} */ p) => a + p.n, 0);
      const tot = (/** @type {string} */ k) => parts.reduce((a, /** @type {any} */ p) => a + p[k], 0);
      const trace = new Array(CHECKPOINTS).fill(0), basins = new Array(land.minima.length).fill(0);
      for (const p of parts) { p.trace.forEach((/** @type {number} */ v, /** @type {number} */ k) => { trace[k] += v; }); p.basins.forEach((/** @type {number} */ v, /** @type {number} */ k) => { basins[k] += v; }); }
      const final = temperature(kind, job.steps - 1, c);
      const eq = boltzmann(land, final);
      const hajek = kind === "log" ? (job.kappa >= 1 ? "met: c ≥ d*, so Σ exp(−d*/T_k) = ∞" : "not met: c < d*, so the chain can stay in the trap with a positive probability") : "not met: this schedule is not logarithmic, so no theorem gives P → 1";
      return { kind, n, success: proportion(tot("success"), n), atMin: proportion(tot("atMin"), n), energy: clt(n, tot("sumE"), tot("sumE2")), best: n ? tot("sumBest") / n : null,
        trace: trace.map((v) => (n ? v / n : null)), basins: basins.map((v) => (n ? v / n : 0)), final, equilibrium: eq.basins[land.global], hajek };
    });
    const pairs = [];
    const allPairs = acc.parts.length ? acc.parts[0].pairs.map((/** @type {any} */ p, /** @type {number} */ i) => ({ a: p.a, b: p.b, n10: acc.parts.reduce((/** @type {number} */ t, /** @type {any} */ q) => t + q.pairs[i].n10, 0), n01: acc.parts.reduce((/** @type {number} */ t, /** @type {any} */ q) => t + q.pairs[i].n01, 0) })) : [];
    const n = sched[0].n;
    // The paired difference (n10 − n01)/n has an exact interval given the m = n10 + n01 discordant replicates: n10 is
    // binomial(m, π) with the Clopper-Pearson interval for π, and the difference is (2π − 1) m / n.
    for (const p of allPairs) {
      const m = p.n10 + p.n01, d = n ? (p.n10 - p.n01) / n : null;
      const cp = m ? S.clopperPearson(p.n10, m, 0.05) : null;
      pairs.push({ a: SCHEDULES[p.a], b: SCHEDULES[p.b], est: d, lo: cp ? ((2 * cp[0] - 1) * m) / n : null, hi: cp ? ((2 * cp[1] - 1) * m) / n : null, n10: p.n10, n01: p.n01 });
    }
    const rows = sched.map((s) => ({
      label: `P(final state in the global basin), ${s.kind} schedule`, unit: "", est: s.success.est, lo: s.success.lo, hi: s.success.hi, how: s.success.how, n: s.n,
      reference: s.equilibrium, refHow: `the Boltzmann probability at the final temperature ${+s.final.toPrecision(3)}: the value at equilibrium, not this estimand`, tags: ["observation", "numerical"],
    }));
    sched.forEach((s) => rows.push({ label: `Mean final energy, ${s.kind} schedule`, unit: "energy", est: s.energy.est, lo: s.energy.lo, hi: s.energy.hi, how: s.energy.how, n: s.n, reference: land.V[land.globalNode], refHow: "the global minimum of V", tags: ["observation", "numerical"] }));
    const curves = Array.from({ length: CHECKPOINTS }, (_, k) => Math.max(0, Math.floor(((k + 1) * job.steps) / CHECKPOINTS) - 1));
    const paths = acc.parts[0]?.paths ?? null;
    return { rows, schedules: sched, pairs, checkpoints: curves, temps: SCHEDULES.map((kind) => curves.map((k) => temperature(kind, k, c))), paths, dstar: land.dstar, logC: c.logC };
  }

  /** @param {any} c @param {{ blocks: number, error: string, parts: any[] }} acc */
  function temperSummary(c, acc) {
    const { job, land } = c;
    const exact = boltzmann(land, job.tmin);
    const frac = (/** @type {any} */ p, /** @type {string} */ k, /** @type {number} */ m) => (p.records ? p[k][m] / p.records : 0);
    const basins = land.minima.map((/** @type {number} */ node, /** @type {number} */ m) => ({
      m, node, energy: land.V[node], exact: exact.basins[m],
      pt: between(acc.parts.map((/** @type {any} */ p) => frac(p, "occPT", m)), true), one: between(acc.parts.map((/** @type {any} */ p) => frac(p, "occOne", m)), true),
    }));
    // The basins with an exact probability of at least 10^-3, or with any visit, in order of probability.
    const shown = basins.filter((/** @type {any} */ x) => x.exact >= 1e-3 || x.pt.est > 0 || x.one.est > 0).sort((/** @type {any} */ a, /** @type {any} */ b) => b.exact - a.exact).slice(0, 8);
    const K = job.replicas, swaps = Array.from({ length: K - 1 }, (_, r) => {
      const at = acc.parts.reduce((a, /** @type {any} */ p) => a + p.attempts[r], 0), ok = acc.parts.reduce((a, /** @type {any} */ p) => a + p.accepts[r], 0);
      return at ? ok / at : null;
    });
    const temps = Array.from({ length: K }, (_, r) => job.tmin * (job.tmax / job.tmin) ** (r / (K - 1)));
    const trips = acc.parts.length ? acc.parts.reduce((a, /** @type {any} */ p) => a + p.trips, 0) / acc.parts.length : null;
    const rows = [];
    for (const x of shown) {
      const [px, py] = coords(land, x.node);
      const where = `basin of the minimum at (${px.toFixed(2)}, ${py.toFixed(2)}), V = ${x.energy.toFixed(3)}`;
      rows.push({ label: `P(${where}), parallel tempering`, unit: "", ...x.pt, n: acc.parts.length, reference: x.exact, refHow: `exact Boltzmann probability at T_min = ${job.tmin}`, tags: ["observation", "theorem"] });
      rows.push({ label: `P(${where}), one chain at T_min`, unit: "", ...x.one, n: acc.parts.length, reference: x.exact, refHow: `exact Boltzmann probability at T_min = ${job.tmin}`, tags: ["observation", "theorem"] });
    }
    const p0 = acc.parts[0] ?? null;
    return { rows, basins: shown, swaps, temps, trips, exactEnergy: exact.energy, trace: p0?.trace ?? null, cold: p0?.cold ?? null, coldOne: p0?.coldOne ?? null, start: p0?.start ?? null };
  }

  /** @param {any} c @param {{ blocks: number, error: string, parts: any[] }} acc */
  function sandpileSummary(c, acc) {
    const { job } = c;
    // Heights: the stationary law is uniform on the recurrent configurations only for the BTW rule with an open
    // boundary, no dissipation and a random drive. With a drive at the centre and no dissipation the BTW rule uses no
    // random number at all, so every chain repeats the same orbit and no interval between chains is valid.
    const btwExact = job.rule === "btw" && job.boundary === "open" && job.eps === 0 && job.drive === "random";
    const fixed = job.rule === "btw" && job.eps === 0 && job.drive === "centre";
    /** @param {any} iv */
    const noRandom = (iv) => (fixed && iv.est !== null ? { ...iv, lo: null, hi: null, se: null, how: "no interval: this dynamics uses no random number, so the chains are identical" } : iv);
    const sizes = job.sizes.map((/** @type {number} */ L) => {
      const parts = acc.parts.filter((/** @type {any} */ p) => p.L === L);
      if (!parts.length) return { L, chains: 0 };
      const drives = parts.reduce((a, /** @type {any} */ p) => a + p.drives, 0), nonzero = drives - parts.reduce((a, /** @type {any} */ p) => a + p.zero, 0);
      const meanS = noRandom(between(parts.map((/** @type {any} */ p) => p.sum / p.drives)));
      const ref = parts.find((/** @type {any} */ p) => p.reference)?.reference ?? null;
      const dens = (/** @type {string} */ k) => {
        const h = new Array(BINS).fill(0);
        for (const p of parts) p[k].forEach((/** @type {number} */ v, /** @type {number} */ i) => { h[i] += v; });
        /** @type {{ x: number, y: number, count: number }[]} */
        const pts = [];
        h.forEach((v, i) => { if (v > 0) { const [lo, hi] = binRange(i); if (hi >= lo) pts.push({ x: Math.sqrt(lo * hi), y: v / nonzero / (hi - lo + 1), count: v }); } });
        return pts;
      };
      const moments = ORDERS.map((q, i) => noRandom(between(parts.map((/** @type {any} */ p) => p.moments[i] / p.drives))));
      const hcount = parts[0].heights.map((/** @type {number} */ _, /** @type {number} */ h) => parts.reduce((a, /** @type {any} */ p) => a + p.heights[h], 0));
      const htotal = hcount.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
      const heights = between(parts.map((/** @type {any} */ p) => p.heights.reduce((/** @type {number} */ a, /** @type {number} */ v, /** @type {number} */ h) => a + v * h, 0) / p.heights.reduce((/** @type {number} */ a, /** @type {number} */ v) => a + v, 0)));
      const added = parts.reduce((a, /** @type {any} */ p) => a + p.added, 0), lostEdge = parts.reduce((a, /** @type {any} */ p) => a + p.lostEdge, 0), lostBulk = parts.reduce((a, /** @type {any} */ p) => a + p.lostBulk, 0);
      const massChange = parts.reduce((a, /** @type {any} */ p) => a + p.massChange, 0);
      const scales = parts[0].scales;
      const withBox = parts.filter((/** @type {any} */ p) => p.box);
      const box = withBox.length ? scales.map((/** @type {number} */ _, /** @type {number} */ i) => withBox.reduce((a, /** @type {any} */ p) => a + p.box[i] * p.nBox, 0) / withBox.reduce((a, /** @type {any} */ p) => a + p.nBox, 0)) : null;
      const withVar = parts.filter((/** @type {any} */ p) => p.blockVar);
      const blockVar = withVar.length ? scales.map((/** @type {number} */ _, /** @type {number} */ i) => withVar.reduce((a, /** @type {any} */ p) => a + p.blockVar[i], 0) / withVar.length) : null;
      const logb = scales.map((/** @type {number} */ b) => Math.log(b));
      const boxFit = box && scales.length >= 2 ? fitLine(logb, box) : null;
      const varFit = blockVar && scales.length >= 2 && blockVar.every((/** @type {number} */ v) => v > 0) ? fitLine(logb, blockVar.map((/** @type {number} */ v) => Math.log(v))) : null;
      const first = parts.find((/** @type {any} */ p) => p.final) ?? null;
      return {
        L, chains: parts.length, drives, zero: drives - nonzero, meanS, reference: ref?.value ?? null, residual: ref?.residual ?? null,
        size: dens("sHist"), area: dens("aHist"), duration: dens("tHist"), moments, maxS: Math.max(...parts.map((/** @type {any} */ p) => p.maxS)),
        heights: { freq: hcount.map((/** @type {number} */ v) => (htotal ? v / htotal : null)), mean: heights, exact: btwExact ? BTW_HEIGHTS : null,
          chains: hcount.map((/** @type {number} */ _, /** @type {number} */ h) => noRandom(between(parts.map((/** @type {any} */ p) => p.heights[h] / Math.max(1, p.heights.reduce((/** @type {number} */ a, /** @type {number} */ v) => a + v, 0))), true))) },
        density: [between(parts.map((/** @type {any} */ p) => p.density[0])), between(parts.map((/** @type {any} */ p) => p.density[1]))],
        balance: { added, lostEdge, lostBulk, massChange, exact: added === lostEdge + lostBulk + massChange },
        recurrent: parts[0].recurrent === null ? null : parts.filter((/** @type {any} */ p) => p.recurrent).length, burn: parts[0].burn,
        scales, box, boxFit, nBox: withBox.reduce((a, /** @type {any} */ p) => a + p.nBox, 0), blockVar, varFit,
        final: first?.final ?? null, footprint: first?.footprint ?? null, footprintSize: first?.maxS ?? null,
      };
    });
    const done = sizes.filter((/** @type {any} */ s) => s.chains);
    const sigma = ORDERS.map((q, i) => {
      const pts = done.filter((/** @type {any} */ s) => s.moments[i].est > 0);
      const fit = pts.length >= 2 ? fitLine(pts.map((/** @type {any} */ s) => Math.log(s.L)), pts.map((/** @type {any} */ s) => Math.log(s.moments[i].est)), pts.map((/** @type {any} */ s) => (s.moments[i].se ? s.moments[i].se / s.moments[i].est : null))) : null;
      return { q, fit };
    });
    const exactPts = done.filter((/** @type {any} */ s) => s.reference > 0);
    const exactFit = exactPts.length >= 2 ? fitLine(exactPts.map((/** @type {any} */ s) => Math.log(s.L)), exactPts.map((/** @type {any} */ s) => Math.log(s.reference))) : null;
    const exactSigma = exactPts.length >= 2 ? fitLine(exactPts.slice(-2).map((/** @type {any} */ s) => Math.log(s.L)), exactPts.slice(-2).map((/** @type {any} */ s) => Math.log(s.reference))) : null;
    const dFit = sigma.filter((x) => x.fit).length >= 2 ? fitLine(sigma.filter((x) => x.fit).map((x) => x.q), sigma.filter((x) => x.fit).map((x) => /** @type {any} */ (x.fit).slope)) : null;
    const rows = [];
    for (const s of done) {
      rows.push({ label: `Mean avalanche size ⟨s⟩ for each drive, L = ${s.L}`, unit: "topplings", ...s.meanS, n: s.chains, reference: s.reference,
        refHow: `exact: ⟨s⟩ = ${job.rule === "manna" ? "2 " : ""}${job.grains > 1 ? `${job.grains} ` : ""}${job.drive === "centre" ? "(Δ⁻¹·1) at the centre" : "mean of Δ⁻¹·1"} (Dhar 1990), by conjugate gradients to a relative residual below 10⁻¹²`, tags: ["observation", "theorem"] });
      if (s.heights.exact) s.heights.chains.forEach((/** @type {any} */ iv, /** @type {number} */ h) => rows.push({ label: `P(height ${h}) at the central sites, L = ${s.L}`, unit: "", ...iv, n: s.chains,
        reference: BTW_HEIGHTS[h], refHow: "exact on the infinite lattice (Priezzhev 1994; closed forms proved by Poghosyan, Priezzhev and Ruelle 2011, and by Kenyon and Wilson): a finite lattice differs near its boundary", tags: ["observation", "theorem"] }));
    }
    if (done.length >= 2) {
      const open = job.boundary === "open" && job.eps === 0, exact1 = exactFit !== null;
      sigma.forEach((x) => rows.push({ label: `Slope σ(${x.q}) of log ⟨s^${x.q}⟩ against log L`, unit: "", est: x.fit?.slope ?? null, lo: x.fit?.lo ?? null, hi: x.fit?.hi ?? null, how: x.fit ? `least squares over L = ${done.map((/** @type {any} */ s) => s.L).join(", ")}; the 95 % interval holds the Monte Carlo error only` : "needs 2 sizes", n: done.length,
        reference: x.q === 1 && exact1 ? /** @type {any} */ (exactFit).slope : null,
        refHow: x.q === 1 && exact1 ? `the same fit of the exact values of ⟨s⟩ (Dhar 1990). Their slope is ${exactSigma ? exactSigma.slope.toFixed(3) : "–"} between the two largest sizes${open ? "; ⟨s⟩ / L² tends to a constant as L → ∞, so the slope tends to 2" : ""}` : "no theorem: under simple finite-size scaling σ(q) = D(q + 1 − τ), which is a hypothesis",
        tags: x.q === 1 && exact1 ? ["observation", "numerical"] : ["observation"] }));
    }
    return { rows, sizes, sigma, exactFit, exactSigma, dFit, orders: ORDERS, btwExact, fixed };
  }

  /* ---------- the state of the page ---------- */

  /** The family of an example: "landscape" or "sandpile". @type {Record<string, string>} */
  const FAMILY = { "metastable-exit": "landscape", "annealing-schedules": "landscape", "tempering-wells": "landscape", "sandpile-btw": "sandpile", "finite-size": "sandpile", "coarse-graining": "sandpile" };

  /** 5 temperatures from lo to hi, equally spaced in 1/T, with 4 significant digits. @param {number} lo @param {number} hi */
  function ladder(lo, hi) {
    if (!(hi > lo)) return [lo, hi];
    return Array.from({ length: 5 }, (_, i) => +(1 / (1 / hi + (i * (1 / lo - 1 / hi)) / 4)).toPrecision(4)).reverse();
  }

  /** The sizes of finite-size scaling: 8, 16, ... up to the largest. @param {number} lmax */
  const fssSizes = (lmax) => [8, 16, 32, 64, 128].filter((L) => L <= lmax);

  /**
   * The job of a page state (the kit's ph_* fields and the seed). The temperatures of the exit times are hi to lo in
   * 1/T steps; the sizes of the finite-size experiment double from 8.
   * @param {Record<string, any>} s
   */
  function jobOf(s) {
    const ex = s.ph_example;
    if (ex === "metastable-exit") return { kind: "metastability", landscape: s.ph_land, temps: ladder(s.ph_tlo, s.ph_thi), steps: 2 ** s.ph_cap, reps: 2 ** s.ph_reps };
    if (ex === "annealing-schedules") return { kind: "annealing", landscape: s.ph_land, t0: s.ph_t0, tend: s.ph_tend, kappa: s.ph_kappa, steps: 2 ** s.ph_steps, reps: 2 ** s.ph_reps };
    if (ex === "tempering-wells") return { kind: "tempering", landscape: s.ph_land, tmin: s.ph_tmin, tmax: s.ph_tmax, replicas: s.ph_k, sweeps: 2 ** s.ph_steps, inner: s.ph_inner, start: s.ph_start, reps: 2 ** s.ph_reps };
    const sizes = ex === "finite-size" ? fssSizes(Number(s.ph_lmax)) : [s.ph_l];
    return { kind: "sandpile", rule: s.ph_rule, boundary: s.ph_bc, drive: s.ph_drive, grains: s.ph_g, eps: s.ph_eps, sizes, drives: 2 ** s.ph_drives, chains: 2 ** s.ph_chains };
  }

  /** The dynamics of a sandpile job in words, as the page states it beside the figures. @param {any} job */
  function dynamics(job) {
    const th = job.rule === "manna" ? 2 : 4;
    const rule = job.rule === "manna"
      ? "Manna rule: a site with 2 or more grains is unstable; it topples by giving 2 grains, each to one of its 4 neighbours chosen at random with probability 1/4."
      : "BTW rule (Bak, Tang and Wiesenfeld): a site with 4 or more grains is unstable; it topples by giving 1 grain to each of its 4 neighbours.";
    const boundary = job.boundary === "open" ? "Open boundary: a grain given past the edge leaves the lattice." : job.boundary === "closed" ? "Closed boundary: a grain given past the edge stays on the site that toppled." : "Periodic boundary: a grain given past the edge enters at the opposite edge.";
    const drive = `${job.drive === "centre" ? "Drive at the centre" : "Random drive"}: the page adds ${job.grains === 1 ? "1 grain" : `${job.grains} grains`} ${job.drive === "centre" ? "at the central site" : job.grains === 1 ? "at a site chosen uniformly at random" : "at sites chosen uniformly at random"}, then relaxes the lattice completely before the next drive (a slow drive).`;
    const loss = job.eps > 0 ? `Bulk dissipation: each grain that a toppling gives is lost with probability ε = ${job.eps}.` : "No bulk dissipation: grains leave only through the boundary.";
    const update = `Update: in each time step every site that is unstable at the start of the step topples once. The size s is the number of topplings, the area a the number of sites that toppled, and the duration T the number of time steps. A stable site holds 0 to ${th - 1} grains.`;
    return [rule, boundary, drive, loss, update];
  }

  /**
   * The plain-data report of the lab for the deck and the Markdown record: the example and its dynamics, the settings,
   * the results with their claim tags, and the limits of what a finite run shows.
   * @param {{ example: any, state: Record<string, any>, summary: any, status: string, errors: string[] }} o
   */
  function report(o) {
    const x = o.example, job = jobOf(o.state), sm = o.summary;
    const num = (/** @type {number | null | undefined} */ v) => (v === null || v === undefined || !Number.isFinite(v) ? "not available" : String(+v.toPrecision(4)));
    const cell = (/** @type {string} */ t) => String(t).replace(/\|/g, "/");
    const TAGS = /** @type {Record<string, string>} */ ({ theorem: "theorem", numerical: "numerical approximation", observation: "finite-run observation" });
    const meta = { title: "Monte Carlo Probability Workbench", subtitle: `Statistical-physics test: ${x.title}, seed ${o.state.seed}`, voice: "bf_emma" };
    const setup = [{ title: `The problem: ${x.title}`, body: `${x.problem}\n\nWhat to observe: ${x.observe}`, narration: x.problem },
      { title: "The dynamics", body: (job.kind === "sandpile" ? dynamics(job) : [x.assumptions]).map((t) => `- ${t}`).join("\n"), narration: "The page states the dynamics in full, because every result holds only for these dynamics." }];
    const settings = Object.entries(job).filter(([k]) => k !== "kind").map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("\n");
    const method = [{ title: "Settings", body: `${settings}\n- seed: ${o.state.seed}, generator Philox4x32-10 with named streams`, narration: `The run uses the seed ${o.state.seed}.` }];
    const results = [];
    if (o.errors.length) results.push({ title: "No run", body: o.errors.map((e) => `- ${e}`).join("\n"), narration: "The settings have errors, so the page did not run them." });
    else if (!sm) results.push({ title: "No run yet", body: "Run the experiment to fill this frame.", narration: "The page has no run yet." });
    else {
      const rows = ["| Quantity | Estimate | 95 % interval | Reference | Claim |", "| --- | --- | --- | --- | --- |"];
      for (const r of sm.rows) rows.push(`| ${cell(r.label)} | ${num(r.est)} | ${r.lo === null || r.lo === undefined ? cell(r.how) : `${num(r.lo)} to ${num(r.hi)}`} | ${num(r.reference)} | ${r.tags.map((/** @type {string} */ t) => TAGS[t]).join(", ")} |`);
      results.push({ title: `Results (${o.status}${sm.complete ? "" : ", partial"})`, body: rows.join("\n"), narration: `The table lists ${sm.rows.length} results, each with its claim.${sm.complete ? "" : " The run is not complete, so the values are partial."}` });
    }
    const checks = [{ title: "Limits", body: [`- ${x.interpretation}`, `- ${STATEMENT}`, "- Each estimate is a finite-run observation; a reference value states its own kind."].join("\n"), key: "A finite lattice does not establish a universality class.", narration: "A finite lattice does not establish a universality class. Read each estimate with its interval and its claim." }];
    return { meta, narration: `This deck reads the statistical-physics test ${x.title}.`, setup, method, results, checks };
  }
  const STATEMENT = "A finite lattice does not establish a universality class: an exponent or a collapse from a finite lattice is a finite-run observation.";

  /* ---------- helpers for the views ---------- */

  /** The height image of a lattice averaged over b x b blocks. @param {number[]} z @param {number} L @param {number} b */
  function coarse(z, L, b) {
    const w = Math.floor(L / b), out = new Float64Array(w * w);
    for (let j = 0; j < w * b; j++) for (let i = 0; i < w * b; i++) out[Math.floor(i / b) + w * Math.floor(j / b)] += z[i + L * j];
    for (let k = 0; k < out.length; k++) out[k] /= b * b;
    return { w, values: Array.from(out) };
  }

  /** The number of b x b boxes that hold at least one marked site, for each b. @param {ArrayLike<number>} marks @param {number} L @param {number[]} scales */
  function boxCount(marks, L, scales) {
    return scales.map((b) => {
      const w = Math.ceil(L / b), seen = new Uint8Array(w * w);
      let c = 0;
      for (let s = 0; s < L * L; s++) if (marks[s]) { const id = Math.floor((s % L) / b) + w * Math.floor(Math.floor(s / L) / b); if (!seen[id]) { seen[id] = 1; c++; } }
      return c;
    });
  }

  /** The data collapse: s^tau P(s) against s / L^D for each size. @param {any[]} sizes @param {number} tau @param {number} D */
  function collapse(sizes, tau, D) {
    return sizes.filter((s) => s.size?.length).map((s) => ({ L: s.L, x: s.size.map((/** @type {any} */ p) => p.x / s.L ** D), y: s.size.map((/** @type {any} */ p) => p.x ** tau * p.y) }));
  }

  return {
    FORMAT, VERSION, GRID, REPS, CHECKPOINTS, BINS, PER_OCTAVE, ORDERS, SCALES, SCHEDULES, BTW_HEIGHTS, LANDSCAPES,
    analyse, landscape, minimaxPath, coords, boltzmann, meanExitTime, walk, temperature,
    lattice, solveDelta, meanSize, recurrent, binOf, binRange, sandpileChain,
    FAMILY, ladder, fssSizes, jobOf, dynamics, report,
    prepare, block, empty, merge, summary, tQuantile, between, proportion, clt, fitLine, coarse, boxCount, collapse,
  };
});
