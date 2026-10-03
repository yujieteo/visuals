// Types for beamdswitch.js, an unchanged copy of yujieteo/site's templates/beamdswitch.js that stays unedited;
// the type checker reads this file in its place. Development only: it is not ported with the page.

/** One slide: plain data, every number already formatted as the page shows it. */
export interface Frame {
  title: string;
  body?: string;
  narration: string;
  notes?: string;
  key?: string;
  plot?: { x: (string | number)[]; xlabel?: string; ylabel?: string; curves: string[] };
}
/** A report for the standard template: front matter, a narrated title slide and its four sections. */
export interface Report {
  meta?: { title?: string; subtitle?: string; author?: string; date?: string; voice?: string; [key: string]: unknown };
  narration: string;
  notes?: string;
  setup?: Frame[];
  method?: Frame[];
  results?: Frame[];
  checks?: Frame[];
}
export const DEFAULT_VOICE: string;
export const SECTIONS: [keyof Report & string, string][];
export function deck(report: Report): string;
