<!-- The domain specification of this visual, as the owner wrote it (5 October 2026), with the decisions of the agreed build plan. -->

# Monte Carlo Probability Workbench: specification

Status: the owner approved the build plan on 5 October 2026. This document is the specification of all 10 groups; each group ships as its own pull request, in the order below. Groups 1 to 3 are on the page.

## Agreed decisions

1. **Pull requests:** ten, one for each group, in merge order. This page states which groups are here and which are still to come.
2. **Deploy:** after each merged group. For example, group 1 merges, and the discrete-law workbench goes live with a list of the groups still to come.
3. **Workflows:** each law gets three workflows of its own. A workflow that uses several laws counts only for the law it belongs to.
4. **Data:** synthetic data name their generating model. A few public-domain real datasets with their source and date also appear, such as an annual rainfall-maximum series for the extreme-value workflows.
5. **Language:** the ASD-STE100 checker, then a separate agent review, in each pull request. The owner's review is the final one. The page claims no certified conformance.

## Groups in merge order

| Group | Content |
| --- | --- |
| 1 | Core and the discrete laws: the three panels, the Philox4x32-10 streams and the worker pool, the expression parser, model record version 1 with its graph and equations, the expert editor and the examples, the 10 discrete laws, independent sampling, the inverse transform and rejection sampling, the core diagnostics and claim tags, the plots and controls, the LLN, CLT and Monte Carlo panels, the records and exports, the search and the measured limits |
| 2 | The continuous laws, with stratification, antithetic variables, control variates and common random numbers |
| 3 | The positive, heavy-tailed and extreme-value laws, censored observations, and the theory of tails and extremes |
| 4 | Constructed laws and custom inputs with their checks |
| 5 | Dependence and processes, with multilevel Monte Carlo |
| 6 | The guided interview, the third entry point |
| 7 | Rare events and the catastrophe and ruin test |
| 8 | Markov chain, sequential and quasi-Monte Carlo methods |
| 9 | The statistical-physics test: energy landscape, annealing, tempering and the sandpile |
| 10 | Local data assessment and the final acceptance gate over the whole scope |

## Group 1: what done means

- One folder, `viz/monte-carlo-workbench/`, with a stdlib `build.py`; no change to shared tooling or other visuals.
- `python3 build.py --verify`, `python3 scripts/check.py monte-carlo-workbench` and `python3 scripts/check_repo.py` pass.
- The browser checks pass at 390, 768 and 1440 px in both themes, from `file://` with no request.
- A coverage test reads the catalogue: each law has its parts, a behaviour experiment and three workflows of its own; each workflow has its 7 parts; each method has its 6 parts; each theory panel has its 6 parts.
- Each sampler meets an independent analytical reference in a test with 3 or more fixed seeds and a stated false-failure bound.
- The same seed and settings give the same run record; 1 and 4 workers give the same results; a cancelled run reports no partial result as complete.

## Group 2: what done means

- The 13 continuous laws (uniform, normal, multivariate normal, exponential, gamma, Erlang, beta, Dirichlet, chi-square, Student's t, F, logistic and Laplace), each with its convention, support, limiting cases, moment conditions, transforms, sampling methods and two-way links, a behaviour experiment and three workflows of its own in different domains.
- Stratification, antithetic variables, control variates and common random numbers, each with its estimator, assumptions, settings, a suitable example, a failure example and a comparison with independent sampling. The page measures the variance ratio of each method against independent sampling with the same number of evaluations, and of common random numbers against separate streams.
- Reference values: closed forms, linearity of expectation, and adaptive quadrature over the quantile functions of at most 2 continuous variables within a fixed work budget. A model outside these has no reference, and the page says why.
- The results of group 1 stay the same: the same estimates, intervals, references and decisions for the same seed.
- The done criteria of group 1 hold for the whole folder: the builder, the checks, the browser checks at 390, 768 and 1440 px in both themes, the catalogue coverage test, the sampler tests with 3 or more seeds and stated false-failure bounds, and the determinism tests, with 1 and 4 workers, of each method.

## Group 3: what done means

- The 16 positive, heavy-tailed and extreme-value laws (lognormal, Weibull, inverse Gaussian, Gompertz, log-logistic, Pareto I and II, Burr XII, Fréchet, Cauchy, Lévy, the stable laws in Nolan's S0 parameterisation with S1 beside them, GEV, GPD, Gumbel and reverse Weibull), each with its convention, support, limiting cases, moment conditions, transforms, sampling methods and two-way links, a behaviour experiment and three workflows of its own in different domains.
- Censoring as an observation mechanism of the model record (`censoring: right T by C` and `left T by C`), with its catalogue entry, an experiment and three workflows, and the Kaplan–Meier estimate in the expression language.
- Tail plots (the survival function on log–log axes, with the slope of a regularly varying tail), and maxima and sums experiments with the exact laws of a maximum, a minimum, a sum of stable values and an affine function of draws as references.
- The theory panels on regular variation and subexponentiality, on extreme-value limits and domains of attraction, and on threshold exceedances, maxima and sums.
- A public-domain series of annual maxima of daily rainfall (Fort Collins, NOAA GHCN-Daily) with its GEV and Gumbel fits by maximum likelihood, used by an extreme-value workflow.
- A moment that does not exist on either side, such as the mean of the Cauchy law, shows as "does not exist", not as +∞.
- The done criteria of groups 1 and 2 hold for the whole folder, and their results stay the same.

## Group 4: what done means

- The constructed laws: finite mixtures (`mixture_F`), compound Poisson sums (`compound_F`), empirical discrete laws (`empirical`), kernel density models (`kde`) and truncated laws (`truncated_F`), for a family F of the catalogue or a custom law, each with its convention, support, limiting cases, moment conditions, transforms, sampling methods and two-way links, a behaviour experiment and three workflows of its own in different domains.
- Custom laws from one line of the model text: a PDF, a log-PDF, an unnormalised density, a PMF, a finite table, a CDF, a quantile function, an MGF or a characteristic function, with parameters, support, constraints (`where`) and observations (`obs`). Expressions go through the parser, so an input cannot run code.
- The checks of normalisation, non-negativity, monotonicity, boundaries, parameter constraints and consistency, and of the observations, where they apply; each shows checked, failed or unverified with how the page tested it. A law with a failed check does not run.
- The sampling label exact, approximate or unavailable for each method, the approximation controls and the numerical error sources on screen, and the alerts: an MGF need not exist, a finite numerical integral does not prove that a moment exists, and numerical checks do not prove that an expression defines a law.
- A custom law on an unbounded support has unknown moments: the page shows them as unknown, never as numbers.
- An example of each input kind, and three inputs that fail a check.
- The done criteria of groups 1 to 3 hold for the whole folder, and their results stay the same.

## Group 5: what done means

- Conditional models, and the Gaussian, Student t, Clayton, Gumbel and Frank copulas, each in its valid parameter and dimension domain: the page refuses a parameter outside the domain, and it names a valid parameter that it cannot sample. Each copula states Kendall's tau and its tail coefficients, and a variable of any scalar law takes its margin through `u = U[j]` (Sklar's theorem).
- The process library: Brownian motion, geometric Brownian motion, the Ornstein–Uhlenbeck process, the Poisson and compound Poisson processes, finite-state Markov chains, the Galton–Watson branching process, the Hawkes process and the variance-gamma Lévy process. Each states its stationarity, stability, explosion, boundary and discretisation conditions at the parameters in force, with exact samplers where they exist, thinning for the point processes, and the Euler time discretisation as the method `euler`.
- Each copula, each process and the conditional models have a behaviour experiment and three workflows of their own, in different domains, with at least one quantity with a reference value.
- Sample paths, the ensemble bands of the whole run (from mergeable counts) and first passages; the copula scatter.
- Multilevel Monte Carlo with coupled coarse and fine paths (`coarsen`), levels with independent seeds, the sample sizes of Giles's algorithm, and the bias estimate kept apart from the Monte Carlo interval. A continuous-time reference of a grid quantity is marked as such, so its difference from the run reads as a discretisation bias.
- The ergodicity, mixing and time-versus-ensemble panel, with Sklar's theorem and the multilevel complexity theorem.
- The measured limits of paths and copulas, and the done criteria of groups 1 to 4 for the whole folder, with their results the same.

# The owner's specification

## Part 1. The workbench connects probability theory to decisions

### A practical problem defines the simulation

The application is one self-contained HTML file. It works offline when
opened directly in a current desktop browser.

The main workflow is:

Problem → candidate models → assumptions → simulation method →
diagnostics → model comparison → decision report.

Users have expert knowledge of probability theory. Explanations follow
ASD-STE100 constraints. Mathematical notation retains its full meaning.
Technical terms have explicit definitions.

::: notes
ASD-STE100 conformance requires a language review. Short sentences alone
do not establish conformance. Use a controlled technical vocabulary.
Do not simplify away mathematical conditions.
:::

### Three entry points produce the same model

Users can start with:

- A real-problem example.
- A guided problem interview.
- An expert mathematical editor.

Each entry point produces an editable model with:

- Named variables, units, parameters, and support.
- Marginal and conditional probability laws.
- Dependence structure and initial conditions.
- Process dynamics and observation rules.
- Censoring, truncation, and selection mechanisms.
- Events, objectives, losses, constraints, and decision alternatives.
- The quantity to estimate.

A dependency graph and equations describe the same model.

## Part 2. The distribution interview presents candidate models

### The interview records evidence and unresolved assumptions

An embedded rule graph asks about:

- Support and the generating mechanism.
- Counts, waiting times, proportions, sizes, and maxima.
- Bounds, thresholds, atoms, mixtures, and tail behaviour.
- Dependence, stationarity, and observation mechanisms.
- Available data and the decision being made.

The interview presents several candidate models. Each candidate includes
a reason, competing explanations, rejection tests, and applicable
sampling methods.

The user can inspect the rule path and override a recommendation.
The interview can return “insufficient evidence”.

::: alert
Support and moments do not usually identify a unique distribution.
A marginal distribution does not define dependence.
:::

### The initial catalogue includes all agreed distribution groups

| Group | Laws |
|---|---|
| Discrete | Bernoulli, binomial, categorical, multinomial, discrete uniform, geometric, negative binomial, Poisson, hypergeometric, Zipf |
| Continuous | Uniform, normal, multivariate normal, exponential, gamma, Erlang, beta, Dirichlet, chi-square, Student's t, F, logistic, Laplace |
| Positive and survival | Lognormal, Weibull, inverse Gaussian, Gompertz, log-logistic |
| Heavy tails | Pareto I, Pareto II, Burr XII, Fréchet, Cauchy, Lévy, general stable laws |
| Extremes | Generalised extreme value, generalised Pareto, Gumbel, reverse Weibull |
| Constructed models | Finite mixtures, compound Poisson, empirical discrete laws, kernel density models, truncated laws |
| Observation models | Censored observations |

Each entry states its parameter convention, support, limiting cases,
moment conditions, transforms, and sampling methods.

Equivalent laws and special cases link to each other. Stable laws use
a declared parameterisation. Censoring is an observation mechanism.

### Custom inputs expose their numerical limits

Accept:

- PDF, log-PDF, and unnormalised density.
- PMF and finite probability tables.
- CDF and quantile function.
- MGF and characteristic function.
- Parameters, support, constraints, and empirical observations.

Use a mathematical expression parser. Expressions cannot execute
arbitrary JavaScript.

Check normalisation, non-negativity, monotonicity, boundaries, parameter
constraints, and consistency where applicable.

Report which conditions are checked, failed, or unverified.
Identify exact sampling, approximate sampling, or unavailable sampling.
State approximation controls and numerical error sources.

::: alert
An MGF need not exist. A finite numerical integral does not prove that
a moment exists. Numerical checks do not prove that an arbitrary
expression defines a probability law.
:::

## Part 3. Examples expose behaviour and solve practical problems

### Every distribution has a behaviour experiment and three workflows

Each built-in law has:

1. An experiment that exposes characteristic behaviour.
2. At least three distinct practical workflows.

Use different domains where justified. Do not force a law onto a problem
to fill the catalogue.

Every workflow includes:

- A concrete decision and estimated quantity.
- A reason to consider the distribution.
- Parameters, units, data, and assumptions.
- A dependence or process model where needed.
- A sampling method and estimator.
- Diagnostics and competing models.
- A result interpretation and rejection conditions.

Synthetic data identify their generating model. Illustrative parameters
are not presented as calibrated real-world evidence.

Search the library by decision, phenomenon, distribution, and method.

### The main test estimates catastrophe and systemic ruin

The main practical test combines:

- Heavy-tailed event losses.
- Clustered arrivals.
- Dependent exposures.
- Cascading failures.
- Capital reserves and control policies.

Estimate finite-horizon ruin probability, aggregate-loss quantiles,
extreme losses, and expected shortfall where it is finite.

Compare direct simulation, suitable importance sampling, and splitting.
Vary tail assumptions, dependence, event clustering, and truncation.
Show how these changes affect the decision.

Provide separate light-tailed and heavy-tailed regimes. Do not apply
exponential tilting when the required transform does not exist.

### A statistical-physics test covers critical behaviour

Include an energy landscape with metastability and a sandpile model.

Compare annealing schedules and tempering. Observe avalanche sizes,
finite-size effects, coarse-graining, and scale-dependent quantities.

State the sandpile dynamics, boundary rules, drive, and dissipation.
Distinguish observed scaling from an established limit theorem.
A finite lattice does not establish a universality class.

## Part 4. The method library shows when an estimator works

### All agreed simulation families are included

| Family | Methods |
|---|---|
| Direct simulation | Independent sampling, inverse transform, rejection sampling |
| Variance reduction | Stratification, antithetic variables, control variates, common random numbers |
| Integration | Randomised quasi-Monte Carlo, adaptive importance sampling |
| Rare events | Valid exponential tilting, splitting, subset simulation |
| Markov chains | Metropolis–Hastings, Gibbs, Hamiltonian Monte Carlo where applicable |
| Sequential inference | Sequential Monte Carlo, particle filters |
| Processes | Random walks, diffusions, jump processes, branching, Hawkes processes |
| Multilevel | Multilevel Monte Carlo and coupled discretisations |
| Optimisation | Simulated annealing, parallel tempering, cross-entropy methods |
| Critical systems | Sandpile experiments, coarse-graining, finite-size scaling |

Each method includes its estimator, assumptions, algorithm settings,
suitable example, failure example, and comparison with another method.

Label exact simulation, time discretisation, and other approximations.
Show discretisation bias separately from Monte Carlo error.

### Dependence and processes have separate libraries

Provide conditional models and Gaussian, Student-t, Clayton, Gumbel,
and Frank copulas within their valid parameter and dimension domains.

Process examples include Brownian motion, geometric Brownian motion,
Ornstein–Uhlenbeck dynamics, Poisson and compound Poisson processes,
finite-state Markov chains, branching processes, Hawkes processes,
and Lévy processes where supported.

State stationarity, stability, explosion, boundary, and discretisation
conditions for each implementation.

## Part 5. Theory and diagnostics qualify the result

### Theory panels state the theorem and its conditions

Each panel includes a precise statement, assumptions, proof sketch,
reference, counterexample, and linked experiment.

Emphasise:

- Regular variation and subexponentiality.
- Extreme-value limits and domains of attraction.
- Threshold exceedances, maxima, and sums.
- Ruin theory and dependence in extremes.
- Laws of large numbers and central limit results.
- Large deviations, rate functions, and change of measure.
- Ergodicity, mixing, and time versus ensemble averages.
- Monte Carlo consistency and variance conditions.
- Metastability, annealing, and scale transformations.

Connect Taleb-related tail sensitivity and ruin questions to explicit
models. Connect Sornette-related critical phenomena to explicit dynamics.
Do not treat an author's interpretation as a general theorem.

### A diagnostic does not establish a theorem

Keep these claims distinct:

- A theorem applies under stated assumptions.
- A numerical method approximates a quantity.
- A finite run produced an observation.

Show non-existent or unknown moments as such.
Do not display a finite sample variance as a population guarantee.

Use uncertainty estimates that fit the estimator and assumptions.
Include zero-hit event bounds where valid.
Distinguish weight degeneracy, Markov-chain diagnostics, and estimation
error. Effective sample size is a diagnostic, not a proof of convergence.

## Part 6. Local data support model assessment

### Model uncertainty is separate from simulation error

Import local CSV and JSON.

Support parameter estimation, empirical models, bootstrap methods,
tail-threshold selection, censoring, truncation, and dependence checks.

Include mean-excess plots, tail-index estimates, threshold stability,
return levels, and sensitivity to influential observations.

State estimator conditions. Ordinary bootstrap methods need separate
justification for extremes, dependent samples, and infinite moments.

Distinguish parameter uncertainty, model uncertainty, numerical bias,
and Monte Carlo error.

## Part 7. Linked visuals explain the experiment

### The main view has three connected panels

Use the yujieteo/visuals laboratory structure:

- Left: problem, model, example, and method navigation.
- Centre: experiment and linked visuals.
- Right: theory, assumptions, diagnostics, and interpretation.

Provide distribution and survival plots, quantile plots, sample paths,
ensemble bands, first-passage events, tail plots, convergence views,
weight plots, particle genealogies, and estimator comparisons.

Provide energy landscapes, sandpile grids, and scale views.
Use 3D when it helps explain the model.

Controls include Step, Run, Pause, Reset, parameter sweeps, comparison,
linear/log axes, and assumption-failure experiments.

Show units, sample counts, seeds, thresholds, and reference values.
Provide keyboard operation, reduced motion, accessible colours, and
smaller-screen layouts.

## Part 8. Computation and records remain reproducible

### Workers keep the interface responsive

Target an ordinary modern laptop.

Bundle code, fonts, mathematical rendering, data, and assets in the HTML.
The application makes no runtime network requests.

Use workers compatible with direct file opening.
Provide progress, cancellation, resource limits, and bounded plot data.

Use a validated pseudorandom generator with named streams.
Save seed, generator version, stream scheme, model, and method settings.
Worker scheduling must not silently change stream assignment.

Measure performance before publishing sample-count or dimension limits.

### Exports record assumptions and limitations

Save and import versioned JSON model and run records.
Export numerical results as CSV and figures as SVG or PNG.
Export a Markdown report with model, assumptions, method, diagnostics,
results, and limitations.

Use local autosave when available. Explicit file export remains the
dependable saved record.

Distinguish exact replay requirements from floating-point differences
across platforms.

## Part 9. Validation tests the scientific claims

### Acceptance requires numerical and interaction checks

Verify:

- Direct offline operation with no network requests.
- Distribution parameter conventions and domain checks.
- Samplers against independent analytical or numerical references.
- Known probabilities, expectations, and process limits.
- Rare-event estimators against tractable reference problems.
- Weight accounting, coupling, and sequential resampling.
- Failed moments and invalid assumptions.
- Deterministic runs and cancelled computations.
- Import/export round trips.
- Example coverage for every catalogue entry.
- Responsive plots and accessible controls.

Numerical tests use stated tolerances and justified statistical bounds.
They must not rely on a single random run.

Validate the catalogue, examples, and methods in reviewable groups.
The final acceptance gate covers the whole agreed scope.
