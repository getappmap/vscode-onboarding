import * as assert from 'assert';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import type { Entry } from '../manifest/manifest';
import { PRESET_NAMES, expandPreset } from '../setup/presets';
import { runCommand } from '../setup/runCommand';

/** Runs the expanded entry's check command and says whether it passed. */
async function checkPasses(entry: Entry, cwd: string, env: Record<string, string> = {}): Promise<boolean> {
  const expanded = expandPreset(entry);
  const result = await runCommand(expanded.check!, cwd, { ...expanded.env, ...env }, undefined, { timeoutMs: 15_000 });
  return result.ok;
}

function javaMajorVersion(): number | undefined {
  // java -version writes to stderr.
  const result = spawnSync('java', ['-version'], { encoding: 'utf8' });
  const match = /version "(?:1\.)?(\d+)/.exec(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  return match ? Number(match[1]) : undefined;
}

suite('Presets: filling in commands', () => {
  test('lists the presets', () => {
    assert.deepStrictEqual([...PRESET_NAMES].sort(), ['gradle-wrapper', 'http-service', 'jdk']);
  });

  test('an entry without a preset is returned as it is', () => {
    const entry: Entry = { id: 'x', check: 'true' };
    assert.strictEqual(expandPreset(entry), entry);
  });

  test('fills in commands and passes values as environment variables', () => {
    const jdk = expandPreset({ id: 'jdk', uses: 'jdk', with: { version: '21' } });
    assert.deepStrictEqual(jdk.env, { ONBOARDING_JDK_VERSION: '21' });
    assert.ok(typeof jdk.check === 'object' && jdk.check.posix && jdk.check.windows);
    assert.ok(!('fix' in jdk), 'the jdk preset has no fix');
  });

  test("the entry's own commands and env win", () => {
    const entry = expandPreset({
      id: 'gradle', uses: 'gradle-wrapper', fix: 'make gradle', env: { EXTRA: '1' },
    });
    assert.strictEqual(entry.fix, 'make gradle');
    assert.ok(entry.check && entry.prove);
    assert.deepStrictEqual(entry.env, { EXTRA: '1' });
  });

  test('rejects an unknown preset', () => {
    assert.throws(() => expandPreset({ id: 'p', uses: 'python' }), /p: "python" is not a preset/);
  });

  test('rejects missing or unsafe values', () => {
    assert.throws(() => expandPreset({ id: 'jdk', uses: 'jdk' }), /jdk: preset "jdk" needs "with: \{ version: \.\.\. \}"/);
    assert.throws(() => expandPreset({ id: 'jdk', uses: 'jdk', with: { version: '21; rm -rf ~' } }), /must be a whole number/);
    assert.throws(() => expandPreset({ id: 'web', uses: 'http-service', with: { url: 'ftp://x' } }), /must be an http/);
  });
});

suite('Presets: running the checks', function () {
  this.timeout(30_000);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-presets-'));
  suiteTeardown(() => fs.rmSync(cwd, { recursive: true, force: true }));

  test('jdk passes at or below the installed version and fails above it', async function () {
    const installed = javaMajorVersion();
    if (installed === undefined) {
      this.skip();
    }
    assert.strictEqual(await checkPasses({ id: 'jdk', uses: 'jdk', with: { version: String(installed) } }, cwd), true);
    assert.strictEqual(await checkPasses({ id: 'jdk', uses: 'jdk', with: { version: '8' } }, cwd), true);
    assert.strictEqual(await checkPasses({ id: 'jdk', uses: 'jdk', with: { version: String(installed! + 1) } }, cwd), false);
  });

  test('jdk reads Java 8 style versions and fails when java does not answer', async function () {
    if (process.platform === 'win32') {
      this.skip(); // The fake java below is a shell script.
    }
    const bin = fs.mkdtempSync(path.join(cwd, 'bin-'));
    const fakeJava = (stderr: string, code: number) => fs.writeFileSync(path.join(bin, 'java'),
      `#!/bin/sh\necho '${stderr}' >&2\nexit ${code}\n`, { mode: 0o755 });
    const env = { PATH: `${bin}${path.delimiter}${process.env.PATH}` };

    fakeJava('openjdk version "1.8.0_392"', 0);
    assert.strictEqual(await checkPasses({ id: 'jdk', uses: 'jdk', with: { version: '8' } }, cwd, env), true);
    assert.strictEqual(await checkPasses({ id: 'jdk', uses: 'jdk', with: { version: '11' } }, cwd, env), false);

    fakeJava('Unable to locate a Java Runtime.', 1);
    assert.strictEqual(await checkPasses({ id: 'jdk', uses: 'jdk', with: { version: '8' } }, cwd, env), false);
  });

  test('gradle-wrapper passes only when gradlew is there and its Gradle is downloaded', async () => {
    const project = fs.mkdtempSync(path.join(cwd, 'project-'));
    const gradleHome = fs.mkdtempSync(path.join(cwd, 'gradle-home-'));
    const env = { GRADLE_USER_HOME: gradleHome };
    const entry: Entry = { id: 'gradle', uses: 'gradle-wrapper' };

    assert.strictEqual(await checkPasses(entry, project, env), false, 'no gradlew');

    fs.writeFileSync(path.join(project, 'gradlew'), '#!/bin/sh\n');
    fs.writeFileSync(path.join(project, 'gradlew.bat'), '@echo off\n');
    fs.mkdirSync(path.join(project, 'gradle', 'wrapper'), { recursive: true });
    fs.writeFileSync(path.join(project, 'gradle', 'wrapper', 'gradle-wrapper.properties'),
      'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.4-bin.zip\n');
    assert.strictEqual(await checkPasses(entry, project, env), false, 'Gradle not downloaded');

    fs.mkdirSync(path.join(gradleHome, 'wrapper', 'dists', 'gradle-8.14.4-bin', 'abc123', 'gradle-8.14.4'), { recursive: true });
    assert.strictEqual(await checkPasses(entry, project, env), true, 'Gradle downloaded');
  });

  test('http-service passes for any HTTP answer and fails when nothing answers', async () => {
    const server = http.createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      assert.strictEqual(await checkPasses(
        { id: 'web', uses: 'http-service', with: { url: `http://127.0.0.1:${port}/ping` } }, cwd), true);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
    assert.strictEqual(await checkPasses(
      { id: 'web', uses: 'http-service', with: { url: `http://127.0.0.1:${port}/ping` } }, cwd), false);
  });
});
