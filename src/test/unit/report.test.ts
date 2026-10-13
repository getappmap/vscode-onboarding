import * as assert from 'assert';
import * as vscode from 'vscode';
import type { Entry } from '../../manifest/manifest';
import { ASK_COPILOT, EntryStatus, SetupReport, rowsBeforeRun } from '../../report/report';
import { definitionHash } from '../../setup/runSetup';
import { fake } from './vscode.fake';

const jdk: Entry = { id: 'jdk', title: 'Java 21', check: 'java -version' };
const gradle: Entry = { id: 'gradle', check: 'gradle -v', dependsOn: ['jdk'] };

/** Lets the summary message's .then() run. */
const settle = () => new Promise(resolve => setImmediate(resolve));

suite('Report: rows from the status file', () => {
  test('each entry shows its last result; one never run is not checked yet', () => {
    const rows = rowsBeforeRun([gradle, jdk, { id: 'new', check: 'x' }], {
      jdk: {
        title: 'Java 21', state: 'ready', detail: 'Proven earlier.', because: 'proven-earlier',
        proven: definitionHash(jdk), proven_at: '2026-10-12T09:00:00.000Z',
      },
      gradle: { title: 'gradle', state: 'failed', detail: 'Its check failed.' },
    });

    assert.deepStrictEqual(rows, [
      { id: 'jdk', title: 'Java 21', state: 'ready', detail: 'Proven earlier.', because: 'proven-earlier', provenAt: '2026-10-12T09:00:00.000Z' },
      { id: 'gradle', title: 'gradle', state: 'failed', detail: 'Its check failed.' },
      { id: 'new', title: 'new', state: 'unchecked' },
    ]);
  });

  test('an entry whose definition changed since it was proven is not checked yet', () => {
    const rows = rowsBeforeRun([{ ...jdk, check: 'java --version' }],
      { jdk: { title: 'Java 21', state: 'ready', proven: definitionHash(jdk) } });
    assert.strictEqual(rows[0].state, 'unchecked');
  });

  test('a run that was cut off part way is not shown as running', () => {
    const rows = rowsBeforeRun([jdk], { jdk: { title: 'Java 21', state: 'checking' } });
    assert.strictEqual(rows[0].state, 'unchecked');
  });

  test('the title comes from the manifest, not the file', () => {
    const rows = rowsBeforeRun([jdk], { jdk: { title: 'Old title', state: 'failed' } });
    assert.strictEqual(rows[0].title, 'Java 21');
  });

  test('a dependency loop leaves the written order, for setup to report', () => {
    const rows = rowsBeforeRun([{ id: 'a', check: 'x', dependsOn: ['b'] }, { id: 'b', check: 'x', dependsOn: ['a'] }], {});
    assert.deepStrictEqual(rows.map(r => r.id), ['a', 'b']);
  });
});

suite('Report: during and after a run', () => {
  let report: SetupReport;
  let progress: { message?: string; increment?: number }[];
  let changes: number;
  setup(() => {
    fake.reset();
    report = new SetupReport();
    progress = [];
    changes = 0;
    report.onDidChangeTreeData(() => changes++);
    report.attachProgress({ report: value => progress.push(value) });
  });

  test('begin shows every entry waiting', () => {
    report.begin([jdk, gradle]);
    assert.deepStrictEqual(report.getChildren(), [
      { id: 'jdk', title: 'Java 21', state: 'waiting' },
      { id: 'gradle', title: 'gradle', state: 'waiting' },
    ]);
    assert.strictEqual(changes, 1);
  });

  test('updates change the row and the progress message', () => {
    report.begin([jdk, gradle]);
    report.update({ id: 'jdk', title: 'Java 21', state: 'checking' });
    report.update({ id: 'jdk', title: 'Java 21', state: 'ready' });
    report.update({ id: 'gradle', title: 'gradle', state: 'fixing' });

    assert.deepStrictEqual(progress, [
      { message: 'Checking Java 21, 1 of 2' },
      { increment: 50 },
      { message: 'Fixing gradle, 2 of 2' },
    ]);
    assert.strictEqual(report.getChildren()[1].state, 'fixing');
  });

  test('an update for a row not shown is ignored', () => {
    report.begin([jdk]);
    report.update({ id: 'other', title: 'other', state: 'ready' });
    assert.deepStrictEqual(report.getChildren().map(r => r.id), ['jdk']);
  });

  test('when all are ready, a short summary', () => {
    report.end([{ id: 'jdk', title: 'Java 21', state: 'ready' }]);
    assert.deepStrictEqual(fake.messages, [{ kind: 'info', message: 'Onboarding complete: 1 of 1 ready.', items: [] }]);
  });

  test('when some are not, a warning that offers Copilot', async () => {
    fake.answer = ASK_COPILOT;
    const statuses: EntryStatus[] = [
      { id: 'jdk', title: 'Java 21', state: 'ready' },
      { id: 'gradle', title: 'gradle', state: 'skipped', detail: 'Waits for jdk.' },
    ];
    report.end(statuses);
    await settle();

    assert.deepStrictEqual(fake.messages, [{ kind: 'warning', message: 'Onboarding: 1 of 2 ready.', items: [ASK_COPILOT] }]);
    assert.deepStrictEqual(fake.executed, ['onboarding.askCopilot']);
    assert.deepStrictEqual(report.notReady().map(s => s.id), ['gradle']);
  });

  test('Ask Copilot covers problems, not entries never checked', () => {
    report.show([
      { id: 'a', title: 'a', state: 'unchecked' },
      { id: 'b', title: 'b', state: 'failed' },
      { id: 'c', title: 'c', state: 'skipped' },
      { id: 'd', title: 'd', state: 'ready' },
    ]);
    assert.deepStrictEqual(report.notReady().map(s => s.id), ['b', 'c']);
  });

  test('closing the warning does nothing more', async () => {
    report.end([{ id: 'jdk', title: 'Java 21', state: 'failed' }]);
    await settle();
    assert.deepStrictEqual(fake.executed, []);
  });

  test('progress stops after the run ends', () => {
    report.begin([jdk]);
    report.end([{ id: 'jdk', title: 'Java 21', state: 'ready' }]);
    report.update({ id: 'jdk', title: 'Java 21', state: 'checking' });
    assert.ok(!progress.some(p => p.message?.startsWith('Checking')));
  });
});

suite('Report: rows in the list', () => {
  const report = new SetupReport();

  test('a failed row shows its state, icon and details', () => {
    const item = report.getTreeItem({ id: 'jdk', title: 'Java 21', state: 'failed', detail: 'Its check failed.\nOutput:\nno java' });
    assert.strictEqual(item.label, 'Java 21');
    assert.strictEqual(item.id, 'jdk');
    assert.strictEqual(item.description, 'Failed');
    assert.strictEqual(item.contextValue, 'failed');
    assert.deepStrictEqual(item.iconPath, new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed')));
    assert.strictEqual((item.tooltip as vscode.MarkdownString).value,
      '**Java 21**: Failed\n\n\n```text\nIts check failed.\nOutput:\nno java\n```\n');
  });

  test('a ready row just says Ready; when it was proven is in the hover', () => {
    const item = report.getTreeItem({
      id: 'jdk', title: 'Java 21', state: 'ready', because: 'proven-earlier', provenAt: '2026-10-12T09:00:00.000Z',
    });
    assert.strictEqual(item.description, 'Ready');
    assert.match((item.tooltip as vscode.MarkdownString).value, /^\*\*Java 21\*\*: Ready\. Proven .*2026.*\.$/);
    assert.deepStrictEqual(item.iconPath, new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed')));
  });

  test('a skipped row says why', () => {
    const missing = report.getTreeItem({ id: 'gradle', title: 'gradle', state: 'skipped', because: 'dependency-missing' });
    assert.strictEqual(missing.description, 'Skipped, dependency missing');
    const cancelled = report.getTreeItem({ id: 'gradle', title: 'gradle', state: 'skipped', because: 'cancelled' });
    assert.strictEqual(cancelled.description, 'Skipped, cancelled');
  });

  test('a row setup has not reached says so', () => {
    assert.strictEqual(report.getTreeItem({ id: 'jdk', title: 'Java 21', state: 'unchecked' }).description, 'Not checked yet');
    assert.strictEqual(report.getTreeItem({ id: 'jdk', title: 'Java 21', state: 'waiting' }).description, 'Waiting');
  });

  test('a running row spins', () => {
    const item = report.getTreeItem({ id: 'jdk', title: 'Java 21', state: 'proving' });
    assert.strictEqual(item.description, 'Proving');
    assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'sync~spin');
  });
});
