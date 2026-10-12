import * as vscode from 'vscode';
import { McpServerEntry } from '../manifest/manifest';

export const PROVIDER_ID = 'onboarding.servers';

/** Hands Copilot the MCP servers the plan lists, so nobody edits mcp.json by hand. */
export class ManifestMcpProvider implements vscode.McpServerDefinitionProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions = this.changed.event;

  constructor(private readonly readSecret: (path: string) => Promise<string | undefined>) {}

  update(servers: McpServerEntry[]): void {
    // TODO: keep the list; fire changed
  }

  /** Called often: fast, never asks the developer anything. */
  provideMcpServerDefinitions(): vscode.McpServerDefinition[] {
    throw new Error('TODO: McpHttpServerDefinition for url, McpStdioServerDefinition for command');
  }

  /** Called just before a server starts: add its token, or return undefined to not start it. */
  async resolveMcpServerDefinition(server: vscode.McpServerDefinition): Promise<vscode.McpServerDefinition | undefined> {
    throw new Error('TODO');
  }
}
