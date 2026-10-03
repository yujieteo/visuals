// Types for beamdswitch.js, the site's shared report template (templates/beamdswitch.js in yujieteo/site),
// which this repository copies byte for byte and so does not type-check; the page reads it as self.Beamdswitch.

export interface BeamdswitchPlot {
  x: [number | string, number | string];
  xlabel?: string;
  ylabel?: string;
  curves: string[];
}

export interface BeamdswitchFrame {
  title: string;
  body?: string;
  narration: string;
  notes?: string;
  key?: string;
  plot?: BeamdswitchPlot;
}

export interface BeamdswitchReport {
  meta: { title: string; subtitle?: string; author?: string; date?: string; voice?: string };
  narration: string;
  notes?: string;
  setup: BeamdswitchFrame[];
  method: BeamdswitchFrame[];
  results: BeamdswitchFrame[];
  checks: BeamdswitchFrame[];
}

export interface BeamdswitchTemplate {
  DEFAULT_VOICE: string;
  SECTIONS: [string, string][];
  deck(report: BeamdswitchReport): string;
}
