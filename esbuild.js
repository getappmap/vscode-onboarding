const esbuild = require("esbuild");

/** Builds the skills with the current skills.build.js, even in a watch run started before it changed. */
function buildSkills() {
	delete require.cache[require.resolve('./skills.build')];
	require('./skills.build').buildSkills();
}

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * Rebuilds the skills after each build of the command line, which they carry.
 * @type {import('esbuild').Plugin}
 */
const skillsPlugin = {
	name: 'skills',

	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length > 0) {
				return;
			}
			try {
				buildSkills();
			} catch (err) {
				console.error(`✘ [ERROR] ${err.message}`);
				if (!watch) {
					process.exitCode = 1;
				}
			}
		});
	},
};

async function main() {
	const common = {
		bundle: true,
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		logLevel: 'silent',
	};
	const contexts = [
		await esbuild.context({
			...common,
			entryPoints: ['src/extension.ts'],
			format: 'cjs',
			outfile: 'dist/extension.js',
			external: ['vscode'],
			plugins: [
				/* add to the end of plugins array */
				esbuildProblemMatcherPlugin,
			],
		}),
		// The command line runs without VS Code, so vscode is not external: an import of it
		// anywhere in the code it uses fails this build.
		await esbuild.context({
			...common,
			entryPoints: ['src/cli/bin.ts'],
			format: 'esm',
			outfile: 'dist/onboard.mjs',
			// The skills copy this one file, so it carries no source map.
			sourcemap: false,
			// Bundled CommonJS packages call require(); give ESM one.
			banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
			plugins: [esbuildProblemMatcherPlugin, skillsPlugin],
		}),
	];
	if (watch) {
		await Promise.all(contexts.map(ctx => ctx.watch()));
		// esbuild does not watch the templates, so rebuild the skills when one changes.
		let timer;
		require('fs').watch('skills', { recursive: true }, () => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				try {
					buildSkills();
				} catch (err) {
					console.error(`✘ [ERROR] ${err.message}`);
				}
			}, 200);
		});
	} else {
		await Promise.all(contexts.map(ctx => ctx.rebuild()));
		await Promise.all(contexts.map(ctx => ctx.dispose()));
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
