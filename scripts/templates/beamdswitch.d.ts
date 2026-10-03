// Types for beamdswitch.js, yujieteo/site's report template, which stays byte-identical to the site's and is never
// type-checked itself: a require() of it, as in scripts/kit/checks.mjs, reads these types in its place.
export interface BeamdswitchFrame {
  title: string;
  body?: string;
  narration: string;
  notes?: string;
  key?: string;
  plot?: { x: [number | string, number | string]; xlabel?: string; ylabel?: string; curves: string[] };
}
export interface BeamdswitchReport {
  meta?: { title?: string; subtitle?: string; author?: string; date?: string; voice?: string };
  narration: string;
  notes?: string;
  setup?: BeamdswitchFrame[];
  method?: BeamdswitchFrame[];
  results?: BeamdswitchFrame[];
  checks?: BeamdswitchFrame[];
}
export declare const DEFAULT_VOICE: string;
export declare const SECTIONS: [string, string][];
export declare function deck(report: BeamdswitchReport): string;
