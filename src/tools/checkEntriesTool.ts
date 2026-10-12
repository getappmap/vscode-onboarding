import * as vscode from 'vscode';
import { Entry } from '../manifest/manifest';

interface Input { entryId?: string; }

/** Lets Copilot agent mode run check commands, which never change anything. */
export class CheckEntriesTool implements vscode.LanguageModelTool<Input> {
  static readonly NAME = 'onboarding_check_entries';

  constructor(private readonly getEntries: () => Entry[]) {}

  prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<Input>) {
    return { invocationMessage: `Checking ${options.input.entryId ?? 'every setup entry'}` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<Input>): Promise<vscode.LanguageModelToolResult> {
    // TODO: refuse in an untrusted folder; run check commands without secrets;
    // return JSON [{ id, ready, output }]; throw errors that tell the model what to do next.
    throw new Error('TODO');
  }
}
