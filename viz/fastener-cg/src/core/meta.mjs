/* Tool identity and the conventions every report repeats. */

export const TOOL_NAME = "Fastener Pattern CG Tracker";
export const TOOL_VERSION = "0.6.0-m6";
export const MILESTONE = "M6";

export const CONVENTIONS = [
  "Right-handed axes: x right, y up, z toward the viewer.",
  "The faying surface is the plane z = 0; fasteners are located by (x, y) and z is the fastener axis.",
  "Positive Fz is tension: it pulls the loaded plate away from the other plate.",
  "Moments follow the right-hand rule about each axis; positive Mz is counter-clockwise viewed from +z.",
  "The origin is a user-defined datum.",
];

export const ASSUMPTIONS = [
  "Headline CG is the shear centroid Cs; J is about Cs; Ixx, Iyy and Ixy are about the axial centroid Ca.",
  "Elastic in-plane shear: rigid plate rotating about Cs, fasteners sharing load in proportion to ks.",
  "Axial method (a): rigid plate with the neutral axis through Ca; the joint is assumed to stay clamped (W-005). Unloading fasteners are shown as computed.",
  "Section properties are in length² × stiffness weight.",
  "Prying (T-stub, keyed B and Fp) acts on positive external tension only, using the loaded plate's thickness t and flange strength Fp; a ≤ 1.25·b. A manual factor f replaces it with a bolt tension f·T (W-012).",
  "Preload: F_b = max(P_max + φ·T, T) + Q; clamp force P_min − (1 − φ)·T; separation load P_min/(1 − φ). Prying Q is added to the bolt load (conservative). Preload does not scale with the load multiplier k. Friction slip is not evaluated (N-005).",
  "Plates are axis-aligned rectangles (up to two). Every fastener passes through every plate. Bearing R = Fbr·D·t (or a direct-load allowable); tear-out capacity 2·t·(e − D/2)·Fsu with e cast along the bearing direction: −R in the loaded plate, +R in the other plate.",
  "Axial method (b) uses a plate edge as the neutral axis with tension-only fasteners; v1 requires zero moment about the axis perpendicular to the edge (E-012), reduced to the projection of Ca onto the edge.",
  "ICR (in-plane shear only, ks ignored): Crawford-Kulak or elastic-perfectly-plastic response, governing fastener at Δmax, ICR searched on the line through the Rult-weighted centroid (ks-independent) perpendicular to the load (refined off it for asymmetric groups); γ_ult = P_u/|F|; reactions at the applied load are the ultimate reactions ÷ γ_ult (proportional scaling, W-015).",
  "All allowables are keyed in by the user; the tool ships none. A check whose allowable is not entered is not evaluated and shows no margin.",
  "Shear-tension interaction IF(k) = (k·Rs/Fs)^a + (k·Rt/Ft)^b with separate exponents; MS = k* − 1 at IF(k*) = 1 (exact load scale factor, bracketed Brent). Unloading fasteners enter with zero external tension (N-006); with preload their bolt load is P_max.",
];
