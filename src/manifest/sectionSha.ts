import type { Provenance } from './manifest';

/**
 * The text under a Markdown heading, up to the next heading of the same or higher level.
 * The heading line itself is left out, and the result is trimmed.
 *
 * Lines inside ``` code blocks are never headings: a README's shell example may hold a
 * comment such as "# Separating the create and migrate tasks", which must not end the
 * section. (AppLand's "## Run locally" has one.)
 */
export function sectionText(markdown: string, heading: string): string | undefined {
  throw new Error('TODO');
}

/**
 * The first 8 hex characters of the SHA-256 of the text, after changing CRLF line endings
 * to LF so Windows and Linux agree. Manifests already record SHAs this way.
 */
export function shaOf(text: string): string {
  throw new Error('TODO');
}

/**
 * True when the README section behind a value has changed since its SHA was recorded.
 * Covers guessed values and person values that name a file and section. A changed
 * guessed value may be read again by the agent; a changed person value is never
 * rewritten: the person editing is told instead.
 */
export function isStale(p: Provenance, markdown: string): boolean {
  throw new Error('TODO');
}
