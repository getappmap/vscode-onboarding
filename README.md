# Onboarding

A VS Code extension that sets up a developer's computer for a code repository.

Each repository keeps a manifest, `onboarding.yaml`. Each entry in it gives commands to
check that something is in place, put it in place, and prove it works. The extension runs
every entry the same way, shows progress and an Onboarding list, and uses GitHub Copilot
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
  report/report.ts            Progress notification and the Onboarding list
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
| `onboarding.orgSettingsUrl` | Company settings server for the Org and Team layers. Empty: each project's `onboarding.yaml` alone |
| `onboarding.secretCommand` | Command that prints one secret; `{path}` marks where its path goes, e.g. `vault kv get -field=value {path}` |
| `onboarding.askBeforeFixing` | Off by default, so fixes run without asking. On, each fix shows its command and asks first. A fix that needs another team's approval always waits |

### Copilot skills and tools

The extension gives Copilot agent mode three skills and two tools. They are there only where
the extension is installed, or in the window F5 opens.

| Name | Kind | Use |
|---|---|---|
| `/manifest-writer` | Skill | Draft or change `onboarding.yaml` |
| `/text-reader` | Skill | Read setup values from a README section; update them when it changes |
| `/troubleshooter` | Skill | Explain and fix entries that are not ready (Ask Copilot to Help) |
| `#checkSetup` | Tool | Run check commands, never fixes. Entries that need secrets are not checked |
| `#sectionSha` | Tool | The SHA of a README section, the same as the README check computes |

### The Org settings server

Setup asks `GET <onboarding.orgSettingsUrl>?team=<team>`, where `team` comes from the project's
`onboarding.yaml`. The answer is JSON:

```json
{
  "org": { "entries": [], "mcpServers": [] },
  "team": { "entries": [] },
  "preApproved": ["entry-id"]
}
```

`org` and `team` are checked like `onboarding.yaml`; `team` may be `null`. If the server cannot
be reached, setup carries on with the project's `onboarding.yaml` alone and says so in the
Onboarding log.

### Secrets

Setup runs `onboarding.secretCommand` once for each secret an entry needs, with `{path}`
replaced by the secret's path from `onboarding.yaml`. The path reaches the command as an
environment variable, so it cannot break the command's quoting. What the command prints is the
secret. It is passed only to that entry's commands, and hidden as `***` in any output shown.

