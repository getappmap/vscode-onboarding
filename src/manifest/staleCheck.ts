import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { Entry, MANIFEST_FILE } from './manifest';
import { isStale } from './sectionSha';

export const UPDATE_ENTRIES = 'Update Entries';

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

/** The prompt for the text-reader skill: which values to read again, and which only to compare. */
export function updatePrompt(stale: Entry[]): string {
  const lines = stale.map(e =>
    `- ${e.id}: ${e.from!.file} "${e.from!.section}" (${e.from!.source === 'person' ? 'a person\'s choice' : e.from!.source})`);
  return [
    `/text-reader The text behind these ${MANIFEST_FILE} entries has changed since it was recorded:`,
    ...lines,
    '',
    'Read each section again. Update guessed values and their SHA. For a person\'s choice, change nothing:',
    'tell me what differs, and ask whether the entry or the README is right.',
  ].join('\n');
}

/**
 * Tells the person editing, and offers to have the agent read the changed sections again.
 * `alreadyShown` holds what was shown before, so the same change is not shown twice.
 */
export async function notifyStale(
  stale: Entry[], openChat: (prompt: string) => Promise<void>, alreadyShown: Set<string> = new Set(),
): Promise<void> {
  const fresh = stale.filter(e => !alreadyShown.has(staleKey(e)));
  if (fresh.length === 0) {
    return;
  }
  fresh.forEach(e => alreadyShown.add(staleKey(e)));

  const people = fresh.filter(e => e.from?.source === 'person').length;
  const names = fresh.map(e => e.title ?? e.id).join(', ');
  const message = people === fresh.length
    ? `The README text behind a team choice in ${MANIFEST_FILE} has changed: ${names}. Check the entry still matches.`
    : `The README text behind ${fresh.length === 1 ? 'an entry' : `${fresh.length} entries`} in ${MANIFEST_FILE} has changed: ${names}.`;
  const choice = await vscode.window.showInformationMessage(message, UPDATE_ENTRIES);
  if (choice === UPDATE_ENTRIES) {
    await openChat(updatePrompt(stale));
  }
}

function staleKey(entry: Entry): string {
  return `${entry.id}:${entry.from?.file}:${entry.from?.section}:${entry.from?.sha256}`;
}
