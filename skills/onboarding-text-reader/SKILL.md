---
name: onboarding-text-reader
description: Read one README section, pull out setup values, and record the section and its SHA for each. Use while drafting onboarding.yaml, and when a section behind a guessed value has changed.
---
Some values in `onboarding.yaml` come from the project's README. Each one records where it came
from, so Onboarding can tell when that text changes:

```yaml
from: { source: guessed, file: README.md, section: "## Run locally", sha256: bef8a62f, date: 2026-10-13 }
```

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

- **Ask only for decisions the project does not already answer**, such as which tool the team
  uses. Give your recommendation with the question.
- **Do not ask them to approve technical changes**: commands, entry fields, SHAs, or edits that
  make the project's files agree. Make the change, then report it in a few plain lines.
- **Ask about the project, not the manifest.** Good: "The README says `npm i`; setup runs
  `npm ci`. Which should developers use?" Bad: "Is the entry or the README right?"

## Reading a section

1. Read the whole section, down to the next heading of the same or higher level. In Markdown, a
   line starting with `#` inside a code block is a shell comment, not a heading. In a `.rst` file,
   a title is a line with an underline of `=`, `-`, `~` or similar below it. Each underline style
   is a level, in the order the file first uses it. Indented lines, such as a code block after
   `::`, are never titles.
2. Pull out only what a developer must have or do: tools and versions, install commands,
   services, environment variables, and secrets (record the secret's store path, never a value).
3. Record each value with `source: guessed`. Get the SHA from {{sha}}, giving the file and the
   heading exactly as written (for a `.rst` title, without its underline). Never compute a SHA yourself. Use today's date.

## When the text behind a value has changed

{{#vscode}}
The extension names the entries whose section changed.
{{/vscode}}
{{#standalone}}
`node <skill>/scripts/onboard.mjs stale --project <repo>` lists the entries whose section
changed.
{{/standalone}}
Make the updates and save them; do not ask the developer to approve each one. For each entry:

- **`source: guessed`:** read the section again. Update the value if the text now says
  something different, and always update
  `sha256` and `date`, getting the SHA the same way as above.
- **`source: person`:** this was a team choice. If the section still agrees with the entry,
  even with new or reworded text, update only `sha256` and `date`. If it now says something
  different, change nothing and ask which one developers should follow, naming both: "The
  README now says X; setup does Y. Which should developers use?"
- **The heading is gone:** look for where the text moved. If you find it, treat it as changed
  and update `section` too. If you cannot find it, leave the entry and say so.

Differences the change did not cause, such as `npm i` in the README and `npm ci` in the entry,
are not your task here: leave them, and mention them in one line at most.

When you are done, tell the developer in a few lines what you changed. Ask only the questions
from team choices that now disagree.
