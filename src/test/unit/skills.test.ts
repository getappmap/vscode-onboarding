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
