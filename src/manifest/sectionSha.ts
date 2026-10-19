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
function markdownSectionText(markdown: string, heading: string): string | undefined {
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

/** The 0-based line number of a Markdown heading, skipping lines inside code blocks. */
function markdownHeadingLine(markdown: string, heading: string): number | undefined {
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

/** True for a reStructuredText file, whose sections are found by title. Every other file is Markdown. */
export function isRst(file: string | undefined): boolean {
  return !!file && /\.rst$/i.test(file);
}

/** A line of one repeated punctuation character, such as ===== or ~~~~~, at the start of the line. */
const ADORNMENT = /^([!-/:-@[-`{-~])\1+$/;

interface RstTitle { line: number; text: string; level: number; start: number; end: number; }

/**
 * The section titles of a reStructuredText file, in order. A title is a line of text with
 * an underline of one punctuation character at least as long as the text, and optionally
 * an overline that matches the underline. Each underline style (character, with or
 * without overline) gets a level in the order the file first uses it: the first style
 * seen is level 1. `start` is the first line of the title and `end` the line after it.
 *
 * Titles start at the first column. Literal blocks (after `::`) are indented, so a line
 * in one that looks like an underline is never a title.
 */
function rstTitles(text: string): RstTitle[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map(l => l.trimEnd());
  const styles: string[] = [];
  const levelOf = (style: string) => {
    if (!styles.includes(style)) {
      styles.push(style);
    }
    return styles.indexOf(style) + 1;
  };
  const titles: RstTitle[] = [];
  for (let i = 0; i < lines.length; i++) {
    const [over, title, under] = [lines[i], lines[i + 1] ?? '', lines[i + 2] ?? ''];
    if (ADORNMENT.test(over) && under === over && title.trim() && title.trim().length <= over.length) {
      titles.push({ line: i + 1, text: title.trim(), level: levelOf(`over${over[0]}`), start: i, end: i + 3 });
      i += 2;
      continue;
    }
    const line = lines[i];
    const next = lines[i + 1] ?? '';
    if (line && !/^\s/.test(line) && !ADORNMENT.test(line) && (i === 0 || !lines[i - 1].trim())
      && ADORNMENT.test(next) && next.length >= line.length) {
      titles.push({ line: i, text: line, level: levelOf(next[0]), start: i, end: i + 2 });
      i += 1;
    }
  }
  return titles;
}

/** The text under a reStructuredText title, up to the next title of the same or higher level. */
function rstSectionText(text: string, heading: string): string | undefined {
  const titles = rstTitles(text);
  const index = titles.findIndex(t => t.text === heading.trim());
  if (index < 0) {
    return undefined;
  }
  const title = titles[index];
  const next = titles.slice(index + 1).find(t => t.level <= title.level);
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return lines.slice(title.end, next?.start ?? lines.length).join('\n').trim();
}

/**
 * The text of a section, without its heading line, trimmed. Undefined when the heading is
 * not there. For a `.rst` file the heading is a title, written without its underline; for
 * any other file it is a Markdown heading, written with its # marks.
 */
export function sectionText(text: string, heading: string, file?: string): string | undefined {
  return isRst(file) ? rstSectionText(text, heading) : markdownSectionText(text, heading);
}

/** The 0-based line number of a heading, or of an rst title's text. Undefined when it is not there. */
export function headingLine(text: string, heading: string, file?: string): number | undefined {
  return isRst(file)
    ? rstTitles(text).find(t => t.text === heading.trim())?.line
    : markdownHeadingLine(text, heading);
}

/**
 * The first 8 hex characters of the SHA-256 of the text, after changing CRLF line endings
 * to LF so Windows and Linux agree. Manifests already record SHAs this way.
 */
export function shaOf(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex').slice(0, 8);
}

/** The SHA of a README section, or undefined when the heading is not there. `file` picks the format. */
export function sectionSha(text: string, heading: string, file?: string): string | undefined {
  const section = sectionText(text, heading, file);
  return section === undefined ? undefined : shaOf(section);
}

/**
 * The SHA of a section of a Markdown or reStructuredText file in the project, for the agent writing `from:`.
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
  const sha256 = sectionSha(markdown, heading, file);
  if (sha256 === undefined) {
    throw new Error(isRst(file)
      ? `There is no title "${heading}" in ${file}. Give the title exactly as written, without its underline, `
        + 'for example "Installation".'
      : `There is no heading "${heading}" in ${file}. Give the heading exactly as written, `
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
export function isStale(p: Provenance, text: string): boolean {
  if (!p.file || !p.section || !p.sha256) {
    return false;
  }
  return sectionSha(text, p.section, p.file) !== p.sha256;
}
