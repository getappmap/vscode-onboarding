import { createHash } from 'crypto';
import type * as vscode from 'vscode';
import type { Command, Entry } from '../manifest/manifest';
import type { EntryState, EntryStatus, SetupReporter } from '../report/report';
import { expandPreset } from './presets';
import { CommandResult, commandFor, runCommand } from './runCommand';

export interface SetupContext {
  folder: vscode.Uri;
  preApproved: Set<string>;   // entry ids whose fix the Org approved in advance
  readSecrets(paths: Record<string, string>): Promise<Record<string, string>>;
  /** Shows the developer the exact fix command and asks whether to run it. */
  askToFix(entry: Entry, command: string): Promise<boolean>;
  reporter: SetupReporter;
  token: vscode.CancellationToken;
  /**
   * Entry id -> definitionHash of the entries proven on this computer. An entry found here
   * with the same hash is ready without running anything. Updated as entries finish.
   */
  proven: Map<string, string>;
  /** Run every entry again, even those proven earlier. */
  reprove?: boolean;
}

const APPROVAL_PREFIX = 'approval:';

/**
 * A short code for the parts of an entry that decide what runs: its commands (after the
 * preset fills them in), env, secret paths and preset values. Editing these means the
 * entry must be proven again; editing its title or messages does not.
 */
export function definitionHash(entry: Entry): string {
  const { check, fix, prove, env, secrets, uses } = entry;
  const json = stableJson({ check, fix, prove, env, secrets, uses, with: entry.with });
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

/** JSON with keys sorted, so the same definition always gives the same text. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort()
      .filter(k => (value as Record<string, unknown>)[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Orders entries so each comes after the ones it depends on, keeping the written order
 * otherwise. Ids that name no entry are left for runSetup to report. A loop is an error.
 */
export function inDependencyOrder(entries: Entry[]): Entry[] {
  const byId = new Map(entries.map(e => [e.id, e]));
  const ordered: Entry[] = [];
  const done = new Set<string>();
  const visiting: string[] = [];

  const visit = (entry: Entry) => {
    if (done.has(entry.id)) {
      return;
    }
    const loopStart = visiting.indexOf(entry.id);
    if (loopStart >= 0) {
      const loop = [...visiting.slice(loopStart), entry.id].join(' → ');
      throw new Error(`These entries depend on each other in a loop: ${loop}`);
    }
    visiting.push(entry.id);
    for (const id of entry.dependsOn ?? []) {
      const dependency = byId.get(id);
      if (dependency) {
        visit(dependency);
      }
    }
    visiting.pop();
    done.add(entry.id);
    ordered.push(entry);
  };

  entries.forEach(visit);
  return ordered;
}

/**
 * Takes every entry through the same steps and reports each change:
 *   check -> (fix, only if pre-approved or the developer agrees) -> check again -> prove.
 * An entry proven earlier with the same definition is ready without running anything,
 * unless ctx.reprove is set. Entries that depend on one that is not ready are skipped.
 */
export async function runSetup(entries: Entry[], ctx: SetupContext): Promise<EntryStatus[]> {
  const ordered = inDependencyOrder(entries);
  const statuses = new Map<string, EntryStatus>();
  const report = (entry: Entry, state: EntryState, detail?: string): EntryStatus => {
    const status: EntryStatus = { id: entry.id, title: entry.title ?? entry.id, state, ...(detail ? { detail } : {}) };
    statuses.set(entry.id, status);
    if (state === 'failed' || state === 'needs-approval') {
      ctx.proven.delete(entry.id);
    }
    ctx.reporter.update(status);
    return status;
  };

  ctx.reporter.begin(ordered);
  for (const entry of ordered) {
    if (ctx.token.isCancellationRequested) {
      report(entry, 'skipped', 'Setup was cancelled.');
      continue;
    }
    const blocker = (entry.dependsOn ?? []).find(id => statuses.get(id)?.state !== 'ready');
    if (blocker !== undefined) {
      const known = entries.some(e => e.id === blocker);
      report(entry, 'skipped', known ? `Waits for ${blocker}, which is not ready.` : `Depends on "${blocker}", which is not in the setup plan.`);
      continue;
    }
    await setUpOne(entry, ctx, report);
  }

  const result = ordered.map(e => statuses.get(e.id)!);
  ctx.reporter.end(result);
  return result;
}

type Report = (entry: Entry, state: EntryState, detail?: string) => EntryStatus;

async function setUpOne(written: Entry, ctx: SetupContext, report: Report): Promise<void> {
  let entry: Entry;
  try {
    entry = expandPreset(written);
  } catch (err) {
    report(written, 'failed', (err as Error).message);
    return;
  }

  const hash = definitionHash(entry);
  if (!ctx.reprove && ctx.proven.get(entry.id) === hash) {
    report(entry, 'ready', 'Proven earlier.');
    return;
  }

  let secrets: Record<string, string> = {};
  if (entry.secrets && Object.keys(entry.secrets).length > 0) {
    try {
      secrets = await ctx.readSecrets(entry.secrets);
    } catch (err) {
      report(entry, 'failed', explain(entry, `Could not read its secrets: ${(err as Error).message}`));
      return;
    }
    const missing = Object.keys(entry.secrets).filter(name => !secrets[name]);
    if (missing.length > 0) {
      report(entry, 'failed', explain(entry, `No value for ${missing.join(', ')} in the secret store.`));
      return;
    }
  }

  const run = (command: Command) => runCommand(command, ctx.folder.fsPath, { ...entry.env, ...secrets }, ctx.token,
    { secrets: Object.values(secrets) });
  // A command stopped by Cancel ends the entry as skipped, not failed.
  const stoppedByCancel = (result: CommandResult) => result.stopped === 'cancelled'
    && report(entry, 'skipped', 'Setup was cancelled.');

  if (!entry.check) {
    report(entry, 'failed', 'It has no check command, so there is no way to tell whether it is in place.');
    return;
  }
  const checkCommand = entry.check;

  report(entry, 'checking');
  let check = await run(checkCommand);
  if (stoppedByCancel(check)) {
    return;
  }

  if (!check.ok) {
    if (!entry.fix) {
      report(entry, 'failed', explain(entry, 'Its check failed and it has no fix.', check));
      return;
    }
    const fixText = commandFor(entry.fix);
    if (fixText === undefined) {
      report(entry, 'failed', explain(entry, 'Its check failed and its fix has no command for this computer.', check));
      return;
    }
    if (!ctx.preApproved.has(entry.id)) {
      const team = entry.needs?.find(n => n.startsWith(APPROVAL_PREFIX))?.slice(APPROVAL_PREFIX.length);
      if (team !== undefined) {
        report(entry, 'needs-approval', explain(entry, `Its fix needs approval from ${team || 'another team'}.`, check));
        return;
      }
      if (!(await ctx.askToFix(entry, fixText))) {
        report(entry, 'failed', explain(entry, 'Its check failed, and you chose not to run the fix.', check));
        return;
      }
    }

    report(entry, 'fixing');
    const fix = await run(entry.fix);
    if (stoppedByCancel(fix)) {
      return;
    }
    if (!fix.ok) {
      report(entry, 'failed', explain(entry, 'Its fix failed.', fix));
      return;
    }

    report(entry, 'checking');
    check = await run(checkCommand);
    if (stoppedByCancel(check)) {
      return;
    }
    if (!check.ok) {
      report(entry, 'failed', explain(entry, 'Its fix ran, but its check still fails.', check));
      return;
    }
  }

  if (entry.prove) {
    report(entry, 'proving');
    const prove = await run(entry.prove);
    if (stoppedByCancel(prove)) {
      return;
    }
    if (!prove.ok) {
      report(entry, 'failed', explain(entry, 'It is in place, but its test of whether it works failed.', prove));
      return;
    }
  }
  ctx.proven.set(entry.id, hash);
  report(entry, 'ready');
}

/** Plain words for a failure: what happened, the entry's own message, what it needs, then the output. */
function explain(entry: Entry, what: string, result?: CommandResult): string {
  const outside = entry.needs?.filter(n => !n.startsWith(APPROVAL_PREFIX)) ?? [];
  return [
    what,
    entry.failMessage,
    outside.length > 0 ? `It needs: ${outside.join(', ')}.` : undefined,
    result?.output ? `Output:\n${result.output}` : undefined,
  ].filter(Boolean).join('\n');
}
