import * as assert from 'assert';
import * as vscode from 'vscode';
import type { Entry } from '../../manifest/manifest';
import { EntryStatus, SHOW_ENTRY, SetupReport } from '../../report/report';
import { renderPage } from '../../report/statusPage';
import { STATUS_VIEW, StatusView } from '../../report/statusView';
import { WebviewPanel, fake } from './vscode.fake';

const jdk: Entry = {
  id: 'jdk', title: 'Java 21', check: 'java -version',
  failMessage: 'Install JDK 21 with `brew install temurin@21`.', troubleshooting: 'Run `which -a java`.',
};
const gradle: Entry = { id: 'gradle', check: 'gradle -v', dependsOn: ['jdk', 'gone'] };
const jdkFailed: EntryStatus = { id: 'jdk', title: 'Java 21', state: 'failed', detail: 'java: command not found' };
const gradleSkipped: EntryStatus = { id: 'gradle', title: 'gradle', state: 'skipped', because: 'dependency-missing' };

/** The text a person would read on the page: the body, without tags or the script. */
function visibleText(html: string): string {
  const body = html.slice(html.indexOf('<body>'));
  return body.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

suite('Status view: the pages', () => {
  test('the list shows each entry in order with its state, and a link to its page', () => {
    const html = renderPage({ kind: 'list', statuses: [jdkFailed, gradleSkipped] }, 'csp', 'n0nce');
    assert.strictEqual(visibleText(html),
      'Onboarding Run Setup 0 of 2 ready ✕ Java 21 Failed ⊘ gradle Skipped, dependency missing');
    assert.match(html, /data-command="entry" data-id="jdk"/);
    assert.match(html, /data-command="runSetup"/);
  });

  test('a failed entry leads with what happened and what to do, then how it works', () => {
    const html = renderPage({
      kind: 'entry',
      details: { status: jdkFailed, entry: jdk, inProjectManifest: true, dependsOn: [] },
    }, 'csp', 'n0nce');
    assert.strictEqual(visibleText(html), [
      '← All entries ✕ Java 21 Failed',
      'What happened java: command not found',
      'What to do Install JDK 21 with brew install temurin@21 .',
      'Notes from the team Run which -a java .',
      'How it works Check passes when it is in place java -version',
      'Open in onboarding.yaml Ask Copilot to Help',
    ].join(' '));
    assert.match(html, /data-command="list"/);
    assert.match(html, /data-command="openManifest" data-id="jdk"/);
    assert.match(html, /data-command="askCopilot" data-id="jdk"/);
  });

  test('an entry from the Org or Team layer says so in place of the file link', () => {
    const ready: EntryStatus = { id: 'jdk', title: 'Java 21', state: 'ready', provenAt: '2026-10-12T09:00:00.000Z' };
    const html = renderPage({
      kind: 'entry', details: { status: ready, entry: jdk, inProjectManifest: false, dependsOn: [] },
    }, 'csp', 'n0nce');
    assert.match(visibleText(html), /This entry comes from the Org or Team settings, not onboarding\.yaml\./);
    assert.match(visibleText(html), /^← All entries ✓ Java 21 Ready · proven \S/);
    assert.doesNotMatch(html, /openManifest/);
    assert.doesNotMatch(html, /askCopilot/, 'a ready entry needs no help');
  });

  test('a ready entry leads with how it works; its fail message reads as what to do if it fails', () => {
    const ready: EntryStatus = { id: 'jdk', title: 'Java 21', state: 'ready', detail: 'Proven earlier.' };
    const text = visibleText(renderPage({
      kind: 'entry', details: { status: ready, entry: jdk, inProjectManifest: true, dependsOn: [] },
    }, 'csp', 'n0nce'));
    assert.strictEqual(text, [
      '← All entries ✓ Java 21 Ready',
      'How it works Check passes when it is in place java -version',
      'If it fails Install JDK 21 with brew install temurin@21 .',
      'Notes from the team Run which -a java .',
      'Open in onboarding.yaml',
    ].join(' '));
  });

  test('how it works names the preset and shows its commands for this computer', () => {
    const entry: Entry = {
      id: 'tool', uses: 'jdk', with: { version: '21' },
      fix: { windows: 'winget install tool' }, prove: { posix: 'tool --works', windows: 'tool.exe --works' },
    };
    const status: EntryStatus = { id: 'tool', title: 'tool', state: 'unchecked' };
    const html = renderPage({ kind: 'entry', details: { status, entry, inProjectManifest: true, dependsOn: [] } }, 'csp', 'n0nce');
    const text = visibleText(html);
    assert.match(text, /How it works Uses the jdk preset \(version 21\)\. Check passes when it is in place .*java/);
    assert.match(text, process.platform === 'win32' ? /Fix puts it in place winget install tool/
      : /Fix puts it in place No command for this computer\./);
    assert.match(text, process.platform === 'win32' ? /Prove passes when it works tool\.exe --works/
      : /Prove passes when it works tool --works/);
  });

  test('text people wrote keeps its paragraphs and line breaks, and shows `backticks` as code', () => {
    const entry: Entry = { id: 'x', check: 'true', troubleshooting: 'Open a new terminal.\nThen run `volta setup`.\n\nStill broken? Ask.\n' };
    const html = renderPage({
      kind: 'entry',
      details: { status: { id: 'x', title: 'x', state: 'ready' }, entry, inProjectManifest: true, dependsOn: [] },
    }, 'csp', 'n0nce');
    assert.match(html, /<p>Open a new terminal\.<br>Then run <code>volta setup<\/code>\.<\/p>\n<p>Still broken\? Ask\.<\/p>/);
  });

  test('each entry it depends on links to its page; an unknown one says so', () => {
    const html = renderPage({
      kind: 'entry',
      details: {
        status: gradleSkipped, entry: gradle, inProjectManifest: true,
        dependsOn: [{ id: 'jdk', status: jdkFailed }, { id: 'gone' }],
      },
    }, 'csp', 'n0nce');
    assert.match(visibleText(html), /Depends on ✕ Java 21 Failed gone is not in the setup plan/);
    assert.match(html, /<li><a href="#" data-command="entry" data-id="jdk">/);
  });

  test('text from the manifest or the output cannot add markup', () => {
    const status: EntryStatus = { id: 'x', title: '<b>bold</b>', state: 'failed', detail: '<script>alert(1)</script>' };
    const html = renderPage({ kind: 'list', statuses: [status] }, 'csp', 'n0nce')
      + renderPage({ kind: 'entry', details: { status, inProjectManifest: true, dependsOn: [] } }, 'csp', 'n0nce');
    assert.doesNotMatch(html, /<b>|alert\(1\)<\/script>/);
    assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/);
  });

  test('only the page\'s own style and script run', () => {
    const html = renderPage({ kind: 'list', statuses: [] }, 'vscode-webview://abc', 'n0nce');
    assert.match(html,
      /content="default-src 'none'; style-src vscode-webview:\/\/abc 'nonce-n0nce'; script-src 'nonce-n0nce';"/);
    assert.match(html, /<style nonce="n0nce">/);
    assert.match(html, /<script nonce="n0nce">/);
    assert.doesNotMatch(html, / style="/, 'the policy blocks style attributes');
  });
});

suite('Status view: the editor tab', () => {
  let report: SetupReport;
  let view: StatusView;
  let calls: string[];
  const panel = (): WebviewPanel => fake.panels.at(-1)!;

  setup(() => {
    fake.reset();
    calls = [];
    report = new SetupReport();
    report.show([jdkFailed, gradleSkipped]);
    view = new StatusView({
      statuses: () => report.getChildren(),
      entry: id => [jdk, gradle].find(e => e.id === id),
      inProjectManifest: id => id === 'jdk',
      openInManifest: async id => void calls.push(`open ${id}`),
      askCopilot: async status => void calls.push(`ask ${status.id}`),
      runSetup: async () => void calls.push('run'),
    }, report.onDidChangeTreeData);
  });
  teardown(() => view.dispose());

  test('showing an entry opens one tab at its page; showing again reuses the tab', () => {
    view.showEntry('jdk');
    assert.strictEqual(fake.panels.length, 1);
    assert.strictEqual(panel().viewType, STATUS_VIEW);
    assert.strictEqual(panel().showOptions, vscode.ViewColumn.Active);
    assert.deepStrictEqual(panel().options, { enableScripts: true, localResourceRoots: [] });
    assert.strictEqual(panel().title, 'Onboarding: Java 21');
    assert.match(panel().webview.html, /What happened/);

    view.showList();
    assert.strictEqual(fake.panels.length, 1);
    assert.strictEqual(panel().reveals, 1);
    assert.strictEqual(panel().title, 'Onboarding');
    assert.match(visibleText(panel().webview.html), /0 of 2 ready/);
  });

  test('links on the page move between the list and the entries', async () => {
    view.showList();
    panel().send({ command: 'entry', id: 'gradle' });
    assert.strictEqual(panel().title, 'Onboarding: gradle');
    panel().send({ command: 'list' });
    assert.strictEqual(panel().title, 'Onboarding');
  });

  test('the page\'s buttons reach the extension, for known entries only', async () => {
    view.showEntry('jdk');
    for (const message of [
      { command: 'openManifest', id: 'jdk' }, { command: 'askCopilot', id: 'jdk' }, { command: 'runSetup' },
      { command: 'openManifest', id: 'nope' }, { command: 'entry', id: 'nope' },
    ]) {
      panel().send(message);
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(calls, ['open jdk', 'ask jdk', 'run']);
    assert.strictEqual(panel().title, 'Onboarding: Java 21');
  });

  test('new results show on the open page', () => {
    view.showEntry('jdk');
    report.update({ id: 'jdk', title: 'Java 21', state: 'ready' });
    assert.match(visibleText(panel().webview.html), /✓ Java 21 Ready/);
  });

  test('an entry that leaves the plan shows the list instead', () => {
    view.showEntry('gradle');
    report.show([jdkFailed]);
    assert.strictEqual(panel().title, 'Onboarding');
  });

  test('a closed tab is not drawn again; the next show opens a new one', () => {
    view.showEntry('jdk');
    panel().dispose();
    report.update({ id: 'jdk', title: 'Java 21', state: 'ready' });
    view.showList();
    assert.strictEqual(fake.panels.length, 2);
  });
});

suite('Status view: the sidebar', () => {
  test('clicking a row opens its entry page', () => {
    const item = new SetupReport().getTreeItem(jdkFailed);
    assert.deepStrictEqual(item.command, { command: SHOW_ENTRY, title: 'Show Details', arguments: ['jdk'] });
  });
});
