import * as vscode from 'vscode';
import type { Entry } from '../manifest/manifest';
import { checkEntries } from '../setup/checkEntries';

interface Input { entryId?: string; }

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
    const results = await checkEntries(this.getEntries(), this.folder.fsPath, {
      entryId: options.input.entryId, token, secretsNextStep: 'Ask the developer to run Onboarding: Run Setup.',
    });
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(results, null, 2))]);
  }
}
