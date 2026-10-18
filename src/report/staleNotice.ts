import * as vscode from 'vscode';
import type { Entry } from '../manifest/manifest';
import { sectionsOf, staleMessage, updatePrompt } from '../manifest/staleCheck';

export const UPDATE_SETUP_STEPS = 'Update Setup Steps';
export const SHOW_SECTION = 'Show Section';

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
