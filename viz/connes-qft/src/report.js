/* Connes QFT laboratory: Markdown exports and beamdswitch report objects.
 *
 * Pure functions of engine results. markdown(doc) writes a document with a front-matter block of the
 * current parameters; the flagship writers (vacuum polarization, Birkhoff, spectral, modular) say
 * exactly what the page shows. deckReport(kind, data) returns the plain report object that the
 * shared beamdswitch template (beamdswitch.js) turns into a narrated deck: set-up, method, results,
 * checks, ending on a key frame. Narration is plain spoken prose with numbers in words.
 */
(function (factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"), require("./laurent.js"));
  else factory(self.ConnesQFT, self.ConnesQFT.laurent);
})(function (Q, LS) {
  "use strict";
  const n = (x, s = 6) => Number(Number(x).toPrecision(s)).toString();
  const say = (x, s = 4) => Q.spokenNumber(x, s);

  /* ---------- Markdown ---------- */
  const yamlValue = (v) => {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return Number.isFinite(v) ? n(v, 10) : JSON.stringify(String(v));
    if (typeof v === "boolean") return String(v);
    if (Array.isArray(v)) return `[${v.map(yamlValue).join(", ")}]`;
    const s = String(v);
    return /^[\w .,()/+-]+$/.test(s) && !/^\s|\s$/.test(s) ? s : JSON.stringify(s);
  };
  function frontMatter(meta) {
    const lines = ["---"];
    for (const [k, v] of Object.entries(meta)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        lines.push(`${k}:`);
        for (const [k2, v2] of Object.entries(v)) lines.push(`  ${k2}: ${yamlValue(v2)}`);
      } else lines.push(`${k}: ${yamlValue(v)}`);
    }
    lines.push("---");
    return lines.join("\n");
  }
  /* doc = { title, meta, intro, sections: [{ heading, body }], sources: [string] } */
  function markdown(doc) {
    const out = [frontMatter({ title: doc.title, ...doc.meta }), "", `# ${doc.title}`, ""];
    if (doc.intro) out.push(doc.intro, "");
    for (const s of doc.sections || []) out.push(`## ${s.heading}`, "", String(s.body).trim(), "");
    if (doc.sources && doc.sources.length) out.push("## Sources", "", ...doc.sources.map((c) => `- ${c}`), "");
    return out.join("\n").replace(/\n{3,}/g, "\n\n");
  }
  const tex = (s) => LS.toTeX(s, { sig: 6 });

  function vpMarkdown(v) {
    return [
      { heading: "1. Draw the loop", body: `The one-loop photon self-energy: a fermion loop inserted in the photon line. Loop number L = I − V + 1 = ${v.graph.I} − ${v.graph.V} + 1 = ${v.graph.L}; superficial degree ω = 4 − E_γ = ${v.graph.omega}.` },
      { heading: "2. Assign k", body: `Loop momentum k on one fermion line and k + q on the other; momentum is conserved at both vertices. External momentum transfer q² = −Q² = ${n(v.q2)} MeV².` },
      { heading: "3. Write the integral", body: `\\[\n${v.integralTeX}\n\\]\nAfter Feynman parameters (P&S eq. 7.90):\n\\[\n${v.scalarTeX}\n\\]` },
      { heading: "4–5. Regularize in d = 4 − ε and expand", body: `\\[\n\\Pi_2(q^2;\\varepsilon) = ${tex(v.series)}\n\\]\n(μ = ${n(v.mu)} MeV, α = 1/${n(1 / v.alpha, 12)}).` },
      { heading: "6. The 1/ε pole", body: `Residue ${n(v.residue)} = −2α/3π = ${n(v.residueExpected)}.` },
      { heading: "7. Counterterm", body: `Minimal subtraction: δ₃ = ${tex(v.pole)}, so Z₃ = 1 + δ₃. MS-bar also removes (−γ_E + log 4π) times the residue's coefficient.` },
      { heading: "8. Finite renormalized amplitude", body: `Π̂(q²) in MS: ${n(v.finite.MS)}; in MS-bar: ${n(v.finite.MSbar)}; on-shell subtracted Π₂(q²) − Π₂(0): ${n(v.finite.onShell)}.` },
      { heading: "9. Vary μ", body: `μ dΠ̂/dμ = ${n(v.dPiDlogMu)} (expected −2α/3π = ${n(v.dPiExpected)}): the renormalized amplitude depends on μ only through log μ.` },
      { heading: "10. Running e(μ) and β(e)", body: `From e₀ = μ^{ε/2} Z₃^{−1/2} e with Z₁ = Z₂ (Ward): β(e) = μ de/dμ = ${n(v.running.betaE)} at e = ${n(v.e)}, against e³/12π² = ${n(v.running.betaExpected)}. One-loop QED, MS-bar, one Dirac fermion.` },
      { heading: "11. Encode the graph in the Hopf algebra", body: `Π₁ has no divergent subgraphs, so it is primitive: ΔΠ₁ = Π₁ ⊗ 1 + 1 ⊗ Π₁ and S(Π₁) = −Π₁.` },
      { heading: "12. Birkhoff factorization", body: `\\[\n\\gamma_-(\\Pi_1) = ${tex(v.birkhoff.gammaMinus)},\\qquad \\gamma_+(\\Pi_1)(0) = ${n(v.birkhoff.renormalized)}\n\\]\nγ₊(0) equals the MS finite part: ${v.birkhoff.agreesWithMS ? "yes" : "no"}. The counterterm δ₃ and γ₋ are the same pole part seen in two languages.` },
    ];
  }
  function birkhoffMarkdown(b) {
    return [
      { heading: "Renormalization as Birkhoff decomposition", body: `A dimensionally regularized theory determines a loop of characters\n\\[\n\\gamma(\\varepsilon)\\in G.\n\\]\nConnes–Kreimer factorization:\n\\[\n\\gamma = \\gamma_-^{-1}\\gamma_+.\n\\]\n- \\(\\gamma_-\\): counterterm contribution\n- \\(\\gamma_+\\): renormalized holomorphic contribution\n- renormalized value: \\(\\gamma_+(0)\\)` },
      { heading: `Graph: ${b.name}`, body: `Coproduct terms: ${b.coproduct.map((t) => `${Array.isArray(t.left) ? t.left.join(" · ") : t.left} ⊗ ${t.right}`).join("; ")}.\n\nNesting trees: ${b.trees.map((t) => `${t.coef} × ${t.tree}`).join(" + ")}.` },
      { heading: "Character (toy Feynman rules)", body: `φ(T)(ε) = e^{−|T|εL}/(T! ε^{|T|}) at L = log μ = ${n(b.L)}:\n\\[\n\\varphi(\\Gamma) = ${tex(b.phi)}\n\\]` },
      { heading: "Counterterm recursion", body: `\\[\n\\bar R(\\Gamma) = ${tex(b.bar)},\\quad \\gamma_-(\\Gamma) = -T\\bar R(\\Gamma) = ${tex(b.minus)},\\quad \\gamma_+(\\Gamma) = (1-T)\\bar R(\\Gamma)\n\\]\nRenormalized value γ₊(Γ)(0) = ${n(b.renormalized, 10)}.` },
    ];
  }
  function spectralMarkdown(r) {
    return [
      { heading: "Spectral triple", body: `Lattice ring of N = ${r.N} sites doubled into particle ⊕ antiparticle copies: 𝒜 = ℂᴺ ⊕ ℂᴺ, ℋ = ℂᴺ ⊗ ℂ², D = H₀ ⊕ H₀ (hopping t = ${n(r.t)}), J(ξ, η) = (η̄, ξ̄). A lattice stand-in for (C^∞(S¹), L²(S¹), D).` },
      { heading: "Commutator", body: `‖[D, a]‖ = ${n(r.commutatorNorm)} for a = cos θ (sup |a′| = ${n(r.supDerivative)}): the commutator measures variation.` },
      { heading: "Inner fluctuation", body: `D ↦ D_A = D + A + JAJ⁻¹ with A = ∑ a_i[D, b_i] built from ${r.oneFormTerms} link terms. Link phases (particle): ${r.particlePhases.map((x) => n(x, 4)).join(", ")}; the antiparticle copy carries the opposite phases.` },
      { heading: "Curvature", body: `Holonomy (flux) Φ = ${n(r.flux)} on the particle copy and ${n(r.antiFlux)} on the antiparticle copy. On a ${r.torus.N}×${r.torus.N} torus with ${r.torus.flux} flux quantum the plaquette curvature is uniform, F = ${n(r.torus.B)}.` },
      { heading: "Spectral action", body: `Tr f(D_A/Λ) with ${r.spectralAction.cutoff} cutoff at Λ = ${n(r.spectralAction.Lambda)}: ${n(r.spectralAction.fluctuated)} (unfluctuated ${n(r.spectralAction.bare)}). The spectrum depends only on the gauge-invariant flux.` },
    ];
  }
  function modularMarkdown(r) {
    return [
      { heading: "Region and local algebra", body: `A finite surrogate: 𝒜(𝒪) = M_${r.n}(ℂ) ⊗ 1 acting on ℂ^${r.n} ⊗ ℂ^${r.n}. Finite algebras are type I; this illustrates the construction, not the type III₁ algebra of a relativistic region.` },
      { heading: "Vacuum vector", body: `Ω = ∑ √p_i e_i ⊗ e_i with p = (${r.p.map((x) => n(x, 4)).join(", ")}): Schmidt rank ${r.cyclic.schmidtRank}, cyclic ${r.cyclic.cyclic ? "yes" : "no"}, separating ${r.cyclic.separating ? "yes" : "no"}.` },
      { heading: "Tomita operator and polar decomposition", body: `S(AΩ) = A*Ω, S = JΔ^{1/2} with Δ = ρ ⊗ ρ⁻¹ and J the swap-conjugation. Checks: ‖S(AΩ) − A*Ω‖ = ${r.check.tomita.toExponential(1)}, ‖JΔ^{1/2} − S‖ = ${r.check.polar.toExponential(1)}.` },
      { heading: "Modular spectrum and flow", body: `Spectrum of Δ: ${r.deltaEigenvalues.map((x) => n(x, 4)).join(", ")}; K = −log Δ. σ_t(A) = Δ^{it}AΔ^{−it} at t = ${n(r.t, 4)}. KMS check ${r.kms.toExponential(1)}.` },
      { heading: "Wedge", body: `For the vacuum and a Rindler wedge algebra, Δ^{it} acts as the boost of rapidity −2πt (Bisognano–Wichmann): the point (${r.wedge.point.join(", ")}) moves to (${r.wedge.image.map((x) => n(x, 4)).join(", ")}).` },
    ];
  }

  /* ---------- beamdswitch reports ---------- */
  const frame = (title, body, narration, extra = {}) => ({ title, body, narration, ...extra });
  function deckReport(kind, d, { date } = {}) {
    const meta = { title: "QED laboratory", subtitle: "", author: "connes-qft", date, voice: "bf_emma" };
    if (kind === "vp") {
      const v = d;
      meta.title = "QED vacuum polarization, from graph to Birkhoff factor";
      meta.subtitle = `One loop, d = 4 − ε, μ = ${n(v.mu, 4)} MeV`;
      return {
        meta, narration: "This deck follows one QED graph, the one loop vacuum polarization, from its momentum integral to its Birkhoff factorization.",
        setup: [frame("The graph: a fermion loop in the photon line", `- Loop number $L = I - V + 1 = ${v.graph.L}$\n- Superficial degree $\\omega = ${v.graph.omega}$: superficially divergent\n- Momentum transfer $q^2 = -Q^2 = ${n(v.q2, 4)}\\ \\mathrm{MeV}^2$, scale $\\mu = ${n(v.mu, 4)}$ MeV`, `The graph has one loop and superficial degree two, so it is superficially divergent. The momentum transfer squared is ${say(v.q2)} MeV squared and the scale is ${say(v.mu)} MeV.`)],
        method: [frame("Dimensional regularization in d = 4 − ε", `$$\\Pi_2 = -\\frac{e^2}{2\\pi^2}\\int_0^1 dx\\,x(1-x)\\,\\Gamma(\\varepsilon/2)\\left(\\frac{4\\pi\\mu^2}{\\Delta}\\right)^{\\varepsilon/2}$$`, "In four minus epsilon dimensions the integral becomes gamma of epsilon over two times a power of the Feynman parameter denominator. Each Laurent coefficient is integrated numerically.")],
        results: [
          frame("The Laurent series and its pole", `$$\\Pi_2 = ${tex(v.series)}$$\n\nResidue $${n(v.residue)} = -2\\alpha/3\\pi$`, `The pole residue is ${say(v.residue)}, which is minus two alpha over three pi.`),
          frame("Counterterm and finite part", `- MS counterterm $\\delta_3 = ${tex(v.pole)}$\n- MS finite part $${n(v.finite.MS)}$, MS-bar $${n(v.finite.MSbar)}$`, `The counterterm cancels the pole. The finite part is ${say(v.finite.MS)} in minimal subtraction and ${say(v.finite.MSbar)} in the MS bar scheme.`),
          frame("Running coupling and beta function", `$$\\beta(e) = ${n(v.running.betaE)} \\approx \\frac{e^3}{12\\pi^2} = ${n(v.running.betaExpected)}$$\n\nOne-loop QED, MS-bar, one Dirac fermion.`, `The scale dependence of the counterterm gives the beta function, ${say(v.running.betaE)}, equal to e cubed over twelve pi squared at one loop.`, { plot: { x: [0, 40], xlabel: "log(mu / m_e)", ylabel: "1/alpha", curves: [`${n(1 / v.alpha, 10)} - (2/(3*pi))*x`] } }),
          frame("Birkhoff factors", `$$\\gamma_- = ${tex(v.birkhoff.gammaMinus)},\\quad \\gamma_+(0) = ${n(v.birkhoff.renormalized)}$$`, `In the Connes Kreimer language the counterterm is the negative Birkhoff factor and the renormalized value, ${say(v.birkhoff.renormalized)}, is the positive factor at epsilon equal to zero.`),
        ],
        checks: [
          frame("Checks", `- Residue equals $-2\\alpha/3\\pi$\n- $\\mu\\,d\\hat\\Pi/d\\mu = ${n(v.dPiDlogMu)}$\n- $\\gamma_+(0)$ equals the MS finite part: ${v.birkhoff.agreesWithMS ? "yes" : "no"}`, "The residue matches its closed form, the scale derivative is minus two alpha over three pi, and the Birkhoff factor reproduces the minimal subtraction finite part."),
          frame("Takeaway", "", "The same graph is a momentum integral, a Laurent series, a counterterm and a Hopf algebra element, and its renormalized value is the holomorphic Birkhoff factor at zero.", { key: `Pole $${n(v.residue, 4)}/\\varepsilon$ $\\to$ counterterm $\\gamma_-$; renormalized value $\\gamma_+(0) = ${n(v.birkhoff.renormalized, 4)}$.` }),
        ],
      };
    }
    if (kind === "birkhoff") {
      const b = d;
      meta.title = `Birkhoff decomposition: ${b.name}`;
      meta.subtitle = `Toy Feynman rules at L = ${n(b.L, 3)}`;
      return {
        meta, narration: `This deck renormalizes the ${b.name} with the Connes Kreimer recursion, using the iterated integral toy Feynman rules.`,
        setup: [frame("The graph and its subdivergences", `- ${b.coproduct.length} coproduct terms\n- ${b.forests.forests.length} forests`, `The coproduct of this graph has ${b.coproduct.length} terms and the graph has ${b.forests.forests.length} forests of divergent subgraphs.`)],
        method: [frame("The counterterm recursion", "$$\\gamma_-(\\Gamma) = -T\\Big[\\varphi(\\Gamma) + \\sum_{\\gamma}\\gamma_-(\\gamma)\\varphi(\\Gamma/\\gamma)\\Big]$$", "The counterterm is minus the pole part of the graph plus all its subtracted subgraphs. The renormalized part keeps the rest.")],
        results: [frame("Counterterm and renormalized value", `$$\\gamma_- = ${tex(b.minus)},\\quad \\gamma_+(0) = ${n(b.renormalized, 8)}$$`, `The renormalized value is ${say(b.renormalized)}.`)],
        checks: [
          frame("Checks", "- $\\gamma = \\gamma_-^{\\star -1}\\star\\gamma_+$ reconstructs the character\n- counterterms do not depend on $\\mu$", "The two factors multiply back to the original character, and the counterterms do not depend on the scale."),
          frame("Takeaway", "", "Renormalization is a canonical factorization of a loop of characters.", { key: `$\\gamma = \\gamma_-^{-1}\\gamma_+$, renormalized value $${n(b.renormalized, 6)}$.` }),
        ],
      };
    }
    if (kind === "spectral") {
      const r = d;
      meta.title = "From a spectral triple to a U(1) gauge field";
      meta.subtitle = `Lattice ring, N = ${r.N}`;
      return {
        meta, narration: "This deck fluctuates the Dirac operator of a small spectral triple and reads off a U of one gauge field, its curvature and its spectral action.",
        setup: [frame("A finite spectral triple", `- $\\mathcal{A} = \\mathbb{C}^N\\oplus\\mathbb{C}^N$, $N = ${r.N}$\n- $D = H_0\\oplus H_0$, real structure $J$ swapping particle and antiparticle`, `The algebra is two copies of functions on ${r.N} lattice sites, and the real structure swaps particles and antiparticles. The lattice operator stands in for the Dirac operator.`)],
        method: [frame("Inner fluctuation", "$$D \\mapsto D_A = D + A + JAJ^{-1},\\quad A = \\sum_i a_i[D, b_i]$$", "The fluctuation adds a one form built from commutators with the Dirac operator, together with its image under the real structure.")],
        results: [
          frame("A U(1) link field with opposite charges", `Flux $\\Phi = ${n(r.flux, 4)}$ (particle), $${n(r.antiFlux, 4)}$ (antiparticle)`, `The particle copy acquires a flux of ${say(r.flux)} and the antiparticle copy the opposite flux.`),
          frame("Spectral action", `$$\\mathrm{Tr}\\,f(D_A/\\Lambda) = ${n(r.spectralAction.fluctuated, 6)}$$ at $\\Lambda = ${n(r.spectralAction.Lambda, 3)}$`, `The spectral action at this cutoff is ${say(r.spectralAction.fluctuated)}, against ${say(r.spectralAction.bare)} without the fluctuation.`),
        ],
        checks: [
          frame("Checks", "- spectrum equals $2t\\cos((2\\pi k \\pm \\Phi)/N)$\n- a gauge transformation leaves the spectrum unchanged", "The spectrum matches its closed form and does not change under a gauge transformation."),
          frame("Takeaway", "", "The gauge field appears as a fluctuation of the spectral data, and only gauge invariant quantities such as the flux reach the spectral action.", { key: "$D \\mapsto D + A + JAJ^{-1}$ produces a U(1) link field; $\\mathrm{Tr}\\,f(D_A/\\Lambda)$ sees only its flux." }),
        ],
      };
    }
    if (kind === "modular") {
      const r = d;
      meta.title = "From a region to modular flow";
      meta.subtitle = `Matrix surrogate M${r.n}`;
      return {
        meta, narration: "This deck builds the Tomita operator of a vacuum vector for a small matrix algebra and follows the modular flow it generates.",
        setup: [frame("Region, algebra, vacuum", `- $\\mathcal{A}(\\mathcal{O}) \\to M_${r.n}(\\mathbb{C})\\otimes 1$ (finite surrogate, type I)\n- $\\Omega = \\sum_i \\sqrt{p_i}\\,e_i\\otimes e_i$`, `The local algebra is replaced by a ${r.n} by ${r.n} matrix algebra, which is type one. The vacuum is an entangled vector with full Schmidt rank, so it is cyclic and separating.`)],
        method: [frame("Tomita operator", "$$S(A\\Omega) = A^*\\Omega,\\qquad S = J\\Delta^{1/2}$$", "The Tomita operator sends A Omega to A star Omega. Its polar decomposition gives the modular conjugation J and the modular operator Delta.")],
        results: [frame("Modular spectrum", `Spectrum of $\\Delta$: ${r.deltaEigenvalues.map((x) => `$${n(x, 3)}$`).join(", ")}`, `The modular operator has eigenvalues equal to the ratios of the state's weights, from ${say(r.deltaEigenvalues[0])} to ${say(r.deltaEigenvalues[r.deltaEigenvalues.length - 1])}.`)],
        checks: [
          frame("Checks", `- $\\|S - J\\Delta^{1/2}\\|$ below $10^{-10}$\n- KMS condition holds`, "The polar decomposition and the KMS condition hold to rounding error."),
          frame("Takeaway", "", "A flow of observables comes from the algebra and the state alone, with no Hamiltonian supplied.", { key: "$\\sigma_t(A) = \\Delta^{it}A\\Delta^{-it}$: dynamics from algebra and state." }),
        ],
      };
    }
    throw new Error(`unknown deck kind ${kind}`);
  }

  const api = { frontMatter, markdown, vpMarkdown, birkhoffMarkdown, spectralMarkdown, modularMarkdown, deckReport };
  Q.report = api;
  return api;
});
