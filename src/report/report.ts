import * as vscode from 'vscode';
import { Entry } from '../manifest/manifest';
import { expandPreset } from '../setup/presets';
import { definitionHash, inDependencyOrder } from '../setup/runSetup';
import type { EntryRecord } from './statusFile';

export type EntryState =
  | 'unchecked'   // setup has not reached it yet
  | 'waiting'     // queued in the run going now
  | 'checking' | 'fixing' | 'proving'
  | 'ready' | 'failed' | 'skipped';

/** Why an entry ended as it did, when the state alone does not say. */
export type Because = 'proven-earlier' | 'dependency-missing' | 'cancelled';

export interface EntryStatus {
  id: string;
  title: string;
  state: EntryState;
  detail?: string;     // plain words; the last lines of output when it failed
  because?: Because;
  provenAt?: string;   // when it was last proven on this computer (ISO time)
}

/** What setup tells the developer while it runs. The runner knows nothing else about the UI. */
export interface SetupReporter {
  begin(entries: Entry[]): void;
  update(status: EntryStatus): void;
  end(statuses: EntryStatus[]): void;
}

export const ASK_COPILOT = 'Ask Copilot to Help';

const STATE_TEXT: Record<EntryState, string> = {
  'unchecked': 'Not checked yet',
  'waiting': 'Waiting',
  'checking': 'Checking',
  'fixing': 'Fixing',
  'proving': 'Proving',
  'ready': 'Ready',
  'failed': 'Failed',
  'skipped': 'Skipped',
};

const STATE_ICON: Record<EntryState, [icon: string, color?: string]> = {
  'unchecked': ['circle-outline'],
  'waiting': ['clock'],
  'checking': ['sync~spin'],
  'fixing': ['sync~spin'],
  'proving': ['sync~spin'],
  'ready': ['pass', 'testing.iconPassed'],
  'failed': ['error', 'testing.iconFailed'],
  'skipped': ['circle-slash', 'disabledForeground'],
};

/** Added to the state on a row. "Proven earlier" is left out: ready is ready. */
const BECAUSE_TEXT: Partial<Record<Because, string>> = {
  'dependency-missing': 'dependency missing',
  'cancelled': 'cancelled',
};

const PROBLEMS: EntryState[] = ['failed', 'skipped'];

const RUNNING: EntryState[] = ['checking', 'fixing', 'proving'];

/**
 * The rows to show when setup is not running, from the status file: each entry's last
 * result, except that an entry recorded as ready whose definition has changed since it was
 * proven waits. Entries with no record wait.
 */
export function rowsBeforeRun(entries: Entry[], records: Record<string, EntryRecord>): EntryStatus[] {
  let ordered: Entry[];
  try {
    ordered = inDependencyOrder(entries);
  } catch {
    ordered = entries; // A loop is reported when setup runs.
  }
  return ordered.map(entry => {
    const title = entry.title ?? entry.id;
    const record = records[entry.id];
    const usable = record && PROBLEMS.includes(record.state)
      || record?.state === 'ready' && record.proven === currentHash(entry);
    return usable
      ? {
        id: entry.id, title, state: record.state,
        ...(record.detail ? { detail: record.detail } : {}),
        ...(record.because ? { because: record.because } : {}),
        ...(record.proven_at ? { provenAt: record.proven_at } : {}),
      }
      : { id: entry.id, title, state: 'unchecked' };
  });
}

function currentHash(entry: Entry): string | undefined {
  try {
    return definitionHash(expandPreset(entry));
  } catch {
    return undefined;
  }
}

/** Passes every report to each reporter in turn. */
export function allOf(...reporters: SetupReporter[]): SetupReporter {
  return {
    begin: entries => reporters.forEach(r => r.begin(entries)),
    update: status => reporters.forEach(r => r.update(status)),
    end: statuses => reporters.forEach(r => r.end(statuses)),
  };
}

/**
 * The developer-facing report: the "Onboarding" list in its own Activity Bar view with one row per entry,
 * plus a progress notification while setup runs, and a summary when it ends.
 */
export class SetupReport implements SetupReporter, vscode.TreeDataProvider<EntryStatus> {
  private readonly changed = new vscode.EventEmitter<EntryStatus | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  private statuses: EntryStatus[] = [];
  private progress?: vscode.Progress<{ message?: string; increment?: number }>;

  /** Shows rows without running anything. */
  show(statuses: EntryStatus[]): void {
    this.statuses = statuses;
    this.changed.fire(undefined);
  }

  /** Where progress messages go during the next run. Call before runSetup. */
  attachProgress(progress: vscode.Progress<{ message?: string; increment?: number }>): void {
    this.progress = progress;
  }

  /** Rows that failed or were skipped, for asking Copilot about them. */
  notReady(): EntryStatus[] {
    return this.statuses.filter(s => PROBLEMS.includes(s.state));
  }

  begin(entries: Entry[]): void {
    this.show(entries.map(e => ({ id: e.id, title: e.title ?? e.id, state: 'waiting' })));
  }

  update(status: EntryStatus): void {
    const index = this.statuses.findIndex(s => s.id === status.id);
    if (index < 0) {
      return;
    }
    this.statuses[index] = status;
    this.changed.fire(undefined);

    const total = this.statuses.length;
    if (RUNNING.includes(status.state)) {
      this.progress?.report({ message: `${STATE_TEXT[status.state]} ${status.title}, ${index + 1} of ${total}` });
    } else {
      this.progress?.report({ increment: 100 / total });
    }
  }

  end(statuses: EntryStatus[]): void {
    this.progress = undefined;
    this.show(statuses);

    const ready = statuses.filter(s => s.state === 'ready').length;
    if (ready === statuses.length) {
      void vscode.window.showInformationMessage(`Onboarding complete: ${ready} of ${statuses.length} ready.`);
      return;
    }
    void vscode.window.showWarningMessage(`Onboarding: ${ready} of ${statuses.length} ready.`, ASK_COPILOT)
      .then(choice => choice === ASK_COPILOT && vscode.commands.executeCommand('onboarding.askCopilot'));
  }

  getTreeItem(status: EntryStatus): vscode.TreeItem {
    const item = new vscode.TreeItem(status.title, vscode.TreeItemCollapsibleState.None);
    item.id = status.id;
    const because = status.because && BECAUSE_TEXT[status.because];
    item.description = because ? `${STATE_TEXT[status.state]}, ${because}` : STATE_TEXT[status.state];
    const [icon, color] = STATE_ICON[status.state];
    item.iconPath = new vscode.ThemeIcon(icon, color ? new vscode.ThemeColor(color) : undefined);
    item.contextValue = status.state;

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${status.title}**: ${STATE_TEXT[status.state]}`);
    if (status.state === 'ready' && status.provenAt) {
      tooltip.appendMarkdown(`. Proven ${new Date(status.provenAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}.`);
    }
    if (status.detail) {
      tooltip.appendMarkdown('\n\n');
      tooltip.appendCodeblock(status.detail, 'text');
    }
    item.tooltip = tooltip;
    return item;
  }

  getChildren(): EntryStatus[] {
    return this.statuses;
  }
}
