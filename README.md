# Project Onboarding

A VS Code extension that sets up a developer's computer for a code repository.

Each repository keeps a manifest, `onboarding.yaml`. Each entry in it gives commands to
check that something is in place, put it in place, and prove it works. The extension runs
every entry the same way, shows progress and a Project Setup list, and uses GitHub Copilot
agent mode to help when something fails.

Design documents:

- [Onboarding Extension Build Recipe](https://claude.ai/code/artifact/74fe1420-4a60-43fe-9971-89539b11acee): the files, stubs and steps this code follows
- [Onboarding Manifest Reference](https://claude.ai/code/artifact/e748a02a-73f5-416c-b748-f50e3e1830f7): the manifest format and how setup works

## Status

The extension is being built in phases. Parts not yet built are stubs that throw `TODO` errors.

| Phase | What | State |
|---|---|---|
| 0 | Project, `package.json` contributions, compiling stubs | Done |
| 1 | Manifest: read, check, combine layers | In progress |
| 2 | Run one command in PowerShell or `sh` | Not started |
| 3 | Setup runner: check, fix, prove each entry | Not started |
| 4 | Progress, Project Setup list, Run Setup command | Not started |
| 5 | Org settings server and secret store | Not started |
| 6 | MCP servers for Copilot | Not started |
| 7 | Copilot: check tool, skills, Ask Copilot | Not started |
| 8 | Warn when README text behind a guessed value changes | Not started |
| 9 | Test on Windows, package, publish | Not started |

## Developer setup

You need:

| Tool | Version |
|---|---|
| Node.js | 24 LTS (22 also works) |
| VS Code | 1.134 or later |
| GitHub Copilot | Copilot Chat extension, for phases 6 and 7 |

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
| Run all tests | `npm test` |
| Make a `.vsix` | `npx vsce package` |

`npm run compile` type-checks, lints, then bundles `src/extension.ts` into `dist/extension.js`
with esbuild.

## Try it in VS Code

1. Open this folder in VS Code.
2. Press F5. This builds and opens a second VS Code window with the extension loaded.
3. In that window, open a folder that has an `onboarding.yaml`, such as
   `test-fixtures/sample-project`.
4. Run **Onboarding: Run Project Setup** from the Command Palette.

After changing code, reload the second window (Developer: Reload Window) to pick up the
new build.

## Tests

```bash
npm test
```

This compiles the tests to `out/`, then runs them inside real VS Code, twice:

| Run | VS Code version | Why |
|---|---|---|
| `oldest` | 1.134.0 | The lowest version in `engines.vscode` |
| `newest` | latest stable | Catches changes in new releases |

The first run downloads both versions into `.vscode-test/`. The tests open
`test-fixtures/sample-project` as the workspace.

- Tests live in `src/test/` and use Mocha's `suite` / `test`.
- Test only the parts that need no AI. Keep Copilot out of tests, because language model
  calls are rate limited.
- Setup commands differ between PowerShell and `sh`, so run the tests on Windows and on
  macOS or Linux before a release.
- On a Linux build server with no display, run `xvfb-run -a npm test`.

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
  test/                       Tests
skills/                       Copilot skills shipped with the extension
test-fixtures/sample-project  Workspace the tests open
```

## Versions

Keep the extension within a few months of the current VS Code. VS Code ships weekly.

| Package | Pinned to | Rule |
|---|---|---|
| `engines.vscode` | `^1.134.0` | Minimum VS Code. Skills in an extension need at least 1.115 |
| `@types/vscode` | `~1.134.0` | Never newer than `engines.vscode`, or `vsce` refuses to package |
| `@types/node` | `24.x` | Match the Node that VS Code runs extensions on (24 in 1.134 to 1.141) |
| `typescript` | `~6.0.3` | Move to 7 when `typescript-eslint` supports it |

To raise the minimum VS Code version, change these three together, then run `npm test`:

- `engines.vscode` in `package.json`
- `@types/vscode` in `package.json` (then `npm install`)
- the `oldest` version in `.vscode-test.mjs`

## Settings

| Setting | What it does |
|---|---|
| `onboarding.orgSettingsUrl` | Company settings server for the Org and Team layers |
| `onboarding.secretCommand` | Command that prints one secret; `{path}` marks where its path goes |
