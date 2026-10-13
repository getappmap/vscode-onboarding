import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { sectionSha } from '../manifest/sectionSha';

interface Input { file: string; heading: string; }

/**
 * Gives the agent the SHA of a README section, computed the same way as the README check,
 * so the `sha256:` it writes in `from:` always agrees with it.
 */
export class SectionShaTool implements vscode.LanguageModelTool<Input> {
  static readonly NAME = 'onboarding_section_sha';

  constructor(private readonly folder?: vscode.Uri) {}

  prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<Input>) {
    return { invocationMessage: `Reading the SHA of "${options.input.heading}" in ${options.input.file}` };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<Input>): Promise<vscode.LanguageModelToolResult> {
    if (!this.folder) {
      throw new Error('No folder is open.');
    }
    const { file, heading } = options.input;
    const root = path.resolve(this.folder.fsPath);
    const full = path.resolve(root, file);
    if (!full.startsWith(root + path.sep)) {
      throw new Error(`${file} is outside the project. Give a path relative to the project folder, such as README.md.`);
    }
    let markdown: string;
    try {
      markdown = await fs.readFile(full, 'utf8');
    } catch {
      throw new Error(`There is no file ${file} in the project. Give a path relative to the project folder, such as README.md.`);
    }
    const sha256 = sectionSha(markdown, heading);
    if (sha256 === undefined) {
      throw new Error(`There is no heading "${heading}" in ${file}. Give the heading exactly as written, `
        + 'with its # marks, for example "## Run locally".');
    }
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ file, section: heading, sha256 })),
    ]);
  }
}
