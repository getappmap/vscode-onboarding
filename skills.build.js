// Builds the skills from the templates in skills/, in two versions that differ only in how
// they run Onboarding's tools:
//
//   skills/<name>/SKILL.md  ──►  dist/skills/vscode/<name>/SKILL.md      (package.json chatSkills)
//                           └─►  dist/skills/standalone/<name>/SKILL.md  (+ scripts/onboard.mjs)
//
// In a template:
//   {{check}}, {{sha}}, {{run-setup}}            replaced by the words for each version (MARKERS)
//   {{#vscode}} … {{/vscode}}                    kept only in the VS Code version
//   {{#standalone}} … {{/standalone}}            kept only in the standalone version
// Anything else in {{ }} stops the build.
const fs = require('fs');
const path = require('path');

const TARGETS = ['vscode', 'standalone'];

const MARKERS = {
	vscode: {
		'check': 'the `onboarding_check_entries` tool (#checkSetup)',
		'sha': 'the `onboarding_section_sha` tool (#sectionSha)',
		'run-setup': '**Onboarding: Run Setup**',
	},
	standalone: {
		'check': '`node <skill>/scripts/onboard.mjs check [entry] --project <repo>`',
		'sha': '`node <skill>/scripts/onboard.mjs sha <file> "<heading>" --project <repo>`',
		'run-setup': '`node <skill>/scripts/onboard.mjs run --project <repo>`',
	},
};

/**
 * Front matter added to every standalone skill, so the agent runs the skill's own script without
 * asking each time. Only that script: Claude Code puts the skill's folder in ${CLAUDE_SKILL_DIR}.
 */
const STANDALONE_ALLOWED_TOOLS = ['Bash(node ${CLAUDE_SKILL_DIR}/scripts/onboard.mjs *)'];

/** Adds allowed-tools to a skill's front matter. */
function withAllowedTools(text, tools) {
	const end = text.indexOf('\n---\n', 4);
	if (!text.startsWith('---\n') || end < 0) {
		throw new Error('no front matter');
	}
	const list = tools.map(tool => `\n  - ${JSON.stringify(tool)}`).join('');
	return `${text.slice(0, end)}\nallowed-tools:${list}${text.slice(end)}`;
}

/** One template as the given version reads it. Throws on any marker it does not know. */
function renderSkill(text, target) {
	if (!TARGETS.includes(target)) {
		throw new Error(`Unknown skill version "${target}". Use one of: ${TARGETS.join(', ')}`);
	}
	const kept = text.replace(/\{\{#([\w-]+)\}\}\n?([\s\S]*?)\{\{\/\1\}\}\n?/g, (_, name, body) => {
		if (!TARGETS.includes(name)) {
			throw new Error(`Unknown block {{#${name}}}. Blocks are: ${TARGETS.join(', ')}`);
		}
		return name === target ? body : '';
	});
	const filled = kept.replace(/\{\{([\w-]+)\}\}/g, (_, name) => {
		const words = MARKERS[target][name];
		if (words === undefined) {
			throw new Error(`Unknown marker {{${name}}}. Markers are: ${Object.keys(MARKERS[target]).join(', ')}`);
		}
		return words;
	});
	const left = /\{\{[^\n]*?\}\}|\{\{/.exec(filled);
	if (left) {
		throw new Error(`"${left[0]}" is not a marker this build knows, or a block is not closed`);
	}
	return filled;
}

/**
 * Renders every skills/<name>/SKILL.md into dist/skills/<version>/<name>/SKILL.md, and copies
 * dist/onboard.mjs into each standalone skill, so each skill folder works on its own.
 */
function buildSkills(root = __dirname) {
	const source = path.join(root, 'skills');
	const out = path.join(root, 'dist', 'skills');
	const cli = path.join(root, 'dist', 'onboard.mjs');
	if (!fs.existsSync(cli)) {
		throw new Error('dist/onboard.mjs is missing; build it before the skills');
	}
	fs.rmSync(out, { recursive: true, force: true });
	for (const name of fs.readdirSync(source)) {
		const template = path.join(source, name, 'SKILL.md');
		if (!fs.existsSync(template)) {
			continue;
		}
		const text = fs.readFileSync(template, 'utf8');
		for (const target of TARGETS) {
			const dir = path.join(out, target, name);
			fs.mkdirSync(dir, { recursive: true });
			let rendered;
			try {
				rendered = renderSkill(text, target);
				if (target === 'standalone') {
					rendered = withAllowedTools(rendered, STANDALONE_ALLOWED_TOOLS);
				}
			} catch (err) {
				throw new Error(`skills/${name}/SKILL.md: ${err.message}`);
			}
			fs.writeFileSync(path.join(dir, 'SKILL.md'), rendered);
			if (target === 'standalone') {
				fs.mkdirSync(path.join(dir, 'scripts'));
				fs.copyFileSync(cli, path.join(dir, 'scripts', 'onboard.mjs'));
			}
		}
	}
}

module.exports = { MARKERS, STANDALONE_ALLOWED_TOOLS, TARGETS, buildSkills, renderSkill, withAllowedTools };
