import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SKILLS } from '../../agent/prompts';

const root = path.join(__dirname, '..', '..', '..');
const contributed = (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  .contributes.chatSkills as { path: string }[]).map(s => s.path);

suite('Skills the extension ships', () => {
  for (const skillPath of contributed) {
    test(skillPath, () => {
      const file = path.join(root, skillPath);
      assert.ok(fs.existsSync(file), 'the file is missing');
      const front = /^---\n([\s\S]*?)\n---\n/.exec(fs.readFileSync(file, 'utf8'));
      assert.ok(front, 'no front matter');
      const { name, description } = parse(front[1]) as { name: string; description: string };
      // VS Code uses the folder name; a different name: line would be ignored.
      assert.strictEqual(name, path.basename(path.dirname(file)), 'name: must equal the folder name');
      assert.match(name, /^onboarding-[a-z0-9]+(-[a-z0-9]+)*$/, 'onboarding- prefix, lowercase letters, digits, hyphens');
      assert.ok(name.length <= 64, 'VS Code cuts names at 64 characters');
      assert.ok(description?.trim(), 'a description, which is what Copilot matches requests against');
    });
  }

  test('every skill the prompts name is shipped', () => {
    const shipped = contributed.map(p => path.basename(path.dirname(p)));
    assert.deepStrictEqual([...Object.values(SKILLS)].sort(), [...shipped].sort());
  });
});

// skills.build.js is plain JavaScript, run by esbuild.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const build = require(path.join(root, 'skills.build.js')) as {
  renderSkill(text: string, target: string): string;
  withAllowedTools(text: string, tools: string[]): string;
  MARKERS: Record<string, Record<string, string>>;
};

suite('Skill templates', () => {
  test('a marker becomes the words for each version', () => {
    for (const target of ['vscode', 'standalone']) {
      assert.strictEqual(build.renderSkill('Use {{check}} now.', target), `Use ${build.MARKERS[target].check} now.`);
    }
    assert.match(build.renderSkill('{{sha}}', 'vscode'), /onboarding_section_sha/);
    assert.match(build.renderSkill('{{sha}}', 'standalone'), /node <skill>\/scripts\/onboard\.mjs sha/);
  });

  test('a block is kept only in its own version', () => {
    const text = 'a\n{{#vscode}}\nin VS Code\n{{/vscode}}\n{{#standalone}}\nalone\n{{/standalone}}\nb\n';
    assert.strictEqual(build.renderSkill(text, 'vscode'), 'a\nin VS Code\nb\n');
    assert.strictEqual(build.renderSkill(text, 'standalone'), 'a\nalone\nb\n');
  });

  test('an unknown marker or block, or one left open, stops the build', () => {
    assert.throws(() => build.renderSkill('{{nope}}', 'vscode'), /Unknown marker \{\{nope\}\}/);
    assert.throws(() => build.renderSkill('{{#nope}}x{{/nope}}', 'vscode'), /Unknown block/);
    assert.throws(() => build.renderSkill('{{#vscode}}never closed', 'vscode'), /not a marker this build knows, or a block is not closed/);
    assert.throws(() => build.renderSkill('x', 'web'), /Unknown skill version "web"/);
  });

  test('allowed-tools goes at the end of the front matter', () => {
    assert.strictEqual(build.withAllowedTools('---\nname: x\n---\nbody\n', ['Bash(node a *)']),
      '---\nname: x\nallowed-tools:\n  - "Bash(node a *)"\n---\nbody\n');
    assert.throws(() => build.withAllowedTools('no front matter', []), /no front matter/);
  });

  test('every template builds for both versions', () => {
    for (const name of fs.readdirSync(path.join(root, 'skills'))) {
      const text = fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
      build.renderSkill(text, 'vscode');
      build.renderSkill(text, 'standalone');
    }
  });
});

suite('Standalone skills', () => {
  const standalone = path.join(root, 'dist', 'skills', 'standalone');
  const names = fs.readdirSync(path.join(root, 'skills'));

  for (const name of names) {
    test(name, () => {
      const dir = path.join(standalone, name);
      assert.ok(fs.existsSync(path.join(dir, 'scripts', 'onboard.mjs')), 'each skill carries its own copy of the command line');
      const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
      for (const vscodeOnly of ['onboarding_check_entries', 'onboarding_section_sha', '#checkSetup', '#sectionSha', 'Onboarding: Run Setup', 'extension']) {
        assert.ok(!text.includes(vscodeOnly), `mentions "${vscodeOnly}", which only VS Code has`);
      }
      assert.match(text, /`<skill>` is the full path of this skill's folder/, 'says where the script is');
      const front = parse(/^---\n([\s\S]*?)\n---\n/.exec(text)![1]) as { 'allowed-tools': string[] };
      assert.deepStrictEqual(front['allowed-tools'], ['Bash(node ${CLAUDE_SKILL_DIR}/scripts/onboard.mjs *)'],
        'Claude Code runs only this skill\'s own script without asking');
    });
  }
});
