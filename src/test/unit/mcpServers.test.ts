import * as assert from 'assert';
import * as vscode from 'vscode';
import { ManifestMcpProvider } from '../../connections/mcpServers';
import { fake } from './vscode.fake';

suite('MCP servers for Copilot', () => {
  const folder = vscode.Uri.file('/work/appland');
  const secrets: Record<string, string> = { 'dev/access/token': 'tok-1' };
  const readSecret = async (path: string) => secrets[path];
  setup(() => fake.reset());

  test('a server with a url or a command becomes a definition Copilot can start', () => {
    const provider = new ManifestMcpProvider(readSecret, folder);
    provider.update([
      { name: 'access', url: 'https://access.example.com/mcp' },
      { name: 'local', command: ['node', 'tools/mcp.js', '--stdio'] },
    ]);
    const [http, local] = provider.provideMcpServerDefinitions() as [vscode.McpHttpServerDefinition, vscode.McpStdioServerDefinition];

    assert.ok(http instanceof vscode.McpHttpServerDefinition);
    assert.strictEqual(http.label, 'access');
    assert.strictEqual(http.uri.toString(), 'https://access.example.com/mcp');
    assert.ok(local instanceof vscode.McpStdioServerDefinition);
    assert.deepStrictEqual([local.label, local.command, local.args], ['local', 'node', ['tools/mcp.js', '--stdio']]);
    assert.strictEqual(local.cwd, folder, 'a command runs in the project folder');
  });

  test('tells Copilot when the list changes, and only then', () => {
    const provider = new ManifestMcpProvider(readSecret);
    let changes = 0;
    provider.onDidChangeMcpServerDefinitions(() => changes++);
    provider.update([{ name: 'access', url: 'https://a' }]);
    provider.update([{ name: 'access', url: 'https://a' }]);
    provider.update([]);
    assert.strictEqual(changes, 2);
  });

  test('adds the token from the secret store just before the server starts', async () => {
    const provider = new ManifestMcpProvider(readSecret);
    provider.update([{ name: 'access', url: 'https://access.example.com/mcp', tokenSecret: 'dev/access/token' }]);
    const [definition] = provider.provideMcpServerDefinitions() as vscode.McpHttpServerDefinition[];
    assert.deepStrictEqual(definition.headers, {}, 'no token while only listing servers');

    const resolved = await provider.resolveMcpServerDefinition(definition) as vscode.McpHttpServerDefinition;
    assert.deepStrictEqual(resolved.headers, { Authorization: 'Bearer tok-1' });
  });

  test('a server whose token cannot be read is not started, and says why', async () => {
    const provider = new ManifestMcpProvider(readSecret);
    provider.update([{ name: 'access', url: 'https://a', tokenSecret: 'dev/missing' }]);
    const [definition] = provider.provideMcpServerDefinitions();

    assert.strictEqual(await provider.resolveMcpServerDefinition(definition), undefined);
    assert.strictEqual(fake.messages[0].message,
      'The MCP server "access" was not started: could not read its token dev/missing: the secret store has no value for it');
  });

  test('a server with no token starts as it is', async () => {
    const provider = new ManifestMcpProvider(readSecret);
    provider.update([{ name: 'access', url: 'https://a' }]);
    const [definition] = provider.provideMcpServerDefinitions();
    assert.strictEqual(await provider.resolveMcpServerDefinition(definition), definition);
  });
});
