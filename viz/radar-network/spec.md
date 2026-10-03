<!-- The confirmed domain specification of this visual (3 October 2026), copied from the task with its heading levels raised by 3. -->

# Radar network visualiser specification

All requirements from the [Canonical Interactive Visual Specification](https://github.com/yujieteo/skills/tree/main/interactive-visual-spec) apply.

Status: The user confirmed this scope on 3 October 2026. This document specifies the visualiser. Implementation and publication require separate tasks.

## Purpose

Create one offline HTML file for a user with radar experience. Explain the radar range equation through a full 3D scene.

Show several moving radars and moving targets. Expose every calculation through MathJax equations and numerical substitutions.

Use MATLAB conventions and published MathWorks reference cases. Use synthetic initial values where the supplied evidence lacks usable absolute values.

Use MathJax 4.1.3, CommonHTML, and Fira Math, as the owner's site does. Embed the code, font data, licences, and required resources. External servers must not supply runtime resources.

The delivered product is exactly one `index.html`. Source files, fixtures, and build tools can remain separate during development.

## Core question

How do geometry, motion, target aspect, waveform, integration, clutter, interference, and network synchronisation change the calculated radar result?

The visualiser must let the user inspect:

- Received echo power and each factor in the radar equation.
- Input SNR, matched-filter SNR, and integrated SNR.
- Thermal-noise detector threshold, required SNR, and predicted detection probability.
- Monostatic range, bistatic threshold surfaces, and trajectory threshold crossings.
- Delay, Doppler, ambiguity, pulse compression, and range–Doppler maps.
- Separate link results and optional coherent network results.

## Concept model

### Objects and links

Use 3 radar objects and 4 target objects in the initial scene. Each radar has transmit and receive functions.

A link has the stable identity `(transmitter, receiver, target)`. The initial scene therefore has 36 links.

Keep all 36 rows available. If a link is inactive or incompatible, show the reason. Do not replace its result with zero.

Use separate results by default. Provide independent monostatic, bistatic, coherent pulse integration, noncoherent pulse integration, and coherent site-combination modes.

### Coordinates and motion

Use a right-handed local Cartesian frame. Let x point east, y point north, and z point up. Use SI units internally.

Show position in km, altitude in m, velocity in m/s, and angles in degrees. Use the ground plane `z=0`.

The default trajectory is `p(t)=p0+vt`. The scene duration is 120 s. Start paused at `t=0`.

Permit piecewise-linear trajectories through time-stamped waypoints. Require strictly increasing waypoint times. Show velocity changes at corners explicitly.

Use yaw, pitch, and roll for orientation. Define yaw from +x toward +y. Define positive pitch above the horizontal plane.

Use body axes +x forward, +y left, and +z up. Map body vectors to world vectors with `Rz(yaw) Ry(-pitch) Rx(roll)`.

Each matrix is a standard right-handed active rotation. Positive roll rotates body +y toward body +z about the forward axis.

Use constant angular rates between orientation waypoints. Calculate geometry from state and time, rather than from animation frame count.

For a sampled dwell, use the displayed scene time as the dwell start. Use locally constant path rates and velocities during that dwell.

This dwell approximation must appear beside the sampled result. Trajectory corners inside a dwell require a shorter dwell or an explicit invalid result.

### Evidence and RCS

The supplied [stealth RCS visualiser](https://teoyujie.org/visuals/stealth-rcs/index.html) contains curves at 4, 10, and 17 GHz.

Its NASA aluminum-model curves cover azimuth 175°–185°. Their magnitude reference is unspecified. They do not give service-aircraft RCS in m².

Keep those curves in a separate evidence panel. Preserve their frequency, angle convention, gaps, extraction error, source, and transfer limits.

Do not convert their magnitude values to dBsm or m². Do not insert them into an absolute power calculation.

Provide 3 absolute RCS modes:

| Mode | Definition | Limit |
|---|---|---|
| Constant | A user-specified value for each target, with optional per-link overrides | A synthetic absolute value |
| Analytic aspect | A stated positive function of body-frame incident and receive directions | A synthetic sensitivity model |
| Imported table | Absolute RCS with units, frequency, angle axes, and provenance | Valid only within its supplied domain |

The default is 1 m² for every target and link.

For the analytic mode, use a simple reciprocal model:

\[
\sigma_b=\sigma_0\left[a+(1-a)\frac{q(\hat u_t)+q(\hat u_r)}{2}\right],\qquad
q(\hat u)=\sum_{d\in\{x,y,z\}}w_d u_d^2.
\]

Evaluate both directions in the target body frame. Require `0<a<=1`, `0<=wd<=1`, and `max(wd)=1`.

Start with `a=0.01` and `(wx,wy,wz)=(1,0.1,0.05)`. Label this model “Synthetic aspect response”. It is not an electromagnetic scattering solution.

For imported tables, declare monostatic or bistatic geometry. A monostatic table cannot supply arbitrary bistatic values.

Interpolate positive absolute RCS in linear units. Preserve missing data. Do not extrapolate outside the table domain.

### Antenna gain

Provide isotropic, synthetic directional, and imported-pattern modes. Start with the synthetic directional mode.

For boresight separation angle `theta`, use:

\[
G_{\mathrm{dBi}}(\theta)=G_{\mathrm{peak,dBi}}-
\min\left(12(\theta/\theta_{3\mathrm{dB}})^2,A_{\max}\right).
\]

Here `theta3dB` is the full beamwidth. Thus the attenuation is 3 dB at half that angle.

Start with a 10° beamwidth and a 30 dB attenuation cap. Label the floor as a simplified sidelobe floor.

Permit fixed boresight, orientation-relative boresight, and target tracking. Show the transmit and receive gains used for each link.

Imported patterns require angle axes, gain units, frequency, and a stated interpolation rule.

### Waveforms and sampled signals

Provide rectangular and LFM pulses. Use synthetic complex baseband samples. Do not simulate the RF carrier directly.

Use peak transmit power, pulse duration, PRF, LFM bandwidth, chirp direction, pulse count, and transmit timing as explicit inputs.

For LFM, use `mu=±B/tau` and phase `pi*mu*(t-tau/2)^2` within the pulse. Use a constant envelope.

Use an explicit matched filter for each waveform. Normalise its discrete coefficients to unit energy. Display the normalisation and output-noise variance.

Include fractional delay, propagation phase, Doppler phase, and synthetic scattering phase. Show the interpolation method and its error check.

Use a band-limited fractional-delay filter. Verify its amplitude error over the occupied waveform band against an independent frequency-domain case.

Apply the geometric Doppler once. If the phase model already supplies it, do not add a second Doppler multiplier.

Freeze attenuation and antenna gain within a dwell. Use the linear path-length model for phase and delay within that dwell.

The receiver scene contains all active target echoes, clutter echoes, direct paths, self-leakage, and noise. A channel's filter references one selected transmitter waveform.

Other active transmitters remain in that channel as interference. A receiver cannot identify an echo's source through hidden target labels.

Provide simultaneous transmission and scheduled transmission. Start with simultaneous transmission and zero timing offsets.

### Noise, detector, and integration

Use complex white Gaussian noise with system temperature `Ts`. This temperature already includes the receiver noise factor.

Show any separate noise-factor input only in an alternative temperature-entry mode. Apply its factor exactly once.

For the sampled white-noise model, use `E[|n|²]=k*Ts*Fs`. Each quadrature therefore has variance `k*Ts*Fs/2`.

This convention covers the complex sample bandwidth `Fs`. Show it beside the sample settings.

The default detector uses square-law output after ideal coherent pulse integration. Assume a nonfluctuating target and thermal noise for its analytic probabilities.

Set `Pfa` per decision cell. Treat required SNR, detector threshold, predicted `Pd`, and sampled detections as separate quantities.

Use coherent integration to sum complex samples after the selected phase compensation. Use noncoherent integration to sum squared magnitudes.

Provide Swerling 0–4. Cases 1 and 3 hold RCS constant within a dwell. Cases 2 and 4 change RCS each pulse.

Use exponential unit-mean RCS factors for cases 1 and 2. Use gamma factors with shape 2 and scale 1/2 for cases 3 and 4.

Apply those factors to power. Apply their square roots to complex amplitude. Preserve the separate synthetic scattering-phase assumption.

Use deterministic numerical integration for analytic fluctuation averages. For sampled trials, show the seed, trial count, and confidence interval.

Analytic thermal-noise probabilities do not establish `Pfa` or `Pd` in clutter and interference. Show sampled estimates separately.

### Coherent site combination

Enable coherent site combination only for compatible carrier, waveform, sample-rate, and reference-timing groups.

Use separate groups for 4, 10, and 17 GHz. Changing a carrier can remove a link from a coherent group.

Offer ideal calibration, explicit error, and separate-result modes. Start with separate results.

Expose delay, clock, carrier-frequency, phase, and scattering-phase inputs. Propagation phase alone does not establish scattering phase.

Start with synthetic scattering phase zero for every link, fixed for the complete scenario. Permit seeded per-dwell and per-pulse phase modes.

Declare the phase update interval separately from the Swerling amplitude model. Use the selected phase model in probability calculations and sampled signals.

For a selected target, align each eligible channel's delay, Doppler, carrier phase, and scattering phase.

Ideal calibration means zero residual phase and timing errors. Label its scattering-phase knowledge as a synthetic assumption.

Sum the aligned complex outputs with equal weights by default.

Report the alignment reference and weights. Use `wᴴ Cn w` for combined noise variance. Start with independent receiver thermal noise.

Do not assume independent noise for duplicate channels from the same receiver. Either calculate their covariance or refuse that combination with a reason.

Do not label a sum of powers as coherent combination. Provide a separate power-comparison view for incompatible channels.

### Clutter and interference

Use explicit synthetic ground patches with area, position, normal, reflectivity, and phase. Set patch RCS to `sigma0*area`.

Calculate each patch through the same link equation. Label reflectivity as a supplied bistatic assumption, rather than a universal terrain model.

Include a monostatic constant-gamma comparison preset only within its documented assumptions. Do not apply it to arbitrary bistatic links.

For distinct radar sites, use the Friis direct-path power:

\[
P_{\mathrm{direct}}=\frac{P_tG_tG_r\lambda^2}{(4\pi D)^2L_d}.
\]

Evaluate both antenna gains along the direct path. Use its actual waveform and delay.

For a radar's own transmitter, use an explicit self-leakage isolation value. Do not substitute `D=0` into Friis.

A cancellation setting of `C` dB scales residual power by `10^(-C/10)` and amplitude by `10^(-C/20)`.

State that this factor represents assumed cancellation. It does not simulate an adaptive cancellation algorithm.

Permit additional complex Gaussian interference with an explicit power and bandwidth. Start with this extra interference disabled.

Show thermal SNR, clutter power, interference power, and measured post-filter SINR separately. A SINR substitution is an approximation, not a calibrated detection probability.

## State

Use one versioned semantic state for the scene, calculations, import, and export. Camera changes must not change model results.

The state must include:

- Radar and target IDs, physical parameters, trajectories, and orientations.
- Antenna and waveform parameters, receive settings, and transmit schedule.
- RCS mode, table provenance, phase assumptions, and fluctuation model.
- Patch data, interference parameters, cancellation, and coherent groups.
- Detector settings, integration mode, dwell start, and sample controls.
- Time, selected objects and links, camera, visible layers, and panel state.
- Schema version, model version, source versions, and random seed.

Use a fixed preset seed of `20261003`. Derive independent random streams from the seed, object IDs, dwell index, and process name.

Reordering objects or folding a panel must not change random samples. A repeated dwell with unchanged inputs must give unchanged results.

Cache results by semantic model inputs. Camera edits do not invalidate calculations. Model edits invalidate affected sampled results.

Display “Result from previous parameters” until the user recalculates a stale dwell. Export the result's own parameter snapshot.

## Inputs

### Initial parameter preset

These are synthetic values. Only the carrier choices come from the supplied evidence.

| Parameter | Initial value |
|---|---:|
| Carrier | 10 GHz, with 4 and 17 GHz presets |
| Peak transmit power | 100 kW per radar |
| Peak transmit and receive gain | 30 dBi |
| Additional echo loss | 6 dB per complete link |
| Mean target RCS | 1 m² |
| System noise temperature | 600 K |
| Pulse duration | 10 μs |
| LFM bandwidth | 10 MHz |
| PRF | 1 kHz |
| Pulses per dwell | 64 |
| Sample rate | 20 MHz |
| Receive window after each pulse start | 0–1 ms |
| Thermal detector Pfa per cell | 10⁻⁶ |
| Required Pd | 0.9 |
| Input-noise bandwidth for the analytic comparison | 20 MHz |
| Matched-filter loss | 0 dB |
| Self-leakage isolation | 110 dB |
| Direct-path cancellation | 80 dB |
| Self-leakage cancellation | 80 dB |
| Direct-path additional loss | 0 dB |
| Extra Gaussian interference | Disabled |
| Site combination | Separate results |
| Pulse integration | Ideal coherent |
| Target fluctuation | Swerling 0 |

The 6 dB echo loss excludes geometric spreading. Free-space spreading is already in the equation.

The 0–1 ms window contains 20,000 fast-time samples at the initial sample rate. Preserve echoes from adjacent pulse intervals where required.

Do not discard late echoes silently. Show range aliasing and the pulse index associated with each calculated echo.

### Initial scene

The following TOON block defines the reproducible scene. Positions use km. Velocities use m/s.

```toon
scene:
  duration_s: 120
  time_s: 0
  paused: true
  seed: 20261003
radars[3]{id,x_km,y_km,z_km,vx_mps,vy_mps,vz_mps,waveform}:
  R1,-20,0,0.1,20,0,0,lfm_up
  R2,20,0,0.1,-10,5,0,rectangular
  R3,0,-20,2,80,20,0,lfm_down
targets[4]{id,x_km,y_km,z_km,vx_mps,vy_mps,vz_mps,yaw_deg,yaw_rate_deg_s}:
  T1,-15,0,0.15,250,0,0,0,0
  T2,10,-5,5,0,250,0,90,0
  T3,65,20,8,350,100,0,15,0
  T4,0,30,7,200,-100,0,90,3
```

Set initial pitch and roll to zero. Aim R1 and R2 at T3's initial position. Let R3 track T3.

Use those same initial directions for transmit and receive. Preserve R1 and R2's fixed boresights. Preserve R3's target-tracking mode.

T1 illustrates bistatic path geometry. T2 crosses gain contours. T3 changes threshold margin. T4 changes orientation.

Constant RCS remains the default. The analytic-aspect example activates the synthetic aspect mode for T4.

Use 25 synthetic clutter patches on the ground. Set x and y to every combination of `{-10,-5,0,5,10}` km.

Give each patch an area of 10,000 m² and reflectivity of −25 dB. Give it a seeded fixed phase and an upward normal.

These sparse patches are synthetic reflectors. They do not represent complete terrain coverage. Start with clutter and direct-path interference enabled.

### Input validity

Require positive frequency, temperature, duration, PRF, sample rate, and noise bandwidth. Require nonnegative power and RCS.

Require `0<Pfa<Pd<1`, a positive integer pulse count, and `tau*PRF<1`.

Require the sample rate to cover the occupied baseband spectrum. Show discretisation limits for rectangular pulses.

Require nonnegative additional losses. Allow gain values below 0 dBi. Display gain and loss conversions independently.

Provide a user-specified far-field distance for each antenna. Start with 100 m as a synthetic validity bound.

Mark shorter paths as outside the model. Do not clamp their distances to manufacture a valid power result.

Accept imported data only after schema, units, domain, and finite-value checks. Retain the current scene if import fails.

## Derived quantities

Use `c=299792458 m/s` and `k=1.380649×10⁻²³ J/K`. Use full precision internally and at least 4 significant digits in detailed results.

### Geometry, delay, and Doppler

For transmitter i, receiver j, and target k:

\[
R_t=\|p_k-p_i\|,\quad R_r=\|p_k-p_j\|,\quad D=\|p_j-p_i\|,
\]

\[
\hat u_t=(p_k-p_i)/R_t,\quad\hat u_r=(p_k-p_j)/R_r,
\]

\[
\dot R_t=(v_k-v_i)\cdot\hat u_t,\quad
\dot R_r=(v_k-v_j)\cdot\hat u_r,
\]

\[
\lambda=c/f,\quad\tau_e=(R_t+R_r)/c,\quad
\tau_x=(R_t+R_r-D)/c,\quad
f_D=-(\dot R_t+\dot R_r)/\lambda.
\]

Positive Doppler means approach. Label echo delay and excess delay separately. Label the range–Doppler axis as equivalent range `(Rt+Rr)/2`.

### Received power

Convert dB gains and losses with `10^(value/10)`. Use linear units inside products.

\[
P_r=\frac{P_tG_tG_r\lambda^2\sigma_b}
{(4\pi)^3R_t^2R_r^2L}.
\]

For a monostatic link with equal gains:

\[
P_r=\frac{P_tG^2\lambda^2\sigma}{(4\pi)^3R^4L}.
\]

Show `Pr` in W and dBm. Show zero power as zero W and negative infinity dBm with an explanatory label.

### SNR and detector quantities

\[
N_{\mathrm{input}}=kT_sB_n,\quad
\rho_{\mathrm{input}}=P_r/N_{\mathrm{input}},\quad
\rho_1=P_r\tau/(kT_sL_{\mathrm{MF}}).
\]

The pulse-energy SNR already includes matched-filter gain. Do not add the LFM time-bandwidth product again.

For ideal coherent integration of N identical, aligned pulses, use `rhoN=N*rho1`.

Normalise the integrated complex noise to unit mean power. Its square-law noise threshold is:

\[
\eta=-\ln P_{fa},\qquad
P_d=1-F_{\chi'^2_2(2\rho_N)}(2\eta).
\]

For noncoherent integration, the noise-only sum has a gamma distribution with shape N and scale 1.

Find its threshold from `Q(N,eta)=Pfa`. For a constant target, evaluate the noncentral chi-square tail with `2N` degrees of freedom.

Its noncentrality is `2N*rho1`. For unequal pulse strengths, use twice the sum of their single-pulse SNR values.

Solve required single-pulse SNR numerically from the selected detector, integration, fluctuation model, required Pd, and Pfa.

For Swerling models, average conditional detector probabilities over the defined fluctuation distribution. Report numerical convergence and any failure.

For conditional coherent integration with equal independent pulse-noise variance, use:

\[
\rho_{\mathrm{coh}}=\frac{\left|\sum_{m=1}^{N}\sqrt{\rho_m}e^{i\phi_m}\right|^2}{N}.
\]

Use that conditional SNR in the detector probability. Average over the configured pulse-level factors for Swerling 2 and 4.

Do not replace each fluctuating trial with N times its mean single-pulse SNR. Include residual phase in the conditional calculation.

Use robust tail functions at small Pfa. Validate against independent reference values. Do not subtract nearly equal probabilities without an accuracy check.

Show a sampled detection as a realised outcome. Show predicted Pd as a probability under the stated thermal-noise model.

Provide seeded Monte Carlo trials for clutter and interference cases. Start with 1,000 trials when the user requests an estimate.

Report Wilson 95% intervals. Do not claim that 1,000 trials validate a Pfa of 10⁻⁶.

### Range and threshold surfaces

For an explicit received-power threshold:

\[
R_{\max}=\left[\frac{P_tG^2\lambda^2\sigma}
{(4\pi)^3LP_{\min}}\right]^{1/4}.
\]

For the required single-pulse matched-filter SNR `rho_req`:

\[
R_{\max}=\left[\frac{P_tG^2\lambda^2\sigma\tau}
{(4\pi)^3kT_sLL_{\mathrm{MF}}\rho_{\mathrm{req}}}\right]^{1/4}.
\]

Distinguish this required SNR from the noise-only detector threshold eta.

For a bistatic power threshold with fixed parameters:

\[
R_tR_r=\sqrt{\frac{P_tG_tG_r\lambda^2\sigma_b}
{(4\pi)^3LP_{\min}}}.
\]

Its planar section is a Cassini oval. Its 3D surface is not a constant-delay ellipsoid.

Offer frozen-parameter surfaces and active-model surfaces. Label which one the scene shows.

Frozen surfaces use fixed gains, RCS, and loss. Active surfaces evaluate local angle-dependent parameters at each sample point.

Use bracketed numerical roots for active-model range cuts. Return all resolved intervals, rather than an unexplained single maximum.

Scan trajectory margins at intervals no larger than 0.05 s. Refine sign-change roots to 1 ms.

Check sampled local extrema for tangential contacts. Report the temporal resolution and unresolved near-threshold intervals.

Segment the search at trajectory and orientation discontinuities. Avoid a guarantee that finite samples find arbitrarily short crossings.

### Range–Doppler and ambiguity

Display matched-filter fast-time output and a slow-time FFT. Use an explicit rectangular or Hann window and show its normalisation.

Label apparent range and aliased Doppler. Show nominal LFM resolution `c/(2B)`, slow-time resolution `PRF/N`, and ambiguity limits.

For rectangular pulses, state the pulse-width resolution convention separately. Use full pulse energy in both waveform SNR calculations.

Plot delay–Doppler ambiguity for the selected waveform. Keep waveform ambiguity separate from the multi-target received map.

Calculate measured noise, clutter, and interference contributions at the same processing stage as the signal result.

### Manual calculation panels

Each of the 36 panels must expose:

1. Object IDs, scene time, positions, velocities, and angle conventions.
2. Path distances, direction vectors, path rates, delay, and Doppler.
3. Frequency-to-wavelength and dB-to-linear conversions.
4. Symbolic power equation, substituted values, numerator, denominator, and result.
5. Noise convention, matched-filter SNR, integration, and required SNR.
6. Threshold margin, range interpretation, and validity limits.
7. Clutter, interference, coherence, and sampled-result details where applicable.

Use MathJax for symbolic equations and numerical substitutions. Keep values as selectable text.

Provide “Expand all”, “Collapse all”, “Expand selected”, and calculation search. Typeset newly opened panels without unnecessary page-wide work.

## Views / visualisations

On desktop, place the 3D laboratory beside the link table. Place each calculation beneath its link row.

On mobile, show the scene, selected result, table, calculation, and advanced controls in that order.

Provide these linked views:

| View | Required content |
|---|---|
| 3D scene | Radar and target positions, orientations, beams, paths, trails, and selectable surfaces |
| Link table | All 36 combinations, type, power, SNR, margin, delay, Doppler, and validity |
| Time plot | Selected link power, margin, Doppler, and threshold crossings |
| Received signal | Selected channel before and after matched filtering |
| Range–Doppler | Combined received scene, with selectable cells and processing settings |
| Coherent comparison | Separate signals, phase errors, aligned sum, and noise covariance |
| Evidence | Published curve metadata and limits, separate from synthetic absolute inputs |
| Reference checks | Published inputs, expected output, calculated output, tolerance, and status |

Use solid lines for monostatic paths and dashed lines for bistatic paths. Add text and shape cues to every colour distinction.

Use a projected full 3D scene through inline SVG or Canvas. The renderer must preserve depth and perspective.

Provide numeric controls and the link table as complete alternatives to direct 3D manipulation. Handle renderer failure with an explicit fallback.

## Interactions

### Camera and selection

Provide rotate, pan, zoom, fit scene, home, top, front, side, and perspective/orthographic controls.

Permit object selection in the scene or table. Synchronise highlights across equations, plots, and paths.

Provide centre selected, follow selected, isolate selected links, and clear selection. Camera follow changes the camera only.

Use a visible mode control for “Rotate view” and “Move object”. Object movement must not result from an ambiguous camera gesture.

Show XY, XZ, and YZ edit planes. Supply altitude controls and numerical position fields beside drag controls.

Provide a short visible gesture guide. Touch interaction requires explicit alternatives to hover and precise dragging.

### Object and model controls

Group controls into Scene, Radar, Target, Processing, Environment, and Network panels.

Expose position, velocity, altitude, orientation, angular rates, waypoints, antenna direction, and track-target selection.

Permit parameter edits for every radar and target. Provide per-object reset, whole-scene reset, undo, and redo.

Pause time before a trajectory edit. Preserve the edit time and state in history. Recalculate dependent analytic values immediately.

### Time and layers

Provide play, pause, scrub, restart, dwell step, and a numerical time entry.

Provide playback rates of 0.25×, 0.5×, 1×, 2×, and 4×. Offer precise step sizes of 1 ms, 10 ms, and 1 s.

Group layer switches for beams, paths, trails, labels, clutter, threshold surfaces, and velocity vectors.

Provide presets for Geometry, Signal processing, and Network comparison. A view preset changes presentation only.

### Calculation actions

Update analytic results during motion. Run sampled processing only through “Calculate dwell” at the selected time.

Provide progress and cancel controls. Calculate selected channel maps first, with an explicit option to calculate all channels.

Use a local worker where available. Keep cancellation and scene controls responsive. Show resource estimates before expensive calculations.

Do not silently reduce pulse count, sample rate, target count, or patch count. State any downsampling used for display separately.

Use a 256 MiB working-memory target. Refuse an unsupported calculation size with the required and available limits.

Avoid permanent arrays for every link. Stream contributions into selected channel buffers and retain compact intermediate summaries.

The initial 36 analytic links must update within 100 ms on the documented reference desktop.

Target less than 5 s for one initial sampled channel on that desktop. Report measured performance rather than an unsupported guarantee.

### Keyboard and accessible controls

Provide local Cmd/Ctrl+K search for objects, links, parameters, views, and commands.

Use Space for play/pause only outside text fields. Use Escape to cancel a gesture or close a panel.

Provide visible focus, accessible names, non-colour cues, and a discoverable shortcut guide. Respect reduced motion.

The complete calculation, export, import, and reset workflow must work with keyboard input and touch input.

## Examples

Provide named, resettable examples from the same model:

| Example | Question |
|---|---|
| Monostatic scaling | Why does twice the range reduce received power by a factor of 16? |
| Equal delay, unequal power | How can equal path sums give different path products? |
| Bistatic Doppler null | How can a moving target have zero bistatic Doppler? |
| Gain contour crossing | How does antenna direction change power without a range change? |
| Aspect response | How does synthetic orientation-dependent RCS change the margin? |
| Integration | How do coherent and noncoherent integration differ? |
| Direct-path interference | How do cancellation and filter sidelobes change the received map? |
| Coherence errors | How do phase and delay errors change the complex sum? |
| Frequency convention | What changes when gain stays fixed, versus physical aperture stays fixed? |

Use explicit settings for each example. An example reset restores its seed and parameters.

For the frequency example, provide constant gain and constant effective aperture as separate choices. Show `G=4*pi*Aeff/lambda²` for the aperture choice.

Show a simple bistatic geometry fixture with stationary sites at `(−10,0,0)` km and `(10,0,0)` km.

Compare targets at `(0,10,0)` km and `(5,sqrt(87.5),0)` km. Their path sums match, but their path products differ.

For the Doppler-null fixture, put a target between stationary sites on their baseline. Let it move along that baseline.

Restrict that fixture to the segment interior and valid far-field distances. Its path sum remains constant.

## Exercises

Provide short expert exercises with prediction before reveal:

1. Predict the received-power change when range doubles.
2. Predict power and delay for the equal-delay fixture.
3. Find a target velocity that gives zero bistatic Doppler.
4. Explain the difference between required SNR and detector threshold.
5. Predict the effect of a phase error on 2 equal coherent channels.
6. Identify a double-counted processing gain in a supplied calculation.
7. Explain why the NASA model curves cannot supply absolute aircraft range.

Exercise reveals must use the current model's own results. They must not maintain a second calculation implementation.

## Domain-specific invariants

- Monostatic geometry reduces the bistatic power equation to the R⁻⁴ equation.
- Twice the range gives one sixteenth of the received power under fixed parameters.
- A 3 dB loss approximately halves power. It does not halve amplitude.
- Pulse-energy SNR includes matched-filter energy gain exactly once.
- Ideal coherent integration increases SNR by N for identical aligned pulses.
- Equal delay does not imply equal received power.
- Changing the camera or panel state changes no physical result.
- Zero net path rate gives zero Doppler under the stated convention.
- RCS fluctuations have the configured mean and update interval.
- Coherent sums operate on complex signals with explicit noise covariance.
- Imported or evidence data retain their domains, units, gaps, and provenance.
- JSON round trips preserve semantic state and deterministic calculations.
- Scene, equations, tables, and exports identify the same objects and time.

## Export representation

### JSON

Export the complete semantic scenario through `radar-network-scenario.json`. Include schema and model versions, sources, seed, time, and parameter units.

Include result snapshots only with their own model-input digest and processing settings. Import must validate their compatibility.

Use JSON for the public exchange contract. Use compact TOON tables for agent-facing summaries where useful.

Do not add a second public import format solely to reduce tokens.

### beamdswitch report

Use the owner's canonical [beamdswitch template](https://github.com/yujieteo/site/blob/main/templates/beamdswitch.js) unchanged.

The implementation must copy its exact code into the HTML. Record the source commit and SHA-256 at build time.

Use its `deck(report)` interface and its standard skeleton. Do not replace it with an independently written Markdown formatter.

Export `radar-network-beamdswitch.md`. Provide Download and Copy controls.

Use the standard section order:

1. Set-up: purpose, scene, radar parameters, targets, coordinates, time, seed, and sources.
2. Method: range equation, conversions, delay, Doppler, processing, detector, and assumptions.
3. Results: all 36 link summaries and manual calculations, followed by available sampled results.
4. Checks and takeaway: reference checks, invariants, validity limits, and one final key frame.

Use front matter with title, subtitle, fixed scenario date, and `voice: bf_emma`.

Include narration for every frame. Write narration as plain spoken STE prose. Read values with their units.

Use notes for sign conventions, camera state, model limits, and detailed settings. Use LaTeX in frame bodies for equations.

Use the exact formatted values from the calculation snapshot. Keep full precision in JSON.

Include each link even if its calculation panel is folded. State inactive or invalid links with their reasons.

Include the current scene geometry as coordinate tables and camera notes. Use template plot blocks only for supported mathematical expressions.

For sampled maps, export processing settings and numerical summaries. Do not invent an unsupported plot syntax.

If sampled results are stale, identify their separate parameter snapshot. Do not present them as current results.

The report contains Markdown and narration text. It does not generate audio or video inside the offline visualiser.

Repeated exports from identical state must match. An export timestamp must not cause an otherwise identical report to differ.

## Domain-specific tests

### Published MATLAB reference cases

Store exact inputs, source URL, retrieval date, displayed output, and tolerance in independent fixtures.

These are published reference values. They do not establish that MATLAB was executed during this specification task.

| Case | Inputs | Published result | Acceptance tolerance |
|---|---|---:|---:|
| Monostatic SNR | f=10 GHz, R=100 km, Pt=1 MW, tau=1 μs, sigma=0.5 m², Gt=Gr=40 dB, Ts=300 K, L=3 dB | 14.3778 dB | 0.0001 dB |
| Bistatic SNR | f=10 GHz, Rt=50 km, Rr=75 km, Pt=1 MW, tau=1 μs, sigma=1 m², Gt=40 dB, Gr=20 dB, Ts=290 K, L=0 dB | 9.0547 dB | 0.0001 dB |
| Monostatic range | f=10 GHz, required single-pulse SNR=6 dB, tau=10 μs, Pt=1 MW, sigma=0.1 m², Gt=Gr=40 dB, Ts=290 K, L=3 dB | 194,260 m | 5 m |

Sources: [radareqsnr examples](https://www.mathworks.com/help/radar/ref/radareqsnr.html) and [radareqrng example](https://www.mathworks.com/help/radar/ref/radareqrng.html).

Set isotropic directional factors, Swerling 0, and no extra losses for these cases. Apply the listed loss only once.

The independent equation check during this specification task gave 14.3777728 dB, 9.0546800 dB, and 194,259.664 m.

The published [npwgnthresh real-detector example](https://www.mathworks.com/help/phased/ref/npwgnthresh.html) gives 7.3335 dB at Pfa=0.01 for one pulse.

That case uses real Gaussian samples. It does not validate this visualiser's default complex square-law detector.

Before detector implementation is accepted, obtain MATLAB fixtures for the actual complex detector, pulse integration, Pd inversion, and Swerling modes.

Record the MATLAB release, exact calls, inputs, and outputs. If execution is unavailable, identify those checks as unverified.

### Independent numerical checks

Verify the single complex-cell threshold against `−ln(Pfa)`. Verify noncoherent thresholds against gamma tails.

Verify noncentral chi-square tails against an independent numerical library. Check small tail probabilities and inversion residuals.

Verify conditional fluctuation averages through quadrature convergence and seeded Monte Carlo confidence intervals.

Verify matched-filter signal and noise normalisation on a single delayed pulse. Check LFM and rectangular pulse energy separately.

Verify Doppler sign, FFT axis, window normalisation, range aliasing, and delay interpolation against independent synthetic cases.

Verify phase cancellation and reinforcement with 2 equal channels. Verify coherent noise variance for independent and correlated channels.

Verify direct-path cancellation in power and amplitude units. Verify zero-distance self-leakage uses the isolation model.

### Export and browser checks

Parse exported decks with beamdswitch's own parsers. Verify section order, narration, voice, mathematical values, and the final key frame.

Verify the embedded template against the canonical template checksum. Verify all 36 links appear in the report.

Deny network access before page load. Exercise fonts, equations, controls, processing, JSON import, and beamdswitch export.

Assert zero unexpected network requests, including font and MathJax extension requests.

Test file access, iframe access, desktop browsers, a 320 px viewport, touch controls, keyboard controls, and reduced motion.

Test that selected objects agree across the scene, table, equations, plots, and report.

### Test ownership

Model, data, fixture, and report tests belong to the visual's source folder in `yujieteo/visuals`.

Standalone browser checks belong to its separate technical E2E folder and jobs. Website integration checks belong to `yujieteo/site`.

Do not duplicate the complete browser suite in the site repository. Site checks apply only if a later task integrates or publishes the visualiser.

## Acceptance criteria

The implementation is ready for standalone review only when all applicable checks below pass:

1. One HTML file opens offline and performs the complete primary workflow.
2. MathJax 4.1.3 and Fira Math work with network access denied from the first load.
3. The initial 3D scene reproduces the specified state and all 36 link rows.
4. Every link exposes a complete manual calculation or a precise validity reason.
5. Received power and required-SNR range agree with the published MATLAB cases within tolerance.
6. Detector and processing checks identify their exact conventions and verification status.
7. Geometry, waveform, integration, aspect, clutter, interference, and coherence examples remain reproducible.
8. Full 3D controls, numeric alternatives, undo, reset, time controls, and layer controls work consistently.
9. Sampled calculations remain cancellable and show stale-result state after relevant edits.
10. JSON import/export preserves state and seeded results.
11. beamdswitch export uses the unchanged template and reproduces the calculation snapshot.
12. The NASA evidence remains separate from synthetic absolute RCS and range results.
13. Mobile, keyboard, touch, print, no-JavaScript, and reduced-motion requirements pass.
14. The report lists performance measurements, model limits, and any unverified checks.

This specification task is complete when this Markdown document records the confirmed scope and passes a document review.

Implementation completion requires the standalone checks above. Publication completion additionally requires the canonical website integration and live checks.

### Model references

Use these primary sources for the specified conventions:

- [Radar equation and noise conventions](https://www.mathworks.com/help/radar/ug/radar-equation.html).
- [Bistatic constant-SNR contours](https://www.mathworks.com/help/radar/ref/bistaticconstantsnr.html).
- [Bistatic delay and Doppler example](https://www.mathworks.com/help/phased/ug/simulating-a-bistatic-radar-with-two-targets.html).
- [Waveform ambiguity](https://www.mathworks.com/help/phased/ug/waveform-analysis-using-the-ambiguity-function.html).
- [Matched-filter gain](https://www.mathworks.com/help/radar/ref/matchinggain.html).
- [Pulse integration](https://www.mathworks.com/help/phased/ref/pulsint.html).
- [Integration and fluctuation losses](https://www.mathworks.com/help/radar/ug/introduction-to-integration-and-fluctuation-losses-in-radar.html).
- [Target fluctuation models](https://www.mathworks.com/help/phased/ug/radar-target.html).
- [Constant-gamma clutter assumptions](https://www.mathworks.com/help/radar/ref/constantgammaclutter-system-object.html).
- [Cooperative bistatic processing and direct-path interference](https://www.mathworks.com/help/radar/ug/cooperative-bistatic-radar-IQ-simulation-processing.html).
- [MathJax local installation](https://docs.mathjax.org/en/latest/web/hosting.html) and [font resources](https://docs.mathjax.org/en/latest/output/fonts.html).

The supplied page's local source was inspected because the live URL was unavailable during this task. Preserve that verification limit.
