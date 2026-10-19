import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Entry } from '../../manifest/manifest';
import { headingLine, isStale, sectionSha, sectionShaOfFile, sectionText, shaOf } from '../../manifest/sectionSha';
import { findStale, staleMessage, updatePrompt } from '../../manifest/staleCheck';
import { SHOW_SECTION, StaleActions, UPDATE_SETUP_STEPS, notifyStale } from '../../report/staleNotice';
import { holdWhileBusy, whenQuiet } from '../../util/whenQuiet';
import { fake } from './vscode.fake';

const README = [
  '# App',
  'About it.',
  '## Run locally',
  'Install rbenv.',
  '```',
  '# Separating the create and migrate tasks',
  'bundle exec rake db:create',
  '```',
  '### Fixing issues',
  'brew install cmake',
  '## Run in Docker',
  'docker-compose up',
].join('\n');

suite('README sections', () => {
  test('a section runs to the next heading of the same or higher level', () => {
    assert.strictEqual(sectionText(README, '## Run locally'), [
      'Install rbenv.', '```', '# Separating the create and migrate tasks', 'bundle exec rake db:create', '```',
      '### Fixing issues', 'brew install cmake',
    ].join('\n'));
    assert.strictEqual(sectionText(README, '### Fixing issues'), 'brew install cmake');
  });

  test('a # line inside a code block is not a heading', () => {
    assert.ok(sectionText(README, '## Run locally')!.includes('bundle exec rake db:create'));
    assert.strictEqual(sectionText(README, '# Separating the create and migrate tasks'), undefined);
  });

  test('a missing heading has no section', () => {
    assert.strictEqual(sectionText(README, '## Deploy'), undefined);
    assert.strictEqual(sectionSha(README, '## Deploy'), undefined);
    assert.strictEqual(sectionText(README, 'not a heading'), undefined);
  });

  test('a SHA is 8 hex characters, the same for Windows and Linux line endings', () => {
    assert.match(shaOf('text'), /^[0-9a-f]{8}$/);
    assert.strictEqual(sectionSha(README.replace(/\n/g, '\r\n'), '## Run locally'), sectionSha(README, '## Run locally'));
  });

  test('a value is stale when its section changed or is gone, and only then', () => {
    const from = { source: 'guessed' as const, file: 'README.md', section: '## Run locally', sha256: sectionSha(README, '## Run locally') };
    assert.strictEqual(isStale(from, README), false);
    assert.strictEqual(isStale(from, README.replace('Install rbenv.', 'Install asdf.')), true);
    assert.strictEqual(isStale(from, README.replace('## Run locally', '## Running')), true);
    assert.strictEqual(isStale(from, README.replace('docker-compose up', 'podman compose up')), false, 'another section');
    assert.strictEqual(isStale({ source: 'person' }, ''), false, 'no file named');
  });
});

const RST = [
  '==========',
  'Oscar docs',
  '==========',
  'About it.',
  '',
  'Setting up the development environment',
  '======================================',
  '',
  'Install Python. Then run::',
  '',
  '    make install',
  '    Not a title',
  '    -----------',
  '',
  'Fixing issues',
  '-------------',
  'brew install libpq',
  '',
  'Running the tests',
  '=================',
  'make test',
].join('\n');

suite('reStructuredText sections', () => {
  const file = 'docs/setup.rst';

  test('a section runs to the next title of the same or higher level', () => {
    assert.strictEqual(sectionText(RST, 'Setting up the development environment', file), [
      'Install Python. Then run::', '', '    make install', '    Not a title', '    -----------', '',
      'Fixing issues', '-------------', 'brew install libpq',
    ].join('\n'));
    assert.strictEqual(sectionText(RST, 'Fixing issues', file), 'brew install libpq');
    assert.strictEqual(sectionText(RST, 'Running the tests', file), 'make test');
  });

  test('levels follow the order the file first uses each underline', () => {
    // The overline title comes first, so it is level 1. A plain = underline is another
    // style, level 2, so the = titles below stay inside it.
    assert.ok(sectionText(RST, 'Oscar docs', file)!.endsWith('make test'));
    // Here - comes before =, so a = title is lower and stays inside the - section.
    const flipped = ['Top', '---', 'a', '', 'Inner', '=====', 'b', '', 'Next', '----', 'c'].join('\n');
    assert.strictEqual(sectionText(flipped, 'Top', file), ['a', '', 'Inner', '=====', 'b'].join('\n'));
  });

  test('finds the line of a title, with or without an overline', () => {
    assert.strictEqual(headingLine(RST, 'Oscar docs', file), 1);
    assert.strictEqual(headingLine(RST, 'Setting up the development environment', file), 5);
  });

  test('an underline-looking line in a literal block is not a title', () => {
    assert.strictEqual(sectionText(RST, 'Not a title', file), undefined);
    assert.strictEqual(headingLine(RST, 'Not a title', file), undefined);
  });

  test('a missing or Markdown-style title has no section', () => {
    assert.strictEqual(sectionText(RST, 'Deploying', file), undefined);
    assert.strictEqual(sectionText(RST, '## Running the tests', file), undefined);
    assert.strictEqual(sectionText(RST, 'Running the tests', 'README.md'), undefined, 'read as Markdown');
  });

  test('a value is stale when its rst section changed', () => {
    const from = { source: 'guessed' as const, file, section: 'Fixing issues', sha256: sectionSha(RST, 'Fixing issues', file) };
    assert.match(from.sha256!, /^[0-9a-f]{8}$/);
    assert.strictEqual(isStale(from, RST), false);
    assert.strictEqual(isStale(from, RST.replace('libpq', 'postgresql')), true);
    assert.strictEqual(isStale(from, RST.replace('make test', 'tox')), false, 'another section');
  });

  test('the Markdown SHA is unchanged', () => {
    assert.strictEqual(sectionSha(README, '## Run locally'), '8dcf2c5c');
    assert.strictEqual(sectionSha(README, '## Run locally', 'README.md'), '8dcf2c5c');
  });

  test('the error for a missing rst title names the rst form', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-rst-'));
    try {
      fs.writeFileSync(path.join(folder, 'setup.rst'), RST);
      assert.strictEqual(await sectionShaOfFile(folder, 'setup.rst', 'Fixing issues'), sectionSha(RST, 'Fixing issues', file));
      await assert.rejects(sectionShaOfFile(folder, 'setup.rst', '## Fixing issues'),
        /There is no title "## Fixing issues" in setup\.rst\. Give the title exactly as written, without its underline/);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

suite('README check', () => {
  let folder: string;
  let entries: Entry[];
  setup(() => {
    fake.reset();
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-readme-'));
    fs.writeFileSync(path.join(folder, 'README.md'), README);
    const at = (section: string, source: 'guessed' | 'person') =>
      ({ source, file: 'README.md', section, sha256: sectionSha(README, section) });
    entries = [
      { id: 'rbenv', check: 'x', from: at('## Run locally', 'guessed') },
      { id: 'docker', check: 'x', from: at('## Run in Docker', 'person') },
      { id: 'plain', check: 'x' },
    ];
  });
  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));
  const edit = (from: string, to: string) =>
    fs.writeFileSync(path.join(folder, 'README.md'), README.replace(from, to));

  test('finds the entries whose README section changed', async () => {
    assert.deepStrictEqual(await findStale(entries, folder), []);
    edit('docker-compose up', 'podman compose up');
    assert.deepStrictEqual((await findStale(entries, folder)).map(e => e.id), ['docker']);
  });

  test('a file outside the project, or missing, counts as changed but is never read', async () => {
    const outside: Entry = { id: 'x', check: 'x', from: { source: 'guessed', file: '../../etc/hosts', section: '# x', sha256: 'abcdef12' } };
    const missing: Entry = { id: 'y', check: 'x', from: { source: 'guessed', file: 'NOPE.md', section: '# x', sha256: 'abcdef12' } };
    assert.deepStrictEqual((await findStale([outside, missing], folder)).map(e => e.id), ['x', 'y']);
  });

  /** Actions that record what was asked of them. */
  const recording = () => {
    const prompts: string[] = [];
    const opened: string[] = [];
    const actions: StaleActions = {
      openChat: async p => void prompts.push(p),
      openSection: async (file, section) => void opened.push(`${file} ${section}`),
    };
    return { actions, prompts, opened };
  };

  test('one step read from the README: which section changed, and which step may be out of date', async () => {
    const { actions } = recording();
    await notifyStale([{ ...entries[0], title: 'rbenv, to install Ruby' }], actions);
    assert.deepStrictEqual(fake.messages, [{
      kind: 'info',
      message: 'README.md section "Run locally" has changed. The setup step "rbenv, to install Ruby" is based on it and may be out of date. '
        + 'Update Setup Steps has Copilot bring it up to date.',
      items: [UPDATE_SETUP_STEPS, SHOW_SECTION],
    }]);
  });

  test('a team choice asks the person to check they still agree', () => {
    assert.strictEqual(staleMessage([{ ...entries[1], title: 'Volta' }]),
      'README.md section "Run in Docker" has changed. The setup step "Volta" records a team choice written there. Check they still agree.');
  });

  test('several steps and sections are listed together', () => {
    const steps: Entry[] = [
      { id: 'a', title: 'A', check: 'x', from: { source: 'guessed', file: 'README.md', section: '## One', sha256: 'x' } },
      { id: 'b', title: 'B', check: 'x', from: { source: 'person', file: 'README.md', section: '## One', sha256: 'x' } },
      { id: 'c', title: 'C', check: 'x', from: { source: 'guessed', file: 'README.md', section: '## Two', sha256: 'x' } },
    ];
    assert.strictEqual(staleMessage(steps.slice(0, 2)),
      'README.md section "One" has changed. 2 setup steps are based on it and may be out of date: "A", "B".');
    assert.strictEqual(staleMessage(steps),
      'README.md sections "One" and "Two" have changed. 3 setup steps are based on them and may be out of date: "A", "B", "C".');
    assert.strictEqual(staleMessage([steps[0], { ...steps[2], from: { ...steps[2].from!, file: 'docs/setup.md' } }]),
      'These README sections have changed: README.md "One", docs/setup.md "Two". 2 setup steps are based on them and may be out of date: "A", "C".');
  });

  test('Update Setup Steps has Copilot save the updates, asking only when a team choice disagrees', async () => {
    fake.answer = UPDATE_SETUP_STEPS;
    const { actions, prompts } = recording();
    await notifyStale([entries[1]], actions);

    assert.strictEqual(prompts[0], updatePrompt([entries[1]]));
    assert.match(prompts[0], /^\/onboarding-text-reader These README sections have changed/);
    assert.match(prompts[0], /- "docker" \(docker\): README\.md section "## Run in Docker", a team choice/);
    assert.match(prompts[0], /with the new SHA and date, and save\./);
    assert.match(prompts[0], /For a team choice, update only the SHA and date when the section still agrees with the step\./);
    assert.match(prompts[0], /Ask me only if they now disagree\. Then tell me in a few lines what you changed\.$/);
  });

  test('Show Section opens the changed section', async () => {
    fake.answer = SHOW_SECTION;
    const { actions, opened } = recording();
    await notifyStale([entries[0]], actions);
    assert.deepStrictEqual(opened, ['README.md ## Run locally']);
  });

  test('the same change is shown once', async () => {
    const shown = new Set<string>();
    const { actions } = recording();
    await notifyStale([entries[0]], actions, shown);
    await notifyStale([entries[0]], actions, shown);
    assert.strictEqual(fake.messages.length, 1);
  });

  test('nothing changed, nothing shown', async () => {
    assert.strictEqual(staleMessage([]), '');
    await notifyStale([], recording().actions);
    assert.deepStrictEqual(fake.messages, []);
  });
});

suite('README check: timing and finding the section', () => {
  test('waits until calls stop, then runs once', async () => {
    let runs = 0;
    const soon = whenQuiet(() => runs++, 30);
    soon();
    await new Promise(r => setTimeout(r, 10));
    soon();
    soon();
    await new Promise(r => setTimeout(r, 15));
    assert.strictEqual(runs, 0, 'still being called');
    await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(runs, 1);
  });

  test('cancel stops a pending run', async () => {
    let runs = 0;
    const soon = whenQuiet(() => runs++, 10);
    soon();
    soon.cancel();
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(runs, 0);
  });

  test('with no agent busy, a held run happens at once', () => {
    let runs = 0;
    holdWhileBusy(50).run(() => runs++);
    assert.strictEqual(runs, 1);
  });

  test('while an agent is busy, the run waits until it has been quiet for the hold', async () => {
    let runs = 0;
    const hold = holdWhileBusy(30);
    hold.busy();
    hold.run(() => runs++);
    await new Promise(r => setTimeout(r, 15));
    hold.busy();
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(runs, 0, 'the agent was busy again');
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(runs, 1);
  });

  test('a held run happens once, and cancel drops it', async () => {
    let runs = 0;
    const hold = holdWhileBusy(10);
    hold.busy();
    hold.run(() => runs++);
    hold.run(() => runs++);
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(runs, 1);
    hold.busy();
    hold.run(() => runs++);
    hold.cancel();
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(runs, 1);
  });

  test('finds the line of a heading, skipping code blocks', () => {
    assert.strictEqual(headingLine(README, '## Run locally'), 2);
    assert.strictEqual(headingLine(README, '## Run in Docker'), 10);
    assert.strictEqual(headingLine(README, '# Separating the create and migrate tasks'), undefined);
  });
});
