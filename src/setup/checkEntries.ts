import { Entry, MANIFEST_FILE } from '../manifest/manifest';
import { expandPreset } from './presets';
import { runCommand } from './runCommand';
import { inDependencyOrder } from './runSetup';

/**
 * One entry's result, as the agent sees it. `ready` is null when the check was not run;
 * `waitsFor` then names the entry it waits for, if that is why.
 */
export interface CheckResult { id: string; title: string; ready: boolean | null; output: string; waitsFor?: string; }

const CHECK_TIMEOUT_MS = 60_000;

export interface CheckOptions {
  /** One entry id. Left out, every entry is checked. */
  entryId?: string;
  token?: { readonly isCancellationRequested: boolean };
  /** The next step for an entry that needs secrets, such as "Ask the developer to run Onboarding: Run Setup." */
  secretsNextStep: string;
}

/**
 * Runs the check command of one entry, or every entry, in the project folder. Never runs a
 * fix, and never runs an entry that needs secrets. When checking every entry, they run in
 * dependency order, and an entry that waits for one whose check did not pass is not run: its
 * check would only fail for that reason. Throws, in plain words, when there is nothing to check.
 */
export async function checkEntries(all: Entry[], folder: string, options: CheckOptions): Promise<CheckResult[]> {
  const { entryId, token } = options;
  let entries = all;
  if (entryId !== undefined) {
    const entry = all.find(e => e.id === entryId);
    if (!entry) {
      throw new Error(`There is no entry "${entryId}". The entries are: ${all.map(e => e.id).join(', ')}. `
        + 'Leave out the entry id to check every entry.');
    }
    entries = [entry];
  } else {
    entries = inDependencyOrder(all);
  }
  if (entries.length === 0) {
    throw new Error(`${MANIFEST_FILE} has no entries to check.`);
  }

  const results: CheckResult[] = [];
  const passed = new Set<string>();
  for (const written of entries) {
    const id = written.id;
    const title = written.title ?? id;
    const waitsFor = entryId === undefined ? written.dependsOn?.find(dep => !passed.has(dep)) : undefined;
    if (waitsFor !== undefined) {
      results.push({ id, title, ready: null, waitsFor, output: `Not checked: waits for ${waitsFor}, whose check did not pass.` });
      continue;
    }
    let entry: Entry;
    try {
      entry = expandPreset(written);
    } catch (err) {
      results.push({ id, title, ready: false, output: (err as Error).message });
      continue;
    }
    if (!entry.check) {
      results.push({ id, title, ready: false, output: 'It has no check command.' });
    } else if (entry.secrets && Object.keys(entry.secrets).length > 0) {
      results.push({
        id, title, ready: null,
        output: `Not checked: its commands need secrets, which are never given to the agent. ${options.secretsNextStep}`,
      });
    } else {
      const result = await runCommand(entry.check, folder, entry.env ?? {}, token,
        { timeoutMs: CHECK_TIMEOUT_MS, maxLines: 20 });
      results.push({ id, title, ready: result.ok, output: result.output });
      if (result.ok) {
        passed.add(id);
      }
    }
  }
  return results;
}
