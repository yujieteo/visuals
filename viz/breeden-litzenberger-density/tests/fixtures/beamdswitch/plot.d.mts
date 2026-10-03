// Types for plot.mjs, which is vendored read-only from yujieteo/beamdswitch and stays unedited; the
// type checker reads this file in its place.

export interface PlotCurve {
  src: string;
  f: (x: number) => number;
}

export interface PlotSpec {
  x: [number, number];
  y: [number, number] | null;
  xlabel: string;
  ylabel: string;
  curves: PlotCurve[];
  errors: string[];
}

export function compile(src: unknown): (x: number) => number;
export function parsePlot(text: unknown): PlotSpec;
export function plotSvg(spec: PlotSpec, samples?: number): string;
