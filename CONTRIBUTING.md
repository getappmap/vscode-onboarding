# Contributing to Onboarding

This file is for people who work on the extension. To use it, see [README.md](README.md).

The [onboarding.yaml reference](docs/manifest.md) describes every field of the manifest. Open
work before the Marketplace release is in [TODO.md](TODO.md).

## Developer setup

You need:

| Tool | Version |
|---|---|
| Node.js | 24 (in `.nvmrc`; run `nvm use`). VS Code runs extensions on Node 24 too |
| VS Code | 1.134 or later |
| GitHub Copilot | Copilot Chat extension, only to try the AI features (Ask Copilot, Draft Manifest) |

Install the packages:

```bash
npm install
```

## Everyday commands

| Task | Command |
|---|---|
| Build once | `npm run compile` |
| Rebuild on every save | `npm run watch` |
| Type-check only | `npm run check-types` |
| Lint | `npm run lint` |
| Unit tests, in plain Node | `npm test` |
| Tests that need VS Code | `npm run test:vscode` |
| Make a `.vsix` | `npm run vsix` |

`npm run compile` type-checks, lints, then builds with esbuild (`esbuild.js`):

| Output | From | What it is |
|---|---|---|
| `dist/extension.js` | `src/extension.ts` | The extension |
| `dist/onboard.mjs` | `src/cli/bin.ts` | The command line, for agents without VS Code. It must not import `vscode`, or the build fails |
| `dist/skills/vscode/` | `skills/` | The skills the extension ships |
| `dist/skills/standalone/` | `skills/` and `dist/onboard.mjs` | The same skills for Claude Code, Copilot CLI and other agents |

`npm run vsix` builds `onboarding-<version>.vsix`, about 60 KB. Everything the extension needs,
`yaml` included, is in the bundle, so no `node_modules` are packed. Install it with
**Extensions: Install from VSIX…**.

## Try it in VS Code

1. Open this folder in VS Code.
2. Press F5. This builds and opens a second VS Code window with the extension loaded.
3. In that window, open a folder that has an `onboarding.yaml`, such as
   `test-fixtures/sample-project`.
4. Open **Onboarding** from its icon in the Activity Bar (a clipboard with ticks), then
   press its play button. Or run **Onboarding: Run Setup** from the Command Palette.

Setup remembers each entry it has proven on this computer and does not run it again until
its commands change. To run everything again, use **Onboarding: Run Setup, Proving Everything
Again**.

Results are written to `.onboarding/status.yaml` in the project, as setup runs: each entry's
state, details, when it last ran, and whether it was proven. The list reads this file, and
redraws when it changes. It holds results for this computer only: the folder has its own
`.gitignore`, so it is never committed. Delete the file to start fresh.

After changing code, reload the second window (Developer: Reload Window) to pick up the
new build.

## Tests

There are two test suites. Most tests run in plain Node; only the few that need real
VS Code run inside it.

| Command | Runs | Where | Tests |
|---|---|---|---|
| `npm test` | `src/test/unit/` | Plain Node + Mocha, with a fake `vscode` module | Almost all |
| `npm run test:vscode` | `src/test/vscode/` | Real VS Code, twice (below) | Only what needs VS Code |

Both compile the tests to `out/` first.

### Unit tests: `npm test`

Mocha runs the tests directly in Node (settings in `.mocharc.json`). Code under test that
imports `vscode` gets the fake in `src/test/unit/vscode.fake.ts` instead, set up by
`src/test/unit/setup.ts`. The fake holds only the parts of the VS Code API the code uses
today. When code starts using more, add it to the fake, copying how the real API behaves.

Put a new test here unless it truly needs VS Code. These tests are fast, and AppMap can
record them, which it cannot do inside VS Code.

### VS Code tests: `npm run test:vscode`

These run inside real VS Code, for things a fake cannot check, such as the extension
activating, its `package.json` contributions loading, and its commands running from start to
end. Each run opens `test-fixtures/vscode-workspace` as the workspace. Its entries are safe
commands that never ask anything:

| Run | VS Code version | Why |
|---|---|---|
| `oldest` | 1.134.0 | The lowest version in `engines.vscode` |
| `newest` | latest stable | Catches changes in new releases |

The first run downloads both versions into `.vscode-test/`. On a Linux build server with no
display, run `xvfb-run -a npm run test:vscode`.

### For both

- Tests use Mocha's `suite` / `test`.
- Test only the parts that need no AI. Keep Copilot out of tests, because language model
  calls are rate limited.
- Some unit tests run real commands, such as `sleep`, `java -version` and `curl` against a
  local test server, in temporary folders. Each has an `sh` and a PowerShell form, so run
  the tests on Windows and on macOS or Linux before a release.

## Project layout

```
package.json                  Commands, settings, view, MCP provider, tool, skills
src/
  extension.ts                Creates each part and registers it with VS Code
  agent/agentHost.ts          The one place that talks to Copilot
  manifest/manifest.ts        Manifest format, reading and combining layers
  manifest/sectionSha.ts      SHA of a README section (no VS Code imports)
  manifest/staleCheck.ts      Finds guessed values whose README text changed
  setup/runCommand.ts         Runs one command in PowerShell or sh
  setup/presets.ts            Built-in commands for common needs (jdk, ...)
  setup/runSetup.ts           Check, fix, prove each entry in order
  report/report.ts            Setup progress and the Onboarding list
  report/setupOutput.ts       Each command and its output, in the Onboarding Setup channel
  report/statusView.ts        The status view: an editor tab with the list and one page per entry
  report/statusPage.ts        The status view's HTML (no VS Code imports)
  connections/mcpServers.ts   Hands the manifest's MCP servers to Copilot
  tools/checkEntriesTool.ts   Lets Copilot run check commands
  company/company.ts          Org settings server and secret store
  cli/onboard.ts              The command line: run, check, sha, stale, status (no VS Code imports)
  setup/checkEntries.ts       Runs check commands only, for the check tool and the command line
  test/unit/                  Unit tests, run in plain Node with a fake vscode module
  test/vscode/                Tests that need real VS Code
skills/                       Skill templates; skills.build.js builds them into dist/skills/
test-fixtures/sample-project  A realistic manifest: unit tests read it, and you can try it with F5
test-fixtures/vscode-workspace  Workspace the VS Code tests open: safe commands only
```

## Versions

Keep the extension within a few months of the current VS Code. VS Code ships weekly.

| Package | Pinned to | Rule |
|---|---|---|
| `engines.vscode` | `^1.134.0` | Minimum VS Code. Skills in an extension need at least 1.115 |
| `@types/vscode` | `~1.134.0` | Never newer than `engines.vscode`, or `vsce` refuses to package |
| `@types/node` | `24.x` | Match the Node that VS Code runs extensions on (24 in 1.134 to 1.141) |
| `typescript` | `~6.0.3` | Move to 7 when `typescript-eslint` supports it |

To raise the minimum VS Code version, change these three together, then run both test
suites:

- `engines.vscode` in `package.json`
- `@types/vscode` in `package.json` (then `npm install`)
- the `oldest` version in `.vscode-test.mjs`

## Skills

The templates in `skills/` build into two versions:

| Folder | For | Runs Onboarding's tools through |
|---|---|---|
| `dist/skills/vscode/` | Copilot, inside the extension (`chatSkills` in `package.json`) | The extension's tools and commands |
| `dist/skills/standalone/` | Claude Code, Copilot CLI and other agents | `scripts/onboard.mjs`, copied into each skill folder |

### Write skills

Edit the templates in `skills/`, never `dist/skills/`. A template is the skill as both versions
read it, with markers where they differ. The build stops on any marker it does not know.

| In a template | VS Code version | Standalone version |
|---|---|---|
| `{{check}}` | the `onboarding_check_entries` tool | `node <skill>/scripts/onboard.mjs check …` |
| `{{sha}}` | the `onboarding_section_sha` tool | `node <skill>/scripts/onboard.mjs sha …` |
| `{{run-setup}}` | **Onboarding: Run Setup** | `node <skill>/scripts/onboard.mjs run …` |
| `{{#vscode}}…{{/vscode}}` | kept | left out |
| `{{#standalone}}…{{/standalone}}` | left out | kept |

The words for each marker are in `skills.build.js`.

Files in `skills/shared/` are copied into every skill folder. `manifest-format.md` there is the
format the skills read; a unit test checks that it, and `docs/manifest.md`, name every field the
manifest allows.

After changing `skills.build.js`, rebuild. A running `npm run watch` picks up the change on its
next build.

### Install them from a clone

```bash
npm ci && npm run compile
```

```bash
mkdir -p ../my-repo/.claude/skills && cp -R dist/skills/standalone/* ../my-repo/.claude/skills/
```

## Make a release

Bump `version` in `package.json`, commit, then push a tag:

```bash
git tag v1.0.1 && git push origin v1.0.1
```

`.github/workflows/release.yml` runs the tests, builds, and creates the release with
`onboarding-skills.zip` and the `.vsix`. `npm run skills:zip` makes the same zip locally.
