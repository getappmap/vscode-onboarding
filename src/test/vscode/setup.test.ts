import * as assert from 'assert';
import * as vscode from 'vscode';
import type { EntryStatus } from '../../report/report';

// Runs the real commands against test-fixtures/vscode-workspace/onboarding.yaml.
suite('Run Project Setup', function () {
  this.timeout(30_000);

  const run = async (command: string) => {
    const statuses = await vscode.commands.executeCommand<EntryStatus[] | undefined>(command);
    assert.ok(statuses, `${command} did not run`);
    return Object.fromEntries(statuses.map(s => [s.id, s]));
  };

  test('proving everything runs each entry and reports the results', async () => {
    const result = await run('onboarding.reproveSetup');

    assert.deepStrictEqual(result['ready-now'], { id: 'ready-now', title: 'Already in place', state: 'ready' });
    assert.strictEqual(result['broken'].state, 'failed');
    assert.strictEqual(result['broken'].detail,
      'Its check failed and it has no fix.\nInstall it by hand.\nOutput:\nnot-installed');
    assert.strictEqual(result['after-broken'].state, 'skipped');

    const folder = vscode.workspace.workspaceFolders![0].uri;
    const written = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, '.onboarding', 'status.yaml')))
      .toString('utf8');
    assert.match(written, /^ {2}broken:\n {4}title: broken\n {4}state: failed$/m);
  });

  test('a later run remembers what was proven', async () => {
    const result = await run('onboarding.runSetup');

    assert.strictEqual(result['ready-now'].detail, 'Proven earlier.');
    assert.strictEqual(result['broken'].state, 'failed');
  });
});
