// Reference drawing 6: build drawing 1 (the cantilever) by touch alone.
//
// Paste into the browser console with the page open at phone size, with touch
// emulation on (for example Chrome DevTools device mode, 390 × 844), or run it
// with any DevTools driver. It uses only what a phone offers: one-finger taps
// and drags as touch pointer events on the canvas, a two-finger pinch, taps on
// the toolbar and properties sheet, and text typed into the sheet's fields
// (the on-screen keyboard). It never calls the drawing model directly. At the
// end it compares the saved JSON with examples.json's cantilever, checks that
// each pinch really changed the zoom, and returns { same, differences }.
(async function touchBuild() {
  const F = window.FBD, A = window.FBDApp;
  const svg = document.getElementById("canvas");
  const pause = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const at = (sx, sy) => { const r = svg.getBoundingClientRect(); return [r.left + sx, r.top + sy]; };
  function touch(type, [sx, sy], id = 1) {
    const [x, y] = at(sx, sy);
    const target = type === "pointerdown" ? document.elementFromPoint(x, y) || svg : svg;
    target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, pointerType: "touch", isPrimary: id === 1, bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1 }));
  }
  async function drag(points, id = 1) {
    touch("pointerdown", points[0], id);
    for (const p of points.slice(1)) touch("pointermove", p, id);
    touch("pointerup", points[points.length - 1], id);
    await pause();
  }
  const tap = (p) => drag([p]);
  // Screen position of a world point (what the finger aims at on screen).
  const scr = (x, y) => A.w2s(x, y);
  async function pinch(center, from, to) {
    const [cx, cy] = center;
    touch("pointerdown", [cx - from, cy], 1); touch("pointerdown", [cx + from, cy], 2);
    for (let i = 1; i <= 6; i++) { const d = from + (to - from) * i / 6; touch("pointermove", [cx - d, cy], 1); touch("pointermove", [cx + d, cy], 2); }
    touch("pointerup", [cx - to, cy], 1); touch("pointerup", [cx + to, cy], 2);
    await pause();
  }
  async function press(el) { if (!el) throw new Error("control not found"); el.click(); await pause(); }
  const toolBtn = (name) => document.querySelector(`[data-tool="${name}"]`);
  const segBtn = (key, v) => document.querySelector(`[data-seg="${CSS.escape(key)}"][data-v="${CSS.escape(v)}"]`);
  async function type(key, text) {
    const el = document.querySelector(`[data-bind="${CSS.escape(key)}"]`);
    if (!el) throw new Error(`no field ${key}`);
    el.focus(); el.value = text; el.dispatchEvent(new Event("change", { bubbles: true })); el.blur();
    await pause();
  }
  async function choose(key, value) {
    const el = document.querySelector(`[data-bind="${CSS.escape(key)}"]`);
    if (!el) throw new Error(`no field ${key}`);
    el.value = value; el.dispatchEvent(new Event("change", { bubbles: true }));
    await pause();
  }
  const actButton = (label) => [...document.querySelectorAll("#panel button")].find((b) => b.textContent.trim() === label);
  const emptySpot = () => { const r = svg.getBoundingClientRect(); return [r.width - 20, 20]; };
  const deselect = () => tap(emptySpot());

  // New drawing (the confirmation is a tap on OK).
  const realConfirm = window.confirm; window.confirm = () => true;
  await press(document.getElementById("file"));
  await press([...document.querySelectorAll(".menu-pop button")].find((b) => b.textContent === "New drawing"));
  window.confirm = realConfirm;
  await deselect();

  // Two-finger pinch out, then in: zoom and pan without touching the drawing.
  const r0 = svg.getBoundingClientRect();
  const zoomBefore = A.cam.k;
  await pinch([r0.width / 2, r0.height / 2], 40, 90);
  const zoomOut = A.cam.k;
  await pinch([r0.width / 2, r0.height / 2], 90, 30);
  const zoomed = A.cam.k;
  const pinchZoomed = zoomOut > zoomBefore * 1.5 && zoomed < zoomOut / 2;

  // Drawing settings from the sheet.
  await type("doc.title", "Cantilever with point load, UDL and end moment");
  await choose("units.length", "m"); await choose("units.force", "kN"); await choose("units.moment", "kN·m"); await choose("units.distributed", "kN/m");

  // Beam: one-finger drag from the origin to 3 m, then precise entry of the length.
  await press(toolBtn("beam"));
  await drag([scr(0, 0), scr(1000, 0), scr(3000, 0)]);
  await type("body.b1.length", "3 m");
  await type("body.b1.depth", "200 mm");
  // Dimension line along it.
  await press(toolBtn("dimension"));
  await drag([scr(0, 0), scr(1000, 0), scr(3000, 0)]);
  await type("body.b2.offset", "-60");

  // Fixed support at the left end.
  await press(toolBtn("support"));
  await press(segBtn("tool.support", "fixed"));
  await tap(scr(0, 0));
  await type("s1.label", "A");

  // Uniform load: tap the beam for its whole length, then the values.
  await press(toolBtn("distributed"));
  await press(segBtn("tool.style", "applied"));
  await tap(scr(1500, 0));
  await type("q1.label", "w"); await type("q1.w1", "2"); await type("q1.w2", "2"); await choose("q1.unit", "kN/m");

  // Point load at 2 m: tap, drag upwards to aim it down.
  await press(toolBtn("force"));
  await drag([scr(2000, 0), scr(2000, 150), scr(2000, 400)]);
  await type("f1.s", "2 m"); await type("f1.mag", "10 kN ∠ -90"); await choose("f1.unit", "kN"); await type("f1.label", "P");

  // End moment, flipped to clockwise.
  await press(toolBtn("moment"));
  await tap(scr(3000, 0));
  await press(actButton("Flip sense"));
  await type("m1.mag", "5 kN·m"); await choose("m1.unit", "kN·m"); await type("m1.label", "M_B");

  // Reactions at A: A_x (tail at the point), A_y and M_A.
  await press(toolBtn("force"));
  await press(segBtn("tool.style", "reaction"));
  await drag([scr(0, 0), scr(-150, 0), scr(-400, 0)]);
  await press([...document.querySelectorAll('#panel input[type=checkbox]')].find((c) => c.dataset.bind === "f2.anchor"));
  await type("f2.angle", "0"); await type("f2.label", "A_x");
  await press(toolBtn("force"));
  await drag([scr(0, 0), scr(0, -150), scr(0, -400)]);
  await type("f3.label", "A_y");
  await press(toolBtn("moment"));
  await tap(scr(0, 0));
  await type("m2.label", "M_A");

  // Move the axes: select the triad by tapping it, then type its origin.
  await press(toolBtn("select"));
  await deselect();
  await type("triad.x", "-800 mm"); await type("triad.y", "-700 mm");

  // Compare with reference drawing 1.
  const built = JSON.parse(F.serialize(A.doc));
  const ref = document.getElementById("fbd-examples") ? JSON.parse(document.getElementById("fbd-examples").textContent).examples.find((e) => e.id === "cantilever").drawing : null;
  const differences = [];
  (function diff(a, b, path) {
    if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) { differences.push(`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); return; }
    if (a && typeof a === "object") {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) diff(a[k], b[k], `${path}.${k}`);
      return;
    }
    if (typeof a === "number" ? Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(b)) : a !== b) differences.push(`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  })(built, ref, "drawing");
  const beam = built.geometry.bodies.find((b) => b.id === "b1");
  const [p, q] = beam.joints.map((id) => built.geometry.joints.find((j) => j.id === id));
  if (!pinchZoomed) differences.push(`pinch did not zoom: ${zoomBefore} → ${zoomOut} → ${zoomed} px/mm`);
  return { same: differences.length === 0, differences, pinchZoomed, zoom: [zoomBefore, zoomOut, zoomed], beamLengthMm: Math.hypot(q.x - p.x, q.y - p.y), viewport: [innerWidth, innerHeight], touchPoints: navigator.maxTouchPoints };
})();
