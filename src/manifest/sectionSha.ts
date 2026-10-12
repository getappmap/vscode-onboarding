import type { Provenance } from './manifest';

/** The text under a Markdown heading, up to the next heading of the same or higher level. */
export function sectionText(markdown: string, heading: string): string | undefined {
  throw new Error('TODO');
}

/** SHA-256 of the text, after normalising line endings so Windows and Linux agree. */
export function shaOf(text: string): string {
  throw new Error('TODO');
}

/** True when a guessed value's source section has changed. Never true for person-written values. */
export function isStale(p: Provenance, markdown: string): boolean {
  throw new Error('TODO');
}
