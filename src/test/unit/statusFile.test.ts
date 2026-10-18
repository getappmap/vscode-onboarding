import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parse } from 'yaml';
import { Status, StatusRecorder, emptyStatus, provenFrom, readStatus, statusPath, writeStatus } from '../../report/statusFile';

suite('Status file', () => {
  let folder: string;
  setup(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-status-'));
  });
  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));

  const sample: Status = {
    machine: 'laptop', platform: 'macos',
    entries: { jdk: { title: 'Java 21', state: 'ready', proven: 'abc123' } },
  };

  test('is written to .onboarding/status.yaml and read back', async () => {
    await writeStatus(folder, sample);
    assert.ok(fs.existsSync(path.join(folder, '.onboarding', 'status.yaml')));
    assert.deepStrictEqual(await readStatus(folder), sample);
  });

  test('its folder ignores itself, so it is never committed', async () => {
    await writeStatus(folder, sample);
    assert.match(fs.readFileSync(path.join(folder, '.onboarding', '.gitignore'), 'utf8'), /^\*$/m);
  });

  test('leaves a .gitignore someone changed alone', async () => {
    fs.mkdirSync(path.join(folder, '.onboarding'));
    fs.writeFileSync(path.join(folder, '.onboarding', '.gitignore'), 'status.yaml\n');
    await writeStatus(folder, sample);
    assert.strictEqual(fs.readFileSync(path.join(folder, '.onboarding', '.gitignore'), 'utf8'), 'status.yaml\n');
  });

  test('a missing or unreadable file reads as none', async () => {
    assert.strictEqual(await readStatus(folder), undefined);
    fs.mkdirSync(path.join(folder, '.onboarding'));
    fs.writeFileSync(statusPath(folder), 'not: [valid');
    assert.strictEqual(await readStatus(folder), undefined);
    fs.writeFileSync(statusPath(folder), 'just text');
    assert.strictEqual(await readStatus(folder), undefined);
  });

  test('gives runSetup the proven entries', () => {
    assert.deepStrictEqual([...provenFrom(sample)], [['jdk', 'abc123']]);
    assert.deepStrictEqual([...provenFrom(undefined)], []);
  });
});

suite('Status file: recording a run', () => {
  let folder: string;
  setup(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-recorder-'));
  });
  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));

  const clock = () => {
    let minute = 0;
    return () => new Date(Date.UTC(2026, 9, 12, 9, minute++));
  };
  const onDisk = () => parse(fs.readFileSync(statusPath(folder), 'utf8')) as Status;

  test('records each result, when it finished, and what was proven', async () => {
    const proven = new Map<string, string>();
    const recorder = new StatusRecorder(folder, emptyStatus(), proven, undefined, clock());

    recorder.begin([{ id: 'jdk', title: 'Java 21', check: 'x' }, { id: 'vpn', check: 'x' }]);
    await recorder.saved();
    assert.strictEqual(onDisk().run_finished, null, 'a run in progress shows as unfinished');
    assert.strictEqual(onDisk().entries.jdk.state, 'waiting');

    recorder.update({ id: 'jdk', title: 'Java 21', state: 'checking' });
    proven.set('jdk', 'hash-1'); // runSetup does this just before reporting ready
    recorder.update({ id: 'jdk', title: 'Java 21', state: 'ready' });
    recorder.update({ id: 'vpn', title: 'vpn', state: 'skipped', detail: 'Waits for proxy.', because: 'dependency-missing' });
    recorder.end();
    await recorder.saved();

    const status = onDisk();
    assert.strictEqual(status.run_started, '2026-10-12T09:00:00.000Z');
    assert.strictEqual(status.run_finished, '2026-10-12T09:03:00.000Z');
    assert.deepStrictEqual(status.entries, {
      jdk: {
        title: 'Java 21', state: 'ready', last_ran: '2026-10-12T09:01:00.000Z',
        proven: 'hash-1', proven_at: '2026-10-12T09:01:00.000Z',
      },
      vpn: { title: 'vpn', state: 'skipped', detail: 'Waits for proxy.', because: 'dependency-missing', last_ran: '2026-10-12T09:02:00.000Z' },
    });
    assert.strictEqual(status.platform, process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux');
  });

  test('a new run keeps what was proven, and drops entries no longer in the plan', async () => {
    const before: Status = {
      machine: 'laptop', platform: 'macos',
      entries: {
        jdk: { title: 'Java 21', state: 'ready', proven: 'hash-1', last_ran: '2026-10-01T00:00:00.000Z' },
        removed: { title: 'removed', state: 'failed' },
      },
    };
    const recorder = new StatusRecorder(folder, before, provenFrom(before));
    recorder.begin([{ id: 'jdk', title: 'Java 21', check: 'x' }]);
    await recorder.saved();

    assert.deepStrictEqual(onDisk().entries, {
      jdk: { title: 'Java 21', state: 'waiting', proven: 'hash-1', last_ran: '2026-10-01T00:00:00.000Z' },
    });
  });

  test('a run of some entries keeps the records of the others', async () => {
    const before: Status = {
      machine: 'laptop', platform: 'macos',
      entries: {
        jdk: { title: 'Java 21', state: 'ready', proven: 'hash-1' },
        vpn: { title: 'vpn', state: 'failed' },
      },
    };
    const recorder = new StatusRecorder(folder, before, provenFrom(before), undefined, undefined, true);
    recorder.begin([{ id: 'vpn', check: 'x' }]);
    await recorder.saved();

    assert.deepStrictEqual(onDisk().entries, {
      jdk: { title: 'Java 21', state: 'ready', proven: 'hash-1' },
      vpn: { title: 'vpn', state: 'waiting' },
    });
  });

  test('a failed write is reported, not hidden', async () => {
    const blocked = path.join(folder, 'blocked');
    fs.writeFileSync(blocked, 'a file where the folder should be');
    const errors: string[] = [];
    const recorder = new StatusRecorder(blocked, emptyStatus(), new Map(), err => errors.push(err.message));
    recorder.begin([]);
    await recorder.saved();
    assert.strictEqual(errors.length, 1);
  });
});
