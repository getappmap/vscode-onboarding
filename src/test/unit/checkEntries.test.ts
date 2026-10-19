import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Entry } from '../../manifest/manifest';
import { checkEntries } from '../../setup/checkEntries';

// `exit 0` and `exit 1` mean the same in sh and PowerShell.
const PASS = 'exit 0';
const FAIL = 'exit 1';
const options = { secretsNextStep: 'Run setup.' };

suite('Checking entries', () => {
  let folder: string;
  setup(() => { folder = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-check-')); });
  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));

  test('checks entries after the ones they depend on', async () => {
    const entries: Entry[] = [
      { id: 'packages', check: PASS, dependsOn: ['tool'] },
      { id: 'tool', check: PASS },
    ];
    const results = await checkEntries(entries, folder, options);
    assert.deepStrictEqual(results.map(r => [r.id, r.ready]), [['tool', true], ['packages', true]]);
  });

  test('does not check an entry that waits for one whose check did not pass', async () => {
    const entries: Entry[] = [
      { id: 'packages', check: FAIL },
      { id: 'database', check: PASS },
      { id: 'first-test', check: PASS, dependsOn: ['database', 'packages'] },
      { id: 'after-test', check: PASS, dependsOn: ['first-test'] },
    ];
    const results = await checkEntries(entries, folder, options);
    const byId = Object.fromEntries(results.map(r => [r.id, r]));
    assert.strictEqual(byId['packages'].ready, false);
    assert.strictEqual(byId['database'].ready, true);
    assert.strictEqual(byId['first-test'].ready, null);
    assert.strictEqual(byId['first-test'].waitsFor, 'packages');
    assert.match(byId['first-test'].output, /waits for packages/);
    assert.strictEqual(byId['after-test'].waitsFor, 'first-test', 'waiting passes down the chain');
  });

  test('an entry that needs secrets is not checked, so entries waiting for it are not either', async () => {
    const entries: Entry[] = [
      { id: 'token', check: PASS, secrets: { TOKEN: 'dev/token' } },
      { id: 'download', check: PASS, dependsOn: ['token'] },
    ];
    const results = await checkEntries(entries, folder, options);
    assert.deepStrictEqual(results.map(r => [r.id, r.ready, r.waitsFor]), [['token', null, undefined], ['download', null, 'token']]);
  });

  test('one entry asked for by id is checked even when its dependencies are not', async () => {
    const entries: Entry[] = [
      { id: 'packages', check: FAIL },
      { id: 'first-test', check: PASS, dependsOn: ['packages'] },
    ];
    const results = await checkEntries(entries, folder, { ...options, entryId: 'first-test' });
    assert.deepStrictEqual(results.map(r => [r.id, r.ready]), [['first-test', true]]);
  });

  test('a loop in dependsOn is reported in plain words', async () => {
    const entries: Entry[] = [
      { id: 'a', check: PASS, dependsOn: ['b'] },
      { id: 'b', check: PASS, dependsOn: ['a'] },
    ];
    await assert.rejects(checkEntries(entries, folder, options), /depend on each other in a loop/);
  });
});
