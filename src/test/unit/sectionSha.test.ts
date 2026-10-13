import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Entry } from '../../manifest/manifest';
import { isStale, sectionSha, sectionText, shaOf } from '../../manifest/sectionSha';
import { UPDATE_ENTRIES, findStale, notifyStale, updatePrompt } from '../../manifest/staleCheck';
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
    assert.deepStrictEqual(await findStale(entries, vscode.Uri.file(folder)), []);
    edit('docker-compose up', 'podman compose up');
    assert.deepStrictEqual((await findStale(entries, vscode.Uri.file(folder))).map(e => e.id), ['docker']);
  });

  test('a file outside the project, or missing, counts as changed but is never read', async () => {
    const outside: Entry = { id: 'x', check: 'x', from: { source: 'guessed', file: '../../etc/hosts', section: '# x', sha256: 'abcdef12' } };
    const missing: Entry = { id: 'y', check: 'x', from: { source: 'guessed', file: 'NOPE.md', section: '# x', sha256: 'abcdef12' } };
    assert.deepStrictEqual((await findStale([outside, missing], vscode.Uri.file(folder))).map(e => e.id), ['x', 'y']);
  });

  test('a changed person value is pointed out, and the agent is told to change nothing', async () => {
    fake.answer = UPDATE_ENTRIES;
    const prompts: string[] = [];
    await notifyStale([entries[1]], async p => void prompts.push(p));

    assert.strictEqual(fake.messages[0].message,
      'The README text behind a team choice in onboarding.yaml has changed: docker. Check the entry still matches.');
    assert.strictEqual(prompts[0], updatePrompt([entries[1]]));
    assert.match(prompts[0], /^\/onboarding-text-reader /);
    assert.match(prompts[0], /- docker: README\.md "## Run in Docker" \(a person's choice\)/);
    assert.match(prompts[0], /For a person's choice, change nothing/);
  });

  test('the same change is shown once', async () => {
    const shown = new Set<string>();
    await notifyStale([entries[0]], async () => undefined, shown);
    await notifyStale([entries[0]], async () => undefined, shown);
    assert.strictEqual(fake.messages.length, 1);
    assert.strictEqual(fake.messages[0].message, 'The README text behind an entry in onboarding.yaml has changed: rbenv.');
  });

  test('nothing changed, nothing shown', async () => {
    await notifyStale([], async () => undefined);
    assert.deepStrictEqual(fake.messages, []);
  });
});
