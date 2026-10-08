# Verification of the port

The laboratory sources, raw data and independent Python reference files came from the site copy. The former standalone repository is unavailable. Its original test files were not available for transfer.

## Current checks

- `tests/engine.test.mjs` runs the engine self-tests and checks agreement of the vacuum-polarization pipeline with its Birkhoff factors.
- `tests/reference.test.mjs` compares the vacuum-polarization pole, finite MS term, finite MS-bar term, and first Laurent coefficient with 3 independent Python reference cases.
- `reference/build_reference.py --check` checks that the stored reference values match their generator. The other reference groups remain available, but the new reference test does not compare them with the engine.
- `build.py --check` checks generated page freshness.
- The shared visual checks validate metadata, published requests, templates, themes, contrast, and unused code.
- `e2e/full.test.mjs` preserves the existing browser assertions for deep links, presentation controls, palette, reset, Markdown, and narrated exports.

The Chromium baseline and offline checks pass. Browser history and JSON state import/export retain their existing findings in `e2e/manifest.json`.

The scientific engines and Python references retain their original calculations. UI changes remove unused declarations and assignments, apply the shared site theme, and improve contrast of text and control outlines.

## Independent references

`reference/build_reference.py` recomputes key values in pure Python by different methods and
stores them in [reference.json](../reference/reference.json). All groups remain available. The table keeps the original comparison targets. Current tests compare only vacuum polarization with an absolute tolerance of 10⁻¹¹.

| Quantity | Python method | Original comparison target |
| --- | --- | --- |
| Laurent coefficients a₋₁, a₀, a₁ of Π₂(q²; ε) and the MS-bar part | closed-form coefficients of Γ(ε/2)X^{ε/2}, Simpson's rule in x | 10⁻¹⁰ to 10⁻⁸ relative |
| ¼∑\|𝓜\|² for e⁻μ⁻ → e⁻μ⁻ | Mandelstam closed form (below) | 10⁻⁹ |
| F₂(q²) | Simpson's rule on the reduced one-dimensional integral | 10⁻¹⁰ |
| Uehling correction | Simpson's rule after u = cosh s | 10⁻⁶ |
| Toy Birkhoff counterterms and γ₊(0) for ladders, the two-leaf tree and the crossed graph | exact rational Laurent arithmetic | 10⁻¹¹ |
| Spectrum of Δ for ρ = diag(0.5, 0.3, 0.2) | ratios p_i/p_j | 10⁻¹⁰ |
| Product-geometry spectrum | ±√(μ_k² + \|m\|²) with μ_k = (2/h)\|sin(πk/N)\| | 10⁻⁹ |
| Gaussian spectral action of the circle with flux | direct sum | 10⁻¹¹ |

## Reference derivations

**Tree-level e⁻μ⁻ → e⁻μ⁻.** With 𝓜 = (−ie)² [ū₃γ^μu₁] · (−ig_μν/q²) · [ū₄γ^νu₂] the spin average is
(e⁴/4t²) Tr[(p̸₃+m)γ^μ(p̸₁+m)γ^ν] Tr[(p̸₄+M)γ_μ(p̸₂+M)γ_ν]. Using
Tr[(p̸₃+m)γ^μ(p̸₁+m)γ^ν] = 4[p₃^μp₁^ν + p₃^νp₁^μ − g^{μν}(p₁·p₃ − m²)] and contracting,
¼∑|𝓜|² = (8e⁴/t²)[(p₁·p₂)(p₃·p₄) + (p₁·p₄)(p₂·p₃) − M²(p₁·p₃) − m²(p₂·p₄) + 2m²M²]
= (2e⁴/t²)[(s − Σ)² + (u − Σ)² + 2tΣ], Σ = m² + M². Massless limit 2e⁴(s² + u²)/t²
(Halzen & Martin). The engine instead sums 16 explicit spinor amplitudes.

**Vacuum polarization.** Peskin & Schroeder eq. 7.90 gives
Π₂ = −(8e²/(4π)^{d/2})μ^ε∫dx x(1−x)Γ(2 − d/2)Δ^{d/2−2}; with d = 4 − ε,
Π₂ = −(e²/2π²)∫dx x(1−x)Γ(ε/2)(4πμ²/Δ)^{ε/2}. The 1/ε residue is −2α/3π; the MS-bar
subtraction removes 2/ε − γ + log 4π, leaving (2α/π)∫x(1−x)log(Δ/μ²), whose μ-derivative is
−2α/3π; at μ = m it equals the on-shell subtraction (eq. 7.91).

**β from the counterterm.** With e₀ = μ^{ε/2}Z₃^{−1/2}e (Ward identity Z₁ = Z₂) and
Z₃ = 1 + z(e)/ε, μ-independence of e₀ gives β = −εe/2 − (e²/4)z′(e) + …; with
z = −e²/6π² this is β = e³/12π² at ε → 0. The engine differentiates its own computed residue.

**Mass running.** μ dm/dμ = −(3α/2π)m and μ dα/dμ = 2α²/3π give m ∝ α^{−9/4}.

**Toy Birkhoff.** φ(T)(ε) = e^{−|T|εL}/(T! ε^{|T|}). For the n-ladder the recursion gives
γ₋ = (−1)ⁿ/(n! εⁿ) (independent of L) and γ₊(0) = (−L)ⁿ/n!; for example, ladder 2:
φ = 1/(2ε²) − L/ε + L² + …, γ₋(•) = −1/ε, R̄ = φ(ℓ₂) + γ₋(•)φ(•) = −1/(2ε²) + L²/2 + O(ε),
so γ₋(ℓ₂) = 1/(2ε²) and γ₊(ℓ₂)(0) = L²/2. The scale derivative obeys
d/dL γ₊(ℓ_n) = −γ₊(ℓ_{n−1}).

**Doubled ring.** With π(a, b) = diag(a, b), D = H₀ ⊕ H₀ and J(ξ, η) = (η̄, ξ̄),
JAJ⁻¹ = diag(Ā₂, Ā₁), so D_A = (H₀ + A₁ + Ā₂) ⊕ (H₀ + A₂ + Ā₁): the antiparticle copy
carries the conjugate link phases. Its spectrum is 2t cos((2πk ± Φ)/N). With one copy and
J = complex conjugation, A + JAJ⁻¹ = A + Ā is real (the phase cancels).

**Tomita–Takesaki.** On H = M_n with Ω = ρ^{1/2}: S X = ρ^{−1/2}X*ρ^{1/2}; writing S = K∘T
(K entrywise conjugation), Δ = T*T, which equals X ↦ ρXρ⁻¹, and J = SΔ^{−1/2} is X ↦ X*.

## Literature values quoted, not computed

Counts of QED g − 2 graphs (1, 7, 72, 891, 12 672; Aoyama, Hayakawa, Kinoshita & Nio 2012);
the measured a_e (Fan et al. 2023); the two-loop β coefficient α³/2π² (Jost & Luttinger 1950);
δ₂ and Z_m in Feynman gauge (Peskin & Schroeder §10.3); the product-geometry distance
√(d² + |m|⁻²) (Martinetti & Wulkenhaar 2002); Bisognano–Wichmann; the type III₁ property of
local algebras (Buchholz, D'Antoni & Fredenhagen 1987; Yngvason 2005); the spectral Standard
Model (Chamseddine, Connes & Marcolli 2007). Each is marked as quoted where it appears.

