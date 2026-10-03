// Page globals the templates read, for type checking only; report.js is described only as far as they call it.
declare var BanditLogic: typeof import("./multi-armed-bandit-logic.js");
declare var HoursLogic: ReturnType<typeof import("./hours-logic.js")>;
declare var BanditPage: {
  $(id: string): any;
  el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string | number> | null, text?: string | null): HTMLElementTagNameMap[K];
  svg(tag: string, attrs?: Record<string, string | number> | null, text?: string | null): SVGElement;
  say(msg: string, where?: HTMLElement): void;
  isoToday(): string;
  openStore(key: string): { store: Storage | null, saved: string | null };
  download(name: string, text: string, type: string): void;
};
declare var HoursPage: { snapshot(): object, shown(on: boolean): void } | undefined;
declare var BanditReport: { report(...args: any[]): object };
