import * as vscode from 'vscode';
import { McpServerEntry } from '../manifest/manifest';

export const PROVIDER_ID = 'onboarding.servers';

/** Hands Copilot the MCP servers the plan lists, so nobody edits mcp.json by hand. */
export class ManifestMcpProvider implements vscode.McpServerDefinitionProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServerDefinitions = this.changed.event;
  private servers: McpServerEntry[] = [];

  /** `folder` is where servers started by a command run. */
  constructor(
    private readonly readSecret: (path: string) => Promise<string | undefined>,
    private readonly folder?: vscode.Uri,
  ) {}

  update(servers: McpServerEntry[]): void {
    if (JSON.stringify(servers) === JSON.stringify(this.servers)) {
      return;
    }
    this.servers = servers;
    this.changed.fire();
  }

  /** Called often: fast, never asks the developer anything. */
  provideMcpServerDefinitions(): vscode.McpServerDefinition[] {
    return this.servers.map(server => {
      if (server.url) {
        return new vscode.McpHttpServerDefinition(server.name, vscode.Uri.parse(server.url));
      }
      const [program, ...args] = server.command!;
      const definition = new vscode.McpStdioServerDefinition(server.name, program, args);
      definition.cwd = this.folder;
      return definition;
    });
  }

  /** Called just before a server starts: add its token, or return undefined to not start it. */
  async resolveMcpServerDefinition(server: vscode.McpServerDefinition): Promise<vscode.McpServerDefinition | undefined> {
    const entry = this.servers.find(s => s.name === server.label);
    if (!entry?.tokenSecret || !(server instanceof vscode.McpHttpServerDefinition)) {
      return server;
    }
    try {
      const token = await this.readSecret(entry.tokenSecret);
      if (!token) {
        throw new Error('the secret store has no value for it');
      }
      server.headers = { ...server.headers, Authorization: `Bearer ${token}` };
      return server;
    } catch (err) {
      void vscode.window.showWarningMessage(
        `The MCP server "${server.label}" was not started: could not read its token ${entry.tokenSecret}: ${(err as Error).message}`);
      return undefined;
    }
  }
}
