import * as vscode from 'vscode';
import { sectionShaOfFile } from '../manifest/sectionSha';

interface Input { file: string; heading: string; }

/**
 * Gives the agent the SHA of a README section, computed the same way as the README check,
 * so the `sha256:` it writes in `from:` always agrees with it.
 */
export class SectionShaTool implements vscode.LanguageModelTool<Input> {
  static readonly NAME = 'onboarding_section_sha';

  /** `onUsed` hears each call: an agent asking for SHAs is working on the manifest and the README. */
  constructor(private readonly folder?: vscode.Uri, private readonly onUsed?: () => void) {}

  prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<Input>) {
    return { invocationMessage: `Reading the SHA of "${options.input.heading}" in ${options.input.file}` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<Input>): Promise<vscode.LanguageModelToolResult> {
    this.onUsed?.();
    if (!this.folder) {
      throw new Error('No folder is open.');
    }
    const { file, heading } = options.input;
    const sha256 = await sectionShaOfFile(this.folder.fsPath, file, heading);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ file, section: heading, sha256 })),
    ]);
  }
}
