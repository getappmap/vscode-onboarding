import * as vscode from 'vscode';
import { Entry } from './manifest';

/** Entries holding a guessed value whose source text has changed. */
export async function findStale(entries: Entry[], folder: vscode.Uri): Promise<Entry[]> {
  throw new Error('TODO: read each from.file once; use isStale');
}

/** Tells the person editing, and offers to have the agent read the changed sections again. */
export async function notifyStale(stale: Entry[], openChat: (prompt: string) => Promise<void>): Promise<void> {
  // TODO: one notification listing the entries, with an "Update entries" button -> /text-reader
}
