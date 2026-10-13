import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  Manifest, ManifestError, combineLayers, currentPlatform, entryLine, forPlatform, parseManifest, readManifest, validateManifest,
} from '../../manifest/manifest';

/** Runs fn and returns the ManifestError it throws. */
function problemsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ManifestError, `expected a ManifestError, got ${err}`);
    return err.problems;
  }
  assert.fail('expected a ManifestError');
}

function assertProblem(problems: string[], text: string): void {
  assert.ok(problems.some(p => p.includes(text)), `no problem mentions "${text}" in:\n${problems.join('\n')}`);
}

suite('Manifest: reading', () => {
  test('reads the sample project manifest', async () => {
    const folder = vscode.Uri.file(path.join(__dirname, '..', '..', '..', 'test-fixtures', 'sample-project'));
    const manifest = await readManifest(folder);

    assert.ok(manifest);
    assert.strictEqual(manifest.team, 'payments');
    assert.deepStrictEqual(manifest.entries.map(e => e.id),
      ['jdk', 'gradle', 'artifactory-reachable', 'artifactory-credentials', 'splunk-logging']);
    assert.deepStrictEqual(manifest.mcpServers, []);

    const [jdk, , , credentials, splunk] = manifest.entries;
    assert.deepStrictEqual(jdk.with, { version: '21' });
    assert.deepStrictEqual(credentials.dependsOn, ['gradle', 'artifactory-reachable']);
    assert.deepStrictEqual(credentials.secrets, { ARTIFACTORY_TOKEN: 'dev/artifactory/token' });
    assert.strictEqual(typeof credentials.prove, 'string');
    assert.deepStrictEqual(credentials.check, {
      posix: "grep -q '^artifactoryToken=' ~/.gradle/gradle.properties",
      windows: 'if (-not (Select-String -Quiet -Pattern \'^artifactoryToken=\' -Path "$HOME\\.gradle\\gradle.properties")) { exit 1 }',
    });
    assert.deepStrictEqual(credentials.from, {
      source: 'guessed', file: 'README.md', section: '## Building', sha256: '9c2e41d0', date: '2026-10-10',
    });
    // Folded YAML (>-) joins the lines with spaces.
    assert.ok((splunk.prove as { posix: string }).posix.startsWith('curl --fail --silent --output /dev/null -d'));
  });

  test('returns undefined when the folder has no manifest', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-'));
    try {
      assert.strictEqual(await readManifest(vscode.Uri.file(empty)), undefined);
    } finally {
      fs.rmSync(empty, { recursive: true });
    }
  });

  test('an empty file is an empty manifest', () => {
    assert.deepStrictEqual(parseManifest(''), { entries: [], mcpServers: [] });
  });

  test('keeps every value as text', () => {
    const manifest = parseManifest([
      'entries:',
      '  - id: jdk',
      '    uses: jdk',
      '    with: { version: 21 }',
      '    from: { source: guessed, sha256: 01234567, date: 2026-10-10 }',
    ].join('\n'));
    assert.deepStrictEqual(manifest.entries[0].with, { version: '21' });
    assert.strictEqual(manifest.entries[0].from?.sha256, '01234567');
    assert.strictEqual(manifest.entries[0].from?.date, '2026-10-10');
  });

  test('reads a troubleshooting note', () => {
    const manifest = parseManifest([
      'entries:',
      '  - id: jdk',
      '    uses: jdk',
      '    troubleshooting: |',
      '      Usually fixed by setting JAVA_HOME.',
      '      Reinstalling the JDK does not help.',
    ].join('\n'));
    assert.strictEqual(manifest.entries[0].troubleshooting,
      'Usually fixed by setting JAVA_HOME.\nReinstalling the JDK does not help.\n');
  });

  test('reads MCP servers', () => {
    const manifest = parseManifest([
      'mcpServers:',
      '  - { name: access, url: "https://access.example.com/mcp", tokenSecret: dev/access/token }',
      '  - { name: local, command: [node, server.js] }',
    ].join('\n'));
    assert.deepStrictEqual(manifest.mcpServers, [
      { name: 'access', url: 'https://access.example.com/mcp', tokenSecret: 'dev/access/token' },
      { name: 'local', command: ['node', 'server.js'] },
    ]);
  });
});

suite('Manifest: problems', () => {
  test('reports a YAML syntax error with its line', () => {
    const problems = problemsOf(() => parseManifest('entries:\n  - id: a\n    check: [unclosed\n'));
    assertProblem(problems, 'line');
  });

  test('reports a repeated YAML key', () => {
    assertProblem(problemsOf(() => parseManifest('team: a\nteam: b\n')), 'must be unique at line 2');
  });

  test('rejects a file that is not a mapping', () => {
    assertProblem(problemsOf(() => parseManifest('- one\n- two\n')), 'must be a mapping');
  });

  test('reports every problem in one pass, naming the entry', () => {
    const problems = problemsOf(() => parseManifest([
      'colour: blue',
      'entries:',
      '  - title: no id here',
      '    check: "true"',
      '  - id: typo',
      '    chek: "true"',
      '  - id: bad-preset',
      '    uses: python',
      '  - id: bad-command',
      '    check: { linux: "true" }',
      '  - id: dup',
      '    check: "true"',
      '  - id: dup',
      '    check: "true"',
      '  - id: clash',
      '    check: "true"',
      '    env: { TOKEN: x }',
      '    secrets: { TOKEN: dev/token }',
      '  - id: stray-with',
      '    check: "true"',
      '    with: { version: "1" }',
      '  - id: self',
      '    check: "true"',
      '    dependsOn: [self]',
      '  - id: bad-env',
      '    check: "true"',
      '    env: { "MY-VAR": x }',
      '  - id: bad-from',
      '    check: "true"',
      '    from: { source: invented }',
      '  - id: "has space"',
      '    check: "true"',
      'mcpServers:',
      '  - { name: both, url: "https://x", command: [x] }',
      '  - { name: neither }',
      '  - { name: local-token, command: [node, s.js], tokenSecret: dev/x }',
    ].join('\n')));

    for (const expected of [
      'top level: unknown field "colour"',
      'entries[0]: needs an id',
      'entries[1] (typo): unknown field "chek"',
      'entries[1] (typo): needs a check command',
      'entries[2] (bad-preset).uses: "python" is not a preset',
      'entries[3] (bad-command).check: must be a command',
      'entries: id "dup" is used more than once',
      'entries[6] (clash): TOKEN is in both env and secrets',
      'entries[7] (stray-with).with: only works with "uses"',
      'entries[8] (self).dependsOn: an entry cannot depend on itself',
      'entries[9] (bad-env).env: "MY-VAR" is not a valid environment variable name',
      'entries[10] (bad-from).from.source: must be one of',
      'entries[11].id: "has space" may use only',
      'mcpServers[0] (both): needs either a url or a command',
      'mcpServers[1] (neither): needs either a url or a command',
      'mcpServers[2] (local-token).tokenSecret: works only with a url',
    ]) {
      assertProblem(problems, expected);
    }
  });

  test('reports a bad platforms list', () => {
    const problems = problemsOf(() => parseManifest([
      'entries:',
      '  - id: bad-platform',
      '    platforms: [darwin]',
      '    check: "true"',
      '  - id: no-platforms',
      '    platforms: []',
      '    check: "true"',
    ].join('\n')));
    assertProblem(problems, 'entries[0] (bad-platform).platforms: "darwin" is not a platform');
    assertProblem(problems, 'entries[1] (no-platforms).platforms: must name at least one platform');
  });

  test('reads platforms; a command may have one form, with or without them', () => {
    const manifest = parseManifest([
      'entries:',
      '  - id: posix-only',
      '    check: { posix: "true" }',
      '  - id: login-shell',
      '    platforms: [macos, linux]',
      '    check: { posix: "sh bin/setup/login-shell.sh --check" }',
      '  - id: winget',
      '    platforms: [windows]',
      '    check: { windows: "winget --version" }',
    ].join('\n'));
    assert.deepStrictEqual(manifest.entries.map(e => e.platforms), [undefined, ['macos', 'linux'], ['windows']]);
  });

  test('checks data from the Org settings server the same way', () => {
    assertProblem(problemsOf(() => validateManifest({ entries: [{ id: 'x', check: 42 }] }, 'Org layer')),
      'must be a command');
  });

  test('names the source in the error message', () => {
    assert.throws(() => validateManifest({ entries: 'nope' }, 'Org layer'), /^ManifestError: Org layer has a problem/);
  });
});

suite('Manifest: combining layers', () => {
  const org: Manifest = {
    team: 'platform',
    entries: [
      { id: 'proxy', check: 'true' },
      {
        id: 'jdk', uses: 'jdk', with: { version: '17', vendor: 'temurin' },
        dependsOn: ['proxy'], env: { A: '1' }, failMessage: 'org message',
      },
    ],
    mcpServers: [{ name: 'access', url: 'https://org.example.com/mcp' }],
  };
  const team: Manifest = {
    team: 'payments',
    entries: [{ id: 'vpn', check: 'true' }],
    mcpServers: [],
  };
  const project: Manifest = {
    entries: [
      { id: 'jdk', with: { version: '21' }, dependsOn: ['vpn', 'proxy'], env: { B: '2' }, check: 'java -version' },
      { id: 'gradle', uses: 'gradle-wrapper', dependsOn: ['jdk'] },
    ],
    mcpServers: [{ name: 'access', url: 'https://project.example.com/mcp' }],
  };

  test('adds new entries in layer order and keeps the last team', () => {
    const plan = combineLayers([org, team, project]);
    assert.deepStrictEqual(plan.entries.map(e => e.id), ['proxy', 'jdk', 'vpn', 'gradle']);
    assert.strictEqual(plan.team, 'payments');
  });

  test('a later layer adds to an entry with the same id', () => {
    const jdk = combineLayers([org, team, project]).entries[1];
    assert.deepStrictEqual(jdk, {
      id: 'jdk',
      uses: 'jdk',
      with: { version: '21', vendor: 'temurin' },
      dependsOn: ['proxy', 'vpn'],
      env: { A: '1', B: '2' },
      check: 'java -version',
      failMessage: 'org message',
    });
  });

  test('a later MCP server with the same name replaces the earlier one', () => {
    assert.deepStrictEqual(combineLayers([org, project]).mcpServers,
      [{ name: 'access', url: 'https://project.example.com/mcp' }]);
  });

  test('does not change its inputs', () => {
    const before = JSON.stringify([org, team, project]);
    combineLayers([org, team, project]);
    assert.strictEqual(JSON.stringify([org, team, project]), before);
  });

  test('no layers gives an empty plan', () => {
    assert.deepStrictEqual(combineLayers([]), { entries: [], mcpServers: [] });
  });
});

suite('Manifest: the plan for this computer', () => {
  const manifest: Manifest = {
    entries: [
      { id: 'brew', platforms: ['macos'], check: 'true' },
      { id: 'node', check: 'true', dependsOn: ['brew'] },
      { id: 'winget', platforms: ['windows'], check: 'true' },
      { id: 'app', check: 'true', dependsOn: ['node', 'winget'] },
    ],
    mcpServers: [],
  };

  test('leaves out entries for other platforms, and stops waiting for them', () => {
    const plan = forPlatform(manifest, 'linux');
    assert.deepStrictEqual(plan.entries.map(e => [e.id, e.dependsOn]),
      [['node', []], ['app', ['node']]]);
  });

  test('keeps entries limited to this platform', () => {
    assert.deepStrictEqual(forPlatform(manifest, 'macos').entries.map(e => e.id), ['brew', 'node', 'app']);
    assert.deepStrictEqual(manifest.entries[3].dependsOn, ['node', 'winget'], 'input not changed');
  });

  test('names this computer the way the manifest does', () => {
    assert.strictEqual(currentPlatform('darwin'), 'macos');
    assert.strictEqual(currentPlatform('win32'), 'windows');
    assert.strictEqual(currentPlatform('linux'), 'linux');
  });
});

suite('Manifest: finding an entry in the file', () => {
  const text = [
    '# onboarding.yaml',          // 0
    'entries:',                    // 1
    '  - id: jdk',                 // 2
    '    check: java -version',    // 3
    '',                            // 4
    '  - title: Gradle',           // 5
    '    id: gradle',              // 6
    '  - { id: node, check: node -v }', // 7
  ].join('\n');

  test('gives the line where the entry starts, wherever its id is written', () => {
    assert.strictEqual(entryLine(text, 'jdk'), 2);
    assert.strictEqual(entryLine(text, 'gradle'), 5);
    assert.strictEqual(entryLine(text, 'node'), 7);
  });

  test('gives nothing for an id that is not there, or a file with no entries', () => {
    assert.strictEqual(entryLine(text, 'ruby'), undefined);
    assert.strictEqual(entryLine('team: payments\n', 'jdk'), undefined);
    assert.strictEqual(entryLine('entries: [', 'jdk'), undefined);
  });
});
