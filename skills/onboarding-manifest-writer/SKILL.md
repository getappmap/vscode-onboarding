---
name: onboarding-manifest-writer
description: Draft or extend onboarding.yaml by reading the repository. Use when a repository has no onboarding.yaml, or when asked to add or change a setup entry.
---
`onboarding.yaml` lists what a developer's computer needs to work on this repository. The
Onboarding extension runs each entry the same way: check whether it is in place, fix it if not,
check again, then prove it works. You write and change that file; you never run fixes.

## The format

```yaml
team: payments                      # optional: picks the Team layer from the company server
entries:
  - id: jdk                         # lowercase, unique; other entries refer to it
    title: Java 21                  # what the developer sees
    uses: jdk                       # optional preset: jdk, gradle-wrapper, http-service
    with: { version: "21" }         # values for the preset
    check: <command>                # passes when it is in place; must change nothing
    fix: <command>                  # puts it in place; runs without asking
    prove: <command>                # passes when it works, such as a build or a request
    dependsOn: [other-id]           # run after these; skipped if they are not ready
    platforms: [macos, linux]       # optional: runs only on these; left out, runs everywhere
    env: { NAME: value }            # plain values for the commands
    secrets: { NAME: dev/path }     # secret store paths, never values
    failMessage: <one specific next step>
    troubleshooting: <notes for the onboarding-troubleshooter skill>
    from: { source: guessed, file: README.md, section: "## Run locally", sha256: <8 hex>, date: <YYYY-MM-DD> }
mcpServers:
  - { name: access, url: "https://...", tokenSecret: dev/path }   # or command: [program, args]
```

A command is one string, run with `sh -c` on macOS and Linux and PowerShell on Windows. When the
two differ, write `{ posix: ..., windows: ... }`. An entry with `platforms` is left out of the plan
on other computers, and entries that depend on it do not wait for it there.

## Every entry works on every platform, or says where it runs

Each entry must be one of these:

| Kind | How to write it | Example |
|---|---|---|
| Same command everywhere | one string that runs the same in sh and PowerShell, such as a `node`, `git`, `bundle` or `yarn` command | `check: bundle check` |
| Different per platform | `{ posix: ..., windows: ... }`, each a short command or a helper script | `fix: { posix: sh bin/onboarding/ruby.sh, windows: ... }` |
| Only some platforms | `platforms: [...]`, with commands for just those | `platforms: [macos]` and `fix: brew install cmake` |

An entry without `platforms` runs on every computer. If it has only a `posix` form, it fails on
Windows with "no command for this computer", and the other way round. Use `platforms` only for
a step that is not needed at all elsewhere, such as a Homebrew install that only macOS needs.
Never test `uname` inside a command to pick the platform; split the entry, or use `platforms`.

If the project supports only some platforms, say which in a comment at the top of the file.

## Keep commands short: put scripts in bin/onboarding/

A command in the manifest should fit on one or two lines. When a check or fix needs more, such as
a `case`, a loop, or several steps, put it in a helper script in the project's
`bin/onboarding/` folder and have the command run it. A script is easier to read, test and
review than YAML. Use `bin/onboarding/`, not `bin/setup/`: Rails and many other projects
already have a `bin/setup` file.

- Name the script after the entry: `bin/onboarding/<entry-id>.sh` for sh,
  `bin/onboarding/<entry-id>.ps1` for PowerShell, or `bin/onboarding/<entry-id>.js` for Node,
  which runs the same on every platform once Node is set up (depend on the `node` entry).
- Run it with the interpreter, so it works without the execute bit and with any execution
  policy: `sh bin/onboarding/x.sh`, `node bin/onboarding/x.js`, and on Windows
  `powershell -NoProfile -ExecutionPolicy Bypass -File bin\onboarding\x.ps1`.
- One script may do both jobs: `sh bin/onboarding/x.sh check` and `sh bin/onboarding/x.sh fix`.
- Start each script with a comment saying what it sets up and why, and keep the reasoning there
  rather than in a long YAML comment. Make it stop at the first error (`set -eu` in sh).
- If the project already has a setup script, such as `bin/setup`, call the part of it you need
  rather than copying its steps.

## Steps

1. **Read how the project is set up today.** The README's setup sections, CONTRIBUTING, `docs/`,
   setup scripts such as `bin/setup`, version files (`.ruby-version`, `.nvmrc`, package.json
   "engines" and "volta", `.tool-versions`), package files (Gemfile, package.json, go.mod,
   build.gradle), `docker-compose.yml`, `.devcontainer/`, the CI workflows and `.env.example`.
2. **List what a developer needs**, in the order they need it: tools and their versions,
   packages, services such as a database, access and secrets, and a first build or test run.
3. **Write one entry for each.** Follow the rules below. Read facts from the project's own
   files in the commands, rather than copying them: for example compare `ruby -v` with
   `.ruby-version`. A fix runs without asking, so it must change only what its entry needs, and
   be safe to run twice.
4. **Record where each value came from.** For a value taken from a README section, call the
   `onboarding_section_sha` tool (#sectionSha) with the file and the heading, and copy the SHA
   it returns into `from:`. Never compute a SHA yourself: it must match the extension's
   README check exactly.
5. **Change the rest of the project to match.** When a change reaches beyond the manifest, such
   as moving from Docker to Podman, also update the project files that use the old tool (a rake
   task, a script, a compose file) and the README, or ask the person whether to. A manifest that
   disagrees with the project's own files is worse than none.
6. **Check your work.** Call the `onboarding_check_entries` tool (#checkSetup) to see which
   entries already pass on this computer. Explain any that fail. Do not run fixes yourself.
7. **Show the person what you wrote**, including any change to their README or other files,
   and what you were unsure of.

## Say exactly how each entry is satisfied

A developer who sees an entry fail must know exactly what to do next. Vague setup text in a
README ("install Node", "use a recent JDK") must not be copied into the manifest.

1. **Give one way to satisfy every entry.** Write a `fix` command. If no command can do it,
   such as an access request or an installer with a sign-in, write a `failMessage` that names
   one tool and the exact command or page. Never write "for example", "or", or a list of
   choices.
   - Bad: `failMessage: Install Node 20, for example with nvm or Volta.`
   - Good: an entry `volta` with `fix: brew install volta && volta setup`, and a `node` entry
     that depends on it.

2. **Use the tool the project already chose.** Before writing an entry, look for it in the
   repository: a `volta` field in package.json, `.nvmrc`, `.node-version`, `.tool-versions`,
   `mise.toml`, `.ruby-version`, `Brewfile`, `.devcontainer/`, the CI workflow's setup steps,
   and the `Dockerfile`. If one is there, use that tool.

3. **If the repository does not decide, ask, then write the answer into the project.** Ask
   the person you are drafting with which tool the team uses, and give your recommendation.
   Then record their choice where the project's own people will see it. Use the first of
   these that fits, and often the first two together:
   1. A config file that makes the choice automatic, if the tool has one. For example
      `volta pin node@20` writes the Node version into package.json, and rbenv reads
      `.ruby-version`.
   2. The project's existing setup instructions, usually a section of the README, in a line
      or two of plain words: which tool, and the command to install it. Edit the section that
      is already there; do not start a new document.
   3. Only when neither fits, the manifest alone.

   Show the person the exact change to their files before you make it. Then point the entry
   at what you wrote, so the manifest and the documentation stay tied together:
   `from: { source: person, file: README.md, section: "## Run locally", sha256: <SHA of that section>, date: <today> }`.
   `source: person` means the extension never rewrites the value on its own; if that README
   section changes later, the person editing it is told instead.

4. **Prefer tools that switch versions per project.** A fix must not change what other
   projects on the computer use. Prefer a version manager that reads the project's own file,
   such as Volta with package.json or rbenv with .ruby-version, over installing or changing a
   global default.

5. **Write fixes that run in a plain, non-interactive shell.** Setup runs each command with
   `sh -c` on macOS and Linux, and PowerShell on Windows, without the developer's shell
   profile. Shell functions such as `nvm` are not there unless the command loads them first,
   for example `. "$NVM_DIR/nvm.sh" && nvm install`.

6. **Check what the developer will actually run.** A check must test the program that comes
   first on the PATH in the project folder, at the version the project needs. "Some Node is
   installed" is not enough: another installer, such as nvm or Homebrew, can hide the right
   one. Compare against the project's own file instead of copying the version, for example
   the major version in package.json "engines".

7. **Write `troubleshooting` notes for the problems people really hit.** For example: open a
   new terminal and restart VS Code after `volta setup`; run `which -a node` to see which
   Node comes first on the PATH. Keep each note short, and say what to run.
