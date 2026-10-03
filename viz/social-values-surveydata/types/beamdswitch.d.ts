// Types for beamdswitch.js, yujieteo/site's shared report template, which the page loads as the global
// Beamdswitch. The copy stays verbatim and unchecked; the type checker reads this file in its place.

interface BeamdswitchPlot {
  x: [number | string, number | string];
  xlabel?: string;
  ylabel?: string;
  curves: string[];
}

interface BeamdswitchFrame {
  title: string;
  body?: string;
  narration: string;
  notes?: string;
  key?: string;
  plot?: BeamdswitchPlot;
}

interface BeamdswitchReport {
  meta?: { title?: string; subtitle?: string; author?: string; date?: string; voice?: string };
  narration: string;
  notes?: string;
  setup?: BeamdswitchFrame[];
  method?: BeamdswitchFrame[];
  results?: BeamdswitchFrame[];
  checks?: BeamdswitchFrame[];
}

interface BeamdswitchApi {
  DEFAULT_VOICE: string;
  SECTIONS: ["setup" | "method" | "results" | "checks", string][];
  deck(report: BeamdswitchReport): string;
}

declare var Beamdswitch: BeamdswitchApi;
