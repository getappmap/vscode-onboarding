import * as assert from 'assert';
import { SetupOutput } from '../../report/setupOutput';

suite('Setup output channel', () => {
  test('writes the run, each command, its output, and each result', () => {
    const lines: string[] = [];
    const out = new SetupOutput({ appendLine: line => lines.push(line) }, () => new Date(2026, 9, 13, 12, 52, 3));

    out.begin([{ id: 'ruby' }, { id: 'gems' }, { id: 'db' }]);
    out.update({ id: 'ruby', title: 'Ruby', state: 'checking' });
    out.commandStarted({ id: 'ruby' }, 'check', 'sh bin/onboarding/ruby.sh check');
    out.commandLine('ruby 3.4.9 is not 3.4.10');
    out.commandEnded({ ok: false, exitCode: 1, output: '' }, 420);
    out.commandStarted({ id: 'ruby' }, 'fix', 'rbenv install\nrbenv rehash\n');
    out.commandEnded({ ok: false, exitCode: -1, output: '', stopped: 'timeout' }, 600_000);
    out.update({ id: 'ruby', title: 'Ruby', state: 'failed', detail: 'Its fix failed.\nOutput:\n...' });
    out.update({ id: 'gems', title: 'Gems', state: 'skipped', detail: 'Waits for ruby, which is not ready.' });
    out.update({ id: 'db', title: 'DB', state: 'ready', because: 'proven-earlier' });
    out.end([
      { id: 'ruby', title: 'Ruby', state: 'failed' },
      { id: 'gems', title: 'Gems', state: 'skipped' },
      { id: 'db', title: 'DB', state: 'ready' },
    ]);

    assert.deepStrictEqual(lines, [
      '',
      '── Setup started 12:52:03, 3 steps ──',
      '▶ ruby check: sh bin/onboarding/ruby.sh check',
      '    ruby 3.4.9 is not 3.4.10',
      '  ✘ exit 1, 0.4s',
      '▶ ruby fix: rbenv install',
      '    rbenv rehash',
      '  ✘ stopped at the time limit, 600.0s',
      '✘ ruby: Its fix failed.',
      '⊘ gems: skipped. Waits for ruby, which is not ready.',
      '✔ db: ready, proven earlier',
      '── Setup finished 12:52:03: 1 ready, 2 not ready ──',
    ]);
  });
});
