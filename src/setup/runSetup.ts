import * as vscode from 'vscode';
import { Entry } from '../manifest/manifest';
import { EntryStatus, SetupReporter } from '../report/report';

export interface SetupContext {
  folder: vscode.Uri;
  preApproved: Set<string>;   // entry ids whose fix the Org approved in advance
  readSecrets(paths: Record<string, string>): Promise<Record<string, string>>;
  reporter: SetupReporter;
  token: vscode.CancellationToken;
}

/** Orders entries so each comes after the ones it depends on. A loop is an error. */
export function inDependencyOrder(entries: Entry[]): Entry[] {
  throw new Error('TODO');
}

/**
 * Takes every entry through the same steps and reports each change:
 *   check -> (fix, only if pre-approved or the developer agrees) -> check again -> prove.
 * Entries that depend on a failed entry are skipped.
 */
export async function runSetup(entries: Entry[], ctx: SetupContext): Promise<EntryStatus[]> {
  throw new Error('TODO');
}
