/* A small 3D view for generated visuals (scripts/new_visual.py --3d): an orthographic camera that the state
 * holds as two angles, so the URL, JSON and exports restore the same view (§4, §12). It draws into SVG, so the
 * marks take their colours from the style tokens, and it needs no WebGL, library or network.
 *
 *   project(point, camera)   [x, y, z] in model units to [x, y, depth] on screen, for camera { yaw, pitch } in degrees
 *   attach(svg, app, keys)   drag on the SVG, or press the arrow keys while it has focus, to turn the camera; it
 *                            sets the state fields keys.yaw and keys.pitch through app.set(), replacing the
 *                            history entry. Reduced motion changes nothing: the view never moves on its own.
 *
 * scripts/visual_build.py inlines this file unchanged in <script id="view3d">. Node tests load it with require().
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.View3D = api;
})(/** @type {any} */ (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  const RAD = Math.PI / 180;
  const STEP = 5;

  /**
   * A model point on the screen plane: turn by yaw about the vertical axis z, then tilt by pitch about the
   * screen's horizontal axis. Screen y grows downwards, as in SVG; depth grows towards the viewer.
   * @param {[number, number, number]} point @param {{ yaw: number, pitch: number }} camera @returns {[number, number, number]}
   */
  function project(point, camera) {
    const [x, y, z] = point;
    const cy = Math.cos(camera.yaw * RAD), sy = Math.sin(camera.yaw * RAD);
    const cp = Math.cos(camera.pitch * RAD), sp = Math.sin(camera.pitch * RAD);
    const u = cy * x - sy * y;
    const w = sy * x + cy * y;
    return [u, -(cp * z - sp * w), sp * z + cp * w];
  }

  /**
   * Turn the camera by dragging on `svg` or with the arrow keys while it has focus.
   * @param {SVGSVGElement} svg @param {{ state: Record<string, any>, set(patch: Record<string, unknown>, mode?: "push" | "replace"): void }} app
   * @param {{ yaw: string, pitch: string }} keys the state fields that hold the angles
   */
  function attach(svg, app, keys) {
    /** @param {number} dYaw @param {number} dPitch */
    const turn = (dYaw, dPitch) => {
      const s = app.state;
      app.set({ [keys.yaw]: Math.round(((s[keys.yaw] + dYaw + 540) % 360) - 180), [keys.pitch]: Math.round(Math.max(-90, Math.min(90, s[keys.pitch] + dPitch))) }, "replace");
    };
    svg.addEventListener("keydown", (e) => {
      const move = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, STEP], ArrowDown: [0, -STEP] }[e.key];
      if (!move) return;
      e.preventDefault();
      turn(move[0], move[1]);
    });
    /** @type {{ x: number, y: number } | null} */
    let from = null;
    svg.addEventListener("pointerdown", (e) => { from = { x: e.clientX, y: e.clientY }; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener("pointermove", (e) => {
      if (!from) return;
      const dx = e.clientX - from.x, dy = e.clientY - from.y;
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      from = { x: e.clientX, y: e.clientY };
      turn(dx / 2, -dy / 2);
    });
    const stop = () => { from = null; };
    svg.addEventListener("pointerup", stop);
    svg.addEventListener("pointercancel", stop);
  }

  return { project, attach, STEP };
});
