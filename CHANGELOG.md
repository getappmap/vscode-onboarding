# Changelog

All notable changes to Onboarding are listed here.

## [Unreleased]

- `check` runs entries in dependency order, and skips an entry that waits for one whose check
  did not pass, instead of showing an error that only means "not installed yet".
- The command line says plainly when Node is too old (it needs 18 or later), and is no longer
  minified, so it can be read before installing.
- The manifest-writer skill suggests running setup before committing the manifest, and checks
  that a service's `prove` reached the project's own server.
- All skills share one `manifest-format.md` that describes every field.
- `from:` can point at a section of a `.rst` file, found by its title ([#1](https://github.com/getappmap/vscode-onboarding/issues/1)).

## [1.0.0]

- First release: run `onboarding.yaml` setup in VS Code, with an Onboarding list, a status
  view, and help from GitHub Copilot.
- Three skills for Copilot, also published for Claude Code and Copilot CLI as
  `onboarding-skills.zip`.
