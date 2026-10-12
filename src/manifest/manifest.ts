import * as vscode from 'vscode';

/** Plain text runs in the default shell for the computer: PowerShell on Windows, sh elsewhere.
 *  Give both forms when they differ. */
export type Command = string | { windows?: string; posix?: string };

/** Where a value came from. Decides whether the extension may change it. */
export interface Provenance {
  source: 'person' | 'reference' | 'guessed' | 'confirmed';
  file?: string;
  section?: string;
  sha256?: string;
  date?: string;
}

/** One thing the developer's computer should have. */
export interface Entry {
  id: string;
  title?: string;                    // shown in the report; defaults to id
  uses?: string;                     // optional built-in preset, e.g. "jdk"
  with?: Record<string, string>;     // values for the preset
  check?: Command;                   // succeeds when already in place; changes nothing
  fix?: Command;                     // puts it in place
  prove?: Command;                   // succeeds when it works
  dependsOn?: string[];
  needs?: string[];                  // from outside: "admin", "vpn", "approval:<team>"
  env?: Record<string, string>;      // plain values passed to the commands
  secrets?: Record<string, string>;  // ENV_NAME -> secret store path, never a value
  failMessage?: string;
  from?: Provenance;
}

/** An MCP server the project's developers need in their AI tools. */
export interface McpServerEntry {
  name: string;
  url?: string;
  command?: string[];
  tokenSecret?: string;
}

export interface Manifest {
  team?: string;
  entries: Entry[];
  mcpServers: McpServerEntry[];
}

export const MANIFEST_FILE = 'onboarding.yaml';

/** Reads onboarding.yaml from the folder. Undefined when there is none. */
export async function readManifest(folder: vscode.Uri): Promise<Manifest | undefined> {
  throw new Error('TODO: read and parse the YAML file; validate entries');
}

/** Combines the Org, Team and Project layers, read in that order, into one plan. */
export function combineLayers(layers: Manifest[]): Manifest {
  throw new Error('TODO: later layers add entries or add to earlier ones with the same id');
}
