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
export const SHOW_REPORT = 'Show Report';

/** The sidebar view that lists each entry and its result. */
export const REPORT_VIEW = 'onboarding.report';

/** Opens an entry's page in the status view. Takes the entry id. */
export const SHOW_ENTRY = 'onboarding.showEntry';

/** Stops the setup run going now. Its button shows on the report view, and on the running row. */
export const STOP_SETUP = 'onboarding.stopSetup';

/** Runs one entry, and any entry it depends on that is not proven. Takes the row. */
export const RUN_ENTRY = 'onboarding.runEntry';

/**
 * Runs setup with its progress in two places: the status bar, and the report view, which also
 * marks the Onboarding icon in the sidebar so people know where the results will be.
 * Not a notification: that covers the Copilot chat box, and its only button is Cancel.
 * The Stop button on the report view cancels the run through the token.
 */
export function withSetupProgress<T>(
  token: vscode.CancellationToken,
  task: (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => Thenable<T>,
): Thenable<T> {
  return vscode.window.withProgress({ location: { viewId: REPORT_VIEW } }, () =>
    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Onboarding' }, progress => task(progress, token)));
}

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

export const PROBLEMS: EntryState[] = ['failed', 'skipped'];

/** The state in words, with the reason when there is one: "Skipped, dependency missing". */
export function stateText(status: EntryStatus): string {
  const because = status.because && BECAUSE_TEXT[status.because];
  return because ? `${STATE_TEXT[status.state]}, ${because}` : STATE_TEXT[status.state];
}

/** True when setup has not run on this computer yet: there are rows, and none has been checked. */
export function neverRun(statuses: EntryStatus[]): boolean {
  return statuses.length > 0 && statuses.every(s => s.state === 'unchecked');
}

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
 * plus progress while setup runs, and a summary when it ends. A run of some entries, such as
 * one row's Run button, changes only their rows.
 */
export class SetupReport implements SetupReporter, vscode.TreeDataProvider<EntryStatus> {
  private readonly changed = new vscode.EventEmitter<EntryStatus | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  private statuses: EntryStatus[] = [];
  private runIds: string[] = [];   // the entries in the run going now, in order
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

  /** The line above the rows: how to start, until setup has run on this computer. */
  message(): string | undefined {
    return neverRun(this.statuses)
      ? 'Nothing has been checked on this computer yet. Press ▶ to check each item and set up what is missing.'
      : undefined;
  }

  /** Rows that failed or were skipped, for asking Copilot about them. */
  notReady(): EntryStatus[] {
    return this.statuses.filter(s => PROBLEMS.includes(s.state));
  }

  begin(entries: Entry[]): void {
    this.runIds = entries.map(e => e.id);
    const shown = new Set(this.statuses.map(s => s.id));
    const partial = this.runIds.every(id => shown.has(id)) && this.runIds.length < shown.size;
    this.show(partial
      ? this.statuses.map(s => this.runIds.includes(s.id) ? { id: s.id, title: s.title, state: 'waiting' } : s)
      : entries.map(e => ({ id: e.id, title: e.title ?? e.id, state: 'waiting' })));
  }

  update(status: EntryStatus): void {
    const index = this.statuses.findIndex(s => s.id === status.id);
    if (index < 0) {
      return;
    }
    this.statuses[index] = status;
    this.changed.fire(undefined);

    const total = this.runIds.length;
    if (RUNNING.includes(status.state)) {
      const place = this.runIds.indexOf(status.id) + 1;
      this.progress?.report({ message: `${STATE_TEXT[status.state]} ${status.title}, ${place} of ${total}` });
    } else {
      this.progress?.report({ increment: 100 / total });
    }
  }

  end(statuses: EntryStatus[]): void {
    this.progress = undefined;
    this.runIds = [];
    const ended = new Map(statuses.map(s => [s.id, s]));
    const partial = statuses.length < this.statuses.length && statuses.every(s => this.statuses.some(r => r.id === s.id));
    this.show(partial ? this.statuses.map(s => ended.get(s.id) ?? s) : statuses);

    // Clicking a notification's text does nothing, so each one has a button to the report.
    const ready = statuses.filter(s => s.state === 'ready').length;
    if (ready === statuses.length) {
      void vscode.window.showInformationMessage(`Onboarding complete: ${ready} of ${statuses.length} ready.`, SHOW_REPORT)
        .then(choice => choice === SHOW_REPORT && vscode.commands.executeCommand(`${REPORT_VIEW}.focus`));
      return;
    }
    void vscode.window.showWarningMessage(`Onboarding: ${ready} of ${statuses.length} ready.`, SHOW_REPORT, ASK_COPILOT)
      .then(choice => {
        if (choice === SHOW_REPORT) {
          return vscode.commands.executeCommand(`${REPORT_VIEW}.focus`);
        }
        if (choice === ASK_COPILOT) {
          return vscode.commands.executeCommand('onboarding.askCopilot');
        }
        return undefined;
      });
  }

  getTreeItem(status: EntryStatus): vscode.TreeItem {
    const item = new vscode.TreeItem(status.title, vscode.TreeItemCollapsibleState.None);
    item.id = status.id;
    item.description = stateText(status);
    const [icon, color] = STATE_ICON[status.state];
    item.iconPath = new vscode.ThemeIcon(icon, color ? new vscode.ThemeColor(color) : undefined);
    item.contextValue = status.state;
    item.command = { command: SHOW_ENTRY, title: 'Show Details', arguments: [status.id] };

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
