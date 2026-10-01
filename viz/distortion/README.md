# Structural Distortion Explorer

An exaggerated, qualitative and unit-free 3D view of how loads distort
thin-walled structures. Nothing is calibrated and no quantity carries units:
the page says so under its title. `index.html` is one self-contained file with
three.js inlined; it makes no network requests and works offline.

What it shows: a cantilevered circular tube, rectangular box and I-beam
(clamped at x = 0, loaded at the free end) and a 2:1 stiffened panel (three
stringers, two frames, each set toggleable) loaded in its own plane by in-plane
shear and axial load. Axial load with Poisson swell, Euler-Bernoulli bending,
thin-walled transverse shear, Saint-Venant torsion and torsional warping (Vlasov
for the I-beam, with an optional warping restraint at the clamp) are analytic;
shear lag in the box flanges and the buckling wrinkles and thresholds are
assumed shapes, and the page's legend and "What am I looking at?" panel say
which is which. A draggable, rotatable amber unit patch has a synced 2D inset
with principal arrows and the shear-angle arc; there are colour maps, six
presets, auto-play (off by default and disabled for reduced motion), a
bottom-sheet layout on phones and a plain message when WebGL is missing.

Buckling is threshold-triggered: a plate stays flat until the interaction ratio
σ/σcr + (τ/τcr)² passes 1 (each load slider marks its own onset), then wrinkles
as √(r − 1). The thresholds use the classical plate coefficients but a 1/b
rather than (t/b)² width dependence, so every case buckles inside the slider
range while stiffeners still raise the threshold and shorten the waves.

| File | Role |
| --- | --- |
| `kinematics.js` | Pure kinematics: section paths, thin-walled shear flow, the deformation field of every load. No DOM and no three.js. Works in the browser (`Distortion`) and in Node (`require`). |
| `template.html` | Page markup, styles, three.js scene and UI code |
| `raw.json` | Published metadata: the effects shown and whether each is analytic or an assumed shape, and the three.js release |
| `vendor/three.min.js` | three.js r186 (npm `three@0.186.1`, MIT licence, <https://threejs.org>) with `OrbitControls`, bundled as the global `THREE` |
| `vendor/three-entry.mjs` | The classes re-exported into that bundle |
| `build.mjs` | Inlines `vendor/three.min.js`, `kinematics.js` and `raw.json` into `template.html` to write `index.html` |
| `LICENSE` | MIT licence for this visualization (the inlined three.js keeps its own MIT notice) |

```sh
node visuals/distortion/build.mjs          # rebuild index.html after editing a source
node visuals/distortion/build.mjs --check  # fail if index.html is stale
node --test tests/distortion.test.mjs      # kinematics, presets, artefact and build tests
```

The tests use Node's built-in runner, like the site's other Node tests, so the
repository needs no `package.json`.

## three.js

`vendor/three.min.js` is generated once, outside this repository, and checked
in; the licence text heads the file. To regenerate it (for example to move to a
newer release), in an empty directory:

```sh
npm pack three@0.186.1 && mkdir -p node_modules/three && tar xzf three-0.186.1.tgz -C node_modules/three --strip-components 1
cp <site>/visuals/distortion/vendor/three-entry.mjs entry.mjs
npx esbuild@0.25.10 entry.mjs --bundle --minify --format=iife --global-name=THREE --legal-comments=none --outfile=three.min.js
```

then prepend the licence header from the current file (updating the release)
and rebuild `index.html`.
