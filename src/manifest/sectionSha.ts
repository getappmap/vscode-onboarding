import { createHash } from 'crypto';
import type { Provenance } from './manifest';

const FENCE = /^(```|~~~)/;
const HEADING = /^(#{1,6})\s/;

/**
 * The text under a Markdown heading, up to the next heading of the same or higher level.
 * The heading line itself is left out, and the result is trimmed. Undefined when the
 * heading is not there.
 *
 * Lines inside ``` code blocks are never headings: a README's shell example may hold a
 * comment such as "# Separating the create and migrate tasks", which must not end the
 * section. (AppLand's "## Run locally" has one.)
 */
export function sectionText(markdown: string, heading: string): string | undefined {
  const level = HEADING.exec(`${heading.trim()} `)?.[1].length;
  if (!level) {
    return undefined;
  }
  let section: string[] | undefined;
  let inCode = false;
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const fence = FENCE.test(line);
    if (section === undefined) {
      if (!inCode && line.trim() === heading.trim()) {
        section = [];
      } else if (fence) {
        inCode = !inCode;
      }
      continue;
    }
    if (fence) {
      inCode = !inCode;
    } else if (!inCode) {
      const match = HEADING.exec(line);
      if (match && match[1].length <= level) {
        break;
      }
    }
    section.push(line);
  }
  return section?.join('\n').trim();
}

/**
 * The first 8 hex characters of the SHA-256 of the text, after changing CRLF line endings
 * to LF so Windows and Linux agree. Manifests already record SHAs this way.
 */
export function shaOf(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex').slice(0, 8);
}

/** The SHA of a README section, or undefined when the heading is not there. */
export function sectionSha(markdown: string, heading: string): string | undefined {
  const text = sectionText(markdown, heading);
  return text === undefined ? undefined : shaOf(text);
}

/**
 * True when the README section behind a value has changed since its SHA was recorded, or
 * is gone. Covers any value whose `from:` names a file, section and SHA: guessed values,
 * and person values written into the README. A changed guessed value may be read again by
 * the agent; a changed person value is never rewritten: the person editing is told instead.
 */
export function isStale(p: Provenance, markdown: string): boolean {
  if (!p.file || !p.section || !p.sha256) {
    return false;
  }
  return sectionSha(markdown, p.section) !== p.sha256;
}
