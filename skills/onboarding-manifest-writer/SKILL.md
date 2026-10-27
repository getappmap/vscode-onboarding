---
name: onboarding-manifest-writer
description: Draft or extend onboarding.yaml by reading the repository. Use when a repository has no onboarding.yaml, or when asked to add or change a setup entry.
---
`onboarding.yaml` lists what a developer's computer needs to work on this repository. You write
and change that file; you never run fixes. Read `manifest-format.md` in this skill's folder first:
it describes every field.
{{#standalone}}

In the commands below, `<skill>` is the full path of this skill's folder and `<repo>` is the repository's root
folder, the one that holds `onboarding.yaml`. Always pass `--project <repo>`.

Running `node` inside the repository goes through its version manager. With mise or Volta, a
version pinned in `.tool-versions`, `.nvmrc` or package.json may be installed first, before the
script runs. Tell the developer if that happens. If the script says the Node is too old, run it
with a newer `node` given by its full path.
{{/standalone}}

## Working with the developer

The developer is not expected to know how `onboarding.yaml` works.

- **Start by saying what you are about to do**, in two or three plain lines, before reading any
  files. When there is no `onboarding.yaml` yet, say what it is for: it lists everything a
  developer's computer needs for this repository, and Onboarding uses it to check, set up and
  prove each item. Say that you will draft it for them to review, and that nothing will be
  installed or changed on their computer.
- **Ask only for decisions the project does not already answer**, such as which tool the team
  uses. Give your recommendation with the question.
- **Do not ask them to approve technical changes**: commands, entry fields, SHAs, or edits that
  make the project's files agree. Make the change, then report it in a few plain lines.
- **Ask about the project, not the manifest.** Good: "The README says `npm i`; setup runs
  `npm ci`. Which should developers use?" Bad: "Is the entry or the README right?"

## Steps

1. **Read how the project is set up today.** The README's setup sections, CONTRIBUTING, `docs/`,
   setup scripts such as `bin/setup`, version files, package files, `docker-compose.yml`,
   `.devcontainer/`, `.env.example`, and the CI config and the build scripts it calls.
2. **List what a developer needs**, in the order they need it: tools and their versions,
   packages, services such as a database, access and secrets, and a first build or test run.
3. **Write one entry for each**, following the rules below. In commands, read facts from the
   project's own files rather than copying them: compare `ruby -v` with `.ruby-version`. A fix
   runs without asking, so it must change only what its entry needs, and be safe to run twice.
4. **Change the rest of the project to match.** When a change reaches beyond the manifest, such
   as moving from Docker to Podman, also update the scripts, compose files and README that use
   the old tool. A manifest that disagrees with the project's own files is worse than none.
5. **Record where each value came from.** For a value from a README section, get its SHA with
   {{sha}} after your README edits are saved, and copy it into `from:`. Never compute a SHA
   yourself, and never take one before an edit: it is wrong as soon as you save.
6. **Check your work.** Get the SHA again for every `from:` and fix any that differ. Then use
   {{check}} to see which entries already pass on this computer, and explain any that fail.
   Do not run fixes yourself.
7. **Tell the person what you set up**, in a few plain lines: the setup steps, the files you
   changed besides the manifest, and any decision you still need from them. Say that no fix
   has been run yet.
{{#vscode}}
   End with the next step, in these words: "Next: open **Onboarding** in the Activity Bar and
   press ▶ to set up this computer. Do this before you commit `onboarding.yaml`: fixes can fail
   in ways a check cannot show."
{{/vscode}}
{{#standalone}}
   Suggest running setup with the `onboarding-setup` skill before they commit the manifest:
   fixes often fail in ways a check cannot show.
{{/standalone}}

## CI shows what the project needs, not what a developer does

CI files (GitHub Actions, Travis, GitLab CI, a `Jenkinsfile`, and the build scripts they call)
are good evidence of what the project needs: tool versions, system packages, services, and
install commands. Use them as evidence. Do not copy CI onto the developer's computer.

A developer's computer is not a CI server. It keeps its tools between runs, works on other
projects too, and needs things CI never does, such as an editor setup or access to a staging
system. So:

- Install tools with the version manager the project uses, not the CI action that installs them.
- Run a CI `services:` database or queue the way developers run it locally, such as with the
  project's `docker-compose.yml`.
- Leave out CI-only steps: caching, uploads, coverage reports, deploys, and CI's own secrets.
- Do not turn the CI test run into a `prove`.

## Platforms

Every entry runs on every platform or says where it runs (see `manifest-format.md`). Use
`platforms` only for a step that no other platform needs, such as a Homebrew install. If the
project supports only some platforms, say which in a comment at the top of the file.

## Keep commands short: put scripts in bin/onboarding/

A command should fit on one or two lines. When a check or fix needs more, put it in
`bin/onboarding/<entry-id>.sh`, `.ps1`, or `.js` (Node runs the same everywhere; depend on the
`node` entry). Not `bin/setup/`: Rails and many other projects already have a `bin/setup` file.

- Run the script with its interpreter, so it works without the execute bit and with any
  execution policy: `sh bin/onboarding/x.sh`, `node bin/onboarding/x.js`, and on Windows
  `powershell -NoProfile -ExecutionPolicy Bypass -File bin\onboarding\x.ps1`.
- One script may do both jobs: `sh bin/onboarding/x.sh check` and `sh bin/onboarding/x.sh fix`.
- If the project already has a setup script, call the part of it you need rather than copying it.

## Keep checks and proofs quick

Setup runs every `check` each time, and every `prove` when an entry is new or changed. Each
should take a few seconds.

- **`prove` tests the one thing its entry sets up.** To prove packages are installed, load one:
  `node -e "require('express')"`. Never run a full test suite or build to prove a tool is there.
- **Leave `prove` out when `check` already shows it works**, such as `java -version`.
- **A first build or test run is its own entry**, at the end, and only if the project's setup
  instructions ask for one. Run the smallest version: one test file, or a compile without tests.
- **A `check` changes nothing and needs no network**, unless the entry is about a network service.
- **For a service, `prove` connects the way the project does**: the same host, port and
  credentials. Then it confirms it reached the project's server, not another one on the same
  port, for example by asking for a database only the project creates. Add a `troubleshooting`
  note for port clashes: `lsof -nP -iTCP:<port> -sTCP:LISTEN` shows what holds the port.

## Say exactly how each entry is satisfied

A developer who sees an entry fail must know exactly what to do next. Never copy vague README
text ("install Node", "use a recent JDK") into the manifest.

1. **Give one way to satisfy every entry.** Write a `fix`. If no command can do it, such as an
   access request, write a `failMessage` that names one tool and the exact command or page.
   Never "for example", "or", or a list of choices.
   - Bad: `failMessage: Install Node 20, for example with nvm or Volta.`
   - Good: a `volta` entry with `fix: brew install volta && volta setup`, and a `node` entry
     that depends on it.
2. **Use the tool the project already chose**: a `volta` field in package.json, `.nvmrc`,
   `.tool-versions`, `mise.toml`, `.ruby-version`, `Brewfile`, `.devcontainer/`, the CI setup
   steps, or the `Dockerfile`.
3. **If the project does not decide, ask, then write the answer into the project**, so its own
   people see it: a config file that makes the choice automatic (`volta pin node@20`), and a line
   or two in the README's existing setup section. Then point the entry at that section with
   `from: { source: person, ... }`.
4. **Prefer tools that switch versions per project**, such as Volta or rbenv. A fix must not
   change what other projects on the computer use.
5. **Write fixes for a plain, non-interactive shell.** Shell functions such as `nvm` are not
   loaded unless the command loads them: `. "$NVM_DIR/nvm.sh" && nvm install`.
6. **Check what the developer will actually run**: the program first on the PATH in the project
   folder, at the version the project's own file names. Another installer can hide the right one.
7. **Write `troubleshooting` notes for problems people really hit**, short, each saying what to
   run. For example: open a new terminal after `volta setup`; run `which -a node` to see which
   Node comes first.
