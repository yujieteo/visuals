// Types for deck.mjs, which is vendored read-only from yujieteo/beamdswitch and stays unedited; the
// type checker reads this file in its place.

/** A Markdown chunk of a frame body, or a fenced ::: div holding more of them. */
export type DeckNode =
  | { type: "md"; text: string; step: number }
  | { type: "div"; name: string; title: string; step: number; count?: number; children: DeckNode[] };

export interface DeckFrame {
  kind: "title" | "section" | "frame";
  title: string;
  line: number;
  children: DeckNode[];
  steps: number;
  notes: string;
  narration: string;
  section: string;
  index: number;
  id: string;
  number?: number;
  subtitle?: string;
  author?: string;
  institute?: string;
  date?: string;
}

export interface Deck {
  meta: Record<string, string | undefined>;
  frames: DeckFrame[];
}

export function parseFrontMatter(src: string): { meta: Record<string, string | undefined>; body: string; offset: number };
export function displayEquations(text: string): string[];
export function parseBody(lines: string[]): { children: DeckNode[]; steps: number; notes: string; narration: string };
export function parseDeck(src: string): Deck;
export function stripMarkup(s: unknown): string;
export function slug(s: unknown): string;
export function splitSentences(text: unknown): string[];
export const WORDS_PER_MINUTE: number;
export function estimateSeconds(sentence: unknown): number;
