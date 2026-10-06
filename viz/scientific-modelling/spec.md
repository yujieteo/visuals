# 6. Scientific Modelling and Dimensional Analysis

Specification version: 1.0  
Date: 2026-10-05  
Status: Agreed scope. Implementation requirements.

## 1. Purpose and scope

Help researchers derive, check, and compare physical models for heat transfer, fluid dynamics, aerodynamics, structural analysis, and coupled physics.

Provide 3 tools through one shared model:

1. Dimensionless Number Finder.
2. Model Nondimensionalizer.
3. Regime Map Builder.

Support Buckingham Pi analysis, dominant balance, asymptotic analysis, stability analysis, and bifurcation analysis.

Provide automatic calculations for declared model classes. Accept custom equations and state which calculations the tool supports.

Require traceable derivations and reproducible hand calculations. Require evidence for physical claims and regime boundaries.

Use ASD-STE100 for all descriptions, instructions, explanations, captions, errors, and narration. Preserve mathematical notation and technical names.

## 2. Shared model

Store these items in one versioned model:

| Item | Required content |
| --- | --- |
| Purpose | Research question, observable, and intended calculation |
| Variables | Symbols, meanings, dimensions, units, values or ranges, and allowed domains |
| Equations | Governing equations, constitutive laws, closures, sources, and constraints |
| Geometry | Domain, lengths, aspect ratios, interfaces, and coordinate system |
| Conditions | Boundary conditions, initial conditions, and interface conditions |
| Assumptions | Physical assumptions, mathematical assumptions, and their sources |
| Scales | Reference values, characteristic scales, alternatives, and reasons for each choice |
| Analyses | Dimensionless groups, transformed equations, reduced models, spectra, and solution branches |
| Evidence | References, exact checks, numerical checks, uncertainty, and validity ranges |
| History | Model version, input changes, derivation dependencies, and calculation settings |

Give each variable, equation, assumption, derivation step, result, and evidence item a stable identifier.

Link each result to its inputs and derivation. Invalidate dependent results after an input change. Preserve the previous version for comparison.

Separate these result statuses:

- Proposed interpretation.
- Researcher-confirmed interpretation.
- Exact dimensional or algebraic check.
- Numerical check with stated tolerance.
- Physical claim with cited evidence.
- Unresolved or unsupported calculation.

A dimensional check does not establish physical validity. A numerical check does not establish a mathematical proof.

## 3. Model entry and validation

Accept equations, variable tables, physical scales, and editable standard examples. Accept symbolic and numerical inputs.

Show the interpreted variables, equations, geometry, and conditions before analysis. Require the researcher to confirm this interpretation.

Check dimensions before any transformation. Identify undefined symbols, conflicting units, missing conditions, and incomplete constitutive laws.

Distinguish absolute temperature from temperature difference. Convert affine units correctly before multiplication, division, or exponentiation.

Preserve the physical meaning of dimensionless quantities, including angles, aspect ratios, fractions, and material parameters.

Identify algebraic dependencies between inputs. Do not count constrained physical inputs as freely adjustable parameters.

Require a declared domain for fractional powers, logarithms, and division. Identify zero or invalid reference scales.

For each missing input, explain which calculation requires it. Preserve calculations that do not depend on that input.

## 4. Dimensionless Number Finder

### Inputs

Require physical variables, their dimensions, and the quantity of interest. Accept known constraints and preferred reference variables.

### Calculation

Construct the dimension matrix $D$. Use one column per supplied variable and one row per base dimension.

Calculate the exact rank $r$ and a basis for $\ker D$. For $n$ supplied variables, return $n-r$ independent monomial groups.

State the assumptions of this calculation. Distinguish algebraic independence of group exponents from independent physical variation under constraints.

Select $r$ repeating variables with independent dimension columns. Explain the selection. Let the researcher select another valid set.

Use exact rational exponents when the input dimensions permit them. Show row reduction and the exponent equations.

For each exponent vector $a$, require:

$$
D a=0,\qquad \Pi=\prod_{j=1}^{n}q_j^{a_j}.
$$

Verify the rank of the returned exponent basis. Show dimensional cancellation for every group.

### Results

Return a complete independent basis relative to the supplied variables. State that the basis is not unique.

Suggest familiar groups when their definitions match the supplied variables. Preserve the exact definitions and characteristic lengths.

Explain transformations between equivalent bases. Distinguish a recognized name from a confirmed physical interpretation.

Identify quantities that the researcher must supply before a physical correlation is possible. Buckingham Pi analysis does not determine that correlation.

## 5. Worked Buckingham Pi calculation

Use the variables $h,k,\rho,\mu,c_p,U,L$ for a heat-transfer example. Assume positive reference quantities and no additional input constraints.

| Symbol | Meaning | Dimension |
| --- | --- | --- |
| $h$ | Heat-transfer coefficient | $\mathsf{M}\mathsf{T}^{-3}\mathsf{\Theta}^{-1}$ |
| $k$ | Thermal conductivity | $\mathsf{M}\mathsf{L}\mathsf{T}^{-3}\mathsf{\Theta}^{-1}$ |
| $\rho$ | Density | $\mathsf{M}\mathsf{L}^{-3}$ |
| $\mu$ | Dynamic viscosity | $\mathsf{M}\mathsf{L}^{-1}\mathsf{T}^{-1}$ |
| $c_p$ | Specific heat capacity | $\mathsf{L}^{2}\mathsf{T}^{-2}\mathsf{\Theta}^{-1}$ |
| $U$ | Reference speed | $\mathsf{L}\mathsf{T}^{-1}$ |
| $L$ | Reference length | $\mathsf{L}$ |

The dimension matrix has columns in that order:

$$
D=\begin{pmatrix}
1&1&1&1&0&0&0\\
0&1&-3&-1&2&1&1\\
-3&-3&0&-1&-2&-1&0\\
-1&-1&0&0&-1&0&0
\end{pmatrix}.
$$

Choose $\rho,U,L,k$ as repeating variables. Their dimension columns form this square matrix:

$$
D_R=\begin{pmatrix}
1&0&0&1\\
-3&1&1&1\\
0&-1&0&-3\\
0&0&0&-1
\end{pmatrix},\qquad \det D_R=-1.
$$

The determinant is nonzero, so the rank is $4$. Thus $n-r=7-4=3$.

For each other variable $q$, set:

$$
\Pi_q=q\rho^a U^b L^c k^d.
$$

Solve these systems in the order mass, length, time, and temperature:

| Variable | Exponent equations | Solution $(a,b,c,d)$ | Group |
| --- | --- | --- | --- |
| $h$ | $1+a+d=0$; $-3a+b+c+d=0$; $-3-b-3d=0$; $-1-d=0$ | $(0,0,1,-1)$ | $hL/k$ |
| $\mu$ | $1+a+d=0$; $-1-3a+b+c+d=0$; $-1-b-3d=0$; $-d=0$ | $(-1,-1,-1,0)$ | $\mu/(\rho UL)$ |
| $c_p$ | $a+d=0$; $2-3a+b+c+d=0$; $-2-b-3d=0$; $-1-d=0$ | $(1,1,1,-1)$ | $\rho c_pUL/k$ |

The direct basis is $Nu,Re^{-1},Pe$. Use an equivalent familiar basis:

$$
Nu=\frac{hL}{k},\qquad
Re=\frac{\rho UL}{\mu},\qquad
Pr=\frac{\mu c_p}{k},\qquad Pe=Re\,Pr.
$$

Show dimensional cancellation:

$$
[Nu]=\frac{\mathsf{M}\mathsf{L}\mathsf{T}^{-3}\mathsf{\Theta}^{-1}}
{\mathsf{M}\mathsf{L}\mathsf{T}^{-3}\mathsf{\Theta}^{-1}}=1,
$$

$$
[Re]=\frac{\mathsf{M}\mathsf{L}^{-1}\mathsf{T}^{-1}}
{\mathsf{M}\mathsf{L}^{-1}\mathsf{T}^{-1}}=1,
\qquad
[Pr]=\frac{\mathsf{M}\mathsf{L}\mathsf{T}^{-3}\mathsf{\Theta}^{-1}}
{\mathsf{M}\mathsf{L}\mathsf{T}^{-3}\mathsf{\Theta}^{-1}}=1.
$$

Verify independence with the exponent columns for $Nu,Re,Pr$. The rows for $h,\rho,c_p$ form the identity matrix.

These groups do not specify a universal relation $Nu=f(Re,Pr)$. Geometry, boundary conditions, and additional physics can require further inputs.

## 6. Model Nondimensionalizer

### Inputs

Require the equations, closures, geometry, and conditions. Accept supplied scales or derive candidate scales from the model.

### Scale selection

Suggest characteristic lengths, speeds, times, temperature differences, pressures, stresses, displacements, and material reference values where applicable.

Explain each scale through a physical mechanism or equation balance. Show competing scales when more than one mechanism is relevant.

Do not hide a physical parameter through a scale choice. Show where that parameter enters the scales, coefficients, geometry, or conditions.

Require nonzero scales. If a scale fails, suggest another valid scale and state the changed interpretation.

### Derivation

Define each dimensionless variable and its inverse transformation. Show the derivative transformations and substitution into every equation.

Show the common factor that each equation removes. Rewrite constitutive laws, sources, boundary conditions, initial conditions, and interface conditions.

List the remaining independent parameters, dimensionless functions, geometry ratios, and prescribed data. Distinguish parameters from coordinates and solution fields.

Compare the parameters with the Buckingham Pi basis. Explain additional groups from geometry, conditions, or variables absent from the original list.

Verify the reverse substitution. Recover the dimensional equations and conditions under the stated assumptions.

## 7. Worked slab nondimensionalization

Use a slab with half-thickness $L$, constant material properties, and uniform initial temperature $T_i$.

Apply symmetry at the centre and convection at the outer surface. Assume $T_i\ne T_\infty$.

$$
\rho c_p\frac{\partial T}{\partial t}
=k\frac{\partial^2T}{\partial x^2},\qquad 0<x<L,
$$

$$
T_x(0,t)=0,\qquad
-kT_x(L,t)=h\bigl(T(L,t)-T_\infty\bigr),\qquad
T(x,0)=T_i.
$$

Define:

$$
\alpha=\frac{k}{\rho c_p},\qquad
X=\frac{x}{L},\qquad
\tau=\frac{\alpha t}{L^2},\qquad
\theta=\frac{T-T_\infty}{T_i-T_\infty}.
$$

The derivative transformations are:

$$
T_t=(T_i-T_\infty)\frac{\alpha}{L^2}\theta_\tau,
\qquad
T_{xx}=\frac{T_i-T_\infty}{L^2}\theta_{XX}.
$$

Substitution and cancellation give:

$$
\theta_\tau=\theta_{XX},\qquad
\theta_X(0,\tau)=0,\qquad
-\theta_X(1,\tau)=Bi\,\theta(1,\tau),\qquad
\theta(X,0)=1,
$$

$$
Bi=\frac{hL}{k}.
$$

The remaining constant parameter is $Bi$. The Fourier number $Fo=\alpha t/L^2=\tau$ is the dimensionless time coordinate.

Use this example to verify the equation, the surface sign, the initial condition, and the inverse transformation.

## 8. Mathematical regime determination

Use the dimensionless equations to derive regime criteria. Buckingham Pi analysis alone does not establish these criteria.

### Dominant balance

Compare complete terms with their estimated field and derivative scales. Do not compare coefficients alone.

Derive candidate balances and reduced equations. Record the neglected terms and assumptions.

State the inequalities that support each balance. Check the residual of the reduced solution in the full equations.

Identify crossover regions where competing terms have comparable size. Label these as balance crossovers unless further evidence establishes a transition.

### Asymptotic analysis

Declare the small or large parameter and the limit path. State which other parameters remain fixed or vary with it.

Derive the approximation order by order. Show the equations, conditions, and solvability requirements at each order.

Check whether the reduction loses differential order or boundary conditions. Derive inner regions and matching conditions when required.

Distinguish a formal expansion, an estimated remainder, and a proved error bound. State the spatial and temporal validity range.

Check overlapping approximations against each other. Identify regions where no supported approximation meets the selected tolerance.

### Stability analysis

Define the base state, disturbance class, boundary conditions, and stability concept. Verify the base state before perturbation.

Derive the perturbation equations and eigenvalue problem where applicable. Report growth rates, frequencies, eigenmodes, and numerical residuals.

State whether the result concerns temporal, spatial, convective, absolute, energy, or static stability.

For nonlinear stability claims, require a separate derivation or evidence. A linear stability result must retain its stated scope.

### Bifurcation analysis

Declare the nonlinear model, control parameters, branch seeds, and parameter domain.

Calculate supported equilibrium or periodic branches. Use continuation where required. Mark folds, branch points, and candidate Hopf points with their evidence.

Classify a bifurcation only when the required nonlinear conditions are checked. Show the amplitude equation or equivalent classification calculation where available.

Identify stable branches, unstable branches, coexistence, and hysteresis where the evidence supports them.

Report the branches that the calculation found. State search coverage. Do not claim exhaustive branch discovery without a separate completeness argument.

## 9. Regime Map Builder

### Inputs

Require the dimensionless model, parameter domain, observable, and regime criteria. Accept cited correlations and imported numerical results with provenance.

Enforce physical constraints during parameter exploration. Show derived or dependent parameters beside the independent controls.

### Display

Provide 1D diagrams and 2D slices of higher-dimensional spaces. Let the researcher select the axes and fixed parameters.

Display all fixed parameters, assumptions, geometry, and conditions beside the map. Offer linear and logarithmic axes where valid.

Support separate layers for balances, approximation error, stability, and bifurcations. Permit overlapping regions and multiple stable states.

Distinguish these boundary types:

| Boundary type | Required criterion |
| --- | --- |
| Balance crossover | Stated comparison of terms or mechanisms |
| Approximation boundary | Stated error measure and tolerance |
| Stability boundary | Stated stability test and neutral condition |
| Bifurcation boundary | Stated branch condition and classification evidence |
| Empirical boundary | Cited correlation, measured data, and validity range |

Show uncertainty bands or unresolved regions when appropriate. Do not interpolate across unsupported regions as if they were established.

Let the researcher select a point or boundary. Show its dimensional reconstruction, governing balance, derivation, evidence, and applicable reduced model.

Show asymptotic limit paths and intersections. Identify limits that require coupled parameter changes.

## 10. Declared model catalogue

Include every family below in the first release. Each entry defines a bounded automatic model, not arbitrary support for the entire field.

| Family | Initial automatic model | Standard example and main check |
| --- | --- | --- |
| Lumped thermal models | Uniform-temperature body with stated thermal capacity and linear surface exchange | Temperature decay and conservation of energy |
| Transient conduction | Constant-property 1D slab with specified surface conditions | Symmetric slab with convection, exact modes, and asymptotic comparisons |
| Advection–diffusion | Constant-property scalar transport with prescribed velocity in a declared domain | Channel transport, Péclet dependence, and conservation |
| Radiation | Lumped thermal body with grey surface exchange against a prescribed enclosure | Nonlinear temperature balance, equilibrium, and local stability |
| Fins and extended surfaces | Constant-section 1D fin with stated surface exchange and tip conditions | Temperature profile, fin efficiency, and base heat flow |
| Multilayer conduction | 1D layers with declared contact resistances and material properties | Temperature jumps, heat continuity, and resistance limits |
| Heat exchangers | Constant-property parallel-flow and counterflow models with stated inlet conditions | Effectiveness, heat balance, and equal capacity rates |
| Phase change | One-phase and declared two-phase Stefan models | Interface position, similarity solution, and latent-energy balance |
| Viscous heat generation | Plane Couette flow with Newtonian viscosity and stated thermal conditions | Dissipation, temperature profile, and total energy balance |
| Thermocapillary heat transport | Laminar layer with a declared free surface and thermal gradient | Tangential stress, flow direction, and coupled heat transport |
| Condensation | Laminar film on a vertical wall under declared assumptions | Film thickness, heat flux, and latent-energy balance |
| Boiling correlations | Named correlations for stated fluids, surfaces, pressures, and phase regimes | Reference data and strict validity-range checks |
| Radiation in a medium | 1D grey absorbing slab with declared optical properties and boundary radiation | Radiative-transfer reference and optical-thickness limits |
| Internal viscous flow | Newtonian channel and pipe models with stated flow and thermal conditions | Poiseuille flow and a declared heat-transfer example |
| Buoyancy convection | Boussinesq layer with declared geometry and thermal conditions | Rayleigh–Bénard onset and nonlinear branches |
| Free-surface flow | 1D shallow-water model with a declared bed, wet domain, and admissible boundary data | Subcritical and supercritical flow, with a hydraulic-jump check |
| Compressible nozzle flow | Quasi-1D ideal-gas model with declared area and thermodynamic assumptions | Sonic condition, mass-flow maximum, and conservation |
| Boundary layers | Steady laminar boundary layer with a declared outer flow and wall conditions | Flat-plate similarity solution and inner–outer scale consistency |
| External aerodynamic flow | 2D incompressible potential flow for declared simple geometries and thin-airfoil cases | Surface pressure, lift, and stated viscous limits |
| Beams and columns | Linear Euler–Bernoulli beam and Euler column with declared supports and loads | Deflection, critical load, and eigenmodes |
| Plates and shells | Linear thin rectangular plate and a separate axisymmetric cylindrical-shell model | Pressure response and reference solutions under declared supports |
| Vibration | Linear damped oscillator and discretized beam modes | Natural frequencies, damping, and frequency response |
| Nonlinear buckling | Perfect and imperfect nonlinear column models with declared supports and load control | Branch continuation, critical load, and symmetry checks |
| Conjugate heat transfer | Declared fluid–solid channel with interface continuity of temperature and heat flux | Interface balances and mesh convergence |
| Thermoelasticity | Small-strain elastic rod and plate with prescribed thermal fields or declared thermal coupling | Free expansion, constrained thermal stress, and energy checks |
| Fluid–structure interaction | Reduced airfoil section with pitch, plunge, and a declared aerodynamic model | Modal damping, flutter onset, and a convergence check |

Require a model declaration for each entry:

- Exact equations, closures, geometry, and supported conditions.
- Parameter domain and physical assumptions.
- Supported symbolic and numerical operations.
- Applicable mathematical analyses and explicit limitations.
- Standard example, reference result, and acceptance tolerances.
- Solver, discretization, convergence criteria, and reproducibility settings.

Provide all 4 mathematical analysis methods across the catalogue. State which methods apply to each model and why.

An absent bifurcation is not a failed feature. An unsupported nonlinear calculation must not appear as a confirmed result.

Treat turbulence, shocks, dry fronts, contact, plasticity, damage, and arbitrary 3D coupled problems as separate declarations when required.

Thermal contact resistance is included in multilayer conduction. Mechanical contact requires a separate structural declaration.

### Heat-transfer examples

Use multiple examples per heat-transfer mechanism. The slab is one conduction example, not the complete thermal test suite.

| Example | Dimensionless content | Required check |
| --- | --- | --- |
| Lumped body with convection | $Bi$, dimensionless time, and temperature ratio | Derive the decay time and compare with a spatial model |
| Transient slab | $Bi$, $Fo$, and normalized temperature | Recover the surface conditions and reference modes |
| Transient cylinder | Radius-based $Bi$, $Fo$, and geometry ratios | Recover the cylindrical diffusion operator and reference solution |
| Transient sphere | Radius-based $Bi$ and $Fo$ | Recover the spherical diffusion operator and reference solution |
| Multilayer wall | Conductivity ratios, thickness ratios, and normalized contact resistance | Verify heat continuity and interface temperature jumps |
| Solid with volumetric heat generation | $q'''L^2/(k\Delta T)$ and boundary parameters | Verify the source term and total heat balance |
| Straight fin | $mL$, transverse $Bi$, and geometry ratios | Recover temperature, base heat flow, and efficiency |
| Forced convection over a plate | Local and mean $Nu$, $Re$, $Pr$, and $Pe$ | Preserve the length and heat-transfer definitions |
| Forced convection in a tube | $Nu$, $Re$, $Pr$, and entrance-scale ratios | Separate wall-temperature and wall-flux conditions |
| Natural convection at a wall | $Gr$, $Ra$, $Pr$, and orientation | Verify buoyancy scaling and the correlation domain |
| Natural convection in an enclosure | $Ra$, $Pr$, aspect ratio, and thermal conditions | Verify the conductive base state and onset criterion |
| Mixed convection | Consistent $Re$, $Gr$, $Ri$, and gravity direction | Recover forced and buoyancy limits |
| Parallel-flow heat exchanger | $NTU$, $C_r$, and effectiveness | Verify equal heat loss and gain |
| Counterflow heat exchanger | $NTU$, $C_r$, and effectiveness | Recover the equal-capacity-rate limit |
| Surface radiation | Emissivity, view factors, and absolute temperature ratios | Verify reciprocal exchange and energy balance |
| Combined convection and radiation | Radiation ratio and temperature ratio | Verify the full nonlinear balance and linearization limit |
| Radiation in an absorbing slab | Optical thickness and boundary temperature ratios | Compare with a radiative-transfer reference |
| Melting or solidification front | Phase-specific $Ste$, conductivity ratios, and diffusivity ratios | Verify interface motion and latent-energy balance |
| Laminar film condensation | Declared sensible-to-latent ratio and film-flow parameters | Recover the reference film and heat flux |
| Pool-boiling correlation | Correlation-specific groups and fluid-property ratios | Enforce the fluid, surface, pressure, and phase limits |
| Couette flow with viscous heat generation | $Ec$, $Br$, and $Pr$ | Recover the zero-dissipation limit and energy balance |
| Thermocapillary flow | $Ma_T$, $Pr$, geometry ratios, and surface thermal conditions | Verify tangential stress and its sign |
| Conjugate fluid–solid heat transfer | Fluid $Pe$, solid-to-fluid conductivity ratio, and geometry ratios | Verify interface temperature and heat-flux continuity |

Declare automatic conduction examples for the slab, cylinder, sphere, multilayer wall, volumetric source, and constant-section fin.

For each convection example, declare either a governing-equation model or a named correlation. State which result type the example supplies.

For correlation examples, reproduce the Pi calculation from the declared variable set. Preserve the empirical constants and their source separately.

### Heat-transfer definitions and scale conventions

Store each group as a formula with explicit reference quantities. Do not identify groups by name alone.

Use these definitions where the declared model supports them:

$$
\alpha=\frac{k}{\rho c_p},\qquad \nu=\frac{\mu}{\rho},\qquad
Nu=\frac{hL}{k_f},\qquad Bi=\frac{hL_c}{k_s},\qquad
Fo=\frac{\alpha_s t}{L_c^2}.
$$

$$
Re=\frac{UL}{\nu},\qquad Pr=\frac{\nu}{\alpha_f},\qquad
Pe=Re\,Pr,\qquad St_h=\frac{h}{\rho c_pU}=\frac{Nu}{Re\,Pr}.
$$

$$
Gr=\frac{g\beta\Delta T L^3}{\nu^2},\qquad
Ra=Gr\,Pr,\qquad
Ri=\frac{Gr}{Re^2}=\frac{g\beta\Delta T L}{U^2}.
$$

$$
NTU=\frac{U_{HX}A}{C_{\min}},\qquad
C_r=\frac{C_{\min}}{C_{\max}},\qquad
C=\dot m c_p,\qquad
\varepsilon_{HX}=\frac{\dot Q}{C_{\min}(T_{h,in}-T_{c,in})}.
$$

$$
Ste=\frac{c_p\Delta T}{\ell},\qquad
Ec=\frac{U^2}{c_p\Delta T},\qquad
Br=\frac{\mu U^2}{k_f\Delta T}=Pr\,Ec.
$$

$$
Ma_T=\frac{|\mathrm d\gamma/\mathrm dT|\,|\Delta T| L}{\mu\alpha_f},\qquad
\tau_{opt}=\kappa_a L.
$$

Here $k_f$ and $k_s$ refer to fluid and solid conductivity. The symbols $\gamma$ and $\kappa_a$ denote surface tension and absorption coefficient.

The symbol $U$ denotes speed. The symbol $U_{HX}$ denotes the overall heat-transfer coefficient.

Use distinct symbols for the convection coefficient, latent heat, specific enthalpy, emissivity, and heat-exchanger effectiveness.

State the phase and temperature interval for $Ste$. Record the exact Jakob-number convention when a selected source uses that name.

Declare whether $\Delta T$ is a positive scale or a signed difference. Preserve physical signs in the equations and regime criteria.

State the Biot length. Distinguish $L_c=V/A_s$ from the radius or half-thickness in a spatial solution.

For $Ri$, use consistent lengths, fluid properties, temperature differences, and reference velocity. Distinguish bulk Richardson number from gradient Richardson number.

For $Nu$ and $St_h$, state whether the quantities are local or averaged. Use compatible definitions in algebraic identities.

Enforce $Pe=RePr$, $Ra=GrPr$, and $Br=PrEc$ when their definitions share the same reference properties.

Do not provide independent controls for algebraically dependent groups. Recalculate derived groups after every parameter change.

For radiation, use absolute temperatures. State the reference temperature and retain the temperature ratio in the nonlinear model.

Compare surface radiation with convection or conduction through a declared coefficient ratio. Include the linearization factor when the model uses a linear approximation.

Apply an optically thick radiation approximation only within its declared assumptions. Preserve the full radiative-transfer reference for comparison.

Preserve the sign of the surface-tension derivative separately from the positive $Ma_T$ magnitude.

For boiling and condensation, record pressure, fluid, orientation, surface condition, and phase regime. Reject extrapolation outside the selected correlation domain.

### Additional hand-calculation example: straight fin

Assume a constant-section fin with constant conductivity, uniform surface convection, a prescribed base temperature, and an insulated tip.

Use $A_c$ for cross-sectional area and $P$ for exposed perimeter. Let $\Delta T=T_b-T_\infty\ne0$.

$$
kA_cT_{xx}-hP(T-T_\infty)=0,\qquad
T(0)=T_b,\qquad T_x(L)=0.
$$

Define:

$$
X=\frac{x}{L},\qquad
\theta=\frac{T-T_\infty}{\Delta T},\qquad
\lambda=mL,\qquad m^2=\frac{hP}{kA_c}.
$$

Show the dimension of $m^2$:

$$
[m^2]=\frac{(\mathrm W\,\mathrm m^{-2}\,\mathrm K^{-1})(\mathrm m)}
{(\mathrm W\,\mathrm m^{-1}\,\mathrm K^{-1})(\mathrm m^2)}
=\mathrm m^{-2}.
$$

Thus $\lambda$ is dimensionless. Substitution gives:

$$
\theta_{XX}-\lambda^2\theta=0,\qquad
\theta(0)=1,\qquad\theta_X(1)=0.
$$

Solve and check the conditions:

$$
\theta(X)=\frac{\cosh[\lambda(1-X)]}{\cosh\lambda},\qquad
\frac{\dot Q L}{kA_c\Delta T}=\lambda\tanh\lambda,
\qquad \eta_f=\frac{\tanh\lambda}{\lambda}.
$$

For the supplied variables $\dot Q,k,h,P,A_c,L,\Delta T$, the time row equals $-3$ times the mass row.

The mass, length, and temperature rows for $k,L,\Delta T$ form a matrix with determinant $1$. Thus the rank is $3$.

The supplied variable set therefore has $7-3=4$ independent groups.

One complete basis is:

$$
\frac{\dot Q L}{kA_c\Delta T},\qquad
\frac{hPL^2}{kA_c},\qquad
\frac{PL}{A_c},\qquad
\frac{A_c}{L^2}.
$$

The declared 1D equation combines some geometric information into $\lambda$. Explain this reduction separately from the complete Pi basis.

Check the limits $\lambda\to0$ and $\lambda\to\infty$. Verify the base heat flow against total surface heat loss.

Derive the transverse-conduction validity condition separately. A solution of the 1D fin equation does not establish that condition.

## 11. Initial acceptance suite

Retain the 4 agreed anchor tests:

These anchor tests do not replace the expanded heat-transfer suite.

| Test | Required results |
| --- | --- |
| Transient slab conduction | Hand derivation, dimensionless conditions, reference temperature solution, and approximation error map |
| Rayleigh–Bénard convection | Dimensionless equations, base state, neutral curve, and a nonlinear branch calculation under stated conditions |
| Compressible nozzle flow | Conservation derivation, dimensionless parameters, sonic critical condition, and mass-flow check |
| Euler column buckling | Dimensionless load, critical eigenvalue, mode, and explicit separation from nonlinear post-buckling claims |

For nonlinear buckling, supply the nonlinear model before branch classification. A linear critical-load calculation does not determine the finite branch amplitude.

For flutter, separate linear onset from nonlinear oscillation amplitude. Require a nonlinear model for the latter claim.

Add at least one reproducible acceptance example for every other catalogue entry. The release requires all entries to pass their declared checks.

Do not use one universal transition threshold. Fix the geometry, conditions, model, observable, and criterion for each reference result.

## 12. Hand calculations and traceability

Provide a complete hand-calculation report for every standard example.

For custom calculations, show the applicable symbolic steps and the numerical procedure. Preserve an explicit unsupported status when a step cannot be derived.

Show these items:

1. Physical setup and assumptions.
2. Variable and dimension tables.
3. Dimension matrix, row reduction, rank, and nullspace basis.
4. Repeating variables and exponent equations.
5. Dimensional cancellation and independence checks.
6. Scale choices and derivative transformations.
7. Dimensionless equations and all conditions.
8. Regime derivation, reduced equations, and validity conditions.
9. Stability or bifurcation calculations where applicable.
10. Reference checks, numerical tolerances, and unresolved claims.

Label the reason for every step. Link the step to its assumptions and evidence.

Distinguish exact symbolic work from numerical approximation. For numerical work, supply a small worked example and reproducible settings.

Do not describe a numerical spectrum or mesh calculation as a complete hand calculation.

## 13. Reports and Beamdswitch

Generate the interactive view, full Markdown report, and Beamdswitch deck from the same model version and derivation record.

Use the Beamdswitch report structure:

| Section | Required content |
| --- | --- |
| Set-up | Question, model, variables, units, assumptions, geometry, and conditions |
| Method | Pi derivation, scale choices, mathematical analysis, and numerical procedure |
| Results | Groups, dimensionless equations, reduced models, spectra, branches, and regime maps |
| Checks and takeaway | Exact checks, numerical checks, evidence, limits, and the final key conclusion |

Provide narration for every frame. Use plain spoken prose for narration. Keep equations in the frame body.

End the Checks section with a key frame. Preserve the existing shared Beamdswitch template.

Show the same parameter values, definitions, and result statuses in every output. Include the full hand calculation in the report or deck appendix.

Use Markdown with inline and display mathematics. Render mathematics with MathJax and Fira Math in web outputs.

Select the MathJax Fira font set. Pin renderer and font versions. Use accessible mathematics and selectable text.

Keep the short view concise. Provide full derivations through explicit expansion, focus, click, or touch.

Do not truncate an exported derivation. For large numerical data, show aggregates and link to the full result.

## 14. Verification and completion

Require these checks before a model entry qualifies for automatic support:

- Exact dimension-matrix rank and nullspace checks.
- Independence checks and equivalent-basis checks.
- Dimensionless equation and condition checks.
- Reverse substitution to the dimensional model.
- Reference-solution or conservation checks.
- Discretization, timestep, or continuation convergence where applicable.
- Residuals for base states, modes, and solution branches.
- Explicit error measures and acceptance tolerances.
- Agreement between reports, decks, and the interactive view.
- Mathematical display checks for MathJax and Fira Math.

Include failure examples for inconsistent dimensions, zero scales, missing conditions, dependent inputs, and unsupported analyses.

Keep unresolved results visible. State the failed check and the next useful action.

A model declaration is complete when it includes a reproducible derivation, reference example, supported methods, and measurable acceptance criteria.

The software release is complete when every required catalogue entry passes those criteria and all output formats agree.

## 15. Source basis

The model declarations and catalogue boundaries are design requirements. They do not claim implemented automatic support.

The sources below support the mathematical distinctions and selected reference examples:

- [Matt Pocock’s Grill-me method](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md) supports the decision process for this specification.
- [MIT: Buckingham Pi theorem](https://ocw.mit.edu/courses/2-25-advanced-fluid-mechanics-fall-2013/c0a4521f55e9191d557c167e99e97469_MIT2_25F13_The_Buckingham.pdf) supports independent groups and the need for additional physical relations.
- [Ribando: transient plane-wall solution](https://www.robertribando.com/xls/heat-transfer/htttransanal/) supplies a reference for the slab conditions and solution.
- [Wen, Goluskin, and Doering: Rayleigh–Bénard convection](https://www.cambridge.org/core/journals/journal-of-fluid-mechanics/article/steady-rayleighbenard-convection-between-noslip-boundaries/B4F358EB0AE83BBE9D85968DC5DDD64D) supplies a specified convection model and branch evidence.
- [NASA: mass-flow choking](https://www.grc.nasa.gov/www/k-12/BGP/mflchk.html) supplies the nozzle mass-flow derivation and sonic condition.
- [MIT: structural buckling](https://ocw.mit.edu/courses/16-01-unified-engineering-i-ii-iii-iv-fall-2005-spring-2006/1f1b4e82bae2ff8ce609bc96fe20eedb_sprh04.pdf) supplies the Euler-column reference.
- [MIT: boundary-layer derivation](https://web.mit.edu/16.110/www/aero_analysis_problem.html) supports inner and outer scale distinctions.
- [MIT: Plates and Shells](https://ocw.mit.edu/courses/2-081j-plates-and-shells-spring-2007/) supports separate structural model declarations.
- [Yong and Mahadevan: nonlinear beam model](https://arxiv.org/html/2501.08028v1) supports model-specific nonlinear buckling classification.
- [NASA: flutter boundary study](https://ntrs.nasa.gov/api/citations/19860016812/downloads/19860016812.pdf) supports a reduced flutter reference.
- [Farrell, Beentjes, and Birkisson: branch discovery](https://arxiv.org/abs/1603.00809) supports explicit limits on continuation coverage.
- [MathJax: font support](https://docs.mathjax.org/en/latest/output/fonts.html) specifies the Fira font set and renderer configuration.
- [MIT: heat transfer from a fin](https://web.mit.edu/16.unified/www/FALL/thermodynamics/notes/node128.html) supplies the insulated-tip fin derivation.
- [Bannerman: heat exchangers](https://www.marcusbannerman.co.uk/HMMT/23-Heat-Exchangers.pdf) supplies the effectiveness and NTU reference.
- [COMSOL: heat-transfer coefficient definitions](https://doc.comsol.com/6.3/doc/com.comsol.help.heat/heat_ug_theory.07.094.html) supports explicit convection scales and group definitions.
- [COMSOL: radiation in an optically thick medium](https://doc.comsol.com/6.4/doc/com.comsol.help.heat/heat_ug_theory.07.076.html) states the Rosseland approximation assumptions.
- [Font: one-phase Stefan model](https://upcommons.upc.edu/server/api/core/bitstreams/30970d48-f98c-4241-9c04-4b8cfe0c4c0c/content) supplies a phase-change reference and an explicit group convention.
- [MIT: viscous heat-generation example](https://www.mit.edu/course/2/2.810/www/files/quizzes/2016_quizzes/2016_Quiz1_Solutions.pdf) supplies a dissipation reference.
- [COMSOL: Marangoni effect](https://www.comsol.com/multiphysics/marangoni-effect) supplies the interfacial stress and heat-transport model.

## Agreed decisions (build plan, 2026-10-05)

The captain approved the build plan of task VISU-9 on 2026-10-05 with these answers. They govern the implementation; the sections above are the specification itself, unchanged.

1. **Home and deploy.** The page lives in yujieteo/visuals as `viz/scientific-modelling/`, live at <https://teoyujie.org/visuals/scientific-modelling/>. It deploys after each merged piece. Each deploy before piece 9 is a preview that lists the families still to come.
2. **One page.** One page and one gallery entry: the three tools read and write the same model record.
3. **Engine.** The engine is written for the page in plain JavaScript: exact BigInt rational arithmetic, a bounded symbolic engine for the declared equation forms, and its own numerical solvers. A pinned Python script in `tools/` (SymPy, SciPy and mpmath through `uv run --with`) computes independent reference values once; the folder commits them with the versions, and the tests compare the engine with them. The page works offline and from `file://`.
4. **Nine pull requests**, merged in order:
   1. Core model and Dimensionless Number Finder.
   2. Model Nondimensionalizer.
   3. Conduction families, dominant balance, asymptotics and Regime Map Builder v1.
   4. Stability, bifurcation, buoyancy and surface radiation.
   5. Structures.
   6. Flows.
   7. Convective heat transfer.
   8. Exchangers, phase change and radiative transfer.
   9. Flutter and release gate.
5. **Flutter reference.** No PDF of NASA report 19860016812. Use the open Georgia Tech typical-section example (Hodges and Pierce parameters a = −1/5, e = −1/10, μ = 20, r = 2/5, σ = 2/5; <https://aeresources.gatech.edu/aeroelasticity/Webpage/Flutter/Examples/Examples.php>), checked by two independent methods (a Theodorsen frequency-domain method and a time-domain state-space model with the R. T. Jones approximation of the Wagner function) and a convergence check. The NASA report leaves the sources.

### Assumptions recorded with the plan

- Slug `scientific-modelling`; category "interactive model"; "first release" (section 10) is the state after piece 9.
- Equations are entered as plain text, such as `rho*c_p*d(T,t) = k*d(T,x,x)`, with a typeset preview; a LaTeX subset is also accepted.
- The model record persists in the browser and as versioned JSON export and import; the URL holds the tool, the example and the view.
- Language review: the ste-axi checker and a separate agent review in each pull request; the captain's review is final; the page claims no certified conformance.
- Turbulence, shocks, dry fronts, mechanical contact, plasticity, damage and arbitrary 3D coupled problems show "separate declaration required".
- Deck voice `bf_emma`.

### Piece 1 (this folder's first pull request)

- The view state of the shared kit is the view (example, tool, repeating set, row-reduction step, basis, detail). The model record is separate: one record per example, kept in the browser, with its own model JSON.
- The Finder runs only on a confirmed version. An edit after confirmation invalidates exactly the results that read a changed input; the checks before analysis always run on the current version.
- Repeating variables: the record's preferred reference variables first, then table order; the quantity of interest, dimensionless inputs, fields, coordinates and scales that can be 0 are not used, each with its reason. The researcher can enter another set; the page refuses an invalid set with its reason.
- Familiar names come from `data/groups.json`, stored as formulas over quantities with their reference quantities. Matching uses the variable's quantity, phase and kind, never its symbol.
- Condition count: a field with derivative order p in a coordinate needs p conditions in that coordinate, after the constitutive laws of other fields are substituted. The rule does not check well-posedness.
- Familiar groups and definitions that the specification does not define (Euler, Weber and Froude numbers) are left out until a source is cited.

### Piece 2 (the Model Nondimensionalizer)

- The researcher's scales are the record's Scales item, so a chosen scale is a new version of the record. "Use this scale" writes the candidate into the record; the new version needs a confirmation, and only the results that read a scale are invalidated. The Finder does not read scales.
- Candidate scales, in this order: a scale in the record; the length of the domain from the condition locations, or a length of the declared geometry; the difference between a prescribed value and the field's offset (the initial difference first); the balance of two terms of one equation or condition, with the scales chosen before it in place and numeric factors dropped. A scale that can be 0 is refused with its reason, and the next valid candidate is used with the changed meaning stated.
- The offset of a field is the reference value p in a difference f − p of the model, else the one value that every condition prescribes, else 0.
- Definitions reduce the algebra: a definition whose right side is a product (α = k/(ρc_p)) is expanded; a definition whose right side is a sum (T_i − T_∞) is solved for its prescribed value, which keeps the difference as one symbol. A prescribed value without a declared difference gets a new symbol, such as ΔT_i. The reverse substitution holds under these definitions.
- The common factor of an equation or condition is the coefficient of the term with the highest derivative of a field (space before time), without its numeric sign, so both sides and every sign stay where the model has them (−θ_X = Bi θ).
- A definition whose left side is a field (DT = T − T_∞) or whose right side holds a derivative (Q̇ = −kA_c T_x at x = 0) is an output: its dimensionless form defines an output group, not a parameter.
- Familiar names in the dimensionless form are proposed interpretations until the researcher confirms them, and the formula stays beside each name.
- The solutions of the examples (the fin profile, the slab modes, the lumped decay) arrive with their families in piece 3.

### Piece 3 (conduction families, dominant balance, asymptotics and the Regime Map Builder v1)

- **Declared models.** `data/catalogue.json` holds one entry for each declared model, with the six parts of section 10 as six keys: `model` (roles, equations, closures, geometry, conditions and the declared dimensionless form), `domain`, `operations`, `methods` with `limitations`, `acceptance` and `solver`. Piece 3 declares `lumped-convection`, `slab-convection`, `cylinder-convection`, `sphere-convection`, `slab-source`, `multilayer-wall` and `fin` in four families. A family's code is a module that `src/regime.js` lists in `IMPLS`.
- **The record and its declaration.** A record names its declared model in `purpose.declaration`. The page assigns the declared roles to the record's variables by quantity, kind and phase, and then requires each dimensionless equation and condition of the Nondimensionalizer (piece 2) to equal the declared form exactly, with the declared scales and offsets. A difference makes the map unresolved and names it. So the regime analyses read the Nondimensionalizer's result, as the plan says.
- **Solvers.** Separation of variables for the slab, the long cylinder and the sphere: each eigenvalue by Brent's method in its own bracket, the coefficients in closed form (checked against quadrature), modes while λ²Fo ≤ 50 and at most 400. The source slab and the two-layer wall are exact in rationals. The fin uses exponentials, so no value overflows. mpmath at 30 digits and SymPy give the reference values (`tools/references.py`).
- **Error measure.** The error of an approximation is max over X of |θ_approx − θ| divided by max over X of θ, at 21 points X = 0, 0.05, …, 1. A point where the temperature excess is below 10⁻¹² of its initial value, or where the series needs more than 400 modes, is unresolved. The tolerance is 0.1, 0.01 or 0.001.
- **The map.** A 2D slice samples 41 × 31 points and a 1D diagram 161. A boundary is drawn only inside a cell whose four corners are resolved, by linear interpolation of the logarithm of the measure along the cell's edges; a 1D crossing and a selected boundary point are refined by Brent's method. In 1D the region where no approximation meets the tolerance is the resolved range less the refined intervals.
- **Balances.** A balance compares complete terms with their estimated scales. The crossover is where the estimated terms are equal, and the crossover region is where their ratio is between 1/10 and 10. The page labels these as balance crossovers, never as transitions.
- **Asymptotics.** The small-Bi expansion is computed order by order in exact rationals (functions e^{−T} × polynomials in X² and T). The matching constant of each order comes from the projection of the initial data on the slow mode, ∫X^j θ(X, 0)(θ(X, 0) − 1) dX = 0; at order 1 this is the energy balance of the inner problem. The constants equal SymPy's series of C₁ and λ₁² to order 3.
- **Lumped body.** The spatial model of the comparison is the shape in the record's `geometry.shape`: slab, long cylinder, sphere or cube (the product of three slab solutions).
- **Condition count.** An interface condition couples the fields on its two sides, so each of its n fields counts it as 1/n of a condition (the two-layer wall). This changes the rule of piece 1 only for conditions of the kind "interface".
- **Layers of later pieces.** The stability and bifurcation layers, and the stability, bifurcation and empirical boundary types, show the piece that adds them.

### Piece 4 (stability, bifurcation, buoyancy and radiation)

- **Declared models.** `boussinesq-box` (family buoyancy convection) and `lumped-radiation`, `surface-radiation` and `convection-radiation` (family radiation), each with the six parts and a `model.stability` block: the base state, the perturbed fields, a reflection symmetry or the right side of a lumped balance. The family code is `src/convection.js` and `src/radiation.js` in `IMPLS`; a module of piece 4 also gives `stability(point, ctx)`, the analysis of hand calculation 9 at the record's point.
- **Rayleigh–Bénard geometry.** The record states a two-dimensional cell 0 < x < L, 0 < z < H with no-slip isothermal plates and stress-free adiabatic side walls, in the stream function and the vorticity. The condition count of piece 1 needs every condition of the record, and a periodic condition cannot be written; the stress-free adiabatic side walls hold exactly the mirror-symmetric rolls of a periodic layer of period 2L, so the box carries the anchor test. The neutral curve Ra(a) of the unbounded layer is still computed and drawn, and the box admits a = nπ/Γ.
- **Period of the roll branch.** The plan fixed the period at 2π/a_c. The page uses period 2 (Γ = 1, k = π), the period of Table 1S of Wen, Goluskin and Doering (2022), so that the comparison uses their published numbers at 15 values of Ra up to 10⁴. Their supplementary material is the source of the table; data/stability.json holds the transcription.
- **Solvers.** Chebyshev collocation in z on a basis that meets the wall conditions, W = (1 − ξ²)²p and Θ = (1 − ξ²)q, so each eigenproblem is a standard one solved by balanced Hessenberg QR; Fourier modes in x (ψ odd, θ even) for the rolls, Newton's method with natural continuation in Ra; the amplitude equation by Lyapunov–Schmidt reduction of the discrete system; the stability of the rolls to disturbances of the same period and symmetry only. The closed form τ = G(θ_i) − G(θ) for the lumped body; exact rationals for the duct.
- **Custom ODE systems.** `purpose.analysis` holds the control parameter, its range and an optional second parameter; the value of each state variable is the box of the equilibrium search. Classification needs its conditions: a fold its two normal-form coefficients, a pitchfork an exact sign-change symmetry that fixes the equilibrium and reverses the null vector, and a Hopf point its crossing speed and a nonzero first Lyapunov coefficient. The search coverage is always a visible unresolved result.
- **References.** `tools/stability_references.py` (mpmath 1.3.0, SymPy 1.14.0) computes Ra_c from the exact characteristic determinant of even modes (Chandrasekhar's method), the Hopf point 470/19 of the Lorenz equations, the folds and the cusp of the ignition example, and the radiation values; CI never runs it.
- **Re at Ra = 8000.** The page's Re agrees with Table 1S within 10⁻⁶ at 14 values of Ra but differs by 0.42 % at Ra = 8000, where Nu agrees within 2 × 10⁻⁷. The page shows this difference as an unresolved result.

### Piece 5 (structures)

- **Declared models.** Nine models in five families, each with the six parts and a standard example: `euler-column` and `beam-column` (beams and columns), `elastica` (nonlinear buckling), `damped-oscillator` and `beam-modes` (vibration), `navier-plate` and `cylindrical-shell` (plates and shells), `thermal-rod` and `thermal-plate` (thermoelasticity). The family code is `src/structures.js` in `IMPLS`, on its own kernel `src/structures-num.js` (Jacobi rotations, the generalized eigenproblem, RK4, conjugate gradients, the AGM, the Hermite beam element, and exact algebras of rational polynomials, rational multiples of powers of π times sines and cosines, and e^{−ξ}(a cos ξ + b sin ξ)).
- **Supports.** Each declared beam, column and plate has pinned or simply supported edges, and the shell a clamped end and a plane of symmetry. Other supports need their own declarations; the declarations say so.
- **Anchor test 4.** The Euler column gives λ = PL²/(EI) from the record in rationals, the critical eigenvalue π² with the exact check of the modes sin(nπX), Hermite elements at four meshes, and an unresolved result that states the linear model gives no deflection after buckling and points to the elastica.
- **Nonlinear buckling.** The plan's "perfect and imperfect" column is the inextensible pinned elastica with the load on a line at the eccentricity e from the ends (e = 0 is the perfect column). An eccentric load needs no symbol for π in the record; a sine imperfection would need one. The classification uses the exact symmetry θ → −θ and the exact series λ/π² = 1 + θ0²/8 + 17θ0⁴/1536 + … from the series of K (DLMF 19.5.1); SymPy gives the same coefficients. Stability is the sign of the second variation of the energy with the end constraint. The search coverage is an unresolved result.
- **Vibration.** The beam modes carry an axial load, so the first frequency reaches 0 at the Euler load: Ω₁² = π⁴ − λπ², exact for pinned ends.
- **Sources.** No open source states the clamped-edge moment p/(2β²) of the shell or the face stress ±EαΔT_g/(2(1 − ν)) of the plate held against bending; the page derives both from its exact solutions. The MIT 2.081J notes print β⁴ = Eh/(a²D) = 3(1 − ν²)/(a²h⁴); the page uses the correct Eh/(4R²D) = 3(1 − ν²)/(R²h²). Holmes (arXiv:1809.04620) gives Λ = 2K(k) for mode one, from which the page states PL²/(EI) = 4K(m)² with the parameter m = sin²(θ0/2).
- **Separate declarations.** `data/catalogue.json` lists models that need a separate declaration (`plastic-beam`, plasticity); a record that names one gets that statement and the next action. The failure example `fail-plastic` shows it.
- **References.** `tools/structures_references.py` (mpmath 1.3.0, SymPy 1.14.0, SciPy 1.16.2, NumPy 2.3.3) writes `data/structures.json`; CI never runs it.

### Piece 6 (flows)

- **Declared models.** Six models in five families, each with the six parts and a standard example: `pipe-poiseuille` and `channel-poiseuille` (internal viscous flow), `nozzle-air` (compressible nozzle flow), `shallow-water` (free-surface flow), `blasius` (boundary layers) and `joukowski-airfoil` (external aerodynamic flow). The family code is `src/flows.js` in `IMPLS`, with exact algebras of rational polynomials, numbers a + b√d of a quadratic field, and trigonometric integrals as rational multiples of π.
- **Internal viscous flow.** The declared heat-transfer case is the fully developed flow with a uniform wall heat flux. The velocity is scaled by the mean velocity and the temperature by q_wL/k, so the dimensionless pressure gradient P and the axial temperature rise S are fixed by the mean velocity and the energy balance: P = 8 and S = 2 in the pipe, P = 3 and S = 1 in the channel. f·Re = 64 and 96 and Nu = 48/11 and 140/17 are exact in rationals; finite volumes check them at second order. The wall temperature condition is left out (the temperature carries an additive constant), because it would be a third condition for a second-order equation.
- **Anchor test 3.** The nozzle model is air with γ = 7/5 in the declared equations, because the bounded symbolic engine has no variable exponents. It checks the energy equation, the exponents of the mass flux and dF/dM ∝ 1 − M² exactly, the critical values T*/T₀ = 5/6 and Φ² = 21875/46656, both branches of the area–Mach relation, and mass and energy along the nozzle. Three critical ratios divide the back pressure: the first critical ratio, the exit-shock ratio (a normal shock at the exit, NASA normal shock relation) and the design ratio. Between the exit-shock ratio and the first critical ratio a normal shock stands in the nozzle: the map shows that range as unresolved, and the regime result names the separate declaration that shocks need. Below the exit-shock ratio the flow in the nozzle is isentropic up to the exit, and the shocks or expansions in the jet are outside the model. The choked mass flow upstream of a shock stays a result.
- **Free-surface flow.** The record gives the two conditions of a supercritical inflow; the jump forms only when the outflow holds the conjugate depth, and the flat frictionless bed does not fix its position (a stated limit). The conjugate depth, the momentum balance, the head loss and its sign are exact in Q(√(1 + 8Fr₁²)). A front over a dry bed is the separate declaration `dry-front`.
- **Boundary layers.** The leading-edge and far-field conditions are at x = 0 and y = y_e; the inner scales give a parameter-free dimensionless form. The remainder δ*/x = 1.7208/√Re_x is an estimate, not a proved bound, and the map draws where it meets the tolerance.
- **External aerodynamic flow.** A curved surface is not a condition at a constant coordinate, so the record states the Laplace equation with a far-field square, and the airfoil surface and the Kutta condition belong to the declared solver (a conformal map). The stream is along x and the chord makes the angle α with it. The lumped-vortex lift is exact for the parabolic camber line, so the convergence check uses the quarter-chord moment.
- **Panels.** The flow models use the generic panel of piece 5 with their own heading: hand calculation 9 for the branches and folds of the nozzle and the shallow-water depths, hand calculation 10 for the other three.
- **Sources.** NASA Glenn (mass flow choking; normal shock waves; inclination effects on lift), Lienhard's A Heat Transfer Textbook (chapters 6 and 7), Apsley's open-channel notes, SWASHES (arXiv:1110.0288), MIT 16.110, MIT 16.01 (lectures F18 and 4), MIT 18.354 (lecture 21) and the University of Sydney cylinder notes. No open source read for this piece states f·Re = 96 for parallel plates; the page derives it from the exact profile, and SymPy gives the same.
- **References.** `tools/flow_references.py` (SymPy 1.14.0, mpmath 1.3.0) writes `data/flows.json`; CI never runs it.

### Piece 7 (convective heat transfer)

- **Declared models.** Eight models, each with the six parts and a standard example: `advection-channel` (advection–diffusion), `couette-heating` (viscous heat generation), `thermocapillary-layer` (thermocapillary heat transport) and `conjugate-channel` (conjugate heat transfer), the four new families; and four heat-transfer examples that extend families of earlier pieces: `pipe-wall-temperature` (internal viscous flow), `plate-correlation` (boundary layers), `wall-natural-correlation` and `mixed-channel` (buoyancy convection). The family code is `src/convective.js` in `IMPLS`, on its own kernels `src/htpoly.js` and `src/htnum.js`.
- **The seven heat-transfer examples.** Forced convection over a plate and natural convection at a wall declare a named correlation as their result type; the tube, mixed convection, Couette heating, thermocapillary flow and the conjugate channel declare a governing-equation model. Each record still gives the governing equations, so the Finder and the Nondimensionalizer run on it, and the constants of a correlation stay apart from the Pi calculation with their source.
- **Wall conditions kept apart.** The tube example is the uniform wall temperature (the Graetz eigenvalue, Nu_D = 3.657); the uniform heat flux (48/11) stays the declaration `pipe-poiseuille` of piece 6, and the panel shows both values beside each other.
- **Thermocapillary sign.** The record carries the signed dγ/dT and the declared gradient b; the declared parameter s·Ma_d keeps the sign, and Ma_T and Ma_d are positive magnitudes. The free surface is adiabatic; a heat loss at the surface is the separate declaration `thermocapillary-heat-loss` (failure example `fail-surface-loss`).
- **Mixed convection.** The declared model is the fully developed vertical channel between walls at two temperatures. Its exact reversal boundary is Gr/Re = 72, a line of slope 1 in the (Re, Gr) plane; the map draws the bulk Richardson number Gr/Re² beside it to show that no constant Ri gives this boundary. The gradient Richardson number is a local ratio of vertical gradients (MIT 1.63 notes); in this channel the temperature gradient and the shear are horizontal, so the page states that it is not defined there.
- **Conjugate channel.** The inlet admits heat by advection only and the wall ends are adiabatic; a Dirichlet inlet next to a conducting wall made the conduction loss grow without limit under mesh refinement, so the declaration does not use it. The mesh study uses the outer-wall temperature in the entrance region (order 2.0); the fully developed values 17/35 and (H_o/H − 1)/K are checked in the middle of the channel.
- **Empirical layer.** A new layer kind (`empirical`) draws the boundaries of `data/convective.json` as dotted lines with their regions: the state of a flat-plate layer (laminar below Re_x = 3 × 10⁴, laminar in a quiet stream up to 2 × 10⁵, a transition range up to 4 × 10⁶ that stays unresolved, then turbulent), the laminar limit of a tube (2100, with Gnielinski's range from 2300), the thermal entry length 0.034 Re_D Pr D, and Ra_L = 10⁹ at a vertical wall. Each correlation is evaluated only inside its range; outside it the result is unresolved, with the refused range.
- **Imported numerical results.** The plate example accepts a JSON file with its provenance (source, method, software, date, tolerance) and the page's group definitions; the page keeps it as an evidence item of the record (a new version), compares each point with 0.332 Pr^(1/3) inside Pr ≥ 0.6 within the stated 2 %, and keeps points outside the range without comparing them. `tools/convective_references.py` writes a sample file from SciPy's solve_bvp.
- **Sources.** Lienhard's A Heat Transfer Textbook (sections 6.1, 6.5, 6.8, 7.2, 7.3, 8.3 and 8.4), COMSOL's page on the Marangoni effect, the MIT 2.810 quiz solutions (2016) for the Brinkman number, and the MIT 1.63 notes on stratified shear flow. No open source read for this piece gives the Couette, thermocapillary or mixed-channel profiles; the page derives them exactly, and SymPy gives the same polynomials. The turbulent plate correlation (eqn. 6.112) is stated for gases; the page takes 0.6 ≤ Pr ≤ 1 as that range.
- **References.** `tools/convective_references.py` (SymPy 1.14.0, mpmath 1.3.0, SciPy 1.16.2, NumPy 2.3.3) writes `data/heatrefs.json`; CI never runs it.
- **Tests that changed.** The declaration count is 34, and a declaration may belong to a family of an earlier piece (`tests/regime.test.mjs`); the flow test reads the roadmap as at least piece 6.

### Piece 8 (exchangers, phase change and radiative transfer)

- **Declared models.** The piece has six models for its five families. Each model has the six parts and a standard example. The models are `hx-parallel` and `hx-counterflow` (heat exchangers), `stefan-melting` (phase change), `nusselt-film` (condensation), `rohsenow-water` (boiling correlations) and `absorbing-slab` (radiation in a medium). The family code is in `IMPLS` in `src/transfer.js`, and its data are in `data/transfer.json`. `tools/transfer_references.py` (SymPy 1.14.0, mpmath 1.3.0) writes `data/transferrefs.json`.
- **The six heat-transfer examples.** `hx-parallel` is Lienhard's Example 3.5 (NTU = 3/2, C_r = 1/2), with equal heat loss and gain in the Runge–Kutta profiles. `hx-counterflow` is the same exchanger in counterflow with equal capacity rates. Its ε = 3/5, the outlet temperatures and the constant temperature difference are exact. The exact series ε = 3/5 + (9/50)(1 − C_r) + … recovers the equal-capacity-rate limit. `melting-front` melts ice at −10 °C from a wall at 10 °C (water and ice properties of Tables A.2 and A.3, one density). `film-condensation` is Lienhard's Example 8.6. `pool-boiling` is water at 1 atm on copper, 15 K above saturation. `absorbing-slab` is a grey gas layer of optical thickness 1 at 1000 K between black walls at 500 K and 300 K. The boiling example declares a named correlation. The other examples declare governing-equation models.
- **Heat exchangers.** The declaration names the hot stream as the stream of C_min (C_h ≤ C_c). The effectiveness uses the form −expm1(−x)/((1 − C_r) − C_r expm1(−x)), which has no cancellation near C_r = 1. At C_r = 1 it uses the exact limit NTU/(1 + NTU). Bannerman's notes give the definitions. Their table of relations is an image, so the relations come from Lienhard's eqns. (3.20) and (3.21).
- **Phase change.** The two-phase Neumann solution of a half-space with one density (Roscani and Tarzia, fractional order 1). With T_i = T_m it is Font's one-phase solution. Font's group β = ℓ/(c ΔT) is the reciprocal of the page's Ste. The far end x_f of the solid is a record parameter so that the conditions count. The similarity solution takes it to infinity. An independent front-fixing finite-difference solution checks the interface motion. It starts from a profile that is not the similarity profile.
- **Condensation.** Nusselt's film with h′_fg from Sadasivan and Lienhard's eqn. (8.61). The record keeps the book's rounded h′_fg, and the page compares it with the formula. The density difference ρ_f − ρ_g is one record variable, as in Lienhard's dimensional analysis. The film Reynolds number Γ_c/μ places the film. The film is wave-free below 7. It has ripples from 7 to 400, and there Nusselt's result is low by up to about 20 %. Above 400 the film is turbulent, and the page refuses the laminar result.
- **Boiling correlations.** Rohsenow's correlation for water (s = 1) on the four water surfaces of Table 9.2. The pressure is between 1 atm and 167.7 atm (the data of Fig. 9.7). The superheat group is inside 0.006 to 0.06, read from Fig. 9.7. The heater is an upward-facing flat plate in a saturated pool, wider than 3λ_d1. The heat flux is below the peak heat flux of Lienhard and Dhir (eqn. 9.11). Each limit is a separate check. Outside any of them the page refuses the correlation and gives no heat flux (failure example `fail-boiling-domain`). The constants C_sf, s and 0.149 keep their source and are not Pi variables.
- **Radiation in a medium.** The automatic model is a grey, non-scattering slab at a uniform, prescribed temperature between black walls. The page solves it exactly ray by ray (E₃ closed forms). The page checks it against Table 1 of Beach, Özişik and Siewert (1971). Radiative equilibrium needs an angular integral that the equation parser cannot write, so this piece does not declare it. The map draws three approximation boundaries from the exact solution: the thin form 2τ_L, the opaque form 1 and Rosseland diffusion. The exact mid-plane error 2E₃(τ_L/2) of Rosseland diffusion meets 0.01 only above τ_L ≈ 6.98.
- **Tests that changed.** The declaration count is 40 with the five families of piece 8 (`tests/regime.test.mjs`). The roadmap has current = 8.
