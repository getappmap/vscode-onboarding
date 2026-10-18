import * as assert from 'assert';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse, stringify } from 'yaml';
import { Io, main } from '../../cli/onboard';
import type { Command, Entry } from '../../manifest/manifest';
import { sectionSha } from '../../manifest/sectionSha';
import { statusPath } from '../../report/statusFile';

// Commands that work in sh and in PowerShell.
const fileExists = (name: string): Command => ({
  posix: `test -f ${name}`,
  windows: `if (-not (Test-Path ${name})) { exit 1 }`,
});
const touch = (name: string): Command => ({
  posix: `touch ${name}`,
  windows: `New-Item -ItemType File -Force ${name} | Out-Null`,
});

const README = '# App\n\n## Run locally\n\nInstall rbenv.\n';

/** Runs the command line and keeps what it printed. */
async function onboard(args: string[], env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = { out: t => out.push(t), err: t => err.push(t), env };
  const code = await main(args, io);
  return { code, out: out.join('\n'), err: err.join('\n') };
}

suite('Command line', function () {
  this.timeout(20_000);
  let folder: string;
  setup(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-cli-'));
    fs.writeFileSync(path.join(folder, 'README.md'), README);
  });
  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));
  const write = (entries: Entry[]) => fs.writeFileSync(path.join(folder, 'onboarding.yaml'), stringify({ entries }));
  const fromReadme = { source: 'guessed' as const, file: 'README.md', section: '## Run locally', sha256: sectionSha(README, '## Run locally') };

  test('run sets up each entry, records the results, and explains what is not ready', async () => {
    write([
      { id: 'tool', title: 'The tool', check: fileExists('tool'), fix: touch('tool') },
      { id: 'broken', check: 'echo not-installed; exit 1', failMessage: 'Install it by hand.', troubleshooting: 'Try the VPN.' },
      { id: 'after', check: 'exit 0', dependsOn: ['broken'] },
    ]);
    const { code, out } = await onboard(['run', '--project', folder]);

    assert.strictEqual(code, 1);
    assert.ok(fs.existsSync(path.join(folder, 'tool')), 'the fix ran');
    assert.match(out, /^ready {3}The tool$/m);
    assert.match(out, /^failed {2}broken$/m);
    assert.match(out, /^skipped after: Waits for broken, which is not ready\.$/m);
    assert.match(out, /2 of 3 entries are not ready\./);
    assert.match(out, /Install it by hand\./);
    assert.match(out, /Notes from the team:\n\nTry the VPN\./);

    const status = parse(fs.readFileSync(statusPath(folder), 'utf8'));
    assert.deepStrictEqual(Object.fromEntries(Object.entries(status.entries).map(([id, r]) => [id, (r as { state: string }).state])),
      { tool: 'ready', broken: 'failed', after: 'skipped' });
  });

  test('run remembers what it proved, and --reprove proves it again', async () => {
    write([{ id: 'tool', check: fileExists('tool'), fix: touch('tool') }]);
    assert.strictEqual((await onboard(['run', '--project', folder])).code, 0);

    const again = await onboard(['run', '--project', folder]);
    assert.strictEqual(again.code, 0);
    assert.match(again.out, /^ready {3}tool \(proven earlier\)$/m);
    assert.match(again.out, /Every entry is ready\./);

    assert.doesNotMatch((await onboard(['run', '--project', folder, '--reprove'])).out, /proven earlier/);
  });

  test('run reads secrets with ONBOARDING_SECRET_COMMAND', async () => {
    write([{
      id: 'token', secrets: { TOKEN: 'dev/token' },
      check: { posix: 'test "$TOKEN" = value-of-dev/token', windows: 'if ($env:TOKEN -ne "value-of-dev/token") { exit 1 }' },
    }]);
    const secretCommand = process.platform === 'win32' ? 'Write-Output "value-of-$({path})"' : 'echo "value-of-{path}"';
    assert.strictEqual((await onboard(['run', '--project', folder], { ONBOARDING_SECRET_COMMAND: secretCommand })).code, 0);

    const without = await onboard(['run', '--project', folder, '--reprove']);
    assert.strictEqual(without.code, 1);
    assert.match(without.out, /no secret store is set up/);
  });

  test('run mentions a README section that changed under the manifest', async () => {
    write([{ id: 'rbenv', check: 'exit 0', from: fromReadme }]);
    fs.writeFileSync(path.join(folder, 'README.md'), README.replace('rbenv', 'asdf'));
    assert.match((await onboard(['run', '--project', folder])).out, /section "Run locally" has changed\..*onboard\.mjs stale/);
  });

  test('check runs check commands only', async () => {
    write([
      { id: 'tool', check: fileExists('tool'), fix: touch('tool') },
      { id: 'ok', title: 'Fine', check: 'exit 0' },
    ]);
    const { code, out } = await onboard(['check', '--project', folder]);
    assert.strictEqual(code, 1);
    assert.ok(!fs.existsSync(path.join(folder, 'tool')), 'no fix ran');
    assert.match(out, /^not ready tool \(tool\)$/m);
    assert.match(out, /^ready {5}Fine \(ok\)$/m);

    const one = await onboard(['check', 'ok', '--project', folder, '--json']);
    assert.strictEqual(one.code, 0);
    assert.deepStrictEqual(JSON.parse(one.out), [{ id: 'ok', title: 'Fine', ready: true, output: '' }]);
  });

  test('check names the entries when asked for one that is not there', async () => {
    write([{ id: 'ok', check: 'exit 0' }]);
    const { code, err } = await onboard(['check', 'nope', '--project', folder]);
    assert.strictEqual(code, 2);
    assert.match(err, /There is no entry "nope"\. The entries are: ok\./);
  });

  test('sha gives the same SHA as the README check', async () => {
    const { code, out } = await onboard(['sha', 'README.md', '## Run locally', '--project', folder]);
    assert.strictEqual(code, 0);
    assert.strictEqual(out, sectionSha(README, '## Run locally'));

    const json = await onboard(['sha', 'README.md', '## Run locally', '--project', folder, '--json']);
    assert.deepStrictEqual(JSON.parse(json.out), { file: 'README.md', section: '## Run locally', sha256: out });

    const missing = await onboard(['sha', 'README.md', '## Nope', '--project', folder]);
    assert.strictEqual(missing.code, 2);
    assert.match(missing.err, /There is no heading "## Nope" in README\.md/);
  });

  test('stale lists the entries whose README section changed', async () => {
    write([{ id: 'rbenv', check: 'exit 0', from: fromReadme }]);
    assert.deepStrictEqual(await onboard(['stale', '--project', folder]),
      { code: 0, out: 'No README section behind onboarding.yaml has changed.', err: '' });

    fs.writeFileSync(path.join(folder, 'README.md'), README.replace('rbenv', 'asdf'));
    const { code, out } = await onboard(['stale', '--project', folder]);
    assert.strictEqual(code, 1);
    assert.match(out, /^- rbenv: README\.md section "## Run locally"$/m);
  });

  test('status shows the last results', async () => {
    write([{ id: 'broken', check: 'echo not-installed; exit 1' }]);
    assert.deepStrictEqual(await onboard(['status', '--project', folder]),
      { code: 1, out: 'Setup has not run on this computer yet.', err: '' });

    await onboard(['run', '--project', folder]);
    const { code, out } = await onboard(['status', '--project', folder]);
    assert.strictEqual(code, 1);
    assert.match(out, /^Last setup finished /);
    assert.match(out, /^failed {2}broken$/m);
    assert.match(out, /not-installed/);
  });

  test('says plainly when there is no manifest, or no such command', async () => {
    const none = await onboard(['run', '--project', folder]);
    assert.strictEqual(none.code, 2);
    assert.match(none.err, /There is no onboarding\.yaml in .*Give the project folder with --project\./);

    const unknown = await onboard(['go', '--project', folder]);
    assert.strictEqual(unknown.code, 2);
    assert.match(unknown.err, /There is no command "go"\./);

    assert.strictEqual((await onboard([])).code, 2);
    assert.match((await onboard(['--help'])).out, /^Usage: node onboard\.mjs/);
  });

  test('the built dist/onboard.mjs runs on its own, from any folder', () => {
    const cli = path.join(__dirname, '..', '..', '..', 'dist', 'onboard.mjs');
    const result = spawnSync(process.execPath, [cli, 'sha', 'README.md', '## Run locally', '--project', folder],
      { cwd: os.tmpdir(), encoding: 'utf8' });
    assert.strictEqual(result.stderr, '');
    assert.strictEqual(result.stdout.trim(), sectionSha(README, '## Run locally'));
    assert.strictEqual(result.status, 0);
  });
});
