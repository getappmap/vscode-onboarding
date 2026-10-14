import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Entry } from '../../manifest/manifest';
import { CheckEntriesTool } from '../../tools/checkEntriesTool';
import { SectionShaTool } from '../../tools/sectionShaTool';
import { sectionSha } from '../../manifest/sectionSha';
import { fake } from './vscode.fake';

type Options<T> = vscode.LanguageModelToolInvocationOptions<T>;
const options = <T>(input: T) => ({ input } as Options<T>);

/** The JSON the tool gave the agent. */
function answer(result: vscode.LanguageModelToolResult): unknown {
  return JSON.parse((result.content[0] as vscode.LanguageModelTextPart).value);
}

suite('Copilot tool: check setup entries', function () {
  this.timeout(20_000);
  let folder: string;
  setup(() => {
    fake.reset();
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-tool-'));
  });
  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));

  const entries: Entry[] = [
    { id: 'ok', title: 'Fine', check: 'echo all-good', fix: 'echo fix-ran > fixed' },
    { id: 'broken', check: 'echo missing; exit 1', fix: 'echo fix-ran > fixed' },
    { id: 'secret', check: 'exit 0', secrets: { T: 'dev/t' } },
    { id: 'bad-preset', uses: 'jdk' },
  ];
  const tool = () => new CheckEntriesTool(() => entries, vscode.Uri.file(folder));

  test('runs every check, never a fix, and reports what each found', async () => {
    assert.deepStrictEqual(answer(await tool().invoke(options({}))), [
      { id: 'ok', title: 'Fine', ready: true, output: 'all-good' },
      { id: 'broken', title: 'broken', ready: false, output: 'missing' },
      { id: 'secret', title: 'secret', ready: null,
        output: 'Not checked: its commands need secrets, which are never given to the agent. Ask the developer to run Onboarding: Run Setup.' },
      { id: 'bad-preset', title: 'bad-preset', ready: false, output: 'bad-preset: preset "jdk" needs "with: { version: ... }"' },
    ]);
    assert.ok(!fs.existsSync(path.join(folder, 'fixed')), 'no fix ran');
  });

  test('checks one entry when asked', async () => {
    assert.deepStrictEqual(answer(await tool().invoke(options({ entryId: 'ok' }))),
      [{ id: 'ok', title: 'Fine', ready: true, output: 'all-good' }]);
  });

  test('an unknown entry says which entries there are', async () => {
    await assert.rejects(tool().invoke(options({ entryId: 'nope' })),
      /There is no entry "nope"\. The entries are: ok, broken, secret, bad-preset\. Leave out entryId/);
  });

  test('refuses in a folder that is not trusted, and says what to do', async () => {
    fake.trusted = false;
    await assert.rejects(tool().invoke(options({})), /not trusted.*Ask the developer to trust it/);
  });

  test('says when there is nothing to check', async () => {
    await assert.rejects(new CheckEntriesTool(() => [], vscode.Uri.file(folder)).invoke(options({})), /has no entries/);
  });
});

suite('Copilot tool: README section SHA', () => {
  let folder: string;
  const readme = '# App\n## Run locally\nInstall Volta.\n## Other\nx\n';
  setup(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-sha-'));
    fs.writeFileSync(path.join(folder, 'README.md'), readme);
  });
  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));
  const tool = () => new SectionShaTool(vscode.Uri.file(folder));

  test('gives the same SHA as the README check', async () => {
    assert.deepStrictEqual(answer(await tool().invoke(options({ file: 'README.md', heading: '## Run locally' }))),
      { file: 'README.md', section: '## Run locally', sha256: sectionSha(readme, '## Run locally') });
  });

  test('a missing heading says how to give one', async () => {
    await assert.rejects(tool().invoke(options({ file: 'README.md', heading: 'Run locally' })),
      /There is no heading "Run locally" in README\.md\. Give the heading exactly as written, with its # marks/);
  });

  test('each call, even one that fails, tells the extension an agent is at work', async () => {
    let calls = 0;
    const counted = new SectionShaTool(vscode.Uri.file(folder), () => calls++);
    await counted.invoke(options({ file: 'README.md', heading: '## Run locally' }));
    await assert.rejects(counted.invoke(options({ file: 'NOPE.md', heading: '# x' })));
    assert.strictEqual(calls, 2);
  });

  test('a missing file, or one outside the project, is refused', async () => {
    await assert.rejects(tool().invoke(options({ file: 'NOPE.md', heading: '# x' })), /There is no file NOPE\.md/);
    await assert.rejects(tool().invoke(options({ file: '../../etc/passwd', heading: '# x' })), /is outside the project/);
  });
});
