// Write raw.json (published as data.json) from the curriculum, so the metadata never drifts from the
// lessons the page teaches:  node raw.mjs > raw.json
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("./lessons.js");

export function rawData() {
  return {
    title: "Generating Functions Lab",
    url: "https://teoyujie.org/visuals/generating-functions",
    summary: "Generating functions as a calculus for discrete structures: problem, discrete object, encode, manipulate, read coefficient, answer, verify.",
    conventions: {
      ogf: "A(x) = Σ aₙxⁿ; [xⁿ]A(x) = aₙ",
      egf: "A(x) = Σ aₙxⁿ/n!; strips show the counts aₙ",
      dft: "Â_k = A(ω^k) with ω = e^{2πi/N}; aₙ = (1/N) Σ_k A(ω^k) ω^{−kn}. numpy.fft uses e^{−2πi/N}, so its entry k is entry N − k here.",
      fibonacci: "F₀ = 0, F₁ = 1; the strip 1, 1, 2, 3, 5, 8 is aₙ = Fₙ₊₁",
      exactness: "Counting uses exact integers and rationals; roots-of-unity values are exact in ℤ[ζ_N]; floating point only for pictures and asymptotics, with stated tolerances.",
    },
    levels: L.LESSONS.map((l) => ({ level: l.level, id: l.id, fragment: `#${l.hash}`, aliases: (l.aliases || []).map((a) => `#${a}`), title: l.title, branch: l.branch, techniques: l.techniques, gf_type: l.gfType, when_to_use: l.when, key: l.key, optional: !!l.optional })),
    problems: L.PROBLEMS.map((p) => ({ k: p.k, fragment: `#problem-${p.k}`, title: p.title, technique: p.technique, difficulty: p.difficulty, lesson: L.lesson(p.lesson).hash, problem: p.problem })),
    techniques: L.TECHNIQUES.map((t) => ({ technique: t, lesson: L.techniqueLesson(t).hash })),
    pages: ["#problems", "#compare", "#fourier", "#sandbox", "#map", "#techniques", "#confusions"],
    spec_corrections: [
      "Spec §2 and Level 2 call 1, 1, 2, 3, 5, 8 'Fibonacci(n)'; with F₀ = 0 (as Level 5 uses) that strip is aₙ = Fₙ₊₁, so the lab labels it that way.",
      "Spec §16 uses ω = i for N = 4, i.e. ω = e^{+2πi/N}; the lab keeps that sign and notes that numpy's fft (e^{−2πi/N}) lists A(−i) = −2 + 2i where the lab lists A(i) = −2 − 2i.",
      "Spec §12's example '21' is [x⁷] of 1/(1 − x − x²) (compositions of 7 into 1s and 2s); the symbolic-method lesson opens on exactly that case.",
    ],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(JSON.stringify(rawData(), null, 2) + "\n");
