import * as vscode from 'vscode';
import { Entry, MANIFEST_FILE } from '../manifest/manifest';
import { expandPreset } from '../setup/presets';
import { runCommand } from '../setup/runCommand';

interface Input { entryId?: string; }

/** One entry's result, as the agent sees it. `ready` is null when the check was not run. */
interface CheckResult { id: string; title: string; ready: boolean | null; output: string; }

const CHECK_TIMEOUT_MS = 60_000;

/** Lets Copilot agent mode run check commands, which never change anything. */
export class CheckEntriesTool implements vscode.LanguageModelTool<Input> {
  static readonly NAME = 'onboarding_check_entries';

  constructor(private readonly getEntries: () => Entry[], private readonly folder?: vscode.Uri) {}

  prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<Input>) {
    return { invocationMessage: `Checking ${options.input.entryId ?? 'every setup step'}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<Input>, token?: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (!this.folder) {
      throw new Error('No folder is open, so there is nothing to check.');
    }
    if (!vscode.workspace.isTrusted) {
      throw new Error('This folder is not trusted, so its setup commands cannot run. '
        + 'Ask the developer to trust it (Manage Workspace Trust), then try again.');
    }
    let entries = this.getEntries();
    const { entryId } = options.input;
    if (entryId !== undefined) {
      const entry = entries.find(e => e.id === entryId);
      if (!entry) {
        throw new Error(`There is no entry "${entryId}". The entries are: ${entries.map(e => e.id).join(', ')}. `
          + 'Leave out entryId to check every entry.');
      }
      entries = [entry];
    }
    if (entries.length === 0) {
      throw new Error(`${MANIFEST_FILE} has no entries to check.`);
    }

    const results: CheckResult[] = [];
    for (const written of entries) {
      const id = written.id;
      const title = written.title ?? id;
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
          output: 'Not checked: its commands need secrets, which are never given to the agent. Ask the developer to run Onboarding: Run Setup.',
        });
      } else {
        const result = await runCommand(entry.check, this.folder.fsPath, entry.env ?? {}, token,
          { timeoutMs: CHECK_TIMEOUT_MS, maxLines: 20 });
        results.push({ id, title, ready: result.ok, output: result.output });
      }
    }
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(results, null, 2))]);
  }
}
