---
name: manifest-writer
description: Draft or extend onboarding.yaml by reading the repository. Use when a repository has no onboarding.yaml, or when asked to add or change a setup entry.
---
TODO: steps for reading the repository and writing entries. Rules: check commands change
nothing; don't repeat facts other files hold; name secrets by secret store path; give
windows and posix forms when they differ; put `from:` on every guessed value.

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

3. **If the repository does not decide, ask.** Ask the person you are drafting with which
   tool the team uses, and give your recommendation. Record their answer with
   `from: { source: person }`. If a small repository change would make the choice automatic,
   suggest it, for example `volta pin node@20`, which writes the version into package.json.

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
