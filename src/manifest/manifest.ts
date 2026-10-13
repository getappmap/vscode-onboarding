import * as vscode from 'vscode';
import { parseDocument } from 'yaml';
import { PRESET_NAMES } from '../setup/presets';

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
  env?: Record<string, string>;      // plain values passed to the commands
  secrets?: Record<string, string>;  // ENV_NAME -> secret store path, never a value
  failMessage?: string;
  troubleshooting?: string;          // sent to the agent when it helps with a failure
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

/** A manifest that cannot be used. Lists every problem found, not just the first. */
export class ManifestError extends Error {
  constructor(readonly source: string, readonly problems: string[]) {
    super(`${source} has ${problems.length === 1 ? 'a problem' : `${problems.length} problems`}:\n`
      + problems.map(p => `  - ${p}`).join('\n'));
    this.name = 'ManifestError';
  }
}

/** Reads onboarding.yaml from the folder. Undefined when there is none. */
export async function readManifest(folder: vscode.Uri): Promise<Manifest | undefined> {
  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, MANIFEST_FILE));
  } catch (err) {
    if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
      return undefined;
    }
    throw err;
  }
  return parseManifest(new TextDecoder().decode(bytes), MANIFEST_FILE);
}

/**
 * Parses manifest YAML. Every value is read as text, so `version: 21` gives "21"
 * and a SHA such as 01234567 keeps its leading zero.
 */
export function parseManifest(text: string, source = MANIFEST_FILE): Manifest {
  const doc = parseDocument(text, { schema: 'failsafe', uniqueKeys: true });
  if (doc.errors.length > 0) {
    throw new ManifestError(source, doc.errors.map(e => e.message.split('\n')[0]));
  }
  return validateManifest(doc.toJS() ?? {}, source);
}

/** Checks parsed data, from YAML or from the Org settings server, and returns it as a Manifest. */
export function validateManifest(data: unknown, source = MANIFEST_FILE): Manifest {
  const problems: string[] = [];
  const v = new Validator(problems);

  if (!isMap(data)) {
    throw new ManifestError(source, ['must be a mapping with "entries" and, optionally, "team" and "mcpServers"']);
  }
  v.onlyKeys(data, ['team', 'entries', 'mcpServers'], 'top level');

  const entries = v.list(data.entries, 'entries').map((e, i) => readEntry(e, `entries[${i}]`, v));
  const mcpServers = v.list(data.mcpServers, 'mcpServers').map((s, i) => readServer(s, `mcpServers[${i}]`, v));
  v.unique(entries.map(e => e.id), 'entries', 'id');
  v.unique(mcpServers.map(s => s.name), 'mcpServers', 'name');

  if (problems.length > 0) {
    throw new ManifestError(source, problems);
  }
  return compact({ team: v.text(data.team, 'team'), entries, mcpServers });
}

const ENTRY_KEYS = ['id', 'title', 'uses', 'with', 'check', 'fix', 'prove', 'dependsOn', 'env',
  'secrets', 'failMessage', 'troubleshooting', 'from'];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SOURCES: Provenance['source'][] = ['person', 'reference', 'guessed', 'confirmed'];

function readEntry(data: unknown, path: string, v: Validator): Entry {
  if (!isMap(data)) {
    v.problem(path, 'must be a mapping');
    return { id: '' };
  }
  const id = v.text(data.id, `${path}.id`) ?? '';
  if (data.id === undefined) {
    v.problem(path, 'needs an id');
  } else if (id && !ID_PATTERN.test(id)) {
    v.problem(`${path}.id`, `"${id}" may use only letters, digits, dots, dashes and underscores`);
  }
  // Name the entry in every message once its id is known.
  const at = id ? `${path} (${id})` : path;
  v.onlyKeys(data, ENTRY_KEYS, at);

  const entry: Entry = compact({
    id,
    title: v.text(data.title, `${at}.title`),
    uses: v.text(data.uses, `${at}.uses`),
    with: v.textMap(data.with, `${at}.with`),
    check: v.command(data.check, `${at}.check`),
    fix: v.command(data.fix, `${at}.fix`),
    prove: v.command(data.prove, `${at}.prove`),
    dependsOn: v.textList(data.dependsOn, `${at}.dependsOn`),
    env: v.textMap(data.env, `${at}.env`, ENV_NAME_PATTERN),
    secrets: v.textMap(data.secrets, `${at}.secrets`, ENV_NAME_PATTERN),
    failMessage: v.text(data.failMessage, `${at}.failMessage`),
    troubleshooting: v.text(data.troubleshooting, `${at}.troubleshooting`),
    from: readProvenance(data.from, `${at}.from`, v),
  });

  if (entry.uses !== undefined && !PRESET_NAMES.includes(entry.uses)) {
    v.problem(`${at}.uses`, `"${entry.uses}" is not a preset. Presets: ${PRESET_NAMES.join(', ')}`);
  }
  if (entry.with && entry.uses === undefined) {
    v.problem(`${at}.with`, 'only works with "uses"');
  }
  if (entry.check === undefined && entry.uses === undefined) {
    v.problem(at, 'needs a check command, or a preset in "uses", to tell whether it is in place');
  }
  if (entry.dependsOn?.includes(id)) {
    v.problem(`${at}.dependsOn`, 'an entry cannot depend on itself');
  }
  for (const name of Object.keys(entry.env ?? {})) {
    if (entry.secrets && name in entry.secrets) {
      v.problem(at, `${name} is in both env and secrets`);
    }
  }
  return entry;
}

function readProvenance(data: unknown, path: string, v: Validator): Provenance | undefined {
  if (data === undefined) {
    return undefined;
  }
  if (!isMap(data)) {
    v.problem(path, 'must be a mapping');
    return undefined;
  }
  v.onlyKeys(data, ['source', 'file', 'section', 'sha256', 'date'], path);
  const source = v.text(data.source, `${path}.source`);
  if (!SOURCES.includes(source as Provenance['source'])) {
    v.problem(`${path}.source`, `must be one of: ${SOURCES.join(', ')}`);
  }
  return compact({
    source: source as Provenance['source'],
    file: v.text(data.file, `${path}.file`),
    section: v.text(data.section, `${path}.section`),
    sha256: v.text(data.sha256, `${path}.sha256`),
    date: v.text(data.date, `${path}.date`),
  });
}

function readServer(data: unknown, path: string, v: Validator): McpServerEntry {
  if (!isMap(data)) {
    v.problem(path, 'must be a mapping');
    return { name: '' };
  }
  const name = v.text(data.name, `${path}.name`) ?? '';
  if (!name) {
    v.problem(path, 'needs a name');
  }
  const at = name ? `${path} (${name})` : path;
  v.onlyKeys(data, ['name', 'url', 'command', 'tokenSecret'], at);

  const server: McpServerEntry = compact({
    name,
    url: v.text(data.url, `${at}.url`),
    command: v.textList(data.command, `${at}.command`),
    tokenSecret: v.text(data.tokenSecret, `${at}.tokenSecret`),
  });
  if ((server.url === undefined) === (server.command === undefined)) {
    v.problem(at, 'needs either a url or a command, not both');
  }
  if (server.tokenSecret !== undefined && server.command !== undefined) {
    v.problem(`${at}.tokenSecret`, 'works only with a url: the token is sent in the Authorization header');
  }
  if (server.command?.length === 0) {
    v.problem(`${at}.command`, 'must name the program to run');
  }
  return server;
}

/** Shape checks that record a problem and carry on, so one pass reports every mistake. */
class Validator {
  constructor(private readonly problems: string[]) {}

  problem(path: string, message: string): void {
    this.problems.push(`${path}: ${message}`);
  }

  onlyKeys(data: Record<string, unknown>, allowed: string[], path: string): void {
    for (const key of Object.keys(data)) {
      if (!allowed.includes(key)) {
        this.problem(path, `unknown field "${key}". Allowed: ${allowed.join(', ')}`);
      }
    }
  }

  text(data: unknown, path: string): string | undefined {
    if (data === undefined || typeof data === 'string') {
      return data;
    }
    this.problem(path, 'must be text');
    return undefined;
  }

  list(data: unknown, path: string): unknown[] {
    if (data === undefined) {
      return [];
    }
    if (Array.isArray(data)) {
      return data;
    }
    this.problem(path, 'must be a list');
    return [];
  }

  textList(data: unknown, path: string): string[] | undefined {
    if (data === undefined) {
      return undefined;
    }
    const items = this.list(data, path);
    items.forEach((item, i) => this.text(item, `${path}[${i}]`));
    return items.filter((item): item is string => typeof item === 'string');
  }

  textMap(data: unknown, path: string, keyPattern?: RegExp): Record<string, string> | undefined {
    if (data === undefined) {
      return undefined;
    }
    if (!isMap(data)) {
      this.problem(path, 'must be a mapping');
      return undefined;
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (keyPattern && !keyPattern.test(key)) {
        this.problem(path, `"${key}" is not a valid environment variable name`);
      }
      const text = this.text(value, `${path}.${key}`);
      if (text !== undefined) {
        result[key] = text;
      }
    }
    return result;
  }

  command(data: unknown, path: string): Command | undefined {
    if (data === undefined) {
      return undefined;
    }
    if (typeof data === 'string') {
      if (!data.trim()) {
        this.problem(path, 'is empty');
      }
      return data;
    }
    if (isMap(data) && (data.windows !== undefined || data.posix !== undefined)) {
      this.onlyKeys(data, ['windows', 'posix'], path);
      return compact({ windows: this.text(data.windows, `${path}.windows`), posix: this.text(data.posix, `${path}.posix`) });
    }
    this.problem(path, 'must be a command, or a mapping with a windows form, a posix form, or both');
    return undefined;
  }

  unique(values: string[], path: string, field: string): void {
    const seen = new Set<string>();
    for (const value of values) {
      if (value && seen.has(value)) {
        this.problem(path, `${field} "${value}" is used more than once`);
      }
      seen.add(value);
    }
  }
}

function isMap(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}

/** Drops keys whose value is undefined, so merged objects carry only what was written. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Combines the Org, Team and Project layers, read in that order, into one plan.
 * A new id adds an entry. An id seen before adds to that entry: single values from the
 * later layer win, lists are joined, and maps are merged key by key. MCP servers with
 * the same name are replaced whole. Inputs are not changed.
 */
export function combineLayers(layers: Manifest[]): Manifest {
  const entries = new Map<string, Entry>();
  const servers = new Map<string, McpServerEntry>();
  let team: string | undefined;

  for (const layer of layers) {
    team = layer.team ?? team;
    for (const entry of layer.entries) {
      const earlier = entries.get(entry.id);
      entries.set(entry.id, earlier ? mergeEntry(earlier, entry) : entry);
    }
    for (const server of layer.mcpServers) {
      servers.set(server.name, server);
    }
  }
  return compact({ team, entries: [...entries.values()], mcpServers: [...servers.values()] });
}

function mergeEntry(earlier: Entry, later: Entry): Entry {
  return compact({
    ...earlier,
    ...later,
    with: mergeMaps(earlier.with, later.with),
    env: mergeMaps(earlier.env, later.env),
    secrets: mergeMaps(earlier.secrets, later.secrets),
    dependsOn: joinLists(earlier.dependsOn, later.dependsOn),
  });
}

function mergeMaps(a?: Record<string, string>, b?: Record<string, string>): Record<string, string> | undefined {
  return a || b ? { ...a, ...b } : undefined;
}

function joinLists(a?: string[], b?: string[]): string[] | undefined {
  return a || b ? [...new Set([...(a ?? []), ...(b ?? [])])] : undefined;
}
