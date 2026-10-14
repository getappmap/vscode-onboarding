import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { Entry, MANIFEST_FILE } from './manifest';
import { isStale } from './sectionSha';
import { SKILLS } from '../agent/prompts';

export const UPDATE_SETUP_STEPS = 'Update Setup Steps';
export const SHOW_SECTION = 'Show Section';

/** Entries holding a value whose source text has changed, or is gone. Reads each file once. */
export async function findStale(entries: Entry[], folder: vscode.Uri): Promise<Entry[]> {
  const files = new Map<string, Promise<string | undefined>>();
  const read = (file: string) => {
    if (!files.has(file)) {
      // A file outside the project is never read.
      const full = path.resolve(folder.fsPath, file);
      const inside = full.startsWith(path.resolve(folder.fsPath) + path.sep);
      files.set(file, inside ? fs.readFile(full, 'utf8').catch(() => undefined) : Promise.resolve(undefined));
    }
    return files.get(file)!;
  };

  const stale: Entry[] = [];
  for (const entry of entries) {
    const from = entry.from;
    if (from?.file && from.section && from.sha256 && isStale(from, await read(from.file) ?? '')) {
      stale.push(entry);
    }
  }
  return stale;
}

interface Section { file: string; section: string; }

/** The changed sections behind these entries, in order, each once. */
function sectionsOf(stale: Entry[]): Section[] {
  const sections: Section[] = [];
  for (const { from } of stale) {
    if (!sections.some(s => s.file === from!.file && s.section === from!.section)) {
      sections.push({ file: from!.file!, section: from!.section! });
    }
  }
  return sections;
}

/** A heading as people say it: "## Run locally" is "Run locally". */
function headingName(heading: string): string {
  return heading.replace(/^#+\s*/, '');
}

/** "A", "A" and "B", or "A", "B" and "C". */
function quotedList(items: string[]): string {
  const quoted = items.map(i => `"${i}"`);
  return quoted.length <= 1 ? quoted.join('') : `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`;
}

/** Plain words for someone who does not know how onboarding works: what changed, and what it affects. */
export function staleMessage(stale: Entry[]): string {
  if (stale.length === 0) {
    return '';
  }
  const sections = sectionsOf(stale);
  const files = [...new Set(sections.map(s => s.file))];
  const changed = sections.length === 1
    ? `${sections[0].file} section "${headingName(sections[0].section)}" has changed.`
    : files.length === 1
      ? `${files[0]} sections ${quotedList(sections.map(s => headingName(s.section)))} have changed.`
      : `These README sections have changed: ${sections.map(s => `${s.file} "${headingName(s.section)}"`).join(', ')}.`;

  const titles = stale.map(e => `"${e.title ?? e.id}"`);
  const teamChoices = stale.every(e => e.from?.source === 'person');
  const it = sections.length === 1 ? 'it' : 'them';
  const affected = stale.length === 1
    ? teamChoices
      ? `The setup step ${titles[0]} records a team choice written there. Check they still agree.`
      : `The setup step ${titles[0]} is based on ${it} and may be out of date.`
    : teamChoices
      ? `${stale.length} setup steps record team choices written there: ${titles.join(', ')}. Check they still agree.`
      : `${stale.length} setup steps are based on ${it} and may be out of date: ${titles.join(', ')}.`;
  return `${changed} ${affected}`;
}

/**
 * The prompt for the onboarding-text-reader skill: what changed, and what to do about it. Copilot
 * saves the updates itself and asks only when a team choice and its README section disagree.
 */
export function updatePrompt(stale: Entry[]): string {
  const lines = stale.map(e =>
    `- "${e.title ?? e.id}" (${e.id}): ${e.from!.file} section "${e.from!.section}"`
    + (e.from!.source === 'person' ? ', a team choice' : ''));
  return [
    `/${SKILLS.textReader} These README sections have changed since the setup steps below were based on them:`,
    ...lines,
    '',
    `Update each setup step in ${MANIFEST_FILE} to match its section, with the new SHA and date, and save.`,
    'For a team choice, update only the SHA and date when the section still agrees with the step.',
    'Ask me only if they now disagree. Then tell me in a few lines what you changed.',
  ].join('\n');
}

export interface StaleActions {
  openChat(prompt: string): Promise<void>;
  /** Opens the file at the section. */
  openSection(file: string, section: string): Promise<void>;
}

/**
 * Tells the person editing, and offers to update the setup steps with Copilot or to look at the
 * (first) changed section. `alreadyShown` holds what was shown before, so the same change is not shown twice.
 */
export async function notifyStale(stale: Entry[], actions: StaleActions, alreadyShown: Set<string> = new Set()): Promise<void> {
  const fresh = stale.filter(e => !alreadyShown.has(staleKey(e)));
  if (fresh.length === 0) {
    return;
  }
  fresh.forEach(e => alreadyShown.add(staleKey(e)));

  const first = sectionsOf(fresh)[0];
  const message = `${staleMessage(fresh)} ${UPDATE_SETUP_STEPS} has Copilot bring `
    + `${fresh.length === 1 ? 'it' : 'them'} up to date.`;
  const choice = await vscode.window.showInformationMessage(message, UPDATE_SETUP_STEPS, SHOW_SECTION);
  if (choice === UPDATE_SETUP_STEPS) {
    await actions.openChat(updatePrompt(fresh));
  } else if (choice === SHOW_SECTION) {
    await actions.openSection(first.file, first.section);
  }
}

function staleKey(entry: Entry): string {
  return `${entry.id}:${entry.from?.file}:${entry.from?.section}:${entry.from?.sha256}`;
}
