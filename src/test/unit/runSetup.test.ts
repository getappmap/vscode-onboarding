import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Command, Entry } from '../../manifest/manifest';
import type { EntryStatus } from '../../report/report';
import { SetupContext, definitionHash, inDependencyOrder, runSetup, withDependencies } from '../../setup/runSetup';

// Commands that work in sh and in PowerShell.
const fileExists = (name: string): Command => ({
  posix: `test -f ${name}`,
  windows: `if (-not (Test-Path ${name})) { exit 1 }`,
});
const touch = (name: string): Command => ({
  posix: `touch ${name}`,
  windows: `New-Item -ItemType File -Force ${name} | Out-Null`,
});
const fail = (message: string): Command => `echo ${message}; exit 1`;

/** A setup context that records what the runner reported and asked. */
function context(folder: string, options: {
  secrets?: Record<string, string>;
  /** Ask before each fix, giving this answer. Left out, fixes run without asking. */
  answer?: boolean;
  proven?: Map<string, string>;
  reprove?: boolean | ReadonlySet<string>;
} = {}) {
  const updates: EntryStatus[] = [];
  const asked: string[] = [];
  const secretReads: Record<string, string>[] = [];
  const events: string[] = [];
  const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };

  const ctx: SetupContext = {
    folder,
    async readSecrets(paths) {
      secretReads.push(paths);
      const values: Record<string, string> = {};
      for (const [name, secretPath] of Object.entries(paths)) {
        const value = options.secrets?.[secretPath];
        if (value !== undefined) {
          values[name] = value;
        }
      }
      return values;
    },
    askToFix: options.answer === undefined ? undefined : async (entry, command) => {
      asked.push(`${entry.id}: ${command}`);
      return options.answer!;
    },
    reporter: {
      begin: entries => events.push(`begin ${entries.map(e => e.id).join(',')}`),
      update: status => {
        updates.push(status);
        events.push(`${status.id} ${status.state}`);
      },
      end: statuses => events.push(`end ${statuses.length}`),
    },
    token,
    proven: options.proven ?? new Map(),
    reprove: options.reprove,
  };
  return { ctx, updates, asked, secretReads, events, token };
}

function states(statuses: EntryStatus[]): Record<string, string> {
  return Object.fromEntries(statuses.map(s => [s.id, s.state]));
}

suite('runSetup: dependency order', () => {
  const ids = (entries: Entry[]) => entries.map(e => e.id);

  test('keeps the written order when it already works', () => {
    assert.deepStrictEqual(ids(inDependencyOrder([
      { id: 'a' }, { id: 'b', dependsOn: ['a'] }, { id: 'c' },
    ])), ['a', 'b', 'c']);
  });

  test('moves what an entry depends on ahead of it', () => {
    assert.deepStrictEqual(ids(inDependencyOrder([
      { id: 'gradle', dependsOn: ['jdk'] }, { id: 'other' }, { id: 'jdk' },
    ])), ['jdk', 'gradle', 'other']);
  });

  test('leaves ids that name no entry for the runner to report', () => {
    assert.deepStrictEqual(ids(inDependencyOrder([{ id: 'a', dependsOn: ['missing'] }])), ['a']);
  });

  test('one entry comes with what it depends on, directly or not, and nothing else', () => {
    assert.deepStrictEqual(ids(withDependencies([
      { id: 'jdk' }, { id: 'other' }, { id: 'gradle', dependsOn: ['jdk', 'missing'] }, { id: 'app', dependsOn: ['gradle'] },
    ], 'app')), ['jdk', 'gradle', 'app']);
  });

  test('names the loop when entries depend on each other', () => {
    assert.throws(() => inDependencyOrder([
      { id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['c'] }, { id: 'c', dependsOn: ['a'] },
    ]), /in a loop: a → b → c → a/);
  });
});

suite('runSetup: running entries', function () {
  this.timeout(20_000);
  let folder: string;
  setup(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-setup-'));
  });
  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));
  const exists = (name: string) => fs.existsSync(path.join(folder, name));

  test('shows each command, its output and how it ended, with secrets masked', async () => {
    const { ctx } = context(folder, { secrets: { 'dev/token': 's3cr3t-value' } });
    const seen: string[] = [];
    ctx.output = {
      commandStarted: (entry, step) => seen.push(`start ${entry.id} ${step}`),
      commandLine: line => seen.push(`  ${line}`),
      commandEnded: result => seen.push(`end ${result.exitCode}`),
    };
    await runSetup([{
      id: 'tool', secrets: { TOKEN: 'dev/token' },
      check: { posix: `echo "token $TOKEN"; test -f tool`, windows: `"token $env:TOKEN"; if (-not (Test-Path tool)) { exit 1 }` },
      fix: touch('tool'),
    }], ctx);
    assert.deepStrictEqual(seen, [
      'start tool check', '  token ***', 'end 1',
      'start tool fix', 'end 0',
      'start tool check', '  token ***', 'end 0',
    ]);
  });

  test('an entry already in place is proved and ready, and its fix does not run', async () => {
    fs.writeFileSync(path.join(folder, 'tool'), '');
    const { ctx, events } = context(folder);
    const result = await runSetup([
      { id: 'tool', check: fileExists('tool'), fix: touch('fix-ran'), prove: touch('proved') },
    ], ctx);

    assert.deepStrictEqual(result, [{ id: 'tool', title: 'tool', state: 'ready' }]);
    assert.deepStrictEqual(events, ['begin tool', 'tool checking', 'tool proving', 'tool ready', 'end 1']);
    assert.ok(exists('proved'));
    assert.ok(!exists('fix-ran'));
  });

  test('by default a fix runs without asking', async () => {
    const { ctx, events } = context(folder);
    const result = await runSetup([{ id: 'tool', title: 'The tool', check: fileExists('tool'), fix: touch('tool') }], ctx);

    assert.deepStrictEqual(result, [{ id: 'tool', title: 'The tool', state: 'ready' }]);
    assert.deepStrictEqual(events, ['begin tool', 'tool checking', 'tool fixing', 'tool checking', 'tool ready', 'end 1']);
    assert.ok(exists('tool'));
  });

  test('with asking turned on, a fix asks first, showing the exact command', async () => {
    const { ctx, asked } = context(folder, { answer: true });
    const result = await runSetup([{ id: 'tool', check: fileExists('tool'), fix: touch('tool') }], ctx);

    assert.strictEqual(result[0].state, 'ready');
    assert.deepStrictEqual(asked, [process.platform === 'win32'
      ? 'tool: New-Item -ItemType File -Force tool | Out-Null'
      : 'tool: touch tool']);
  });

  test('with asking turned on, a declined fix does not run, and what waits for it is skipped', async () => {
    const { ctx } = context(folder, { answer: false });
    const result = await runSetup([
      { id: 'tool', check: fileExists('tool'), fix: touch('tool'), failMessage: 'Install the tool.' },
      { id: 'after', check: 'exit 0', dependsOn: ['tool'] },
    ], ctx);

    assert.deepStrictEqual(states(result), { tool: 'failed', after: 'skipped' });
    assert.ok(!exists('tool'));
    assert.match(result[0].detail!, /^Its check failed, and you chose not to run the fix\.\nInstall the tool\./);
    assert.strictEqual(result[1].detail, 'Waits for tool, which is not ready.');
    assert.strictEqual(result[1].because, 'dependency-missing');
  });

  test('a failed check with no fix fails with the message and output', async () => {
    const { ctx } = context(folder);
    const result = await runSetup([{ id: 'vpn', check: fail('not-connected'), failMessage: 'Connect to the VPN.' }], ctx);
    assert.strictEqual(result[0].state, 'failed');
    assert.strictEqual(result[0].detail,
      'Its check failed and it has no fix.\nConnect to the VPN.\nOutput:\nnot-connected');
  });

  test('a fix that fails, or that leaves the check failing, fails the entry', async () => {
    const { ctx } = context(folder);
    const result = await runSetup([
      { id: 'broken-fix', check: fileExists('a'), fix: fail('fix-broke') },
      { id: 'useless-fix', check: fileExists('b'), fix: touch('c') },
    ], ctx);

    assert.deepStrictEqual(states(result), { 'broken-fix': 'failed', 'useless-fix': 'failed' });
    assert.match(result[0].detail!, /^Its fix failed\.\nOutput:\nfix-broke$/);
    assert.match(result[1].detail!, /^Its fix ran, but its check still fails\./);
  });

  test('a failed prove fails the entry', async () => {
    const { ctx } = context(folder);
    const result = await runSetup([{ id: 'svc', check: 'exit 0', prove: fail('no-answer') }], ctx);
    assert.strictEqual(result[0].state, 'failed');
    assert.match(result[0].detail!, /^It is in place, but its test of whether it works failed\.\nOutput:\nno-answer$/);
  });

  test('an entry depending on an unknown id is skipped and says why', async () => {
    const { ctx } = context(folder);
    const result = await runSetup([{ id: 'app', check: 'exit 0', dependsOn: ['org-proxy'] }], ctx);
    assert.strictEqual(result[0].state, 'skipped');
    assert.strictEqual(result[0].detail, 'Depends on "org-proxy", which is not in the setup plan.');
    assert.strictEqual(result[0].because, 'dependency-missing');
  });

  test('runs entries in dependency order and reports them in that order', async () => {
    const { ctx, events } = context(folder);
    const result = await runSetup([
      { id: 'gradle', check: 'exit 0', dependsOn: ['jdk'] },
      { id: 'jdk', check: 'exit 0' },
    ], ctx);
    assert.deepStrictEqual(result.map(s => s.id), ['jdk', 'gradle']);
    assert.strictEqual(events[0], 'begin jdk,gradle');
  });

  test('a preset problem fails that entry only', async () => {
    const { ctx } = context(folder);
    const result = await runSetup([
      { id: 'jdk', uses: 'jdk' },
      { id: 'other', check: 'exit 0' },
    ], ctx);
    assert.deepStrictEqual(states(result), { jdk: 'failed', other: 'ready' });
    assert.match(result[0].detail!, /needs "with: \{ version/);
  });

  test('secrets are read once, passed to every command, and hidden in the output', async () => {
    const { ctx, secretReads } = context(folder, { secrets: { 'dev/token': 'tok-12345' } });
    const showToken: Command = { posix: 'echo "token is $TOKEN"; exit 1', windows: 'Write-Output "token is $env:TOKEN"; exit 1' };
    const result = await runSetup([{
      id: 'svc',
      secrets: { TOKEN: 'dev/token' },
      check: { posix: 'test "$TOKEN" = tok-12345', windows: 'if ($env:TOKEN -ne "tok-12345") { exit 1 }' },
      prove: showToken,
    }], ctx);

    assert.deepStrictEqual(secretReads, [{ TOKEN: 'dev/token' }]);
    assert.strictEqual(result[0].state, 'failed', 'the check saw the secret, then the prove failed on purpose');
    assert.match(result[0].detail!, /token is \*\*\*$/);
    assert.ok(!result[0].detail!.includes('tok-12345'));
  });

  test('a missing secret fails the entry before any command runs', async () => {
    const { ctx } = context(folder);
    const result = await runSetup([
      { id: 'svc', secrets: { TOKEN: 'dev/none' }, check: touch('ran'), failMessage: 'Ask for access.' },
    ], ctx);
    assert.strictEqual(result[0].state, 'failed');
    assert.strictEqual(result[0].detail, 'No value for TOKEN in the secret store.\nAsk for access.');
    assert.ok(!exists('ran'));
  });

  test('Cancel stops the running command and skips the rest', async () => {
    const { ctx, token } = context(folder);
    setTimeout(() => (token.isCancellationRequested = true), 300);
    const result = await runSetup([
      { id: 'quick', check: 'exit 0' },
      { id: 'slow', check: { posix: 'sleep 30', windows: 'Start-Sleep 30' } },
      { id: 'later', check: 'exit 0' },
    ], ctx);
    assert.deepStrictEqual(states(result), { quick: 'ready', slow: 'skipped', later: 'skipped' });
    assert.strictEqual(result[2].detail, 'Setup was cancelled.');
    assert.strictEqual(result[1].because, 'cancelled', 'stopped part way');
    assert.strictEqual(result[2].because, 'cancelled', 'never started');
  });
});

suite('runSetup: proving once', function () {
  this.timeout(20_000);
  let folder: string;
  setup(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-proven-'));
  });
  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));
  const exists = (name: string) => fs.existsSync(path.join(folder, name));

  const entry: Entry = { id: 'tool', check: touch('checked'), prove: touch('proved'), secrets: { T: 'dev/t' } };

  test('a proven entry is remembered by its definition', async () => {
    const proven = new Map<string, string>();
    const { ctx } = context(folder, { proven, secrets: { 'dev/t': 'x' } });
    await runSetup([entry], ctx);
    assert.deepStrictEqual([...proven], [['tool', definitionHash(entry)]]);
  });

  test('an entry proven earlier is ready without running anything or reading secrets', async () => {
    const proven = new Map([['tool', definitionHash(entry)]]);
    const { ctx, events, secretReads } = context(folder, { proven });
    const result = await runSetup([entry], ctx);

    assert.deepStrictEqual(result, [{ id: 'tool', title: 'tool', state: 'ready', detail: 'Proven earlier.', because: 'proven-earlier' }]);
    assert.deepStrictEqual(events, ['begin tool', 'tool ready', 'end 1']);
    assert.deepStrictEqual(secretReads, []);
    assert.ok(!exists('checked') && !exists('proved'));
  });

  test('an entry whose commands changed runs again', async () => {
    const proven = new Map([['tool', definitionHash(entry)]]);
    const { ctx } = context(folder, { proven, secrets: { 'dev/t': 'x' } });
    await runSetup([{ ...entry, prove: touch('proved-again') }], ctx);
    assert.ok(exists('checked') && exists('proved-again'));
  });

  test('editing only the title or messages does not', () => {
    assert.strictEqual(definitionHash({ ...entry, title: 'New title', failMessage: 'New message', troubleshooting: 'Tip' }),
      definitionHash(entry));
    assert.notStrictEqual(definitionHash({ ...entry, env: { A: '1' } }), definitionHash(entry));
  });

  test('a preset entry is remembered by the commands the preset fills in', () => {
    const jdk21: Entry = { id: 'jdk', uses: 'jdk', with: { version: '21' } };
    assert.notStrictEqual(definitionHash(jdk21), definitionHash({ ...jdk21, with: { version: '17' } }));
  });

  test('asking to prove again runs every entry', async () => {
    const proven = new Map([['tool', definitionHash(entry)]]);
    const { ctx } = context(folder, { proven, reprove: true, secrets: { 'dev/t': 'x' } });
    const result = await runSetup([entry], ctx);
    assert.strictEqual(result[0].state, 'ready');
    assert.strictEqual(result[0].detail, undefined);
    assert.ok(exists('proved'));
  });

  test('asking to prove one entry again leaves the others proven', async () => {
    const other: Entry = { id: 'other', check: touch('other-checked') };
    const proven = new Map([['tool', definitionHash(entry)], ['other', definitionHash(other)]]);
    const { ctx } = context(folder, { proven, reprove: new Set(['tool']), secrets: { 'dev/t': 'x' } });
    const result = await runSetup([other, entry], ctx);
    assert.deepStrictEqual(result.map(r => r.because), ['proven-earlier', undefined]);
    assert.ok(exists('proved') && !exists('other-checked'));
  });

  test('an entry that fails when proved again is forgotten', async () => {
    const failing: Entry = { id: 'tool', check: 'exit 0', prove: fail('broken-now') };
    const proven = new Map([['tool', definitionHash(failing)]]);
    const { ctx } = context(folder, { proven, reprove: true });
    await runSetup([failing], ctx);
    assert.strictEqual(proven.has('tool'), false);
  });
});
