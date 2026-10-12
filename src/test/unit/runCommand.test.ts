import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { commandFor, mask, pickShell, runCommand } from '../../setup/runCommand';

const isWindows = process.platform === 'win32';

suite('runCommand: choosing what to run', () => {
  test('a plain command runs everywhere', () => {
    assert.strictEqual(commandFor('echo hi', 'win32'), 'echo hi');
    assert.strictEqual(commandFor('echo hi', 'darwin'), 'echo hi');
  });

  test('picks the windows or posix form', () => {
    const command = { windows: 'Write-Output hi', posix: 'echo hi' };
    assert.strictEqual(commandFor(command, 'win32'), 'Write-Output hi');
    assert.strictEqual(commandFor(command, 'linux'), 'echo hi');
    assert.strictEqual(commandFor(command, 'darwin'), 'echo hi');
  });

  test('no form for this computer gives undefined', () => {
    assert.strictEqual(commandFor({ posix: 'echo hi' }, 'win32'), undefined);
    assert.strictEqual(commandFor({ windows: 'Write-Output hi' }, 'linux'), undefined);
  });

  test('sh on macOS and Linux', () => {
    const shell = pickShell('linux');
    assert.strictEqual(shell.program, '/bin/sh');
    assert.deepStrictEqual(shell.args('echo "$HOME"'), ['-c', 'echo "$HOME"']);
  });

  test('PowerShell on Windows, with the script encoded and errors made fatal', () => {
    const shell = pickShell('win32');
    assert.match(shell.program, /(pwsh|powershell)\.exe$/);
    const args = shell.args('Write-Output "$env:USERNAME"');
    assert.strictEqual(args[args.length - 2], '-EncodedCommand');
    const script = Buffer.from(args[args.length - 1], 'base64').toString('utf16le');
    assert.ok(script.includes("$ErrorActionPreference = 'Stop'"));
    assert.ok(script.endsWith('Write-Output "$env:USERNAME"'));
  });
});

suite('runCommand: masking', () => {
  test('hides every copy of a secret', () => {
    assert.strictEqual(mask('token=abc123 again abc123', ['abc123']), 'token=*** again ***');
  });

  test('hides a secret over several lines, whole or line by line', () => {
    const key = '-----BEGIN KEY-----\nMIIEvQIBADANBg\n-----END KEY-----';
    assert.strictEqual(mask(`key:\n${key}\ndone`, [key]), 'key:\n***\ndone');
    assert.strictEqual(mask('...MIIEvQIBADANBg\n-----END KEY-----', [key]), '...***\n***');
  });

  test('hides a longer secret whole when it contains a shorter one', () => {
    assert.strictEqual(mask('pw: secret-long', ['secret', 'secret-long']), 'pw: ***');
  });

  test('ignores empty secrets', () => {
    assert.strictEqual(mask('nothing here', ['']), 'nothing here');
  });
});

suite('runCommand: running', function () {
  this.timeout(20_000);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-run-'));
  suiteTeardown(() => fs.rmSync(cwd, { recursive: true, force: true }));

  test('a command that succeeds', async () => {
    const result = await runCommand('echo hello', cwd, {});
    assert.deepStrictEqual(result, { ok: true, exitCode: 0, output: 'hello' });
  });

  test('a command that fails keeps its exit code and output', async () => {
    const result = await runCommand({ posix: 'echo oops >&2; exit 3', windows: '[Console]::Error.WriteLine("oops"); exit 3' }, cwd, {});
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.exitCode, 3);
    assert.strictEqual(result.output, 'oops');
  });

  test('runs in the folder it is given', async () => {
    const result = await runCommand({ posix: 'pwd -P', windows: '(Get-Location).Path' }, cwd, {});
    assert.strictEqual(result.output, fs.realpathSync(cwd));
  });

  test('passes env values to the command and masks secrets in its output', async () => {
    const result = await runCommand(
      { posix: 'echo "$GREETING $TOKEN"', windows: 'Write-Output "$env:GREETING $env:TOKEN"' },
      cwd, { GREETING: 'hi', TOKEN: 's3cr3t-value' }, undefined, { secrets: ['s3cr3t-value'] });
    assert.strictEqual(result.output, 'hi ***');
  });

  test('keeps only the last lines of output', async () => {
    const result = await runCommand(
      { posix: 'for i in 1 2 3 4 5 6; do echo line$i; done', windows: '1..6 | ForEach-Object { "line$_" }' },
      cwd, {}, undefined, { maxLines: 2 });
    assert.strictEqual(result.output, '…\nline5\nline6');
  });

  test('a command waiting for input gets end of input instead of hanging', async () => {
    const result = await runCommand(
      { posix: 'read answer; echo "got [$answer]"', windows: '$answer = [Console]::In.ReadLine(); "got [$answer]"' },
      cwd, {}, undefined, { timeoutMs: 5_000 });
    assert.strictEqual(result.stopped, undefined);
    assert.strictEqual(result.output, 'got []');
  });

  test('stops a command, and what it started, at the time limit', async () => {
    const started = Date.now();
    const result = await runCommand(
      { posix: 'sleep 30 & wait', windows: 'Start-Sleep 30' }, cwd, {}, undefined, { timeoutMs: 500 });
    assert.ok(Date.now() - started < 5_000, 'took too long to stop');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.stopped, 'timeout');
    assert.match(result.output, /Stopped after 1 second\.$/);
  });

  test('stops when cancelled', async () => {
    const token = { isCancellationRequested: false };
    setTimeout(() => (token.isCancellationRequested = true), 300);
    const result = await runCommand({ posix: 'sleep 30', windows: 'Start-Sleep 30' }, cwd, {}, token);
    assert.strictEqual(result.stopped, 'cancelled');
    assert.strictEqual(result.output, 'Cancelled.');
  });

  test('does not start when already cancelled', async () => {
    const result = await runCommand('echo never', cwd, {}, { isCancellationRequested: true });
    assert.strictEqual(result.stopped, 'cancelled');
  });

  test('says so when the entry has no command for this computer', async () => {
    const result = await runCommand(isWindows ? { posix: 'true' } : { windows: '$true' }, cwd, {});
    assert.strictEqual(result.ok, false);
    assert.match(result.output, /has no command for/);
  });
});
