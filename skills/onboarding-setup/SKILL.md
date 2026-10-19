---
name: onboarding-setup
description: Set up this computer for the repository from onboarding.yaml, and explain and fix entries that fail. Use when asked to set up, onboard, or get ready to work on a repository that has an onboarding.yaml, or when onboarding setup reports entries that are not ready.
---
Onboarding sets up this computer from `onboarding.yaml`. Each entry says how to check that
something is in place, fix it, and prove it works.
{{#vscode}}

The developer asked for help with entries that are not ready. The request includes each entry's
result, its definition from `onboarding.yaml`, and any notes from the team.
{{/vscode}}
{{#standalone}}

In the commands below, `<skill>` is the full path of this skill's folder and `<repo>` is the repository's root
folder, the one that holds `onboarding.yaml`. Always pass `--project <repo>`: the script does
not look at the folder it runs in.

Running `node` inside the repository goes through its version manager. With mise or Volta, a
version pinned in `.tool-versions`, `.nvmrc` or package.json may be installed first, before the
script runs. Tell the developer if that happens. If the script says the Node is too old, run it
with a newer `node` given by its full path.
{{/standalone}}

## Working with the developer

The developer is not expected to know how `onboarding.yaml` works.

- **Ask only for decisions the project does not already answer**, such as which tool the team
  uses. Give your recommendation with the question.
- **Do not ask them to approve technical changes**: commands, entry fields, SHAs, or edits that
  make the project's files agree. Make the change, then report it in a few plain lines.
- **Ask about the project, not the manifest.** Good: "The README says `npm i`; setup runs
  `npm ci`. Which should developers use?" Bad: "Is the entry or the README right?"

{{#standalone}}
## Run setup

Run {{run-setup}}. It checks, fixes and proves every entry, and prints each result. For each
entry that is not ready, it prints what happened, the entry from `onboarding.yaml`, and the
team's notes. It remembers what it proved, so running it again is quick.

If every entry is ready, tell the developer and stop. Otherwise, follow the steps below for the
entries that are not ready.

{{/standalone}}
## Steps

1. **See what is true now.** Use {{check}} for each entry that is not ready.
{{#vscode}}
   The result in the request may be old.
{{/vscode}}
   An entry that needs secrets cannot be checked this way; work from its setup result.
2. **Read the failure.** Read the failed step's output and the entry's `troubleshooting` notes.
   Do not repeat things the notes say were tried before and did not help.
3. **Name the cause in one plain sentence.** Say whether it is:
   - **missing or wrong software**, such as the wrong Node version first on the PATH;
   - **missing access**, such as no token, no VPN, or no permission;
   - **waiting on something else**: a skipped entry waits for another entry; fix that one first.
4. **Fix it.**
   - Use the entry's own `fix` before inventing a workaround.
   - Say in a line what you are changing as you go; do not ask before each change.
   - Keep changes inside this repository and the developer's own user settings, such as their
     shell profile. Never change system settings.
   - For missing access, do not try to get around it. If an MCP server for access requests is
     available, use it to open a filled-in request with the team that can grant it. If not, say
     who to ask, using the entry's `failMessage`.
5. **Confirm.**
{{#vscode}}
   Use the check tool again, and tell the developer to run {{run-setup}} to finish.
{{/vscode}}
{{#standalone}}
   Run {{run-setup}} again, and repeat from step 1 for anything still not ready.
{{/standalone}}
6. **Help the next person.** If the fix would help everyone, put it into `onboarding.yaml`: a
   better `fix`, `failMessage` or `troubleshooting` note. `manifest-format.md` in this skill's
   folder describes every field. Tell the developer what you added.

Never show, copy or ask for a secret's value.
