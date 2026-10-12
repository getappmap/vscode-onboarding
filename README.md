# Project Onboarding

A VS Code extension that sets up a developer's computer for a code repository.

Each repository keeps a manifest, `onboarding.yaml`. Each entry in it gives commands to
check that something is in place, put it in place, and prove it works. The extension runs
every entry the same way, shows progress and a Project Setup list, and uses GitHub Copilot
agent mode to help when something fails.

Design: the [Onboarding Manifest Reference](https://claude.ai/code/artifact/e748a02a-73f5-416c-b748-f50e3e1830f7)
describes the manifest format and how setup works.

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
| Make a `.vsix` | `npx vsce package` |

`npm run compile` type-checks, lints, then bundles `src/extension.ts` into `dist/extension.js`
with esbuild.

## Try it in VS Code

1. Open this folder in VS Code.
2. Press F5. This builds and opens a second VS Code window with the extension loaded.
3. In that window, open a folder that has an `onboarding.yaml`, such as
   `test-fixtures/sample-project`.
4. Run **Onboarding: Run Project Setup** from the Command Palette, or use the play button on
   the **Project Setup** list in the Explorer.

Setup remembers each entry it has proven on this computer and does not run it again until
its commands change. To run everything again, use **Onboarding: Run Project Setup, Proving
Everything Again**. What it remembers is kept in VS Code's storage for that workspace, not in
the repository.

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
  report/report.ts            Progress notification and Project Setup list
  connections/mcpServers.ts   Hands the manifest's MCP servers to Copilot
  tools/checkEntriesTool.ts   Lets Copilot run check commands
  company/company.ts          Org settings server and secret store
  test/unit/                  Unit tests, run in plain Node with a fake vscode module
  test/vscode/                Tests that need real VS Code
skills/                       Copilot skills shipped with the extension
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

## Settings

| Setting | What it does |
|---|---|
| `onboarding.orgSettingsUrl` | Company settings server for the Org and Team layers |
| `onboarding.secretCommand` | Command that prints one secret; `{path}` marks where its path goes |
