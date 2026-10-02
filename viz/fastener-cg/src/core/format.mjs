/* Display formatting. Exports keep full precision; the screen shows
 * `precision` significant figures (default 4). */

/* `scale` snaps round-off noise (|v| < 1e-9·scale) to zero. */
export function fmt(value, precision = 4, scale = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (scale > 0 && Math.abs(value) < 1e-9 * scale) value = 0;
  if (value === 0) return "0";
  const rounded = Number(value.toPrecision(precision));
  const a = Math.abs(rounded);
  const text = a >= 1e-4 && a < 1e12 ? String(rounded) : rounded.toExponential(Math.max(0, precision - 1)).replace(/\.?0+e/, "e");
  return text.replace(/^-/, "−");
}
