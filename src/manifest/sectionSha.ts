import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
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

/** The 0-based line number of a heading, skipping lines inside code blocks. Undefined when it is not there. */
export function headingLine(markdown: string, heading: string): number | undefined {
  let inCode = false;
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!inCode && lines[i].trim() === heading.trim() && HEADING.test(`${heading.trim()} `)) {
      return i;
    }
    if (FENCE.test(lines[i])) {
      inCode = !inCode;
    }
  }
  return undefined;
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
 * The SHA of a section of a Markdown file in the project, for the agent writing `from:`.
 * `file` is relative to the project folder. Throws in plain words, saying how to ask again,
 * when the file is outside the project, missing, or has no such heading.
 */
export async function sectionShaOfFile(folder: string, file: string, heading: string): Promise<string> {
  const root = path.resolve(folder);
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) {
    throw new Error(`${file} is outside the project. Give a path relative to the project folder, such as README.md.`);
  }
  let markdown: string;
  try {
    markdown = await fs.readFile(full, 'utf8');
  } catch {
    throw new Error(`There is no file ${file} in the project. Give a path relative to the project folder, such as README.md.`);
  }
  const sha256 = sectionSha(markdown, heading);
  if (sha256 === undefined) {
    throw new Error(`There is no heading "${heading}" in ${file}. Give the heading exactly as written, `
      + 'with its # marks, for example "## Run locally".');
  }
  return sha256;
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
