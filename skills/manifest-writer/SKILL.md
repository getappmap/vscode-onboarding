---
name: manifest-writer
description: Draft or extend onboarding.yaml by reading the repository. Use when a repository has no onboarding.yaml, or when asked to add or change a setup entry.
---
TODO: steps for reading the repository and writing entries. Rules: check commands change
nothing; don't repeat facts other files hold; name secrets by secret store path; give
windows and posix forms when they differ; put `from:` on every guessed value.

TODO, still to build for this skill (found by trying it on AppLand):
- An extension tool that returns a README section's SHA, using the same code as the stale
  check (src/manifest/sectionSha.ts). This skill must tell the agent to use it for every
  `sha256:` in `from:`, and never compute one itself.
- The check tool (onboarding_check_entries) works, so the agent can see which entries pass
  after an edit.
- Steps that cover a change spread beyond the manifest, such as moving from Docker to
  Podman: also update the project files that run the old tool (AppLand's `rake dev:db`
  calls docker-compose) and the README, or ask the person about them.
- This skill is only there when the extension is installed; the README should say so.

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
