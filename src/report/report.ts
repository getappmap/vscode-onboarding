import * as vscode from 'vscode';
import { Entry } from '../manifest/manifest';

export type EntryState =
  | 'waiting' | 'checking' | 'fixing' | 'proving'
  | 'ready' | 'failed' | 'skipped' | 'needs-approval';

export interface EntryStatus {
  id: string;
  title: string;
  state: EntryState;
  detail?: string;     // plain words; the last lines of output when it failed
}

/** What setup tells the developer while it runs. The runner knows nothing else about the UI. */
export interface SetupReporter {
  begin(entries: Entry[]): void;
  update(status: EntryStatus): void;
  end(statuses: EntryStatus[]): void;
}

/**
 * The developer-facing report: a "Project Setup" list in the side bar with one row per entry,
 * plus a progress notification while setup runs, and a summary when it ends.
 */
export class SetupReport implements SetupReporter, vscode.TreeDataProvider<EntryStatus> {
  private readonly changed = new vscode.EventEmitter<EntryStatus | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  begin(entries: Entry[]): void {
    // TODO: show every entry as waiting; start the progress notification
  }

  update(status: EntryStatus): void {
    // TODO: update the row and the progress message ("Checking jdk, 2 of 6")
  }

  end(statuses: EntryStatus[]): void {
    // TODO: close progress; show "Setup complete" or "3 of 6 ready" with "Ask Copilot to help"
  }

  getTreeItem(status: EntryStatus): vscode.TreeItem {
    throw new Error('TODO: title, state icon, detail as tooltip, actions for failed rows');
  }

  getChildren(): EntryStatus[] {
    throw new Error('TODO: the current statuses, in run order');
  }
}
